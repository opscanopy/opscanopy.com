/**
 * Mission — Day 90 CAPSTONE: "The Midnight Outage" (a config-only, ordered,
 * full-stack incident response). The whole lesson is ORDER: fix upstream first.
 *
 * 00:14. A single security-group change revoked tcp/443 ingress on sg-web. The
 * load-balancer health checks to the web tier went red, DNS (Route 53 health
 * check) failed traffic over to the passive region — and there the web pods are
 * stuck (ContainerCreating) unable to mount a `db-credentials` Secret that no
 * longer exists. One change, three symptoms, all regions 5xx.
 *
 * The fix is a CHAIN, and the chain is the point:
 *   1. aws  — re-open tcp/443 on sg-web (open the network path back up),
 *   2. kubectl — recreate the deleted db-credentials Secret in the failover
 *      cluster (which is only reachable once the network is open),
 *   3. dig — confirm DNS has healed back to the healthy PRIMARY (203.0.113.10).
 *
 * The engine enforces that order with plain state flags — zero domain logic:
 *   - `kubectl create secret …` only SUCCEEDS when `sgFixed` is already set;
 *     run early it falls to an `out` PRECONDITION line ("cluster API
 *     unreachable — the network path is still blocked upstream") that carries
 *     NO effect, so it completes nothing and cannot soft-lock.
 *   - the healthy `dig` line (the only line naming 203.0.113.10) is gated on
 *     `k8sFixed`; before the Secret is back, `dig shop.opscanopy.io` returns
 *     the failover address 203.0.113.99 and completes nothing.
 *   - live-query diagnostics (`aws … describe-security-groups`, `kubectl get
 *     pods` / `describe pod`) are gated on the pre-fix flag `equals:false` so
 *     they never keep claiming the outage after the fix has landed.
 *   - `dig` is a DIAGNOSTIC verb with NO effect anywhere, so objective 6 may
 *     legally read it via `outputMatched`.
 *   - both fixes append their success line to the evidence-preserving log
 *     (sg-audit.txt / events.txt) and write a SEPARATE status marker — the
 *     REVOKE and "not found" evidence stays readable for a fix-first player.
 *
 * NOTE: live — the Day-90 capstone mission, registered in src/data/mission90.ts
 * and wired into MissionTerminal's missionModules map.
 */
import type { MissionConfig } from '../types';

const incidentLog = [
  '00:14:02  CRITICAL  pagerduty SEV-1 opened — all regions returning 5xx (100% error rate)',
  '00:14:02  CRITICAL  edge probes: primary-region health checks failing on every backend',
  '00:14:05  WARN      route53 health check for primary FAILED — DNS failover to passive region engaged',
  '00:14:06  INFO      traffic now served from the passive region (failover A record 203.0.113.99)',
  '00:14:20  CRITICAL  passive region also degraded — web pods will not become Ready',
  '00:15:00  FATAL     full-stack outage — every region 5xx, both regions unhealthy; on-call paged',
].join('\n');

const sgAudit = [
  'sg-web ingress change audit — sg-web (prod web tier / LB target group)',
  '',
  '00:14:01  REVOKE     ingress tcp/443 0.0.0.0/0 on sg-web  by oncall@opscanopy  (change #SG-8821)',
  '00:14:01  NOTE       reason field: "tightening" — fat-finger, meant to touch sg-bastion, not sg-web',
  '00:14:03  EFFECT     LB health checks to the web tier can no longer reach :443 — all targets unhealthy',
  '00:14:05  EFFECT     target group fully drained — this is what tripped the DNS failover',
].join('\n');

const eventsTxt = [
  '# kubectl get events -n web  (passive-region cluster)',
  'LAST SEEN   TYPE      REASON        OBJECT                       MESSAGE',
  '30s         Warning   FailedMount   pod/web-passive-7c9f-4xk2p   MountVolume.SetUp failed for volume "db-creds" : secret "db-credentials" not found',
  '18s         Warning   FailedMount   pod/web-passive-7c9f-t9r4w   MountVolume.SetUp failed for volume "db-creds" : secret "db-credentials" not found',
].join('\n');

export const finalMidnightOutage: MissionConfig = {
  id: 'final-midnight-outage',
  title: 'The Midnight Outage',
  week: 13,
  unlockAfterDay: 90,
  promptUser: 'ops',
  promptHost: 'warroom',
  optimalCommands: 8,

  story: [
    '00:14. The pager tears through the dark: SEV-1, every region returning 5xx. This ' +
      'is the capstone — DNS, containers, Kubernetes and AWS are all on fire at once, and ' +
      'it is your call. Ninety days of training come down to the next few minutes.',
    'The shape of it: a security-group change at 00:14 revoked tcp/443 ingress on sg-web, ' +
      'so the load-balancer health checks went red and DNS failed traffic over to the ' +
      'passive region — where the web pods cannot start, stuck mounting a Secret that no ' +
      'longer exists. One small change knocked the whole stack over, region by region.',
    'Fix it UPSTREAM-FIRST: re-open the security group, restore the missing Secret, then ' +
      'confirm DNS has healed back to the healthy primary. Order is the whole lesson. ' +
      'Everything you need is in ~/incident.log, ~/aws and ~/k8s. Type `help` to see what ' +
      'this terminal can do.',
  ],

  filesystem: {
    '~': {
      'incident.log': incidentLog,
      aws: {
        'sg-audit.txt': sgAudit,
      },
      k8s: {
        'events.txt': eventsTxt,
      },
    },
  },

  // The warroom bastion: no app runs here. AWS, the cluster and DNS all live
  // behind the scripted `aws` / `kubectl` / `dig` verbs, NOT this process table.
  processes: [
    { pid: 1, user: 'root', cpu: 0.0, mem: 0.1, command: 'systemd' },
    { pid: 402, user: 'root', cpu: 0.0, mem: 0.2, command: 'sshd' },
    { pid: 1777, user: 'ops', cpu: 0.0, mem: 0.3, command: 'bash' },
  ],

  supportedCommands: [
    'pwd', 'ls', 'cd', 'cat', 'grep', 'ps', 'help', 'hint', 'clear', 'aws', 'kubectl', 'dig',
  ],

  // Initial state flags. The chain flips sgFixed → true, then k8sFixed → true.
  flags: { sgFixed: false, k8sFixed: false },

  // ── Config-authored verbs (zero domain logic in the engine) ──────────────
  commands: {
    // ── aws: the FIRST mutating fix. Re-open tcp/443 ingress on sg-web.
    //    Order: idempotent already-done guard → THE FIX → gated diagnostic
    //    (describe-security-groups is a live query, gated equals:false so it
    //    never keeps showing the block after the rule is back — the idempotent
    //    guard already catches the post-fix case first) → honest usage default.
    aws: {
      oneLiner:
        'inspect + change AWS (aws ec2 describe-security-groups, aws ec2 authorize-security-group-ingress …)',
      responses: [
        // Idempotent + honest: once tcp/443 is back, say so and change nothing.
        {
          match: { flag: { name: 'sgFixed' } },
          output: ['sg-web already allows tcp/443 — LB health checks green. Nothing to re-authorize.'],
        },
        // THE FIX: re-authorize tcp/443 ingress on sg-web. Player-typed cidr is
        // ignored — we match the fixed tokens + the port 443 only.
        {
          match: {
            args: ['ec2', 'authorize-security-group-ingress'],
            argIncludes: '443',
          },
          outKind: 'sys',
          output: [
            'Authorizing ingress tcp/443 0.0.0.0/0 on sg-web…',
            'Authorized tcp/443 ingress on sg-web. LB health checks recovering.',
            'The network path to the web tier is open again — now reach the failover cluster.',
          ],
          effect: {
            setFlags: { sgFixed: true },
            // append-only: preserves the REVOKE evidence in the audit log
            appendFiles: {
              '~/aws/sg-audit.txt':
                '00:31:44  AUTHORIZE  ingress tcp/443 0.0.0.0/0 re-authorized on sg-web — LB health checks green (change #SG-8823)',
            },
            // overwrite a separate human-readable status marker (not evidence)
            writeFiles: { '~/aws/status': 'OK — sg-web allows tcp/443 again; LB health checks recovering' },
          },
        },
        // `aws ec2 describe-security-groups` — the live rule list (gated pre-fix).
        {
          match: { args: ['ec2', 'describe-security-groups'], flag: { name: 'sgFixed', equals: false } },
          output: [
            'GroupId   IpProtocol   FromPort   ToPort   CidrIp        Note',
            'sg-web    tcp          22         22       10.0.0.0/8    ssh (mgmt) — intact',
            'sg-web    tcp          80         80       0.0.0.0/0     http — intact',
            '(no rule for tcp/443 — 443 ingress was pulled at 00:14; the LB cannot health-check the web tier)',
          ],
        },
      ],
      default: {
        output: [
          'usage: aws ec2 describe-security-groups',
          '       aws ec2 authorize-security-group-ingress \\',
          '         --group-id sg-web --protocol tcp --port 443 --cidr 0.0.0.0/0',
          'Re-open tcp/443 on sg-web — that is the change that took the tier down.',
        ],
      },
    },

    // ── kubectl: the SECOND mutating fix, gated behind the network being open.
    //    Order: idempotent already-done guard → THE FIX (requires sgFixed) →
    //    PRECONDITION (create secret before sgFixed → out, NO effect) → gated
    //    live diagnostics (get pods / describe pod, equals:false).
    kubectl: {
      oneLiner:
        'inspect + manage the cluster (kubectl get pods, kubectl describe pod <name>, kubectl create secret generic <name> --from-literal=…)',
      responses: [
        // Idempotent + honest: once the Secret is back this answers a re-run of
        // create secret AND every post-fix get pods / describe pod.
        {
          match: { flag: { name: 'k8sFixed' } },
          output: ['secret/db-credentials present — deployment/web rolled out (3/3 ready).'],
        },
        // THE FIX (only once the network is open): recreate the deleted Secret.
        // The player-typed password value is ignored — we match the fixed tokens
        // create/secret/generic + the name db-credentials + the sgFixed gate.
        {
          match: {
            args: ['create', 'secret', 'generic'],
            argIncludes: 'db-credentials',
            flag: { name: 'sgFixed' },
          },
          outKind: 'sys',
          output: [
            'secret/db-credentials created. Pods scheduling…',
            'deployment/web rolled out (3/3 ready).',
            'The failover cluster is healthy — now confirm DNS has healed back to the primary.',
          ],
          effect: {
            setFlags: { k8sFixed: true },
            // append-only: preserves the "not found" evidence in the events log
            appendFiles: {
              '~/k8s/events.txt':
                '5s          Normal    Started       pod/web-passive-7c9f-4xk2p   secret/db-credentials mounted; Started container web; deployment/web rolled out (3/3 ready)',
            },
            // overwrite a separate human-readable status marker (not evidence)
            writeFiles: { '~/k8s/status': 'OK — secret/db-credentials restored; deployment/web 3/3 ready' },
          },
        },
        // PRECONDITION (not an err): create secret attempted BEFORE the network
        // is open. NO effect — completes nothing, sets no flag, fully retryable.
        {
          match: { args: ['create', 'secret', 'generic'], argIncludes: 'db-credentials' },
          output: [
            'kubectl: the cluster API is unreachable — the network path is still blocked upstream.',
            'Re-open the security group first (tcp/443 on sg-web), then recreate the Secret.',
          ],
        },
        // `kubectl get pods` — the live pod table (gated pre-fix).
        {
          match: { args: ['get', 'pods'], flag: { name: 'k8sFixed', equals: false } },
          output: [
            'NAME                         READY   STATUS              RESTARTS   AGE',
            'web-passive-7c9f-4xk2p       0/1     ContainerCreating   0          7m',
            'web-passive-7c9f-t9r4w       0/1     ContainerCreating   0          7m',
            'Neither passive-region pod is Ready — both are stuck ContainerCreating, unable to mount the Secret.',
          ],
        },
        // `kubectl describe pod <name>` — the mount failure (gated pre-fix).
        {
          match: { args: ['describe', 'pod'], flag: { name: 'k8sFixed', equals: false } },
          output: [
            'Name:      web-passive-7c9f-4xk2p',
            'Status:    Pending',
            'Events:',
            '  Warning  FailedMount  MountVolume.SetUp failed for volume "db-creds" : secret "db-credentials" not found',
            'The pod cannot mount the db-credentials Secret — it was deleted, so the container never starts.',
          ],
        },
      ],
      default: {
        output: [
          'usage: kubectl get pods | kubectl describe pod <name> |',
          '       kubectl create secret generic db-credentials --from-literal=password=<pw>',
        ],
      },
    },

    // ── dig: a DIAGNOSTIC verb — NO effect on any response, so objective 6 may
    //    legally read it via outputMatched. The healthy line (the only line
    //    naming 203.0.113.10) is gated on k8sFixed, so it cannot lie: until the
    //    whole chain is done, DNS still points at the failover address.
    dig: {
      oneLiner: 'query DNS — see what resolvers hand out (dig <name>)',
      responses: [
        // Post-heal: DNS has failed back to the healthy primary. Only this line
        // contains 203.0.113.10, so it — and only it — completes objective 6.
        {
          match: { flag: { name: 'k8sFixed' } },
          output: [
            '; <<>> DiG 9.18.24 <<>> shop.opscanopy.io',
            ';; ANSWER SECTION:',
            'shop.opscanopy.io.  60  IN  A  203.0.113.10   (primary, healthy)',
            ';; DNS has healed — traffic is back on the healthy primary region.',
          ],
        },
        // Pre-heal: still on the failover address (203.0.113.99) — completes
        // nothing. The chain is not done until DNS points back at the primary.
        {
          match: { args: ['shop.opscanopy.io'] },
          output: [
            '; <<>> DiG 9.18.24 <<>> shop.opscanopy.io',
            ';; ANSWER SECTION:',
            'shop.opscanopy.io.  60  IN  A  203.0.113.99   (failover, unhealthy)',
            ';; Still failed over — the primary health check has not recovered yet.',
          ],
        },
      ],
      default: {
        output: ['usage: dig <name>   (try: dig shop.opscanopy.io)'],
      },
    },
  },

  objectives: [
    {
      id: 1,
      text: 'Triage the pager',
      trigger: { cmd: ['cat', 'grep'], when: { outputMatched: 'CRITICAL' } },
      successLine: 'SEV-1 confirmed — every region is 5xx and DNS has already failed traffic over to the passive region.',
    },
    {
      id: 2,
      text: 'Find the network block',
      trigger: { cmd: ['cat', 'grep'], when: { outputMatched: 'REVOKE' } },
      successLine: 'There it is — a 00:14 change REVOKEd tcp/443 on sg-web, so the LB health checks went red. That is the root cause.',
    },
    {
      id: 3,
      text: 'Re-open the security group',
      trigger: { cmd: 'aws', when: { flagSet: 'sgFixed' } },
      successLine: 'tcp/443 re-authorized on sg-web — the LB can reach the web tier again and health checks are recovering.',
    },
    {
      id: 4,
      text: 'Read the failover-cluster events',
      trigger: { cmd: ['cat', 'grep'], when: { outputMatched: 'db-credentials' } },
      successLine: 'The passive cluster is crash-looping on a missing db-credentials Secret — that is why the failover region is degraded too.',
    },
    {
      id: 5,
      text: 'Restore the missing Secret',
      trigger: { cmd: 'kubectl', when: { flagSet: 'k8sFixed' } },
      successLine: 'Secret restored — deployment/web rolled out 3/3 in the passive region.',
    },
    {
      id: 6,
      text: 'Confirm traffic is back on the healthy primary',
      trigger: { cmd: 'dig', when: { outputMatched: '203.0.113.10' } },
      successLine: 'DNS has healed — shop.opscanopy.io resolves to the healthy primary (203.0.113.10). Outage over. Capstone complete.',
    },
  ],

  hints: [
    'Start at the top of the incident: `cat ~/incident.log`. All regions are 5xx and DNS has already failed over to the passive region — now work out what broke FIRST.',
    'Work upstream first. `cat ~/aws/sg-audit.txt` — tcp/443 ingress on sg-web was revoked at 00:14, which is why the LB health checks went red. That is the root cause; re-authorize it.',
    'Then the failover cluster. `cat ~/k8s/events.txt` — a web pod cannot mount the db-credentials Secret because it was deleted. Recreate it — but only after the network is open.',
    'Once the security group is open and the Secret is back, run `dig shop.opscanopy.io`: it should return the healthy primary (203.0.113.10), not the failover address 203.0.113.99.',
    'Fix strictly in order: `aws ec2 authorize-security-group-ingress --group-id sg-web --protocol tcp --port 443 --cidr 0.0.0.0/0`, then `kubectl create secret generic db-credentials --from-literal=password=<pw>`, then confirm with `dig shop.opscanopy.io`.',
  ],
};

export default finalMidnightOutage;

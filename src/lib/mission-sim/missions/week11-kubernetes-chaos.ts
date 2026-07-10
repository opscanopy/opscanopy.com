/**
 * Mission — Week 11: "Kubernetes Chaos" (a config-only Secret restore).
 *
 * Day 73, kube-bastion. Half the web pods are Pending, the rest are
 * CrashLoopBackOff. The events say it plainly: the `db-credentials` Secret was
 * deleted. Pods that need to mount it are stuck Pending (MountVolume.SetUp
 * failed — secret not found); the ones already running fail auth and crash.
 *
 * The Deployment itself is fine — ~/k8s/deploy.yaml still references the Secret
 * via `envFrom.secretRef` and a `secret` volume. The fix is not a manifest edit;
 * it is recreating the missing Secret. Once it exists, the Deployment
 * self-heals and rolls out 3/3.
 *
 * Orient (ls) → survey the damage (pods.txt: CrashLoopBackOff) → read the reason
 * (events.txt: secret "db-credentials" not found) → see what the Deployment
 * expects (deploy.yaml: secretRef) → FIX with
 * `kubectl create secret generic db-credentials --from-literal=…`.
 *
 * Proves the engine is config-only: `kubectl` is a SCRIPTED verb. Its live
 * queries (get pods / describe pod / get events) are gated on the pre-fix flag
 * so they never keep claiming the outage after the Secret is back — they fall
 * through to one honest post-fix line. The `create secret` response carries the
 * only effect (setFlags + append a Normal Started line to the evidence-preserving
 * events log + write a status marker). Objectives complete in ANY order; the
 * append-only events log keeps the "not found" evidence even after the fix.
 *
 * NOTE: dormant — deliberately NOT registered in the live mission registry.
 */
import type { MissionConfig } from '../types';

const podsTxt = [
  'NAME                    READY   STATUS             RESTARTS   AGE',
  'web-6d8f7c9b5d-4xk2p    0/1     Pending            0          6m',
  'web-6d8f7c9b5d-7bqzn    0/1     CrashLoopBackOff   5          6m',
  'web-6d8f7c9b5d-t9r4w    0/1     CrashLoopBackOff   5          6m',
].join('\n');

const eventsTxt = [
  'LAST SEEN   TYPE      REASON        OBJECT                     MESSAGE',
  '2m          Warning   FailedMount   pod/web-6d8f7c9b5d-4xk2p   MountVolume.SetUp failed for volume "db-creds" : secret "db-credentials" not found',
  '90s         Warning   BackOff       pod/web-6d8f7c9b5d-7bqzn   Back-off restarting failed container web',
  '90s         Warning   BackOff       pod/web-6d8f7c9b5d-t9r4w   Back-off restarting failed container web',
  '75s         Warning   Failed        pod/web-6d8f7c9b5d-7bqzn   Error: secret "db-credentials" not found',
].join('\n');

const deployYaml = [
  'apiVersion: apps/v1',
  'kind: Deployment',
  'metadata:',
  '  name: web',
  'spec:',
  '  replicas: 3',
  '  selector:',
  '    matchLabels:',
  '      app: web',
  '  template:',
  '    metadata:',
  '      labels:',
  '        app: web',
  '    spec:',
  '      containers:',
  '        - name: web',
  '          image: opscanopy/web:latest',
  '          envFrom:',
  '            - secretRef:',
  '                name: db-credentials',
  '          volumeMounts:',
  '            - name: db-creds',
  '              mountPath: /etc/db',
  '              readOnly: true',
  '      volumes:',
  '        - name: db-creds',
  '          secret:',
  '            secretName: db-credentials',
].join('\n');

export const week11KubernetesChaos: MissionConfig = {
  id: 'week11-kubernetes-chaos',
  title: 'Kubernetes Chaos',
  week: 11,
  unlockAfterDay: 73,
  promptUser: 'student',
  promptHost: 'kube-bastion',
  optimalCommands: 6,

  story: [
    '02:10 PM. The web tier is half down. The dashboard shows three pods for the ' +
      '`web` Deployment: one stuck Pending, two flapping in CrashLoopBackOff. The ' +
      'health check has been red for six minutes and traffic is erroring.',
    'Nobody touched the Deployment. But someone was "cleaning up unused objects" in ' +
      'this namespace an hour ago. The cluster state is captured in ~/k8s — the pod ' +
      'list, the recent events, and the Deployment manifest that has been serving fine ' +
      'for weeks.',
    'Read the events, work out what the pods are missing, and put it back — the ' +
      'Deployment will self-heal once it can mount what it expects. Type `help` to see ' +
      'what this terminal can do.',
  ],

  filesystem: {
    '~': {
      k8s: {
        'pods.txt': podsTxt,
        'events.txt': eventsTxt,
        'deploy.yaml': deployYaml,
      },
    },
  },

  // Host-level processes only. The cluster lives behind the scripted `kubectl`
  // verb, NOT this table.
  processes: [
    { pid: 1, user: 'root', cpu: 0.0, mem: 0.1, command: 'systemd' },
    { pid: 480, user: 'root', cpu: 0.0, mem: 0.2, command: 'sshd' },
    { pid: 1400, user: 'student', cpu: 0.0, mem: 0.3, command: 'bash' },
  ],

  supportedCommands: [
    'pwd', 'ls', 'cd', 'cat', 'grep', 'ps', 'help', 'hint', 'clear', 'kubectl',
  ],

  // Initial state flags. The fix flips secretRestored → true.
  flags: { secretRestored: false },

  // ── Config-authored `kubectl` verb (zero domain logic in the engine) ──────
  commands: {
    kubectl: {
      oneLiner:
        'inspect and manage the cluster (kubectl get pods, kubectl describe pod <name>, kubectl get events, kubectl create secret generic <name> --from-literal=…)',
      // First match wins. Live-query diagnostics are gated on the pre-fix flag so
      // that once the Secret is restored they fall through to the honest post-fix
      // line below — a `get pods` must never keep claiming the crash loop after
      // the Deployment has rolled out.
      responses: [
        // `kubectl get pods` — the live pod table: Pending + CrashLoopBackOff.
        {
          match: { args: ['get', 'pods'], flag: { name: 'secretRestored', equals: false } },
          output: [
            'NAME                    READY   STATUS             RESTARTS   AGE',
            'web-6d8f7c9b5d-4xk2p    0/1     Pending            0          7m',
            'web-6d8f7c9b5d-7bqzn    0/1     CrashLoopBackOff   6          7m',
            'web-6d8f7c9b5d-t9r4w    0/1     CrashLoopBackOff   6          7m',
            'One pod stuck Pending, two crash-looping — not one of the three is Ready.',
          ],
        },
        // `kubectl describe pod <name>` — the events, incl. the mount failure.
        {
          match: { args: ['describe', 'pod'], flag: { name: 'secretRestored', equals: false } },
          output: [
            'Name:      web-6d8f7c9b5d-4xk2p',
            'Status:    Pending',
            'Events:',
            '  Warning  FailedMount  MountVolume.SetUp failed for volume "db-creds" : secret "db-credentials" not found',
            '  Warning  BackOff      Back-off restarting failed container web',
            'The pod cannot mount the db-credentials Secret — it does not exist.',
          ],
        },
        // `kubectl get events` — mirrors ~/k8s/events.txt.
        {
          match: { args: ['get', 'events'], flag: { name: 'secretRestored', equals: false } },
          output: [
            'LAST SEEN   TYPE      REASON        MESSAGE',
            '2m          Warning   FailedMount   MountVolume.SetUp failed for volume "db-creds" : secret "db-credentials" not found',
            '90s         Warning   BackOff       Back-off restarting failed container web',
            '75s         Warning   Failed        Error: secret "db-credentials" not found',
          ],
        },
        // Idempotent + honest: once the Secret is back this is the answer to
        // get pods / describe pod / get events AND a re-run of create secret.
        {
          match: { flag: { name: 'secretRestored' } },
          output: [
            'secret/db-credentials exists — deployment/web rolled out (3/3 ready), all pods Running.',
          ],
        },
        // THE FIX: recreate the deleted Secret. Player-typed password value is
        // ignored — we match the fixed tokens create/secret/generic + the
        // secret name db-credentials only.
        {
          match: { args: ['create', 'secret', 'generic'], argIncludes: 'db-credentials' },
          outKind: 'sys',
          output: [
            'secret/db-credentials created. Pods scheduling…',
            'deployment/web rolled out (3/3 ready).',
            'The missing Secret is back — the Deployment self-healed. The crash loop is over.',
          ],
          effect: {
            setFlags: { secretRestored: true },
            // append-only: preserves the "not found" evidence in the events log
            appendFiles: {
              '~/k8s/events.txt':
                '5s          Normal    Started       pod/web-6d8f7c9b5d-4xk2p   Started container web; deployment/web rolled out (3/3 ready)',
            },
            // overwrite the human-readable status marker (not read as evidence)
            writeFiles: { '~/k8s/status': 'OK — 3/3 ready' },
          },
        },
      ],
      default: {
        output: [
          'usage: kubectl get pods | kubectl describe pod <name> | kubectl get events | kubectl create secret generic <name> --from-literal=…',
        ],
      },
    },
  },

  objectives: [
    {
      id: 1,
      text: 'Look around',
      trigger: { cmd: 'ls', when: 'always' },
      successLine: 'One directory: ~/k8s. The whole cluster snapshot is in there.',
    },
    {
      id: 2,
      text: 'Survey the damage',
      trigger: { cmd: ['cat', 'grep'], when: { outputMatched: 'CrashLoopBackOff' } },
      successLine: 'Two pods CrashLoopBackOff and one Pending — none of the web pods is Ready.',
    },
    {
      id: 3,
      text: 'Find why the pods will not start',
      trigger: { cmd: ['cat', 'grep'], when: { outputMatched: 'not found' } },
      successLine: 'There it is — secret "db-credentials" not found: the pods cannot mount it.',
    },
    {
      id: 4,
      text: 'See what the Deployment expects',
      trigger: { cmd: ['cat', 'grep'], when: { outputMatched: 'secretRef' } },
      successLine: 'The Deployment pulls env from a secretRef named db-credentials — the Secret that was deleted.',
    },
    {
      id: 5,
      text: 'Recreate the missing Secret',
      trigger: { cmd: 'kubectl', when: { flagSet: 'secretRestored' } },
      successLine: 'Secret restored — the Deployment rolled out 3/3. Order restored.',
    },
  ],

  hints: [
    'Start by looking around with `ls`; the saved cluster state is in ~/k8s.',
    '~/k8s/pods.txt shows pods Pending and CrashLoopBackOff — read ~/k8s/events.txt for the reason.',
    'The events say secret "db-credentials" not found, and ~/k8s/deploy.yaml mounts it — the Secret was deleted.',
    'Recreate it: `kubectl create secret generic db-credentials --from-literal=password=<pw>`.',
  ],
};

export default week11KubernetesChaos;

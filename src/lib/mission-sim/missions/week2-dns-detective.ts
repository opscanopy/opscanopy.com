/**
 * Mission — Week 2: "DNS Detective" (a config-only DNS-as-code revert).
 *
 * Day 14, prod-web-03. Users report the shop is "sometimes down." The record
 * `shop.opscanopy.io` round-robins across two backends, but web-b
 * (203.0.113.99) was decommissioned last night and its A record was never
 * pulled from the zone — so ~half of all requests are handed a dead host and
 * time out. DNS records live in git as code; the fix reverts the commit that
 * added the A record for the box that no longer exists.
 *
 * Orient (pwd) → read the uptime log (the intermittent TIMEOUTs) → trace what
 * the resolvers actually hand out (dig shows TWO A records) → FIX with
 * `git revert 9c1f2ab`.
 *
 * Proves the engine is config-only: `dig` is a DIAGNOSTIC verb (no effect, so
 * an `outputMatched` objective may read it), gated on the pre-fix flag so it
 * tells the truth AFTER the fix too; `git` is the mutating verb whose `revert`
 * response carries an immutable effect (setFlags + append a healthy line to the
 * evidence-preserving uptime log + write a separate status marker). Objectives
 * complete in ANY order; the append-only log keeps the TIMEOUT evidence and the
 * post-fix `dig` line still names the removed 203.0.113.99, so a fix-first
 * player can still complete every read-the-evidence objective.
 *
 * NOTE: dormant — deliberately NOT registered in the live mission registry.
 */
import type { MissionConfig } from '../types';

const uptimeLog = [
  '2026-07-10 08:00:03 [INFO]  probe shop.opscanopy.io → 200 OK (203.0.113.10)',
  '2026-07-10 08:00:08 [ERROR] probe shop.opscanopy.io → TIMEOUT (203.0.113.99) — no route to host',
  '2026-07-10 08:00:13 [INFO]  probe shop.opscanopy.io → 200 OK (203.0.113.10)',
  '2026-07-10 08:00:18 [ERROR] probe shop.opscanopy.io → TIMEOUT (203.0.113.99) — no route to host',
  '2026-07-10 08:00:23 [INFO]  probe shop.opscanopy.io → 200 OK (203.0.113.10)',
  '2026-07-10 08:00:28 [ERROR] probe shop.opscanopy.io → TIMEOUT (203.0.113.99) — no route to host',
  '2026-07-10 08:00:33 [INFO]  probe shop.opscanopy.io → 200 OK (203.0.113.10)',
  '2026-07-10 08:00:38 [ERROR] probe shop.opscanopy.io → TIMEOUT (203.0.113.99) — no route to host',
  '2026-07-10 08:00:43 [WARN]  ~50% of probes failing — one backend is answering, one is dead',
].join('\n');

const recordsZone = [
  '$TTL 300',
  '@   IN  SOA ns1.opscanopy.io. hostmaster.opscanopy.io. (',
  '        2026071001 ; serial',
  '        3600 900 604800 300 )',
  '    IN  NS  ns1.opscanopy.io.',
  '    IN  NS  ns2.opscanopy.io.',
  '',
  '; shop round-robins across the web tier',
  'shop    IN  A   203.0.113.10',
  'shop    IN  A   203.0.113.99   ; web-b — decommissioned 2026-07-09, record NOT pulled',
].join('\n');

const notes = [
  'prod-web-03 — DNS runbook (night shift)',
  '',
  '- The shop record lives in git as code: this zone file is what actually gets served.',
  '- Use `dig shop.opscanopy.io` to see what the resolvers are really handing out.',
  '- Never hand-edit the served zone. Revert bad DNS changes with git.',
  '',
  '— M.',
].join('\n');

export const week2DnsDetective: MissionConfig = {
  id: 'week2-dns-detective',
  title: 'DNS Detective',
  week: 2,
  unlockAfterDay: 14,
  promptUser: 'student',
  promptHost: 'prod-web-03',
  optimalCommands: 5,

  story: [
    '08:05 AM. Support is forwarding the same complaint on repeat: the shop is ' +
      '"sometimes down." Not down — sometimes. A refresh usually fixes it. That word, ' +
      '"sometimes," is the whole case.',
    'shop.opscanopy.io round-robins across two backends. Last night web-b was ' +
      'decommissioned — powered off and deleted — but nobody pulled it from DNS. So ' +
      'roughly half of every user’s requests are still being routed to a host that no ' +
      'longer exists, and those requests just hang.',
    'DNS here is code, kept in git. You do not hand-edit the zone. Read the uptime log, ' +
      'see what the resolvers are handing out, and roll back the change that outlived the ' +
      'box. Type `help` to see what this terminal can do.',
  ],

  filesystem: {
    '~': {
      logs: {
        'uptime.log': uptimeLog,
      },
      dns: {
        'records.zone': recordsZone,
        'notes.txt': notes,
      },
    },
  },

  // A calm jump box: no runaway process, just systemd + your shell + sshd.
  processes: [
    { pid: 1, user: 'root', cpu: 0.0, mem: 0.1, command: 'systemd' },
    { pid: 512, user: 'root', cpu: 0.0, mem: 0.2, command: 'sshd' },
    { pid: 2200, user: 'student', cpu: 0.0, mem: 0.3, command: 'bash' },
  ],

  supportedCommands: [
    'pwd', 'ls', 'cd', 'cat', 'grep', 'ps', 'help', 'hint', 'clear', 'dig', 'git',
  ],

  // Initial state flags. The fix flips dnsFixed → true.
  flags: { dnsFixed: false },

  // ── Config-authored verbs (zero domain logic in the engine) ──────────────
  commands: {
    // ── dig: a DIAGNOSTIC verb — never carries an effect, so it is safe for an
    //    `outputMatched` objective. It IS a live query, though, so it is gated
    //    on the pre-fix flag: after the revert it must stop claiming the shop
    //    still answers on 203.0.113.99 and tell the honest post-fix truth. The
    //    post-fix line still NAMES 203.0.113.99 (as the record now removed), so
    //    a fix-first player can still complete the "trace DNS" objective.
    dig: {
      oneLiner: 'query DNS — see what resolvers hand out (dig <name>)',
      responses: [
        // Pre-fix: the resolvers round-robin across TWO A records, one dead.
        {
          match: { args: ['shop.opscanopy.io'], flag: { name: 'dnsFixed', equals: false } },
          output: [
            '; <<>> DiG 9.18.24 <<>> shop.opscanopy.io',
            ';; ANSWER SECTION:',
            'shop.opscanopy.io.  300  IN  A  203.0.113.10',
            'shop.opscanopy.io.  300  IN  A  203.0.113.99',
            ';; Two A records — resolvers round-robin between them. Half of all',
            ';; requests are handed 203.0.113.99, the host that was decommissioned.',
          ],
        },
        // Post-fix: one healthy A record. Names 203.0.113.99 only to say it is gone.
        {
          match: { args: ['shop.opscanopy.io'] },
          output: [
            '; <<>> DiG 9.18.24 <<>> shop.opscanopy.io',
            ';; ANSWER SECTION:',
            'shop.opscanopy.io.  300  IN  A  203.0.113.10',
            ';; One A record now — the stale 203.0.113.99 (web-b) was reverted.',
            ';; Every request lands on a live host.',
          ],
        },
      ],
      default: {
        output: ['usage: dig <name>   (try: dig shop.opscanopy.io)'],
      },
    },

    // ── git: the MUTATING verb. `git log` is read-only history; `git revert`
    //    is the fix. Response order: read-only log → idempotent already-done
    //    guard → the fix → honest default.
    git: {
      oneLiner: 'inspect history and roll back changes (git log, git revert <sha>)',
      responses: [
        // Read-only history: shows web-b being added, then decommissioned, but
        // its DNS record never removed.
        {
          match: { args: ['log'] },
          output: [
            'commit 3d8e4f1  (HEAD -> main)  chore: decommission web-b',
            '    terminated + deleted web-b (203.0.113.99) — instance is gone',
            'commit 7a5b9c2  ops: pin shop TTL to 300s for faster failover',
            'commit 9c1f2ab  provision web-b (add A 203.0.113.99)',
            '    added a second backend to the shop round-robin',
            'The box was decommissioned, but the commit that added its A record was never reverted.',
          ],
        },
        // Idempotent + honest: once reverted, say so and change nothing.
        {
          match: { flag: { name: 'dnsFixed' } },
          output: ['git: already reverted — the zone now serves one healthy A record (203.0.113.10).'],
        },
        // THE FIX: revert the commit that added the stale A record. The
        // player-typed SHA is ignored — only the fixed `revert` token matches.
        {
          match: { args: ['revert'] },
          outKind: 'sys',
          output: [
            'Reverting "provision web-b (add A 203.0.113.99)"',
            '[main a1b2c3d] Revert "provision web-b (add A 203.0.113.99)"',
            'Reverted 9c1f2ab. The served zone now has one A record: 203.0.113.10.',
            'web-b (203.0.113.99) is out of rotation — resolvers refresh within the TTL.',
          ],
          effect: {
            setFlags: { dnsFixed: true },
            // append-only: preserves the TIMEOUT evidence in the uptime log
            appendFiles: {
              '~/logs/uptime.log':
                '2026-07-10 08:12:07 [INFO]  all probes shop.opscanopy.io → 200 OK (203.0.113.10) — web-b out of rotation',
            },
            // overwrite a human-readable status marker (not read as evidence)
            writeFiles: {
              '~/dns/status': 'OK — one healthy A record (203.0.113.10); stale web-b (203.0.113.99) reverted',
            },
          },
        },
      ],
      default: {
        output: ['git: read-only `git log` is available, or `git revert <sha>` to roll back a DNS change.'],
      },
    },
  },

  objectives: [
    {
      id: 1,
      text: 'Get your bearings',
      trigger: { cmd: 'pwd', when: 'always' },
      successLine: 'Oriented on prod-web-03. On a quiet box, the logs and the zone file are the whole story.',
    },
    {
      id: 2,
      text: 'See the intermittent failures',
      trigger: { cmd: ['cat', 'grep'], when: { outputMatched: 'TIMEOUT' } },
      successLine: 'There it is — every other probe TIMEOUTs. The failures alternate with the successes.',
    },
    {
      id: 3,
      text: 'Trace what DNS is handing out',
      trigger: { cmd: 'dig', when: { outputMatched: '203.0.113.99' } },
      successLine: 'Two A records — and one of them, 203.0.113.99, is the box that was decommissioned last night.',
    },
    {
      id: 4,
      text: 'Remove the stale record and recover',
      trigger: { cmd: 'git', when: { flagSet: 'dnsFixed' } },
      successLine: 'Reverted. The zone serves one live host now — the "sometimes down" reports stop as the TTL expires.',
    },
  ],

  hints: [
    'Start with `pwd` and `ls`, then read the uptime log in `~/logs`.',
    'Run `grep TIMEOUT ~/logs/uptime.log` — about half the probes hit 203.0.113.99 and time out.',
    'dig shop.opscanopy.io shows two A records; `git log` shows web-b was decommissioned but its record was never removed.',
    'Roll back the commit that added it: `git revert 9c1f2ab`.',
  ],
};

export default week2DnsDetective;

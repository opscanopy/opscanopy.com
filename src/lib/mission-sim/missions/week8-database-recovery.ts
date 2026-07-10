/**
 * Mission — Week 8: "Database Recovery" (a config-only restore-then-verify).
 *
 * 14:02, ops-jump-01. An intern poking at prod ran `DROP TABLE orders` and the
 * app is 500-ing on relation "orders" does not exist. There is no undo for a
 * DROP — but RDS takes automated snapshots, and the newest one from BEFORE
 * 14:02 still has the table whole. The fix is a restore, and then a VERIFY: you
 * do not tell anyone it is fixed until you have seen the rows come back.
 *
 * Orient (cd into ~/db) → read the incident log (what was lost: DROP TABLE
 * orders) → read the snapshot list (which snapshot: the newest PRE-14:02 one,
 * rds:prod-db-2026-07-10-06-00 — the manual one grabbed DURING the incident is a
 * trap) → RESTORE from that snapshot (`aws rds restore-…`) → VERIFY with psql.
 *
 * Two engine facts this mission proves:
 *   1. `aws` is a SCRIPTED mutating verb: its restore response carries an
 *      immutable effect (flip `restored`, append a success line to the
 *      evidence-preserving incident log, write a separate status marker) — the
 *      remediation objective is gated state-based on `flagSet: restored`, so a
 *      live `describe-db-snapshots` query never lies post-fix and re-running the
 *      restore is idempotent + honest.
 *   2. `psql` is a DIAGNOSTIC verb with NO effect, and it is deliberately
 *      TWO-FACED: pre-restore it emits an `err` ("relation orders does not
 *      exist"), which completes NO objective (objectives.ts only scans out/sys),
 *      so the verify objective cannot fire until the table is actually back;
 *      post-restore it prints the row count with `orders` in an out line, which
 *      completes the verify objective via outputMatched. The gate is the story.
 *
 * NOTE: dormant — deliberately NOT registered in the live mission registry.
 */
import type { MissionConfig } from '../types';

const incidentLog = [
  '2026-07-10 14:02:07 [AUDIT] user=intern_raj  session=psql prod  ->  DROP TABLE orders;',
  '2026-07-10 14:02:07 [AUDIT] statement executed: DROP TABLE orders (14,201 blocks freed)',
  '2026-07-10 14:02:11 [ERROR] app: 500 Internal Server Error — relation "orders" does not exist',
  '2026-07-10 14:02:12 [ERROR] app: 500 Internal Server Error — relation "orders" does not exist',
  '2026-07-10 14:02:18 [FATAL] checkout: order pipeline down — every /checkout call is 500-ing',
  '2026-07-10 14:03:00 [WARN] pagerduty: SEV-1 opened — prod orders table missing, revenue impact',
].join('\n');

const snapshots = [
  'RDS snapshots for prod-db (DBSnapshotIdentifier — created UTC — note):',
  '',
  'rds:prod-db-manual-2026-07-10-1410   2026-07-10 14:10   MANUAL, grabbed DURING the incident —',
  '                                                        taken AFTER 14:02, the table is already gone. DO NOT restore this.',
  'rds:prod-db-2026-07-10-06-00         2026-07-10 06:00   automated — the newest snapshot from BEFORE 14:02. Table intact here.',
  'rds:prod-db-2026-07-09-06-00         2026-07-09 06:00   automated — older, also pre-14:02 (a full day of writes behind).',
  'rds:prod-db-2026-07-08-06-00         2026-07-08 06:00   automated — older still.',
  '',
  'The table was dropped at 14:02, so any snapshot created after 14:02 is missing it.',
  'Restore the NEWEST pre-14:02 snapshot to lose the least data:',
  '  rds:prod-db-2026-07-10-06-00',
].join('\n');

export const week8DatabaseRecovery: MissionConfig = {
  id: 'week8-database-recovery',
  title: 'Database Recovery',
  week: 8,
  unlockAfterDay: 56,
  promptUser: 'ops',
  promptHost: 'ops-jump-01',
  optimalCommands: 6,

  story: [
    '14:02. A SEV-1 just opened and your phone will not stop: every /checkout call is ' +
      'throwing 500s. The app log is screaming relation "orders" does not exist — the ' +
      'orders table is simply gone.',
    'The timeline is ugly but clear. An intern, poking around in prod, ran DROP TABLE ' +
      'orders at 14:02. There is no undo for that. What there IS: RDS takes automated ' +
      'snapshots, and the newest one from before 14:02 still holds the table, whole.',
    'Restore that snapshot into a fresh instance, then VERIFY the orders table is really ' +
      'back before you tell anyone it is fixed — no second mistake under pressure. ' +
      'Everything you need is in ~/db. Type `help` to see what this terminal can do.',
  ],

  filesystem: {
    '~': {
      db: {
        'incident.log': incidentLog,
        'snapshots.txt': snapshots,
      },
    },
  },

  // A jump host: no app runs here, just the shell. The database lives in RDS,
  // surfaced by the scripted `aws`/`psql` verbs — not by this process table.
  processes: [
    { pid: 1, user: 'root', cpu: 0.0, mem: 0.1, command: 'systemd' },
    { pid: 480, user: 'root', cpu: 0.0, mem: 0.2, command: 'sshd' },
    { pid: 1910, user: 'ops', cpu: 0.0, mem: 0.3, command: 'bash' },
  ],

  supportedCommands: [
    'pwd', 'ls', 'cd', 'cat', 'grep', 'ps', 'help', 'hint', 'clear', 'aws', 'psql',
  ],

  // Initial state flags. The restore flips restored → true.
  flags: { restored: false },

  // ── Config-authored verbs (zero domain logic in the engine) ──────────────
  commands: {
    aws: {
      oneLiner:
        'inspect + restore RDS (aws rds describe-db-snapshots, aws rds restore-db-instance-from-db-snapshot …)',
      // First match wins. Diagnostic listing first (safe, no effect — snapshots
      // persist after a restore, so it never lies), then the idempotent
      // already-restored guard, then THE FIX.
      responses: [
        // `aws rds describe-db-snapshots` — the diagnostic list (no effect).
        {
          match: { args: ['rds', 'describe-db-snapshots'] },
          output: [
            'DBSnapshotIdentifier                  SnapshotCreateTime     Status      Note',
            'rds:prod-db-manual-2026-07-10-1410    2026-07-10T14:10:22Z   available   manual, POST-14:02 — table already gone',
            'rds:prod-db-2026-07-10-06-00          2026-07-10T06:00:09Z   available   automated, newest PRE-14:02 — table intact',
            'rds:prod-db-2026-07-09-06-00          2026-07-09T06:00:07Z   available   automated, older',
            'rds:prod-db-2026-07-08-06-00          2026-07-08T06:00:05Z   available   automated, older',
          ],
        },
        // Idempotent + honest: once restored, say so and change nothing.
        {
          match: { flag: { name: 'restored' } },
          output: [
            'prod-db-restored is already available — the orders table is present (1,240,132 rows). Nothing left to restore.',
          ],
        },
        // THE FIX: restore the newest PRE-14:02 snapshot into a fresh instance.
        // Only the correct snapshot id matches; the manual post-drop one falls
        // through to the honest usage default.
        {
          match: {
            args: ['rds', 'restore-db-instance-from-db-snapshot'],
            argIncludes: 'rds:prod-db-2026-07-10-06-00',
          },
          outKind: 'sys',
          output: [
            'Restoring prod-db-restored from rds:prod-db-2026-07-10-06-00...',
            '  status: creating → backing-up → available',
            'prod-db-restored is available. Verify the orders table, then repoint the app.',
          ],
          effect: {
            setFlags: { restored: true },
            // append-only: preserves the "DROP TABLE orders" evidence in the log
            appendFiles: {
              '~/db/incident.log':
                '2026-07-10 14:37:52 [INFO] restore complete — orders table present (1,240,132 rows), checkout pipeline recovering',
            },
            // overwrite a separate human-readable status marker (not read as evidence)
            writeFiles: { '~/db/status': 'RESTORED — prod-db-restored available, orders table back' },
          },
        },
      ],
      default: {
        output: [
          'usage: aws rds describe-db-snapshots',
          '       aws rds restore-db-instance-from-db-snapshot \\',
          '         --db-instance-identifier prod-db-restored \\',
          '         --db-snapshot-identifier <snapshot-id>',
          'Restore the newest pre-14:02 snapshot: rds:prod-db-2026-07-10-06-00.',
        ],
      },
    },

    // Read-only verify. NO effect anywhere — this is a diagnostic verb, so an
    // objective may legally read it via outputMatched. It is deliberately
    // two-faced on the pre-fix flag (see the module header).
    psql: {
      oneLiner: 'run a read-only verify query (psql -c "select count(*) from orders;")',
      responses: [
        // POST-restore success: the table is back. An out line literally names
        // `orders`, so the verify objective's outputMatched('orders') fires.
        {
          match: { flag: { name: 'restored' }, argIncludes: 'orders' },
          output: [
            'psql (16.3) — connected to prod-db-restored',
            'SELECT count(*) FROM orders;',
            '  count  ',
            '---------',
            ' 1240132',
            '(1 row)',
            'Verified: the orders table is back — 1,240,132 rows. Crisis over.',
          ],
        },
        // PRE-restore fallback: the table is still missing. This is a DELIBERATE
        // `err` (psql carries NO effect, so the err+effect guard is satisfied).
        // Because outputMatched scans only out/sys lines, this err completes NO
        // objective — the verify gate holds until the restore actually lands.
        {
          match: { argIncludes: 'orders' },
          outKind: 'err',
          output: ['ERROR: relation "orders" does not exist'],
        },
      ],
      default: {
        // No literal "orders" here on purpose: a bare `psql` must not trip the
        // verify objective's outputMatched before the restore has landed.
        output: ['usage: psql -c "select count(*) from <table>;"'],
      },
    },
  },

  objectives: [
    {
      id: 1,
      text: 'Get your bearings',
      trigger: { cmd: 'cd', when: { cwdIs: '~/db' } },
      successLine: 'In ~/db. The incident log and the snapshot list are both right here.',
    },
    {
      id: 2,
      text: 'Confirm what was lost',
      trigger: { cmd: ['cat', 'grep'], when: { outputMatched: 'DROP TABLE orders' } },
      successLine: 'Confirmed — the intern ran DROP TABLE orders at 14:02, and the app is 500-ing on the missing table.',
    },
    {
      id: 3,
      text: 'Pick a snapshot from BEFORE the drop',
      trigger: { cmd: ['cat', 'grep'], when: { outputMatched: 'rds:prod-db-2026-07-10-06-00' } },
      successLine: 'The newest pre-14:02 snapshot is rds:prod-db-2026-07-10-06-00 — anything later already lost the table.',
    },
    {
      id: 4,
      text: 'Restore from that snapshot',
      trigger: { cmd: 'aws', when: { flagSet: 'restored' } },
      successLine: 'Restore kicked off — prod-db-restored is coming up from the pre-drop snapshot.',
    },
    {
      id: 5,
      text: 'Verify the table is back',
      trigger: { cmd: 'psql', when: { outputMatched: 'orders' } },
      successLine: 'Verified — the orders table is back with 1,240,132 rows. NOW you can repoint the app.',
    },
  ],

  hints: [
    'Get to the database directory and read the incident log: `cd ~/db`, then `cat ~/db/incident.log`.',
    'The log confirms it — an intern ran DROP TABLE orders at 14:02 and the app is 500-ing on relation "orders" does not exist.',
    'Read `~/db/snapshots.txt` and pick the NEWEST snapshot from BEFORE 14:02: rds:prod-db-2026-07-10-06-00 (the manual 14:10 one was taken after the drop — the table is already gone in it).',
    'Restore it, then verify: `aws rds restore-db-instance-from-db-snapshot --db-instance-identifier prod-db-restored --db-snapshot-identifier rds:prod-db-2026-07-10-06-00`, then `psql -c "select count(*) from orders;"`.',
  ],
};

export default week8DatabaseRecovery;

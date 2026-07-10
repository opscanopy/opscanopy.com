/**
 * Mission — Week 12: "Terraform Trouble" (a config-only ORDERED two-step fix).
 *
 * Day 80, tf-runner. A teammate ran `terraform apply` from their laptop. The
 * run left TWO problems behind: an abandoned state lock (ID 7f3a9b2c — the
 * laptop process never released it), and drift — someone hand-shrank
 * aws_instance.web in the AWS console (m5.large → t3.micro), so the live world
 * no longer matches the checked-in config. The next apply must reconcile the
 * drift, but it cannot even start while the stale lock is held.
 *
 * Orient (read the plan → the drift on instance_type) → diagnose (read the
 * error log → the state lock is what blocks apply) → RELEASE the lock →
 * THEN apply. Order matters: apply-before-unlock is the classic mistake.
 *
 * Two engine facts this mission proves:
 *   1. ORDERING via flag guards, with NO soft-lock. `terraform apply` before the
 *      unlock falls to an `out` PRECONDITION line ("Cannot apply: the state is
 *      still locked …") that carries NO effect — so `applied` stays false, the
 *      command is fully retryable, and nothing is falsely credited. The apply
 *      success response is guarded on `flag: unlocked`, so it can only fire once
 *      the lock is actually gone. Idempotent already-done guards come BEFORE the
 *      success responses, so re-runs say "already released" / "No changes".
 *   2. Live-query diagnostics are gated on the pre-fix flag. `terraform plan`
 *      shows the drift only while `applied` is false; once the apply reconciles
 *      it, plan tells the honest post-fix truth ("No changes"). `terraform state
 *      list` is state-independent (the resource is tracked either way), so it is
 *      not gated. Neither diagnostic carries an effect.
 *
 * The remediation objectives are state-based only: obj 3 `flagSet: unlocked`,
 * obj 4 `flagIs: { applied: true }`. The two read/orient objectives fire on the
 * READ-ONLY verbs cat/grep via outputMatched, so terraform's own output can
 * never falsely credit them.
 *
 * NOTE: dormant — deliberately NOT registered in the live mission registry.
 */
import type { MissionConfig } from '../types';

const planTxt = [
  'Terraform used the selected providers to generate the following execution plan.',
  'Resource actions are indicated with the following symbols:',
  '  ~ update in-place',
  '',
  'Terraform will perform the following actions:',
  '',
  '  # aws_instance.web will be updated in-place',
  '  ~ resource "aws_instance" "web" {',
  '        id            = "i-0abc123def4567890"',
  '      ~ instance_type = "t3.micro" -> "m5.large"   # someone hand-shrank this in the console',
  '        # (the config says m5.large; the live instance is t3.micro)',
  '    }',
  '',
  'Plan: 0 to add, 1 to change, 0 to destroy.',
].join('\n');

const errorsLog = [
  '2026-07-10 13:58:02 [INFO]  terraform apply invoked on tf-runner (pipeline run #412)',
  '2026-07-10 13:58:03 [ERROR] Error: Error acquiring the state lock',
  '2026-07-10 13:58:03 [ERROR] Error message: ConditionalCheckFailedException — the lock is already held',
  '2026-07-10 13:58:03 [ERROR] Lock Info:',
  '2026-07-10 13:58:03 [ERROR]   ID:        7f3a9b2c',
  '2026-07-10 13:58:03 [ERROR]   Who:       teammate@laptop',
  '2026-07-10 13:58:03 [ERROR]   Created:   2026-07-10 11:24:16 UTC',
  '2026-07-10 13:58:03 [ERROR]   Info:      apply run from a laptop — the process died and never released it',
  '2026-07-10 13:58:03 [ERROR] Terraform acquires a state lock to protect the state from concurrent writes.',
].join('\n');

const mainTf = [
  '# managed by the platform repo — do NOT hand-edit live infra to match this;',
  '# reconcile with `terraform apply` instead.',
  'resource "aws_instance" "web" {',
  '  ami           = "ami-0abc123def4567890"',
  '  instance_type = "m5.large"',
  '',
  '  tags = {',
  '    Name = "opscanopy-web"',
  '  }',
  '}',
].join('\n');

export const week12TerraformTrouble: MissionConfig = {
  id: 'week12-terraform-trouble',
  title: 'Terraform Trouble',
  week: 12,
  unlockAfterDay: 80,
  promptUser: 'student',
  promptHost: 'tf-runner',
  optimalCommands: 6,

  story: [
    '10:20 AM. The pipeline is red on tf-runner and the change it was supposed to ship — ' +
      'resizing the web instance back to its intended type — never landed. A teammate got ' +
      'impatient last night and ran `terraform apply` straight from their laptop.',
    'That laptop run left two messes. First, the process died mid-run and never released ' +
      'the state lock (ID 7f3a9b2c), so every apply since is refused before it starts. ' +
      'Second, someone hand-shrank aws_instance.web in the AWS console, so the live world ' +
      'has drifted away from the checked-in config.',
    'Everything you need is in ~/infra: the plan, the error log, and the config. Read the ' +
      'drift, find what is blocking apply, release the stale lock, and THEN reconcile — in ' +
      'that order. Type `help` to see what this terminal can do.',
  ],

  filesystem: {
    '~': {
      infra: {
        'plan.txt': planTxt,
        'errors.log': errorsLog,
        'main.tf': mainTf,
      },
    },
  },

  // A CI runner box: no app runs here. The Terraform state + AWS live behind the
  // scripted `terraform` verb, NOT this process table.
  processes: [
    { pid: 1, user: 'root', cpu: 0.0, mem: 0.1, command: 'systemd' },
    { pid: 470, user: 'root', cpu: 0.0, mem: 0.2, command: 'sshd' },
    { pid: 1580, user: 'student', cpu: 0.0, mem: 0.3, command: 'bash' },
  ],

  supportedCommands: [
    'pwd', 'ls', 'cd', 'cat', 'grep', 'ps', 'help', 'hint', 'clear', 'terraform',
  ],

  // Initial state flags. The unlock flips `unlocked`; the apply flips `applied`.
  flags: { unlocked: false, applied: false },

  // ── Config-authored `terraform` verb (zero domain logic in the engine) ─────
  commands: {
    terraform: {
      oneLiner:
        'inspect + reconcile infra (terraform plan, terraform state list, terraform force-unlock <id>, terraform apply)',
      // FIRST MATCH WINS. Order encodes the whole story:
      //   1. force-unlock idempotent (unlocked) — re-run says "already released"
      //   2. force-unlock SUCCESS (the lock id) — the only unlock effect
      //   3. apply idempotent (applied) — re-run says "No changes"
      //   4. apply SUCCESS (guarded on unlocked) — the only reconcile effect
      //   5. apply PRECONDITION (still locked) — out, NO effect, no soft-lock
      //   6. plan drift (gated on applied=false) — live diagnostic, no effect
      //   6b. plan post-fix (applied) — honest "No changes", no effect
      //   7. state list — state-independent diagnostic, no effect
      responses: [
        // 1. Idempotent unlock: the lock is already gone. No effect. Must come
        //    BEFORE the success response so a re-run is honest, not a re-unlock.
        {
          match: { args: ['force-unlock'], flag: { name: 'unlocked' } },
          output: ['The state lock has already been released. Nothing to unlock.'],
        },
        // 2. THE FIRST FIX: release the abandoned lock. Only the real lock id
        //    matches; a bare `force-unlock` with no/other id falls to default.
        //    Player-typed extra tokens are ignored — we match the fixed id token.
        {
          match: { args: ['force-unlock'], argIncludes: '7f3a9b2c' },
          outKind: 'sys',
          output: [
            'Terraform state lock released (ID 7f3a9b2c).',
            'The abandoned lock from the laptop run is gone — apply can proceed now.',
          ],
          effect: {
            setFlags: { unlocked: true },
            // append-only: preserves the "acquiring the state lock" evidence
            appendFiles: {
              '~/infra/errors.log':
                '2026-07-10 14:03:11 [INFO]  lock 7f3a9b2c released by student@tf-runner',
            },
          },
        },
        // 3. Idempotent apply: state already reconciled. No effect. BEFORE success.
        {
          match: { args: ['apply'], flag: { name: 'applied' } },
          output: ['No changes. Infrastructure matches configuration — nothing left to apply.'],
        },
        // 4. THE SECOND FIX: reconcile drift. GUARDED on `unlocked` so it can only
        //    fire once the lock is released. Player-typed flags are ignored.
        {
          match: { args: ['apply'], flag: { name: 'unlocked' } },
          outKind: 'sys',
          output: [
            'Acquiring state lock...',
            'aws_instance.web: Modifying... [id=i-0abc123def4567890]',
            'aws_instance.web: Modifications complete after 41s',
            'Apply complete! Resources: 0 added, 1 changed, 0 destroyed. aws_instance.web restored to m5.large.',
          ],
          effect: {
            setFlags: { applied: true },
            // append-only: keep the whole incident trail in one place
            appendFiles: {
              '~/infra/errors.log':
                '2026-07-10 14:04:52 [INFO]  apply complete — 1 changed (aws_instance.web -> m5.large)',
            },
            // overwrite a separate human-readable status marker (not read as evidence)
            writeFiles: { '~/infra/status': 'OK — reconciled (lock released, drift applied)' },
          },
        },
        // 5. PRECONDITION (not err): apply attempted while the lock is still held.
        //    `out`, NO effect — `applied` stays false, fully retryable, no
        //    soft-lock, no false credit. Deliberately avoids the literal
        //    "state lock" (obj 2 string) and "instance_type" (obj 1 string).
        {
          match: { args: ['apply'] },
          output: [
            'Cannot apply: the state is still locked. Release it first with `terraform force-unlock 7f3a9b2c`.',
          ],
        },
        // 6. Live-query drift diagnostic — gated on the pre-fix flag so it never
        //    keeps claiming a pending change after the apply reconciled it.
        {
          match: { args: ['plan'], flag: { name: 'applied', equals: false } },
          output: [
            'aws_instance.web: Refreshing state... [id=i-0abc123def4567890]',
            '  ~ resource "aws_instance" "web" {',
            '      ~ instance_type = "t3.micro" -> "m5.large"   # drift: hand-changed in the console',
            '    }',
            'Plan: 0 to add, 1 to change, 0 to destroy.',
          ],
        },
        // 6b. Post-fix plan: the drift is gone. Honest "No changes".
        {
          match: { args: ['plan'] },
          output: [
            'aws_instance.web: Refreshing state... [id=i-0abc123def4567890]',
            'No changes. Your infrastructure matches the configuration.',
          ],
        },
        // 7. State-independent diagnostic: the resource is tracked either way.
        {
          match: { args: ['state', 'list'] },
          output: ['aws_instance.web'],
        },
      ],
      default: {
        output: [
          'usage: terraform plan | terraform state list | terraform force-unlock <id> | terraform apply',
        ],
      },
    },
  },

  objectives: [
    {
      id: 1,
      text: 'Read what plan will change',
      trigger: { cmd: ['cat', 'grep'], when: { outputMatched: 'instance_type' } },
      successLine:
        'The plan wants to change instance_type back to m5.large — the live instance drifted to t3.micro.',
    },
    {
      id: 2,
      text: 'Find why apply will not run',
      trigger: { cmd: ['cat', 'grep'], when: { outputMatched: 'state lock' } },
      successLine:
        'There it is — apply is refused acquiring the state lock the laptop run abandoned (ID 7f3a9b2c).',
    },
    {
      id: 3,
      text: 'Release the abandoned lock',
      trigger: { cmd: 'terraform', when: { flagSet: 'unlocked' } },
      successLine: 'Stale lock released — apply is unblocked. Now reconcile.',
    },
    {
      id: 4,
      text: 'Reconcile state with reality',
      trigger: { cmd: 'terraform', when: { flagIs: { name: 'applied', value: true } } },
      successLine: 'Apply complete — aws_instance.web is back to m5.large. State matches reality again.',
    },
  ],

  hints: [
    'Everything is in ~/infra. `terraform plan` (or `cat ~/infra/plan.txt`) shows the drift — instance_type was hand-changed in the console.',
    'Read `~/infra/errors.log`: apply is blocked because a laptop run left a stale state lock behind (Lock ID 7f3a9b2c).',
    'You cannot apply through a held lock — release it first with `terraform force-unlock 7f3a9b2c`.',
    'Order matters: release the lock with `terraform force-unlock 7f3a9b2c`, THEN reconcile with `terraform apply`.',
  ],
};

export default week12TerraformTrouble;

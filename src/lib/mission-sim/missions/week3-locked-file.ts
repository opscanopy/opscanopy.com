/**
 * Mission — Week 3: "Locked Out" (a NON-kill remediation, config-only).
 *
 * 09:15 AM. No runaway process this time. An hour ago someone redeployed the
 * delivery pipeline; a `git` checkout reset file modes, and ~/deploy/deploy.sh
 * lost its execute bit. Cron still fires every 5 minutes and still fails —
 * `/bin/sh: deploy.sh: Permission denied` — so no new build ever lands.
 *
 * Orient → read the cron log → confirm the schedule (crontab -l) → optionally
 * see what changed (git log) → FIX with `chmod +x ~/deploy/deploy.sh`.
 *
 * This mission proves the engine is config-only: the fix is a SCRIPTED command
 * with an immutable effect (setFlags + append-to-log + overwrite-status), NOT
 * a special-cased kill. Objectives complete in ANY order; the append-only log
 * keeps the "Permission denied" evidence even after the fix, so a fix-first
 * player can still complete the read-the-evidence objective.
 *
 * NOTE: dormant — deliberately NOT registered in the live mission registry.
 */
import type { MissionConfig } from '../types';

const cronLog = [
  '2026-07-09 08:55:01 [INFO] cron: running ~/deploy/deploy.sh',
  '2026-07-09 08:55:01 [INFO] cron: deploy OK (exit 0)',
  '2026-07-09 09:00:02 [INFO] cron: running ~/deploy/deploy.sh',
  '2026-07-09 09:00:02 [ERROR] /bin/sh: ~/deploy/deploy.sh: Permission denied',
  '2026-07-09 09:00:02 [ERROR] cron: deploy FAILED (exit 126)',
  '2026-07-09 09:05:01 [ERROR] /bin/sh: ~/deploy/deploy.sh: Permission denied',
  '2026-07-09 09:05:01 [ERROR] cron: deploy FAILED (exit 126)',
  '2026-07-09 09:10:02 [ERROR] /bin/sh: ~/deploy/deploy.sh: Permission denied',
  '2026-07-09 09:10:02 [ERROR] cron: deploy FAILED (exit 126)',
  '2026-07-09 09:15:01 [WARN] release-bot: no successful deploy in 15 minutes',
].join('\n');

const deployScript = [
  '#!/bin/sh',
  '# redeploy the checkout service — invoked by cron every 5 minutes',
  'set -e',
  'echo "pulling latest build…"',
  'systemctl restart checkout.service',
  'echo "deploy complete"',
].join('\n');

const notes = [
  'prod-web-02 house rules — the night shift left these:',
  '',
  '- Deploys are automated: cron runs ~/deploy/deploy.sh every 5 minutes.',
  '- Cron writes everything to ~/logs/cron.log. When deploys stall, read it FIRST.',
  '- `crontab -l` shows the schedule. `git log` shows what changed recently.',
  '- This box is calm on purpose. The logs are the whole story.',
  '',
  '— M.',
].join('\n');

export const week3LockedFile: MissionConfig = {
  id: 'week3-locked-file',
  title: 'Locked Out',
  week: 3,
  unlockAfterDay: 21,
  promptUser: 'student',
  promptHost: 'prod-web-02',
  optimalCommands: 6,

  story: [
    '09:15 AM. Not a page this time — a Slack ping from the release bot: ' +
      '"checkout has not picked up a new build in 15 minutes." The box is up, the old ' +
      'build is serving fine, but every automated deploy is silently failing.',
    'An hour ago someone redeployed the delivery pipeline. Since then cron keeps firing ' +
      'right on schedule and cron keeps accomplishing nothing — the service never restarts.',
    'No process to kill today. Read the logs, confirm the schedule, and work out why the ' +
      'deploy script will not run. Type `help` to see what this terminal can do.',
  ],

  filesystem: {
    '~': {
      deploy: {
        'deploy.sh': deployScript,
        status: 'FAILING — deploy.sh exits 126 (Permission denied)',
      },
      logs: {
        'cron.log': cronLog,
      },
      'notes.txt': notes,
    },
  },

  // A calm box: checkout is up on the OLD build; the problem is deploys not landing.
  processes: [
    { pid: 1, user: 'root', cpu: 0.0, mem: 0.1, command: 'systemd' },
    { pid: 640, user: 'root', cpu: 0.0, mem: 0.2, command: 'sshd' },
    { pid: 703, user: 'root', cpu: 0.1, mem: 0.3, command: 'cron' },
    { pid: 1120, user: 'app', cpu: 0.4, mem: 4.1, command: 'node server.js' },
    { pid: 5000, user: 'student', cpu: 0.0, mem: 0.3, command: 'bash' },
  ],

  supportedCommands: [
    'pwd', 'ls', 'cd', 'cat', 'grep', 'ps', 'kill', 'chmod', 'git', 'crontab', 'help', 'hint', 'clear',
  ],

  // Initial state flags. The fix flips deployFixed → true.
  flags: { deployFixed: false },

  // ── Config-authored verbs (zero domain logic in the engine) ──────────────
  commands: {
    chmod: {
      oneLiner: 'change file mode bits (chmod +x <file>)',
      responses: [
        // Idempotent + honest: once fixed, say so and change nothing.
        {
          match: { flag: { name: 'deployFixed' } },
          output: ['chmod: ~/deploy/deploy.sh is already executable — deploys are flowing again.'],
        },
        // THE FIX: restore +x on the deploy script.
        {
          match: { argIncludes: 'deploy.sh', args: ['+x'] },
          output: [
            'chmod: restored the execute bit on ~/deploy/deploy.sh',
            'cron can run it now — the next 5-minute tick should redeploy.',
          ],
          effect: {
            setFlags: { deployFixed: true },
            // append-only: preserves the "Permission denied" evidence in the log
            appendFiles: {
              '~/logs/cron.log': '2026-07-09 09:20:03 [INFO] cron: ran ~/deploy/deploy.sh — deploy OK (exit 0)',
            },
            // overwrite the human-readable status marker (not read as evidence)
            writeFiles: { '~/deploy/status': 'OK — deploying on schedule (last run exit 0)' },
          },
        },
      ],
      default: {
        output: [
          'chmod: usage: chmod +x <file>',
          'The deploy script that lost its execute bit is ~/deploy/deploy.sh.',
        ],
      },
    },

    // Read-only git: `git log` shows the pipeline redeploy that reset modes.
    git: {
      oneLiner: 'inspect recent history (read-only: git log)',
      responses: [
        {
          match: { args: ['log'] },
          output: [
            'commit 9f2c1a7  (HEAD -> main)  chore: rebuild delivery pipeline',
            '    re-checked out deploy/ from origin — file modes reset to 0644 (lost +x)',
            'commit 4b7e302  fix: deploy.sh retry on transient restart failure',
            'commit 1a0d5e9  feat: nightly deploy via cron every 5 minutes',
          ],
        },
      ],
      default: { output: ['git: only read-only `git log` is available on this training box.'] },
    },

    // Read-only crontab: `crontab -l` confirms the 5-minute deploy schedule.
    crontab: {
      oneLiner: 'list scheduled jobs (crontab -l)',
      responses: [
        {
          match: { flags: ['-l'] },
          output: [
            '# m h  dom mon dow   command',
            '*/5 * * * * /bin/sh ~/deploy/deploy.sh >> ~/logs/cron.log 2>&1',
          ],
        },
      ],
      default: { output: ['crontab: usage: crontab -l  (read-only on this training box).'] },
    },
  },

  objectives: [
    {
      id: 1,
      text: 'Find where you are',
      trigger: { cmd: 'pwd', when: 'always' },
      successLine: 'Oriented. On a quiet box, the logs are the whole story.',
    },
    {
      id: 2,
      text: 'Look around',
      trigger: { cmd: 'ls', when: 'always' },
      successLine: 'A deploy directory and a logs directory. Start with the logs.',
    },
    {
      id: 3,
      text: 'Read why the deploy keeps failing',
      trigger: { cmd: ['cat', 'grep'], when: { outputMatched: 'Permission denied' } },
      successLine: 'There it is — cron cannot execute deploy.sh: Permission denied.',
    },
    {
      id: 4,
      text: 'Confirm the deploy schedule',
      trigger: { cmd: 'crontab', when: { outputMatched: 'deploy.sh' } },
      successLine: 'Confirmed — cron runs ~/deploy/deploy.sh every 5 minutes.',
    },
    {
      id: 5,
      text: 'Restore the execute bit',
      trigger: { cmd: 'chmod', when: { flagSet: 'deployFixed' } },
      successLine: 'Execute bit restored. The next cron tick will deploy — crisis over.',
    },
  ],

  hints: [
    'Start where every incident starts: `pwd`, then `ls` to see what is here.',
    'Deploys log to `~/logs/cron.log`. `cat` it — or `grep "Permission denied"` — to see why cron keeps failing.',
    'Confirm the job with `crontab -l`, then check what changed with `git log`. The pipeline redeploy reset file modes.',
    'The script lost its execute bit. Restore it: `chmod +x ~/deploy/deploy.sh`.',
  ],
};

export default week3LockedFile;

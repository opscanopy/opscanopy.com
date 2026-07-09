/**
 * Mission — Week 1: "Server Down!"
 *
 * 02:00 AM. PagerDuty fires: checkout is down on prod-web-01. A runaway
 * backup-script.sh (pid 4521, 94% CPU) has starved `node server.js`, which
 * crashed and is restart-looping. Orient → find the evidence in the log →
 * confirm with ps → kill 4521 → watch the recovery roll in.
 *
 * Objectives complete in ANY order (the HUD shows story order only) — a
 * kill-first speedrun must still be able to finish every objective.
 */
import type { MissionConfig } from '../types';

const serverLog = [
  '2026-02-03 01:41:07 [INFO] node server.js listening on :3000',
  '2026-02-03 01:44:12 [INFO] health check OK (12ms)',
  '2026-02-03 01:47:03 [INFO] checkout complete order=8123',
  '2026-02-03 01:49:55 [INFO] health check OK (14ms)',
  '2026-02-03 01:52:31 [INFO] nightly backup started (backup-script.sh)',
  '2026-02-03 01:53:02 [WARN] memory pressure rising: 78% used',
  '2026-02-03 01:53:40 [WARN] event loop lag 1200ms — something is hogging the CPU',
  '2026-02-03 01:54:11 [ERROR] worker starved, blocked by pid 4521 (backup-script.sh)',
  '2026-02-03 01:54:58 [ERROR] checkout request timed out order=8124',
  '2026-02-03 01:55:31 [ERROR] worker starved, blocked by pid 4521 (backup-script.sh)',
  '2026-02-03 01:56:04 [ERROR] health check FAILED (timeout)',
  '2026-02-03 01:56:47 [ERROR] worker starved, blocked by pid 4521 (backup-script.sh)',
  '2026-02-03 01:57:22 [ERROR] node server.js crashed (exit 137, out of memory)',
  '2026-02-03 01:58:01 [ERROR] restart attempt 1 failed — no CPU available',
  '2026-02-03 01:59:14 [ERROR] restart attempt 2 failed — no CPU available',
].join('\n');

const notes = [
  'Welcome to prod-web-01, rookie. House rules from the day shift:',
  '',
  '- The checkout app lives in ~/app and writes everything to ~/logs.',
  '- When something breaks at night, read ~/logs/server.log FIRST.',
  '- ps tells you what is actually running. Trust it over your feelings.',
  '',
  'Good luck out there. — M.',
].join('\n');

const serverJs = [
  '// checkout service — prod build',
  '// managed by systemd (checkout.service, Restart=always)',
  "const http = require('http');",
  'http.createServer(handleCheckout).listen(3000);',
].join('\n');

export const week1ServerDown: MissionConfig = {
  id: 'week1-server-down',
  title: 'Server Down!',
  week: 1,
  unlockAfterDay: 7,
  promptUser: 'student',
  promptHost: 'prod-web-01',
  optimalCommands: 7,

  story: [
    '02:00 AM. Your phone detonates on the nightstand: PagerDuty — CRITICAL — ' +
      'checkout is DOWN on prod-web-01. Every minute costs money, and tonight you are the on-call.',
    'You SSH in. The box is up, but the checkout app keeps dying before it can serve a ' +
      'single request. Something else on this machine is eating it alive.',
    'Find it. Kill it. Bring checkout back. Type `help` to see what this terminal can do.',
  ],

  filesystem: {
    '~': {
      app: {
        'server.js': serverJs,
        status: 'CRASHED — waiting for CPU',
      },
      logs: {
        'server.log': serverLog,
      },
      'notes.txt': notes,
    },
  },

  processes: [
    { pid: 1, user: 'root', cpu: 0.0, mem: 0.1, command: 'systemd' },
    { pid: 812, user: 'root', cpu: 0.0, mem: 0.2, command: 'sshd' },
    { pid: 2201, user: 'app', cpu: 0.0, mem: 1.5, command: 'node server.js', stat: 'crashed' },
    { pid: 4521, user: 'root', cpu: 94.2, mem: 22.4, command: 'backup-script.sh', stat: 'R' },
    { pid: 5000, user: 'student', cpu: 0.0, mem: 0.3, command: 'bash' },
  ],

  supportedCommands: ['pwd', 'ls', 'cd', 'cat', 'grep', 'ps', 'kill', 'help', 'hint', 'clear'],

  objectives: [
    {
      id: 1,
      text: 'Find where you are',
      trigger: { cmd: 'pwd', when: 'always' },
      successLine: 'You know where you stand. Orientation is step zero of every incident.',
    },
    {
      id: 2,
      text: 'Look around',
      trigger: { cmd: 'ls', when: 'always' },
      successLine: 'An app, its logs, and a note from the day shift. Logs rarely lie.',
    },
    {
      id: 3,
      text: 'Find the evidence',
      trigger: { cmd: ['cat', 'grep'], when: { outputMatched: '4521' } },
      successLine: 'There it is — the log points straight at pid 4521.',
    },
    {
      id: 4,
      text: 'Identify the culprit',
      trigger: { cmd: ['ps', 'cat', 'grep'], when: { outputMatched: 'backup-script' } },
      successLine: 'backup-script.sh is devouring the CPU. The app never stood a chance.',
    },
    {
      id: 5,
      text: 'Kill it',
      trigger: { cmd: 'kill', when: { killedPid: 4521 } },
      successLine: 'The runaway process is dead. Watch the recovery roll in…',
    },
  ],

  hints: [
    "Start by finding where you are (`pwd`) and what's here (`ls`).",
    'Logs live in `~/logs`. `cat` the log — or `grep ERROR` it.',
    'The log names a PID. Cross-check with `ps`.',
    '`kill 4521` — then look at the process list again.',
  ],

  onKill: [
    {
      pid: 4521,
      removeProcs: [4521],
      addProcs: [{ pid: 2310, user: 'app', cpu: 2.1, mem: 3.2, command: 'node server.js' }],
      writeFiles: { '~/app/status': 'OK — serving traffic' },
    },
  ],
};

export default week1ServerDown;

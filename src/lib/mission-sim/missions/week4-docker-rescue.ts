/**
 * Mission — Week 4: "Docker Rescue" (a config-only stack bring-up).
 *
 * Day 28, prod-web-04, a freshly-provisioned host. Someone kicked the app off
 * with a bare `docker run opscanopy/web` instead of standing up the whole
 * stack. The web container has no database to talk to, so it crash-loops:
 * `connect ECONNREFUSED db:5432` … `retrying in 5s` … exit … restart, forever.
 *
 * The repo's ~/app/docker-compose.yml already wires web + db + a shared network
 * + a pgdata volume correctly — web `depends_on` db. The fix is not a source
 * edit; it is running the stack the way it was designed to run.
 *
 * Orient (ls) → read the crash log (why web keeps dying: ECONNREFUSED db:5432)
 * → read the compose file (how the stack is meant to run: depends_on) →
 * FIX with `docker compose up -d`.
 *
 * Proves the engine is config-only: `docker` is a SCRIPTED verb whose
 * `compose up` response carries an immutable effect (setFlags + add the two
 * containers to the process table + append a success line to the web log +
 * write a status marker). Objectives complete in ANY order; the append-only
 * log keeps the ECONNREFUSED evidence even after the fix, so a fix-first player
 * can still complete the read-the-evidence objective.
 *
 * NOTE: dormant — deliberately NOT registered in the live mission registry.
 */
import type { MissionConfig } from '../types';

const compose = [
  'services:',
  '  web:',
  '    image: opscanopy/web:latest',
  '    build: .',
  '    ports:',
  '      - "3000:3000"',
  '    environment:',
  '      - DATABASE_URL=postgres://app:app@db:5432/opscanopy',
  '    depends_on:',
  '      - db',
  '    networks:',
  '      - appnet',
  '  db:',
  '    image: postgres:16',
  '    environment:',
  '      - POSTGRES_USER=app',
  '      - POSTGRES_PASSWORD=app',
  '      - POSTGRES_DB=opscanopy',
  '    volumes:',
  '      - pgdata:/var/lib/postgresql/data',
  '    networks:',
  '      - appnet',
  '',
  'networks:',
  '  appnet:',
  '',
  'volumes:',
  '  pgdata:',
].join('\n');

const dockerfile = [
  'FROM node:20-alpine',
  'WORKDIR /app',
  'COPY package*.json ./',
  'RUN npm ci --omit=dev',
  'COPY . .',
  'EXPOSE 3000',
  'CMD ["node", "server.js"]',
].join('\n');

const webLog = [
  '2026-07-10 09:02:11 [INFO] opscanopy/web starting — node server.js',
  '2026-07-10 09:02:11 [INFO] connecting to database db:5432 …',
  '2026-07-10 09:02:11 [ERROR] connect ECONNREFUSED db:5432',
  '2026-07-10 09:02:11 [WARN] database unreachable — retrying in 5s',
  '2026-07-10 09:02:16 [ERROR] connect ECONNREFUSED db:5432',
  '2026-07-10 09:02:16 [WARN] database unreachable — retrying in 5s',
  '2026-07-10 09:02:21 [ERROR] connect ECONNREFUSED db:5432',
  '2026-07-10 09:02:21 [WARN] database unreachable — retrying in 5s',
  '2026-07-10 09:02:26 [FATAL] no database after 3 attempts — exiting',
  '2026-07-10 09:02:26 [INFO] container exited (code 1) — Docker will restart it',
].join('\n');

export const week4DockerRescue: MissionConfig = {
  id: 'week4-docker-rescue',
  title: 'Docker Rescue',
  week: 4,
  unlockAfterDay: 28,
  promptUser: 'student',
  promptHost: 'prod-web-04',
  optimalCommands: 5,

  story: [
    '11:40 AM. A fresh host, prod-web-04, just came online and the on-call for the ' +
      'launch pinged you: the web app is up-and-down, up-and-down — the health check ' +
      'never stays green for more than a few seconds.',
    'Whoever bootstrapped the box ran a bare `docker run opscanopy/web` to "just get it ' +
      'serving." One container, no database, no network. The web container keeps starting, ' +
      'failing to reach its database, dying, and being restarted.',
    'The repo already has a docker-compose.yml that wires the whole stack correctly — you ' +
      'do not need to touch a single line of source. Read the logs, read the compose file, ' +
      'and bring the stack up the way it was designed. Type `help` to see what this terminal can do.',
  ],

  filesystem: {
    '~': {
      app: {
        'docker-compose.yml': compose,
        Dockerfile: dockerfile,
        status: 'DEGRADED — web container restarting, db never started',
      },
      logs: {
        'web.log': webLog,
      },
    },
  },

  // Host-level processes only. The app runs in containers, which are surfaced
  // by the scripted `docker ps`, NOT by this table.
  processes: [
    { pid: 1, user: 'root', cpu: 0.0, mem: 0.1, command: 'systemd' },
    { pid: 512, user: 'root', cpu: 0.0, mem: 0.2, command: 'sshd' },
    { pid: 2200, user: 'student', cpu: 0.0, mem: 0.3, command: 'bash' },
  ],

  supportedCommands: [
    'pwd', 'ls', 'cd', 'cat', 'grep', 'ps', 'help', 'hint', 'clear', 'docker',
  ],

  // Initial state flags. The fix flips stackUp → true.
  flags: { stackUp: false },

  // ── Config-authored `docker` verb (zero domain logic in the engine) ───────
  commands: {
    docker: {
      oneLiner: 'inspect and run containers (docker ps -a, docker logs web, docker compose up -d)',
      // First match wins. Diagnostics first (safe, no effect), then the
      // idempotent already-up guard, then the fix.
      responses: [
        // `docker ps -a` — the diagnostic table: only web, stuck Restarting, no db.
        // Gated on the pre-fix state: once stackUp flips true this falls through to
        // the honest "already up" line below (docker ps -a is a LIVE query — it must
        // never keep claiming the crash loop after the stack is running).
        {
          match: { args: ['ps'], flags: ['-a'], flag: { name: 'stackUp', equals: false } },
          output: [
            'CONTAINER ID   IMAGE                  COMMAND             STATUS                     PORTS     NAMES',
            'e3f1a9c22b04   opscanopy/web:latest   "node server.js"    Restarting (1) 3s ago                web',
            'Only one container, and it will not stay up. There is no db container at all.',
          ],
        },
        // `docker logs web` — mirror the crash-loop reason (pre-fix only, same reason).
        {
          match: { args: ['logs', 'web'], flag: { name: 'stackUp', equals: false } },
          output: [
            'connecting to database db:5432 …',
            'connect ECONNREFUSED db:5432',
            'database unreachable — retrying in 5s',
            'connect ECONNREFUSED db:5432',
            'no database after 3 attempts — exiting',
            'container exited (code 1) — Docker will restart it',
          ],
        },
        // Idempotent + honest: once the stack is up, say so and change nothing.
        {
          match: { flag: { name: 'stackUp' } },
          output: ['stack already up — web healthy on :3000, db accepting connections. Nothing to do.'],
        },
        // THE FIX: bring up the whole stack (matches `docker compose up -d`).
        {
          match: { args: ['compose', 'up'] },
          outKind: 'sys',
          output: [
            '[+] Running 4/4',
            ' ✔ Network app_appnet   Created',
            ' ✔ Volume app_pgdata    Created',
            ' ✔ Container app-db-1    Started',
            ' ✔ Container app-web-1   Started',
            'web  | connected to db:5432 OK — listening on :3000',
            'The stack is up: web found db over the shared network. The crash loop is over.',
          ],
          effect: {
            setFlags: { stackUp: true },
            // Bring the two containers onto the process table as running services.
            addProcs: [
              { pid: 3090, user: 'postgres', cpu: 0.3, mem: 8.4, command: 'postgres', stat: 'S' },
              { pid: 3120, user: 'app', cpu: 0.6, mem: 5.2, command: 'node server.js', stat: 'S' },
            ],
            // append-only: preserves the ECONNREFUSED evidence in the web log
            appendFiles: {
              '~/logs/web.log': '2026-07-10 09:20:03 [INFO] connected to db:5432 OK — listening on :3000',
            },
            // overwrite the human-readable status marker (not read as evidence)
            writeFiles: { '~/app/status': 'OK — stack up (web + db healthy)' },
          },
        },
      ],
      default: {
        output: ['unknown docker subcommand. Try: docker ps -a, docker logs web, docker compose up -d.'],
      },
    },
  },

  objectives: [
    {
      id: 1,
      text: 'Look around',
      trigger: { cmd: 'ls', when: 'always' },
      successLine: 'An app directory and a logs directory. Two places worth reading before you touch anything.',
    },
    {
      id: 2,
      text: 'Find why the container keeps dying',
      trigger: { cmd: ['cat', 'grep'], when: { outputMatched: 'ECONNREFUSED db:5432' } },
      successLine: 'There it is — web cannot reach its database: connect ECONNREFUSED db:5432.',
    },
    {
      id: 3,
      text: 'Learn how the stack is meant to run',
      trigger: { cmd: ['cat', 'grep'], when: { outputMatched: 'depends_on' } },
      successLine: 'The compose file wires it all up — web depends_on a db that was never started.',
    },
    {
      id: 4,
      text: 'Bring the whole stack up',
      trigger: { cmd: 'docker', when: { flagSet: 'stackUp' } },
      successLine: 'Stack up — web connected to db over the shared network. Crash loop over.',
    },
  ],

  hints: [
    'Start by looking around with `ls`, then read the crash log at `~/logs/web.log`.',
    'The log repeats `connect ECONNREFUSED db:5432` — the web app cannot reach its database.',
    'Read `~/app/docker-compose.yml`: web `depends_on` a db that was never started, and `docker ps -a` shows only the web container.',
    'Do not restart one container — bring up the whole stack: `docker compose up -d`.',
  ],
};

export default week4DockerRescue;

/**
 * Mission — Week 6: "Broken Pipeline" (a secrets-management remediation, config-only).
 *
 * Friday, 17:03. The release workflow went red. The `build` matrix is green on
 * both Node versions, the `tag-release` job only logged a harmless "tag already
 * exists" warning — but the `publish` job dies with
 * `Error: denied: authentication required`. The workflow names the secret it uses
 * (`secrets.REGISTRY_TOKEN`); that token was rotated this week and the new value
 * was never re-added to the repo secrets, so `docker login` fails and no image is
 * ever pushed. The log shows the FAILURE; the workflow shows WHICH SECRET — two
 * distinct evidence steps.
 *
 * Orient → read the failed run log → see which secret the publish job needs
 * (the workflow references `secrets.REGISTRY_TOKEN`; `gh secret list` shows it is
 * gone) → FIX by re-adding it with `gh secret set REGISTRY_TOKEN --body <token>`.
 *
 * The build matrix and the mistyped/duplicate tag are deliberate NOISE — the
 * single decisive fix is the rotated secret. The fix is a SCRIPTED `gh` command
 * with an immutable effect (setFlags + append-to-log + write a status file). The
 * append-only log keeps the "authentication required" evidence even after the
 * fix, so a fix-first player can still complete the read-the-evidence objective.
 *
 * The player types a token value after `--body`; it is a flag/value and is
 * IGNORED — the fix matches only the fixed arg tokens ["secret","set",
 * "REGISTRY_TOKEN"], never the secret the player types.
 *
 * NOTE: dormant — deliberately NOT registered in the live mission registry.
 */
import type { MissionConfig } from '../types';

const releaseLog = [
  '2026-07-09 17:02:10 [INFO] release #4471 triggered by push to main (tag v1.4.2)',
  '2026-07-09 17:02:12 [INFO] job build (matrix: node-18) started',
  '2026-07-09 17:02:48 [INFO] job build (matrix: node-18) succeeded',
  '2026-07-09 17:02:12 [INFO] job build (matrix: node-20) started',
  '2026-07-09 17:02:53 [INFO] job build (matrix: node-20) succeeded',
  '2026-07-09 17:03:01 [INFO] job tag-release started',
  '2026-07-09 17:03:02 [WARN] tag v1.4.2 already exists on origin — skipping tag push',
  '2026-07-09 17:03:04 [INFO] job tag-release succeeded (non-fatal warning above)',
  '2026-07-09 17:03:10 [INFO] job publish started — logging in to registry.example.com',
  '2026-07-09 17:03:11 [ERROR] docker login failed for registry.example.com (bad credentials)',
  '2026-07-09 17:03:11 [ERROR] Error: denied: authentication required',
  '2026-07-09 17:03:11 [ERROR] job publish FAILED (exit 1)',
  '2026-07-09 17:03:12 [ERROR] release #4471 conclusion: failure',
].join('\n');

const releaseWorkflow = [
  'name: release',
  'on:',
  "  push:",
  "    tags: ['v*']",
  'jobs:',
  '  build:',
  '    runs-on: ubuntu-latest',
  '    strategy:',
  '      matrix:',
  '        node: [18, 20]   # a build matrix — green on both, this is noise',
  '    steps:',
  '      - uses: actions/checkout@v4',
  '      - run: npm ci && npm run build',
  '  tag-release:',
  '    needs: build',
  '    runs-on: ubuntu-latest',
  '    steps:',
  '      - run: git tag v1.4.2 && git push origin v1.4.2   # warns if tag exists — noise',
  '  publish:',
  '    needs: [build, tag-release]',
  '    runs-on: ubuntu-latest',
  '    steps:',
  '      - name: Log in to the container registry',
  '        run: echo "${{ secrets.REGISTRY_TOKEN }}" | docker login registry.example.com -u ci --password-stdin',
  '      - name: Build and push image',
  '        run: docker push registry.example.com/app:v1.4.2',
].join('\n');

const notes = [
  'ci-runner-01 — release runner. On-call notes:',
  '',
  '- The release workflow lives at ~/project/.github/workflows/release.yml.',
  '- Every run is mirrored to ~/logs/release.log. When a release goes red, read it FIRST.',
  '- Repo secrets are managed with the `gh` CLI: `gh secret list`, `gh secret set <NAME>`.',
  '- We rotated the registry credentials this week. Double-check the secrets survived.',
  '',
  '— release-eng',
].join('\n');

export const week6BrokenPipeline: MissionConfig = {
  id: 'week6-broken-pipeline',
  title: 'Broken Pipeline',
  week: 6,
  unlockAfterDay: 40,
  promptUser: 'student',
  promptHost: 'ci-runner-01',
  optimalCommands: 5,

  story: [
    'Friday, 17:10. The release workflow went red an hour ago and the on-call ' +
      'channel is filling up: "v1.4.2 never shipped — nothing got pushed to the registry." ' +
      'The runner is healthy, the code is fine, but every release run fails at the same place.',
    'The `build` matrix passed on both Node versions and the `tag-release` job only logged a ' +
      'harmless "tag already exists" warning. Those are noise. One job actually fails — find it, ' +
      'read what it is complaining about, and work out what the pipeline is missing.',
    'No process to kill today. Read the run log, look at the workflow, and check the repo ' +
      'secrets. Type `help` to see what this terminal can do.',
  ],

  filesystem: {
    '~': {
      logs: {
        'release.log': releaseLog,
      },
      project: {
        '.github': {
          workflows: {
            'release.yml': releaseWorkflow,
          },
        },
      },
      'notes.txt': notes,
    },
  },

  // A calm runner: the box is up, only the release pipeline is broken.
  processes: [
    { pid: 1, user: 'root', cpu: 0.0, mem: 0.1, command: 'systemd' },
    { pid: 612, user: 'root', cpu: 0.0, mem: 0.2, command: 'sshd' },
    { pid: 4200, user: 'student', cpu: 0.0, mem: 0.3, command: 'bash' },
  ],

  supportedCommands: ['pwd', 'ls', 'cd', 'cat', 'grep', 'ps', 'gh', 'help', 'hint', 'clear'],

  // Initial state flags. The fix flips secretSet → true.
  flags: { secretSet: false },

  // ── Config-authored verbs (zero domain logic in the engine) ──────────────
  commands: {
    gh: {
      oneLiner: 'GitHub CLI — inspect runs and manage repo secrets (gh run list, gh secret list, gh secret set)',
      responses: [
        // Idempotent + honest: once the secret is set, say so and change nothing.
        {
          match: { flag: { name: 'secretSet' } },
          output: ['REGISTRY_TOKEN already set — last run #4472 green. Nothing to do.'],
        },
        // Diagnostic: the failed run shows up as a failure. No effect (safe for outputMatched).
        {
          match: { args: ['run', 'list'] },
          output: [
            'STATUS     TITLE            WORKFLOW  EVENT  ID      CONCLUSION',
            'completed  release v1.4.2   release   push   #4471   failure',
            'completed  release v1.4.1   release   push   #4468   success',
          ],
        },
        // Diagnostic: the secret list — REGISTRY_TOKEN is ABSENT (rotated, never re-added).
        {
          match: { args: ['secret', 'list'] },
          output: [
            'NAME              UPDATED',
            'DOCKERHUB_USER    2026-06-01',
            'SLACK_WEBHOOK     2026-06-14',
            'CODECOV_TOKEN     2026-05-20',
          ],
        },
        // THE FIX: re-add the rotated registry token. Player-typed value after
        // --body is ignored — we match only the fixed ["secret","set","REGISTRY_TOKEN"].
        {
          match: { args: ['secret', 'set', 'REGISTRY_TOKEN'] },
          outKind: 'sys',
          output: [
            'Set Actions secret REGISTRY_TOKEN.',
            'Re-running release... run #4472 succeeded, image pushed, v1.4.2 published.',
          ],
          effect: {
            setFlags: { secretSet: true },
            // append-only: preserves the "authentication required" evidence in the log
            appendFiles: {
              '~/logs/release.log':
                '2026-07-09 17:20:04 [INFO] release #4472 publish OK — image pushed, release v1.4.2 published',
            },
            // separate status file (not read as evidence by any objective)
            writeFiles: { '~/ci-status': 'OK — release green (run #4472, v1.4.2 published)' },
          },
        },
      ],
      default: {
        output: ['usage: gh run list | gh run view | gh secret set REGISTRY_TOKEN --body <token>'],
      },
    },
  },

  objectives: [
    {
      id: 1,
      text: 'Look around',
      trigger: { cmd: 'ls', when: 'always' },
      successLine: 'Oriented — a project checkout and the CI logs. Start with the run log.',
    },
    {
      id: 2,
      text: 'Find where the pipeline went red',
      trigger: { cmd: ['cat', 'grep'], when: { outputMatched: 'authentication required' } },
      successLine: 'There it is — the publish job failed: denied: authentication required.',
    },
    {
      id: 3,
      text: 'See which secret the publish job needs',
      trigger: { cmd: ['cat', 'grep'], when: { outputMatched: 'REGISTRY_TOKEN' } },
      successLine: 'The publish job authenticates with secrets.REGISTRY_TOKEN — that is the secret to check.',
    },
    {
      id: 4,
      text: 'Set the secret and re-run',
      trigger: { cmd: 'gh', when: { flagSet: 'secretSet' } },
      successLine: 'Secret re-added and the release re-ran green — image pushed, v1.4.2 published. Crisis over.',
    },
  ],

  hints: [
    'Start with `ls`, then read the failed run log at ~/logs/release.log.',
    'It ends in "denied: authentication required" — an auth failure in the publish job, not the build matrix or the tag warning.',
    'The workflow at ~/project/.github/workflows/release.yml references secrets.REGISTRY_TOKEN; `gh secret list` shows it is missing — the token was rotated and never re-added.',
    'Re-add it and the run goes green: `gh secret set REGISTRY_TOKEN --body <token>`.',
  ],
};

export default week6BrokenPipeline;

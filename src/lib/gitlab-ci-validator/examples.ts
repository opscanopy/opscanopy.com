/**
 * GitLab CI Validator — bundled, runnable examples for the playground.
 *
 * Real `.gitlab-ci.yml` shapes drawn from GitLab's own documentation, chosen to
 * exercise the engine end-to-end:
 *   (a) `clean`       — stages + jobs + rules + needs, structurally sound → 0 errors.
 *   (b) `extends`     — `extends:` reuse against a hidden `.template` → 0 errors.
 *   (c) `undefined-stage` — a job whose `stage` is not in `stages:` (ERROR).
 *   (d) `bad-needs`   — `needs:` / `extends:` pointing at missing jobs (ERRORs).
 *   (e) `no-script`   — a job with no script/run/trigger/extends + legacy only/except.
 *   (f) `bad-when`    — an invalid `when:` value + a non-list `rules:`.
 *
 * Each example is valid YAML so users can copy, edit, and re-run from a known
 * baseline. Comments call out exactly which rule each block trips.
 */

export interface GitlabCiExample {
  /** Stable id used by the playground selector. */
  id: string;
  /** Short human label for the example tab. */
  label: string;
  /** The `.gitlab-ci.yml` source. */
  yaml: string;
}

/* (a) ─ CLEAN ─────────────────────────────────────────────────────────────────
 *
 * Should produce NO findings: declared stages, every job has a script and a
 * valid stage, `needs:` references a real job, `rules:` is a list.
 */
const clean: GitlabCiExample = {
  id: 'clean',
  label: 'Clean pipeline',
  yaml: `stages:
  - build
  - test
  - deploy

default:
  image: node:20

build-job:
  stage: build
  script:
    - npm ci
    - npm run build

test-job:
  stage: test
  needs:
    - build-job
  script:
    - npm test

deploy-job:
  stage: deploy
  needs:
    - test-job
  rules:
    - if: '$CI_COMMIT_BRANCH == "main"'
  script:
    - ./deploy.sh
`,
};

/* (b) ─ EXTENDS / TEMPLATE ─────────────────────────────────────────────────────
 *
 * A hidden `.template` (leading dot) extended by two real jobs — the canonical
 * GitLab DRY pattern. Should produce NO findings.
 */
const extendsTemplate: GitlabCiExample = {
  id: 'extends',
  label: 'extends + template',
  yaml: `stages:
  - test

.tests:
  stage: test
  image: ruby:3.3
  script:
    - bundle install
    - bundle exec rake test

rspec:
  extends: .tests
  script:
    - bundle exec rspec

rubocop:
  extends: .tests
  script:
    - bundle exec rubocop
`,
};

/* (c) ─ UNDEFINED STAGE ────────────────────────────────────────────────────────
 *
 * Trips:
 *   • stage-not-declared (ERROR) — `release` stage is not in `stages:`.
 */
const undefinedStage: GitlabCiExample = {
  id: 'undefined-stage',
  label: 'Undefined stage',
  yaml: `stages:
  - build
  - test

build-job:
  stage: build
  script:
    - make build

# This job's stage "release" is NOT in the stages list above.
release-job:
  stage: release
  script:
    - make release
`,
};

/* (d) ─ BAD needs / extends ────────────────────────────────────────────────────
 *
 * Trips:
 *   • needs-unknown-job   (ERROR) — needs a job that does not exist.
 *   • extends-unknown-target (ERROR) — extends a missing template.
 */
const badNeeds: GitlabCiExample = {
  id: 'bad-needs',
  label: 'Broken needs / extends',
  yaml: `stages:
  - build
  - test

build:
  stage: build
  script:
    - make

# "compile" is not a job in this pipeline.
test:
  stage: test
  needs:
    - compile
  script:
    - make test

# ".base" template is never defined.
lint:
  stage: test
  extends: .base
  script:
    - make lint
`,
};

/* (e) ─ NO SCRIPT + legacy only/except ─────────────────────────────────────────
 *
 * Trips:
 *   • job-missing-script (ERROR) — `empty-job` does nothing.
 *   • legacy-only-except (INFO)  — `old-job` uses only/except.
 */
const noScript: GitlabCiExample = {
  id: 'no-script',
  label: 'Missing script',
  yaml: `stages:
  - test

# This job defines no script / run / trigger / extends — GitLab rejects it.
empty-job:
  stage: test

old-job:
  stage: test
  only:
    - main
  script:
    - echo "legacy filtering"
`,
};

/* (f) ─ BAD when + non-list rules ──────────────────────────────────────────────
 *
 * Trips:
 *   • invalid-when   (ERROR) — `when: sometimes` is not allowed.
 *   • rules-not-list (ERROR) — `rules:` is a mapping, not a list.
 */
const badWhen: GitlabCiExample = {
  id: 'bad-when',
  label: 'Invalid when / rules',
  yaml: `stages:
  - deploy

deploy:
  stage: deploy
  when: sometimes
  rules:
    if: '$CI_COMMIT_TAG'
  script:
    - ./deploy.sh
`,
};

export const examples: GitlabCiExample[] = [
  clean,
  extendsTemplate,
  undefinedStage,
  badNeeds,
  noScript,
  badWhen,
];

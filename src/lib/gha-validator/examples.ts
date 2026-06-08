/**
 * GitHub Actions Validator — bundled, runnable examples for the playground.
 *
 * Three workflows that exercise the engine end-to-end:
 *   (a) `vulnerable`  — deliberately insecure; trips multiple ERROR/WARNING rules.
 *   (b) `secure`      — pinned, least-privilege, structurally sound; zero findings.
 *   (c) `subtle`      — structurally fine but with a couple of easy-to-miss issues.
 *
 * Each example is real GitHub Actions YAML so users can copy, edit, and re-run
 * from a known baseline. Comments call out exactly which rule each line trips.
 */

export interface GhaExample {
  /** Stable id used by the playground selector. */
  id: string;
  /** Short human label for the example tab. */
  label: string;
  /** The workflow YAML. */
  yaml: string;
}

/* (a) ─ VULNERABLE ────────────────────────────────────────────────────────────
 *
 * Trips, at minimum:
 *   • pull-request-target-checkout  (ERROR)   — pwn request
 *   • script-injection              (WARNING) — PR title into `run:`
 *   • unpinned-action               (WARNING) — third-party action on a tag
 *   • permissions-write-all         (WARNING) — over-broad token
 *   • secrets-in-pull-request       (INFO)    — secrets under pull_request_target
 */
const vulnerable: GhaExample = {
  id: 'vulnerable',
  label: 'Vulnerable workflow',
  yaml: `name: PR Build (insecure)

# pull_request_target runs with a privileged token AND secrets.
on:
  pull_request_target:
    types: [opened, synchronize]

# write-all grants the token every scope — far more than this job needs.
permissions: write-all

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      # Checking out the PR head under pull_request_target executes
      # attacker-controlled code with your write token: the "pwn request".
      - uses: actions/checkout@v4
        with:
          ref: \${{ github.event.pull_request.head.sha }}

      # The PR title is attacker-controlled and is interpolated straight into
      # the shell, so a crafted title can break out and run its own commands.
      - name: Greet the contributor
        run: echo "Thanks for the PR titled \${{ github.event.pull_request.title }}"

      # Third-party action pinned to a mutable tag, not a commit SHA.
      - uses: some-vendor/deploy-action@v2
        with:
          token: \${{ secrets.DEPLOY_TOKEN }}
`,
};

/* (b) ─ SECURE ────────────────────────────────────────────────────────────────
 *
 * Should produce NO findings:
 *   • triggers on push/pull_request (untrusted code, but no privileged token)
 *   • explicit least-privilege top-level permissions (contents: read)
 *   • all actions pinned to full commit SHAs
 *   • no untrusted context inside any `run:` block
 *   • no curl|bash, no secrets under the pull_request trigger
 */
const secure: GhaExample = {
  id: 'secure',
  label: 'Secure workflow',
  yaml: `name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

# Least privilege: read-only token by default.
permissions:
  contents: read

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      # Pinned to a full commit SHA (v4.1.7) — immutable and reviewable.
      - uses: actions/checkout@692973e3d937129bcbf40652eb9f2f61becf3332

      # Pinned to a full commit SHA (v4.0.3).
      - uses: actions/setup-node@1e60f620b9541d16bece96c5465dc8ee9832be0b
        with:
          node-version: '20'

      - name: Install dependencies
        run: npm ci

      - name: Run tests
        run: npm test
`,
};

/* (c) ─ SUBTLE ────────────────────────────────────────────────────────────────
 *
 * Structurally valid and not catastrophically insecure, but trips a couple of
 * warnings that are easy to overlook:
 *   • unpinned-action  (WARNING) — third-party action on @main (a branch!)
 *   • pipe-to-shell    (WARNING) — installs a tool via `curl … | bash`
 *   • permissions-missing (WARNING) — no top-level permissions declared
 */
const subtle: GhaExample = {
  id: 'subtle',
  label: 'Subtle warnings',
  yaml: `name: Release

on:
  push:
    tags: ['v*']

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      # Pinned action, good.
      - uses: actions/checkout@692973e3d937129bcbf40652eb9f2f61becf3332

      # Third-party action tracking a BRANCH — moves whenever main does.
      - uses: goreleaser/goreleaser-action@main
        with:
          version: latest

      # Installs a release tool by piping the network straight into a shell.
      - name: Install tooling
        run: curl -sSfL https://example.com/install.sh | bash
`,
};

export const examples: GhaExample[] = [vulnerable, secure, subtle];

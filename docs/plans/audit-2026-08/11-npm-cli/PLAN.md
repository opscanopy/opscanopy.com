# Point fix 11 — npm CLI parity: the engines leave the browser

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `npx @opscanopy/lint dockerfile ./Dockerfile` works in CI, powered by the *same* engine module the website runs — pilot with two engines (dockerfile-linter, gha-validator), then generalize.

**Why:** The platform audit's sharpest strategic point: engines are already pure TS with no DOM, but "nice, but I can't put this in CI, so I'll install hadolint anyway — and never come back." CI parity converts one-time visitors into daily users, and every `--help` and README links back to the site.

**Architecture:** A `packages/cli/` workspace inside this repo (npm workspaces — additive to the root `package.json`, site build untouched). The CLI imports engine sources directly via relative path + `tsup` bundling at publish time — engines stay where they are (`src/lib/<slug>/`), remain the single source of truth, and the site's vitest suite remains their test home. **No engine file moves in the pilot** — restructuring into a published `@opscanopy/engines` package is the post-pilot decision, taken only if a third consumer appears.

**Constraint discovered in audit, honored here:** engines return diagnostics and never throw; CLI exit codes map from finding severities, not exceptions.

### Task 1: workspace + pilot CLI (dockerfile-linter)

- [ ] **Step 1:** Root `package.json` gains `"workspaces": ["packages/*"]` (verify `npm run build`/`test` still resolve from root afterwards — Astro and vitest are unaffected by workspaces, but the lockfile reshapes: commit the lockfile change alone first so it's bisectable).
- [ ] **Step 2:** `packages/cli/package.json` — name `@opscanopy/lint`, `bin: {"opscanopy-lint": "dist/cli.js"}`, `type: module`, deps: none at runtime beyond what engines need (`js-yaml`), devDeps: `tsup`, `typescript`. Node engines field: `>=20`.
- [ ] **Step 3:** `packages/cli/src/cli.ts` — no arg-parser dependency; hand-rolled:

```
opscanopy-lint dockerfile <file> [--format json|text] [--strict] [--quiet]
opscanopy-lint gha <file...> [--format json|text]
Exit codes: 0 clean · 1 findings at error · 2 findings at warning only (flag --warn-ok to make 2→0) · 64 usage · 66 unreadable file
```

Text format mirrors the site's finding shape (`id`, severity, line, title, remediation); `--format json` emits the engine result verbatim (the contract: **the JSON is the engine's type, versioned by the package version**).
- [ ] **Step 4:** Import the engine relatively: `import { lint } from '../../../src/lib/dockerfile-linter/engine'` — confirm the engine has no `import.meta.env`/Vite-isms (grep it; if any exist, hoist them behind an options param in a site-side commit first). `tsup` bundles it standalone (`noExternal` for the relative sources).
- [ ] **Step 5: Tests** (`packages/cli/test/cli.test.ts`, vitest — root config picks it up or add a workspace config): run the built CLI via `node dist/cli.js` against fixture Dockerfiles (clean → exit 0; bad → exit 1 + finding ID in stdout; `--format json` parses and matches the engine's direct output byte-for-byte; missing file → 66 + message on stderr).
- [ ] **Step 6:** Commit `feat(cli): @opscanopy/lint pilot — dockerfile linting from the site's own engine`.

### Task 2: second engine + publish

- [ ] **Step 1:** Add the `gha` subcommand (post-plan-04 engine — ships cycles/matrix/reusable checks on day one). Multi-file: exit code is the max across files; text output groups by file.
- [ ] **Step 2:** README: install/usage, the exit-code table, a pre-commit snippet (`repos: - repo: local` hook calling `npx @opscanopy/lint`), a GitHub Actions step snippet, and the pitch line ("the same engine that runs at opscanopy.com/dockerfile-linter — in your CI"). Every subcommand's `--help` footer links its tool page.
- [ ] **Step 3:** Publish flow: manual `npm publish --access public` from a clean checkout for v0.1.0 (repo has no npm-publishing automation — don't build release CI for a pilot; add `publishConfig.provenance: true` only if publishing from a GH Action later). **Confirm the npm org/scope `@opscanopy` is registered before anything else in this plan — it's the one external dependency.** [BLOCKING-ASK: user must create/own the npm scope]
- [ ] **Step 4:** Site side: dockerfile-linter and gha-validator pages get a "Run this in CI" section with the npx one-liner (5 locales, one commit). The changelog announces it.
- [ ] **Step 5:** Commit `feat(cli): gha subcommand, docs, v0.1.0 publish`.

### Task 3: measure, then decide

- [ ] After 30 days: npm download counts vs the two tool pages' traffic (GA4 via the seo-ops agent's access). Decision recorded in this file: extend to relabel-tester/gitlab-ci (the next CI-shaped engines), extract `@opscanopy/engines` proper, or stop at two.

**Done when** `npx @opscanopy/lint dockerfile Dockerfile` exits 1 on a bad file in a clean container, both tool pages advertise it, and the 30-day checkpoint is calendared.

# Point fix 04 — GHA validator: validate where real workflows actually break

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `src/lib/gha-validator/engine.ts` catches the five failure classes a platform engineer meets weekly: `needs:` cycles, matrix/strategy mistakes, reusable-workflow hazards (`secrets: inherit` + `pull_request_target`), over-broad `permissions`, and the unpinned-`uses` scan's false positives.

**Architecture:** All children extend the existing single-file engine (985 lines) with new check functions following its established shape (`add({id, severity, title, detail, line, remediation})`, `findJobChildLine` line anchoring). No playground work — the playground already renders findings generically. Each child is one commit-sized check family with its own tests.

**Tech Stack:** Pure TS, js-yaml (already the engine's parser), Vitest.

**Verified evidence:**

- Zero hits for `cycle|matrix|strategy` in the whole engine; `needs:` check at `engine.ts:500` is set-membership only — `a→b→a` passes; GitHub rejects the file.
- `engine.ts:516` — `if (isReusable) return;` — reusable-workflow jobs exit before any check.
- `checkUnpinnedActions` at `:789-821` is a raw whole-file line scan that flags `uses:` inside `run: |` heredocs and `#` comments — the same engine documents why that's wrong at `:669-673` and does it anyway.
- `isWriteAll` at `:838` matches only the literal `write-all`; enumerated write-everything passes silently. The missing-permissions warning at `:852-878` is suppressed for the whole file if *any one* job declares permissions.
- `UNTRUSTED_CONTEXT_RE` at `:234` lacks `github.event.client_payload.*`, `github.event.inputs.*`, `github.event.workflow_run.head_branch`, `github.event.pull_request.head.repo.full_name`.

## Children (independent; suggested order by user pain)

| Child | Delivers | Ships alone? |
|-------|----------|--------------|
| [04a-needs-cycles.md](04a-needs-cycles.md) | Cycle detection over the `needs:` graph | Yes |
| [04b-matrix-strategy.md](04b-matrix-strategy.md) | `strategy.matrix` validation: undeclared vars, include/exclude shape, fail-fast/max-parallel types | Yes |
| [04c-reusable-workflows.md](04c-reusable-workflows.md) | Checks for `uses:`-jobs: ref pinning, `with:`/`secrets:` shape, `secrets: inherit` × `pull_request_target` warning | Yes |
| [04d-permissions.md](04d-permissions.md) | Enumerated-write-all detection, scope-name typos, per-job suppression fix | Yes |
| [04e-uses-scan-precision.md](04e-uses-scan-precision.md) | Unpinned-`uses` scan walks the parsed YAML (with line map) instead of raw lines | Yes |

## Shared test fixtures

Each child adds vectors to `src/lib/gha-validator/engine.test.ts` using real workflow YAML strings. Keep fixtures minimal-but-valid: every fixture must pass `js-yaml` parsing and represent a file GitHub would actually accept (except where the finding *is* "GitHub rejects this").

## Done when

- [ ] `a→b→a` produces `job-needs-cycle` (error) naming the cycle path.
- [ ] A matrix var referenced as `${{ matrix.foo }}` with no `foo` in the matrix produces a warning.
- [ ] `secrets: inherit` in a workflow with a `pull_request_target` trigger produces a security-severity finding.
- [ ] `permissions: {contents: write, id-token: write, packages: write, ...}` (enumerated write-all) is flagged like `write-all`.
- [ ] A `uses: actions/checkout@main` string inside a `run: |` block produces **no** finding.
- [ ] `npm run test` green; existing finding IDs and severities unchanged (the playground and any pinned tests depend on them).

**Feeds:** plan 11 (npm CLI) pilots with this engine — the deeper it is, the stronger the launch.

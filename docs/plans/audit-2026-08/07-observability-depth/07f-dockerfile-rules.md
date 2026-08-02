# 07f — dockerfile linter: pipefail, a strict profile, real DF009

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or superpowers:executing-plans. Checkbox steps.

**Goal:** Close the one "policy" that was actually a gap (pipefail — the pipe detector already exists), add a strict-profile toggle so orgs with digest-pinning mandates can use the tool as a policy check, and give DF009 value analysis via the shared secret patterns.

**Evidence:** `rules.ts:44-46` declines shell reasoning, but DF012 already finds pipes in `RUN` (`:694`) — detecting the pipe and not saying "exit codes vanish without pipefail" is a gap wearing a policy costume. `rules.ts:20-23`: digest pinning deliberately excluded with no stricter option. `SECRET_NAME_RE` at `:499` matches names only — `ENV DB_DSN=postgres://user:hunter2@db/app` passes.

**Files:**
- Modify: `src/lib/dockerfile-linter/rules.ts`, `engine.ts` (options plumb-through), `src/components/DockerfileLinterPlayground.astro` (profile chips)
- Test: `src/lib/dockerfile-linter/engine.test.ts` (or rules test file — match what exists)

### Task 1: DF015 pipefail

- [ ] **Step 1: Failing tests** — `RUN curl -f url | sh` with no preceding `SHELL` directive → `DF015` (warning): "a failing curl is swallowed by the pipe — the build succeeds with a broken image"; with `SHELL ["/bin/bash","-o","pipefail","-c"]` earlier in the *same stage* → silent; `RUN` with no pipe → silent; exec-form `RUN ["curl", …]` → silent (no shell, rule doesn't apply); Windows images (`SHELL ["cmd", …]` or `powershell`) → silent (pipefail is a bashism).
- [ ] **Step 2:** Implement using DF012's existing pipe detection (`:694`) + per-stage SHELL tracking (the multi-stage USER walk at `:576-591` shows the stage-state pattern — mirror it). Remediation text offers both fixes: the SHELL directive, or `set -o pipefail &&` inline (with the caveat that inline requires bash, not sh — Hadolint DL4006's exact nuance).
- [ ] **Step 3:** Remove the "no pipefail reasoning" line from the deliberately-silent block at `:44-46` — the list must stay true. Commit `feat(dockerfile-linter): DF015 — pipes without pipefail swallow failures`.

### Task 2: strict profile

- [ ] **Step 1: Failing tests** — `lint(src, {profile: 'strict'})`: `FROM node:22` → `DF016 require-digest` (error, strict only): "tags move — pin `node:22@sha256:…`"; default profile → unchanged behaviour byte-for-byte (pin a full default-profile result as a regression snapshot first). Strict also upgrades DF002's severity (tag missing) from its current level to error — read DF002's current shape and assert the delta explicitly.
- [ ] **Step 2:** Implement `profile: 'standard' | 'strict'` (default standard) through the engine façade; rules receive it as context. Keep the strict-only rule IDs in one block with a comment: strict = "policy-check mode: what a >100-engineer org mandates", standard = "what every image should do".
- [ ] **Step 3:** Playground: `Standard · Strict` chips (UX-contract pattern), persisted via tool-prefs; the deliberately-silent list on the page gains a strict-mode column. Commit `feat(dockerfile-linter): strict profile — digest pinning as an opt-in policy gate`.

### Task 3: DF009 value analysis

**Depends on:** plan 09a's `secret-patterns.ts` core if it has landed — import it; if not, import `looksSecret` from plan 01a (`src/lib/tool-state/last-input.ts`) and file a note to converge when 09a lands. One pattern list site-wide, or it drifts.

- [ ] **Step 1: Failing tests** — `ENV DB_DSN=postgres://user:hunter2@db/app` → DF009 fires (URL-embedded credential); `ARG NPM_TOKEN=npm_a1b2c3…` → fires (prefix match); `ENV PATH=/usr/local/bin:$PATH` → silent; `ARG NODE_VERSION=22` → silent; existing name-based vectors unchanged.
- [ ] **Step 2:** Implement: DF009 checks the *value* side with the shared patterns + a `://user:pass@` URL-credential regex; keep the name-based check (an `ENV AWS_SECRET_ACCESS_KEY` with a build-time placeholder is still worth flagging — different message: "even a placeholder trains the pattern; use --mount=type=secret").
- [ ] **Step 3:** Commit `feat(dockerfile-linter): DF009 inspects values — URL credentials and vendor token prefixes, shared pattern list`.

**Done when** the three rule families ship, the default profile is provably unchanged (snapshot), and the deliberately-silent list matches reality again. Page copy (rule table) updates in the same commits — five locales.

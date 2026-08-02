# 07e — GitLab CI validator: a security lane + three structural gaps

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or superpowers:executing-plans. Checkbox steps.

**Goal:** The validator whose GitHub sibling leads on security stops having zero security findings — plus `spec:` header-doc support (modern component templates currently produce bogus errors), needs-stage-order, and the rules-dead-job check its own prose already describes.

**Evidence:** all 21 finding IDs in `src/lib/gitlab-ci-validator/engine.ts` are shape checks; `GLOBAL_KEYWORDS` at `:141-152` lacks `spec` → a component template's `spec:` is classified as a job → false `job-missing-script`; `checkNeeds` at `:772` is membership-only (GitLab errors on needing a later stage); the `rules`+`only` conflict is described in prose at `:758` but never emitted.

**Files:**
- Modify: `src/lib/gitlab-ci-validator/engine.ts`
- Test: `src/lib/gitlab-ci-validator/engine.test.ts`

### Task 1: `spec:` header documents

- [ ] **Step 1: Failing test** — a two-document file (`spec:\n  inputs:\n    stage:\n---\njob: {script: echo}` ) validates with zero `job-missing-script` findings and an info note "CI component template detected — `$[[ inputs.* ]]` interpolation is not evaluated." Also: `spec` in a *single*-doc file → error "spec must be in its own document above `---`" (matches GitLab).
- [ ] **Step 2:** Implement: the engine currently parses one document (check how it loads YAML — if `loadAll` is already used, just classify; if not, switch to `js-yaml` `loadAll` and treat doc[0]-with-spec as the header). Commit `fix(gitlab-ci-validator): CI component spec: headers parse instead of producing bogus job errors`.

### Task 2: security findings (five, mirroring the GHA tool's lane)

- [ ] **Step 1: Failing tests**, one per ID:
  - `image-unpinned` (warning): `image: node:latest` or bare `image: node` at global or job level; `node:22.3` passes with a note that only digests are immutable; `node@sha256:…` silent.
  - `secret-in-variables` (error): `variables:` value matching the secret patterns from plan 01a's `looksSecret` — **import that helper**, one pattern list site-wide (plus `DOCKER_AUTH_CONFIG` with an inline auth blob, named specifically).
  - `token-in-script` (warning): `script:` line interpolating `$CI_JOB_TOKEN` into a `curl`/`git clone` to a non-`${CI_SERVER_HOST}` URL — heuristic, say so.
  - `rules-dead-job` (warning): a `rules:` list whose final entry is bare `when: never` with no preceding catch-all → "this job can never run"; and the inverse trap — no terminal rule → note that the default is `when: never` for non-matching, which surprises people migrating from `only`.
  - `rules-only-conflict` (error): `rules:` and `only:`/`except:` on the same job — GitLab hard-rejects; the engine's prose at `:758` already explains it, now emit it.
- [ ] **Step 2:** Implement in the engine's established finding shape/severity conventions. Commit `feat(gitlab-ci-validator): security lane — unpinned images, secrets in variables, token egress, dead rules, rules/only conflict`.

### Task 3: needs vs stage order

- [ ] **Step 1: Failing test** — `stages: [build, test]`; job in `build` with `needs: [job_in_test]` → error "needs a job in a later stage" (GitLab refuses). Same-stage needs pass (legal since 14.2 — note the version in `detail`).
- [ ] **Step 2:** Implement beside `checkNeeds` (`:772`), using the declared `stages:` order (default order `['.pre','build','test','deploy','.post']` when undeclared — encode it). Commit `feat(gitlab-ci-validator): needs: must not point at a later stage`.

**Page copy:** the tool page's why/FAQ gains "What security issues does it flag?" — five locales, one commit.

**Still deliberately silent (add to page):** `parallel: matrix`, `environment`, `resource_group`, `interruptible`, `artifacts:expire_in` duration grammar, `if:` expression evaluation — listed so the next contributor extends the list instead of the audit re-finding it.

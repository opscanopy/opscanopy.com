# 04c — reusable-workflow jobs: validated, not skipped

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or superpowers:executing-plans. Checkbox steps.

**Goal:** Jobs that call reusable workflows (`uses:` at job level) get their own check family instead of `if (isReusable) return;` — including the credential-exfiltration shape `secrets: inherit` under a `pull_request_target` trigger.

**Files:**
- Modify: `src/lib/gha-validator/engine.ts:516` (replace the early return with `checkReusableJob(...)` then return)
- Test: `src/lib/gha-validator/engine.test.ts`

- [ ] **Step 1: Failing tests**

```ts
describe('reusable-workflow jobs', () => {
  it('unpinned mutable ref on the workflow call', () => {
    const y = `
on: push
jobs:
  deploy:
    uses: org/repo/.github/workflows/deploy.yml@main
`;
    const f = validate(y).findings.find((x) => x.id === 'reusable-unpinned-ref')!;
    expect(f.severity).toBe('warning');
    expect(f.title).toContain('@main');
  });
  it('SHA-pinned ref passes; same-repo local path passes', () => {
    for (const uses of [
      'org/repo/.github/workflows/deploy.yml@8f4b7f84864484a7bf31766abe9204da3cbe65b3',
      './.github/workflows/deploy.yml',
    ]) {
      const y = `\non: push\njobs:\n  deploy:\n    uses: ${uses}\n`;
      expect(validate(y).findings.map((f) => f.id)).not.toContain('reusable-unpinned-ref');
    }
  });
  it('secrets: inherit under pull_request_target is a security finding', () => {
    const y = `
on: pull_request_target
jobs:
  ci:
    uses: org/repo/.github/workflows/ci.yml@v1
    secrets: inherit
`;
    const f = validate(y).findings.find((x) => x.id === 'reusable-secrets-inherit-prt')!;
    expect(f.severity).toBe('error');
  });
  it('secrets: inherit under plain pull_request is only an info nudge', () => {
    const y = `
on: pull_request
jobs:
  ci:
    uses: org/repo/.github/workflows/ci.yml@v1
    secrets: inherit
`;
    const fs = validate(y).findings.filter((x) => x.id.startsWith('reusable-secrets'));
    expect(fs.every((f) => f.severity === 'info' || f.severity === 'warning')).toBe(true);
  });
  it('with:/secrets: must be maps (or inherit)', () => {
    const y = `
on: push
jobs:
  ci:
    uses: org/repo/.github/workflows/ci.yml@v1
    with: [not, a, map]
`;
    expect(validate(y).findings.map((f) => f.id)).toContain('reusable-with-shape');
  });
  it('steps on a reusable-call job is an error', () => {
    const y = `
on: push
jobs:
  ci:
    uses: org/repo/.github/workflows/ci.yml@v1
    steps: [{run: echo nope}]
`;
    expect(validate(y).findings.map((f) => f.id)).toContain('reusable-forbidden-keys');
  });
});
```

- [ ] **Step 2:** Run — FAIL.

- [ ] **Step 3: Implement** `checkReusableJob(jobId, job, triggers, lines, add)`, called where `:516` returns today:

  1. **`reusable-unpinned-ref`** (warning): ref after `@` is not a 40-hex SHA and not a local `./` path. Reuse the mutable-ref classification the step-level `checkUnpinnedActions` already has (`:789-821`) — extract its ref test into a shared helper rather than duplicating (04e rewrites that scan; coordinate: the helper is the piece both keep).
  2. **`reusable-secrets-inherit-prt`** (error): `job.secrets === 'inherit'` AND the file's triggers include `pull_request_target` or `workflow_run`. Detail text: "`pull_request_target` runs with base-repo secrets against fork-controlled input; `secrets: inherit` hands *all* of them to the called workflow. Pass the specific secrets the callee needs instead." The engine already parses triggers for its existing checks — reuse that, don't re-read `on:`.
  3. **`reusable-secrets-inherit`** (info) otherwise: least-privilege nudge, only when the trigger set is not PRT.
  4. **`reusable-with-shape` / `reusable-secrets-shape`** (error): `with:` must be a map; `secrets:` a map or the literal `'inherit'`.
  5. **`reusable-forbidden-keys`** (error): any of `steps`, `runs-on`, `container`, `services`, `environment` present alongside job-level `uses:` — GitHub rejects the file. (`strategy`, `needs`, `if`, `permissions`, `concurrency` are legal — do not flag.)

- [ ] **Step 4:** Tests pass; full suite green. Confirm the checks that *should* still apply to reusable jobs (`needs` membership from `:500`, 04a cycles) run **before** the reusable branch returns — reorder inside `checkJob` if needed.
- [ ] **Step 5: Commit** — `git commit -m "feat(gha-validator): reusable-workflow jobs get real checks — ref pinning, secrets: inherit × pull_request_target, shape"`

# 04d — `permissions`: catch the real over-broad shapes

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or superpowers:executing-plans. Checkbox steps.

**Goal:** Enumerated write-everything is flagged like `write-all`; scope-name typos are caught; the missing-permissions nudge is per-job, not suppressed file-wide by one declaring job.

**Evidence:** `isWriteAll` at `engine.ts:838` string-matches `'write-all'` only. The `:852-878` warning sets `anyJobDeclares` true if *any* job declares permissions and then drops the top-level warning for the whole file — an 11-job workflow with one `permissions: {}` job gets silence about the other ten.

**Files:**
- Modify: `src/lib/gha-validator/engine.ts:838-878`
- Test: `src/lib/gha-validator/engine.test.ts`

- [ ] **Step 1: Failing tests**

```ts
const VALID_SCOPES = 'actions attestations checks contents deployments discussions id-token issues models packages pages pull-requests security-events statuses'.split(' ');

describe('permissions depth', () => {
  it('enumerated broad write is flagged like write-all', () => {
    const y = `
on: push
permissions: {contents: write, id-token: write, packages: write, actions: write}
jobs:
  b: {runs-on: ubuntu-latest, steps: [{run: echo hi}]}
`;
    const f = validate(y).findings.find((x) => x.id === 'permissions-broad-write')!;
    expect(f.severity).toBe('warning');
    expect(f.title).toMatch(/4 write scopes/);
  });
  it('one or two write scopes is fine', () => {
    const y = `
on: push
permissions: {contents: read, id-token: write}
jobs:
  b: {runs-on: ubuntu-latest, steps: [{run: echo hi}]}
`;
    expect(validate(y).findings.map((f) => f.id)).not.toContain('permissions-broad-write');
  });
  it('scope-name typo', () => {
    const y = `
on: push
permissions: {content: read}
jobs:
  b: {runs-on: ubuntu-latest, steps: [{run: echo hi}]}
`;
    const f = validate(y).findings.find((x) => x.id === 'permissions-unknown-scope')!;
    expect(f.severity).toBe('error'); // GitHub rejects unknown scopes
    expect(f.remediation).toContain('contents'); // nearest-name suggestion
  });
  it('missing-permissions nudge is per-job: one declaring job does not silence the rest', () => {
    const y = `
on: push
jobs:
  quiet: {permissions: {}, runs-on: ubuntu-latest, steps: [{run: echo a}]}
  loud:  {runs-on: ubuntu-latest, steps: [{uses: actions/checkout@8f4b7f84864484a7bf31766abe9204da3cbe65b3}]}
`;
    const fs = validate(y).findings.filter((x) => x.id === 'job-missing-permissions');
    expect(fs).toHaveLength(1);
    expect(fs[0].title).toContain('loud');
  });
});
```

- [ ] **Step 2:** Run — FAIL.

- [ ] **Step 3: Implement:**
  1. **`permissions-broad-write`** (warning): on any permissions map (top-level or job), count scopes valued `write`; threshold ≥3 → flag, title `"N write scopes granted — that's write-all with extra steps."`, remediation: keep only what the job provably uses, name the common legit pairs (`contents: write` for release, `id-token: write` for OIDC). Keep the existing literal `write-all` check as is (different ID, existing behaviour).
  2. **`permissions-unknown-scope`** (error): key not in `VALID_SCOPES` (hardcode the list above with a dated comment — scope list changes rarely; the conformance-corpus pattern from the expression tester is overkill here). Suggestion: nearest valid scope by prefix/edit-distance ≤2 (`content`→`contents`, `pull-request`→`pull-requests`). Also validate values: only `read`, `write`, `none` are legal → same finding ID, different title.
  3. **Per-job nudge:** rewrite `:852-878` — drop `anyJobDeclares`. Emit `job-missing-permissions` (info) per job that (a) has no job-level `permissions`, (b) is not covered by a top-level `permissions`, and (c) *does something token-relevant* (has a `uses:` step or references `secrets.GITHUB_TOKEN`/`github.token`) — condition (c) keeps the old check's intent of not nagging pure-echo jobs. Keep the existing finding ID if one exists for this today; otherwise mint `job-missing-permissions` and retire the old file-level ID in the same commit (note it in the commit body — the playground renders by ID generically, so no UI change).

- [ ] **Step 4:** Tests pass; full suite green.
- [ ] **Step 5: Commit** — `git commit -m "feat(gha-validator): enumerated broad-write detection, scope typo suggestions, per-job missing-permissions nudge"`

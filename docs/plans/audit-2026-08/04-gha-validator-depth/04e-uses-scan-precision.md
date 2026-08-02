# 04e — unpinned-`uses` scan: parsed YAML, not raw lines

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or superpowers:executing-plans. Checkbox steps.

**Goal:** `checkUnpinnedActions` stops flagging `uses:` text inside `run: |` heredocs and `#` comments, by walking the parsed step objects instead of raw lines — the engine's own comment at `:669-673` explains exactly why the raw scan is wrong ("A raw text scan cannot tell a real `ref:` from the same words inside a `#` comment"), then `:789-821` does it anyway.

**Also expands the injection-context list** (same file, same commit family): `UNTRUSTED_CONTEXT_RE` at `:234` gains `github.event.client_payload.*`, `github.event.inputs.*`, `github.event.workflow_run.head_branch`, `github.event.pull_request.head.repo.full_name`.

**Files:**
- Modify: `src/lib/gha-validator/engine.ts:789-821` (rewrite), `:234` (regex additions)
- Test: `src/lib/gha-validator/engine.test.ts`

- [ ] **Step 1: Failing tests**

```ts
describe('unpinned-uses precision', () => {
  it('does NOT flag uses: text inside run: | heredocs', () => {
    const y = `
on: push
jobs:
  docs:
    runs-on: ubuntu-latest
    steps:
      - run: |
          cat <<'EOF' > example.yml
          uses: actions/checkout@main
          EOF
`;
    expect(validate(y).findings.map((f) => f.id)).not.toContain(UNPINNED_ID);
  });
  it('does NOT flag commented-out uses', () => {
    const y = `
on: push
jobs:
  b:
    runs-on: ubuntu-latest
    steps:
      # - uses: actions/checkout@main
      - run: echo hi
`;
    expect(validate(y).findings.map((f) => f.id)).not.toContain(UNPINNED_ID);
  });
  it('still flags a real mutable ref, with the right line', () => {
    const y = `
on: push
jobs:
  b:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
`;
    const f = validate(y).findings.find((x) => x.id === UNPINNED_ID)!;
    expect(f.line).toBe(7);
  });
  it('docker:// and local ./ actions are not "unpinned github refs"', () => {
    for (const uses of ['docker://alpine:3.20', './local-action']) {
      const y = `\non: push\njobs:\n  b:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: ${uses}\n`;
      expect(validate(y).findings.map((f) => f.id)).not.toContain(UNPINNED_ID);
      // docker:// by tag is its own (pre-existing or new) docker-tag finding — check what exists before deciding
    }
  });
});

describe('untrusted contexts — expanded', () => {
  it.each([
    'github.event.client_payload.ref',
    'github.event.inputs.name',
    'github.event.workflow_run.head_branch',
    'github.event.pull_request.head.repo.full_name',
  ])('flags %s interpolated into run:', (ctx) => {
    const y = `\non: repository_dispatch\njobs:\n  b:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo "\${{ ${ctx} }}"\n`;
    expect(validate(y).findings.some((f) => /inject/i.test(f.id))).toBe(true);
  });
});
```

Set `UNPINNED_ID` to the existing finding's real ID (grep the engine for the current `id:` in `checkUnpinnedActions`) — **keep the ID stable**, only the mechanism changes.

- [ ] **Step 2:** Run — heredoc/comment tests FAIL (raw scan flags them); context tests FAIL (regex lacks the entries).

- [ ] **Step 3: Implement.**
  1. Rewrite `checkUnpinnedActions` to iterate the **parsed** jobs → steps → `step.uses` strings (plus job-level `uses` — but 04c owns that finding; skip job-level here if 04c is merged, to avoid double-reporting).
  2. Line anchoring: js-yaml is already loaded without a position map — reuse the engine's existing pattern for locating a child key's line (`findJobChildLine`) generalized to steps: from the job's line, scan forward for the Nth `- ` step item, then its `uses:` line. That scoped scan can't hit heredocs in *other* steps; a `uses:` string inside the *same step's* `run:` block is no longer scanned at all because we read the parsed object, not the text. Comments never appear in parsed output.
  3. Ref policy unchanged (mutable tag/branch → warning; 40-hex SHA → pass) — extract the classification helper shared with 04c's `reusable-unpinned-ref` if 04c landed first.
  4. Add the four patterns to `UNTRUSTED_CONTEXT_RE` at `:234`, keeping its existing alternation style.

- [ ] **Step 4:** Tests pass; full suite green. Diff the finding count on the engine's own example fixtures (the playground seeds) before/after — any *lost* finding must be explainable as a former false positive.
- [ ] **Step 5: Commit** — `git commit -m "fix(gha-validator): unpinned-uses walks parsed steps (no heredoc/comment false positives); expand untrusted-context list"`

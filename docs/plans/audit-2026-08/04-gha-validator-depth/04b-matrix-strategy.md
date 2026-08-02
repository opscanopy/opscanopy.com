# 04b — `strategy.matrix` validation

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or superpowers:executing-plans. Checkbox steps.

**Goal:** The most common workflow shape on a real CI fleet — matrix builds — gets first-class checks: referenced-but-undeclared matrix vars, malformed `include`/`exclude`, wrong-typed `fail-fast`/`max-parallel`, empty matrices.

**Scope guard (YAGNI):** No expansion simulation, no cross-product size warnings, no `fromJSON` dynamic matrices (flag those as "can't check — computed at runtime", info severity). Five checks only.

**Files:**
- Modify: `src/lib/gha-validator/engine.ts` — new `checkStrategy(jobId, job, lines, add)` called from `checkJob` (it must run **before** the `isReusable` early-return at `:516` moves in 04c — reusable jobs can't have `strategy`; flag if present).
- Test: `src/lib/gha-validator/engine.test.ts`

- [ ] **Step 1: Failing tests**

```ts
describe('strategy.matrix checks', () => {
  it('matrix var referenced but not declared', () => {
    const y = `
on: push
jobs:
  test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node: [20, 22]
    steps:
      - run: echo \${{ matrix.node }} on \${{ matrix.os }}
`;
    const f = validate(y).findings.find((x) => x.id === 'matrix-var-undeclared')!;
    expect(f.severity).toBe('warning');
    expect(f.title).toContain('matrix.os');
  });
  it('vars added via include are declared', () => {
    const y = `
on: push
jobs:
  test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node: [20]
        include: [{node: 20, experimental: true}]
    steps: [{run: 'echo \${{ matrix.experimental }}'}]
`;
    expect(validate(y).findings.map((f) => f.id)).not.toContain('matrix-var-undeclared');
  });
  it('include/exclude must be lists of maps', () => {
    const y = `
on: push
jobs:
  test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node: [20]
        exclude: {node: 20}
    steps: [{run: echo hi}]
`;
    expect(validate(y).findings.map((f) => f.id)).toContain('matrix-include-exclude-shape');
  });
  it('fail-fast / max-parallel types', () => {
    const y = `
on: push
jobs:
  test:
    runs-on: ubuntu-latest
    strategy:
      fail-fast: "yes"
      max-parallel: two
      matrix: {node: [20]}
    steps: [{run: echo hi}]
`;
    const ids = validate(y).findings.map((f) => f.id);
    expect(ids).toContain('strategy-fail-fast-type');
    expect(ids).toContain('strategy-max-parallel-type');
  });
  it('empty matrix', () => {
    const y = `
on: push
jobs:
  test:
    runs-on: ubuntu-latest
    strategy: {matrix: {}}
    steps: [{run: echo hi}]
`;
    expect(validate(y).findings.map((f) => f.id)).toContain('matrix-empty');
  });
  it('dynamic matrix via fromJSON → info, no undeclared-var noise', () => {
    const y = `
on: push
jobs:
  test:
    runs-on: ubuntu-latest
    strategy:
      matrix: \${{ fromJSON(needs.plan.outputs.matrix) }}
    needs: plan
    steps: [{run: 'echo \${{ matrix.anything }}'}]
  plan:
    runs-on: ubuntu-latest
    steps: [{run: echo plan}]
`;
    const ids = validate(y).findings.map((f) => f.id);
    expect(ids).toContain('matrix-dynamic-unchecked');
    expect(ids).not.toContain('matrix-var-undeclared');
  });
});
```

- [ ] **Step 2:** Run — FAIL (none of the five IDs exist).

- [ ] **Step 3: Implement** `checkStrategy`:
  1. `strategy` absent → return. `strategy.matrix` a string starting `${{` → emit `matrix-dynamic-unchecked` (info: "computed at runtime — this validator can't see its keys") and return.
  2. Declared vars = keys of `matrix` minus `include`/`exclude`, **plus** every key found in `include` entries (GitHub adds those to combinations).
  3. Referenced vars: scan the *job's own YAML slice* (steps, env, name, `runs-on`, `container`) for `/matrix\.([A-Za-z_][A-Za-z0-9_-]*)/g` — reuse however the injection check at `:234` walks step strings; don't invent a second traversal.
  4. Emit `matrix-var-undeclared` (warning) per distinct missing name — `${{ matrix.os }}` evaluates to empty string at runtime, the classic "why is my runs-on blank".
  5. Shape checks: `include`/`exclude` must be arrays of plain objects → `matrix-include-exclude-shape` (error); `fail-fast` must be boolean (`"yes"` is a truthy *string* — GitHub type-errors) → `strategy-fail-fast-type` (error); `max-parallel` positive integer → `strategy-max-parallel-type` (error); matrix object with zero var keys and no include → `matrix-empty` (error).
  6. `strategy` on a reusable-call job → `strategy` **is** legal there (matrix over reusable calls is supported) — do **not** flag; just ensure the traversal doesn't assume `steps` exists.

Each finding: follow the house style — `title` states the fact, `detail` the consequence, `remediation` the fix, `line` via `findJobChildLine(lines, jobLine, 'strategy')`.

- [ ] **Step 4:** Tests pass; full suite green.
- [ ] **Step 5: Commit** — `git commit -m "feat(gha-validator): strategy.matrix checks — undeclared vars, include/exclude shape, types, empty and dynamic matrices"`

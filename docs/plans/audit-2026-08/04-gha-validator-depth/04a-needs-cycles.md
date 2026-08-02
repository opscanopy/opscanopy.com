# 04a — `needs:` cycle detection

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or superpowers:executing-plans. Checkbox steps.

**Goal:** A dependency cycle among jobs produces one `job-needs-cycle` error naming the cycle path; GitHub rejects such files wholesale, the validator currently passes them.

**Files:**
- Modify: `src/lib/gha-validator/engine.ts` (new function beside the `needs` membership check at `:500`; called once per file, not per job)
- Test: `src/lib/gha-validator/engine.test.ts`

- [ ] **Step 1: Failing tests**

```ts
const cyclic = `
on: push
jobs:
  a:
    needs: b
    runs-on: ubuntu-latest
    steps: [{run: echo a}]
  b:
    needs: a
    runs-on: ubuntu-latest
    steps: [{run: echo b}]
`;

const selfLoop = `
on: push
jobs:
  a:
    needs: a
    runs-on: ubuntu-latest
    steps: [{run: echo a}]
`;

const diamond = `
on: push
jobs:
  a: {runs-on: ubuntu-latest, steps: [{run: echo a}]}
  b: {needs: a, runs-on: ubuntu-latest, steps: [{run: echo b}]}
  c: {needs: a, runs-on: ubuntu-latest, steps: [{run: echo c}]}
  d: {needs: [b, c], runs-on: ubuntu-latest, steps: [{run: echo d}]}
`;

describe('job-needs-cycle', () => {
  const ids = (yaml: string) => validate(yaml).findings.map((f) => f.id);
  it('two-job cycle is an error naming the path', () => {
    const f = validate(cyclic).findings.find((x) => x.id === 'job-needs-cycle')!;
    expect(f.severity).toBe('error');
    expect(f.title).toMatch(/a → b → a|b → a → b/);
  });
  it('self-loop', () => expect(ids(selfLoop)).toContain('job-needs-cycle'));
  it('diamond is NOT a cycle', () => expect(ids(diamond)).not.toContain('job-needs-cycle'));
  it('one finding per cycle, not per member', () => {
    const fs = validate(cyclic).findings.filter((x) => x.id === 'job-needs-cycle');
    expect(fs).toHaveLength(1);
  });
});
```

(Adapt `validate(...)`/`.findings` to the engine's real public API — read the existing test file's imports first and reuse its helper style.)

- [ ] **Step 2:** Run `npx vitest run src/lib/gha-validator/engine.test.ts` — FAIL: no `job-needs-cycle` finding exists.

- [ ] **Step 3: Implement** — iterative three-color DFS (no recursion; user YAML depth is untrusted):

```ts
/**
 * needs: cycles — GitHub refuses the whole workflow file. One finding per
 * distinct cycle, anchored to the first job in the cycle's needs: line.
 */
function checkNeedsCycles(jobs: Record<string, unknown>, lines: string[], add: AddFinding): void {
  const graph = new Map<string, string[]>();
  for (const [id, job] of Object.entries(jobs)) {
    graph.set(id, toStringList((job as { needs?: unknown })?.needs).filter((d) => graph_has_or_will(d)));
  }
  // NB: unknown deps are already reported by job-needs-unknown — filter to known
  // ids here so one mistake doesn't produce two findings.
  const color = new Map<string, 0 | 1 | 2>(); // 0 white, 1 gray, 2 black
  const reported = new Set<string>();
  for (const start of graph.keys()) {
    if (color.get(start)) continue;
    const stack: Array<{ id: string; i: number }> = [{ id: start, i: 0 }];
    const path: string[] = [start];
    color.set(start, 1);
    while (stack.length) {
      const top = stack[stack.length - 1];
      const deps = graph.get(top.id) ?? [];
      if (top.i < deps.length) {
        const dep = deps[top.i++];
        if (color.get(dep) === 1) {
          const cycle = [...path.slice(path.indexOf(dep)), dep];
          const key = [...cycle].sort().join('|');
          if (!reported.has(key)) {
            reported.add(key);
            add({
              id: 'job-needs-cycle',
              severity: 'error',
              title: `Jobs depend on each other in a loop: ${cycle.join(' → ')}.`,
              detail: 'GitHub rejects a workflow whose `needs:` graph contains a cycle — no job in the file will run.',
              line: findJobChildLine(lines, findJobLine(lines, cycle[0]), 'needs') ?? 1,
              remediation: 'Break the loop: one of these jobs must not need the other.',
            });
          }
        } else if (!color.get(dep)) {
          color.set(dep, 1);
          path.push(dep);
          stack.push({ id: dep, i: 0 });
        }
      } else {
        color.set(top.id, 2);
        path.pop();
        stack.pop();
      }
    }
  }
}
```

Wire it where per-file checks run (near where `checkJob` is invoked over all jobs). Replace `graph_has_or_will`/`findJobLine` with the engine's real helpers — it already resolves job lines for the membership check at `:500`; reuse that exact mechanism.

- [ ] **Step 4:** Tests pass; full suite green.
- [ ] **Step 5:** Headless spot-check: paste the two-job cycle into the playground — one error row, correct line anchor.
- [ ] **Step 6: Commit** — `git commit -m "feat(gha-validator): detect needs: cycles — GitHub rejects these files wholesale"`

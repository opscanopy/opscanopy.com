# 07b — PromQL explainer: a warnings channel — diagnose, don't just narrate

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or superpowers:executing-plans. Checkbox steps.

**Goal:** `ExplainResult` gains `warnings: Warning[]`, and the walker emits the five highest-value static diagnoses. The parser is already excellent (Pratt precedence, subqueries, `@`/`offset`, `on/ignoring/group_left`) — this child adds judgment to it.

**Evidence:** `src/lib/promql-explainer/types.ts:28-39` — `{error?, explanation, breakdown}`, no warnings field. The explainer narrates `histogram_quantile(0.99, rate(x_bucket[5m]))` — a guaranteed-wrong p99 (missing `by (le)`) — as correct English.

**Files:**
- Modify: `src/lib/promql-explainer/types.ts`, `engine.ts` (AST walk), `src/components/PromqlExplainerPlayground.astro` (render warnings)
- Test: `src/lib/promql-explainer/engine.test.ts`

- [ ] **Step 1: Failing tests** (adapt to the suite's call style):

```ts
describe('warnings channel', () => {
  const warns = (q: string) => explain(q).warnings.map((w) => w.id);

  it('histogram_quantile without by (le)', () => {
    expect(warns('histogram_quantile(0.99, rate(http_bucket[5m]))')).toContain('hq-missing-le');
    expect(warns('histogram_quantile(0.99, sum by (le) (rate(http_bucket[5m])))')).not.toContain('hq-missing-le');
    expect(warns('histogram_quantile(0.99, sum by (le, job) (rate(http_bucket[5m])))')).not.toContain('hq-missing-le');
  });
  it('rate() over a non-_total-suffixed name is a soft heuristic note', () => {
    expect(warns('rate(node_memory_active_bytes[5m])')).toContain('rate-on-gauge-name');
    expect(warns('rate(http_requests_total[5m])')).not.toContain('rate-on-gauge-name');
  });
  it('sum before rate — the classic inversion', () => {
    expect(warns('rate(sum(http_requests_total)[5m:])')).toContain('agg-before-rate');
  });
  it('very short range vs typical scrape', () => {
    expect(warns('rate(http_requests_total[1m])')).toContain('rate-short-range');
    expect(warns('rate(http_requests_total[5m])')).not.toContain('rate-short-range');
  });
  it('comparison filters an instant vector silently to empty', () => {
    // count(x > 10) — fine; x > 10 and on() absent(y) — the "> drops series" trap
    expect(warns('sum(http_errors) > 10 or vector(0)')).not.toContain('cmp-drops-series');
    expect(warns('rate(http_requests_total[5m]) > 0.5')).toContain('cmp-drops-series');
  });
  it('clean query, clean channel', () => {
    expect(explain('sum by (job) (rate(http_requests_total[5m]))').warnings).toEqual([]);
  });
});
```

- [ ] **Step 2:** Run — FAIL (`warnings` undefined).

- [ ] **Step 3: Types.** `Warning = { id: string; severity: 'warn' | 'note'; message: string; span?: [number, number] }` (span = source offsets if the AST carries positions — check; the breakdown already highlights subexpressions, reuse whatever anchoring it has). `warnings: Warning[]` always present, `[]` when clean.

- [ ] **Step 4: Implement the five walkers** on the existing AST:
  1. **`hq-missing-le`** (warn): `histogram_quantile` whose 2nd arg subtree contains an aggregation with a `by` clause lacking `le`, OR a bare `rate(*_bucket[..])` with no aggregation — message explains *why* the p99 is wrong (quantile needs per-le buckets) and shows the corrected form.
  2. **`rate-on-gauge-name`** (note): `rate`/`increase`/`irate` over a metric name not ending `_total|_count|_sum|_bucket`. Heuristic — say so in the message ("if this is a counter with a nonstandard name, ignore this").
  3. **`agg-before-rate`** (warn): `rate`/`increase` whose operand subtree contains `sum`/`avg`/aggregation (the subquery-wrapped form included) — "rate of a sum breaks on counter resets; sum the rates instead."
  4. **`rate-short-range`** (note): range `< 2m` under `rate`/`increase` — "needs ≥2 samples; with a 60s scrape interval a 1m window often has one."
  5. **`cmp-drops-series`** (note): top-level comparison without `bool` on a query whose root isn't an aggregation-into-scalar context — "series that fail the comparison vanish rather than becoming 0 — an alert on this fires on data, silences on *absence* of data."
  Each message ends with the corrected query text where a rewrite is mechanical (1 and 3).

- [ ] **Step 5: Playground.** Render warnings between explanation and breakdown: amber `--color-accent-ink` annotation style (Field Manual: amber = annotation ink), one block, NOT a live region. `data-copy` on the corrected-query snippets.

- [ ] **Step 6:** Tests pass; suite green; headless verify the hq-missing-le path renders with the corrected query copyable.
- [ ] **Step 7:** Page copy: add "What it checks" list to the why-section; five locales, one commit.
- [ ] **Step 8: Commit** — `git commit -m "feat(promql-explainer): warnings channel — histogram_quantile/le, agg-before-rate, short ranges, gauge-rate, comparison drops"`

**Still deliberately silent (state in the page copy):** no execution, no type inference from live metadata, no scrape-interval knowledge beyond the 2m heuristic, no `absent()` reasoning.

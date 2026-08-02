# 03b — field-aware jumping: never-fires in bounded time

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or superpowers:executing-plans. Checkbox steps.

**Goal:** The next-run walk skips whole days/hours it can prove won't match, so `0 0 30 2 *` ("never") resolves in <50 ms instead of ~512 ms of minute-by-minute walking — and the 5-year horizon stays as the correctness backstop, not the workload.

**Why not a worker thread instead?** A Web Worker hides the block but still burns the battery and complicates the playground; the jump is ~30 lines and makes the worker unnecessary. (If profiling later shows Intl cost dominating sane expressions, a worker is the *next* step, not this one.)

**Files:**
- Modify: `src/lib/cron-tester/engine.ts` (the walk, `:527-556` post-03a shape)
- Test: `src/lib/cron-tester/engine.test.ts`

- [ ] **Step 1: Failing tests**

```ts
describe('computeNextDates — jump performance', () => {
  const from = new Date(Date.UTC(2026, 0, 1));
  it('never-fires (Feb 30) answers fast', () => {
    const t0 = performance.now();
    const runs = computeNextDates(parse('0 0 30 2 *'), { from, count: 1, timeZone: 'UTC' });
    expect(runs).toHaveLength(0);
    expect(performance.now() - t0).toBeLessThan(50);
  });
  it('sparse-but-real (Feb 29) is found across years', () => {
    const runs = computeNextDates(parse('0 0 29 2 *'), { from, count: 1, timeZone: 'UTC' });
    expect(runs[0].toISOString()).toBe('2028-02-29T00:00:00.000Z');
  });
  it('jumping never skips a valid run — dense expression equivalence', () => {
    // The jump path and a plain minute walk must agree; pin 10 runs of a
    // multi-field expression that exercises day/weekday OR-semantics:
    const runs = computeNextDates(parse('15 3 1,15 * 1'), { from, count: 10, timeZone: 'America/New_York' });
    expect(runs).toMatchSnapshot(); // then verify the snapshot by hand against crontab.guru before accepting
  });
});
```

- [ ] **Step 2:** Run — the perf test FAILs (or flakes near 512 ms) pre-change.

- [ ] **Step 3: Implement** the two-level jump inside the walk loop:

```ts
// Day-level jump: if this wall-date can never match the day/month/weekday
// fields, skip to the next zone-local midnight instead of walking 1440 minutes.
// dayMatches must reproduce cron's OR rule: when BOTH day-of-month and
// day-of-week are restricted, a date matches if EITHER matches (the engine's
// existing matcher already encodes this — extract it, don't re-derive it).
if (!dayMatches(fields, w)) {
  epochMs = nextZoneMidnight(epochMs, timeZone);
  continue;
}
// Hour-level jump: within a matching day, skip non-matching hours wholesale.
if (!fields.hours.has(w.hour)) {
  epochMs += (60 - w.minute) * 60000; // to the next top-of-hour (zone-safe: minutes are uniform)
  continue;
}
```

`nextZoneMidnight(epochMs, timeZone)`: advance in 1-hour steps until `wallClock(...).day` changes, then subtract `minute * 60000` to land on :00 — hour-stepping is DST-proof (offsets change in whole 15-min units; verify the landing with one `wallClock` read and correct by its `minute`/`hour` remainder). Keep the total-horizon check as is — it now costs ~1830 day-probes worst case, not 2.6M minute-probes.

**Correctness invariant to keep in a comment:** the jump may only skip candidates the field test would reject; when in doubt, fall through to the minute walk. The equivalence test in Step 1 is the guard.

- [ ] **Step 4:** All tests pass, including 03a's DST vectors (the jump must not tunnel over the fall-back repeated hour — the hour-jump advances by wall-minutes, which is uniform across offsets, so it can't).
- [ ] **Step 5:** `npm run test` green.
- [ ] **Step 6: Commit** — `git commit -m "perf(cron-tester): day/hour field-aware jumping — never-fires in <50ms, was ~512ms of minute walking"`

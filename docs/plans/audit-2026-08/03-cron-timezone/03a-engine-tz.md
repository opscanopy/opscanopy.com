# 03a — engine: timezone-correct next-run math

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or superpowers:executing-plans. Checkbox steps.

**Goal:** `computeNextDates(expr, opts)` takes `{ timeZone: string, from?: Date, count?: number }`, walks UTC instants, and matches cron fields against the **wall clock in that zone** via a cached `Intl.DateTimeFormat`. Default zone: `'UTC'` — never silently browser-local.

**Files:**
- Create: `src/lib/cron-tester/wall-clock.ts` (zone math, reusable)
- Modify: `src/lib/cron-tester/engine.ts:508-556` (field matching + walk)
- Test: `src/lib/cron-tester/wall-clock.test.ts`, extend `src/lib/cron-tester/engine.test.ts`

### Task 1: wall-clock reader

- [ ] **Step 1: Failing tests** (`wall-clock.test.ts`):

```ts
import { describe, it, expect } from 'vitest';
import { wallClock, zoneOffsetMinutes } from './wall-clock';

describe('wallClock — reads a UTC instant as zone-local fields', () => {
  it('half-hour offset zone', () => {
    // 2026-01-15T00:00:00Z is 05:30 on the 15th in Asia/Kolkata (+05:30, no DST)
    const w = wallClock(Date.UTC(2026, 0, 15, 0, 0), 'Asia/Kolkata');
    expect(w).toEqual({ year: 2026, month: 1, day: 15, hour: 5, minute: 30, weekday: 4 }); // Thursday
  });
  it('DST boundary — America/New_York spring forward 2026-03-08', () => {
    // 06:59Z = 01:59 EST; 07:00Z = 03:00 EDT — 02:xx never exists on the wall
    expect(wallClock(Date.UTC(2026, 2, 8, 6, 59), 'America/New_York').hour).toBe(1);
    expect(wallClock(Date.UTC(2026, 2, 8, 7, 0), 'America/New_York').hour).toBe(3);
  });
});

describe('zoneOffsetMinutes', () => {
  it('EST vs EDT', () => {
    expect(zoneOffsetMinutes(Date.UTC(2026, 0, 15), 'America/New_York')).toBe(-300);
    expect(zoneOffsetMinutes(Date.UTC(2026, 6, 15), 'America/New_York')).toBe(-240);
  });
});
```

- [ ] **Step 2:** `npx vitest run src/lib/cron-tester/wall-clock.test.ts` — FAIL (module missing).

- [ ] **Step 3: Implement** `wall-clock.ts`:

```ts
/**
 * Zone-aware wall-clock reads on top of the browser's own tz database via
 * Intl.DateTimeFormat — no tzdata is shipped. Formatters are memoized per
 * zone: constructing one is ~1000x the cost of a formatToParts call.
 */
export interface WallTime {
  year: number; month: number; day: number; hour: number; minute: number;
  /** 0 = Sunday … 6 = Saturday, matching cron's day-of-week field. */
  weekday: number;
}

const fmtCache = new Map<string, Intl.DateTimeFormat>();
const WEEKDAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = fmtCache.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone, hour12: false, weekday: 'short',
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    });
    fmtCache.set(timeZone, f);
  }
  return f;
}

/** Throws RangeError on an unknown zone — callers surface that as a diagnostic. */
export function wallClock(epochMs: number, timeZone: string): WallTime {
  const parts = formatter(timeZone).formatToParts(epochMs);
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  return {
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day')),
    hour: Number(get('hour')) % 24, // "24" appears for midnight in some engines
    minute: Number(get('minute')),
    weekday: WEEKDAYS[get('weekday')],
  };
}

/** Offset in minutes east of UTC at the given instant (America/New_York in Jan → -300). */
export function zoneOffsetMinutes(epochMs: number, timeZone: string): number {
  const w = wallClock(epochMs, timeZone);
  const asUtc = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute);
  return Math.round((asUtc - epochMs) / 60000);
}
```

- [ ] **Step 4:** Tests pass.
- [ ] **Step 5: Commit** — `git commit -m "feat(cron-tester): zone wall-clock reader on Intl — no tzdata shipped"`

### Task 2: engine walks UTC, matches wall clock

- [ ] **Step 1: Failing tests** (extend `engine.test.ts`; match the suite's existing call style):

```ts
describe('computeNextDates — timezone', () => {
  const from = new Date(Date.UTC(2026, 2, 7, 12, 0)); // Sat before US spring-forward
  it('defaults to UTC, not browser-local', () => {
    const [next] = computeNextDates(parse('0 2 * * *'), { from, count: 1 });
    expect(next.toISOString()).toBe('2026-03-08T02:00:00.000Z');
  });
  it('spring-forward: 0 2 * * * has no run on the gap day in New York', () => {
    const runs = computeNextDates(parse('0 2 * * *'), { from, count: 2, timeZone: 'America/New_York' });
    // 02:00 EST would be 07:00Z; on Mar 8 the 2am wall hour does not exist → first run is Mar 9
    expect(runs[0].toISOString()).toBe('2026-03-09T06:00:00.000Z'); // 02:00 EDT
  });
  it('fall-back: 30 1 * * * fires once, on the first occurrence', () => {
    const f = new Date(Date.UTC(2026, 10, 1, 0, 0)); // 2026-11-01, US fall-back
    const runs = computeNextDates(parse('30 1 * * *'), { from: f, count: 1, timeZone: 'America/New_York' });
    expect(runs[0].toISOString()).toBe('2026-11-01T05:30:00.000Z'); // 01:30 EDT, not the 06:30Z repeat
  });
  it('half-hour zone', () => {
    const [next] = computeNextDates(parse('0 9 * * *'), { from, count: 1, timeZone: 'Asia/Kolkata' });
    expect(next.toISOString()).toBe('2026-03-08T03:30:00.000Z'); // 09:00 IST
  });
  it('unknown zone is a diagnostic, not a throw', () => {
    expect(() => computeNextDates(parse('* * * * *'), { from, timeZone: 'Mars/Olympus' })).not.toThrow();
    // shape: read how the engine reports errors today and return the same shape
    // with message 'Unknown timezone "Mars/Olympus"…'
  });
});
```

Adapt `parse(...)`/result shapes to the engine's real API (read `engine.ts` exports first). If `computeNextDates` currently returns `Date`s, keep that — a `Date` is an instant; only *matching* changes.

- [ ] **Step 2:** Run — FAIL (no `timeZone` option).

- [ ] **Step 3: Implement.** In `engine.ts`:
  1. Change the field-match site (`:508-511`) from `d.getMinutes()`/etc. to a `WallTime` parameter: `matches(fields, w: WallTime)` reading `w.minute/w.hour/w.day/w.month/w.weekday`.
  2. Change the walk (`:527-556`) to iterate **UTC minutes** (`epochMs += 60000`) and call `wallClock(epochMs, timeZone)` per candidate. Fall-back dedupe falls out naturally: each UTC instant is visited once, so a repeated wall time fires on its first UTC occurrence and the second occurrence *also matches* — dedupe by tracking the last **matched wall-time tuple** and skipping an identical consecutive match: `if (sameWall(lastFired, w)) continue;`.
  3. Signature: `computeNextDates(parsed, opts: { from?: Date; count?: number; timeZone?: string })`, default `timeZone: 'UTC'`. Wrap the first `wallClock` call in try/catch → unknown-zone diagnostic in the engine's existing error shape.
  4. **Perf note:** per-minute `formatToParts` is ~2–5 µs; the common case (next 5 runs of a sane expression) stays fast, but this makes never-fires *worse* — 03b fixes the horizon and MUST land before this ships to the playground. Gate: land 03a + 03b in the same deploy.

- [ ] **Step 4:** Tests pass; `npm run test` green.
- [ ] **Step 5: Commit** — `git commit -m "feat(cron-tester): timezone-aware next runs — UTC default, wall-clock matching, DST skip/first-occurrence policy"`

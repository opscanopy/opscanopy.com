# 03a — engine: timezone-correct next-run math

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or superpowers:executing-plans. Checkbox steps.

**Goal:** The four exported cron functions accept an optional IANA `timeZone`, match cron fields against the **wall clock in that zone** via a cached `Intl.DateTimeFormat`, and default to `'UTC'` — never silently browser-local.

## Verified API surface (read 2026-08-03 — do not re-guess)

`src/lib/cron-tester/engine.ts` exports exactly four functions:

| Export | Line | Signature |
|---|---|---|
| `explain` | 645 | `(expr: string) => CronResult` (`CronResult` in `./types:29`) |
| `matchesAt` | 705 | `(expr: string, at: Date) => boolean` |
| `nextRuns` | 724 | `(expr: string, count = 5, fromIso?: string) => string[]` |
| `nextRunEpochSeconds` | 739 | `(expr: string, count = 5, fromIso?: string) => number[]` |

Internal, **not exported** — tests cannot import these:

- `parse(expr) => ParseOutcome { error, isReboot, parsed }`
- `matches(p: ParsedCron, d: Date): boolean` — **line 506**; the browser-local reads are `:507-509` (`d.getMinutes()`, `d.getHours()`, `d.getMonth()`), plus `d.getDate()`/`d.getDay()` just below
- `computeNextDates(p: ParsedCron, count: number, from: Date): Date[]` — **line 531**, positional args
- `MAX_ITERATIONS = 5 * 366 * 24 * 60` — **line 540**
- `formatRun(d, from)`, `resolveFrom(fromIso)`, `clampCount(count)`

**Consequences for this plan** (an earlier draft got all three wrong):
1. There is no exported `parse()`. Every test goes through the four public functions.
2. `computeNextDates` is private and positional — the `timeZone` option is added to the *public* signatures and threaded down, not bolted onto `computeNextDates(expr, opts)`.
3. **`formatRun(d, from)` renders the display string and is browser-local too.** Fixing only `matches()` gives correct instants rendered in the wrong zone. Both sites must change.

Also note `nextRunEpochSeconds` feeds the Timestamp Converter `#t=` deep link — epoch seconds are zone-independent, so that chain stays correct for free, but re-verify it after the change.

**Files:**
- Create: `src/lib/cron-tester/wall-clock.ts` (zone math, reusable)
- Modify: `src/lib/cron-tester/engine.ts` — `matches` (506), `computeNextDates` (531), `formatRun`, and the four public signatures
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

Tests go through `nextRunEpochSeconds` — it is exported, returns zone-independent
instants (so assertions are unambiguous), and exercises the same
`parse → computeNextDates` path as `nextRuns`/`explain`.

- [ ] **Step 1: Failing tests** (extend `engine.test.ts`; match the suite's existing import/call style):

```ts
import { nextRunEpochSeconds, nextRuns, matchesAt } from './engine';

const at = (iso: string) => Math.floor(Date.parse(iso) / 1000);

describe('timezone-aware next runs', () => {
  const from = '2026-03-07T12:00:00.000Z'; // Sat before US spring-forward

  it('defaults to UTC, not browser-local', () => {
    expect(nextRunEpochSeconds('0 2 * * *', 1, from)[0]).toBe(at('2026-03-08T02:00:00Z'));
  });

  it('spring-forward: 02:00 does not exist on the gap day in New York', () => {
    // 02:00 EST would be 07:00Z, but that wall hour is skipped on 2026-03-08,
    // so the next run is 02:00 EDT on the 9th = 06:00Z.
    expect(nextRunEpochSeconds('0 2 * * *', 1, from, { timeZone: 'America/New_York' })[0])
      .toBe(at('2026-03-09T06:00:00Z'));
  });

  it('fall-back: a repeated wall time fires once, on its first occurrence', () => {
    const f = '2026-11-01T00:00:00.000Z';
    const runs = nextRunEpochSeconds('30 1 * * *', 2, f, { timeZone: 'America/New_York' });
    expect(runs[0]).toBe(at('2026-11-01T05:30:00Z')); // 01:30 EDT
    expect(runs[1]).not.toBe(at('2026-11-01T06:30:00Z')); // not the 01:30 EST repeat
  });

  it('half-hour offset zone', () => {
    expect(nextRunEpochSeconds('0 9 * * *', 1, from, { timeZone: 'Asia/Kolkata' })[0])
      .toBe(at('2026-03-08T03:30:00Z')); // 09:00 IST
  });

  it('nextRuns renders the wall time of the chosen zone, not the browser', () => {
    const [s] = nextRuns('0 9 * * *', 1, from, { timeZone: 'Asia/Kolkata' });
    expect(s).toMatch(/09:00/);
  });

  it('matchesAt honours the zone', () => {
    expect(matchesAt('0 9 * * *', new Date('2026-03-08T03:30:00Z'), { timeZone: 'Asia/Kolkata' })).toBe(true);
    expect(matchesAt('0 9 * * *', new Date('2026-03-08T09:00:00Z'), { timeZone: 'Asia/Kolkata' })).toBe(false);
  });

  it('an unknown zone never throws — returns empty like every other bad input', () => {
    expect(() => nextRunEpochSeconds('* * * * *', 1, from, { timeZone: 'Mars/Olympus' })).not.toThrow();
    expect(nextRunEpochSeconds('* * * * *', 1, from, { timeZone: 'Mars/Olympus' })).toEqual([]);
  });

  it('existing 3-arg calls are unchanged (back-compat)', () => {
    expect(nextRunEpochSeconds('0 2 * * *', 1, from)).toHaveLength(1);
    expect(matchesAt('* * * * *', new Date(from))).toBe(true);
  });
});
```

`explain(expr)` gains the same optional trailing `opts` — add one assertion that its
`nextRuns` field reflects the zone, matching whatever field name `CronResult`
(`src/lib/cron-tester/types.ts:29`) actually uses.

- [ ] **Step 2:** Run — FAIL (no `opts` parameter exists).

- [ ] **Step 3: Implement** in `engine.ts`:
  1. `export interface CronTimeOptions { timeZone?: string }`. Add `opts?: CronTimeOptions` as the **last** parameter of all four exports (`explain(expr, opts?)`, `matchesAt(expr, at, opts?)`, `nextRuns(expr, count?, fromIso?, opts?)`, `nextRunEpochSeconds(expr, count?, fromIso?, opts?)`). Trailing-optional keeps every existing call site working — the back-compat test above pins that.
  2. `matches(p, d)` at **506** becomes `matches(p, w: WallTime)`; replace the five `d.getX()` reads with `w.minute/w.hour/w.month/w.day/w.weekday`. Keep the day-of-month/day-of-week OR semantics below it exactly as they are.
  3. `computeNextDates(p, count, from)` at **531** becomes `computeNextDates(p, count, from, timeZone)`: iterate **UTC minutes** (`epochMs += 60_000`) and call `wallClock(epochMs, timeZone)` per candidate. Fall-back dedupe: track the last matched wall tuple and skip an identical consecutive match, so a repeated wall time fires once.
  4. `formatRun(d, from)` must render in `timeZone` — pass it through and use an `Intl.DateTimeFormat` with that `timeZone`, or it will print correct instants in the wrong zone.
  5. Unknown zone: `wallClock` throws `RangeError`. Catch it at each public entry point and return the module's existing empty-result shape (`[]` for the two run functions, `false` for `matchesAt`, the `error` field for `explain`) — this engine's contract is "never throws".
  6. **Perf gate:** per-candidate `formatToParts` is ~2–5 µs, which makes the never-fires walk *worse*, not better. 03b MUST land before this reaches the playground — ship 03a and 03b in the same deploy.

- [ ] **Step 4:** Tests pass; `npm run test` green (the existing `verify.test.ts` also exercises this engine — check it).
- [ ] **Step 5: Commit** — `git commit -m "feat(cron-tester): timezone-aware next runs — UTC default, wall-clock matching, DST skip/first-occurrence policy"`

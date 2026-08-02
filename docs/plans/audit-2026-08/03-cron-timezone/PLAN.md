# Point fix 03 — cron tester: next-run times are browser-local fiction

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The cron tester computes next runs in an explicit, user-chosen IANA timezone (defaulting to UTC, not browser-local), handles DST by stated policy, and never blocks the main thread for half a second.

**Architecture:** Three layers, three children. The engine gains a `timeZone` parameter implemented with an offset-span walk over `Intl.DateTimeFormat` (no tzdata shipped — the browser's own database is the source of truth). The playground gains a timezone selector and honest DST captions. The never-fires worst case (2.6M iteration walk, benchmarked ~512 ms, currently fired on a 120 ms live debounce) is fixed with field-aware jumping.

**Tech Stack:** Pure TS + `Intl.DateTimeFormat` (available everywhere the site supports), Vitest. No deps, no tzdata bundle.

**Verified evidence:**

- `src/lib/cron-tester/engine.ts:508-511` — matches on `d.getMinutes()/getHours()/getMonth()/getDate()/getDay()`: browser-local. Zero hits for `timezone|TZ|UTC` in `CronTesterPlayground.astro`. A crontab runs in the *host's* TZ; the tool answers in the *laptop's*.
- `engine.ts:527-556` — `computeNextDates` walks local minutes via `setMinutes(+1)`; DST spring-forward makes `0 2 * * *` silently yield no run that day.
- `engine.ts:543` — never-fires horizon is `5*366*24*60` = 2,635,200 iterations; loop shape benchmarks at ~512 ms, queued repeatedly while typing (`CronTesterPlayground.astro:737`, 120 ms debounce).
- Contrast: `src/lib/systemd-lint/calendar.ts:32-34` refuses to compute next-elapse precisely because "a wrong 'next run' printed as fact is worse than no answer." This plan brings the cron tester up to that standard rather than removing the feature.

## Children (execute in order)

| Child | Delivers | Ships alone? |
|-------|----------|--------------|
| [03a-engine-tz.md](03a-engine-tz.md) | `computeNextDates(expr, {timeZone})` — correct wall-clock math in any IANA zone, DST policy stated and tested | Yes (engine defaults to UTC; playground still works) |
| [03b-perf-jump.md](03b-perf-jump.md) | Field-aware jumping: never-fires answered in bounded time | Yes |
| [03c-playground-tz-ui.md](03c-playground-tz-ui.md) | TZ selector (UTC default, "browser" as explicit option), DST captions, UX-contract compliance for the changed rows | Yes (after 03a) |

**DST policy (decided here, tested in 03a, displayed in 03c):**
- A wall time that doesn't exist (spring-forward gap) is **skipped**, and the tool says so in a caption when a computed run falls in/next to a gap day.
- A wall time that occurs twice (fall-back) fires on the **first** occurrence only.
- This matches the naive-walk behaviour of most cron implementations and is honest about the cases (Vixie cron's special-casing differs; the caption names that).

## Done when

- [ ] `0 2 * * *` in `America/New_York` around 2026-03-08 yields no 02:xx run on the 8th, with the skip explained; around 2026-11-01 yields exactly one 01:30-type run.
- [ ] Next-run list for `Asia/Kolkata` (a :30 offset zone) is minute-exact against `zdump`-style reference vectors.
- [ ] `0 0 30 2 *` (never fires) answers in <50 ms with "never runs" — measured, not vibes.
- [ ] Playground defaults to UTC with the browser zone one click away and the active zone always visible next to the results.

**Feeds:** plan 08 (the cron playground is rework target #2 there — do 03c and the 08 rework as one touch).

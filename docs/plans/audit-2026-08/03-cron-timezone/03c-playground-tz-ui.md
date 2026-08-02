# 03c — playground: timezone selector + honest DST captions

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or superpowers:executing-plans. Checkbox steps.

**Goal:** The cron playground shows *which* zone every next-run time is in, defaults to UTC, offers the browser zone and common ops zones one click away, and captions DST-affected results.

**Depends on:** 03a + 03b merged. **Coordinates with:** plan 08 ranks this playground #2 for UX-contract rework — do both in one touch of the file to avoid churning it twice (08's checklist: chips not `<select>`, exact hint line, `data-copy-all`, `data-copy-link`, sr-only copy-status, 600 ms error hold, ≥130 ms debounce).

**Files:**
- Modify: `src/components/CronTesterPlayground.astro`
- Reference implementation for every pattern: `src/components/CidrCheckerPlayground.astro` (per CLAUDE.md)

- [ ] **Step 1: Zone control.** Above the results, a row of **chips** (the UX-contract pattern, `var(--radius-pill)`, 44px coarse targets): `UTC` (default-active) · `Browser (Asia/Kolkata)` (label filled from `Intl.DateTimeFormat().resolvedOptions().timeZone` at boot) · `US East` (`America/New_York`) · `Europe` (`Europe/Berlin`) — plus a compact `<input list>` datalist fed by `Intl.supportedValuesOf('timeZone')` (guard: `typeof Intl.supportedValuesOf === 'function'`, fall back to the four chips only). Chips, not a `<select>` — this is the same rework plan 08 demands anyway.

- [ ] **Step 2: Wire the engine.** Pass the active zone into `computeNextDates(..., { timeZone })`. Render each next-run row as zone-local wall time **with the zone name in the row** (`2026-03-09 02:00 (America/New_York)`) plus a muted UTC equivalent — never a bare time. Persist the chosen zone via the existing tool-prefs mechanism (`src/lib/tool-prefs/` — read how another tool stores a preference and copy it).

- [ ] **Step 3: DST captions** (muted caption under the results, the glossary-caption pattern — no tooltip, no new live region):
  - When any computed run falls within ±24h of a zone offset transition (`zoneOffsetMinutes(run - 24h) !== zoneOffsetMinutes(run + 24h)` from 03a's `wall-clock.ts`), show: *"This zone changes offset near this run. A wall time that doesn't exist is skipped; one that occurs twice runs on its first occurrence. Vixie cron on the host may differ — check the host's cron implementation for jobs near a DST boundary."*
  - When zone ≠ UTC and zone ≠ browser zone, no extra caption (the per-row zone label covers it).

- [ ] **Step 4: Unknown-zone diagnostic.** If the engine returns the unknown-zone error (03a), render it through the existing calm-error path (600 ms hold — add `ERROR_HOLD_MS` if this playground still lacks it, per the contract).

- [ ] **Step 5: Analytics + copy.** Next-run rows get per-row copy buttons and a `data-copy-all`; the zone is included in copied text (a pasted bare time is how TZ bugs propagate). Fix the mislabelled share button while in the file: the "Copy link" control at `:162` carries `data-copy` — change to `data-copy-link` so the `result_copied` listener in `Layout.astro` attributes it correctly.

- [ ] **Step 6: Verify** per `.claude/skills/verify/SKILL.md`:
  - `0 2 * * *` + `America/New_York` around 2026-03-08 → no run on the 8th, DST caption present.
  - Default state (no interaction) shows UTC-labelled rows.
  - Chip to browser zone → rows re-render with the browser zone named.
  - Axe pass on `#playground` (one `role="status"` live region total).

- [ ] **Step 7: Page copy.** The tool page (`src/pages/cron-expression-tester.astro`) gains one FAQ: "Which timezone are these times in?" — answer names the selector, the UTC default, and the DST policy. **Ship the same FAQ change to all 5 locales in the same commit** (`src/pages/{de,es,fr,pt-br}/cron-expression-tester.astro`), translated in each file's register.

- [ ] **Step 8: Commit** — `git commit -m "feat(cron-tester): timezone selector with UTC default, zone-labelled runs, DST captions — all locales"`

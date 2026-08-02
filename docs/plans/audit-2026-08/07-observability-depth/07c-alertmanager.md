# 07c — Alertmanager tester: mute windows, root matchers, the group key

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or superpowers:executing-plans. Checkbox steps.

**Goal:** The tree walk (already faithful to `dispatch/route.go`) learns the two reasons a *matched* alert still doesn't page — `mute_time_intervals`/`active_time_intervals` — plus an error on root-level matchers, and renders the actual group key.

**Evidence:** zero repo hits for `mute_time_intervals`; `engine.ts:760-769` documents that root matchers are ignored but reports a clean walk (Alertmanager refuses that config at startup); `group_by` is echoed but the group key for the pasted labels is never computed.

**Files:**
- Modify: `src/lib/alertmanager-route-tester/engine.ts`, `src/components/AlertmanagerRouteTesterPlayground.astro`
- Test: `src/lib/alertmanager-route-tester/engine.test.ts`

### Task 1: time intervals

- [ ] **Step 1: Failing tests** — config with `time_intervals` (also accept legacy top-level `mute_time_intervals` definitions — both spellings exist in the wild; upstream renamed the section) defining `weekends`, route carrying `mute_time_intervals: [weekends]`:
  - Alert + evaluation time Saturday 12:00 UTC → result marks the matched route **muted**, names the interval, and the summary says "matched, but muted until Mon 00:00 UTC" (compute the boundary from the interval).
  - Same at Tuesday 12:00 → not muted.
  - `active_time_intervals` inverse case (active windows exclude the eval time → muted-equivalent status "outside active window").
  - Interval grammar vectors from upstream docs: `times: [{start_time: '09:00', end_time: '17:00'}]`, `weekdays: ['saturday', 'sunday']`, `days_of_month: ['1', '-1']`, `months: ['december']`, `years`, and `location: 'America/New_York'` — reuse `wall-clock.ts` from plan 03a for the location math (import it; do not duplicate zone logic).
  - Unknown interval name referenced by a route → config error finding (Alertmanager rejects it).
- [ ] **Step 2:** UI needs an evaluation-time input: add a single datetime field (default "now", UTC-labelled) beside the alert-labels editor — without it mute windows aren't testable. Keep it out of the URL hash seed-writes except on user-initiated evals (existing convention).
- [ ] **Step 3:** Implement interval parsing + containment testing per `timeinterval.go` semantics (each listed field is an AND across field types, OR within a list; document with the upstream file cited). Muted routes stay in the result tree with a distinct status — the walk result shape gains `muted?: {kind: 'mute' | 'inactive'; interval: string; until?: string}`.
- [ ] **Step 4:** Tests pass; commit `feat(alertmanager-route-tester): mute_time_intervals / active_time_intervals — "matched but silenced" is now visible`.

### Task 2: root matchers are a config error

- [ ] **Step 1: Failing test** — config whose root route carries `matchers: [team = x]` → error finding: "The root route cannot have matchers — Alertmanager refuses this config at startup (every alert must enter the tree)."
- [ ] **Step 2:** Implement at the `:760-769` site — severity error, walk still shown (it's what *would* happen if the matchers were removed, say so).
- [ ] **Step 3:** Commit `fix(alertmanager-route-tester): root matchers produce the startup error Alertmanager gives, not a silent walk`.

### Task 3: render the group key

- [ ] **Step 1: Failing test** — route `group_by: [alertname, cluster]`, alert `{alertname: X, cluster: c1, pod: p9}` → result includes `groupKey: '{alertname="X", cluster="c1"}'`; `group_by: ['...']` → the full label set; no `group_by` → inherited value (inheritance already works, `:473-488`).
- [ ] **Step 2:** Implement: compute from the matched route's effective `group_by` × the pasted labels; render under the receiver with the caption "alerts sharing this key arrive in one notification — everything else pages separately" (muted caption, glossary pattern).
- [ ] **Step 3:** Commit `feat(alertmanager-route-tester): show the computed group key — one page or fifty, answered`.

**Next step recorded, not built:** `inhibit_rules` needs a second alert-set input ("what else is currently firing") — a UI surface change worth its own child when demanded. Add to the page's "what this doesn't model" list now, in the same commit as Task 1's copy updates (5 locales).

**Done when** a Saturday-muted alert shows matched-but-muted with the unmute boundary, root matchers error, the group key renders, and the page's limitation list names inhibition.

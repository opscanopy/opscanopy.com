# Point fix 12 — perf & a11y quick wins: nine one-sitting fixes

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The audit's small-but-real findings, batched: each is one commit, independently shippable, none needs a child plan.

**Ordering:** Task 1 (gtag) must deploy together with or after plan 05a (the CSP hash set changes when the inline script changes — 05a's postbuild script absorbs it automatically as long as deploys go through `npm run build`).

### Task 1: gtag.js off the critical path

**Evidence:** `src/layouts/Layout.astro:91` loads `googletagmanager.com/gtag/js` in `<head>` on every page — a third-party DNS+TLS+~50KB contending with the font preloads, fetched even for non-consenting visitors (Consent Mode defaults denied at `:108-113`). The `gtag('config')` call is already idle-deferred at `:176-191`.

- [ ] Move the script-tag *injection* into that same idle block: keep the inline `dataLayer`/`gtag` shim + consent defaults synchronous (events buffer into `dataLayer`), create the `<script src>` element inside the existing `requestIdleCallback` callback.
- [ ] Verify: headless run — `gtag/js` request starts *after* first paint; a `result_copied` event fired before the script loads still reaches GA (buffered through `dataLayer`) once it does; consent denial still respected.
- [ ] Commit `perf(layout): gtag.js injected at idle — third-party origin off the critical path`.

### Task 2: fonts

**Evidence:** mono 500/600 imported (`global.css:11-13`) but only mono-400 preloaded (`Layout.astro:86`) → weight-shift FOUT on result values, the LCP content of tool pages. Full `@fontsource-variable/ibm-plex-sans` index import (`global.css:10`) drags 7 scripts' worth of `@font-face` declarations into the render-blocking sheet.

- [ ] Add `<link rel="preload">` for the mono-500 latin woff2 (600 stays lazy). Path: copy the exact pattern of the existing two preloads at `Layout.astro:85-86`.
- [ ] Change the sans import to `@fontsource-variable/ibm-plex-sans/latin.css` — **first grep the five locales' rendered text for latin-ext needs** (pt-BR: ã/õ/ç are latin-1, fine; but verify with a build + screenshot of the pt-br and fr homepages before merging; add `latin-ext.css` if anything renders tofu).
- [ ] Commit `perf(fonts): preload mono-500, trim sans to latin subsets`.

### Task 3: CM modulepreload priority

- [ ] In `scripts/inject-cm-modulepreload.mjs:110`, emit `fetchpriority="low"` on the injected links — keeps early discovery, yields to LCP on cold mobile. Verify one built page's HTML carries it; run the script's own self-checks (`npm run build`).
- [ ] Commit `perf(build): CM modulepreloads at fetchpriority=low`.

### Task 4: command palette focus + state

**Evidence:** `CommandPalette.astro:370-375` — `closePalette()` never restores focus (WCAG 2.4.3: Esc drops keyboard users at `<body>`); `:50` hardcodes `aria-expanded="true"`; results capped at 8 (`:314`) with no overflow row.

- [ ] Save `document.activeElement` on open; `.focus()` it on close (guard: element still in DOM, else focus the header search button).
- [ ] Toggle `aria-expanded` with actual state.
- [ ] Append a 9th row when results overflow: "See all N results →" linking `/search?q=<query>` (the search page reads its query param — verify; if it's hash-based, match it).
- [ ] Commit `fix(command-palette): focus restore, real aria-expanded, overflow to /search`.

### Task 5: ⌘K discoverability

**Evidence:** the only affordance is a caption at the bottom of tool pages (`ToolCrossLinks.astro:158`).

- [ ] Header: a `⌘K` / `Ctrl K` kbd-styled hint beside the search icon (render by `navigator.platform` sniff at boot; kbd styling from the design tokens; `aria-hidden` — it duplicates the button's accessible name). Ships via `Header.astro` — no per-locale nav-file change needed if it's an icon-adjacent hint, but confirm Header renders identically across locales.
- [ ] Commit `feat(header): make the command palette discoverable — visible shortcut hint`.

### Task 6: docker-run-to-compose third live region

**Evidence:** `DockerRunToComposePlayground.astro:204` — `#drc-warnings` is a second visible `role="status" aria-live="polite"` alongside `#drc-status` (`:173`) and `#drc-announce` (`:208`); warnings re-announce on every conversion. This is the exact shape `j5-keyboard-a11y.spec.ts:47-51` asserts against — the tool is just quarantined.

- [ ] Remove `role`/`aria-live` from `#drc-warnings` (it stays visible; the one-line `#drc-status` summary already announces "converted, N warnings"). Confirm `#drc-announce` is the sr-only copy-status (keep) and `#drc-status` the single visible region.
- [ ] Run the j5 journey against it (`OC_E2E_CANDIDATES=1 npx playwright test --grep docker-run-to-compose`) — a11y assertions must pass now.
- [ ] Commit `fix(docker-run-to-compose): one live region, not three`.

### Task 7: K8s per-field live regions

**Evidence:** `K8sResourceCalculatorPlayground.astro:763-765` — `setFieldError` creates a fresh `<p aria-live="polite">` per invalid field, injected simultaneously with its text (unreliably announced, up to 6 competing regions).

- [ ] Replace with `aria-invalid` + `aria-describedby` pointing at a static (non-live) error `<p>` per field; the single `role="status"` summary announces "3 fields need attention." **Skip if plan 07d is scheduled soon** — its rework includes this; do not touch the file twice. Coordinate via the 08b LEGACY list.
- [ ] Commit `fix(k8s-resource-calculator): field errors via aria-describedby, one live region` (or fold into 07d).

### Task 8: jq idle-load timeout

**Evidence:** `JqPlayground.astro:1795` — `requestIdleCallback` with no `{timeout}`; on a busy main thread the engine load has no upper bound (the gtag deferral at `Layout.astro:182` already does this right).

- [ ] Add `{ timeout: 3000 }`. Commit `fix(jq-playground): bound the idle engine load at 3s`.

### Task 9: RegexLogTester visible hint

**Evidence:** `RegexLogTesterPlayground.astro:63-65` — the "updates as you type" hint is sr-only; no Enter binding; red border flashes mid-composition (`:1349-1350`).

- [ ] Make the hint visible (the contract's exact line), bind Enter, add `ERROR_HOLD_MS = 600`. This is a partial 08-style touch — if 08b's Batch A reaches this file first, fold it there instead (coordinate via the LEGACY list).
- [ ] Commit `fix(regex-log-tester): visible hint line, Enter flush, calm errors`.

**Done when** all nine are deployed (or explicitly folded into 07d/08b where noted), the j5 a11y journey passes on docker-run-to-compose, and a Lighthouse run on one CM tool page shows gtag out of the critical request chain.

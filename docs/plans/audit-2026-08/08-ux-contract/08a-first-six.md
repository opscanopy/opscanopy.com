# 08a — rework the six worst playgrounds, promoting each into the E2E gate

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or superpowers:executing-plans. Checkbox steps.

**Goal:** Six playgrounds reach 7/7 contract compliance, one per commit, each promoted into `VERIFIED` E2E coverage on completion — fixes and enforcement land together.

**The per-playground checklist** (identical for all six; port every pattern from `src/components/CidrCheckerPlayground.astro`, the named reference — read it top to bottom once before starting playground #1):

- [ ] Example **chips** replace `<select id="*-example">`: squared `var(--radius-pill)` chips, canvas bg, hairline shadow, brand-strong text, active = brand-soft bg + inset brand ring, 44px min-height under `(pointer: coarse)`.
- [ ] Live eval: single debounce in 130–220 ms; the **byte-exact** hint line `Results update as you type — press Enter to run now.`; Enter flushes immediately (textarea: let the newline insert, `setTimeout(evaluate, 0)`; Ctrl/⌘+Enter runs+blurs).
- [ ] Calm errors: `ERROR_HOLD_MS ≈ 600` — no red border mid-composition; specific diagnostics only (engine-side wording already exists for most).
- [ ] Copy: per-row copy buttons (icon-swap, execCommand fallback, 44px coarse), `data-copy-all` button, `data-copy-link` share button hidden until valid.
- [ ] a11y: results container NOT `aria-live`; exactly one visible `role="status"` one-line summary; one sr-only `role="status"` copy-status span; every icon-only button labelled.
- [ ] All injected values through `escapeHtml()` (already true — don't regress it).
- [ ] Glossary terms as muted captions, not tooltips.

**Per-playground process (repeat ×6, one commit each):**

1. Rework against the checklist.
2. Headless verify per `.claude/skills/verify/SKILL.md` (seed example renders, chips switch examples, Enter flushes, copy buttons fire the sr-status, share link appears only on valid input).
3. Un-quarantine the tool's fixture: run `OC_E2E_CANDIDATES=1 npx playwright test --grep "<slug>"`, fix fixture drift (selectors/seeds — the fixtures were authored blind, per `tools.fixtures.ts:150-170`), then add the slug to `PROMOTED_SLUGS`.
4. Re-run the promoted set twice, no flake — the repo's own promotion bar.
5. Commit: `refactor(<slug>): UX-contract rework to 7/7 + E2E promotion`.

**Playground-specific notes:**

1. **IpConverterPlayground** — `<select id="ipc-example">` at `:26` goes; note its `.ipc-chip` classes are cross-tool *link* chips (an unrelated feature) — leave those, name the new example chips differently. Remove the stale "reference implementation" hazard by updating any doc that still points here (CLAUDE.md already warns; after rework, soften that warning to past tense).
2. **CronTesterPlayground** — **execute as part of plan 03c's touch** (TZ chips + contract rework, one commit pair). Debounce is 120 ms (`:737`) → raise into the 130–220 band; add the missing sr-only copy-status.
3. **PtrHelperPlayground** — smallest file of the six; do it second to calibrate effort.
4. **SubnetSplitterPlayground** — schedule after plans 02e + 06a (both touch it); the many-row split table is the `data-copy-all` showcase — copied text must include the provider-adjusted counts when a provider chip is active.
5. **Base64Playground** — hard-excluded from auto-restore (plan 01 keeps it that way) — the share/`data-copy-link` button is **deliberately absent** for secret-safety, matching `EnvCheckerPlayground:189`'s pattern of printing the reason on-screen. 6/7 + printed reason = compliant here; the contract-lint (08b) needs an allowlist entry for it, with the on-page reason as the requirement.
6. **GithubActionsExpressionPlayground** — two `<select>`s (`:64`, `:125`) become two chip rows; the paraphrased hint ("press ⌘/Ctrl + Enter") becomes the exact line; merge the two visible live regions into one `role="status"` summary. This is a CM playground — keep the Escape binding intact (it's there, `:486`).

**Done when** all six are in `PROMOTED_SLUGS`, each passed twice clean, and the fixture count in `VERIFIED` reads 17.

# Mission 90 — Round 2 Plan: Tier-1 polish · dormant missions · Pagefind

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Controller owns ALL git; implementers never commit.
>
> Companion docs in this folder: [PLAN.md](PLAN.md) (Phase A) · [ENGINE-SPEC.md](ENGINE-SPEC.md) · [CONTENT-SPEC.md](CONTENT-SPEC.md) · [UIUX-SPEC.md](UIUX-SPEC.md) · [SEO-MARKETING.md](SEO-MARKETING.md)

**Goal:** finish the buildable remainder of the Mission-90 roadmap while the content frontier (Days 2–7, user-authored) catches up: the two Tier-1 UX polish items, all 8 remaining mission configs as **dormant build-ahead inventory**, and site-wide **Pagefind** search. Nothing in this round flips live and nothing deploys without the user's explicit go.

**Baseline (Round 1, live on Cloudflare `79e70d5b…`):** launch-readiness Tier 0 (status-driven hub, one-primary-CTA, author block, "what's live" FAQ, zero-backend notify-me, RSS, per-day OG, SEO `lastmod`, GA4 activation events), victory/completion share, day Q&A copy-share, static mission framing, the engine expansion (scripted commands + generalized `MissionEffect` + 5 state-based objective triggers), and 5 review-driven fixes. Live content = Day 1 + `week1-server-down` only; Days 2–7 committed `draft:true` awaiting the user's real WSL2 lab + "Real Errors I Hit."

**Validation:** this plan passed a 39-agent review (persona/journey · UX+a11y+design-system · product/website lenses; every finding verified by validity + materiality skeptics). All three verdicts: *plan shape right; defects in execution details.* 18 confirmed findings are folded in below (marked 🔎). Headline: the first draft repeated **trap #1** — it routed the Search nav entry to `src/data/site.ts` `navLinks`, which the Header does not read; three lenses caught it independently. The stale root-`CLAUDE.md` claim that caused it is fixed as part of this round.

---

## Guardrails (every task)

- ⓥ **No Mission-90 surface may render a metric that can *decrease* on a time gap.** The cumulative "{done} of 90" is the only safe positive metric.
- **One `btn-primary` per viewport**; new affordances subordinate. Design system: light-first, tokens only, NO `dark:` variants, no emoji chrome (inline SVG), literal colors only on `bg-inverse` surfaces.
- **A11y is a review gate:** keyboard nav, focus behavior, `role`/live-region discipline, reduced-motion, AA contrast on every new surface.
- All localStorage access try/catch; every surface renders with storage blocked. Every commit leaves `npm run test` + `npm run build` green.
- Engine never throws on user input; missions are config-only (zero engine domain logic).
- **Nothing flips live; nothing deploys without explicit user go.** The two registry live-set test assertions (`src/lib/mission90/mission90.test.ts:127` days `[1]`, `:133` missions `['week1-server-down']`) must pass **unedited** — that is the proof nothing leaked.
- ⓥ **Contended files (one owner each, never parallel writers):** hub `src/pages/mission-90/index.astro` script · `src/lib/mission-sim/missions/_validation.ts` · `package.json` + `astro.config.mjs` · `src/styles/global.css` · 🔎 `src/i18n/site/*.ts` + `src/i18n/utils.ts` (nav + `ENGLISH_ONLY_SECTIONS` — **not** `src/data/site.ts`, see trap #1).

---

## Part A — Tier-1 UX polish

### A1 · Welcome-back = enrich the existing resume banner (NOT a toast)
- [ ] Add a warm, 🔎 **metric-free** lead line to the returning-learner resume banner (`index.astro:191-209`, filled by `render()` `:782-796`) — e.g. *"Welcome back — picking up where you left off."* or *"Welcome back — Day {n} is ready when you are."*
- 🔎 The `{done} of {total}` count must NOT appear in the lead: `M90ProgressCard` already renders it inside the same banner (`:206`/`:792`) and the hero returning-CTA caption repeats it (`:779`). Three renderings of one number in a viewport reads robotic.
- 🔎 If the lead reuses "picking up where you left off," drop that phrase from the caption (or vice versa) — the banner owns the welcome-back beat.
- 🔎 Metric-free copy also hardens the `done===0`-with-progress returning state (`hasProgress` `:754-755` admits done=0 via `startedAt`/`lastVisitedDay`): never render a "0 of 90" greeting.
- 🔎 The lead is a styled `<p>`/`<span>`, **not a heading** — the banner precedes the page `h1`. Single affordance; cold-start unchanged.

### A2 · Multi-tab progress sync
- [ ] Add a try/catch-guarded `window.addEventListener('storage', …)` filtered to `e.key === 'oc-m90-v1'` to **all five** reader scripts, re-invoking the existing render/sync path (no schema change, no new write path):
  1. hub `index.astro` → `render()`
  2. `MissionDay.astro` → `syncPhaseStrip()`
  3. `M90DayTable.astro` → its table `render()`
  4. `missions/index.astro` → `enhance()`. 🔎 **Fix the pre-existing fresh-load bug in the same edit:** `enhance()` is bound only to `astro:page-load` (`:187`), which never fires without a ClientRouter — call `enhance()` at module scope before binding (repo convention: `M90DayTable.astro:584`). Without this the completed-mission card ("victory stats = merit signal") never renders on any fresh visit.
  5. 🔎 `M90CompleteCheck.astro` → re-run the boot read (recompute done, set `cb.checked`, `applyState`). Side-effect-free by construction: programmatic `checked` assignment doesn't fire `change`; the pop animation + GA4 `day_complete` live only in the `change` handler — assert in verification.
- 🔎 **Silent-by-design:** cross-tab re-renders make no announcements, steal no focus, trigger no scroll.
- Motivating case: `MissionTerminal` victory (`:869`) writes progress but dispatches no event — cross-tab sync is the only way other surfaces reflect it.

**Ownership:** one owner for all of `index.astro` (A1 + A2-hub); one for the day-page pair (`MissionDay` + `M90CompleteCheck`); one for `M90DayTable` + `missions/index`.

---

## Part B — 8 dormant mission configs (build-ahead, stay `planned`)

Template: **`week3-locked-file.ts`** (config-only scripted commands + generalized effects + state-based objectives). Each mission = `<id>.ts` + `<id>.test.ts` in `src/lib/mission-sim/missions/` — disjoint, file-parallel. **Do not touch:** the registry (entries exist as `planned`), `missions/[id].astro` (auto-excludes planned), `MissionTerminal.astro` `missionModules` (live-only). Go-live later = 2 lines per mission, a separate user-gated step.

### Shared authoring rules
- [ ] **`_validation.ts` first (contended):** factor the scripted-config guards out of `week3-locked-file.test.ts` into `validateMissionConfig(config)` + `STATE_WHENS = ['flagSet','flagIs','fileContains','processStarted','processGone']` (Week 3's local list omits `processGone`). All 8 test files import it.
- Config skeleton: id/title (= registry title)/week/unlockAfterDay · `story` ends with "type `help`" · `filesystem` with real evidence contents · minimal `processes` · seed `flags` false · scripted `commands` · objectives = orient/read on **read-only** verbs → remediation on the scripted verb via a **state-based** `when` · progressive `hints` (orient → exact fix).
- Fix-verb response order: `already-done (flag match, no effect)` → `success (fix tokens + precond, out/sys + effect)` → `not-yet (fix tokens, out, no effect)` → honest diagnostic `default`. Effects: `setFlags` + `appendFiles` to evidence (never `writeFiles` over an evidence path) + optional `writeFiles` to a separate status file.
- **Engine rule:** any `err` line ⇒ zero objectives complete (`objectives.ts:27`) — precondition messages are `out`/`sys`, never `err`. On an effect-carrying verb, only the remediation objective may be gated, state-based only.
- Test structure per mission: config-validation via helper · intended playthrough (per-step `completed`, final victory, evidence preserved) · anti-soft-lock fix-first · scrambled order incl. a `grep`-piped step · UX checklist (non-empty outputs/default, last hint contains the exact fix string; ordered-fix missions assert premature fix returns the `out` precondition and completes nothing).

### The missions

| id (day, host) | Premise | Fix | Obj | Remediation trigger |
|---|---|---|---|---|
| week2-dns-detective (14, prod-web-03) | Round-robin still serves decommissioned `203.0.113.99`; DNS-as-code | `git revert 9c1f` | 4 | `flagSet:dnsFixed` |
| week4-docker-rescue (28, prod-web-04) | `web` crash-loops `ECONNREFUSED db:5432` — bare `docker run`, no stack | `docker compose up -d` | 4 | `flagSet:stackUp` |
| week6-broken-pipeline (40, ci-runner-01) | Publish job `denied: authentication required` — rotated token never re-added | `gh secret set REGISTRY_TOKEN …` | 4 | `flagSet:secretSet` |
| week7-aws-bill-shock (49, ops-jump-01) | Bill ×3: forgotten `p3.2xlarge` `DELETEME`, 26d | `aws ec2 terminate-instances --instance-ids i-0abc123def` | 4 | `flagSet:billFixed` |
| week8-database-recovery (56, ops-jump-01) | `DROP TABLE orders`; restore latest **pre-drop** snapshot, verify | `aws rds restore-…` → `psql` verify | 5 | `flagSet:restored` + gated `psql outputMatched` |
| week11-kubernetes-chaos (73, kube-bastion) | Pending + CrashLoopBackOff: `db-credentials` Secret deleted | `kubectl create secret generic db-credentials …` | 5 | `flagSet:secretRestored` |
| week12-terraform-trouble (80, tf-runner) | Stale state lock + drift; unlock **then** apply | `terraform force-unlock 7f3a9b2c` → `terraform apply` | 4 | `flagSet:unlocked` → `flagIs:applied` |
| final-midnight-outage (90, warroom) | Capstone cascade: SG revoked 443 → failover pod CrashLoops on missing Secret; fix upstream-first, verify DNS healed | `aws …authorize-security-group-ingress` → `kubectl create secret …` (gated `sgFixed`) → `dig` verify (gated `k8sFixed`) | 6 | `sgFixed` → `k8sFixed` → `dig outputMatched` |

Design notes: diagnostic verbs carry no effects (safe for `outputMatched`); player-typed secrets/tokens are ignored (fixed-token matching, no interpolation); multi-symptom incidents reframed to a single decisive fix with read-only red herrings (signal-vs-noise).

### Build order
- [ ] 1. `_validation.ts` (serialize) → 2. week4 (reference) → 3. week6 ∥ week7 → 4. week2 ∥ week8 ∥ week11 → 5. week12 → 6. capstone **last**.
- 🔎 Product-review confirmed: technical de-risking beats "nearest content frontier" ordering — all 8 ship this round and none can go live before its intro days.
- Boundary strains (both reframed, build now): week2 DNS-mutation → DNS-as-code `git revert`; capstone is breadth (6 obj, 3 verbs, flag-chaining), build after weeks 7/11 exist.

---

## Part C — Pagefind site-wide search (Giscus + PDF stay blocked)

- [ ] **Pipeline:** `pagefind` devDep; npm `"postbuild": "pagefind --site dist"` (build auto-indexes into `dist/pagefind/`, shipped by the existing wrangler deploy). Update root `CLAUDE.md` deploy note; 🔎 in the same edit **fix its stale nav claim** ("change nav in `src/data/site.ts`") to point at `src/i18n/site/` + `getSiteContent` — that stale line mis-routed this plan's first draft.
- [ ] **Indexing scope:** `data-pagefind-body` on the main content region (`Layout.astro`/`Shell.astro`); `data-pagefind-ignore` on Header/Footer/nav chrome and 🔎 on non-content pages (`/search` itself, 404, legal/utility) — a search result pointing at the search page is noise.
- [ ] 🔎 **Nav (trap #1, corrected):** Header reads nav via `getSiteContent(lang)` (`Header.astro:25`; desktop `:68`, mobile overlay `:213`) from `src/i18n/site/{en,de,es,fr,pt-br}.ts` — **never** `src/data/site.ts` `navLinks` (legacy; tool-page-only). Follow the English-only-section precedent (`/learn`, `/mission-90`): add `{ href: '/search', label: … }` to **all five** locale nav arrays (en "Search", de "Suche", es "Buscar", fr "Recherche", pt-br "Buscar" — each file's register governs) and add `'/search'` to `ENGLISH_ONLY_SECTIONS` (`src/i18n/utils.ts:80`) so locale headers link the English page unprefixed (no `/de/search` 404s). 🔎 Verify a **fifth** nav item fits at md breakpoints in all 5 locales; if it wraps, fall back to a search icon-button in the right action cluster.
- [ ] **UI — `/search.astro` (en):** 🔎 **Pagefind JS API + hand-built UI** (own input/results markup, tokens only) — do NOT patch Pagefind's default UI bundle (retrofitting a11y onto a third-party re-rendering DOM fights the library). Contract: `role="search"` landmark, labeled input, ↑/↓/Enter/Escape keyboard nav, single `role="status"` live region for result counts, managed focus, reduced-motion, AA, calm empty state.
- [ ] 🔎 **Escaping:** Pagefind excerpts are HTML with `<mark>` — documented exemption: render via `innerHTML` only after sanitizing to a `<mark>`-only whitelist; titles/URLs still go through `escapeHtml()`.
- [ ] 🔎 **SEO:** `/search` ships `noindex` and is excluded from the sitemap.
- [ ] 🔎 **Analytics:** GA4 `search_performed` (count only, **no query text**), following the Round-1 guarded `gtag` pattern.
- 🔎 **Multilingual (fact):** Pagefind indexes per `<html lang>` and searches only the page's language index — `/search` (en) returns **English pages only**. Accepted v1 (all documented personas consume English content); localized pages remain indexed for a per-locale follow-up. Stated exemption from the 5-locale page-copy rule — do not "fix" by building locale search pages this round.
- **Blocked, not this round:** Giscus (needs user's repo + Discussions + category IDs, and an audience) · PDF lead magnet (≥ ~1,000 users rule).

---

## Explicitly NOT in scope
Days stay `draft`, missions stay `planned` (live-set test gates unedited = proof) · no `missionModules`/`[id].astro` edits · Giscus/PDF/monetization/per-locale search · the user's Days 2–7 lab + Real Errors · no deploy without explicit go.

## Verification
- Per task: `npm run test` + `npm run build` green; a11y gate on A1 + `/search`.
- Missions: all prior engine tests pass **unedited**; live-set assertions unchanged; `dist/` emits no new mission play pages.
- Polish: two-tab check — day-tick in tab A → tab B hub re-renders AND day page updates **both** phase strip and completion band with **no GA4 event in tab B**; welcome-back lead metric-free, returning-only, storage-blocked-safe. Seed a completed `week1-server-down` → **fresh solo load** of `/mission-90/missions/` renders the "Completed · Replay + stats" card (proves the boot fix).
- Pagefind: `dist/pagefind/` present; Search entry in desktop nav + mobile overlay; localized page links `/search` unprefixed; English term hits; German-only phrase → calm empty state (per-language index model); keyboard + `role=status` counts; `noindex` + sitemap absence; `search_performed` fires.
- End-to-end: settled build (clear `dist`/`.vite`/`.astro` on collision), full test suite, final multi-agent adversarial review. Deploy only on explicit go; `npm run indexnow` after a publish deploy.

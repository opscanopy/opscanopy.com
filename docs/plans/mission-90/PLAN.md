# Mission 90 Days DevOps — Implementation Plan (Phase A MVP)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> Companion docs in this folder: [ENGINE-SPEC.md](ENGINE-SPEC.md) · [CONTENT-SPEC.md](CONTENT-SPEC.md) · [UIUX-SPEC.md](UIUX-SPEC.md) · [SEO-MARKETING.md](SEO-MARKETING.md) · [REVIEW.md](REVIEW.md)

**Goal:** Ship "Mission 90 Days DevOps" — a free 90-day guided DevOps program (visual roadmap + daily lessons + browser terminal mission games) — as a **standalone top-level section** of OpsCanopy at `/mission-90/` with its **own header nav item ("90 Days DevOps")**. It is NOT nested under Learn; Learn only cross-promotes it.

**Architecture:** Standalone top-level site section (`src/pages/mission-90/`), peer to Tools/Learn/Blog, with cross-promotion from the Learn hub and homepage. A typed curriculum registry (`src/data/mission90.ts`) + a `mission90Days` content collection drive all pages; a pure TS game engine (`src/lib/mission-sim/`) powers the terminal missions via a thin Astro island; one versioned localStorage blob (`oc-m90-v1`) read through one pure module (`src/lib/mission90/progress.ts`) binds roadmap ↔ days ↔ missions into a single product. 100% static, zero backend, ships with the existing `wrangler deploy`.

**Tech stack:** Astro v6 (content layer, `glob` loader), Tailwind v4 CSS-first tokens (`src/styles/global.css` @theme), plain `<script>` islands (`astro:page-load` boot), Vitest (node env), Cloudflare static assets.

---

## Context

- **Why:** OpsCanopy has 25+ tools and a reference-style `/learn` section (guides + roadmaps). Mission 90 adds the *guided program* layer — the habit product that makes visitors return daily and converts learners into tool users. Product doc: see `docs/plans/mission-90/README.md` §source.
- **Locked decisions (user-confirmed 2026-07-03):**
  1. Built **inside** my-project as a `/learn` section (not a standalone site).
  2. **OpsCanopy design system** (light-first, existing theme toggle); terminal/game/code surfaces on the dark-stable inverse surface (`bg-inverse text-inverse-fg`). The product doc's aubergine/orange theme is dropped.
  3. Game engine built **from scratch, TDD**, per the repo engine pattern. No prototype port.
  4. Content = **structure + Day 1 exemplar** (+ Day 0 setup page). Days 2–90 authored later, learn-in-public.
  5. MVP = Phase A only. UX/SEO/marketing best practices baked in (see companion specs).
- **North-star metric:** Day-7 completions (proxy: Cloudflare Analytics pageviews `/mission-90/day/7/` vs `/day/1/`).

## Canonical names (normalized across all planning slices — do not drift)

| Thing | Canon |
|---|---|
| Routes | **Top-level, own section:** `/mission-90/` (hub), `/mission-90/setup/` (Day 0), `/mission-90/day/[day]/`, `/mission-90/missions/`, `/mission-90/missions/[id]/`. Breadcrumbs: Home → 90 Days DevOps → … (no Learn level). |
| Nav | Own header nav item: `{ href: '/mission-90/', label: '90 Days DevOps' }` — 4th top-level entry beside Tools/Learn/Blog. |
| Registry | `src/data/mission90.ts` (exports: `program`, `phases`, `days`, `missions`, `liveDays`, `getDay`, `phaseForDay`) |
| Collection | `mission90Days` → `src/content/mission90/day-001.md` … |
| Engine | `src/lib/mission-sim/` — `types.ts`, `parser.ts`, `filesystem.ts`, `commands.ts`, `objectives.ts`, `engine.ts` (façade), `engine.test.ts`, `missions/week1-server-down.ts`, `missions/week1-server-down.test.ts` |
| Mission availability | `status:'live'` missions are **always playable** (free-play; `unlockAfterDay` drives badge copy only). Hard unlock = Phase B toggle. `status:'planned'` missions render a non-playable "In production" card. |
| Brand/SEO suffix | Title suffix canon: `— Mission 90, Day {N}` (avoids collision with the established "90DaysOfDevOps" brand). Guide-callout canon: "Prefer a day-by-day path? This is Day N–M of Mission 90." |
| Progress lib | `src/lib/mission90/progress.ts` + `progress.test.ts` (pure; DOM/localStorage glue stays in page scripts) |
| Components | `src/components/mission90/` — `MissionDay.astro`, `M90DayTable.astro`, `M90ProgressCard.astro`, `M90StateCta.astro`, `M90CompleteCheck.astro`, `MissionCard.astro`, `MissionTerminal.astro` |
| localStorage | **one key** `oc-m90-v1` = `{ startedAt, lastVisitedDay, days: { "1": { completedAt } }, missions: { "week1-server-down": { completedAt, commands, hints, seconds } } }` (versioned, defensive parse; `oc-` prefix per repo convention) |
| JSON-LD | existing `techArticleLd`, `faqPageLd`, `breadcrumbLd`, `softwareAppLd` + **new** `courseLd()` in `src/lib/jsonld.ts` |
| Phases | 1 Foundations d1–20 · 2 Containers & CI/CD d21–45 · 3 Cloud d46–65 · 4 Orchestration & IaC d66–85 · 5 Job Ready d86–90. Project days 41–45, 62–65, 81–85. Mission days: 7, 14, 21, 28, 40, 49, 56, 73, 80, 90 (deliberate deviation from strict every-7th to avoid project blocks — enforced by data test). |

## ⚠ Implementation traps (verified against the repo)

1. **Nav source:** Header/Footer read `src/i18n/site/en.ts` (`nav:` at :35–39, footer Learn column at :52–60) — **NOT** `src/data/site.ts` `navLinks` (only tool pages use that). Editing site.ts does nothing visible.
2. **No thin pages:** `getStaticPaths` builds **only `status:'live'` registry days** (join registry × collection by `data.day`; throw on mismatch = build-time consistency check). Draft days render on the hub as plain text "Drops soon" — never links. Sitemap needs no config change (`astro.config.mjs` filter untouched).
3. **Inverse-surface colors are literal**, not tokens: `text-white/80`, `#34d399`, `#ff6166`. Rationale: inverse surfaces stay dark in BOTH themes while tokens follow the page theme — light-theme `--color-error` #ee0000 computes ~3.9:1 on #171717 (fails AA); the dark-theme token value happens to pass, which is exactly why relying on theme-flipping tokens here is a trap. Precedent: `CodeBlock.astro`.
4. **Engine loads only via dynamic import inside the island's boot closure** (code-splits away from hub/day pages). `missions` registry in `data/mission90.ts` holds metadata only — never imports engine code.
5. **`Roadmap.astro` is NOT reused** (different data shape + write path). New `M90DayTable.astro` copies its proven idioms: `.rm-*` CSS patterns, `rm-pop` keyframe, `role="progressbar"`, try/catch localStorage, `astro:page-load` + `dataset` re-init guards.
6. **Emoji → inline SVG** in UI chrome (🎮/🏗 markers become 14px SVG glyphs inside `Badge.astro` slots). Repo never ships emoji chrome.
7. Vitest: keep `fileParallelism: false` (Windows worker crash workaround). Run single file: `npx vitest run src/lib/mission-sim/engine.test.ts`.

## File map

### Create
| Path | Responsibility |
|---|---|
| `src/data/mission90.ts` | Curriculum registry: types, `program`, 5 `phases`, all 90 `days`, 10 `missions` (metadata only), helpers. Single source of truth. Full curriculum table: [CONTENT-SPEC.md](CONTENT-SPEC.md) §2. |
| `src/lib/mission90/mission90.test.ts` | Data-validation test (mirrors `src/lib/learn/learn.test.ts`): 90 unique contiguous days, unique slugs, phase ranges exact, project days = 41–45/62–65/81–85, mission days = the canon list, every `missions[].unlockAfterDay` is a `hasMission` day, `hasMission` days ↔ `missions[].id` is a bijection, registry minutes sum matches the hub's "~80 hrs core" caption source. (Live-day ↔ collection-entry cross-check lives in T3, after the collection exists.) |
| `src/lib/mission90/progress.ts` + `progress.test.ts` | Pure: `parseProgress(raw: string|null): M90Progress` (defensive), `doneCount`, `nextDay`, `phaseProgress`, `streak(dates, today)` (consecutive local days ending today/yesterday; shown only ≥2). |
| `src/content/mission90/day-001.md` | Day 1 exemplar ([CONTENT-SPEC.md](CONTENT-SPEC.md) §4). |
| `src/lib/mission-sim/*` | Game engine ([ENGINE-SPEC.md](ENGINE-SPEC.md)). |
| `src/pages/mission-90/index.astro` | Hub: resume card → hero (MeshGradient) → 3-layer model → phase journey → missions teaser → 90-day accordion table → FAQ → final CTA ([UIUX-SPEC.md](UIUX-SPEC.md) §2, IA per [SEO-MARKETING.md](SEO-MARKETING.md) §5). |
| `src/pages/mission-90/setup.astro` | Day 0: WSL2/Ubuntu 24.04 lab setup (~20 min, uncounted — protects the Day 1 time promise). |
| `src/pages/mission-90/day/[day].astro` | Day route; `getStaticPaths` per trap #2; renders `MissionDay`. |
| `src/pages/mission-90/missions/index.astro` | Mission list (10 cards; playable/completed/planned client-side per UIUX §4). |
| `src/pages/mission-90/missions/[id].astro` | Play page (only `status:'live'` missions); hosts `MissionTerminal`; `softwareAppLd`. |
| `src/components/mission90/*` | Seven components ([UIUX-SPEC.md](UIUX-SPEC.md) component register). |
| `public/mission-90/mission-90-hero.svg` | OG source (1200×630-safe); day diagrams also live under `public/mission-90/`. |
| `docs/mission90-authoring.md` | Authoring rules ([CONTENT-SPEC.md](CONTENT-SPEC.md) §3 ships as this file). |

### Modify
| Path | Anchor | Edit |
|---|---|---|
| `src/content.config.ts` | `export const collections = { blog, guides };` (:60) | Add `mission90Days` collection ([CONTENT-SPEC.md](CONTENT-SPEC.md) §1). |
| `src/lib/jsonld.ts` | after `techArticleLd` (:90) | Add `courseLd({name, description, url}, phases, totalMinutes)` → schema.org `Course` + `hasCourseInstance` (free, online, `courseWorkload` = **total** program workload computed from the registry minutes sum, e.g. `PT79H` — NOT per-day) + `syllabusSections`. ALSO extend `techArticleLd` with optional `author?: { name: string; url?: string }` (Person) — it currently hardcodes Organization (:109), and the E-E-A-T plan needs a Person author on day pages. |
| `src/lib/remark-callouts.mjs` | label map (:10–15) | Add `real-error` type, labels `['real error', 'error i hit']`. CSS block beside existing `data-callout` rules ([UIUX-SPEC.md](UIUX-SPEC.md) §3 item 6). |
| `src/i18n/site/en.ts` **+ the 4 locale siblings** (`es.ts`, `de.ts`, `fr.ts`, `pt-br.ts`) | `nav:` array (:35–39 in en.ts) + footer Learn column (:52–60) | **Add the top-level nav item** `{ href: '/mission-90/', label: '90 Days DevOps' }` after Learn. Each locale file defines its own `nav` — add it to all 5 (label stays the English brand; the target page is English-only). Also add `{ href: '/mission-90/', label: '90 Days DevOps' }` to the footer Learn column (cross-promo link only — the section itself is NOT part of Learn). Verify header width with 4 items on md screens (mobile overlay reads the same source). |
| `src/pages/index.astro` | learn band | Add Mission 90 flagship card to the homepage learn band (mirrors the `/learn` banner treatment) — top-traffic distribution. |
| `src/components/MegaMenu.astro` | Explore strip (:117–127) | Add Mission 90 anchor **with `data-mega-lb`** (enrolls in focus-trap + close wiring, zero script changes). |
| `src/pages/learn/index.astro` | devops flagship banner (:55–87) | Insert a Mission 90 **cross-promo** banner above it linking OUT to `/mission-90/` (same markup shape); retitle devops eyebrow to "Or explore · the reference path". Learn does not host the program — it advertises it. |
| `src/data/track-icons.ts` | `trackIcons` (:6–21) | Add `'mission-90'` stroke icon. |
| `scripts/gen-og-images.mjs` | `blogDir` (:9) | Also scan `public/mission-90/` for `-hero.svg`. |
| `CLAUDE.md` | Architecture section | Document the registry/collection/engine trio + progress key. |
| 7 existing guides (`src/content/guides/**`) | end matter | Add "Prefer a day-by-day path? This is covered in Mission 90 Days N–M" callout (authority pass-through). |

### Explicitly NOT modified
`astro.config.mjs`, `wrangler.jsonc`, `src/pages/rss.xml.ts`, `src/data/site.ts`, `vitest.config.ts`, `src/data/learn.ts` (Mission 90 is not a `Track` — TrackCard would mislabel it "0 guides").

---

## Task sequence

Execution order chosen so every commit leaves the site green (`npm run build` + `npm run test` pass). TDD for all pure TS; build+manual verify for Astro templates. Conventional commits; one commit per task.

### T1 — Registry: `src/data/mission90.ts` + data test
- [ ] Write `src/lib/mission90/mission90.test.ts` first (assertions listed in File map). Run `npx vitest run src/lib/mission90/mission90.test.ts` → fails (module missing).
- [ ] Create `src/data/mission90.ts` with types + `program` + `phases` + all **90** day entries + 10 `missions` from [CONTENT-SPEC.md](CONTENT-SPEC.md) §2 (types in §2.1). Day 1 `status:'live'`, rest `'draft'`; mission `week1-server-down` `status:'live'`, rest `'planned'`.
- [ ] Test passes → `git commit -m "feat(mission90): curriculum registry + data validation tests"`

### T2 — Progress lib (TDD)
- [ ] `progress.test.ts`: defensive parse (null/garbage/missing keys → empty progress), `doneCount`, `nextDay` (lowest un-done live day), `phaseProgress`, `streak` vectors (gap→0; today+yesterday→2; only-yesterday→1 treated as continuable; ≥2 display rule is caller's).
- [ ] Implement `src/lib/mission90/progress.ts` (pure, no DOM). Tests pass. Commit `feat(mission90): pure progress/streak helpers`.

### T3 — Content collection + Day 1 + Day 0
- [ ] Add `mission90Days` to `src/content.config.ts` (schema: [CONTENT-SPEC.md](CONTENT-SPEC.md) §1 — `day`, `title`, `description`, `phase`, `minutes`, `goals` (len 3), `tomorrow`, `interviewQA` (3–5 q/a), `goDeeperMinutes?`, `updatedDate?`, `draft`).
- [ ] Extend the T1 data test: every `status:'live'` registry day has a non-draft collection entry, AND registry title/minutes/phase match that entry's frontmatter (the fields are duplicated by design — the test keeps them honest).
- [ ] Add `real-error` callout to `remark-callouts.mjs` + CSS.
- [ ] Author `src/content/mission90/day-001.md` per [CONTENT-SPEC.md](CONTENT-SPEC.md) §4 and `docs/mission90-authoring.md` (§3 rules verbatim).
- [ ] Author `setup.astro` content (WSL2 install, systemd check, verification block).
- [ ] `npm run build` green. Commit `feat(mission90): day content collection, authoring rules, day 0 + day 1`.

### T4–T9 — Game engine (TDD, [ENGINE-SPEC.md](ENGINE-SPEC.md) task-by-task)
- [ ] T4 types + parser (tokenizer, single-pipe support) — test vectors in spec §5.
- [ ] T5 virtual filesystem (resolve `~`/relative/`..`, ls/cat semantics, never-throw error lines).
- [ ] T6 commands: `pwd ls cd cat` group, then `grep ps kill help hint` group (realistic bash/GNU error strings; `kill` state-transition mechanic).
- [ ] T7 objectives state machine (declarative `ObjectiveTrigger` matchers, ordered completion events).
- [ ] T8 `engine.ts` façade (`createMission(config)`, `runCommand(state, input)` pure transition) + victory stats/rank.
- [ ] T9 `missions/week1-server-down.ts` full config + **config-validation test** (triggers reference supported commands; all paths exist in fs; hints ≥ objectives−1; optimalCommands sane).
- [ ] Each sub-task: red → green → commit (messages in spec).

### T10 — MissionTerminal island (+ minimal play route)
- [ ] Create a **minimal** `missions/[id].astro` route (getStaticPaths over `status:'live'` missions, bare Shell + island — masthead polish comes in T13) so the island is verifiable in this task.
- [ ] Build `MissionTerminal.astro` per [UIUX-SPEC.md](UIUX-SPEC.md) §4: CodeBlock-chrome chassis, `role="log"` output pinned-to-bottom (unless user scrolled up), real labelled `<input>` with `autocapitalize="none" autocorrect="off" spellcheck="false" enterkeyhint="send"` (mobile keyboards WILL mangle commands otherwise), no autofocus, Escape blurs, ↑/↓ history, objectives HUD (sticky desktop / `<details>` drawer mobile), progressive hints (data-driven count, rank-cost framing — no points system exists), inline victory state (focus moved to heading; shows stats + **rank** + share block; replay keeps best stats), `escapeHtml` on ALL output, engine via dynamic import in boot closure, reduced-motion guards.
- [ ] Manual verify (`npm run dev` → `/mission-90/missions/week1-server-down/`): full keyboard playthrough; **kill-first speedrun completes all objectives (no soft-lock)**; wrong-pid kill; hint costs reflect in rank; victory stats write `oc-m90-v1`. Commit.

### T11 — Day page + components
- [ ] `MissionDay.astro` (GuidePost-derived: reading-progress bar, `.rich-text`, breadcrumb, meta row with phase strip + time chip, goals card, Q&A `<details>` list, Go Deeper collapsed, orientation banner for cold visitors) + `M90CompleteCheck.astro` (checkbox band — toggle-off allowed, no confirm; tomorrow-teaser momentum swap; prefetch next on complete; **when next is draft, promote "Play Mission 1 — free-play, no setup" as the primary CTA** + "Back to roadmap" secondary — the launch-day path must never dead-end).
- [ ] `day/[day].astro` route (trap #2 join; `techArticleLd` **with Person author** + `faqPageLd(interviewQA)` + `breadcrumbLd`; title/description formulas from [SEO-MARKETING.md](SEO-MARKETING.md) §3).
- [ ] Build green; manual verify Day 1 (mobile + desktop, light + dark; completed-Day-1-with-draft-Day-2 state shows the mission CTA). Commit.

### T12 — Hub page
- [ ] `index.astro` + `M90ProgressCard` + `M90StateCta` + `M90DayTable` (phase `<details>` accordions, current-day highlight, draft rows plain text) + missions teaser strip (**independent compact markup — do not depend on `MissionCard`, built in T13**) + gameplay-transcript `CodeBlock` under hero + FAQ (5–7 program questions → hub `faqPageLd`) + founding-learner note (with a real submission channel: mailto/X link). `courseLd` added to `jsonld.ts` here.
- [ ] Build + manual verify CTA states (first visit / returning / all-live-done / storage-blocked — streak display is Phase B). Commit.

### T13 — Missions list
- [ ] `MissionCard.astro` (**4 states** per UIUX §4: playable / locked-live [Phase B unlock display] / completed / **planned** — "In production, drops ~week of Day N", non-link, never claims free-play) + `missions/index.astro` + `missions/[id].astro` masthead polish (route created minimal in T10). Commit.

### T14 — Site integration
- [ ] Nav: **top-level "90 Days DevOps" item in all 5 `src/i18n/site/*.ts` nav arrays** + footer cross-promo link (en.ts Learn column) + MegaMenu Explore-strip link + learn-hub cross-promo banner (+ eyebrow retitle), **homepage learn band card**, `track-icons.ts`, guide cross-link callouts (canon copy per Canonical names), OG (`public/mission-90/mission-90-hero.svg` + gen-og-images scan dir + `image` prop on all m90 pages), CLAUDE.md doc update. Verify header fits 4 nav items on md screens + mobile overlay shows the new item.
- [ ] `npm run build && npm run test` green. Commit.

### T15 — Ship gate
- [ ] Full verification pass (below) → `npm run deploy` **only on user's go** → `npm run indexnow` (manual step — deploy does NOT chain it).
- [ ] **T15 = quiet deploy.** Public/soft launch gate is a separate, later event: **Days 1–7 authored + live** (user authoring task, post-plan). The Day-7 north-star metric only activates then; the marketing sequence ([SEO-MARKETING.md](SEO-MARKETING.md) §4) starts there, not at T15.

## Verification

1. `npm run test` — engine, progress, registry data tests all green.
2. `npm run build` — zero errors; `dist/` contains exactly: hub, setup, day/1, missions index, missions/week1-server-down (no draft-day pages).
3. Grep `dist/sitemap*.xml` — no `/day/2`…`/day/90` URLs.
4. Manual (dev server): the three loops — daily (hub→day 1→complete→teaser), weekly (mission play→victory→"continue to Day 8" lands on hub next-state since day 8 is draft), discovery (open day/1 in private window → orientation state correct). Keyboard-only mission playthrough. Theme toggle on every new page. Lighthouse on hub + day/1 (target: Perf ≥ 95, A11y 100, SEO 100; JS on day pages ≤ ~2 KB).
5. `npx wrangler dev` smoke after build (`npm run cf-preview`).

## Risks & later phases

- **Curriculum v1 is a draft** — day titles/minutes reviewed during authoring. Post-validation the curriculum now includes dedicated observability days (d60–61), a pipeline-security day (d39), and an incident-management day (d88) — see CONTENT-SPEC §2.3.
- **Missions 2–10 are `planned` cards** — honest "in production" copy, no vaporware promises.
- **Streak & toast are Phase B canon** (this overrides any earlier draft ambiguity): `streak()` *logic* ships in T2 (tested); streak *display* + welcome-back toast ship Phase B. No streak state exists at launch anyway (only Day 1 live → ≥2 unreachable).
- **Phase accents:** only 3 gradient accent tokens exist (develop/preview/ship) for 5 phases — accepted repetition at MVP; distinct accents are a Phase B design question.
- **Optional (user decision, not planned):** zero-backend newsletter link (e.g. Buttondown) on the hub to not waste the launch spike — currently deferred to Phase C per product doc.
- Phase B (post-MVP): streak chip, welcome-back toast, day-completion share block, per-day OG images, `/mission-90/feed.xml` (cheap + valuable for a publish-daily product — first Phase B pick), unlock enforcement toggle, multi-tab `storage`-event sync. Phase C: Pagefind, Giscus, PDF lead magnet. Monetization: not before 1,000 genuine users (product rule).

## Status log

- 2026-07-03: Plan drafted (multi-agent: 3 explore + architecture + UX + persona/SEO slices; engine/content slices authored in main session after agent session-limit).
- 2026-07-03: **3-validator fan-out complete** (repo-reality · executability · product/UX/SEO). 2 blockers + ~15 majors found and fixed in-doc — full log in [REVIEW.md](REVIEW.md). Repo claims verified zero-drift. **Awaiting user confirmation to execute.**

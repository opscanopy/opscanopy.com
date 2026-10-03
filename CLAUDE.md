# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # start Astro dev server (localhost:4321)
npm run build        # production build → dist/ (postbuild auto-runs Pagefind → dist/pagefind/)
npm run preview      # preview the production build
npm run test         # run all engine tests once (vitest run)
npm run test:watch   # watch mode
npm run check        # precheck (the prebuild generators) + astro check — see the note below
npm audit --omit=dev --audit-level=high   # the third CI gate; drifts silently as advisories publish
npm run deploy       # wrangler deploy — manual fallback; CI deploys on push to main (see below)
```

**Pushing to `main` deploys.** `deploy.yml` runs Test → Type check → Audit → Build →
Deploy to Cloudflare → IndexNow/Bing, on every push to `main` (docs-only paths
ignored — but `.github/`, `scripts/` and `Dockerfile` are NOT ignored, so a tooling
commit redeploys identical content; harmless). That has been true since 2026-09-19,
when the two gates that had blocked CI for weeks were cleared — before that, every
deploy was manual `npm run deploy` from a laptop, and older notes saying "pushing does
not deploy" describe that era. Treat merging to `main` as shipping. `npm run deploy`
remains valid as a fallback; the target is Cloudflare Static Assets
(`wrangler.jsonc`, no Worker script), and wrangler prints "No targets deployed" on
**success** — verify by `curl -s https://opscanopy.com/sw.js | grep BUILD_ID`, not by
the log. A green run is a claim; the `BUILD_ID` is the fact.

The local pre-ship ritual is therefore the three CI gates, in CI's order:
`npm run test`, `npm run check`, `npm audit --omit=dev --audit-level=high` — then
`npm run build`. `npm run build` triggers the npm `postbuild` hook (`pagefind --site
dist`, trailing-slash check, CodeMirror modulepreload hints, service worker, CSP hash
injection); the Pagefind index it writes to `dist/pagefind/` is consumed at runtime by
`/search`. Never invoke `astro build` bare when the output will be served (it skips the
hook and `/search` shows its "index missing" state). On this machine run vitest from
PowerShell with a capital-drive path (`C:/…`) — a lowercase `c:/` cwd breaks Vitest 4
collection.

**TypeScript must stay on 6.x.** `@astrojs/check` caps its peer range at
`^5.0.0 || ^6.0.0` (still true at its latest, 0.9.10), so a TypeScript 7 bump makes
`npm ci` fail peer resolution and takes every CI workflow down with it. Dependabot
merged that bump on 2026-08-03 and Deploy plus SEO report stayed red until 19 Aug —
**the failure is invisible locally, because an already-installed `node_modules` keeps
working**. TS majors are now in `.github/dependabot.yml`'s ignore list. When a
dependency change looks harmless, verify it with `npm ci`, not with a build.
(`npm ci --dry-run` is not a safe probe — npm deletes `node_modules` before
resolving, so a "dry" run still wipes the tree.)

**`npm run check` must stay at zero errors — it is a CI gate** (`deploy.yml`), added
once the 128 pre-existing errors were cleared on 2026-08-27. Run it before shipping:
vite strips types without checking them, so `npm run build` passing proves nothing
about types, which is exactly how a return-shape mismatch reached production in the
GHA expression tester.

`check` runs the `prebuild` generators first (`precheck`), and must. `src/pages/blog/
tag/[tag].astro` imports the gitignored `src/data/thin-tags.generated.json`; the
import is dynamic and wrapped in try/catch, but that is a *runtime* fallback — TypeScript
still resolves the specifier at check time. On a fresh clone (which is what CI is) the
file does not exist and `astro check` fails with `ts(2307)`; locally an earlier build
had always left it behind, so the failure looked like a Linux-vs-Windows difference for
three weeks. It was fresh-clone vs dirty-tree. Rule: any generated file that a
type-checked source imports must be produced before `check`, not only before `build`.

**`npm audit --omit=dev --audit-level=high` is also a CI gate**, and the one most
likely to go red with no code change, because advisories publish on their own schedule
(js-yaml did exactly that on 2026-09-19). Run it with `--omit=dev`: a full `npm audit`
reports `wrangler → miniflare → sharp` highs that are dev-only and do not block. Fix a
production advisory by moving within the current major and raising the floor in
`package.json`, then prove the lockfile with `npm ci` (see the TypeScript note above),
then run the gate itself.

Back to types: two patterns account for most of what `astro check` used to flag, worth
knowing before you reintroduce them:

- **Narrowing dies inside hoisted `function` declarations.** `const btn = el(...)`
  guarded by an early `return` is still `T | null` inside a nested
  `function run() {}`, because TypeScript cannot prove the hoisted function is not
  called before the guard. An arrow function assigned to a `const` keeps the
  narrowing; a `function` declaration does not. The playgrounds restate the guard
  inside the function rather than reach for `!`.
- **`var` never narrows across a closure** — it is reassignable, so TypeScript
  discards the narrowing. `ToolsCatalog.astro` used `var` throughout and accounted
  for 22 errors on its own.

Playground types must be imported from the engine (`import type`, erased at build,
so it does not affect code-splitting) rather than hand-mirrored in the `<script>`.
A hand-copied `SplitSection` in the subnet-splitter had silently lost `total`,
which the render code reads.

**SEO-surface guard** (`scripts/seo-surface-diff.mjs`, pure core
`scripts/seo-surface-core.mjs`, pinned by `src/lib/seo-surface-diff.test.ts`). Before
a push that changes rendered pages: `npm run seo:baseline -- main` (builds that ref
in a detached worktree under the OS temp dir, never in the repo; cached by sha), then
`npm run seo:diff -- --allow scripts/seo-allow/<batch>.json`, which rebuilds this
tree and compares every page's title, description, canonical, hreflang/x-default,
lang, robots, og:*, H1, JSON-LD (dates masked), watched anchors, protected footer
hrefs, nofollow, Pagefind opt-in, word and hidden counts (`<template>`/`<noscript>`
inside `<main>` count as hidden, and their text as no words), plus sitemap membership
(a URL entering or leaving while its page builds is its own must-explain `sitemap`
field, never a re-date) and `<lastmod>`, llms hashes and inbound links. Exit 1 on any
must-explain diff the allowlist does not name, on a page it cannot parse (fails
closed), or when either build was not provably cold — the content-layer cache would
otherwise hide a rehype/Shiki change. "Cold" means exactly this: `node_modules/.astro`
was renamed aside before the build (or none existed), and the build then wrote a fresh
`data-store.json` at that emptied path and logged `[content] Synced content`. Nothing
checks the store's absence after the rename — it is absent by construction, so that
check could not fail; the "data-store.json absent before: true" in
`reports/seo-surface/2026-10-02-guard-proof.md` came from the older wording and
carried no evidence (its other two checks did). Exit 2 on an expired allowlist. The report
lands in `reports/seo-surface/<date>-<batch>.md` (deploy-ignored, committed) with
the re-date breakdown by route class: quote URL counts from it, never by hand.
Allowlist format: `scripts/seo-allow/README.md` — rules are **first match wins**
(list narrow tightening rules before broad ones), and every word and inbound drop is
emitted, informational under the default bound, so `maxDrop 0` really is zero. `--self-test` runs the fixture
cases on synthetic trees. It is not a CI gate.

Run a single test file:
```bash
npx vitest run src/lib/hash-generator/engine.test.ts
```

## Architecture

**OpsCanopy** is a fully static Astro v7 site. Every tool runs 100% client-side — there is no server, no API, no backend. Astro v7 + Tailwind v4 + no framework (plain `<script>` modules).

**`compressHTML: true` is load-bearing.** Astro 7 changed the default to `'jsx'`,
which deletes line-break whitespace between text and an inline tag, so every
`word\n<span class="code-mono">` in the source shipped as `word<span…>` ("like*/15",
"theHash Generator") on 195 pages from the 7.x upgrade (2026-08-27) until
2026-09-23. `true` is Astro 6's lossless mode the templates were written against.
`scripts/check-inline-whitespace.mjs` (postbuild) fails the build on the
code-mono/link-inline form and warns on `<code>/<strong>/<em>` boundaries (German
compounds and plurals like `<code>/64</code>s` are legitimate there). Note that
editing a rehype/remark plugin does not invalidate the content-layer cache
(`node_modules/.astro/data-store.json`) — move it aside before a local build that
must prove a plugin change; CI builds cold.

Astro 7 keeps the legacy `unified` Markdown pipeline only because
`@astrojs/markdown-remark` is an explicit dependency — v7 made "Sätteri" the default
processor and stopped installing unified, which is what `markdown.remarkPlugins` /
`rehypePlugins` in `astro.config.mjs` run on. Removing that package breaks the build
outright (a hard error, not a warning). Migrating `remarkCallouts`/`rehypeChapters`
to Sätteri is a separate, unforced piece of work.

**Blog covers are generated, never hand-drawn** (since 2026-10-02). `npm run gen:heroes`
renders every `public/blog/<slug>-hero.svg` from the post's frontmatter title (verbatim,
IBM Plex Sans outlined to paths from `scripts/fonts/`, Mono from `@fontsource/ibm-plex-mono`)
and a kind-driven caption (`IR-NN · <category>` for incidents, `note · <category>`
otherwise; `src/lib/blog-kind.ts`), then re-runs `gen:og` for the PNGs. A new post needs an
icon entry in `scripts/blog-hero-icons.mjs`. `src/lib/blog-cover.test.ts` fails when a
cover's stamp no longer matches its post or the file is not byte-identical to a fresh
render, so editing a title without re-running the generator goes red. The Mono package is
held back in `.github/dependabot.yml` for that reason: bump it by hand and regenerate.
The 23 in-article diagrams (`public/blog/<slug>-diagram.svg`) are generated the same way:
edit the live-`<text>` source in `scripts/diagram-src/`, then run `node
scripts/replate-diagrams.mjs`. It outlines every label in Plex (Sans Regular/SemiBold/Italic
vendored in `scripts/fonts/`) at its source position, condensing only a label that would
collide, and maps colours onto the light card palette (the plate stays light in both themes,
being an `<img>`); `src/lib/blog-diagram.test.ts` fails on live text, a changed
viewBox/size/aria-label, moved geometry, an off-palette colour or a public copy that is not a
fresh render.

### Adding a tool — the four-file pattern

Every tool follows the same four-file structure:

| File | Purpose |
|------|---------|
| `src/lib/<slug>/engine.ts` | Pure TS logic, no DOM. Exported: one sync or async function |
| `src/lib/<slug>/engine.test.ts` | Vitest tests against RFC/NIST vectors where applicable |
| `src/components/<Name>Playground.astro` | Interactive island — CM or textarea input, output HTML, `<script>` that lazily imports the engine |
| `src/pages/<slug>.astro` | Tool page: `ToolHero` (`headline` slot only) → `#playground` section (playground, optional VerifyPanel, then `ToolLede` as the container's last child) → why section → `ToolPipeline` → reference (`CodeBlock fig="NN.k"`) → dark `#next` band (`Button variant="inverse"`) → `FaqList align="left"` → `ToolCrossLinks` + JSON-LD |

**Tool page shape since batch D (2026-10).** `ToolHero` renders through `PageHero
variant="tool"` on the rail: breadcrumb (+ BreadcrumbList LD), the H1, then one
flex-wrap meta row holding the trust line and a visible `Updated <date>` `<time>`
caption (it wraps under the trust line on narrow screens), all hanging from the
`container-page` left edge. The tool variant has no bottom padding — `#playground`
is the same `bg-canvas-soft` surface and its `pt-8` is the one gap — which puts the
input at ≤ 360px on most tools at 1280. The H1 is two block spans — `<name>:` at `display-lg`,
then the page's `headline` slot at `body-lg` — joined by the JSX `{' '}`, so its
textContent is unchanged ("Subnet Calculator: Subnet any…"); `src/lib/tool-hero-h1.test.ts`
pins the `: ` and the guard compares the collapsed H1 on all 195 pages. `eyebrow` and
`badges` are still accepted but no longer rendered. The lede is **not** cut, it moved:
`scripts/codemods/move-tool-lede.mjs` (tested in `src/lib/move-tool-lede.test.ts`) lifted
every page's `<Fragment slot="lead">` verbatim into `<ToolLede>` below the result panel,
put the section wrappers on the rail (no `mx-auto`/`text-center` on a direct child of
`container-page` — `src/lib/rail.test.ts` is now empty for tool pages), flipped the
slab-band buttons to `variant="inverse"`, numbered the reference CodeBlocks `fig="NN.k"`
(NN = registry index, the result panel's figure; a CodeBlock inside a `.map()` stays
unnumbered, since a literal fig would repeat per item) and passed `align="left"` to
`FaqList`. `ToolCrossLinks` is on the rail too.
Write a new tool page in that shape; the codemod refuses an already-migrated file. On
`/tools/`, the "Browse by category" links **are** the filter row (`aria-current`, plain
click filters + `?cat=` via `replaceState`, modified click/no-JS navigate); every card is
server-rendered inside 12 category `<section>`s, and `ToolCard` carries the mono amber
`fig. NN` instead of a LIVE badge or "Try:" chips. Tool descriptions in `tools.ts` no
longer end in "Pure client-side." — the trust line says it once.

Register the tool in **`src/data/tools.ts`** (slug, name, tagline, description, status, category, keywords, accent). This single file drives the homepage grid, `/tools` catalog, and all cross-links.

### Layout chain

`Page → Shell.astro → Layout.astro` (imports `global.css`, renders `<html>` + SEO head) + `Header.astro` + `Footer.astro`.

Most pages use `<Shell title=… description=… canonical=… jsonLd=…>`. JSON-LD is assembled per-page with helpers from `src/lib/jsonld.ts` (`softwareAppLd` + `faqPageLd`).

### Design system — Tailwind v4 CSS-first

All design tokens live in the `@theme` block at the top of **`src/styles/global.css`**. Tailwind utilities (`text-ink`, `bg-canvas`, `text-brand`, etc.) are generated from these custom properties. **Never redefine tokens outside this file.**

Brand is the **"Field Manual"** system: warm-paper light theme / warm-charcoal dark theme, IBM Plex superfamily (Sans variable + Mono 400/500/600), leaf-green brand used as *ink not area*, amber annotation ink, squared radii, flat shadows, dark-stable "instrument slabs". Key brand tokens:
- `--color-brand: #4a8c3f` light / `#8fc97a` dark (leaf — graphic/fill tier; **never place white text on it**, use `brand-strong`)
- `--color-brand-strong: #33652c` light / `#8fc97a` dark (AA-safe text/link; the only green for white-on-green)
- `--color-link`, `--color-success` ride brand-strong; `--color-accent-ink` (`#a85a06` / `#e0a458`) is the amber annotation/callout/figure-number ink (decoupled from `--color-warning*`)
- `--color-card` — near-white card fill (`#fffdf9` light) that lifts cards off the cream canvas
- `--color-inverse / --color-inverse-fg` — dark-stable instrument-slab surface for demos, terminals, code blocks and accent bands (dark in BOTH themes). **One ink set, two plate values** since 2026-10-02: `#1b1915` on paper, `#0a0908` at night — the dark plate is *recessed below* the page (the lowest dark tier), not raised above it, so it clears canvas, canvas-soft, card and footer by ≥ 3 L* in both themes (`contrast.test.ts` `Slab clearance`). The dark footer moved up to `#272319` (= canvas-soft-2), `footer-hover` is canvas-soft-3 in both themes, and the footer language menu is `bg-canvas`. The slab edge is the one inverse ink that differs by theme (`#ffffff1f` light / `#ffffff2e` dark), and the neutral figcap dot is `--color-dot-neutral` (`#ffffff26` / `#ffffff33`).
- **Buttons on a slab:** `.btn-inverse` / `<Button variant="inverse">` (transparent, `inverse-fg` text, edge `--color-inverse-control-edge` = inverse-fg at 45%, 4.12:1 on both plates). A context rule gives every `.btn-secondary` inside `.bg-inverse` / `.instrument` / `.instrument-flush` the same recipe, which kept the tool pages' `#next` bands legible until batch D's codemod flipped them to `variant="inverse"`. `.btn-secondary` itself is token-driven (`--color-btn-secondary-bg/-border/-hover`, transparent + hairline-strong in dark).
- **Motion tokens:** `--dur-fast` 120ms, `--dur-base` 180ms, `--ease-brand` (never `--ease-out` — a Tailwind key; overriding it restyles every `ease-out` utility). `--default-transition-duration/-timing-function` re-base every bare `transition-*` utility onto them. The theme toggle crossfades through `document.startViewTransition` (skipped under reduced motion); the mega-menu enters with `@starting-style`, opens on hover without taking focus, and ignores a trigger click within 400ms of a hover-open.
- **Label roles share one tracking**, `--tracking-label` (0.06em): L1 `eyebrow` (mono 11/16 500, brand-strong), L2 `label-field` (mono 11/16 400, mute), L3 `.badge` (+ `.badge-info` for sentences, `Badge variant="info"`; `.badge-mono` for mono numerics). They differ by colour, weight and box, never by tracking. The `.badge` restyle is scoped `:not([data-cat], .badge-info)`; since batch D the /tools filter row is `.chip` links, so the `[data-cat]` exclusion is vestigial and can go in a global.css follow-up.
- **Rail:** inside `container-page` a block may set a measure (`measure-prose` ≈ 44rem, `measure-wide` ≈ 64rem) but never `mx-auto` / `text-center`. `src/components/PageHero.astro` (`variant="hub" | "tool"`) is the rail masthead; created in batch A, adopted by the hubs in batch B and by ToolHero in batch D.
- **Header bar** is a `minmax(max-content,1fr) auto minmax(max-content,1fr)` grid from lg, so the link row sits on the true centre whatever the right cluster holds; the current link is marked by fill, ink and the leaf bar, not by weight (a bolder label re-centres the row).
- `--color-inverse-brand` (`#8fc97a`) / `--color-inverse-accent` (`#e0a458`) — the **only** leaf and amber legal as text ON a slab, identical in both themes. The light-theme `brand` (4.27:1) and `accent-ink` (3.45:1) fail AA on charcoal; `contrast.test.ts` gates these pairs since 2026-09-18. Eyebrows on a slab need the `!` form (`!text-inverse-brand`) to beat the `eyebrow` utility's own colour; the tool pages' older `!text-cyan` is the same hex.
- Radii are squared (`--radius-pill: 6px`). **Depth has three tiers** since 2026-09-19: L0 rest (`shadow-hairline`, inset ring: rows, chips, `.card-soft`, `.badge`), L1 card (`shadow-subtle`, ring + 2px drop: `.card`), L2 instrument (`shadow-float`: `.instrument`, menus, hover lift). One L2 object per viewport. `--shadow-soft` is a legacy alias of L1. Before this, `--shadow-subtle` was byte-identical to `hairline`, so `.card` and `.card-soft` had the same depth.
- **`.instrument` / `.instrument-flush`** (global.css `@layer components`) is the one way to draw a dark-in-both-themes slab; never hand-roll `bg-inverse` + literal `#ffffff1f` borders again. Its inks are `inverse-fg / -mute / -brand / -accent / -error` and its edge is `--color-inverse-hairline`. Every slab carries a **`FigureCap`** (`src/components/FigureCap.astro`: three dots + mono `fig. NN — slug · category`, `tone="traffic"` for coloured dots, default slot for actions; opt-in `split` wraps the ` · category` tail in `.figcap__sub`, hidden under 480px — default off, and never set under `src/components/home/*`, so the homepage caps keep their one-text-node markup; `src/lib/figcap-label.test.ts` gates both). The figure number is the tool's position in the `tools` registry array (append order, so it never shifts).
- **Surface ladder is gated.** `canvas → canvas-soft → canvas-soft-2 → canvas-soft-3` steps by ≥ 3 L* in both themes and `card` sits ≥ 3 L* off `canvas-soft` (the body background); `contrast.test.ts` asserts it (`assertLadder`). Dark `mute` on `canvas-soft-3` is the binding constraint at 4.66:1 — do not lighten soft-3 without lifting mute.
- **Category hues** live in `categoryHue` in `src/data/tools.ts` (light/dark hex, OKLCH L 0.50/C 0.09 and L 0.76/C 0.10, hue-only variance) and are mirrored by hand as `--color-cat-<slug>` tokens in both theme blocks. DOM consumers call `categoryAccentVar(category)` (a `var()` string — hence `@theme static`, which emits every token so inline styles can reference them); `scripts/gen-og-images.mjs` reads the hex because librsvg has no CSS variables. `contrast.test.ts` asserts token ⇔ registry equality and 3:1 on card/soft in both themes.
- **Tabular figures are set once** in `@layer base` (`#playground, dl, output, time, .badge`) and on `code-mono` / `eyebrow`. Do not re-declare `font-variant-numeric` per component; the 79 copies were removed.
- **Type stays on the integer scale.** `src/lib/type-scale.test.ts` walks every component and fails on any fractional px `font-size` or `text-[N.5px]`, and on integer sizes outside its allowed set (min 11px). 161 half-pixel declarations were snapped on 2026-09-19.
- **Tool result panels are the L2 instrument** (since 2026-09-19; on the kit's `ResultPanel` since Wave 1, 2026-10-02, for subnet-calculator / cron-expression-tester / cidr-checker; Waves 2–4 port the rest): `<ResultPanel slug=… prefix=… summary={seedSummary} split>` renders the `instrument-flush` slab, the `<FigureCap … tone="traffic" split>` whose actions slot holds the `role="status"` summary, the `!text-inverse-brand` eyebrow and the copy-status span; summary/empty/error states toggle `text-inverse-mute` / `text-inverse-error` (never `text-mute` on a slab). The re-skin is a block of `.<pre>-results :global(...)` overrides at the end of the component `<style>` (anchored on the playground's own results container — the panel wrapper is ResultPanel's and has no scope attribute), so the light rules stay as documented defaults. Values right-align (`text-align: right`; the <480px stacked layout returns to left). The figure number comes from the registry inside **ResultPanel's frontmatter** (`getTool(slug)` + `tools.indexOf`; an unknown slug throws at build) — never import `tools.ts` inside the island `<script>`. Unmigrated playgrounds still compute `figNo` / `figLabel` in their own frontmatter the same way.
- **Changed-value tick** — `src/lib/mark-changed.ts` (`snapshotValues` / `markChanged`, tested in node against DOM-shaped fakes). Value elements carry a stable `data-k` (`row:<label>`, `stat:<label>`, `run:<i>`, `field:<key>`, `verdict:<ip>`); the playground snapshots before `renderResult` and marks after, passing `new Map()` on boot/hash seeds so nothing flashes on load. global.css colours `[data-k][data-changed]` amber (`!important`, transient) with a 120ms fade the reduced-motion guard zeroes. HeroDemo uses it too.
- **One trust line per tool page.** ToolHero's caption (`tool.trust` + `tool.trustLink`, with a `pulse-ring` dot) is the only privacy claim in the hero; the `Runs in your browser` badge (and its 12 translations) was removed from every page file on 2026-09-19. The `live` badge variant now exists only on the jq pages ("Real jq …"). Do not reintroduce a browser-claim badge.
- Header search shows `<kbd>Ctrl</kbd><kbd>K</kbd>` at `lg+` (`.kbd` in global.css); `CommandPalette.astro`'s `syncKbdModifier()` rewrites `[data-kbd-mod]` to `⌘` on Apple platforms at boot.
- **Homepage hero: the card is the hero.** All five `index.astro` stack copy (`display-xl`, `max-w-3xl`) above a full-width `HeroDemo` (two-column body from 768px); the CanopyField arc texture is 8% ink light / 7% dark (was 34/22, then 15/12 until 2026-10-02; the value lives in `MeshGradient.astro`). The tool hero no longer renders it; the homepage and the footer do. Do not reintroduce the `5fr_7fr` split.
- Amber (`--color-accent-ink`) has four legal jobs, listed in its comment in global.css: figure/step numbers and rule IDs, the `[data-changed]` value tick, warm-surface progress fills, `Badge variant="new"`. Hover stays leaf.
- `src/lib/contrast.test.ts` is the palette gate — run `npm run test` after any token edit.

### Light/dark theming

Theme is controlled by `html[data-theme="dark"]` overriding the `@theme` custom properties. A no-flash inline script in `Layout.astro` reads `localStorage.theme` (or `prefers-color-scheme`) and sets `data-theme` before paint. The header toggle calls `wireThemeToggles()` and persists to `localStorage`.

Never use Tailwind `dark:` variants — re-point the token variables in the `html[data-theme='dark']` block in `global.css` instead.

### Playground islands

Each playground `<script>` follows this boot pattern:
```js
document.addEventListener('astro:page-load', () => boot());
function boot() { /* set up DOM refs, load example, wire events */ }
```

CodeMirror v6 is used in 13 tools: `AlertLint`, `GHA Validator`, `GHA Expression Tester`, `Env Checker`, `Cron to Systemd`, `LogQL↔PromQL`, `Regex Log Tester`, `PromQL Explainer`, `CVE Converter`, `Alertmanager Route Tester`, `Docker Run to Compose`, `GitLab CI Validator`, `Prometheus Relabel Tester`. For all of these the CM keymap includes an `Escape` binding to release focus (Tab-trap fix). The `GHA Expression Tester` engine (`src/lib/github-actions-expression-tester/`) fans out into multiple modules behind one public `engine.ts` façade and is pinned to a versioned conformance corpus (`conformance.ts`, `GHA_SEMANTICS_VERSION`). `scripts/inject-cm-modulepreload.mjs` (chained into the `postbuild` script) discovers this set fresh on every build (grepping `src/components/*.astro` for an `@codemirror/state` import, never a hardcoded list) and injects `<link rel="modulepreload">` hints for each playground's CodeMirror vendor chunks — this comment only needs to stay roughly accurate for humans reading the code, not exact.

Engines are dynamically imported inside the boot closure so the heavy logic code-splits away from the page shell.

**Every tool's result panel is server-rendered from `examples[0]`** — 37 of the 39 tools as of 2026-09-22; the two exceptions are named at the end of this section. AI crawlers do not execute JavaScript, so a panel that only renders client-side shows them "type something here" and nothing citable. The pure HTML builders live in `src/lib/<tool>/render.ts`, imported by **both** the Astro frontmatter and the island `<script>`, so the two can never drift; the frontmatter computes `examples[0]` with the engine (pure, synchronous — import it in frontmatter, never inside the `<script>`, which must keep the lazy `await import`) and injects with `set:html`. Also SSR the input's `value` and the example chips; the script adopts existing chips instead of rebuilding them. Rules: **never SSR time- or key-dependent output** — cron server-renders the description and parsed fields but emits `runsSkeletonHtml()` for next-run times (they depend on `new Date()` and the reader's timezone), and JWT always renders the `no-key` trust state because verification is async and needs WebCrypto. Pin any clock the engine takes (`decode(token, FIXED_NOW)`) so builds stay reproducible. The seed never writes the deep-link hash, records last-input, or fires the amber tick: `markChanged` is passed an empty map on a seed, and `diffKeys` only marks keys present in both snapshots.
- **CodeMirror inputs seed a sibling, not the host.** CM *appends* its editor into the host element rather than replacing its contents, so a seeded document goes in a `<pre class="<prefix>-cm-fallback code-mono" data-cm-fallback>` INSIDE the host, and `init` runs `root.querySelectorAll('[data-cm-fallback]').forEach((n) => n.remove())` immediately after the `new EditorView({ parent: host })` calls. Put the removal after the hash/restore tiers have already chosen the document. Miss it and the page shows the document twice; `CronToSystemdPlayground.astro` is the reference, and the CDP driver asserts `[data-cm-fallback]` is 0 while `.cm-editor` is ≥ 1.
- **Copy payloads are returned, never pushed.** A builder that used to append to a closure array now returns `{ html, payloads }`; the client stores the array after writing `innerHTML` and binds the buttons, and the frontmatter ignores it. Multi-line and quote-bearing payloads round-trip badly through HTML attributes, which is why they are bound on live elements rather than server-rendered.
- **A seeded boot is not user input.** Beyond the hash and the amber tick, a boot seed must not call `recordToolLastInput` — the GitHub Actions and GitLab CI validators did on every page load, which made a first visit indistinguishable from a returning one. Where boot chooses between a value already in the input and a restored/deep-linked one, compare against `input.defaultValue`, not against non-emptiness: the server now fills `value=`, so a bare truthiness test always wins and silently kills `#ip=`-style deep links (it did, on the subnet calculator and cidr checker, for one day).
- **Seed only what is honest, and say so.** Three tools are deliberately partial. The timestamp converter renders its Local and Relative rows as labelled `data-client-only` placeholders (they depend on the reader's clock and timezone). The GitHub Actions expression tester seeds tab 1 only; tab 2 sits behind an inactive panel where a crawler gains nothing. **`uuid-ulid-generator` seeds only the all-zero Nil UUID card and the fixed inspector example** — a minted v4 or ULID in the static HTML would be served identically to every visitor, which is worse than showing nothing; its render test fails if any other v4, or any ULID, reaches the seeded output. It is also the one tool whose seed is *meant* to be replaced on hydration, because it mints a batch at boot.
- **Not seeded at all, with reasons.** `certificate-decoder` (async WebCrypto verification, and expiry prose such as "expires in 1043 days" that goes stale daily — revisit only with `now` pinned and the expiry rows client-only) and `jq-playground` (the result needs the WASM binary at build time, and the Vite `?url` import is client-only; a checked-in fixture of example 1's output is the way in). Everything else is seeded.
- **When driving a seeded playground over CDP, clear `local_storage` per visit** (`Storage.clearDataForOrigin`). The playgrounds restore the visitor's last input, so a reused Chrome profile makes the next "fresh load" replay what the previous run typed — which looks exactly like an SSR bug.

**`jq-playground` is the first vendor WASM runtime on the site** (`jq-wasm@3.0.0-jq-1.8.2`, exact pin — real jq 1.8.2, 907 KB / ~324 KB gzipped): the binary arrives via the Vite asset import `import('jq-wasm/jq.wasm?url')` inside the boot closure and is passed to `loadJq({ wasmURL })`, so it is hashed into `dist/_astro/` and fetched same-origin (the CSP allows `connect-src 'self'` only) — **never hand-copy a `.wasm` into `public/`** (that is the older hand-rolled Go PoC's pattern, `engines/alertlint/` → `public/engine.wasm`, and it is not how vendor WASM ships here). The loaded handle is synchronous, `jq.version` is a string property read from the binary (the UI badge — never hardcode it), and a non-terminating filter exhausts jq's heap and throws an Emscripten `Aborted()` out of `jq.raw()`, which the engine turns into a diagnostic and a fresh module.

#### Playground UX contract — build it from the kit (`src/components/playground/*`)

Since Wave 1 (2026-10-02) the contract is **markup you import, not a pattern you copy**. The playground kit is six markup-only Astro components that emit global `@layer components` classes (global.css, the "PLAYGROUND KIT" block after `.figcap*`), plus three helpers in `src/lib/playground-kit/`:

| Kit part | Use it for | Hooks the island keys on |
|---|---|---|
| `ExampleChips` | the example row | `[data-chips] .chip[aria-pressed]`, `data-example-idx` / `data-input`; state via `syncChips*` (`chips.ts`) — `aria-pressed` IS the selected state, hover is a different look |
| `RunHint` (`live` / `cm`) | the one hint line, on paper | `[data-run-hint]` |
| `SnapshotBar` | Save / load / delete snapshot, on paper | `#<p>-snap-save/select/delete` (wire.ts unchanged; the picker is `hidden` until a snapshot exists) |
| `ResultPanel` | the L2 result slab | `[data-result-panel]`; the FigureCap (`fig. NN` from `getTool(slug)` — an unknown slug **throws at build**; pass `split`), `#<p>-summary[role=status][data-status]`, an `actions` slot, `#<p>-copy-status`. The playground's own `<div id="<p>-results" set:html={seedHtml} data-results>` is the default slot |
| `CopyButton` (`link` / `all` / `value`) | Copy link / Copy all / Copy as … | payload in `data-copy`, plus `data-copy-link` / `data-copy-all`; `wireCopyButtons(root, { status })` (`copy.ts`) runs every copy button under the root, render.ts row buttons included |
| `EditorPane` | a CodeMirror host on the plate (Waves 2–3) | `[data-editor-pane]`, `[data-editor-host]`, a `<pre data-cm-fallback>` in its slot; theme = `await import('../lib/playground-kit/cm-theme')` (`plate`), never one-dark |

Rules the kit brings with it: a child component's root does not inherit the parent's `data-astro-cid`, so a playground's slab overrides anchor on **its own `.<p>-results :global(...)`**, never on the panel wrapper; control heights are `--control-h-sm/md/lg` (28 / 32 / 44), durations `--dur-*`, tracking `--tracking-*`, and uppercase comes only from `eyebrow` / `label-field` (`@apply label-field` gives a render.ts label the row-key role). **Result-panel type roles** (global.css): group heading sans 12/16 600 slab fg with a rule above — never one more mono caps label; row key mono 11/16 uppercase slab mute (the only label); values mono 13/20 with `.is-prose` for sentences; hero 20/28. Wave 1 kept render.ts byte-identical (ssr-diff), so its three tools map their legacy render classes onto these values in their overrides, and render-emitted cross-tool link chips (`<a class="<p>-chip">` under `[data-results]`) take the chip recipe from global.css until render.ts emits `.chip`.

`src/lib/playground-kit.test.ts` is the gate (`UNMIGRATED` ratchet: an allowlisted pair must still fail, every other pair must pass). Migrated so far: **SubnetCalculator, CidrChecker, CronTester** — they pass every rule, so they are the reference. Waves 2–4 migrate the other 36; each wave runs `node scripts/ssr-diff.mjs snapshot` on a pre-migration build and `compare` after, and re-dates its tools (a playground component is a tool-date input).

The contract itself, which the kit now encodes:

- **Example chips**, not a `<select>` — `ExampleChips`: squared chips at `var(--radius-pill)` (6px, the Field Manual radius — not fully-round pills; canvas bg, hairline shadow, brand-strong text, sentence-case 12px sans; pressed = brand-soft bg + inset brand ring; hover = soft-2 + hairline-strong ring), 44px min-height on `(pointer: coarse)`.
- **Live eval + Enter**: single ~130–220ms debounce and the exact hint line "Results update as you type — press Enter to run now." Enter forces an immediate eval; Ctrl/⌘+Enter always runs and blurs on a coarse pointer. **Wire this with `wireRunKeys()` from `src/lib/run-keys.ts`, never a hand-written keydown handler** — the `enter` option encodes the three legitimate Enter behaviours (`run` for single-line inputs, `insert-then-run` for textareas so the newline lands first, `ignore`), and it respects IME composition and Shift+Enter, which the hand-written copies all missed. CodeMirror tools express the same contract as a `Mod-Enter` keymap entry placed **before** `defaultKeymap`. Coverage is 39/39 as of 2026-09-18.
- **Calm errors**: never flash a red border mid-composition — hold the error until ~600ms idle, blur, or Enter, and return *specific* diagnostics from the engine ("Octet 256 is greater than 255."), not a generic "invalid".
- **Glossary = muted caption** under the jargon term/title (works on touch, SR-visible, zero JS) — no tooltips.
- **a11y**: results container is NOT `aria-live`; a one-line `role="status"` summary is the sole live region, plus an sr-only copy-status span.
- **Copy/share**: per-row copy buttons (icon-swap, execCommand fallback, 44px coarse targets), a "Copy all" button carrying `data-copy-all`, and a "Copy link" share button hidden until valid. The `result_copied` analytics listener in `Layout.astro` fires on `[data-copy]`/`[data-copy-all]`/`[data-copy-link]` clicks inside `#playground`.
- **XSS**: every injected value goes through `escapeHtml()` (`src/lib/escape-html.ts`).

**Port from the kit, using `src/components/CidrCheckerPlayground.astro` (textarea + `insert-then-run`) or `SubnetCalculatorPlayground.astro` (single-line input, answer tiles, changed-value tick) as the worked example** — `CronTesterPlayground.astro` shows a second chip group (timezone chips built at boot as `.chip` in a `[data-chips]` row) and a three-button copy toolbar. All three satisfy every bullet above and every gate rule.

Do NOT copy `IpConverterPlayground.astro` for these patterns — it predates the contract and violates two of its own bullets (it uses a `<select id="ipc-example">` for examples, and has no hint line). Its `.ipc-chip` classes are cross-tool *link* chips, an unrelated feature. It was cited here as the reference until 2026-07-29, so anything modelled on it is likely non-compliant.

### Networking tools — shared IP math

All 6 networking tools (`subnet-calculator`, `ip-address-converter`, `cidr-checker`, `mac-address-formatter`, `reverse-dns-ptr`, `subnet-splitter`) import from **`src/lib/ip-core.ts`**. This module uses `BigInt` throughout for exact 32-bit (IPv4) and 128-bit (IPv6) arithmetic. Parsers return `null` on invalid input — they never throw. Don't loosen `parseCidr`'s grammar — tool-specific input forms (e.g. the subnet calculator's dotted-netmask parsing) live in that tool's engine, not in ip-core.

**Deep-link hashes** (`src/lib/ip-hash.ts`): `#ip=<value>` carries a single address/CIDR between tools (read by the ip-converter, PTR helper, cidr-checker, subnet-calculator and subnet-splitter playgrounds); `#list=<encoded>` carries the cidr-checker's multi-line list. Playgrounds write the hash only on valid, user-initiated evals (never on boot-seed), via a Safari-guarded `replaceState` with a last-value memo, and skip writes past ~2000 encoded chars. Cross-tool chips under each result card build these links with `buildIpHash`/`buildListHash` + the playground's `localePath()` helper.

### Mission 90 Days DevOps (`/mission-90/`)

A standalone top-level section (peer to Tools/Learn/Blog with its own nav item — Learn only cross-promotes it), not a tool. A 90-day "developer → DevOps engineer" program built on a registry/collection/engine trio:

- **`src/data/mission90.ts`** — the typed curriculum registry: `program`, `phases`, `days`, `missions`, plus derived `liveDays`, `getDay`, `phaseForDay`, and `totalCoreMinutes`. This is the source of truth for structure.
- **`mission90Days` content collection** — day bodies live at `src/content/mission90/day-NNN.md` (schema in `src/content.config.ts`, authoring rules in `docs/mission90-authoring.md`).
- **`src/lib/mission-sim/`** — a pure-TS terminal game engine, multiple modules behind an `engine.ts` façade, dynamically imported by the `MissionTerminal` island (never statically — it code-splits away from the page shell).

Progress lives in **one** versioned localStorage blob `oc-m90-v1`, read/written only through the pure **`src/lib/mission90/progress.ts`** (schema owner; page scripts do the actual I/O). It binds roadmap ↔ days ↔ missions.

Only registry days with `status:'live'` build day pages, and only `status:'live'` missions build play pages — `getStaticPaths` throws on any registry↔collection mismatch. Draft days render as non-link "Drops soon" text.

Components live in **`src/components/mission90/`**. JSON-LD uses the new `courseLd` helper in `src/lib/jsonld.ts`; `techArticleLd` gained an optional Person `author` and `isPartOfCourse`. The `/mission-90/` OG card rasterizes from `public/mission-90/mission-90-hero.svg` via `scripts/gen-og-images.mjs` (same pipeline as blog heroes).

### Practice tests (`/tests/`)

Certification question banks, a peer of Tools/Learn/Blog with its own nav item.
English-only (`/tests` is in `ENGLISH_ONLY_SECTIONS`), so no locale copies.

Structure and bodies are split, the same way Mission 90 splits registry from
content:

- **`src/data/tests.ts`** — `TestCategory` (one per certification) and
  `PracticeTest` (one per set: `passThreshold`, optional display-only `minutes`,
  `status`). `validateRegistry()` runs at import and **throws**, so a duplicate
  slug or a live test under a draft category fails the build rather than
  rendering wrong.
- **`src/data/tests-copy.ts`** — per-category prose: `examCode`,
  `metaDescription`, `intro[]`, and the exam's own `domains` with the weightings
  the vendor publishes. New sets should distribute questions across those
  weightings; that is the only place they are written down.
- **`practiceTestQuestions` collection** — one JSON file per set at
  `src/content/tests/<category>__<test>.json`. **The double underscore is load-
  bearing**: `src/lib/tests/static-paths.ts` cross-checks registry ↔ files in
  both directions and throws on a filename mismatch, an orphan file, or a live
  test with no file.

A question is `{ id, prompt: string[], options, correctAnswers, explanation }`.
`correctAnswers` holds **zero-based indices**, and how many to pick is derived
from its length — never stored. The last `prompt` paragraph is the question
sentence (used as the `<legend>`); earlier ones are the scenario.

Adding a set = a registry entry plus the JSON file. Everything else derives:
hub counts, category pages, both `getStaticPaths`, sitemap, JSON-LD, `llms.txt`.
Note the runner at `/tests/<cat>/<test>/` is **noindex**; the indexable SEO
surface is the `/review/` page, which renders every question as prose.

**`src/lib/tests/content.test.ts` is the editorial gate** (added 2026-09-22,
~2,600 assertions). Zod proves a file is structurally valid; this proves it is
written the way the site writes questions — scenario plus a question sentence,
three more options than correct answers, multi-select stems that state the
count, no "all/none of the above", no negative stems, third person, no links, an
explanation long enough to tear down every distractor, and no explanation that
cites a letter it does not have or calls its own key wrong. Its thresholds are
calibrated against the shipped corpus, not guessed (the explanation floor is 400
because the shortest real one is 406). Two rules carry deliberate exemptions
with the reason in a comment: a stem may end `? (Select TWO.)`, and quoted text
may say "your" so a prompt-injection question can quote the attack.

Two gate rules exist because of real defects:

- **Answer-position balance** (sets of 20+): no option index may hold more than
  35% of the single-answer keys. The AIF mock shipped with option B correct in
  40 of 54 — always picking B beat studying — and was rebalanced in `e1cd8b8`.
  Assign key positions *before* writing, so balance is by construction.
- **Cross-set stem similarity** within a category must stay under 0.45 Jaccard
  (the closest real pair scores 0.23). Two sets for one exam are written months
  apart from the same objectives; duplicates are easy and embarrassing.

House style, which the gate cannot check: scenarios are third-person and carry
concrete invented specifics (a pipeline named `prod-encoder`, `ap-south-1`, a
1,500-word system prompt); the difficulty lives in a lowercase qualifier ("with
the least operational overhead"); every distractor is a real approach that fails
that qualifier for a nameable reason. **The DOP sets use American spelling and
name distractors descriptively; the AIF sets use British spelling and name them
by letter** — match the set you are editing. Questions must be original, never
reproduced exam items: the category copy promises that in writing.

Facts age faster than anything else here. Independent review of the 2026-09-22
sets found Amazon Kendra, Bedrock Agents (now Agents Classic) and SageMaker A2I
had all closed to new customers mid-2026, which changed one answer key outright.
**Re-derive keys independently from a copy with the keys and explanations
stripped**, and check any service name against current docs before shipping.

### Localized pages

Tool and blog pages have hand-translated copies under `src/pages/{de,es,fr,pt-br}/` that import the **same** playground components (playground UI strings are English in every locale — that's intentional). Any page-copy change (H1, lead, FAQ, JSON-LD) must ship to all 5 locales in the same commit, translated in each file's existing register, or the localized pages contradict the tool.

### Tests

Tests live at `src/lib/<tool>/engine.test.ts`, run with `vitest` in `node` environment (no DOM needed — engines are pure functions). Playgrounds have no tests, but three repo-level gates sit beside the engines in `src/lib/`: `contrast.test.ts` (palette, surface ladder, category hues), `type-scale.test.ts` (walks every component for off-scale font sizes) and `mark-changed.test.ts` (the changed-value tick, against DOM-shaped fakes). New engines should be test-driven with real RFC/NIST vectors where they exist.

For runtime verification of playground changes (tests can't see the DOM), `.claude/skills/verify/SKILL.md` documents the headless-Chrome drive protocol: serve `dist/`, then either `--dump-dom`/`--screenshot` with a virtual-time budget, or a DevTools-protocol driver for anything that needs both themes, typing, computed colours or a timed state such as `[data-changed]` (the 2026-09-19 design pass was signed off with 53 such checks).

### Site config

**Header nav lives in `src/i18n/site/{en,de,es,fr,pt-br}.ts`**, read via `getSiteContent(lang).nav` (Header.astro). A header-nav change must ship to **all five** locale files. The footer does NOT work this way — its structure is English-only data; see the next paragraph. Sections that exist only in English (`/learn`, `/mission-90`, `/changelog`, `/tests`) are listed in `ENGLISH_ONLY_SECTIONS`, and single English-only files (`/rss.xml`) in `ENGLISH_ONLY_FILES`, both in `src/i18n/paths.ts` (re-exported from `utils.ts`); `isEnglishOnlyKey` tests both, and `localizeNavHref` links a matching key unprefixed from every locale (no `/de/learn`- or `/de/rss.xml`-style 404s). Tool **category** pages (`/tools/<category>/`) are likewise English-only by design: the MegaMenu deliberately links them unprefixed from every locale (see the comment in `MegaMenu.astro`) — localized category copies were evaluated and rejected as thin near-duplicates. `/search` is NOT in that list — it has a real localized page per locale (see below), so it localizes like any other page.

**The footer protects pages — its structure lives only in `src/i18n/site/en.ts`** (since 2026-09-27). `Footer.astro` renders `footerCells(getFooter(lang))` from `src/i18n/site.ts`; groups, order and targets are defined once in `en.ts`, and the four locale files supply `footerLabels` (titles by group id, labels by English href) and nothing else, so a locale cannot drop or reorder a target. The footer is the **only** inbound link for `/changelog/`, `/contact/`, `/privacy/` and `/terms/` in every locale, and the main one for the DevOps roadmap, the Linux/Docker guides, `/about/` and `/security/`: never remove those targets, hide them, JS-inject them or put them in a `<details>`, and do not reword their anchors casually. English-only targets (`isEnglishOnlyKey`, above: `/learn`, `/mission-90`, `/changelog`, `/tests`, `/rss.xml`) stay unprefixed on locale pages. **Never edit `src/data/*` for footer work** — `scripts/lastmod-core.mjs` dates ~90 sitemap URLs by their `src/data/*` imports, so touching `site.ts` bumps their `<lastmod>`; social and repo URLs are read from it by the component-only `src/lib/site-links.ts`. The guards are `src/i18n/site.test.ts` (the data contract) and `scripts/check-footer.mjs` (postbuild, `--self-test` first: one `<footer>` per page, the protected hrefs as visible links — one inside a `<details>`/`<template>`, under `hidden`/`inert`/`aria-hidden="true"`, a `hidden`/`sr-only` class of any variant or an inline `display:none` does not count, which is also why the language switcher's `rel="alternate"` options cannot stand in for a missing footer link — no internal `nofollow`, no locale-prefixed English-only link, social links named "OpsCanopy on …", no dates in text or attributes (href values are exempt: the switcher repeats the page path), ≤ 20 KB raw — it ships on every page, ~18 KB today; its social list mirrors `site-links.ts` by hand). The colophon plate (`FooterColophon.astro`) is English-only by design and carries no dates or build SHA; `Shell`'s `footerColophon={false}` hides it on 404/500/offline.

**`src/data/site.ts`** — brand constants (name, url, twitter, author). `site.author` is the Organization byline (`publisher`, and the frontmatter default); `site.person` (name, `/about/` url, `sameAs` → GitHub profile) is who that byline resolves to, and is what `BlogPost.astro`, `GuidePost.astro` and the Mission 90 day pages emit as the JSON-LD `author` — a `Person`, never the Organization, for E-E-A-T. Its `navLinks` array is **legacy** — the Header does NOT read it; it only feeds a few in-page links on tool pages. Do not add nav entries there.

**Tool FAQs live in one registry: `src/data/tool-faqs.ts` + `src/data/tool-faqs/{en,de,es,fr,pt-br}.ts`** (since 2026-09-22). English is the source of truth; each locale file is a `Partial` that falls back to English **per slug**, never per entry. Every tool page does `const faqs = toolFaqs('<slug>', '<lang>')` and then `<FaqList faqs={faqs} />` + `faqPageLd(faqs)` exactly as before — the 195 former `const faqs = [...]` frontmatter blocks (7,260 lines) were lifted by evaluating them, and the rebuilt FAQ sections and JSON-LD were byte-identical. `src/data/tool-faqs.test.ts` gates: every live tool × 5 locales present, index-aligned counts with English, plain text (real HTML tags rejected; angle-bracket placeholders like `<expression>` and Grafana's `${DS_PROMETHEUS}` are prose and allowed). Two tools quote engine constants in their answers (systemd-unit-validator: check count, directive count, input cap, finding caps; grafana-dashboard-validator: rule counts by severity, pinned version, schemaVersion, caps) — these are **frozen strings**, and `tool-faqs.frozen.test.ts` fails when an engine constant changes so the prose gets updated in all five locales. Localized answers keep their own thousands separators (`200.000`, fr `200 000` with a narrow no-break space) — do not "normalise" them to en-US. Adding a tool = add its slug to all five files (the test names the missing one). Homepage, `/verify-ai` and `/mission-90` FAQs are not tools and stay in their pages.

**`/llms.txt` and `/llms-full.txt`** (`src/pages/llms.txt.ts`, `llms-full.txt.ts`) — the AI-assistant entry points. The first is a link map, the second is the full prose of every guide, blog post and info page plus a record per tool, generated from the same registries so neither can drift. The shared privacy paragraph is `SITE_INTRO`, exported from `llms.txt.ts` — it describes the CSP in `public/_headers`, so **the two must be edited together**: that file is a check-me claim, and on 2026-09-21 it was found stating "Google Analytics and nothing else" months after Cloudflare Web Analytics was added to the policy. `llms-full.txt` carries every tool's FAQ from the registry; each page's "why" prose is still inline markup and is not reachable from it (noted in its header).

**Trailing-slash redirects stay 307, and `_redirects` is a ~100-rule budget (34 used; `src/lib/redirects.test.ts` caps it at 60).** Cloudflare Static Assets normalises a missing slash with a 307 whose code is not configurable. On 2026-09-21 a postbuild generator appended one exact `/x  /x/  301` per built directory (536 plain paths, no wildcards); Cloudflare rejected the version at deploy time — "Maximum number of dynamic _redirects rules limit of 100 exceeded [code: 100324]". Per wrangler's own parser (`canCreateStaticRule`), a rule is static only while no splat/placeholder rule sits above it; everything after the first dynamic rule counts as dynamic, and the appended rules sat below the splats. The generator was removed the same day. Redirects are evaluated **before** the asset lookup, so a rule that matches a live page breaks it: use `:placeholder` (one or more chars), never `*` (can be empty — `/de/tools/*` would swallow the live `/de/tools/` hub). The 2026-09-26 rules 301 the 105 legacy localized category/tag URLs from GSC's 404 report (`src/lib/fixtures/gsc-404-2026-09.txt`) to their English pages; the test proves no rule matches a live localized route. Production kept serving the previous version throughout the 2026-09-21 rejection (a rejected version never goes live), which is the failure mode to expect: a `_redirects` mistake fails the deploy, not the site. Never automate additions to the file.

**Sitemap `<lastmod>` is a content date or absent — never the build clock.** Until 2026-09-26, 94 hub/info URLs fell back to the build time, so every deploy claimed they changed. `scripts/lastmod-core.mjs` (pure, unit-tested in `src/lib/sitemap-lastmod.test.ts`) derives a git date per route, hubs from the newest item they list; `scripts/check-sitemap-lastmod.mjs` (postbuild) fails on any `<lastmod>` with a time of day.

**`src/data/versions.ts`** — vendor versions quoted in page copy (today: `JQ_VERSION`, parsed from the `jq-wasm` pin in `package.json`). Page prose must read a version from here, never type it; the homepage proof strip does. Build-time only — never import it from a playground `<script>`; the jq badge keeps reading `jq.version` off the loaded binary.

**`src/data/tools.ts`** — the tool registry. `liveTools` (filtered view) drives every tool listing. Flip `status: 'planned' → 'live'` when shipping.

### Site search (`/search`)

Pagefind indexes `dist/` at build time (npm `postbuild`), building a separate per-`<html lang>` sub-index — so each locale's search only ever searches that locale's own pages, with no extra wiring. `Shell.astro` stamps `data-pagefind-body` on `<main>` — Pagefind semantics: once any page has it, pages **without** it are excluded, so utility pages opt out via Shell's `searchIndex={false}` prop (defaults to `!noindex`; used by `/search` itself and the legal pages). Header/Footer carry `data-pagefind-ignore`.

`/search` is a hand-built UI over the Pagefind JS API (no default UI bundle) — localized into all 5 locales via `src/components/SearchPage.astro` (the ToolsCatalog pattern: one shared component with its script/style, self-detecting locale through `Astro.currentLocale`; each of the 5 page files under `src/pages/{,de/,es/,fr/,pt-br/}search.astro` owns only Shell wiring). The client `<script>` stays 100% locale-agnostic: every translated string it needs is read from `data-i18n-*` attributes on `#ss-results` at boot (never hardcoded English), and the two HTML-bearing states (initial empty state, "index unavailable") reuse server-rendered markup rather than rebuilding translated strings as JS template literals. Still `noindex` and excluded from the sitemap in `astro.config.mjs` regardless of locale — and still `noAlternates` even though real localized copies now exist, since a noindex utility page has no SEO reason to advertise hreflang alternates between them. New UI strings live under the `search.*` key namespace in `src/i18n/ui/*.ts`.

### Container image (self-hosting)

`Dockerfile` (node build stage → `nginx:alpine`, `USER nginx`, port 8080) and
`docker-compose.yml` are the self-hosting path; `.github/workflows/docker-publish.yml`
publishes `ghcr.io/opscanopy/opscanopy.com` (public, `linux/amd64,linux/arm64`) on a
`v*` tag (`:X.Y.Z`, `:X.Y`, `:latest`) or a manual dispatch (`:edge`) — never on plain
pushes to `main`. `:latest` only exists once a `v*` tag has been pushed. Three things
about this image were wrong when first published on 2026-09-19 and are now guarded:

- **The hardened run must set the tmpfs owner.** The image runs as `nginx` (uid 101).
  A tmpfs mounts root-owned 0755 and *masks* the build-time `chown`, so
  `--read-only --tmpfs /var/cache/nginx` crash-loops on `mkdir client_temp … Permission
  denied`. `docker run` needs `--tmpfs /var/cache/nginx:uid=101,gid=101` (and the same
  for `/var/run`); Compose cannot express uid/gid, so `docker-compose.yml` uses long-form
  volumes with `mode: 0777`. A plain unhardened `docker run` works either way — which is
  how the broken compose file went unnoticed.
- **`.dockerignore` excludes `.git`**, so nothing in the build can shell out to git.
  `gen-sw.mjs` would fall back to `BUILD_ID 'dev'`, giving every image version one
  service-worker cache name (stale pages after an upgrade). The Dockerfile takes
  `ARG BUILD_ID`, CI passes `github.sha`, and `gen-sw.mjs` honours the env var. A bare
  local `docker build` still yields `'dev'`, which is correct for a throwaway image. The
  date generators (`gen-tool-meta`, `gen-lastmod`) also lose git in the image and degrade
  to null — cosmetic, not fixed.
- **The CI smoke test runs the image with the SAME flags the README documents**, then
  asserts `/`, a tool page, a locale page and that `sw.js` carries the short SHA. It must
  stay in lockstep with the README's command or it stops being evidence. Never write
  `curl … | grep -q` under `set -o pipefail` there: grep closes the pipe on first match,
  curl exits 23, and a healthy container fails the step.

`docker/build-push-action` went to **v7.4.0** on 2026-09-22 (Dependabot, merged
unreviewed). v7's breaking changes are the Node 24 runtime (needs Actions Runner
2.327.1+, which `ubuntu-latest` has), the removal of `DOCKER_BUILD_NO_SUMMARY`
and `DOCKER_BUILD_EXPORT_RETENTION_DAYS`, and dropping the legacy export-build
tool. This workflow sets none of those and every input it passes (`context`,
`platforms`, `push`, `build-args`, `tags`, `labels`, `cache-from`, `cache-to`)
is unchanged in v7, so the bump was assessed as compatible on inspection — but
**it has never actually run**, because the workflow only fires on a `v*` tag or
a manual dispatch. Expect the next tagged release to be the first real test.

Verify a published image the way a stranger would: `docker logout ghcr.io`, pull, run
with the README's command, `curl localhost:8080/sw.js | grep BUILD_ID`. A raw `curl` to
`ghcr.io/v2/…/manifests/…` returns 401 even for a public image (anonymous token
exchange), so it proves nothing. `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md` and
`.github/ISSUE_TEMPLATE/` exist as of 2026-09-18; keep the four-file tool pattern
described in CONTRIBUTING in step with this file.

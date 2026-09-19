---
version: 1
name: Field-Manual
description: OpsCanopy's design language — a printed field manual for ops. Warm-paper light theme and warm-charcoal dark theme (dark-stable "instrument slabs" for demos/terminals/code in BOTH themes), the IBM Plex superfamily, leaf-green used as INK not area, amber annotation ink, squared "instrument panel" chrome, and a signature CanopyField arc-lattice texture derived from the logo. Replaces the earlier "Vercel-inspired" system (Geist + emerald + mesh blobs + pills).
---

# OpsCanopy — the "Field Manual" design system

All tokens live in the `@theme` block of `src/styles/global.css`, with a
`html[data-theme='dark']` block re-pointing the same custom properties. Every
utility (`text-ink`, `bg-canvas`, `display-lg`, `eyebrow`, `.btn`, `.card`,
`.badge`) resolves through those tokens, so the whole site re-themes with no
Tailwind `dark:` variants. `src/lib/contrast.test.ts` is the palette gate — run
`npm run test` after any token edit.

## Identity

A printed field manual for ops: **warm paper** by day, **warm charcoal** at
night, with **dark instrument slabs** (the live demos, terminals, and code
blocks) that stay dark in BOTH themes — like plates bound into a manual. The
recurring texture is **CanopyField**, an arc lattice generated from the logo's
three nested canopy arcs (`src/components/MeshGradient.astro` — filename kept for
its consumers; it no longer renders a mesh).

## Color

Green is **ink, never area** — leaf-green appears as text, strokes, and data
accents, never as a fill under white text. Amber (`--color-accent-ink`) is the
annotation ink: figure numbers, callouts, leader lines. Decoupled from
`--color-warning*`, which stays a live diagnostic semantic.

**Light (`@theme static`):** canvas `#fdfcfa` · soft `#f4f1ea` · soft-2 `#ebe7de` ·
soft-3 `#e0dbcf` · card `#fffdf9` · ink `#211e19` · body `#524f48` · mute
`#5d5950` · hairline `#e6e1d6`/`#cfc9bb`/`#9c968a` · inverse `#1b1915` · brand
`#4a8c3f` (fill/graphic only) · brand-strong/link `#33652c` (the only green for
white-on-green) · accent-ink `#a85a06` · focus `#1d5fd6`.

The surface ladder canvas → soft → soft-2 → soft-3 steps by >= 3 L* (CIE) in both
themes, and `card` sits >= 3 L* off `canvas-soft` (the body background);
`contrast.test.ts` gates the ladder, not only the text pairs. Before 2026-09-19
the steps were ~2.4 L* and card was 0.37 L* off canvas — one sheet of paper.

**Dark (`[data-theme='dark']`):** canvas `#141310` · soft `#1c1a16` · soft-2
`#272319` · soft-3 `#302b22` · card `#24211a` · ink `#f0ede5` · body `#aca69a` ·
mute `#9a9488` · inverse `#2c2822` (slab > card > soft > canvas) ·
brand=brand-strong=link=success `#8fc97a` (four explicit declarations — the
contrast test reads only this block) · accent-ink `#e0a458` · focus `#7fb0ff`.

**Slab inks** (identical in both blocks, because the slab is dark in both):
`inverse-fg #f4f1ea` · `inverse-mute #b8b2a4` · `inverse-brand #8fc97a` ·
`inverse-accent #e0a458` · `inverse-error #ff9d95` · `inverse-hairline #ffffff1f`
· dots `#e0685f / #e0b23f / #63c079`.

Category hues (`categoryHue` in `src/data/tools.ts` → `--color-cat-<slug>` tokens)
are OKLCH-uniform: L 0.50 / C 0.09 on paper, L 0.76 / C 0.10 on charcoal, only
the hue varies, so the twelve dots read as one set. Consumed from inline styles
via `categoryAccentVar()` (which is why the theme block is `@theme static`).
They are dots + 8% art tints, never text; the gate holds them to 3:1 on card
and canvas-soft in both themes and to the registry hex (the OG generator reads
the hex directly).

## Typography

IBM Plex superfamily — Plex Sans Variable (UI/body/display) + Plex Mono static
400/500/600 (eyebrows, data, code, badges). A mono wordmark is the strongest
"ops" signal in the system.

- **Display recipe:** `display-hero` `clamp(38px,5.5vw,78px)` at weight 660,
  tracking −0.03em; `display-xl/lg` weight 640. Load-bearing data inside display
  headlines is set in Plex Mono + accent (mono-mixed headlines).
- **eyebrow:** mono 500, `letter-spacing 0.08em`, uppercase, `--color-brand-strong`.
- Body scale (`body-lg/md/sm`, `caption`, `code-mono`) unchanged in size.

## Shape & depth — instrument panel

Squared radii: `xs 2 · sm 4 · md 6 · lg 8 · xl 10` (`--radius-pill` re-pointed to
6px). Depth has three tiers, each with one job — **L0 rest** (`shadow-hairline`,
inset ring only: rows, chips, `.card-soft`, `.badge`), **L1 card**
(`shadow-subtle`, ring + 2px drop: `.card`, grouping), **L2 instrument**
(`shadow-float`, ring + 8px drop: `.instrument`, menus, hover lift) — plus modal.
One L2 object per viewport. Buttons are squared with a 1px border; badges are
mono tags (`radius-xs`), except `.badge-info` (dates/status) which stays 12px
sentence-case for legibility; `Badge variant="new"` is the one amber badge.

**Instrument-slab rule:** `HeroDemo`, `TerminalPlay`, `ErrorTerminal`,
`CodeBlock`, the Mission 90 terminals, the privacy panel and the tool result
panels render through the shared `.instrument` class (`.instrument-flush` when
nested in a card) on `--color-inverse` in BOTH themes, with the
`--color-inverse-hairline` ring and a `FigureCap` caption bar (three dots + a
mono `fig. NN — slug · category` label; the figure number is the tool's position
in the registry). Ten uses of one detail is a brand; the cap is that detail. Because the surface is dark in both
themes, so are its inks: the only legal text colours on a slab are
`--color-inverse-fg`, `--color-inverse-brand` (leaf) and `--color-inverse-accent`
(amber) — never `brand`, `brand-strong` or `accent-ink`, whose light-theme values
are tuned for warm paper and fall below AA on charcoal. Eyebrows on a slab need
the `!` form (`!text-inverse-brand`) to beat the `eyebrow` utility's own colour.

**Concentricity:** nested rounded elements use `inner-radius = outer-radius −
padding` (chips in cards, code in slabs, art in card caps).

## Composition (kills the "AI skeleton")

- Numbered mono section rail / `fig. NN` figure indices where content is a real
  sequence. Numbers line up: `font-variant-numeric: tabular-nums` is set once in
  global.css (`#playground`, `dl`, `output`, `time`, `.badge`, `code-mono`,
  `eyebrow`) — never per component.
- Type stays on the integer scale (`type-scale.test.ts` walks every component):
  no half-pixel sizes, nothing under 11px.
- One hero object per screen: the homepage stacks a display-xl caption over the
  full-width HeroDemo instrument (the 5/7 split was retired 2026-09-19); tool pages
  put the dark result panel directly under the input. Elsewhere, asymmetric 5/7–7/5
  splits; avoid centered-text sections except the closing CTA.
- Tool registries read as dense index rows, not uniform card grids, where it fits.
- Motion carries information only (live demos, self-typing terminals) — no
  decorative scroll-reveals. Interaction states only on interactive elements.
- Designed error pages (404/500/offline as terminal slabs); neofetch-style
  colophon footer.

## Imagery & OG

- `MeshGradient.astro` → CanopyField arc lattice (ink-derived, themes itself).
- Tool illustrations: `public/tool-art/<slug>.svg`, category-tinted via `ToolArt`.
- OG cards: `scripts/gen-og-images.mjs` (per-tool, warm-charcoal + leaf) and
  `scripts/gen-og.mjs` (`og-default`, warm paper + leaf/amber wash). Favicon is a
  true vector (`public/favicon.svg`) → `scripts/gen-favicons.mjs`.
- On-canvas SVG/OG text uses system fonts (librsvg has no webfonts).

## Verification

`npm run build` (never bare `astro build` — the postbuild chain runs Pagefind,
trailing-slash check, CM modulepreload, and the service worker) + `npm run test`
(contrast gate + engine tests). Runtime QA per `.claude/skills/verify` and both
themes × mobile.

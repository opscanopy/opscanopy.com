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

**Light (`@theme`):** canvas `#fdfcfa` · soft `#f7f5f0` · soft-2 `#f0ede6` ·
soft-3 `#e7e3d8` · card `#fffdf9` · ink `#211e19` · body `#524f48` · mute
`#5d5950` · hairline `#e6e1d6`/`#cfc9bb`/`#9c968a` · inverse `#1b1915` · brand
`#4a8c3f` (fill/graphic only) · brand-strong/link `#33652c` (the only green for
white-on-green) · accent-ink `#a85a06` · focus `#1d5fd6`.

**Dark (`[data-theme='dark']`):** canvas `#141310` · soft `#1a1814` · soft-2
`#221f1a` · soft-3 `#2c2921` · card `#1c1a15` · ink `#f0ede5` · body `#aca69a` ·
mute `#9a9488` · inverse `#232019` · brand=brand-strong=link=success `#8fc97a`
(four explicit declarations — the contrast test reads only this block) ·
accent-ink `#e0a458` · focus `#7fb0ff`.

Category accents (`categoryAccent` in `src/data/tools.ts`) are warm-shifted,
OKLCH-uniform hues — one per tool category, used as dots + tinted art backdrops.

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
6px). Depth is flat: the inset-ring shadow carries the edge; drop shadows are
reserved for things that truly float (menus, modal, hover lift). Buttons are
squared with a 1px border; badges are mono tags (`radius-xs`), except
`.badge-info` (dates/status) which stays 12px sentence-case for legibility.

**Instrument-slab rule:** `HeroDemo`, `TerminalPlay`, `ErrorTerminal`,
`CodeBlock`, and privacy panels render on `--color-inverse` in BOTH themes, with
a 1px `#ffffff1f` ring + mono caption bar.

**Concentricity:** nested rounded elements use `inner-radius = outer-radius −
padding` (chips in cards, code in slabs, art in card caps).

## Composition (kills the "AI skeleton")

- Numbered mono section rail / `fig. NN` figure indices where content is a real
  sequence.
- Asymmetric 5/7–7/5 splits; avoid centered-text sections except the closing CTA.
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

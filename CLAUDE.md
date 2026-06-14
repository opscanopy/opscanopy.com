# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # start Astro dev server (localhost:4321)
npm run build        # production build → dist/
npm run preview      # preview the production build
npm run test         # run all engine tests once (vitest run)
npm run test:watch   # watch mode
```

Run a single test file:
```bash
npx vitest run src/lib/hash-generator/engine.test.ts
```

## Architecture

**OpsCanopy** is a fully static Astro v6 site. Every tool runs 100% client-side — there is no server, no API, no backend. Astro v6 + Tailwind v4 + no framework (plain `<script>` modules).

### Adding a tool — the four-file pattern

Every tool follows the same four-file structure:

| File | Purpose |
|------|---------|
| `src/lib/<slug>/engine.ts` | Pure TS logic, no DOM. Exported: one sync or async function |
| `src/lib/<slug>/engine.test.ts` | Vitest tests against RFC/NIST vectors where applicable |
| `src/components/<Name>Playground.astro` | Interactive island — CM or textarea input, output HTML, `<script>` that lazily imports the engine |
| `src/pages/<slug>.astro` | Tool page: `ToolHero` → playground section → why section → `ToolPipeline` → reference → dark next-step band → `FaqList` → `ToolCrossLinks` + JSON-LD |

Register the tool in **`src/data/tools.ts`** (slug, name, tagline, description, status, category, keywords, accent). This single file drives the homepage grid, `/tools` catalog, and all cross-links.

### Layout chain

`Page → Shell.astro → Layout.astro` (imports `global.css`, renders `<html>` + SEO head) + `Header.astro` + `Footer.astro`.

Most pages use `<Shell title=… description=… canonical=… jsonLd=…>`. JSON-LD is assembled per-page with helpers from `src/lib/jsonld.ts` (`softwareAppLd` + `faqPageLd`).

### Design system — Tailwind v4 CSS-first

All design tokens live in the `@theme` block at the top of **`src/styles/global.css`**. Tailwind utilities (`text-ink`, `bg-canvas`, `text-brand`, etc.) are generated from these custom properties. **Never redefine tokens outside this file.**

Key brand tokens:
- `--color-brand: #10b981` (emerald fill, logo mark)
- `--color-brand-strong: #047857` (AA-safe text/link on light)
- `--color-link`, `--color-success` are also emerald
- `--color-inverse / --color-inverse-fg` — dark-stable surface for code blocks and accent bands (dark in both themes)

### Light/dark theming

Theme is controlled by `html[data-theme="dark"]` overriding the `@theme` custom properties. A no-flash inline script in `Layout.astro` reads `localStorage.theme` (or `prefers-color-scheme`) and sets `data-theme` before paint. The header toggle calls `wireThemeToggles()` and persists to `localStorage`.

Never use Tailwind `dark:` variants — re-point the token variables in the `html[data-theme='dark']` block in `global.css` instead.

### Playground islands

Each playground `<script>` follows this boot pattern:
```js
document.addEventListener('astro:page-load', () => boot());
function boot() { /* set up DOM refs, load example, wire events */ }
```

CodeMirror v6 is used in 9 tools: `AlertLint`, `GHA Validator`, `GHA Expression Tester`, `Env Checker`, `Cron to Systemd`, `LogQL↔PromQL`, `Regex Log Tester`, `PromQL Explainer`, `CVE Converter`. For all of these the CM keymap includes an `Escape` binding to release focus (Tab-trap fix). The `GHA Expression Tester` engine (`src/lib/github-actions-expression-tester/`) fans out into multiple modules behind one public `engine.ts` façade and is pinned to a versioned conformance corpus (`conformance.ts`, `GHA_SEMANTICS_VERSION`).

Engines are dynamically imported inside the boot closure so the heavy logic code-splits away from the page shell.

### Networking tools — shared IP math

All 6 networking tools (`subnet-calculator`, `ip-address-converter`, `cidr-checker`, `mac-address-formatter`, `reverse-dns-ptr`, `subnet-splitter`) import from **`src/lib/ip-core.ts`**. This module uses `BigInt` throughout for exact 32-bit (IPv4) and 128-bit (IPv6) arithmetic. Parsers return `null` on invalid input — they never throw.

### Tests

Tests live at `src/lib/<tool>/engine.test.ts`, run with `vitest` in `node` environment (no DOM needed — engines are pure functions). Only engines have tests; playgrounds do not. New engines should be test-driven with real RFC/NIST vectors where they exist.

### Site config

**`src/data/site.ts`** — brand constants, `navLinks` (Tools, Blog), `footerColumns`. Change nav here, not in components.

**`src/data/tools.ts`** — the tool registry. `liveTools` (filtered view) drives every tool listing. Flip `status: 'planned' → 'live'` when shipping.

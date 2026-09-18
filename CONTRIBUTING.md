# Contributing to OpsCanopy

Thanks for being here. Bug reports, new tool ideas, translations and fixes are
all welcome.

The short version: **tools are engineered against real specifications, so a
change to behaviour needs a test that would have caught the bug**, and page copy
lives in five locales that ship together.

## Getting set up

```bash
npm install
npm run dev      # http://localhost:4321
```

| Command | What it does |
| :--- | :--- |
| `npm run dev` | Dev server |
| `npm run build` | Production build to `dist/` (never run `astro build` bare — the postbuild chain builds the search index, the service worker and the CSP hashes) |
| `npm run preview` | Serve the production build |
| `npm run test` | Every engine test, plus the colour-contrast gate |
| `npm run check` | Types across `.astro` and `.ts`. **Must stay at zero errors — it is a CI gate.** |

Run a single test file:

```bash
npx vitest run src/lib/hash-generator/engine.test.ts
```

`npm run build` passing proves nothing about types: vite strips them without
checking. Run `npm run check` before opening a PR.

## How a tool is built

Every tool is four files, and the split is the point: **the engine never touches
the DOM**, so it can be tested as a pure function.

| File | Purpose |
| :--- | :--- |
| `src/lib/<slug>/engine.ts` | Pure TypeScript. One exported function, sync or async. No DOM, no network. |
| `src/lib/<slug>/engine.test.ts` | Vitest, against real RFC/NIST vectors wherever they exist |
| `src/components/<Name>Playground.astro` | The interactive island: markup, styles, and a `<script>` that lazily imports the engine |
| `src/pages/<slug>.astro` | The page: hero → playground → why → pipeline → reference → FAQ → cross-links |

Then register it in **`src/data/tools.ts`** (slug, name, tagline, description,
status, category, keywords, accent). That one file drives the homepage, the
`/tools` catalog and every cross-link.

Engines are imported **inside** the playground's boot closure, so the heavy
logic code-splits away from the page shell:

```js
document.addEventListener('astro:page-load', () => boot());
async function boot() {
  const engine = await import('../lib/<slug>/engine');
  /* wire DOM, load example, attach events */
}
```

### Things that will come up in review

- **No server.** There is no backend and no API. If a feature needs one, it does
  not belong here — that constraint is the product.
- **Parse, don't approximate.** Return a specific diagnostic ("Octet 256 is
  greater than 255."), never a generic "invalid".
- **Escape everything injected.** Every value that reaches `innerHTML` goes
  through `escapeHtml()` (`src/lib/escape-html.ts`).
- **Design tokens live in one place.** They are the `@theme` block of
  `src/styles/global.css`. Don't define colours anywhere else, and don't use
  Tailwind `dark:` variants — re-point the token in the
  `html[data-theme='dark']` block instead. `npm run test` includes a contrast
  gate that will fail you.
- **Keyboard and copy behaviour is shared.** Use `wireRunKeys`
  (`src/lib/run-keys.ts`) for Enter / ⌘-Ctrl+Enter rather than writing another
  keydown handler.

`src/components/CidrCheckerPlayground.astro` is the reference implementation for
playground UX — example chips, the live-eval hint line, per-row copy, calm error
handling, and the accessibility pattern (one `role="status"` summary; the
results container is *not* a live region).

## Translations

Tool and blog pages have hand-translated copies under
`src/pages/{de,es,fr,pt-br}/`. They import the **same** playground component —
playground UI strings stay English in every locale, deliberately.

**Any change to page copy (H1, lead, FAQ, JSON-LD) must ship to all five locales
in the same commit**, translated in each file's existing register. A partial
change leaves the localized pages contradicting the tool.

Nav and footer strings live in `src/i18n/site/{en,de,es,fr,pt-br}.ts`; UI strings
live in `src/i18n/ui/*.ts`.

Translation fixes on their own are very welcome, and are a good first
contribution.

## Pull requests

- Branch off `main`.
- `npm run test` and `npm run check` both green.
- A behaviour change comes with a test.
- Page copy changes cover all five locales.
- Say what you changed and why. If you found a real-world case that broke, put
  it in the PR — it usually belongs in the test file too.

## Reporting a bug

Open an issue with the input you gave the tool, what you expected, and what it
produced. Since everything runs client-side, the browser and version matter.

For anything security-sensitive, see [SECURITY.md](./SECURITY.md) instead —
please don't open a public issue.

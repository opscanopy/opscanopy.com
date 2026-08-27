# Astro 6 → 7 upgrade — DONE 2026-08-27

Landed on 6.4.8 → **7.2.9**. `npm ci`, 3652 tests, `npm run check` (0 errors) and the
build all pass, and `npm audit --omit=dev` reports **0 vulnerabilities**, so
`deploy.yml`'s audit gate is back to `--audit-level=high` blocking — the narrowing
from 2026-08-22 is reverted, as intended.

## What actually broke

Only two things, both caught by the gates rather than by reading release notes.

**1. Markdown plugins are no longer wired to `unified`.** Astro 7 makes "Sätteri" the
default Markdown processor and stops installing `@astrojs/markdown-remark`, which is
what `markdown.remarkPlugins` / `rehypePlugins` run on. Astro 6 warned about this;
Astro 7 makes it a hard config error. Fixed by installing `@astrojs/markdown-remark`
explicitly, which keeps `remarkCallouts` and `rehypeChapters` running on the pipeline
they were written for and keeps rendering byte-identical.

**Do not drop that dependency.** Porting the two plugins to Sätteri is separate work
with no forcing function behind it.

**2. `scripts/inject-cm-modulepreload.mjs` found 0/19 playgrounds.** Two changes at
once: Vite now emits dynamic imports with backticks (``import(`./x.js`)``) where the
script's regex only accepted double quotes, and CodeMirror packages resolve to
`dist/` rather than their package root, renaming every vendor chunk from
`index.<hash>.js` to `dist.<hash>.js` — the exact prefix the script filtered on.

Rather than swap one hardcoded basename for another, chunk classification is now
**"imported by more than one playground"**. Vendor code is shared by construction;
a playground's own `engine`/`examples` chunks are not. Measured on the real build:
6 shared chunks, 43 single-use — a clean split that does not depend on Rollup's
naming, so the next rename will not break it.

## What did NOT break

Checked because the pre-upgrade notes called each one out as a risk:

- **512 pages**, 68 per locale, unchanged
- **hreflang/canonical byte-identical** to the live Astro 6 page (`de`, `en`, `es`,
  `fr`, `pt-BR`, `x-default` — note the capital `BR`)
- **11 CSP inline-script hashes**, same count, so `inject-csp-hashes.mjs` still
  covers the full inline set
- **Pagefind**: 5 language sub-indexes, 490 pages; `/search` returns 46 hits for
  "subnet"
- **jq-wasm**: still hashed into `dist/_astro/jq.<hash>.wasm` and same-origin; the
  UI badge reads `jq 1.8.2` off the loaded binary
- **`getStaticPaths`** across the mission90 registry↔collection pairing
- 17 pages loaded with **zero console/page errors**, and `/tools` search
  (39 → 3 → 39) and A–Z sort still work

## Notes for next time

`wrangler` came along to 4.127.0, which declares `miniflare 5.x-alpha` as its own
dependency. That is Cloudflare's pin, not npm improvising — it is dev-only, outside
the `--omit=dev` gate, and `wrangler --version` runs clean.

On Windows, `npm ci` can fail `EPERM: unlink lightningcss.win32-x64-msvc.node` when a
dev/preview server still holds the native module. Kill node first; it cannot happen on
CI's Linux runner.

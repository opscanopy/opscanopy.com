# Tracked: Astro 6 → 7 upgrade

**Status:** not started. Opened 2026-08-22.

## Why this exists

`npm audit` reports a high-severity advisory against `astro` with a vulnerable range
of `<=7.0.9`. We are on **6.4.8**, and there is no patched 6.x — the range covers the
whole 6 line, so clearing it means **6.4.8 → 7.2.4**, a major.

Astro *does* ship 6.x patches (6.4.4 → 6.4.8 was applied on 2026-08-22 and fixed
other things), which makes this easy to misread. It does not lift the advisory:
6.4.8 is still inside `<=7.0.9`.

## Why it is not urgent

The advisories it would clear are not reachable by a visitor to opscanopy.com:

| Advisory | Why it does not apply here |
|---|---|
| XSS via unescaped spread-prop attribute names | Requires attacker-controlled attribute names at render time. All props come from authored content and `src/data/*`. |
| XSS via `transition:*` directive values on hydrated islands | Same — directive values are authored, never user input. |
| Host-header SSRF in prerendered error page fetch | Needs a server to receive a Host header. The site is fully static on Cloudflare assets; there is no origin. |

The site ships **no server code and no untrusted build input**, so these are
build-time concerns on a build nobody else can feed. That is the basis on which
`deploy.yml`'s audit gate was narrowed to criticals-block / highs-report on
2026-08-22 — see the comment in that file.

**The narrowing is the temporary part, not the upgrade.** When this lands, put the
gate back to `--audit-level=high` blocking.

## What the upgrade has to cover

Not a version bump — verify all of it before merging:

- `astro.config.mjs` — the sitemap integration, i18n routing, the `/search` and
  `/tests` exclusions
- **5 locales** (`en` unprefixed + `de`, `es`, `fr`, `pt-br`) — routing and
  `hreflang`/canonical output, per CLAUDE.md's all-locales rule
- **19 CodeMirror playgrounds** — `scripts/inject-cm-modulepreload.mjs` greps build
  output for vendor chunks; Astro 7 may rename or re-split them
- `scripts/inject-csp-hashes.mjs` — currently finds 11 inline scripts. A changed
  inline-script set silently breaks CSP, and the marker guard only catches a
  *missing* postbuild, not a wrong hash list
- `jq-wasm` — the `import('jq-wasm/jq.wasm?url')` asset pin must still hash into
  `dist/_astro/` and stay same-origin under the CSP
- Pagefind postbuild + per-locale sub-indexes, and the trailing-slash guard
- `mission90Days` content collection + `getStaticPaths` registry↔collection checks

## Gates

Do it on a branch. `npm ci` clean, 3652 tests green, `npm run build` exit 0 (check
the real exit code — a piped build reports the pipe's status, which has masked a
failed build here before), then `npx wrangler versions upload` and check a preview
before promoting. Also re-run `npm run check` and confirm the ~128 pre-existing
errors have not grown.

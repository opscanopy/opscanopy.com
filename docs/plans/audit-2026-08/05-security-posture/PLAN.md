# Point fix 05 — site security posture: prove the trust story

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The CSP actually mitigates XSS (no `unsafe-inline`), a vulnerability-disclosure channel exists, the supply chain is automated, and the dead 3.7 MB Go-WASM PoC stops shipping.

**Architecture:** Three children. The CSP work is a new postbuild script (same pattern as `scripts/inject-cm-modulepreload.mjs`) that hashes the site's few inline scripts into `dist/_headers` — chosen over Astro's `security.csp` meta-tag emitter because a `<meta>` CSP can't carry `frame-ancestors` and would leave policy split across two surfaces. Disclosure and supply-chain are config/content only.

**Tech Stack:** Node script (postbuild), GitHub config files. No runtime deps.

**Verified evidence:**

- `public/_headers:47` — `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' https://www.googletagmanager.com` (confirmed live). `'unsafe-inline'` nullifies script-src as an XSS control and directly amplifies plan 01's localStorage exposure. The justifying comment at `:8-9` ("playground boot scripts") is inaccurate — those bundle to external `/_astro/*` files; the real inline set is 6 Astro-generated blocks (verified in `dist/jwt-decoder/index.html`) + JSON-LD (non-executable, not CSP-relevant).
- `/.well-known/security.txt` → 404; no `SECURITY.md`; no disclosure channel of any kind.
- `.github/` has no `dependabot.yml`, no CodeQL, no `npm audit` gate; workflow actions pinned to floating tags. (`package-lock.json` is clean: lockfileVersion 3, integrity on every package, `jq-wasm` exact-pinned.)
- `public/engine.wasm` (3,764,378 bytes) + `public/wasm_exec.js` + `/alertlint-wasm-demo/` all live in production; CLAUDE.md itself calls the pattern deprecated. Source exists at `engines/alertlint/` but nothing ties the committed binary to it.
- Minor headers: no COOP/CORP, no `form-action`, `Permissions-Policy` missing `browsing-topics=()`; HSTS advertises `preload` but hstspreload.org says `unknown`.

## Children (independent)

| Child | Delivers | Ships alone? |
|-------|----------|--------------|
| [05a-csp-hashes.md](05a-csp-hashes.md) | Postbuild CSP-hash injection; drop `unsafe-inline`; header tightening (form-action, COOP, Permissions-Policy); HSTS preload decision | Yes |
| [05b-disclosure.md](05b-disclosure.md) | `security.txt`, `SECURITY.md`, `/security` page (5 locales) putting the trust proof where the paste box is | Yes |
| [05c-supply-chain.md](05c-supply-chain.md) | dependabot + CodeQL + SHA-pinned workflow actions + removal of the dead Go-WASM PoC | Yes |

## Done when

- [ ] Live CSP has no `unsafe-inline`; every page still boots (theme no-flash, SW registration, palette) — headless-verified on a tool page, the homepage, and /search in both themes.
- [ ] `https://opscanopy.com/.well-known/security.txt` → 200, RFC 9116-valid.
- [ ] Dependabot + CodeQL runs appear on the repo; workflow `uses:` are SHA-pinned (the site's own gha-validator, post-04, passes its own workflows).
- [ ] `engine.wasm` / `wasm_exec.js` / the demo page are gone from `dist/` and prod returns 404/410 for them.

**Ordering note:** 05a must land **before** plan 12's gtag-defer change or in the same deploy (moving the gtag tag changes the inline-script set; the hash script absorbs it automatically, but deploying 12 first against the hand-written header would break analytics boot).

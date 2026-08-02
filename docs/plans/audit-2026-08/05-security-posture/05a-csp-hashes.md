# 05a — CSP: hash the inline scripts, drop `unsafe-inline`

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or superpowers:executing-plans. Checkbox steps.

**Goal:** A postbuild script computes SHA-256 hashes of every executable inline `<script>` in `dist/**/*.html` and rewrites the CSP line in `dist/_headers`; `'unsafe-inline'` is removed; the build fails loudly if the inline-script set explodes or the rewrite marker is missing.

**Why postbuild-into-`_headers`, not Astro's `security.csp`:** Astro emits CSP as `<meta http-equiv>`, which cannot carry `frame-ancestors` and would split policy across meta + header (browsers enforce the intersection — a maintenance trap). One header, one owner. The postbuild pattern is already house style (`scripts/inject-cm-modulepreload.mjs`: discover fresh every build, `fail()` the build on drift).

**Files:**
- Create: `scripts/inject-csp-hashes.mjs`
- Modify: `public/_headers` (CSP line gains a `{{SCRIPT_HASHES}}` marker; `unsafe-inline` removed; extra directives), `package.json` (postbuild chain)
- Test: build-time self-checks inside the script (mirroring `inject-cm-modulepreload.mjs` — this is build tooling, not a vitest surface)

- [ ] **Step 1: Marker + tightened header.** In `public/_headers`, replace the CSP line:

```
Content-Security-Policy: default-src 'self'; script-src 'self' {{SCRIPT_HASHES}} 'wasm-unsafe-eval' https://www.googletagmanager.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://*.google-analytics.com https://*.googletagmanager.com; font-src 'self'; connect-src 'self' https://*.google-analytics.com https://*.googletagmanager.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'
```

Start from the **current live line** (read it first — img-src/connect-src above are illustrative; keep what exists, change only: remove `'unsafe-inline'` from script-src, insert the marker, add `form-action 'self'`, `base-uri 'self'`, `object-src 'none'` if absent). Keep `style-src 'unsafe-inline'` for now — Astro scopes styles inline; hashing those is a separate, lower-value fight. Update the stale justification comment at `:8-9` while there.

Same edit block: append `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Resource-Policy: same-origin`, and extend `Permissions-Policy` with `browsing-topics=(), payment=(), usb=()`. **COEP: leave unset** — `require-corp` would break the GA image beacon path for zero isolation benefit (no SharedArrayBuffer use).

HSTS: keep `max-age` + `includeSubDomains`; **either** submit opscanopy.com at hstspreload.org **or** drop the `preload` token — pick one in the PR description; an inert token is the only wrong state.

- [ ] **Step 2: The script** (`scripts/inject-csp-hashes.mjs`), following `inject-cm-modulepreload.mjs`'s structure and `fail()` helper:

```js
// Collect executable inline scripts across dist/**/*.html:
//   <script>…</script> and <script type="module">…</script> — executable, hash them.
//   type="application/ld+json" (and any other non-JS type) — data, skip.
//   src=… external — covered by 'self', skip.
// Hash EXACTLY the raw bytes between the tags (no trim — CSP hashes the source text).
// sha256 → base64 → 'sha256-<b64>'.
//
// Self-checks (fail the build):
//   - zero HTML files found
//   - {{SCRIPT_HASHES}} marker missing from dist/_headers
//   - unique hash count > 24  → "inline script set exploded — someone added
//     per-page dynamic inline JS; hash-based CSP can't cover unbounded sets.
//     Find the change and make it external or deterministic."
//   - unique hash count < 3   → "suspiciously few — did the extractor regex rot?"
// Write dist/_headers with the marker replaced by the sorted hash list.
```

Extractor: `/<script(\s[^>]*)?>([\s\S]*?)<\/script>/gi`, executable iff no `src` attribute and (`type` absent or `module` or `text/javascript`). Hash `m[2]` raw.

- [ ] **Step 3: Chain it.** `package.json` postbuild becomes `pagefind --site dist && node scripts/inject-cm-modulepreload.mjs && node scripts/inject-csp-hashes.mjs`. It must run **after** any script that touches HTML. Note: because the source `public/_headers` now carries a marker, an un-postprocessed deploy would ship a broken CSP — the marker string is deliberately invalid CSP so it fails **closed** (scripts blocked, site visibly broken in preview) rather than silently open; CLAUDE.md already mandates never deploying a bare `astro build`.

- [ ] **Step 4: Verify.**
  - `npm run build`, inspect `dist/_headers` — hash list present, no `unsafe-inline` in script-src.
  - `npm run preview` + headless drive (per `.claude/skills/verify/SKILL.md`) of `/`, one CM tool page, `/search`, with the DevTools console captured: zero CSP violation reports; theme toggle works pre-paint (the no-flash script is the critical hashed block); SW registers; palette opens.
  - Simulate drift: add a junk inline script to a built page, re-run the inject script → build fails with the explosion message. Remove it.
- [ ] **Step 5:** Update `docs/seo-setup.md` or CLAUDE.md's deploy notes if they quote the old header (grep for `unsafe-inline` across docs).
- [ ] **Step 6: Commit** — `git commit -m "feat(security): hash-based CSP replaces unsafe-inline; form-action/base-uri/object-src/COOP/CORP; postbuild injector fails on drift"`

**Interaction:** plan 12's gtag-defer moves a script from inline to dynamically-injected — the hash set shrinks by one automatically on the next build. No coordination needed beyond deploying via `npm run build`.

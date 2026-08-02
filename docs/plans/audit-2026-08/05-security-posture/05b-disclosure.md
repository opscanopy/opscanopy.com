# 05b — disclosure channel + a /security page where the paste box is

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or superpowers:executing-plans. Checkbox steps.

**Goal:** RFC 9116 `security.txt`, a repo `SECURITY.md`, a `/security` page stating the threat model in plain language, and a one-line trust affordance on every tool page — the proof moved to where the decision to paste is made.

**Files:**
- Create: `public/.well-known/security.txt`, `SECURITY.md`, `src/pages/security.astro` (+ 4 locale copies), i18n strings
- Modify: `src/components/ToolHero.astro` (trust line), `src/components/Footer.astro` nav via `src/i18n/site/{en,de,es,fr,pt-br}.ts`

### Task 1: security.txt + SECURITY.md

- [ ] **Step 1:** `public/.well-known/security.txt` (static asset — Astro copies `public/` verbatim):

```
Contact: mailto:hello@opscanopy.com
Expires: 2027-08-01T00:00:00.000Z
Preferred-Languages: en
Canonical: https://opscanopy.com/.well-known/security.txt
Policy: https://opscanopy.com/security/
```

(`hello@opscanopy.com` is the existing Cloudflare-routed inbox. RFC 9116 requires `Expires` ≤ 1 year out — add a calendar reminder in the commit body, or better: a build-time check in `scripts/inject-csp-hashes.mjs`'s file that fails the build when Expires is within 30 days. Cheap and it can't rot.)

- [ ] **Step 2:** `SECURITY.md` at repo root: supported version = live site only; report via the email above; no bounty, acknowledgment offered; 90-day coordinated disclosure; scope = the site + published engines; out of scope = GA4, Cloudflare infrastructure.
- [ ] **Step 3:** Verify `npm run build` places `dist/.well-known/security.txt`; check `dist/_headers` rules don't attach HTML headers to it.
- [ ] **Step 4: Commit** — `git commit -m "feat(security): RFC 9116 security.txt + SECURITY.md disclosure policy"`

### Task 2: /security page

- [ ] **Step 1:** `src/pages/security.astro` via `<Shell>` (follow `src/pages/privacy.astro`'s structure and its i18n pattern — strings in `src/i18n/pages/*.ts`). Content sections, written for a skeptical engineer, ~600 words:
  1. **Architecture = the guarantee** — static site, no backend, tools run in your tab; CSP `connect-src` allows only same-origin + Google Analytics; verify with the network tab, here's what you'll see (name the gtag request and state that inputs and URL fragments never appear in it).
  2. **What we store on your device** — link /privacy's key inventory; secrets backstop (plan 01).
  3. **What we can't protect against** — your own browser extensions, a compromised device, pasting secrets into *other* sites' tools.
  4. **Verify us** — GitHub repo link (MIT), `security.txt`, how to file a report.
- [ ] **Step 2:** Locale copies `src/pages/{de,es,fr,pt-br}/security.astro` (SearchPage/ToolsCatalog shared-component pattern is overkill for a static-copy page — mirror how privacy.astro's locale copies are structured, whichever that is; read one first). All five in one commit. Add footer link via all five `src/i18n/site/*.ts` files.
- [ ] **Step 3: Commit** — `git commit -m "feat(security): /security page — threat model, verification steps, disclosure — all locales"`

### Task 3: trust line at the paste box

- [ ] **Step 1:** In `ToolHero.astro`, under the tool tagline: a single muted caption (glossary-caption pattern, zero JS): `Runs in your browser — nothing you paste leaves this page. → How we prove that` linking `/security` (localized via `localePath()`/`getSiteContent` — match how ToolHero handles existing localized strings; if ToolHero is locale-agnostic today, take the string from the page frontmatter like other per-page copy, or the i18n ui namespace — read the component first and follow its pattern).
- [ ] **Step 2:** Exception copy: the four hard-excluded tools + cert decoder say `…leaves this page, and this tool never stores your input.` — driven by a boolean prop from the tool page, not a slug list in the component.
- [ ] **Step 3:** Headless verify on one tool page per locale (5 pages): caption renders, link resolves to the locale's /security, no layout shift (`ToolHero` is above the fold — check CLS on the verify screenshot).
- [ ] **Step 4: Commit** — `git commit -m "feat(tools): trust caption at the paste box, linking /security — all locales"`

**Done when** a security-conscious visitor can go paste-box → one click → the full verifiable story, and an external researcher can find the disclosure channel from any standard location (`/.well-known/security.txt`, GitHub SECURITY.md, footer).

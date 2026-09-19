# Team site audit, September 2026 — verdicts and what shipped

An external audit of opscanopy.com (Lighthouse, Ahrefs free tools, manual review)
produced roughly eighty findings on 2026-09-18. Every checkable claim was verified
against the source, the built `dist/`, the GitHub repo, the `marketing/` folder and
the committed Search Console reports before anything was acted on. This is the
record: what was right, what was wrong, what shipped, and what was deliberately
left alone.

**The one-line version:** the diagnosis was right and about a third of the facts
were wrong. "Technically excellent — the problem is distribution and authority" is
exactly what the weekly SEO report had been saying for a month. But ~20 specific
claims were false or already done, and several recommendations contradicted
decisions made deliberately in the preceding weeks.

## Claims that did not survive checking

| The audit said | What is actually true |
| :--- | :--- |
| Sitemap has no `<lastmod>` | 486/486 URLs have it, since 2026-07-26 (`scripts/gen-lastmod.mjs`) |
| Tag pages ×5 locales in the sitemap | Tag pages are English-only; 34 of 41 already `noindex` and filtered |
| cidr-checker has no presets and no permalink | It has both — it is the reference implementation named in CLAUDE.md |
| ~20 playgrounds have drag/drop handlers | Zero, anywhere in `src/` |
| cron TZ input is hidden | Visible, styled, `<datalist>`-backed |
| K8s calculator silent on `256MB` | Returns `memRequest "256MB" is not a valid memory quantity.` |
| Contact page hides the email below GitHub | Email is the first link |
| `og:image:alt` still says the old title | It says `site.name — site.tagline` |
| `font-display` missing; Google Fonts | Self-hosted `@fontsource`, 21× `swap`, preloaded |
| GitHub Issues are disabled | Enabled (and Discussions) |
| 39 `<img>` with no alt | `alt=""` — decorative, correct; the card title is the text |
| Category labels untranslated | Translated in all four locales |
| Four CodeMirror validators lack Ctrl+Enter | All four had it; the 14 without were simple non-CM tools |
| CSP blocks GA4, console error on every page | Live test: 0 CSP violations, 0 console errors, no request to `www.google.com` |
| "You also have CF Web Analytics — drop one" | CF's beacon is edge-injected (cookieless count); GA4 feeds GSC. Different jobs |
| Practice-test review page leaks answers — noindex it | Made indexable on purpose: 7,500 words of real content had been `noindex` |
| "Do a Show HN" | Attempted 2026-09-04; HN blocks Show HN from new accounts |
| "awesome-devops #501 — verify merged" | Open, plus `SquadcastHub/awesome-sre-tools#172` |
| Ahrefs "Easy" KD keywords | SERPs checked: owned by roadmap.sh / Atlassian / GfG. Volume useful, KD noise |
| "Revert the homepage title" | Narrowed deliberately 08-31; impressions rose 28→47/week after. No harm signal |

## Claims that were right, and shipped (2026-09-18 → 19)

All on `main` and live.

- **Contrast on dark instrument slabs.** Light-theme amber (`#a85a06`, 3.45:1) and
  leaf (`#4a8c3f`, 4.27:1) sat on the charcoal slab in HeroDemo, TerminalPlay,
  ErrorTerminal and the homepage Mission 90 band. New dark-stable tokens
  `--color-inverse-brand` / `--color-inverse-accent`; four new pairs in the
  contrast gate, proven to fail on a revert. a11y → 100.
- **H1s restating the tool name** on 7 tools × 5 locales. Headline slots rewritten
  as benefit clauses; titles untouched.
- **Leaked `utm_source=telegram`** on Mission 90 copy-answer links.
- **Duplicated maintainer bio** on /about (×5 locales).
- **Four "Transcript pending" placeholders** on /verify-ai — replaced by one honest
  section-level note.
- **`/pt-BR/` 404** (case) and hand-prefixed English-only sections → 301s.
- **No cache rule on `/tool-art/*` and favicons**; dead `/fonts/*` rule removed.
- **`llms.txt`** gained a Practice tests section and all 90 day URLs.
- **RSS had no byline** → `dc:creator`.
- **Article author was the Organization** → `Person` with `url` and `sameAs`
  (121 pages).
- **Homepage subhead** in plain English; `<title>` names the category; a "how we
  know it's right" strip whose numbers are read from code (`74 conformance cases`,
  `jq 1.8.2`).
- **Ctrl/⌘+Enter** on the 14 tools that lacked it, via one shared `wireRunKeys`
  (39/39 coverage); `#ip=` write + Copy link on the PTR helper and subnet splitter;
  the two secret-bearing tools without a share-link explanation now have one.
- **Repo hygiene:** CONTRIBUTING, Code of Conduct, issue and PR templates,
  FUNDING, README badges.
- **Published container** `ghcr.io/opscanopy/opscanopy.com` — multi-arch, public,
  smoke-tested under the documented hardening.

## What the audit missed that shipping surfaced

- **`docker compose up -d` had never worked.** A tmpfs mounts root-owned and
  masked the image's `chown nginx`; the container crash-looped. The audit's
  "you're already Dockerable" was the machinery, not the outcome.
- **CI had not shipped in weeks.** The Deploy workflow's Type check failed on a
  gitignored generated file that a clean clone lacks (misdiagnosed for weeks as
  Linux vs Windows). Behind it, a second gate — `npm audit --omit=dev` — was failing
  on `js-yaml`. Both fixed; the workflow now deploys on push to `main`.
- **Every container image had `BUILD_ID = 'dev'`** (no `.git` in the build
  context), so all versions shared one service-worker cache. Fixed via a build-arg;
  the smoke test asserts the real SHA.

## Deliberately not done

- **Email capture** — the site promises "no email wall"; revisit with traffic.
- **Streaks** — an explicit product stance ("no streak to lose, no shame screen").
- **Collapsing the mega-menu to categories** — would remove the only sitewide links
  to the tool pages, which are the pages that need them.
- **Deferring GA4** — it is `async`; consent was fixed 09-06; let it collect first.
- **Renaming cidr-checker to "CIDR Calculator"** — never retitle a page with
  impressions; add a section instead.

## Still worth doing, in order

1. **Programmatic long-tail pages** (the crontab.guru playbook) — the audit's
   strongest idea and the only format that has reached page one for this domain.
   Separate plan.
2. Changelog → dated release notes + feed.
3. Search weights so tool pages outrank Mission 90 days for tool names.
4. r/selfhosted + awesome-selfhosted (eligible 2027-01-04).
5. Practice-test bank growth (content, not timer/shuffle).

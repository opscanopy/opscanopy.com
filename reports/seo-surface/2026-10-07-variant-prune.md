# SEO-surface diff — variant-prune — 2026-10-07

- Baseline: main 097d745fefcb (build 54.5 s; cold content layer (node_modules/.astro moved aside before the build: yes; fresh data-store.json written by the build: true; "[content] Synced content" logged: true))
- Candidate: this tree @ 097d745fefcb + uncommitted changes
- Allowlist: `scripts/seo-allow/variant-prune.json` (expires 2026-10-21)
- Build: candidate: this tree, cold content layer (node_modules/.astro moved aside before the build: yes; fresh data-store.json written by the build: true; "[content] Synced content" logged: true)
- Timing: candidate build 54.9 s
- Timing: extract + diff 7.4 s (699 + 699 pages)
- Timing: total 62.3 s

## Summary

- **Exit 0** — seo-surface: 0 must-explain, 277 allowed, 17 informational; 0 URL(s) re-dated; pages 699 → 699
- Pages: 699 baseline, 699 candidate

## Must-explain (0)

None.

## Allowed by rule (277)

- Rule #0 (Near-duplicate variants outside src/data/variants/indexable.json go noindex,follow (GSC: crawled, not indexed)): 46 diff(s)
  - **robots** · 46 pages, e.g. /chmod-calculator/1777/, /chmod-calculator/2775/, /chmod-calculator/400/ · ∅→value
- Rule #1 (noindex variants leave the sitemap): 46 diff(s)
  - **sitemap** · 46 pages, e.g. /chmod-calculator/1777/, /chmod-calculator/2775/, /chmod-calculator/400/ · left sitemap · left sitemap; the page still builds
- Rule #2 (noindex pages opt out of site search (Shell searchIndex = !noindex)): 46 diff(s)
  - **pagefind** · 46 pages, e.g. /chmod-calculator/1777/, /chmod-calculator/2775/, /chmod-calculator/400/ · true→false
- Rule #3 (English chmod variants stop listing the now-noindex locale copies; locale copies are noAlternates): 17 diff(s)
  - **hreflang** · 4 pages, e.g. /de/chmod-calculator/777/, /es/chmod-calculator/777/, /fr/chmod-calculator/777/ · -"\"de\":\"https://opscanopy.com/de/chmod-calculator/777/\",\"en\":\"https://opscanopy.com/chmod-calculator/777/\",\"es\":\"https://opscanopy.com/es/chmod-calculator/777/\",\"fr\":\"https://opscanopy.…
  - **hreflang** · 3 pages, e.g. /de/chmod-calculator/600/, /fr/chmod-calculator/600/, /pt-br/chmod-calculator/600/ · -"\"de\":\"https://opscanopy.com/de/chmod-calculator/600/\",\"en\":\"https://opscanopy.com/chmod-calculator/600/\",\"fr\":\"https://opscanopy.com/fr/chmod-calculator/600/\",\"pt-BR\":\"https://opscano…
  - **hreflang** · 3 pages, e.g. /de/chmod-calculator/700/, /fr/chmod-calculator/700/, /pt-br/chmod-calculator/700/ · -"\"de\":\"https://opscanopy.com/de/chmod-calculator/700/\",\"en\":\"https://opscanopy.com/chmod-calculator/700/\",\"fr\":\"https://opscanopy.com/fr/chmod-calculator/700/\",\"pt-BR\":\"https://opscano…
  - **hreflang** · 3 pages, e.g. /de/chmod-calculator/755/, /fr/chmod-calculator/755/, /pt-br/chmod-calculator/755/ · -"\"de\":\"https://opscanopy.com/de/chmod-calculator/755/\",\"en\":\"https://opscanopy.com/chmod-calculator/755/\",\"fr\":\"https://opscanopy.com/fr/chmod-calculator/755/\",\"pt-BR\":\"https://opscano…
  - **hreflang** · /chmod-calculator/600/ · {"de":"https://opscanopy.com/de/chmod-calculator/600/","en":"https://opscanopy.com/chmod-calculator/600/","fr":"https://opscanopy.com/fr/chm… → {"en":"https://opscanopy.com/chmod-calculator/600/"}
  - **hreflang** · /chmod-calculator/700/ · {"de":"https://opscanopy.com/de/chmod-calculator/700/","en":"https://opscanopy.com/chmod-calculator/700/","fr":"https://opscanopy.com/fr/chm… → {"en":"https://opscanopy.com/chmod-calculator/700/"}
  - **hreflang** · /chmod-calculator/755/ · {"de":"https://opscanopy.com/de/chmod-calculator/755/","en":"https://opscanopy.com/chmod-calculator/755/","fr":"https://opscanopy.com/fr/chm… → {"en":"https://opscanopy.com/chmod-calculator/755/"}
  - **hreflang** · /chmod-calculator/777/ · {"de":"https://opscanopy.com/de/chmod-calculator/777/","en":"https://opscanopy.com/chmod-calculator/777/","es":"https://opscanopy.com/es/chm… → {"en":"https://opscanopy.com/chmod-calculator/777/"}
- Rule #4 (locale chmod copies are noAlternates): 13 diff(s)
  - **x-default** · 13 pages, e.g. /de/chmod-calculator/600/, /de/chmod-calculator/700/, /de/chmod-calculator/755/ · value→∅
- Rule #5 (SEO.astro:88 skips site-identity LD on noindex pages (existing behaviour)): 46 diff(s)
  - **ld:Organization** · 46 pages, e.g. /chmod-calculator/1777/, /chmod-calculator/2775/, /chmod-calculator/400/ · removed · removed
- Rule #6 (SEO.astro:88 skips site-identity LD on noindex pages (existing behaviour)): 46 diff(s)
  - **ld:WebSite** · 46 pages, e.g. /chmod-calculator/1777/, /chmod-calculator/2775/, /chmod-calculator/400/ · removed · removed
- Rule #7 (hreflang alternates between EN and locale chmod variants removed (locale copies now noindex)): 17 diff(s)
  - **inbound:/chmod-calculator/600/** · /chmod-calculator/600/ · 25 → 22 · linking pages 25→22 (-12%)
  - **inbound:/chmod-calculator/700/** · /chmod-calculator/700/ · 23 → 20 · linking pages 23→20 (-13%)
  - **inbound:/chmod-calculator/755/** · /chmod-calculator/755/ · 25 → 22 · linking pages 25→22 (-12%)
  - **inbound:/chmod-calculator/777/** · /chmod-calculator/777/ · 22 → 18 · linking pages 22→18 (-18%)
  - **inbound:/de/chmod-calculator/600/** · /de/chmod-calculator/600/ · 9 → 6 · linking pages 9→6 (-33%)
  - **inbound:/de/chmod-calculator/700/** · /de/chmod-calculator/700/ · 8 → 5 · linking pages 8→5 (-38%)
  - **inbound:/de/chmod-calculator/755/** · /de/chmod-calculator/755/ · 9 → 6 · linking pages 9→6 (-33%)
  - **inbound:/de/chmod-calculator/777/** · /de/chmod-calculator/777/ · 8 → 4 · linking pages 8→4 (-50%)
  - **inbound:/es/chmod-calculator/777/** · /es/chmod-calculator/777/ · 6 → 2 · linking pages 6→2 (-67%)
  - **inbound:/fr/chmod-calculator/600/** · /fr/chmod-calculator/600/ · 9 → 6 · linking pages 9→6 (-33%)

## Informational (17)

- **links** · 5 pages, e.g. /chmod-calculator/777/, /de/chmod-calculator/777/, /es/chmod-calculator/777/ · {"removed":["/chmod-calculator/777/","/de/chmod-calculator/777/","/es/chmod-calculator/777/","/fr/chmod-calculator/777/","/pt-br/chmod-calculator/777/"],"added":[],"delta":-15} · 194→179 links; +0 / -5 hrefs
- **links** · 4 pages, e.g. /chmod-calculator/600/, /de/chmod-calculator/600/, /fr/chmod-calculator/600/ · {"removed":["/chmod-calculator/600/","/de/chmod-calculator/600/","/fr/chmod-calculator/600/","/pt-br/chmod-calculator/600/"],"added":[],"delta":-12} · 191→179 links; +0 / -4 hrefs
- **links** · 4 pages, e.g. /chmod-calculator/700/, /de/chmod-calculator/700/, /fr/chmod-calculator/700/ · {"removed":["/chmod-calculator/700/","/de/chmod-calculator/700/","/fr/chmod-calculator/700/","/pt-br/chmod-calculator/700/"],"added":[],"delta":-12} · 191→179 links; +0 / -4 hrefs
- **links** · 4 pages, e.g. /chmod-calculator/755/, /de/chmod-calculator/755/, /fr/chmod-calculator/755/ · {"removed":["/chmod-calculator/755/","/de/chmod-calculator/755/","/fr/chmod-calculator/755/","/pt-br/chmod-calculator/755/"],"added":[],"delta":-12} · 191→179 links; +0 / -4 hrefs

## Re-date breakdown (0 URLs)

No sitemap <lastmod> changed.

## Unused allow rules (0)

None.

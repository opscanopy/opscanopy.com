# SEO-surface diff — post-deploy-followups-2026-10 — 2026-10-08

- Baseline: main 5387781f203d (build 27.4 s; cold content layer (node_modules/.astro moved aside before the build: yes; fresh data-store.json written by the build: true; "[content] Synced content" logged: true))
- Candidate: this tree @ 7de86ddde4a6 + uncommitted changes
- Allowlist: `scripts/seo-allow/post-deploy-followups-2026-10.json` (expires 2026-11-07)
- Build: candidate: this tree, cold content layer (node_modules/.astro moved aside before the build: yes; fresh data-store.json written by the build: true; "[content] Synced content" logged: true)
- Timing: candidate build 30.6 s
- Timing: extract + diff 3.9 s (699 + 699 pages)
- Timing: total 34.5 s

## Summary

- **Exit 0** — seo-surface: 0 must-explain, 5 allowed, 15 informational; 5 URL(s) re-dated; pages 699 → 699
- Pages: 699 baseline, 699 candidate

## Must-explain (0)

None.

## Allowed by rule (5)

- Rule #0 (jq now runs in a worker stopped after 3 seconds; the 'filter never finishes' answer no longer claims the tab freezes (all 5 locales)): 5 diff(s)
  - **ld:FAQPage** · /de/jq-playground/ · {"@context":"https://schema.org","@type":"FAQPage","mainEntity":[{"@type":"Question","acceptedAnswer":{"@type":"Answer","text":"Es ist echte… → {"@context":"https://schema.org","@type":"FAQPage","main… · changed
  - **ld:FAQPage** · /es/jq-playground/ · {"@context":"https://schema.org","@type":"FAQPage","mainEntity":[{"@type":"Question","acceptedAnswer":{"@type":"Answer","text":"Es jq de ver… → {"@context":"https://schema.org","@type":"FAQPage","main… · changed
  - **ld:FAQPage** · /fr/jq-playground/ · {"@context":"https://schema.org","@type":"FAQPage","mainEntity":[{"@type":"Question","acceptedAnswer":{"@type":"Answer","text":"C'est le vra… → {"@context":"https://schema.org","@type":"FAQPage","main… · changed
  - **ld:FAQPage** · /jq-playground/ · {"@context":"https://schema.org","@type":"FAQPage","mainEntity":[{"@type":"Question","acceptedAnswer":{"@type":"Answer","text":"It is real j… → {"@context":"https://schema.org","@type":"FAQPage","main… · changed
  - **ld:FAQPage** · /pt-br/jq-playground/ · {"@context":"https://schema.org","@type":"FAQPage","mainEntity":[{"@type":"Question","acceptedAnswer":{"@type":"Answer","text":"É o jq de ve… → {"@context":"https://schema.org","@type":"FAQPage","main… · changed

## Informational (15)

- **lastmod** · 5 pages, e.g. /de/jq-playground/, /es/jq-playground/, /fr/jq-playground/ · 2026-10-03T00:00:00.000Z→2026-10-08T00:00:00.000Z
- **words** · 5 pages, e.g. /cve-ignore-converter/, /de/cve-ignore-converter/, /es/cve-ignore-converter/ · +69 · 3.5%
- **llms:llms-full.txt** · /llms-full.txt · 061c87e56af891d917037b991bd3fa62ecd1c6cdb877dba78e3bcea82e03d27d → be1be875fe22b191fc66a1242a60721a5eb0773469221dbf16566c960a73a895
- **words** · /de/jq-playground/ · 2645 → 2648 · 0.1%
- **words** · /es/jq-playground/ · 2965 → 2969 · 0.1%
- **words** · /fr/jq-playground/ · 2936 → 2941 · 0.2%
- **words** · /jq-playground/ · 2708 → 2707 · -0.0%

## Re-date breakdown (5 URLs)

| route class | URLs | en | de | es | fr | pt-br |
|---|---:|---:|---:|---:|---:|---:|
| tool | 5 | 1 | 1 | 1 | 1 | 1 |

## Unused allow rules (0)

None.

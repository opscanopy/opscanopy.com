# SEO-surface diff — aif-guide-notes — 2026-10-03

- Baseline: main e1d5a0432918 (build 463.5 s; cold content layer (node_modules/.astro moved aside before the build: yes; fresh data-store.json written by the build: true; "[content] Synced content" logged: true))
- Candidate: this tree @ e1d5a0432918 + uncommitted changes
- Allowlist: `scripts/seo-allow/aif-guide-notes.json` (expires 2026-10-17)
- Build: candidate: this tree, cold content layer (node_modules/.astro moved aside before the build: yes; fresh data-store.json written by the build: true; "[content] Synced content" logged: true)
- Timing: candidate build 656.4 s
- Timing: extract + diff 57.0 s (566 + 566 pages)
- Timing: total 713.5 s

## Summary

- **Exit 0** — seo-surface: 0 must-explain, 4 allowed, 5 informational; 2 URL(s) re-dated; pages 566 → 566
- Pages: 566 baseline, 566 candidate

## Must-explain (0)

None.

## Allowed by rule (4)

- Rule #0 (the guide's meta description counts the third AIF mock): 1 diff(s)
  - **description** · /learn/guides/aws-ai-practitioner-study-guide/ · AIF-C01 in 14 days: exam cost and vouchers, the five domains, difficulty, AI vs Cloud Practitioner, a daily plan, cheat sheet, and two free … → AIF-C01 in 14 days: exam cost and vouchers, the five dom…
- Rule #1 (og:description mirrors the meta description): 1 diff(s)
  - **og:description** · /learn/guides/aws-ai-practitioner-study-guide/ · AIF-C01 in 14 days: exam cost and vouchers, the five domains, difficulty, AI vs Cloud Practitioner, a daily plan, cheat sheet, and two free … → AIF-C01 in 14 days: exam cost and vouchers, the five dom…
- Rule #2 (the article description in JSON-LD repeats the frontmatter description (two -> three mocks)): 1 diff(s)
  - **ld:TechArticle** · /learn/guides/aws-ai-practitioner-study-guide/ · {"@context":"https://schema.org","@type":"TechArticle","author":{"@type":"Person","name":"Pushkar Kumar","sameAs":["https://github.com/Pushk… → {"@context":"https://schema.org","@type":"TechArticle","… · changed
- Rule #3 (the guides hub ItemList carries the guide description (two -> three mocks)): 1 diff(s)
  - **ld:ItemList** · /learn/guides/ · {"@context":"https://schema.org","@type":"ItemList","itemListElement":[{"@type":"ListItem","description":"A practical guide to AWS for DevOp… → {"@context":"https://schema.org","@type":"ItemList","ite… · changed

## Informational (5)

- **lastmod** · 2 pages, e.g. /learn/guides/, /learn/guides/aws-ai-practitioner-study-guide/ · 2026-09-23T00:00:00.000Z→2026-10-03T00:00:00.000Z
- **llms:llms-full.txt** · /llms-full.txt · f30388932febbdb56a15ed2a9cea1e377468e0889fc53a7be5a9933d48f53271 → cd9b0c0a59f77ac96b5303c904c72d712fa44cf7854f76d6124d9e85aad13f9b
- **llms:llms.txt** · /llms.txt · 22ef96d2bd28e735e1c11ebee0ac1b67cbfeb1368d38e3cee8870fecc3850813 → e7048f80a06fd9aabbd632af3d6b5afa5618a8c31bd98c7eee14efc6f043c2f4
- **words** · /learn/guides/aws-ai-practitioner-study-guide/ · 7093 → 7408 · 4.4%

## Re-date breakdown (2 URLs)

| route class | URLs | en | de | es | fr | pt-br |
|---|---:|---:|---:|---:|---:|---:|
| learn | 2 | 2 | 0 | 0 | 0 | 0 |

## Unused allow rules (0)

None.

# SEO-surface diff — cheatsheets-1 — 2026-10-09

- Baseline: origin/main d3e26cc12876 (build 27.7 s; cold content layer (node_modules/.astro moved aside before the build: yes; fresh data-store.json written by the build: true; "[content] Synced content" logged: true))
- Candidate: this tree @ c20fe765c65c
- Allowlist: `scripts/seo-allow/cheatsheets-1.json` (expires 2026-11-15)
- Build: candidate: this tree, cold content layer (node_modules/.astro moved aside before the build: yes; fresh data-store.json written by the build: true; "[content] Synced content" logged: true)
- Timing: candidate build 27.8 s
- Timing: extract + diff 3.7 s (699 + 703 pages)
- Timing: total 31.5 s

## Summary

- **Exit 0** — seo-surface: 0 must-explain, 4 allowed, 715 informational; 2 URL(s) re-dated; pages 699 → 703
- Pages: 699 baseline, 703 candidate

## Must-explain (0)

None.

## Allowed by rule (4)

- Rule #0 (new English-only /cheatsheets/ hub and the first three sheets (docker, openssl, jq)): 4 diff(s)
  - **page-added** · 4 pages, e.g. /cheatsheets/, /cheatsheets/docker/, /cheatsheets/jq/ · added

## Informational (715)

- **links** · 691 pages, e.g. /, /404.html, /500.html · {"removed":[],"added":["/cheatsheets/"],"delta":1} · 192→193 links; +1 / -0 hrefs
- **words** · 6 pages, e.g. /certificate-decoder/, /docker-run-to-compose/, /dockerfile-linter/ · +6 · 0.2%
- **sitemap** · 4 pages, e.g. /cheatsheets/, /cheatsheets/docker/, /cheatsheets/jq/ · entered sitemap · entered sitemap with its page
- **lastmod** · 2 pages, e.g. /learn/, /learn/guides/ · 2026-10-05T00:00:00.000Z→2026-10-09T00:00:00.000Z
- **links** · 2 pages, e.g. /certificate-decoder/, /hash-generator/ · {"removed":[],"added":["/cheatsheets/","/cheatsheets/openssl/"],"delta":2} · 179→181 links; +2 / -0 hrefs
- **links** · 2 pages, e.g. /docker-run-to-compose/, /dockerfile-linter/ · {"removed":[],"added":["/cheatsheets/","/cheatsheets/docker/"],"delta":2} · 178→180 links; +2 / -0 hrefs
- **links** · 2 pages, e.g. /jq-playground/, /json-yaml-converter/ · {"removed":[],"added":["/cheatsheets/","/cheatsheets/jq/"],"delta":2} · 176→178 links; +2 / -0 hrefs
- **links** · 2 pages, e.g. /learn/, /learn/guides/ · {"removed":[],"added":["/cheatsheets/"],"delta":2} · 156→158 links; +1 / -0 hrefs
- **llms:llms-full.txt** · /llms-full.txt · be1be875fe22b191fc66a1242a60721a5eb0773469221dbf16566c960a73a895 → a5a1c88cfad999810cfd111148029315493a3dd932c1ffa889a9a735f6385c2f
- **llms:llms.txt** · /llms.txt · e5bf99ed755de74f80c58ed8178a6721ca115ccab2d78040bc854c11a8690bd8 → 458fcd7d9b4ed80d385a258a4bd65ca30116c67d392ba8cf5ed8b22019055891
- **words** · /learn/ · 290 → 313 · 7.9%
- **words** · /learn/guides/ · 581 → 583 · 0.3%

## Re-date breakdown (2 URLs)

| route class | URLs | en | de | es | fr | pt-br |
|---|---:|---:|---:|---:|---:|---:|
| learn | 2 | 2 | 0 | 0 | 0 | 0 |

## Unused allow rules (0)

None.

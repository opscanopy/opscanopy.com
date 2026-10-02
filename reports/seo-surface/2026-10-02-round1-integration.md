# SEO-surface diff — round1-integration — 2026-10-02

- Baseline: main f7331d850555 (build 215.9 s; cold content layer (data-store.json absent before: true, fresh store written: true, "[content] Synced content" logged: true))
- Candidate: this tree @ 410b3b5bd4cf
- Allowlist: `scripts/seo-allow/round1-integration.json` (expires 2026-11-30)
- Build: candidate: this tree, cold content layer (node_modules/.astro moved aside before the build: yes; fresh data-store.json written by the build: true; "[content] Synced content" logged: true)
- Timing: candidate build 131.2 s
- Timing: extract + diff 10.9 s (559 + 559 pages)
- Timing: total 142.1 s

## Summary

- **Exit 0** — seo-surface: 0 must-explain, 0 allowed, 224 informational; 28 URL(s) re-dated; pages 559 → 559
- Pages: 559 baseline, 559 candidate

## Must-explain (0)

None.

## Allowed by rule (0)

None.

## Informational (224)

- **hidden** · 195 pages, e.g. /alertmanager-route-tester/, /base64-encoder-decoder/, /case-converter/ · -3
- **lastmod** · 12 pages, e.g. /cron-expression-tester/, /de/cron-expression-tester/, /de/subnet-calculator/ · 2026-09-26T00:00:00.000Z→2026-10-02T00:00:00.000Z
- **lastmod** · 6 pages, e.g. /changelog/, /de/tools/, /es/tools/ · 2026-09-27T00:00:00.000Z→2026-10-02T00:00:00.000Z
- **lastmod** · 5 pages, e.g. /, /de/, /es/ · 2026-09-30T00:00:00.000Z→2026-10-02T00:00:00.000Z
- **lastmod** · 5 pages, e.g. /cidr-checker/, /de/cidr-checker/, /es/cidr-checker/ · 2026-09-22T00:00:00.000Z→2026-10-02T00:00:00.000Z
- **llms:llms-full.txt** · /llms-full.txt · 23f544645a0b60c182fc5ec1dd5f9d0b2198422c768f0e482ef4268723c7c59c → dc6e4e25a5ddd6559c9088a4bada803e5ac9b3c1cd4525e24bf9d9d86970a4a4

## Re-date breakdown (28 URLs)

| route class | URLs | en | de | es | fr | pt-br |
|---|---:|---:|---:|---:|---:|---:|
| tool | 15 | 3 | 3 | 3 | 3 | 3 |
| home | 5 | 1 | 1 | 1 | 1 | 1 |
| tools-hub | 5 | 1 | 1 | 1 | 1 | 1 |
| tool-category | 2 | 2 | 0 | 0 | 0 | 0 |
| changelog | 1 | 1 | 0 | 0 | 0 | 0 |

## Unused allow rules (0)

None.

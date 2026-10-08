# SEO-surface diff — post-deploy-followups-2026-10 — 2026-10-08

- Baseline: main 5387781f203d (build 27.4 s; cold content layer (node_modules/.astro moved aside before the build: yes; fresh data-store.json written by the build: true; "[content] Synced content" logged: true))
- Candidate: this tree @ c854f5a077f1
- Allowlist: `scripts/seo-allow/post-deploy-followups-2026-10.json` (expires 2026-11-07)
- Build: candidate: this tree, cold content layer (node_modules/.astro moved aside before the build: yes; fresh data-store.json written by the build: true; "[content] Synced content" logged: true)
- Timing: candidate build 30.0 s
- Timing: extract + diff 3.7 s (699 + 699 pages)
- Timing: total 33.8 s

## Summary

- **Exit 0** — seo-surface: 0 must-explain, 0 allowed, 16 informational; 5 URL(s) re-dated; pages 699 → 699
- Pages: 699 baseline, 699 candidate

## Must-explain (0)

None.

## Allowed by rule (0)

None.

## Informational (16)

- **lastmod** · 5 pages, e.g. /de/jq-playground/, /es/jq-playground/, /fr/jq-playground/ · 2026-10-03T00:00:00.000Z→2026-10-08T00:00:00.000Z
- **words** · 5 pages, e.g. /cve-ignore-converter/, /de/cve-ignore-converter/, /es/cve-ignore-converter/ · +69 · 3.5%
- **words** · 5 pages, e.g. /de/jq-playground/, /es/jq-playground/, /fr/jq-playground/ · -3 · -0.1%
- **llms:llms-full.txt** · /llms-full.txt · 061c87e56af891d917037b991bd3fa62ecd1c6cdb877dba78e3bcea82e03d27d → 707708c22ec4b6d217476ec7b3b6d139f1d710175272c09583023ff3379ad090

## Re-date breakdown (5 URLs)

| route class | URLs | en | de | es | fr | pt-br |
|---|---:|---:|---:|---:|---:|---:|
| tool | 5 | 1 | 1 | 1 | 1 | 1 |

## Unused allow rules (0)

None.

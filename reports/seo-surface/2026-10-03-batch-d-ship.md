# SEO-surface diff — batch-d-ship — 2026-10-03

- Baseline: main 16b190ad260d (build 162.8 s; cold content layer (node_modules/.astro moved aside before the build: yes; fresh data-store.json written by the build: true; "[content] Synced content" logged: true))
- Candidate: this tree @ 70f8f566fb11
- Allowlist: `scripts/seo-allow/batch-d.json` (expires 2026-11-30)
- Build: candidate: this tree, cold content layer (node_modules/.astro moved aside before the build: yes; fresh data-store.json written by the build: true; "[content] Synced content" logged: true)
- Timing: candidate build 112.9 s
- Timing: extract + diff 12.6 s (559 + 559 pages)
- Timing: total 125.6 s

## Summary

- **Exit 0** — seo-surface: 0 must-explain, 390 allowed, 454 informational; 218 URL(s) re-dated; pages 559 → 559
- Pages: 559 baseline, 559 candidate
- **LOUD: 218 sitemap URLs re-dated (> 50).** Check this matches the batch's expectation.

## Must-explain (0)

None.

## Allowed by rule (390)

- Rule #0 (Batch D1/D3 (plan), the same removal as the rule below, on the two pages whose removed hero chrome is 13 words rather than <= 12: es drops the eyebrow 'Probador de expresiones de GitHub Actions · CI/CD' (7 words) and the badges 'Sin registro' (2) + 'Semántica exacta de GitHub' (4); pt-br drops 'Testador de Expressões do GitHub Actions · CI/CD' (7) and 'Sem cadastro' (2) + 'Semântica exata do GitHub' (4). Nothing else on either page loses a word: the lede moves verbatim (lede-present) and the reference CodeBlocks there sit inside a .map(), so they take no fig label. First match wins, so this exact-scope rule precedes the general maxDropAbs 12): 2 diff(s)
  - **words** · 2 pages, e.g. /es/github-actions-expression-tester/, /pt-br/github-actions-expression-tester/ · -13 · -0.5%
- Rule #1 (Batch D1/D3 (plan): ToolHero stops rendering the eyebrow ('<Name> · <Category>', a duplicate of the H1 prefix and the breadcrumb) and the page's two hand badges ('IPv4 & IPv6', 'No signup' — 5 to 8 words per page); the 'Updated <date>' text stays as a visible <time> caption, the trust line stays, and the lede moves verbatim below the result panel (proved by the lede-present rule below). The reference CodeBlock caps gain 'fig. NN.k —' prefixes, so the net drop is below the removed-chrome bound): 193 diff(s)
  - **words** · 40 pages, e.g. /base64-encoder-decoder/, /case-converter/, /de/base64-encoder-decoder/ · -4 · -0.3%
  - **words** · 27 pages, e.g. /cidr-checker/, /cron-expression-tester/, /de/cidr-checker/ · -8 · -0.5%
  - **words** · 27 pages, e.g. /cron-to-systemd/, /de/cron-to-systemd/, /de/github-actions-expression-tester/ · -9 · -0.5%
  - **words** · 26 pages, e.g. /alertmanager-route-tester/, /cve-ignore-converter/, /de/alertmanager-route-tester/ · -7 · -0.3%
  - **words** · 19 pages, e.g. /certificate-decoder/, /de/certificate-decoder/, /de/loki-alert-rule-tester/ · -6 · -0.2%
  - **words** · 19 pages, e.g. /data-size-converter/, /de/kubernetes-label-selector-tester/, /de/reverse-dns-ptr/ · -5 · -0.2%
  - **words** · 12 pages, e.g. /chmod-calculator/, /de/case-converter/, /de/chmod-calculator/ · -3 · -0.2%
  - **words** · 11 pages, e.g. /de/json-yaml-converter/, /es/github-actions-validator/, /es/json-yaml-converter/ · -10 · -0.5%
  - **words** · 9 pages, e.g. /de/grafana-dashboard-validator/, /es/cron-to-systemd/, /es/gitlab-ci-validator/ · -11 · -0.2%
  - **words** · 2 pages, e.g. /de/slugify/, /slugify/ · -1 · -0.1%
- Rule #2 (Batch D2 (plan): the baseline ToolHero lead paragraph (the first p.body-md after the H1) is MOVED, not cut — scripts/codemods/move-tool-lede.mjs lifted it verbatim into <ToolLede> as the last child of #playground's container on all 195 pages; its whitespace-collapsed, entity-decoded text must still appear inside <main>): 195 diff(s)
  - **lede-present** · 195 pages, e.g. /alertmanager-route-tester/, /base64-encoder-decoder/, /case-converter/ · present

## Informational (454)

- **lastmod** · 218 pages, e.g. /, /alertmanager-route-tester/, /base64-encoder-decoder/ · 2026-10-02T00:00:00.000Z→2026-10-03T00:00:00.000Z
- **hidden** · 192 pages, e.g. /alertmanager-route-tester/, /base64-encoder-decoder/, /case-converter/ · -3
- **hidden** · 5 pages, e.g. /de/grafana-dashboard-validator/, /es/grafana-dashboard-validator/, /fr/grafana-dashboard-validator/ · -4
- **hidden** · 5 pages, e.g. /de/tools/, /es/tools/, /fr/tools/ · -117
- **hidden** · 3 pages, e.g. /tools/docker/, /tools/kubernetes/, /tools/logs/ · -6
- **words** · 3 pages, e.g. /es/tools/, /fr/tools/, /pt-br/tools/ · -343 · -13.6%
- **hidden** · 2 pages, e.g. /tools/ci-cd/, /tools/scheduling/ · -9
- **hidden** · 2 pages, e.g. /tools/encoding/, /tools/security/ · -12
- **hidden** · 2 pages, e.g. /tools/networking/, /tools/observability/ · -18
- **h2** · /de/tools/ · ["Live-Tools."] → ["Observability 6","Sicherheit 4","CI/CD 3","Zeitplanung 3","Logs 2","Config 1","Netzwerk 6","Kodierung 4","Kubernetes 2","Docker 2","Werkze… · -1 +12
- **h2** · /es/tools/ · ["Herramientas en activo."] → ["Observabilidad 6","Seguridad 4","CI/CD 3","Programación 3","Logs 2","Config 1","Redes 6","Codificación 4","Kubernetes 2","Docker 2","Utili… · -1 +12
- **h2** · /fr/tools/ · ["Outils en service."] → ["Observabilité 6","Sécurité 4","CI/CD 3","Planification 3","Logs 2","Config 1","Réseau 6","Encodage 4","Kubernetes 2","Docker 2","Utilitair… · -1 +12
- **h2** · /pt-br/tools/ · ["Ferramentas no ar."] → ["Observabilidade 6","Segurança 4","CI/CD 3","Agendamento 3","Logs 2","Config 1","Redes 6","Codificação 4","Kubernetes 2","Docker 2","Utilit… · -1 +12
- **h2** · /tools/ · ["Live tools."] → ["Observability 6","Security 4","CI/CD 3","Scheduling 3","Logs 2","Config 1","Networking 6","Encoding 4","Kubernetes 2","Docker 2","Utilitie… · -1 +12
- **hidden** · /tools/utilities/ · 27 → 12
- **llms:llms-full.txt** · /llms-full.txt · cc93ea2ee9005b6afa2ab23461968115fadfd33901aefdc3ab3b2b41b0e6c75c → 37c04137dcf62f44dc56777f4fb9786a3e49c8d6501e09745cddf6d8e7d1385c
- **llms:llms.txt** · /llms.txt · cb67613f77963725c971d44cdc55c72e7a48c5ce4df5402c8943a299182f12c9 → 85cd6219a0d3c79b874725c7f31c020fea97eb64d86636e1c8221bc10450f4eb
- **words** · /de/tools/ · 2466 → 2164 · -12.2%
- **words** · /tools/ · 2464 → 2161 · -12.3%
- **words** · /tools/ci-cd/ · 323 → 298 · -7.7%
- **words** · /tools/config/ · 197 → 190 · -3.6%
- **words** · /tools/docker/ · 319 → 301 · -5.6%
- **words** · /tools/encoding/ · 377 → 339 · -10.1%
- **words** · /tools/iac/ · 225 → 219 · -2.7%
- **words** · /tools/kubernetes/ · 311 → 290 · -6.8%
- **words** · /tools/logs/ · 267 → 255 · -4.5%
- **words** · /tools/networking/ · 515 → 465 · -9.7%
- **words** · /tools/observability/ · 562 → 518 · -7.8%
- **words** · /tools/scheduling/ · 336 → 312 · -7.1%
- **words** · /tools/security/ · 417 → 386 · -7.4%
- **words** · /tools/utilities/ · 427 → 392 · -8.2%

## Re-date breakdown (218 URLs)

| route class | URLs | en | de | es | fr | pt-br |
|---|---:|---:|---:|---:|---:|---:|
| tool | 195 | 39 | 39 | 39 | 39 | 39 |
| tool-category | 12 | 12 | 0 | 0 | 0 | 0 |
| home | 5 | 1 | 1 | 1 | 1 | 1 |
| tools-hub | 5 | 1 | 1 | 1 | 1 | 1 |
| changelog | 1 | 1 | 0 | 0 | 0 | 0 |

## Unused allow rules (0)

None.

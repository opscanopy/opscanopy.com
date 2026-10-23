# SEO-surface diff — blog-grafana — 2026-10-22

- Baseline: main 5f4c04e574b5 (build 155.0 s; cold content layer (node_modules/.astro moved aside before the build: yes; fresh data-store.json written by the build: true; "[content] Synced content" logged: true))
- Candidate: this tree @ 5f4c04e574b5 + uncommitted changes
- Allowlist: `scripts/seo-allow/blog-grafana.json` (expires 2026-10-31)
- Build: candidate: ./dist as found (--no-build; content layer not verified)
- Build: candidate: cold content layer ASSUMED (--assume-cold) — proof runs only, never a ship decision
- Timing: extract + diff 9.4 s (703 + 708 pages)
- Timing: total 9.4 s

## Summary

- **Exit 0** — seo-surface: 0 must-explain, 59 allowed, 129 informational; 12 URL(s) re-dated; pages 703 → 708; 1 unused allow rule(s)
- Pages: 703 baseline, 708 candidate

## Must-explain (0)

None.

## Allowed by rule (59)

- Rule #0 (week-4 blog release: the Grafana post leaves draft in all 5 locales): 5 diff(s)
  - **page-added** · 5 pages, e.g. /blog/grafana-datasource-was-not-found/, /de/blog/grafana-datasource-was-not-found/, /es/blog/grafana-datasource-was-not-found/ · added
- Rule #1 (the released post enters the sitemap): 5 diff(s)
  - **sitemap** · 5 pages, e.g. /blog/grafana-datasource-was-not-found/, /de/blog/grafana-datasource-was-not-found/, /es/blog/grafana-datasource-was-not-found/ · entered sitemap · entered sitemap with its page
- Rule #2 (llms.txt / llms-full.txt list the released post): 2 diff(s)
  - **llms:llms-full.txt** · /llms-full.txt · 774d4be7b06d843e578fc7a45d46847ba52a2ab8ad3b41b424a8edfd8ac80d0a → 62091d768be56b524caedbe4046fdfd15cc9179dfc588168a5abfe0b17980be4
  - **llms:llms.txt** · /llms.txt · 458fcd7d9b4ed80d385a258a4bd65ca30116c67d392ba8cf5ed8b22019055891 → 1da2c1724803805347d45afd1dbb95f52eba431086160282da888b91801f1682
- Rule #3 (blog index, its tag pages and the homepage incident ledger list the new post): 12 diff(s)
  - **links** · 3 pages, e.g. /blog/, /blog/tag/observability/, /blog/tag/prometheus/ · {"removed":[],"added":["/blog/grafana-datasource-was-not-found/"],"delta":2} · 244→246 links; +1 / -0 hrefs
  - **links** · / · 193 → 193 · 193→193 links; +1 / -1 hrefs
  - **links** · /de/ · 193 → 193 · 193→193 links; +1 / -1 hrefs
  - **links** · /de/blog/ · 219 → 221 · 219→221 links; +1 / -0 hrefs
  - **links** · /es/ · 193 → 193 · 193→193 links; +1 / -1 hrefs
  - **links** · /es/blog/ · 219 → 221 · 219→221 links; +1 / -0 hrefs
  - **links** · /fr/ · 193 → 193 · 193→193 links; +1 / -1 hrefs
  - **links** · /fr/blog/ · 219 → 221 · 219→221 links; +1 / -0 hrefs
  - **links** · /pt-br/ · 193 → 193 · 193→193 links; +1 / -1 hrefs
  - **links** · /pt-br/blog/ · 219 → 221 · 219→221 links; +1 / -0 hrefs
- Rule #4 (inbound link to the Grafana post (English only, as with earlier releases)): 2 diff(s)
  - **links** · /blog/logql-vs-promql/ · 180 → 181 · 180→181 links; +1 / -1 hrefs
  - **links** · /blog/reading-promql/ · 180 → 181 · 180→181 links; +1 / -1 hrefs
- Rule #5 (the new post's card carries one more author byline link to /about/): 7 diff(s)
  - **anchor:/about/** · 3 pages, e.g. /blog/, /blog/tag/observability/, /blog/tag/prometheus/ · -"" +" \| Pushkar Kumar" · anchor text changed
  - **anchor:/de/about/** · /de/blog/ · Pushkar Kumar \| Pushkar Kumar \| Pushkar Kumar \| Pushkar Kumar \| Pushkar Kumar \| Pushkar Kumar \| Pushkar Kumar \| Pushkar Kumar \| Pushkar Kuma… → Pushkar Kumar \| Pushkar Kumar \| Pushkar Kumar \| Pushkar … · anchor text changed
  - **anchor:/es/about/** · /es/blog/ · Acerca de \| Pushkar Kumar \| Pushkar Kumar \| Pushkar Kumar \| Pushkar Kumar \| Pushkar Kumar \| Pushkar Kumar \| Pushkar Kumar \| Pushkar Kumar \| … → Acerca de \| Pushkar Kumar \| Pushkar Kumar \| Pushkar Kuma… · anchor text changed
  - **anchor:/fr/about/** · /fr/blog/ · Pushkar Kumar \| Pushkar Kumar \| Pushkar Kumar \| Pushkar Kumar \| Pushkar Kumar \| Pushkar Kumar \| Pushkar Kumar \| Pushkar Kumar \| Pushkar Kuma… → Pushkar Kumar \| Pushkar Kumar \| Pushkar Kumar \| Pushkar … · anchor text changed
  - **anchor:/pt-br/about/** · /pt-br/blog/ · Pushkar Kumar \| Pushkar Kumar \| Pushkar Kumar \| Pushkar Kumar \| Pushkar Kumar \| Pushkar Kumar \| Pushkar Kumar \| Pushkar Kumar \| Pushkar Kuma… → Pushkar Kumar \| Pushkar Kumar \| Pushkar Kumar \| Pushkar … · anchor text changed
- Rule #6 (tag post count +1 (observability 7→8, prometheus 3→4)): 2 diff(s)
  - **description** · /blog/tag/observability/ · Every OpsCanopy post tagged “observability”, newest first — 7 in total, each a hands-on DevOps guide with worked examples and real configs. → Every OpsCanopy post tagged “observability”, newest first …
  - **description** · /blog/tag/prometheus/ · Every OpsCanopy post tagged “prometheus”, newest first — 3 in total, each a hands-on DevOps guide with worked examples and real configs. → Every OpsCanopy post tagged “prometheus”, newest first — 4 in…
- Rule #7 (tag post count +1, mirrored in og): 2 diff(s)
  - **og:description** · /blog/tag/observability/ · Every OpsCanopy post tagged “observability”, newest first — 7 in total, each a hands-on DevOps guide with worked examples and real configs. → Every OpsCanopy post tagged “observability”, newest first …
  - **og:description** · /blog/tag/prometheus/ · Every OpsCanopy post tagged “prometheus”, newest first — 3 in total, each a hands-on DevOps guide with worked examples and real configs. → Every OpsCanopy post tagged “prometheus”, newest first — 4 in…
- Rule #8 (related-posts strip on prometheus/observability tag-mates now shows the newer Grafana post; checked: /blog/debug-prometheus-relabeling/ and /blog/prometheus-relabel-configs-explained/ (-> debug-alertmanager-routing), /blog/logql-vs-promql/ and /blog/unit-testing-loki-alert-rules/ (-> how-alertmanager-routing-works)): 10 diff(s)
  - **inbound:/blog/debug-alertmanager-routing/** · /blog/debug-alertmanager-routing/ · 15 → 13 · linking pages 15→13 (-13%)
  - **inbound:/blog/how-alertmanager-routing-works/** · /blog/how-alertmanager-routing-works/ · 13 → 11 · linking pages 13→11 (-15%)
  - **inbound:/de/blog/debug-alertmanager-routing/** · /de/blog/debug-alertmanager-routing/ · 12 → 10 · linking pages 12→10 (-17%)
  - **inbound:/de/blog/how-alertmanager-routing-works/** · /de/blog/how-alertmanager-routing-works/ · 10 → 9 · linking pages 10→9 (-10%)
  - **inbound:/es/blog/debug-alertmanager-routing/** · /es/blog/debug-alertmanager-routing/ · 12 → 10 · linking pages 12→10 (-17%)
  - **inbound:/es/blog/how-alertmanager-routing-works/** · /es/blog/how-alertmanager-routing-works/ · 10 → 9 · linking pages 10→9 (-10%)
  - **inbound:/fr/blog/debug-alertmanager-routing/** · /fr/blog/debug-alertmanager-routing/ · 12 → 10 · linking pages 12→10 (-17%)
  - **inbound:/fr/blog/how-alertmanager-routing-works/** · /fr/blog/how-alertmanager-routing-works/ · 10 → 9 · linking pages 10→9 (-10%)
  - **inbound:/pt-br/blog/debug-alertmanager-routing/** · /pt-br/blog/debug-alertmanager-routing/ · 12 → 10 · linking pages 12→10 (-17%)
  - **inbound:/pt-br/blog/how-alertmanager-routing-works/** · /pt-br/blog/how-alertmanager-routing-works/ · 10 → 9 · linking pages 10→9 (-10%)
- Rule #9 (hubs date from the newest item they list): 12 diff(s)
  - **lastmod** · 7 pages, e.g. /blog/, /blog/tag/observability/, /blog/tag/prometheus/ · 2026-10-04T00:00:00.000Z→2026-10-23T00:00:00.000Z
  - **lastmod** · 5 pages, e.g. /, /de/, /es/ · 2026-10-08T00:00:00.000Z→2026-10-23T00:00:00.000Z

## Informational (129)

- **words** · 8 pages, e.g. /blog/debug-prometheus-relabeling/, /blog/prometheus-relabel-configs-explained/, /de/blog/unit-testing-loki-alert-rules/ · +2 · 0.1%
- **hidden** · 7 pages, e.g. /blog/, /blog/tag/observability/, /blog/tag/prometheus/ · +3
- **links** · 6 pages, e.g. /blog/chown-command-linux/, /de/grafana-dashboard-validator/, /es/grafana-dashboard-validator/ · {"removed":[],"added":["/blog/grafana-datasource-was-not-found/"],"delta":1} · 184→185 links; +1 / -0 hrefs
- **hidden** · 5 pages, e.g. /blog/chown-command-linux/, /de/blog/chown-command-linux/, /es/blog/chown-command-linux/ · +1
- **words** · 5 pages, e.g. /blog/debug-alertmanager-routing/, /blog/how-alertmanager-routing-works/, /de/blog/logql-vs-promql/ · +4 · 0.1%
- **words** · 5 pages, e.g. /de/blog/debug-prometheus-relabeling/, /de/blog/prometheus-relabel-configs-explained/, /es/blog/debug-alertmanager-routing/ · +1 · 0.0%
- **words** · 5 pages, e.g. /de/grafana-dashboard-validator/, /es/grafana-dashboard-validator/, /fr/grafana-dashboard-validator/ · +35 · 0.7%
- **words** · 4 pages, e.g. /blog/, /blog/reading-promql/, /blog/tag/observability/ · +43 · 2.6%
- **words** · 4 pages, e.g. /blog/unit-testing-loki-alert-rules/, /fr/blog/debug-alertmanager-routing/, /fr/blog/how-alertmanager-routing-works/ · +3 · 0.3%
- **words** · 4 pages, e.g. /es/, /fr/blog/logql-vs-promql/, /pt-br/blog/debug-prometheus-relabeling/ · -2 · -0.1%
- **h2** · 3 pages, e.g. /blog/, /blog/tag/observability/, /blog/tag/prometheus/ · {"removed":[],"added":["Datasource ${DS_PROMETHEUS} was not found: causes and fixes"]} · -0 +1
- **words** · 3 pages, e.g. /, /de/, /es/blog/reading-promql/ · -6 · -0.4%
- **words** · 3 pages, e.g. /de/blog/chown-command-linux/, /fr/blog/chown-command-linux/, /pt-br/blog/chown-command-linux/ · +8 · 0.4%
- **links** · 2 pages, e.g. /blog/debug-alertmanager-routing/, /blog/how-alertmanager-routing-works/ · {"removed":["/blog/prometheus-relabel-configs-explained/"],"added":["/blog/grafana-datasource-was-not-found/"],"delta":0} · 185→185 links; +1 / -1 hrefs
- **links** · 2 pages, e.g. /blog/debug-prometheus-relabeling/, /blog/prometheus-relabel-configs-explained/ · {"removed":["/blog/debug-alertmanager-routing/"],"added":["/blog/grafana-datasource-was-not-found/"],"delta":0} · 184→184 links; +1 / -1 hrefs
- **links** · 2 pages, e.g. /de/blog/debug-alertmanager-routing/, /de/blog/how-alertmanager-routing-works/ · {"removed":["/de/blog/prometheus-relabel-configs-explained/"],"added":["/de/blog/grafana-datasource-was-not-found/"],"delta":0} · 182→182 links; +1 / -1 hrefs
- **links** · 2 pages, e.g. /de/blog/debug-prometheus-relabeling/, /de/blog/prometheus-relabel-configs-explained/ · {"removed":["/de/blog/debug-alertmanager-routing/"],"added":["/de/blog/grafana-datasource-was-not-found/"],"delta":0} · 181→181 links; +1 / -1 hrefs
- **links** · 2 pages, e.g. /es/blog/debug-alertmanager-routing/, /es/blog/how-alertmanager-routing-works/ · {"removed":["/es/blog/prometheus-relabel-configs-explained/"],"added":["/es/blog/grafana-datasource-was-not-found/"],"delta":0} · 182→182 links; +1 / -1 hrefs
- **links** · 2 pages, e.g. /es/blog/debug-prometheus-relabeling/, /es/blog/prometheus-relabel-configs-explained/ · {"removed":["/es/blog/debug-alertmanager-routing/"],"added":["/es/blog/grafana-datasource-was-not-found/"],"delta":0} · 181→181 links; +1 / -1 hrefs
- **links** · 2 pages, e.g. /fr/blog/debug-alertmanager-routing/, /fr/blog/how-alertmanager-routing-works/ · {"removed":["/fr/blog/prometheus-relabel-configs-explained/"],"added":["/fr/blog/grafana-datasource-was-not-found/"],"delta":0} · 182→182 links; +1 / -1 hrefs
- **links** · 2 pages, e.g. /fr/blog/debug-prometheus-relabeling/, /fr/blog/prometheus-relabel-configs-explained/ · {"removed":["/fr/blog/debug-alertmanager-routing/"],"added":["/fr/blog/grafana-datasource-was-not-found/"],"delta":0} · 181→181 links; +1 / -1 hrefs
- **links** · 2 pages, e.g. /pt-br/blog/debug-alertmanager-routing/, /pt-br/blog/how-alertmanager-routing-works/ · {"removed":["/pt-br/blog/prometheus-relabel-configs-explained/"],"added":["/pt-br/blog/grafana-datasource-was-not-found/"],"delta":0} · 182→182 links; +1 / -1 hrefs
- **links** · 2 pages, e.g. /pt-br/blog/debug-prometheus-relabeling/, /pt-br/blog/prometheus-relabel-configs-explained/ · {"removed":["/pt-br/blog/debug-alertmanager-routing/"],"added":["/pt-br/blog/grafana-datasource-was-not-found/"],"delta":0} · 181→181 links; +1 / -1 hrefs
- **words** · 2 pages, e.g. /blog/chown-command-linux/, /es/blog/chown-command-linux/ · +9 · 0.5%
- **words** · 2 pages, e.g. /de/blog/debug-alertmanager-routing/, /de/blog/how-alertmanager-routing-works/ · +7 · 0.3%
- **words** · 2 pages, e.g. /de/blog/reading-promql/, /pt-br/ · -5 · -0.4%
- **words** · 2 pages, e.g. /es/blog/, /pt-br/blog/ · +46 · 3.1%
- **words** · 2 pages, e.g. /es/blog/logql-vs-promql/, /pt-br/blog/logql-vs-promql/ · -1 · -0.1%
- **h2** · /de/blog/ · ["chown-Befehl in Linux: Besitzer und Gruppe von Dateien ändern","chmod-Befehl in Linux: Syntax, Beispiele und typische Fehler","Kubernetes … → ["Datasource ${DS_PROMETHEUS} was not found: Ursachen & … · -0 +1
- **h2** · /es/blog/ · ["Comando chown en Linux: cambiar propietario y grupo de archivos","Comando chmod en Linux: sintaxis, ejemplos y errores comunes","Kubernete… → ["Datasource ${DS_PROMETHEUS} was not found: causa y sol… · -0 +1
- **h2** · /fr/blog/ · ["Commande chown sous Linux : changer le propriétaire et le groupe","Commande chmod sous Linux : syntaxe, exemples et erreurs courantes","Ku… → ["Datasource ${DS_PROMETHEUS} was not found : les correc… · -0 +1
- **h2** · /pt-br/blog/ · ["Comando chown no Linux: mudar dono e grupo de arquivos","Comando chmod no Linux: sintaxe, exemplos e erros comuns","Kubernetes Service has… → ["Datasource ${DS_PROMETHEUS} was not found: como corrig… · -0 +1
- **inbound:/blog/kubernetes-service-has-no-endpoints/** · /blog/kubernetes-service-has-no-endpoints/ · 21 → 20 · linking pages 21→20 (-5%)
- **inbound:/blog/prometheus-relabel-configs-explained/** · /blog/prometheus-relabel-configs-explained/ · 15 → 14 · linking pages 15→14 (-7%)
- **inbound:/de/blog/kubernetes-service-has-no-endpoints/** · /de/blog/kubernetes-service-has-no-endpoints/ · 12 → 11 · linking pages 12→11 (-8%)
- **inbound:/de/blog/prometheus-relabel-configs-explained/** · /de/blog/prometheus-relabel-configs-explained/ · 12 → 11 · linking pages 12→11 (-8%)
- **inbound:/es/blog/kubernetes-service-has-no-endpoints/** · /es/blog/kubernetes-service-has-no-endpoints/ · 12 → 11 · linking pages 12→11 (-8%)
- **inbound:/es/blog/prometheus-relabel-configs-explained/** · /es/blog/prometheus-relabel-configs-explained/ · 12 → 11 · linking pages 12→11 (-8%)
- **inbound:/fr/blog/kubernetes-service-has-no-endpoints/** · /fr/blog/kubernetes-service-has-no-endpoints/ · 12 → 11 · linking pages 12→11 (-8%)
- **inbound:/fr/blog/prometheus-relabel-configs-explained/** · /fr/blog/prometheus-relabel-configs-explained/ · 12 → 11 · linking pages 12→11 (-8%)
- **inbound:/pt-br/blog/kubernetes-service-has-no-endpoints/** · /pt-br/blog/kubernetes-service-has-no-endpoints/ · 12 → 11 · linking pages 12→11 (-8%)
- **inbound:/pt-br/blog/prometheus-relabel-configs-explained/** · /pt-br/blog/prometheus-relabel-configs-explained/ · 12 → 11 · linking pages 12→11 (-8%)
- **links** · /blog/unit-testing-loki-alert-rules/ · 179 → 179 · 179→179 links; +1 / -1 hrefs
- **links** · /de/blog/chown-command-linux/ · 181 → 182 · 181→182 links; +1 / -0 hrefs
- **links** · /de/blog/logql-vs-promql/ · 176 → 176 · 176→176 links; +1 / -1 hrefs
- **links** · /de/blog/reading-promql/ · 176 → 176 · 176→176 links; +1 / -1 hrefs
- **links** · /de/blog/unit-testing-loki-alert-rules/ · 175 → 175 · 175→175 links; +1 / -1 hrefs
- **links** · /es/blog/chown-command-linux/ · 181 → 182 · 181→182 links; +1 / -0 hrefs
- **links** · /es/blog/logql-vs-promql/ · 176 → 176 · 176→176 links; +1 / -1 hrefs
- **links** · /es/blog/reading-promql/ · 176 → 176 · 176→176 links; +1 / -1 hrefs
- **links** · /es/blog/unit-testing-loki-alert-rules/ · 175 → 175 · 175→175 links; +1 / -1 hrefs
- **links** · /fr/blog/chown-command-linux/ · 181 → 182 · 181→182 links; +1 / -0 hrefs
- **links** · /fr/blog/logql-vs-promql/ · 176 → 176 · 176→176 links; +1 / -1 hrefs
- **links** · /fr/blog/reading-promql/ · 176 → 176 · 176→176 links; +1 / -1 hrefs
- **links** · /fr/blog/unit-testing-loki-alert-rules/ · 175 → 175 · 175→175 links; +1 / -1 hrefs
- **links** · /pt-br/blog/chown-command-linux/ · 181 → 182 · 181→182 links; +1 / -0 hrefs
- **links** · /pt-br/blog/logql-vs-promql/ · 176 → 176 · 176→176 links; +1 / -1 hrefs
- **links** · /pt-br/blog/reading-promql/ · 176 → 176 · 176→176 links; +1 / -1 hrefs
- **links** · /pt-br/blog/unit-testing-loki-alert-rules/ · 175 → 175 · 175→175 links; +1 / -1 hrefs
- **words** · /blog/logql-vs-promql/ · 1478 → 1527 · 3.3%
- **words** · /de/blog/ · 1212 → 1251 · 3.2%
- **words** · /fr/ · 1854 → 1850 · -0.2%
- **words** · /fr/blog/ · 1378 → 1420 · 3.0%
- **words** · /fr/blog/reading-promql/ · 1480 → 1472 · -0.5%
- **words** · /pt-br/blog/reading-promql/ · 1428 → 1421 · -0.5%

## Re-date breakdown (12 URLs)

| route class | URLs | en | de | es | fr | pt-br |
|---|---:|---:|---:|---:|---:|---:|
| home | 5 | 1 | 1 | 1 | 1 | 1 |
| blog-hub | 5 | 1 | 1 | 1 | 1 | 1 |
| blog-tag | 2 | 2 | 0 | 0 | 0 | 0 |

## Unused allow rules (1)

- #10 `lastmod` pages `^/blog/(?:reading-promql|logql-vs-promql)/$` — body edited: one inbound-link sentence (matches only once committed; lastmod is a git date) (prune it)

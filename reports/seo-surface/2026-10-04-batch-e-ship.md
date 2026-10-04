# SEO-surface diff — batch-e-ship — 2026-10-04

- Baseline: main 5c74f13709f2 (build 901.3 s; cold content layer (node_modules/.astro moved aside before the build: yes; fresh data-store.json written by the build: true; "[content] Synced content" logged: true))
- Candidate: this tree @ 1c4997d85bc4
- Allowlist: `scripts/seo-allow/batch-e.json` (expires 2026-11-30)
- Build: candidate: this tree, cold content layer (node_modules/.astro moved aside before the build: yes; fresh data-store.json written by the build: true; "[content] Synced content" logged: true)
- Timing: candidate build 495.1 s
- Timing: extract + diff 12.3 s (566 + 566 pages)
- Timing: total 507.4 s

## Summary

- **Exit 0** — seo-surface: 0 must-explain, 15 allowed, 64 informational; 25 URL(s) re-dated; pages 566 → 566
- Pages: 566 baseline, 566 candidate

## Must-explain (0)

None.

## Allowed by rule (15)

- Rule #0 (Batch E: About H1 names the people and the local-only principle (plan #16); the lede's first sentence keeps 'free, browser-based DevOps tools' in each locale's words, the founders section moves first; <title> and description unchanged): 5 diff(s)
  - **h1** · /about/ · Free DevOps tools that run entirely in your browser. → Who builds OpsCanopy, and why it runs locally.
  - **h1** · /de/about/ · Kostenlose DevOps-Tools, die vollständig in Ihrem Browser laufen. → Wer OpsCanopy baut – und warum alles lokal läuft.
  - **h1** · /es/about/ · Herramientas DevOps gratuitas que se ejecutan por completo en tu navegador. → Quién construye OpsCanopy y por qué todo se ejecuta en local.
  - **h1** · /fr/about/ · Des outils DevOps gratuits qui s’exécutent entièrement dans votre navigateur. → Qui construit OpsCanopy, et pourquoi tout s’exécute en local.
  - **h1** · /pt-br/about/ · Ferramentas de DevOps gratuitas que rodam inteiramente no seu navegador. → Quem constrói o OpsCanopy e por que tudo roda localmente.
- Rule #1 (Batch E: /tools/ H1 retires the 'toolbox' metaphor and adds the search terms the old H1 lacked (DevOps, SRE, tools, free); <title> unchanged): 5 diff(s)
  - **h1** · /de/tools/ · Der gesamte Werkzeugkasten, nur einen Tab entfernt. → Kostenlose DevOps- und SRE-Tools, nur einen Tab entfernt.
  - **h1** · /es/tools/ · Toda la caja de herramientas, a una pestaña de distancia. → Herramientas DevOps y SRE gratuitas, a una pestaña de distancia.
  - **h1** · /fr/tools/ · Toute la boîte à outils, à un onglet près. → Des outils DevOps et SRE gratuits, à un onglet près.
  - **h1** · /pt-br/tools/ · Toda a caixa de ferramentas, a uma aba de distância. → Ferramentas DevOps e SRE grátis, a uma aba de distância.
  - **h1** · /tools/ · The whole toolbox, one tab away. → Free DevOps and SRE tools, one tab away.
- Rule #2 (Batch E: /blog/ H1 (blog.indexTitle) retires the 'canopy' metaphor and adds the search terms the old H1 lacked (DevOps, CI/CD, observability); <title> (blog.metaTitle) unchanged): 5 diff(s)
  - **h1** · /blog/ · Notes from the canopy. → Field notes on DevOps, CI/CD and observability.
  - **h1** · /de/blog/ · Notizen aus dem Blätterdach. → Praxisnotizen zu DevOps, CI/CD und Observability.
  - **h1** · /es/blog/ · Notas desde la copa. → Notas de campo sobre DevOps, CI/CD y observabilidad.
  - **h1** · /fr/blog/ · Notes de la canopée. → Notes de terrain sur DevOps, CI/CD et observabilité.
  - **h1** · /pt-br/blog/ · Notas da copa das árvores. → Notas de campo sobre DevOps, CI/CD e observabilidade.

## Informational (64)

- **lastmod** · 25 pages, e.g. /about/, /contact/, /de/about/ · 2026-10-02T00:00:00.000Z→2026-10-04T00:00:00.000Z
- **h2** · 5 pages, e.g. /about/, /de/about/, /es/about/ · reordered · reordered
- **hidden** · 5 pages, e.g. /, /de/, /es/ · +15
- **links** · 4 pages, e.g. /de/, /es/, /fr/ · {"removed":[],"added":["/mission-90/missions/week1-server-down/","/mission-90/missions/week11-kubernetes-chaos/","/mission-90/missions/week4-docker-rescue/","/verify-ai/"],"delta":5} · 180→185 links; +4 / -0 hrefs
- **words** · 2 pages, e.g. /about/, /de/about/ · +13 · 2.5%
- **words** · 2 pages, e.g. /blog/, /pt-br/blog/ · +3 · 0.2%
- **words** · 2 pages, e.g. /de/blog/, /tools/ · +2 · 0.2%
- **words** · 2 pages, e.g. /de/tools/, /fr/tools/ · +1 · 0.0%
- **words** · 2 pages, e.g. /es/blog/, /fr/blog/ · +4 · 0.3%
- **h2** · / · ["Exact answers, not approximations.","Tools in the canopy.","From developer to DevOps engineer in 90 days.","Free roadmaps & hands-on guide… → ["Exact answers, not approximations.","The tool index.",… · -4 +4
- **h2** · /de/ · ["Exakte Antworten, keine Näherungen.","Tools im Blätterdach.","Vom Entwickler zum DevOps-Engineer in 90 Tagen.","Kostenlose Roadmaps & prax… → ["Exakte Antworten, keine Näherungen.","Der Tool-Index."… · -4 +4
- **h2** · /es/ · ["Respuestas exactas, no aproximaciones.","Herramientas en el dosel.","De desarrollador a ingeniero DevOps en 90 días.","Hojas de ruta y guí… → ["Respuestas exactas, no aproximaciones.","El índice de … · -4 +4
- **h2** · /fr/ · ["Des réponses exactes, pas des approximations.","Des outils dans la canopée.","De développeur à ingénieur DevOps en 90 jours.","Feuilles de… → ["Des réponses exactes, pas des approximations.","L’inde… · -4 +4
- **h2** · /pt-br/ · ["Respostas exatas, não aproximações.","Ferramentas no dossel.","De desenvolvedor a engenheiro DevOps em 90 dias.","Roteiros e guias prático… → ["Respostas exatas, não aproximações.","O índice de ferr… · -4 +4
- **links** · / · 181 → 185 · 181→185 links; +3 / -0 hrefs
- **llms:llms-full.txt** · /llms-full.txt · f48f0fdc9017dbb05ed534a77d8dc1026ccaada31f55c2110de6903721c10c91 → f1fbe83e55260f934eee17a3dce4b123bb7e76541ea54d5b4f38ab8dda942919
- **words** · / · 1546 → 1680 · 8.7%
- **words** · /de/ · 1502 → 1655 · 10.2%
- **words** · /es/ · 1733 → 1890 · 9.1%
- **words** · /es/about/ · 589 → 611 · 3.7%
- **words** · /fr/ · 1702 → 1847 · 8.5%
- **words** · /fr/about/ · 593 → 616 · 3.9%
- **words** · /pt-br/ · 1700 → 1856 · 9.2%
- **words** · /pt-br/about/ · 567 → 585 · 3.2%

## Re-date breakdown (25 URLs)

| route class | URLs | en | de | es | fr | pt-br |
|---|---:|---:|---:|---:|---:|---:|
| info | 25 | 5 | 5 | 5 | 5 | 5 |

## Unused allow rules (0)

None.

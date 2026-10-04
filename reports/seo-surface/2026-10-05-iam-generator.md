# SEO-surface diff — iam-generator — 2026-10-05

- Baseline: main 034906a4e59d (build 51.2 s; cold content layer (node_modules/.astro moved aside before the build: yes; fresh data-store.json written by the build: true; "[content] Synced content" logged: true))
- Candidate: this tree @ c5de307dc815 + uncommitted changes
- Allowlist: `scripts/seo-allow/iam-generator.json` (expires 2026-11-19)
- Build: candidate: this tree, cold content layer (node_modules/.astro moved aside before the build: yes; fresh data-store.json written by the build: true; "[content] Synced content" logged: true)
- Timing: candidate build 50.0 s
- Timing: extract + diff 6.5 s (691 + 699 pages)
- Timing: total 56.5 s

## Summary

- **Exit 0** — seo-surface: 0 must-explain, 716 allowed, 738 informational; 20 URL(s) re-dated; pages 691 → 699
- Pages: 691 baseline, 699 candidate

## Must-explain (0)

None.

## Allowed by rule (716)

- Rule #0 (New tool: AWS IAM Policy Generator (fig. 42, Security), five locales): 5 diff(s)
  - **page-added** · 5 pages, e.g. /aws-iam-policy-generator/, /de/aws-iam-policy-generator/, /es/aws-iam-policy-generator/ · added
- Rule #1 (Three AWS guides (Ahrefs: github actions oidc aws KD 3-9, iam trust policy KD 2, terraform iam policy KD 6)): 3 diff(s)
  - **page-added** · 3 pages, e.g. /learn/guides/github-actions-oidc-aws/, /learn/guides/iam-trust-policy-explained/, /learn/guides/terraform-iam-policy-examples/ · added
- Rule #2 (Site-wide menu/footer Security category count goes 4 -> 5): 691 diff(s)
  - **anchor:/tools/security/** · 686 pages, e.g. /, /404.html, /500.html · -"4" +"5" · anchor text changed
  - **anchor:/tools/security/** · /de/tools/ · Sicherheit 4 \| Sicherheit 4 → Sicherheit 5 \| Sicherheit 5 · anchor text changed
  - **anchor:/tools/security/** · /es/tools/ · Seguridad 4 \| Seguridad 4 → Seguridad 5 \| Seguridad 5 · anchor text changed
  - **anchor:/tools/security/** · /fr/tools/ · Sécurité 4 \| Sécurité 4 → Sécurité 5 \| Sécurité 5 · anchor text changed
  - **anchor:/tools/security/** · /pt-br/tools/ · Segurança 4 \| Segurança 4 → Segurança 5 \| Segurança 5 · anchor text changed
  - **anchor:/tools/security/** · /tools/ · Security 4 \| Security 4 → Security 5 \| Security 5 · anchor text changed
- Rule #3 (Guides hub description counts 15 guides (was 12)): 2 diff(s)
  - **description** · /learn/guides/ · 12 in-depth, hands-on guides for DevOps engineers — Linux, Docker, Kubernetes, AWS, networking and portfolio projects. Roughly 14 hours, fre… → 15 in-depth, hands-on guides for DevOps engineers — Linu…
  - **og:description** · /learn/guides/ · 12 in-depth, hands-on guides for DevOps engineers — Linux, Docker, Kubernetes, AWS, networking and portfolio projects. Roughly 14 hours, fre… → 15 in-depth, hands-on guides for DevOps engineers — Linu…
- Rule #4 (Tools hub, Security category and guides hub lists gain the new entries): 7 diff(s)
  - **ld:ItemList** · /de/tools/ · {"@context":"https://schema.org","@type":"ItemList","description":"Kostenlose, browserbasierte Tools für Platform- und DevOps-Engineers. Kei… → {"@context":"https://schema.org","@type":"ItemList","des… · changed
  - **ld:ItemList** · /es/tools/ · {"@context":"https://schema.org","@type":"ItemList","description":"Herramientas gratuitas y basadas en el navegador para ingenieros de plata… → {"@context":"https://schema.org","@type":"ItemList","des… · changed
  - **ld:ItemList** · /fr/tools/ · {"@context":"https://schema.org","@type":"ItemList","description":"Des outils gratuits, exécutés dans le navigateur, pour les ingénieurs pla… → {"@context":"https://schema.org","@type":"ItemList","des… · changed
  - **ld:ItemList** · /learn/guides/ · {"@context":"https://schema.org","@type":"ItemList","itemListElement":[{"@type":"ListItem","description":"Which open LLMs fit an 8, 12, 16, … → {"@context":"https://schema.org","@type":"ItemList","ite… · changed
  - **ld:ItemList** · /pt-br/tools/ · {"@context":"https://schema.org","@type":"ItemList","description":"Ferramentas gratuitas e que rodam no navegador para engenheiros de plataf… → {"@context":"https://schema.org","@type":"ItemList","des… · changed
  - **ld:ItemList** · /tools/ · {"@context":"https://schema.org","@type":"ItemList","description":"Free, browser-based tools for platform and DevOps engineers. No signup, n… → {"@context":"https://schema.org","@type":"ItemList","des… · changed
  - **ld:ItemList** · /tools/security/ · {"@context":"https://schema.org","@type":"ItemList","description":"Decode, hash and convert security artefacts locally — nothing you paste e… → {"@context":"https://schema.org","@type":"ItemList","des… · changed
- Rule #5 (Hub and category page gain the new tool card): 6 diff(s)
  - **hidden** · 5 pages, e.g. /de/tools/, /es/tools/, /fr/tools/ · +3
  - **hidden** · /tools/security/ · 11 → 12
- Rule #6 (getGuideForTool now points AWS-related tool pages at the new, more specific guides): 2 diff(s)
  - **inbound:/learn/guides/best-gpu-for-local-llm/** · /learn/guides/best-gpu-for-local-llm/ · 12 → 10 · linking pages 12→10 (-17%)
  - **inbound:/learn/guides/best-local-llm/** · /learn/guides/best-local-llm/ · 41 → 39 · linking pages 41→39 (-5%)

## Informational (738)

- **links** · 356 pages, e.g. /, /404.html, /500.html · {"removed":[],"added":["/aws-iam-policy-generator/"],"delta":2} · 190→192 links; +1 / -0 hrefs
- **links** · 82 pages, e.g. /de/, /de/about/, /de/alertmanager-route-tester/ · {"removed":[],"added":["/de/aws-iam-policy-generator/"],"delta":2} · 190→192 links; +1 / -0 hrefs
- **links** · 82 pages, e.g. /fr/, /fr/about/, /fr/alertmanager-route-tester/ · {"removed":[],"added":["/fr/aws-iam-policy-generator/"],"delta":2} · 190→192 links; +1 / -0 hrefs
- **links** · 82 pages, e.g. /pt-br/, /pt-br/about/, /pt-br/alertmanager-route-tester/ · {"removed":[],"added":["/pt-br/aws-iam-policy-generator/"],"delta":2} · 190→192 links; +1 / -0 hrefs
- **links** · 79 pages, e.g. /es/, /es/about/, /es/alertmanager-route-tester/ · {"removed":[],"added":["/es/aws-iam-policy-generator/"],"delta":2} · 190→192 links; +1 / -0 hrefs
- **lastmod** · 20 pages, e.g. /, /changelog/, /de/ · 2026-10-04T00:00:00.000Z→2026-10-05T00:00:00.000Z
- **sitemap** · 8 pages, e.g. /aws-iam-policy-generator/, /de/aws-iam-policy-generator/, /es/aws-iam-policy-generator/ · entered sitemap · entered sitemap with its page
- **words** · 5 pages, e.g. /de/tools/, /es/tools/, /fr/tools/ · +77 · 3.3%
- **hidden** · 2 pages, e.g. /changelog/, /learn/guides/aws-ai-practitioner-study-guide/ · +1
- **links** · 2 pages, e.g. /changelog/, /tools/security/ · {"removed":[],"added":["/aws-iam-policy-generator/"],"delta":3} · 184→187 links; +1 / -0 hrefs
- **h2** · /de/tools/ · ["Observability 6","Sicherheit 4","CI/CD 3","Zeitplanung 3","Logs 2","Config 1","Netzwerk 6","Kodierung 4","Kubernetes 2","Docker 2","Werkze… → ["Observability 6","Sicherheit 5","CI/CD 3","Zeitplanung… · -1 +1
- **h2** · /es/tools/ · ["Observabilidad 6","Seguridad 4","CI/CD 3","Programación 3","Logs 2","Config 1","Redes 6","Codificación 4","Kubernetes 2","Docker 2","Utili… → ["Observabilidad 6","Seguridad 5","CI/CD 3","Programació… · -1 +1
- **h2** · /fr/tools/ · ["Observabilité 6","Sécurité 4","CI/CD 3","Planification 3","Logs 2","Config 1","Réseau 6","Encodage 4","Kubernetes 2","Docker 2","Utilitair… → ["Observabilité 6","Sécurité 5","CI/CD 3","Planification… · -1 +1
- **h2** · /pt-br/tools/ · ["Observabilidade 6","Segurança 4","CI/CD 3","Agendamento 3","Logs 2","Config 1","Redes 6","Codificação 4","Kubernetes 2","Docker 2","Utilit… → ["Observabilidade 6","Segurança 5","CI/CD 3","Agendament… · -1 +1
- **h2** · /tools/ · ["Observability 6","Security 4","CI/CD 3","Scheduling 3","Logs 2","Config 1","Networking 6","Encoding 4","Kubernetes 2","Docker 2","Utilitie… → ["Observability 6","Security 5","CI/CD 3","Scheduling 3"… · -1 +1
- **links** · /de/tools/ · 252 → 256 · 252→256 links; +1 / -0 hrefs
- **links** · /es/tools/ · 252 → 256 · 252→256 links; +1 / -0 hrefs
- **links** · /fr/tools/ · 252 → 256 · 252→256 links; +1 / -0 hrefs
- **links** · /learn/guides/ · 161 → 166 · 161→166 links; +4 / -0 hrefs
- **links** · /learn/guides/aws-ai-practitioner-study-guide/ · 164 → 167 · 164→167 links; +3 / -2 hrefs
- **links** · /learn/guides/aws-for-devops-engineers/ · 163 → 165 · 163→165 links; +3 / -2 hrefs
- **links** · /pt-br/tools/ · 252 → 256 · 252→256 links; +1 / -0 hrefs
- **links** · /tools/ · 252 → 256 · 252→256 links; +1 / -0 hrefs
- **llms:llms-full.txt** · /llms-full.txt · 4e6c7081cab637cee0a0e8a9e5cd49d3bbc281e0edde1af1b24a52b9e3db78a1 → c811e6d57072c0dc20ac89520d195dfbe16d4fcd5debb8a85f7589c6f4b395d4
- **llms:llms.txt** · /llms.txt · 5f5831d966068a7e2d43fa838e9e293d50ae2a29e6ca6be9bc8aabef9e34de56 → e5bf99ed755de74f80c58ed8178a6721ca115ccab2d78040bc854c11a8690bd8
- **words** · /changelog/ · 721 → 743 · 3.1%
- **words** · /learn/guides/ · 483 → 581 · 20.3%
- **words** · /learn/guides/aws-ai-practitioner-study-guide/ · 7443 → 7458 · 0.2%
- **words** · /learn/guides/aws-for-devops-engineers/ · 9715 → 9720 · 0.1%
- **words** · /tools/security/ · 386 → 459 · 18.9%

## Re-date breakdown (20 URLs)

| route class | URLs | en | de | es | fr | pt-br |
|---|---:|---:|---:|---:|---:|---:|
| learn | 8 | 8 | 0 | 0 | 0 | 0 |
| home | 5 | 1 | 1 | 1 | 1 | 1 |
| tools-hub | 5 | 1 | 1 | 1 | 1 | 1 |
| changelog | 1 | 1 | 0 | 0 | 0 | 0 |
| tool-category | 1 | 1 | 0 | 0 | 0 | 0 |

## Unused allow rules (0)

None.

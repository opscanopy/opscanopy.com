# SEO-surface diff — chmod-gaps — 2026-10-04

- Baseline: main afce50630d6e (build 49.3 s; cold content layer (node_modules/.astro moved aside before the build: yes; fresh data-store.json written by the build: true; "[content] Synced content" logged: true))
- Candidate: this tree @ afce50630d6e + uncommitted changes
- Allowlist: `scripts/seo-allow/chmod-gaps.json` (expires 2026-11-19)
- Build: candidate: this tree, cold content layer (node_modules/.astro moved aside before the build: yes; fresh data-store.json written by the build: true; "[content] Synced content" logged: true)
- Timing: candidate build 49.7 s
- Timing: extract + diff 6.3 s (662 + 691 pages)
- Timing: total 56.0 s

## Summary

- **Exit 0** — seo-surface: 0 must-explain, 115 allowed, 301 informational; 10 URL(s) re-dated; pages 662 → 691
- Pages: 662 baseline, 691 candidate

## Must-explain (0)

None.

## Allowed by rule (115)

- Rule #0 (6 new English chmod mode pages (775, 400, 711, 1777, 2775, 4755) and 13 locale mode pages (de/fr/pt-br: 777, 755, 600, 700; es: 777)): 19 diff(s)
  - **page-added** · 19 pages, e.g. /chmod-calculator/1777/, /chmod-calculator/2775/, /chmod-calculator/400/ · added
- Rule #1 (Two new posts (chmod / chown command), five locales): 10 diff(s)
  - **page-added** · 10 pages, e.g. /blog/chmod-command-linux/, /blog/chown-command-linux/, /de/blog/chmod-command-linux/ · added
- Rule #2 (Locale titles lead with the English keyword 'chmod Calculator' (Ahrefs: local phrasings have no data abroad)): 4 diff(s)
  - **title** · /de/chmod-calculator/ · chmod-Rechner — Linux-Dateirechte, visuell & offline → chmod Calculator — Linux-Dateirechte berechnen (777, 755)
  - **title** · /es/chmod-calculator/ · Calculadora chmod — Permisos de Linux, visual y sin conexión → chmod Calculator — calcular permisos Linux (777, 755)
  - **title** · /fr/chmod-calculator/ · Calculateur chmod — permissions Linux, visuel et hors ligne → chmod Calculator — calculer les droits Linux (777, 755)
  - **title** · /pt-br/chmod-calculator/ · Calculadora chmod — Permissões Linux, visual e offline → chmod Calculator — calcular permissões Linux (777, 755)
- Rule #3 (Same title prop): 8 diff(s)
  - **og:image:alt** · /de/chmod-calculator/ · chmod-Rechner — Linux-Dateirechte, visuell & offline → chmod Calculator — Linux-Dateirechte berechnen (777, 755)
  - **og:image:alt** · /es/chmod-calculator/ · Calculadora chmod — Permisos de Linux, visual y sin conexión → chmod Calculator — calcular permisos Linux (777, 755)
  - **og:image:alt** · /fr/chmod-calculator/ · Calculateur chmod — permissions Linux, visuel et hors ligne → chmod Calculator — calculer les droits Linux (777, 755)
  - **og:image:alt** · /pt-br/chmod-calculator/ · Calculadora chmod — Permissões Linux, visual e offline → chmod Calculator — calcular permissões Linux (777, 755)
  - **og:title** · /de/chmod-calculator/ · chmod-Rechner — Linux-Dateirechte, visuell & offline → chmod Calculator — Linux-Dateirechte berechnen (777, 755)
  - **og:title** · /es/chmod-calculator/ · Calculadora chmod — Permisos de Linux, visual y sin conexión → chmod Calculator — calcular permisos Linux (777, 755)
  - **og:title** · /fr/chmod-calculator/ · Calculateur chmod — permissions Linux, visuel et hors ligne → chmod Calculator — calculer les droits Linux (777, 755)
  - **og:title** · /pt-br/chmod-calculator/ · Calculadora chmod — Permissões Linux, visual e offline → chmod Calculator — calcular permissões Linux (777, 755)
- Rule #4 (Locale parents gain a translated 'common values' chip row): 4 diff(s)
  - **h2** · /de/chmod-calculator/ · ["chmod-Rechner-Playground","Eine falsche Ziffer, eine weltweit beschreibbare Datei.","So funktioniert es.","Oktal &harr; symbolisch.","Beze… → ["chmod-Rechner-Playground","Eine falsche Ziffer, eine w… · -0 +1
  - **h2** · /es/chmod-calculator/ · ["Playground de la calculadora chmod","Un dígito mal puesto, un archivo escribible por todos.","Cómo funciona.","Octal &harr; simbólico.","R… → ["Playground de la calculadora chmod","Un dígito mal pue… · -0 +1
  - **h2** · /fr/chmod-calculator/ · ["Playground du calculateur chmod","Un chiffre de travers, un fichier ouvert à tous en écriture.","Comment ça marche.","Octal &harr; symboli… → ["Playground du calculateur chmod","Un chiffre de traver… · -0 +1
  - **h2** · /pt-br/chmod-calculator/ · ["Playground da calculadora chmod","Um dígito errado, um arquivo gravável por todos.","Como funciona.","Octal &harr; simbólico.","Remodele i… → ["Playground da calculadora chmod","Um dígito errado, um… · -0 +1
- Rule #5 (English mode pages advertise their new locale alternates): 4 diff(s)
  - **hreflang** · /chmod-calculator/600/ · {"en":"https://opscanopy.com/chmod-calculator/600/"} → {"de":"https://opscanopy.com/de/chmod-calculator/600/","en":"https://opscanopy.com/chmod-calculator/600/","fr":"https://opscanopy.com/fr/chm…
  - **hreflang** · /chmod-calculator/700/ · {"en":"https://opscanopy.com/chmod-calculator/700/"} → {"de":"https://opscanopy.com/de/chmod-calculator/700/","en":"https://opscanopy.com/chmod-calculator/700/","fr":"https://opscanopy.com/fr/chm…
  - **hreflang** · /chmod-calculator/755/ · {"en":"https://opscanopy.com/chmod-calculator/755/"} → {"de":"https://opscanopy.com/de/chmod-calculator/755/","en":"https://opscanopy.com/chmod-calculator/755/","fr":"https://opscanopy.com/fr/chm…
  - **hreflang** · /chmod-calculator/777/ · {"en":"https://opscanopy.com/chmod-calculator/777/"} → {"de":"https://opscanopy.com/de/chmod-calculator/777/","en":"https://opscanopy.com/chmod-calculator/777/","es":"https://opscanopy.com/es/chm…
- Rule #6 ('What does chmod +x do?' appended in five locales): 5 diff(s)
  - **ld:FAQPage** · /chmod-calculator/ · {"@context":"https://schema.org","@type":"FAQPage","mainEntity":[{"@type":"Question","acceptedAnswer":{"@type":"Answer","text":"chmod 755 se… → {"@context":"https://schema.org","@type":"FAQPage","main… · changed
  - **ld:FAQPage** · /de/chmod-calculator/ · {"@context":"https://schema.org","@type":"FAQPage","mainEntity":[{"@type":"Question","acceptedAnswer":{"@type":"Answer","text":"chmod 755 se… → {"@context":"https://schema.org","@type":"FAQPage","main… · changed
  - **ld:FAQPage** · /es/chmod-calculator/ · {"@context":"https://schema.org","@type":"FAQPage","mainEntity":[{"@type":"Question","acceptedAnswer":{"@type":"Answer","text":"chmod 755 ot… → {"@context":"https://schema.org","@type":"FAQPage","main… · changed
  - **ld:FAQPage** · /fr/chmod-calculator/ · {"@context":"https://schema.org","@type":"FAQPage","mainEntity":[{"@type":"Question","acceptedAnswer":{"@type":"Answer","text":"chmod 755 ac… → {"@context":"https://schema.org","@type":"FAQPage","main… · changed
  - **ld:FAQPage** · /pt-br/chmod-calculator/ · {"@context":"https://schema.org","@type":"FAQPage","mainEntity":[{"@type":"Question","acceptedAnswer":{"@type":"Answer","text":"chmod 755 co… → {"@context":"https://schema.org","@type":"FAQPage","main… · changed
- Rule #7 (Appended FAQ answer sits in a collapsed panel): 5 diff(s)
  - **hidden** · 5 pages, e.g. /chmod-calculator/, /de/chmod-calculator/, /es/chmod-calculator/ · +1
- Rule #8 (Author byline on the two new post cards in blog listings): 8 diff(s)
  - **anchor:/about/** · 4 pages, e.g. /blog/, /blog/tag/devops/, /blog/tag/linux/ · -"" +" \| Pushkar Kumar \| Pushkar Kumar" · anchor text changed
  - **anchor:/de/about/** · /de/blog/ · Pushkar Kumar \| Pushkar Kumar \| Pushkar Kumar \| Pushkar Kumar \| Pushkar Kumar \| Pushkar Kumar \| Pushkar Kumar \| Pushkar Kumar \| Pushkar Kuma… → Pushkar Kumar \| Pushkar Kumar \| Pushkar Kumar \| Pushkar … · anchor text changed
  - **anchor:/es/about/** · /es/blog/ · Acerca de \| Pushkar Kumar \| Pushkar Kumar \| Pushkar Kumar \| Pushkar Kumar \| Pushkar Kumar \| Pushkar Kumar \| Pushkar Kumar \| Pushkar Kumar \| … → Acerca de \| Pushkar Kumar \| Pushkar Kumar \| Pushkar Kuma… · anchor text changed
  - **anchor:/fr/about/** · /fr/blog/ · Pushkar Kumar \| Pushkar Kumar \| Pushkar Kumar \| Pushkar Kumar \| Pushkar Kumar \| Pushkar Kumar \| Pushkar Kumar \| Pushkar Kumar \| Pushkar Kuma… → Pushkar Kumar \| Pushkar Kumar \| Pushkar Kumar \| Pushkar … · anchor text changed
  - **anchor:/pt-br/about/** · /pt-br/blog/ · Pushkar Kumar \| Pushkar Kumar \| Pushkar Kumar \| Pushkar Kumar \| Pushkar Kumar \| Pushkar Kumar \| Pushkar Kumar \| Pushkar Kumar \| Pushkar Kuma… → Pushkar Kumar \| Pushkar Kumar \| Pushkar Kumar \| Pushkar … · anchor text changed
- Rule #9 (Tag descriptions carry the post count; the two new posts raise it): 6 diff(s)
  - **description** · /blog/tag/devops/ · Every OpsCanopy post tagged “devops”, newest first — 5 in total, each a hands-on DevOps guide with worked examples and real configs. → Every OpsCanopy post tagged “devops”, newest first — 7 in total, …
  - **description** · /blog/tag/linux/ · Every OpsCanopy post tagged “linux”, newest first — 2 in total, each a hands-on DevOps guide with worked examples and real configs. → Every OpsCanopy post tagged “linux”, newest first — 4 in total, ea…
  - **description** · /blog/tag/security/ · Every OpsCanopy post tagged “security”, newest first — 7 in total, each a hands-on DevOps guide with worked examples and real configs. → Every OpsCanopy post tagged “security”, newest first — 9 in tot…
  - **og:description** · /blog/tag/devops/ · Every OpsCanopy post tagged “devops”, newest first — 5 in total, each a hands-on DevOps guide with worked examples and real configs. → Every OpsCanopy post tagged “devops”, newest first — 7 in total, …
  - **og:description** · /blog/tag/linux/ · Every OpsCanopy post tagged “linux”, newest first — 2 in total, each a hands-on DevOps guide with worked examples and real configs. → Every OpsCanopy post tagged “linux”, newest first — 4 in total, ea…
  - **og:description** · /blog/tag/security/ · Every OpsCanopy post tagged “security”, newest first — 7 in total, each a hands-on DevOps guide with worked examples and real configs. → Every OpsCanopy post tagged “security”, newest first — 9 in tot…
- Rule #10 (New and re-dated posts reshuffle latest/related-post lists): 37 diff(s)
  - **inbound:/blog/base64-is-not-encryption/** · /blog/base64-is-not-encryption/ · 12 → 11 · linking pages 12→11 (-8%)
  - **inbound:/blog/cron-expressions-explained/** · /blog/cron-expressions-explained/ · 25 → 24 · linking pages 25→24 (-4%)
  - **inbound:/blog/cron-to-systemd-timers/** · /blog/cron-to-systemd-timers/ · 12 → 11 · linking pages 12→11 (-8%)
  - **inbound:/blog/how-to-read-cidr-notation/** · /blog/how-to-read-cidr-notation/ · 15 → 11 · linking pages 15→11 (-27%)
  - **inbound:/blog/ipv6-subnet-calculator-ipcalc-sipcalc/** · /blog/ipv6-subnet-calculator-ipcalc-sipcalc/ · 33 → 31 · linking pages 33→31 (-6%)
  - **inbound:/blog/jwt-io-alternative/** · /blog/jwt-io-alternative/ · 17 → 12 · linking pages 17→12 (-29%)
  - **inbound:/blog/private-ip-address-ranges-rfc-1918/** · /blog/private-ip-address-ranges-rfc-1918/ · 31 → 29 · linking pages 31→29 (-6%)
  - **inbound:/blog/test-github-actions-locally/** · /blog/test-github-actions-locally/ · 16 → 14 · linking pages 16→14 (-13%)
  - **inbound:/blog/unable-to-get-local-issuer-certificate/** · /blog/unable-to-get-local-issuer-certificate/ · 20 → 16 · linking pages 20→16 (-20%)
  - **inbound:/de/blog/base64-is-not-encryption/** · /de/blog/base64-is-not-encryption/ · 10 → 9 · linking pages 10→9 (-10%)
- Rule #11 (linux tag reaches the 3-post thin-tag threshold (2 -> 4) and becomes indexable): 2 diff(s)
  - **ld:Organization** · /blog/tag/linux/ · ∅ → {"@context":"https://schema.org","@id":"https://opscanopy.com/#organization","@type":"Organization","description":"OpsCanopy is a growing hu… · added
  - **ld:WebSite** · /blog/tag/linux/ · ∅ → {"@context":"https://schema.org","@id":"https://opscanopy.com/#website","@type":"WebSite","description":"OpsCanopy is a growing hub of free,… · added
- Rule #12 (linux tag reaches the 3-post thin-tag threshold (2 -> 4) and becomes indexable): 1 diff(s)
  - **pagefind** · /blog/tag/linux/ · false → true
- Rule #13 (linux tag reaches the 3-post thin-tag threshold (2 -> 4) and becomes indexable): 1 diff(s)
  - **robots** · /blog/tag/linux/ · noindex,nofollow → ∅
- Rule #14 (linux tag reaches the 3-post thin-tag threshold (2 -> 4) and becomes indexable): 1 diff(s)
  - **sitemap** · /blog/tag/linux/ · false → true · entered sitemap; the page still builds

## Informational (301)

- **sitemap** · 29 pages, e.g. /blog/chmod-command-linux/, /blog/chown-command-linux/, /chmod-calculator/1777/ · entered sitemap · entered sitemap with its page
- **words** · 16 pages, e.g. /blog/debug-prometheus-relabeling/, /blog/github-actions-if-condition-always-true/, /blog/logql-vs-promql/ · +1 · 0.0%
- **words** · 12 pages, e.g. /chmod-calculator/444/, /chmod-calculator/555/, /chmod-calculator/600/ · +89 · 12.4%
- **words** · 11 pages, e.g. /, /blog/reading-promql/, /blog/test-github-actions-locally/ · -2 · -0.1%
- **links** · 9 pages, e.g. /chmod-calculator/, /chmod-calculator/444/, /chmod-calculator/555/ · {"removed":[],"added":["/blog/chmod-command-linux/","/blog/chown-command-linux/","/chmod-calculator/1777/","/chmod-calculator/2775/","/chmod-calculator/400/","/chmod-calculator/4755/","/chmod-calculat… · 186→194 links; +8 / -0 hrefs
- **words** · 9 pages, e.g. /de/blog/base64-is-not-encryption/, /es/blog/github-actions-security-misconfigurations/, /es/blog/learn-devops-in-90-days/ · +4 · 0.2%
- **hidden** · 8 pages, e.g. /blog/, /blog/tag/devops/, /blog/tag/linux/ · +6
- **hidden** · 5 pages, e.g. /blog/kubernetes-service-has-no-endpoints/, /de/blog/kubernetes-service-has-no-endpoints/, /es/blog/kubernetes-service-has-no-endpoints/ · +1
- **lastmod** · 5 pages, e.g. /blog/github-actions-workflow-not-triggering-filters/, /de/blog/github-actions-workflow-not-triggering-filters/, /es/blog/github-actions-workflow-not-triggering-filters/ · 2026-06-14T00:00:00.000Z→2026-06-07T00:00:00.000Z
- **words** · 5 pages, e.g. /blog/cron-to-systemd-timers/, /blog/docker-build-failed-to-solve-exit-code-1/, /blog/learn-devops-in-90-days/ · +8 · 0.5%
- **words** · 5 pages, e.g. /blog/private-ip-address-ranges-rfc-1918/, /blog/x509-certificate-signed-by-unknown-authority/, /es/blog/jwt-io-alternative/ · -7 · -0.4%
- **h2** · 4 pages, e.g. /blog/, /blog/tag/devops/, /blog/tag/linux/ · {"removed":[],"added":["chown command in Linux: change file owner and group","chmod command in Linux: syntax, examples and common mistakes"]} · -0 +2
- **hidden** · 4 pages, e.g. /de/blog/cron-to-systemd-timers/, /es/blog/cron-to-systemd-timers/, /fr/blog/cron-to-systemd-timers/ · +4
- **words** · 4 pages, e.g. /blog/base64-is-not-encryption/, /fr/blog/cron-expressions-explained/, /fr/blog/jwt-io-alternative/ · +5 · 0.3%
- **words** · 4 pages, e.g. /blog/cron-expressions-explained/, /es/blog/base64-is-not-encryption/, /es/blog/how-to-read-cidr-notation/ · +3 · 0.2%
- **words** · 4 pages, e.g. /de/blog/github-actions-workflow-not-triggering-filters/, /es/, /fr/blog/kubernetes-service-has-no-endpoints/ · +2 · 0.1%
- **words** · 4 pages, e.g. /de/blog/kubernetes-service-has-no-endpoints/, /fr/blog/base64-is-not-encryption/, /fr/blog/how-to-read-cidr-notation/ · +12 · 0.5%
- **links** · 3 pages, e.g. /blog/tag/devops/, /blog/tag/linux/, /blog/tag/security/ · {"removed":[],"added":["/blog/chmod-command-linux/","/blog/chown-command-linux/"],"delta":4} · 155→159 links; +2 / -0 hrefs
- **words** · 3 pages, e.g. /blog/github-actions-workflow-not-triggering-filters/, /de/blog/debug-prometheus-relabeling/, /fr/blog/reading-promql/ · -1 · -0.1%
- **words** · 3 pages, e.g. /blog/tag/devops/, /blog/tag/linux/, /blog/tag/security/ · +99 · 41.9%
- **words** · 3 pages, e.g. /blog/unifying-cve-ignore-files/, /es/blog/private-ip-address-ranges-rfc-1918/, /es/blog/unable-to-get-local-issuer-certificate/ · -6 · -0.5%
- **h2** · 2 pages, e.g. /blog/tag/ci-cd/, /blog/tag/developer-experience/ · reordered · reordered
- **links** · 2 pages, e.g. /blog/logql-vs-promql/, /blog/reading-promql/ · {"removed":[],"added":["/blog/github-actions-workflow-not-triggering-filters/"],"delta":0} · 177→177 links; +1 / -0 hrefs
- **links** · 2 pages, e.g. /de/blog/logql-vs-promql/, /de/blog/reading-promql/ · {"removed":[],"added":["/de/blog/github-actions-workflow-not-triggering-filters/"],"delta":0} · 173→173 links; +1 / -0 hrefs
- **links** · 2 pages, e.g. /de/blog/private-ip-address-ranges-rfc-1918/, /de/blog/unable-to-get-local-issuer-certificate/ · {"removed":["/de/blog/jwt-io-alternative/"],"added":["/de/blog/chmod-command-linux/","/de/blog/chown-command-linux/"],"delta":0} · 181→181 links; +2 / -1 hrefs
- **links** · 2 pages, e.g. /es/blog/logql-vs-promql/, /es/blog/reading-promql/ · {"removed":[],"added":["/es/blog/github-actions-workflow-not-triggering-filters/"],"delta":0} · 173→173 links; +1 / -0 hrefs
- **links** · 2 pages, e.g. /es/blog/private-ip-address-ranges-rfc-1918/, /es/blog/unable-to-get-local-issuer-certificate/ · {"removed":["/es/blog/jwt-io-alternative/"],"added":["/es/blog/chmod-command-linux/","/es/blog/chown-command-linux/"],"delta":0} · 181→181 links; +2 / -1 hrefs
- **links** · 2 pages, e.g. /fr/blog/logql-vs-promql/, /fr/blog/reading-promql/ · {"removed":[],"added":["/fr/blog/github-actions-workflow-not-triggering-filters/"],"delta":0} · 173→173 links; +1 / -0 hrefs
- **links** · 2 pages, e.g. /fr/blog/private-ip-address-ranges-rfc-1918/, /fr/blog/unable-to-get-local-issuer-certificate/ · {"removed":["/fr/blog/jwt-io-alternative/"],"added":["/fr/blog/chmod-command-linux/","/fr/blog/chown-command-linux/"],"delta":0} · 181→181 links; +2 / -1 hrefs
- **links** · 2 pages, e.g. /pt-br/blog/logql-vs-promql/, /pt-br/blog/reading-promql/ · {"removed":[],"added":["/pt-br/blog/github-actions-workflow-not-triggering-filters/"],"delta":0} · 173→173 links; +1 / -0 hrefs
- **links** · 2 pages, e.g. /pt-br/blog/private-ip-address-ranges-rfc-1918/, /pt-br/blog/unable-to-get-local-issuer-certificate/ · {"removed":["/pt-br/blog/jwt-io-alternative/"],"added":["/pt-br/blog/chmod-command-linux/","/pt-br/blog/chown-command-linux/"],"delta":0} · 181→181 links; +2 / -1 hrefs
- **words** · 2 pages, e.g. /blog/terraform-forces-replacement/, /blog/unable-to-get-local-issuer-certificate/ · -3 · -0.1%
- **words** · 2 pages, e.g. /de/blog/cron-expressions-explained/, /fr/ · +10 · 0.8%
- **words** · 2 pages, e.g. /de/blog/how-to-read-cidr-notation/, /de/blog/learn-devops-in-90-days/ · +11 · 0.6%
- **words** · 2 pages, e.g. /es/blog/, /pt-br/blog/ · +107 · 7.7%
- **words** · 2 pages, e.g. /es/blog/cron-to-systemd-timers/, /pt-br/blog/cron-to-systemd-timers/ · +97 · 5.5%
- **words** · 2 pages, e.g. /es/blog/github-actions-if-condition-always-true/, /es/blog/unifying-cve-ignore-files/ · -4 · -0.2%
- **h2** · /de/blog/ · ["Kubernetes Service has no endpoints: den Selector-Bug finden","Terraform forces replacement: -/+ verstehen und beheben","Unable to get loc… → ["chown-Befehl in Linux: Besitzer und Gruppe von Dateien… · -0 +2
- **h2** · /es/blog/ · ["Kubernetes Service sin endpoints: el bug del selector","Terraform forces replacement: qué es -/+ y cómo evitarlo","Unable to get local iss… → ["Comando chown en Linux: cambiar propietario y grupo de… · -0 +2
- **h2** · /fr/blog/ · ["Kubernetes Service has no endpoints : le bug du selector","Terraform forces replacement : comprendre -/+ et corriger","Unable to get local… → ["Commande chown sous Linux : changer le propriétaire et… · -0 +2
- **h2** · /pt-br/blog/ · ["Kubernetes Service has no endpoints: ache o bug do selector","Terraform forces replacement: o que é -/+ e como evitar","Unable to get loca… → ["Comando chown no Linux: mudar dono e grupo de arquivos… · -0 +2
- **lastmod** · /blog/ipv6-subnet-calculator-ipcalc-sipcalc/ · 2026-09-21T00:00:00.000Z → 2026-09-19T00:00:00.000Z
- **lastmod** · /blog/kubernetes-oomkilled-exit-code-137/ · 2026-08-29T00:00:00.000Z → 2026-08-22T00:00:00.000Z
- **lastmod** · /blog/tag/devops/ · 2026-10-02T00:00:00.000Z → 2026-10-04T00:00:00.000Z
- **lastmod** · /blog/test-github-actions-locally/ · 2026-09-21T00:00:00.000Z → 2026-09-03T00:00:00.000Z
- **lastmod** · /blog/x509-certificate-signed-by-unknown-authority/ · 2026-08-29T00:00:00.000Z → 2026-08-15T00:00:00.000Z
- **links** · / · 190 → 190 · 190→190 links; +2 / -2 hrefs
- **links** · /blog/ · 236 → 241 · 236→241 links; +3 / -0 hrefs
- **links** · /blog/base64-is-not-encryption/ · 178 → 178 · 178→178 links; +2 / -3 hrefs
- **links** · /blog/cron-expressions-explained/ · 177 → 177 · 177→177 links; +2 / -2 hrefs
- **links** · /blog/cron-to-systemd-timers/ · 177 → 177 · 177→177 links; +2 / -1 hrefs
- **links** · /blog/debug-prometheus-relabeling/ · 181 → 181 · 181→181 links; +1 / -1 hrefs
- **links** · /blog/docker-build-failed-to-solve-exit-code-1/ · 158 → 158 · 158→158 links; +1 / -1 hrefs
- **links** · /blog/github-actions-cron-timezone-utc/ · 160 → 160 · 160→160 links; +1 / -1 hrefs
- **links** · /blog/github-actions-if-condition-always-true/ · 178 → 178 · 178→178 links; +1 / -0 hrefs
- **links** · /blog/github-actions-workflow-not-triggering-filters/ · 178 → 178 · 178→178 links; +2 / -1 hrefs
- **links** · /blog/how-to-read-cidr-notation/ · 182 → 182 · 182→182 links; +3 / -1 hrefs
- **links** · /blog/ipv6-subnet-calculator-ipcalc-sipcalc/ · 158 → 158 · 158→158 links; +2 / -3 hrefs
- **links** · /blog/jwt-io-alternative/ · 179 → 179 · 179→179 links; +3 / -3 hrefs
- **links** · /blog/kubernetes-service-has-no-endpoints/ · 181 → 182 · 181→182 links; +2 / -1 hrefs
- **links** · /blog/learn-devops-in-90-days/ · 179 → 179 · 179→179 links; +3 / -3 hrefs
- **links** · /blog/private-ip-address-ranges-rfc-1918/ · 183 → 183 · 183→183 links; +2 / -2 hrefs
- **links** · /blog/terraform-forces-replacement/ · 182 → 182 · 182→182 links; +2 / -2 hrefs
- **links** · /blog/test-github-actions-locally/ · 161 → 161 · 161→161 links; +2 / -2 hrefs
- **links** · /blog/unable-to-get-local-issuer-certificate/ · 183 → 183 · 183→183 links; +3 / -3 hrefs
- **links** · /blog/unifying-cve-ignore-files/ · 177 → 177 · 177→177 links; +2 / -2 hrefs
- **links** · /blog/x509-certificate-signed-by-unknown-authority/ · 160 → 160 · 160→160 links; +3 / -3 hrefs
- **links** · /chmod-calculator/600/ · 169 → 189 · 169→189 links; +12 / -0 hrefs
- **links** · /chmod-calculator/700/ · 169 → 189 · 169→189 links; +12 / -0 hrefs
- **links** · /chmod-calculator/755/ · 169 → 189 · 169→189 links; +12 / -0 hrefs
- **links** · /chmod-calculator/777/ · 169 → 192 · 169→192 links; +13 / -0 hrefs
- **links** · /de/ · 190 → 190 · 190→190 links; +2 / -2 hrefs
- **links** · /de/blog/ · 212 → 216 · 212→216 links; +2 / -0 hrefs
- **links** · /de/blog/base64-is-not-encryption/ · 176 → 176 · 176→176 links; +2 / -3 hrefs
- **links** · /de/blog/cron-expressions-explained/ · 173 → 173 · 173→173 links; +2 / -2 hrefs
- **links** · /de/blog/cron-to-systemd-timers/ · 171 → 173 · 171→173 links; +2 / -0 hrefs
- **links** · /de/blog/debug-prometheus-relabeling/ · 178 → 178 · 178→178 links; +1 / -1 hrefs
- **links** · /de/blog/github-actions-if-condition-always-true/ · 176 → 176 · 176→176 links; +1 / -0 hrefs
- **links** · /de/blog/github-actions-security-misconfigurations/ · 173 → 173 · 173→173 links; +1 / -1 hrefs
- **links** · /de/blog/github-actions-workflow-not-triggering-filters/ · 175 → 175 · 175→175 links; +2 / -1 hrefs
- **links** · /de/blog/how-to-read-cidr-notation/ · 180 → 180 · 180→180 links; +3 / -2 hrefs
- **links** · /de/blog/jwt-io-alternative/ · 176 → 176 · 176→176 links; +3 / -2 hrefs
- **links** · /de/blog/kubernetes-service-has-no-endpoints/ · 178 → 179 · 178→179 links; +2 / -1 hrefs
- **links** · /de/blog/learn-devops-in-90-days/ · 176 → 176 · 176→176 links; +2 / -2 hrefs
- **links** · /de/blog/terraform-forces-replacement/ · 179 → 179 · 179→179 links; +2 / -2 hrefs
- **links** · /de/blog/unifying-cve-ignore-files/ · 173 → 173 · 173→173 links; +2 / -2 hrefs
- **links** · /de/chmod-calculator/ · 173 → 179 · 173→179 links; +6 / -0 hrefs
- **links** · /es/ · 190 → 190 · 190→190 links; +2 / -2 hrefs
- **links** · /es/blog/ · 212 → 216 · 212→216 links; +2 / -0 hrefs
- **links** · /es/blog/base64-is-not-encryption/ · 176 → 176 · 176→176 links; +2 / -3 hrefs
- **links** · /es/blog/cron-expressions-explained/ · 173 → 173 · 173→173 links; +2 / -2 hrefs
- **links** · /es/blog/cron-to-systemd-timers/ · 171 → 173 · 171→173 links; +2 / -0 hrefs
- **links** · /es/blog/debug-prometheus-relabeling/ · 178 → 178 · 178→178 links; +1 / -1 hrefs
- **links** · /es/blog/github-actions-if-condition-always-true/ · 176 → 176 · 176→176 links; +1 / -0 hrefs
- **links** · /es/blog/github-actions-security-misconfigurations/ · 173 → 173 · 173→173 links; +1 / -1 hrefs
- **links** · /es/blog/github-actions-workflow-not-triggering-filters/ · 175 → 175 · 175→175 links; +2 / -1 hrefs
- **links** · /es/blog/how-to-read-cidr-notation/ · 180 → 180 · 180→180 links; +3 / -2 hrefs
- **links** · /es/blog/jwt-io-alternative/ · 176 → 176 · 176→176 links; +3 / -2 hrefs
- **links** · /es/blog/kubernetes-service-has-no-endpoints/ · 178 → 179 · 178→179 links; +2 / -1 hrefs
- **links** · /es/blog/learn-devops-in-90-days/ · 176 → 176 · 176→176 links; +2 / -2 hrefs
- **links** · /es/blog/terraform-forces-replacement/ · 179 → 179 · 179→179 links; +2 / -2 hrefs
- **links** · /es/blog/unifying-cve-ignore-files/ · 173 → 173 · 173→173 links; +2 / -2 hrefs
- **links** · /es/chmod-calculator/ · 173 → 176 · 173→176 links; +3 / -0 hrefs
- **links** · /fr/ · 190 → 190 · 190→190 links; +2 / -2 hrefs
- **links** · /fr/blog/ · 212 → 216 · 212→216 links; +2 / -0 hrefs
- **links** · /fr/blog/base64-is-not-encryption/ · 176 → 176 · 176→176 links; +2 / -3 hrefs
- **links** · /fr/blog/cron-expressions-explained/ · 173 → 173 · 173→173 links; +2 / -2 hrefs
- **links** · /fr/blog/cron-to-systemd-timers/ · 171 → 173 · 171→173 links; +2 / -0 hrefs
- **links** · /fr/blog/debug-prometheus-relabeling/ · 178 → 178 · 178→178 links; +1 / -1 hrefs
- **links** · /fr/blog/github-actions-if-condition-always-true/ · 176 → 176 · 176→176 links; +1 / -0 hrefs
- **links** · /fr/blog/github-actions-security-misconfigurations/ · 173 → 173 · 173→173 links; +1 / -1 hrefs
- **links** · /fr/blog/github-actions-workflow-not-triggering-filters/ · 175 → 175 · 175→175 links; +2 / -1 hrefs
- **links** · /fr/blog/how-to-read-cidr-notation/ · 180 → 180 · 180→180 links; +3 / -2 hrefs
- **links** · /fr/blog/jwt-io-alternative/ · 176 → 176 · 176→176 links; +3 / -2 hrefs
- **links** · /fr/blog/kubernetes-service-has-no-endpoints/ · 178 → 179 · 178→179 links; +2 / -1 hrefs
- **links** · /fr/blog/learn-devops-in-90-days/ · 176 → 176 · 176→176 links; +2 / -2 hrefs
- **links** · /fr/blog/terraform-forces-replacement/ · 179 → 179 · 179→179 links; +2 / -2 hrefs
- **links** · /fr/blog/unifying-cve-ignore-files/ · 173 → 173 · 173→173 links; +2 / -2 hrefs
- **links** · /fr/chmod-calculator/ · 173 → 179 · 173→179 links; +6 / -0 hrefs
- **links** · /pt-br/ · 190 → 190 · 190→190 links; +2 / -2 hrefs
- **links** · /pt-br/blog/ · 212 → 216 · 212→216 links; +2 / -0 hrefs
- **links** · /pt-br/blog/base64-is-not-encryption/ · 176 → 176 · 176→176 links; +2 / -3 hrefs
- **links** · /pt-br/blog/cron-expressions-explained/ · 173 → 173 · 173→173 links; +2 / -2 hrefs
- **links** · /pt-br/blog/cron-to-systemd-timers/ · 171 → 173 · 171→173 links; +2 / -0 hrefs
- **links** · /pt-br/blog/debug-prometheus-relabeling/ · 178 → 178 · 178→178 links; +1 / -1 hrefs
- **links** · /pt-br/blog/github-actions-if-condition-always-true/ · 176 → 176 · 176→176 links; +1 / -0 hrefs
- **links** · /pt-br/blog/github-actions-security-misconfigurations/ · 173 → 173 · 173→173 links; +1 / -1 hrefs
- **links** · /pt-br/blog/github-actions-workflow-not-triggering-filters/ · 175 → 175 · 175→175 links; +2 / -1 hrefs
- **links** · /pt-br/blog/how-to-read-cidr-notation/ · 180 → 180 · 180→180 links; +3 / -2 hrefs
- **links** · /pt-br/blog/jwt-io-alternative/ · 176 → 176 · 176→176 links; +3 / -2 hrefs
- **links** · /pt-br/blog/kubernetes-service-has-no-endpoints/ · 178 → 179 · 178→179 links; +2 / -1 hrefs
- **links** · /pt-br/blog/learn-devops-in-90-days/ · 176 → 176 · 176→176 links; +2 / -2 hrefs
- **links** · /pt-br/blog/terraform-forces-replacement/ · 179 → 179 · 179→179 links; +2 / -2 hrefs
- **links** · /pt-br/blog/unifying-cve-ignore-files/ · 173 → 173 · 173→173 links; +2 / -2 hrefs
- **links** · /pt-br/chmod-calculator/ · 173 → 179 · 173→179 links; +6 / -0 hrefs
- **llms:llms-full.txt** · /llms-full.txt · 50a121da614d6a4fbe67c512ee6d38ec4a5540fbdc8d8d5ed697136fba7be9b0 → 4e6c7081cab637cee0a0e8a9e5cd49d3bbc281e0edde1af1b24a52b9e3db78a1
- **llms:llms.txt** · /llms.txt · 820c64439dac591ee7526823d019c676f095289a715a29febdb5cb05e39ac4e7 → 5f5831d966068a7e2d43fa838e9e293d50ae2a29e6ca6be9bc8aabef9e34de56
- **words** · /blog/ · 1565 → 1665 · 6.4%
- **words** · /blog/ipv6-subnet-calculator-ipcalc-sipcalc/ · 1601 → 1610 · 0.6%
- **words** · /blog/jwt-io-alternative/ · 2075 → 2058 · -0.8%
- **words** · /blog/kubernetes-service-has-no-endpoints/ · 2408 → 2425 · 0.7%
- **words** · /chmod-calculator/ · 1594 → 1796 · 12.7%
- **words** · /de/blog/ · 1119 → 1212 · 8.3%
- **words** · /de/blog/cron-to-systemd-timers/ · 1602 → 1685 · 5.2%
- **words** · /de/blog/terraform-forces-replacement/ · 2453 → 2471 · 0.7%
- **words** · /de/chmod-calculator/ · 1492 → 1689 · 13.2%
- **words** · /es/blog/kubernetes-service-has-no-endpoints/ · 2637 → 2643 · 0.2%
- **words** · /es/chmod-calculator/ · 1664 → 1885 · 13.3%
- **words** · /fr/blog/ · 1274 → 1378 · 8.2%
- **words** · /fr/blog/cron-to-systemd-timers/ · 1744 → 1838 · 5.4%
- **words** · /fr/blog/private-ip-address-ranges-rfc-1918/ · 2133 → 2122 · -0.5%
- **words** · /fr/blog/unable-to-get-local-issuer-certificate/ · 2902 → 2893 · -0.3%
- **words** · /fr/chmod-calculator/ · 1664 → 1881 · 13.0%
- **words** · /pt-br/blog/github-actions-workflow-not-triggering-filters/ · 2084 → 2079 · -0.2%
- **words** · /pt-br/blog/private-ip-address-ranges-rfc-1918/ · 2026 → 2018 · -0.4%
- **words** · /pt-br/chmod-calculator/ · 1639 → 1859 · 13.4%

## Re-date breakdown (10 URLs)

| route class | URLs | en | de | es | fr | pt-br |
|---|---:|---:|---:|---:|---:|---:|
| blog-post | 9 | 5 | 1 | 1 | 1 | 1 |
| blog-tag | 1 | 1 | 0 | 0 | 0 | 0 |

## Unused allow rules (0)

None.

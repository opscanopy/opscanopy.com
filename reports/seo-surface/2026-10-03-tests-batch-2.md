# SEO-surface diff — tests-batch-2 — 2026-10-03

- Baseline: main ace4579299a1 (build 135.1 s; cold content layer (node_modules/.astro moved aside before the build: yes; fresh data-store.json written by the build: true; "[content] Synced content" logged: true))
- Candidate: this tree @ ace4579299a1 + uncommitted changes
- Allowlist: `scripts/seo-allow/tests-batch-2.json` (expires 2026-10-17)
- Build: candidate: this tree, cold content layer (node_modules/.astro moved aside before the build: yes; fresh data-store.json written by the build: true; "[content] Synced content" logged: true)
- Timing: candidate build 126.1 s
- Timing: extract + diff 14.8 s (562 + 566 pages)
- Timing: total 140.9 s

## Summary

- **Exit 0** — seo-surface: 0 must-explain, 19 allowed, 10 informational; 0 URL(s) re-dated; pages 562 → 566
- Pages: 562 baseline, 566 candidate

## Must-explain (0)

None.

## Allowed by rule (19)

- Rule #0 (two new sets: DVA-C02 Practice Exam 2 and AIF-C01 Mock Exam 3 (noindex runner + indexable review page each)): 4 diff(s)
  - **page-added** · 4 pages, e.g. /tests/aws-ai-practitioner/aif-c01-mock-exam-3/, /tests/aws-ai-practitioner/aif-c01-mock-exam-3/review/, /tests/aws-developer-associate/dva-c02-practice-exam-2/ · added
- Rule #1 (the two new review pages enter the sitemap; runners stay out): 2 diff(s)
  - **sitemap** · 2 pages, e.g. /tests/aws-ai-practitioner/aif-c01-mock-exam-3/review/, /tests/aws-developer-associate/dva-c02-practice-exam-2/review/ · entered sitemap · entered sitemap with its page
- Rule #2 (category meta descriptions count the new set (DVA: two mocks / 130 questions; AIF: three mocks)): 2 diff(s)
  - **description** · /tests/aws-ai-practitioner/ · Two free 65-question AWS Certified AI Practitioner (AIF-C01) mock exams. Every answer explained: Bedrock, SageMaker AI, agentic AI, responsi… → Three free 65-question AWS Certified AI Practitioner (AI…
  - **description** · /tests/aws-developer-associate/ · Free AWS Certified Developer Associate practice exam: 65 original DVA-C02 exam questions, every answer explained — Lambda, API Gateway, Dyna… → Free AWS Certified Developer Associate practice exams: t…
- Rule #3 (og:description mirrors the meta description): 2 diff(s)
  - **og:description** · /tests/aws-ai-practitioner/ · Two free 65-question AWS Certified AI Practitioner (AIF-C01) mock exams. Every answer explained: Bedrock, SageMaker AI, agentic AI, responsi… → Three free 65-question AWS Certified AI Practitioner (AI…
  - **og:description** · /tests/aws-developer-associate/ · Free AWS Certified Developer Associate practice exam: 65 original DVA-C02 exam questions, every answer explained — Lambda, API Gateway, Dyna… → Free AWS Certified Developer Associate practice exams: t…
- Rule #4 (category ItemLists gain the new set; the hub ItemList carries the updated category descriptions): 2 diff(s)
  - **ld:ItemList** · /tests/aws-ai-practitioner/ · {"@context":"https://schema.org","@type":"ItemList","itemListElement":[{"@type":"ListItem","name":"Full Mock Exam","position":1,"url":"https… → {"@context":"https://schema.org","@type":"ItemList","ite… · changed
  - **ld:ItemList** · /tests/aws-developer-associate/ · {"@context":"https://schema.org","@type":"ItemList","itemListElement":[{"@type":"ListItem","name":"DVA-C02 Practice Exam","position":1,"url"… → {"@context":"https://schema.org","@type":"ItemList","ite… · changed
- Rule #5 (the homepage proof strip counts liveTests: 6 AWS practice exams become 8): 5 diff(s)
  - **anchor:/tests/** · 5 pages, e.g. /, /de/, /es/ · -"6" +"8" · anchor text changed
- Rule #6 (study guide section now covers all three AIF mocks and links Mock Exam 3): 1 diff(s)
  - **h2** · /learn/guides/aws-ai-practitioner-study-guide/ · ["Exam at a glance","Is the AWS AI Practitioner worth it, and who is it for","How hard is the AIF-C01, and how long does it take to prepare"… → ["Exam at a glance","Is the AWS AI Practitioner worth it… · -1 +1
- Rule #7 (llms.txt lists the two new sets and their review pages from the registry): 1 diff(s)
  - **llms:llms.txt** · /llms.txt · c675a1988e50774af0089fc8ae381d2919af7ac542c51db02b3a2db9e1ff31d8 → 22ef96d2bd28e735e1c11ebee0ac1b67cbfeb1368d38e3cee8870fecc3850813

## Informational (10)

- **hidden** · 2 pages, e.g. /tests/aws-ai-practitioner/, /tests/aws-developer-associate/ · +4
- **links** · 2 pages, e.g. /learn/guides/aws-ai-practitioner-study-guide/, /tests/aws-ai-practitioner/ · {"removed":[],"added":["/tests/aws-ai-practitioner/aif-c01-mock-exam-3/","/tests/aws-ai-practitioner/aif-c01-mock-exam-3/review/"],"delta":2} · 157→159 links; +2 / -0 hrefs
- **words** · 2 pages, e.g. /tests/aws-ai-practitioner/, /tests/aws-developer-associate/ · +14 · 4.0%
- **links** · /tests/aws-developer-associate/ · 142 → 144 · 142→144 links; +2 / -0 hrefs
- **llms:llms-full.txt** · /llms-full.txt · 37c04137dcf62f44dc56777f4fb9786a3e49c8d6501e09745cddf6d8e7d1385c → f207526c72dd3d09c5d67cc416dd4038e74e1c43f9f0c9d0fcfd107b49ac4206
- **words** · /learn/guides/aws-ai-practitioner-study-guide/ · 7061 → 7093 · 0.5%
- **words** · /tests/ · 402 → 404 · 0.5%

## Re-date breakdown (0 URLs)

No sitemap <lastmod> changed.

## Unused allow rules (0)

None.

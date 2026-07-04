# Content Spec — collection, curriculum, authoring rules, Day 1

## 1. Collection schema (add to `src/content.config.ts`)

```ts
const mission90Days = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/mission90' }),
  schema: z.object({
    day: z.number().int().min(1).max(90),        // must match a registry entry (data test enforces)
    title: z.string(),
    description: z.string(),                     // meta description; SEO formula in SEO-MARKETING §4
    phase: z.number().int().min(1).max(5),
    minutes: z.number().int().positive(),        // core budget 45–60
    goals: z.array(z.string()).length(3),        // outcome-phrased, ≤15 words each
    tomorrow: z.string().optional(),             // 1-line teaser, curiosity-shaped
    interviewQA: z.array(z.object({
      q: z.string(), a: z.string(),              // a = speakable ≤120-word script
      track: z.enum(['service', 'product', 'both']).default('both'),
    })).min(3).max(5),
    goDeeperMinutes: z.number().int().positive().optional(),
    updatedDate: z.coerce.date().optional(),
    draft: z.boolean().default(false),
  }),
});
export const collections = { blog, guides, mission90Days };
```

Body H2 order (fixed; rehype-chapters gives per-section time meta for free):
`## <topic-specific concept heading>` → `## Hands-On Lab` → `## Real Errors I Hit` → `## <topic> Interview Questions` → `## Go Deeper` (optional). Goals/tomorrow render from frontmatter, not body. Keyword-carrying headings: concept + interview only (SEO-MARKETING §4).

## 2. Curriculum registry (`src/data/mission90.ts`)

### 2.1 Types
Per PLAN canon: `Mission90Phase { id, slug, name, tagline, days:[from,to], accent }`, `Mission90Day { day, slug, title, phase, minutes, hasMission, missionId?, isProjectDay, status }`, `Mission90Mission { id, week, title, blurb, unlockAfterDay, skills[], noCodeFriendly?, status:'live'|'planned' }` (`blurb` = one-line card teaser — deliberately NOT named `story`, which is the engine config's briefing array), `program` const. Helpers: `liveDays`, `getDay(n)`, `phaseForDay(n)`, `totalCoreMinutes` (drives the hub hours caption + `courseLd` workload — single source, tested).

**Mission availability rule (canon):** `status:'live'` missions are always playable (free-play; `unlockAfterDay` drives badge copy only — "Pairs with Day 7"). `status:'planned'` → non-playable "In production" card. Hard unlock display = Phase B.

### 2.2 Phases
| # | slug | name | days | accent |
|---|---|---|---|---|
| 1 | foundations | Foundations | 1–20 | develop |
| 2 | containers-cicd | Containers & CI/CD | 21–45 | ship |
| 3 | cloud | Cloud | 46–65 | preview |
| 4 | orchestration-iac | Orchestration & IaC | 66–85 | ship |
| 5 | job-ready | Job Ready | 86–90 | develop |

### 2.3 The 90 days (title · minutes; 🎮 = hasMission w/ missionId, 🏗 = isProjectDay)
Day 0 (uncounted, `/setup`): Lab setup — WSL2 + Ubuntu 24.04 · 20

**Phase 1 — Foundations (1–20)**
1. What DevOps actually is + your first terminal session · 50 *(live at launch)*
2. The Linux filesystem: where everything lives · 50
3. Navigating & managing files — pwd, ls, cd, cp, mv, rm · 45
4. Reading & editing files — cat, less, nano, vim survival · 45
5. Users, groups & permissions — chmod, chown, octal · 55
6. Processes & signals — ps, top, kill, nice · 50
7. Week 1 review + 🎮 Server Down! · 45
8. Text power tools — grep, sed & awk one-liners · 55
9. Pipes, redirection & command chaining · 50
10. Packages & services — apt, systemd, journalctl · 55
11. Networking 101 — IP, DNS, ports, curl · 55
12. Networking 102 — ss, dig, ping, a troubleshooting flow · 50
13. SSH deep-dive — keys, config, scp, tunnels · 55
14. Week 2 review + 🎮 DNS Detective · 45
15. Shell scripting 1 — variables, conditionals, loops · 55
16. Shell scripting 2 — functions, exit codes, a real backup script · 55
17. Git for DevOps — branching, merge vs rebase · 50
18. Git collaboration — PRs, reviews, tags, releases · 45
19. Cron & scheduled jobs — crontab, systemd timers · 45
20. Phase 1 review — Linux interview drill · 45

**Phase 2 — Containers & CI/CD (21–45)**
21. Week 3 review + 🎮 The Locked File · 45
22. Containers vs VMs — what Docker actually does · 50
23. Docker fundamentals — images, containers, registries · 55
24. Dockerfiles — writing & optimizing your first image · 60
25. Docker networking & port mapping · 50
26. Volumes & persistent data · 50
27. docker compose — multi-container apps · 55
28. Week 4 review + 🎮 Docker Rescue · 45
29. Image best practices — multi-stage builds, size, security · 55
30. Container debugging — logs, exec, inspect, stats · 50
31. CI/CD concepts — pipelines, environments, artifacts (+ Jenkins legacy aside) · 45
32. GitHub Actions 1 — workflow anatomy, triggers · 55
33. GitHub Actions 2 — jobs, matrices, secrets · 55
34. GitHub Actions 3 — build & push an image to a registry · 60
35. Week 5 review — harden your pipeline · 45
36. Testing in pipelines — lint, unit tests, quality gates · 50
37. Versioning & releases — semver, tags, changelogs · 45
38. Deploy strategies — rolling, blue-green, canary · 45
39. Pipeline security — secrets management, image scanning (Trivy), supply-chain basics · 50
40. Phase 2 review + 🎮 Broken Pipeline · 45
41–45. 🏗 Project 1: containerize & ship a full app with CI/CD · 60×5

**Phase 3 — Cloud (46–65)**
46. Cloud fundamentals — regions, AZs, shared responsibility · 45
47. AWS account hygiene — IAM, MFA, budgets, cost tagging · 55
48. EC2 — launch, connect, security groups · 55
49. Week 7 review + 🎮 AWS Bill Shock · 45
50. VPC 1 — subnets, route tables, gateways · 55
51. VPC 2 — NAT, public vs private, bastion patterns · 55
52. S3 — buckets, policies, static hosting, lifecycle · 50
53. RDS & managed databases · 50
54. Load balancers & auto scaling · 55
55. Route 53 & TLS with ACM · 50
56. Week 8 review + 🎮 Database Recovery · 45
57. CloudWatch — metrics, logs, alarms · 50
58. AWS CLI & scripting cloud operations · 50
59. ECR + ECS/Fargate — containers on AWS (Go Deeper: where Lambda fits) · 60
60. Observability 1 — Prometheus & Grafana fundamentals · 55
61. Observability 2 — alerts, SLOs & log aggregation (Loki) · 50
62–65. 🏗 Project 2: deploy the containerized app on AWS · 60×4

**Phase 4 — Orchestration & IaC (66–85)**
66. Why Kubernetes — the problems it solves · 45
67. K8s architecture + kubectl with kind on WSL2 · 55
68. Pods & Deployments · 55
69. Services & networking in K8s · 55
70. ConfigMaps & Secrets · 50
71. Health probes & resource requests/limits · 50
72. Debugging workloads — describe, logs, events, crashloops · 55
73. Week 11 review + 🎮 Kubernetes Chaos · 45
74. Ingress & exposing apps properly · 55
75. Helm — charts, values, releases (Go Deeper: GitOps with Argo CD) · 55
76. IaC concepts + Terraform first apply · 50
77. Terraform 2 — variables, outputs, state · 55
78. Terraform 3 — modules & workspaces · 55
79. Terraform + AWS — provision the project infra · 60
80. Week 12 review + 🎮 Terraform Trouble · 45
81–85. 🏗 Project 3: K8s + Terraform capstone · 60×5

**Phase 5 — Job Ready (86–90)**
86. Your DevOps resume — turning 90 days into bullets · 50
87. Portfolio & GitHub polish — READMEs, diagrams, demos · 50
88. Incident management — severity, runbooks, postmortems, error budgets · 55
89. Interview drill — rapid-fire across the stack + scenario walk-throughs · 55
90. 🎮 FINAL BOSS: The Midnight Outage + what's next · 60

**Missions (10):** week1-server-down(d7) · week2-dns-detective(d14) · week3-locked-file(d21) · week4-docker-rescue(d28) · week6-broken-pipeline(d40) · week7-aws-bill-shock(d49) · week8-database-recovery(d56) · week11-kubernetes-chaos(d73) · week12-terraform-trouble(d80) · final-midnight-outage(d90). Mission days = review days; deviates from strict every-7th to avoid project blocks (data test asserts this exact list). **Mission-day rule:** the mission IS the day's lab — the day-page body links it directly; the completion-banner unlock framing is the fallback for readers who skipped the body.

**Job-readiness coverage (post-validation):** observability now has 2 dedicated days (d60–61: Prometheus/Grafana, alerts/SLOs/Loki) reinforced by OpsCanopy tool cross-links (promql-explainer, alertmanager-route-tester); pipeline security/DevSecOps at d39 (Trivy, secrets, supply chain); incident management at d88 (severity, runbooks, postmortems); GitOps/Argo CD as named Go Deeper (d75). These are the 2026-JD lines the original draft missed.

## 3. Authoring rules (ships verbatim as `docs/mission90-authoring.md`)

Section budgets (hard caps): Goals 3×≤15 words, outcome-phrased · Concept ≤600 words, max 2 concepts (else split the day) · Lab 20–35 min, ≤12 command blocks, every block `# comment` + expected output · Real Errors 1–4 (min 1) · Q&A 3–5, answers ≤120 words speakable, tagged [Service]/[Product]/[Both] · Go Deeper ≤5 items each time-tagged · Tomorrow 1 sentence.

Rules: exactly ONE analogy (`> **Real world:** …` callout — house style from linux-for-devops) + ONE named industry example per concept. 2026-current only — teach Ubuntu 24.04, Docker 27+/`docker compose` (space), GitHub-Actions-first, K8s 1.31+, Terraform 1.9+ (mention OpenTofu), `ip`/`ss`/`dig`. Banned as primary: CentOS, Jenkins-first, Docker Swarm, `docker-compose` v1, `ifconfig`/`netstat`, Chef/Puppet-first, Vagrant. Legacy tools get one "you'll still see this" aside max.

Enforcement: goals/QA counts are schema-enforced (zod); H2 order + concept word-count + command-block count get a lightweight content-shape test alongside the T3 cross-check (same file-parsing style as `learn-content.test.ts`) — caps are literal, not aspirational.

Visuals: `public/mission-90/day{NN}-{name}.svg` (or inline SVG w/ `currentColor` + `role="img"` + `<title>`); 1–2 diagrams max/day, flow-or-relationship only; ASCII diagrams in fenced blocks encouraged for terminal flows. Labs author-executed in WSL2 Ubuntu 24.04 before publishing — Real Errors come from that run, verbatim error text in code blocks (long-tail SEO), structure: Error → Why → Fix → How you'd spot it in prod. AWS days carry a "what this costs: ₹0 if…" box.

## 4. Day 1 exemplar — `day-001.md` (authored at T3)

Frontmatter: day 1 · "What DevOps actually is + your first terminal session" · **description** (per SEO formula — required by schema, don't omit) · phase 1 · 50 min · goals: ["Explain DevOps in one honest sentence an interviewer accepts", "Run and read 6 core terminal commands", "Know exactly what the next 89 days build toward"] · tomorrow: "Every file on a Linux box lives in one tree — tomorrow you learn to walk it blind." · 4 interviewQA (DevOps vs SRE [both]; why automation [service]; what happens when you type a command [product]; shell vs terminal [both]).

Body: concept (≤600w: DevOps = shortening the loop between writing code and running it reliably; analogy: restaurant kitchen vs delivery; industry example: how a GitHub Actions push→deploy loop replaces release weekends; **one flow diagram — the code→build→deploy→observe loop, inline SVG with `currentColor` strokes + `role="img"` + `<title>` — Day 1 is the template and must exemplify the visuals rule**) → lab (whoami, pwd, ls, uname -a, echo $SHELL, history — each with expected WSL2 output) → 2 real errors (`permission denied` on /root ls; `command not found` from `sl` typo — first person, what it taught) → Q&A → Go Deeper (+30: man pages, linux-for-devops guide §1 link) → tomorrow teaser. Voice: conversational second person, India-friendly English, zero fluff. This file is the template all 89 future days copy.

**Setup page note:** `/mission-90/setup/` opens with "On macOS or Linux already? You have a terminal — skip straight to Day 1." before the WSL2 walkthrough (SEO-arriving non-Windows users must not bounce off a Windows-only page).

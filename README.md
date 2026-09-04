# OpsCanopy

**A canopy of free, private, browser-based tools for platform & DevOps engineers.**

🌐 **[opscanopy.com](https://opscanopy.com)** · 39 tools · no signup · no servers · MIT licensed

OpsCanopy is a growing collection of focused utilities for DevOps and SRE work —
validators, converters, testers and linters. Every tool runs **100% client-side**
in your browser using JavaScript and (where it helps) WebAssembly. There is no
backend, no API and no account system, so **anything you paste never leaves your
device**. Most tools keep working even with the network disconnected.

## Why it exists

Engineers reach for quick tools dozens of times a day — validate a workflow file,
decode a token, test a regex against log lines, work out a subnet, convert a
suppression file. Too many of those tools ask you to paste sensitive internal data
into a website that quietly uploads it to a server. OpsCanopy takes the opposite
approach: fast, free, and private by construction, because there is nowhere for
your data to go.

## What's inside

**39 tools across 12 categories.** Every one runs entirely in your browser.

#### Observability

| Tool | What it does |
| :--- | :--- |
| **[AlertLint](https://opscanopy.com/loki-alert-rule-tester/)** | Unit testing for Grafana Loki alert rules. |
| **[Alertmanager Route Tester](https://opscanopy.com/alertmanager-route-tester/)** | Walk your Alertmanager route tree against alert labels to find the matching receiver(s) - in your browser. |
| **[Grafana Dashboard Validator](https://opscanopy.com/grafana-dashboard-validator/)** | Lint Grafana dashboard JSON for broken variables, legacy panels and import traps — in your browser. |
| **[LogQL ↔ PromQL Helper](https://opscanopy.com/logql-promql-helper/)** | Translate and explain queries between Loki LogQL and Prometheus PromQL. |
| **[Prometheus Relabel Tester](https://opscanopy.com/prometheus-relabel-tester/)** | Test Prometheus relabel_configs against sample labels and see exactly what survives. |
| **[PromQL Explainer](https://opscanopy.com/promql-explainer/)** | Paste a PromQL query and get a plain-English explanation. |

#### Networking

| Tool | What it does |
| :--- | :--- |
| **[CIDR / Subnet Checker](https://opscanopy.com/cidr-checker/)** | Check an IP against CIDR ranges, find overlaps, and merge lists. |
| **[IP Address Converter](https://opscanopy.com/ip-address-converter/)** | Convert an IP between dotted decimal, integer, hex and binary. |
| **[MAC Address Formatter](https://opscanopy.com/mac-address-formatter/)** | Reformat a MAC across colon, hyphen, Cisco and bare — and read its bits. |
| **[Reverse DNS / PTR Helper](https://opscanopy.com/reverse-dns-ptr/)** | Build the in-addr.arpa / ip6.arpa PTR name and reverse zone for any IP. |
| **[Subnet Calculator](https://opscanopy.com/subnet-calculator/)** | Network, broadcast, mask and host range from any IPv4/IPv6 CIDR. |
| **[Subnet Splitter](https://opscanopy.com/subnet-splitter/)** | Split a parent CIDR into subnets and find the free space around allocations. |

#### Utilities

| Tool | What it does |
| :--- | :--- |
| **[Case Converter](https://opscanopy.com/case-converter/)** | Convert text between camelCase, snake_case, kebab-case and more. |
| **[chmod Calculator](https://opscanopy.com/chmod-calculator/)** | Convert chmod between octal, symbolic and the permission matrix. |
| **[Data Size Converter](https://opscanopy.com/data-size-converter/)** | GiB vs GB, bits vs bytes — and how long that transfer really takes. |
| **[Slugify](https://opscanopy.com/slugify/)** | Turn any title into a clean URL slug. |
| **[UUID / ULID Generator](https://opscanopy.com/uuid-ulid-generator/)** | Generate v4 UUIDs and ULIDs, or inspect one. |

#### Security

| Tool | What it does |
| :--- | :--- |
| **[Certificate Decoder & Chain Checker](https://opscanopy.com/certificate-decoder/)** | Decode PEM certificates, check chain order, and verify signatures — in your browser. |
| **[CVE-Ignore Converter](https://opscanopy.com/cve-ignore-converter/)** | Translate .trivyignore / .grype.yaml / .snyk in one click. |
| **[Hash Generator](https://opscanopy.com/hash-generator/)** | Compute MD5, SHA-1, SHA-256 and SHA-512 digests of any text — plus HMAC. |
| **[JWT Decoder & Encoder](https://opscanopy.com/jwt-decoder/)** | Decode, verify, and sign JWTs — HS/RS/PS/ES/EdDSA — with a built-in key generator. |

#### Encoding

| Tool | What it does |
| :--- | :--- |
| **[Base64 Encoder / Decoder](https://opscanopy.com/base64-encoder-decoder/)** | Encode and decode Base64 and URL-safe Base64, with Unicode support. |
| **[JSON ↔ YAML Converter](https://opscanopy.com/json-yaml-converter/)** | Convert JSON to YAML and back — with honest warnings about what changes. |
| **[Timestamp Converter](https://opscanopy.com/timestamp-converter/)** | Convert between Unix epoch, ISO 8601 and human-readable dates. |
| **[URL Encoder / Decoder](https://opscanopy.com/url-encoder-decoder/)** | Percent-encode, decode, and parse query strings — with per-component RFC 3986 rules. |

#### CI/CD

| Tool | What it does |
| :--- | :--- |
| **[GitHub Actions Expression Tester](https://opscanopy.com/github-actions-expression-tester/)** | Evaluate ${{ }} expressions and simulate workflow triggers. |
| **[GitHub Actions Validator](https://opscanopy.com/github-actions-validator/)** | Check workflow YAML errors & security issues online — no install. |
| **[GitLab CI Validator](https://opscanopy.com/gitlab-ci-validator/)** | Lint .gitlab-ci.yml for YAML errors and pipeline misconfigurations — in your browser, no login. |

#### Scheduling

| Tool | What it does |
| :--- | :--- |
| **[Cron Expression Tester](https://opscanopy.com/cron-expression-tester/)** | Explain any cron expression in plain English — and see the next runs. |
| **[Cron to systemd Converter](https://opscanopy.com/cron-to-systemd/)** | Turn a crontab line into a systemd timer + service unit. |
| **[Systemd Unit Validator](https://opscanopy.com/systemd-unit-validator/)** | Lint .service, .timer and .socket files for typos and misconfigurations — in your browser, no root. |

#### Logs

| Tool | What it does |
| :--- | :--- |
| **[jq Playground](https://opscanopy.com/jq-playground/)** | Test jq expressions against your JSON — real jq 1.8.2 running in your browser. |
| **[Regex Log Tester](https://opscanopy.com/regex-log-tester/)** | Test regular expressions against your log lines — live matches and groups. |

#### Kubernetes

| Tool | What it does |
| :--- | :--- |
| **[Kubernetes Label Selector Tester](https://opscanopy.com/kubernetes-label-selector-tester/)** | See which pods a label selector matches — and why each one does or doesn’t. |
| **[Kubernetes Resource Calculator](https://opscanopy.com/kubernetes-resource-calculator/)** | Total CPU and memory requests and limits across pods and replicas. |

#### Docker

| Tool | What it does |
| :--- | :--- |
| **[Docker Run to Compose](https://opscanopy.com/docker-run-to-compose/)** | Paste a docker run command, get a docker-compose service YAML — and convert back, all in your browser. |
| **[Dockerfile Linter](https://opscanopy.com/dockerfile-linter/)** | Paste a Dockerfile, get line-numbered best-practice and security findings with fixes — entirely in your browser. |

#### Config

| Tool | What it does |
| :--- | :--- |
| **[Env Example Checker](https://opscanopy.com/env-example-checker/)** | Find env vars your code uses but .env.example is missing. |

#### IaC

| Tool | What it does |
| :--- | :--- |
| **[Terraform Plan Summarizer](https://opscanopy.com/terraform-plan-summarizer/)** | Paste terraform plan output, get a summary of adds, changes, destroys and replacements. |

👉 Or browse the full catalog at **[opscanopy.com/tools](https://opscanopy.com/tools/)**.

## Tech

- [Astro](https://astro.build) (static output, native i18n) + [Tailwind CSS v4](https://tailwindcss.com)
- TypeScript, with WebAssembly for compute-heavy tools (e.g. AlertLint)
- Fully static, deployed on Cloudflare — no server-side code paths
- Localized in English, Spanish, German, French and Brazilian Portuguese

## Local development

All commands run from the project root:

| Command | Action |
| :--- | :--- |
| `npm install` | Install dependencies |
| `npm run dev` | Start the dev server at `localhost:4321` |
| `npm run build` | Build the production site to `./dist/` |
| `npm run preview` | Preview the build locally |
| `npm run test` | Run the unit tests |

## Contributing

Issues and pull requests are welcome — bug reports, new tool ideas, translations
and fixes. Tools are engineered against real specifications and test vectors, so
PRs that add or change behavior should include tests.

## Privacy

OpsCanopy collects nothing you type. All processing happens in your browser; there
is no upload, no account, and no logging of tool input. See
[opscanopy.com/privacy](https://opscanopy.com/privacy).

## Maintainers

Built and maintained by **Pushkar Kumar** and **Asif Khan**.

## IndexNow

OpsCanopy pings [IndexNow](https://www.indexnow.org) so Bing, Yandex and other
participating engines re-crawl changed pages quickly. Ownership is verified by the
key file at [`/a3f8c1d24b9e6705e2c8f4a17d093b6e.txt`](https://opscanopy.com/a3f8c1d24b9e6705e2c8f4a17d093b6e.txt)
(committed in `public/`).

After deploying a new build, submit the live URLs:

```bash
npm run build      # generates dist/sitemap-0.xml
npm run deploy     # publish to Cloudflare first — the URLs must be live
npm run indexnow   # POST every sitemap <loc> URL to IndexNow
```

The script reads `dist/sitemap-0.xml`, submits up to 10,000 URLs in one batch,
and exits non-zero if IndexNow does not return `200`/`202`.

**Zero-maintenance alternative:** Cloudflare's native **Crawler Hints** feature
(Cache → Configuration → Crawler Hints) auto-submits your content to IndexNow
whenever it changes, so you can skip `npm run indexnow` entirely if it's enabled.

## License

[MIT](./LICENSE) © 2026 Pushkar Kumar and Asif Khan

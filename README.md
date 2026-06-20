# OpsCanopy

**A canopy of free, private, browser-based tools for platform & DevOps engineers.**

🌐 **[opscanopy.com](https://opscanopy.com)** · 20+ tools · no signup · no servers · MIT licensed

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

20+ tools across 9 categories. A few highlights:

| Category | Tools |
| :--- | :--- |
| **Observability** | AlertLint (Loki alert-rule tester), PromQL Explainer, LogQL ↔ PromQL Helper |
| **Security** | JWT Decoder, Hash Generator, CVE-Ignore Converter |
| **CI/CD** | GitHub Actions Validator, GitHub Actions Expression & Trigger Tester, `.env.example` Checker |
| **Scheduling** | Cron Expression Tester, Cron → systemd Converter |
| **Networking** | Subnet Calculator, CIDR / Subnet Checker, IP Address Converter, Subnet Splitter, MAC Formatter, Reverse DNS / PTR Helper |
| **Encoding** | Base64 Encoder / Decoder, Timestamp Converter |
| **Kubernetes** | Resource Calculator |
| **Logs** | Regex Log Tester |

👉 **Browse the full catalog at [opscanopy.com/tools](https://opscanopy.com/tools).**

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

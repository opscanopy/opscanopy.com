# Point fix 09 — new tools: the three the personas independently converged on

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the three highest-converged missing tools — secret scanner (3 audit votes), semantic YAML diff (2), alert latency budget (2) — each built to the four-file pattern, UX contract, and E2E gate from day one.

**Architecture:** Each child is a complete tool: `src/lib/<slug>/engine.ts` + tests, `src/components/<Name>Playground.astro` (ported from `CidrCheckerPlayground.astro`), `src/pages/<slug>.astro` + 4 locale copies, `src/data/tools.ts` registration, E2E fixture in the appropriate batch module. New tools must be born compliant — the contract-lint (08b) and fixture promotion apply from the first commit.

## Registration checklist — the four-file pattern is NOT the whole surface

Verified 2026-08-03. CLAUDE.md documents the four files plus `tools.ts`; these
additional touch points are real and two of them bite silently or loudly:

| Touch point | What happens if you skip it |
|---|---|
| `scripts/gen-tool-meta.mjs` → `TOOL_PATHS` (explicit slug → `{lib, component}` map, ~line 30) | **`npm run build` fails loudly** at `:104-110` — "N live tool(s) have no TOOL_PATHS entry". Deliberate; the map exists because naming isn't 1:1 (`cve-ignore-converter` → `cve-ignore` / `CveConverterPlayground.astro`). Add the entry in the same commit as the registry entry. |
| `npm run gen:og` | **Silent.** `scripts/gen-og-images.mjs:142` iterates `liveTools`, but `gen:og` is **not** in `prebuild`/`build`/`postbuild` — it is manual. A new tool ships with no OG card until someone runs it. Run it and commit `public/tools-og/<slug>.png`. |
| `npm run predeploy` → `check-no-placeholder.mjs` | Blocks `npm run deploy` if any `[PLACEHOLDER` sentinel reached `dist/`. Only matters if you draft page copy with the sentinel. |
| Locale pages ×4 + `src/i18n/…` strings | Missing locale page = 404 from that locale's catalog. |
| E2E fixture batch module under `tests/e2e/fixtures/` | Tool ships ungated (see 08's root-cause finding). |

**Also verified:** a new `ui.*` i18n block must be added to the field-by-field
merge in `src/i18n/pages.ts` (`getPagesContent`) or it is `undefined` in every
locale regardless of the locale files — this exact trap cost a build failure
during plan 01. Any plan here that adds shared UI strings inherits it.

**Feasibility (all three: 100% client-side, zero backend):** secret scanner = regex + entropy; YAML diff = tree walk over the existing js-yaml parse; latency budget = arithmetic.

## Children (independent; ship order = ranked value)

| Child | Tool | Registry entry |
|-------|------|----------------|
| [09a-secret-scanner.md](09a-secret-scanner.md) | `secret-scanner` | Security · "Find credentials in a config before it ships — offline, nothing uploads" |
| [09b-yaml-diff.md](09b-yaml-diff.md) | `yaml-diff` | Config · "Key-aware diff for YAML/JSON — see what actually changed between two manifests" |
| [09c-alert-latency-budget.md](09c-alert-latency-budget.md) | `alert-latency-budget` | Observability · "How long until the page? scrape → for → group_wait, worst case, computed" |

## Backlog (ranked, from the audit — record here so the next planning session starts warm)

| Tool | Votes/source | One-line feasibility note |
|------|--------------|---------------------------|
| k8s manifest validator + deprecated-API detector | platform #1 | deprecated-API table alone is a static map — shippable without full schemas; schemas lazy-fetch same-origin like jq.wasm |
| "Why is my pod Pending" scheduling explainer | platform #3 | highest leverage from owned parts (label-selector engine + quantity parser) |
| k8s Secret bulk base64 decoder | SRE #4 | trivial; the trust story is the product |
| Terraform `cidrsubnet()` evaluator | cloud #3 | pure function, pairs with plan-summarizer |
| VLSM allocation planner | cloud #2 | BigInt packing on rangeToCidrs |
| SLO burn-rate rule generator | SRE #5 | arithmetic + templating |
| RBAC `can-i` explainer | platform #5 | additive-allow model, <200 lines |
| CSP builder/analyzer | security #1 | string parsing; would have caught plan 05's own findings |
| Route-table longest-prefix-match simulator | cloud #5 | pure ip-core math |
| `curl -w` timing breakdown | SRE #8 | parse numbers, render bars |
| Semver/constraint tester (npm/Terraform/Helm) | platform #6 | pure logic |
| JSON/strategic-merge patch previewer | platform #7 | RFC 6902/7386 pure; SMP needs a patchMergeKey table |
| IAM policy evaluator (scoped v1) | platform #8 | pure logic; scope statement up front |
| MTU/MSS overlay calculator | cloud #6 | arithmetic |
| Cloud IP-range identifier | cloud #7 | needs build-time vendored ranges + "data as of" stamp |
| IPv6 address-plan generator | cloud #8 | pure |
| Multi-source log timeline merger | SRE #1 | Intl zone parsing; biggest engine of the set |
| Pod failure decoder (`kubectl describe` paste) | SRE #3 | lookup table over pasted text |
| Terraform plan attribute diffs (`before`/`after`) | 07 deferral | data already parsed, UI is the work |
| Loki LogQL via vendored WASM | 07a deferral | the jq-wasm precedent; large |

### Depth-fix backlog (existing engines — audit items too small for a child plan now, too real to lose)

| Fix | Where | Audit evidence |
|-----|-------|----------------|
| Builtin denylist for env-example-checker (`$PATH`, `$HOME`, `$CI_*`, `$GITHUB_*` → not "missing vars") | `src/lib/env-checker/engine.ts:107-108` | the one input users paste (CI scripts) is the one that maximizes noise |
| docker-run-to-compose: map the dropped flags with direct Compose keys (`--gpus`, `--device`, `--security-opt`, `--tmpfs`, `--ulimit`, `--sysctl`, `--shm-size`, `--log-driver/-opt`, `--read-only`, `--ipc`, `--pid`) | `engine.ts:506-511` default-drops them | the hard flags are exactly why someone reaches for a converter |
| terraform-plan-summarizer: accept `terraform plan -json` JSONL streams; add k8s/helm/DNS/IAM/secretsmanager rows to the blast-radius table | `detect.ts:73`, `blast-radius.ts:38-181` | CI emits JSONL; the risk table is 12/17 AWS |
| Offline "pin my toolkit" (persist chosen tool pages across deploy-scoped SW cache purges) | `scripts/sw.template.js:33-38` | every deploy purges the pages cache; the plane/air-gap case is when tools matter |
| Multi-file input mode (File System Access API — "lint my whole `.github/workflows/`") | validators generally | fully client-side; no hosted competitor can match it on trust |

## Done when

- [ ] Three tools live in `src/data/tools.ts`, pages in 5 locales, engines ≥ the RFC/vector bar of existing tests, fixtures promoted (not quarantined).
- [ ] Each announced via the changelog page like prior launches.

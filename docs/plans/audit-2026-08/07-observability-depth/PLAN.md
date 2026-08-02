# Point fix 07 — observability & platform depth: model the failure mode, not just the syntax

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Six engines stop one layer short of where their users' systems actually break. Each child closes the specific gaps a 20-year SRE/platform engineer named, or — where full fidelity is out of reach for a client-side engine — makes the limitation loud at the point of use instead of silent.

**Architecture:** Six independent children, one per engine. Every child follows the same doctrine, taken from the best code already in the repo (`alertmanager-route-tester/engine.ts:117-123` refusing un-compilable regexes loudly; `systemd-lint/calendar.ts:32-34` declining to guess; `dockerfile-linter/rules.ts:18-53` publishing its false-negative surface): **extend where feasible, refuse loudly where not, never silently narrow.**

**Tech Stack:** Pure TS, Vitest, per-tool RFC/upstream-source vectors.

## Children (independent — order by user pain)

| Child | Engine | Core deliveries |
|-------|--------|-----------------|
| [07a-alertlint.md](07a-alertlint.md) | `src/lib/alertlint/` | `alertname` in firing labels; recording-rule `labels:` merged; `keep_firing_for`; `!=` comparisons; on-playground subset disclosure; template fail-open warning |
| [07b-promql-warnings.md](07b-promql-warnings.md) | `src/lib/promql-explainer/` | A warnings channel: `histogram_quantile` without `by (le)`, `rate` range vs step sanity, counter/gauge heuristics |
| [07c-alertmanager.md](07c-alertmanager.md) | `src/lib/alertmanager-route-tester/` | `mute_time_intervals`/`active_time_intervals`; root-matcher error; rendered group key |
| [07d-k8s-calculator.md](07d-k8s-calculator.md) | `src/lib/k8s-resources/` | Manifest YAML input; multi-container + init/sidecar pod math; QoS class; quantity-parser fixes |
| [07e-gitlab-security.md](07e-gitlab-security.md) | `src/lib/gitlab-ci-validator/` | Security lane (unpinned images, secrets in variables, rules-dead-job); `spec:` header doc; needs-stage-order |
| [07f-dockerfile-rules.md](07f-dockerfile-rules.md) | `src/lib/dockerfile-linter/` | DL4006-class pipefail rule; strict profile toggle (digest pinning); DF009 value analysis via plan-09a's scanner core |

## Scope discipline

Each child lists its own **"still deliberately silent"** additions — extending an engine means extending its published false-negative list too, in the same commit. What stays out entirely:

- AlertLint full LogQL (`| json`, `| logfmt`, all range functions): a real parser-evaluator rewrite — **backlog: consider vendoring Loki's WASM the way jq was** (the jq-playground precedent says real-engine > reimplementation; that's a plan-09-scale project, not a child here). 07a's disclosure work is what makes the current subset honest in the meantime.
- PromQL execution/type checking against live data: explainer stays static analysis.
- Alertmanager `inhibit_rules`: needs a second alert set in the UI; recorded in 07c as the named next step, not built.
- Terraform plan attribute diffs (`before`/`after` rendering): genuinely valuable, but plan-09-scale UI work; the audit's other terraform holes (JSONL input, non-AWS blast radius rows) are cheap and included in the backlog table of plan 09.

## Done when

- [ ] Each child's own done-list, plus:
- [ ] Every engine's page FAQ/reference section reflects new capabilities (5 locales per CLAUDE.md).
- [ ] Every extended engine's "deliberately silent" or preview-disclosure text is updated in the same commits.

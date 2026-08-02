# Point fix 01 — auto-restore persists secrets the UI promises it doesn't

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** No tool ever writes secret-bearing input to `localStorage`, and the privacy copy matches what the code actually does — in all five locales.

**Architecture:** The auto-restore feature (`src/lib/tool-state/last-input.ts`, blob `oc-last-v1`) is opt-out-by-omission: a tool is "excluded" only by never calling `recordToolLastInput`. Two tools that handle secrets call it anyway. The fix is (a) a content-aware guard so secret-shaped pastes are never recorded regardless of which tool records them, (b) removing/gating the two offending call sites, (c) truthful privacy copy, (d) a purge affordance.

**Tech Stack:** Pure TS, Vitest. No new deps.

**Verified evidence:**

- `src/components/CertificateDecoderPlayground.astro:1431` — `if (source !== 'seed') recordToolLastInput(SLUG, value)` where `value` is the raw textarea (`:1407`), private-key blocks included. Meanwhile `src/lib/cert-chain/pem.ts:128-130` renders *"it never left this page"* on finding a `PRIVATE KEY` block. True of the network, false of the disk.
- `src/components/TerraformPlanSummarizerPlayground.astro:1562` — persists full Terraform plans (account IDs, ARNs, topology).
- `src/lib/tool-state/last-input.ts:9-12` — the "HARD-excluded" set is a doc comment naming four tools; cert-decoder and terraform postdate it.
- `src/i18n/pages/en.ts:82` — "never stored after you close the tab" contradicts `oc-last-v1` by definition; ships in de/es/fr/pt-br too.

## Children (execute in order)

| Child | Delivers | Ships alone? |
|-------|----------|--------------|
| [01a-secret-guard.md](01a-secret-guard.md) | Content-aware refusal inside `recordToolLastInput` + removal of the two bad call sites | Yes — this alone closes the HIGH finding |
| [01b-privacy-copy.md](01b-privacy-copy.md) | Truthful privacy-page copy, 5 locales, one commit | Yes |
| [01c-snapshot-purge.md](01c-snapshot-purge.md) | "Delete all saved data" purge for `oc-last-v1` + `oc-snap-v1` on /privacy | Yes |

## Done when

- [ ] Pasting a `fullchain.pem` with a key on top into the cert decoder leaves `localStorage['oc-last-v1']` without any `PRIVATE KEY` bytes (headless-Chrome verified per `.claude/skills/verify/SKILL.md`).
- [ ] `src/lib/tool-state/last-input.test.ts` covers the guard with real PEM/JWT/AWS-key vectors.
- [ ] /privacy in all 5 locales describes `oc-last-v1` truthfully and names the current exclusion policy.
- [ ] A visitor can wipe both blobs from /privacy with one click.

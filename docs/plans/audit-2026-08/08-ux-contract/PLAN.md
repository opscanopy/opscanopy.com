# Point fix 08 — UX-contract remediation: close the bimodal gap, then make it self-enforcing

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The 22 playgrounds scoring ≤3/7 against the site's own documented contract get reworked in priority order — and the E2E gate grows to cover them so drift can't recur invisibly.

**Architecture:** Two children. 08a reworks the six worst/highest-traffic playgrounds one at a time (each rework = one commit + one E2E fixture promotion, so the enforcement grows in lockstep with the fixes). 08b is the batch machinery for the remaining 16 + the small cross-cutting fixes (mislabelled `data-copy-link`, sr-only copy-status). The contract itself is already written (`CLAUDE.md` Playground UX contract) and has a named reference implementation (`CidrCheckerPlayground.astro`) — nothing here invents policy.

**Audit numbers (grep-verified across all 39 `src/components/*Playground.astro`):**

| Contract bullet | Compliant |
|---|---|
| Example chips (not `<select id="*-example">`) | 17/39 |
| Exact hint line "Results update as you type — press Enter to run now." | 18/39 |
| `data-copy-all` | 18/39 |
| `data-copy-link` | 15/39 (CidrChecker itself carries `data-copy` + label — fix in 08b) |
| Results container NOT `aria-live` | 39/39 ✓ |
| sr-only `role="status"` copy-status span | 30/39 |
| `escapeHtml` | 39/39 ✓ |

Composite: **15 at 7/7 · 2 at 6/7 · 22 at ≤3/7 — perfectly bimodal.** Root cause of invisibility: `tests/e2e/tools.fixtures.ts:141` gates on 11/39 slugs, drawn from the already-compliant set; 28 fixtures sit quarantined in `CANDIDATES`.

## Children

| Child | Delivers |
|-------|----------|
| [08a-first-six.md](08a-first-six.md) | Full rework of the 6 priority playgrounds, each promoted into the E2E `VERIFIED` gate on completion |
| [08b-batch-and-enforcement.md](08b-batch-and-enforcement.md) | Cross-cutting one-line fixes; a static contract-lint script that fails the build on regressions; remaining-16 batch schedule |

## Rework order (from the audit, reasons inline)

1. `IpConverterPlayground` — CLAUDE.md's named anti-reference, yet 5 tools deep-link into it.
2. `CronTesterPlayground` — flagship scheduler; **do together with plan 03c in one touch**.
3. `PtrHelperPlayground` — 1/7, inside the networking family where half the members are compliant.
4. `SubnetSplitterPlayground` — 1/7, emits many-row tables where missing `data-copy-all` hurts most; **after plan 02e/06a touches**.
5. `Base64Playground` — highest-intent generic utility on the site.
6. `GithubActionsExpressionPlayground` — 1/7 lowest overall: two `<select>`s, two visible live regions, paraphrased hint line.

Next band (08b batches): `HashGenerator`, `TimestampConverter`, `MacFormatter`, `RegexLogTester` (all 2/7), then the rest.

## Done when

- [ ] The six named playgrounds score 7/7 by the contract-lint script and pass their promoted E2E journeys twice with no flake (the repo's own promotion bar, `tools.fixtures.ts:150-170`).
- [ ] `data-copy-link` mislabels fixed everywhere (incl. the reference implementation).
- [ ] The contract-lint script runs in CI and fails on any new `<select id="*-example">`, missing hint line, or missing copy-status span.
- [ ] CLAUDE.md's stale counts updated (19 CM playgrounds, not 13; CidrChecker share-button caveat removed once fixed).

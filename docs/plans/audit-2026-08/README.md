# Audit 2026-08 — remediation plan tree

Source: five-persona audit (SRE, platform, cloud, security, frontend) run 2026-08-02.
Every finding referenced below was verified against the code at commit `5b186ab`.

Each numbered directory is one **point fix** with its own `PLAN.md` (the parent).
Where a fix decomposes into independently shippable pieces, the parent links to
child plans (`NNx-*.md`) in the same directory. Children are ordered: a child
never depends on a later sibling. Every plan is executable standalone by an
engineer with zero context — start at the parent, take children in order.

## Priority order

| # | Plan | Severity / class | Effort | Depends on |
|---|------|------------------|--------|------------|
| 01 | [privacy-last-input](01-privacy-last-input/PLAN.md) | HIGH — trust bug, contradicts on-screen promise | S | — |
| 02 | [ip-core-correctness](02-ip-core-correctness/PLAN.md) | HIGH — accepts invalid input, returns wrong answer | M | — |
| 03 | [cron-timezone](03-cron-timezone/PLAN.md) | HIGH — wrong answer printed as fact | M | — |
| 04 | [gha-validator-depth](04-gha-validator-depth/PLAN.md) | Depth — daily-use tool passes broken configs | M | — |
| 05 | [security-posture](05-security-posture/PLAN.md) | Site posture — CSP, disclosure, supply chain | M | — |
| 06 | [cloud-aware-networking](06-cloud-aware-networking/PLAN.md) | Credibility — usable-host counts wrong on every cloud | S | 02 |
| 07 | [observability-depth](07-observability-depth/PLAN.md) | Depth — six engines stop before the failure mode | L | — |
| 08 | [ux-contract](08-ux-contract/PLAN.md) | Debt — 22/39 playgrounds below own contract | L | 03 (cron playground rework lands there) |
| 09 | [new-tools](09-new-tools/PLAN.md) | Growth — top-3 converged missing tools | L | 02 (secret scanner reuses patterns) |
| 10 | [cross-tool-chaining](10-cross-tool-chaining/PLAN.md) | Strategic — `#doc=` handoff between tools | M | — |
| 11 | [npm-cli](11-npm-cli/PLAN.md) | Strategic — publish engines, CI parity | M | 04 (pilot ships the improved validator) |
| 12 | [quick-wins](12-quick-wins/PLAN.md) | Perf/a11y one-liners | S | 05a (CSP hashes must absorb the gtag move) |

Effort: S ≈ half a day · M ≈ 1–3 days · L ≈ a week+ (children shippable separately).

## Ground rules for every plan

- Four-file pattern per `CLAUDE.md` (engine / engine.test / Playground / page).
- Engines stay pure TS, no DOM; parsers return `null`/diagnostics, never throw.
- Any page-copy change ships to all 5 locales in the same commit.
- `npm run test` (includes `contrast.test.ts` palette gate) green before every commit.
- Playground changes verified per `.claude/skills/verify/SKILL.md` (headless-Chrome drive).
- Never `astro build` bare; `npm run build` then `npm run deploy`.

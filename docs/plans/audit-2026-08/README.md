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

## Validation status

Plan 01 was implemented 2026-08-03 (commits `946014d`…`3882fd4`). Executing it
exposed two plan defects, so plans 02–12 were then validated against the code
before any further work:

- **124 `file:line` citations resolve**; zero dangling paths, zero line numbers past EOF.
- **Plan 02's bugs re-executed** — all seven reproduce with the exact outputs now pasted into `02-ip-core-correctness/PLAN.md`.
- **Plan 08's compliance table re-derived independently** — 17/18/18/15/39/30 across 39 playgrounds, 19 CodeMirror: every number confirmed.
- **Plans 04, 05, 07, 12 spot-checked** at their load-bearing lines: all confirmed.

Corrections applied:

| Plan | Defect found | Fix |
|---|---|---|
| 03 | Assumed an exported `parse()` and `computeNextDates(expr, opts)`. Both wrong: `computeNextDates` is **private** and positional (`engine.ts:531`), `parse` is not exported, and `formatRun` is a **second** browser-local site the plan missed entirely. | 03a now carries a verified API table; all tests drive the four real exports. |
| 06 | Did not state `calculate`'s real arity. | Pinned: `calculate(input: string)` at `engine.ts:229`; trailing-optional `opts` is source-compatible. |
| 09 | Treated the four-file pattern as the whole registration surface. | Added the real checklist — `gen-tool-meta.mjs` `TOOL_PATHS` (**fails the build**), `npm run gen:og` (**silent miss**, not in the build chain), `predeploy` placeholder gate. |
| 08b | Would have shipped a lint with quote-sensitive greps. | Added the trap note: a `'Escape'` grep falsely reports 18/19 because `GitlabCiValidatorPlayground.astro:1036` uses double quotes. It is 19/19. |
| 02 | Claims were audit-sourced, not re-run. | Re-executed; verbatim outputs and the confirmed API surface pasted in. |

**Two lessons that apply to every remaining plan** — both cost real time in 01:

1. **Read the signature before writing the test.** `recordToolLastInput` lives in `wire.ts`, not `last-input.ts`; the pure choke point was `recordLastInput`. Grep `^export` in the target module first.
2. **Look for explicit registration maps.** `getPagesContent` merges `ui.*` field-by-field, so a new block is `undefined` in all five locales until it is listed there — the build caught it, but only after the work was done. `gen-tool-meta.mjs`'s `TOOL_PATHS` is the same shape.

## Ground rules for every plan

- Four-file pattern per `CLAUDE.md` (engine / engine.test / Playground / page).
- Engines stay pure TS, no DOM; parsers return `null`/diagnostics, never throw.
- Any page-copy change ships to all 5 locales in the same commit.
- `npm run test` (includes `contrast.test.ts` palette gate) green before every commit.
- Playground changes verified per `.claude/skills/verify/SKILL.md` (headless-Chrome drive).
- Never `astro build` bare; `npm run build` then `npm run deploy`.

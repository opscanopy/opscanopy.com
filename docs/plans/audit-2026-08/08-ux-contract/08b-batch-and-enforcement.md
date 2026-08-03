# 08b — cross-cutting fixes + a contract-lint that stops the drift

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or superpowers:executing-plans. Checkbox steps.

**Goal:** The one-line fixes land everywhere at once; a static lint script makes the contract self-enforcing; the remaining 16 playgrounds get a batch schedule instead of a someday.

### Task 1: cross-cutting one-liners (one commit each family)

- [ ] **`data-copy-link` mislabels** — five "Copy link" buttons carry `data-copy` instead: Cron `:162` (plan 03c takes it), PromQL `:113`, LogQL `:220`, Regex `:240`, K8s `:140`, **plus the reference implementation itself** — `CidrCheckerPlayground.astro:55` carries `data-copy=""` + `data-copy-label="Copy link"`. Change attribute → `data-copy-link`; verify the `result_copied` listener in `Layout.astro` (fires on `[data-copy]`/`[data-copy-all]`/`[data-copy-link]`) still catches all of them. Update CLAUDE.md's claim that CidrChecker satisfies every bullet — after this fix it actually does.
- [ ] **Unattributed "Copy as Markdown" buttons** — LogQL `:237`, Regex `:260`, K8s `:157` get `data-copy-all` (they copy a composite result; that's the analytics bucket they belong in).
- [ ] **sr-only copy-status spans** — add to the 9 missing (`CronTester`†, `GithubActionsExpression`†, `K8sResourceCalculator`‡, `MacFormatter`, `PromqlExplainer`, `PtrHelper`†, `RegexLogTester`, `SubnetSplitter`†, `TimestampConverter`). † = covered by 08a/03c reworks; ‡ = covered by 07d. Do the remaining four here: exact pattern from CidrChecker (one `sr-only` `role="status"` span, textContent swapped on copy success/failure).
- [ ] **Boot-seed `replaceState`** — `AlertmanagerRouteTesterPlayground.astro:1074` writes the URL on seed load, violating the "never on boot-seed" rule (CLAUDE.md deep-link section); add the `source !== 'seed'` guard other tools use. Same check across all 26 hash-writing playgrounds: `grep -n "replaceState" src/components/*Playground.astro` and eyeball each call site for a seed guard — list offenders in the commit body.
- [ ] **Unguarded `recordToolLastInput`** — `GitlabCiValidatorPlayground.astro:1136` lacks the `source !== 'seed'` guard (`DockerfileLinter:1406` has it). Add it.
- [ ] **Share-URL length caps** — `GhaValidatorPlayground.astro:922` and `GitlabCiValidatorPlayground.astro:1139` base64 whole configs into the URL with no cap; `DockerfileLinterPlayground.astro:791` has `MAX_HASH_LEN = 2000` + gate at `:1409`. Port that exact cap + the "too large to share as a link" message to both.

### Task 2: the contract-lint script

> **Quote-style trap — read before writing a single grep.** Validating this plan,
> a `key: 'Escape'` grep reported 18/19 CM playgrounds compliant and produced a
> false finding: `GitlabCiValidatorPlayground.astro:1036` binds the same thing
> with **double** quotes (`key: "Escape"`). It really is 19/19. Every marker
> below must be matched quote-agnostically (`key:\s*['"]Escape['"]`), and the
> same applies to attribute matching where Astro may emit either form. A lint
> that reports false positives gets muted, which is worse than no lint.

- [ ] **Step 1:** Create `scripts/lint-playground-contract.mjs`, same skeleton as `inject-cm-modulepreload.mjs` (discover fresh, `fail()` loudly, explain in the header what rot it prevents). Checks per `src/components/*Playground.astro`:
  - no `<select id="*-example"` (regex `/<select[^>]+id="[a-z0-9-]*example/`);
  - hint line present **byte-exact** OR file listed in `LEGACY` (see Step 2);
  - `data-copy-all` present OR in `LEGACY`/`NO_SHARE` allowlists;
  - `data-copy-link` present OR in `NO_SHARE` (with the on-page reason string required — grep for it);
  - exactly one visible `role="status"` outside `sr-only` (heuristic: count `role="status"` not preceded by `sr-only` on the same tag);
  - an sr-only copy-status span;
  - `aria-live` only on `role="status"` elements.
- [ ] **Step 2:** Seed `LEGACY` with the current 16 not-yet-reworked files — the script's job on day one is **ratchet, not red gate** (the repo's own quarantine philosophy, `tools.fixtures.ts`: "a suite that always fails stops being read"). Removing a file from `LEGACY` is each batch-rework's definition of done. `NO_SHARE` starts with `Base64Playground`, `EnvCheckerPlayground`, `JwtDecoderPlayground`, `HashGeneratorPlayground` (secret-input tools that deliberately omit share links), plus `GrafanaDashboardValidatorPlayground` (declines share with a stated reason at `:90-94`).
- [ ] **Step 3:** Wire into `npm run test` (a vitest wrapper spawning the script, or a `pretest` hook — pick whichever the repo's script style favors; it must run in CI, not just postbuild).
- [ ] **Step 4:** Commit — `feat(ci): playground contract lint — ratchet with LEGACY allowlist, fails on new drift`.

### Task 3: the remaining 16 — batch schedule

- [ ] Batch A (2/7 scorers): `HashGenerator`, `TimestampConverter`, `MacFormatter`, `RegexLogTester`. **Extra for HashGenerator (security audit):** the MD5 and SHA-1 result rows get a muted "broken for security — checksums only" caption (`engine.ts:50-51` returns them unmarked; the page copy at `hash-generator.astro:100-101` is honest but the surface users copy from says nothing). Engine adds a `deprecated: true` flag on those two rows; playground renders the caption from it.
- [ ] Batch B (observability two-panel forms — coordinate with plan 07's engine touches): `AlertLint`†, `AlertmanagerRouteTester`†, `PrometheusRelabelTester`, `PromqlExplainer`†, `LogqlPromql`. † = 07a/07c already open these files; sequence the rework into those PRs. **Extra for this batch (SRE audit):** these are Run-click-gated with zero `input` listeners — the rework adds live eval, and the two whose "Copy" copies the *input* (`AlertmanagerRouteTester:1113`, `PrometheusRelabelTester` same pattern) get result-side copy targets (matched receiver / surviving label set).
- [ ] Batch C (remainder from the ≤3/7 list): everything else still in `LEGACY` — enumerate from the lint script's output at the time, since 08a/07 will have drained some.
- [ ] Per batch: checklist from 08a → headless verify → E2E fixture promotion (the quarantined fixtures exist for all of these) → remove from `LEGACY` → one commit per tool.

### Task 4: CLAUDE.md truth sweep

- [ ] Update: CM playground count 13 → 19 (Escape binding verified in all 19 by the audit); CidrChecker share-button caveat removed (Task 1); IpConverter anti-reference paragraph softened once 08a-1 lands; add one line pointing to `scripts/lint-playground-contract.mjs` as the contract's enforcement.

**Done when** the lint script is green-with-ratchet in CI, `LEGACY` only contains not-yet-scheduled files, all six Task-1 fix families are deployed, and CLAUDE.md matches reality.

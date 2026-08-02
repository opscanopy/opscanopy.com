# 07a — AlertLint: correctness bugs first, honesty second

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or superpowers:executing-plans. Checkbox steps.

**Goal:** Fix the four outright-wrong behaviours (missing `alertname`, dropped recording-rule labels, missing `!=`, fail-open templates), add `keep_firing_for`, and put the subset disclosure inside the playground where shared links land.

**Files:**
- Modify: `src/lib/alertlint/engine.ts`, `src/lib/alertlint/examples.ts`, `src/components/AlertLintPlayground.astro`
- Test: `src/lib/alertlint/engine.test.ts`

### Task 1: `alertname` attaches to firing alerts

**Evidence:** `engine.ts:632-637` merges series labels + `rule.labels` only; `labelsEqual` (`:664-672`) demands exact key-count equality — so any real promtool test with `alertname:` in `exp_labels` fails unexplained. Prometheus attaches `alertname=<rule name>` to every alert.

- [ ] **Step 1: Failing test** — a rule `alert: HighErrorRate` whose test asserts `exp_labels: {alertname: HighErrorRate, job: api, severity: page}` must pass. Second vector: `exp_labels` *without* alertname must now FAIL (exact-match semantics preserved — promtool requires alertname listed; mirror promtool, and assert the failure message names the missing `alertname` so the user isn't left guessing).
- [ ] **Step 2:** Implement: inject `alertname: rule.alert` into the fired-alert label set at `:632-637` **before** `rule.labels` merge (rule labels may not override alertname — Prometheus wins; verify against prometheus source comment and note it inline).
- [ ] **Step 3:** Update `examples.ts:68-70` — the shipped example now includes `alertname` in its `exp_labels`, matching what users see in real promtool files.
- [ ] **Step 4:** Tests pass; commit `fix(alertlint): firing alerts carry alertname — real promtool exp_labels now match`.

### Task 2: recording rules merge `labels:`

**Evidence:** `engine.ts:828-830` compares `out.series` directly, never merging `rule.labels`; the tool's own example (`examples.ts:129-130` declares `labels: {aggregation: count5m}`, `:160` asserts a bare sample) passes *because of* the bug.

- [ ] **Step 1: Failing test** — recording rule with `labels: {aggregation: count5m}`; expected sample labels must include `aggregation="count5m"` (plus the record name), per real Prometheus output.
- [ ] **Step 2:** Implement the merge at `:828-830` (rule labels override series labels on conflict — same precedence as alerting rules; cite `prometheus/rules/recording.go`).
- [ ] **Step 3:** Fix `examples.ts:160` to assert the labelled sample. Commit `fix(alertlint): recording rules apply labels: — was silently dropped`.

### Task 3: `!=` comparisons + `keep_firing_for`

- [ ] **Step 1: Failing tests** — (a) `expr: rate(x[5m]) != 0` parses and evaluates (`CMP_RE` at `:410` lacks `!=`); (b) a rule with `keep_firing_for: 10m` is *accepted* and its semantics honestly handled: if full evaluation is out of scope, the rule must produce an explicit info diagnostic "keep_firing_for accepted but not simulated — resolution timing in this preview ignores it", never a parse error (today: zero hits for it repo-wide).
- [ ] **Step 2:** Implement: add `!=` to `CMP_RE` and the comparison evaluator; add `keep_firing_for` to the accepted rule schema + the info diagnostic path.
- [ ] **Step 3:** Commit `feat(alertlint): != comparisons; keep_firing_for accepted with a stated simulation limit`.

### Task 4: templates fail loud, not empty

**Evidence:** `engine.ts:656` returns `''` for unknown template tokens; `annotationsMatch` (`:946-954`) then fails the user's assertion with no hint the blank came from the tool.

- [ ] **Step 1: Failing test** — annotation `{{ humanize $value }}` in a rule under test → result carries a warning listing the unsupported token(s) and the annotation diff message references it ("this preview does not render `humanize` — the mismatch may be the tool's, not your rule's").
- [ ] **Step 2:** Implement: `:656` records the token into a `unsupportedTemplates: string[]` on the result instead of silently emptying; annotation-mismatch messages append the pointer when the expected/actual involved such an annotation.
- [ ] **Step 3:** Commit `fix(alertlint): unrenderable template tokens are named, not silently emptied`.

### Task 5: the disclosure moves into the playground

**Evidence:** honest "Preview Engine" callout exists on the page (`src/pages/loki-alert-rule-tester.astro:343-351`) but `AlertLintPlayground.astro` (1234 lines) contains zero limitation text — and `#s=` shared links land in the playground.

- [ ] **Step 1:** Add a permanent muted caption inside the playground results area (not a dismissible banner, not a live region): "Preview engine: supports `count_over_time`/`rate`, line filters, and `sum`/`sum by` — [full list & limits](#alertlint-limits)" anchoring to the page callout. Renders in the empty state AND above results.
- [ ] **Step 2:** Extend the page callout (`:343-351`) into the definitive supported/unsupported table — the four metric functions and four filters it has, everything it hasn't (`| json`, `| logfmt`, `absent_over_time`, aggregations beyond sum, `mute`-style features). Update the unsupported-fragment error (`engine.ts:253-259`) to link users there by name: "…Unsupported here — supported filters are |=, !=, |~, !~. See the limits table."
- [ ] **Step 3:** Locale sweep — the loki page copy change ships to all five locales in one commit.
- [ ] **Step 4:** Headless verify: load a `#s=` link → caption visible without scrolling to the page prose. Commit `docs(alertlint): subset disclosure inside the playground, definitive limits table`.

**Done when** the five commits above are in; a real promtool test file with `alertname` + recording labels passes; and no path into the playground can miss the preview disclosure.

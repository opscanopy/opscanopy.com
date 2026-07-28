# OpsCanopy tool audit — 2026-07-28

All 29 live tools audited for functional correctness and UX. **Every finding below was
independently reproduced** — a verifier had to execute the engine or drive the live page and paste
the actual command and output before a claim survived. A second agent then audited each verifier's
own work, and a third adjudicated any dispute.

## Confidence

| | |
|---|---|
| Tools covered | **29 / 29** |
| Raw claims from the audit pass | 322 |
| **Confirmed under adversarial verification** | **314** |
| Rejected as wrong | 8 |
| Verdicts disputed by the validation pass | 0 of 20 tools |
| Confirmed criticals | **11** |

**Confirmed: 11 critical · 66 high · 165 medium · 72 low.**

A 97.5% survival rate is high enough to be worth explaining. It is not a rubber stamp — verifiers
demonstrably did the work:

- They **re-graded severity downward** rather than rejecting. Of 24 raw "critical" claims, 11
  survived as critical; the rest were demoted with a written rationale. Auditors inflate severity,
  not existence.
- The validation pass **re-ran verifiers' cited commands**. One recomputed a claimed 2.52:1
  contrast ratio by hand and got 2.53. One found a `global.css` coarse-pointer rule the original
  finding had missed — which *reduced* its own tool's finding count.
- Where the spec genuinely didn't apply, claims were **rejected**: 8 of them, including two the
  auditor had graded critical.

The audit pass was run once per tool. A second independent audit pass would likely surface more,
particularly in the eight engines with no tests — absence of a finding here is not proof of
correctness.

### Method caveats, stated plainly

- The dev server died partway through the first run (a `| head -30` pipe sent SIGPIPE to
  `astro dev`), so some first-pass agents drove a dead page. This causes **under**-reporting of
  runtime-only findings, never false positives — verifiers re-drove against a healthy server.
- `slugify` lost its validator to a dropped connection. Its verifier had already written results to
  disk, and its one `high` finding was re-tested by hand (below).
- One first-run verifier (`ip-address-converter`) ran while the safety classifier was unavailable.
  Its findings are all medium/low, none security-related.

## Findings by kind

| kind | count |
|---|---|
| correctness | 157 |
| ux | 96 |
| a11y | 28 |
| mobile | 18 |
| test-coverage | 11 |
| performance | 9 |
| security | 3 |

Correctness is roughly half of everything found. This is not a polish problem.

---

## 1. Verdict

The toolset is **structurally sound but substantively unreliable in its long tail**. The simple
converters are in good shape. The complex "understand my config" tools — the actual differentiator,
and the ones carrying the strongest SEO claims — ship confidently wrong answers on ordinary input.

The single most damaging pattern: **these tools fail silently and affirmatively.** They do not error
on input they cannot handle; they emit a clean, plausible, green result that is wrong. The user gets
no signal to distrust it. That is worse than a crash, because a crash is honest.

Three of the eleven criticals are in one tool (`logql-promql-helper`), and all three are the same
defect class: the converter parses the part it understands, silently discards the rest, and labels
the result a clean mapping.

The green test suite hides all of this. `1713 passing` is inflated by `mission-sim` — a game engine,
not a tool. Eight tool engines, ~4,205 lines, have **zero tests**, and they correlate closely with
where the correctness bugs landed.

## 2. Tier list (ranked by verified severity)

**Serious problems (11)** — confirmed wrong output on ordinary, documented input
`logql-promql-helper` (3 crit) · `docker-run-to-compose` · `promql-explainer` · `subnet-splitter`
· `regex-log-tester` · `gitlab-ci-validator` · `alertmanager-route-tester`
· `github-actions-expression-tester` · `github-actions-validator` · `loki-alert-rule-tester`
· `cron-to-systemd`

**Needs work (12)** — real bugs, bounded and mostly edge-case
`reverse-dns-ptr` · `base64-encoder-decoder` · `env-example-checker`
· `kubernetes-resource-calculator` · `prometheus-relabel-tester` · `cve-ignore-converter`
· `cidr-checker` · `timestamp-converter` · `mac-address-formatter` · `cron-expression-tester`
· `jwt-decoder` · `uuid-ulid-generator`

**Solid (6)** — polish only, no critical or high defects worth scheduling
`hash-generator` · `ip-address-converter` · `case-converter` · `slugify` · `chmod-calculator`
· `subnet-calculator`

## 3. The 11 confirmed criticals

1. **`cron-to-systemd`** `engine.ts:243` — `*/N` cron steps emit `*/N` in OnCalendar. **systemd
   refuses to load the timer.** `*/N` is the most common cron idiom, and 2 of the tool's own 6
   bundled examples hit it.
2. **`logql-promql-helper`** `engine.ts:310` — everything after the outer aggregation is discarded.
   Thresholds and binary operators vanish with no note.
3. **`logql-promql-helper`** `engine.ts:451` — PromQL→LogQL deletes line filters, parser stages,
   `offset` and `@`, then the UI reports a *"clean mapping"*. Its mirror function does warn; this
   one never reads `extracted.after`.
4. **`logql-promql-helper`** `engine.ts:370` — `quantile_over_time` silently drops its quantile
   argument, emitting an invalid query in both directions.
5. **`promql-explainer`** `engine.ts:964` — parentheses are erased from the prose, so `1 - a / b`
   and `(1 - a) / b` produce byte-identical explanations. The shipped "Memory used (%)" example is
   explained backwards.
6. **`docker-run-to-compose`** `engine.ts:624` — generated healthcheck emits the `CMD-SHELL` prefix
   *inside* the string, resolving to `sh -c "CMD-SHELL redis-cli ping"` → exit 127 forever. The
   container is permanently unhealthy.
7. **`github-actions-expression-tester`** `triggers.ts:263` — a branch push wrongly triggers a
   tags-only workflow, reported as *"no filters"*. GitHub documents the exact opposite.
8. **`regex-log-tester`** `engine.ts:130` — `u` flag plus any zero-width match on astral text
   fabricates 10,000 matches with wrong indices and a 2.5 MB DOM, from a 3-character input.
9. **`alertmanager-route-tester`** `engine.ts:132` — the ReDoS heuristic false-positives on the
   shape of every ordinary host/domain-suffix matcher, silently turning valid RE2 matchers into
   "never matches" with zero warning.
10. **`reverse-dns-ptr`** `engine.ts:70` — every IPv4 prefix /1–/23 that isn't a multiple of 8
    (including RFC 1918 `172.16.0.0/12` and standard AWS /20 VPC subnets) gets a reverse zone from
    the wrong level of the tree, plus a false RFC 2317 claim.
11. **`subnet-splitter`** `engine.ts:153` — unbounded "next free" scan **hard-freezes the browser
    tab** on IPv6 input that is inside the UI's own `max="128"` constraint. No result, no error, no
    cancel; the typed allocation list is lost.

## 4. Hand-verified by the lead (independent of the agent chain)

**`timestamp-converter`** — `convert('-86400')` is detected as `"date string"`, returning ISO
`+086399-12-31T18:30:00.000Z` and *"in 84429 years"*. Correct: `1969-12-31`. Every pre-1970
timestamp is confidently wrong. `src/lib/timestamp-converter/engine.ts:40`

**`base64-encoder-decoder`** — decode unconditionally remaps `-`/`_` to `+`/`/`, so a pasted PEM's
`-----` header is swallowed. Returns `valid: true`, 73 bytes of noise, and the note *"url-safe
input detected; padding restored."* It should error. `src/lib/base64-codec/engine.ts:119`

**`regex-log-tester`** — `run('\d*','gu','a🚀b')` → `matchCount: 10000`. Without `u`: 5. Correct: 4.

**`case-converter`** — with true NFD input (a macOS paste), `Café Müller` → `["cafe","mu","ller"]`
→ `cafe_mu_ller`. Accents deleted, "Müller" split in two. Devanagari `नमस्ते विश्व` shreds into 5
tokens; pointed Hebrew into 3. NFC is handled correctly. `src/lib/case-converter/engine.ts:52`

**`slugify`** — non-decomposing Latin letters are destroyed, not transliterated:

| input | output |
|---|---|
| `Malmö østen` | `malmo-sten` — **ø deleted** |
| `Łódź` | `odz` — **Ł deleted** |
| `Straße` | `stra-e` |
| `Viðar þorn` | `vi-ar-orn` |

NFKD does not decompose these (they are distinct letters, not accented bases), so they hit the
disallowed-character regex. `src/lib/slugify/engine.ts:47`

**`promql-explainer`** — a raw **NUL byte** at offset 41086 of `engine.ts` makes ripgrep classify
the file as binary: `rg -n` returns *"binary file matches"* with zero content lines. Your Grep
tooling cannot search the largest engine in the repo. `src/lib/promql-explainer/engine.ts:1086`

## 5. Cross-cutting patterns (measured directly across all 29)

Highest-leverage fixes — one change each fixes N tools.

### 5a. The zero-test hole — 8 engines, ~4,205 lines, no test file

| engine | loc | tests |
|---|---|---|
| `promql-explainer` | 1287 | 0 |
| `alertlint` | 990 | 0 |
| `gha-validator` | 736 | 0 |
| `cron-systemd` | 569 | 0 |
| `subnet-splitter` | 218 | 0 |
| `env-checker` | 198 | 0 |
| `ptr-helper` | 124 | 0 |
| `mac-formatter` | 83 | 0 |

Token coverage on another ~2,285 loc: `cron-tester` (792 loc / 32-line test), `cve-ignore` (711/48),
`logql-promql` (596/40), `regex-tester` (186/43).

**Seven of the eleven "Serious problems" tools are in these two lists.** That correlation is the
finding.

### 5b. Two-tier codebase — the UX contract reached 8 of 29 tools

- **a11y live-region violation — 21 of 29.** The contract says the results container must *not* be
  `aria-live`, with one `role="status"` summary as the sole live region. 21 playgrounds mark the
  results **container** `aria-live="polite"` *and* carry a `role="status"` summary, so a screen
  reader re-announces the entire result block on every debounced keystroke.
  `AlertLint:214` `AlertmanagerRouteTester:190` `Base64:147` `CronTester:209` `CronToSystemd:288`
  `CveConverter:306` `DockerRunToCompose:198` `EnvChecker:198` `GhaValidator:174`
  `GithubActionsExpression:113,190` `GitlabCiValidator:174` `HashGenerator:115`
  `K8sResourceCalculator:171` `LogqlPromql:268` `MacFormatter:126` `PrometheusRelabelTester:203`
  `PromqlExplainer:160` `PtrHelper:85` `RegexLogTester:298` `SubnetSplitter:104`
  `TimestampConverter:132`
- **Live-eval hint line — 7 of 29** (`CaseConverter:55` `ChmodCalculator:139` `CidrChecker:40`
  `JwtDecoder:70` `Slugify:63` `SubnetCalculator:80` `UuidUlidGenerator:150`).
- **Examples still a `<select>` — 22 of 29**, where the contract specifies chips.
- **11 tools have none of** {hint, copy-all, copy-link}.

### 5c. The reference implementation is itself non-compliant

CLAUDE.md calls `src/components/IpConverterPlayground.astro` *"the cleanest reference implementation
to port these patterns from."* It uses `<select id="ipc-example">` at line 26 (contract says chips)
and lacks the hint line. Its `.ipc-chip` classes are **cross-tool link chips**, an unrelated
feature. Anyone following the reference reproduces non-compliant markup. Re-point the doc at
`CidrChecker` or `SubnetCalculator`, which comply.

### 5d. Analytics blind spot

`Base64Playground`'s copy button (`#b64-copy`, line 122) is not on the `data-copy` convention, so it
never fires the `result_copied` listener in `Layout.astro`. Base64 copy engagement reads as zero.

### 5e. Confirmed clean

`escapeHtml` is imported in all 29 playgrounds. Only 3 security findings across 322 claims, none a
live XSS. There is no systemic injection problem.

## 6. Remediation plan

**Wave 1 — stop shipping wrong answers (~3–4 days).** The 11 criticals in §3, plus the six
hand-verified defects in §4. Suggested order: `cron-to-systemd` and `docker-run-to-compose` first
(both emit config that a machine outright rejects, so the user hits it immediately), then
`logql-promql-helper` (3 criticals, one shared root cause: parse-what-you-know-and-drop-the-rest),
then `subnet-splitter` (a tab freeze is a total loss of work), then the rest.

Treat `cve-ignore-converter` `engine.ts:437` as higher than its `high` label: it writes a bare CVE
line into `.trivyignore` from a multi-line reason, **fabricating a suppression** and silently
widening a security policy.

**Wave 2 — close the zero-test hole (~3–4 days).** Write `engine.test.ts` for the 8 engines in §5a,
starting with the ones Wave 1 touched so fixes land with regression cover. Every finding in this
report is a ready-made test case with a known-correct expected value. This is what stops the next
round. Fix the NUL byte at the same time so the file is greppable.

**Wave 3 — UX contract back-port (~2–3 days, mechanical).** Fix §5c first so the reference is
correct, then sweep: delete `aria-live` from the 21 results containers (one line each, the single
biggest a11y win available), add the hint line, migrate `<select>` → chips, add copy affordances to
the 11 tools missing them, and put Base64's copy button on `data-copy`.

## 7. What does not need work

`subnet-calculator`, `chmod-calculator`, `ip-address-converter`, `hash-generator`, `case-converter`,
`slugify` — no criticals, at most one high each, well-tested (200–492-line suites), contract-compliant.
`ip-address-converter` finished with 0 critical / 0 high across 10 findings.

There is no security emergency.

---

# Per-tool findings

Ordered by verified severity, worst first. Within each tool, findings are ordered critical → low.
Re-graded severities are marked.


### logql-promql-helper

`3 critical / 3 high / 5 medium / 1 low`

> This tool is confidently wrong in ways that matter. The engine has zero tests for `convert()` — `engine.test.ts` imports only `encodeState`, so all 559 lines of the actual translator ship untested, and it shows. Three separate silent-truncation bugs mean the converter routinely returns a *subset* of the user's query with no error and no note: the `/ sum(...)` denominator of an error-ratio, the `> 0.2` alerting thresh

- **[CRITICAL / correctness]** `src/lib/logql-promql/engine.ts:310` — Everything after the outer aggregation is silently discarded — thresholds and binary operators vanish with no note
  - _Repro:_ convert('logql-to-promql','sum by (app) (rate({app="checkout", env="prod"} |= "error" [5m])) > 0.2'); convert('promql-to-logql','sum(rate(errors_total[5m])) / sum(rate(requests_total[5m]))'); live deep link #s=eyJkaXJlY3Rpb24iOiJsb2dxbC10by1wcm9tcWwiLCJxdWVyeSI6InN1bSBieSAoYXBwKSAocmF0ZSh7YXBwPVwiY2hlY2tvdXRcIiwgZW52PV
  - _Impact:_ peelOuterAgg computes `tail = rest.slice(close + 1).trim()` (line 310) and only consumes it if it parses as a by/without clause; any other tail is dropped on the floor at the return on line 319. An SRE converting an alerting expression gets back the bare aggregation with the threshold deleted, or an error ratio with th
  - _Fix:_ In peelOuterAgg, when `tail` is non-empty and consumeGrouping() did not consume it, return { error: … } naming the unhandled trailing expression rather than returning a prefix of the user's query as if it were the whole translation.
- **[CRITICAL / correctness]** `src/lib/logql-promql/engine.ts:451` — PromQL→LogQL ignores everything after the selector: line filters, parser stages, offset and @ are deleted and the UI says "clean mapping"
  - _Repro:_ convert('promql-to-logql','rate(http_requests_total{job="api"}[5m] offset 1h)'); convert('promql-to-logql','rate({job="api"} |= "error" [5m])'); live deep links #s=eyJkaXJlY3Rpb24iOiJwcm9tcWwtdG8tbG9ncWwiLCJxdWVyeSI6InJhdGUoaHR0cF9yZXF1ZXN0c190b3RhbHtqb2I9XCJhcGlcIn1bNW1dIG9mZnNldCAxaCkifQ and #s=eyJkaXJlY3Rpb24iOiJwcm
  - _Impact:_ promqlRangeToLogql destructures only `extracted.selector` at line 455 and never looks at `extracted.after`, unlike its mirror logqlRangeToPromql (lines 382-392) which does inspect `after` and pushes a 'Dropped the LogQL pipeline' note. Two harms: (a) a valid PromQL `offset 1h` / `@ end()` is deleted, changing what the 
  - _Fix:_ Destructure `after` from `extracted` in promqlRangeToLogql and mirror logqlRangeToPromql: push an explicit 'Dropped …' note or return an error. Separately, only emit the 'No [range] was found' note when splitRange truly found no bracket, not when a trailing offset/@ defeated the anchored regex.
- **[CRITICAL / correctness]** `src/lib/logql-promql/engine.ts:370` — quantile_over_time silently drops its quantile argument, emitting an invalid query in both directions
  - _Repro:_ convert('logql-to-promql','quantile_over_time(0.99, {app="api"} | unwrap latency [5m])'); convert('promql-to-logql','quantile_over_time(0.99, http_latency{job="api"}[5m])'); convert('promql-to-logql','quantile_over_time(0.99, http_latency[5m])'); live deep link #s=eyJkaXJlY3Rpb24iOiJsb2dxbC10by1wcm9tcWwiLCJxdWVyeSI6InF
  - _Impact:_ Both range-function tables register quantile_over_time as a plain one-arg mapping (engine.ts:201 and :220). splitRange + extractSelector then find the `{…}` block and throw away everything in `before` — which is where the `0.99,` scalar lives. quantile_over_time is mandatory-two-arg in PromQL and in LogQL, so the emitt
  - _Fix:_ Give the range-function tables an arity field. For quantile_over_time split call.body on the first top-level comma, validate the leading scalar, translate the remainder, and re-emit the scalar as the first argument of the target call.
- **[HIGH / correctness]** `src/lib/logql-promql/engine.ts:157` — Selector parsing scans for the first `}` without skipping quoted strings, so regex quantifiers in matcher values break the tool
  - _Repro:_ convert('logql-to-promql','rate({path=~"/api/v[0-9]{2}"}[5m])'); convert('promql-to-logql','rate(http_req{code=~"[45]{1}.."}[5m])'); convert('logql-to-promql','rate({msg=~".*}.*"}[5m])'); live deep link #s=eyJkaXJlY3Rpb24iOiJsb2dxbC10by1wcm9tcWwiLCJxdWVyeSI6InJhdGUoe3BhdGg9flwiL2FwaS92WzAtOV17Mn1cIn1bNW1dKSJ9
  - _Impact:_ extractSelector uses `text.indexOf('}', open)` (line 157), so the first `}` inside a quoted matcher value terminates the selector. inner becomes `path=~"/api/v[0-9]{2` and parseMatchers reports 'Unterminated quoted value'. `{n}` repetition is everyday regex and both Loki and Prometheus accept `}` inside a quoted value,
  - _Fix:_ Replace the indexOf('}') scan with a scanner that walks from `open`, tracks whether it is inside a double-quoted string (honouring backslash escapes), and only accepts a `}` seen outside quotes.
- **[HIGH / ux]** `src/components/LogqlPromqlPlayground.astro:1224` — Editing the query never invalidates the result — the output pane, notes, share link and Copy Output keep serving the previous translation
  - _Repro:_ Playwright (chrome channel, 1280x900) against http://localhost:4322/logql-promql-helper/: wait for boot, click #lp-editor-input .cm-content, Ctrl+A, type `count_over_time({job="totally-different"}[99h])`, wait 1500 ms, read #lp-editor-output / #lp-summary / #lp-notes / #lp-copy.disabled / #lp-share.dataset.copy / #lp-e
  - _Impact:_ The input EditorView has no change subscription at all — grep for `updateListener` and `docChanged` across all 1504 lines returns zero hits, and the only addEventListener calls are on #lp-example(change), the direction buttons, the mobile tabs, #lp-convert(click), root keydown (early-returns unless Ctrl/Cmd+Enter), and
  - _Fix:_ Add an EditorView.updateListener on the input view: on update.docChanged call markCustom() and either run a ~180 ms debounced convertNow() with the contract hint line 'Results update as you type — press Enter to run now.', or at minimum call resetOutput() so a stale translation can never be copied o
- **[HIGH / correctness]** `src/lib/logql-promql/engine.ts:543` — convert() never recurses: topk/bottomk/count_values and nested aggregations hard-fail despite being advertised as supported
  - _Repro:_ convert('promql-to-logql','topk(5, rate(http_requests_total[5m]))'); convert('logql-to-promql','topk(10, sum by (level) (rate({job="x"}[5m])))'); convert('promql-to-logql','sum by (job) (max by (job, instance) (rate(x[5m])))'); convert('promql-to-logql','count_values("v", up)'); live deep link #s=eyJkaXJlY3Rpb24iOiJwcm
  - _Impact:_ convert() calls translateRange(peeled.inner) at line 543, and translateRange is logqlRangeToPromql / promqlRangeToLogql, which only accept a single `fn(selector [range])` leaf — there is no recursion back into peelOuterAgg. VECTOR_AGGREGATORS (line 225) still advertises topk/bottomk/count_values, and convert() even pus
  - _Fix:_ Make the inner translation recursive (attempt peelOuterAgg on the argument) and split a leading scalar/string argument for topk/bottomk/count_values before translating the remainder. Until then, detect these shapes explicitly and return a specific message instead of the generic parse error.
- **[MEDIUM / test-coverage]** `src/lib/logql-promql/engine.test.ts:2` — convert() — the entire product — has no tests; engine.test.ts only covers the share-link encoder  _(re-graded from high)_
  - _Repro:_ Read src/lib/logql-promql/engine.test.ts (40 lines); `npx vitest run src/lib/logql-promql/engine.test.ts --root C:/Users/PUSHKAR/Desktop/my-project`.
  - _Impact:_ The only import from the engine is `encodeState` (line 2). `convert` — the 480-line translator that is the entire product — is never imported and never executed by any test. There is no regression net around the logic users consume; every correctness finding here reproduced on the first try and each would have been cau
  - _Fix:_ Add a describe('convert()') block with golden-string cases for each shape in the engine's own header docblock plus explicit negative cases: trailing binary operators/thresholds must error rather than truncate, promql→logql must note a dropped pipeline/offset, quantile_over_time must preserve its sca
- **[MEDIUM / correctness]** `src/lib/logql-promql/engine.ts:120` — Backslash escapes in matcher values are collapsed, turning `\d+` into a regex that matches the literal letter d; single-quoted and backtick values are rejected
  - _Repro:_ convert('logql-to-promql','rate({path=~"\\d+"}[5m])') with a single backslash in the query text; convert('logql-to-promql', "rate({job='api'}[5m])"); convert('logql-to-promql','rate({job=`api`}[5m])').
  - _Impact:_ parseMatchers' escape branch (lines 120-124) maps only \n and \t and otherwise emits `next` verbatim, dropping the backslash: \d -> d, \w -> w, \s -> s. A query that matched digits now matches the letter d, with no note. Prometheus itself rejects "\d" as an unknown escape, so the tool launders an obvious syntax error i
  - _Fix:_ On an unrecognised escape (anything other than \\, \", \n, \t, \r) preserve the backslash verbatim and push a note, or reject it the way Prometheus does. Accept '…' and backtick-delimited values in parseMatchers and re-emit them in the target language's preferred quoting.
- **[MEDIUM / ux]** `src/lib/logql-promql/engine.ts:517` — Any multi-line or commented query is refused, including the example the tool page itself displays with a copy button
  - _Repro:_ convert('logql-to-promql', <verbatim text of the CodeBlock at src/pages/logql-promql-helper.astro:117-120>); convert('logql-to-promql','# a comment\nrate({a="b"}[5m])'); grep the rendered page DOM for any one-line hint.
  - _Impact:_ convert() rejects on the first `\n` (line 517) before any parsing. The page renders that exact multi-line, #-commented query inside a CodeBlock whose copy button carries `data-copy={source}` (src/components/CodeBlock.astro:65) — one click to copy, and it bounces off the converter verbatim. Real PromQL and LogQL live in
  - _Fix:_ Strip full-line `#` comments and collapse interior whitespace/newlines to single spaces before the newline check, rejecting only when two independent statements remain. At minimum add a caption under the input editor stating the one-line requirement.
- **[MEDIUM / a11y]** `src/components/LogqlPromqlPlayground.astro:268` — The results container is aria-live, giving three overlapping app live regions that announce every conversion three times
  - _Repro:_ chrome --headless=new --virtual-time-budget=9000 --dump-dom http://localhost:4322/logql-promql-helper/, then count aria-live between `lp-pg` and `id="why"`.
  - _Impact:_ Directly violates the documented OpsCanopy a11y contract ('results container is NOT aria-live; a one-line role=status summary is the sole live region, plus an sr-only copy-status span'). On the default seeded conversion a screen reader is handed '2 notes' (#lp-summary), then the full ~390 characters of both note paragr
  - _Fix:_ Remove aria-live="polite" aria-atomic="false" from #lp-notes so it is an ordinary region the user navigates to. Keep #lp-summary (role=status) as the only result live region and #lp-announce as the sr-only copy-status span, matching src/components/IpConverterPlayground.astro.
- **[MEDIUM / mobile]** `src/components/LogqlPromqlPlayground.astro:53` — Example picker is a <select> instead of chips, and the direction toggle plus snapshot/share controls are under 44px on touch
  - _Repro:_ Playwright chrome, viewport 390x1700, hasTouch+isMobile; matchMedia('(pointer: coarse)').matches === true; measure getBoundingClientRect + getComputedStyle on .lp-seg__btn, #lp-example, #lp-snap-save, #lp-snap-select, #lp-share, #lp-copy-md, #lp-explain-chip, #lp-copy, #lp-convert, .lp-tab.
  - _Impact:_ The documented playground UX contract calls for 'Example chips, not a <select>' at var(--radius-pill) with 44px min-height on coarse pointers; this playground ships a <select id="lp-example"> (line 53). More importantly the direction toggle — the tool's primary control, choosing LogQL→PromQL vs PromQL→LogQL — measures 
  - _Fix:_ Replace the <select id="lp-example"> with squared example chips per src/components/IpConverterPlayground.astro, and extend the component's coarse-pointer block to give .lp-seg__btn, .lp-snap-btn, .lp-snap-delete and .lp-share-btn a 44px min-height.
- **[LOW / ux]** `src/components/LogqlPromqlPlayground.astro:75` — The primary "Copy Output" and "Copy as Markdown" buttons are invisible to the site-wide result_copied analytics
  - _Repro:_ Read src/layouts/Layout.astro:143-156 (isCopyControl) and 167-174 (the click listener that sends result_copied); grep the rendered DOM for the #lp-copy / #lp-copy-md / #lp-share tags.
  - _Impact:_ Layout's isCopyControl() matches on closest('[data-copy],[data-copy-value],[data-copy-all],[data-copy-link]'), then a className test /(^|[\s-])copy([\s-]|$)|copy-btn|-copy/, then an aria-label starting with 'copy'. #lp-copy has none of the three: class is `btn btn-secondary btn-sm lp-tap`, no data-copy* attribute, no a
  - _Fix:_ Add data-copy-all to #lp-copy and data-copy-value (or data-copy-all) to #lp-copy-md, matching the attribute contract the Layout listener and the other playgrounds use.


### docker-run-to-compose

`1 critical / 4 high / 8 medium / 1 low`

> This tool is well-engineered on the surface — a real shell tokenizer, a deterministic YAML writer, never-throw contracts, 517 lines of tests, a genuinely nice island — but the correctness layer underneath is weaker than the polish suggests, and the test suite mostly re-asserts the happy paths the author already had in mind. The single worst defect is the healthcheck emitter: every generated `healthcheck.test` carries

- **[CRITICAL / correctness]** `src/lib/docker-run-to-compose/engine.ts:624` — Generated healthcheck is broken: `test:` emits the CMD-SHELL prefix inside the string, so the container is permanently unhealthy
  - _Repro:_ runToCompose('docker run -d --name cache -p 6379:6379 --health-cmd "redis-cli ping" --health-interval 10s --health-retries 5 redis:7-alpine')
  - _Impact:_ Compose treats a STRING `test` as equivalent to ["CMD-SHELL", <string>], so the emitted `test: CMD-SHELL redis-cli ping` resolves to sh -c "CMD-SHELL redis-cli ping" -> exit 127 forever. The container never becomes healthy, depends_on: condition: service_healthy never releases, and nothing in the UI signals the problem
  - _Fix:_ Emit the list form (`test:` / `- "CMD-SHELL"` / `- <cmd>`) or the bare string with no prefix, since Compose already applies CMD-SHELL to a string. Fix the shipped redis example and the engine.test.ts assertion that locks the bug in.
- **[HIGH / correctness]** `src/lib/docker-run-to-compose/engine.ts:303` — Any long flag missing from LONG_BOOL_FLAGS eats the next token, silently making the wrong thing the image
  - _Repro:_ runToCompose('docker run --oom-kill-disable -m 100m alpine'); runToCompose('docker run --sig-proxy nginx'); runToCompose('docker run --publish-all nginx')
  - _Impact:_ LONG_BOOL_FLAGS (engine.ts:353) holds only rm, detach, privileged, interactive, tty, init, read-only. Every other unknown --flag swallows the following token. Real Docker boolean flags (--oom-kill-disable, --no-healthcheck, --publish-all, --sig-proxy, --disable-content-trust) therefore either produce a confidently-wron
  - _Fix:_ Invert the rule: keep an explicit set of VALUE-taking long flags and treat every unknown --flag as boolean. Adding the remaining Docker boolean flags to LONG_BOOL_FLAGS is a stopgap.
- **[HIGH / correctness]** `src/lib/docker-run-to-compose/engine.ts:185` — `-c` (--cpu-shares) and `-a` (--attach) are not in SHORT_VALUE_FLAGS, so their value becomes the image
  - _Repro:_ runToCompose('docker run -d -c 512 --name web nginx:alpine'); runToCompose('docker run -a stdout alpine echo hi')
  - _Impact:_ Docker's value-taking short flags are a, c, e, h, l, m, p, u, v, w. The set omits a and c, so `-c 512` leaves 512 as the first positional: the service gets image: "512", --name and the real image are demoted to command arguments, and the UI shows the non-error "2 notes" state. Neither note mentions that the image was d
  - _Fix:_ Add 'a' and 'c' to SHORT_VALUE_FLAGS, and warn loudly when an unmapped short flag is followed by a bare token.
- **[HIGH / correctness]** `src/lib/docker-run-to-compose/engine.ts:566` — A newline inside a quoted value produces unparseable YAML, reported as "Converted"
  - _Repro:_ runToCompose('docker run -e "MOTD=line one\nline two" nginx') with a real LF inside the double-quoted value
  - _Impact:_ needsQuote() only tests LEADING/TRAILING whitespace, so an embedded LF never triggers quoting, and quoteScalar escapes only backslash and double-quote. The raw newline lands at column 0 of the document and the emitted docker-compose.yml does not parse -- while the tool reports success. Any multi-line value (MOTD, PEM k
  - _Fix:_ Make needsQuote return true for /[\n\r\t]/ and have quoteScalar emit YAML escapes (\n, \r, \t) alongside backslash and quote.
- **[HIGH / correctness]** `src/lib/docker-run-to-compose/engine.ts:747` — Compose mapping-form `networks:`/`extra_hosts:` are joined with `=`, producing docker flags Docker rejects
  - _Repro:_ composeToRun on a service with networks: {backend: {aliases: [web]}}, and on one with extra_hosts: {somehost: 162.242.195.82}
  - _Impact:_ toItems() applies the environment/labels KEY=value join to every mapping, including networks and extra_hosts. The mapping form of networks (with aliases/ipv4_address) is standard in real Compose files and yields --network backend= (strOf of the aliases sub-mapping is ''), which fails with `network backend= not found`. 
  - _Fix:_ Give toItems a per-key join strategy: networks -> mapping keys only; extra_hosts -> join with ':'; keep '=' for environment/labels. Warn when a mapping value carries sub-keys (aliases, ipv4_address) that docker run cannot express.
- **[MEDIUM / ux]** `src/components/DockerRunToComposePlayground.astro:803` — Live conversion flashes a red error card mid-typing; the required hint line is missing and the debounce is 300ms
  - _Repro:_ Load http://localhost:4322/docker-run-to-compose/#s=<state for an incomplete command> and grep the rendered DOM; grep the same dump for the contract hint string.
  - _Impact:_ Violates three parts of the CLAUDE.md playground UX contract at once: no "Results update as you type" hint (so the live behaviour reads as a glitch), a 300ms debounce well outside the 130-220ms band the reference playgrounds use, and no calm-error hold -- the updateListener (line 833) schedules run() on every doc chang
  - _Fix:_ Bring the debounce into the 130-220ms band, add the exact hint line under the editor, and hold error rendering until ~600ms idle / blur / explicit Convert, keeping the last good result visible meanwhile.
- **[MEDIUM / a11y]** `src/components/DockerRunToComposePlayground.astro:198` — The results container is itself aria-live, and the island has four competing live regions
  - _Repro:_ grep the rendered DOM of http://localhost:4322/docker-run-to-compose/ for id="drc-*" attribute strings
  - _Impact:_ The CLAUDE.md a11y contract states the results container is NOT aria-live and that a one-line role="status" summary is the sole live region, plus an sr-only copy-status span. Here #drc-output (wrapping the whole multi-line YAML <pre>) is aria-live, and #drc-warnings, #drc-status and #drc-announce are all additionally a
  - _Fix:_ Remove aria-live/aria-atomic from #drc-output and role="status"/aria-live from #drc-warnings. Keep #drc-status as the single live summary and #drc-announce as the sr-only copy status.
- **[MEDIUM / mobile]** `src/components/DockerRunToComposePlayground.astro:231` — Primary touch targets in the toolbar are 26-36px tall on coarse pointers
  - _Repro:_ Read the component's <style> block and grep every @media (pointer: coarse) rule that could apply, in the component and in src/styles/global.css.
  - _Impact:_ The mode switch -- the control that decides which direction the tool converts -- computes to 16px line-height + 2x5px padding = 26px, with two such targets adjacent. .drc-select is height:32px, .drc-snap-btn and .drc-snap-select are height:30px, .drc-snap-delete is 28x28. A mis-tap on the mode switch calls setMode(), w
  - _Fix:_ Add a @media (pointer: coarse) block giving .drc-mode, .drc-select, .drc-snap-btn, .drc-snap-select and .drc-snap-delete min-height: 44px, and raise .drc-share-btn from 36px to 44px.
- **[MEDIUM / correctness]** `src/lib/docker-run-to-compose/engine.ts:862` — A multi-service Compose file is converted using only the first service, with zero warnings  _(re-graded from high)_
  - _Repro:_ composeToRun on a three-service file (web: nginx:alpine, db: postgres:16, cache: redis:7)
  - _Impact:_ Downgraded from high: the command produced for the first service is CORRECT, and the page FAQ does state the limitation. The real defect is the missing runtime signal -- the engine warns about far smaller drops (--rm, -d, unmapped flags, unmappable long-form ports) but says nothing when two entire services vanish, so a
  - _Fix:_ When Object.entries(doc.services).length > 1, push a warning naming the skipped services, or emit one docker run line per service.
- **[MEDIUM / correctness]** `src/lib/docker-run-to-compose/engine.ts:112` — Backslashes in Windows volume paths are silently eaten, corrupting the bind mount  _(re-graded from high)_
  - _Repro:_ runToCompose('docker run -v C:\\Users\\me\\app:/app nginx')
  - _Impact:_ Downgraded from high: the tokenizer is POSIX-FAITHFUL here -- bash would eat those backslashes too, and the page documents "A POSIX-aware tokeniser splits the line". But the realistic paste source on Windows is PowerShell/cmd, where '\' is literal, and the tool gives zero signal: the mount source silently becomes C:Use
  - _Fix:_ Keep the tokenizer POSIX-pure but push a warning whenever a backslash escape is consumed inside a -v/--volume/--mount value, or detect a drive-letter token (/^[A-Za-z]:\\/) and preserve the backslashes verbatim.
- **[MEDIUM / correctness]** `src/lib/docker-run-to-compose/engine.ts:518` — `--mount type=tmpfs` is converted to a persistent anonymous volume with no warning
  - _Repro:_ runToCompose('docker run --mount type=tmpfs,target=/tmp nginx')
  - _Impact:_ mountToVolume parses the type= key into rawKey but never reads it, so tmpfs, volume and bind all collapse to the same source:target short form. An in-memory, wiped-on-stop tmpfs becomes a disk-backed anonymous volume that survives restarts -- the opposite durability guarantee, and a real problem when the tmpfs holds cr
  - _Fix:_ Read type= in mountToVolume: map type=tmpfs to a Compose tmpfs: list entry instead of volumes:, and warn for any type the short form cannot express (npipe, cluster, bind-propagation options).
- **[MEDIUM / correctness]** `src/lib/docker-run-to-compose/engine.ts:744` — Long-syntax `env_file:` entries are silently dropped, taking the whole environment with them
  - _Repro:_ composeToRun on a service with env_file: [{path: ./default.env, required: true}]
  - _Impact:_ toItems maps array items through strOf, which returns '' for a record, and the .filter(s => s !== '') then removes it. The Compose 2.24+ long env_file syntax vanishes without a trace, so the reconstructed command starts the container with none of its configuration. Any array-of-mappings under environment/labels/network
  - _Fix:_ In toItems, when an array item is a record, map the known shape (env_file -> item.path) or push a warning instead of filtering it to nothing -- mirror what toMappingItems already does.
- **[MEDIUM / correctness]** `src/lib/docker-run-to-compose/engine.ts:948` — String-form `entrypoint:` is passed whole to --entrypoint, producing a command docker cannot exec
  - _Repro:_ composeToRun on services: {web: {image: nginx, entrypoint: "/bin/sh -c 'echo hi'"}}
  - _Impact:_ docker CLI wraps --entrypoint's value in a single-element StrSlice, so the whole string is treated as one executable path and the container fails with `stat /bin/sh -c 'echo hi': no such file or directory`. The ARRAY branch two lines above already does the right thing (first element to --entrypoint, remainder after the
  - _Fix:_ Shell-split the string entrypoint like the array branch: first token to --entrypoint, remainder appended after the image. For string commands, shell-split into argv to match Compose, or keep the sh -c wrapper and warn that a shell was introduced.
- **[LOW / ux]** `src/components/DockerRunToComposePlayground.astro:1124` — After a failed conversion the Copy button copies your input while announcing that the output was copied
  - _Repro:_ Reach any error state (e.g. the deep link #s= for 'docker run -p 80:80 ', which renders "No image found"), then click Copy.
  - _Impact:_ run()'s failure paths set lastOutput = '' (lines 1072/1086/1100) but never disable the Copy button, so `lastOutput || view.state.doc.toString()` falls back to the raw editor text: the user pastes their own docker run line into a docker-compose.yml, and a screen-reader user is told "Converted output copied to your clipb
  - _Fix:_ Disable Copy (or make it a no-op with a "Nothing to copy yet" status) whenever lastOutput is empty, and add data-copy-all so the result_copied listener matches it.


### promql-explainer

`1 critical / 4 high / 6 medium / 4 low`

> This tool is well-built at the shell level and dangerously wrong at the core. The infrastructure is solid: escapeHtml covers every injected value (no XSS — I probed `up{job="<img src=x onerror=alert(1)>"}` and it renders escaped), the CodeMirror Escape tab-trap fix is present, the engine genuinely never throws (20k-term or-chains, 200k digit runs, 20k nested parens and 5k nested calls all return cleanly in under 130m

- **[CRITICAL / correctness]** `src/lib/promql-explainer/engine.ts:964` — Parentheses are erased from the prose — different arithmetic produces byte-identical explanations, and the shipped "Memory used (%)" example is explained backwards
  - _Repro:_ Live drive, http://localhost:4322/promql-explainer/#q=(1%20-%20a)%20%2F%20b vs #q=1%20-%20a%20%2F%20b. BOTH render the identical string: "The scalar 1, then subtracts the current value of the `a` metric, then divides that by the current value of the `b` metric." In-engine `explain('1 - a / b').explanation === explain('
  - _Impact:_ The whole product promise is "read what the query actually does". A user reading the explanation of any query mixing precedence levels gets the wrong order of operations, with no signal that grouping was lost. Two queries that compute different numbers are described with the same sentence, so the tool cannot be used to
  - _Fix:_ renderBinary must parenthesise a nested binary operand instead of flattening it: when node.left or node.right is a BinaryNode (or a ParenNode wrapping one) whose precedence differs, render it as a bracketed sub-clause, e.g. "the result of (<inner>)". Restore the 'paren' case in renderNode to emit an
- **[HIGH / correctness]** `src/lib/promql-explainer/engine.ts:1149` — `without(labels)` breakdown row states the exact opposite of PromQL semantics and contradicts the prose in the same card  _(re-graded from critical)_
  - _Repro:_ Live drive http://localhost:4322/promql-explainer/#q=sum%20without(pod)%20(container_memory_usage_bytes) renders a card whose prose says "...grouped by everything except `pod`..." (correct) directly above a breakdown row reading exactly: `without(pod)` | "Aggregates away all labels except `pod`." PromQL `without(pod)` 
  - _Impact:_ The page's own FAQ sells the tool as a teaching aid ("Can I use it to learn PromQL? Yes... every clause is named and described"). A learner reading the token legend is taught the inverse of `without`, the single most commonly confused PromQL aggregation modifier. It also self-contradicts the prose two lines above it, s
  - _Fix:_ Swap the wording: for grouping === 'without' the row should read "Aggregates away the `<list>` label(s); every other label is kept." Add a golden test asserting `sum without(pod) (x)` produces a prose clause and a breakdown row that agree.
- **[HIGH / correctness]** `src/lib/promql-explainer/engine.ts:939` — topk / bottomk / limitk / count_values are described as "collapsing every series into a single result" when they return many series
  - _Repro:_ Live drive http://localhost:4322/promql-explainer/#q=topk(3%2C%20node_memory_MemFree_bytes) renders: "Keeps the 3 series with the largest values, collapsing every series into a single result, taken from the current value of the `node_memory_MemFree_bytes` metric." (summary: "3 parts"). Same for `bottomk(3, x)`, `limitk
  - _Impact:_ Self-contradictory in a single sentence ("keeps the 3 series ... collapsing every series into a single result") and factually wrong: ungrouped topk returns k series, count_values returns one series per distinct sample value. A user checking whether their dashboard panel will show one line or k lines gets the wrong answ
  - _Fix:_ Pass the aggregation name into groupingClause and branch: for topk/bottomk/limitk/limit_ratio the ungrouped clause is ", across all series (no grouping)"; for count_values it is ", emitting one series per distinct value". Keep ", collapsing every series into a single result" only for the genuinely c
- **[HIGH / correctness]** `src/lib/promql-explainer/engine.ts:1271` — checkBalanced ignores `#` comments, so an apostrophe or bracket in a comment fires a bogus error that throws away the correct explanation
  - _Repro:_ Live drive http://localhost:4322/promql-explainer/ with #q=sum(rate(http_requests_total%5B5m%5D))%20%23%20the%20api%20team's%20dashboard renders the red error card: title "Could not explain this query", detail "Unterminated string literal — check your quotes.", summary "Error". The engine had already parsed it perfectl
  - _Impact:_ The tokenizer deliberately supports `#` comments (engine.ts:95-98), so pasting a commented alert rule or recording rule — the stated use case, "reviewing a teammate's alert rule" — is a supported path. Any English apostrophe ("team's", "don't", "it's") or stray bracket in that comment turns a perfectly good explanation
  - _Fix:_ Make checkBalanced skip `#`-to-end-of-line runs exactly as tokenize() does, before its quote/bracket bookkeeping. Separately, renderResult should render the explanation alongside a soft warning when result.error is set but result.explanation is non-empty, instead of discarding a successful parse — t
- **[HIGH / correctness]** `src/lib/promql-explainer/engine.ts:646` — Subquery `[range:step]` applied to a function call is silently dropped from both the prose and the breakdown
  - _Repro:_ Live drive http://localhost:4322/promql-explainer/#q=max_over_time(rate(http_requests_total%5B5m%5D)%5B1h%3A1m%5D) renders: "Takes the maximum sample value within the range, per series, applied to computes the per-second average rate of increase over the range — the standard way to turn a counter into a rate, applied t
  - _Impact:_ The ParenNode is constructed with no range or step field, so the comment's "carrying range" is false — the data is discarded. The user reads "maximum ... within the range" and the only range shown is 5m, so they conclude the max is over 5 minutes when it is over 1 hour sampled every minute. That is a wrong answer about
  - _Fix:_ Add a dedicated SubqueryNode (or give ParenNode optional range/step fields and actually populate them in attachRange) so the renderer can emit "...evaluated as a subquery over the last 1 hour at a 1 minute step" and buildBreakdown can push a `[1h:1m]` row. The describeSelector subquery wording at en
- **[MEDIUM / a11y]** `src/components/PromqlExplainerPlayground.astro:160` — Results container is an aria-live region (contract forbids it), giving screen readers two competing live regions and no copy confirmation
  - _Repro:_ Rendered DOM from the live page confirms `id="pq-results" class="pq-results" aria-live="polite" aria-atomic="false"` alongside `<span id="pq-summary" ... role="status" aria-live="polite">7 parts</span>` at line 152-157. Reference implementation src/components/IpConverterPlayground.astro:153 is `<div id="ipc-results" cl
  - _Impact:_ Every explain re-announces the full explanation (the seeded example is a 75-word sentence) plus all 7-8 breakdown rows, on top of the "7 parts" summary — two announcements racing on every run. The Copy link / Copy as Markdown buttons only swap their own visible label to "Copied", which is not in any live region, so a s
  - _Fix:_ Remove aria-live/aria-atomic from #pq-results, leaving #pq-summary as the sole live region. Add `<span id="pq-copy-status" class="sr-only" role="status" aria-live="polite">` and write "Link copied" / "Markdown copied" into it from the two click handlers.
- **[MEDIUM / ux]** `src/components/PromqlExplainerPlayground.astro:956` — No live evaluation, no debounce, and no run hint — Enter in the editor does nothing and the required hint line is absent
  - _Repro:_ Those two handlers plus select.change, shareBtn.click, mdBtn.click and wireSnapshotUI are the complete event surface of the script — there is no CodeMirror updateListener and no input/debounce anywhere in the file. Grepping the components directory for the contract hint string "Results update as you type — press Enter 
  - _Impact:_ Contract violation, and a real dead end on touch: the ⌘/Ctrl+Enter affordance is hidden below 640px and unreachable without a hardware keyboard, so a phone user must find and press the Explain button after every single edit. Typing a query and pressing Enter — the reflex the other nine playgrounds train — inserts a new
  - _Fix:_ Add a CodeMirror EditorView.updateListener that fires explainNow(true) on a single ~180ms debounce, and render the exact hint line "Results update as you type — press Enter to run now." as a muted caption under the editor. Keep Ctrl/Cmd+Enter as the run-and-blur shortcut.
- **[MEDIUM / ux]** `src/components/PromqlExplainerPlayground.astro:864` — Example picker is forced to index 0 even when the editor was seeded from a deep link or restored input, making that example unloadable
  - _Repro:_ Mobile screenshot at --window-size=390,1900 of http://localhost:4322/promql-explainer/#q=topk(5,%20sum%20by(pod)%20(rate(container_cpu_usage_seconds_total%7Bnamespace%3D%22prod%22%7D%5B5m%5D))) shows the editor holding the topk query while the EXAMPLE dropdown displays "p95 request latency (histogra…". The seed at line
  - _Impact:_ Two failures from one line. The picker lies about what is loaded on every shared link and on every return visit where a last input was restored (getRestoredLastInput, line 845). Worse, example 1 becomes permanently unloadable in that session — the user clicks it, nothing happens, and the only escape is to hand-clear th
  - _Fix:_ Only set select.value='0' when the editor was actually seeded from examples[0]; otherwise set select.selectedIndex = -1 (as the snapshot restore path already does at line 974). Optionally match the seeded text against the example list and select the matching option.
- **[MEDIUM / mobile]** `src/components/PromqlExplainerPlayground.astro:35` — Example picker is a <select> rather than the contract's squared chips, and is 32px tall on coarse pointers
  - _Repro:_ Line 35 renders a <select>; the .pq-select rule at line 179-197 fixes height:32px with no `@media (pointer: coarse)` override anywhere in the <style> block (the only coarse rule in the file is `.pq-share-btn { min-height: 36px }` at line 358-363, itself under the 44px minimum). The mobile screenshot at 390px wide shows
  - _Impact:_ Violates the playground UX contract, which specifies example chips at var(--radius-pill) with 44px min-height on (pointer: coarse). On a phone the five examples are hidden behind a native picker whose label is truncated mid-word, so the user cannot see what the options are without opening it, and both the picker and th
  - _Fix:_ Replace the <select> with the chip row from IpConverterPlayground.astro (squared 6px chips, canvas bg, hairline shadow, brand-strong text, active = brand-soft bg + inset brand ring) and add `@media (pointer: coarse) { min-height: 44px }` to the chips and to .pq-share-btn.
- **[MEDIUM / test-coverage]** `src/lib/promql-explainer/engine.ts:1203` — Zero tests: the engine ships with no engine.test.ts, and five confirmed wrong-answer bugs would each be caught by one assertion
  - _Repro:_ `ls src/lib/promql-explainer/` returns exactly engine.ts, examples.ts, types.ts — there is no engine.test.ts, against a project convention (CLAUDE.md: "Tests live at src/lib/<tool>/engine.test.ts ... New engines should be test-driven") that 20+ sibling engines follow. A single golden-output test over the five entries i
  - _Impact:_ A 1,288-line hand-written tokenizer + recursive-descent parser + prose renderer with no regression net. Every finding in this report is a silent behaviour change away from recurring, and the engine's own examples.ts docstring claims each bundled query "produces a sensible inside-out explanation" — a claim nothing verif
  - _Fix:_ Add src/lib/promql-explainer/engine.test.ts with (a) a snapshot/golden assertion per entry in examples.ts, (b) precedence pairs asserting explain('1 - a / b') !== explain('(1 - a) / b'), and (c) targeted assertions for without(), topk grouping text, subquery retention, and comment handling.
- **[MEDIUM / ux]** `src/lib/promql-explainer/engine.ts:595` — Grafana template variables in a range vector fail with a diagnostic that does not name the real problem
  - _Repro:_ explain('rate(x[$__rate_interval])') returns error "Expected a closing “]” for the range." with explanation "OpsCanopy could not fully parse this query. Check for balanced brackets, matching quotes, and a complete expression, then try again." Same for `rate(x[$interval])` and `sum(rate(x[$__rate_interval]))`. The `]` i
  - _Impact:_ `[$__rate_interval]` is Grafana's documented idiom and is present in most panel queries an operator would copy out of a dashboard — precisely the paste the page invites ("paste an example from a runbook or dashboard"). The message tells them to check a bracket that is already there, so the user has no path forward. The
  - _Fix:_ In parsePostfix, detect a `$`-prefixed token inside the range brackets and either substitute a placeholder duration (explaining "a Grafana template variable — the actual window is resolved by the dashboard") or return the specific error "`$__rate_interval` is a Grafana template variable, not a PromQ
- **[LOW / correctness]** `src/lib/promql-explainer/engine.ts:925` — Negative offset renders the self-contradictory phrase "shifted back in time by 5 minutes in the future"
  - _Repro:_ explain('x offset -5m') returns explanation "The current value of the `x` metric, shifted back in time by 5 minutes in the future." and breakdown row `offset -5m` | "Shifts the lookup back in time by 5 minutes in the future." A negative offset shifts the lookup FORWARD, not back.
  - _Impact:_ humanDuration's "in the future" suffix is bolted onto a sentence that has already hard-coded "back in time", producing a phrase that reads as nonsense. A user checking the direction of a negative offset — the only reason to write one — cannot tell which way the window moves.
  - _Fix:_ Have describeSelector branch on the sign: `s.offset.startsWith('-')` → ", shifted forward in time by <abs duration>", else ", shifted back in time by <duration>". Drop the "in the future" suffix from humanDuration and let callers own the direction wording.
- **[LOW / ux]** `src/lib/promql-explainer/engine.ts:912` — Markdown backticks from the engine leak into the rendered prose as literal characters
  - _Repro:_ The seeded example's rendered explanation in the live DOM is: "...grouped by `le` (one result per distinct combination of those labels), over computes ... applied to the values of the `http_request_duration_seconds_bucket` metric over the last 5 minutes..." — the backticks are literal text inside <p class="pq-explanati
  - _Impact:_ Every explanation and several breakdown rows the tool produces contain stray backtick characters, on a page whose selling point is polished plain English. It reads as a rendering bug. It also makes the on-screen text differ from the Copy-as-Markdown output's intent.
  - _Fix:_ Either strip the backticks in the engine and let the playground wrap metric/label names in <code> (splitting on the delimiter before escaping each segment), or drop the markdown decoration from the prose strings entirely and keep code styling to the breakdown token column.
- **[LOW / correctness]** `src/lib/promql-explainer/engine.ts:775` — Prometheus 3 UTF-8 quoted metric names are silently dropped, yielding a generic explanation and an empty breakdown
  - _Repro:_ explain('{"http.requests.total"}') returns no error, explanation "The current value of the time series." and an EMPTY breakdown array. explain('{"http.requests.total", job="api"}') returns "The current value of the time series where job equals \"api\"." — the metric name has vanished entirely, with no warning.
  - _Impact:_ Valid Prometheus 3.x syntax is accepted and explained as if no metric had been named. The user gets a confident, wrong answer ("the time series") plus a blank legend rather than an error telling them the syntax is unsupported — the worst of both options.
  - _Fix:_ In parseMatchers, treat a leading string token with no following matcher operator as the metric name and assign it to the SelectorNode's metric field (unquoted), so describeSelector and buildBreakdown report it like any other metric name.
- **[LOW / correctness]** `src/lib/promql-explainer/engine.ts:1086` — A raw NUL byte is embedded in engine.ts source, making the file unsearchable by ripgrep and the project's Grep tooling
  - _Repro:_ `python -c "b=open('src/lib/promql-explainer/engine.ts','rb').read(); print([i for i,c in enumerate(b) if c==0])"` prints [41086], inside the buildBreakdown dedup key template at line 1086. Consequently every ripgrep query against this file returns only "binary file matches (found \"\\0\" byte around offset 41086)" — t
  - _Impact:_ Maintainer-facing, not user-facing: nobody can grep the largest file in this tool, which is how the rest of the codebase is navigated. Any editor, formatter, or pre-commit hook that normalises control characters would silently rewrite the dedup separator and change breakdown de-duplication behaviour, with no test to ca
  - _Fix:_ Replace the literal NUL with an escape sequence in the template literal: const key = `${token}\\u0000${meaning}`; — identical runtime behaviour, but the file becomes plain text again.


### subnet-splitter

`1 critical / 4 high / 7 medium / 2 low`

> The core VLSM maths is sound — I verified the page's own two worked examples against the engine (10.0.0.0/24 minus 10.0.0.0/26 + 10.0.0.128/26 → 10.0.0.64/26 + 10.0.0.192/26; minus /25 + /27 → 10.0.0.160/27 + 10.0.0.192/26), plus free/used/partial classification, host-bit normalisation (10.0.0.37/24 → 10.0.0.0/24), allocations that straddle or contain the parent, wrong-family lines, IPv6 :: compression, and the 2^53 

- **[CRITICAL / performance]** `src/lib/subnet-splitter/engine.ts:153` — Unbounded "next free" scan hard-freezes the tab on reachable IPv6 input
  - _Repro:_ Parent 2001:db8::/32, "Split into /" = 128, allocated 2001:db8::/33. The playground's own guard only rejects newPrefix <= parentPrefix (128 > 32), so engine.split() runs on the main thread; totalCount = 2^96, the capped first loop marks all 256 blocks 'used', and the uncapped rescan at engine.ts:153-162 then steps one 
  - _Impact:_ The browser tab is permanently unresponsive — no result, no error, no cancel — and the typed allocation list is lost on force-close. Every value is inside the UI's own constraints (the prefix input carries max="128"). Milder variants (parent /32 into /64 with the first half allocated) still block the main thread for mi
  - _Fix:_ Bound the rescan to a fixed iteration budget (e.g. 1e6) and return nextFree: null plus a nextFreeTruncated flag; better, walk the merged `free` intervals and align the first candidate up to a newPrefix boundary — O(free.length) instead of O(2^(newPrefix-parentPrefix)).
- **[HIGH / correctness]** `src/lib/subnet-splitter/engine.ts:204` — Large address counts are reported at half their true size (fmtCount floors log2)
  - _Repro:_ split('2001:db8::/32','2001:db8::1/128', null).stats — free is 2^96-1 but renders as "≈2^95". floorLog2 returns bitLength-1, so every non-power-of-two count is floored to the next power of two below it: a systematic 2x understatement.
  - _Impact:_ The one-line summary self-contradicts: "total 2^96 · used 1 · free ≈2^95", and "used 0% · ≈2^79 free" for a /48 that holds 2^80 addresses. A user reading the free figure concludes half the block is gone when one /64 out of 65,536 is allocated.
  - _Fix:_ Round to the nearest power of two rather than flooring, or emit a mantissa (≈7.9×10^28). Pin the /32-minus-one-/128 case in a test.
- **[HIGH / correctness]** `src/components/SubnetSplitterPlayground.astro:535` — Truncated split reports the wrong subnet count: head says "256 subnets", banner says "256 of 256+"
  - _Repro:_ Parent 10.0.0.0/16, split /25. `const totalCount = split.subnets.length` reads the already-capped list (engine CAP = 256n at engine.ts:136-138), so both the block head and the truncation banner report 256 when the true count is 512.
  - _Impact:_ The page's own FAQ (src/pages/subnet-splitter.astro:60) tells users to read counts off this tool — "You can verify this by entering 10.0.0.0/16 with a split prefix of /24 and seeing all 256 blocks listed". At /25 the tool answers 256 when the answer is 512, and the banner degenerates to "256 of 256+" because both numbe
  - _Fix:_ Return the real total from the engine (add `total: string` to SplitSection) and render "Showing first 256 of 512 subnets" plus a truthful head count. Replace the `dark:` variants with Field Manual tokens re-pointed in global.css.
- **[HIGH / a11y]** `src/components/SubnetSplitterPlayground.astro:104` — Results container is aria-live, creating a second live region that re-announces every row
  - _Repro:_ The rendered DOM contains both `<span id="spl-summary" role="status" aria-live="polite">` and `<div id="spl-results" class="spl-results" aria-live="polite" aria-atomic="false">`. renderResult replaces container.innerHTML wholesale on every 220 ms debounce.
  - _Impact:_ Directly violates the playground UX contract ("results container is NOT aria-live; a one-line role=status summary is the sole live region"). A screen-reader user gets the whole result queued on every keystroke — 257 rows in the shipped /16→/24 example, 6,972 rows in the 500-line paste case. There is also no sr-only cop
  - _Fix:_ Remove aria-live/aria-atomic from #spl-results; keep #spl-summary as the single role=status region and extend its text to carry the headline; add the required sr-only copy-status span.
- **[HIGH / ux]** `src/components/SubnetSplitterPlayground.astro:576` — No way to get the results out — zero copy buttons, no Copy all, no Copy link, no shareable hash
  - _Repro:_ renderResult writes plain rows with no copy affordances. Querying the live playground root: 0 [data-copy], 0 [data-copy-all], 0 [data-copy-link], 0 .sr-only; the only buttons are "Save snapshot" and the snapshot delete "×". location.hash stays '' after a valid eval.
  - _Impact:_ The tool's deliverable is a list of CIDR strings destined for Terraform or an IPAM ticket, and the only way to extract them is hand-selecting across a result region measured at 9,765 px (256-subnet example) to 258,044 px. The result_copied analytics listener in Layout.astro can never fire here, and no split can be shar
  - _Fix:_ Port the copy plumbing from IpConverterPlayground.astro: per-row data-copy icon buttons with the execCommand fallback and 44px coarse targets, a data-copy-all button per block, an sr-only copy-status span, and a data-copy-link button hidden until valid; write the hash via the Safari-guarded replaceS
- **[MEDIUM / correctness]** `src/lib/subnet-splitter/engine.ts:128` — An out-of-range split prefix is silently ignored — no split section, no error  _(re-graded from high)_
  - _Repro:_ split('10.0.0.0/24','',48) returns valid:true, error:undefined, split:null. The prefix input's own max is 128, so the browser accepts 48 for an IPv4 parent; the playground guard at line 659 only catches newPrefix <= parentPrefix. Same silent drop for /33..128 on IPv4, for NaN, and for a bare-address parent (10.0.0.0 pa
  - _Impact:_ The user typed a split prefix, the page re-rendered, and nothing says the request was thrown away. Contract requires specific diagnostics; silence is worse than a generic message. Downgraded from high because the rest of the output (free space, allocations, summary) is correct and the absence of the "Split into /N" blo
  - _Fix:_ Have the engine return a splitError (e.g. "A /48 split is not possible inside an IPv4 /24 — choose a prefix between /25 and /32.") whenever newPrefix is supplied but out of range, and render it; then delete the duplicated regex guard in the playground.
- **[MEDIUM / correctness]** `src/lib/subnet-splitter/engine.ts:44` — A trailing `# comment` on an allocation line drops that allocation from the free-space math  _(re-graded from high)_
  - _Repro:_ The line filter only rejects lines that START with '#', so '10.0.0.0/26 # web tier' reaches parseCidr, fails, and is excluded from the used set. Free space is then reported as the whole /24.
  - _Impact:_ Trailing comments are how allocation lists look when pasted out of an IPAM export, a Terraform locals block, or a runbook, and the hint under the textarea says "Blank lines and # comments are ignored." The headline free-space block and the summary percentage carry no caveat about skipped lines. Downgraded from high (an
  - _Fix:_ Strip inline comments before parsing (`l.split('#')[0].trim()`, same for ';') while keeping the original line as the display label, and surface a skipped-line count next to the free-space total.
- **[MEDIUM / ux]** `src/components/SubnetSplitterPlayground.astro:658` — Invalid parent produces a confidently wrong error about the split prefix
  - _Repro:_ Parent 999.1.1.1/24 with split /8. The guard regexes /(\d+)$/ off the raw parent string before the parent is ever validated, so it asserts a "/24 parent" that the engine actually rejects, and rings the prefix field.
  - _Impact:_ The user is sent to fix the wrong field and told the tool understood a parent it rejected. Even with the prefix cleared, the parent-only diagnostic is the generic ERR_PARENT rather than something specific like "Octet 999 is greater than 255.", which the contract asks for.
  - _Fix:_ Validate the parent first (parseCidr / the engine) and compare against the parsed parentCidr.prefix, not a regex on the raw string; move the range check into the engine so there is one source of truth; return per-octet diagnostics from ip-core's parser.
- **[MEDIUM / ux]** `src/components/SubnetSplitterPlayground.astro:643` — Red error ring and full error card flash mid-composition at 220 ms
  - _Repro:_ DEBOUNCE_MS = 220 (line 453) and evaluate() calls markFieldError + renderError immediately on the same timer. Typing the intermediate state '10.' into an empty #spl-parent paints the ring and the error card within 300 ms.
  - _Impact:_ Violates the calm-errors contract ("never flash a red border mid-composition — hold the error until ~600 ms idle, blur, or Enter"). Typing any parent CIDR from empty produces several red flashes before the value is complete. Secondary: ring-red-500 is a raw Tailwind palette class rather than a Field Manual token — this
  - _Fix:_ Keep the ~220 ms eval but delay painting the error card/ring until ~600 ms idle, or immediately on blur/Enter, holding the last good result until then. Replace ring-2 ring-red-500 with an inset ring on --color-error.
- **[MEDIUM / ux]** `src/components/SubnetSplitterPlayground.astro:708` — No Enter-to-run and the required hint line is missing
  - _Repro:_ Only 'input' listeners are wired; there is no keydown handler anywhere in the file. Setting #spl-parent to 10.9.0.0/24, dispatching input then keydown{key:'Enter'} and sampling 70 ms later shows the previous state; the result only appears after the 220 ms timer. The hint paragraph never contains the contract line.
  - _Impact:_ No affordance tells the user the tool is live, and the muscle-memory Enter press does nothing on the two single-line inputs. Ctrl/⌘+Enter (run + blur) is likewise unimplemented, so on mobile the keyboard never dismisses after a run.
  - _Fix:_ Add the exact hint line as a caption text-mute paragraph (keeping the format help as a second line), and wire keydown on #spl-parent/#spl-prefix to clearTimeout(timer) + evaluate() on Enter, setTimeout(evaluate, 0) in the textarea, and Ctrl/⌘+Enter everywhere to run then blur().
- **[MEDIUM / ux]** `src/components/SubnetSplitterPlayground.astro:22` — Example picker is a <select>, not the contract's example chips
  - _Repro:_ The playground root contains a SELECT with four options and zero chip elements.
  - _Impact:_ Violates the playground UX contract ("Example chips, not a <select>"). All three examples are hidden behind a click, and the tool is visually inconsistent with the five other networking tools it cross-links to.
  - _Fix:_ Replace the select with the ipc-chips / cat-chip pattern: squared chips at var(--radius-pill) (6px), canvas bg + hairline shadow + brand-strong text, active = brand-soft bg with an inset brand ring, min-height 44px under (pointer: coarse). Shorten the labels to the parent CIDR plus a two-word purpos
- **[MEDIUM / performance]** `src/lib/subnet-splitter/engine.ts:100` — Free-space list is uncapped — a 500-line paste renders ~7,000 rows / ~258,000 px
  - _Repro:_ Parent 10.0.0.0/8 with 500 scattered host IPs in the allocations textarea. The split section is capped at 256 rows (CAP = 256n) but freeCidrs has no cap at all, so every gap between allocations becomes its own row.
  - _Impact:_ Realistic fragmented input produces an unscannable wall with no copy button, no filter and no collapse — and because #spl-results is aria-live, all of it is queued for screen-reader announcement on every debounce.
  - _Fix:_ Cap freeCidrs the way the split section is capped (first N plus an exact total and a truncated flag), render a "largest free block" / "N blocks, showing first 200" header with a Copy-all yielding the full list, and give the block overflow-y: auto with a max-height.
- **[LOW / mobile]** `src/components/SubnetSplitterPlayground.astro:229` — Sub-44px touch targets on coarse pointers
  - _Repro:_ At 390px with touch emulation and (pointer: coarse) matching, "Save snapshot" measures 30px tall and the snapshot delete × measures 28×28px. The two <select>s reach 44px only because of the global coarse rule at global.css:613; global.css:623 bumps inputs to 16px font but not to 44px height, so #spl-parent and #spl-pre
  - _Impact:_ "Save snapshot" and the destructive delete × fall below the 44px coarse-pointer minimum the contract sets. No horizontal overflow was found at 390px, so this is the only mobile defect.
  - _Fix:_ Add a @media (pointer: coarse) block in the component style setting min-height: 44px on .spl-snap-btn, min-height/min-width: 44px on .spl-snap-delete, and 44px on .spl-text/.spl-num — or give them the shared .btn-sm / .icon-btn classes that global.css:595 already covers.
- **[LOW / test-coverage]** `src/lib/subnet-splitter/engine.ts:1` — Engine ships with zero tests despite exact-arithmetic and formatting logic  _(re-graded from medium)_
  - _Repro:_ ls src/lib/subnet-splitter/ -> engine.ts, examples.ts, types.ts. No engine.test.ts, so npm run test covers none of this file.
  - _Impact:_ Downgraded from medium: the fact is true, but the auditor's rationale is materially wrong. It claims "the five other networking tools that share ip-core are regression-gated; this one is not" — in fact 8 engines in the repo have no engine.test.ts, including two of the six networking tools (src/lib/mac-formatter, src/li
  - _Fix:_ Add src/lib/subnet-splitter/engine.test.ts pinning the page's worked examples (10.0.0.0/24 minus two /26s -> ['10.0.0.64/26','10.0.0.192/26']; minus /25+/27 -> ['10.0.0.160/27','10.0.0.192/26']), free/used/partial classification, the 2^96-1 free-count magnitude, out-of-range newPrefix, and a bounded


### regex-log-tester

`1 critical / 4 high / 7 medium / 0 low`

> This tool is well-presented but the engine is essentially untested — `engine.test.ts` covers only `encodeState()`, so `run()`, the actual product, has zero tests, and that is exactly where the damage is. Six of the twelve findings are wrong-answer bugs: a `u`-flag zero-width loop that turns a 3-character input into 10,000 fabricated matches and a 2.5 MB DOM; a `g` toggle that is a decorative no-op so the tool reports

- **[CRITICAL / correctness]** `src/lib/regex-tester/engine.ts:130` — u flag + any zero-width match on astral text fabricates 10,000 duplicate matches and a 2.5 MB DOM
  - _Repro:_ run('\\d*', 'gu', 'a🚀b') -> matchCount 10000; or load /regex-log-tester/#s=eyJwYXR0ZXJuIjoiXFxkKiIsImZsYWdzIjoidSIsInRleHQiOiJh8J-agGIifQ
  - _Impact:_ Wrong count and wrong indices (all crammed at index 1, inside a surrogate pair), plus a 2.5 MB DOM / 10,000 table rows for a 3-character input. Cause: under /u, RegExpBuiltinExec snaps a mid-surrogate lastIndex back down to the code-point boundary, so `re.lastIndex++` never makes progress.
  - _Fix:_ Implement AdvanceStringIndex: when the regex has u/v and the code unit at re.lastIndex is a high surrogate followed by a low surrogate, advance by 2 instead of 1. Add engine tests asserting run('\\d*','gu','a🚀b') yields 4 matches at 0,1,3,4.
- **[HIGH / performance]** `src/lib/regex-safety.ts:92` — ReDoS guard is trivially bypassed — a crafted share link freezes the recipient's tab for ~79 seconds
  - _Repro:_ checkRegexSafety('{(a+)+}') -> {safe:true} while checkRegexSafety('(a+)+') -> {safe:false}; then load /regex-log-tester/#s=eyJwYXR0ZXJuIjoieyhhKykrfSIsImZsYWdzIjoiZyIsInRleHQiOiJ7YWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhWiJ9
  - _Impact:_ `i = close` jumps from an unescaped `{` straight to the next `}`, skipping the whole pattern body, so the guard's exact target shape passes. A second bypass needs no parens at all (.*.*.*.*.*x). Because the playground auto-runs decoded #s= state at boot (runNow(false), line 1582), this is remotely triggerable by sendin
  - _Fix:_ Only treat {...} as a quantifier token when it matches /^\{\d+(,\d*)?\}$/ and it follows an atom; otherwise treat '{' as a literal and keep scanning. Also flag consecutive unbounded quantifiers over overlapping classes. Back the heuristic with the Web Worker + wall-clock timeout the module header al
- **[HIGH / correctness]** `src/lib/regex-safety.ts:117` — ReDoS heuristic blocks five common, measurably-safe log regexes with a false "could hang the page" claim
  - _Repro:_ Load /regex-log-tester/#s=eyJwYXR0ZXJuIjoiKFxcZCtcXC4pK1xcZCsiLCJmbGFncyI6ImdtIiwidGV4dCI6ImNsaWVudCAxMC4wLjAuNyBjYWxsZWQgYXBpIHYxLjIuMyJ9 — pattern (\d+\.)+\d+ over 'client 10.0.0.7 called api v1.2.3'. Correct answer: 2 matches.
  - _Impact:_ Dotted-quad/version, hostname, URL-path and HTTP-method-alternation patterns are all refused, labelled 'Invalid pattern', and the user is told their regex would hang the browser — which direct measurement disproves. The `frame.hasAlternation` half of the condition is the main offender.
  - _Fix:_ Drop the frame.hasAlternation half of the test and do not flag a group whose body ends in a mandatory literal separator (that separator removes the ambiguity). Better: make the heuristic advisory (warning banner, still run the match) and enforce with a wall-clock timeout.
- **[HIGH / correctness]** `src/components/RegexLogTesterPlayground.astro:1073` — A log over 200,000 characters is falsely reported as "Invalid pattern" and every real match is discarded
  - _Repro:_ Load the tool with pattern 'ERROR' against a 200,026-character log whose first line is 'ERROR disk full'. Correct answer: 1 match at index 0, well inside the scanned prefix.
  - _Impact:_ 200 KB is a small log. The tool tells you a correct regex is invalid, paints the input red, throws away the match it actually found, and hides the share/copy buttons — breaking the tool's headline use case.
  - _Fix:_ Add a distinct non-fatal `notice?: string` to RegexResult, set it at engine.ts:144 instead of `result.error`, render it as an informational banner, and key the two gates at playground lines 1073 and 1299 off `result.valid === false` only.
- **[HIGH / correctness]** `src/lib/regex-tester/engine.ts:133` — Match list silently truncated at 10,000 with no notice — the reported count is simply wrong
  - _Repro:_ run('.', 'g', 'a'.repeat(20000)) -> {valid:true, matchCount:10000, error:undefined}. The true answer is 20000.
  - _Impact:_ There is no visual difference between 'exactly 10,000 matches' and 'at least 10,000, we stopped counting', so the number is trusted and wrong. The highlighted preview is capped too, so the rest of the log renders as unmatched.
  - _Fix:_ When the loop breaks on MAX_MATCHES, set the same non-fatal `notice` field proposed for the text-truncation case ('Stopped after the first 10,000 matches.') and render the summary as '10,000+ matches'.
- **[MEDIUM / correctness]** `src/lib/regex-tester/engine.ts:48` — The `g` flag toggle is a no-op — the mirrored flag string contradicts the results  _(re-graded from high)_
  - _Repro:_ Load /regex-log-tester/#s=eyJwYXR0ZXJuIjoiRVJST1IiLCJmbGFncyI6Im0iLCJ0ZXh0IjoiRVJST1Igb25lXG5FUlJPUiB0d29cbkVSUk9SIHRocmVlIn0 — global chip off, flags 'm' only, three ERROR lines.
  - _Impact:_ The UI displays /ERROR/m and reports 3 matches; that exact regex in the user's own code returns 1. The checkbox at playground:76-80 changes only the mirror text, and the compile-error message leaks a `g` the user switched off.
  - _Fix:_ Make `g` non-toggleable: remove the checkbox, always render `g` in the mirror, and state that the tool always finds all matches. Do not display a flag string the engine overrides.
- **[MEDIUM / a11y]** `src/components/RegexLogTesterPlayground.astro:298` — The results container is a second aria-live region on top of the role="status" summary
  - _Repro:_ Dump any state of /regex-log-tester/ and inspect #rx-results, #rx-summary and, in an error state, the injected .rx-error div.
  - _Impact:_ Every 160 ms debounce tick re-announces the entire match table plus the summary plus, on a compile error, an assertive alert — three live regions for one state change. In the u-flag case above the live region holds 10,000 rows. CLAUDE.md's playground contract is explicit that the results container must not be aria-live
  - _Fix:_ Remove aria-live and aria-atomic from #rx-results (line 298) and drop role="alert" from the injected .rx-error divs (lines 1078 and 1189); add an sr-only role="status" copy-status span mirroring IpConverterPlayground.astro:159.
- **[MEDIUM / ux]** `src/components/RegexLogTesterPlayground.astro:1486` — No way to copy the matches — "Copy as Markdown" exports only the first one
  - _Repro:_ Load the default seeded nginx example (4 match rows, 16 capture-group chips) and try to get the matched values out of the tool.
  - _Impact:_ The match list and its capture groups are the tool's entire output and none of it is copyable; extracting the four client IPs means retyping them or hand-selecting text out of a table. CLAUDE.md requires per-row copy buttons plus a data-copy-all button.
  - _Fix:_ Add a per-row copy button carrying data-copy with the matched substring (icon-swap, execCommand fallback, 44px on pointer:coarse) plus a 'Copy all' button with data-copy-all, and extend the Markdown export to list every match with its groups.
- **[MEDIUM / ux]** `src/components/RegexLogTesterPlayground.astro:1502` — Pattern field has no Enter-to-run and none of the contract's live-eval hint
  - _Repro:_ Focus #rx-pattern and press Enter or Ctrl/Cmd+Enter — nothing happens; look for an on-screen statement that results are live — there is none.
  - _Impact:_ The reflex of pressing Enter to commit does nothing, and on a phone nothing blurs the field so the keyboard stays up covering the results. Sighted users get no visible statement that matching is live; the only way to force a run is the 'Test' button, which nothing points at.
  - _Fix:_ Add a visible caption under the pattern field with the exact contract string 'Results update as you type — press Enter to run now.', and a keydown handler on #rx-pattern that on Enter clears the debounce timer and calls runNow() immediately, blurring on (pointer: coarse), with Ctrl/Cmd+Enter running
- **[MEDIUM / ux]** `src/components/RegexLogTesterPlayground.astro:1300` — Red error border and error card flash on every keystroke mid-composition
  - _Repro:_ Type the bundled 'Named level capture' pattern (?<level>INFO|WARN|ERROR) one character at a time; five intermediate prefixes fail to compile and each one paints the full error state.
  - _Impact:_ Writing any non-trivial pattern strobes a red border and an 'Invalid pattern' card five or six times before it is finished, and the role="status" live region announces 'Invalid' each time. CLAUDE.md calls this out by name: never flash a red border mid-composition; hold errors until ~600 ms idle, blur, or Enter.
  - _Fix:_ Split the paint: run the match on the 160 ms debounce, but gate .rx-pattern-wrap--error, aria-invalid and the .rx-error card behind a separate ~600 ms idle timer that is also flushed on blur and Enter. Keep the last valid result visible while an error is held.
- **[MEDIUM / correctness]** `src/lib/regex-tester/engine.ts:106` — A capture group that did not participate is rendered as "empty", conflating undefined with ""
  - _Repro:_ Load /regex-log-tester/#s=eyJwYXR0ZXJuIjoiKEdFVCl8KFBPU1QpIiwiZmxhZ3MiOiJnbSIsInRleHQiOiJQT1NUIC9hcGkvbG9naW4ifQ — pattern (GET)|(POST) against 'POST /api/login'. In JavaScript m[1] is undefined here, not ''.
  - _Impact:_ Distinguishing 'group did not participate' from 'group matched empty' is one of the specific things people open a regex tester to check — it is the difference between (a?) and (a)?, and it decides whether downstream code sees undefined or ''. The tool reports the same thing for both.
  - _Fix:_ Change RegexMatch.groups to Array<string | undefined> and named to Record<string, string | undefined>, push m[i] unmodified, and let the existing groupChip() undefined branch render 'undefined'. Update the types.ts JSDoc that currently promises the '' normalisation.
- **[MEDIUM / test-coverage]** `src/lib/regex-tester/engine.test.ts:12` — run() — the entire matching engine — has zero test coverage
  - _Repro:_ Read the test file: 43 lines, a single describe block for encodeState(), run() never imported; no test file exists for regex-safety.ts either.
  - _Impact:_ The tool's only real logic ships unverified and regressions in it are invisible to `npm run test`. CLAUDE.md's own convention ('New engines should be test-driven with real vectors where they exist') is not met.
  - _Fix:_ Add a run() describe block covering match count/index/length on multi-line text, named vs numbered groups, non-participating groups, zero-width matches with and without the u flag on astral input, the 10,000-match cap and the MAX_REGEX_TEXT note, and each honoured/rejected flag. Add src/lib/regex-sa


### gitlab-ci-validator

`0 critical / 5 high / 7 medium / 3 low`  ·  1 claim(s) rejected by the verifier

> The engine is well-organised and genuinely never throws, but it models a 2021-era GitLab CI schema and has a systematic false-positive problem: five separate paths emit hard ERRORs on configurations GitLab accepts (`run:` steps, `!reference`, cross-project `needs`, `needs:optional`, stage inherited through `extends`, and anything resolved through `include:`). Because the tool's entire pitch is "catches mistakes befor

- **[HIGH / correctness]** `src/lib/gitlab-ci-validator/engine.ts:129` — GitLab's `run:` steps keyword always produces a false "job has no script" error
  - _Repro:_ validate("job:\n run:\n - name: build\n script: make\n")
  - _Impact:_ `run:` is ALWAYS a YAML sequence of step mappings in GitLab CI/CD Steps, so `Array.isArray(v)` is taken and `.some(item => typeof item === 'string')` is always false. Every job using `run:` is reported as a pipeline-breaking error — and the error text itself names `run:` as an accepted surface, so the user cannot recon
  - _Fix:_ In `isNonEmptyCommand`, accept an array entry that is a non-empty record as well as a non-empty string; better, split the `script:` check (strings only) from the `run:` check (list of step mappings carrying `name` + `script`/`step`).
- **[HIGH / correctness]** `src/lib/gitlab-ci-validator/engine.ts:265` — GitLab's `!reference` tag is reported as a fatal YAML syntax error
  - _Repro:_ validate(".setup:\n script:\n - echo setup\n\nbuild:\n stage: build\n script:\n - !reference [.setup, script]\n - make\n")
  - _Impact:_ `yaml.load()` is called with the default schema, which has no `!reference` type, so GitLab's own YAML extension aborts the whole run: ok:false, zero findings, and a confident line/column pointing at a construct that is perfectly valid. Worst possible linter output — it sends the user hunting for a bug that does not exi
  - _Fix:_ Register a js-yaml Type for `!reference` (kind 'sequence', construct: d => d) in a custom schema and pass it to yaml.load; treat the resolved value as an opaque "provided elsewhere" marker. Use yaml.loadAll() and validate the LAST document so a `spec:` header parses.
- **[HIGH / correctness]** `src/lib/gitlab-ci-validator/engine.ts:632` — Cross-project and upstream-pipeline `needs:` entries are wrongly reported as missing jobs
  - _Repro:_ validate("test:\n stage: test\n needs:\n - project: group/proj\n job: build\n ref: main\n artifacts: true\n script: make test\n")
  - _Impact:_ The guard on line 632 only skips needs entries with NO `job:` key — but every cross-project / upstream-pipeline need HAS a `job:` key alongside `project:`/`pipeline:`. The exact shape the author's own comment declares "out of scope" is precisely the one that gets flagged, as a hard error, on a valid multi-project pipel
  - _Fix:_ Before deriving `target`, add: `if (isRecord(need) && ('project' in need || 'pipeline' in need)) continue;`
- **[HIGH / correctness]** `src/lib/gitlab-ci-validator/engine.ts:549` — A stage inherited through `extends:` is reported as an undeclared "test" stage
  - _Repro:_ validate("stages:\n - build\n\n.base:\n stage: build\n\njob:\n extends: .base\n script: echo hi\n")
  - _Impact:_ `checkJob` reads `job.stage` off the raw, unmerged mapping. When the stage arrives via `extends:` the else-branch on line 544 fires and the job is reported as defaulting to the implicit `test` stage. `extends:` supplying the stage is the canonical GitLab DRY pattern; any team whose stages are e.g. [lint, build, deploy]
  - _Fix:_ Resolve `extends` recursively (with a visited set) into an effective job object before the per-job checks and read `stage` from the merged result; only apply the implicit-`test` rule when neither the job nor any extends target defines a `stage`.
- **[HIGH / correctness]** `src/lib/gitlab-ci-validator/engine.ts:701` — No `include:` awareness — extends / needs / stage references resolved by an include are hard errors
  - _Repro:_ validate("include:\n - template: Jobs/Build.gitlab-ci.yml\n - local: /ci/templates.yml\n\nmy-build:\n extends: .build-template\n stage: build\n script:\n - make\n")
  - _Impact:_ `include` is in GLOBAL_KEYWORDS so it parses silently, but the three cross-reference checks then treat the single file as the whole pipeline. GitLab's own recommended templates (Jobs/Build.gitlab-ci.yml, Security/SAST.gitlab-ci.yml) define jobs, templates and stages externally, so a standard enterprise .gitlab-ci.yml l
  - _Fix:_ When `include` is present at the top level, downgrade extends-unknown-target / needs-unknown-job / dependencies-unknown-job / stage-not-declared from error to warning and append "…unless it is defined in one of your `include:`d files — this validator only sees this file."
- **[MEDIUM / correctness]** `src/lib/gitlab-ci-validator/engine.ts:633` — `needs: optional: true` is ignored, producing a false missing-job error
  - _Repro:_ validate("build:\n script: make\ntest:\n needs:\n - job: build\n optional: true\n - job: sast\n optional: true\n script: make test\n")
  - _Impact:_ GitLab documents `needs:optional: true` precisely so a needed job may be absent from the pipeline without failing it. `checkNeeds` never reads the key, so users who already worked around the missing-job problem the GitLab-sanctioned way still get a red error.
  - _Fix:_ Inside the loop, `if (isRecord(need) && need.optional === true) continue;` before the `known.has(target)` check.
- **[MEDIUM / correctness]** `src/lib/gitlab-ci-validator/engine.ts:579` — Invalid `when:` finding can point at a valid `when:` line inside `rules:`
  - _Repro:_ validate("job:\n rules:\n - if: '$CI_COMMIT_BRANCH'\n when: manual\n when: sometimes\n script: echo hi\n")
  - _Impact:_ `findLine(lines, l => /^\s+when\s*:/.test(l), jobLine, toLine)` is a first-indented-match-wins scan, so the nested rule's `when: manual` on line 4 is returned instead of the offending `when: sometimes` on line 5. The results UI renders a "Line 4" chip; the user opens line 4, sees a correct value, and either edits a wor
  - _Fix:_ Capture the job block's field indent and require an exact-indent match (`^ {N}when\s*:`) so nested rules entries are skipped; and make buildTopLevelLineIndex skip lines whose first non-space character is `#`.
- **[MEDIUM / correctness]** `src/lib/gitlab-ci-validator/engine.ts:571` — An invalid `when:` inside `rules:` reports "No issues found"
  - _Repro:_ validate("job:\n script: echo\n rules:\n - when: nope\n")
  - _Impact:_ The WHEN_VALUES check reads only `job.when`; nothing walks `job.rules[].when` or `root.workflow.rules[].when`. Modern GitLab pipelines put `when:` inside `rules:` far more often than at job level, so the tool's headline check misses the common case and issues an explicit clean bill of health on a config GitLab rejects.
  - _Fix:_ When `job.rules` is an array, apply the same WHEN_VALUES check to each rule object's `when`; do the same for `root.workflow.rules`.
- **[MEDIUM / ux]** `src/components/GitlabCiValidatorPlayground.astro:1174` — Findings cannot be copied — the Copy button copies the input YAML, not the results
  - _Repro:_ Load http://localhost:4322/gitlab-ci-validator/, get findings, look for any way to copy them.
  - _Impact:_ A user with a dozen findings has no way to paste them into a ticket, MR comment, or chat — retype or screenshot only. It also breaks analytics: the `result_copied` listener in Layout.astro is bound to `[data-copy]`/`[data-copy-value]`/`[data-copy-all]`/`[data-copy-link]` inside `#playground`, so this tool can never reg
  - _Fix:_ Add a per-row `data-copy` button on each `.glci-row`, a `data-copy-all` in the Results header, rename the existing button to "Copy YAML", and add `data-copy-link` to Share Link.
- **[MEDIUM / ux]** `src/components/GitlabCiValidatorPlayground.astro:1163` — No live eval, and the "Results update as you type" hint line is absent
  - _Repro:_ grep -c "Results update as you type" dump-glci.html; grep -c updateListener src/components/GitlabCiValidatorPlayground.astro
  - _Impact:_ The CLAUDE.md live-eval loop is absent: edits sit stale behind a manual Validate click with nothing marking the results panel stale, and the only keyboard hint is a `sm:`-hidden `⌘/Ctrl + Enter` caption (line 65: class="caption text-mute hidden items-center sm:inline-flex") that is invisible below 640px, where there is
  - _Fix:_ Either attach an EditorView.updateListener debounced ~180ms into run() plus the exact caption "Results update as you type — press Enter to run now.", or at minimum mark the results panel stale after an edit and show the run affordance on mobile.
- **[MEDIUM / a11y]** `src/components/GitlabCiValidatorPlayground.astro:174` — Results container is an aria-live region on top of the role=status summary
  - _Repro:_ grep -o '<div id="glci-results"[^>]*>' on the live page dump
  - _Impact:_ Three live regions in one island. Every validation announces the summary AND the entire innerHTML rewrite of the findings list (pill text, title, full detail sentence, Fix block per finding) plus the interstitial "Validating…" loading state rendered by renderLoading() at line 1121. On a pipeline with a dozen findings a
  - _Fix:_ Remove aria-live="polite" aria-atomic="false" from #glci-results; let #glci-summary (role=status) carry the single announcement.
- **[MEDIUM / ux]** `src/components/GitlabCiValidatorPlayground.astro:1091` — Choosing any example clears the results instead of validating, and the default example finds nothing
  - _Repro:_ Load http://localhost:4322/gitlab-ci-validator/ (lands on 'Clean pipeline'), then pick any other example from the picker.
  - _Impact:_ Boot auto-validates (lines 1227-1228: renderEmpty then void run()) but the change handler calls renderEmpty and never run(). So the landing state is an empty green card that demonstrates nothing, and the obvious next move — picking 'Undefined stage' or 'Broken needs / extends' — replaces the results with the placeholde
  - _Fix:_ Call `void run()` instead of `renderEmpty(...)` in the change handler, and seed with a findings-producing example so the landing state shows a real error row, line chip and Fix.
- **[LOW / ux]** `src/components/GitlabCiValidatorPlayground.astro:1139` — The full pipeline is written into the URL hash on page load, with no size cap
  - _Repro:_ Load http://localhost:4322/gitlab-ci-validator/ with no hash; the address bar is rewritten to #glci=<base64url of the whole doc>.
  - _Impact:_ run() is invoked unconditionally at boot and always replaceStates the full document into the hash, with no length guard in encodeShare (lines 913-915) or at the call site. A user who pastes a 30 KB internal pipeline gets a ~40 KB URL written into history/sync without ever clicking Share Link — the one control carrying 
  - _Fix:_ Gate the replaceState on a user-initiated flag (as AlertLint does) and skip the write when encodeShare(doc).length > 2000.
- **[LOW / correctness]** `src/lib/gitlab-ci-validator/engine.ts:807` — De-duplication collapses every bad entry in a list into one finding
  - _Repro:_ validate("job:\n services:\n - 1\n - 2\n script: echo hi\n")
  - _Impact:_ List-entry findings share an id, a title and a line (both resolve to the parent key's line), so the dedup key `${f.id}@${f.line}@${f.title}` collapses N broken entries into 1. The user fixes the one value the detail names, re-runs, and gets the identical error again — an avoidable fix-and-retry loop.
  - _Fix:_ Include the offending value in the title, or add the array index to the dedup key so distinct entries survive finalize().
- **[LOW / ux]** `src/components/GitlabCiValidatorPlayground.astro:145` — Two paragraphs inside the dark editor pane are missing the pane's horizontal padding
  - _Repro:_ chrome --headless=new --window-size=390,1700 --screenshot http://localhost:4322/gitlab-ci-validator/#playground
  - _Impact:_ Two lines of copy visibly break the dark instrument-slab's left alignment on every viewport; on narrow screens the tip text sits flush against the card edge.
  - _Fix:_ Add `px-4` to both paragraphs so they align with the `.gitlab-ci.yml` header bar and the snapshot row.

  _Rejected:_ “Example picker is a <select> with a 32px touch target instead of contr” — The load-bearing claim is factually false. The finding asserts "global.css:595 bumps only .btn-sm/.btn-nav/.icon-btn, and the component's explicit height: 32px wins over the coarse


### alertmanager-route-tester

`1 critical / 3 high / 6 medium / 3 low`

> The route-walk core is genuinely good: first-match-then-continue, terminal-node selection, receiver/grouping inheritance and the breadcrumb all reproduce Alertmanager's dispatch.Route.Match faithfully, the 36-test suite is real (docs tree, continue, all four operators, anchoring, nesting, full-config extraction), YAML failures are line-referenced and never throw, deep nesting and recursive anchors degrade to ok:false

- **[CRITICAL / correctness]** `src/lib/alertmanager-route-tester/engine.ts:132` — ReDoS safety heuristic false-positives silently turn valid RE2 matchers into "never matches" — with zero warning
  - _Repro:_ match_re: instance: '([a-z0-9-]+\.)+eu\.example\.com(:[0-9]+)?' with labels instance=web-3.rack1.eu.example.com:9100 -> engine returns default-receiver, warnings=[].
  - _Impact:_ checkRegexSafety() rejects any parenthesised group quantified by */+/{n,} whose body contains another unbounded quantifier OR an alternation. That is the shape of every ordinary host/domain-suffix matcher. compileAnchored() maps 'unsafe' onto the same null return as 'syntactically invalid', matcherHolds() turns null in
  - _Fix:_ Return a discriminated result from compileAnchored ({ok:false, reason}) and have matcherHolds/collectMatchers push a warning naming the label and pattern, e.g. 'Regex "…" on label `instance` could not be evaluated in the browser (nested-quantifier guard); Alertmanager uses RE2 and would evaluate it 
- **[HIGH / correctness]** `src/lib/alertmanager-route-tester/engine.ts:133` — RE2-only syntax that Alertmanager accepts ((?i)) fails to compile in JS and is silently swallowed; \p{...} silently mis-matches
  - _Repro:_ (a) match_re: alertname: '(?i)diskfull' + alertname=DiskFull -> default-receiver, no warning (Go RE2 supports inline (?i) and would route to oncall-pager). (b) match_re: code: '\p{Lu}+' -> code=p{Lu} MATCHES 'upper'; code=ABC does NOT.
  - _Impact:_ The catch block discards the compile failure with no diagnostic, so an inline-flag pattern is a silent FALSE NEGATIVE. The \p case is the opposite and worse: without the `u` flag JS reads \p as a literal 'p', so the tool fires a route on the literal text 'p{Lu}' and misses real uppercase — a silent FALSE POSITIVE telli
  - _Fix:_ In the catch, record the reason and emit a warning naming the label and pattern. Optionally pre-translate leading RE2 inline flags (?i)/(?s)/(?m) into JS RegExp flags, and always compile with the `u` flag so \p{...} either works or throws instead of silently mis-matching.
- **[HIGH / correctness]** `src/lib/alertmanager-route-tester/engine.ts:300` — Comma-separated matcher string without braces is silently mis-parsed into one corrupted matcher — produces a FALSE receiver
  - _Repro:_ matchers: - 'severity=~"critical|page",team="sre"' with labels severity=critical, team=frontend -> reports sre-pager, warnings=[]. Alertmanager routes this to default-receiver (team is frontend).
  - _Impact:_ Alertmanager's config.Matchers.UnmarshalYAML runs every list entry through pkg/labels.ParseMatchers, whose contract is 'a leading { and/or trailing } is optional' and which appends ALL parsed matchers (pm...), so `- 'a="1",b="2"'` is a legal single entry producing two matchers. collectFromMatcherEntry only takes the sp
  - _Fix:_ Move splitTopLevelCommas() out of the `if (braceWrapped)` branch: always strip optional braces then split on top-level commas and parse each fragment. Add tests for 'a="1",b="2"', 'a="1", b="2"', and the alternation case.
- **[HIGH / security]** `src/lib/alertmanager-route-tester/engine.ts:342` — ReDoS guard is bypassed by sequential quantifiers; a share link freezes the tab on load with no user gesture
  - _Repro:_ Load http://localhost:4322/alertmanager-route-tester/#amrc=<route with match_re host: 'a*a*a*a*a*a*a*a*a*b'>&amrl=<host= 43 a's>. The renderer never becomes responsive. No click required — init() ends with `void run(false)`.
  - _Impact:_ checkRegexSafety only looks for a quantified GROUP; a flat run of sequential quantifiers has no group at all, so it returns safe:true. MAX_REGEX_TEXT is 200000 while the attack needs ~43 chars, so the length cap on line 342 — whose comment claims it is defence-in-depth against exactly this — never fires. decodeShare() 
  - _Fix:_ Run matchRoute (or at minimum the regex evaluation) in a Web Worker with a hard wall-clock timeout (~250ms), terminate on overrun and render a 'could not be evaluated in time' state. Immediate mitigation: seed the editors from the hash but require an explicit Run when fromShare is true.
- **[MEDIUM / correctness]** `src/lib/alertmanager-route-tester/engine.ts:511` — `routes:` written as a mapping instead of a list (missing `- `) silently discards the whole subtree
  - _Repro:_ route: { receiver: default-receiver, routes: { receiver: oops, match: { team: a } } } with labels team=a -> ok=true, matches=[default-receiver], warnings=[]. Alertmanager fails config load ('cannot unmarshal !!map into []*config.Route').
  - _Impact:_ Forgetting `- ` in a YAML list is the most common Alertmanager config typo, and this tool exists to diagnose routing surprises. Instead of flagging it, `Array.isArray(node.routes) ? node.routes : []` treats the malformed mapping as 'no children', terminates at the parent, and returns a plausible fall-through-to-default
  - _Fix:_ Add an else-branch: if (node.routes !== undefined && !Array.isArray(node.routes)) warnings.push('`routes:` at "' + path.join(' → ') + '" is not a list — Alertmanager expects a sequence (`- receiver: …`). The whole subtree was ignored.')
- **[MEDIUM / correctness]** `src/lib/alertmanager-route-tester/engine.ts:317` — An unparseable matcher is dropped, which WIDENS the route — the tool then reports a receiver the alert cannot reach
  - _Repro:_ matchers: - '{"http.status"="500"}' with labels alertname=Foo (no http.status label) -> matches http-team, warnings=['Could not parse matcher "{"http.status"="500"}"; it was skipped.'].
  - _Impact:_ isValidLabelName() only accepts [a-zA-Z_][a-zA-Z0-9_]*, so a quoted/UTF-8 label name (Alertmanager 0.28+ / Prometheus 3 syntax) is rejected. Dropping a matcher is not a neutral degradation — it makes the node match MORE broadly, and when the dropped matcher was the node's only one the route becomes match-everything. Th
  - _Fix:_ Support quoted label names in isValidLabelName/parseMatcherString. Independently, when a node has >=1 unparseable matcher, either exclude that node from matching entirely or render its card in a degraded style stating 'this route matched only because N unparseable matcher(s) were ignored'.
- **[MEDIUM / correctness]** `src/lib/alertmanager-route-tester/engine.ts:533` — `continue: yes` is treated as false — under-reports the receivers Alertmanager would page
  - _Repro:_ Two siblings; first has matchers severity="critical" and `continue: yes`, second has match team: backend. Labels team=backend, severity=critical -> ONE receiver (all-critical-audit). Same config with `continue: true` -> TWO receivers.
  - _Impact:_ js-yaml v4 implements the YAML 1.2 core schema where only true/false are booleans, so `yes` parses as the string 'yes' and `child.continue === true` is false. Alertmanager parses its config with gopkg.in/yaml.v2 (YAML 1.1), where yes/no/on/off ARE booleans. The tool therefore under-reports the fan-out — the exact failu
  - _Fix:_ Coerce YAML-1.1 truthiness: const childContinue = child.continue === true || (typeof child.continue === 'string' && /^(yes|on|y|true)$/i.test(child.continue.trim())), plus a warning noting the config relies on a YAML 1.1 boolean. Apply the same treatment anywhere else a boolean is read.
- **[MEDIUM / a11y]** `src/components/AlertmanagerRouteTesterPlayground.astro:190` — Results container is an aria-live region (contract forbids it) with a role="alert" nested inside it
  - _Repro:_ Dump http://localhost:4322/alertmanager-route-tester/ and enumerate live regions inside <section class="amr">.
  - _Impact:_ CLAUDE.md's playground a11y contract is explicit: 'results container is NOT aria-live; a one-line role="status" summary is the sole live region, plus an sr-only copy-status span.' Here #amr-results (aria-live=polite) and #amr-summary (role=status aria-live=polite) both update on every run, so a screen-reader user hears
  - _Fix:_ Remove aria-live/aria-atomic from #amr-results and drop role="alert" from the injected error div. Keep #amr-summary (role=status) as the single live region and make its text carry the outcome for both success and error, e.g. 'Error: could not parse YAML at line 2'.
- **[MEDIUM / ux]** `src/components/AlertmanagerRouteTesterPlayground.astro:1114` — There is no way to copy the result — "Copy" copies the input YAML, and no data-copy-all / data-copy-link exists
  - _Repro:_ Dump the page and search the playground subtree for data-copy / data-copy-all / data-copy-link / data-copy-value: zero matches. Click Copy: it writes configView's document (the YAML you pasted in).
  - _Impact:_ The deliverable of this tool is the answer, not the input. The rendered output ('team-DB-pages', 'root → team-DB-pages', 'group_by [alertname, cluster, database] group_wait 30s …') has no copy control at all, so pasting it into a PR review or incident channel means hand-selecting DOM. The contract requires per-row copy
  - _Fix:_ Add a per-match copy button (data-copy) emitting `receiver • path • grouping`, a Copy all button with data-copy-all serialising every match plus warnings, and rename the existing control to 'Copy config' so it is honest. Reuse the icon-swap + execCommand fallback from IpConverterPlayground.astro.
- **[MEDIUM / ux]** `src/components/AlertmanagerRouteTesterPlayground.astro:1074` — Visiting the clean URL immediately rewrites the address bar to a ~730-char share hash, before any interaction and even on failed evals
  - _Repro:_ Open http://localhost:4322/alertmanager-route-tester/ (no hash), wait for boot, read location.href: it is now #amrc=<base64 of the demo config>&amrl=<base64 labels>, 729 chars of hash. No click, no keystroke.
  - _Impact:_ Three deep-link contract rules broken at once: the hash is written on a non-user-initiated seed run (init() ends with `void run(false)` at line 1186 and run() replaceStates unconditionally at 1074); it is written even when the eval errored, because the try/catch wraps only replaceState and sits ABOVE the `userInitiated
  - _Fix:_ Gate the replaceState on `userInitiated && result.ok !== false && !result.error`, exactly like the recordToolLastInput call two lines below, and skip the write when encodeShare(...).length exceeds ~2000. Leave the URL untouched on the boot seed run.
- **[LOW / ux]** `src/components/AlertmanagerRouteTesterPlayground.astro:45` — Playground diverges from the UX contract: <select> instead of example chips, no live eval, missing the required hint line  _(re-graded from medium)_
  - _Repro:_ Dump the page: the example picker renders as <select id="amr-example"> with <option> children, not chips; the string 'Results update as you type' is absent; the component has no updateListener and no debounce timer, so after editing the YAML the result card keeps showing the previous config's answer until Run is presse
  - _Impact:_ Four contract items are unmet (chips not <select>; ~130-220ms debounced live eval; the exact hint string; Enter forcing an eval). The substantive cost is the stale result card — a user can read a receiver that applies to a config they have already edited away. The mobile hint gap is real too: the only keyboard hint (li
  - _Fix:_ At minimum, mark the result card stale (dim it / 'config changed — press Run') on the first edit after a run, via an EditorView.updateListener. Full contract compliance would also swap the <select> for squared chips at var(--radius-pill) and render the hint line.
- **[LOW / mobile]** `src/components/AlertmanagerRouteTesterPlayground.astro:306` — Snapshot Save (30px) and Delete (28px) miss the 44px coarse-pointer minimum — but the example picker and snapshot select do NOT  _(re-graded from medium)_
  - _Repro:_ Emulate a 390x844 mobile device with touch (pointer: coarse) and measure getBoundingClientRect().height on each control.
  - _Impact:_ The component declares no @media (pointer: coarse) block. global.css's coarse block rescues .btn-sm/.btn-nav/.icon-btn/.cat-chip and every `select`, which covers the Run/Copy/Share buttons and both <select>s — but .amr-snap-btn (a plain <button>, height 30px) and .amr-snap-delete (a plain <button>, 28x28) are reached b
  - _Fix:_ Add to the component style block: @media (pointer: coarse) { .amr-snap-btn { min-height: 44px; height: auto; } .amr-snap-delete { min-width: 44px; min-height: 44px; } }
- **[LOW / correctness]** `src/lib/alertmanager-route-tester/engine.ts:666` — Matchers on the root route are silently ignored, so the tool answers for a config Alertmanager would refuse
  - _Repro:_ route: { receiver: default-receiver, match: { env: prod }, routes: [ { receiver: child, match: { team: a } } ] } with labels env=dev, team=a -> ok=true, matches=[child], warnings=[]. Alertmanager rejects this config at load ('root route must not have any matchers').
  - _Impact:_ A user who has incorrectly put matchers on the root gets a green, warning-free 'your alert reaches child' answer for a config that will not start Alertmanager at all. nodeOwnMatchers(root, warnings) is called at line 509, so the root matchers are parsed and then discarded without comment. Low frequency, but it is a wro
  - _Fix:_ After resolveRoot, if the root node carries match / match_re / matchers, push a warning: 'The root route has matchers. Alertmanager rejects this config (`root route must not have any matchers`); they are ignored below.' Apply only when the input came from a top-level `route:` key, not a bare pasted 


### github-actions-expression-tester

`1 critical / 3 high / 7 medium / 1 low`

> The expression VM (lexer/parser/values/functions) is genuinely good: coercion, case-insensitive equality, operand-returning and/or, the object filter, and the runner#1173 footgun model are all faithful, and the seeded footgun example auto-evaluates on load and is an excellent first impression. The problems concentrate in two places. First, triggers.ts: Tab 2 is far less faithful than Tab 1 and states wrong verdicts c

- **[CRITICAL / correctness]** `src/lib/github-actions-expression-tester/triggers.ts:263` — Branch push wrongly triggers a tags-only workflow, reported as 'no filters'
  - _Repro:_ simulateTriggers("on:\n push:\n tags:\n - 'v*'\njobs:\n build:\n runs-on: ubuntu-latest\n", { event: 'push', branch: 'main' })
  - _Impact:_ GitHub's on.push docs: 'If you define only tags/tags-ignore or only branches/branches-ignore, the workflow won't run for events affecting the undefined Git ref.' The tool says the opposite for the single most common release-workflow shape, and the reason string ('has no filters') is flatly false because hasRefFilter (l
  - _Fix:_ In the non-tag branch of evaluateWorkflowTrigger add the symmetric case: when neither branches nor branches-ignore is set but tags or tags-ignore is, set refPass=false with the trace 'on.push sets tags but not branches, so branch pushes do not trigger.' Also fold tags/tagsIgnore into hasRefFilter on
- **[HIGH / correctness]** `src/lib/github-actions-expression-tester/triggers.ts:337` — Trigger simulator evaluates job if: against a near-empty context, then reports a confident false
  - _Repro:_ simulateTriggers on a workflow with jobs build (no if), notify (needs: build, if: ${{ needs.build.result == 'success' }}) and gated (if: ${{ vars.ENVIRONMENT == 'prod' }}); event { push, main }
  - _Impact:_ buildEventContext returns only { github, env:{}, jobStatus, stepConclusions } - no needs, vars, inputs, steps, matrix or secrets. Every job gated on those reports SKIPPED with the unhedged reason 'Job if: evaluated to false.' The notify row is self-contradictory: it asserts needs.build.result is not success in the same
  - _Fix:_ Populate buildEventContext from the parsed workflow (needs.<id>.result derived from decisions already computed; vars/inputs from an editable pane mirroring Tab 1's #ga-ctx-editor). At minimum, detect if: references to contexts the simulator cannot model and render an explicit 'unknown - context not 
- **[HIGH / correctness]** `src/lib/github-actions-expression-tester/triggers.ts:327` — pull_request simulation sets github.ref to refs/heads/<base>, inverting both verdicts
  - _Repro:_ simulateTriggers("on: pull_request\njobs:\n deploy:\n if: \"${{ github.ref == 'refs/heads/main' }}\"\n deploy2:\n if: \"${{ startsWith(github.ref, 'refs/pull/') }}\"\n", { event: 'pull_request', branch: 'main' })
  - _Impact:_ Real GitHub sets github.ref to refs/pull/<n>/merge for pull_request, so the deploy guard skips and deploy2 runs. The tool reports the exact opposite for both rows. `if: github.ref == 'refs/heads/main'` on a pull_request job is one of the most common mistaken deploy guards and the simulator green-lights it. The page con
  - _Fix:_ In buildEventContext, when eventKey is pull_request (not pull_request_target) set ref to refs/pull/<n>/merge (add a PR-number field to the scenario builder, default 42) and ref_name to <n>/merge, matching the Tab-1 preset. Keep base_ref as the branch the user typed.
- **[HIGH / correctness]** `src/lib/github-actions-expression-tester/triggers.ts:281` — paths and paths-ignore silently ignore bang-negation that the page FAQ promises works
  - _Repro:_ simulateTriggers("on:\n push:\n paths:\n - '**'\n - '!docs/**'\njobs:\n build:\n runs-on: ubuntu-latest\n", { event:'push', branch:'main', changedFiles:['docs/a.md'] })
  - _Impact:_ Branch and tag filters route through matchList (which implements GitHub's top-to-bottom include/exclude ordering); path filters call `paths.some(p => matchOne(file, p))`, and matchOne compiles the leading `!` as a literal character, so negation is a total no-op. Both directions are wrong: paths ['**','!docs/**'] with d
  - _Fix:_ Replace both `some(matchOne)` calls with matchList(file, paths).included / matchList(file, pathsIgnore).included - matchList already implements the ordering the branch and tag gates use.
- **[MEDIUM / correctness]** `src/lib/github-actions-expression-tester/triggers.ts:342` — needs: skip propagation is single-pass in declaration order, so transitive dependents wrongly RUN
  - _Repro:_ simulateTriggers on jobs declared in the order c (needs: b), b (needs: a), a (if: ${{ false }}); event { push, main }
  - _Impact:_ applyNeeds walks Object.entries(jobsObj) exactly once, so a dependent declared BEFORE its dependency is decided against a stale 'runs'. The rendered table is internally inconsistent: c shows RUNS directly above b showing SKIPPED, while c needs b. GitHub skips c too. Declaration order in real workflow files is arbitrary
  - _Fix:_ Make applyNeeds a fixpoint - repeat the pass until no decision changes - or topologically sort jobIds by the needs graph before the single pass. Cap iterations at jobs.length so a cyclic needs: declaration cannot spin.
- **[MEDIUM / correctness]** `src/lib/github-actions-expression-tester/triggers.ts:142` — A job if: with a syntax error or unknown function is reported as 'evaluated to false' with no warning
  - _Repro:_ simulateTriggers("on: push\njobs:\n a:\n if: \"${{ github.ref === 'refs/heads/main' }}\"\n", { event:'push', branch:'main' }), and the same workflow with if: ${{ contians(github.ref, 'main') }}
  - _Impact:_ Lines 142-143 destructure only `{ ast }` from parse() and only `{ value }` from evaluateAst(), discarding a specific offset-carrying parse error and every evaluator advisory. A workflow GitHub would reject at parse time is presented as clean with one merely-skipped job, and a typo like contians(...) silently reads as f
  - _Fix:_ Destructure `error` from parse() and `warnings` from evaluateAst(), push those warnings into the result warnings array, and when a parse error is set mark the job decision as an explicit error state carrying the offset message as its reason instead of 'skipped'.
- **[MEDIUM / a11y]** `src/components/GithubActionsExpressionPlayground.astro:113` — Results containers are aria-live, stacking overlapping live regions per panel
  - _Repro:_ Load http://localhost:4322/github-actions-expression-tester/ headless and count author-set aria-live / role=alert nodes inside the .ga-pg section.
  - _Impact:_ CLAUDE.md's playground a11y contract is explicit: 'results container is NOT aria-live; a one-line role="status" summary is the sole live region'. Here #ga-expr-results and #ga-trig-results are BOTH aria-live="polite" in addition to the two role=status summary spans, and warnHtml() injects role="alert" INSIDE the polite
  - _Fix:_ Remove aria-live from #ga-expr-results and #ga-trig-results, keep the role=status summary spans as the sole live regions with a one-line verdict, and drop role=alert from the injected ga-warn markup.
- **[MEDIUM / ux]** `src/components/GithubActionsExpressionPlayground.astro:113` — No copy affordance anywhere in the playground results, and Share is invisible to analytics
  - _Repro:_ Grep the component and the rendered .ga-pg section of the localhost:4322 DOM dump for data-copy / data-copy-all / data-copy-link.
  - _Impact:_ The CLAUDE.md playground UX contract requires per-row copy buttons, a data-copy-all, and a data-copy-link share button; the playground has none. Result rows (the rendered value, each breakdown row, each job row) can only be hand-selected out of styled divs. Separately, Layout.astro's result_copied listener matches [dat
  - _Fix:_ Add data-copy buttons on the rendered value and each breakdown/job row, a data-copy-all emitting the whole verdict plus explanation, and data-copy-link on both Share buttons. Reuse the icon-swap + execCommand fallback from IpConverterPlayground.
- **[MEDIUM / mobile]** `src/components/GithubActionsExpressionPlayground.astro:316` — Example picker is a select, and the preset chips / snapshot row miss the 44px coarse-pointer target
  - _Repro:_ Grep the component for 'pointer: coarse'; render at --window-size=390,1700 and inspect the example picker and .ga-preset chips.
  - _Impact:_ Two contract gaps. (1) The example picker is a native <select> where the contract mandates squared 6px chips; at 390px it truncates to 'The always-true footgun (runner...'. (2) The component ships zero pointer-coarse rules, so .ga-preset (2px padding + 12px font, no min-height, ~20px tall), .ga-snap-btn (30px), .ga-sna
  - _Fix:_ Replace both select example pickers with the chip pattern from IpConverterPlayground (squared var(--radius-pill), brand-soft active state) and add a pointer-coarse media block giving .ga-preset, .ga-snap-btn, .ga-snap-delete and .ga-select a 44px min-height.
- **[MEDIUM / correctness]** `src/lib/github-actions-expression-tester/if-footgun.ts:74` — Two adjacent expression spans in one if: are reported as a parse failure instead of concatenation
  - _Repro:_ evaluateIfCondition('${{ github.ref_name }}${{ github.run_number }}', defaultContext()), and the space-separated variant '${{ needs.a.result }} ${{ needs.b.result }}'; also reachable in the browser via a #s= share deep link.
  - _Impact:_ analyzeIfCondition sees no meaningful text outside the spans (after trim) so it raises no footgun warning, and the greedy anchored regex on line 74 swallows the middle '}}${{' and hands the parser garbage. GitHub substitutes each span and concatenates - 'main' + '3' = 'main3', a non-empty string, so the step RUNS. The 
  - _Fix:_ Make extractExpressionBody span-aware: only unwrap when the value contains exactly ONE span covering the whole trimmed string. With two or more spans, route through substituteSpans in engine.ts as the footgun branch already does, so the result is the concatenated substitution.
- **[MEDIUM / ux]** `src/components/GithubActionsExpressionPlayground.astro:706` — The offset-carrying parse diagnostic is discarded; a syntax error still renders a FALSE / SKIP verdict  _(re-graded from high)_
  - _Repro:_ Open http://localhost:4322/github-actions-expression-tester/#s=eyJ0IjoiZXhwciIsImUiOiIke3sgZ2l0aHViLnJlZiA9PT0gJ3JlZnMvaGVhZHMvbWFpbicgfX0ifQ (expression: ${{ github.ref === 'refs/heads/main' }})
  - _Impact:_ runExpr composes verdict + ctxErr + warns + explanation + breakdown and never reads result.error, so the engine's specific 'Unexpected token "=" at position 13.' is thrown away and no ga-error card renders. The badge still reads FALSE with 'would SKIP the step' for input GitHub would reject outright at workflow-parse t
  - _Fix:_ In runExpr, when result.error is set render the existing ga-error card with the offset message in place of the TRUE/FALSE badge, and set exprSummary.textContent to 'syntax error' rather than 'false'.
- **[LOW / performance]** `src/lib/github-actions-expression-tester/glob.ts:35` — Glob compiler backtracks catastrophically on repeated globstar segments
  - _Repro:_ testGlob('a/'.repeat(k+4) + 'b.ts', '**/'.repeat(k) + 'x') for k = 4, 6, 8, 10, 12, timed with Date.now() under vitest.
  - _Impact:_ compileGlob emits adjacent (?:.*/)? groups with nothing between them - the classic nested-quantifier blowup. matchOne runs on the main thread for every changed file times every paths pattern on a 180ms debounce while the user types the workflow YAML, so a pattern with a dozen globstar segments freezes the tab with no s
  - _Fix:_ Collapse consecutive globstar-slash tokens into a single (?:.*/)? during compilation - a run of N is semantically identical to one - and add a cheap segment-count guard in matchOne that bails to false above a threshold.


### github-actions-validator

`0 critical / 4 high / 9 medium / 2 low`

> This tool has a good page, a sound "never throws" contract, correct XSS hygiene (every injected value goes through escapeHtml, and remediationHtml escapes *before* unwrapping backticks), a working Escape-to-release-focus binding, and a genuinely useful seeded example. Everything else is soft. The engine has zero tests and it shows: the two flagship security rules (pwn-request, unpinned actions) are implemented as who

- **[HIGH / correctness]** `src/lib/gha-validator/engine.ts:714` — Multiple broken steps in one job collapse into a single finding, reported at the job's line
  - _Repro:_ validate() on a job with three action-less steps (`- name: alpha` / `beta` / `gamma` at source lines 8, 9, 10).
  - _Impact:_ The user fixes the one reported step, re-runs, and is handed another error they were told did not exist. The 'Line 5' chip points at the job header, not the step. Also reproduces across jobs when jobLine cannot be resolved (flow-style `jobs: {a: {...}, b: {...}}` -> both findings carry line=undefined -> key `step-missi
  - _Fix:_ Resolve each step's real source line and set it on the finding; and make the dedup key discriminate on title as well as id+line (`${f.id}@${f.line}@${f.title}`).
- **[HIGH / correctness]** `src/lib/gha-validator/engine.ts:442` — pwn-request ERROR fires on text anywhere in the document — a YAML comment triggers a false alarm
  - _Repro:_ pull_request_target workflow whose only occurrence of `ref: ${{ github.event.pull_request.head.sha }}` is inside a `#` comment; the real checkout is SHA-pinned with no `ref:` (so it checks out the base ref, which is safe under pull_request_target).
  - _Impact:_ The tool's headline check reports the repo's most severe vulnerability class against a safe workflow, and anchors it to a comment line. Also fires when the dangerous ref lives in a DIFFERENT job's `env:` that never checks anything out.
  - _Fix:_ Run the check on the parsed tree: for each job under a pull_request_target trigger, find the step whose `uses` starts with `actions/checkout@` and inspect only that step's own `with.ref`. Never match raw document text.
- **[HIGH / ux]** `src/components/GhaValidatorPlayground.astro:1152` — Results panel silently goes stale — it keeps showing findings for YAML that is no longer in the editor
  - _Repro:_ Load http://localhost:4322/github-actions-validator/ (auto-validates the seeded Vulnerable example), select-all in the CodeMirror editor, type a different workflow, wait 3s without pressing Validate.
  - _Impact:_ The panel asserts a critical pwn-request vulnerability, with Line chips, about a document the user has already replaced. Plain Enter does not refresh it; only the Validate button or Ctrl/Cmd+Enter does. Violates the CLAUDE.md playground contract (live eval + 130-220ms debounce + the exact hint line 'Results update as y
  - _Fix:_ Add a ~180ms debounced EditorView.updateListener that re-runs run(), plus the contract hint line and a plain-Enter force-run. Minimum viable: dim #gha-results and set the summary to a 'Stale — press Validate' state on the first doc change after a run.
- **[HIGH / correctness]** `src/pages/github-actions-validator.astro:76` — Page FAQ claims three structural checks the engine does not implement
  - _Repro:_ Three engine runs, each with `permissions: contents: read` so no unrelated rule fires: (a) a step with both `uses:` and `run:`; (b) `needs: [does-not-exist]`; (c) `on: pusssh`.
  - _Impact:_ The FAQ answer targeting the 'what common errors break a workflow' query states 'The validator catches each of these as structural errors with the line number where the problem occurs'. Three of the five listed checks return zero findings, so the user gets a green result and pushes a workflow GitHub rejects. FAQ line 7
  - _Fix:_ Implement the three checks on the parsed tree (`step.uses && step.run`; `job.needs` values not in Object.keys(jobs); trigger names outside GitHub's fixed event list) plus a `uses:` without `@ref` error — or rewrite both FAQ answers to describe only what runs today.
- **[MEDIUM / correctness]** `src/lib/gha-validator/engine.ts:608` — One job declaring `permissions:` disables the missing-permissions check for the whole workflow  _(re-graded from high)_
  - _Repro:_ Three jobs, no top-level `permissions:`, only job `a` scopes its token. Also: a bare `permissions:` key with a null value on one job.
  - _Impact:_ Jobs b and c still run with the repository-default GITHUB_TOKEN and the tool renders 'No issues found. This workflow passed every YAML and security check.' A bare `permissions:` (null value) counts as 'declared', which is an outright bug — the key grants nothing.
  - _Fix:_ Drop anyJobDeclares. When there is no top-level `permissions:`, emit one finding per job that also lacks one, naming the job; treat a null job `permissions:` as not declared.
- **[MEDIUM / correctness]** `src/lib/gha-validator/engine.ts:544` — Unpinned-action and pipe-to-shell rules fire on YAML comments, on shell text inside run blocks, and on step names
  - _Repro:_ A workflow that references zero actions but mentions `uses:` in a `#` comment and in an echoed help string inside a `run: |` block; a workflow whose only `curl … | bash` is inside a comment; a step whose `name:` string contains `uses: foo/bar@v9`.
  - _Impact:_ Documentation comments and echoed help text produce security warnings for actions that do not exist in the workflow. Heavily-commented workflows get the noisiest results and the warning count stops meaning anything.
  - _Fix:_ Enumerate `uses` from the parsed `job.steps[].uses` and use the line scan only to locate an already-confirmed value; strip comments (respecting quoted `#`) before any raw-line scan; restrict pipe-to-shell to lines the run-block walker in checkScriptInjection already identified as run-body lines.
- **[MEDIUM / correctness]** `src/lib/gha-validator/engine.ts:127` — Untrusted-context list misses several inputs GitHub's own hardening guide names as attacker-controlled
  - _Repro:_ Five `run:` steps, each interpolating a path GitHub's 'Security hardening for GitHub Actions' guide lists as untrusted input.
  - _Impact:_ `github.event.head_commit.author.email` / `.name` is the canonical push-trigger injection vector (attacker sets their git author name to a command substitution) and `review_comment.body` is the pull_request_review_comment vector. The tool returns 'No issues found' for a live template-injection hole.
  - _Fix:_ Replace the hand-rolled alternation with an explicit allowlist of the full untrusted paths from GitHub's hardening guide, matched as `github\.event\.(?:path1|path2|...)`, and add a table test asserting each documented path trips script-injection.
- **[MEDIUM / correctness]** `src/lib/gha-validator/engine.ts:443` — A real pwn request via `merge_commit_sha` is downgraded from ERROR to a soft "review carefully" warning
  - _Repro:_ pull_request_target workflow that checks out `ref: ${{ github.event.pull_request.merge_commit_sha }}` and then runs `npm ci && npm run build`.
  - _Impact:_ The merge commit contains the fork's code, so `npm ci && npm run build` executes attacker code with the privileged token. It lands in the WARNING bucket instead of the ERROR that drives the summary count, and the remediation text tells the user to 'confirm you never execute PR-provided code' on the very workflow that d
  - _Fix:_ Add merge_commit_sha to the head-ref alternation, and cover `head.repo.full_name` used as `repository:` alongside any `ref:`. Better: once the check is on the parsed step, treat any `with.ref` under pull_request_target that is not a literal base ref as the error case.
- **[MEDIUM / a11y]** `src/components/GhaValidatorPlayground.astro:174` — The whole findings list is an aria-live region, so every validate re-reads the entire result set
  - _Repro:_ Enumerate [aria-live] inside #playground on the live page.
  - _Impact:_ run() writes renderLoading() then renderResults() into the same live container, so one Validate press queues 'Validating…' followed by the full text of every finding (title + detail + remediation for 6 rows on the default example). CLAUDE.md is explicit: 'results container is NOT aria-live; a one-line role="status" sum
  - _Fix:_ Remove aria-live="polite" aria-atomic="false" from #gha-results. #gha-summary (role="status") already carries the one-line roll-up; keep #gha-announce for clipboard feedback.
- **[MEDIUM / ux]** `src/components/GhaValidatorPlayground.astro:1166` — There is no way to copy the findings — the only Copy button copies your own input back to you
  - _Repro:_ Scan #playground for the CLAUDE.md copy hooks; click #gha-copy with the default example loaded.
  - _Impact:_ The report is the product and it is trapped in the page — pasting findings into a PR review or ticket means hand-selecting six styled cards out of the DOM. The result_copied analytics listener in Layout.astro keys on [data-copy]/[data-copy-all]/[data-copy-link] inside #playground, so copy engagement for this tool can n
  - _Fix:_ Add per-row copy buttons carrying data-copy that emit e.g. '[error] Line 19 — <title>. Fix: …', plus a 'Copy all' with data-copy-all emitting the whole report; rename the existing control to 'Copy YAML'.
- **[MEDIUM / a11y]** `src/components/GhaValidatorPlayground.astro:145` — Helper text on the dark editor slab fails WCAG AA in light theme (2.52:1) and sits flush against the card edge
  - _Repro:_ Load the page with colorScheme 'light' and compute the contrast ratio of each .gha-pane child <p> against the pane background.
  - _Impact:_ The two lines carrying the tool's privacy promise and its keyboard-escape hint are the least readable text on the page in the default light theme, and the Esc tip is the only discoverable way out of the CodeMirror tab trap. Both also touch the pane's left edge with zero padding, unlike every other row in the card.
  - _Fix:_ --color-mute is a light-theme token and must not be used on the dark-stable bg-inverse slab. Swap both paragraphs to an inverse-surface token (text-inverse-fg at reduced opacity, or a dedicated --color-inverse-mute) and add px-4 sm:px-5.
- **[MEDIUM / ux]** `src/components/GhaValidatorPlayground.astro:45` — Example picker is a <select> and the playground has none of the current chip/live-eval contract affordances
  - _Repro:_ Dump the rendered DOM; measure control heights under an isMobile/hasTouch 390px context.
  - _Impact:_ Three examples behind a dropdown means a first-time visitor never discovers the Secure and Subtle workflows — the two that show the tool distinguishes safe from unsafe. The Share Link button is always visible and will happily encode a workflow that does not parse. The 30px snapshot button is a missed tap on touch while
  - _Fix:_ Replace the <select> with three squared chips at var(--radius-pill) per IpConverterPlayground.astro (44px min-height on (pointer: coarse)); add the exact hint line 'Results update as you type — press Enter to run now.'; raise .gha-snap-btn to 44px inside a (pointer: coarse) media query; hide the Sha
- **[MEDIUM / test-coverage]** `src/lib/gha-validator/engine.ts:152` — Engine ships with zero tests despite being the security-critical half of the tool
  - _Repro:_ ls src/lib/gha-validator/
  - _Impact:_ 736 lines, 6 security rules, 8 hand-rolled regexes, no regression net. Any future edit to one of those regexes can silently flip a rule from ERROR to silent and nothing in CI notices. Every correctness defect confirmed in this audit (#1, #2, #4, #5, #6, #7, #8) is one a two-line assertion would have caught.
  - _Fix:_ Add src/lib/gha-validator/engine.test.ts with a positive and negative case per rule id; a 'comment lines never produce findings' case for each raw-line scanner; a case asserting N broken steps yield N findings at N distinct lines; and a table of GitHub's documented untrusted contexts each asserted t
- **[LOW / ux]** `src/components/GhaValidatorPlayground.astro:847` — Finding titles and details render raw markdown backticks while the Fix block renders real <code> chips
  - _Repro:_ Dump the rendered DOM of the default (Vulnerable) example and compare .gha-row__title / .gha-row__detail against .gha-fix__text in the same card.
  - _Impact:_ Every finding on screen shows literal backtick characters; the inconsistency with the correctly-formatted Fix line two rows below reads as a rendering bug rather than a style choice.
  - _Fix:_ Route f.title and f.detail through the existing remediationHtml() helper (it escapes first, then unwraps backticks, so it stays XSS-safe) and let .gha-row__title code / .gha-row__detail code inherit the .gha-fix code styling.
- **[LOW / performance]** `src/lib/gha-validator/engine.ts:296` — Validation is O(jobs x lines) — findLine() rescans the whole line array and compiles a fresh RegExp per job  _(re-graded from medium)_
  - _Repro:_ Generated workflows of the shape jobs: { job<N>: { runs-on, steps: [- run: echo …] } }, timed with performance.now() around validate() after a 5-iteration JIT warmup, median of 3 runs.
  - _Impact:_ Quadratic term is real and confirmed, but the auditor's headline figure is wrong by ~8x. At realistic sizes the cost is imperceptible (100 jobs = 22ms, 200 jobs = 74ms). It only becomes a visible freeze past ~800 jobs (0.93s) / 1600 jobs (4.0s), which exceeds what GitHub will even schedule in a single run.
  - _Fix:_ Build one Map<jobId, lineNumber> in a single pass over `lines` before the job loop (match ^\s+([\w.\-"']+)\s*: and record the first occurrence), then look jobs up in O(1). Removes the quadratic term and the per-job escapeRegExp/RegExp allocation.


### loki-alert-rule-tester

`0 critical / 4 high / 7 medium / 3 low`

> This tool is the most dangerous kind of broken: it is honest in its marketing ("preview engine", "not byte-for-byte production replay") but its failures are silent GREEN runs, not errors. Two of them are disqualifying for the tool's stated purpose — regex label matchers are never anchored (so `{ns=~"prod"}` "fires" against `namespace=production`, which real Loki would never match) and `for:` is clipped at t=0 (so `fo

- **[HIGH / correctness]** `src/lib/alertlint/engine.ts:294` — Regex label matchers are unanchored — the engine returns a green PASS for a rule Loki would never fire
  - _Repro:_ Rule `sum(count_over_time({namespace=~"prod"} |= "ERROR" [5m])) > 1`, for: 0m, labels {severity: page}; one stream `namespace: production` with ERROR lines at 1m/2m; eval_time 5m; exp_alerts one entry.
  - _Impact:_ Loki/Prometheus compile label-matcher regexes anchored (`^(?:prod)$`), so `production` never matches and the alert cannot fire in production. The tool reports a PASS. `!~` is wrong in the mirror direction: it over-excludes streams Loki would keep. Any substring-shaped matcher (`prod`, `web`, `api`) is affected, and lab
  - _Fix:_ Compile `=~`/`!~` values as `new RegExp('^(?:' + pattern + ')$')`, matching Prometheus `labels.NewMatcher`. Leave line filters (`|~`, `!~` after the selector) unanchored — those are genuinely substring/regex searches in LogQL. Cache anchored and unanchored variants under separate keys in `regexCache
- **[HIGH / correctness]** `src/lib/alertlint/engine.ts:548` — `for:` is silently ignored whenever the pending window reaches before t=0 — `for: 24h` "fires" at eval_time 5m
  - _Repro:_ Rule `sum(count_over_time({job="j"}[1h])) > 0` with `for:` set to 0m, 1h and 24h in turn; one stream `job: j` with lines at 0m and 1m; eval_time 5m; exp_alerts one entry.
  - _Impact:_ The sampling loop starts at `evalT - forSeconds` (negative for any long `for`) and discards every t < 0, so the pending window collapses to the samples that exist. promtool would report the alert as Pending, not Firing, at t=5m. Every long-`for` rule (`for: 15m`, `for: 1h` — the standard way teams debounce noisy alerts
  - _Fix:_ Before sampling, reject the case the synthetic clock cannot cover: when `forSeconds > evalT` the alert cannot have been active for the whole pending window — return `[]` and surface it in the result message ("for: 24h exceeds eval_time 5m — the alert would still be Pending"). Only clamp to 0 when `f
- **[HIGH / correctness]** `src/lib/alertlint/engine.ts:728` — `{{ $value }}` renders the maximum across all series, so every alert in a `sum by (...)` group gets another series' number
  - _Repro:_ Rule `sum by (host) (count_over_time({job="j"}[5m])) > 1` with annotation `summary: "{{ $labels.host }} had {{ $value }} hits"`; stream host h1 with 2 lines, stream host h2 with 5 lines; eval_time 5m.
  - _Impact:_ `computeRuleValue` is called once per firing alert but ignores which series fired, reducing all series to `Math.max` (engine.ts:796). h1's annotation reads "h1 had 5 hits" when h1 had 2. A user writing the correct `exp_annotations` for h1 gets a spurious failure, or copies the tool's wrong text into production. `sum` a
  - _Fix:_ Carry each firing series' own value out of `evaluateAlertRule` (add `value` to `FiringAlert`, taken from the sample at `evalT`) and pass `f.value` to `renderTemplate`. Restrict `computeRuleValue`'s max-over-all-series fallback to the case where the expression produced a single unlabeled series.
- **[HIGH / correctness]** `src/pages/loki-alert-rule-tester.astro:130` — The tool page documents a test-file format the engine cannot read (`input_series`/`values` vs `input_streams`/`logs`)
  - _Repro:_ Pasted the page's own `ruleFileExample` (lines 115-125) and `testFileExample` (lines 128-152) verbatim into `runTests`.
  - _Impact:_ The engine only reads `tc.input_streams` with a `stream:` map and `logs: ["<offset> <message>"]` (engine.ts:701, buildLogStore at :162), so the documented file loads zero log lines. The "Two files, both familiar" section is the reference a user copies from — it has a working copy button — and copying it produces a fail
  - _Fix:_ Rewrite `testFileExample` and the `input_series` mention at line 297 to the format `src/lib/alertlint/examples.ts` uses: `input_streams:` → `- stream: {app: checkout}` / `logs: ["1m ERROR …"]`. Ship the same correction to all four localized copies.
- **[MEDIUM / correctness]** `src/lib/alertlint/engine.ts:129` — parseDuration scans for any digit+unit anywhere, so `500ms` becomes 500 minutes, `1.5h` becomes 5 hours and negative durations lose their sign
  - _Repro:_ (a) rule with `for: 0s` vs `for: 500ms`, logs at 1m/59m, eval_time 60m; (b) recording rule with eval_time `1.5h`; (c) eval_time `-5m` vs `5m` control; (d) eval_time `5M`.
  - _Impact:_ `/(\d+)\s*(s|m|h|d|w)/gi` matches anywhere in the string and sums every hit, so `ms` (a legal Prometheus unit) is read as minutes — a 60000x error — `1.5h` silently evaluates at 5h, the `-` sign is dropped, and the `i` flag accepts case-variant units Prometheus rejects. All produce pass/fail verdicts the user has no re
  - _Fix:_ Validate the whole string first — `/^(\d+(ms|[smhdwy]))+$/` — and throw a specific EvalError naming the offending text otherwise. Add `ms: 0.001` and `y: 31536000` to `UNIT_SECONDS`, and drop the `i` flag so `M` is rejected rather than read as minutes.
- **[MEDIUM / correctness]** `src/lib/alertlint/engine.ts:761` — Recording rules drop their `labels:` block, so promtool-shaped `exp_samples` can never match
  - _Repro:_ Rule `- record: job:errs:count5m / expr: sum(count_over_time({app="a"}[5m])) / labels: {aggregation: count5m}`; two matching lines; `exp_samples: [{value: 2, labels: 'job:errs:count5m{aggregation="count5m"}'}]` — exactly what promtool requires.
  - _Impact:_ `evalExpr`'s series are handed straight to `compareSamples` without merging `rule.labels`, and the metric name is never part of the sample either. A recording rule that attaches labels is untestable: the promtool-correct assertion always fails, and the only way to get green is to write a bare metric name with no labels
  - _Fix:_ Before `compareSamples`, merge the rule's own labels into each series: `series.map(s => ({...s, labels: {...s.labels, ...(rule.labels ?? {})}}))`. Make `parseSampleLabels` retain the metric name (as `__name__`, or by comparing it against `recordName`).
- **[MEDIUM / correctness]** `src/lib/alertlint/engine.ts:232` — A `}` inside a quoted matcher value truncates the stream selector — regex quantifiers are rejected as invalid
  - _Repro:_ `expr: sum(count_over_time({pod=~"web-[0-9]{2}"}[5m])) > 0` — valid LogQL.
  - _Impact:_ `parseLogSelector` finds the closing brace with a naive `expr.indexOf('}', open + 1)`, so the scan stops at the `}` of the `{2}` quantifier. A whole class of legitimate selectors (`{2}`, `{1,3}`, `{4}` quantifiers in pod/instance matchers) is rejected, and the error blames the user's matcher syntax rather than the pars
  - _Fix:_ Replace the two `indexOf` calls with a quote-aware scan — the same in-quote/escape tracking `splitTopLevel` already implements at engine.ts:255 — to find the selector's real closing brace.
- **[MEDIUM / correctness]** `src/lib/alertlint/engine.ts:683` — Duplicate alert/record names silently shadow each other — only the last rule with a given name is ever tested
  - _Repro:_ Rules file with group `g1` containing `alert: A / expr: sum(count_over_time({job="j"}[5m])) > 0 / labels: {which: first}` and group `g2` containing a different `alert: A` matching `{job="nope"}` with `labels: {which: second}`. Test asserts the first rule's alert against a matching log stream.
  - _Impact:_ Rules are indexed into a flat `Map` keyed on the bare alertname, so a later group overwrites an earlier one with no warning. Same-named alerts in different groups are normal in real rulers (per-environment or per-team groups). The tester silently evaluates only one of them, so the other is reported broken when it is fi
  - _Fix:_ Key the maps by `group.name + '/' + rule.alert`, keep a list per alertname, and evaluate every rule matching the requested `alertname` — that is what Prometheus does. At minimum, throw a specific EvalError naming the duplicate.
- **[MEDIUM / ux]** `src/lib/alertlint/engine.ts:692` — A test file where no assertion is recognized reports a neutral "0 passed" instead of failing
  - _Repro:_ Deep-linked the tool with a test file whose assertion key is mistyped as `alert_rule_tests:` (plural) instead of `alert_rule_test:`.
  - _Impact:_ The only guard is on an empty `tests:` list; a test case with zero recognized assertions (typo, wrong key, YAML indentation slip) yields a clean "0 passed" in muted styling that scans as success, because `summary.classList.toggle('text-error', s.failed > 0)` (AlertLintPlayground.astro:846) keeps the mute class when `fa
  - _Fix:_ After the case loop, if `results.length === 0` return `fail('No assertions ran — each entry under `tests:` needs an `alert_rule_test:` or `recording_rule_test:` list.')`, and have the playground render "0 passed" in the error tone whenever `total === 0`.
- **[MEDIUM / a11y]** `src/components/AlertLintPlayground.astro:214` — Results container is aria-live, giving the island three live regions and re-announcing the whole result list on every run
  - _Repro:_ Loaded http://localhost:4322/loki-alert-rule-tester/ and enumerated live regions inside the playground island.
  - _Impact:_ The playground UX contract states the results container must NOT be aria-live, with exactly one role="status" one-line summary as the sole live region plus an sr-only copy-status span. Here `#al-results` has its innerHTML fully replaced by `renderLoading` then `renderResults` on every run, so a screen-reader user press
  - _Fix:_ Delete `aria-live="polite" aria-atomic="false"` from `#al-results`; keep `#al-summary` (role=status) as the sole result announcer and extend its text to a one-line verdict ("3 assertions: 2 passed, 1 failed"). Leave `#al-announce` for clipboard status only.
- **[MEDIUM / ux]** `src/components/AlertLintPlayground.astro:205` — No way to copy results out — no per-row copy, no "Copy all", and the Share button is invisible to the copy analytics
  - _Repro:_ Dumped http://localhost:4322/loki-alert-rule-tester/ and located every data-copy* attribute by byte offset relative to the #playground section bounds.
  - _Impact:_ A failing run's expected/actual diff — the payload a user needs to paste into a PR, an issue or a chat — can only be extracted by mouse-selecting rendered HTML. The contract's per-row copy buttons and `data-copy-all` are entirely absent from the playground, and `result_copied` is never emitted for this tool even when s
  - _Fix:_ Add an icon copy button per `.al-row` carrying `data-copy` with the row's name/message/diff as text, a "Copy all" button with `data-copy-all` beside the Results eyebrow, and `data-copy-link` on `#al-share` — reusing the pattern in src/components/IpConverterPlayground.astro.
- **[LOW / ux]** `src/components/AlertLintPlayground.astro:45` — Example picker is a 32px `<select>` with no coarse-pointer touch target
  - _Repro:_ Inspected the rendered picker and the component's CSS against the global coarse-pointer rule.
  - _Impact:_ `.al-select` is fixed at `height: 32px` (line 240) and the component contains no `@media (pointer: coarse)` block at all, while the global coarse rule at src/styles/global.css:594 only raises `.btn-sm`, `.btn-nav`, `.icon-btn` and `.cat-chip` — none of which the picker carries. The same applies to `.al-snap-btn` (30px)
  - _Fix:_ Add a `@media (pointer: coarse)` block giving `.al-select` and the three snapshot controls `min-height: 44px`. Optionally replace the `<select>` with squared example chips at `var(--radius-pill)` to match the reference implementation.
- **[LOW / correctness]** `src/lib/alertlint/engine.ts:480` — `!=` threshold comparisons are rejected with a diagnostic that blames the wrong part of the expression
  - _Repro:_ `expr: sum(count_over_time({job="j"}[5m])) != 0` (valid PromQL/LogQL), and separately `> 1e3`.
  - _Impact:_ `CMP_RE` omits `!=` and does not accept scientific notation, so the trailing comparison is never stripped, `evalAggOrMetric` sees an expression it cannot parse, and the whole run aborts telling the user to use `count_over_time` — which they already did. A user whose only sin is the `!=` operator is sent to debug their 
  - _Fix:_ Add `!=` to `CMP_RE` and to `compare()`, accept scientific-notation thresholds, and when a trailing comparison-shaped fragment is present but unparsed, throw a message naming it ("Unsupported comparison `!= 0` — use >, >=, <, <=, == or !=").
- **[LOW / correctness]** `src/lib/alertlint/engine.ts:500` — Log lines at exactly the window start are dropped, while the engine's own error message recommends writing them
  - _Repro:_ `- record: r / expr: sum(count_over_time({job="j"}[5m]))` with logs `"0m first"` and `"1m second"`, eval_time 5m, `exp_samples: [{value: 2, labels: 'r'}]`.
  - _Impact:_ The window is half-open `(evalT - range, evalT]`, which matches current Prometheus/Loki and is correct — but it is never explained in the UI, and the engine's own diagnostic at line 172 points users at `"0m Failed login"` as the canonical line format. Anyone who starts their synthetic stream at 0m is silently one line 
  - _Fix:_ Keep the half-open window, but stop advertising `0m` in the buildLogStore error message (use `"30s Failed login"`), and add a one-line caption under the test pane stating that a range selector covers `(eval_time - range, eval_time]`.


### cron-to-systemd

`1 critical / 2 high / 7 medium / 1 low`

> This tool is in worse shape than its polish suggests, and the missing test file is exactly why. The engine has zero tests, and the one thing it exists to do — emit a valid `OnCalendar=` — is broken for the most common cron idiom on Earth. I ran every generated expression through real `systemd-analyze` (systemd 255 in WSL): 9 of 29 ordinary crontab lines produce an OnCalendar systemd flatly refuses to parse, including

- **[CRITICAL / correctness]** `src/lib/cron-systemd/engine.ts:243` — `*/N` cron steps emit `*/N` in OnCalendar — systemd rejects it and refuses to load the timer
  - _Repro:_ convert('*/15 * * * * /opt/poll.sh') -> onCalendar '*-*-* *:*/15:00'. Also '0 */6 * * *'->'*-*-* */6:00:00', '0 0 */2 * *'->'*-*-*/2 00:00:00', '0 3 * */3 *'->'*-*/3-* 03:00:00', '0 */2 1 * *'->'*-*-01 */2:00:00'. All five are rejected by systemd.
  - _Impact:_ systemd calendar syntax requires an explicit start value before `/`; a bare `*` short-circuits before the repeat is parsed. `*/N` is the most common cron idiom and 2 of the tool's own 6 bundled examples hit it (examples.ts `poll-every-15` = `*/15 * * * * /opt/poll.sh` and `monthly-invoice` = `0 */2 1 * * /usr/bin/invoi
  - _Fix:_ Emit `${pad2(spec.min)}/${part.step}` instead of `*/${part.step}` at line 243. I verified all four corrected forms parse under systemd 255: `*-*-* *:00/15:00` (next elapse Mon 2026-07-27 18:45:00), `*-*-* 00/6:00:00`, `*-*-01/2 00:00:00`, `*-01/3-* 03:00:00`. Note examples.ts:9 already documents the
- **[HIGH / correctness]** `src/lib/cron-systemd/engine.ts:274` — Cron day-of-week ranges starting at Sunday render as `Sun..X`, an invalid systemd weekday range
  - _Repro:_ convert('0 3 * * 0-6 /usr/bin/x') -> 'Sun..Sat *-*-* 03:00:00'; '0-4' -> 'Sun..Thu'; '0-5' -> 'Sun..Fri'; named form 'SUN-THU' -> 'Sun..Thu'. All rejected by systemd. Control: '1-5' -> 'Mon..Fri' parses fine.
  - _Impact:_ systemd orders weekdays Mon..Sun and rejects any range whose start index exceeds its end, so every cron DOW range beginning at 0/SUN produces an OnCalendar systemd cannot parse and the generated .timer is refused at load. Downgraded from the reported 'critical' because it is a narrower input class than the `*/N` defect
  - _Fix:_ Do not pass cron's Sunday-first ordering through as a systemd range. Expand the cron DOW range to an explicit day set, re-sort into systemd order, and emit a comma list. When the set covers all seven days, omit the weekday component entirely.
- **[HIGH / correctness]** `src/lib/cron-systemd/engine.ts:341` — `%` in the cron command is copied verbatim into `ExecStart=`, where systemd expands it as a unit specifier
  - _Repro:_ convert('0 3 * * * /usr/bin/foo --out /var/log/b-%Y%m%d.log') -> ExecStart=/usr/bin/foo --out /var/log/b-%Y%m%d.log. The backslash form a real crontab contains, '/var/log/b-\\%Y\\%m\\%d.log', is likewise passed through as `\%Y\%m\%d`. The shell-syntax regex at line 536 `/[|&;<>$`(){}*?]/` omits `%`, so no note fires ei
  - _Impact:_ In a systemd unit `%` is the specifier escape: %Y = unit-file directory, %m = machine ID, %d = credentials directory, %H = hostname, %N = unit name. Date-stamped log/backup filenames are ubiquitous in crontabs, so the copied command either silently writes to a garbage path or hits a fatal unknown specifier. The backsla
  - _Fix:_ Escape every `%` as `%%` when writing `ExecStart=` and `Description=`, add `%` to the shell-syntax regex at line 536, and add a note covering both halves (systemd needs the doubling; in crontab an unescaped `%` truncates the command and feeds the rest to stdin).
- **[MEDIUM / correctness]** `src/lib/cron-systemd/engine.ts:262` — Cron DOW `0-7` (every day) converts to `Sun..Sun` — a valid expression that runs only on Sundays
  - _Repro:_ convert('0 3 * * 0-7 /usr/bin/x') -> onCalendar 'Sun..Sun *-*-* 03:00:00', valid=true, notes = only "Command parsed from the cron line and placed in ExecStart." systemd normalizes it to `Sun`. Control: '1-7' -> 'Mon..Sun', which systemd normalizes to every day, i.e. correct.
  - _Impact:_ In crontab `0-7` spans Sun,Mon..Sat,Sun — every day (DOW max is 7 in FIELD_SPECS, so this is explicitly in scope). The converted timer fires once a week instead of seven times. Unlike the Sun..Sat case this one parses cleanly, so nothing surfaces the change and the job quietly runs 1/7th as often after migration. Downg
  - _Fix:_ Normalize the DOW field to an explicit set of 0..6 values (folding 7 onto 0) before rendering, then emit a systemd-ordered list; a set of all seven days should drop the weekday component instead of collapsing to `Sun`.
- **[MEDIUM / correctness]** `src/lib/cron-systemd/engine.ts:438` — Pasting more than one crontab line silently folds the extra lines into ExecStart
  - _Repro:_ convert('0 3 * * * /usr/bin/a.sh\n30 4 * * * /usr/bin/b.sh') -> valid:true, onCalendar '*-*-* 03:00:00', ExecStart=/usr/bin/a.sh 30 4 * * * /usr/bin/b.sh. The only note is the generic shell-syntax one, triggered by the `*` characters rather than by the multi-line problem.
  - _Impact:_ `\s` in the split matches newlines, so lines 2..N are swallowed into the command: the generated service runs a.sh with nonsense arguments and the second job is dropped with no warning. The input is a CodeMirror editor configured with lineNumbers() and EditorView.lineWrapping (component lines 1013/1017), which visually 
  - _Fix:_ Split the raw input on newlines first, skip blank and `#` lines, and if more than one schedule line remains return a specific error ("This converts one crontab line at a time — 2 lines found.") or convert the first and note the rest were ignored. Then tokenize with `/[ \t]+/`, not `/\s+/`.
- **[MEDIUM / correctness]** `src/components/CronToSystemdPlayground.astro:853` — Unit names containing `@` or `:` disagree between the pane header and the generated unit body
  - _Repro:_ Playground sanitiseUnitName (line 853) uses `.replace(/[^A-Za-z0-9:_.@-]/g, '-')` — keeps `@` and `:`. Engine sanitizeUnitName (engine.ts:302) uses `.replace(/[^A-Za-z0-9._-]+/g, '-')` — strips them. convert('0 3 * * * /usr/bin/x', {unitName:'web@1'}) emits `Description=web-1 (converted from crontab)` and `Unit=web-1.s
  - _Impact:_ `@` (template units) and `:` are legal systemd unit-name characters, so the playground correctly allows them — but the engine rewrites them. The user saves the file as `web@1.timer` per the header while its `Unit=web-1.service` points at a service that does not exist, so `systemctl enable --now web@1.timer` cannot find
  - _Fix:_ Have the playground pass the raw value and let the engine own sanitization (one function, one character class), or widen the engine's class to `[^A-Za-z0-9:_.@-]` to match. Either way the pane header and `Unit=` must derive from the same string.
- **[MEDIUM / correctness]** `src/pages/cron-to-systemd.astro:107` — The page and its FAQPage JSON-LD promise MAILTO / environment / working-directory migration notes the engine never emits
  - _Repro:_ grep -rniE 'MAILTO|WorkingDirectory|Environment|working dir|PATH=' src/lib/cron-systemd/ => no matches in engine.ts, examples.ts or types.ts. The engine's complete note vocabulary is 9 strings: @reboot->OnBootSec, macro expansion, step approximation, DOW step expansion, DOM/DOW union, shell syntax, command parsed, abso
  - _Impact:_ The environment gap is the single most dangerous cron->systemd migration gotcha (cron gives HOME, SHELL, a PATH and CWD=$HOME; systemd gives a near-empty env and CWD=/). The page states in both pipeline step 4 and the FAQ that the converter flags this "so nothing silently changes meaning" — it does not, so the user cut
  - _Fix:_ Either add the notes (an always-on note about PATH/HOME/CWD differing under systemd, a MAILTO detection branch, and soft notes instead of hard errors for `L`/`W`/`#`/`?` vendor extensions), or delete the claims from pipeline step 4, the FAQ answers and the "Before You Cut Over" band — in all five lo
- **[MEDIUM / a11y]** `src/components/CronToSystemdPlayground.astro:288` — Three overlapping live regions announce every conversion, including the results container itself
  - _Repro:_ Rendered DOM of http://localhost:4322/cron-to-systemd/ contains three live regions: `id="cs-summary" ... role="status" aria-live="polite"`, `id="cs-notes" class="cs-notes" aria-live="polite" aria-atomic="false"` (the results container), and `id="cs-announce" class="sr-only" role="status" aria-live="polite"`. renderErro
  - _Impact:_ One Convert queues three announcements (four counting the loading state): a screen-reader user hears the whole notes panel read verbatim plus a redundant count plus a redundant confirmation, and on an error an assertive role=alert node fights a polite region over the same text. The project contract is explicit that the
  - _Fix:_ Remove `aria-live`/`aria-atomic` from `#cs-notes` and drop the `role="alert"` on the injected error node. Keep `#cs-summary` (role=status) as the only result live region and narrow `#cs-announce` to clipboard status only.
- **[MEDIUM / ux]** `src/components/CronToSystemdPlayground.astro:42` — No live evaluation, no debounce, no hint line, and a <select> where the contract requires example chips
  - _Repro:_ grep -c 'Results update as you type' => 0. grep -ci debounce => 0. grep -c 'data-example' in the live DOM => 0. The rendered DOM contains `<select id="cs-example" class="cs-select code-mono" autocomplete="off">`. The only paths to a result are `convertBtn.addEventListener('click', ...)` (line 1254) and the Ctrl/Cmd+Ent
  - _Impact:_ Editing a cron field shows a stale result until the user notices the Convert button, and picking an example from the dropdown clears the output instead of demonstrating anything. Diverges from the contract and from every reworked playground on the site (ip-converter / cidr-checker / subnet-calculator).
  - _Fix:_ Replace the <select> with squared example chips at var(--radius-pill), convert on selection, add a ~150ms debounced live eval with the exact hint line "Results update as you type — press Enter to run now.", and make plain Enter force an immediate eval (Ctrl/Cmd+Enter keeps run+blur).
- **[MEDIUM / mobile]** `src/components/CronToSystemdPlayground.astro:444` — Copy buttons are 28px tall with no coarse-pointer sizing, on the only path to getting the output out
  - _Repro:_ grep -c 'pointer: coarse' src/components/CronToSystemdPlayground.astro => 0, versus 2 in the reference IpConverterPlayground.astro. The `.cs-copy` rule block opens at line 444 and sets `height: 28px;` at line 448 with no coarse-pointer override anywhere in the file.
  - _Impact:_ On a phone the two Copy buttons are the sole practical way to extract the generated units (the read-only CodeMirror panes are awkward to text-select), and they are 28px — well under the 44px the project contract mandates for (pointer: coarse) and under Apple/Google 44/48px guidance. The snapshot delete button and the e
  - _Fix:_ Add a `@media (pointer: coarse)` block raising .cs-copy, .cs-snap-btn, .cs-snap-delete, .cs-select and .cs-text to min-height:44px, mirroring the two coarse-pointer blocks in IpConverterPlayground.astro.
- **[LOW / ux]** `src/components/CronToSystemdPlayground.astro:1113` — Typing in the Unit name field wipes the results on every keystroke
  - _Repro:_ unitInput.addEventListener('input', () => { syncNames(); resetOutput(); }) at lines 1113-1116. resetOutput() (lines 1093-1100) calls setEditorDoc(timerView,'') and setEditorDoc(serviceView,''), sets copyTimerBtn.disabled = true and copyServiceBtn.disabled = true, sets onCalendarEl.textContent = '—', and calls renderEmp
  - _Impact:_ The unit name is a field almost every user will touch, and touching it destroys the result they came for — including the OnCalendar answer, which does not depend on the unit name at all. Downgraded from the reported 'medium' because the comment at lines 1110-1112 shows this is a deliberate, documented pattern consisten
  - _Fix:_ Re-run convertNow() on a short debounce after unit-name input instead of calling resetOutput() — the conversion is pure and instant, so regenerate rather than blank. At minimum leave `#cs-oncalendar` populated, since it is independent of the unit name.


### reverse-dns-ptr

`1 critical / 1 high / 8 medium / 2 low`

> The PTR helper is the weakest-tested tool in the networking family and it shows: with no engine.test.ts, three genuine wrong-answer paths shipped. The worst is a delegation-logic bug — the engine's `else` branch assumes any non-octet IPv4 prefix must be finer than /24, so every prefix from /1 to /23 that isn't a multiple of 8 (including 172.16.0.0/12 and AWS-standard /20s) gets handed a single enclosing-/24 zone plus

- **[CRITICAL / correctness]** `src/lib/ptr-helper/engine.ts:70` — Non-octet IPv4 prefixes shorter than /24 return a reverse zone from the wrong level of the tree, with a false RFC 2317 claim
  - _Repro:_ generate('172.16.0.0/12') via vitest, and typed live into #ptr-input at http://localhost:4322/reverse-dns-ptr/
  - _Impact:_ Every IPv4 prefix /1-/23 that is not a multiple of 8 (incl. RFC 1918 172.16.0.0/12 and AWS-standard /20 VPC subnets) is told its reverse zone is a single /24 - 1/4096th of a /12 - and that RFC 2317 applies. RFC 2317 s1 scopes classless delegation to 'address spaces covering fewer than 256 addresses', i.e. prefixes LONG
  - _Fix:_ Split the else branch: keep enclosing-/24 + RFC 2317 note only for c.prefix > 24; for c.prefix < 24 && c.prefix % 8 !== 0 round DOWN to Math.floor(c.prefix/8) octet labels and replace the note with a sibling-zone-count note (2^(8*ceil(prefix/8)-prefix) zones, naming first and last). Never emit the R
- **[HIGH / correctness]** `src/lib/ptr-helper/engine.ts:107` — Prefix 0 and sub-nibble IPv6 prefixes emit malformed or silently wrong reverse zone names
  - _Repro:_ generate('2001:db8::/2'), generate('::/0'), generate('0.0.0.0/0') under vitest; same three typed into the live playground.
  - _Impact:_ '.ip6.arpa' with a leading dot is not a syntactically valid DNS name and ships with a copy button next to it. '0.0.0.0/0' - the default route, a routine paste - yields '0.0.0.in-addr.arpa', a real but unrelated zone (the reverse of 0.0.0.0/24), with no note at all because engine.ts:59 guards `c.prefix > 0` and drops /0
  - _Fix:_ Guard nibbleCount === 0 and c.prefix === 0 explicitly and return the bare apex plus an 'entire reverse tree' note, instead of slice(0,0) producing a leading dot or falling into the enclosing-/24 branch.
- **[MEDIUM / correctness]** `src/pages/reverse-dns-ptr.astro:104` — Worked Examples block on the page promises an RFC 2317 zone name the tool never produces
  - _Repro:_ Read src/pages/reverse-dns-ptr.astro lines 98-105, then filled '198.51.100.64/26' into the live #ptr-input and read the rendered .ptr-row values.
  - _Impact:_ The page's reference block states the correct RFC 2317 delegated-zone form for the exact input a user is most likely to try, but the playground ~800px above prints only the enclosing /24. The reader either concludes the tool is broken or copies the plain /24 and never creates the CNAME chain RFC 2317 requires.
  - _Fix:_ Emit an 'RFC 2317 delegated zone' row from the engine for prefixes longer than /24 - `${lastNetOctet}/${prefix}.${o3}.${o2}.${o1}.in-addr.arpa` - keeping the enclosing /24 as the parent zone, so page and tool agree.
- **[MEDIUM / ux]** `src/lib/ptr-helper/engine.ts:21` — Every invalid input returns the same generic message - no specific diagnostic
  - _Repro:_ generate() over 14 distinct malformed inputs under vitest; 3 of them re-driven live and read from .ptr-error__detail.
  - _Impact:_ The playground UX contract requires specific diagnostics ('Octet 256 is greater than 255.'), and the sibling engine that parses the same strings already has them. A user who types '192.0.2.1/33' or pastes a link-local with a %eth0 zone ID learns nothing about which part failed.
  - _Fix:_ Route parse failures through the diagnoseIPv4 helper already written in src/lib/ip-converter/engine.ts:92-114, and add explicit cases for an out-of-range prefix and for an IPv6 zone ID.
- **[MEDIUM / ux]** `src/components/PtrHelperPlayground.astro:563` — Red error border and error card flash mid-composition, 140ms after each keystroke
  - _Repro:_ Playwright: click #ptr-input, fill '', type '192.0.2.' with 30ms delay, wait 220ms, then read the error-card count, input className and #ptr-summary.
  - _Impact:_ Violates the calm-errors rule in the playground contract (hold the error until ~600ms idle, blur or Enter). Typing a plain IPv4 address flashes the field red and swaps the result card for an error card several times before the address is complete.
  - _Fix:_ Keep the 140ms debounce for the success path but gate the error path behind a separate ~600ms idle timer (or blur/Enter), leaving the last good card on screen. src/components/IpConverterPlayground.astro is the reference.
- **[MEDIUM / ux]** `src/components/PtrHelperPlayground.astro:584` — Enter does not force an evaluation, Ctrl/Cmd+Enter does not blur, and the required hint line is missing
  - _Repro:_ Playwright: set #ptr-input.value='8.8.8.8' and dispatch 'input' (starting the 140ms debounce), immediately press Enter, read .ptr-row; then wait 400ms and read again. Separately focus the input, press Control+Enter, read document.activeElement.id. Then read #ptr-input-hint.innerText.
  - _Impact:_ There is no keydown listener at all on the input, so the entire Enter contract is unimplemented. On a phone the user cannot dismiss the keyboard by pressing Go. The page also never states that it evaluates live, so the missing Run button reads as a broken page for the first ~140ms.
  - _Fix:_ Add the keydown handler from src/components/IpConverterPlayground.astro:1210 (Enter -> preventDefault, clearTimeout, evaluate immediately, blur when `(pointer: coarse)` matches) and append 'Results update as you type - press Enter to run now.' to #ptr-input-hint.
- **[MEDIUM / a11y]** `src/components/PtrHelperPlayground.astro:85` — Results container is aria-live, giving the page two competing live regions
  - _Repro:_ Playwright $$eval over '#playground [aria-live]' on the live page, cross-checked against the raw --dump-dom.
  - _Impact:_ The contract states the results container must NOT be aria-live and that the one-line role=status summary is the sole live region. As shipped a screen-reader user hears the one-word summary AND the entire re-rendered result card (111 chars for IPv4, ~200 for an IPv6 nibble name) after every 140ms debounce tick while ty
  - _Fix:_ Delete aria-live="polite" aria-atomic="false" from #ptr-results and let #ptr-summary carry the sole live region, matching #ipc-results / #ipc-summary.
- **[MEDIUM / ux]** `src/components/PtrHelperPlayground.astro:20` — Examples are a <select> dropdown instead of the required example chips
  - _Repro:_ Playwright $$eval counts for '#playground select#ptr-example' vs '#playground [data-example], #playground .chip, #playground [data-chip]', plus the option list and the seeded first result.
  - _Impact:_ Direct violation of the playground UX contract (squared 6px chips, not a <select>). Functionally it hides the tool's range: the visitor sees only the bare IPv4 host and never discovers the /24 zone, IPv6 host and /48 nibble-zone cases, which are where the tool earns its keep. The seeded default is the weakest of the fo
  - _Fix:_ Replace the select with the chip row used by IpConverterPlayground/CidrCheckerPlayground (squared 6px chips, brand-soft active state, 44px min-height under `(pointer: coarse)`) and seed the /24 zone example so the reverse-zone row is meaningful on first paint.
- **[MEDIUM / mobile]** `src/components/PtrHelperPlayground.astro:309` — Copy buttons are 28x28 under a coarse pointer - well under the 44px touch target the contract requires
  - _Repro:_ Playwright context devices['Pixel 5'] + hasTouch:true, isMobile:true, viewport 390x800; measured getBoundingClientRect on .ptr-copy-btn and #ptr-snap-save with matchMedia('(pointer: coarse)') asserted true.
  - _Impact:_ Copying is the entire point of the tool and on a phone it is a 28px icon button sitting next to a wrapped 63-character IPv6 name - the hardest thing to hit on the device where retyping a 32-nibble name is least feasible.
  - _Fix:_ Add a @media (pointer: coarse) block raising .ptr-copy-btn, .ptr-snap-btn and .ptr-snap-delete to min-height: 44px; min-width: 44px, mirroring the coarse-pointer rules already in IpConverterPlayground.astro.
- **[MEDIUM / ux]** `src/components/PtrHelperPlayground.astro:496` — No "Copy all" and no "Copy link" - the tool can be deep-linked into but cannot produce a shareable link or export the whole card
  - _Repro:_ Playwright $$eval counts for '#playground [data-copy-all]' and '#playground [data-copy-link]' after a valid eval, plus location.hash and an enumeration of '#playground .sr-only'; cross-checked by counting the literal substrings in the full --dump-dom.
  - _Impact:_ Three contract affordances missing at once. The IP Address Converter ships a 'Build PTR record' chip that deep-links INTO this tool with #ip=, but this tool cannot hand a link back to a colleague, cannot copy PTR name + zone + dig command in one action, and gives blind users no confirmation that a copy succeeded. (Note
  - _Fix:_ Add a data-copy-all button joining rows as label\tvalue lines, a data-copy-link button hidden until a valid result that builds buildIpHash(value), write the hash with the Safari-guarded replaceState memo on valid user-initiated evals only, and add an sr-only role="status" copy-status span like #ipc-
- **[LOW / correctness]** `src/lib/ptr-helper/engine.ts:42` — Leading-zero octets are silently read as decimal, contradicting the sibling tool that warns about the same input
  - _Repro:_ generate('192.0.2.010') and generate('010.0.0.1') under vitest; '192.0.2.010' re-driven live through #ptr-input.
  - _Impact:_ inet_aton-style parsers read '010' as octal 8 and Python/Go's address parsers reject it outright; this tool silently picks a third answer (decimal 10) and prints a confident PTR name for a different host. The site is also self-inconsistent - the ip-converter warns about the identical string.
  - _Fix:_ Reuse leadingZeroWarnings() from src/lib/ip-converter/engine.ts:117-126 and surface it as a Note row here, so both tools give the same answer and the same caveat for the same string.
- **[LOW / test-coverage]** `src/lib/ptr-helper/engine.ts:38` — Engine has zero tests - the confirmed correctness bugs are in untested branches  _(re-graded from medium)_
  - _Repro:_ Directory listing of src/lib/ptr-helper/ and of every networking sibling engine directory.
  - _Impact:_ Real but not user-facing, and it double-counts #1/#2 which already report the actual defects - hence downgraded from medium to low. The finding's supporting claim is ALSO partly false: ptr-helper is NOT 'the only engine in the networking family with no test file' - mac-formatter and subnet-splitter also ship without en
  - _Fix:_ Create src/lib/ptr-helper/engine.test.ts with vectors from RFC 1035 s3.5 (in-addr.arpa), RFC 3596 s2.5 (ip6.arpa) and RFC 2317 s4 (192.0.2.0/25 -> 0/25.2.0.192.in-addr.arpa), plus a boundary table over IPv4 /0-/32 and IPv6 /0-/128 asserting the zone label count.


### base64-encoder-decoder

`0 critical / 2 high / 8 medium / 2 low`  ·  1 claim(s) rejected by the verifier

> The engine's core base64 arithmetic is correct — I could not break bytesToBase64 or the padded-group decoder on boundaries, UTF-8 multibyte, or 3 MB inputs, and the RFC 4648 vectors hold. The damage is all at the edges of the decoder's permissiveness: it swallows -/_ unconditionally, so a pasted PEM certificate or a single stray hyphen produces a confident wrong answer instead of an error, and it decodes non-UTF-8 by

- **[HIGH / correctness]** `src/lib/base64-codec/engine.ts:118` — Decode blanket-remaps - and _ to +/ with no mixed-alphabet or PEM guard, so a pasted PEM block reports a clean 73-byte success  _(re-graded from critical)_
  - _Repro:_ Engine: convert('-----BEGIN CERTIFICATE-----\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA1234\n-----END CERTIFICATE-----','decode',false). Live: http://localhost:4322/base64-encoder-decoder/ in Decode mode with the same paste.
  - _Impact:_ The 27 armor dashes become base64url '+', so the whole PEM is syntactically valid base64url and decodes to mojibake the UI presents as success: summary '73 bytes', brand-green note 'url-safe input detected; padding restored.', no error card, Copy enabled. One stray hyphen behaves the same: convert('aGVs-G8=','decode',f
  - _Fix:_ Gate the -/_ remap: if the input contains BOTH [-_] and [+/], or matches /^-{5}(BEGIN|END) /m before whitespace stripping, return a specific error ('That looks like a PEM block - remove the -----BEGIN/END----- lines and decode just the body.'). Making the URL-safe checkbox authoritative in Decode mo
- **[HIGH / correctness]** `src/lib/base64-codec/engine.ts:139` — Non-UTF-8 payloads decode to silent U+FFFD mojibake with a confident byte count and no warning
  - _Repro:_ Decode mode, input 'iVBORw0KGgo=' (PNG magic 89 50 4E 47 0D 0A 1A 0A).
  - _Impact:_ Engine returns valid:true, bytes:8, no note; 0x89 becomes U+FFFD. The rendered <pre> additionally loses the 0x0D (HTML newline normalisation), so 8 claimed bytes display as 7 characters. Re-encoding what the tool shows yields '77+9UE5HDQoaCg==' != 'iVBORw0KGgo=' — Copy hands the user permanently corrupted data under a 
  - _Fix:_ Second pass with TextDecoder('utf-8',{fatal:true}) in a try/catch; on failure keep the lossy render but raise a warning tier: 'This payload is not valid UTF-8 - the text below is lossy and will not re-encode to the same base64.' FAQ #8 already admits the tool is text-only, so the warning belongs nex
- **[MEDIUM / ux]** `src/components/Base64Playground.astro:770` — In Decode mode the "Hash this text" chip hands the Hash Generator the base64 input, not the decoded text displayed above it  _(re-graded from high)_
  - _Repro:_ Decode mode, input 'aGVsbG8gd29ybGQ='; result body shows 'hello world'; click the 'Hash this text ->' chip rendered under that result.
  - _Impact:_ writeHandoff(input.value.trim()) always sends the raw input, so Hash Generator is seeded with 'aGVsbG8gd29ybGQ=' while the chip sat under 'hello world' — the user gets SHA-256 of the base64, not the plaintext. Downgraded from high because the substituted value is plainly visible in #hash-input on arrival: recoverable, 
  - _Fix:_ writeHandoff(mode === 'decode' ? lastOutput : input.value.trim()) for the hash-generator chip only (the JWT chip legitimately wants the raw token), or relabel per mode ('Hash the decoded text').
- **[MEDIUM / correctness]** `src/lib/base64-codec/engine.ts:135` — "Its length is not a valid encoding" is returned for inputs whose length is a perfectly valid multiple of 4
  - _Repro:_ convert('aGVsbG8=aGVsbG8=','decode',false) — two concatenated blobs, length 16, 16 % 4 === 0.
  - _Impact:_ The diagnostic states something factually false about the user's input. base64ToBytes returns null for mid-string '=' padding and the caller can only distinguish in-alphabet from out-of-alphabet, so every in-alphabet structural failure is reported as a length problem. The playground UX contract requires specific diagno
  - _Fix:_ Have base64ToBytes return a reason code: length % 4 !== 0 / '=' before the final group / character outside the alphabet, each with its own message ('Padding (=) appears at character 8, but = is only allowed at the very end.').
- **[MEDIUM / correctness]** `src/lib/base64-codec/engine.ts:114` — Non-ASCII (and two ASCII) whitespace characters are not stripped, contradicting the "whitespace is ignored" hint, and produce a bogus length error
  - _Repro:_ Insert one character at index 8 of the valid string 'aGVsbG8gd29ybGQ=' and decode.
  - _Impact:_ SPACE/TAB/LF/CR strip and decode to 'hello world'; NBSP (U+00A0), FF (U+000C), VT (U+000B), U+2028, NNBSP (U+202F) and ZWSP (U+200B) all fail — with 'its length is not a valid encoding', blaming the length rather than naming the invisible character. The hint directly under the input (Base64Playground.astro:101-105) pro
  - _Fix:_ Strip with /\s+/gu plus the zero-width set, and when a non-alphabet character survives report its position and codepoint: 'Character 9 is U+00A0 (no-break space), which is not part of the base64 alphabet.'
- **[MEDIUM / a11y]** `src/components/Base64Playground.astro:147` — The results container is aria-live, so every debounce tick re-announces the whole decoded payload and errors are announced twice
  - _Repro:_ Enumerate live regions inside #playground on the rendered page.
  - _Impact:_ DIV#b64-output carries aria-live="polite" with no role, alongside the legitimate SPAN#b64-summary (role=status) and SPAN#b64-announce (sr-only copy status). renderError() then injects <div class="b64-error" role="alert"> INSIDE that polite region, so a failure is announced twice. The whole result body lives in the live
  - _Fix:_ Remove aria-live/aria-atomic from #b64-output; extend #b64-summary to carry the one-line verdict; drop role="alert" from the injected error div.
- **[MEDIUM / ux]** `src/components/Base64Playground.astro:804` — Enter and Ctrl/Cmd+Enter are not wired, and the contract's run-hint line is absent
  - _Repro:_ Encode mode: clear the input, type 'hi', press Enter, then Control+Enter.
  - _Impact:_ No keydown listener exists anywhere in the file. 50 ms after Enter the output is still the stale 'aGk='; after the 140 ms debounce it becomes 'aGkK' because the newline landed in the textarea and got encoded. Control+Enter neither forces a run nor blurs (activeElement stays 'b64-input'), so on mobile there is no way to
  - _Fix:_ Add a keydown handler mirroring IpConverterPlayground: plain Enter -> clearTimeout(timer) + setTimeout(evaluate, 0); Ctrl/Meta+Enter -> evaluate() then input.blur(). Add the exact hint line to #b64-input-hint.
- **[MEDIUM / mobile]** `src/components/Base64Playground.astro:359` — No (pointer: coarse) rules at all — every control is 16-30 px tall on touch
  - _Repro:_ Playwright context 390x844, hasTouch:true, isMobile:true; matchMedia('(pointer: coarse)') === true; getBoundingClientRect() on each control.
  - _Impact:_ Measured: #b64-copy 67x28, #b64-clear 54x26, #b64-mode .b64-seg__btn 76x28, #b64-urlsafe 16x16, #b64-snap-save 105x30, .b64-chip 111x26. Only #b64-example (320x44) and #b64-snap-select (133x44) reach 44 px, and only via the native select default. The contract's 44 px coarse minimum applies to chips and copy buttons; th
  - _Fix:_ Add the @media (pointer: coarse) block from IpConverterPlayground.astro: min-height 44px on .b64-copy, .b64-clear, .b64-seg__btn, .b64-snap-btn, .b64-snap-delete, .b64-chip, and pad .b64-check so the whole row is the hit area.
- **[MEDIUM / ux]** `src/components/Base64Playground.astro:751` — Red error border and error card flash after 140 ms mid-composition instead of holding for ~600 ms idle
  - _Repro:_ Decode mode, empty input, type 'aGVsbG8=' one character at a time with a 200 ms pause (DEBOUNCE_MS = 140 at line 555, so every pause fires an eval).
  - _Impact:_ Every prefix whose length % 4 === 1 renders the full red state while the user is still composing valid base64 — roughly one keystroke in four. Measured: 'a' -> red + 'That base64 is malformed - its length is not a valid encoding.'; 'aG','aGV','aGVs' -> clean; 'aGVsb' -> red + same error; 'aGVsbG','aGVsbG8','aGVsbG8=' -
  - _Fix:_ Split the timers: keep 140 ms for rendering successful results, gate the error path behind a ~600 ms idle timer flushed on blur and Enter, and leave the previous result and neutral border in place until it fires.
- **[MEDIUM / performance]** `src/components/Base64Playground.astro:726` — A 2 MB input blocks the main thread ~2 s and dumps 2.67 M characters into one <pre> with no cap
  - _Repro:_ In the live page set #b64-input.value = 'x'.repeat(2_000_000) and dispatch an input event; time until .b64-result__body code is populated.
  - _Impact:_ Measured 1955 ms from the input event to the rendered result, with 2,666,668 characters in a single <pre><code>. Node-side engine cost for the same size is only 182 ms encode / 48 ms decode, so the bulk is escapeHtml + innerHTML + layout — and it repeats on every 140 ms debounce tick, so any further typing re-freezes t
  - _Fix:_ Cap the rendered body (~50 000 chars) with a 'showing first 50 000 of N characters - Copy still copies all of it' note, keeping the full string in lastOutput; optionally raise the debounce above ~100 KB.
- **[LOW / ux]** `src/lib/base64-codec/engine.ts:111` — The URL-safe checkbox has no effect in Decode mode but stays enabled with no caption saying so  _(re-graded from medium)_
  - _Repro:_ convert('aGVsbG8=','decode',false) vs convert('aGVsbG8=','decode',true); also convert('Pj4+Pw==','decode',true) with a standard-alphabet-only string.
  - _Impact:_ The urlSafe parameter is never read below the decode divider — the two calls are byte-identical (JSON.stringify equal) and a '+'-bearing standard string still decodes with URL-safe checked. Flipping the toggle changes nothing. Downgraded to low because the hint immediately under the input (Base64Playground.astro:102-10
  - _Fix:_ Disable it in Decode mode with a caption ('Decoding accepts both alphabets automatically'), or make it authoritative — reject a literal '+' or '/' when checked and '-'/'_' when unchecked, which also closes #1.
- **[LOW / test-coverage]** `src/lib/base64-codec/engine.test.ts:53` — engine.test.ts covers none of the failure modes above and asserts only error truthiness
  - _Repro:_ npx vitest run src/lib/base64-codec/engine.test.ts --reporter=verbose, then compare with the probe's coverage of the failure space.
  - _Impact:_ Both decode-failure tests assert only expect(result.error).toBeTruthy(), so an error message naming the wrong cause (#4, #5) passes CI. Nothing pins alphabet-detection, so the PEM/mixed-alphabet acceptance (#1) is invisible to CI, and nothing asserts what happens to a non-UTF-8 payload (#2). Non-canonical trailing bits
  - _Fix:_ Assert the exact error string per failure class, add a PEM/mixed-alphabet case, a non-UTF-8 case (once the warning exists), and the full whitespace table.

  _Rejected:_ “The page and its JSON-LD advertise "padding controls" and "both alphab” — Both halves fail on inspection of the rendered page. (a) 'Both alphabets side by side' DOES exist: src/pages/base64-encoder-decoder.astro:95-98 and 100-108 render an Alphabet Refer


### env-example-checker

`0 critical / 2 high / 7 medium / 2 low`

> The shell around this tool is well made — the seeded Node example renders a genuinely useful two-direction drift report on load, the mobile tabbed layout has zero horizontal overflow at 390px, XSS is fully closed (both the used-var and example-key charsets are restricted to `[A-Za-z_][A-Za-z0-9_]*`, and every injection additionally goes through `escapeHtml`), CodeMirror binds Escape to release focus, performance is f

- **[HIGH / correctness]** `src/lib/env-checker/engine.ts:50` — Shell `$NAME` detection is advertised in 4 user-visible places and in JSON-LD, but ACCESS_PATTERNS has no shell pattern — a correctly-synced shell project reports 100% drift
  - _Repro:_ check('#!/bin/sh\npsql "$DATABASE_URL"\ncurl -H "Bearer $API_TOKEN" https://x\n', 'DATABASE_URL=\nAPI_TOKEN=\n')
  - _Impact:_ A user pasting a shell script, Dockerfile, docker-compose or CI script — exactly what the page says the tool handles — is told every correctly-declared key is unused under the label "Safe to remove if truly unused." Acting on the report deletes required keys from .env.example, the precise failure the tool exists to pre
  - _Fix:_ Either add shell patterns to ACCESS_PATTERNS (e.g. /\\$\\{([A-Za-z_][A-Za-z0-9_]*)[:\\-}]/g plus /\\$([A-Za-z_][A-Za-z0-9_]*)\\b/g, ideally gated on the pasted code looking like shell), or delete the `$NAME` claim from src/pages/env-example-checker.astro lines 83, 96, 266 and 324 and the correspondi
- **[HIGH / correctness]** `src/lib/env-checker/engine.ts:52` — `const { X } = process.env` destructuring is undetected, so the most common Node idiom reports every key as unused
  - _Repro:_ check('const { DATABASE_URL, STRIPE_SECRET_KEY } = process.env;', 'DATABASE_URL=\nSTRIPE_SECRET_KEY=\n') and check('const a = process.env?.PORT;', 'PORT=\n')
  - _Impact:_ Destructuring off process.env is standard in Node/Next config modules, and `process.env?.X` is common in TS. Both invert the answer and recommend deleting keys the code requires. Note the FAQ (line 41) enumerates only `process.env.NAME` / `process.env["NAME"]`, so destructuring is arguably outside the literally-documen
  - _Fix:_ Add a destructuring pattern that captures the binding list then splits it, e.g. /(?:const|let|var)\\s*\\{([^}]*)\\}\\s*=\\s*process\\.env\\b/g, extracting each identifier appearing before `:`, `=` or `,` in group 1. Also relax `process\\.env\\.` to `process\\.env\\??\\.` to cover optional chaining.
- **[MEDIUM / correctness]** `src/lib/env-checker/engine.ts:149` — Multiline quoted values in .env.example fabricate phantom keys that are then reported as safe to delete
  - _Repro:_ check('const k = process.env.PRIVATE_KEY;', 'PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA=x\n-----END RSA PRIVATE KEY-----"\n')
  - _Impact:_ collectExampleVars is line-stateless, so any wrapped line inside a quoted multiline value whose first token is an identifier followed by `=` becomes an invented "declared key". Because base64 uses `=` as padding this is easy to hit with PEM keys, service-account JSON and certificates, which dotenv officially supports. 
  - _Fix:_ Make collectExampleVars stateful: when a matched line's value opens an unterminated `"` or `'`, skip subsequent lines until the matching closing quote before resuming key extraction, mirroring dotenv's multiline rule.
- **[MEDIUM / correctness]** `src/components/EnvCheckerPlayground.astro:1316` — With "Live check" off, edits leave a confidently-rendered stale report and plain Enter does not refresh it
  - _Repro:_ Turn the Live check toggle off, replace both editor docs, press Enter. The report and summary keep rendering the previous input's result, and the copy buttons still emit the previous input's keys.
  - _Impact:_ The stale report carries no visual signal, and `lastMissing` still holds the old keys so Copy-all emits `STRIPE_SECRET_KEY=` for a file that has nothing to do with it. Plain Enter — the contract's designated manual-run escape hatch — is a no-op; only the Check button and Ctrl/Cmd+Enter re-run. Downgraded from high beca
  - _Fix:_ On any doc change while live is off, mark the report stale (e.g. an `.is-stale` class dimming the groups plus a summary of "Edited — press Check") and clear `lastMissing` so copy buttons cannot emit keys from a previous input. Additionally bind plain Enter to force an immediate run per the playgroun
- **[MEDIUM / correctness]** `src/lib/env-checker/engine.ts:94` — A UTF-8 BOM on .env.example silently drops the first key, producing a false "Missing from .env.example"
  - _Repro:_ check('const db = process.env.DATABASE_URL; const p = process.env.PORT;', ' DATABASE_URL=postgres://x\nPORT=3000\n')
  - _Impact:_ ENV_LINE's leading-whitespace class is `[ \t]*`, which does not admit U+FEFF, so the first line never matches. The BOM is invisible in the editor, so the user sees DATABASE_URL on line 1 and the tool insisting it is missing, with no explanation. Windows tooling (PowerShell `>` / `Out-File`, several editors) writes BOM-
  - _Fix:_ Strip a leading BOM once in check() before parsing: `const example = (typeof envExample === 'string' ? envExample : '').replace(/^ /, '')`. Optionally also admit U+FEFF in ENV_LINE's leading class.
- **[MEDIUM / correctness]** `src/lib/env-checker/engine.ts:71` — Go `os.LookupEnv` and Python `os.environ.setdefault` / bare `environ[...]` are undetected, and the code comment falsely claims LookupEnv coverage
  - _Repro:_ check('v, ok := os.LookupEnv("DATABASE_URL")\nr := os.Getenv("REDIS_URL")', 'DATABASE_URL=\nREDIS_URL=\n') and check('os.environ.setdefault("DJANGO_SETTINGS_MODULE", "app.settings")\nval = os.environ.get(\'CACHE_URL\')\nx = environ["FROM_IMPORT"]', 'DJANGO_SETTINGS_MODULE=\nCACHE_URL=\nFROM_IMPORT=\n')
  - _Impact:_ `os.LookupEnv` is the idiomatic Go form for optional variables and `os.environ.setdefault("DJANGO_SETTINGS_MODULE", …)` is the first executable line of every Django manage.py / wsgi.py; `from os import environ` then `environ["X"]` is common Python style. Each yields the inverted "Safe to remove if truly unused" verdict
  - _Fix:_ Add /os\\.LookupEnv\\(\\s*["'`]([A-Za-z_][A-Za-z0-9_]*)["'`]/g, /os\\.environ\\.setdefault\\(\\s*["'`]([A-Za-z_][A-Za-z0-9_]*)["'`]/g and a bare /\\benviron(?:\\[|\\.get\\()\\s*["'`]([A-Za-z_][A-Za-z0-9_]*)["'`]/g, and delete the false LookupEnv comment.
- **[MEDIUM / a11y]** `src/components/EnvCheckerPlayground.astro:198` — The results container is itself an aria-live region, violating the playground a11y contract
  - _Repro:_ Load http://localhost:4322/env-example-checker/ and inspect #ec-report's attributes.
  - _Impact:_ The contract states the results container must NOT be aria-live, with a single one-line role="status" summary as the sole live region plus an sr-only copy-status span. Here #ec-summary (role=status), #ec-report (aria-live) and #ec-announce (role=status) are all live. With Live check on, every debounce tick replaces #ec
  - _Fix:_ Remove `aria-live="polite" aria-atomic="false"` from #ec-report (line 198). Keep #ec-summary as the single live summary and #ec-announce for copy status.
- **[MEDIUM / ux]** `src/components/EnvCheckerPlayground.astro:39` — Playground UX contract: `<select>` example picker instead of chips, missing live-eval hint line, 320 ms debounce, and plain Enter does not force a run
  - _Repro:_ Load http://localhost:4322/env-example-checker/ and search the playground for the contract hint string; inspect #ec-example; press Enter in an editor.
  - _Impact:_ Four simultaneous deviations from the IpConverterPlayground reference: the picker is a native select so options are hidden behind a click rather than shown as chips, the required hint string is absent so nothing tells the user live-check exists or how to force a run, the debounce is 320 ms rather than the specified ~13
  - _Fix:_ Replace the <select> with squared example chips at var(--radius-pill), add the exact hint line under the editors, drop LIVE_DEBOUNCE_MS to ~180, and bind plain Enter while keeping Ctrl/Cmd+Enter to run-and-blur.
- **[MEDIUM / mobile]** `src/components/EnvCheckerPlayground.astro:590` — Copy, Copy-all, snapshot and Live-check controls are 18–30 px on coarse pointers — no `(pointer: coarse)` rule reaches them
  - _Repro:_ Open http://localhost:4322/env-example-checker/ on a touch viewport and measure .ec-copy, .ec-copyall, .ec-snap-btn, .ec-snap-delete and .ec-live-track.
  - _Impact:_ The contract requires 44px min-height on (pointer: coarse). The per-row COPY button — the only way to lift the missing keys out on a phone — is a fixed 26px, and the Live-check switch that governs whether the report refreshes at all has an 18px hit area, which compounds the stale-report defect above.
  - _Fix:_ Add `@media (pointer: coarse) { .ec-copy, .ec-copyall, .ec-snap-btn, .ec-snap-delete, .ec-snap-select { min-height: 44px; } .ec-live { min-height: 44px; align-items: center; } }` to the component's style block.
- **[LOW / test-coverage]** `src/lib/env-checker/engine.ts:171` — The engine has no test file despite CLAUDE.md mandating engine.test.ts for every tool
  - _Repro:_ ls C:/Users/PUSHKAR/Desktop/my-project/src/lib/env-checker/
  - _Impact:_ Every regex in ACCESS_PATTERNS and the ENV_LINE grammar is unverified, and there is no regression net for the fixes above. Since each unmatched pattern silently flips a variable into the "safe to delete" bucket, an untested regex here is a correctness hazard rather than a mere coverage gap. Graded low because this is a
  - _Fix:_ Add src/lib/env-checker/engine.test.ts covering one positive case per ACCESS_PATTERNS entry, the negative cases proven above (shell, destructuring, optional chaining, LookupEnv, setdefault, bare environ, BOM, multiline quoted values), .env parsing shapes (export/tabs/CRLF/duplicates/comments) and em
- **[LOW / ux]** `src/components/EnvCheckerPlayground.astro:956` — "Unused in code" rows have no copy button and "Copy all" only emits the missing list
  - _Repro:_ Load http://localhost:4322/env-example-checker/ with the seeded example and count .ec-copy buttons against the number of result rows.
  - _Impact:_ Half the tool's output cannot be lifted out. Pruning stale keys is one of the two advertised jobs, and on a report with 20 unused keys the user must hand-transcribe them or select text across a styled list. The contract calls for per-row copy buttons on results.
  - _Fix:_ Render the same .ec-copy button on unused rows with data-copy="<KEY>", and add a second data-copy-all="unused" button to the unused group header, tracking lastUnused alongside lastMissing in the delegated click handler.


### kubernetes-resource-calculator

`0 critical / 2 high / 6 medium / 4 low`

> The core arithmetic is sound and the seeded example renders correctly on load (500m/1 core, 256Mi/512Mi x3 -> 1.5 cores / 768Mi totals, all verified live), memory uses BigInt so byte counts are exact, and every injected value goes through escapeHtml() — I found no XSS. The problems cluster in two places. First, the parser is both too permissive and too strict against the real Kubernetes quantity grammar: it accepts u

- **[HIGH / correctness]** `src/components/K8sResourceCalculatorPlayground.astro:102` — Replicas field is type="number", so the browser mangles pasted text before the engine's guard can see it
  - _Repro:_ Live page http://localhost:4322/kubernetes-resource-calculator/ (seeded example 500m / 1 / 256Mi / 512Mi x3). Focus #k8s-replicas, select all, paste `10/10` via the real clipboard (Ctrl+V) or execCommand('insertText').
  - _Impact:_ Chrome's number-input filter strips the '/', the field becomes 1010, and the tool reports Total CPU request = 505 cores with no error at all. The engine's own diagnostic (replicas "10/10" must be a positive integer.) is never reached for this input. Typing `1e` leaves .value === "" (validity.badInput true) and the tool
  - _Fix:_ Change the field to type="text" (inputmode="numeric" is already present) so the raw string reaches parseReplicas() and its specific error surfaces.
- **[HIGH / correctness]** `src/lib/k8s-resources/engine.ts:37` — Uppercase "K" is accepted as a decimal memory suffix (Kubernetes rejects it) while valid E / Ei are rejected
  - _Repro:_ calculate({ memRequest: '512K' }); calculate({ memRequest: '1E' }); calculate({ memRequest: '1Ei' }). Live: deep link #s=eyJyb3dzIjpbeyJjcHVSZXF1ZXN0IjoiIiwiY3B1TGltaXQiOiIiLCJtZW1SZXF1ZXN0IjoiNTEySyIsIm1lbUxpbWl0IjoiIiwicmVwbGljYXMiOiIxIn1dfQ
  - _Impact:_ The tool validates a quantity kubectl apply refuses, and the Unit Reference table on the page teaches it. Kubernetes' quantity suffix set is {n,u,m,"",k,M,G,T,P,E} decimal + {Ki,Mi,Gi,Ti,Pi,Ei} binary -- lowercase k only, and E/Ei are valid. resource.MustParse("512K") fails with "unable to parse quantity's suffix".
  - _Fix:_ Remove K: 1000n from DECIMAL and K from the [kKMGTP] class; add E: 1000n**6n and Ei: 1024n**6n. Fix the reference row to lowercase k in all five locale copies (line 109) and the FAQ at line 32.
- **[MEDIUM / ux]** `src/components/K8sResourceCalculatorPlayground.astro:878` — Red error border and a wiped results table flash mid-composition -- the calm-error rule is not implemented
  - _Repro:_ Live page with the seeded example (9 valid rows on screen). Focus #k8s-mem-req, Ctrl+A, type `1.5` at 60ms/char (en route to 1.5Gi), wait 320ms.
  - _Impact:_ A previously-valid nine-row table is destroyed and replaced by a red error card for one keystroke, plus a 2px red ring on the input and a duplicate error line under it. Recovers when `Gi` is typed. CLAUDE.md's playground UX contract requires holding errors until ~600ms idle, blur, or Enter.
  - _Fix:_ On the 220ms tick render valid results only; on an invalid parse keep the last good table and start a ~600ms idle timer (also flushed by blur and Enter) before calling renderError()/setFieldError().
- **[MEDIUM / ux]** `src/components/K8sResourceCalculatorPlayground.astro:888` — Enter does not force a run, Ctrl+Enter does not run-and-blur, and the contract's hint line is missing
  - _Repro:_ Live page. Focus #k8s-mem-req, Ctrl+A, type `777Mi`, press Enter, read the DOM at 40ms and again at 440ms. Then press Ctrl+Enter and read document.activeElement.
  - _Impact:_ No keydown handler exists on any of the five inputs, so the documented keyboard contract is entirely absent, and the hint never tells the user the tool is live-evaluating.
  - _Fix:_ Add a keydown listener on the five inputs: plain Enter -> clearTimeout(timer); evaluate(); Ctrl/Cmd+Enter -> evaluate() then blur(). Add a caption with the exact string "Results update as you type — press Enter to run now."
- **[MEDIUM / a11y]** `src/components/K8sResourceCalculatorPlayground.astro:171` — Results container is aria-live, giving two competing live regions and no sr-only copy status
  - _Repro:_ Live page: querySelectorAll('.k8s-pg [aria-live], .k8s-pg [role="status"], .k8s-pg [role="alert"]') and querySelectorAll('.k8s-pg .sr-only').
  - _Impact:_ The entire results table (9 rows) sits inside a polite live region that is fully re-rendered on every 220ms debounce tick, instead of the intended one-line summary. renderError() nests role="alert" inside that polite region and setFieldError() adds a third aria-live="polite" node, so a parse error announces from up to 
  - _Fix:_ Remove aria-live/aria-atomic from #k8s-results, leaving #k8s-summary (role="status") as the sole live region; drop role="alert" from the injected error card and aria-live from the field-error <p> (use aria-describedby/aria-invalid instead); add an sr-only role="status" span for copy confirmations.
- **[MEDIUM / ux]** `src/components/K8sResourceCalculatorPlayground.astro:21` — Examples are a <select> dropdown instead of the contract's example chips
  - _Repro:_ Live page at 1280x900: inspect #k8s-example (tagName, size, options, bounding box) and count chip-style example buttons.
  - _Impact:_ All three bundled examples -- including the 'Misconfigured pod' one that demonstrates the limit-below-request warning, the tool's most useful behaviour -- are collapsed behind a dropdown, so a first-time visitor sees only the one selected scenario. CLAUDE.md's contract calls for squared chips at var(--radius-pill), 44p
  - _Fix:_ Replace the <select> with a chip row: buttons at border-radius var(--radius-pill), canvas bg + hairline shadow, brand-strong text, active = brand-soft bg + inset brand ring, min-height 44px under (pointer: coarse) -- port from IpConverterPlayground.astro.
- **[MEDIUM / ux]** `src/components/K8sResourceCalculatorPlayground.astro:601` — No per-row copy buttons and no data-copy-all -- a single value cannot be lifted out of the result
  - _Repro:_ Live page: querySelectorAll('.k8s-row [data-copy], .k8s-row button') and querySelectorAll('.k8s-pg [data-copy-all]'); then click #k8s-copy-md and watch window.dataLayer.
  - _Impact:_ To grab one number (e.g. `805306368 bytes` for a ticket) the user must hand-select monospace text out of a nine-row table or take the whole Markdown block. In addition the result_copied analytics event never fires for the Copy-as-Markdown button.
  - _Fix:_ Add an icon-swap copy button per .k8s-row (execCommand fallback, 44px targets on coarse) and put data-copy-all on the Copy-as-Markdown button.
- **[MEDIUM / correctness]** `src/lib/k8s-resources/engine.ts:197` — CPU limit-below-request warning says "may be throttled or rejected" -- Kubernetes always rejects it, and the page says so
  - _Repro:_ calculate({ cpuRequest: '1', cpuLimit: '500m' }); live via the bundled 'Misconfigured pod' example / deep link #s=eyJyb3dzIjpbeyJjcHVSZXF1ZXN0IjoiMSIsImNwdUxpbWl0IjoiNTAwbSIsIm1lbVJlcXVlc3QiOiIxR2kiLCJtZW1MaW1pdCI6IjUxMk1pIiwicmVwbGljYXMiOiIxIn1dfQ
  - _Impact:_ Kubernetes' ValidateResourceRequirements applies the limit>=request check to every resource name, so the API server returns `spec.containers[0].resources.requests: Invalid value: "1": must be less than or equal to cpu limit of 500m` -- the Pod is never admitted, so it can never be "throttled". The tool's own page contr
  - _Fix:_ Change the CPU string to match the memory one: 'CPU limit is below the CPU request — Kubernetes will reject this pod (requests must be <= limits).'
- **[LOW / ux]** `src/components/K8sResourceCalculatorPlayground.astro:589` — Field-level parse errors are headlined "Nothing to calculate", which is false, and are printed twice
  - _Repro:_ Deep link #s=eyJyb3dzIjpbeyJjcHVSZXF1ZXN0IjoiIiwiY3B1TGltaXQiOiIiLCJtZW1SZXF1ZXN0IjoiNTEybSIsIm1lbUxpbWl0IjoiIiwicmVwbGljYXMiOiIxIn1dfQ ; also edit only memRequest on the seeded 4-field example.
  - _Impact:_ The headline reads as "you typed nothing" when the real problem is one bad suffix, and the identical sentence appears twice (error card + field note). `512m` in particular is the single most common Kubernetes memory mistake (0.512 bytes, not 512Mi) and gets only the generic message.
  - _Fix:_ Use the ERR_EMPTY headline only when result.error === ERR_EMPTY; otherwise title it e.g. "Check the Memory request field". Keep the detail in one place. Add a targeted diagnostic in parseMem for a bare `m` suffix.
- **[LOW / correctness]** `src/lib/k8s-resources/engine.ts:56` — CPU parsing falls through to Number(), accepting hex/binary/octal literals and embedded spaces, and rounding sub-millicore values to 0m
  - _Repro:_ calculate({ cpuRequest: '0x10' | '0b101' | '0o17' | '0xffm' | '5 m' | '0.0004' | '0.4m' }); live deep link #s=eyJyb3dzIjpbeyJjcHVSZXF1ZXN0IjoiMHgxMCIsImNwdUxpbWl0IjoiIiwibWVtUmVxdWVzdCI6IiIsIm1lbUxpbWl0IjoiIiwicmVwbGljYXMiOiIyIn1dfQ
  - _Impact:_ Garbage in, authoritative-looking answer out: the tool green-lights quantities the API server refuses (Kubernetes' quantity grammar is <signedNumber><suffix> with suffix in {Ki..Ei, n,u,m,"",k,M,G,T,P,E} or a decimal exponent -- 0x/0b/0o prefixes and internal spaces are all rejected). The sub-millicore case is worse: a
  - _Fix:_ Gate parseCpu on the Kubernetes grammar before converting, then scale by the suffix. Return a specific error (not 0m) when the value rounds below 1m.
- **[LOW / correctness]** `src/lib/k8s-resources/engine.ts:179` — Large replica counts are silently reinterpreted and exponential notation leaks into millicore/Mi output
  - _Repro:_ Deep link #s=eyJyb3dzIjpbeyJjcHVSZXF1ZXN0IjoiMSIsImNwdUxpbWl0IjoiIiwibWVtUmVxdWVzdCI6IjFHaSIsIm1lbUxpbWl0IjoiIiwicmVwbGljYXMiOiI5OTk5OTk5OTk5OTk5OTk5OTk5OSJ9XX0 ; also calculate({ replicas: '9007199254740993' }).
  - _Impact:_ The echoed Replicas row disagrees with what the user entered, the CPU total is off by ~2e4, and `1e+23m` / `1.024e+23Mi` are not readable quantities in a tool whose page promises "exact integer arithmetic" (line 194). parseReplicas accepts any /^\d+$/ and coerces with Number(), losing precision above 2^53.
  - _Fix:_ Parse replicas as a BigInt and do the CPU total in BigInt millicores like the memory path already does, or reject counts above a sane cap with a specific message.
- **[LOW / mobile]** `src/components/K8sResourceCalculatorPlayground.astro:357` — Snapshot and copy controls are below the 44px touch target on coarse pointers
  - _Repro:_ Playwright chromium, Pixel 5 device profile, viewport 390x800, hasTouch + isMobile; measure getBoundingClientRect() on the snapshot and copy controls.
  - _Impact:_ Save snapshot (30px), delete snapshot (28x28) and both copy buttons (36px) are under the 44px minimum on phones, making the export and snapshot flow fiddly. .k8s-snap-btn (line 269) and .k8s-snap-delete (line 300) have no (pointer: coarse) override at all; the block at line 357 only lifts .k8s-share-btn to 36px.
  - _Fix:_ Extend the (pointer: coarse) block to .k8s-snap-btn and .k8s-snap-delete, and raise .k8s-share-btn min-height from 36px to 44px.


### prometheus-relabel-tester

`0 critical / 3 high / 4 medium / 2 low`  ·  1 claim(s) rejected by the verifier

> The core relabel chain is genuinely well built: rule ordering, keep/drop/keepequal/dropequal, labelmap/labeldrop/labelkeep, the anchored-regex wrapper, the `$1`/`${1}`/`$$`/named-group expander, the target_label template expansion, and the hand-rolled MD5 hashmod (verified: md5("foo") last-8-bytes BE % 1000 = 696) all match upstream, the engine never throws, 2000 label sets process in 31 ms, and every innerHTML inter

- **[HIGH / correctness]** `src/lib/prometheus-relabel-tester/engine.ts:607` — lowercase/uppercase write an empty label where Prometheus deletes it
  - _Repro:_ applyRelabel('- source_labels: [__meta_env]\n action: lowercase\n target_label: environment', 'environment="PROD", job="api"')
  - _Impact:_ Prometheus relabel.go does lb.Set(cfg.TargetLabel, strings.ToLower(val)); labels.Builder.Set is documented 'A value of "" means delete that label' and calls b.Del(n). So when the source label is absent (the normal case for a __meta_* label only some targets carry), Prometheus REMOVES the target label. The engine writes
  - _Fix:_ Route every target write through one helper mirroring labels.Builder.Set: `const setLabel = (m, name, v) => (v === '' ? m.delete(name) : m.set(name, v));` and use it for lowercase, uppercase, hashmod, labelmap and replace alike.
- **[HIGH / correctness]** `src/lib/prometheus-relabel-tester/engine.ts:321` — Valid Prometheus regex syntax — (?P<name>…) and (?i) — is rejected as "not a valid regular expression"
  - _Repro:_ applyRelabel('- source_labels: [addr]\n action: replace\n regex: (?P<svc>.+)\n target_label: service\n replacement: ${svc}', 'addr="checkout"') and applyRelabel('- source_labels: [env]\n action: keep\n regex: (?i)prod.*', 'env="PRODUCTION"')
  - _Impact:_ Both are canonical Go/RE2 and load fine in Prometheus: `(?P<name>…)` is the named-group syntax Go's regexp/syntax has always accepted (and the form every pre-Go-1.22 config uses), and `(?i)` is the standard way to do case-insensitive relabel matching. The tool tells a user their production-running regex is broken, and 
  - _Fix:_ Translate RE2 syntax before compiling: rewrite `(?P<` → `(?<`, and lift a leading `(?i)`/`(?s)`/`(?m)` (and `(?i:…)` groups) into RegExp flags. Anything still unrepresentable should name the construct explicitly instead of claiming the regex is invalid.
- **[HIGH / performance]** `src/lib/prometheus-relabel-tester/engine.ts:321` — Catastrophic backtracking freezes the tab — measured 29 s at 30 chars, 105 s at 32 chars
  - _Repro:_ applyRelabel('- source_labels: [v]\n action: keep\n regex: (a+)+b', 'v="' + 'a'.repeat(30) + 'c"')
  - _Impact:_ compileRegex hands the user's pattern straight to the JS backtracking engine and applyRelabel is fully synchronous; PrometheusRelabelTesterPlayground.astro:1136 `await Promise.resolve(engine.applyRelabel(...))` does NOT yield, so the whole match runs on the main thread before the microtask resolves. The 'Applying rules
  - _Fix:_ Run the match under a budget: move applyRelabel into a Web Worker so the main thread survives and the run can be aborted, or pre-scan the compiled pattern for nested quantifiers and fail the rule with a specific message ('This regex is backtracking — Prometheus (RE2) would run it in linear time, but
- **[MEDIUM / correctness]** `src/lib/prometheus-relabel-tester/engine.ts:254` — Misspelled or unknown rule keys are silently ignored, producing a confidently wrong "Dropped" verdict
  - _Repro:_ applyRelabel('- action: keep\n source_label: [job]\n regex: up', 'job="up", instance="1"') — note the singular `source_label` typo.
  - _Impact:_ parseRule reads only the seven keys it knows and never enumerates the object's own keys, so a typo vanishes. The rule then sees an empty source_labels list, joins to '', fails the anchored `^(?:up)$`, and the tool renders a Dropped card blaming rule 1 (keep). The user concludes their regex is at fault and starts wideni
  - _Fix:_ Whitelist the known keys (source_labels, separator, regex, modulus, target_label, replacement, action) and push a warning — or a hard error matching UnmarshalStrict — for anything else: 'Rule 1: unknown field "source_label" (did you mean "source_labels"?) — Prometheus rejects unknown fields.' Also e
- **[MEDIUM / ux]** `src/components/PrometheusRelabelTesterPlayground.astro:1173` — "Copy" copies your input back to you; there is no way to copy the computed result
  - _Repro:_ Load http://localhost:4322/prometheus-relabel-tester/ and try to copy the Output labels of a result card.
  - _Impact:_ The output labels are the product of the tool and they are trapped in the DOM — you must hand-retype them or drag-select across the cards. The CLAUDE.md playground contract asks for per-row copy buttons carrying `data-copy`, a 'Copy all' carrying `data-copy-all`, and a share button carrying `data-copy-link`; none exist
  - _Fix:_ Add a per-card copy button carrying `data-copy` that yields that set's output as `{a="1", b="2"}`, and a 'Copy all' carrying `data-copy-all` emitting every set's output. Keep the existing button but relabel it 'Copy input', and give #prt-share `data-copy-link`.
- **[MEDIUM / ux]** `src/lib/prometheus-relabel-tester/engine.ts:755` — Label sets with non-legacy label names are rejected with an error that describes exactly what the user already did
  - _Repro:_ applyRelabel('- action: labeldrop\n regex: zzz', 'my-label="x"')
  - _Impact:_ The user typed `key="value"` and is told to type `key="value"`. parseLabelSets DID build the precise diagnostic 'Ignored unrecognised label assignment: "my-label=\"x\""', but fail() at engine.ts:89-91 hardcodes `warnings: []` and throws it away, so nothing points at the real cause (the hyphen/dot in the label NAME) and
  - _Fix:_ Have fail() carry the accumulated warnings instead of `warnings: []`, and make the no-sets error name the first offender: 'Line 1: "my-label" is not a valid label name (expected [a-zA-Z_][a-zA-Z0-9_]*).'
- **[MEDIUM / a11y]** `src/components/PrometheusRelabelTesterPlayground.astro:203` — The whole results wall is an aria-live region, on top of two other live regions
  - _Repro:_ Load http://localhost:4322/prometheus-relabel-tester/ with a screen reader and press Run.
  - _Impact:_ Every Run replays the entire diff — both result cards, every Input row, every Output row, the added/changed tags and the drop note — through the screen reader, immediately after #prt-summary (role=status) has already announced '1 kept · 1 dropped · 2 sets'. CLAUDE.md is explicit: 'results container is NOT aria-live; a 
  - _Fix:_ Delete `aria-live="polite" aria-atomic="false"` from #prt-results. #prt-summary already carries the one-line result and #prt-announce already handles copy status — that is exactly the contract shape.
- **[LOW / correctness]** `src/lib/prometheus-relabel-tester/engine.ts:319` — Regex constructs that RE2 rejects (lookahead, backreferences) are silently accepted and "work"  _(re-graded from medium)_
  - _Repro:_ applyRelabel('- source_labels: [job]\n action: keep\n regex: (?=api).*', 'job="api"') and applyRelabel('- source_labels: [job]\n action: keep\n regex: (a)\\1', 'job="aa"')
  - _Impact:_ The mirror image of #2: the tool gives a green light on a config Prometheus cannot load — RE2 fails with 'invalid or unsupported Perl syntax: `(?=`' and 'invalid escape sequence: `\\1`', so the whole scrape config is refused at startup. Downgraded from medium to low because, unlike #3, this fails LOUDLY downstream — Pr
  - _Fix:_ After compiling, scan the source pattern for constructs RE2 does not support — `(?=`, `(?!`, `(?<=`, `(?<!`, `\\1`-`\\9` backreferences, atomic/possessive groups — and fail the rule with a message naming the construct and stating Prometheus (RE2) will reject it.
- **[LOW / correctness]** `src/lib/prometheus-relabel-tester/engine.ts:612` — uppercase/lowercase use JS full case mapping, diverging from Go's simple mapping
  - _Repro:_ applyRelabel('- source_labels: [x]\n action: uppercase\n target_label: y', 'x="straße"') and the lowercase equivalent with 'x="İstanbul"'
  - _Impact:_ Go's strings.ToUpper/ToLower apply the SIMPLE (per-rune) case map: unicode.ToUpper(U+00DF) has no entry in Go's _CaseRanges (the table jumps 0x00D8-0x00DE then 0x00E0-0x00F6) so 'ß' is left alone -> 'STRAßE'; unicode.ToLower(U+0130) has delta -199 -> a single 'i' -> 'istanbul'. JS uses full case mapping. For non-ASCII 
  - _Fix:_ Implement Go's simple case mapping for the ranges that differ (at minimum leave U+00DF alone on uppercase and map U+0130 -> 'i' on lowercase), or emit a warning whenever the joined source contains non-ASCII characters.

  _Rejected:_ “Playground uses a <select> example picker at 32px and has no live-eval” — The finding's raw observations are accurate but its premise is wrong: it grades a CodeMirror Run-button tool against a contract written for single-input live-eval tools, and cites 


### cve-ignore-converter

`0 critical / 3 high / 4 medium / 1 low`

> This tool's shell is polished — CodeMirror panes with an Escape release binding, a lazy code-split engine, escapeHtml on every innerHTML interpolation (no XSS found), a good seeded example that boots and evaluates correctly, and three working copy affordances. The engine underneath is where it falls apart. Its headline promise — printed in the file header, the pipeline section, the "When It's Lossy" callout and the F

- **[HIGH / correctness]** `src/lib/cve-ignore/engine.ts:272` — Unquoted Snyk `expires:` is silently dropped while the UI reports no lossy changes
  - _Repro:_ convert('snyk','osv', <policy with unquoted `expires: 2025-12-31T00:00:00.000Z`>) emits an [[IgnoredVulns]] table with NO `ignoreUntil` line and returns warnings []. Quoting the same value emits `ignoreUntil = 2025-12-31T00:00:00.000Z`.
  - _Impact:_ osv-scanner CAN represent this expiry via ignoreUntil, so no loss was necessary. A deliberately time-boxed Snyk suppression converts to a PERMANENT osv suppression while the tool reports zero lossy notes — the CVE stays suppressed after the risk acceptance was meant to lapse. The engine's own header comment promises "N
  - _Fix:_ Normalize before the type test — accept `meta.expires instanceof Date` and serialize via `.toISOString()` — or load Snyk/Grype YAML with `yaml.load(text, { schema: yaml.JSON_SCHEMA })` so timestamps stay strings. Add engine tests asserting the expiry survives snyk→osv for both quoted and unquoted fo
- **[HIGH / correctness]** `src/lib/cve-ignore/engine.ts:437` — A multi-line reason emits a bare CVE line into .trivyignore, fabricating a suppression
  - _Repro:_ convert('snyk','trivyignore', …) with a block-scalar reason `reason: |-\n Superseded by\n CVE-2024-99999` emits "# Superseded by\nCVE-2024-99999\nCVE-2023-45853" with warnings []. Re-parsing that output with parse('trivyignore', …) returns TWO entries. Reproducible from all three reason-bearing source formats: snyk blo
  - _Impact:_ Trivy reads a bare ID line as a real suppression. A CVE that was only MENTIONED inside a justification becomes actively suppressed in the generated .trivyignore, with zero warnings — silently widening the blast radius of a security policy, the exact opposite of what a suppression converter must guarantee. When the trai
  - _Fix:_ Prefix every line of the reason: `for (const l of e.reason.split(/\\r?\\n/)) lines.push('# ' + l);`. Apply the same guard anywhere a reason reaches a line-oriented format, and add a test asserting reason newlines never produce an uncommented line.
- **[HIGH / correctness]** `src/lib/cve-ignore/engine.ts:507` — emitSnyk silently collapses two rules for the same CVE into one, dropping a whole suppression
  - _Repro:_ Two grype ignore rules, both `vulnerability: CVE-2021-44228`, scoped to package.location /app/backend/lib and /app/frontend/lib. parse('grype', …) correctly returns BOTH entries, but convert('grype','snyk', …) emits only `CVE-2021-44228: - /app/frontend/lib:` — the backend rule is gone and warnings is []. Plain assignm
  - _Impact:_ A multi-path suppression policy converted to .snyk silently loses coverage: the emitted file no longer suppresses the dropped rule's paths, so a previously accepted finding reappears as a build failure. Duplicate CVE entries across scopes are the normal case in monorepos, and the engine's stated contract is that nothin
  - _Fix:_ Merge instead of overwrite: when `ignore[e.id]` already exists, append the new path→leaf objects (de-duplicating identical paths) rather than replacing, or push an explicit warning naming the discarded rule. Add a test with two same-id entries asserting both paths survive.
- **[MEDIUM / correctness]** `src/lib/cve-ignore/engine.ts:144` — Trivy's vendor-documented `exp:` expiry syntax makes the whole suppression disappear; the tool also states the opposite of the spec
  - _Repro:_ idPart (engine.ts:139) takes the whole line and ID_RE (engine.ts:90) rejects it on the space. convert('trivyignore','osv', …) on a file containing `CVE-2019-14697 exp:2027-01-01` warns "Skipped line 4: “CVE-2019-14697 exp:2027-01-01” is not a recognized vulnerability ID." and the emitted osv-scanner.toml contains only 
  - _Impact:_ A valid, vendor-documented .trivyignore loses every time-boxed suppression on conversion — the user ships a policy that no longer suppresses those CVEs and CI starts failing on already-accepted findings. Note the tool DOES warn by line number, so this is loud, not silent — which is why this is medium, not high. The sec
  - _Fix:_ In parseTrivyignore, split the id part on ` exp:` before validating: keep the left side as the id, map the right side into entry.expires. Emit `${e.id} exp:${date}` from emitTrivyignore instead of warning, and correct the Trivy row in formatMatrix (src/pages/cve-ignore-converter.astro:150) plus the 
- **[MEDIUM / correctness]** `src/lib/cve-ignore/engine.ts:396` — TOML literal (single-quoted) strings are unsupported — a valid osv-scanner.toml yields zero entries, and a `#` inside one truncates the reason silently
  - _Repro:_ parseTomlScalar only unwraps `"`, and stripTomlComment (engine.ts:380-388) only toggles on `"`. convert('osv','grype', "[[IgnoredVulns]]\nid = 'CVE-2023-45853'\nreason = 'zlib accepted risk'") returns empty output with warnings ["Skipped invalid id “'CVE-2023-45853'” at line 2.", "Skipped [[IgnoredVulns]] starting at l
  - _Impact:_ Single-quoted literal strings are core TOML v1.0 and osv-scanner parses them with a real TOML library, so this input is valid. The id case fails loudly but blames the user's file for containing no suppressions. The reason case is worse: it silently emits a truncated, quote-mangled justification into the target policy w
  - _Fix:_ Handle `'…'` in parseTomlScalar (literal strings take no escapes — return the inner slice verbatim) and teach stripTomlComment to toggle on `'` as well as `"`. Add osv parser tests covering literal strings for both id and reason, including a `#` inside a literal string.
- **[MEDIUM / a11y]** `src/components/CveConverterPlayground.astro:306` — Three concurrent live regions triple-announce every conversion; the results container is aria-live
  - _Repro:_ Headless-Chrome dump of http://localhost:4322/cve-ignore-converter/ after the seeded example auto-converts shows all three regions populated at once. convertNow() rewrites all three on every run, so one conversion queues the full warning list, then "3 notes", then "Converted with 3 notes." renderLoading() (line 862-870
  - _Impact:_ Violates the explicit playground a11y contract in CLAUDE.md ("results container is NOT aria-live; a one-line role=status summary is the sole live region, plus an sr-only copy-status span"). The named reference implementation IpConverterPlayground.astro complies (2 aria-live / 2 role=status — the summary and the sr-only
  - _Fix:_ Remove aria-live="polite" aria-atomic="false" from #cv-messages so it is a static results region, keep #cv-summary (role=status) as the sole result live region, restrict #cv-announce to clipboard status only (drop the "Converted…" writes at lines 1323-1329), and drop the nested role="alert" in rende
- **[MEDIUM / test-coverage]** `src/lib/cve-ignore/engine.test.ts:11` — Zero test coverage of parse/emit/convert — the whole suite tests only the share-URL codec
  - _Repro:_ The file is 48 lines with a single `describe('encodeState()')` block of 5 tests. Its only engine import is `import { encodeState } from './engine';` — parse, emit and convert are never imported, so the four parsers, four emitters and the public convert() facade have no assertions at all.
  - _Impact:_ The one file that could have caught silent suppression loss tests base64 round-tripping instead. Every one of the confirmed correctness findings above is reproducible in a three-line unit test against a bundled example or a vendor-documented input, and all of them ship green. Any future parser/emitter edit can change w
  - _Fix:_ Add a describe('convert()') suite driven by real vendor-documented fixtures across the 12 source→target directions, asserting that expiry, reason, path and package data either survive or produce a named warning. Start with a table test round-tripping the four bundled examples in src/lib/cve-ignore/e
- **[LOW / ux]** `src/lib/cve-ignore/engine.ts:350` — Real osv-scanner.toml [[PackageOverrides]] produce five misleading "outside [[IgnoredVulns]]" notes
  - _Repro:_ After an unsupported table header sets `current = null` (engine.ts:329), every key in that table's body falls into the `current === null` branch at line 348 and is reported as a top-level key. A standard osv-scanner.toml with one [[IgnoredVulns]] table followed by a [[PackageOverrides]] table (name/version/ecosystem/ig
  - _Impact:_ The parenthetical is factually wrong — those keys are inside a [[PackageOverrides]] table, not at top level — and one common, entirely valid config section generates six notes that bury the single real lossy-conversion warning. Users reading a seven-item warning list on a two-table file will assume their file is malfor
  - _Fix:_ Track the current table name; when inside a known-but-unsupported table, suppress the per-key warnings entirely (the single "Ignored unsupported table [[X]]" note already says what happened) and reserve the "outside [[IgnoredVulns]]" wording for keys appearing before any table header.


### cidr-checker

`0 critical / 3 high / 3 medium / 3 low`

> The core CIDR math is solid — BigInt throughout, correct network/last-address masking, correct interval merge plus minimal re-split, RFC 5952 IPv6 compression, and every innerHTML interpolation is escaped (I injected `<img src=x onerror=alert(1)>` via `#list=` and got `&lt;img src=x onerror=alert(1)&gt;` back — no XSS). The seeded example is a genuinely good first impression: it lands the headline "IP in range?" verd

- **[HIGH / correctness]** `src/lib/ip-core.ts:28` — Leading-zero octets are silently reinterpreted as decimal, flipping the in-range verdict
  - _Repro:_ check('010.0.0.1\n10.0.0.0/24') and deep-link http://localhost:4322/cidr-checker/#list=010.0.0.1%0A10.0.0.0%2F24
  - _Impact:_ The tool's headline job is 'is this IP in that CIDR range?' for allow-lists and firewall rules. A zero-padded octet is rewritten to a different address, echoed back only in rewritten form, and given a confident green IN verdict that every standard parser contradicts. Self-inconsistent too: 0177.0.0.1 (4 digits) IS reje
  - _Fix:_ Tighten parseIPv4 to reject any octet with a leading zero (/^(0|[1-9]\d{0,2})$/), matching Go net/netip, Python ipaddress and Node net.isIP. Add a diagnoseIPv4 branch naming the leading zero. Shared ip-core -> re-run the other five networking tools' engine tests.
- **[HIGH / performance]** `src/lib/cidr-checker/engine.ts:198` — O(n^2) pairwise loop runs synchronously on every keystroke - 8,000 lines freezes the tab for ~30s
  - _Repro:_ check() on n generated distinct /24 lines, timed with Date.now() under vitest
  - _Impact:_ Page copy invites exactly this input (cidr-checker.astro:35 'paste internal allow-lists and route tables', :59 'BGP prefix lists', :63 'Paste all VPC and subnet CIDRs'). AWS ip-ranges.json carries ~8.6k IPv4 prefixes; pasting it locks the main thread for ~30s with no spinner, progress or cancel, and every later keystro
  - _Fix:_ Cap the pairwise pass (skip overlap detection above ~1,000 entries with a visible 'overlap check skipped' note) or replace it with a sort-by-start sweep in O(n log n) - the entries are already sorted for aggregation. At minimum switch the playground from live eval to an explicit Run button above a l
- **[HIGH / correctness]** `src/lib/cidr-checker/engine.ts:221` — The probe IP is folded into "Merged ranges" and into Copy all, contradicting the not-in-range verdict
  - _Repro:_ Deep-link http://localhost:4322/cidr-checker/#list=8.8.8.8%0A10.0.0.0%2F8%0A192.168.0.0%2F16
  - _Impact:_ Two cards 40px apart say opposite things. A user who checks an address and then hits Copy all to paste the tidied allow-list into a security group silently adds the address they were merely testing. The role=status block count is inflated for the same reason.
  - _Fix:_ Exclude role === 'ip' entries from the aggregation input when the list contains at least one range (they are probes, not members), or keep them but label the card 'includes 1 bare IP as /32' and drop probe rows from the Copy-all payload.
- **[MEDIUM / correctness]** `src/lib/ip-core.ts:69` — An IPv4 literal followed by "::" is accepted as a valid IPv6 address
  - _Repro:_ Deep-link http://localhost:4322/cidr-checker/#list=192.168.1.1%3A%3A%0A192.168.0.0%2F16
  - _Impact:_ The `i !== segs.length - 1` guard only checks position within one half of the '::' split, so an embedded IPv4 in the head half slips through. A stray '::' turns an IPv4 line into an unrelated IPv6 address counted as valid, silently excluded from every IPv4 overlap and aggregation comparison, and spawning a phantom IPv6
  - _Fix:_ In parseIPv6, reject an embedded-IPv4 segment unless it is the last segment of the whole address - pass a flag into groupsOf so halves[0] refuses any segment containing '.' when halves.length === 2.
- **[MEDIUM / ux]** `src/lib/cidr-checker/engine.ts:211` — Ten duplicate lines produce 45 identical, unattributed overlap rows
  - _Repro:_ check() on ten copies of 10.0.5.0/24
  - _Impact:_ De-duplicating a sprawling allow-list is a stated job of the tool and duplicates are the most common real finding. Instead of '10.0.5.0/24 appears on lines 3, 7 and 12' the user gets n(n-1)/2 copies of a self-referential sentence with no line numbers - unscannable exactly when it matters most.
  - _Fix:_ Group equal-relation pairs: carry a line index on Parsed and emit one row per distinct normalised block with an occurrence count and source lines, e.g. '10.0.5.0/24 is listed 10 times (lines 1-10)'. Same for a bare IP listed twice.
- **[MEDIUM / a11y]** `src/components/CidrCheckerPlayground.astro:770` — Error card is re-inserted with role="alert" on every 220 ms debounce tick while typing, and the textarea never gets aria-invalid
  - _Repro:_ Deep-link http://localhost:4322/cidr-checker/#list=%3Cimg%20src%3Dx%3E ; source path input handler (1013) -> 220 ms timer -> evaluate(true) (944) -> result.valid === false (962) -> renderError (763)
  - _Impact:_ role="alert" is an assertive live region: replacing the whole results container re-inserts a fresh alert node, interrupting whatever the screen reader is reading. Every debounce tick that lands on a partially-typed line ('10', '10.', '10.0.0.0/') fires one. The reference implementation guards exactly this.
  - _Fix:_ Give renderError an isAlert = false parameter as in IpConverterPlayground, pass true only from Enter/blur-initiated evaluations, and set/remove aria-invalid on #cdc-input alongside it.
- **[LOW / ux]** `src/lib/cidr-checker/engine.ts:71` — Comma- and quote-delimited pastes get diagnostics that blame the octets, not the delimiter  _(re-graded from medium)_
  - _Repro:_ check('10.0.0.0/24, 10.0.1.0/24'), check('"192.168.0.0/16",'), and the same list deep-linked into the page
  - _Impact:_ CIDR lists in the wild arrive as JSON arrays, Terraform lists or comma-separated env values. A first-time user pastes their real list, sees '0 valid', and gets no hint that stripping commas and quotes would fix it.
  - _Fix:_ Pre-split lines on commas and strip surrounding quotes/brackets/'- ' markers before parsing (noting the normalisation), or add explicit diagnoseLine branches ahead of the octet checks naming the comma / quotes / two-entries-on-one-line.
- **[LOW / ux]** `src/components/CidrCheckerPlayground.astro:718` — The Overlaps card and two FAQ answers advertise "partial overlap" detection that can never fire
  - _Repro:_ 40,000 random CIDR pairs (random a.b.c.d with random /0-/32) through check()
  - _Impact:_ The playground sub-copy plus the FAQ at cidr-checker.astro:43 and :55 (both JSON-LD-backed and SEO-indexed) promise a distinction the tool cannot produce; 'overlaps' is dead code in engine.ts:214 and in the OverlapPair kind union.
  - _Fix:_ Drop 'or partial overlaps' from the card sub-copy and reword both FAQ answers to state that aligned CIDR blocks are always either nested or disjoint (the more useful fact), then delete the unreachable 'overlaps' branch and its kind from types.ts.
- **[LOW / correctness]** `src/lib/ip-core.ts:189` — /024 is accepted as /24 but /0024 is rejected with a generic error that blames the address
  - _Repro:_ check('10.0.0.0/024') vs check('10.0.0.0/0024')
  - _Impact:_ Two arbitrary behaviours for the same malformed prefix, decided purely by digit count, and the failing case emits exactly the generic 'not an IP address or CIDR' the UX contract discourages - telling the user the address is wrong when the address is fine.
  - _Fix:_ Make the prefix grammar explicit in parseCidr (/^(0|[1-9]\d{0,2})$/) so /024 and /0024 are rejected consistently, and add a diagnoseLine branch for a numeric-but-non-canonical prefix: 'Remove the leading zero from the prefix - write /24.'


### timestamp-converter

`0 critical / 1 high / 9 medium / 1 low`

> The happy path is solid: the seeded 1516239022 example evaluates correctly on load, the digit-count unit heuristic is right and BigInt-safe for µs/ns, a 1,000,000-digit paste completes in 165 ms (no hang), and every injected value goes through escapeHtml() — I found no XSS. The rot is all in the fallback path: line 40's `/^\d+$/` gate is too narrow (no sign, no decimal point), so negative and fractional epochs — both

- **[HIGH / correctness]** `src/lib/timestamp-converter/engine.ts:40` — Short negative epochs fall through the digits-only gate into V8's legacy Date.parse and render a confidently wrong instant  _(re-graded from critical)_
  - _Repro:_ convert('-1') -> valid, detected 'date string', ISO 2000-12-31T18:30:00.000Z, 'Relative: 25 years ago' (correct: 1969-12-31T23:59:59.000Z). convert('-86400') -> valid, ISO +086399-12-31T18:30:00.000Z, 'in 84429 years' (correct: 1969-12-31T00:00:00.000Z). Live: http://localhost:4322/timestamp-converter/#t=-86400 renders
  - _Impact:_ The `-` fails /^\d+$/ on line 40 so the value lands in Date.parse, which invents a year. No warning, no error styling — the '-1' case looks entirely plausible (a 2000-12-31 date, '25 years ago') and is off by 31 years. NARROWER THAN CLAIMED: the realistic 10-digit pre-1970 epochs are NOT silently wrong — convert('-3156
  - _Fix:_ Change the epoch gate to /^[+-]?\d+$/, strip the sign before the digit-count heuristic and apply it to the magnitude (ms = sign * ...). Tests: '-86400' -> 1969-12-31T00:00:00.000Z, '-1' -> 1969-12-31T23:59:59.000Z.
- **[MEDIUM / correctness]** `src/lib/timestamp-converter/engine.ts:61` — Impossible dates roll over silently, and a date string with no year is silently defaulted to 2001  _(re-graded from high)_
  - _Repro:_ convert('2018-02-30') -> valid, ISO 2018-03-02T00:00:00.000Z, Day of week Friday. convert('2024-02-30') -> 2024-03-01T00:00:00.000Z. convert('2023-04-31') -> 2023-05-01T00:00:00.000Z. convert('Dec 25 (christmas)') -> 2001-12-24T18:30:00.000Z. convert('2018-') -> valid, 2017-12-31T18:30:00.000Z. Live #t=2018-02-30 rende
  - _Impact:_ A one-character date typo produces a valid-looking card for a different day, and a year-less string silently becomes 2001. Mitigating (why not high): the rollover is ECMA-262 MakeDay behaviour and the resulting date is displayed verbatim in the ISO/UTC/Local rows, so it is visible rather than hidden — the user who type
  - _Fix:_ Round-trip validate the ISO path: re-format the parsed Date and compare Y/M/D against the typed digits; reject with a specific diagnostic ('February 2018 has only 28 days.'). Reject free-form strings with no year rather than defaulting to 2001.
- **[MEDIUM / correctness]** `src/lib/timestamp-converter/engine.ts:61` — The zone assumed for a naked date string is never disclosed — Day of week flips between two inputs that look equivalent  _(re-graded from high)_
  - _Repro:_ TZ Asia/Calcutta. convert('2023-11-14') -> 1699920000, ISO 2023-11-14T00:00:00.000Z, Day of week Tuesday. convert('2023-11-14 00:00:00') -> 1699900200, ISO 2023-11-13T18:30:00.000Z, Day of week Monday. convert('2023-01-14') -> Saturday vs convert('2023-1-14') -> Friday. All four render the identical 'date string' badge
  - _Impact:_ ES semantics make a date-only ISO string UTC and a date-time without an offset local; V8's legacy path makes '2023-1-14' local too. The result never states which was assumed, and the 'Day of week' row is UTC-derived but labelled just 'Day of week'. Mitigating (why not high): the card renders both a UTC and a Local row 
  - _Fix:_ Carry the assumed zone in `detected` (e.g. 'date string (no offset — read as local UTC+05:30)') and render it in the ts-title line; label the day row 'Day of week (UTC)'; optionally add a 'read as UTC instead' toggle when the input has no offset.
- **[MEDIUM / correctness]** `src/lib/timestamp-converter/engine.ts:40` — Fractional-second epochs (time.time(), Prometheus) are rejected with a non-specific diagnostic  _(re-graded from high)_
  - _Repro:_ convert('1700000000.5') -> valid:false, 'Could not read that as a Unix timestamp or a date string.' Same for '1700000000.123', '1.7e9', '+1516239022'. Live #t=1700000000.5 renders the red ts-error card with that detail line and puts ts-input--error on the input.
  - _Impact:_ Python time.time(), Ruby Time.now.to_f, Prometheus/OTel exports and structured JSON logs all emit fractional epoch seconds; pasting one dead-ends. No wrong data is produced (why this is not high) — the defect is a missing input form plus an error that names no cause, against the CLAUDE.md contract requiring specific di
  - _Fix:_ Accept /^[+-]?\d+(\.\d+)?$/ on the epoch path (digit-count heuristic on the integer part, fraction folded into ms). At minimum return 'Fractional epoch seconds are not supported yet — try 1700000000.'
- **[MEDIUM / correctness]** `src/pages/timestamp-converter.astro:110` — All five locale pages document `now` as an accepted input; the engine rejects it  _(re-graded from high)_
  - _Repro:_ convert('now') and convert('NOW') -> valid:false. Live http://localhost:4322/timestamp-converter/#t=now renders the ts-error card. `now -> current instant` is present at line 110 of all five copies (en, de, es, fr, pt-br) and the 'or even now' lead sits at en:219-220 / de,es,fr,pt-br:222-223.
  - _Impact:_ The reference section teaches an input form that errors out, in five languages. Not high because no wrong data is produced and the adjacent 'Now' button does the job — it is a documentation/behaviour contradiction, not a broken conversion.
  - _Fix:_ Either support it (if (/^now$/i.test(s)) ms = nowMs ?? Date.now(), detected 'now') or delete the `now` line from dateExamples and the 'or even now' clause from all five page copies in one commit.
- **[MEDIUM / ux]** `src/components/TimestampConverterPlayground.astro:746` — Error border and error card fire mid-composition — eight prefixes of one valid ISO string turn the input red
  - _Repro:_ Of the 20 prefixes of `2018-01-18T01:30:22Z`, eight return valid:false ('2018-0', '2018-01-18T', '2018-01-18T0', '2018-01-18T01', '2018-01-18T01:', '2018-01-18T01:3', '2018-01-18T01:30:', '2018-01-18T01:30:2') and four more return bogus instants rendered as normal results ('2018' -> 1970-01-01T00:33:38.000Z, '2018-' ->
  - _Impact:_ Typing a correct timestamp strobes the input red and replaces the result card with an error card, then with 1970 dates, before settling — explicitly forbidden by the CLAUDE.md contract ('never flash a red border mid-composition — hold the error until ~600ms idle, blur, or Enter'). The title's 'six' undercounts; the rea
  - _Fix:_ Split the debounce: render valid results at 140 ms but gate ts-input--error and the error card behind a ~600 ms idle timer flushed on blur and Enter, keeping the last good card visible meanwhile.
- **[MEDIUM / ux]** `src/components/TimestampConverterPlayground.astro:773` — No Enter-to-run binding and the contract hint line is missing
  - _Repro:_ `grep -n keydown src/components/TimestampConverterPlayground.astro` -> no matches (exit 1); the only listeners are input/change/click (773, 778, 786). The rendered hint reads 'A Unix epoch in seconds 1516239022, milliseconds 1516239022000, or a date string 2018-01-18T01:30:22Z.' — the contract string 'Results update as
  - _Impact:_ Enter and Ctrl/Cmd+Enter do nothing and the page never says evaluation is automatic. The 'no way to dismiss the keyboard on a phone' claim is overstated (tapping outside works), but the reference implementation blurs on Enter for coarse pointers precisely for this.
  - _Fix:_ Port IpConverterPlayground.astro:1210-1217 (Enter -> preventDefault, clear timer, evaluate(true), blur on coarse pointers) and add the exact hint line to #ts-input-hint.
- **[MEDIUM / mobile]** `src/components/TimestampConverterPlayground.astro:482` — All seven per-row copy buttons stay 26x26 px on touch — no (pointer: coarse) override
  - _Repro:_ `grep -n -A4 'pointer: coarse'` in the file returns exactly one block, 349-353, targeting .ts-share-btn (min-height 36px — itself under 44). .ts-copy-btn is width:26px/height:26px at 482-483 with no coarse rule, and the row grid reserves a fixed 30px third column (line 389). The reference bumps its equivalent to 44x44 
  - _Impact:_ Copying a converted value on a phone means hitting a 26 px target, under the 44 px floor the CLAUDE.md playground contract and WCAG 2.5.8 require, across seven rows. .ts-share-btn (36px), .ts-snap-btn (30px) and .ts-snap-delete (28px) are also under.
  - _Fix:_ Add `@media (pointer: coarse) { :global(.ts-copy-btn) { width: 44px; height: 44px; } :global(.ts-row) { grid-template-columns: minmax(0,0.8fr) minmax(0,1.2fr) 44px; } }` and raise .ts-share-btn/.ts-snap-btn/.ts-snap-delete to 44 px min-height there.
- **[MEDIUM / a11y]** `src/components/TimestampConverterPlayground.astro:132` — #ts-results is a live region stacked on top of the role=status summary and a role=alert card; copy actions announce nothing
  - _Repro:_ Served DOM: `<div id="ts-results" class="ts-results" aria-live="polite" aria-atomic="false" data-astro-cid-5uz4azfk="">` wrapping the seven ts-rows, with `<span id="ts-summary" ... role="status" aria-live="polite">` beside it and `<div class="ts-error" role="alert">` injected into the same container on invalid input. `
  - _Impact:_ Three live regions fire per evaluation instead of the one the CLAUDE.md contract specifies ('results container is NOT aria-live; a one-line role=status summary is the sole live region, plus an sr-only copy-status span'), so the whole table is re-announced on each settled keystroke; and the copy buttons give only an SVG
  - _Fix:_ Drop aria-live/aria-atomic from #ts-results and add an sr-only role=status span that wireResultCopyClicks writes 'Copied Unix (seconds)' / 'Copy failed' into.
- **[MEDIUM / correctness]** `src/pages/timestamp-converter.astro:57` — FAQ (and its FAQPage JSON-LD) promises a live-updating current timestamp the tool does not have — in all five locales
  - _Repro:_ The answer to 'What is the current unix timestamp right now?' says 'The converter displays the live value in both seconds and milliseconds, updated in real time in your browser.' No setInterval / requestAnimationFrame exists in TimestampConverterPlayground.astro, TimestampVerifyPanel.astro or the page. The default page
  - _Impact:_ The false claim ships twice per page — in the visible FAQ and inside the FAQPage JSON-LD fed to search for the highest-volume query this page targets — and is mirrored into de/es/fr/pt-br. Nothing displays the current timestamp until the user finds the Now button, and that value is then static.
  - _Fix:_ Either ship a small ticking 'Now: <seconds> / <ms>' readout above the input (1 s interval, paused on visibilitychange), or rewrite the answer to describe the Now button, mirrored into the four localized copies.
- **[LOW / correctness]** `src/components/TimestampConverterPlayground.astro:787` — The Now button truncates the epoch through a 32-bit bitwise OR and will emit a negative timestamp after 2038-01-19
  - _Repro:_ `String((2147483648000 / 1000) | 0)` -> '-2147483648' where Math.floor gives '2147483648'. Feeding that back through this tool's own engine: convert('-2147483648') -> valid:false, 'Could not read that as a Unix timestamp or a date string.' Today the two agree (both printed 1785206593).
  - _Impact:_ A latent Y2038 overflow inside a Unix-timestamp tool: from 2038-01-19T03:14:08Z the Now button would fill the input with -2147483648 and the tool would immediately reject its own output. No user impact until then, hence low.
  - _Fix:_ Replace `(Date.now() / 1000) | 0` with `Math.floor(Date.now() / 1000)`.


### mac-address-formatter

`0 critical / 1 high / 7 medium / 4 low`  ·  1 claim(s) rejected by the verifier

> This tool is visually polished and its IPv6 math is sound (I spot-checked ipv6Compress output against RFC 5952 longest-run rules for the all-zeros, locally-administered and canonical cases — all correct), and there is no XSS: every interpolation into innerHTML in MacFormatterPlayground.astro goes through escapeHtml(), including the chain-chip href. The real weakness is that the engine is a 60-line character-stripper 

- **[HIGH / correctness]** `src/lib/mac-formatter/engine.ts:80` — Group/multicast/broadcast MACs get a fabricated fe80:: link-local address
  - _Repro:_ Load http://localhost:4322/mac-address-formatter/#mac=ff%3Aff%3Aff%3Aff%3Aff%3Aff (one of the 5 bundled examples, examples.ts id 'broadcast'), or call format('ff:ff:ff:ff:ff:ff').
  - _Impact:_ The engine computes isBroadcast and the I/G bit at lines 55-56 and then unconditionally derives an EUI-64 interface identifier anyway. RFC 4291 App. A / RFC 7042 s2.2 form IPv6 interface identifiers from unicast EUI-48s only; a group-bit-set MAC has no EUI-64 interface ID, so fe80::fdff:ffff:feff:ffff can never exist o
  - _Fix:_ Guard the EUI-64 row on (bytes[0] & 0x01) === 0. For group/broadcast addresses omit the row or replace the value with 'n/a - group address (I/G bit set) has no EUI-64 interface identifier', and suppress the chip in chainHtml() when the row is absent.
- **[MEDIUM / correctness]** `src/pages/mac-address-formatter.astro:43` — Page and JSON-LD promise the modified EUI-64 value, which the tool never emits  _(re-graded from high)_
  - _Repro:_ Load http://localhost:4322/mac-address-formatter/ (hero example 00:1B:44:11:3A:B7) and read #mac-results; or call format('00:1B:44:11:3A:B7').
  - _Impact:_ FAQ line 43 says 'The formatter shows both the modified EUI-64 and the resulting fe80:: address', the JSON-LD featureList line 72 says 'Derive the modified EUI-64 and fe80:: link-local address', and the reference CodeBlock at line 113 shows 'EUI-64 02:1B:44:FF:FE:11:3A:B7' as a worked example. The engine builds the eui
  - _Fix:_ Push a row from the existing eui64 array, e.g. rows.push({ label: 'Modified EUI-64', value: join(eui64, ':', true), mono: true }), above the link-local row.
- **[MEDIUM / correctness]** `src/lib/mac-formatter/engine.ts:31` — Character-stripping parser silently accepts malformed input as a valid MAC
  - _Repro:_ format('-00:1a:2b:3c:4d:5e'), format('0:01:a2:b3:c4:d5:e'), format('..001a2b3c4d5e..'), format('00:1a:2b\n3c:4d:5e'), format('00:1a:2b:3c:4d:5e:'); or load http://localhost:4322/mac-address-formatter/#mac=-00%3A1a%3A2b%3A3c%3A4d%3A5e
  - _Impact:_ replace(/[\s:.\-]/g,'') deletes separators from anywhere in the string instead of validating a grammar, so garbled or mis-copied text is silently reinterpreted as a different well-formed MAC and presented in an authoritative 8-row table with no warning. The page's own copy warns that 'a single transposed nibble points 
  - _Fix:_ Anchored grammar per notation: /^(?:[0-9a-f]{2}([:-]))(?:[0-9a-f]{2}\1){4}[0-9a-f]{2}$/i, /^[0-9a-f]{4}(\.[0-9a-f]{4}){2}$/i, /^[0-9a-f]{12}$/i - trimming only surrounding whitespace and an optional 0x.
- **[MEDIUM / correctness]** `src/pages/mac-address-formatter.astro:35` — FAQ and pipeline claim both cases are emitted; only one case per notation is produced
  - _Repro:_ format('00:1B:44:11:3A:B7') and read the notation rows; compare with the FAQ text at page line 35 and the ToolPipeline step body at page line 90.
  - _Impact:_ Eight forms are promised (4 notations x 2 cases); 4 are delivered. engine.ts:44 hardcodes join(bytes, ':', false) and engine.ts:45 hardcodes join(bytes, '-', true). The missing uppercase-colon form 00:1B:44:11:3A:B7 is the exact string the page's own hero, FAQ and reference blocks use as canonical, and there is no togg
  - _Fix:_ Either add the four missing case variants (or an upper/lower toggle that re-renders the notation rows), or correct the FAQ at line 35, the pipeline body at line 90 and the JSON-LD featureList to describe the four forms actually emitted.
- **[MEDIUM / ux]** `src/components/MacFormatterPlayground.astro:733` — Red error border and "Invalid" summary fire on every keystroke while typing a valid MAC
  - _Repro:_ Focus #mac-input on http://localhost:4322/mac-address-formatter/ and type 00:1B:44:11:3A:B7 one character at a time with >140ms between keys.
  - _Impact:_ CLAUDE.md's calm-errors rule ('never flash a red border mid-composition - hold the error until ~600ms idle, blur, or Enter') is violated on 16 of the 17 characters of a normal MAC. There is no error-hold timer anywhere in the file; SubnetCalculatorPlayground.astro:674 implements ERROR_HOLD_MS = 600 for exactly this. No
  - _Fix:_ Route the invalid branch through a showError(message) guarded by a 600ms errTimer (pattern at SubnetCalculatorPlayground.astro:1045), fired immediately on blur or Enter, and do not add mac-input--error until it fires.
- **[MEDIUM / a11y]** `src/components/MacFormatterPlayground.astro:126` — Results container is an aria-live region on top of the role=status summary  _(re-graded from high)_
  - _Repro:_ Enumerate '#playground [aria-live],[role=status],[role=alert]' on http://localhost:4322/mac-address-formatter/, then type an incomplete MAC and re-check.
  - _Impact:_ Two live regions announce in parallel and renderResult() rewrites the container's innerHTML on every 140ms debounce, so the whole 8-row table is re-queued repeatedly while #mac-summary announces 'Invalid'/'EUI-48'; renderError() additionally injects role="alert" (assertive) inside the polite container on every invalid 
  - _Fix:_ Drop aria-live="polite" aria-atomic="false" from #mac-results (matching #ipc-results at IpConverterPlayground.astro:153) and drop role="alert" from the error card in renderError().
- **[MEDIUM / ux]** `src/components/MacFormatterPlayground.astro:762` — No Enter or Ctrl/Cmd+Enter handling, and the standard run hint line is missing
  - _Repro:_ Type 00:1B:44:11:3A:B7 into #mac-input and press Enter immediately; read #mac-summary and #mac-results 25ms later. Then press Ctrl+Enter and read document.activeElement.
  - _Impact:_ Enter does not force an evaluation - the user waits out the 140ms debounce with no way to commit - and Ctrl/Cmd+Enter never blurs, so on a phone the on-screen keyboard stays over the result card. The hint paragraph (lines 67-71) never states the tool is live. CLAUDE.md's playground UX contract requires the exact senten
  - _Fix:_ Copy the keydown block from IpConverterPlayground.astro:1209-1216 (preventDefault, clearTimeout, evaluate(true), blur when matchMedia('(pointer: coarse)')) and append the exact hint sentence to #mac-input-hint.
- **[MEDIUM / mobile]** `src/components/MacFormatterPlayground.astro:387` — Row copy buttons are 28x28 on touch devices; snapshot button is 30px tall
  - _Repro:_ 390x844 viewport with hasTouch/isMobile; measure getBoundingClientRect() on .mac-copy-btn, #mac-snap-save, #mac-share, #mac-md.
  - _Impact:_ The eight per-row copy buttons - the primary way to get a result out on a phone - are 28x28 CSS px, well under the repo's 44px coarse-target rule, stacked in adjacent grid rows. The only @media (pointer: coarse) block in the file (lines 319-324) raises .mac-share-btn to min-height 36px; .mac-copy-btn, .mac-snap-btn and
  - _Fix:_ Extend the coarse block: .mac-copy-btn { width:44px; height:44px }, .mac-snap-btn/.mac-snap-delete { min-height:44px }, .mac-share-btn { min-height:44px }, and increase .mac-row vertical padding so the larger targets do not collide.
- **[LOW / a11y]** `src/components/MacFormatterPlayground.astro:542` — Copy confirmation is visual-only - no sr-only copy-status live region  _(re-graded from medium)_
  - _Repro:_ Enumerate '#playground .sr-only' on http://localhost:4322/mac-address-formatter/ and grep the component for 'copy-status'.
  - _Impact:_ Success is signalled only by swapping the button's SVG (both glyphs aria-hidden) and the aria-label never changes, so AT users get no copy confirmation; and because attachCopyHandlers bails with 'if (!ok) return;' a failed clipboard write is completely silent for every user. copyTextToClipboard (src/lib/clipboard.ts) r
  - _Fix:_ Add <span id="mac-copy-status" class="sr-only" role="status" aria-live="polite"></span> next to #mac-summary (pattern at IpConverterPlayground.astro:159) and set its textContent in both branches of every copyTextToClipboard promise, including #mac-share and #mac-md.
- **[LOW / correctness]** `src/lib/mac-formatter/engine.ts:52` — "OUI" row labels the first three bytes of a locally administered MAC as a vendor block  _(re-graded from medium)_
  - _Repro:_ format('a2:9f:10:4c:88:e1'), format('02:00:00:00:00:01'), format('ff:ff:ff:ff:ff:ff').
  - _Impact:_ The page FAQ (line 55) says the OUI is 'assigned by the IEEE to identify the manufacturer or registrant ... so you can identify the vendor block'. For a U/L-set address there is no IEEE assignment, and A2:9F:10 / 02:00:00 / FF:FF:FF are not registrations; randomised phone and VM MACs are now common. Also, MA-M/MA-S reg
  - _Fix:_ Make the row conditional on the U/L bit: when (bytes[0] & 0x02) !== 0 render 'A2:9F:10 - not an IEEE OUI (locally administered)' or drop the row, and soften the FAQ at page line 55 to mention MA-L/MA-M/MA-S.
- **[LOW / ux]** `src/components/MacFormatterPlayground.astro:800` — Restored and deep-linked input is still labelled "(sample)"
  - _Repro:_ Cold-load http://localhost:4322/mac-address-formatter/#mac=aa%3Abb%3Acc%3Add%3Aee%3Aff in a fresh profile; separately, type a MAC, then navigate to the bare URL so the localStorage 'restored' branch runs.
  - _Impact:_ A returning user sees their own hardware address tagged as a bundled sample, and the recipient of a shared link is told the colleague's real MAC is demo data. Only the input handler (line 764) and the snapshot setValue (line 786) hide .mac-sample-cue; neither the hashValue branch (796-799) nor the restored branch (800-
  - _Fix:_ Hoist the sampleCue lookup above the seed block and call sampleCue?.classList.add('is-hidden') in the hashValue and restored branches.
- **[LOW / test-coverage]** `src/lib/mac-formatter/engine.ts:25` — Engine has zero tests despite shipping bit-level and IPv6 arithmetic  _(re-graded from high)_
  - _Repro:_ ls src/lib/mac-formatter/ -> engine.ts, examples.ts, types.ts. No engine.test.ts.
  - _Impact:_ The engine does I/G and U/L masking, an XOR-0x02 flip and 128-bit BigInt shifts with no regression net, and CLAUDE.md says 'New engines should be test-driven with real RFC/NIST vectors where they exist.' Downgraded from high and the finding's supporting evidence corrected: src/lib/ip-core.test.ts does NOT exist, and ma
  - _Fix:_ Add src/lib/mac-formatter/engine.test.ts with the RFC 4291 App. A vector (34-56-78-9A-BC-DE -> 3656:78FF:FE9A:BCDE), the page's 00:1B:44:11:3A:B7 -> fe80::21b:44ff:fe11:3ab7 pair, both I/G and U/L polarities, broadcast, and the rejection set (11 digits, 13 digits, non-hex, empty).

  _Rejected:_ “Leading-zero-dropped MACs (macOS/BSD `arp -a`, Solaris) are rejected o” — The behaviour reproduces exactly as described, but it is not a defect - the input is outside the tool's documented scope and the engine's answer is correct. RAN: vitest probe impor


### cron-expression-tester

`0 critical / 1 high / 7 medium / 2 low`

> The scheduling math in this engine is sound — the Vixie day-of-month/day-of-week OR rule, 0-and-7-both-mean-Sunday folding, named month/weekday tokens, macro expansion, impossible-date handling (Feb 30, Apr 31) and range/step/list parsing all produce correct fire times, and I could not break the parser with Unicode, em-dashes, 200KB junk tokens, 13KB field lists, or negative/huge integers (it never throws, and every 

- **[HIGH / correctness]** `src/lib/cron-tester/engine.ts:349` — detectFullStep() fabricates "Every N minutes/hours" for value lists that do not tile the field
  - _Repro:_ explain('0,45 * * * *').description === 'Every 45 minutes.'; explain('0,59 * * * *') === 'Every 59 minutes.'; explain('0 0,23 * * *') === 'Every 23 hours at :00.' detectFullStep([0,45],0,59) computes step=45, walks 0->45, sees the next step (90) land past max=59, and returns 45 -- it never checks that (max-min+1) % ste
  - _Impact:_ The plain-English sentence is the tool's headline output and it directly contradicts the run list rendered three lines below it. A user validating `0,45 * * * *` reads "Every 45 minutes" and ships a schedule that actually has a 15-minute gap every hour.
  - _Fix:_ Add `if ((max - min + 1) % step !== 0) return null;` before `return step;` in detectFullStep so a non-tiling list falls through to explicit enumeration ("At minute 0 and 45").
- **[MEDIUM / correctness]** `src/lib/cron-tester/engine.ts:399` — Minute/hour clauses never collapse contiguous ranges; the site's own FAQ + FAQPage JSON-LD promise a sentence the engine cannot produce
  - _Repro:_ explain('*/15 9-17 * * 1-5').description === 'Minute 0, 15, 30, and 45 of hour 9, 10, 11, 12, 13, 14, 15, 16, and 17, on Monday through Friday.' The generic fallback at engine.ts:394-400 joins raw integers; describeNumericRange() (which produces "9 through 17") is only wired to dom/dow/month, never to minute/hour. src/
  - _Impact:_ Business-hours cron is the most common real shape and produces the least readable output in the tool. The promised sentence is baked into the rendered FAQ and emitted as FAQPage structured data via faqPageLd(faqs), so the site publishes schema.org markup describing output the engine does not produce.
  - _Fix:_ Route the minute and hour clauses through describeNumericRange() and re-detect the minute step inside the fallback, then update the FAQ answer at src/pages/cron-expression-tester.astro:34 (and the four localized copies) to quote what the engine actually emits.
- **[MEDIUM / performance]** `src/lib/cron-tester/engine.ts:535` — Sparse / never-firing expressions block the main thread for seconds; the 2.6M-iteration scan runs three times per evaluation
  - _Repro:_ computeNextDates() steps one minute at a time up to MAX_ITERATIONS = 5*366*24*60 = 2,635,200. evaluate() in CronTesterPlayground.astro calls the engine three separate times -- engine.explain(expr) at line 991, engine.nextRuns(expr, getCount()) at line 1020, engine.nextRunEpochSeconds(expr, 1) at line 1037 -- each trigg
  - _Impact:_ Opening a shared `#cron=` link for a leap-day or impossible schedule freezes the tab for seconds with no spinner, which reads as a crash. Tuning the run-count stepper on `0 0 29 2 *` re-pays the cost on every click.
  - _Fix:_ Iterate days-then-minutes (skip whole days whose month/dom/dow cannot match), and have the playground call the engine once -- return epoch seconds and formatted strings from a single call instead of three independent full scans.
- **[MEDIUM / correctness]** `src/lib/cron-tester/engine.ts:726` — nextRuns() silently returns fewer rows than requested when the 5-year horizon is hit
  - _Repro:_ computeNextDates() exits on `iterations < MAX_ITERATIONS` and returns a short array with no signal; nextRuns() maps it straight through. `nextRuns('0 0 29 2 *', 5)` returns length 1; `nextRuns('0 0 1 1 *', 20)` returns length 5. The UI renders the short list with no caption and pluralizes the header off the actual row 
  - _Impact:_ Leap-day and yearly schedules are exactly what people come to a cron tester to sanity-check. One row under a header reading "Next run" invites the conclusion that the job fires once, ever, and bumping the count control appears to do nothing.
  - _Fix:_ Have computeNextDates report horizon exhaustion and render an explicit caption ("Only 1 of the 5 requested runs falls within the next 5 years."). Raise the horizon for low-frequency schedules once the day-skipping rewrite makes it cheap.
- **[MEDIUM / a11y]** `src/components/CronTesterPlayground.astro:209` — Results container is aria-live, and errors nest a role="alert" inside it -- three overlapping announcements per keystroke
  - _Repro:_ Line 209 is `<div id="cron-results" class="cron-results" aria-live="polite" aria-atomic="false">`, whose innerHTML is fully replaced on every 120ms debounce. #cron-summary (line 201-206) is separately role="status" aria-live="polite". renderError() (line 803) injects `<div class="cron-error" role="alert">` inside the p
  - _Impact:_ A screen-reader user typing an expression hears the whole result block re-read on every debounce -- description, five field cells, five timestamp rows and two chips -- plus "Valid"/"Invalid" from the summary, plus the alert. CLAUDE.md is explicit that the results container must NOT be a live region and that exactly one
  - _Fix:_ Remove aria-live/aria-atomic from #cron-results, drop role="alert" from the injected error div, make #cron-summary carry a real one-line summary instead of the bare word "Valid", and add the sr-only copy-status span the reference has at IpConverterPlayground.astro:159.
- **[MEDIUM / ux]** `src/components/CronTesterPlayground.astro:1096` — No Enter-to-run handler and the contract's live-eval hint line is missing
  - _Repro:_ Line 1096 is `exprInput.addEventListener('input', () => {` and it is the only listener on #cron-input. There is no keydown handler anywhere in the 1180-line file. The hint at lines 144-147 reads "Five fields -- minute, hour, day of month, month, day of week. Macros like @daily are supported too." -- the contract string
  - _Impact:_ Users who type an expression and hit Enter get zero feedback and no indication the tool is already live-evaluating, so it reads as broken. Inconsistent with every other OpsCanopy playground.
  - _Fix:_ Add a keydown listener on #cron-input: Enter clears the debounce timer and calls evaluate() immediately, Ctrl/Cmd+Enter also blurs (see IpConverterPlayground.astro:1210). Append the exact contract hint sentence to #cron-input-hint.
- **[MEDIUM / ux]** `src/components/CronTesterPlayground.astro:1003` — Error border and red error card flash mid-composition -- no idle/blur hold, and DEBOUNCE_MS is below the contract band
  - _Repro:_ Line 1003 `if (!result || result.valid === false) {` immediately adds `cron-input--error` and calls renderError(). scheduleEvaluate() (line 1090-1093) is `window.setTimeout(evaluate, DEBOUNCE_MS)` with DEBOUNCE_MS = 120 (line 737) -- evaluate() runs straight off the short debounce with no separate idle gate. Driving #c
  - _Impact:_ Select-all and retype over the seeded `*/5 * * * *` and the input goes red with a red error banner 120ms after the first character, staying red through every intermediate state until the fifth field lands. The contract requires holding errors until ~600ms idle, blur, or Enter, and a 130-220ms debounce.
  - _Fix:_ Render results on the short debounce but gate `cron-input--error` + renderError behind a separate ~600ms idle timer flushed on blur and Enter; keep the previous valid result on screen while an error is held. Raise DEBOUNCE_MS to ~150.
- **[MEDIUM / ux]** `src/components/CronTesterPlayground.astro:832` — No per-row copy buttons and no Copy-all -- the next-run timestamps cannot be extracted
  - _Repro:_ renderRuns() builds each row as `<li class="cron-run"><span class="cron-run__idx">N</span><span class="cron-run__time">...</span></li>` -- no button element. There is no data-copy-all control anywhere in the component. The only copy affordances are #cron-share (the URL) and #cron-md, whose Markdown payload caps the run
  - _Impact:_ The point of the run list is to paste those timestamps into a ticket or runbook, and there is no way to get more than the first one out short of manual text selection across five styled rows. The contract requires per-row copy buttons plus a data-copy-all control.
  - _Fix:_ Add an icon copy button to each .cron-run row (44px coarse target, execCommand fallback via the shared copyTextToClipboard) and a "Copy all" button carrying data-copy-all with the newline-joined run list; extend the Markdown block to include every run.
- **[LOW / correctness]** `src/lib/cron-tester/engine.ts:182` — Parse errors quote an empty token for negative values and blame the wrong field when a list contains a space
  - _Repro:_ explain('-1 * * * *').error === '“” is not a valid minute value (expected a number).' -- the leading `-` is taken as a range separator at engine.ts:175, so aStr is the empty string and invalidToken() quotes nothing. Separately, explain('0 0 * * 1, 3').error === 'The month field has an empty list entry.' -- the stray sp
  - _Impact:_ Both messages point the user at the wrong place. The empty-quote message reads like a tool bug; the month message makes the user stare at a field that is `*`. The contract requires specific, actionable diagnostics.
  - _Fix:_ Reject a leading `-` up front with "Negative values are not allowed in the minute field (allowed 0-59)." For the 6-token case, retry as 5 fields when the 6-field parse fails and prefer the more specific error, or detect a comma adjacent to whitespace and emit "Remove the space after the comma -- cro
- **[LOW / test-coverage]** `src/lib/cron-tester/engine.test.ts:1` — explain() -- the description path that produces the tool's headline output -- has no direct test coverage
  - _Repro:_ engine.test.ts is 32 lines / 4 tests, all calling nextRunEpochSeconds. Nothing asserts any description string, so describe(), describeTime(), detectFullStep(), describeNumericRange() and the whole macro / name-token / range-step-list parse surface are unguarded -- which is why "Every 45 minutes." for `0,45 * * * *` and
  - _Impact:_ The plain-English description is the product and nothing pins it. Any fix to describeTime/detectFullStep will be equally unverified.
  - _Fix:_ Add a table-driven test over explain() asserting exact description strings for `*/5 * * * *`, `0,45 * * * *`, `0 0,23 * * *`, `*/15 9-17 * * 1-5`, `0 9-17 * * 1-5`, `0 0 13 * 5` (OR rule), `@weekly`, `0 0 29 2 *`, plus the error strings for `-1 * * * *`, `0 0 * * 8`, `0 0 * * 1, 3`. Pin next-run out


### jwt-decoder

`0 critical / 2 high / 5 medium / 1 low`

> This is one of the more carefully built tools in the repo — the crypto layer is genuinely good (real RFC 7515 §A.1/§A.3 and RFC 8037 vectors in the tests, correct PS* salt lengths, ES512↔P-521, raw r‖s handled without DER, private-JWK-stripped-for-verify, kid-matched JWKS with an every-candidate fallback, feature-detected Ed25519, and a well-thought-out set of actionable PEM-format errors). I found no XSS: every inje

- **[HIGH / correctness]** `src/lib/jwt-decoder/sign.ts:86` — sign() mints a token whose payload differs from what the user typed (JS number round-trip)  _(re-graded from critical)_
  - _Repro:_ Engine: await sign('{"alg":"HS256","typ":"JWT"}','{"uid":1234567890123456789}','your-256-bit-secret',{alg:'HS256'}). Live: /jwt-decoder/ -> Encode & sign, payload editor set to {"uid":1234567890123456789}.
  - _Impact:_ The encode tab emits a cryptographically valid signed token asserting a claim value the user never entered. Any integer literal beyond 2^53 (snowflake / bigserial id) is silently rounded, and because the signature covers the mangled bytes the token verifies perfectly, so nothing downstream signals the rewrite. Nothing 
  - _Fix:_ Do not round-trip user JSON through JS numbers when building the segments. Either minify the user's own source text losslessly after validating with JSON.parse, or scan for integer literals with |value| > Number.MAX_SAFE_INTEGER and refuse to sign with a specific error.
- **[HIGH / correctness]** `src/lib/jwt-decoder/engine.ts:313` — Decoded header/payload shown are a re-serialization, not the token's real JSON: big integers rounded, duplicate members dropped, keys reordered
  - _Repro:_ decode() on a token whose payload segment is {"uid":1234567890123456789,"exp":1800000000}; also {"sub":"admin","sub":"guest"}, {"sub":"a","2":"two","1":"one"}, {"big":1e400}. Same on the live page in decode mode.
  - _Impact:_ The PAYLOAD block, and the data-copy payload of the "Copy decoded JSON" button, present a value that is not in the token. A duplicate member (the payload-smuggling shape RFC 8725 s2.4 warns about) is erased silently by a tool that also ships a security lint.
  - _Fix:_ Render header/payload from the decoded UTF-8 text with a lossless pretty-printer that preserves number literals, member order and duplicates, or diff the re-serialization against the raw text and warn when they differ.
- **[MEDIUM / correctness]** `src/lib/jwt-decoder/engine.ts:139` — A present-but-malformed exp/nbf reports the flatly false verdict "No exp or nbf claims" and suppresses the missing-exp warning
  - _Repro:_ decode() / live page on header {"alg":"HS256"} + payload {"exp":"soon"} (also exp:null, exp:true, exp:"2026-01-01T00:00:00Z").
  - _Impact:_ Pill, claims row and warnings all read benign while exp is unusable. RFC 7519 s4.1.4 requires NumericDate to be a JSON number, so a conforming verifier will reject or mis-handle the token. "No exp or nbf claims" is a materially different and much less alarming statement than "exp is garbage".
  - _Fix:_ Split the 'none' state: return it only when the keys are genuinely absent. When exp/nbf is present but numericDate() returns null, return a distinct state with a specific detail, tone the claims row as an error, and add a matching lint warning in lint.ts.
- **[MEDIUM / ux]** `src/lib/jwt-decoder/engine.ts:269` — Tokens carrying internal whitespace or a "Bearer " prefix are rejected with a misdirecting base64url error - including the tool's own Copy Bearer header output
  - _Repro:_ Paste "Bearer <token>", "Authorization: Bearer <token>", or the canonical token with one newline in the middle, into #jwt-input on the live page.
  - _Impact:_ The error names base64url, so the user hunts for a corrupt token when the real cause is an invisible line break or a five-letter prefix. Only the outer edges are trimmed. The playground's own "Copy Bearer header" button emits "Authorization: Bearer ..." which the decoder then refuses to read.
  - _Fix:_ Before splitting, strip a leading case-insensitive Authorization:/Bearer prefix and remove internal whitespace; if that rescues the parse, decode and show a muted note. Keep the strict base64url error for what remains.
- **[MEDIUM / ux]** `src/components/JwtDecoderPlayground.astro:1634` — Decode mode has no calm-error hold - a full red error card renders from the very first keystroke
  - _Repro:_ CDP: clear #jwt-input, then append one character of the canonical token at a time with a 320 ms gap (slower than the 220 ms debounce), sampling #jwt-results after each keystroke.
  - _Impact:_ Violates the repo playground contract ("never flash a red border mid-composition - hold the error until ~600ms idle, blur, or Enter"). The card carries role="alert", so a screen reader re-announces the same failure on every keystroke. The encode half of the same tool does hold errors, so the two halves behave different
  - _Fix:_ Route renderError()/the partial-decode branch through the existing ERROR_HOLD_MS timer on top of the 220 ms debounce, cancelled by subsequent input and skipped when the eval was forced (Enter, Ctrl/Cmd+Enter, blur, chip click, snapshot load).
- **[MEDIUM / mobile]** `src/components/JwtDecoderPlayground.astro:922` — Per-block Copy buttons are 41x20 px on touch devices - no coarse-pointer rule
  - _Repro:_ CDP Emulation.setDeviceMetricsOverride {width:390,height:780,mobile:true} + setTouchEmulationEnabled, then getBoundingClientRect() on every .jwt-copy-btn in #jwt-results and #jwt-keys-results.
  - _Impact:_ 20 px tall fails the repo's own 44 px coarse-pointer contract (every other control class in this file has the rule) and WCAG 2.2 SC 2.5.8's 24x24 minimum. On the Generate-keys tab these small buttons are the ONLY way to get the generated key material out of the page.
  - _Fix:_ Add `@media (pointer: coarse) { :global(.jwt-copy-btn) { min-height: 44px; padding-inline: 12px; } }` next to the existing coarse block at line 861.
- **[MEDIUM / correctness]** `src/components/JwtDecoderPlayground.astro:1822` — The encoder silently rewrites an unrecognized header alg and signs anyway
  - _Repro:_ Live page -> "Encode & sign", set the header editor to {"alg":"none","typ":"JWT"} and blur; payload and secret left at seeded defaults.
  - _Impact:_ The header textarea keeps showing alg "none" while the emitted token is signed HS256, with no notice and no echo of the effective header. Someone testing whether their API rejects alg:"none" - a very common reason to reach for a JWT encoder - is handed a fully HS256-signed token instead and records a false result.
  - _Fix:_ When the header JSON parses and carries an alg string that is not in ALL_ALGS, render a held (calm) notice in the encode results, or echo the effective header next to the Compact JWS block so the emitted alg is always visible.
- **[LOW / ux]** `src/lib/jwt-decoder/lint.ts:44` — exp/iat emitted in milliseconds gets no diagnostic - just "Expires in 53852 years"
  - _Repro:_ decode() on payload {"exp":1700003600000,"iat":1700000000000} at nowMs = 1700000000000 (an issuer that used Date.now() instead of Date.now()/1000).
  - _Impact:_ Seconds-vs-milliseconds is the most common real-world NumericDate bug and the tool has every signal needed to name it (a 13-digit epoch landing in year 55840), but instead advises the user to trim their expiry - advice that makes no sense for the actual defect.
  - _Fix:_ In lintToken, when a NumericDate claim is finite and value/1000 lands within a plausible window of now while the raw value does not, push a specific milliseconds warning; apply to exp, nbf and iat.


### uuid-ulid-generator

`0 critical / 2 high / 3 medium / 3 low`

> The engine's cryptographic core is genuinely solid and I could not break it: the ULID bit-packing round-trips the published spec vector `01ARYZ6S41TSV4RRFFQ69G5FAV` byte-for-byte when I decoded its 80 random bits and re-injected them, the all-0xFF and all-zero boundaries encode exactly, 48-bit overflow rejection (`first char > '7'`) is correct, the 2^48-1 boundary decodes to `+010889-08-02T05:31:50.655Z` without thro

- **[HIGH / correctness]** `src/components/UuidUlidGeneratorPlayground.astro:954` — ULID batches are not monotonic — values minted in the same millisecond are emitted in random sort order under a 1..N numbered list
  - _Repro:_ Live: http://localhost:4322/uuid-ulid-generator/#mode=ulid&n=200&uc=1 (Playwright, full reload). Engine: 1000 back-to-back generateUlid() calls.
  - _Impact:_ generateUlid() keeps no cross-call state (engine.ts:222-243) and the playground calls it in a bare loop, so every ULID in a batch draws 80 fresh random bits. Within a millisecond the 48-bit time prefix is identical and the random tail decides byte order, giving ~50% adjacent-pair inversions. The rows are numbered 1..N 
  - _Fix:_ Add a monotonic path to the engine: retain the last (ms, randomBytes) and, when now === previous ms, increment the 80-bit random component by 1 with carry instead of redrawing; overflow rolls to ms+1. Expose generateUlidBatch(count) so the loop at line 954 gets a genuinely ordered batch, and add an 
- **[HIGH / correctness]** `src/components/UuidUlidGeneratorPlayground.astro:961` — Default ULID output is lowercased, contradicting the page's own reference and breaking sort against canonical uppercase ULIDs
  - _Repro:_ Live: #mode=ulid&n=1&uc=0 then #mode=ulid&n=1&uc=1 (~2s apart, full reloads); compare byte sort. Engine: generateUlid() case check.
  - _Impact:_ The engine emits canonical uppercase Crockford; line 961 (`values.push(uppercase ? v : v.toLowerCase())`) lowercases it whenever the Uppercase checkbox is off. That checkbox is unchecked by default (line 71, no `checked`) and the bundled ULID chip sets uppercase:false (examples.ts:26), so the out-of-the-box ULID output
  - _Fix:_ Always emit ULIDs uppercase and disable the case toggle in ULID mode (with the caption 'ULIDs are canonically uppercase'), the way the mode segment already disables Count for the nil UUID (line 911). If a lowercase option is kept it must not be the default, and the summary should warn that lowercase
- **[MEDIUM / ux]** `src/components/UuidUlidGeneratorPlayground.astro:966` — Out-of-range Count is clamped silently — the engine's "Count was adjusted" note is unreachable dead code
  - _Repro:_ Live: type 5000 into #uug-count and click Generate; also #n=5000, #n=0, #n=abc via hash. Engine: generateUuidV4 notes at clamped vs pre-clamped counts.
  - _Impact:_ The playground's own clampCount (lines 879-885) pre-clamps to [1,1000] before calling the engine, so the engine always sees a legal value and reports clamped:false — the note at engine.ts:154-156 ('Count was adjusted to N (allowed range is 1-1000).') can never fire from the UI, and the `note` plumbing at lines 972/981 
  - _Fix:_ Pass the raw countInput.value straight to generateUuidV4 and surface res.notes[0] in the summary via the existing `note` variable; write the clamped value back to countInput.value so the field agrees with the output; add the same note to the ULID branch.
- **[MEDIUM / correctness]** `src/lib/uuid-ulid-generator/engine.ts:58` — Inspector rejects the three most commonly pasted UUID spellings, including the RFC-defined urn:uuid form, with one generic error
  - _Repro:_ Engine: inspectUuid() on undashed / urn:uuid: / brace-wrapped forms. Live: same strings typed into #uug-inspect.
  - _Impact:_ UUID_RE only matches the dashed 8-4-4-4-12 form, but the page promises 'Paste any UUID or ULID' (playground hint line 147, FAQ line 51). The 32-hex undashed form is what .NET Guid.ToString("N"), many REST APIs and log lines emit; urn:uuid:… is the URN representation defined by the UUID RFC itself; {…} is the Windows re
  - _Fix:_ Normalise before matching in inspectUuid: strip a leading urn:uuid:, strip surrounding {}, and if the remainder is 32 bare hex digits re-insert the dashes; report the normalised canonical form back as a row. When it still fails, return a specific diagnostic ('32 hex digits found but no dashes — did 
- **[MEDIUM / a11y]** `src/components/UuidUlidGeneratorPlayground.astro:1018` — Inspect errors are announced as bare "invalid" to screen readers, and inspect results are never announced at all
  - _Repro:_ Live: Playwright fill of #uug-inspect with valid and invalid values; read aria-describedby / aria-invalid / #uug-summary after each.
  - _Impact:_ Two gaps in one path. (1) renderInspect sets aria-invalid="true" (line 1019) but aria-describedby stays frozen at the server-rendered 'uug-inspect-hint uug-inspect-live' (line 144) and the injected .uug-error__detail carries no id, so a screen reader announces 'invalid entry' with no reason — the diagnostic is on scree
  - _Fix:_ Give the error detail a stable id (id="uug-inspect-error") and, mirroring IpConverterPlayground.astro:997-1006, set aria-describedby="uug-inspect-hint uug-inspect-live uug-inspect-error" when invalid and restore it when valid. Then have renderInspect() write a one-line result into #uug-summary (e.g.
- **[LOW / correctness]** `src/components/UuidUlidGeneratorPlayground.astro:1032` — Inspecting the nil UUID never renders the engine's "Nil UUID" explanation — the playground discards res.notes for every UUID  _(re-graded from medium)_
  - _Repro:_ Live: paste 00000000-0000-0000-0000-000000000000 into #uug-inspect and read the rendered card text. Engine: inspectUuid on the same value.
  - _Impact:_ The engine detects the nil UUID and attaches the note 'Nil UUID — all bits zero (RFC 4122 §4.1.7).', but the UUID branch of renderInspect (lines 1032-1035) reads only res.kind, res.version and res.variant. res.notes is consumed solely in the ULID branch (lines 1039-1044), so the note is dropped. The rendered card reads
  - _Fix:_ In the res.kind === 'uuid' branch, append res.notes as a { k: 'Notes', v: n } row (or a caption under the title) exactly as the ULID branch does, so the nil-UUID explanation and any future advisory render.
- **[LOW / correctness]** `src/lib/uuid-ulid-generator/engine.ts:288` — Inspector asserts a "Version" for variants where the version field is undefined, and does not recognise the RFC 9562 Max UUID  _(re-graded from medium)_
  - _Repro:_ Engine: inspectUuid on Microsoft-variant, NCS-variant, all-ones and version-9 UUIDs. Live: Microsoft-variant string typed into #uug-inspect.
  - _Impact:_ engine.ts:288 reads the version nibble unconditionally, before the variant is known. The version field is only defined for the 10xx (RFC 4122 / 9562) variant; for the NCS and Microsoft legacy layouts that nibble belongs to a different structure. The tool nonetheless prints 'Version 4' next to 'Variant: Microsoft (reser
  - _Fix:_ Only report version when variantNibble >> 2 === 0b10; otherwise emit 'Version: n/a (the version field is only defined for the RFC 4122 variant)'. For RFC-variant values outside {1..8} label them 'Version 9 (unassigned)'. Add a Max-UUID special case alongside the existing nil check, mirroring its not
- **[LOW / ux]** `src/components/UuidUlidGeneratorPlayground.astro:1033` — Inspect results offer no way to get anything out — no canonical form and no copy button on a UUID decode
  - _Repro:_ Live: inspect a UUID vs a ULID and count .uug-copy-btn inside #uug-inspect-result; read #uug-copy-link data-copy after a ULID batch.
  - _Impact:_ For kind === 'uuid' not one row sets copy:true, so a UUID inspection renders zero copy buttons — the playground contract's per-row copy affordance is present for ULIDs (Timestamp and Unix ms, lines 1038/1041) but entirely absent for UUIDs. There is also no normalised canonical row: paste an uppercase (or, once the pars
  - _Fix:_ Add a first { k: 'Canonical', v: <normalised lowercase 8-4-4-4-12 form>, mono: true, copy: true } row to the UUID branch. Add an id=… param to the hash so 'Copy link' round-trips the inspected identifier, and relabel or caption the button so it is clear it shares the settings, not the values.


### hash-generator

`0 critical / 1 high / 4 medium / 3 low`

> The engine is the strongest part of this tool and I found no correctness defect in it. I re-derived MD5 against the complete RFC 1321 test suite, against Node's crypto for every input length 0–200 and for 1 MiB, and across Unicode, emoji, ZWJ sequences, RTL text and a lone surrogate; the padding arithmetic at engine.ts:112 is correct across the 55/56/63/64-byte block boundaries. HMAC matched Node for all 84 combinati

- **[HIGH / a11y]** `src/components/HashGeneratorPlayground.astro:115` — Results container is aria-live, so a screen reader re-reads 318 characters of hex twice per keystroke
  - _Repro:_ Playwright against http://localhost:4322/hash-generator/: enumerate [aria-live],[role=status],[role=alert] inside #playground; attach a MutationObserver to #hash-results; type 'defgh' at 260ms/char.
  - _Impact:_ Every evaluation replaces the whole subtree of a polite live region twice — once with 'Computing…' and once with the full four-digest hex wall (318 chars). A screen-reader user typing a 20-char password gets ~40 announcements, 20 of them a 318-character hex wall read letter by letter, so they cannot hear their own typi
  - _Fix:_ Drop aria-live="polite" and aria-atomic="false" from #hash-results (line 115). Leave #hash-summary (line 112, already role="status") as the sole live region and give it a one-line summary; keep #hash-announce (line 125) for copy feedback only.
- **[MEDIUM / mobile]** `src/components/HashGeneratorPlayground.astro:349` — Copy buttons are 26px tall on touch — the hash-tap class meant to fix that does not exist
  - _Repro:_ Playwright context 390x844 isMobile+hasTouch; matchMedia('(pointer: coarse)').matches === true; getBoundingClientRect on every control in the island. Plus `grep -rn hash-tap` across the repo.
  - _Impact:_ Every interactive control in the island except the two <select>s is below the 44px minimum the project contract mandates on coarse pointers — the five per-digest Copy buttons (the tool's primary action) are 26px. The author shipped a `hash-tap` marker class on those buttons that matches no CSS rule anywhere, so the int
  - _Fix:_ Add an `@media (pointer: coarse)` block to the component style setting `min-height: 44px` on `:global(.hash-copy)`, `:global(.hash-chip)`, `.hash-snap-btn` and `.hash-hmac-input`, and `min-width/min-height: 44px` on `.hash-snap-delete` — then either define `.hash-tap` in global.css or drop it from t
- **[MEDIUM / ux]** `src/components/HashGeneratorPlayground.astro:25` — Example picker is a <select> and the required live-eval hint line is missing (no Ctrl/Cmd+Enter run-and-blur)
  - _Repro:_ Playwright: read #hash-example.tagName; scan .hash-pg textContent for the contract hint string; fill #hash-input with 'zz', focus it, press Control+Enter, read document.activeElement.id.
  - _Impact:_ Three deviations from the CLAUDE.md playground UX contract: the example picker is a <select> instead of squared example chips; the exact hint line 'Results update as you type — press Enter to run now.' is absent anywhere in the island, so nothing tells a first-time visitor the tool is live-evaluating (there is no Run b
  - _Fix:_ Replace the <select> with the squared example chips from src/components/IpConverterPlayground.astro (var(--radius-pill), 44px min-height on coarse pointers), add the exact hint line under the textarea, and bind Ctrl/Cmd+Enter to clearTimeout + evaluate() + input.blur(). Bare Enter must keep insertin
- **[MEDIUM / ux]** `src/components/HashGeneratorPlayground.astro:110` — No "Copy all" button — five digests must be copied one at a time
  - _Repro:_ Playwright: document.querySelectorAll('[data-copy-all]').length on the live page with a rendered result card; plus grep for data-copy-all across the rendered DOM dump.
  - _Impact:_ Pasting a full digest set into a release note, ticket or checksum file takes five separate copy clicks with the labels retyped by hand. The CLAUDE.md contract requires a `data-copy-all` control, and Layout.astro already instruments [data-copy-all] for the result_copied analytics event, so only the button is missing.
  - _Fix:_ Add a `data-copy-all` button beside the 'Digests' eyebrow (line 111) that copies the rows as aligned 'LABEL value' lines including the HMAC row, reusing the existing copyText helper and the #hash-announce sr-only status span.
- **[MEDIUM / ux]** `src/components/HashGeneratorPlayground.astro:573` — No byte count and no whitespace indicator — a trailing newline silently changes every digest
  - _Repro:_ Playwright: fill #hash-input with 'abc' then 'abc\n', read the first .hash-row__v and #hash-summary each time. Plus a regex scan of the island's rendered textContent for /\b(bytes?|characters?|chars|length)\b/i. Engine cross-checked under vitest.
  - _Impact:_ Checksum verification is a headline job for this tool ('checksum generator' is a registered keyword at src/data/tools.ts:420 and the page's own Gap section reads 'One stray byte, a checksum that no longer matches'), yet the island reports no input size at all. When a digest fails to match a published one, the most comm
  - _Fix:_ Put a byte count in the #hash-summary status line (e.g. '4 digests · 4 bytes (UTF-8)') computed with new TextEncoder().encode(value).length, and optionally flag trailing whitespace with a muted caption.
- **[LOW / ux]** `src/components/HashGeneratorPlayground.astro:650` — Results card collapses to a "Computing…" placeholder on every evaluation, shifting the page 175px
  - _Repro:_ Playwright, MutationObserver on #hash-results recording getBoundingClientRect().height; baseline with 'abc', then set the textarea to 6 MiB of 'A' and dispatch an input event.
  - _Impact:_ Any input slow enough to miss a frame makes the digest card vanish and everything below jump up 175px, then jump back. For small inputs the wipe still happens sub-frame, which is what produces the duplicate 'Computing…' announcement behind finding #1.
  - _Fix:_ Do not blow away the container. Keep the existing card and mark it stale (an `is-busy` class plus aria-busy on the summary), swapping innerHTML only once the new rows are ready — and only show a placeholder if the evaluation is still pending after ~150ms.
- **[LOW / security]** `src/components/HashGeneratorPlayground.astro:60` — "Save snapshot" writes the plaintext input to localStorage forever, on a panel that warns the input may be a secret  _(re-graded from medium)_
  - _Repro:_ Playwright: fill #hash-input with 'hunter2-my-prod-token', click #hash-snap-save, dump localStorage.
  - _Impact:_ Labeling inconsistency rather than a vulnerability. This tool declares in its own UI 'No share links on this tool — inputs may be secrets' (line 114) and its code comment excludes it from auto-restore for the same reason (line 707), yet the unlabelled Save-snapshot button persists that same plaintext to localStorage in
  - _Fix:_ Either drop the snapshot row for this tool (matching its auto-restore exclusion), or relabel it 'Save snapshot (stored in this browser)' with a muted caption saying the text is written to localStorage in the clear, plus a 'Clear all snapshots' control.
- **[LOW / security]** `src/components/HashGeneratorPlayground.astro:74` — HMAC secret key is rendered in the clear with no mask
  - _Repro:_ Playwright: document.querySelector('#hash-hmac-key').getAttribute('type'); confirmed against the server-rendered DOM dump.
  - _Impact:_ A field labelled 'HMAC key — optional' with placeholder 'secret key' shows a production signing secret in plaintext on screen — over a shoulder, in a screen share, and in any screenshot attached to a bug report. Minor: the value never leaves the browser, and an unmasked field is a defensible choice for a scratch tool w
  - _Fix:_ Switch #hash-hmac-key to type="password" with a small 'Show' toggle that flips the type attribute, keeping autocomplete="off".


### ip-address-converter

`0 critical / 0 high / 3 medium / 7 low`

> The engine's core arithmetic is solid — BigInt end to end, correct dotted/integer/hex/byte-swapped/binary/PTR derivations, RFC 5952 zero-run compression (first-longest-run, no single-group `::`, lowercase), no throw on 200k-char input, and no XSS anywhere (every injected value goes through escapeHtml, including the attacker-controlled `%zone` string, which I drove end to end with `fe80::1%<img src=x onerror=alert(1)>

- **[MEDIUM / ux]** `src/components/IpConverterPlayground.astro:1040` — No calm-error hold: the input flashes red and the result card is destroyed mid-composition
  - _Repro:_ Type an IPv6 literal with any pause >140ms. `input` listener (line 1205-1209) debounces DEBOUNCE_MS=140 then calls `evaluate(true)`, which calls `fail()` (line 1040) synchronously on any invalid value; `fail` calls `setErrorState(true)` -> `.ipc-input--error` (inset red ring, style at line 277) plus `renderError()` whi
  - _Impact:_ Violates the contract's explicit "never flash a red border mid-composition" rule. Because `.ipc-results` is `display:grid; align-content:center; min-height:310px` (line 374-378), each replacement re-centers the content and the panel jumps vertically. This is the file CLAUDE.md names as the reference implementation for 
  - _Fix:_ Port the SubnetCalculator pattern verbatim: `evaluate(source: 'type'|'commit'|'seed')`; for 'type' keep the previous card, skip setErrorState(true), and only call showError after a 600ms ERROR_HOLD_MS timer, suppressed while the value still ends in `[.:/\s]`. Show immediately on Enter, blur, and exa
- **[MEDIUM / ux]** `src/components/IpConverterPlayground.astro:26` — Playground uses a <select> for examples instead of the contract's example chips
  - _Repro:_ Load http://localhost:4322/ip-address-converter/ . The example control is a native `<select id="ipc-example">` populated at boot with all 7 examples as `<option>`s. There are no chip buttons anywhere in the playground.
  - _Impact:_ Contract requires squared example chips at var(--radius-pill) with 44px min-height on (pointer: coarse). On touch a native select is a two-step modal picker, and the seven supported input formats — the whole point of a format-detecting converter — are hidden inside a closed dropdown. CLAUDE.md names this exact file as 
  - _Fix:_ Replace the select with the `#snc-chips` recipe from SubnetCalculatorPlayground.astro: server-rendered squared chip buttons, `role="group" aria-label="Examples"`, `.is-active` on the seeded chip, `min-height: 44px` under `@media (pointer: coarse)`. Update the CLAUDE.md reference note either way.
- **[MEDIUM / correctness]** `src/lib/ip-core.ts:69` — IPv6 with a dotted quad outside the low-order 32 bits is accepted and converted
  - _Repro:_ `convert('1.2.3.4::5')` returns valid. `groupsOf` (ip-core.ts:62-80) only enforces that a dotted segment is the last segment *of its own half*, so a quad in `halves[0]` (the head of a `::`) passes. RFC 4291 §2.2 form 3 requires the embedded IPv4 to be the four low-order octets.
  - _Impact:_ An address no real stack accepts is silently converted into a confident 7-row result card with cross-tool chips. A user pasting an address to validate it gets a false positive. ip-core.ts is shared by all 6 networking tools, so parseIPv6 leaks the same false-accept into cidr-checker, subnet-calculator, subnet-splitter,
  - _Fix:_ Have `groupsOf` take a flag for whether the half is the tail (or the whole address) and reject a dotted segment appearing in `halves[0]` whenever `halves.length === 2`. Also rejects `1.2.3.4::1.2.3.4`. Add these as negative vectors to the ip-core tests.
- **[LOW / ux]** `src/components/IpConverterPlayground.astro:74` — Missing the mandated live-eval hint line
  - _Repro:_ The only caption under the input is the format hint (line 74-78). The contract's exact string "Results update as you type — press Enter to run now." is absent from the component and from the rendered page.
  - _Impact:_ There is no submit button and no visible cue that the tool is live, so a user who types an address and waits for something to press has no affordance telling them it already ran or that Enter forces an immediate run. The input's aria-describedby points only at `ipc-input-hint`, so SR users get no announcement of the in
  - _Fix:_ Add `<p id="ipc-input-live" class="ipc-hint caption text-mute">Results update as you type — press Enter to run now.</p>` after the format hint and add its id to the input's `aria-describedby` (also to both branches of `setErrorState`, line 1001/1004, so it survives the error swap).
- **[LOW / ux]** `src/components/IpConverterPlayground.astro:110` — Single mode has no "Copy all" — seven rows must be copied one at a time
  - _Repro:_ In Single mode the Result bar contains only `#ipc-share` ("Copy link"). The seven per-row copy buttons are the only other copy controls. A Copy-all exists only in `evaluateBulk` (line 1148) and even there it carries `data-copy=""`/`data-copy-label="Copy all"`, not `data-copy-all`.
  - _Impact:_ The contract requires a Copy-all carrying `data-copy-all`. Pasting the dotted/integer/hex trio into a ticket or config takes seven separate clicks, or forces the user to discover Bulk mode and re-enter the same address. Because the bulk button lacks `data-copy-all` it still fires `result_copied` via its `data-copy` att
  - _Fix:_ Add a `data-copy-all` labeled button next to Copy link, hidden until a valid result, and in `renderResult` set its `dataset.copy` to the rows joined as `label\tvalue` lines — the existing delegated `.ipc-copy-btn` handler (line 987-991) picks it up unchanged. Add `data-copy-all` to the bulk button a
- **[LOW / correctness]** `src/lib/ip-core.ts:238` — RFC 5737 documentation and RFC 2544 benchmark IPv4 ranges are labelled "Public / global unicast"
  - _Repro:_ `classifyIPv4` (ip-core.ts:226-239) has no case for 192.0.2.0/24, 198.51.100.0/24, 203.0.113.0/24 (RFC 5737 TEST-NET-1/2/3), 198.18.0.0/15 (RFC 2544 benchmarking) or 192.88.99.0/24 (6to4 relay anycast, deprecated by RFC 7526), so all fall through to the final `return 'Public / global unicast'`.
  - _Impact:_ 192.0.2.1 — the address printed in essentially every RFC example — is reported as globally routable when the IANA special-purpose registry marks it Globally Reachable = False. The IPv6 side of the same table does classify the equivalent range (2001:db8::/32 -> "Documentation"), so the tool contradicts itself across ver
  - _Fix:_ Before the final return in `classifyIPv4`: 192.0.2.0/24, 198.51.100.0/24, 203.0.113.0/24 -> 'Documentation (RFC 5737)'; 198.18.0.0/15 -> 'Benchmarking (RFC 2544)'; 192.88.99.0/24 -> '6to4 relay anycast — deprecated (RFC 7526)'. Optionally special-case 255.255.255.255 -> 'Limited broadcast' ahead of 
- **[LOW / ux]** `src/lib/ip-converter/engine.ts:172` — IPv6 inputs made only of 0s and 1s get a binary bit-width error instead of an IPv6 diagnostic
  - _Repro:_ In branch A, when `parseIPv6` fails and the string is a binary candidate (`/^[01.:_ ]+$/`), the engine falls into `tryBinary` unconditionally (line 172-176) and surfaces its bit-length error, instead of `diagnoseIPv6(s)`. Branch C at line 188 has the correct guard (`strippedBits.length === 32 || === 128`); branch A doe
  - _Impact:_ A malformed IPv6 literal whose hextets happen to be all 0/1 is told about binary bit-width. `1:0:1` -> "Binary input must be 32 bits (IPv4) or 128 bits (IPv6) — got 3." while the structurally identical `1:2:3:4:5:6:7` correctly returns "Expected 8 colon-separated groups (or use \"::\") but found 7." Note: the original 
  - _Fix:_ In branch A, only fall through to `tryBinary` when `strippedBits.length === 32 || strippedBits.length === 128`, matching branch C's guard; otherwise `return bad(diagnoseIPv6(s))`. Add engine tests for `1:0:1` and `1:1:1:1:1:1:1:1:1`.
- **[LOW / ux]** `src/lib/ip-converter/engine.ts:83` — Stray-colon IPv6 typos all fall through to the generic "Could not read that as an IPv6 address."
  - _Repro:_ `diagnoseIPv6` bails to ERR_IPV6_FALLBACK the moment any segment is empty (line 83) and the `halves.length === 2` path never reaches the group-count check at all (line 81 gates it on `halves.length === 1`), so every empty-segment shape gets the same untargeted message.
  - _Impact:_ A leading or trailing colon is the single most likely IPv6 typo and the message says nothing about where the problem is, even though `diagnoseIPv6` already returns positional text for the other failure modes (`Group "xyz" is not valid hexadecimal.`, `Group "12345" has more than 4 hex digits.`, `Expected 8 colon-separat
  - _Fix:_ Before the `segs.some(seg => seg === '')` bail-out, detect the specific shapes: leading single `:` -> "An IPv6 address cannot start with a single \":\" — did you mean \"::\"?"; trailing single `:` -> "Remove the trailing \":\" (or use \"::\" to stand for the omitted groups)."; `:::` -> "\":::\" is n
- **[LOW / correctness]** `src/lib/ip-converter/engine.ts:271` — "Compressed" row for IPv4-mapped addresses is not the RFC 5952 §5 form the page claims
  - _Repro:_ `convert('::ffff:192.168.1.10')` (a bundled example, examples.ts id 'v6-mapped') returns `Compressed = ::ffff:c0a8:10a` while simultaneously emitting `Embedded IPv4 = 192.168.1.10` — the `value >> 32n === 0xffffn` gate at line 273 proves the engine knows the type. RFC 5952 §5 says the IPv4 portion of such addresses MUS
  - _Impact:_ The row labelled canonical is not the §5 canonical form for the one address class the tool explicitly detects, and src/pages/ip-address-converter.astro reinforces the claim in two places. Graded low, not medium: the value is unambiguous and round-trips, the dot-decimal form is still shown on the adjacent Embedded IPv4 
  - _Fix:_ Either emit `'::ffff:' + ipv4ToString(value & 0xffffffffn)` as the Compressed row when `value >> 32n === 0xffffn` (in engine.ts only — leave the shared `ipv6Compress` alone), or soften the page copy. Whichever you pick, `ipv6FormsExample` and the IPv6 FAQ answer must ship to all 5 locales in the sam
- **[LOW / ux]** `src/lib/ip-converter/engine.ts:110` — An invisible character in a pasted address yields a self-contradicting error
  - _Repro:_ Paste `192.168.1.10` with a trailing U+200B zero-width space. `String.prototype.trim()` at engine.ts:128 does not strip U+200B (it is not Unicode whitespace), so `diagnoseIPv4` reaches line 109-111 and quotes the octet verbatim.
  - _Impact:_ The user reads `"10" is not a decimal octet (0–255)` — a statement that renders as plainly false — for an address that looks perfectly correct on screen, with no hint that the problem is an invisible character. Nothing in the message is actionable. Narrow (requires a paste that carries a zero-width char), hence low rat
  - _Fix:_ Strip zero-width/formatting characters up front in `convert` (U+200B–U+200F, U+2060, U+FEFF, U+00AD) and push a warning like "Invisible characters were removed from the pasted value."; as a backstop have `diagnoseIPv4` detect a non-ASCII or invisible character in an octet and name it explicitly.


### case-converter

`0 critical / 1 high / 2 medium / 4 low`  ·  1 claim(s) rejected by the verifier

> The plumbing here is solid: no XSS (every injected value goes through escapeHtml, verified live with a `</script><img src=x onerror=alert(1)>` deep link — the payload came back inert as `scriptImgSrcXOnerrorAlert1`), exactly the contracted two live regions in the island (`#cc-summary` role=status + sr-only `#cc-copy-status`, results container not aria-live), squared example chips rather than a select, the exact requi

- **[HIGH / correctness]** `src/lib/case-converter/engine.ts:52` — Combining marks are treated as word separators — accents are silently deleted and Indic/Thai/Hebrew/Arabic words are shredded  _(re-graded from critical)_
  - _Repro:_ Engine: tokenize('café') -> ['cafe'] (single word, accent gone, no split cue); tokenize('résumé') -> ['re','sume']. Live: http://localhost:4322/case-converter/#q=Cafe%CC%81%20Mu%CC%88ller renders snake_case = cafe_mu_ller, summary '11 cases · 3 words'; the Devanagari deep link renders snake_case = नमस_त_द_न_य, summa
  - _Impact:_ Any \p{M} codepoint is outside both \p{L} and \p{N}, so the split class at line 52 eats it as a separator: the mark is deleted AND a spurious boundary is injected. The worst sub-case is silent — a single NFD word renders 11 ordinary-looking rows with no split cue at all, so 'café' quietly becomes 'cafe'. NFD is not exo
  - _Fix:_ Add \p{M} to the word-character set: .split(/[^\p{L}\p{N}\p{M}]+/u), and append \p{M}* after the letter classes in the four boundary regexes (lines 41-47) so a mark never separates its base letter from the next character. Add engine tests for NFD 'café', 'नमस्ते', 'สวัสดี' asserting one token each, 
- **[MEDIUM / correctness]** `src/lib/case-converter/engine.ts:52` — Apostrophes split English contractions into a bogus extra word — "Don't" becomes "Don T"  _(re-graded from high)_
  - _Repro:_ http://localhost:4322/case-converter/#q=Don%27t%20Repeat%20Yourself renders Title Case = 'Don T Repeat Yourself', sentence case = 'Don t repeat yourself', snake_case = 'don_t_repeat_yourself', camelCase = 'donTRepeatYourself', summary '11 cases · 4 words'. Engine: convertCases("the user's profile").title === 'The User 
  - _Impact:_ Title Case and sentence case are natural-language styles the tool advertises for phrases, and every contraction or possessive is cut into two words. Lowered from high to medium on two grounds I verified: the page does partially disclose the rule (FAQ at src/pages/case-converter.astro:30 — the tokenizer 'splits on space
  - _Fix:_ Strip intra-word apostrophes as the first step of tokenize(): input.replace(/['’ʼ]/gu, '') so "don't" -> ['dont'] and 'O’Brien' -> ['obrien']. Add engine tests for "Don't Repeat Yourself" and "the user's profile", and state the apostrophe rule in the boundary-detection FAQ.
- **[MEDIUM / ux]** `src/components/CaseConverterPlayground.astro:298` — Result labels are force-uppercased, so on a case converter "camelCase" and "PascalCase" render as identical all-caps
  - _Repro:_ Screenshot http://localhost:4322/case-converter/#q=userProfileID at 1280x1900 headless; compare the rendered label column against the DOM strings and against the page's own reference CodeBlock.
  - _Impact:_ On this tool the label IS the specimen — its casing is the content being taught. text-transform:uppercase renders CAMELCASE and PASCALCASE as byte-identical strings and flattens SNAKE_CASE vs SCREAMING_SNAKE_CASE, whose only real difference is casing. Held at medium, not high: the values column still disambiguates the 
  - _Fix:_ Drop `text-transform: uppercase` from `.cc-row__k` (keep the mono font, 11px size and 0.03em tracking) so each label renders in its own case. Keep the uppercase eyebrow treatment on the section eyebrow only, not on per-row style names.
- **[LOW / a11y]** `src/components/CaseConverterPlayground.astro:668` — Summary always says "words", printing "1 words" for single-word input
  - _Repro:_ http://localhost:4322/case-converter/#q=hello — read the role="status" #cc-summary span.
  - _Impact:_ A screen reader announces '11 cases, 1 words' on every single-token conversion, and bare words (hello, id, URL) are a very common input. One correction to the finding: this is not the tool's SOLE live region — #cc-copy-status at line 157 is a second role="status" aria-live="polite" span — but #cc-summary is the one tha
  - _Fix:_ Pluralize: `${wordCount} ${wordCount === 1 ? 'word' : 'words'}`. Separately, `result.rows[2]` is a bare positional index; swap it for `result.rows.find(r => r.kind === 'snake')` so a row reorder cannot silently mis-count.
- **[LOW / ux]** `src/components/CaseConverterPlayground.astro:705` — Ctrl/Cmd+Enter does not blur, violating the playground keyboard contract
  - _Repro:_ Static code path: a Ctrl+Enter / Cmd+Enter keydown satisfies `e.key === 'Enter' && !e.shiftKey`, so it reaches evaluate('commit') and then a blur guard that tests only (pointer: coarse). On a desktop pointer the modifier is ignored and focus stays in the textarea.
  - _Impact:_ CLAUDE.md's playground UX contract states 'Ctrl/⌘+Enter runs+blurs'. A keyboard user invoking the documented run-and-release shortcut stays trapped in the textarea and must Tab out, and the behaviour diverges from Slugify, the closest sibling text tool. Low: a minor keyboard-ergonomics gap, not an a11y blocker — Tab st
  - _Fix:_ Mirror Slugify: `if (e.metaKey || e.ctrlKey || window.matchMedia?.('(pointer: coarse)').matches) input.blur();`
- **[LOW / ux]** `src/components/CaseConverterPlayground.astro:675` — No length cap on the deep-link write — a 19.6 KB paste produces a 22 KB URL and a 22 KB "Copy link"
  - _Repro:_ Deep link built from 1400 repetitions of 'userProfileID ' (19,600 input chars -> 22,440-char URL). The share button un-hides and carries the whole thing; hashState.write() has no length guard, so history.replaceState fires with that URL on every 140 ms debounce tick.
  - _Impact:_ 'Copy link' hands the user a 22 KB URL that chat clients and issue trackers will truncate or reject, so the share affordance is offered but cannot work, and the whole pasted text — which the page invites users to treat as private — lands in browser history on every keystroke. CORRECTION to the finding's framing: the '~
  - _Fix:_ Compute hashState.build(value) once and gate on its length: skip hashState.write() and keep shareBtn.hidden = true past ~2000 chars, with a one-line caption saying the link is unavailable for very long input. Copy the CidrCheckerPlayground MAX_HASH_LEN pattern, or better, push the guard into src/lib
- **[LOW / ux]** `src/lib/case-converter/engine.ts:73` — Error message tells the user to "Enter some text" when they have already entered text
  - _Repro:_ http://localhost:4322/case-converter/#q=---%20%23%40%21 (input `--- #@!`) renders the error card 'Nothing to convert' / 'Enter some text to convert, e.g. "userProfileID".' with summary 'No output'.
  - _Impact:_ Stronger than the auditor argued: because evaluate() short-circuits truly-empty input to toEmpty() before the engine is ever called (CaseConverterPlayground.astro:653), this string is NEVER shown for empty input — the only time a user sees 'Enter some text to convert' is when they already have text in the box, so the m
  - _Fix:_ Return a distinct diagnostic for non-empty but token-less input, e.g. 'No letters or digits found — separators and symbols alone do not form a word.', keeping the current copy for the truly-empty case (the engine still needs it for direct callers).

  _Rejected:_ “Multi-line input is silently concatenated into one identifier with no ” — The behaviour reproduces exactly as described, but the finding asserts a spec that does not apply to this tool, and its central premise is disproved by the sibling. FIRST, I reprod


### slugify

`0 critical / 1 high / 3 medium / 2 low`

> Solid, well-built playground — the UX-contract compliance is genuinely good (exact hint line, 140ms debounce, real chips not a select, results container correctly not aria-live with a single role="status" summary plus an sr-only copy-status span, copy-all + copy-link hidden until valid, every innerHTML interpolation routed through escapeHtml). I probed XSS via a deep link (#q=<img src=x onerror=alert(1)>) and the out

- **[HIGH / correctness]** `src/lib/slugify/engine.ts:47` — Latin letters NFKD does not decompose (ß ø ł æ œ đ þ ð) become word separators, splitting one word into two
  - _Repro:_ slugify('Straße', {separator:'-',maxLength:0,lowercase:true}) -> 'stra-e'; 'Fußball WM 2026' -> 'fu-ball-wm-2026'; 'Nørre Alslev' -> 'n-rre-alslev'; 'Łódź' -> 'odz'; 'Đà Nẵng' -> 'a-nang'; 'Æther Œuvre' -> 'ther-uvre'; 'Þórr Ðelta' -> 'orr-elta'; 'Ærø Ø' -> 'r'.
  - _Impact:_ NFKD leaves ß ø Ø ł Ł æ Æ œ Œ đ Đ þ ð intact (verified: each normalizes to a single unchanged codepoint), so line 53's /[^a-z0-9]+/ treats each as disallowed and line 54 replaces it with the separator — turning ONE word into TWO, or dropping the letter entirely when it is word-initial (Ł, Đ, Æ). The hero badge says 'Ac
  - _Fix:_ Apply an explicit transliteration map after the NFKD/\p{M} pass and before the disallowed-character pass: ß→ss, ø/Ø→o, ł/Ł→l, æ/Æ→ae, œ/Œ→oe, đ/Đ→d, þ/Þ→th, ð/Ð→d, ı→i. engine.test.ts currently has no case for any non-decomposable Latin letter — add one per mapping.
- **[MEDIUM / correctness]** `src/lib/slugify/engine.ts:67` — Max-length truncation drops a whole word when a separator sits exactly at index maxLength  _(re-graded from high)_
  - _Repro:_ slugify('Hello World Again', {separator:'-',maxLength:11,lowercase:true}) -> {"slug":"hello","truncated":true,"notes":["Truncated to fit the 11-character limit."]} — expected 'hello-world', which is exactly 11 chars. Dot separator: slugify('one two three four', {separator:'.',maxLength:7}) -> 'one' (expected 'one.two',
  - _Impact:_ head = s.slice(0,max) ends exactly at a complete word, so it contains no separator AFTER that word and head.lastIndexOf(separator) walks back one word too far. This contradicts the tool's own documented rule, verified rendered on the live page: 'max length cut at last "-" boundary ≤ limit' (src/pages/slugify.astro:102)
  - _Fix:_ Treat a separator sitting at index max as a clean boundary before falling back: `const cut = s[max] === separator ? max : head.lastIndexOf(separator); s = cut > 0 ? s.slice(0, cut) : head;`. Add regression tests at max=11 (kebab) and max=7 (dot) — the existing suite only uses 12/5/4/60/0, the exact 
- **[MEDIUM / correctness]** `src/lib/slugify/engine.ts:47` — NFKD compatibility expansion injects letters that were never in the title and glues them to the neighbouring word (™ → "tm")
  - _Repro:_ Defaults (kebab, lowercase, no limit): 'Acme™ Widgets' -> 'acmetm-widgets'; '№5 Report' -> 'no5-report'; 'Sale ℠ now' -> 'sale-sm-now'; '½ cup' -> '1-2-cup'; '㎏ scale' -> 'kg-scale'; 'Ⅷ chapter' -> 'viii-chapter'.
  - _Impact:_ NFKD is a COMPATIBILITY normalization, so symbols expand to letters (™→TM, №→No, ℠→SM, ㎏→kg) before the symbol-stripping pass at line 53 ever sees them. Pipeline step 2 on the page (src/pages/slugify.astro:81) states 'punctuation, symbols, emoji — are removed'. Instead the letters are injected and glued onto the adjace
  - _Fix:_ Strip the compatibility-symbol block (™ ℠ ℡ № ℅ and the CJK squared units) before normalize(), or run NFD for the diacritic pass and apply NFKD selectively only to the ligature (ﬁ ﬂ ﬀ) and fullwidth classes the page actually advertises.
- **[MEDIUM / ux]** `src/components/SlugifyPlayground.astro:889` — Enter is preventDefault'd unconditionally, so no keystroke — not even Shift+Enter — can insert a newline in the textarea
  - _Repro:_ Static and unambiguous, confirmed against the module the dev server actually serves: the handler early-returns only when `e.key !== 'Enter'`, so Shift+Enter (e.key === 'Enter', shiftKey true) falls through to e.preventDefault(), which suppresses the browser's default newline insertion in a <textarea>. Typing `Part One`
  - _Impact:_ Violates the CLAUDE.md playground UX contract verbatim: 'in a textarea, let the newline insert and flush via setTimeout(evaluate, 0); Ctrl/⌘+Enter runs+blurs'. It is also stricter than the closest sibling text tool: src/components/CaseConverterPlayground.astro:705 reads `if (e.key !== 'Enter' || e.shiftKey) return;`, k
  - _Fix:_ At minimum add `|| e.shiftKey` to the early return, matching CaseConverterPlayground.astro:705. Fully per contract: on plain Enter let the newline insert and flush with `setTimeout(() => evaluate(true), 0)`, reserving preventDefault + blur for Ctrl/⌘+Enter and coarse pointers.
- **[LOW / ux]** `src/components/SlugifyPlayground.astro:788` — Deep-link hash and "Copy link" have no length cap — a pasted paragraph produces a multi-kilobyte URL  _(re-graded from medium)_
  - _Repro:_ buildHash() percent-encodes the entire raw textarea value into `#q=` with no size check, writeHash() history.replaceState()s it on every debounced keystroke (evaluate(true) -> writeHash(raw, opts)), and the same unbounded string is handed to the share button as `shareBtn.dataset.copy`. Verified absent from the served m
  - _Impact:_ A long pasted title yields a link that Slack, email clients and some proxies truncate or reject; the recipient then gets a different slug with no warning. Secondarily the FAQ (src/pages/slugify.astro:46) invites pasting 'draft titles, internal headings or private content', which is then written into the address bar and
  - _Fix:_ Optional hardening, not a contract fix: compute the fragment first and if `hash.length > 2000` skip the history.replaceState write and keep `shareBtn.hidden = true`, mirroring the comment at CidrCheckerPlayground.astro:570-573. The tool keeps working on input of any size either way.
- **[LOW / ux]** `src/lib/slugify/engine.ts:53` — Apostrophes become a separator, emitting a stray one-letter word ("Don't Panic" -> "don-t-panic")  _(re-graded from medium)_
  - _Repro:_ Defaults (kebab, lowercase): "Don't Panic" -> 'don-t-panic'; 'It\u2019s Alive' -> 'it-s-alive'; "O'Brien's Guide" -> 'o-brien-s-guide'.
  - _Impact:_ SEVERELY down-graded, and the auditor's framing is largely wrong. This is NOT a spec violation: the engine returns exactly what the tool's own primary reference table specifies — 'step 4 non-alnum → -' (src/pages/slugify.astro:98, verified rendered on the live page) and the FAQ 'any run of disallowed characters collaps
  - _Fix:_ Either (a) accept current behavior and reword the playground hint so it does not promise punctuation is 'dropped' when intra-word punctuation becomes a separator, or (b) if you prefer the WordPress/github-slugger convention, delete the apostrophe family before the disallowed-run pass: `s = s.replace


### chmod-calculator

`0 critical / 0 high / 4 medium / 3 low`

> The engine's core bit math is genuinely correct and well covered: all 512 three-digit and 4096 four-digit round-trips pass, the s/S and t/T slot mapping matches GNU coreutils (verified rwsr-sr-t -> 7755, rwSr-Sr-T -> 7644, 4000 -> --S------ / ---S------, 1000 -> --------T), the canonical 3-vs-4-digit octal rule holds, 0755 normalises to 755, and every hostile input I threw at it (fullwidth digits, emoji, 100k-char st

- **[MEDIUM / ux]** `src/components/ChmodCalculatorPlayground.astro:894` — Clearing a field renders a hard red error card instead of the calm empty state, which is dead code
  - _Repro:_ Load http://localhost:4322/chmod-calculator/ (seeds 755), click the Octal field, Ctrl+A, Delete, wait 450ms. Repeat on the Symbolic field.
  - _Impact:_ Clearing a field to retype is punished with a red ring, a red 'Could not read that value' card, hidden Copy all / Copy link and a stripped #m= hash - while the matrix still shows all nine 755 checkboxes and the Symbolic field still reads rwxr-xr-x, so the panel contradicts itself. Violates the playground UX contract's 
  - _Fix:_ On empty input mirror IpConverterPlayground.astro:1033-1039 - setOctalError(false)/setSymbolicError(false), hide share + copy-all, render EMPTY_HTML into #chmod-results, clear the summary, writeHash(null). Never route empty through fail(). Separately, hold non-empty parse errors until ~600ms idle / 
- **[MEDIUM / correctness]** `src/components/ChmodCalculatorPlayground.astro:985` — Invalid #m= deep link silently displays the seeded 755 example while the URL still advertises the shared value  _(re-graded from high)_
  - _Repro:_ Open http://localhost:4322/chmod-calculator/#m=888 (or #m=99, #m=75, #m=xyz) in a fresh browser process.
  - _Impact:_ A malformed / truncated / corrupted shared link shows an authoritative 755 result with no warning while the address bar still reads #m=888, and the Copy link button is silently re-armed with #m=755 - so forwarding the link rewrites what the sender meant. The reference implementation (IpConverterPlayground.astro:1257-12
  - _Fix:_ Use the already-constructed hashState.read() (currently never called - only .build() and .write() are used) instead of the ad-hoc /^#m=([0-7]{3,4})$/ filter, seed octalInput with whatever it returns, and call evalOctal(false); engine.parseOctal already emits 'Octal mode must be 3 or 4 digits, each 0
- **[MEDIUM / mobile]** `src/components/ChmodCalculatorPlayground.astro:338` — Permission-matrix checkboxes are 18x18px tap targets on touch with ~92% of each cell dead
  - _Repro:_ Playwright context {viewport 390x844, isMobile:true, hasTouch:true} on /chmod-calculator/; measure .chmod-grid__cell vs .chmod-box, then touchscreen.tap at cellRect.x+6, vertical centre.
  - _Impact:_ The matrix is the tool's headline interaction (H1: 'Toggle bits, read the chmod command instantly') yet on a phone each bit is a bare 18x18 checkbox floating in an 84.7x47 cell - 324 of 3981 px2 live, so ~92% of the cell is dead (the finding said ~95%; the measured figure is 92%). Mis-taps do nothing with no feedback. 
  - _Fix:_ Wrap each matrix checkbox in a <label> filling the cell (display:flex; width:100%; min-height:44px under (pointer: coarse); justify-content:center), keeping the aria-label on the input. Bump .chmod-box to >=24px under (pointer: coarse).
- **[MEDIUM / ux]** `src/lib/chmod-calculator/engine.ts:237` — Real ls -l output with a SELinux '.', ACL '+' or macOS '@' suffix is rejected with a self-contradicting message
  - _Repro:_ parseSymbolic('-rw-r--r--.') / ('-rw-rw-r--+') / ('-rw-r--r--@'); and typing the same into the Symbolic field on /chmod-calculator/.
  - _Impact:_ ls -l on RHEL/CentOS/Fedora prints '-rw-r--r--.' (SELinux marker), any ACL-bearing file '-rw-rw-r--+', macOS with xattrs '-rw-r--r--@'. Pasting that first token - precisely what the page's own FAQ invites (src/pages/chmod-calculator.astro:47: 'Paste a full 10-character string like -rwxr-xr-x into the symbolic field and
  - _Fix:_ Strip a single trailing '.', '+' or '@' from `trimmed` before the length check, then apply the existing 10-char type-prefix strip. Reword the length error to name both accepted forms, e.g. 'Enter 9 characters (rwxr-xr-x) or a 10-character ls -l string (-rwxr-xr-x).'
- **[LOW / correctness]** `src/lib/chmod-calculator/engine.ts:84` — The 'ls -l' output row silently rewrites the file-type character to '-'  _(re-graded from medium)_
  - _Repro:_ Type `drwxr-xr-x` (or `lrwxrwxrwx`) into the Symbolic field; read the row labelled `ls -l`.
  - _Impact:_ The FAQ teaches the type character ('- for a regular file, d for a directory, l for a symlink') and invites pasting the 10-char form, then the tool hands back an `ls -l` string asserting a regular file when the user said directory or symlink. The per-row copy button and the Copy-all payload both carry the rewritten str
  - _Fix:_ Thread the parsed type character through: have parseSymbolic capture body[0] from the 10-char form (validated against the POSIX set -dlbcps) and pass it to fromState/ChmodResult so lsStyle echoes it; default to '-' for the 9-char, octal and matrix paths.
- **[LOW / correctness]** `src/lib/chmod-calculator/engine.ts:233` — Any character is accepted as the ls -l type prefix, so junk-prefixed input yields a confident result
  - _Repro:_ parseSymbolic('Zrwxr-xr-x') / ('9rwxr-xr-x') / ('‮rwxr-xr-x'); same values typed into the Symbolic field.
  - _Impact:_ The 10-char branch is documented as the ls -l form but validates nothing about the type character, so a stray leading keystroke, a mis-selected paste boundary, a NUL or a bidi control character is swallowed and the tool reports a confident mode instead of flagging that it did not understand the first character. The 9-c
  - _Fix:_ Only strip the prefix when it is a POSIX file-type character: `if (body.length === 10 && '-dlbcps'.includes(body[0]))`. Otherwise fall through to the length error so a 10-char string with a bogus prefix is reported rather than silently truncated.
- **[LOW / a11y]** `src/components/ChmodCalculatorPlayground.astro:804` — aria-describedby is never pointed at the error detail; the id rendered for that purpose is dead
  - _Repro:_ Type 888 into the Octal field, then read #chmod-octal's aria-describedby.
  - _Impact:_ A screen-reader user who tabs back to the invalid field hears 'invalid entry' plus the two generic hints, but never the specific diagnostic, which lives in #chmod-results - a container with no aria-live. The message is announced only once, transiently, via the #chmod-summary role=status when it changes. The id="chmod-e
  - _Fix:_ In setOctalError/setSymbolicError swap aria-describedby between 'chmod-input-hint chmod-input-live' and 'chmod-input-hint chmod-input-live chmod-error-detail' as the error toggles, matching IpConverterPlayground.astro:997-1006.


### subnet-calculator

`0 critical / 0 high / 2 medium / 5 low`

> This tool is in good shape on the fundamentals and the failures are concentrated in the shared IPv6 parser rather than the subnet maths. Everything I could check against RFCs came out right: /31 (RFC 3021), /32, /0, host-inside-block masking, netmask/wildcard/binary derivation, non-contiguous-mask and wildcard-mask detection, RFC 5952 leftmost-longest-run compression, and exact BigInt counts up to 2^128 — 66 existing

- **[MEDIUM / correctness]** `src/lib/ip-core.ts:69` — parseIPv6 accepts a dotted quad in the head half of a "::" split, silently returning a different network
  - _Repro:_ calculate('192.168.1.10::1/64') -> valid IPv6, title=c0a8:10a::/64. Also calculate('1.2.3.4::1') -> 102:304::1/128; calculate('2001:db8:1.2.3.4::5') -> 2001:db8:102:304::5/128; calculate('10.0.0.1::8080') -> a00:1::8080/128. No error in any case.
  - _Impact:_ RFC 4291 §2.2 permits a dotted quad only as the final 32 bits of the WHOLE address. The `i !== segs.length - 1` guard sits inside `groupsOf`, which is invoked once per `::` half, so a quad at the end of the head half passes. A malformed paste (IPv4 with a stray `::`, a host:port fragment) produces a confident IPv6 card
  - _Fix:_ Thread an `isLastHalf` flag into `groupsOf` and permit a dotted segment only when it is the final segment of the whole address (i.e. reject any dotted segment in the head half of a `::` split). Add engine tests for `1.2.3.4::1`, `2001:db8:1.2.3.4::5` and the valid `::ffff:192.168.1.1` — grep of src/
- **[MEDIUM / ux]** `src/lib/subnet-calculator/engine.ts:80` — Zone-ID literals (fe80::1%eth0) are misdiagnosed as invalid hexadecimal, unlike two sibling networking tools
  - _Repro:_ calculate('fe80::1%eth0/64') and calculate('fe80::1%eth0') both return invalid with error `Group "1%eth0" is not valid hexadecimal.`
  - _Impact:_ `fe80::1%eth0/64` is verbatim what `ip -6 addr show` and `ifconfig` print, so it is among the most likely IPv6 pastes into this box. The message asserts the hex is wrong — it is not — sending the user hunting a nonexistent typo instead of dropping the zone. It also breaks suite consistency: src/lib/ip-converter/engine.
  - _Fix:_ Strip a trailing `%<zone>` before parsing, mirroring the ip-converter's ordering (prefix first, then zone), and either echo it as a Zone ID row or return a cidr-checker-style targeted message such as "Zone ID %eth0 isn't part of the prefix — try fe80::1/64."
- **[LOW / correctness]** `src/lib/ip-core.ts:28` — Octets with leading zeros are read as decimal with no warning, diverging from inet_aton (ping/curl)
  - _Repro:_ calculate('192.168.010.1/24') -> valid, title=192.168.10.0/24, Network address=192.168.10.0, Broadcast address=192.168.10.255. Also calculate('127.000.000.001') -> 127.0.0.1/32 and calculate('010.0.0.0/8') -> 10.0.0.0/8.
  - _Impact:_ inet_aton (glibc, so ping/curl and most C callers) reads `010` as octal 8, resolving 192.168.010.1 to 192.168.8.1 — a different host in a different /24 than the 192.168.10.0/24 reported here. Python's ipaddress and Go's net/netip reject leading zeros outright for this reason (CVE-2021-29921). Zero-padded addresses turn
  - _Fix:_ Tighten the octet pattern in parseIPv4 to `/^(0|[1-9]\d{0,2})$/` so ambiguous forms are rejected, and add a diagnoseIPv4 branch returning e.g. `Octet "010" has a leading zero — write 10 (ping and curl read a leading zero as octal).` Because ip-core is shared, this lands consistently across all six n
- **[LOW / correctness]** `src/lib/subnet-calculator/engine.ts:315` — "Address type" classifies only the network number and ignores the prefix, mislabelling 0.0.0.0/0 and ::/0
  - _Repro:_ calculate('0.0.0.0/0') -> Details/Address type = 'This network (0.0.0.0/8)'. calculate('::/0') and calculate('2001:db8::/0') -> 'Unspecified (::)'. calculate('10.0.0.0/4') -> 'This network (0.0.0.0/8)' for a block whose own card says it spans 0.0.0.1–15.255.255.254.
  - _Impact:_ The card's title is the BLOCK (`0.0.0.0/0`), so the "Address type" row reads as the block's category — but classify() is handed only the network number. `0.0.0.0/0`, the default route and every allow-any firewall rule, is labelled as a /8 special-purpose range 16.7M times smaller than itself; `::/0` is labelled "Unspec
  - _Fix:_ Pass the prefix into the classification: when the entered prefix is shorter than the special-purpose prefix that matched, suppress the row or label it by coverage (e.g. `Default route (0.0.0.0/0) — the entire IPv4 space`, `Default route (::/0) — the entire IPv6 space`).
- **[LOW / ux]** `src/components/SubnetCalculatorPlayground.astro:759` — Headline answer tiles have no per-value copy button, unlike every detail row
  - _Repro:_ On any result, the three `.snc-answer__tile` elements (Total addresses / Address range / /64 subnets on IPv6; Usable hosts / Usable range / Total addresses on IPv4) render value + optional caption and nothing else, while every `.snc-row` below appends copyBtnHtml(). On IPv6 the range string and total appear in no row, 
  - _Impact:_ Breaks the suite convention set by the reference implementation (IpConverterPlayground renders every value as a row and gives every row a copy button — it has no tile concept). The three most prominent numbers are the only ones without a one-click copy, and the displayed text differs from the machine value (en-dash `20
  - _Fix:_ Append `copyBtnHtml(s.label, s.value)` inside each `.snc-answer__tile`, wrapping value+button in a flex row the way `.snc-row__v-wrap` does, so the machine-form `value` (not the en-dash/thin-space `display`) is what gets copied.
- **[LOW / ux]** `src/components/SubnetCalculatorPlayground.astro:704` — monoHtml inserts a <wbr> between the two colons of "::", allowing a line break inside the compression token
  - _Repro:_ monoHtml runs `escapeHtml(s).replace(/([.:])/g, '$1<wbr>')` per character, so `2001:db8::` becomes `2001:<wbr>db8:<wbr>:<wbr>` — a break opportunity sits between the two colons of `::`.
  - _Impact:_ `<wbr>` is a preferred break opportunity, so in a narrow column the browser will break exactly there, rendering `2001:db8:` on one line and `:` on the next. A split `::` stops reading as the zero-compression token, so a user transcribing the value by eye can drop or duplicate a colon. Affects the card title, network ad
  - _Fix:_ Match the compression token as a unit: `escapeHtml(s).replace(/(::|[.:])/g, '$1<wbr>')`, which yields `2001:<wbr>db8::<wbr>` and never offers a break inside `::`.
- **[LOW / a11y]** `src/components/SubnetCalculatorPlayground.astro:973` — Example chips signal the active example with a CSS class only — no aria-pressed, unlike the CIDR checker's chips
  - _Repro:_ syncChips only calls `chip.classList.toggle('is-active', …)`; the .astro template at lines 30-38 renders the chip buttons with type/class/data-input/aria-label and no aria-pressed, so neither the active nor the inactive chips ever expose pressed state.
  - _Impact:_ A screen-reader or high-contrast user gets no indication of which example is loaded, and cannot tell that activating the chip they are on is a no-op. The state is ambiguous visually too: global.css-scoped rule at lines 221-225 gives `.snc-chip:hover` and `.snc-chip.is-active` the identical `background: var(--color-bran
  - _Fix:_ Render the chips with `aria-pressed="false"` in the template and set `chip.setAttribute('aria-pressed', String(match))` in syncChips (and `'false'` in clearChips), matching CidrCheckerPlayground.astro:862/869.

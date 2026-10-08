# Post-deploy validation: PR #78

Date: 2026-10-08
Models used: re-testers = sonnet x6, smoke = haiku, SEO = seo-ops agent, writer = sonnet.

## 1. Verdict

- Deployed build: `BUILD_ID = '5387781'` (confirmed from `https://opscanopy.com/sw.js` by several testers).
- Retest results: 87 items across 6 re-tester groups.
  - Fixed live: 80
  - Still broken: 1
  - Known skipped (listed in PR #78): 6 entries (jq-playground appears 3 times, plus kubernetes-label-selector-tester, cve-ignore-converter Snyk caution, promql-explainer follow-ups)
- Regressions: none hard. No console errors or exceptions on any visit, and no duplicated CodeMirror fallback on any tool. A few cosmetic leftovers are listed in section 3.
- Go / no-go: **GO**. The one still-broken item is a missing display row, not a crash or wrong answer. The smoke sweep only has HTTP-status evidence (see section 6). Follow-ups are listed below.

## 2. Still broken

| slug | bug | evidence |
|---|---|---|
| uuid-ulid-generator | Inspector shows no timestamp for UUID v7, v1 and v6 | Inspecting `018f2a3c-7b5d-7c3e-9a1b-0123456789ab` (v7), `6ba7b810-9dad-11d1-80b4-00c04fd430c8` (v1) and `1ee2f2b4-8d0a-6b5c-8000-0123456789ab` (v6) shows only Format, Version and Variant, with no Timestamp row. The live engine chunk has the urn:uuid fix and the engine sets the timestamp (engine.ts:396), but the UUID render branch never pushes a Timestamp row. Only the ULID branch does. |

## 3. Regressions

None that break behaviour. Cosmetic or worth confirming:

- llm-vram-calculator: when context exceeds the model's own maximum (Gemma 2 9B at 32768, Mistral 7B v0.3 at 131072) the warning shows, but the Copy link button is hidden and the usual "fits" verdict is not rendered. It is treated as a blocking state. Confirm this is intended.
- data-size-converter: for 0.0000001 B the summary says "~ 0 bytes", but the Notes line still says "is 0 bytes — not a whole number of bytes".
- github-actions-expression-tester: the operator legend still says "numeric comparison" for string operands, although the explanation line above it is correct.
- jq-playground: after a compile error, the previous OUTPUT is still listed beneath the error card.
- uuid-ulid-generator: the seed contains random v4 UUIDs on first load, which CLAUDE.md says should be Nil UUID only. The page replaces them at boot. This is not a PR #78 change; check it against the documented rule.
- mac-address-formatter: newline-separated MACs could not be tested because the field is a single-line input. Space and comma lists give the new message.

## 4. Fixed live

| slug | bug | evidence |
|---|---|---|
| subnet-calculator | Leading-zero octet gets a generic error | `192.168.001.010/24` now says octet "001" has a leading zero and is ambiguous. Defaults, 10.0.0.0/8 and IPv6 still work. |
| subnet-splitter | Share link loses prefix and allocations | Hash is `#ip=...&prefix=26&alloc=...`; Copy link holds the same URL. |
| mac-address-formatter | One generic error for every failure | Now reports hex digit counts and the bad character. |
| mac-address-formatter | Two MACs in one input fail without saying why | Space and comma lists say "Looks like 2 addresses". |
| data-size-converter | Sub-byte value shown as "= 0 bytes" | Summary now "~ 0 bytes" (see section 3 for the Notes leftover). |
| systemd-unit-validator | Duplicate OnCalendar note wrong; `*-02-31` not flagged | Now an error for Feb 31; note says the timer fires on whichever schedule elapses next. |
| llm-token-counter | Lone surrogate throws URIError; stale hash | No exception; hash, link and screen agree (U+FFFD). |
| llm-vram-calculator | Out-of-range params and context silently clamped | Shows range messages; link hidden. |
| llm-vram-calculator | Empty, zero, negative or non-numeric input computed as "fits" | All show range errors; no hash written. |
| llm-vram-calculator | No warning when context exceeds model maximum | Warning shown for Gemma 2 9B and Mistral 7B v0.3. |
| cve-ignore-converter | Trivy `exp:` suffix rejected | Both IDs kept; Grype note says expiry dropped; Snyk keeps expiry. |
| cve-ignore-converter | Expiries dropped for Trivy; expired ignores become permanent | Snyk to Trivy keeps `exp:` and notes already-expired entries. |
| cve-ignore-converter | TOML single-quoted strings corrupted | `#` and backslash preserved. |
| cve-ignore-converter | Snyk-native IDs copied to Trivy/Grype without warning | "Snyk-only id" warning shown. |
| aws-iam-policy-generator | Trust policy with Principal `*` and no Condition | Error shown. |
| aws-iam-policy-generator | Switching to Trust keeps non-STS actions | Each non-sts action flagged. |
| aws-iam-policy-generator | Condition operators and values never type-checked | Four warning types shown; keys escaped. |
| aws-iam-policy-generator | Invalid principals and S3 ARN mismatch not caught | Errors and warnings shown; valid ARNs clean. |
| hash-generator | CRLF silently normalised | Disclosure text now on the page. |
| jwt-decoder | Non-numeric exp accepted silently | Warning shown; signature verdict unchanged. |
| jwt-decoder | Pasted "Bearer <token>" rejected | Decodes, upper and lower case. |
| alertmanager-route-tester | Unparseable matcher skipped | Error: could not parse matcher. |
| alertmanager-route-tester | Unknown keys and bad durations ignored | Both reported. |
| alertmanager-route-tester | Matchers on root route accepted | Error shown. |
| alertmanager-route-tester | RE2-rejected regex evaluated with JS semantics | Lookahead and backreference rejected. |
| prometheus-relabel-tester | RE2-rejected lookahead accepted | Error on Rule 1. |
| grafana-dashboard-validator | Duplicate refId not flagged | Finding raised; clean dashboard says "All 23 rules ran". |
| promql-explainer | rate() on instant vector explained as valid | Type error shown. |
| promql-explainer | Unknown functions explained best-effort | "did you mean rate()?" |
| promql-explainer | Negative offset contradiction | Reads "shifted forward in time". |
| promql-explainer | Ungrammatical composed sentences | Readable now (still a little stiff on subqueries). |
| promql-explainer | Invalid duration gets bracket error | Duration error with valid units. |
| logql-promql-helper | Range and offset thrown away | `[1h] offset 1d` preserved. |
| logql-promql-helper | No-range query accepted with made-up [5m] | Error: needs a range. |
| logql-promql-helper | Valid unwrap queries rejected | Converts with notes. |
| cron-to-systemd | User column ends up in ExecStart | Moved to `User=root`, with note. |
| cron-to-systemd | Impossible date converts silently | "Never fires" note. |
| cron-to-systemd | @reboot includes Persistent=true | Removed. |
| cron-expression-tester | DOM `*/2` plus DOW should use AND | Next runs match expected Mondays. |
| github-actions-validator | secrets in step `if:` not flagged | Error shown. |
| github-actions-validator | needs.<job> without listing it | Warning shown. |
| github-actions-expression-tester | String comparisons coerce to number | Strings compare as text (legend leftover in section 3). |
| github-actions-expression-tester | `}}` inside string ends expression early | Now correct. |
| github-actions-expression-tester | branches and branches-ignore accepted together | Rejected, also for tags. |
| gitlab-ci-validator | only and rules in same job | Error shown. |
| gitlab-ci-validator | needs on later-stage job passes | Error shown. |
| gitlab-ci-validator | Circular extends and bad !reference pass | Three errors shown. |
| gitlab-ci-validator | Invalid rules:if syntax not flagged | Error shown. |
| docker-run-to-compose | Named volumes not declared at top level | Top-level `volumes:` emitted. |
| docker-run-to-compose | tmpfs becomes anonymous volume | Emitted as `tmpfs:`. |
| docker-run-to-compose | `$(pwd)` copied verbatim | Rewritten to `.` with warning. |
| docker-run-to-compose | Compose to run drops read_only and tmpfs | Both kept. |
| docker-run-to-compose | Compose `$$` not converted | Converted to `$`. |
| docker-run-to-compose | Out-of-range port accepted | Port error. |
| kubernetes-resource-calculator | `129e6` rejected | Accepted. |
| kubernetes-resource-calculator | `1m` memory called invalid | Warns "did you mean 1Mi?" |
| kubernetes-resource-calculator | Sub-millicore CPU becomes 0m | Rounds to 1m. |
| kubernetes-resource-calculator | CPU limit below request wording | Clear rejection message. |
| env-example-checker | Commented-out code reported as missing | Ignored now. |
| env-example-checker | Go `os.LookupEnv` not detected | Detected. |
| env-example-checker | `Bun.env` not detected | Detected (Deno too). |
| base64-encoder-decoder | Binary decode mojibake with no warning | Not-valid-UTF-8 note. |
| base64-encoder-decoder | Data URI and multi-line vague errors | Specific messages. |
| json-yaml-converter | Unquoted `: ` reported as bad indentation | Specific message with fix. |
| json-yaml-converter | Complex key silently stringified | Warning shown. |
| json-yaml-converter | Contradictory "looks like YAML" hint | Removed. |
| json-yaml-converter | Recursive alias also shows "anchors expanded" | Removed. |
| timestamp-converter | Fractional epoch and exponent forms rejected | Accepted. |
| timestamp-converter | Impossible date rolls over | Clear error. |
| timestamp-converter | Timezone-less and slashed dates give no notice | Notices shown. |
| url-encoder-decoder | Stale result for input ending in `%` | Shows "Still typing" or a specific error. |
| regex-log-tester | Catastrophic pattern freezes page | Blocked in about 1.5 s. |
| regex-log-tester | Guard false-positives on literal alternations | `(foo|bar)+` now matches; `(a+)+$` still blocked. |
| regex-log-tester | `\p{L}` without u and `(?i)` give no hint | Hints shown. |
| case-converter | Apostrophes split words | Fixed. |
| case-converter | "1 words" | Now "1 word". |
| slugify | Non-Latin title wrong error | Correct message. |
| slugify | Mixed-script input drops characters silently | Count of dropped characters shown. |
| uuid-ulid-generator | Inspector rejects braces, urn:uuid, bare hex; bad ULID letter not named | All accepted; letter named. |
| uuid-ulid-generator | Count field clamps silently | Field rewritten to clamped value. |

## 5. Known skipped

All are listed as skipped or open in PR #78 and were not changed.

- jq-playground: non-terminating filter freezes the tab. Needs a Worker with a kill timeout. Not exercised, to avoid freezing the browser.
- kubernetes-label-selector-tester: `gt`/`lt` rejected with an explanation. Behaviour unchanged, as the PR said. No regressions on its default.
- cve-ignore-converter: Snyk key-mismatch caution on `.snyk` output. Skipped because it changes the SSR seed.
- promql-explainer: `rate(-x[5m])` accepted, and explanation field filled next to an error.

## 6. Smoke sweep

The smoke agent (haiku) reported only the fast curl pass. Its browser pass was still running when the result was taken, so no seeded-panel or JavaScript results from it exist.

| check | result |
|---|---|
| All 42 tool pages, HTTP status | 200 |
| /de/ spot check: subnet-calculator, alertmanager-route-tester, docker-run-to-compose, jwt-decoder, slugify | 200 |

Failures: none seen. Seeded panel and JS checks from this agent: not completed. The six re-testers did cover default panels, console errors and CodeMirror fallbacks on 42 of the tools they exercised (see section 3 and "Could not test").

## 7. SEO live checks

Result: 5 of 6 pass, 1 partial.

- Sitemaps: partial. Index and `sitemap-0.xml` return 200. All 604 URLs return 200. But every `<lastmod>` is a full datetime (`2026-10-08T00:00:00.000Z`). The repo's `check-sitemap-lastmod.mjs` is meant to fail on any time of day, so either it tolerates midnight or the live file differs from what it checks. Google accepts the format. Worth a look. The 10 URLs for the 5 changed FAQ tools (en and de) are dated 2026-10-08.
- FAQPage JSON-LD: pass. All 10 pages parse and visible FAQ matches JSON-LD. The cron-to-systemd mismatch was a checker artifact (the `<expression>` placeholder).
- Canonical, hreflang, robots, H1: pass. Canonicals are self-referential, hreflang is de, en, es, fr, pt-BR and x-default, no noindex, one H1 per page.
- llms files: pass. Both return 200 and carry the new volumes wording. Side finding below.
- robots.txt and status codes: pass.
- Seeded results in raw HTML: pass for docker-run-to-compose, cron-expression-tester and grafana-dashboard-validator.

Content contradiction to fix: `llms-full.txt` line 32992 (a docker-run-to-compose blog post) says converting "doesn't invent a top-level `volumes:` declaration you didn't ask for", and line 32846 says something similar for `networks:`. The tool now emits those top-level blocks, so the post contradicts the updated FAQ.

## 8. Could not test

- Newline-separated MAC input (single-line field strips newlines).
- jq-playground non-terminating filter (would freeze the browser).
- Smoke agent browser pass (seeded panels and JS on all tools) did not finish.
- Localized (de, es, fr, pt-br) tool behaviour beyond the 5 /de/ status checks and the 10 SEO pages.
- Deliberately untested: skipped PR items (promql follow-ups, CVE to `.snyk` caution).

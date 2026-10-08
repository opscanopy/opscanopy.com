# OpsCanopy persona review, 2026-10-07

Six personas tested 42 tools on the live site. Six verifiers then re-ran every claimed bug. Only bugs the verifier marked confirmed are listed as bugs. Models: personas Priya, Sam and Aisha on sonnet; Marcus, Elena and Dmitri on opus; smoke sweep on haiku; verifiers (6 in parallel) and writer on sonnet; SEO impact by the seo-ops agent.

## 1. Summary

- Tools reviewed by personas: 42 (smoke sweep also covered 42).
- Average persona rating: 3.56 out of 5 (sum 149.5 over 42 tools).
- Confirmed bugs: 91 in total. High 15, Medium 44, Low 32. Severity is the persona's rating. Where the verifier said a rating was overstated, that is noted in the table below.
- Tools with zero confirmed bugs: certificate-decoder, chmod-calculator, loki-alert-rule-tester, dockerfile-linter, terraform-plan-summarizer.
- Smoke sweep: 42 of 42 tools load, are server-seeded, and show no console errors.
- No persona saw input leave the browser. Dmitri logged all network traffic and found only Google Tag Manager, Google Analytics and the Cloudflare beacon.

Overall verdict: the tools load and the core math is mostly right (IP math, hashes, token counts, certificates and Terraform summaries all checked out against reference tools). The weak spot is validators and converters that accept or output something the real system would reject. That shows up as a clean "OK" or "no findings" for bad input. The worst are the Alertmanager, GitHub Actions, GitLab CI, docker-to-compose, IAM and CVE-ignore tools. Three tools can also hang the tab or show stale output (jq, regex tester, URL decoder).

Search traffic is near zero (6 clicks, 24 impressions in 28 days, all clicks on `/`), so fixes buy trust and correctness, not ranking, right now.

## 2. Fix first

Order: SEO-impact priority (P0 to P3) first, then severity. Priorities come from the SEO analysis in section 3. "Root cause" is given only where a verifier named it.

### P0

| Slug | Input | Actual | Expected | Root cause | Sev |
|---|---|---|---|---|---|
| docker-run-to-compose | `docker run -v pgdata:/var/lib/postgresql/data postgres:16` (also the built-in Postgres example) | Service volume with no top-level `volumes:` key. `docker compose config` fails: "refers to undefined volume pgdata" | Add top-level `volumes: { pgdata: {} }` | Converter only builds `m.volumes` strings and never collects named sources (engine.ts ~594) | High |

### P1, correctness

| Slug | Input | Actual | Expected | Root cause | Sev |
|---|---|---|---|---|---|
| github-actions-expression-tester | `${{ 'a' < 'b' }}` (also `'b' > 'a'`, `'abc' < 'abd'`, `'a' < 'B'`) | FALSE, "compares numerically" | TRUE (runner compares strings ordinally, case-insensitive) | `compare()` in values.ts:88-91 always calls `castToNumber` | High |
| github-actions-expression-tester | `${{ format('{{Hello {0} {1} {2}!}}', 'Mona', 'the', 'Octocat') }}` (GitHub docs example) | Garbage value plus false always-true warning | `{Hello Mona the Octocat!}` | Lazy `}}` regexes: `substituteSpans` in engine.ts ~100, extractor at if-footgun.ts:74, `SPAN_RE` at if-footgun.ts:23 | High |
| gitlab-ci-validator | Job with both `only: [main]` and `rules:` | Info only ("uses legacy only/except") | Error: "config key may not be used with rules: only" | Emitted at info level, no conflict check (engine.ts ~721-735) | High |
| alertmanager-route-tester | `matchers: ['severity critical']` | "1 receiver · a" plus small "skipped" note, route catches everything | Error (Alertmanager refuses to load) | `collectMatchers` warns and skips by design (engine.ts ~288-384) | High |
| alertmanager-route-tester | `matchres:` typo key, `group_wait: 30x` | Routed to `a`, no warning | Errors for unknown field and bad duration | `RawRoute` has no unknown-key or duration check (engine.ts ~56-65) | High |
| logql-promql-helper | `count_over_time({job="sshd"}[1h] offset 1d)` | Output `[5m]`, range and offset dropped as "pipeline" | `[1h] offset 1d` preserved | Parser reads range and offset as pipeline text | High |
| promql-explainer | `rate(http_requests_total)` | Explained as valid | Error: expected range vector | No type checking | High |
| promql-explainer | Default example (histogram_quantile...) | "where adds the series together... over computes..." (also in the server-rendered seed) | Readable nesting | Composers splice a verb phrase where a noun phrase belongs (engine.ts ~1015-1046) | Low (P1 because it is in the seed) |
| aws-iam-policy-generator | Trust policy, Principal `*`, no condition | "Valid policy, no warnings" | Error: anyone can assume the role | Public-principal warning gated on `kind === 's3-bucket'` (engine.ts:152) | High |
| aws-iam-policy-generator | Switch default S3 policy to Trust | s3 actions kept, reported valid | Error: only STS actions allowed | `validate()` has no action check for trust | Medium |
| cve-ignore-converter | osv-scanner to Grype, TOML `reason = 'Disputed: not reachable # see JIRA-1 ...'` | `reason: "'Disputed: not reachable"`, status "no lossy changes" | Full string preserved, or an error | `stripTomlComment` and `parseTomlScalar` handle only double quotes (engine.ts:421, 435) | Medium (silent corruption) |
| cve-ignore-converter | Snyk to Trivy, entry with `expires: 2025-01-01` | Expiry dropped, note says "Trivy cannot represent the expiry" (false). Expired ignore becomes permanent | `CVE-... exp:2025-01-01`, flag already-expired | Expiry always dropped for Trivy (engine.ts:469-470) | High (verifier: note does disclose the drop) |
| cve-ignore-converter | `CVE-2023-44487 exp:2027-01-01` as Trivy input | Line skipped, CVE lost | Parse id plus expiry | Text before `#` taken as id; `exp:` suffix rejected (engine.ts ~156-170) | High (verifier: reported in a note, so "high" overstates it) |
| docker-run-to-compose | `--mount type=tmpfs,destination=/run,tmpfs-size=64m`, and compose `type: tmpfs` | Becomes `- /run` disk volume, size dropped; reverse gives `-v /run` | `tmpfs:` / `--tmpfs` | `longVolumeToShort` ignores `item.type` (engine.ts:773) | High |
| docker-run-to-compose | `-v "$(pwd)":/app:ro` | `$(pwd):/app:ro`, compose rejects it | `./` or `${PWD}`, or a warning | No handling | Medium |

### P1, freezes and stale output

| Slug | Input | Actual | Expected | Root cause | Sev |
|---|---|---|---|---|---|
| jq-playground | Program `repeat(1)` | Tab frozen 24 s or more; live eval means typing triggers it | Worker with a time limit and the existing `limit(n; ...)` hint | `jq.raw()` runs on the main thread (engine.ts:730) | High |
| regex-log-tester | `^(([a-z])+.)+[A-Z]([a-z])+$` on an 88-char line | Not blocked, page unresponsive about 12 s | Block it, or run in a Worker with a timeout | `endsWithMandatoryAtom` exemption in regex-safety.ts treats trailing `.` as a separator but it overlaps `[a-z]` | High |
| url-encoder-decoder | Decode `a%20b` then `a%20b%` | Old output card stays, summary cleared, until blur or Enter | Truncated percent-escape error, or clear the panel | Trailing `%` skips error-hold timer but leaves previous card (UrlCodecPlayground.astro:1052-1070) | High (verifier: blur and Enter do resolve it, so lower than high) |

### P2

| Slug | Input | Actual vs expected | Root cause / note | Sev |
|---|---|---|---|---|
| gitlab-ci-validator | `needs: [b]` where b is in a later stage | "No issues found" vs error | Stage-order check missing (existence check works) | Medium |
| gitlab-ci-validator | Circular `extends`, `!reference [.nope, script]` | "No issues found" vs errors | Tested combined only | Medium |
| gitlab-ci-validator | `if: $CI_COMMIT_BRANCH = "main"` | No finding vs "invalid expression syntax" | No expression check at all | Medium |
| github-actions-expression-tester | `push` with both `branches` and `branches-ignore` | "1/1 run" vs error | triggers.ts ~232-250; same for tags and paths pairs | Medium |
| github-actions-validator | `secrets.TOKEN` in a step `if:` | No issues vs error | No context-availability check | Medium |
| github-actions-validator | `needs.a.outputs.v` without `needs:` | No issues vs warning | No `needs.*` reference check | Low |
| alertmanager-route-tester | Root route with `matchers` | Accepted vs error | `resolveRoot` (engine.ts ~524) | Medium |
| alertmanager-route-tester | `severity=~"(?!info).*"`, `(a)\1` | Matched with JS regex vs RE2 error | `new RegExp`, no RE2 check (engine.ts ~113-184) | Medium |
| prometheus-relabel-tester | `regex: '(?!node).*'`, action keep | "1 kept · 1 dropped" vs config load error | `compileRegex` (engine.ts ~502-562) | Medium |
| logql-promql-helper | `rate({job="x"})` | Invented `[5m]` (note only) vs error | Disclosed in a note | Medium |
| logql-promql-helper | `quantile_over_time(... \| unwrap request_time [5m]) by (host)` | Generic "Could not recognise" vs unwrap message | | Medium |
| promql-explainer | `rates(x_total[5m])` | "best-effort" explanation vs unknown function error | Labelled, not silent | Medium |
| promql-explainer | `x_total offset -5m` | "back in time by 5 minutes in the future" vs "forward" | engine.ts ~933, ~1166 ignore sign | Medium |
| cron-expression-tester | `0 0 */2 * 1` | OR semantics vs cronie AND (DOM_STAR) | engine.ts ~28-29; AND rule is from cronie knowledge, not an independent date walk | Medium |
| cron-to-systemd | `0 3 * * * root /usr/bin/backup.sh` | `ExecStart=root ...` vs `User=root` | engine.ts ~590-611; generic ExecStart note is shown | Medium |
| cron-to-systemd | `0 0 31 2 * /bin/x` | Timer that never fires, no warning | | Medium |
| grafana-dashboard-validator | Two targets with refId `A` | "No findings" vs error | No refId rule. Adding a rule changes the quoted rule count in the FAQ (frozen test, 5 locales) | Medium |
| subnet-splitter | `10.0.0.0/26` twice, or `/25` plus `/26` inside it | No warning vs overlap warning | Math is right; warning missing | Medium |
| subnet-splitter | Copy link with prefix 26 and allocations | Hash is only `#ip=10.0.0.0%2F24` vs prefix and list | Component reads and writes only `#ip=` | Medium |
| mac-address-formatter | `0:1a:2b:3c:4d:5e` (macOS `arp -a`) | Rejected vs zero-pad | | Medium |
| kubernetes-resource-calculator | memory `129e6` | "not a valid memory quantity" vs 129,000,000 bytes | `parseMem` (engine.ts:76-92) | Medium |
| kubernetes-resource-calculator | memory `1m` | "invalid" vs accept as 0.001 byte and warn | `parseMem` has no `m` suffix | Medium |
| kubernetes-label-selector-tester | `version>5` | Says `>`/`<` not selector operators vs supported in string `-l` syntax | From apimachinery knowledge, not run. Wrong in string mode | Low |
| env-example-checker | Commented-out `process.env.X`, `os.getenv()` after `#` | Listed as missing vs ignored | Plain regexes on raw text (engine.ts ~52) | Medium |
| env-example-checker | `os.LookupEnv("GO_LOOKUP")` | Not detected vs missing | Comment at engine.ts:74 wrongly says covered by Getenv form | Medium |
| hash-generator | `a\r\nb` | Hashes `a\nb` with no note | Textarea normalises CRLF; the missing disclosure is the defect. A note needs all 5 locales | Low |
| jwt-decoder | `exp` as a JSON string | "Expired", "Verified", no warning vs RFC 7519 warning | `numericDate()` coerces (engine.ts:157-160); lint.ts:43 | Medium |
| base64-encoder-decoder | `/9j/4AAQSkZJRg==` | Mojibake, no "not valid UTF-8" note | `TextDecoder fatal:false` (engine.ts:156-157) | Medium |
| timestamp-converter | `1700000000.5`, `1.7e9` | Generic error vs accept | Epoch regex `/^(-?)(\d+)$/` (engine.ts:41-69) | Medium |
| timestamp-converter | `2024-02-30T00:00:00Z` | Rolls to Mar 1 vs error | V8 `Date.parse` leniency (engine.ts:68) | Medium |
| timestamp-converter | `2024-03-10T12:00:00`, `10/03/2024` | Read in local zone / MM/DD silently | Needs a visible note | Medium |
| regex-log-tester | `(foo\|bar)+`, `(?:GET\|POST)+` | Blocked as nested quantifier vs allowed | Alternation branch unconditional in regex-safety.ts | Medium |
| case-converter | `it's a dog's life` | `It S A Dog S Life` vs `It's A Dog's Life` | lodash and slugify drop apostrophes | Medium |
| slugify | `Привет мир`, `你好 世界` | "no letters or digits" (false) | engine.ts:106-108 | Medium |
| slugify | `Привет world`, `Grüße aus 東京` | Non-Latin words dropped silently | `[^a-z0-9]+` replace (engine.ts:83-86) | Medium |
| uuid-ulid-generator | v7 `018f2a3c-...`, v1 `6ba7b810-...` | No timestamp row though page promises one | Fixed inspector example would change (seed diff) | Medium |
| uuid-ulid-generator | 32-hex no hyphens, `{BRACED}`, `urn:uuid:` | Misleading generic error | | Medium |
| llm-vram-calculator | Params 1000, context 2000000 | Silently clamped, input still shows typed value | `clamp()` in engine.ts; hash writes raw value | Medium |
| llm-vram-calculator | Params or context empty, 0, -1 | Computed as minimum, "fits an 8 GiB GPU" | `Number('')` is 0, finite, passes checks | Medium |
| llm-vram-calculator | Gemma 2 9B at 32768 | No warning above trained max (8192) | `maxContext` used only for chips and slider | Medium |
| aws-iam-policy-generator | StringEquals on `aws:SourceIp`, NumericLessThan `'ten'`, DateLessThan `'tomorrow'` | "no warnings" | `validate()` checks presence only (~L137-146) | Medium |
| aws-iam-policy-generator | Principal `12345`, bare Federated host, bucket vs object ARN mismatch, `arn:aws:s3:::` | No findings | Only `arn:` prefix check (~L124, ~L134) | Low |
| json-yaml-converter | `msg: hello: world` | "Bad indentation" vs quote the value | | Medium |
| docker-run-to-compose | Compose `read_only: true`, `tmpfs: [/tmp]` to run | Silently dropped vs map or warn | | Medium |

### P3 (wording, cosmetic and rare input)

| Slug | Bug | Sev |
|---|---|---|
| docker-run-to-compose | Compose `$$` not unescaped for docker run | Low |
| docker-run-to-compose | `-p 99999:80` and `-p 80:70000` accepted | Low |
| subnet-calculator | `192.168.001.010/24` gets generic error (cidr-checker explains octal) | Low |
| subnet-calculator | `10.0.0.0 / 24` rejected with "got 3 parts" | Low |
| subnet-calculator | /0, /10, /8 summary ungrouped (engine.ts:259); address type labels describe the first address (ip-core.ts:260) | Low |
| subnet-splitter | Host bits silently normalised on parent and allocations | Low |
| cidr-checker | Comma/semicolon/space list gives "found 13 octets" (engine.ts:84) | Medium |
| ip-address-converter | Leading zeros handled differently from sibling tools | Low |
| mac-address-formatter | One generic error for short, long and bad-digit input; two MACs give the same error | Low x2 |
| reverse-dns-ptr | Every invalid input gets the same example message | Low |
| data-size-converter | `0.0000001 B = 0 bytes` summary (engine.ts:249) | Low |
| systemd-unit-validator | Duplicate OnCalendar note says "both run in order"; `*-02-31` not flagged | Low |
| cron-to-systemd | `@reboot` emits `Persistent=true` (validator says no effect) | Low |
| promql-explainer | `[5x]` gives bracket error, not duration error | Low |
| env-example-checker | `Bun.env` not detected | Low |
| jwt-decoder | Pasted `Bearer <token>` rejected (the Copy Bearer button output fails too) | Low |
| cve-ignore-converter | SNYK-* ids copied to Trivy/Grype with "no lossy changes" | Low |
| base64-encoder-decoder | Data URI and two-line input give vague errors | Low |
| json-yaml-converter | Complex key stringified silently; JSON comment hint wrong (`//` is not YAML); error card shows false "anchors expanded" note | Low x3 |
| regex-log-tester | `\p{L}` without `u` and `(?i)` give no hint | Low |
| case-converter | "1 words" | Low |
| uuid-ulid-generator | Count field clamps silently | Low |
| llm-token-counter | Lone surrogate throws URIError; share hash goes stale | Low |
| kubernetes-resource-calculator | Sub-millicore CPU rounds to 0m (Kubernetes rounds up); CPU limit below request called "may be rejected" | Low x2 |

## 3. SEO and traffic impact

(SEO analysis from the seo-ops agent, verbatim.)

**Traffic evidence.** Search traffic is effectively nil, so no fix has measurable traffic value yet. The 2026-10-03 GSC report (28 days ending 2026-10-03, the latest in `reports/seo/`) shows 6 clicks and 24 impressions for the whole site. All 6 clicks went to `/`, at average position 22.9. No tool page has a click in the reports I checked.
- **Best-performing tool page:** `/promql-explainer/` appears in four weekly reports at about 6 impressions and 1 click, at position 5. The scraped table rows didn't give dates. `/github-actions-expression-tester/` has 4 impressions and 0 clicks at position 6.
- **Indexation:** of 21 sampled URLs, 15 are "Crawled - currently not indexed", 5 are unknown to Google and only `/` is indexed. That includes `/subnet-calculator/`, `/jwt-decoder/`, `/hash-generator/`, `/base64-encoder-decoder/`, `/timestamp-converter/` and all 4 localized subnet pages. `/alertmanager-route-tester/` and `/grafana-dashboard-validator/` are unknown to Google.
- **Missing data:** per-tool clicks and queries for the other 30+ tools are unknown. The reports only list top pages.

**Priority basis.** Because traffic is near zero, priority rests on user harm plus the risk of wrong output reaching AI assistants. Crawlers and AI assistants read only the server-rendered `examples[0]` seed. Almost all of these bugs trigger on non-default input, so the seed, title, JSON-LD and lastmod stay unchanged for most fixes. A fix that changes engine, render.ts or playground code still re-dates that tool's 5 locale URLs, because a playground component counts as a tool-date input. That is expected churn and needs an allowlist entry in the `seo:diff` run.

| slug | bug (group) | traffic | SEO effect of the bug | surface change from fix | priority |
|---|---|---|---|---|---|
| alertmanager-route-tester | unparseable matcher skipped, typo keys ignored, root matchers, RE2 lookahead (4) | none; page unknown to Google | No ranking effect. This is a differentiated tool, so wrong "matches" there is the trust risk. | Seed is `examples[0]` and is unlikely to change. Re-dates the tool's 5 URLs. Needs an allowlist entry for lastmod. | P1 for matcher skip and typo keys (a wrong routing verdict), P2 for root matchers and RE2 |
| prometheus-relabel-tester | RE2 lookahead accepted | none; the tool page isn't in the indexation sample | Same as above. | Re-date only. | P2 |
| logql-promql-helper | range/offset dropped, `[5m]` invented, unwrap rejected (3) | none | A wrong conversion that looks valid is the worst kind of bug. The default seed is unaffected. | Re-date. If the fix changes `examples[0]` output, the seed changes too. | P1 for range/offset, P2 for the rest |
| promql-explainer | rate() on an instant vector explained as valid, unknown functions, negative offset, grammar, duration error (5) | the only tool page with repeat impressions (about 6 impressions, 1 click, position 5) | This is the one tool with real search exposure. The grammar bug sits in the **default example's server-rendered explanation** ("where adds the series together… over computes…"), which AI assistants can quote. | Fixing the grammar changes the seed text, so the guard will report word-count and content diffs. Needs a narrow allowlist rule. FAQ is not affected unless frozen strings are quoted. | P1 for grammar (it is visible in the seed), P2 for type-checking |
| github-actions-expression-tester | string `<` `>` always false, `}}` inside a literal, branches plus branches-ignore (3) | 4 impressions at position 6; page crawled but not indexed | Wrong evaluator output in the tool and any shared link. The seed is tab 1 only. | Engine change, so re-date. The conformance corpus and `GHA_SEMANTICS_VERSION` may need a bump. Any FAQ that quotes semantics must change in all 5 locales. | P1 for comparison and `}}`, P2 for triggers |
| gitlab-ci-validator | only+rules, needs in later stage, circular extends, rules:if syntax (4) | none | False negatives, a validator that says "No issues". | Re-date. If a rule count is quoted in an FAQ, check `tool-faqs.frozen.test.ts`. | P1 for only+rules, P2 for the rest |
| github-actions-validator | secrets in a step `if:`, `needs.*` outputs without `needs:` (2) | none | False negatives only. | Re-date. Check any FAQ that quotes a rule count. | P2 |
| docker-run-to-compose | undeclared named volumes, tmpfs becomes a disk volume, `$(pwd)`, dropped read_only/tmpfs, `$$`, port range (6) | none | The **Postgres example** emits a compose file that `docker compose config` rejects. If the seed or a blog snippet shows it, a crawler or assistant cites a broken file. | Fixing the volumes output changes the seed. The seed diff needs an allowlist rule, and blog posts that quote the output need a check. | P0 for named volumes (broken output on the default example), P1 for tmpfs and `$(pwd)`, P2/P3 for the rest |
| cron-expression-tester | `*/2` plus a DOW restriction uses OR, not AND | none | Wrong next-run times. The seed is a fixed example and unlikely to hit this. | Re-date. Needs a note on implementation differences. | P2 |
| cron-to-systemd | user column in ExecStart, Feb 31, `@reboot` Persistent (3) | none | Wrong unit files. | Re-date. | P2 |
| systemd-unit-validator | duplicate OnCalendar wording | none | Cosmetic. The FAQ is frozen, so check `tool-faqs.frozen.test.ts` before changing wording. | Re-date; engine constants are frozen in the FAQs. | P3 |
| grafana-dashboard-validator | duplicate refId not flagged | none; page unknown to Google | False negative. Adding a rule changes the rule count. | **The FAQ quotes rule counts**, so adding a rule trips `tool-faqs.frozen.test.ts`. The prose must change in all 5 locales and the "All 22 rules ran" text changes. The seed may also change. | P2 |
| aws-iam-policy-generator | open trust principal, trust with non-STS actions, condition types, principal/ARN checks (4) | none | Missing security warnings. Not visible in the seed. | Re-date. A new warning may change an FAQ or counts, so check. | P1 for open-trust warning, P2 for the rest |
| jwt-decoder | string `exp`, `Bearer` prefix (2) | none; page crawled but not indexed | The default seed is the `no-key` state and is unaffected. | Re-date. | P2 for string exp, P3 for Bearer |
| cve-ignore-converter | `exp:` rejected, false "Trivy cannot represent expiry", TOML literal strings, SNYK ids (4) | none | Silent suppression loss. The false "cannot represent" note is publicly wrong. | Re-date. If a FAQ repeats the "cannot represent" claim, it must change in all 5 locales. | P1 for TOML corruption and expiry, P2/P3 for the rest |
| subnet-splitter | no overlap warning, share link drops prefix and allocations, host bits normalised (3) | none (the commodity subnet-calculator is not indexed) | The share link is the one engagement bug, because a recipient lands on a different split. | Re-date. Changing the hash format touches the playground and the deep-link contract. | P2 for the share link, P3 for the others |
| subnet-calculator | leading zero, spaces around `/`, unformatted /0 summary (3) | zero clicks; the 4 localized pages are crawled but not indexed | The summary seed on `examples[0]` is unlikely to be /0. | Re-date. The engine string is shared by the 5 locales. | P3 |
| cidr-checker | comma/semicolon/space-separated lists | none | Error message only. | Re-date. | P3 |
| ip-address-converter | leading-zero handling | none | Cross-tool inconsistency. | Re-date. | P3 |
| mac-address-formatter | unpadded octets, generic errors, two MACs (3) | none | Unpadded octets from macOS `arp` are a real paste case. | Re-date. | P2 for unpadded octets, P3 for the generic errors |
| reverse-dns-ptr | generic invalid message | none | None. | Re-date. | P3 |
| data-size-converter | `= 0 bytes` summary | none | Cosmetic. | Re-date. | P3 |
| kubernetes-resource-calculator | `129e6` rejected, `1m` called invalid, sub-millicore CPU, wording (4) | none | False "invalid" claims. | Re-date. | P2 for `129e6` and `1m`, P3 for the rest |
| kubernetes-label-selector-tester | `>` and `<` rejected with a wrong explanation | none | The page makes a false claim. If the FAQ repeats it, 5 locales change. | Re-date. | P2 |
| env-example-checker | commented-out code, `os.LookupEnv`, `Bun.env` (3) | none | False positives and negatives. | Re-date. | P2 for LookupEnv and comments, P3 for Bun |
| hash-generator | CRLF silently normalised | none; the page is crawled but not indexed | A missing disclosure on a hash tool. | A visible note is a copy change and needs all 5 locales in one commit. Changes the word count, so allowlist it. | P2 |
| base64-encoder-decoder | binary shown as mojibake, data URI hint (2) | none | Not visible in the seed. | Re-date. | P2 for binary, P3 for the data URI |
| json-yaml-converter | `: ` in a plain scalar, complex key, JSON comment hint, recursive alias note (4) | none | Wrong hint text. | Re-date. | P3 |
| timestamp-converter | fractional epoch, Feb 30 rollover, timezone-less dates (3) | none; the page is crawled but not indexed | Float epochs (Python `time.time()`) are a real paste case. | Re-date. The Local row is already client-only. | P2 |
| url-encoder-decoder | stale result on a trailing `%` | none | Stale output that looks valid. | Re-date. | P1 |
| jq-playground | `repeat(1)` freezes the tab | none | A frozen tab hurts engagement and Core Web Vitals interaction, but only for pathological input. | Worker and timeout change the playground and the bundle. A larger change, though the seed is untouched. | P1 |
| regex-log-tester | ReDoS pattern freezes the page, `(foo\|bar)+` false positive, `\p{L}` hints (3) | none | The freeze is the same user-harm class as jq. | Re-date. | P1 for the freeze, P2 for the false positive, P3 for the hints |
| case-converter | apostrophes split words, "1 words" (2) | none | The apostrophe split shows wrong output on a plausible input. | Re-date. | P2 for the apostrophe, P3 for "1 words" |
| slugify | non-Latin "no letters" message, mixed-script drop (2) | none | A wrong error message. | Re-date. | P2 |
| uuid-ulid-generator | no v7/v1 timestamp, spellings rejected, count clamp (3) | none | The panel copy promises "embedded timestamp". The seed is the Nil UUID only. | Fixing the timestamp row changes the fixed inspector example. The seed diff needs an allowlist entry. | P2 |
| llm-token-counter | lone surrogate `URIError` | none | Rare input. | Re-date. | P3 |
| llm-vram-calculator | silent clamp, empty/zero treated as minimum with a "fits" verdict, context above model max (3) | none | The "fits an 8 GiB GPU" verdict on garbage input is the kind of wrong answer people quote. | Re-date. | P2 |

**Priority tiers.**
- **P0:** docker-run-to-compose named volumes (a broken output on the default Postgres example).
- **P1, correctness:**
  - GHA string comparison and `}}`
  - GitLab only+rules
  - Alertmanager matcher skip and typo keys
  - LogQL range/offset
  - promql-explainer grammar
  - IAM open-trust warning
  - CVE TOML corruption and expiry
  - docker tmpfs
- **P1, freezes or stale output:**
  - jq freeze
  - regex ReDoS freeze
  - url-decoder stale result
- **P2:** everything else with a "False negative" or "wrong message" effect.
- **P3:** wording-only fixes.

**Seo:diff handling.** Run `npm run seo:baseline -- main` and `npm run seo:diff -- --allow scripts/seo-allow/<batch>.json` for any batch.
- Most fixes only change engine code, so the only diff is `<lastmod>` (and `tool-meta` dates) for the tool across 5 locales. Group them into one batch allowlist per tool.
- The cases that change the rendered page need explicit allowlist rules, listed below.

| Case | What changes |
|---|---|
| docker-run-to-compose volumes | seed output |
| promql-explainer grammar | seed text |
| uuid inspector example | seed |
| hash-generator CRLF note | word count, all 5 locales |
| grafana rule count | FAQ and frozen test |
| any "cannot represent" or K8s `>` FAQ claim | FAQ text, 5 locales |

**Site-wide SEO observations from the persona reviews.**
- **Indexation, not content, is the constraint.** 15 of 21 sampled URLs are "Crawled - currently not indexed" and Domain Rating is 0. Fixing tool bugs will not move traffic until authority and crawl discovery improve.
- **Unknown URLs:** 3 blog posts (`x509-certificate-signed-by-unknown-authority`, `kubernetes-oomkilled-exit-code-137`, `docker-build-failed-to-solve-exit-code-1`) plus the Alertmanager and Grafana tool pages are "unknown to Google". Submit them via the Search Console URL Inspection tool and IndexNow. This needs your credentials.
- **Privacy claim:** Dmitri confirmed no input left the tab, and the only third-party hosts seen were GTM, GA and the Cloudflare beacon. That matches the true claim in the brief (the CSP also allows `www.googletagmanager.com` in `script-src`). Keep the wording precise and never say "cannot POST anywhere".
- **Tool-quality trust risk:** the clearest citation-worthy differentiators are the Prometheus/Alertmanager/Loki/GHA tools. They are also the ones with silent false positives. Fixing those first protects the site's strongest positioning.
- **Duplicates in the reports:** `www.opscanopy.com` URLs show impressions in GSC (`/es/`, `/fr/subnet-calculator`). Confirm the www host 301s to the apex. I did not check this.
- **Unverified:** I did not rerun any bug or check the redirect. The traffic numbers come from the GSC report text. The per-tool numbers beyond promql-explainer and github-actions-expression-tester are unknown.

Reports: `/Users/pushkarkumar/Desktop/poc/opscanopy.com/reports/seo/2026-10-03.md` and the earlier weekly files in that folder.

## 4. Scorecard

| slug | persona | rating | one-line verdict | confirmed bugs |
|---|---|---|---|---|
| subnet-calculator | Priya | 4.5 | Every number matched python ipaddress; daily-use quality | 3 |
| subnet-splitter | Priya | 3.5 | Math right, but no overlap check and share link loses the split | 3 |
| cidr-checker | Priya | 4 | Merge and overlap correct; comma lists fail confusingly | 1 |
| ip-address-converter | Priya | 4 | Conversions correct; leading-zero policy inconsistent | 1 |
| mac-address-formatter | Priya | 3.5 | Formats right; rejects macOS unpadded octets, generic errors | 3 |
| reverse-dns-ptr | Priya | 3.5 | Zone math right; every error is the same message | 1 |
| chmod-calculator | Priya | 4 | Octal/symbolic correct for all inputs tried | 0 |
| data-size-converter | Priya | 4 | Math solid; "10G" read as gigabytes is a judgement call | 1 |
| alertmanager-route-tester | Marcus | 2.5 | Routing logic right, but unparseable config still shows a match | 4 |
| logql-promql-helper | Marcus | 2 | Rewrites window to [5m] and drops offset | 3 |
| promql-explainer | Marcus | 2.5 | Useful table, explains queries Prometheus rejects | 5 |
| cron-to-systemd | Marcus | 3 | Good on @reboot and escaping; user column, impossible dates | 3 |
| cron-expression-tester | Marcus | 3.5 | Specific errors; misses cronie `*/2` AND quirk | 1 |
| systemd-unit-validator | Marcus | 3.5 | Real-message catches; time spans deliberately unchecked | 1 |
| grafana-dashboard-validator | Marcus | 3.5 | Good variable checks; duplicate refId passes | 1 |
| loki-alert-rule-tester | Marcus | 4 | Behaves like promtool | 0 |
| prometheus-relabel-tester | Marcus | 4 | Best of the batch; hashmod matches; RE2 gap | 1 |
| github-actions-validator | Elena | 4 | No false positives on hard cases; two false negatives | 2 |
| github-actions-expression-tester | Elena | 3 | Coercion mostly right; string compare and `}}` wrong | 3 |
| gitlab-ci-validator | Elena | 3 | No false positives, but four rejected configs pass | 4 |
| docker-run-to-compose | Elena | 2 | Output often fails `docker compose config` | 6 |
| dockerfile-linter | Elena | 4 | Solid and quiet on clean files | 0 |
| terraform-plan-summarizer | Elena | 4.5 | Best of the batch; counts reconcile | 0 |
| kubernetes-label-selector-tester | Elena | 4 | Gets the tricky semantics right; one wrong claim for `>` | 1 |
| kubernetes-resource-calculator | Elena | 3 | Basics right, quantity parser stricter than Kubernetes | 4 |
| env-example-checker | Elena | 3 | Useful for common case; scans comments, misses LookupEnv | 3 |
| certificate-decoder | Dmitri | 5 | Matches openssl on a real chain; best tool in the set | 0 |
| hash-generator | Dmitri | 4 | Digests all correct; CRLF change undisclosed | 1 |
| jwt-decoder | Dmitri | 4 | alg:none and confusion handled; claim types lax | 2 |
| cve-ignore-converter | Dmitri | 2.5 | Can widen suppressions silently | 4 |
| aws-iam-policy-generator | Dmitri | 3 | Output correct, linting shallow, open trust policy passes | 4 |
| base64-encoder-decoder | Sam | 4 | Good hints; binary output unwarned | 2 |
| json-yaml-converter | Sam | 4.5 | "What the conversion cost" panel is excellent | 4 |
| timestamp-converter | Sam | 3.5 | Units right; guesses on dates and rejects floats | 3 |
| url-encoder-decoder | Sam | 3.5 | Great explanations; one stale-output bug | 1 |
| jq-playground | Sam | 3 | Real jq, but repeat(1) freezes the tab | 1 |
| regex-log-tester | Sam | 3.5 | Nice table; ReDoS guard leaky and jumpy | 3 |
| case-converter | Sam | 3.5 | Acronyms right; apostrophes break words | 2 |
| slugify | Sam | 3.5 | Latin perfect; non-Latin message is false | 2 |
| uuid-ulid-generator | Sam | 4 | Generation solid; inspector gaps | 3 |
| llm-token-counter | Aisha | 4.5 | 42 of 42 cases match tiktoken | 1 |
| llm-vram-calculator | Aisha | 3.5 | Math right; invalid input gets a "fits" verdict | 3 |

## 5. Per-persona reviews

Persona-reported detail below. Bug counts refer to verifier-confirmed bugs only; see section 2 for those.

### Priya, senior network engineer (12 years datacenter/cloud)

Voice: checked every number against python ipaddress. Core math is right everywhere; she wants consistent input handling and honest warnings.

Per tool: subnet-calculator 4.5, I'd use it daily; subnet-splitter 3.5, wouldn't trust it for IPAM yet; cidr-checker 4, best errors in the set; ip-address-converter 4, bulk mode is clean; mac-address-formatter 3.5, rejects what macOS prints; reverse-dns-ptr 3.5, zone math right, errors weak; chmod-calculator 4, correct but 9-char form only; data-size-converter 4, math solid.

UX gripes: leading zeros handled four different ways across tools; spaced `ip / prefix` rejected; PTR and MAC use one generic error; summary lines for converter and PTR just say "IPv4" or "IPv6".

Wishlist: previous/next/supernet in subnet-calculator; allocate-next-free and CSV export in splitter; commas and ACL snippets in cidr-checker; MAC bulk mode and OUI lookup; zone-file skeleton and arpa-name input for PTR; relative modes and umask for chmod; "10G" shorthand and MTU/overhead input for data size.

Top 3: (1) splitter has no overlap check and a share link that drops prefix and allocations; (2) input leniency and error quality are inconsistent across the suite; (3) silent reinterpretation without warning (integers over 2^32, "10G", host bits).

### Marcus, on-call SRE

Voice: hates tools that quietly accept wrong syntax. Tested live with headless Chrome; no console errors on any of 9 tools; copy links round-trip.

Per tool: alertmanager-route-tester 2.5, only trust it after `amtool check-config`; logql-promql-helper 2, changing [1h] to [5m] is dangerous at 3am; promql-explainer 2.5, explains queries Prometheus refuses; cron-to-systemd 3; cron-expression-tester 3.5; systemd-unit-validator 3.5; grafana-dashboard-validator 3.5; loki-alert-rule-tester 4, behaves like promtool; prometheus-relabel-tester 4, hashmod matches Prometheus byte for byte.

UX gripes: the "matcher skipped" note sits under a headline that still reads "1 receiver · a"; every LogQL parse failure is the same message; `0 0 31 2 *` gets a green "Valid"; `@reboot` shows `* * * * *`; Loki rule errors are reported against the test file location; relabel regex error leaks the JS-wrapped pattern.

Wishlist: strict mode failing on anything amtool rejects; keep offset and `@` in both directions; unwrap support; dialect selector for cron; DST warning; two-timer split for DOM+DOW OR; type-check PromQL arguments; gridPos checks; `After=` without `Wants=` for network-online.

Top 3: (1) alertmanager unparseable matcher or typo key makes the route catch everything; (2) logql helper drops range and offset and invents [5m]; (3) promql-explainer accepts what Prometheus rejects. Same theme in RE2 regex and time spans.

### Elena, platform/CI engineer (about 200 repos)

Voice: cares about false positives and false negatives. No console errors on 9 tools; share links reopen intact.

Per tool: github-actions-validator 4, would keep open; github-actions-expression-tester 3, two core paths wrong; gitlab-ci-validator 3, four rejected configs pass; docker-run-to-compose 2, would not paste output without hand-checking; dockerfile-linter 4, zero wrong verdicts; terraform-plan-summarizer 4.5, best of batch; kubernetes-label-selector-tester 4; kubernetes-resource-calculator 3; env-example-checker 3.

UX gripes: `${{ 3 / 2 }}` described as "evaluates to null" when GitHub rejects the workflow; unclosed `${{` treated as literal; seven docker flags reported "not mapped" though each has a compose key; notes panel treats a dropped security flag like a dropped `--rm`; only first invalid field reported in resource calculator; "no memory limit" wording off; dynamic env reads skipped silently.

Wishlist: event payload presets; show merged job after extends; run output through compose-spec check; plan diff for Terraform; multi-container pods and node-fit view; check compose and Actions env blocks.

Top 3: (1) docker-run-to-compose produces files that fail `docker compose config`; (2) GHA expression tester string compare and `}}`; (3) gitlab-ci-validator passes four rejected configs.

### Dmitri, AppSec and cloud security engineer

Voice: logged all network traffic and grepped for typed secrets; none left the tab. CSP is tight but allows `www.googletagmanager.com` in `script-src`. XSS payloads in every field rendered inert.

Per tool: certificate-decoder 5, matches openssl on a real github.com chain; hash-generator 4, all digests correct; jwt-decoder 4, alg:none and key confusion handled; cve-ignore-converter 2.5, could widen suppressions silently; aws-iam-policy-generator 3, JSON and Terraform correct, linter shallow.

UX gripes: homoglyph host gives NO MATCH with no non-ASCII hint; "root expires" wording for a single leaf; no compare-expected-hash field and no file input; encoder silently overrides `alg:none` header; Markdown copy mangles first YAML line in the CVE converter; duplicate notes for Grype to osv; policy-type chips mutate statements instead of loading a template.

Wishlist: SPKI pin and SCT decoding; file hashing, SHA-384, SRI output; JWKS paste and strict claim mode; `.trivyignore.yaml`, expired-suppression report, VEX output; Access-Analyzer-style lint and confused-deputy helpers.

Top 3: (1) CVE converter widens suppressions without saying so; (2) IAM generator gives no warning for Principal `*` in a trust policy and keeps s3 actions; (3) IAM lint is shallow on real risk.

### Sam, junior backend developer (2 years)

Voice: tested at 1280px and 390px with touch emulation. Likes hints that teach; dislikes errors that say what is wrong without what to do.

Per tool: base64 4; json-yaml-converter 4.5, best of nine; timestamp-converter 3.5; url-encoder-decoder 3.5; jq-playground 3; regex-log-tester 3.5; case-converter 3.5; slugify 3.5; uuid-ulid-generator 4.

UX gripes: chips and buttons are 28 to 38px tall under touch (below 44px); bare 16px checkboxes; no horizontal overflow at 390px anywhere; `$ENV.HOME` returns a fake path in jq; second URL checkbox change did not visibly alter output; default `m` regex flag easy to miss; max-length field has no visible range message.

Wishlist: hex view for non-text base64; auto-strip data URIs; "quote it for me" fix in YAML; unit override and timezone picker in timestamp tool; Worker plus timeout for jq and regex; match highlighting; digit-attached and acronym-preserving options in case converter; transliteration and dropped-character warning for slugify; UUIDv7 as a generator option.

Top 3: (1) jq freeze on `repeat(1)` (plus stale outputs, which the verifier ruled intentional); (2) URL decoder stale result, plus Parse-mode claim (ruled not a bug); (3) regex ReDoS guard unreliable, slugify non-Latin message, timestamp Feb 30 rollover and timezone-less dates.

### Aisha, ML engineer (tokenizer and VRAM math)

Voice: recomputed everything independently.

Per tool: llm-token-counter 4.5, 42 of 42 non-empty cases match tiktoken, special tokens counted as text like the API, 100k-char cap enforced; llm-vram-calculator 3.5, 48 cells of weights, KV and total recomputed and matched, good for single-user llama.cpp, not vLLM planning.

UX gripes: negative price message vague; old stats stay under the new chip while a tokenizer loads; "fits an 8 GiB GPU" with about 50 MiB headroom; no card count past 80 GiB; hand-written hash params ignored; typing a preset's value flips to Custom and loses the preset architecture; int8 and int4 never named.

Wishlist: Llama-3, Qwen, Mistral and Gemma tokenizers; token IDs view; chat-template overhead; price fields and context-fit bar; batch and concurrency, FP8 KV, AWQ/GPTQ/FP8 weights; tensor-parallel planner; sliding-window and MLA awareness; H200/B200/MI300X tiers.

Top 3: (1) VRAM calculator clamps or accepts invalid input with a "fits" verdict; (2) no warning when context exceeds the model's trained maximum; (3) token counter exact, one lone-surrogate defect; VRAM math correct but no batch, FP8 KV, AWQ/GPTQ or multi-GPU.

## 6. Smoke sweep

Haiku, headless Chrome, 5 s virtual time budget, 1280px, live site, 2026-10-07T17:09:48Z. 42 of 42 OK, 42 of 42 seeded, no console errors.

| # | Slug | Status | Console errors | Seeded |
|---|---|---|---|---|
| 1 | subnet-calculator | OK | none | yes |
| 2 | subnet-splitter | OK | none | yes |
| 3 | cidr-checker | OK | none | yes |
| 4 | ip-address-converter | OK | none | yes |
| 5 | mac-address-formatter | OK | none | yes |
| 6 | reverse-dns-ptr | OK | none | yes |
| 7 | chmod-calculator | OK | none | yes |
| 8 | data-size-converter | OK | none | yes |
| 9 | promql-explainer | OK | none | yes |
| 10 | logql-promql-helper | OK | none | yes |
| 11 | alertmanager-route-tester | OK | none | yes |
| 12 | prometheus-relabel-tester | OK | none | yes |
| 13 | grafana-dashboard-validator | OK | none | yes |
| 14 | loki-alert-rule-tester | OK | none | yes |
| 15 | cron-expression-tester | OK | none | yes |
| 16 | cron-to-systemd | OK | none | yes |
| 17 | systemd-unit-validator | OK | none | yes |
| 18 | github-actions-validator | OK | none | yes |
| 19 | github-actions-expression-tester | OK | none | yes |
| 20 | gitlab-ci-validator | OK | none | yes |
| 21 | docker-run-to-compose | OK | none | yes |
| 22 | dockerfile-linter | OK | none | yes |
| 23 | terraform-plan-summarizer | OK | none | yes |
| 24 | kubernetes-label-selector-tester | OK | none | yes |
| 25 | kubernetes-resource-calculator | OK | none | yes |
| 26 | env-example-checker | OK | none | yes |
| 27 | aws-iam-policy-generator | OK | none | yes |
| 28 | certificate-decoder | OK | none | yes |
| 29 | cve-ignore-converter | OK | none | yes |
| 30 | hash-generator | OK | none | yes |
| 31 | jwt-decoder | OK | none | yes |
| 32 | base64-encoder-decoder | OK | none | yes |
| 33 | json-yaml-converter | OK | none | yes |
| 34 | timestamp-converter | OK | none | yes |
| 35 | url-encoder-decoder | OK | none | yes |
| 36 | jq-playground | OK | none | yes |
| 37 | regex-log-tester | OK | none | yes |
| 38 | case-converter | OK | none | yes |
| 39 | slugify | OK | none | yes |
| 40 | uuid-ulid-generator | OK | none | yes |
| 41 | llm-token-counter | OK | none | yes |
| 42 | llm-vram-calculator | OK | none | yes |

Note: the sweep says all 42 are "seeded". CLAUDE.md says certificate-decoder is deliberately not seeded, so the seeded column for that row is probably a weak check.

## 7. Rejected claims

Reported by personas, not confirmed by verifiers.

| Slug | Claim | Verdict | Reason |
|---|---|---|---|
| subnet-splitter | Empty prefix gives no hint | not a bug | Prefix is optional; page helper text says so; invalid prefixes do get specific messages |
| cidr-checker | IPv4-mapped IPv6 not matched to IPv4 ranges | not a bug | Strict handling is defensible; only a hint is missing (feature request) |
| ip-address-converter | Integer above 2^32-1 read as IPv6 | not a bug | Tool supports 128-bit integers; python gives the same; type and reading are shown |
| ip-address-converter | Summary line is only "IPv4"/"IPv6" | not a bug | Design preference; value is in the panel |
| reverse-dns-ptr | RFC 2317 case stops at a note | not a bug | Note is accurate; classless zone label and CNAME are a feature request |
| reverse-dns-ptr | Prefix input shows only first PTR name | not a bug | Zone and `dig -x` shown correctly; zone-file origin line is an enhancement |
| chmod-calculator | Short octal (`0`, `7`, `77`, `07777`) rejected | not a bug | Error states the 3 or 4 digit rule up front |
| chmod-calculator | `u=rwx,g=rx,o=rx` rejected | not a bug | Message states the supported form; clause form is a feature request |
| chmod-calculator | Stale symbolic field after invalid octal | not a bug | Fields hold last valid state while the error shows; not presented as a result |
| data-size-converter | `10G` read as 10 gigabytes per second | not a bug | Reading is stated in the summary and a note; no clear right answer (owner's call) |
| data-size-converter | Rate of 0 silently dropped | not reproduced | Live site shows "A transfer rate of zero never finishes" |
| systemd-unit-validator | Invalid time spans (`RestartSec=5x`) pass | not a bug | Deliberate and documented in "What it deliberately does not check" |
| grafana-dashboard-validator | Trailing commas only noted, not an error | not a bug | Visible repair is by design; the counted warning and note are unrelated |
| env-example-checker | Names inside string literals read as env reads | not a bug | Regex scanner for mixed pastes; cannot tell strings from code without a tokenizer |
| jwt-decoder | JWE (5-part) reported as "not a JWT" | not a bug | Message is accurate for a JWS decoder; JWE support is a feature request |
| json-yaml-converter | Key-position `n`/`y` Norway note worded like a value | not a bug | YAML 1.1 tools do read these keys as booleans; wording preference |
| timestamp-converter | 12-digit value read as ms with no hint | not a bug | Digit-count heuristic is documented and badge states it |
| timestamp-converter | Relative time floors ("2 years ago") | not a bug | Common convention; absolute rows sit beside it |
| url-encoder-decoder | Parse mode accepts `not a url`, `http://ex ample.com` | not a bug | Tester used node; Chrome's own `new URL` accepts them and the tool shows the assumed-scheme note |
| url-encoder-decoder | `x.com:8080/a` parsed as https silently | not reproduced | Notes section says "No scheme in the input, so it was parsed as https://..." |
| url-encoder-decoder | Decode result "never resolves, even after blur" | partly not reproduced | Stale display is confirmed (section 2); blur and Enter do resolve it |
| jq-playground | Stale OUTPUT cards under errors | not a bug | Intentional and documented (JqPlayground.astro:25-27, 1011-1021); cards are dimmed (opacity 0.5) |
| jq-playground | `input` with no inputs reports only "break" | not a bug | Faithful to real jq |
| case-converter | Digits split into own words | not a bug | Matches lodash; a boundary convention |
| case-converter | Title Case breaks `iOS`; camel loses `v1.2.3` separators | not a bug | Normal for a generic converter; lossy-note is an enhancement |
| slugify | `C++`, `C#`, `.NET` all become `c` | not a bug | Standard slugify behaviour |
| aws-iam-policy-generator | Read actions on `*` (GetSecretValue, GetObject) not warned | not a bug | Deliberate scope: warns only for Write and Permissions-management; reasonable enhancement |
| llm-vram-calculator | Preset parameter counts are rounded nominal sizes | not a bug | Documented in presets.ts line 8; output labelled an estimate |

/**
 * Fixtures for the five pre-existing OBSERVABILITY tools, brought into the
 * journey matrix after the 2026-07 rollout batch.
 *
 * One module per batch, composed by ../tools.fixtures.ts. Field rules live in
 * that file's doc comment — read it first.
 *
 * ── READ THIS BEFORE "FIXING" A FAILURE HERE ────────────────────────────────
 *
 * These five tools SHIP FROM BEFORE the playground UX contract (CLAUDE.md,
 * "Playground UX contract", set by the ip-converter / cidr-checker /
 * subnet-calculator overhauls). They are all "explicit-Run" islands: an example
 * `<select>`, a primary Run/Convert/Explain button, ⌘/Ctrl+Enter, and NO live
 * evaluation at all — there is no debounce, no error hold, and no
 * `aria-invalid` anywhere in any of the five components.
 *
 * PROVENANCE — 2026-08-01. This table was authored blind (the batch agent was
 * killed by a spend limit before it ran a journey) and its header used to claim
 * it had been verified. It had not been. It has now: the whole batch was run
 * against the built `dist/` through `astro preview`, twice, with identical
 * results — 12 passed / 58 failed of 70 — and every field below was
 * additionally re-derived from the live pages:
 *
 *   - every `seededResultString` read out of the boot-seeded results container;
 *   - every `calmErrorString` compared BYTE-FOR-BYTE against the rendered error
 *     card after forcing a run (all five match exactly, curly quotes, backticks,
 *     U+2014 dash and U+2026 ellipsis included);
 *   - every `xssPayload` confirmed to reach the results as text, with `&lt;`
 *     present and no raw `<img` anywhere in that container's innerHTML;
 *   - every `hashKey`, `inputSelector` and `resultsSelector` confirmed live.
 *
 * NOTHING IN THE DATA BELOW WAS CHANGED, because nothing in it was wrong. All
 * 58 failures are the tools, or are journey steps that cannot be expressed for
 * an explicit-Run island. Do not weaken a journey, and do not repoint a selector
 * at something that happens to be green, to make any of that disappear.
 *
 * WHAT THE RUN ACTUALLY FOUND (all confirmed, all reproducible):
 *
 *   - no tool has example CHIPS (`[role="group"][aria-label="Examples"]`) — all
 *     five use the `<select id="…-example">` the contract explicitly rejects.
 *     Kills J3/chip-2 (×5), J6 (×5) and J8's deep-link half.
 *   - no tool has `data-copy-all`; loki / prt / amr have no `data-copy` at all;
 *     `promql-explainer` has `data-copy` but NO sr-only `role="status"`
 *     copy-status span. Kills J1 (×10) and J5/keyboard (×4).
 *   - no tool renders the pinned hint line. Kills J8 (×5). The /de/ pages DO
 *     boot the island and DO render the seeded result — J8 gets that far.
 *   - nothing evaluates while typing, so the diagnostic never surfaces (J2 ×5),
 *     the saved state can never be moved away from (J4 ×5), and the results
 *     never re-render after the payload is entered (J7 ×5). J7's five reds are
 *     FALSE NEGATIVES on escaping: escaping was verified by hand and is correct
 *     in all five.
 *   - `prometheus-relabel-tester` and `alertmanager-route-tester` write their
 *     deep-link fragment on the BOOT SEED (J3 ×2). prt has no `userInitiated`
 *     parameter at all and also records last-input on boot; amr HAS the gate but
 *     the `replaceState` call sits outside it.
 *   - axe fails on all five (J5 ×5): `aria-input-field-name` on every CodeMirror
 *     `.cm-content` (the `aria-label` is on the host div, not the `role=textbox`
 *     content DOM — the six contract-era CM tools fix this with
 *     `EditorView.contentAttributes.of({'aria-label': …})`), plus `color-contrast`
 *     on the dark instrument slab.
 *
 * TWO REDS THAT ARE NOT TOOL DEFECTS — do not "fix" the tool for these:
 *
 *   - J3's junk-hash step is inexpressible for four of the five. It builds the
 *     fragment as `hashKey + encodeURIComponent(invalidInput)`, which only makes
 *     a well-formed payload when the deep link is PLAINTEXT. Only
 *     `promql-explainer` (`#q=`, via `createHashState('q')`) is — and it passes.
 *     The other four base64url-encode a composite, so junk decodes to null and
 *     they degrade to the example seed. Degrading to the seed is defensible;
 *     the fixture table simply has no field to say so.
 *   - J5's Escape step fails on prt + amr at its SECOND assertion, not its
 *     first: Escape does blur the editor (assertion 1 passes). The following Tab
 *     then lands in the island's other CodeMirror pane, and
 *     `focusIsInCodeMirror` is true for ANY `.cm-editor` on the page. loki has
 *     two editors too and passes only because its snapshot row sits between
 *     them. The tab order is correct; the assertion assumes one editor.
 */
import type { ToolFixture } from '../tools.fixtures';

export const OBSERVABILITY_FIXTURES: ToolFixture[] = [
  {
    // Slug/name mismatch is deliberate and load-bearing: the component is
    // `AlertLintPlayground.astro` and the engine is `src/lib/alertlint/`, but the
    // live route is `/loki-alert-rule-tester/`. J1–J7 visit the SLUG.
    //
    // The island has TWO CodeMirror editors (rules.yaml + test.yaml).
    // `inputSelector` points at the RULES one (first in DOM order), so both
    // payloads below are Loki ruler YAML evaluated against the boot-seeded test
    // file — not promtool test YAML.
    //
    // `seededResultString` is the per-row pass MESSAGE from the seeded SSH
    // example, not the `role="status"` summary ("1 passed · N ms"): the summary
    // lives outside the results container, and its timing figure changes run to
    // run, so it could never be pinned.
    //
    // `invalidInput` is single-line on purpose (J2 types it with
    // pressSequentially, and a multi-line burst into CodeMirror also fights
    // auto-indent) and reaches an ENGINE-OWNED diagnostic rather than a js-yaml
    // one. That distinction is the whole point of the `calmErrorString` trap in
    // ../tools.fixtures.ts: `groups: [ unclosed` — the vector
    // `src/lib/alertlint/engine.test.ts` uses for "malformed rules YAML" — only
    // asserts `error` is truthy, and the string it produces is js-yaml's
    // `reason` text, which is a library detail that reworded between releases.
    // `groups: notalist` parses fine and trips the engine's own
    // `EvalError('Rules file must have a top-level `groups:` list.')` instead.
    //
    // `xssPayload` is single-line FLOW YAML for the same typing reason. A group
    // with a rule that has no `expr` makes the engine quote the GROUP NAME back
    // into its diagnostic, which is the one place this tool renders untrusted
    // input from the rules pane.
    slug: 'loki-alert-rule-tester',
    family: 'cm',
    hashKey: '#s=',
    seededResultString: 'Fired 1 alert(s) with the expected labels and annotations.',
    invalidInput: 'groups: notalist',
    calmErrorString: 'Rules file must have a top-level `groups:` list.',
    xssPayload: 'groups: [{name: "<img src=x onerror=alert(1)>", rules: [{}]}]',
    inputSelector: '#al-editor-rules .cm-content',
    resultsSelector: '#al-results',
  },
  {
    // Two CodeMirror editors again — source query and a READ-ONLY converted
    // query. `inputSelector` is the source editor; `resultsSelector` is the
    // NOTES panel (`#lp-notes`), because the converted query is rendered into
    // the read-only CodeMirror document, not into innerHTML. The notes panel is
    // the only innerHTML-injected surface, so it is the one J5 (`aria-live`) and
    // J7 (escaping) have anything to say about.
    //
    // The boot seed is example 1, `rate({app="api", env="prod"} |= "error"
    // [5m])` in the LogQL → PromQL direction, so both payloads are LogQL. A
    // PromQL-shaped payload would be evaluated in the wrong direction and
    // produce a different diagnostic than the one pinned here.
    //
    // `calmErrorString` is the engine's own matcher diagnostic
    // (`src/lib/logql-promql/engine.ts` → parseMatchers). The engine's vitest
    // file pins no error vector byte-for-byte, so this was read back off the
    // rendered error card; the quotes are U+201C/U+201D.
    //
    // `xssPayload` puts the markup in a LogQL line-filter operand, which is
    // valid LogQL. PromQL has no line filters, so the converter DROPS the stage
    // and quotes it back into a conversion note — that note is where this tool
    // renders untrusted text.
    slug: 'logql-promql-helper',
    family: 'cm',
    hashKey: '#s=',
    seededResultString: 'PromQL selects a metric, not a log stream.',
    invalidInput: 'rate({app=api}[5m])',
    calmErrorString: 'Label “app” must have a double-quoted value.',
    xssPayload: 'rate({app="api"} |= "<img src=x onerror=alert(1)>" [5m])',
    inputSelector: '#lp-editor-input .cm-content',
    resultsSelector: '#lp-notes',
  },
  {
    // The only one of the five with a PLAINTEXT deep-link fragment: it uses
    // `createHashState('q')` (src/lib/hash-state.ts), so `#q=` carries the query
    // percent-encoded. That makes it the only tool in this batch where J3's
    // junk-hash step is even expressible — the other four base64url-encode a
    // composite payload, so an arbitrary junk fragment decodes to nothing and
    // degrades to the example seed instead of to a diagnostic.
    //
    // `invalidInput` is the vector `src/lib/promql-explainer/engine.test.ts`
    // uses for "unbalanced parens are still an error" (`sum(rate(x[5m])`);
    // `calmErrorString` is what the engine's own `checkBalanced` returns for it.
    // The quotes are U+201C/U+201D and the dash is U+2014.
    //
    // `seededResultString` is a token MEANING from the seeded
    // `histogram_quantile` example rather than the prose summary: the summary
    // sentence is long, reflows, and embeds the metric name, while the range
    // clause is a fixed string this tool exists to produce.
    //
    // `xssPayload` is a label-matcher VALUE, which PromQL allows verbatim. The
    // explainer echoes it twice — into the plain-English summary and into the
    // matcher's breakdown row — so it genuinely reaches the rendered output.
    slug: 'promql-explainer',
    family: 'cm',
    hashKey: '#q=',
    seededResultString: 'A range vector: all samples within the last 5 minutes.',
    invalidInput: 'sum(rate(x[5m])',
    calmErrorString: 'Missing a closing “)” — check your brackets.',
    xssPayload: 'up{job="<img src=x onerror=alert(1)>"}',
    inputSelector: '#pq-editor .cm-content',
    resultsSelector: '#pq-results',
  },
  {
    // `hashKey` is `'#prt='`, NOT null: the playground really does write a
    // fragment — it base64url-encodes the rules pane and the label-sets pane
    // into one key joined by `~`. It also writes it on the BOOT SEED, because
    // this component's `run()` takes no `userInitiated` parameter at all, so
    // there is nothing for the boot call to suppress. That is a J3 finding, not
    // a reason to declare the tool link-less here.
    //
    // Two CodeMirror editors; `inputSelector` is the relabel_configs pane, so
    // both payloads are relabel YAML evaluated against the boot-seeded label
    // sets.
    //
    // `invalidInput` is the vector `engine.test.ts` uses for "a YAML scalar (not
    // a list)". `calmErrorString` is the engine's own reply to it, backticks and
    // U+2026 ellipsis included.
    //
    // `seededResultString` is the SET 2 outcome line from the seeded
    // keep+labelmap example — a sentence the engine composes, not one of the
    // static `INPUT` / `OUTPUT` column headings, which would still be on screen
    // after the input went bad and would let J4's restore step pass vacuously.
    //
    // `xssPayload` is a syntactically valid one-rule list whose `action` scalar
    // is the markup; the engine quotes an unknown action back into its
    // diagnostic, which is where this tool renders untrusted input.
    slug: 'prometheus-relabel-tester',
    family: 'cm',
    hashKey: '#prt=',
    seededResultString:
      'Target dropped by rule 1 (keep) — this series would not be scraped or stored.',
    invalidInput: 'just a string',
    calmErrorString:
      'relabel_configs must be a YAML list of rules (e.g. `- source_labels: [__name__]` …), or a mapping containing a `relabel_configs:` list.',
    xssPayload: '- action: <img src=x onerror=alert(1)>',
    inputSelector: '#prt-configs .cm-content',
    resultsSelector: '#prt-results',
  },
  {
    // This tool writes TWO fragment keys at once —
    // `#amrc=<base64url config>&amrl=<base64url labels>`. `hashKey` is the first
    // one, which is the prefix `location.hash` actually starts with. It is also
    // written on the BOOT SEED: `run(userInitiated = true)` gates
    // `recordToolLastInput` but the `replaceState(encodeShare(…))` call sits
    // OUTSIDE that gate, so the boot `run(false)` still rewrites the address
    // bar. A J3 finding — the gate exists and the hash write escaped it.
    //
    // Two CodeMirror editors; `inputSelector` is the route-tree pane, so both
    // payloads are route YAML evaluated against the boot-seeded alert labels
    // (alertname=HighLatency, service=database, cluster=eu-west-1,
    // severity=critical).
    //
    // `invalidInput` is the vector `engine.test.ts` uses for "a YAML scalar (not
    // a mapping)"; `calmErrorString` is the engine's `resolveRoot` reply.
    //
    // `seededResultString` is the inherited grouping of the matched
    // `team-DB-pages` child route. Not the receiver NAME: the seeded receiver is
    // echoed twice (once as the headline, once inside the path breadcrumb), and
    // J4 needs a string that disappears the moment the config becomes invalid.
    //
    // `xssPayload` is a single-line flow mapping that is a valid BARE route
    // object (`receiver` is one of the keys `resolveRoot` accepts without a
    // `route:` wrapper), so the payload is echoed as the matched receiver name —
    // the headline row of the results.
    slug: 'alertmanager-route-tester',
    family: 'cm',
    hashKey: '#amrc=',
    seededResultString: 'group_by [alertname, cluster, database]',
    invalidInput: 'just a string',
    calmErrorString:
      'The config is not a YAML mapping. Provide an Alertmanager `route:` block or a full config containing one.',
    xssPayload: '{receiver: "<img src=x onerror=alert(1)>"}',
    inputSelector: '#amr-config .cm-content',
    resultsSelector: '#amr-results',
  },
];

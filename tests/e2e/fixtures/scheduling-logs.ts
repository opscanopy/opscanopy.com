/**
 * Fixtures for the four pre-existing scheduling / logs / k8s tools brought into
 * the journey matrix in 2026-08: the Cron Expression Tester, the Cron → systemd
 * Converter, the Regex Log Tester and the Kubernetes Resource Calculator.
 *
 * One module per batch, composed by ../tools.fixtures.ts. Field rules live in
 * that file's doc comment — read it first.
 *
 * ── READ THIS BEFORE "FIXING" A FAILING JOURNEY IN THIS FILE ────────────────
 *
 * These four tools SHIP BEFORE the playground UX contract (CLAUDE.md,
 * "Playground UX contract"). They were never reworked against
 * CidrCheckerPlayground.astro, and the gaps are structural, not cosmetic. None
 * of the four has:
 *
 *   - example CHIPS      — all four use a `<select>` example picker
 *                          (`#cron-example`, `#cs-example`, `#rx-example`,
 *                          `#k8s-example`), so `SEL.chips` matches ZERO nodes;
 *   - `data-copy-all`    — the share affordances are "Copy link" +
 *                          "Copy as Markdown", never a copy-all;
 *   - the hint line      — "Results update as you type — press Enter to run
 *                          now." appears in none of the four components;
 *   - the ~600ms calm-error HOLD — each one renders the diagnostic straight off
 *                          its debounce (120 / 160 / 220 ms).
 *
 * Three of the four also have no sr-only `role="status"` copy-status span
 * (cron-to-systemd is the exception: `#cs-announce`).
 *
 * Every one of those is a TOOL gap that the journeys are supposed to catch. The
 * fixture entries below are written to be as CORRECT as the tools allow, so the
 * failures that remain are the tools' and not the table's. Do not weaken a
 * journey, and do not "repair" this file by pointing a selector at something
 * that merely happens to exist.
 *
 * Every `calmErrorString` here is engine-owned wording, verified by executing
 * the engine (esbuild bundle → node) against the exact `invalidInput` in this
 * table — not transcribed from a source file and not a V8/`RegExp`/`JSON.parse`
 * message, which reword between Node releases.
 *
 * All four `xssPayload`s use `<img/src=x/onerror=alert(1)>` rather than the
 * house `<img src=x onerror=alert(1)>`. That is deliberate and load-bearing:
 * cron fields, crontab lines and Kubernetes quantities are all
 * WHITESPACE-DELIMITED grammars, so a payload containing spaces is split across
 * fields and the diagnostic then quotes back only the first fragment — which no
 * longer contains `<img`, and J7's echo precondition would fail on a tool that
 * escapes perfectly well. HTML parsers accept `/` as an attribute separator, so
 * the space-free form is still a live payload, not an inert one.
 */
import type { ToolFixture } from '../tools.fixtures';

export const SCHEDULING_LOGS_FIXTURES: ToolFixture[] = [
  {
    // ── Cron Expression Tester ────────────────────────────────────────────
    //
    // `family: 'textarea'` is right, not a shortcut: this island has NO
    // CodeMirror at all (`<input id="cron-input" type="text">`), and its script
    // never imports `@codemirror/state`.
    //
    // `hashKey`: the playground builds `createHashState('cron')` and writes it
    // on every valid user-initiated eval — the same key cron-to-systemd READS,
    // which is how the "Convert to systemd timer" chain chip works.
    //
    // `seededResultString` is the boot seed's plain-English description. The
    // first bundled example is `*/5 * * * *` and
    // `src/lib/cron-tester/engine.test.ts` pins
    // `explain('*/5 * * * *').description === 'Every 5 minutes.'`, so this is a
    // pinned vector rather than a screen-scrape. Chosen over a next-run
    // timestamp on purpose: the run list is clock-dependent and would rot.
    //
    // `calmErrorString`: the dash in "0–59" is U+2013 EN DASH, straight out of
    // `parseField`'s range diagnostic. Not a hyphen.
    //
    // `xssPayload`: the payload is a single whitespace-free MINUTE field. It
    // contains `/`, so the engine reads it as `base/step`, finds a non-numeric
    // step, and quotes the WHOLE original token back inside
    // "…has an invalid step in the minute field…" — which `renderError` writes
    // through `escapeHtml()`. That quoted token is the one place this tool
    // renders untrusted text.
    slug: 'cron-expression-tester',
    family: 'textarea',
    hashKey: '#cron=',
    seededResultString: 'Every 5 minutes.',
    invalidInput: '61 * * * *',
    calmErrorString: 'Value out of range in the minute field: allowed 0–59.',
    xssPayload: '<img/src=x/onerror=alert(1)> * * * *',
    inputSelector: '#cron-input',
    resultsSelector: '#cron-results',
  },
  {
    // ── Cron → systemd Converter ──────────────────────────────────────────
    //
    // The tool whose engine now imports `SYSTEMD_DOW` from
    // `src/lib/systemd-lint/calendar.ts`. That refactor is fine at the seed:
    // the boot conversion runs and the notes panel renders (see
    // `seededResultString`), so a journey failure here is never the shared
    // weekday table.
    //
    // `hashKey: null`, and this one is NOT a size-cap decision like tools
    // 5/7/10. This playground is a deep-link READER only: it calls
    // `hashState.read()` at boot and never `hashState.write()` anywhere, by
    // design — the share link is minted by cron-expression-tester and consumed
    // here. So `null` is literally true (no fragment is ever written) and J3's
    // "never writes a fragment" half is the right assertion. Its junk-hash half
    // then probes `#s=`, a key this tool does not know, and the boot seed must
    // still render.
    //
    // `resultsSelector: '#cs-notes'` is the notes/error panel — the only
    // container that renders BOTH the success state and the diagnostic. The
    // generated units live in two read-only CodeMirror editors, whose DOM is
    // virtualized and therefore not a dependable assertion target.
    //
    // `seededResultString` is the single note the first example
    // (`0 3 * * * /usr/bin/backup.sh`) produces — verified by running
    // `convert()`. Not "Converted cleanly…", which is the notes-EMPTY branch and
    // is not what this seed hits.
    //
    // `invalidInput` is five characters on purpose (J2 types it one key at a
    // time). `calmErrorString` is the engine's own unknown-macro wording;
    // the quotes are U+201C/U+201D curly quotes.
    //
    // `xssPayload` is an `@macro` line, which is one of the three input shapes
    // `convert()` documents. The macro token is everything up to the first
    // whitespace, so the whole payload survives into
    // "Unknown schedule macro “…”." — the one place this tool echoes untrusted
    // text. (A payload placed in a SCHEDULE field would be split at `/` by
    // `parseField` and only the step fragment would be quoted back, which is
    // why it goes in the macro position.)
    slug: 'cron-to-systemd',
    family: 'cm',
    hashKey: null,
    seededResultString: 'Command parsed from the cron line and placed in ExecStart.',
    invalidInput: '@nope',
    calmErrorString:
      'Unknown schedule macro “@nope”. Supported: @reboot, @yearly, @annually, @monthly, @weekly, @daily, @midnight, @hourly.',
    xssPayload: '@<img/src=x/onerror=alert(1)> /usr/bin/x',
    inputSelector: '#cs-editor-input .cm-content',
    resultsSelector: '#cs-notes',
  },
  {
    // ── Regex Log Tester ──────────────────────────────────────────────────
    //
    // `family: 'cm'` because the island lazily imports `@codemirror/state` for
    // its sample-log editor. But `inputSelector` points at the PATTERN FIELD
    // (`#rx-pattern`), not at that editor, and the two facts are in tension —
    // see the note at the bottom of this entry.
    //
    // Pointing at the pattern field is what makes the two payloads below
    // meaningful. The sample log has NO grammar: no sample text is "invalid",
    // and the matches table echoes MATCHED TEXT, not the pattern. So the
    // pattern field is the only surface on this island that can produce a
    // diagnostic at all, and therefore the only one J2 / J3 / J4 / J7 can use.
    //
    // `seededResultString` is a capture-group value from the FOURTH match of
    // the boot-seeded nginx example (`(\d+\.\d+\.\d+\.\d+)` → `198.51.100.22`).
    // Verified by running `run(examples[0]…)`: 4 matches. A group value beats
    // the match count, which lives in `#rx-summary` OUTSIDE the results box.
    //
    // `invalidInput` is `(a+)+`, a pinned vector in
    // `src/lib/regex-safety.test.ts` ("catches the classic ReDoS shapes"), and
    // `calmErrorString` is the tester's own refusal wording wrapped around
    // `checkRegexSafety`'s reason. Deliberately NOT a `new RegExp` syntax error:
    // those are V8 strings and reword between Node releases, which is the trap
    // `tools.fixtures.ts` documents for `JSON.parse`. Every prefix of `(a+)+`
    // is a DIFFERENT state (`(` invalid, `(a+)` perfectly valid), so a stalled
    // burst cannot fake a pass.
    //
    // `xssPayload` is a pattern with a trailing `+*`. The safety heuristic
    // clears it (no quantified group), then `new RegExp` refuses it and the
    // engine returns the constructor's message — which quotes the SOURCE
    // pattern, payload and all, into `#rx-results` through `escapeHtml()`. The
    // V8 wording is used only as the echo VEHICLE here; nothing in this table
    // pins it.
    //
    // KNOWN FIXTURE/HARNESS TENSION: J5's "Escape releases the CodeMirror focus
    // trap" is gated on `family` but drives `inputSelector`, and on this island
    // those are two different elements. The sample editor's keymap DOES carry
    // the `Escape → contentDOM.blur()` binding, so the behaviour exists; the
    // harness just cannot reach it through a one-input fixture. Do not "fix"
    // this by moving `inputSelector` onto `.cm-content` — that would silently
    // turn J2, J4 and J7 into vacuous passes.
    slug: 'regex-log-tester',
    family: 'cm',
    hashKey: '#s=',
    seededResultString: '198.51.100.22',
    invalidInput: '(a+)+',
    calmErrorString:
      'This pattern was blocked because it could hang the page: Nested unbounded quantifier detected (a repeated group whose body can also repeat, e.g. (a+)+ or (.*)*). This shape can trigger catastrophic backtracking and hang the browser tab.',
    xssPayload: '<img/src=x/onerror=alert(1)>+*',
    inputSelector: '#rx-pattern',
    resultsSelector: '#rx-results',
  },
  {
    // ── Kubernetes Resource Calculator ────────────────────────────────────
    //
    // Five plain `<input type="text">` fields, no editor — `family:
    // 'textarea'`, and the script imports no CodeMirror.
    //
    // `inputSelector` is the CPU-REQUEST field. The journeys only ever touch
    // one input, and this is the field whose parse failure the engine reports
    // FIRST (`calculate()` checks cpuRequest → cpuLimit → memRequest →
    // memLimit → replicas), so the diagnostic is deterministic no matter what
    // the other four hold. `clearInput`/`setInput` scope to this field alone,
    // which leaves the seeded 1 / 256Mi / 512Mi / 3 in place — exactly what
    // makes `invalidInput` and `xssPayload` reach the cpuRequest branch.
    //
    // `hashKey: '#s='` — `engine.encodeState()` writes
    // `'#s=' + base64UrlEncode(JSON.stringify({rows:[…]}))` and the playground
    // replaceStates it on every valid user-initiated eval.
    //
    // `seededResultString` is the "Total memory request" row of the first
    // example (256Mi × 3 replicas), verified by running `calculate()`:
    // `768Mi (0.75Gi, 805306368 bytes)`. A TOTAL row on purpose — it is the
    // thing this calculator exists to produce, it disappears the moment the
    // input stops parsing (which J4's restore step needs), and unlike the
    // per-pod rows it is not simply the input echoed back.
    //
    // `invalidInput` / `calmErrorString`: `calculate({cpuRequest:'banana'})` is
    // the pinned vector in `src/lib/k8s-resources/engine.test.ts` ("flags an
    // unparseable CPU quantity, naming the field"); the exact string is the
    // engine's `cpuRequest "banana" is not a valid CPU quantity.`
    //
    // `xssPayload` is a whitespace-free markup token in the CPU-request field.
    // `parseCpu` cannot read it, so the engine quotes the RAW field value into
    // its diagnostic and `renderError` writes that through `escapeHtml()`. The
    // per-field error note the playground also appends is set with
    // `textContent`, so both write paths are covered by this one probe.
    slug: 'kubernetes-resource-calculator',
    family: 'textarea',
    hashKey: '#s=',
    seededResultString: '768Mi (0.75Gi, 805306368 bytes)',
    invalidInput: 'banana',
    calmErrorString: 'cpuRequest "banana" is not a valid CPU quantity.',
    xssPayload: '<img/src=x/onerror=alert(1)>',
    inputSelector: '#k8s-cpu-req',
    resultsSelector: '#k8s-results',
  },
];

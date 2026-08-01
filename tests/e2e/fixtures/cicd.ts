/**
 * Fixtures for the five CI/CD + config tools that predate the E2E matrix.
 *
 * One module per batch, composed by ../tools.fixtures.ts. Field rules live in
 * that file's doc comment — read it first.
 *
 * VERIFICATION STATUS: every value below was executed against a built `dist/`
 * served by `astro preview` on 2026-08-01, and every remaining red journey was
 * traced to its cause. Unlike the ten 2026-07 rollout tools, these five
 * playgrounds were built BEFORE the playground UX contract in CLAUDE.md existed
 * and they do not satisfy it. The measured, reproduced gaps are recorded in the
 * per-entry comments; each one names the observed value so nobody has to
 * re-derive it. Do not weaken a journey or invent a diagnostic to turn one of
 * them green.
 *
 * Four gaps are common to the batch and worth stating once:
 *
 *   1. NO EXAMPLE CHIPS — all five drive examples from a `<select>`
 *      (`#gha-example`, `#ga-expr-example`, `#glci-example`, `#ec-example`,
 *      `#drc-example`), so `SEL.chips` matches ZERO elements (measured). J3's
 *      chip step, J6's chip tap-target floor and J8's locale deep-link step all
 *      fail on `chips.nth(1)` until the pickers become
 *      `[role="group"][aria-label="Examples"]` chips.
 *   2. NO `aria-invalid` ON THE INPUT — measured `null` on all five, in every
 *      error state, so J2's closing assertion fails even on the one tool whose
 *      calm hold is correct.
 *   3. NO ~600ms CALM-ERROR HOLD, except on the GHA validator. Measured time
 *      from last keystroke to visible diagnostic: gha-validator 704ms (correct
 *      — `LIVE_DEBOUNCE_MS 180` + `ERROR_HOLD_MS 420`), expression-tester
 *      139ms, docker-run-to-compose 316ms, gitlab-ci-validator never (no live
 *      eval at all), env-example-checker n/a (no reachable error state).
 *   4. axe (wcag2a/2aa/21a/21aa) reports `aria-input-field-name` on every one
 *      of the five: CodeMirror's `.cm-content` is `role="textbox"` with no
 *      accessible name — the `aria-label` sits on the wrapper `<div>` the
 *      playground owns, not on the element that carries the role. 1 node each,
 *      2 on the two-editor tools (expression-tester, env-example-checker).
 *      `color-contrast` also fires on all five in light theme (19/13/22/3/5
 *      nodes respectively).
 */
import type { ToolFixture } from '../tools.fixtures';

export const CICD_FIXTURES: ToolFixture[] = [
  {
    // ── GitHub Actions Validator ─────────────────────────────────────────────
    // Boot seeds examples[0] = "Vulnerable workflow", so `seededResultString` is
    // the pwn-request finding title that example exists to trip. Confirmed in
    // the rendered `#gha-results`.
    //
    // `hashKey` is `'#gha='`, NOT `'#s='`: this playground predates
    // `src/lib/hash-state.ts` and rolls its own codec (`SHARE_KEY = 'gha'`,
    // `encodeShare()` → `#gha=<base64url(yaml)>`). Two measured consequences:
    //   • J3's boot step FAILS — a first visit to `/github-actions-validator/`
    //     lands on `#gha=bmFtZTogUFIgQnVpbGQ…`, i.e. the boot run writes the
    //     fragment for input the visitor never typed.
    //   • J3's junk-hash step FAILS — the payload is base64url, so
    //     `#gha=just%20a%20scalar` is undecodable, `decodeShare()` returns null,
    //     and the boot seed renders with NO diagnostic. Worse, the boot run then
    //     overwrites the visitor's fragment with the seed's own share link.
    //
    // `invalidInput` is a plain YAML scalar — a document, but not a mapping.
    // Every prefix of it (`j`, `ju`, `jus`, …) is ALSO a plain scalar with the
    // SAME diagnostic, so J2's calm window measures the hold rather than
    // tripping over an intermediate message. The hold is real here: measured
    // 704ms from the last keystroke to the diagnostic, and no `role="alert"` is
    // raised. This is the one tool in the batch whose J2 reaches the
    // aria-invalid assertion — which is then the only thing it fails on.
    // `calmErrorString` is the engine's own wording (`src/lib/gha-validator/
    // engine.ts` line 299, the `isRecord` guard), pinned by engine.test.ts →
    // "rejects a document that is not a mapping"; never a js-yaml message.
    //
    // `xssPayload` is a valid YAML mapping whose `on:` value is a plain scalar,
    // so `collectTriggers()` yields it verbatim and the `unknown-trigger`
    // finding quotes it into its title — the one place this tool renders
    // untrusted text. J7 passes: it renders `&lt;img`, never `<img`.
    slug: 'github-actions-validator',
    family: 'cm',
    hashKey: '#gha=',
    seededResultString: 'pull_request_target checks out untrusted PR code.',
    invalidInput: 'just a scalar',
    calmErrorString:
      'The document is not a YAML mapping. A workflow must be a top-level object with `on:` and `jobs:` keys.',
    xssPayload: 'on: <img src=x onerror=alert(1)>',
    inputSelector: '#gha-editor .cm-content',
    resultsSelector: '#gha-results',
  },
  {
    // ── GitHub Actions Expression & Trigger Tester ────────────────────────────
    // The island has FOUR editors across two tabs. `inputSelector` points at the
    // EXPRESSION editor — first in DOM order, inside the tab that is active on
    // boot, and the input the tool is named for. The trigger tab's editors live
    // in a panel without `.is-active` and are not visible at boot, so they
    // cannot serve as the fixture's input.
    //
    // `seededResultString` is the warning TITLE the playground synthesises for
    // `literal-if-always-true` (the runner#1173 footgun), which is what
    // expressionExamples[0] exists to demonstrate. Confirmed rendered.
    //
    // `invalidInput` MUST carry its own `${{ … }}` span. Corrected 2026-08-01
    // from a bare `true &&`, which was wrong three ways at once: without
    // `${{ }}` the engine never parses the text as an expression, it renders the
    // SAME "Always-true footgun (runner#1173)" card as the boot seed (so J4's
    // "move away from the saved state" could never change the result), that card
    // is a `role="alert"` that is up permanently (so `isCalm` was false at every
    // sample and J2 could only ever report "typing kept stalling"), and the
    // pinned `calmErrorString` was unreachable from the DOM. `${{ true && }}`
    // is a genuine parse failure: measured alerts=0 and the exact pinned string
    // in `#ga-expr-results`. Its prefixes are only evaluated if a keystroke gap
    // exceeds the 180ms debounce, and CodeMirror's bracket auto-close round-trips
    // the payload byte-for-byte under `pressSequentially` (verified).
    //
    // `calmErrorString` is the explanation `explainAst` returns for a parse
    // failure (`expr-eval.ts` line 168, `case 'error'`). It is deliberately NOT
    // the parser's own `error` string ("Unexpected token …"): `runExpr()` never
    // renders `result.error`, so the parser's message is unreachable from the
    // DOM. Pinning the explanation is the only honest choice and it is still
    // specific. The dropped `result.error` is recorded as a finding.
    //
    // `xssPayload` is a single `${{ }}` span holding a string literal, so the
    // expression is valid, is not a footgun, and its rendered value is echoed
    // into the verdict row. Single-quoted so `${` is not a TS interpolation.
    // J7 passes.
    //
    // `hashKey` `'#s='` is this tool's real key, but it is written ONLY by the
    // two "Share" buttons (`wireShare`, `replaceState('#s=' + hash)`), never by
    // an eval — so J3's boot rule passes vacuously (measured: no fragment on
    // boot) and its chip-writes-the-hash step could not pass even if the chips
    // existed. The payload is `base64url(JSON)` with a legacy `atob` fallback,
    // so the junk-hash step's percent-encoded payload decodes to null and the
    // boot seed renders with no diagnostic.
    slug: 'github-actions-expression-tester',
    family: 'cm',
    hashKey: '#s=',
    seededResultString: 'Always-true footgun (runner#1173)',
    invalidInput: '${{ true && }}',
    calmErrorString:
      'This expression could not be parsed, so it evaluates to null (an empty string) and is falsy.',
    xssPayload: "${{ '<img src=x onerror=alert(1)>' }}",
    inputSelector: '#ga-expr-editor .cm-content',
    resultsSelector: '#ga-expr-results',
  },
  {
    // ── GitLab CI Validator ──────────────────────────────────────────────────
    // Boot seeds examples[0] = "Clean pipeline", which trips ZERO findings, so
    // the seeded render is the success card and `seededResultString` has to be
    // its headline.
    //
    // THIS PLAYGROUND HAS NO LIVE EVALUATION — measured, not inferred: there is
    // no `EditorView.updateListener` and no debounce constant in the component,
    // and filling the editor then waiting 2.5s leaves `#glci-results` byte-for-
    // byte unchanged. Results only move on Validate / ⌘+Enter / example change.
    // That single fact is why J2, J4 and J7 are red here, and all three go green
    // the moment the document is re-evaluated by hand:
    //   • J2 — typing `invalidInput` never re-renders; pressing Ctrl+Enter
    //     afterwards renders EXACTLY `calmErrorString` (verified), so the
    //     diagnostic and its wording are right, only the liveness is missing.
    //   • J4 — `setInput(invalidInput)` cannot move the panel off
    //     `seededResultString`.
    //   • J7 — `results never re-rendered after the payload was entered`. Driven
    //     by hand, the payload IS echoed and IS escaped: `&lt;img` present, no
    //     raw `<img` anywhere in `#glci-results`.
    // J1 additionally has no per-row copy button to click, because a clean
    // pipeline renders no finding rows AND this playground ships no `data-copy`
    // attribute at all.
    //
    // `invalidInput` is a plain YAML scalar; `calmErrorString` is the engine's
    // own non-mapping diagnostic (`src/lib/gitlab-ci-validator/engine.ts` line
    // 417).
    //
    // `hashKey` is `'#glci='` (`SHARE_KEY = 'glci'`, base64url of the YAML) and,
    // like the GHA validator, it is written on the boot run — so J3's boot step
    // fails and its junk-hash step cannot decode a percent-encoded payload.
    //
    // `xssPayload` is a single-line YAML FLOW mapping (a block mapping would
    // fight CodeMirror auto-indent under `fill()`). The job ID carries the
    // markup and the job has no `script:`, so the `job-missing-script` finding
    // quotes the ID back into its title — where escaping has to hold, and does.
    slug: 'gitlab-ci-validator',
    family: 'cm',
    hashKey: '#glci=',
    seededResultString: 'No issues found.',
    invalidInput: 'just a scalar',
    calmErrorString:
      'The document is not a YAML mapping. A .gitlab-ci.yml must be a top-level object of global keywords and job definitions.',
    xssPayload: '{<img src=x onerror=alert(1)>: {stage: build}}',
    inputSelector: '#glci-editor .cm-content',
    resultsSelector: '#glci-results',
  },
  {
    // ── Env Example Checker ──────────────────────────────────────────────────
    // The island has TWO editors; `inputSelector` points at the CODE editor
    // (`#ec-editor-code`, first in DOM order). Boot seeds examples[0] ("Node — a
    // key missing from .env.example"), whose whole point is that
    // STRIPE_SECRET_KEY is read in code and absent from the template.
    //
    // `hashKey: null` on purpose and permanently — and for a stronger reason
    // than length: the inputs may be secrets, which the playground says out loud
    // ("No share links on this tool — inputs may be secrets"). It never touches
    // `location.hash` (verified: empty on boot, empty after an unknown key) and
    // ships no `data-copy-link`.
    //
    // THREE STRUCTURAL EXEMPTIONS, all properties of the tool, not of this table:
    //
    //   • `invalidInput` / `calmErrorString` DO NOT EXIST for this tool. Any
    //     string is a valid pair of inputs: `check()` returns `error` only when
    //     an internal exception escapes (`engine.ts` line 261), which no input
    //     can provoke. J2 is unreachable by construction — measured: feeding
    //     `invalidInput` re-renders a perfectly normal report. The value below
    //     is chosen to satisfy the OTHER journeys that use `invalidInput` purely
    //     as "different input" — J4 needs a document whose result no longer
    //     contains `seededResultString`, and this one drops STRIPE_SECRET_KEY
    //     while introducing a different missing key. (J4 passes.)
    //
    //   • `xssPayload` cannot reach the output either. Every value this tool
    //     echoes is an env-var NAME, and both the code scanner
    //     (`ACCESS_PATTERNS`, 16 regexes) and the template parser (`ENV_LINE`)
    //     constrain names to `[A-Za-z_][A-Za-z0-9_]*`. Markup can never be
    //     captured, so J7's escaping precondition ("this tool did not echo … so
    //     nothing about escaping was proven") fails BY DESIGN. The output
    //     alphabet is closed — that is XSS-immunity, not an escaping gap.
    //
    //   • J5's Escape step cannot pass either, and the tool is NOT at fault.
    //     Escape DOES release the code editor (measured: `document.activeElement`
    //     becomes `<body>`). Tab then lands on `#ec-editor-env`'s `.cm-content`
    //     — the SECOND editor, the correct next tabbable — and
    //     `focusIsInCodeMirror()` is island-wide, so it reports "still in a
    //     CodeMirror". The journey assumes one editor per island.
    slug: 'env-example-checker',
    family: 'cm',
    hashKey: null,
    seededResultString: 'STRIPE_SECRET_KEY',
    invalidInput: 'const x = process.env.NOT_IN_THE_EXAMPLE;',
    calmErrorString: 'Unexpected error while checking.',
    xssPayload: 'const x = process.env["<img src=x onerror=alert(1)>"];',
    inputSelector: '#ec-editor-code .cm-content',
    resultsSelector: '#ec-report',
  },
  {
    // ── Docker Run → Compose Converter ───────────────────────────────────────
    // Bidirectional, via a `role="radiogroup"` direction switch (`#drc-mode-run`
    // is `aria-checked="true"` on boot). The boot seed selects `mode = 'run'`
    // and examples[0].run (the canonical nginx publish + read-only bind mount),
    // so BOTH payloads below are `docker run` commands — written for the
    // direction the boot seed selects, per the trap in ../tools.fixtures.ts. A
    // Compose document here would be measured against `runToCompose()` and
    // produce a different diagnostic entirely.
    //
    // `seededResultString` is a line of the EMITTED Compose YAML (`#drc-output`
    // holds only the generated document — the input command lives in the
    // editor).
    //
    // `hashKey` is `'#s='`, but the payload is `base64url(JSON({dir,text}))` via
    // the engine's own `encodeState()`, not `encodeURIComponent(text)`. The boot
    // run passes `userInitiated = false` and does NOT write the fragment
    // (measured empty — this is the only tool in the batch that gets J3's boot
    // rule right), but J3's junk-hash step still cannot build a decodable
    // payload, so `#s=docker%20run%20-d%20-p%2080%3A80` is ignored and the boot
    // seed renders with no diagnostic.
    //
    // `invalidInput` is the run direction's most common real failure — flags but
    // no image. `calmErrorString` is the engine's own wording (`engine.ts` line
    // 702), covered by engine.test.ts → "a command with flags but no image".
    // Measured: the diagnostic lands 316ms after the last keystroke (300ms
    // debounce, NO error hold) and simultaneously raises a `role="alert"`, so
    // J2's 500ms calm window fails. That is the tool, not the fixture.
    //
    // `xssPayload` is a valid single-line command: `-e` takes an arbitrary
    // KEY=VALUE, so the markup survives into the emitted `environment:` entry
    // of the Compose document — the one place this tool renders untrusted text.
    // J7 passes.
    //
    // Copy controls are mis-tagged rather than missing, which is why J1/J5 fail
    // here in a different way from the other four: `#drc-copy` (the primary
    // "Copy") carries NO `data-copy`; `#drc-share` ("Copy link") carries
    // `data-copy` instead of `data-copy-link`; `#drc-md` ("Copy as Markdown")
    // carries `data-copy` instead of `data-copy-all`. So `SEL.copyRow` resolves
    // to the share button, `SEL.copyAll` resolves to nothing, and activating the
    // share button leaves `#drc-announce` empty.
    slug: 'docker-run-to-compose',
    family: 'cm',
    hashKey: '#s=',
    seededResultString: 'image: nginx:alpine',
    invalidInput: 'docker run -d -p 80:80',
    calmErrorString:
      'No image found. A `docker run` command must name an image, e.g. `nginx:alpine`.',
    xssPayload: 'docker run -e HTML=<img src=x onerror=alert(1)> nginx:alpine',
    inputSelector: '#drc-editor .cm-content',
    resultsSelector: '#drc-output',
  },
];

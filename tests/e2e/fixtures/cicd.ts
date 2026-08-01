/**
 * Fixtures for the five CI/CD + config tools that predate the E2E matrix.
 *
 * One module per batch, composed by ../tools.fixtures.ts. Field rules live in
 * that file's doc comment — read it first.
 *
 * READ THIS BEFORE "FIXING" A FAILURE HERE. Unlike the ten 2026-07 rollout
 * tools, these five playgrounds were built BEFORE the playground UX contract in
 * CLAUDE.md existed, and they do not satisfy it. Every value below was verified
 * against the built `dist/` (not guessed), and the journeys that still fail do so
 * because of the TOOL, not the fixture. The measured gaps, per tool, are recorded
 * in the per-entry comments. Do not weaken a journey or invent a diagnostic to
 * turn one of them green.
 *
 * Two gaps are common to all five and worth stating once:
 *
 *   1. NO EXAMPLE CHIPS. All five drive examples from a `<select>`
 *      (`#gha-example`, `#ga-expr-example`, `#glci-example`, `#ec-example`,
 *      `#drc-example`), so `SEL.chips` matches zero elements. J3's chip step and
 *      J6's chip tap-target floor cannot pass until the pickers become
 *      `[role="group"][aria-label="Examples"]` chips.
 *   2. NO `aria-invalid` ON THE INPUT. None of the five ever sets
 *      `aria-invalid="true"`, so J2's closing assertion ("the input should carry
 *      aria-invalid once the error shows") fails even on the tools whose calm
 *      hold is correct.
 */
import type { ToolFixture } from '../tools.fixtures';

export const CICD_FIXTURES: ToolFixture[] = [
  {
    // ── GitHub Actions Validator ─────────────────────────────────────────────
    // Boot seeds examples[0] = "Vulnerable workflow", so `seededResultString` is
    // the pwn-request finding title that example exists to trip.
    //
    // `hashKey` is `'#gha='`, NOT `'#s='`: this playground predates
    // `src/lib/hash-state.ts` and rolls its own codec (`encodeShare()` →
    // `#gha=<base64url(yaml)>`). Two consequences for the journeys:
    //   • J3's boot step FAILS — `run()` writes `replaceState(encodeShare(doc))`
    //     on the initial non-live run (GhaValidatorPlayground.astro ~line 1211),
    //     so a first visit lands on `/github-actions-validator/#gha=bmFtZ…`.
    //   • J3's junk-hash step FAILS — the fragment payload is base64url, so
    //     `#gha=` + encodeURIComponent(invalidInput) is not decodable and
    //     `decodeShare()` correctly returns null, leaving the boot seed on
    //     screen instead of the diagnostic. That is the tool being defensive,
    //     not lenient; see the harness note in the task report.
    //
    // `invalidInput` is a plain YAML scalar — a document, but not a mapping.
    // Every prefix of it (`j`, `ju`, `jus`, …) is ALSO a plain scalar with the
    // SAME diagnostic, so J2's calm window measures the hold rather than
    // tripping over an intermediate message. The hold itself is real here
    // (LIVE_DEBOUNCE_MS 180 + ERROR_HOLD_MS 420 = ~600ms), which is why this is
    // the one tool in the batch whose J2 reaches the aria-invalid assertion.
    // `calmErrorString` is the engine's own wording (engine.ts, the `isRecord`
    // guard), pinned by engine.test.ts → "rejects a document that is not a
    // mapping"; never a js-yaml message.
    //
    // `xssPayload` is a valid YAML mapping whose `on:` value is a plain scalar,
    // so `collectTriggers()` yields it verbatim and the `unknown-trigger`
    // finding quotes it into its title — the one place this tool renders
    // untrusted text.
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
    // boot, and the input the tool is named for — so both payloads below are
    // `if:` expressions rather than context JSON or workflow YAML. The trigger
    // tab's editors are inside a panel without `.is-active` and are therefore
    // not visible at boot, so they cannot serve as the fixture's input.
    //
    // `seededResultString` is the warning TITLE the playground synthesises for
    // `literal-if-always-true` (the runner#1173 footgun), which is what
    // expressionExamples[0] exists to demonstrate.
    //
    // `invalidInput` is a dangling `&&`. Its prefixes `t`/`tr`/`tru`/`true` are
    // all valid expressions, so nothing intermediate can surface — the two
    // trailing characters are the only failing states, and each keystroke
    // reschedules the 180ms debounce.
    //
    // `calmErrorString` is the explanation `explainAst` returns for a parse
    // failure (`expr-eval.ts`, `case 'error'`). It is deliberately NOT the
    // parser's own `error` string ("Unexpected token …"): `runExpr()` never
    // renders `result.error` at all, so the parser's message is unreachable from
    // the DOM. Pinning the explanation is the only honest choice, and it is
    // still specific. The dropped `result.error` is recorded as a finding.
    //
    // `xssPayload` is a single `${{ }}` span holding a string literal, so the
    // expression is valid, is not a footgun, and its rendered value is echoed
    // into the verdict row. Single-quoted here so the `${` is not a TS template
    // interpolation.
    slug: 'github-actions-expression-tester',
    family: 'cm',
    hashKey: '#s=',
    seededResultString: 'Always-true footgun (runner#1173)',
    invalidInput: 'true &&',
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
    // its headline. Two knock-on effects, both real:
    //   • J1 has no per-row copy button to click — a clean pipeline renders no
    //     finding rows (and this playground ships no `data-copy` at all).
    //   • J4's "move away from the saved state" step cannot work, because this
    //     playground has NO live evaluation: there is no `updateListener`, so
    //     editing the document never re-renders the panel. Results only change
    //     on Validate / ⌘+Enter / example change.
    //
    // `invalidInput` is a plain YAML scalar with the engine's own non-mapping
    // diagnostic (engine.ts ~line 415). Reachable only via an explicit run, per
    // the above — J2 therefore never sees it.
    //
    // `hashKey` is `'#glci='` (base64url of the YAML, `SHARE_KEY = 'glci'`), and
    // like the GHA validator it is written on the boot run, so J3's boot step
    // fails and its junk-hash step cannot decode a percent-encoded payload.
    //
    // `xssPayload` is a single-line YAML FLOW mapping (block mapping would fight
    // CodeMirror auto-indent under `fill()`). The job ID carries the markup and
    // the job has no `script:`, so the `job-missing-script` finding quotes the ID
    // back into its title — where escaping has to hold.
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
    // `location.hash` and ships no `data-copy-link`.
    //
    // TWO STRUCTURAL EXEMPTIONS, both properties of the tool, not of this table:
    //
    //   • `invalidInput` / `calmErrorString` DO NOT EXIST for this tool. Any
    //     string is a valid pair of inputs: `check()` returns `error` only when
    //     an internal exception escapes (engine.ts ~line 261), which no input
    //     can provoke. So J2 is unreachable by construction. The value below is
    //     chosen to satisfy the OTHER journeys that use `invalidInput` purely as
    //     "different input" — J4 needs a document whose result no longer
    //     contains `seededResultString`, and this one drops STRIPE_SECRET_KEY
    //     while introducing a different missing key.
    //
    //   • `xssPayload` cannot reach the output either. Every value this tool
    //     echoes is an env-var NAME, and both the code scanner
    //     (`ACCESS_PATTERNS`) and the template parser (`ENV_LINE`) constrain
    //     names to `[A-Za-z_][A-Za-z0-9_]*`. Markup can never be captured, so
    //     J7's escaping precondition ("this tool did not echo … so nothing about
    //     escaping was proven") fails BY DESIGN. The payload below is the
    //     closest valid-looking access shape; it is rejected by the name charset
    //     rather than rendered, which is the safe outcome but not a proof.
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
    // Bidirectional, via a `role="radiogroup"` direction switch. The boot seed
    // selects `mode = 'run'` and examples[0].run (the canonical nginx publish +
    // read-only bind mount), so BOTH payloads below are `docker run` commands —
    // written for the direction the boot seed selects, per the trap in
    // ../tools.fixtures.ts. A Compose document here would be measured against
    // `runToCompose()` and produce a different diagnostic entirely.
    //
    // `seededResultString` is a line of the EMITTED Compose YAML (the results
    // pane is `#drc-output`, which holds only the generated document — the input
    // command lives in the editor).
    //
    // `hashKey` is `'#s='`, but the payload is `base64url(JSON({dir,text}))` via
    // the engine's own `encodeState()`, not `encodeURIComponent(text)`. The boot
    // run passes `userInitiated = false` and therefore does NOT write the
    // fragment (this is the only tool in the batch that gets J3's boot rule
    // right), but J3's junk-hash step still cannot build a decodable payload.
    //
    // `invalidInput` is the run direction's most common real failure — flags but
    // no image. `calmErrorString` is the engine's own wording (engine.ts ~line
    // 702), covered by engine.test.ts → "a command with flags but no image".
    // NOTE: this playground has a 300ms debounce and NO error hold, so the
    // diagnostic lands ~300ms after the last keystroke and J2's 500ms calm
    // window fails. That is the tool, not the fixture.
    //
    // `xssPayload` is a valid single-line command: `-e` takes an arbitrary
    // KEY=VALUE, so the markup survives into the emitted `environment:` entry
    // of the Compose document — the one place this tool renders untrusted text.
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

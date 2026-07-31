/**
 * The per-tool fixture table that drives all eight E2E journeys (J1–J8).
 *
 * Every journey spec loops over `TOOL_FIXTURES`, so this one file is the whole
 * matrix: 8 journeys × N fixtures. **The array ships EMPTY.** An empty table
 * means every journey spec collects zero tests — a passing no-op, never a
 * failure. That is deliberate: the harness lands in SP-0 before any of the ten
 * new tools exist, and a suite that failed until Wave 1 shipped would be a
 * broken gate rather than a gate. `npm run test:e2e` passes on an empty table
 * (the script carries `--pass-with-no-tests`; Playwright's default is to error
 * when nothing matches).
 *
 * Each tool's builder appends EXACTLY ONE entry in its Stage 2 commit. This file
 * is a known merge hotspot (per the plan's parallel-execution model): append at
 * the END of the array and never reorder, so two builders' diffs conflict at
 * worst on adjacent lines.
 *
 * ── COPY-PASTE SNIPPET — add one entry, at the end of TOOL_FIXTURES ──────────
 *
 *   {
 *     slug: 'my-tool',
 *     family: 'cm',
 *     hashKey: '#s=',
 *     seededResultString: 'something the first example always renders',
 *     invalidInput: 'input the engine rejects with a specific diagnostic',
 *     calmErrorString: 'the engine diagnostic, byte-for-byte from its vectors',
 *     xssPayload: 'valid input carrying <img src=x onerror=alert(1)>',
 *     inputSelector: '#mt-input .cm-content',
 *     resultsSelector: '#mt-results',
 *   },
 *
 * Two traps this snippet used to walk into, both now real entries below:
 *   - `calmErrorString` must NOT be a raw `JSON.parse` message. V8 rewords them
 *     between Node releases ("Unexpected token , in JSON at position 8" became
 *     "Expected double-quoted property name in JSON at position 8 (line 1
 *     column 9)"), so engines here translate parse errors into their own stable
 *     wording — pin THAT.
 *   - `invalidInput` and `xssPayload` must be valid/invalid in the direction the
 *     BOOT SEED selects, not in whichever direction reads more naturally. A
 *     bidirectional tool evaluates them against the seeded direction only.
 *
 * ── FIELD RULES (get these wrong and the journeys assert the wrong thing) ────
 *
 * - `slug`               — the live URL segment. J1–J7 visit `/<slug>/`, J8
 *                          visits `/de/<slug>/`. No leading/trailing slash.
 * - `family`             — `'textarea'` for a plain `<textarea>`/`<input>`,
 *                          `'cm'` for a CodeMirror editor, `'cm-wasm'` for a
 *                          CodeMirror editor whose engine is WASM (jq). The
 *                          family gates three behaviours: how input is read
 *                          back, the Escape-releases-focus check (J5, cm +
 *                          cm-wasm only), and the "wait for the WASM runtime to
 *                          finish loading" gate (cm-wasm only).
 * - `hashKey`            — the deep-link fragment PREFIX including `#` and `=`,
 *                          e.g. `'#s='`, `'#in='`, `'#q='`, `'#df='`. Use
 *                          `null` for the tools that deliberately ship no
 *                          payload deep link (tools 5/7/10 — inputs exceed the
 *                          ~2000-char hash cap, so they omit `data-copy-link`
 *                          entirely). J3 asserts a null-hash tool NEVER writes
 *                          a fragment.
 * - `seededResultString` — a substring that MUST appear in the results
 *                          container after the boot seed (first example chip)
 *                          evaluates. Pick something stable and tool-specific,
 *                          not a label that the page shell also renders.
 * - `invalidInput`       — input that the engine rejects with a SPECIFIC
 *                          diagnostic. Used by J2 (calm errors) and J3 (junk
 *                          hash). Must be invalid, not merely empty.
 * - `calmErrorString`    — the exact diagnostic the engine returns for
 *                          `invalidInput`, pinned byte-for-byte against the
 *                          engine's vitest vectors. "Octet 256 is greater than
 *                          255." — never a generic "invalid".
 * - `xssPayload`         — a script/markup payload embedded in input that is
 *                          VALID for the tool's grammar (a YAML string value, a
 *                          URL query param, a crafted PEM subject, a Terraform
 *                          resource name…), so the engine actually echoes it
 *                          into the results. A payload that just fails to parse
 *                          proves nothing. J7 asserts it renders as escaped
 *                          text and that `document.title` is untouched.
 * - `inputSelector`      — the element typing targets. For `cm`/`cm-wasm` point
 *                          it at the CodeMirror content DOM (`… .cm-content`),
 *                          NOT the wrapper, because the journeys focus it and
 *                          send real keystrokes.
 * - `resultsSelector`    — the results container. J5 asserts this element has
 *                          NO `aria-live` (the `role="status"` summary is the
 *                          sole live region), so point it at the results box
 *                          itself, not at an ancestor panel.
 *
 * Selectors NOT listed here are shared and tool-agnostic — chips, copy
 * controls, the status summary, the snapshot row — and live in `_shared.ts`
 * (`SEL`) as attribute selectors, because every playground uses a different id
 * prefix (`cdc-`, `snc-`, `jy-`, …).
 */

/**
 * The one exception to "pure data table": the certificate decoder's XSS payload
 * has to be a REAL, signed certificate whose subject carries the markup, and
 * that certificate already exists as a named constant in the engine's fixture
 * corpus. Importing it beats pasting 25 lines of base64 that a transcription slip
 * would quietly turn into an unparsable block — at which point J7 would prove
 * nothing about escaping.
 */
import { DEMO_LEAF_XSS_SUBJECT } from '../../src/lib/cert-chain/fixtures';

/**
 * Input surface + engine-loading shape of a tool's playground. Drives the
 * family-specific branches in the journeys (see `family` above).
 */
export type ToolFamily = 'textarea' | 'cm' | 'cm-wasm';

/** One tool's E2E contract. See the field rules in this file's doc comment. */
export interface ToolFixture {
  slug: string;
  family: ToolFamily;
  hashKey: string | null;
  seededResultString: string;
  invalidInput: string;
  calmErrorString: string;
  xssPayload: string;
  inputSelector: string;
  resultsSelector: string;
}

/** Append one entry per tool, at the end. Empty = every journey is a no-op. */
export const TOOL_FIXTURES: ToolFixture[] = [
  {
    // Boot seeds example 1 (Kubernetes Deployment → JSON), so the seeded
    // direction is YAML → JSON. `invalidInput` and `xssPayload` are therefore
    // both written as YAML: a payload that is invalid in the OTHER direction
    // would produce a different diagnostic than the one pinned here.
    slug: 'json-yaml-converter',
    family: 'cm',
    hashKey: '#s=',
    seededResultString: '"replicas": 3',
    // Single-line on purpose: J2 types this with pressSequentially, and a
    // multi-line burst into CodeMirror also fights auto-indent.
    invalidInput: 'key: !Ref Thing',
    calmErrorString: 'Unknown YAML tag "!Ref"',
    xssPayload: 'name: "<img src=x onerror=alert(1)>"',
    inputSelector: '#jy-input .cm-content',
    resultsSelector: '#jy-results',
  },
  {
    // Tool 2 — URL Encoder / Decoder + Query-String Parser.
    // `calmErrorString` is pinned by `src/lib/url-codec/engine.test.ts`
    // ("bad-escape names the sequence and the index"); index 18 is where `%ZZ`
    // starts in `invalidInput`, counted against the whole input.
    slug: 'url-encoder-decoder',
    family: 'textarea',
    hashKey: '#in=',
    seededResultString: '#alerts',
    invalidInput: 'https://x.test/?a=%ZZ',
    calmErrorString:
      'Invalid percent-escape "%ZZ" at index 18 — "%" must be followed by two hex digits (0-9, A-F).',
    xssPayload: 'https://x.test/?q=<img src=x onerror=alert(1)>',
    inputSelector: '#uc-input',
    resultsSelector: '#uc-results',
  },
  {
    slug: 'data-size-converter',
    family: 'textarea',
    hashKey: '#q=',
    // The exact byte count of the boot-seeded first chip (1.5 GiB), grouped the
    // way the engine groups it — space separators above four integer digits.
    seededResultString: '1 610 612 736',
    invalidInput: '1 gigglebyte',
    calmErrorString: 'Unknown unit "gigglebyte". Did you mean GB, Gb, GiB or Gib?',
    // Valid grammar up to the unit, so the engine echoes the token back inside
    // its own diagnostic — which is where this tool renders untrusted input.
    xssPayload: '1 GB <img src=x onerror=alert(1)>',
    inputSelector: '#dsz-size',
    resultsSelector: '#dsz-results',
  },
  {
    // Tool 6 — Dockerfile Linter. The boot seed is the "Kitchen sink" chip
    // (fifteen findings), NOT the clean multi-stage example: a Dockerfile with
    // nothing wrong renders no per-row copy button, and J1 copies one.
    //
    // `invalidInput` exercises the linter's one FATAL path. A finding is not an
    // error state here — `FORM` is: Docker refuses to parse a file with an
    // unknown instruction, so the engine reports that instead of pretending to
    // lint it. Single-line on purpose, because J2 types it into CodeMirror.
    slug: 'dockerfile-linter',
    family: 'cm',
    hashKey: '#df=',
    seededResultString: 'apt-get update runs without an install in the same RUN.',
    invalidInput: 'FORM ubuntu:22.04',
    calmErrorString: 'Unknown instruction “FORM” on line 1 — did you mean FROM?',
    // Valid Dockerfile grammar: WORKDIR takes the rest of the line as its path,
    // and DF006 quotes that path back into its finding title — which is exactly
    // where this tool renders untrusted input.
    xssPayload: 'WORKDIR <img src=x onerror=alert(1)>',
    inputSelector: '#df-input .cm-content',
    resultsSelector: '#df-results',
  },
  {
    // Tool 4 — jq Playground, the only `cm-wasm` fixture: the family is what
    // makes `waitForEngineReady` sit on the "Loading jq" placeholder until the
    // ~324 KB WebAssembly binary has been fetched and instantiated.
    //
    // The island has TWO CodeMirror editors. `inputSelector` points at the
    // PROGRAM one (first in DOM order), which is what makes the two payloads
    // below jq programs rather than JSON:
    //   - `invalidInput` is a compile error, and every prefix of it (`.`, `.f`,
    //     `.fo`, `.foo`) is a VALID program against the boot-seeded object, so
    //     J2 really measures the calm hold instead of tripping over an
    //     intermediate diagnostic. `engine.test.ts` pins that property.
    //   - `xssPayload` is a jq string literal, so the program is valid and the
    //     payload is echoed straight into an output card — the one place this
    //     tool renders untrusted text.
    slug: 'jq-playground',
    family: 'cm-wasm',
    hashKey: '#q=',
    seededResultString: 'web-7d9f8c-2xk4t',
    invalidInput: '.foo(',
    calmErrorString: "syntax error, unexpected '(', expecting end of file",
    xssPayload: '"<img src=x onerror=alert(1)>"',
    inputSelector: '#jq-program .cm-content',
    resultsSelector: '#jq-results',
  },
  {
    // Tool 5 — Certificate Decoder & Chain Checker.
    //
    // `hashKey: null` on purpose and permanently: one certificate is 1.5–2.5 KB
    // of base64 and a chain is three of them, an order of magnitude past the
    // ~2000-char fragment cap. The playground therefore omits `data-copy-link`
    // entirely and never touches `location.hash` — J3 asserts both halves of
    // that (no fragment ever written, and an unknown `#s=` key ignored rather
    // than parsed).
    //
    // `seededResultString` is the ISSUER commonName of the boot-seeded demo
    // chain, not the leaf's: the leaf name would also be echoed by the optional
    // hostname field, and J4 needs a string that disappears the moment the
    // input becomes invalid.
    //
    // `calmErrorString` is pinned byte-for-byte by
    // `src/lib/cert-chain/engine.test.ts` ("names a truncated block"). It is
    // reachable by typing, which matters: J2 types `invalidInput` one character
    // at a time, so it has to be short — a full PEM at 40 ms/key would take a
    // minute.
    //
    // `xssPayload` is a real certificate whose subject O and CN both contain the
    // markup (`src/lib/cert-chain/fixtures.ts` → DEMO_LEAF_XSS_SUBJECT). The
    // payload lives inside signed DER, so it genuinely reaches the rendered
    // subject row instead of being rejected at the door.
    //
    // The trailing comment line is not decoration. J7 derives the tag name it
    // hunts for by regexing the PAYLOAD STRING (`firstTagName`), which assumes
    // the markup is literally in the input — true for a YAML value or a URL
    // param, false for anything carried inside base64. Repeating the markup as
    // plain noise outside the BEGIN/END markers satisfies that without touching
    // the shared harness, and makes the probe stronger rather than weaker: the
    // engine must ignore the literal copy (it is outside the markers) AND escape
    // the copy it decodes out of the DER.
    slug: 'certificate-decoder',
    family: 'textarea',
    hashKey: null,
    seededResultString: 'Example Labs Intermediate R3',
    invalidInput: '-----BEGIN CERTIFICATE-----',
    calmErrorString:
      'A "-----BEGIN CERTIFICATE-----" line has no matching "-----END CERTIFICATE-----" line — the paste looks truncated.',
    xssPayload: `${DEMO_LEAF_XSS_SUBJECT}
# and again as plain text outside the markers: <img src=x onerror=alert(1)>`,
    inputSelector: '#cd-input',
    resultsSelector: '#cd-results',
  },
  {
    // Tool 7 — Grafana Dashboard Validator. The boot seed is the "Kitchen sink"
    // chip (21 of the 22 rules fire at once), not the clean dashboard: a
    // dashboard with nothing wrong renders no per-row copy button, and J1 copies
    // one. Chip 2 IS the clean dashboard, which is what J3 needs — it asserts
    // chip 2 evaluates without any error signal.
    //
    // `hashKey: null` on purpose and permanently: a dashboard is kilobytes to
    // megabytes of JSON, one or two orders of magnitude past the ~2000-char
    // fragment cap. The playground omits `data-copy-link` entirely and never
    // touches `location.hash` — J3 asserts both halves (no fragment ever
    // written, and an unknown `#s=` key ignored rather than parsed).
    //
    // `invalidInput` is chosen so every PREFIX of it produces a DIFFERENT
    // diagnostic than the pinned one: `"`, `"p`, … `"panel` are all unterminated
    // strings ("a string is opened here but never closed"), and only the closed
    // `"panels"` is valid JSON of the wrong shape. That matters for J2 — if a
    // slow keystroke burst surfaced an intermediate diagnostic, matching the
    // pinned string would make the run look calm when it was not.
    //
    // `xssPayload` is a complete one-line dashboard whose panel title carries the
    // markup and whose panel type is `graph`, so `deprecated-panel-type` quotes
    // that title straight into its message — the one place this tool renders
    // untrusted text. Both strings are pinned by
    // `src/lib/grafana-dashboard-validator/engine.test.ts`.
    slug: 'grafana-dashboard-validator',
    family: 'cm',
    hashKey: null,
    seededResultString: 'Panel id 1 is already used by "Requests" (panels[0]).',
    invalidInput: '"panels"',
    calmErrorString:
      'This JSON is a string, not an object — paste the dashboard JSON itself, starting with "{".',
    xssPayload:
      '{"title":"Ops","panels":[{"id":1,"type":"graph","title":"<img src=x onerror=alert(1)>","gridPos":{"h":8,"w":12,"x":0,"y":0},"targets":[{"refId":"A","expr":"up"}]}]}',
    inputSelector: '#gd-input .cm-content',
    resultsSelector: '#gd-results',
  },
  {
    // Tool 8 — Kubernetes Label Selector Tester.
    //
    // The island has TWO inputs and `inputSelector` points at the RESOURCES
    // CodeMirror, not at the selector field — so both payloads below are
    // RESOURCE YAML, evaluated against the boot-seeded selector
    // (`app=web,tier=frontend`).
    //
    // `seededResultString` is a clause REASON from the first example, not a
    // count: the visible `role="status"` summary ("3 of 5 resources match") lives
    // outside the results container, and a per-clause reason is the thing this
    // tool actually exists to render.
    //
    // `invalidInput` is what happens when someone pastes the SELECTOR into the
    // resources box — a plain YAML scalar, which is a document but not an object.
    // Deliberately chosen so every prefix of it (`a`, `ap`, `app`, `app=`) is
    // ALSO a plain scalar with the same diagnostic, which is what makes J2's calm
    // window meaningful rather than accidental. `calmErrorString` is pinned
    // byte-for-byte by `engine.test.ts` ("refuses a plain scalar document") and
    // is the engine's own wording, never a js-yaml message.
    //
    // `xssPayload` is a single-line YAML FLOW mapping on purpose: J7 types it
    // into CodeMirror with `fill()`, and a block mapping fights auto-indent. The
    // markup sits in a label VALUE, which is invalid per apimachinery's charset —
    // and that is the point. Resource labels are advisory here, so the payload
    // reaches BOTH the rendered label chip and the advisory diagnostic that
    // quotes it back, which is exactly where escaping has to hold.
    slug: 'kubernetes-label-selector-tester',
    family: 'cm',
    hashKey: '#s=',
    seededResultString: 'label tier="frontnd" ≠ "frontend"',
    invalidInput: 'app=web',
    calmErrorString:
      'Resources: document 1 is a plain string, not a Kubernetes object — paste manifests, a kind: List, or a YAML list of objects.',
    xssPayload: '{kind: Pod, metadata: {name: probe, labels: {app: <img src=x onerror=alert(1)>}}}',
    inputSelector: '#klt-input .cm-content',
    resultsSelector: '#klt-results',
  },
  {
    // Tool 9 — Systemd Unit Validator. The boot seed is the "3 planted issues"
    // chip, NOT the clean forking service: a unit with nothing wrong renders no
    // per-row copy button, and J1 and J5 both operate one.
    //
    // `invalidInput` is the linter's one FATAL path, and it is a real one — a
    // section header that does not end in `]` is what systemd calls an invalid
    // section header, and it refuses to load the file rather than lint it. Kept
    // to five characters on purpose: J2 types it into CodeMirror one key at a
    // time, and every extra keystroke widens the window in which a CDP stall can
    // surface an intermediate diagnostic and force the spec's retry.
    //
    // `xssPayload` is a single assignment with no section header, which is valid
    // unit-file grammar (systemd parses it, logs "Assignment outside of section"
    // and ignores it). The engine echoes the WHOLE line back inside that
    // finding's detail — pinned by `engine.test.ts` — so the payload genuinely
    // reaches the rendered output instead of being rejected at the door.
    slug: 'systemd-unit-validator',
    family: 'cm',
    hashKey: '#unit=',
    seededResultString: 'belongs in [Install], not [Unit]',
    invalidInput: '[Unit',
    calmErrorString:
      '“[Unit” on line 1 looks like a section header but has no closing “]” — systemd refuses to load a unit file with an invalid section header.',
    xssPayload: 'ExecStart=<img src=x onerror=alert(1)>',
    inputSelector: '#su-input .cm-content',
    resultsSelector: '#su-results',
  },
  {
    // Tool 10 — Terraform Plan Summarizer.
    //
    // `hashKey: null` on purpose and permanently: plans run 5,000–50,000 lines,
    // so even the smallest useful one is an order of magnitude past the ~2000-char
    // fragment cap. The playground omits `data-copy-link` entirely and never
    // touches `location.hash`; its share affordance is "Copy summary as Markdown"
    // (`data-copy-all`). J3 asserts both halves — no fragment is ever written, and
    // an unknown `#s=` key is ignored rather than parsed as a payload.
    //
    // `seededResultString` is a resource ADDRESS from the boot-seeded first chip
    // ("Web deploy"), not one of the stat-tile labels: the labels are static
    // markup that would still be on screen after the input became invalid, so J4's
    // "restore undoes the change" step would pass vacuously against them.
    //
    // `invalidInput` is the mistake people actually make — pasting
    // `terraform show -json` of STATE instead of of a saved plan. It is 36
    // characters, which matters because J2 types it one key at a time, and every
    // prefix of it is also invalid, so the calm hold is what is being measured
    // rather than an intermediate diagnostic. `calmErrorString` is pinned
    // byte-for-byte by `src/lib/terraform-plan-summarizer/engine.test.ts`
    // ("names the failure for each specific kind of not-a-plan input").
    //
    // `xssPayload` is a complete, VALID plan whose resource name is the markup —
    // Terraform's own grammar allows it, so the engine parses the plan, the counts
    // reconcile against the `Plan:` line, and the address is echoed into a result
    // row. That row is the one place this tool renders untrusted text.
    slug: 'terraform-plan-summarizer',
    family: 'textarea',
    hashKey: null,
    seededResultString: 'aws_ecs_task_definition.web',
    invalidInput: '{"format_version":"1.0","values":{}}',
    calmErrorString:
      'This is "terraform show -json" output for STATE, not for a plan: it has "values" but no "resource_changes". Run "terraform plan -out=tfplan", then "terraform show -json tfplan".',
    xssPayload: `Terraform will perform the following actions:

  # aws_s3_bucket.<img src=x onerror=alert(1)> will be created
  + resource "aws_s3_bucket" "<img src=x onerror=alert(1)>" {
      + bucket = "probe"
    }

Plan: 1 to add, 0 to change, 0 to destroy.`,
    inputSelector: '#tps-input',
    resultsSelector: '#tps-results',
  },
];

/** Fixtures for one family — used by the family-gated journey steps. */
export function byFamily(family: ToolFamily): ToolFixture[] {
  return TOOL_FIXTURES.filter((fixture) => fixture.family === family);
}

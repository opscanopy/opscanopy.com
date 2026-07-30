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
];

/** Fixtures for one family — used by the family-gated journey steps. */
export function byFamily(family: ToolFamily): ToolFixture[] {
  return TOOL_FIXTURES.filter((fixture) => fixture.family === family);
}

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
 *     slug: 'json-yaml-converter',
 *     family: 'cm',
 *     hashKey: '#in=',
 *     seededResultString: 'replicas: 3',
 *     invalidInput: '{"a": 1,,}',
 *     calmErrorString: 'Unexpected token , in JSON at position 8',
 *     xssPayload: '{"name": "<img src=x onerror=alert(1)>"}',
 *     inputSelector: '#jy-input .cm-content',
 *     resultsSelector: '#jy-results',
 *   },
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
];

/** Fixtures for one family — used by the family-gated journey steps. */
export function byFamily(family: ToolFamily): ToolFixture[] {
  return TOOL_FIXTURES.filter((fixture) => fixture.family === family);
}

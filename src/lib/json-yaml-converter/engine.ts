/**
 * JSON ↔ YAML Converter — the public façade.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │  convert(input, {direction, indent, sortKeys})                           │
 * │    1. strip BOM        JSON.parse rejects a leading BOM outright         │
 * │    2. mask quotes      once, shared by every source-text heuristic       │
 * │    3. PARSE            js-yaml loadAll (YAML 1.2 core schema) | JSON.parse │
 * │    4. WALK             cycles, timestamps, binary, ±Infinity, stats      │
 * │    5. EMIT             JSON.stringify(indent) | yaml.dump(lineWidth: -1) │
 * │    6. REPORT           every loss as a Diagnostic, never silently        │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Two promises this module keeps, and which its vitest vectors enforce:
 *
 *   - IT NEVER THROWS. Not on garbage, not on a 100 KB paste, not on a
 *     recursive alias, not on a hostile options object. Every failure comes
 *     back as `{ok: false, output: '', diagnostics: [...]}`.
 *   - IT NEVER GUESSES THE DIRECTION. `detectFormat` exists so the UI can
 *     *suggest* a switch; nothing here acts on it. YAML pasted while the
 *     JSON → YAML direction is selected produces an error with a
 *     switch-the-direction hint, not a silent reinterpretation.
 *
 * js-yaml types: this project has no `@types/js-yaml`, so each engine declares
 * the sliver it uses. Eight engine dirs already declare `load`; this one
 * declares ONLY `loadAll` and `dump` to keep the ambient declarations
 * non-conflicting (identical function signatures merge as overloads; a second
 * `const _default` or a differently-typed `DEFAULT_SCHEMA` would not).
 * `loadAll`/`dump` default to DEFAULT_SCHEMA, so nothing needs the schema value.
 */
declare module 'js-yaml' {
  export function loadAll(input: string, iterator?: null, options?: unknown): unknown[];
  export function dump(input: unknown, options?: unknown): string;
}

import { dump, loadAll } from 'js-yaml';
import { base64UrlDecode, base64UrlEncode } from '../codec';
import {
  YAML_SEMANTICS,
  describeJsonError,
  describeYamlError,
  detectFormat,
  findUnsafeIntegers,
  findYaml11BoolLookalikes,
  findYaml11OctalLookalikes,
  hasAnchorsOrAliases,
  hasComments,
  hasMergeKey,
  isYaml11BoolLookalike,
  isYaml12NonString,
  maskQuoted,
  stripBom,
} from './diagnose';
import { collectStrings, findIntegerLikeKeys, walkDocument, walkStream } from './normalize';
import type {
  ConvertOptions,
  ConvertResult,
  ConvertStats,
  DetectedFormat,
  Diagnostic,
  Direction,
  Indent,
  ShareState,
} from './types';

export { detectFormat, YAML_SEMANTICS };
export type {
  ConvertOptions,
  ConvertResult,
  ConvertStats,
  DetectedFormat,
  Diagnostic,
  Direction,
  Indent,
  ShareState,
};

const NO_STATS: ConvertStats = { docs: 0, keys: 0, depth: 0 };

/** How many lookalike values one quoting note will name before eliding. */
const MAX_NAMED_VALUES = 6;

function normalizeDirection(value: unknown): Direction {
  return value === 'json-to-yaml' ? 'json-to-yaml' : 'yaml-to-json';
}

function normalizeIndent(value: unknown): Indent {
  return value === 4 ? 4 : 2;
}

function failure(
  direction: Direction,
  detected: DetectedFormat,
  diagnostics: Diagnostic[],
): ConvertResult {
  return { ok: false, direction, output: '', diagnostics, stats: { ...NO_STATS }, detected };
}

/** `'a', 'b' and 'c'` — for the quoting notes. */
function quoteList(values: string[]): string {
  return values.map((v) => `'${v}'`).join(', ');
}

/**
 * Output-side note: strings js-yaml had to quote so they survive a round trip.
 * Split in two because the audiences differ — one is a YAML 1.2 fact ("`1.0` is
 * a float"), the other is the YAML 1.1 legacy trap that bites Kubernetes and
 * Ansible users ("`NO` is the country code Norway, or the boolean false").
 */
function quotingNotes(value: unknown): Diagnostic[] {
  const strings = collectStrings(value);
  const notes: Diagnostic[] = [];

  const bool11: string[] = [];
  const nonString12: string[] = [];
  for (const s of strings) {
    if (isYaml11BoolLookalike(s)) {
      if (!bool11.includes(s)) bool11.push(s);
    } else if (isYaml12NonString(s)) {
      if (!nonString12.includes(s)) nonString12.push(s);
    }
  }

  for (const s of bool11.slice(0, MAX_NAMED_VALUES)) {
    const reads = /^(n|N|no|No|NO|off|Off|OFF)$/.test(s) ? 'false' : 'true';
    notes.push({
      id: 'yaml-1-1-bool-lookalike',
      severity: 'note',
      message:
        `The string "${s}" was quoted as '${s}' in the output. Left unquoted, YAML 1.1 tools ` +
        `(PyYAML) would read it as the boolean ${reads} — this is the "Norway problem".`,
    });
  }

  if (nonString12.length > 0) {
    const named = nonString12.slice(0, MAX_NAMED_VALUES);
    const elided = nonString12.length > named.length ? ', …' : '';
    const one = nonString12.length === 1;
    notes.push({
      id: 'yaml-quoted-to-stay-string',
      severity: 'note',
      message:
        `Quoted ${nonString12.length} ${one ? 'value' : 'values'} in the output ` +
        `(${quoteList(named)}${elided}) so ${one ? 'it stays a string' : 'they stay strings'} — ` +
        `unquoted, a YAML parser would re-read ${one ? 'it' : 'them'} as numbers, booleans or ` +
        'null.',
    });
  }

  return notes;
}

function integerKeyNote(value: unknown): Diagnostic[] {
  const keys = findIntegerLikeKeys(value);
  if (keys.length === 0) return [];
  const named = keys.slice(0, MAX_NAMED_VALUES);
  const elided = keys.length > named.length ? ', …' : '';
  return [
    {
      id: 'integer-like-keys-reordered',
      severity: 'warning',
      message:
        `Integer-like keys (${named.map((k) => `"${k}"`).join(', ')}${elided}) are always ` +
        'enumerated first, in ascending numeric order, whatever order they were written in — a ' +
        'JavaScript object rule this converter cannot work around. Use a non-numeric prefix, or ' +
        'a sequence, if the order matters.',
    },
  ];
}

/* ────────────────────────────────────────────────────────────────────────── *
 *  YAML → JSON
 * ────────────────────────────────────────────────────────────────────────── */

function yamlToJson(
  text: string,
  masked: string,
  detected: DetectedFormat,
  indent: Indent,
  sortKeys: boolean,
  diagnostics: Diagnostic[],
): ConvertResult {
  let docs: unknown[];
  try {
    docs = loadAll(text);
  } catch (err) {
    return failure('yaml-to-json', detected, [...diagnostics, describeYamlError(err)]);
  }

  if (hasComments(masked)) {
    diagnostics.push({
      id: 'comments-dropped',
      severity: 'note',
      message:
        'Comments were dropped. YAML comments have no JSON equivalent, and this converter does ' +
        'not restore them on the way back either.',
    });
  }
  if (hasAnchorsOrAliases(masked)) {
    diagnostics.push({
      id: 'anchors-expanded',
      severity: 'note',
      message:
        'YAML anchors and aliases were expanded in place. JSON has no anchor syntax, so each ' +
        'alias became a full copy of the anchored value.',
    });
  }
  if (hasMergeKey(masked)) {
    diagnostics.push({
      id: 'merge-keys-expanded',
      severity: 'note',
      message:
        'A merge key (<<:) was expanded into the mapping that used it. JSON has no merge key, ' +
        'so the inherited keys are written out in full.',
    });
  }
  if (docs.length > 1) {
    diagnostics.push({
      id: 'multi-document',
      severity: 'note',
      message:
        `This YAML stream holds ${docs.length} documents. JSON has no multi-document form, so ` +
        `they were written as a top-level array of ${docs.length} items.`,
    });
  }
  if (detected === 'json') {
    diagnostics.push({
      id: 'input-already-json',
      severity: 'note',
      message:
        'This input is already JSON, and JSON is a subset of YAML 1.2 — the YAML parser read it ' +
        'as-is and only re-formatted it. Switch the direction to turn it into YAML.',
    });
  }
  diagnostics.push(...findYaml11BoolLookalikes(masked));
  diagnostics.push(...findYaml11OctalLookalikes(masked));
  diagnostics.push(...findUnsafeIntegers(masked));

  const walked = walkStream(docs, diagnostics, { target: 'json', sortKeys });
  diagnostics.push(...integerKeyNote(walked.value));
  if (!walked.ok) return failure('yaml-to-json', detected, diagnostics);

  let output: string;
  try {
    output = JSON.stringify(walked.value, null, indent) ?? 'null';
  } catch (err) {
    return failure('yaml-to-json', detected, [
      ...diagnostics,
      {
        id: 'json-emit-failed',
        severity: 'error',
        message:
          'This document could not be written as JSON: ' +
          (err instanceof Error ? err.message : 'unexpected error') +
          '.',
      },
    ]);
  }

  return {
    ok: true,
    direction: 'yaml-to-json',
    output,
    diagnostics,
    stats: walked.stats,
    detected,
  };
}

/* ────────────────────────────────────────────────────────────────────────── *
 *  JSON → YAML
 * ────────────────────────────────────────────────────────────────────────── */

function jsonToYaml(
  text: string,
  masked: string,
  detected: DetectedFormat,
  indent: Indent,
  sortKeys: boolean,
  diagnostics: Diagnostic[],
): ConvertResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch (err) {
    return failure('json-to-yaml', detected, [...diagnostics, describeJsonError(err, text)]);
  }

  diagnostics.push(...findUnsafeIntegers(masked));

  const walked = walkDocument(parsed, diagnostics, { target: 'yaml', sortKeys });
  diagnostics.push(...integerKeyNote(walked.value));
  diagnostics.push(...quotingNotes(walked.value));
  if (!walked.ok) return failure('json-to-yaml', detected, diagnostics);

  let output: string;
  try {
    output = dump(walked.value, {
      indent,
      // No line folding: a folded scalar re-reads with different whitespace, and
      // a converter whose output is not byte-stable is not a converter.
      lineWidth: -1,
      // JSON has no anchors, so a value referenced twice must be written twice
      // rather than emitted as js-yaml's `&ref_0` / `*ref_0`, which the author
      // never wrote and which would surprise them on the way back.
      noRefs: true,
      sortKeys,
    });
  } catch (err) {
    return failure('json-to-yaml', detected, [
      ...diagnostics,
      {
        id: 'yaml-emit-failed',
        severity: 'error',
        message:
          'This value could not be written as YAML: ' +
          (err instanceof Error ? err.message : 'unexpected error') +
          '.',
      },
    ]);
  }

  return {
    ok: true,
    direction: 'json-to-yaml',
    output,
    diagnostics,
    stats: walked.stats,
    detected,
  };
}

/* ────────────────────────────────────────────────────────────────────────── *
 *  Public entry point
 * ────────────────────────────────────────────────────────────────────────── */

/**
 * Convert one way or the other, reporting every lossy step.
 *
 * Never throws — see this module's header. `options` is defensively normalized,
 * so an unknown direction runs YAML → JSON and an out-of-range indent falls
 * back to 2 rather than producing junk.
 */
export function convert(input: string, options: ConvertOptions): ConvertResult {
  const raw = typeof input === 'string' ? input : '';
  const direction = normalizeDirection((options as ConvertOptions | undefined)?.direction);
  const indent = normalizeIndent((options as ConvertOptions | undefined)?.indent);
  const sortKeys = (options as ConvertOptions | undefined)?.sortKeys === true;

  const stripped = stripBom(raw);
  const text = stripped.text;

  if (text.trim().length === 0) {
    // Nothing pasted yet is not an error, and it is not worth a diagnostic
    // either — the playground shows its own empty state for this.
    return {
      ok: false,
      direction,
      output: '',
      diagnostics: [],
      stats: { ...NO_STATS },
      detected: 'ambiguous',
    };
  }

  const detected = detectFormat(text);
  const diagnostics: Diagnostic[] = [];
  if (stripped.removed) {
    diagnostics.push({
      id: 'bom-removed',
      severity: 'note',
      message:
        'A UTF-8 byte-order mark (BOM) was removed before parsing. JSON.parse rejects a leading ' +
        'BOM, so this file would fail in most tools until it is re-saved without one.',
    });
  }

  const masked = maskQuoted(text);

  try {
    return direction === 'yaml-to-json'
      ? yamlToJson(text, masked, detected, indent, sortKeys, diagnostics)
      : jsonToYaml(text, masked, detected, indent, sortKeys, diagnostics);
  } catch (err) {
    // Belt and braces: the promise is "never throws", so even an unforeseen
    // failure inside a parser or the walk comes back as a diagnostic.
    return failure(direction, detected, [
      ...diagnostics,
      {
        id: 'unexpected-error',
        severity: 'error',
        message:
          'The converter hit an unexpected problem with this input: ' +
          (err instanceof Error ? err.message : 'unknown error') +
          '.',
      },
    ]);
  }
}

/* ────────────────────────────────────────────────────────────────────────── *
 *  `#s=` deep-link state
 * ────────────────────────────────────────────────────────────────────────── */

/** Wire form of ShareState — short keys, because it rides in a URL fragment. */
interface WireState {
  d: 'j' | 'y';
  i: Indent;
  k: 0 | 1;
  t: string;
}

/** Encode the full editor state (direction + indent + sortKeys + text) as `#s=`. */
export function encodeState(state: ShareState): string {
  const wire: WireState = {
    d: state.direction === 'json-to-yaml' ? 'j' : 'y',
    i: normalizeIndent(state.indent),
    k: state.sortKeys ? 1 : 0,
    t: typeof state.text === 'string' ? state.text : '',
  };
  return '#s=' + base64UrlEncode(JSON.stringify(wire));
}

/**
 * Decode a `#s=` fragment. Two accepted forms, in order:
 *
 *   1. the base64url JSON payload `encodeState` writes;
 *   2. RAW TEXT — a hand-written or hand-edited fragment such as
 *      `#s=key%3A%20value`. Supporting it is deliberate: a fragment is
 *      typo- and attacker-controlled input, and the honest degradation for
 *      "this is not my payload" is to treat it as pasted text and let the
 *      engine produce a real diagnostic, rather than silently dropping it and
 *      showing an example the visitor did not ask for.
 *
 * Direction for form 2 comes from `detectFormat`, which is the one place this
 * module lets detection pick a direction — there is no user choice to respect
 * in a URL that arrived without one.
 *
 * SSR-safe: with no argument and no `window`, returns null.
 */
export function decodeState(hash?: string): ShareState | null {
  const source =
    typeof hash === 'string'
      ? hash
      : typeof window !== 'undefined' && window.location
        ? window.location.hash
        : '';
  const match = /[#&]s=([^&]*)/.exec(source);
  if (!match) return null;
  const encoded = match[1];
  if (encoded.length === 0) return null;

  try {
    const wire = JSON.parse(base64UrlDecode(encoded)) as Partial<WireState> | null;
    if (wire && typeof wire === 'object' && typeof wire.t === 'string' && wire.t.length > 0) {
      if (wire.d === 'j' || wire.d === 'y') {
        return {
          direction: wire.d === 'j' ? 'json-to-yaml' : 'yaml-to-json',
          indent: normalizeIndent(wire.i),
          sortKeys: wire.k === 1,
          text: wire.t,
        };
      }
    }
  } catch {
    /* not our payload — fall through to the raw-text form below */
  }

  let text = encoded;
  try {
    text = decodeURIComponent(encoded);
  } catch {
    /* a malformed percent escape: keep the fragment verbatim */
  }
  if (text.trim().length === 0) return null;
  return {
    direction: detectFormat(text) === 'json' ? 'json-to-yaml' : 'yaml-to-json',
    indent: 2,
    sortKeys: false,
    text,
  };
}

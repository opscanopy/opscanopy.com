/**
 * JSON ↔ YAML Converter — shared types.
 *
 * The whole point of this tool is that a conversion is never free: YAML has
 * anchors, comments, merge keys, timestamps, multiple documents and infinities;
 * JSON has none of them. So the result type is not "output or error" — it is
 * "output PLUS every lossy thing that happened on the way", which is what
 * `Diagnostic[]` carries.
 */

/** Which way the conversion runs. Never inferred — the user picks it. */
export type Direction = 'json-to-yaml' | 'yaml-to-json';

/**
 * What the input LOOKS like, independent of `Direction`.
 * `'ambiguous'` covers empty input and bare scalars (`123`, `true`) that are
 * legal in both languages — the UI must not offer a switch-direction nudge for
 * those, because there is nothing to nudge towards.
 */
export type DetectedFormat = 'json' | 'yaml' | 'ambiguous';

/** Output indent width. Two values only; anything else falls back to 2. */
export type Indent = 2 | 4;

/**
 * `error` blocks the conversion (no output). `warning` means the output exists
 * but is NOT equivalent to the input (a value changed). `note` means the output
 * is equivalent but something unrepresentable was flattened away (comments,
 * anchors, multiple documents).
 */
export type DiagnosticSeverity = 'error' | 'warning' | 'note';

export interface Diagnostic {
  /** Stable identifier — safe to branch on in the UI and to assert in tests. */
  id: string;
  severity: DiagnosticSeverity;
  /** A complete sentence naming what happened and what to do about it. */
  message: string;
  /** 1-based source line, when the diagnostic came from a text position. */
  line?: number;
  /** 1-based source column, when the diagnostic came from a text position. */
  column?: number;
  /** `$.spec.replicas`-style location, when it came from the value walk. */
  path?: string;
}

export interface ConvertStats {
  /** YAML documents in the input (always 1 for JSON). 0 when nothing parsed. */
  docs: number;
  /** Mapping keys, counted recursively across every document. */
  keys: number;
  /** Deepest nesting level. A bare scalar document is 0; `{a: 1}` is 1. */
  depth: number;
}

export interface ConvertOptions {
  direction: Direction;
  /** Defaults to 2. */
  indent?: Indent;
  /** Sort mapping keys at every level. Defaults to false (order preserved). */
  sortKeys?: boolean;
}

export interface ConvertResult {
  /** False whenever any `error` diagnostic fired; `output` is '' in that case. */
  ok: boolean;
  /** Echoed back so a caller holding an async result knows which way it ran. */
  direction: Direction;
  output: string;
  diagnostics: Diagnostic[];
  stats: ConvertStats;
  detected: DetectedFormat;
}

/** Everything the `#s=` deep link and a saved snapshot need to restore. */
export interface ShareState {
  direction: Direction;
  indent: Indent;
  sortKeys: boolean;
  text: string;
}

export interface ConverterExample {
  id: string;
  label: string;
  /** The direction this example is meant to be read in. */
  direction: Direction;
  input: string;
}

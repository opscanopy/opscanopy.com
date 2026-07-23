/**
 * Case Converter — shared types. `convertCases()` never throws on user input;
 * empty / token-less input yields { valid:false, error }.
 */

/** Every case style the converter emits, one row per kind. */
export type CaseKind =
  | 'camel'
  | 'pascal'
  | 'snake'
  | 'screamingSnake'
  | 'kebab'
  | 'train'
  | 'title'
  | 'sentence'
  | 'constant'
  | 'dot'
  | 'path';

/** A single converted representation: its kind, human label, and value. */
export interface CaseRow {
  kind: CaseKind;
  label: string;
  value: string;
}

export interface CaseResult {
  valid: boolean;
  error?: string;
  /** One row per case style, in display order. Empty when `valid` is false. */
  rows: CaseRow[];
}

/** An example chip: an id, a display label, and the raw input it seeds. */
export interface CaseExample {
  id: string;
  label: string;
  input: string;
}

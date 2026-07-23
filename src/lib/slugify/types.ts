/**
 * Slugify — shared types for the client-side engine.
 * `slugify()` never throws on user input; bad input yields { valid:false, error }.
 */

/** The three characters allowed as a slug word separator. */
export type SlugSeparator = '-' | '_' | '.';

/** Options controlling how a title is turned into a slug. */
export interface SlugifyOptions {
  /** Word separator — must be a single char from `{ '-', '_', '.' }`. */
  separator: string;
  /** Maximum slug length in characters. `0` or a non-positive value means no limit. */
  maxLength: number;
  /** Lowercase the slug (the common case for URLs). */
  lowercase: boolean;
}

/** One example chip: a label plus the raw title to slugify. */
export interface SlugifyExample {
  id: string;
  label: string;
  input: string;
}

/** The result of slugifying a title. */
export interface SlugifyResult {
  /** False when the input/options were rejected (see `error`). */
  valid: boolean;
  /** Human-readable diagnostic, present only when `valid` is false. */
  error?: string;
  /** The finished slug (empty string when invalid). */
  slug: string;
  /** True when the max-length limit removed characters. */
  truncated?: boolean;
  /** Optional plain-language notes about what happened (e.g. truncation). */
  notes?: string[];
}

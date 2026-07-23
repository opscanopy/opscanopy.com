/**
 * UUID / ULID Generator — shared types for the client-side engine.
 *
 * The engine functions are pure and NEVER throw: bad or out-of-range input
 * yields a result object ({ valid:false, error } or a clamped batch + note),
 * never an exception.
 */

/** Which kind of identifier to generate. */
export type GenerateMode = 'v4' | 'nil' | 'ulid';

/** Options for a generation batch. */
export interface GenerateOptions {
  mode: GenerateMode;
  /** Requested count; clamped to [1, 1000]. */
  count: number;
  /** Emit values in uppercase hex/Crockford. */
  uppercase: boolean;
}

/** The result of a generation batch. */
export interface GenerateResult {
  valid: boolean;
  error?: string;
  /** The generated identifiers, in order. */
  values: string[];
  /** Non-fatal advisories (e.g. count was clamped). */
  notes?: string[];
}

/** The result of inspecting a pasted identifier. */
export interface InspectResult {
  valid: boolean;
  error?: string;
  /** Which family the input parsed as. */
  kind?: 'uuid' | 'ulid';
  /** UUID version (nibble 13) when kind === 'uuid'. */
  version?: number;
  /** Human-readable variant name ('RFC 4122' | 'Microsoft' | 'NCS' | ...). */
  variant?: string;
  /** ISO-8601 timestamp decoded from a ULID's time component. */
  timestamp?: string;
  /** Extra descriptive lines (format, unix ms, randomness, …). */
  notes?: string[];
}

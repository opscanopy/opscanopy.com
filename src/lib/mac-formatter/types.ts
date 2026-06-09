/**
 * MAC Address Formatter — shared types for the client-side engine.
 * `format()` never throws on user input; bad input yields { valid:false, error }.
 */

/** One labeled output row in the results table. */
export interface MacRow {
  label: string;
  value: string;
  /** Render the value in the mono/code face (addresses, hex groups). */
  mono?: boolean;
}

/** The result of formatting a MAC address. */
export interface MacResult {
  valid: boolean;
  error?: string;
  rows: MacRow[];
}

/** A runnable example for the picker. */
export interface MacExample {
  id: string;
  label: string;
  /** A MAC address that formats cleanly, e.g. "00:1a:2b:3c:4d:5e". */
  input: string;
}

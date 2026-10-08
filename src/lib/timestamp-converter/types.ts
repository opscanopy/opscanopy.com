/**
 * Timestamp Converter — shared types. `convert()` never throws on user input;
 * bad input yields { valid:false, error, rows:[] }.
 */

/** One rendered representation of the parsed instant. */
export interface TimeRow {
  label: string;
  value: string;
  /** Render in a monospace face (for the machine-readable rows). */
  mono?: boolean;
}

export interface TimeResult {
  valid: boolean;
  error?: string;
  /**
   * The detected input form, surfaced to the user:
   * "epoch seconds" | "epoch milliseconds" | "epoch microseconds" | "date string".
   */
  detected?: string;
  rows: TimeRow[];
  /** Caveats about how an ambiguous input was read (timezone, date order). */
  notes?: string[];
}

/** A runnable example for the picker. */
export interface TimeExample {
  id: string;
  label: string;
  input: string;
}

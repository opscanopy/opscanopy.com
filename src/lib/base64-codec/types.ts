/**
 * Base64 Encoder / Decoder — shared types. `convert()` never throws on user
 * input; bad input yields { valid:false, error }.
 */

/** Which direction to run: text -> base64, or base64 -> text. */
export type Base64Mode = 'encode' | 'decode';

export interface Base64Result {
  valid: boolean;
  error?: string;
  /** The encoded base64 (encode mode) or decoded UTF-8 text (decode mode). */
  output: string;
  /** Byte length of the underlying data (UTF-8 bytes encoded, or bytes decoded). */
  bytes?: number;
  /** A friendly aside, e.g. when url-safe input was auto-detected / re-padded. */
  note?: string;
}

export interface Base64Example {
  id: string;
  label: string;
  input: string;
  mode: Base64Mode;
  urlSafe: boolean;
}

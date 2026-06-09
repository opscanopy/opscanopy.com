/**
 * Hash Generator — shared types. `hash()` digests a UTF-8 string with MD5,
 * SHA-1, SHA-256 and SHA-512; `hmac()` keys a single algorithm. Both are async
 * (SHA digests come from SubtleCrypto) and never throw on user input — failures
 * surface as { valid:false, error } rather than exceptions.
 */

export interface HashRow {
  label: string;
  value: string;
  mono?: boolean;
}

export interface HashResult {
  valid: boolean;
  error?: string;
  /** One row per algorithm: MD5, SHA-1, SHA-256, SHA-512 (all lowercase hex). */
  rows: HashRow[];
}

/** Algorithms accepted by `hmac()`; mirror SubtleCrypto's HMAC hash names. */
export type HmacAlgo = 'SHA-1' | 'SHA-256' | 'SHA-512';

export interface HashExample {
  id: string;
  label: string;
  input: string;
}

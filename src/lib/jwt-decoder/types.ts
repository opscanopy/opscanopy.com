/**
 * JWT Decoder — shared types. `decode()` splits a compact JWS, base64url-decodes
 * the header and payload, and surfaces the standard registered claims with
 * human-readable status; `verify()` checks the signature. Both never throw on
 * user input: `decode` returns { valid:false, error } and `verify` resolves to a
 * status object.
 */

/** Severity used to colour a claim row (e.g. an expired `exp` is "error"). */
export type ClaimTone = 'ok' | 'warn' | 'error';

/** One rendered row in the "claims" table (registered claims only). */
export interface ClaimRow {
  /** Display name, e.g. "Expires (exp)". */
  label: string;
  /** Rendered value, e.g. "1516239022 · 2018-01-25 02:10:22 UTC (expired)". */
  value: string;
  /** True for values shown in a monospace cell (tokens, raw numbers). */
  mono?: boolean;
  /** Optional severity for highlighting; absent means neutral. */
  tone?: ClaimTone;
}

/** The result of decoding (NOT verifying) a compact JWT. */
export interface JwtResult {
  valid: boolean;
  /** Friendly reason the token could not be decoded. */
  error?: string;
  /** `alg` from the header, e.g. "HS256", when present. */
  alg?: string;
  /** `typ` from the header, e.g. "JWT", when present. */
  typ?: string;
  /** Pretty-printed header JSON (2-space indent). */
  header?: string;
  /** Pretty-printed payload JSON (2-space indent). */
  payload?: string;
  /** The raw third segment (the signature), base64url, when present. */
  signatureB64?: string;
  /** Registered-claim rows (iss/sub/aud/exp/nbf/iat/jti) that were present. */
  claims: ClaimRow[];
  /** Non-fatal advisories, e.g. `alg:"none"` or a missing `exp`. */
  warnings: string[];
}

/** Outcome of an attempted signature verification. */
export interface VerifyResult {
  /**
   * 'valid' / 'invalid' — signature checked and matched / did not match;
   * 'unsupported' — the `alg` (or key form) cannot be verified in-browser;
   * 'error' — the token, key, or environment prevented a check.
   */
  status: 'valid' | 'invalid' | 'unsupported' | 'error';
  /** Human-readable explanation suitable for display. */
  detail: string;
}

/** A runnable example for the picker. */
export interface JwtExample {
  id: string;
  label: string;
  /** The compact JWT string. */
  token: string;
}

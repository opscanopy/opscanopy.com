/**
 * JWT Decoder & Encoder — shared types. `decode()` splits a compact JWS,
 * base64url-decodes the header and payload, and surfaces the standard
 * registered claims with human-readable status; `verify()` checks the
 * signature (HS/RS/PS/ES/EdDSA against a secret, PEM, JWK, or JWKS);
 * `sign()` builds a signed compact JWS from editable JSON; `generateKeys()`
 * creates key material in-browser. Everything never throws on user input:
 * failures come back as result objects.
 */

/** Every JWS signature algorithm this tool can sign and verify. */
export type JwsAlg =
  | 'HS256'
  | 'HS384'
  | 'HS512'
  | 'RS256'
  | 'RS384'
  | 'RS512'
  | 'PS256'
  | 'PS384'
  | 'PS512'
  | 'ES256'
  | 'ES384'
  | 'ES512'
  | 'EdDSA';

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
  /** Plain-English one-liner shown as a muted caption under the row. */
  caption?: string;
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
  /** exp/nbf time-validity verdict for the status pill (success only). */
  freshness?: Freshness;
}

/** Time-validity verdict for the hero status pill — independent of signature. */
export interface Freshness {
  /** 'valid' = exp/nbf window OK now; 'none' = token has neither claim. */
  state: 'valid' | 'expired' | 'not-yet' | 'none';
  /** Human line, e.g. "Expired 3 days ago (exp 2020-01-01 00:00:00 UTC)". */
  detail: string;
}

/** Options accepted by `verify()` beyond the token and key input. */
export interface VerifyOptions {
  /** Treat an HS* secret as base64url-encoded bytes instead of UTF-8 text. */
  secretBase64url?: boolean;
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
  /** Optional advisory (e.g. a weak HS* secret) — never blocks the result. */
  warning?: string;
}

/** Outcome of `sign()` — a compact JWS, or a friendly reason it failed. */
export type SignResult =
  | { ok: true; token: string }
  | { ok: false; error: string };

/** What kind of key material `generateKeys()` should produce. */
export type KeygenRequest =
  | { kind: 'hmac'; bytes: 32 | 48 | 64 }
  | { kind: 'rsa'; modulus: 2048 | 3072 | 4096 }
  | { kind: 'ec'; curve: 'P-256' | 'P-384' | 'P-521' }
  | { kind: 'ed25519' };

/** Generated key material; asymmetric kinds carry PEM + JWK, HMAC a secret. */
export type KeygenResult =
  | {
      ok: true;
      /** base64url random secret (HMAC only). */
      secretB64u?: string;
      /** SPKI public key PEM (asymmetric kinds). */
      publicPem?: string;
      /** PKCS8 private key PEM (asymmetric kinds). */
      privatePem?: string;
      /** Public JWK, pretty-printed JSON (asymmetric kinds). */
      publicJwk?: string;
      /** Private JWK, pretty-printed JSON (asymmetric kinds). */
      privateJwk?: string;
    }
  | { ok: false; error: string };

/** A runnable example for the picker. */
export interface JwtExample {
  id: string;
  label: string;
  /** The compact JWT string. */
  token: string;
  /** Optional matching secret / public key — fills the key field when picked. */
  key?: string;
}

/**
 * JWT Decoder & Encoder — the JWS algorithm registry. One table maps every
 * supported `alg` to the Web Crypto parameters needed to import a key and to
 * sign/verify with it, so `sign.ts`, `keys.ts`, and the engine façade never
 * hand-roll per-algorithm switches.
 *
 * Notes that matter:
 *  - ES* (ECDSA): Web Crypto emits/accepts the raw r‖s concatenation, which is
 *    exactly the JWS signature format — no DER conversion anywhere.
 *  - ES512 pairs with curve P-521 (not P-512 — the curve really is 521 bits).
 *  - PS* (RSA-PSS): the JWA-mandated salt length equals the digest length in
 *    bytes (32/48/64), or verification of standards-compliant tokens fails.
 *  - EdDSA (Ed25519) is feature-detected at call sites: older browsers throw
 *    on importKey/generateKey, which callers surface as 'unsupported'.
 */
import type { JwsAlg } from './types';

export type AlgKind = 'hmac' | 'rsa' | 'pss' | 'ecdsa' | 'eddsa';
export type ShaName = 'SHA-256' | 'SHA-384' | 'SHA-512';

export interface AlgSpec {
  kind: AlgKind;
  hash: ShaName;
  /** ECDSA named curve (ES* only). */
  curve?: 'P-256' | 'P-384' | 'P-521';
  /** RSA-PSS salt length in bytes = digest length (PS* only). */
  saltLength?: 32 | 48 | 64;
}

export const ALGS: Record<JwsAlg, AlgSpec> = {
  HS256: { kind: 'hmac', hash: 'SHA-256' },
  HS384: { kind: 'hmac', hash: 'SHA-384' },
  HS512: { kind: 'hmac', hash: 'SHA-512' },
  RS256: { kind: 'rsa', hash: 'SHA-256' },
  RS384: { kind: 'rsa', hash: 'SHA-384' },
  RS512: { kind: 'rsa', hash: 'SHA-512' },
  PS256: { kind: 'pss', hash: 'SHA-256', saltLength: 32 },
  PS384: { kind: 'pss', hash: 'SHA-384', saltLength: 48 },
  PS512: { kind: 'pss', hash: 'SHA-512', saltLength: 64 },
  ES256: { kind: 'ecdsa', hash: 'SHA-256', curve: 'P-256' },
  ES384: { kind: 'ecdsa', hash: 'SHA-384', curve: 'P-384' },
  ES512: { kind: 'ecdsa', hash: 'SHA-512', curve: 'P-521' },
  EdDSA: { kind: 'eddsa', hash: 'SHA-512' },
};

/** True when `alg` is one of the thirteen supported JWS algorithms. */
export function isJwsAlg(alg: string): alg is JwsAlg {
  return Object.prototype.hasOwnProperty.call(ALGS, alg);
}

/**
 * The ordered list offered by the encoder's algorithm <select>. Deliberately
 * excludes `none` — this tool decodes unsecured tokens but never mints them.
 */
export const SIGNING_ALGS: readonly JwsAlg[] = [
  'HS256',
  'HS384',
  'HS512',
  'RS256',
  'RS384',
  'RS512',
  'PS256',
  'PS384',
  'PS512',
  'ES256',
  'ES384',
  'ES512',
  'EdDSA',
];

/** Web Crypto algorithm identifier for `importKey` (and `generateKey`). */
export function importParamsFor(
  alg: JwsAlg,
): HmacImportParams | RsaHashedImportParams | EcKeyImportParams | { name: 'Ed25519' } {
  const spec = ALGS[alg];
  switch (spec.kind) {
    case 'hmac':
      return { name: 'HMAC', hash: spec.hash };
    case 'rsa':
      return { name: 'RSASSA-PKCS1-v1_5', hash: spec.hash };
    case 'pss':
      return { name: 'RSA-PSS', hash: spec.hash };
    case 'ecdsa':
      return { name: 'ECDSA', namedCurve: spec.curve! };
    case 'eddsa':
      return { name: 'Ed25519' };
  }
}

/** Web Crypto algorithm identifier for `sign` / `verify`. */
export function signParamsFor(
  alg: JwsAlg,
): AlgorithmIdentifier | RsaPssParams | EcdsaParams {
  const spec = ALGS[alg];
  switch (spec.kind) {
    case 'hmac':
      return 'HMAC';
    case 'rsa':
      return 'RSASSA-PKCS1-v1_5';
    case 'pss':
      return { name: 'RSA-PSS', saltLength: spec.saltLength! };
    case 'ecdsa':
      return { name: 'ECDSA', hash: spec.hash };
    case 'eddsa':
      return 'Ed25519';
  }
}

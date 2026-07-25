/**
 * JWT Decoder & Encoder — security lint. Pure advisory checks over a decoded
 * token (and over HMAC secrets at verify/sign time). Warnings never block
 * anything; they render in the decoder's Warnings block.
 *
 * The alg:"none" and missing-exp wordings predate this module (they lived in
 * engine.decode) and are kept intact — tests assert on their key phrases.
 */
import type { JwsAlg } from './types';
import { ALGS } from './algs';

const YEAR_MS = 365 * 24 * 60 * 60 * 1000;
/** Common proxy/header ceilings start biting around 8 KB. */
const SIZE_LIMIT = 8192;

/**
 * RFC 7515 §4.1.11 advisory — shared by decode()'s lint AND verify(), so a
 * caller acting on `verify()` alone still learns that a crit extension makes
 * "signature is valid" insufficient to trust the token.
 */
export const CRIT_WARNING =
  'Header has a crit parameter: verifiers MUST reject the token unless they understand every listed extension (RFC 7515 §4.1.11).';

/** Advisory warnings for one decoded token. Returns [] when all is calm. */
export function lintToken(
  header: Record<string, unknown>,
  payload: Record<string, unknown>,
  tokenLength: number,
  nowMs: number,
): string[] {
  const warnings: string[] = [];

  const alg = header.alg !== undefined ? String(header.alg) : undefined;
  if (alg && alg.toLowerCase() === 'none') {
    warnings.push(
      'Header alg is "none": this token is unsigned. Never trust an unsecured JWT in production.',
    );
  }

  if (!('exp' in payload)) {
    warnings.push('No exp claim: this token has no expiry and is valid indefinitely.');
  } else {
    const exp = Number(payload.exp);
    if (Number.isFinite(exp) && exp * 1000 > nowMs + YEAR_MS) {
      warnings.push(
        'Long-lived token: exp is more than a year away. Short expiries limit the damage of a leaked token.',
      );
    }
  }

  if ('typ' in header) {
    const typ = String(header.typ);
    if (typ.toUpperCase() !== 'JWT' && typ.toLowerCase() !== 'at+jwt') {
      warnings.push(
        `Header typ is "${typ}" — most libraries expect "JWT"; make sure your consumers agree.`,
      );
    }
  }

  if ('crit' in header) {
    warnings.push(CRIT_WARNING);
  }

  if (tokenLength > SIZE_LIMIT) {
    warnings.push(
      `Large token (${(tokenLength / 1024).toFixed(1)} KB): many proxies and servers cap headers near 8 KB — trim the payload.`,
    );
  }

  return warnings;
}

/**
 * RFC 7518 §3.2: an HMAC key must be at least as long as the hash output.
 * Returns a warning for a too-short HS* secret, else null. `byteLength` is
 * the decoded length when the secret was base64url, else the UTF-8 length.
 */
export function lintSecret(byteLength: number, alg: JwsAlg): string | null {
  const spec = ALGS[alg];
  if (spec.kind !== 'hmac') return null;
  const min = spec.hash === 'SHA-256' ? 32 : spec.hash === 'SHA-384' ? 48 : 64;
  if (byteLength >= min) return null;
  return `Weak secret: ${alg} secrets should be at least ${min} bytes (RFC 7518 §3.2) — this one is ${byteLength}.`;
}

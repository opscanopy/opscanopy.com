/**
 * JWT Decoder — engine. Decodes a compact JWS (the `header.payload.signature`
 * form) entirely client-side: it base64url-decodes the header and payload,
 * pretty-prints both, and renders the registered claims (iss/sub/aud/exp/nbf/
 * iat/jti) with a UTC date and a freshness status for the time-based ones.
 *
 * `decode` is PURE + browser-safe and NEVER throws on user input — malformed
 * segments, bad base64, or invalid JSON all yield { valid:false, error }.
 *
 * `verify` checks the signature with the Web Crypto API (globalThis.crypto):
 * HS256/384/512 via HMAC, RS256/384/512 via an RSASSA-PKCS1-v1_5 SPKI public
 * key. Anything it cannot check returns 'unsupported'; any thrown error inside
 * is caught and reported as 'error'. It decodes NOTHING it has not already
 * validated through `decode`, so it is safe to call on arbitrary strings.
 */
import type { ClaimRow, ClaimTone, JwtResult, VerifyResult } from './types';

const ERR_EMPTY = 'Paste a JWT — three base64url segments joined by dots (header.payload.signature).';
const ERR_PARTS = 'A JWT must have exactly three dot-separated parts: header.payload.signature.';
const ERR_HEADER = 'The header is not valid base64url-encoded JSON.';
const ERR_PAYLOAD = 'The payload is not valid base64url-encoded JSON.';

/** Stable failure shape so callers can always read `.claims` / `.warnings`. */
function bad(error: string): JwtResult {
  return { valid: false, error, claims: [], warnings: [] };
}

/**
 * Decode one base64url segment to a UTF-8 string. Re-pads to a multiple of 4,
 * maps the URL-safe alphabet (-_) back to standard (+/), then decodes the bytes
 * and runs them through TextDecoder so multi-byte claims survive. Returns null
 * on any malformed input (never throws).
 */
function decodeSegment(seg: string): string | null {
  if (!/^[A-Za-z0-9_-]*$/.test(seg)) return null;
  const std = seg.replace(/-/g, '+').replace(/_/g, '/');
  const padded = std + '='.repeat((4 - (std.length % 4)) % 4);
  try {
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  } catch {
    return null;
  }
}

/** Parse one segment as JSON, returning null on bad base64 or bad JSON. */
function parseJsonSegment(seg: string): unknown | null {
  const text = decodeSegment(seg);
  if (text === null) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** Format an epoch-seconds number as "YYYY-MM-DD HH:MM:SS UTC", or null if NaN. */
function utcFromEpoch(secs: number): string | null {
  if (!Number.isFinite(secs)) return null;
  const d = new Date(secs * 1000);
  if (Number.isNaN(d.getTime())) return null;
  const p = (n: number, w = 2) => String(n).padStart(w, '0');
  return (
    `${p(d.getUTCFullYear(), 4)}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ` +
    `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())} UTC`
  );
}

/** Render an `aud` claim, which may be a single string or an array of strings. */
function formatAud(aud: unknown): string {
  if (Array.isArray(aud)) return aud.map((a) => String(a)).join(', ');
  return String(aud);
}

/**
 * Build the registered-claim rows in canonical order. For exp/nbf/iat the value
 * shows the raw number AND its UTC date; exp/nbf additionally carry a freshness
 * tone computed against `nowMs`.
 */
function buildClaims(payload: Record<string, unknown>, nowMs: number): ClaimRow[] {
  const rows: ClaimRow[] = [];
  const nowSecs = nowMs / 1000;

  if ('iss' in payload) {
    rows.push({ label: 'Issuer (iss)', value: String(payload.iss), mono: true });
  }
  if ('sub' in payload) {
    rows.push({ label: 'Subject (sub)', value: String(payload.sub), mono: true });
  }
  if ('aud' in payload) {
    rows.push({ label: 'Audience (aud)', value: formatAud(payload.aud), mono: true });
  }

  if ('exp' in payload) {
    const n = Number(payload.exp);
    const date = utcFromEpoch(n);
    let tone: ClaimTone = 'ok';
    let suffix = '';
    if (Number.isFinite(n) && n * 1000 < nowMs) {
      tone = 'error';
      suffix = ' (expired)';
    }
    rows.push({
      label: 'Expires (exp)',
      value: date ? `${payload.exp} · ${date}${suffix}` : String(payload.exp),
      mono: true,
      tone,
    });
  }

  if ('nbf' in payload) {
    const n = Number(payload.nbf);
    const date = utcFromEpoch(n);
    let tone: ClaimTone = 'ok';
    let suffix = '';
    if (Number.isFinite(n) && n > nowSecs) {
      tone = 'warn';
      suffix = ' (not yet valid)';
    }
    rows.push({
      label: 'Not before (nbf)',
      value: date ? `${payload.nbf} · ${date}${suffix}` : String(payload.nbf),
      mono: true,
      tone,
    });
  }

  if ('iat' in payload) {
    const date = utcFromEpoch(Number(payload.iat));
    rows.push({
      label: 'Issued at (iat)',
      value: date ? `${payload.iat} · ${date}` : String(payload.iat),
      mono: true,
    });
  }

  if ('jti' in payload) {
    rows.push({ label: 'JWT ID (jti)', value: String(payload.jti), mono: true });
  }

  return rows;
}

/**
 * Decode (do NOT verify) a compact JWT. Splits on ".", requires exactly three
 * parts, base64url-decodes and JSON-parses the header and payload, then surfaces
 * the alg/typ, pretty-printed JSON, registered claims, and warnings. Never throws.
 */
export function decode(token: string, nowMs?: number): JwtResult {
  const s = (token ?? '').trim();
  if (s.length === 0) return bad(ERR_EMPTY);

  const parts = s.split('.');
  if (parts.length !== 3) return bad(ERR_PARTS);

  const [headerSeg, payloadSeg, signatureB64] = parts;

  const headerObj = parseJsonSegment(headerSeg);
  if (headerObj === null || typeof headerObj !== 'object') return bad(ERR_HEADER);

  const payloadObj = parseJsonSegment(payloadSeg);
  if (payloadObj === null || typeof payloadObj !== 'object') return bad(ERR_PAYLOAD);

  const header = headerObj as Record<string, unknown>;
  const payload = payloadObj as Record<string, unknown>;

  const alg = header.alg !== undefined ? String(header.alg) : undefined;
  const typ = header.typ !== undefined ? String(header.typ) : undefined;

  const now = nowMs ?? Date.now();
  const claims = buildClaims(payload, now);

  const warnings: string[] = [];
  if (alg && alg.toLowerCase() === 'none') {
    warnings.push(
      'Header alg is "none": this token is unsigned. Never trust an unsecured JWT in production.',
    );
  }
  if (!('exp' in payload)) {
    warnings.push('No exp claim: this token has no expiry and is valid indefinitely.');
  }

  return {
    valid: true,
    alg,
    typ,
    header: JSON.stringify(header, null, 2),
    payload: JSON.stringify(payload, null, 2),
    signatureB64,
    claims,
    warnings,
  };
}

// ── Signature verification (async, Web Crypto) ──────────────────────────────

/** base64url string -> Uint8Array of its bytes, or null on malformed input. */
function b64uToBytes(seg: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]*$/.test(seg)) return null;
  const std = seg.replace(/-/g, '+').replace(/_/g, '/');
  const padded = std + '='.repeat((4 - (std.length % 4)) % 4);
  try {
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

/** Decode a PEM block body (between the BEGIN/END lines) to raw DER bytes. */
function pemToDer(pem: string): Uint8Array | null {
  const body = pem
    .replace(/-----BEGIN [^-]+-----/g, '')
    .replace(/-----END [^-]+-----/g, '')
    .replace(/\s+/g, '');
  try {
    const binary = atob(body);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

/** Map an HMAC alg to its SHA hash name, or null if not an HS* alg. */
function hmacHash(alg: string): string | null {
  switch (alg) {
    case 'HS256':
      return 'SHA-256';
    case 'HS384':
      return 'SHA-384';
    case 'HS512':
      return 'SHA-512';
    default:
      return null;
  }
}

/** Map an RSA alg to its SHA hash name, or null if not an RS* alg. */
function rsaHash(alg: string): string | null {
  switch (alg) {
    case 'RS256':
      return 'SHA-256';
    case 'RS384':
      return 'SHA-384';
    case 'RS512':
      return 'SHA-512';
    default:
      return null;
  }
}

/**
 * Verify a token's signature against a secret/key. Resolves (never rejects):
 *  - HS256/384/512: HMAC-verify "header.payload" with `secret` (UTF-8).
 *  - RS256/384/512: if `secret` is a PEM "BEGIN PUBLIC KEY", import it as SPKI
 *    and verify; otherwise 'unsupported' (we can't HMAC an RSA token).
 *  - any other alg, or no Web Crypto: 'unsupported'.
 *  - malformed token / key / runtime failure: 'error'.
 */
export async function verify(token: string, secret: string): Promise<VerifyResult> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    return { status: 'unsupported', detail: 'Web Crypto is unavailable in this environment.' };
  }

  const s = (token ?? '').trim();
  const parts = s.split('.');
  if (parts.length !== 3) {
    return { status: 'error', detail: 'Not a three-part JWT; nothing to verify.' };
  }
  const [headerSeg, payloadSeg, signatureSeg] = parts;

  const headerObj = parseJsonSegment(headerSeg);
  if (headerObj === null || typeof headerObj !== 'object') {
    return { status: 'error', detail: 'The header could not be decoded.' };
  }
  const alg = String((headerObj as Record<string, unknown>).alg ?? '');

  const signingInput = new TextEncoder().encode(`${headerSeg}.${payloadSeg}`);
  const signature = b64uToBytes(signatureSeg);
  if (signature === null) {
    return { status: 'error', detail: 'The signature segment is not valid base64url.' };
  }

  try {
    const hmac = hmacHash(alg);
    if (hmac) {
      const key = await subtle.importKey(
        'raw',
        new TextEncoder().encode(secret ?? ''),
        { name: 'HMAC', hash: hmac },
        false,
        ['verify'],
      );
      const ok = await subtle.verify('HMAC', key, signature, signingInput);
      return ok
        ? { status: 'valid', detail: `Signature is valid for ${alg}.` }
        : { status: 'invalid', detail: `Signature does not match for ${alg}.` };
    }

    const rsa = rsaHash(alg);
    if (rsa) {
      if (!/-----BEGIN PUBLIC KEY-----/.test(secret ?? '')) {
        return {
          status: 'unsupported',
          detail: `${alg} needs a PEM public key (-----BEGIN PUBLIC KEY-----) to verify.`,
        };
      }
      const der = pemToDer(secret);
      if (der === null) return { status: 'error', detail: 'The PEM public key could not be parsed.' };
      const key = await subtle.importKey(
        'spki',
        der,
        { name: 'RSASSA-PKCS1-v1_5', hash: rsa },
        false,
        ['verify'],
      );
      const ok = await subtle.verify('RSASSA-PKCS1-v1_5', key, signature, signingInput);
      return ok
        ? { status: 'valid', detail: `Signature is valid for ${alg}.` }
        : { status: 'invalid', detail: `Signature does not match for ${alg}.` };
    }

    return {
      status: 'unsupported',
      detail: alg
        ? `Verifying ${alg} is not supported here (only HS256/384/512 and RS256/384/512).`
        : 'No alg in the header; cannot verify.',
    };
  } catch {
    return { status: 'error', detail: 'Verification failed — check the secret or key format.' };
  }
}

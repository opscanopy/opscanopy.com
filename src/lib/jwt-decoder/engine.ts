/**
 * JWT Decoder & Encoder — the engine façade. Decodes a compact JWS (the
 * `header.payload.signature` form) entirely client-side, verifies signatures
 * across the full JWS matrix, signs new tokens, and generates key material.
 *
 * `decode` is PURE + browser-safe and NEVER throws on user input — malformed
 * segments, bad base64, or invalid JSON all yield { valid:false, error }. Its
 * claims table carries plain-English captions and its warnings come from the
 * security lint (`lint.ts`).
 *
 * `verify` checks the signature with the Web Crypto API: HS256/384/512 via
 * HMAC (UTF-8 or base64url secret, or an oct JWK), RS256/384/512 (RSASSA-
 * PKCS1-v1_5), PS256/384/512 (RSA-PSS), ES256/384/512 (ECDSA — Web Crypto's
 * raw r‖s IS the JWS format), and EdDSA (Ed25519, feature-detected). Keys may
 * be a shared secret, SPKI PEM, JWK, or JWKS (kid-matched; otherwise every
 * compatible key is tried). Anything it cannot check returns 'unsupported';
 * any thrown error inside is caught and reported as 'error'.
 *
 * `sign` (see sign.ts) and `generateKeys` (see keygen.ts) are re-exported so
 * the playground imports one module.
 */
import type { ClaimRow, ClaimTone, Freshness, JwtResult, VerifyOptions, VerifyResult } from './types';
import { relative } from '../relative-time';
import { isJwsAlg, signParamsFor } from './algs';
import {
  b64uToBytes,
  classifyKeyInput,
  importJwkFor,
  importKeyFor,
  jwksCandidates,
} from './keys';
import { CRIT_WARNING, lintSecret, lintToken } from './lint';

export { sign } from './sign';
export { generateKeys } from './keygen';
export { SIGNING_ALGS, isJwsAlg } from './algs';
export { edDsaSupported } from './keys';

const ERR_EMPTY = 'Paste a JWT — three base64url segments joined by dots (header.payload.signature).';

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
  const bytes = b64uToBytes(seg);
  if (bytes === null) return null;
  return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
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

/** One decoded header/payload segment, or the specific way it failed. */
type SegmentParse =
  | { ok: true; obj: Record<string, unknown> }
  | { ok: false; why: 'base64url' | 'json' | 'not-object'; detail: string };

/**
 * decode()'s segment parser: distinguishes bad base64url from bad JSON from
 * non-object JSON, naming the segment in each user-facing message (REQ-3).
 * verify() keeps the simpler parseJsonSegment — it only needs the object.
 */
function parseSegmentDetailed(seg: string, name: 'header' | 'payload'): SegmentParse {
  const text = decodeSegment(seg);
  if (text === null) {
    return { ok: false, why: 'base64url', detail: `The ${name} segment is not valid base64url.` };
  }
  try {
    const parsed = JSON.parse(text);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { ok: false, why: 'not-object', detail: `The ${name} decoded but is not a JSON object.` };
    }
    return { ok: true, obj: parsed as Record<string, unknown> };
  } catch (err) {
    const at = err instanceof SyntaxError ? ` (${err.message})` : '';
    return { ok: false, why: 'json', detail: `The ${name} decoded but isn't valid JSON${at}.` };
  }
}

/** Format an epoch-seconds number as "YYYY-MM-DD HH:MM:SS UTC", or null if NaN. */
function utcFromEpoch(secs: number): string | null {
  if (!Number.isFinite(secs)) return null;
  const d = new Date(secs * 1000);
  if (Number.isNaN(d.getTime())) return null;
  const p = (n: number, w = 2) => String(n).padStart(w, '0');
  // padStart would pad in front of a minus sign ("-6" → "00-6"), so negative
  // years (absurd but reachable via a crafted epoch) format their sign apart.
  const y = d.getUTCFullYear();
  const year = y < 0 ? `-${String(-y).padStart(4, '0')}` : String(y).padStart(4, '0');
  return (
    `${year}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ` +
    `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())} UTC`
  );
}

/** Render an `aud` claim, which may be a single string or an array of strings. */
function formatAud(aud: unknown): string {
  if (Array.isArray(aud)) return aud.map((a) => String(a)).join(', ');
  return String(aud);
}

/**
 * RFC 7519 NumericDate: MUST be a JSON number. Numeric strings are tolerated
 * (some real-world issuers emit them) but never JS's wilder coercions —
 * null/true/[]/"" all Number()-coerce to a finite 0/1 and would otherwise
 * report a hard "Expired since 1970" verdict for a malformed claim.
 */
function numericDate(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
  return null;
}

/**
 * exp/nbf verdict for the status pill — independent of signature checks.
 * Precedence: expired > not-yet > valid; tokens with neither claim (or only
 * non-NumericDate ones) are 'none'. `utcFromEpoch` returns null past Date's
 * ±8.64e15 ms range, so every interpolation falls back to the raw epoch.
 */
function freshnessOf(payload: Record<string, unknown>, nowMs: number): Freshness {
  const exp = 'exp' in payload ? numericDate(payload.exp) : null;
  const nbf = 'nbf' in payload ? numericDate(payload.nbf) : null;
  if (exp === null && nbf === null) {
    return { state: 'none', detail: 'No exp or nbf claims — this token carries no time bounds.' };
  }
  if (exp !== null && exp * 1000 < nowMs) {
    return {
      state: 'expired',
      detail: `Expired ${relative(exp * 1000, nowMs)} (exp ${utcFromEpoch(exp) ?? exp})`,
    };
  }
  if (nbf !== null && nbf * 1000 > nowMs) {
    return {
      state: 'not-yet',
      detail: `Not valid until ${utcFromEpoch(nbf) ?? nbf} (${relative(nbf * 1000, nowMs)})`,
    };
  }
  return {
    state: 'valid',
    detail:
      exp !== null
        ? `Expires ${relative(exp * 1000, nowMs)} (exp ${utcFromEpoch(exp) ?? exp})`
        : 'No expiry set; nbf has passed.',
  };
}

/**
 * Build the registered-claim rows in canonical order, each with a muted
 * plain-English caption. For exp/nbf/iat the value shows the raw number AND
 * its UTC date; exp/nbf additionally carry a freshness tone against `nowMs`.
 */
function buildClaims(payload: Record<string, unknown>, nowMs: number): ClaimRow[] {
  const rows: ClaimRow[] = [];
  const nowSecs = nowMs / 1000;

  if ('iss' in payload) {
    rows.push({
      label: 'Issuer (iss)',
      value: String(payload.iss),
      mono: true,
      caption: 'Who minted the token — usually your auth server.',
    });
  }
  if ('sub' in payload) {
    rows.push({
      label: 'Subject (sub)',
      value: String(payload.sub),
      mono: true,
      caption: 'Whom the token is about — the user or principal ID.',
    });
  }
  if ('aud' in payload) {
    rows.push({
      label: 'Audience (aud)',
      value: formatAud(payload.aud),
      mono: true,
      caption: 'Who should accept it — the API(s) this token was minted for.',
    });
  }

  if ('exp' in payload) {
    const n = numericDate(payload.exp) ?? NaN;
    const date = utcFromEpoch(n);
    let tone: ClaimTone = 'ok';
    let suffix = '';
    if (Number.isFinite(n)) {
      // Relative phrasing reads faster than the UTC instant (REQ-4);
      // the strict < keeps exp === now on the not-expired side.
      suffix =
        n * 1000 < nowMs
          ? ` (expired ${relative(n * 1000, nowMs)})`
          : ` (expires ${relative(n * 1000, nowMs)})`;
      if (n * 1000 < nowMs) tone = 'error';
    }
    rows.push({
      label: 'Expires (exp)',
      value: date ? `${payload.exp} · ${date}${suffix}` : String(payload.exp),
      mono: true,
      tone,
      caption: 'The instant the token stops being valid.',
    });
  }

  if ('nbf' in payload) {
    const n = numericDate(payload.nbf) ?? NaN;
    const date = utcFromEpoch(n);
    let tone: ClaimTone = 'ok';
    let suffix = '';
    if (Number.isFinite(n) && n > nowSecs) {
      tone = 'warn';
      suffix = ` (not yet valid — ${relative(n * 1000, nowMs)})`;
    }
    rows.push({
      label: 'Not before (nbf)',
      value: date ? `${payload.nbf} · ${date}${suffix}` : String(payload.nbf),
      mono: true,
      tone,
      caption: 'The token must not be accepted before this instant.',
    });
  }

  if ('iat' in payload) {
    const n = numericDate(payload.iat) ?? NaN;
    const date = utcFromEpoch(n);
    const suffix = Number.isFinite(n) ? ` (${relative(n * 1000, nowMs)})` : '';
    rows.push({
      label: 'Issued at (iat)',
      value: date ? `${payload.iat} · ${date}${suffix}` : String(payload.iat),
      mono: true,
      caption: 'When the token was created.',
    });
  }

  if ('jti' in payload) {
    rows.push({
      label: 'JWT ID (jti)',
      value: String(payload.jti),
      mono: true,
      caption: 'Unique token ID — handy for revocation lists.',
    });
  }

  return rows;
}

/**
 * Decode (do NOT verify) a compact JWT. Splits on ".", requires exactly three
 * parts, base64url-decodes and JSON-parses the header and payload, then surfaces
 * the alg/typ, pretty-printed JSON, registered claims, and lint warnings.
 * Never throws.
 */
export function decode(token: string, nowMs?: number): JwtResult {
  const s = (token ?? '').trim();
  if (s.length === 0) return bad(ERR_EMPTY);

  const parts = s.split('.');
  if (parts.length !== 3) {
    return bad(
      `This doesn't look like a JWT — expected 3 dot-separated parts (header.payload.signature), found ${parts.length}.`,
    );
  }

  const [headerSeg, payloadSeg, signatureB64] = parts;

  // RFC 7519: header and payload MUST be JSON objects (arrays are not).
  const headerParse = parseSegmentDetailed(headerSeg, 'header');
  if (!headerParse.ok) return bad(headerParse.detail);

  const payloadParse = parseSegmentDetailed(payloadSeg, 'payload');
  if (!payloadParse.ok) {
    // The header DID decode — surface it so the UI can render a partial
    // result next to the payload's specific error (REQ-3).
    return {
      ...bad(payloadParse.detail),
      partial: {
        header: JSON.stringify(headerParse.obj, null, 2),
        alg: typeof headerParse.obj.alg === 'string' ? headerParse.obj.alg : undefined,
        failedSegment: 'payload',
        segmentError: payloadParse.detail,
      },
    };
  }

  const header = headerParse.obj;
  const payload = payloadParse.obj;

  const alg = header.alg !== undefined ? String(header.alg) : undefined;
  const typ = header.typ !== undefined ? String(header.typ) : undefined;

  const now = nowMs ?? Date.now();

  return {
    valid: true,
    alg,
    typ,
    header: JSON.stringify(header, null, 2),
    payload: JSON.stringify(payload, null, 2),
    signatureB64,
    claims: buildClaims(payload, now),
    warnings: lintToken(header, payload, s.length, now),
    freshness: freshnessOf(payload, now),
  };
}

// ── Signature verification (async, Web Crypto) ──────────────────────────────

/** The one-line list of algorithms shown in "unsupported" details. */
const SUPPORTED_LIST = 'HS/RS/PS/ES 256-512 and EdDSA (Ed25519)';

/**
 * Verify a token's signature against pasted key material. Resolves (never
 * rejects):
 *  - HS*: HMAC with a shared secret (UTF-8, or base64url when
 *    `opts.secretBase64url`), an oct JWK, or an oct JWKS entry.
 *  - RS, PS, ES, EdDSA: a PEM "BEGIN PUBLIC KEY" (SPKI), a JWK (private JWKs
 *    are stripped to their public part), or a JWKS — kid-matched when the
 *    header has one, otherwise every compatible key is tried.
 *  - alg "none", unknown algs, wrong key *category*, or a runtime without the
 *    needed primitive: 'unsupported'.
 *  - malformed token / key / runtime failure: 'error'.
 * A weak HS* secret adds a `warning` (RFC 7518 §3.2) without blocking.
 */
export async function verify(
  token: string,
  keyInput: string,
  opts?: VerifyOptions,
): Promise<VerifyResult> {
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
  if (headerObj === null || typeof headerObj !== 'object' || Array.isArray(headerObj)) {
    return { status: 'error', detail: 'The header could not be decoded.' };
  }
  const header = headerObj as Record<string, unknown>;
  const alg = String(header.alg ?? '');

  if (alg.toLowerCase() === 'none') {
    return {
      status: 'unsupported',
      detail: 'This token is unsigned (alg "none") — there is no signature to verify.',
    };
  }
  if (!isJwsAlg(alg)) {
    return {
      status: 'unsupported',
      detail: alg
        ? `Verifying ${alg} is not supported here (${SUPPORTED_LIST}).`
        : 'No alg in the header; cannot verify.',
    };
  }

  const signingInput = new TextEncoder().encode(`${headerSeg}.${payloadSeg}`);
  const signature = b64uToBytes(signatureSeg);
  if (signature === null) {
    return { status: 'error', detail: 'The signature segment is not valid base64url.' };
  }

  const kid = typeof header.kid === 'string' ? header.kid : undefined;
  const params = signParamsFor(alg);

  // Advisories that ride along with the verdict without blocking it: an
  // unrecognized crit extension (RFC 7515 §4.1.11 — a valid signature alone
  // must not be trusted) and a weak HS* secret (RFC 7518 §3.2).
  const warningParts: string[] = [];
  if ('crit' in header) warningParts.push(CRIT_WARNING);
  if (classifyKeyInput(keyInput) === 'secret') {
    const byteLength = opts?.secretBase64url
      ? (b64uToBytes(keyInput.trim())?.length ?? 0)
      : new TextEncoder().encode(keyInput ?? '').length;
    const weak = lintSecret(byteLength, alg);
    if (weak) warningParts.push(weak);
  }
  const warning = warningParts.length > 0 ? warningParts.join(' ') : undefined;

  try {
    // A pasted JWKS with no kid match gets every compatible key tried in
    // order — one valid signature wins; import failures are kept as context.
    if (classifyKeyInput(keyInput) === 'jwks') {
      const cands = jwksCandidates(keyInput, alg, kid);
      if (!cands.ok) return { status: 'error', detail: cands.reason };
      let lastReason = '';
      let tried = 0;
      for (const jwk of cands.jwks) {
        const imported = await importJwkFor(alg, jwk, 'verify');
        if (!imported.ok) {
          lastReason = imported.reason;
          if (imported.unsupported) return { status: 'unsupported', detail: imported.reason };
          continue;
        }
        tried++;
        const ok = await subtle.verify(params, imported.key, signature as BufferSource, signingInput);
        if (ok) {
          const which = cands.matchedKid
            ? `the JWKS key with kid "${cands.matchedKid}"`
            : typeof jwk.kid === 'string'
              ? `the JWKS key with kid "${jwk.kid}"`
              : 'a JWKS key';
          return { status: 'valid', detail: `Signature is valid for ${alg} using ${which}.`, warning };
        }
      }
      if (tried === 0) {
        return { status: 'error', detail: lastReason || 'No key in the JWKS could be imported.' };
      }
      return {
        status: 'invalid',
        detail: `Signature does not match any of the ${tried} candidate key${tried === 1 ? '' : 's'} in the JWKS.`,
        warning,
      };
    }

    const imported = await importKeyFor(alg, keyInput, 'verify', {
      secretBase64url: opts?.secretBase64url,
      kid,
    });
    if (!imported.ok) {
      return { status: imported.unsupported ? 'unsupported' : 'error', detail: imported.reason };
    }
    const ok = await subtle.verify(params, imported.key, signature as BufferSource, signingInput);
    if (ok) {
      const via = imported.note ? ` ${imported.note}` : '';
      return { status: 'valid', detail: `Signature is valid for ${alg}.${via}`, warning };
    }
    return { status: 'invalid', detail: `Signature does not match for ${alg}.`, warning };
  } catch {
    return { status: 'error', detail: 'Verification failed — check the secret or key format.' };
  }
}

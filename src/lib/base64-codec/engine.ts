/**
 * Base64 Encoder / Decoder — engine. Converts text <-> base64 entirely in the
 * browser (and in Node), with optional url-safe output. Encoding runs text
 * through TextEncoder to UTF-8 bytes, then a manual alphabet table so multibyte
 * input round-trips faithfully; decoding accepts BOTH the standard and url-safe
 * alphabets (mapping -/_ back to +/ and re-padding to a multiple of 4) before
 * validating and running the bytes back through TextDecoder.
 *
 * Pure + browser-safe: no Buffer, no btoa/atob dependency, never throws on user
 * input — bad input returns { valid:false, error } so callers can render a
 * friendly message.
 */
import type { Base64Mode, Base64Result } from './types';

const STD = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

const ERR_EMPTY_ENCODE = 'Enter some text to encode, e.g. hello world.';
const ERR_EMPTY_DECODE = 'Enter base64 to decode, e.g. aGVsbG8gd29ybGQ=.';
const ERR_NOT_BASE64 =
  'That is not valid base64 — it contains characters outside the base64 alphabet.';
const ERR_BAD_LENGTH = 'That base64 is malformed — its length is not a valid encoding.';

/** Reverse lookup table: char code -> 6-bit value, or -1 for non-alphabet bytes. */
const DECODE_MAP: Int8Array = (() => {
  const m = new Int8Array(128).fill(-1);
  for (let i = 0; i < STD.length; i++) m[STD.charCodeAt(i)] = i;
  return m;
})();

function bad(error: string): Base64Result {
  return { valid: false, error, output: '' };
}

/** Base64-encode raw bytes with the standard alphabet (padded). */
function bytesToBase64(bytes: Uint8Array): string {
  let out = '';
  let i = 0;
  for (; i + 3 <= bytes.length; i += 3) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    out += STD[(n >> 18) & 63] + STD[(n >> 12) & 63] + STD[(n >> 6) & 63] + STD[n & 63];
  }
  const rem = bytes.length - i;
  if (rem === 1) {
    const n = bytes[i] << 16;
    out += STD[(n >> 18) & 63] + STD[(n >> 12) & 63] + '==';
  } else if (rem === 2) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8);
    out += STD[(n >> 18) & 63] + STD[(n >> 12) & 63] + STD[(n >> 6) & 63] + '=';
  }
  return out;
}

/**
 * Decode a standard-alphabet, properly-padded base64 string to bytes.
 * Returns null on any malformed input (never throws).
 */
function base64ToBytes(s: string): Uint8Array | null {
  if (s.length % 4 !== 0) return null;
  const groups = s.length / 4;
  // Count trailing '=' padding (0, 1 or 2; only allowed in the final group).
  let pad = 0;
  if (s.length >= 1 && s[s.length - 1] === '=') pad++;
  if (s.length >= 2 && s[s.length - 2] === '=') pad++;

  const outLen = groups * 3 - pad;
  const out = new Uint8Array(outLen > 0 ? outLen : 0);
  let o = 0;

  for (let i = 0; i < s.length; i += 4) {
    const last = i + 4 >= s.length;
    const c0 = s.charCodeAt(i);
    const c1 = s.charCodeAt(i + 1);
    const c2 = s.charCodeAt(i + 2);
    const c3 = s.charCodeAt(i + 3);

    const v0 = c0 < 128 ? DECODE_MAP[c0] : -1;
    const v1 = c1 < 128 ? DECODE_MAP[c1] : -1;
    // '=' (61) is only valid as padding in the last group's 3rd/4th slot.
    const isPad2 = last && c2 === 61;
    const isPad3 = last && c3 === 61;
    const v2 = isPad2 ? 0 : c2 < 128 ? DECODE_MAP[c2] : -1;
    const v3 = isPad3 ? 0 : c3 < 128 ? DECODE_MAP[c3] : -1;

    if (v0 < 0 || v1 < 0 || v2 < 0 || v3 < 0) return null;
    // A single padded slot (c3='=') is fine; c2='=' requires c3='=' too.
    if (isPad2 && !isPad3) return null;

    const n = (v0 << 18) | (v1 << 12) | (v2 << 6) | v3;
    if (o < outLen) out[o++] = (n >> 16) & 255;
    if (o < outLen) out[o++] = (n >> 8) & 255;
    if (o < outLen) out[o++] = n & 255;
  }
  return out;
}

export function convert(input: string, mode: Base64Mode, urlSafe: boolean): Base64Result {
  const raw = input ?? '';

  if (mode === 'encode') {
    if (raw.length === 0) return bad(ERR_EMPTY_ENCODE);
    const bytes = new TextEncoder().encode(raw);
    let output = bytesToBase64(bytes);
    let note: string | undefined;
    if (urlSafe) {
      output = output.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
      note = 'URL-safe: + and / mapped to - and _, padding stripped.';
    }
    return { valid: true, output, bytes: bytes.length, note };
  }

  // ── decode ─────────────────────────────────────────────────────────────────
  // Drop ASCII whitespace (newlines from wrapped base64 are common); keep the
  // rest so genuinely invalid characters are still reported.
  const stripped = raw.replace(/[\r\n\t ]+/g, '');
  if (stripped.length === 0) return bad(ERR_EMPTY_DECODE);

  // Accept either alphabet: normalise url-safe chars back to standard.
  const sawUrlSafe = /[-_]/.test(stripped);
  let s = stripped.replace(/-/g, '+').replace(/_/g, '/');

  // Re-pad to a multiple of 4 if padding was stripped (common for url-safe).
  let repadded = false;
  const mod = s.length % 4;
  if (mod === 1) return bad(ERR_BAD_LENGTH);
  if (mod === 2) {
    s += '==';
    repadded = true;
  } else if (mod === 3) {
    s += '=';
    repadded = true;
  }

  const bytes = base64ToBytes(s);
  if (bytes === null) {
    return bad(/^[A-Za-z0-9+/=]*$/.test(s) ? ERR_BAD_LENGTH : ERR_NOT_BASE64);
  }

  // fatal:false — invalid UTF-8 sequences become U+FFFD rather than throwing.
  const output = new TextDecoder('utf-8', { fatal: false }).decode(bytes);

  const notes: string[] = [];
  if (sawUrlSafe) notes.push('url-safe input detected');
  if (repadded) notes.push('padding restored');
  const note = notes.length ? notes.join('; ') + '.' : undefined;

  return { valid: true, output, bytes: bytes.length, note };
}

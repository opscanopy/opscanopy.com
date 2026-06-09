/**
 * Hash Generator — engine. UTF-8 encodes the input and renders four digests:
 * MD5 (implemented here in pure TypeScript, since SubtleCrypto omits it) plus
 * SHA-1, SHA-256 and SHA-512 from globalThis.crypto.subtle. `hmac()` keys one
 * of the SHA family with a raw UTF-8 key.
 *
 * Async (SubtleCrypto returns Promises) + browser-safe; never throws on user
 * input — any failure (e.g. a missing/locked crypto in an insecure context) is
 * caught and returned as { valid:false, error } so callers can render a message.
 */
import type { HashResult, HashRow, HmacAlgo } from './types';

const ERR_DIGEST =
  'Could not compute hashes — the Web Crypto API is unavailable (this page must be served over HTTPS or localhost).';

const utf8 = new TextEncoder();

function bad(error: string): HashResult {
  return { valid: false, error, rows: [] };
}

/** Render an ArrayBuffer / byte array as lowercase hexadecimal. */
function toHex(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let out = '';
  for (let i = 0; i < view.length; i++) out += view[i].toString(16).padStart(2, '0');
  return out;
}

/** SubtleCrypto digest -> lowercase hex. `algo` is a SubtleCrypto name. */
async function subtleHex(algo: 'SHA-1' | 'SHA-256' | 'SHA-512', data: Uint8Array): Promise<string> {
  const buf = await globalThis.crypto.subtle.digest(algo, data);
  return toHex(buf);
}

/**
 * Compute MD5, SHA-1, SHA-256 and SHA-512 of `input` (UTF-8) and return one
 * monospaced row per algorithm. Empty input is valid — its digests are
 * well-defined (e.g. MD5("") = d41d8cd98f00b204e9800998ecf8427e).
 */
export async function hash(input: string): Promise<HashResult> {
  const data = utf8.encode(input ?? '');
  try {
    const [sha1, sha256, sha512] = await Promise.all([
      subtleHex('SHA-1', data),
      subtleHex('SHA-256', data),
      subtleHex('SHA-512', data),
    ]);
    const rows: HashRow[] = [
      { label: 'MD5', value: md5Hex(data), mono: true },
      { label: 'SHA-1', value: sha1, mono: true },
      { label: 'SHA-256', value: sha256, mono: true },
      { label: 'SHA-512', value: sha512, mono: true },
    ];
    return { valid: true, rows };
  } catch {
    return bad(ERR_DIGEST);
  }
}

/**
 * HMAC of `input` under `key`, both UTF-8, with the given SHA algorithm.
 * Returns lowercase hex. Never throws — on failure the rejected Promise is
 * surfaced by callers; this resolves only with a valid digest.
 */
export async function hmac(input: string, key: string, algo: HmacAlgo): Promise<string> {
  const cryptoKey = await globalThis.crypto.subtle.importKey(
    'raw',
    utf8.encode(key ?? ''),
    { name: 'HMAC', hash: algo },
    false,
    ['sign'],
  );
  const sig = await globalThis.crypto.subtle.sign('HMAC', cryptoKey, utf8.encode(input ?? ''));
  return toHex(sig);
}

// ── MD5 (RFC 1321) ──────────────────────────────────────────────────────────
// Pure, dependency-free, browser-safe MD5 over a byte array. SubtleCrypto does
// not provide MD5, so we implement it directly. Operates on 32-bit words with
// >>> 0 to stay in unsigned territory; output is lowercase hex.

/** Per-round left-rotate amounts (s) for MD5's four 16-step rounds. */
const MD5_S = [
  7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
  5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
  4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
  6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
];

/** Per-step additive constants K[i] = floor(2^32 * abs(sin(i + 1))). */
const MD5_K = (() => {
  const k = new Uint32Array(64);
  for (let i = 0; i < 64; i++) k[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 0x100000000) >>> 0;
  return k;
})();

function rotl32(x: number, c: number): number {
  return ((x << c) | (x >>> (32 - c))) >>> 0;
}

function md5Hex(message: Uint8Array): string {
  const a0 = 0x67452301;
  const b0 = 0xefcdab89;
  const c0 = 0x98badcfe;
  const d0 = 0x10325476;

  // ── Pad: append 0x80, then zeros, until length ≡ 56 (mod 64); append the
  //    original bit length as a 64-bit little-endian integer. ────────────────
  const origLen = message.length;
  const bitLen = origLen * 8;
  const withPadLen = (((origLen + 8) >>> 6) + 1) << 6; // multiple of 64, room for 0x80 + length
  const padded = new Uint8Array(withPadLen);
  padded.set(message);
  padded[origLen] = 0x80;
  // 64-bit little-endian bit length. JS bitwise is 32-bit, so split lo/hi.
  const loBits = bitLen >>> 0;
  const hiBits = Math.floor(bitLen / 0x100000000) >>> 0;
  padded[withPadLen - 8] = loBits & 0xff;
  padded[withPadLen - 7] = (loBits >>> 8) & 0xff;
  padded[withPadLen - 6] = (loBits >>> 16) & 0xff;
  padded[withPadLen - 5] = (loBits >>> 24) & 0xff;
  padded[withPadLen - 4] = hiBits & 0xff;
  padded[withPadLen - 3] = (hiBits >>> 8) & 0xff;
  padded[withPadLen - 2] = (hiBits >>> 16) & 0xff;
  padded[withPadLen - 1] = (hiBits >>> 24) & 0xff;

  let h0 = a0;
  let h1 = b0;
  let h2 = c0;
  let h3 = d0;

  const M = new Uint32Array(16);
  for (let chunk = 0; chunk < padded.length; chunk += 64) {
    // Read the 64-byte chunk as sixteen little-endian 32-bit words.
    for (let j = 0; j < 16; j++) {
      const i = chunk + j * 4;
      M[j] =
        (padded[i] |
          (padded[i + 1] << 8) |
          (padded[i + 2] << 16) |
          (padded[i + 3] << 24)) >>>
        0;
    }

    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;

    for (let i = 0; i < 64; i++) {
      let f: number;
      let g: number;
      if (i < 16) {
        f = (b & c) | (~b & d);
        g = i;
      } else if (i < 32) {
        f = (d & b) | (~d & c);
        g = (5 * i + 1) % 16;
      } else if (i < 48) {
        f = b ^ c ^ d;
        g = (3 * i + 5) % 16;
      } else {
        f = c ^ (b | ~d);
        g = (7 * i) % 16;
      }
      f = (f + a + MD5_K[i] + M[g]) >>> 0;
      a = d;
      d = c;
      c = b;
      b = (b + rotl32(f, MD5_S[i])) >>> 0;
    }

    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
  }

  // Output: the four words in little-endian byte order, lowercase hex.
  const out = new Uint8Array(16);
  const words = [h0, h1, h2, h3];
  for (let w = 0; w < 4; w++) {
    out[w * 4] = words[w] & 0xff;
    out[w * 4 + 1] = (words[w] >>> 8) & 0xff;
    out[w * 4 + 2] = (words[w] >>> 16) & 0xff;
    out[w * 4 + 3] = (words[w] >>> 24) & 0xff;
  }
  return toHex(out);
}

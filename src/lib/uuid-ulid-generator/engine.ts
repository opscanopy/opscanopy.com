/**
 * UUID / ULID Generator — pure client-side engine.
 *
 * Contracts (all functions are pure and NEVER throw):
 *
 *   generateUuidV4(opts): GenerateResult
 *     - Uses crypto.randomUUID() when available, else derives a v4 from
 *       crypto.getRandomValues(new Uint8Array(16)) with the version nibble set
 *       to 4 and the variant bits set to 10x, formatted 8-4-4-4-12 hex.
 *     - Applies the uppercase toggle.
 *     - Clamps count to [1, 1000]. Out-of-range / non-numeric count still
 *       returns a clamped batch plus an explanatory note — never throws.
 *     - Returns { valid:false, error } (never Math.random()) when no secure
 *       random source is available.
 *
 *   nilUuid(): string
 *     - The all-zero UUID '00000000-0000-0000-0000-000000000000'.
 *
 *   generateUlid(now = Date.now(), randomBytes?): UlidResult
 *     - Encodes a 48-bit millisecond timestamp (10 Crockford base32 chars) plus
 *       80 bits of randomness (16 chars) = 26 chars total.
 *     - Requires `now` to be a finite integer in [0, 2^48 − 1]; otherwise
 *       returns { valid:false, error }.
 *     - Default randomness is a secure crypto.getRandomValues(new Uint8Array(10));
 *       randomBytes is injectable for deterministic tests. Returns
 *       { valid:false, error } (never Math.random()) when no secure random
 *       source is available.
 *     - Crockford alphabet '0123456789ABCDEFGHJKMNPQRSTVWXYZ' (no I/L/O/U).
 *
 *   decodeUlidTime(ulid): number | null
 *     - Decodes the first 10 chars back to milliseconds.
 *     - Rejects overflow: a valid 48-bit-time ULID's first char is <= '7'
 *       (the top char only carries 3 significant bits); first char > '7' => null.
 *
 *   inspectUuid(input): InspectResult
 *     - Detects an 8-4-4-4-12 hex UUID => version (nibble 13) + variant
 *       (nibble 17 top bits: 10x = 'RFC 4122', 110x = 'Microsoft', 0xx = 'NCS').
 *     - Detects a 26-char Crockford string => decodes the embedded timestamp
 *       (rejecting overflow) to an ISO timestamp.
 *     - Bad input => { valid:false, error } — never throws.
 */
import type {
  GenerateOptions,
  GenerateResult,
  InspectResult,
  UlidResult,
} from './types';

/** Crockford base32 alphabet — excludes I, L, O and U to avoid ambiguity. */
const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

const NIL_UUID = '00000000-0000-0000-0000-000000000000';

const INSPECT_ERROR =
  'Not a UUID (expected 32 hex digits in 8-4-4-4-12 form) or a 26-character ULID.';

const HEX = '0123456789abcdef';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Largest millisecond timestamp a 48-bit ULID time component can hold. */
const MAX_ULID_TIME = 2 ** 48 - 1; // 281474976710655

const SECURE_RANDOM_ERROR =
  'A secure random source (Web Crypto) is unavailable in this browser, so no ' +
  'cryptographically random identifier can be generated. UUIDs and ULIDs here ' +
  'never fall back to Math.random().';

const ULID_TIME_ERROR =
  'ULID timestamp must be a finite integer between 0 and 281474976710655 (2^48 − 1) milliseconds.';

/** Safe access to a Web Crypto-ish object without throwing in odd runtimes. */
function getCrypto(): Crypto | undefined {
  try {
    return typeof crypto !== 'undefined' ? crypto : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Fill a byte array with cryptographically secure random values. Returns null
 * — never falls back to Math.random() — when Web Crypto is missing or when
 * crypto.getRandomValues() throws, so callers can surface a clean failure.
 */
function secureRandomBytes(len: number): Uint8Array | null {
  const c = getCrypto();
  if (!c || typeof c.getRandomValues !== 'function') return null;
  try {
    const bytes = new Uint8Array(len);
    c.getRandomValues(bytes);
    return bytes;
  } catch {
    return null;
  }
}

/** Format 16 bytes as 8-4-4-4-12 lowercase hex. */
function bytesToUuid(bytes: Uint8Array): string {
  let hex = '';
  for (let i = 0; i < 16; i++) {
    hex += HEX[bytes[i] >> 4] + HEX[bytes[i] & 0x0f];
  }
  return (
    hex.slice(0, 8) +
    '-' +
    hex.slice(8, 12) +
    '-' +
    hex.slice(12, 16) +
    '-' +
    hex.slice(16, 20) +
    '-' +
    hex.slice(20, 32)
  );
}

/**
 * Generate one v4 UUID (lowercase), preferring the native crypto.randomUUID.
 * Returns null — never Math.random() — when no secure random source is
 * available (or a native implementation throws), so callers fail cleanly.
 */
function oneUuidV4(): string | null {
  const c = getCrypto();
  if (c && typeof c.randomUUID === 'function') {
    try {
      return c.randomUUID();
    } catch {
      /* fall through to manual construction */
    }
  }
  const bytes = secureRandomBytes(16);
  if (!bytes) return null;
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 10x
  return bytesToUuid(bytes);
}

/** Clamp a possibly-invalid count to [1, 1000]; report whether it was adjusted. */
function clampCount(count: number): { count: number; clamped: boolean } {
  const n = Number(count);
  if (!Number.isFinite(n)) return { count: 1, clamped: true };
  const floored = Math.floor(n);
  if (floored < 1) return { count: 1, clamped: true };
  if (floored > 1000) return { count: 1000, clamped: true };
  return { count: floored, clamped: floored !== n };
}

/**
 * Generate a batch of v4 UUIDs. Count is clamped to [1, 1000]; an out-of-range
 * or non-numeric count still returns a clamped batch plus a note. Never throws.
 */
export function generateUuidV4(opts: GenerateOptions): GenerateResult {
  const notes: string[] = [];
  const { count, clamped } = clampCount(opts?.count);
  if (clamped) {
    notes.push(`Count was adjusted to ${count} (allowed range is 1–1000).`);
  }
  const uppercase = Boolean(opts?.uppercase);
  const values: string[] = [];
  for (let i = 0; i < count; i++) {
    const v = oneUuidV4();
    if (v === null) {
      return { valid: false, error: SECURE_RANDOM_ERROR, values: [] };
    }
    values.push(uppercase ? v.toUpperCase() : v);
  }
  return { valid: true, values, notes: notes.length ? notes : undefined };
}

/** The all-zero (nil) UUID. */
export function nilUuid(): string {
  return NIL_UUID;
}

/** Encode a non-negative integer as `len` Crockford base32 chars (big-endian). */
function encodeCrockford(value: number, len: number): string {
  let out = '';
  let n = value;
  for (let i = 0; i < len; i++) {
    out = CROCKFORD[n % 32] + out;
    n = Math.floor(n / 32);
  }
  return out;
}

/**
 * Pure ULID encoder: a validated 48-bit ms timestamp (10 Crockford chars) plus
 * 10 bytes (80 bits) of randomness (16 chars) = 26 chars. Both inputs are
 * assumed already validated by the caller; this helper never throws.
 */
function encodeUlid(ms: number, bytes: Uint8Array): string {
  const time = encodeCrockford(ms, 10);

  // Encode 80 bits of randomness as 16 Crockford chars (5 bits each). Walk the
  // bit stream MSB-first so it round-trips exactly regardless of byte layout.
  let rand = '';
  let bitBuffer = 0;
  let bitCount = 0;
  for (let i = 0; i < 10; i++) {
    bitBuffer = (bitBuffer << 8) | bytes[i];
    bitCount += 8;
    while (bitCount >= 5) {
      bitCount -= 5;
      const index = (bitBuffer >> bitCount) & 0x1f;
      rand += CROCKFORD[index];
    }
  }
  return time + rand;
}

/**
 * Generate a ULID as a result object: 48-bit ms timestamp (10 chars) + 80 bits
 * randomness (16 chars) = 26 Crockford base32 chars. Never throws.
 *
 * Fails cleanly (`{ valid:false, error }`) when:
 *   - `now` is not a finite integer in [0, 2^48 − 1], or
 *   - no secure random source is available and no valid `randomBytes` (>= 10
 *     bytes) is injected.
 *
 * `randomBytes` (>= 10 bytes) is injectable for deterministic tests; otherwise
 * cryptographically secure randomness is used (never Math.random()).
 */
export function generateUlid(
  now: number = Date.now(),
  randomBytes?: Uint8Array
): UlidResult {
  if (
    typeof now !== 'number' ||
    !Number.isFinite(now) ||
    !Number.isInteger(now) ||
    now < 0 ||
    now > MAX_ULID_TIME
  ) {
    return { valid: false, error: ULID_TIME_ERROR };
  }

  const bytes =
    randomBytes && randomBytes.length >= 10 ? randomBytes : secureRandomBytes(10);
  if (!bytes) {
    return { valid: false, error: SECURE_RANDOM_ERROR };
  }

  return { valid: true, value: encodeUlid(now, bytes) };
}

/**
 * Decode the first 10 chars of a ULID back to milliseconds. Returns null when
 * the input is malformed or the timestamp overflows 48 bits (first char > '7').
 */
export function decodeUlidTime(ulid: string): number | null {
  if (typeof ulid !== 'string') return null;
  const s = ulid.trim().toUpperCase();
  if (s.length < 10) return null;
  const timePart = s.slice(0, 10);
  // The high char of a valid 48-bit time carries only 3 significant bits.
  if (timePart[0] > '7') return null;
  let value = 0;
  for (const ch of timePart) {
    const idx = CROCKFORD.indexOf(ch);
    if (idx === -1) return null;
    value = value * 32 + idx;
  }
  return value;
}

/** Map the top bits of the UUID variant nibble to a human name. */
function variantName(nibble: number): string {
  if (nibble >> 3 === 0b0) return 'NCS (reserved, backward compatibility)';
  if (nibble >> 2 === 0b10) return 'RFC 4122';
  if (nibble >> 1 === 0b110) return 'Microsoft (reserved)';
  return 'Reserved (future definition)';
}

/**
 * Inspect a pasted identifier. Detects an 8-4-4-4-12 hex UUID (reporting its
 * version and variant) or a 26-char Crockford ULID (decoding its embedded
 * timestamp). Bad input returns { valid:false, error }. Never throws.
 */
export function inspectUuid(input: string): InspectResult {
  if (typeof input !== 'string') {
    return { valid: false, error: INSPECT_ERROR };
  }
  const s = input.trim();

  // ── UUID (8-4-4-4-12 hex) ──────────────────────────────────────────────
  if (UUID_RE.test(s.toLowerCase())) {
    const lower = s.toLowerCase();
    const hex = lower.replace(/-/g, '');
    const version = parseInt(hex[12], 16); // nibble 13 (0-indexed 12)
    const variantNibble = parseInt(hex[16], 16); // nibble 17 (0-indexed 16)
    const variant = variantName(variantNibble);
    const isNil = lower === NIL_UUID;
    const notes = [
      isNil
        ? 'Nil UUID — all bits zero (RFC 4122 §4.1.7).'
        : `Version ${version} UUID.`,
    ];
    return {
      valid: true,
      kind: 'uuid',
      version,
      variant: isNil ? 'NCS / nil' : variant,
      notes,
    };
  }

  // ── ULID (26-char Crockford base32) ────────────────────────────────────
  const upper = s.toUpperCase();
  if (upper.length === 26 && /^[0-9ABCDEFGHJKMNPQRSTVWXYZ]{26}$/.test(upper)) {
    const ms = decodeUlidTime(upper);
    if (ms === null) {
      return { valid: false, error: INSPECT_ERROR };
    }
    const iso = new Date(ms).toISOString();
    return {
      valid: true,
      kind: 'ulid',
      timestamp: iso,
      notes: [
        'Crockford base32 ULID (26 chars).',
        `Unix (ms): ${ms}`,
        `Randomness: ${upper.slice(10)}`,
      ],
    };
  }

  return { valid: false, error: INSPECT_ERROR };
}

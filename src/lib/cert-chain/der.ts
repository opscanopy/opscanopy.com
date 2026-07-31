/**
 * der.ts — a minimal, exact DER reader.
 *
 * Why hand-rolled rather than asn1js/pkijs: DER is a CANONICAL encoding. Every
 * value has exactly one legal byte sequence, so a reader has no alternatives to
 * choose between and "minimal" does not mean "approximate" — it means the
 * BER-only constructs are refused instead of guessed at. The libraries would add
 * ~200 KB to a page whose whole promise is that it is small and client-side, and
 * they throw on malformed input, which is the one thing this tool must never do
 * (see `src/lib/ip-core.ts` for the same parsers-return-null discipline).
 *
 * Contract for every function here: **return `null` on anything malformed, never
 * throw, never allocate proportional to an attacker-supplied length field.**
 * Views into the caller's buffer are returned rather than copies.
 *
 * Deliberately NOT supported, and refused rather than half-handled:
 *   - indefinite lengths (`0x80`) — BER, illegal in DER;
 *   - length fields wider than 4 octets — no certificate is 2^40 bytes;
 *   - the reserved `0xFF` length octet.
 */

/** Universal tag numbers this module needs by name. */
export const TAG = {
  BOOLEAN: 1,
  INTEGER: 2,
  BIT_STRING: 3,
  OCTET_STRING: 4,
  NULL: 5,
  OID: 6,
  UTF8_STRING: 12,
  SEQUENCE: 16,
  SET: 17,
  NUMERIC_STRING: 18,
  PRINTABLE_STRING: 19,
  T61_STRING: 20,
  IA5_STRING: 22,
  UTC_TIME: 23,
  GENERALIZED_TIME: 24,
  GRAPHIC_STRING: 25,
  VISIBLE_STRING: 26,
  GENERAL_STRING: 27,
  UNIVERSAL_STRING: 28,
  BMP_STRING: 30,
} as const;

/** Tag classes, in encoding order. */
export const CLASS_UNIVERSAL = 0;
export const CLASS_APPLICATION = 1;
export const CLASS_CONTEXT = 2;
export const CLASS_PRIVATE = 3;

/** One decoded TLV. Offsets are relative to the buffer it was read from. */
export interface DerNode {
  /** Offset of the identifier octet. */
  start: number;
  /** Offset of the first content octet. */
  contentStart: number;
  /** Offset one past the last content octet (= end of the whole TLV). */
  end: number;
  tagClass: 0 | 1 | 2 | 3;
  tagNumber: number;
  constructed: boolean;
  /** View over the content octets. */
  content: Uint8Array;
  /** View over the whole TLV, identifier and length included. */
  full: Uint8Array;
}

/** No structure in a certificate legitimately nests this deeply. */
const MAX_CHILDREN = 20_000;
/** Length fields wider than this are refused outright. */
const MAX_LENGTH_OCTETS = 4;
/** No real OID is longer than ~40 content octets; see `decodeOid`. */
const MAX_OID_OCTETS = 128;

/**
 * Read one TLV at `offset`. Returns `null` when the buffer is too short, the
 * length form is illegal in DER, or the declared length runs past the end.
 */
export function readNode(buf: Uint8Array, offset = 0): DerNode | null {
  if (!buf || offset < 0 || offset >= buf.length) return null;

  const identifier = buf[offset];
  const tagClass = ((identifier >> 6) & 0x03) as 0 | 1 | 2 | 3;
  const constructed = (identifier & 0x20) !== 0;
  let cursor = offset + 1;
  let tagNumber = identifier & 0x1f;

  if (tagNumber === 0x1f) {
    // High-tag-number form: base-128, continuation bit set on all but the last.
    tagNumber = 0;
    let seen = 0;
    for (;;) {
      if (cursor >= buf.length || seen >= 4) return null;
      const byte = buf[cursor];
      cursor += 1;
      seen += 1;
      tagNumber = (tagNumber << 7) | (byte & 0x7f);
      if ((byte & 0x80) === 0) break;
    }
  }

  if (cursor >= buf.length) return null;
  const first = buf[cursor];
  cursor += 1;
  let length: number;

  if (first === 0x80) return null; // indefinite length: BER, not DER
  if (first === 0xff) return null; // reserved

  if ((first & 0x80) === 0) {
    length = first;
  } else {
    const octets = first & 0x7f;
    if (octets > MAX_LENGTH_OCTETS) return null;
    if (cursor + octets > buf.length) return null;
    length = 0;
    for (let i = 0; i < octets; i += 1) {
      length = length * 256 + buf[cursor + i];
    }
    cursor += octets;
  }

  const contentStart = cursor;
  const end = contentStart + length;
  if (end > buf.length || end < contentStart) return null;

  return {
    start: offset,
    contentStart,
    end,
    tagClass,
    tagNumber,
    constructed,
    content: buf.subarray(contentStart, end),
    full: buf.subarray(offset, end),
  };
}

/**
 * Read every child TLV of a constructed node. Offsets on the returned nodes are
 * relative to `node.content`. Returns `null` for a primitive node or when any
 * child is malformed — a partial list would let a caller silently act on half a
 * structure.
 */
export function readChildren(node: DerNode | null): DerNode[] | null {
  if (!node || !node.constructed) return null;
  const buf = node.content;
  const out: DerNode[] = [];
  let offset = 0;
  while (offset < buf.length) {
    if (out.length >= MAX_CHILDREN) return null;
    const child = readNode(buf, offset);
    if (!child || child.end <= offset) return null;
    out.push(child);
    offset = child.end;
  }
  return out;
}

/** Read the TLV at `offset` and immediately return its children. */
export function readSequence(buf: Uint8Array, offset = 0): DerNode[] | null {
  return readChildren(readNode(buf, offset));
}

/**
 * Decode OID content octets to dotted form. Arcs are accumulated as BigInt: real
 * certificates carry arcs past 2^53 (Microsoft's are notorious), and a
 * Number-based decoder rounds them into a different OID entirely.
 */
export function decodeOid(content: Uint8Array): string | null {
  if (!content || content.length === 0) return null;
  // The BigInt shift below is O(n) per octet, so the decode is O(n²) in the
  // content length: a hand-built 533 KB OID froze the main thread for ~3 minutes
  // before returning "not a certificate". Every other bound in this engine is
  // capped; this one was not. The longest OID in any real certificate is well
  // under 40 octets, so nothing legitimate is anywhere near this ceiling.
  if (content.length > MAX_OID_OCTETS) return null;

  // Every sub-identifier — the first one included — is a base-128 big-endian
  // value with the continuation bit set on all but its last octet.
  const subs: bigint[] = [];
  let value = 0n;
  let pending = false;
  for (const byte of content) {
    value = (value << 7n) | BigInt(byte & 0x7f);
    pending = (byte & 0x80) !== 0;
    if (!pending) {
      subs.push(value);
      value = 0n;
    }
  }
  // A trailing continuation bit means the final sub-identifier never terminated.
  if (pending || subs.length === 0) return null;

  // The first sub-identifier packs the first two arcs: 40 × arc1 + arc2, with
  // arc1 ∈ {0,1,2} and arc2 unbounded in the 2.x space (hence 2.999 → 1079).
  const first = subs[0];
  const arcs: string[] =
    first < 40n
      ? ['0', first.toString()]
      : first < 80n
        ? ['1', (first - 40n).toString()]
        : ['2', (first - 80n).toString()];
  for (let i = 1; i < subs.length; i += 1) arcs.push(subs[i].toString());
  return arcs.join('.');
}

/** Decode INTEGER content octets (two's complement, big-endian) to a BigInt. */
export function decodeIntegerBig(content: Uint8Array): bigint | null {
  if (!content || content.length === 0) return null;
  let value = 0n;
  for (const byte of content) value = (value << 8n) | BigInt(byte);
  if ((content[0] & 0x80) !== 0) {
    // Negative: subtract 2^(8n).
    value -= 1n << BigInt(8 * content.length);
  }
  return value;
}

/** Decode BOOLEAN content octets. DER allows only 0x00 and 0xFF. */
export function decodeBoolean(content: Uint8Array): boolean | null {
  if (!content || content.length !== 1) return null;
  return content[0] !== 0x00;
}

export interface BitStringValue {
  bytes: Uint8Array;
  unusedBits: number;
  /** Significant bit count = 8 × bytes − unusedBits. */
  bitLength: number;
}

/** Decode BIT STRING content octets: a leading unused-bit count, then the body. */
export function decodeBitString(content: Uint8Array): BitStringValue | null {
  if (!content || content.length === 0) return null;
  const unusedBits = content[0];
  if (unusedBits > 7) return null;
  const bytes = content.subarray(1);
  if (bytes.length === 0 && unusedBits !== 0) return null;
  return { bytes, unusedBits, bitLength: bytes.length * 8 - unusedBits };
}

/** Read bit `index` (0 = most significant bit of the first octet) of a bit string. */
export function bitSet(value: BitStringValue, index: number): boolean {
  const byte = index >> 3;
  if (byte >= value.bytes.length) return false;
  if (index >= value.bitLength) return false;
  return (value.bytes[byte] & (0x80 >> (index & 7))) !== 0;
}

const ASCII_DIGITS = /^\d+$/;

function twoDigits(s: string, at: number): number {
  const part = s.slice(at, at + 2);
  if (!ASCII_DIGITS.test(part) || part.length !== 2) return NaN;
  return Number(part);
}

/**
 * Decode a UTCTime or GeneralizedTime node.
 *
 * RFC 5280 §4.1.2.5.1: UTCTime years 50–99 mean 1950–1999 and 00–49 mean
 * 2000–2049. That pivot is the reason certificates valid past 2049 must use
 * GeneralizedTime, and getting it backwards moves a certificate by a century.
 */
export function decodeTime(
  node: DerNode | null,
): { date: Date; kind: 'utc' | 'generalized' } | null {
  if (!node) return null;
  const isUtc = node.tagNumber === TAG.UTC_TIME;
  const isGen = node.tagNumber === TAG.GENERALIZED_TIME;
  if (!isUtc && !isGen) return null;

  let text = '';
  for (const byte of node.content) {
    if (byte < 0x20 || byte > 0x7e) return null;
    text += String.fromCharCode(byte);
  }
  text = text.trim();

  let year: number;
  let cursor: number;
  if (isUtc) {
    if (text.length < 11) return null;
    const yy = twoDigits(text, 0);
    if (Number.isNaN(yy)) return null;
    year = yy >= 50 ? 1900 + yy : 2000 + yy;
    cursor = 2;
  } else {
    if (text.length < 10) return null;
    const yyyy = text.slice(0, 4);
    if (!ASCII_DIGITS.test(yyyy)) return null;
    year = Number(yyyy);
    cursor = 4;
  }

  const month = twoDigits(text, cursor);
  const day = twoDigits(text, cursor + 2);
  const hour = twoDigits(text, cursor + 4);
  const minute = twoDigits(text, cursor + 6);
  if ([month, day, hour, minute].some(Number.isNaN)) return null;
  cursor += 8;

  let second = 0;
  if (text.length >= cursor + 2 && ASCII_DIGITS.test(text.slice(cursor, cursor + 2))) {
    second = twoDigits(text, cursor);
    cursor += 2;
  }

  let ms = 0;
  if (text[cursor] === '.' || text[cursor] === ',') {
    let digits = '';
    cursor += 1;
    while (cursor < text.length && text[cursor] >= '0' && text[cursor] <= '9') {
      digits += text[cursor];
      cursor += 1;
    }
    if (digits.length === 0) return null;
    ms = Math.round(Number(`0.${digits}`) * 1000);
  }

  // Zone. RFC 5280 mandates Z; ±hhmm is accepted because appliances emit it.
  let offsetMinutes = 0;
  const zone = text.slice(cursor);
  if (zone === 'Z' || zone === '') {
    offsetMinutes = 0;
  } else if (zone[0] === '+' || zone[0] === '-') {
    const zh = twoDigits(zone, 1);
    const zm = zone.length >= 5 ? twoDigits(zone, 3) : 0;
    if (Number.isNaN(zh) || Number.isNaN(zm)) return null;
    offsetMinutes = (zh * 60 + zm) * (zone[0] === '-' ? -1 : 1);
  } else {
    return null;
  }

  if (month < 1 || month > 12) return null;
  if (day < 1 || day > 31) return null;
  if (hour > 23 || minute > 59 || second > 60) return null;

  const utc = Date.UTC(year, month - 1, day, hour, minute, Math.min(second, 59), ms);
  if (!Number.isFinite(utc)) return null;
  const date = new Date(utc - offsetMinutes * 60_000);
  // Reject impossible calendar dates (31 February and friends), which Date.UTC
  // silently rolls forward.
  if (date.getUTCMonth() + 1 !== month && offsetMinutes === 0) return null;
  return { date, kind: isUtc ? 'utc' : 'generalized' };
}

const utf8 = new TextDecoder('utf-8');

function latin1(bytes: Uint8Array): string {
  let out = '';
  for (const byte of bytes) out += String.fromCharCode(byte);
  return out;
}

/**
 * Decode any of the ASN.1 string types that appear in a certificate name.
 * Returns `null` for a tag that is not a string type, so a caller can tell
 * "empty string" from "not a string".
 */
export function decodeString(node: DerNode | null): string | null {
  if (!node) return null;
  const bytes = node.content;
  switch (node.tagNumber) {
    case TAG.UTF8_STRING:
      try {
        return utf8.decode(bytes);
      } catch {
        return latin1(bytes);
      }
    case TAG.PRINTABLE_STRING:
    case TAG.IA5_STRING:
    case TAG.NUMERIC_STRING:
    case TAG.VISIBLE_STRING:
    case TAG.GENERAL_STRING:
    case TAG.GRAPHIC_STRING:
    case TAG.T61_STRING:
      return latin1(bytes);
    case TAG.BMP_STRING: {
      if (bytes.length % 2 !== 0) return null;
      let out = '';
      for (let i = 0; i < bytes.length; i += 2) {
        out += String.fromCharCode((bytes[i] << 8) | bytes[i + 1]);
      }
      return out;
    }
    case TAG.UNIVERSAL_STRING: {
      if (bytes.length % 4 !== 0) return null;
      let out = '';
      for (let i = 0; i < bytes.length; i += 4) {
        const code =
          (bytes[i] << 24) | (bytes[i + 1] << 16) | (bytes[i + 2] << 8) | bytes[i + 3];
        if (code < 0 || code > 0x10ffff) return null;
        out += String.fromCodePoint(code);
      }
      return out;
    }
    default:
      return null;
  }
}

/** Upper-case, colon-separated hex — the spelling every certificate tool uses. */
export function hexColon(bytes: Uint8Array): string {
  const parts: string[] = [];
  for (const byte of bytes) parts.push(byte.toString(16).padStart(2, '0').toUpperCase());
  return parts.join(':');
}

/** Upper-case hex with no separators. */
export function hexPlain(bytes: Uint8Array): string {
  let out = '';
  for (const byte of bytes) out += byte.toString(16).padStart(2, '0').toUpperCase();
  return out;
}

/** Byte-wise equality. Used for DN comparison and de-duplication. */
export function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a === b) return true;
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return false;
  return true;
}

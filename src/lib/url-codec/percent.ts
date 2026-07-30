/**
 * Percent-encoding core for the URL Encoder / Decoder.
 *
 * Everything here is pure, allocation-conscious (100 KB of input stays O(n) —
 * literal runs are buffered, never concatenated character by character) and
 * never throws. The two JavaScript built-ins this replaces both throw:
 * `encodeURIComponent()` raises `URIError` on a lone surrogate and
 * `decodeURIComponent()` raises it on any malformed escape, which is exactly
 * the input a person pastes into a URL decoder. Here both cases become
 * positioned diagnostics and a best-effort output.
 *
 * Two deliberate departures from the built-ins, both surfaced in the UI:
 *   - `scope: 'component'` follows RFC 3986 §2.3 strictly, so `! ' ( ) *` ARE
 *     escaped. `encodeURIComponent()` leaves them alone (a leftover from
 *     RFC 2396's "mark" set), which is why `jsEquivalent` goes `null` for those
 *     inputs instead of quietly claiming agreement.
 *   - decoding is UTF-8 with replacement, not failure: `%C3%28` is not valid
 *     UTF-8, so it decodes to U+FFFD and says so, rather than throwing.
 */
import type {
  Diagnostic,
  DecodeOptions,
  DecodeResult,
  EncodeOptions,
  EncodeResult,
  EncodeScope,
} from './types';

/* ── Safe sets, as 128-entry lookup tables (hot loop, no regex per byte) ──── */

function tableOf(extra: string): Uint8Array {
  const table = new Uint8Array(128);
  for (let c = 0x30; c <= 0x39; c += 1) table[c] = 1; // 0-9
  for (let c = 0x41; c <= 0x5a; c += 1) table[c] = 1; // A-Z
  for (let c = 0x61; c <= 0x7a; c += 1) table[c] = 1; // a-z
  for (const ch of extra) table[ch.charCodeAt(0)] = 1;
  return table;
}

/** RFC 3986 §2.3 unreserved. Everything else is escaped. */
const COMPONENT_SAFE = tableOf("-._~");
/** `encodeURI()`'s set: unreserved + reserved + `#`, so a URL stays a URL. */
const FULL_URL_SAFE = tableOf("-._~!$&'()*+,;=:@/?#");
/** WHATWG `application/x-www-form-urlencoded` serializer set. */
const FORM_SAFE = tableOf('*-._');

/**
 * Characters `encodeURIComponent()` leaves unescaped but RFC 3986 lists as
 * sub-delims — the reason the two disagree on `component` scope.
 */
const JS_MARK_EXTRAS = "!'()*";

const HEX = '0123456789ABCDEF';

function pct(byte: number): string {
  return '%' + HEX[(byte >> 4) & 0xf] + HEX[byte & 0xf];
}

function isHexDigit(ch: string): boolean {
  return (
    (ch >= '0' && ch <= '9') || (ch >= 'a' && ch <= 'f') || (ch >= 'A' && ch <= 'F')
  );
}

/** Trim a value for use inside a diagnostic sentence. */
export function quoteForMessage(value: string, max = 60): string {
  const oneLine = value.replace(/[\n\r\t]/g, ' ');
  return oneLine.length > max ? oneLine.slice(0, max) + '…' : oneLine;
}

/* ── Encoding ─────────────────────────────────────────────────────────────── */

const LONE_SURROGATE_MSG =
  'Input contains an unpaired UTF-16 surrogate at index %AT% — encodeURIComponent() throws a ' +
  'URIError on this. It was encoded as the replacement character U+FFFD (%EF%BF%BD) instead, ' +
  'so the rest of the value still round-trips.';

const RFC_STRICTER_MSG =
  'RFC 3986 lists %CHARS% as sub-delimiters, so they are percent-encoded here. ' +
  "encodeURIComponent() leaves them alone — that is the one place the browser built-in is not " +
  'component-safe, and the difference bites inside OAuth redirect_uri values.';

/** Index of the first unpaired surrogate code unit, or -1. */
function firstLoneSurrogate(input: string): number {
  for (let i = 0; i < input.length; i += 1) {
    const code = input.charCodeAt(i);
    if (code < 0xd800 || code > 0xdfff) continue;
    if (code >= 0xdc00) return i; // low surrogate with no high before it
    const next = input.charCodeAt(i + 1);
    if (Number.isNaN(next) || next < 0xdc00 || next > 0xdfff) return i;
    i += 1; // well-formed pair
  }
  return -1;
}

/**
 * Percent-encode `input`. Never throws: a lone surrogate becomes U+FFFD plus a
 * warning rather than a `URIError`.
 */
export function encode(input: string, opts: EncodeOptions = {}): EncodeResult {
  const form = opts.form === true;
  const scope: EncodeScope = opts.scope === 'full-url' ? 'full-url' : 'component';
  const table = form ? FORM_SAFE : scope === 'full-url' ? FULL_URL_SAFE : COMPONENT_SAFE;

  const diagnostics: Diagnostic[] = [];
  const loneAt = firstLoneSurrogate(input);
  if (loneAt >= 0) {
    diagnostics.push({
      level: 'warning',
      code: 'lone-surrogate',
      at: loneAt,
      message: LONE_SURROGATE_MSG.replace('%AT%', String(loneAt)),
    });
  }

  const bytes = new TextEncoder().encode(input);
  const out: string[] = [];
  let literalStart = -1;
  let encodedCount = 0;

  for (let i = 0; i < bytes.length; i += 1) {
    const byte = bytes[i];
    const safe = byte < 0x80 && table[byte] === 1;
    if (safe) {
      if (literalStart < 0) literalStart = i;
      continue;
    }
    if (literalStart >= 0) {
      out.push(latin1(bytes, literalStart, i));
      literalStart = -1;
    }
    out.push(form && byte === 0x20 ? '+' : pct(byte));
    encodedCount += 1;
  }
  if (literalStart >= 0) out.push(latin1(bytes, literalStart, bytes.length));

  const output = out.join('');

  // Which built-in, if any, produced exactly this string?
  let jsEquivalent: string | null;
  if (form) {
    jsEquivalent = 'URLSearchParams';
  } else if (scope === 'full-url') {
    jsEquivalent = 'encodeURI';
  } else {
    const extras = [...JS_MARK_EXTRAS].filter((ch) => input.includes(ch));
    if (extras.length === 0) {
      jsEquivalent = 'encodeURIComponent';
    } else {
      jsEquivalent = null;
      diagnostics.push({
        level: 'info',
        code: 'rfc-stricter-than-js',
        message: RFC_STRICTER_MSG.replace('%CHARS%', extras.join(' ')),
      });
    }
  }

  const label = form
    ? 'form-urlencoded'
    : scope === 'full-url'
      ? 'RFC 3986 full URL'
      : 'RFC 3986 component';

  return {
    mode: 'encode',
    ok: true,
    input,
    output,
    scope,
    form,
    jsEquivalent,
    encodedCount,
    summary: `${input.length} → ${output.length} chars · ${encodedCount} encoded · ${label}`,
    diagnostics,
  };
}

/** Rebuild an ASCII-only byte run as a string without a per-byte closure. */
function latin1(bytes: Uint8Array, start: number, end: number): string {
  let s = '';
  for (let i = start; i < end; i += 1) s += String.fromCharCode(bytes[i]);
  return s;
}

/* ── Decoding ─────────────────────────────────────────────────────────────── */

function badEscapeMsg(seq: string, at: number): string {
  return (
    `Invalid percent-escape "${seq}" at index ${at} — "%" must be followed by two hex ` +
    'digits (0-9, A-F). Percent-encode a literal "%" as "%25".'
  );
}

function truncatedEscapeMsg(seq: string, at: number, following: number): string {
  if (following === 0) {
    return (
      `Truncated percent-escape at index ${at} — "%" is the last character, so both of its ` +
      'hex digits are missing. Percent-encode a literal "%" as "%25".'
    );
  }
  return (
    `Truncated percent-escape "${seq}" at index ${at} — "%" needs two hex digits but only ` +
    `${following} character${following === 1 ? '' : 's'} follow${following === 1 ? 's' : ''}. ` +
    'Percent-encode a literal "%" as "%25".'
  );
}

function invalidUtf8Msg(seq: number[], truncated: boolean): string {
  const shown = seq.map((b) => '%' + HEX[(b >> 4) & 0xf] + HEX[b & 0xf]).join(' ');
  const lead = '%' + HEX[(seq[0] >> 4) & 0xf] + HEX[seq[0] & 0xf];
  if (truncated) {
    return (
      `Sequence ${shown} is incomplete UTF-8 — it decoded to U+FFFD (the replacement ` +
      `character). ${lead} announces a multi-byte character, but the value ends before its ` +
      'continuation bytes.'
    );
  }
  if (seq.length === 1) {
    return (
      `Byte ${shown} is not valid UTF-8 — it decoded to U+FFFD (the replacement character). ` +
      'No UTF-8 character can start with it: lead bytes are %00–%7F, %C2–%DF, %E0–%EF and ' +
      '%F0–%F4.'
    );
  }
  return (
    `Bytes ${shown} are not valid UTF-8 — they decoded to U+FFFD (the replacement character). ` +
    `${lead} must be followed by a continuation byte in the %80–%BF range. This usually means ` +
    'the text was percent-encoded from Latin-1, not UTF-8.'
  );
}

const LOWERCASE_HEX_MSG =
  'Lowercase hex in "%SEQ%" — decoding is case-insensitive, so this decodes correctly. ' +
  'RFC 3986 §6.2.2.1 says producers should use uppercase ("%UPPER%"), which is what the ' +
  'Encode mode emits.';

/**
 * Info note when the input mixes lowercase hex digits into its escapes. Exported
 * so `parseUrl` can raise it once for a whole URL instead of once per parameter.
 */
export function lowercaseHexInfo(raw: string, offset = 0): Diagnostic | null {
  const match = /%([0-9A-Fa-f]{2})/g;
  let hit: RegExpExecArray | null;
  while ((hit = match.exec(raw)) !== null) {
    if (/[a-f]/.test(hit[1])) {
      const seq = '%' + hit[1];
      return {
        level: 'info',
        code: 'lowercase-hex',
        at: offset + hit.index,
        message: LOWERCASE_HEX_MSG.replace('%SEQ%', seq).replace('%UPPER%', seq.toUpperCase()),
      };
    }
  }
  return null;
}

/**
 * Does `+` mean a space here? Only when the text looks like a query string or a
 * form body: the `+` convention comes from HTML form submission, not from
 * RFC 3986, so applying it to a whole URL would corrupt `?a=1+2` style values
 * in paths and would silently rewrite a legitimate `+`.
 */
export function plusMeansSpace(raw: string): boolean {
  if (!raw.includes('+')) return false;
  // An absolute URL is not a form body — only its query would be, and even
  // there the convention belongs to the sender, so keep `+` literal.
  if (/^[A-Za-z][A-Za-z0-9+.-]*:\/\//.test(raw)) return false;
  return /[=&]/.test(raw);
}

interface Utf8Failure {
  /** Index of the first byte of the invalid sequence. */
  at: number;
  /** The lead byte through the offending byte. */
  seq: number[];
  /** True when the sequence simply ran out of bytes rather than being malformed. */
  truncated: boolean;
}

/** Continuation-byte count and the legal range of the FIRST continuation. */
function leadInfo(byte: number): { need: number; lo: number; hi: number } | null {
  if (byte >= 0xc2 && byte <= 0xdf) return { need: 1, lo: 0x80, hi: 0xbf };
  if (byte === 0xe0) return { need: 2, lo: 0xa0, hi: 0xbf };
  if (byte >= 0xe1 && byte <= 0xec) return { need: 2, lo: 0x80, hi: 0xbf };
  if (byte === 0xed) return { need: 2, lo: 0x80, hi: 0x9f };
  if (byte >= 0xee && byte <= 0xef) return { need: 2, lo: 0x80, hi: 0xbf };
  if (byte === 0xf0) return { need: 3, lo: 0x90, hi: 0xbf };
  if (byte >= 0xf1 && byte <= 0xf3) return { need: 3, lo: 0x80, hi: 0xbf };
  if (byte === 0xf4) return { need: 3, lo: 0x80, hi: 0x8f };
  return null; // 0x80–0xC1 and 0xF5–0xFF can never lead
}

/**
 * First invalid UTF-8 sequence, or null. Hand-rolled because `TextDecoder` with
 * `{fatal:true}` only tells you that something was wrong, not which bytes —
 * and the byte values are the whole diagnostic ("C3 28 means Latin-1").
 */
function firstInvalidUtf8(bytes: Uint8Array): Utf8Failure | null {
  let i = 0;
  while (i < bytes.length) {
    const lead = bytes[i];
    if (lead <= 0x7f) {
      i += 1;
      continue;
    }
    const info = leadInfo(lead);
    if (!info) return { at: i, seq: [lead], truncated: false };
    for (let k = 1; k <= info.need; k += 1) {
      const cont = bytes[i + k];
      const lo = k === 1 ? info.lo : 0x80;
      const hi = k === 1 ? info.hi : 0xbf;
      if (cont === undefined) {
        return { at: i, seq: Array.from(bytes.slice(i, i + k)), truncated: true };
      }
      if (cont < lo || cont > hi) {
        return { at: i, seq: Array.from(bytes.slice(i, i + k + 1)), truncated: false };
      }
    }
    i += info.need + 1;
  }
  return null;
}

export interface PercentDecode {
  text: string;
  ok: boolean;
  decodedCount: number;
  doubleEncoded: boolean;
  decodedTwice?: string;
  diagnostics: Diagnostic[];
}

export interface PercentDecodeOptions {
  /** Absolute index of `raw` inside the user's input, for diagnostic positions. */
  offset?: number;
  plusAsSpace?: boolean;
  /** Set false for the second pass of double-encoding detection. */
  detectDouble?: boolean;
}

/** True when a string still holds at least one syntactically valid escape. */
function hasEscape(raw: string): boolean {
  return /%[0-9A-Fa-f]{2}/.test(raw);
}

const DOUBLE_ENCODED_MSG =
  'This value is double-encoded: decoding once gives "%ONCE%", which still contains escapes; ' +
  'decoding that again gives "%TWICE%". Something percent-encoded it twice — usually a client ' +
  'that called encodeURIComponent() on an already-encoded URL.';

/**
 * Percent-decode one string. Malformed escapes are reported by absolute index
 * and left literal in the output, so the user sees the whole value plus the
 * exact position of the problem instead of an empty box.
 */
export function decodePercent(raw: string, opts: PercentDecodeOptions = {}): PercentDecode {
  const offset = opts.offset ?? 0;
  const plusAsSpace = opts.plusAsSpace === true;
  const detectDouble = opts.detectDouble !== false;
  const diagnostics: Diagnostic[] = [];

  const chunks: Uint8Array[] = [];
  const encoder = new TextEncoder();
  let literal = '';
  let decodedCount = 0;
  let ok = true;

  function flush(): void {
    if (literal.length === 0) return;
    chunks.push(encoder.encode(literal));
    literal = '';
  }

  for (let i = 0; i < raw.length; ) {
    const ch = raw[i];
    if (ch === '%') {
      const a = raw[i + 1];
      const b = raw[i + 2];
      if (a !== undefined && b !== undefined && isHexDigit(a) && isHexDigit(b)) {
        flush();
        chunks.push(new Uint8Array([parseInt(a + b, 16)]));
        decodedCount += 1;
        i += 3;
        continue;
      }
      const following = raw.length - i - 1;
      const seq = raw.slice(i, i + 3);
      ok = false;
      diagnostics.push(
        following >= 2
          ? {
              level: 'error',
              code: 'bad-escape',
              at: offset + i,
              message: badEscapeMsg(seq, offset + i),
            }
          : {
              level: 'error',
              code: 'truncated-escape',
              at: offset + i,
              message: truncatedEscapeMsg(seq, offset + i, following),
            },
      );
      literal += ch; // keep it visible instead of swallowing it
      i += 1;
      continue;
    }
    if (ch === '+' && plusAsSpace) {
      literal += ' ';
      i += 1;
      continue;
    }
    literal += ch;
    i += 1;
  }
  flush();

  let total = 0;
  for (const chunk of chunks) total += chunk.length;
  const bytes = new Uint8Array(total);
  let cursor = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, cursor);
    cursor += chunk.length;
  }

  const bad = firstInvalidUtf8(bytes);
  if (bad) {
    diagnostics.push({
      level: 'warning',
      code: 'invalid-utf8',
      message: invalidUtf8Msg(bad.seq, bad.truncated),
    });
  }
  const text = new TextDecoder().decode(bytes);

  let doubleEncoded = false;
  let decodedTwice: string | undefined;
  if (detectDouble && ok && hasEscape(text)) {
    // Second pass keeps `+` literal on purpose: a `%2B` that just became `+`
    // is a real plus sign, not a space that was encoded twice.
    const again = decodePercent(text, { plusAsSpace: false, detectDouble: false });
    if (again.ok && again.text !== text) {
      doubleEncoded = true;
      decodedTwice = again.text;
      diagnostics.push({
        level: 'warning',
        code: 'double-encoded',
        message: DOUBLE_ENCODED_MSG.replace('%ONCE%', quoteForMessage(text)).replace(
          '%TWICE%',
          quoteForMessage(again.text),
        ),
      });
    }
  }

  return { text, ok, decodedCount, doubleEncoded, decodedTwice, diagnostics };
}

const PLUS_AS_SPACE_MSG =
  '"+" was read as a space because this looks like a query string or form body — the ' +
  'convention comes from HTML form submission, not RFC 3986. Turn "+ is a space" off to keep it ' +
  'literal.';

const PLUS_LITERAL_MSG =
  '"+" was kept literal because this does not look like a form body. Turn "+ is a space" on if ' +
  'the value came from an application/x-www-form-urlencoded payload, where "+" means U+0020.';

/** Percent-decode a whole input in Decode mode. */
export function decode(input: string, opts: DecodeOptions = {}): DecodeResult {
  const setting = opts.plusAsSpace ?? 'auto';
  const plusAsSpace = setting === 'auto' ? plusMeansSpace(input) : setting === true;

  if (input.trim().length === 0) {
    return {
      mode: 'decode',
      ok: false,
      input,
      output: '',
      plusAsSpace,
      doubleEncoded: false,
      decodedCount: 0,
      summary: '',
      diagnostics: [],
    };
  }

  const core = decodePercent(input, { plusAsSpace });
  const diagnostics = [...core.diagnostics];

  if (setting === 'auto' && input.includes('+')) {
    diagnostics.push({
      level: 'info',
      code: plusAsSpace ? 'plus-as-space' : 'plus-literal',
      message: plusAsSpace ? PLUS_AS_SPACE_MSG : PLUS_LITERAL_MSG,
    });
  }
  const lowercase = lowercaseHexInfo(input);
  if (lowercase) diagnostics.push(lowercase);

  const errors = diagnostics.filter((d) => d.level === 'error').length;
  const summary = errors
    ? `Invalid — ${diagnostics.find((d) => d.level === 'error')?.message ?? ''}`
    : `${input.length} → ${core.text.length} chars · ${core.decodedCount} escape` +
      `${core.decodedCount === 1 ? '' : 's'} decoded` +
      (core.doubleEncoded ? ' · double-encoded' : '');

  return {
    mode: 'decode',
    ok: core.ok,
    input,
    output: core.text,
    plusAsSpace,
    doubleEncoded: core.doubleEncoded,
    decodedTwice: core.decodedTwice,
    decodedCount: core.decodedCount,
    summary,
    diagnostics,
  };
}

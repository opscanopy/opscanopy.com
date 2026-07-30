/**
 * URL Encoder / Decoder + Query-String Parser — shared types.
 *
 * The engine has three modes, all pure and none of which ever throws:
 *   - `encode` — percent-encode text for a URL component or a whole URL, with
 *     the `application/x-www-form-urlencoded` (`+` for space) variant.
 *   - `decode` — percent-decode text, detect double-encoding, and diagnose
 *     malformed escapes by position instead of failing generically.
 *   - `parse`  — split a URL into its WHATWG components and its query into a
 *     read-only parameter table.
 *
 * Diagnostics are structured, not strings-in-a-blob: every problem carries a
 * stable `code` (for the UI to style), a `level`, an optional 0-based `at`
 * index into the caller's input, and a specific human sentence. The wording of
 * every message is pinned by `engine.test.ts` — treat the strings in
 * `messages.ts` as part of the public API.
 */

/** Which operation the engine performed. */
export type UrlCodecMode = 'parse' | 'decode' | 'encode';

/**
 * How much of the RFC 3986 grammar the encoder is allowed to leave alone.
 *
 * - `component` — only the unreserved set `A-Z a-z 0-9 - . _ ~` survives.
 *   Everything else, including `/ ? : @ & = +`, is escaped. This is what you
 *   want for a single query value or path segment.
 * - `full-url` — reserved characters survive too, so an already-assembled URL
 *   stays a URL. Byte-for-byte identical to JavaScript's `encodeURI()`.
 */
export type EncodeScope = 'component' | 'full-url';

export type DiagnosticLevel = 'error' | 'warning' | 'info';

/** One specific, positioned problem or note about the input. */
export interface Diagnostic {
  level: DiagnosticLevel;
  /** Stable machine-readable id, e.g. `'bad-escape'`. Never localized. */
  code: string;
  /** Specific human sentence. Pinned byte-for-byte by the engine tests. */
  message: string;
  /** 0-based index into the caller's input, when the problem has a position. */
  at?: number;
  /** Where the problem lives, e.g. `'value of "redirect_uri"'`. */
  where?: string;
}

/** Common shape every mode returns, so the UI can render chrome without narrowing. */
export interface BaseResult {
  mode: UrlCodecMode;
  /** false when an `error`-level diagnostic was produced (or the input was empty). */
  ok: boolean;
  /** The input exactly as handed to the engine. */
  input: string;
  /** One-line status for the playground's `role="status"` summary. */
  summary: string;
  diagnostics: Diagnostic[];
}

export interface EncodeOptions {
  /**
   * `application/x-www-form-urlencoded`: space becomes `+` and the safe set
   * narrows to `A-Z a-z 0-9 * - . _` — byte-for-byte what `URLSearchParams`
   * emits. Overrides `scope`.
   */
  form?: boolean;
  /** Default `'component'`. Ignored when `form` is true. */
  scope?: EncodeScope;
}

export interface EncodeResult extends BaseResult {
  mode: 'encode';
  output: string;
  scope: EncodeScope;
  form: boolean;
  /**
   * Name of the JavaScript built-in this output matches byte-for-byte, or
   * `null` when no built-in agrees (the whole point of the "verify the AI
   * answer" angle: `encodeURIComponent()` is *not* RFC 3986 component-safe).
   */
  jsEquivalent: string | null;
  /** How many input bytes were replaced by an escape (or by `+`). */
  encodedCount: number;
}

export interface DecodeOptions {
  /**
   * `true`/`false` force the `+`-is-a-space convention on or off. `'auto'`
   * (the default) turns it on only when the input looks like a query string or
   * form body — see `plusMeansSpace()`.
   */
  plusAsSpace?: 'auto' | boolean;
}

export interface DecodeResult extends BaseResult {
  mode: 'decode';
  /** Best-effort output: malformed escapes are left literal, never dropped. */
  output: string;
  /** The convention actually applied (never `'auto'`). */
  plusAsSpace: boolean;
  /** True when `output` still holds a valid escape, so decoding again changes it. */
  doubleEncoded: boolean;
  /** Present only when `doubleEncoded` — the result of decoding twice. */
  decodedTwice?: string;
  /** How many `%XX` escapes were decoded. */
  decodedCount: number;
}

/** One row of the read-only parameter table. */
export interface QueryParam {
  /** 0-based position in the query, so copy labels stay stable. */
  index: number;
  /** The name exactly as it appeared, before decoding. */
  rawKey: string;
  /** The decoded name. */
  key: string;
  /** The value exactly as it appeared, or `null` for a bare key with no `=`. */
  rawValue: string | null;
  /** The decoded value. `''` both for `a=` and for a bare key. */
  value: string;
  /** False for a bare key (`&b&`) — meaningfully different from `b=`. */
  hasValue: boolean;
  /** True when an earlier row already used this decoded key. */
  isDuplicate: boolean;
  /** True when the value still holds an escape after one decode pass. */
  doubleEncoded: boolean;
  /** Problems found while decoding this row, already lifted into the result too. */
  diagnostics: Diagnostic[];
}

/** One row of the URL components card. */
export interface UrlComponent {
  label: string;
  /** WHATWG-normalized value — "as browsers see it". */
  value: string;
  /** The raw slice of the input, when normalization changed it. */
  raw?: string;
  /** Muted caption under the label (the glossary-as-caption contract). */
  gloss?: string;
}

export interface ParseOptions {
  /** Passed through to every key/value decode. Default `'auto'`. */
  plusAsSpace?: 'auto' | boolean;
}

export interface ParseResult extends BaseResult {
  mode: 'parse';
  /** WHATWG-normalized serialization, or `null` for a bare query string. */
  href: string | null;
  /** Component rows for the components card. Empty when `queryOnly`. */
  components: UrlComponent[];
  /** True when the input was a bare query string / form body, not a URL. */
  queryOnly: boolean;
  /** True when `https://` was prepended because the input carried no scheme. */
  assumedScheme: boolean;
  /** True when the normalized hostname contains an `xn--` (punycode) label. */
  isPunycode: boolean;
  /** The raw query text the rows came from, without a leading `?`. */
  rawQuery: string;
  /** The raw fragment text, without the `#`, or `null` when absent. */
  fragment: string | null;
  params: QueryParam[];
  /**
   * The `+`-is-a-space convention actually applied to the query (never `'auto'`),
   * so the UI can show the resolved state on its checkbox instead of guessing.
   */
  plusAsSpace: boolean;
}

export type RunOptions = EncodeOptions & DecodeOptions & ParseOptions;

export type RunResult = EncodeResult | DecodeResult | ParseResult;

/** One bundled example, surfaced as a chip. Examples never set non-default options. */
export interface UrlCodecExample {
  id: string;
  label: string;
  input: string;
  mode: UrlCodecMode;
}

/**
 * URL Encoder / Decoder + Query-String Parser — engine façade.
 *
 * Public API (all pure, none ever throws):
 *   encode(input, { form?, scope? })        → EncodeResult   (percent.ts)
 *   decode(input, { plusAsSpace? })         → DecodeResult   (percent.ts)
 *   parseUrl(input, { plusAsSpace? })       → ParseResult    (here)
 *   run(input, mode, opts)                  → RunResult      (playground entry)
 *
 * `parseUrl` deliberately uses BOTH a raw string split and the WHATWG `URL`
 * parser, and shows both to the user:
 *   - the raw split gives absolute character offsets for diagnostics and the
 *     exact bytes the user pasted (WHATWG throws away tabs/newlines and
 *     re-encodes reserved characters, so it cannot answer "where is the typo");
 *   - `new URL()` gives the normalization every browser and every HTTP client
 *     will actually apply — punycode host, dropped default port, resolved path.
 * Anything that only the raw text can tell you (a raw newline, a truncated
 * escape) is diagnosed BEFORE the URL parser silently absorbs it.
 */
import { decode, encode, lowercaseHexInfo, quoteForMessage } from './percent';
import { parseQuery } from './query';
import type {
  Diagnostic,
  ParseOptions,
  ParseResult,
  RunOptions,
  RunResult,
  UrlCodecMode,
  UrlComponent,
} from './types';

export { encode, decode } from './percent';
export { parseQuery, paramLines } from './query';
export type {
  BaseResult,
  DecodeOptions,
  DecodeResult,
  Diagnostic,
  DiagnosticLevel,
  EncodeOptions,
  EncodeResult,
  EncodeScope,
  ParseOptions,
  ParseResult,
  QueryParam,
  RunOptions,
  RunResult,
  UrlCodecExample,
  UrlCodecMode,
  UrlComponent,
} from './types';

/** Fragments past this length stop being dependable URLs, so links are withheld. */
export const MAX_SHARE_LEN = 2000;

const NOT_A_URL_MSG =
  'Not a URL — "%INPUT%" could not be parsed. A URL needs at least a scheme and a host, e.g. ' +
  'https://example.com/path?a=1. To parse a bare query string, start the input with "?".';

const USERINFO_MSG =
  'This URL carries credentials in its userinfo part (user:password@host). RFC 3986 §3.2.1 ' +
  'deprecates the practice, Chrome and Safari strip it, and proxies log the whole URL — send the ' +
  'secret in an Authorization header instead.';

function rawNewlineMsg(kind: string, at: number): string {
  return (
    `Input contains a raw ${kind} at index ${at}. The URL standard strips tab, CR and LF from a ` +
    'URL silently, so a browser would parse this as if the break were not there — remove it, or ' +
    'percent-encode it (%0A for a line feed).'
  );
}

function assumedSchemeMsg(href: string): string {
  return (
    `No scheme in the input, so it was parsed as "${quoteForMessage(href)}". Add http:// or ` +
    'https:// explicitly when the scheme matters — a scheme-relative "//host/path" inherits the ' +
    'scheme of whatever page it sits on instead.'
  );
}

function punycodeConvertedMsg(rawHost: string, asciiHost: string): string {
  return (
    `Host "${rawHost}" was converted to punycode: "${asciiHost}". That ASCII form is what DNS ` +
    'actually resolves and what a TLS certificate must match. This tool does not convert ' +
    'punycode back to Unicode.'
  );
}

function punycodeAlreadyMsg(asciiHost: string): string {
  return (
    `Host "${asciiHost}" is already punycode — the ASCII form of an internationalized domain ` +
    'name. This tool does not convert punycode back to Unicode; check it against the registry ' +
    'before trusting the display name.'
  );
}

function fragmentMsg(fragment: string): string {
  return (
    `The fragment "#${quoteForMessage(fragment)}" is not part of the query string: it is never ` +
    'sent to the server and is not parsed into parameters here. Client-side routers sometimes ' +
    'parse it themselves.'
  );
}

function normalizedMsg(href: string): string {
  return (
    `Browsers normalize this to "${quoteForMessage(href, 80)}" — host lower-cased, a default ` +
    'port dropped, the path resolved and reserved characters re-encoded. Each row below shows ' +
    'the raw text alongside the normalized value when they differ.'
  );
}

function longInputMsg(length: number): string {
  return (
    `Input is ${length.toLocaleString('en-US')} characters — past the ~2,000-character cap for a ` +
    'shareable fragment, so "Copy link" stays hidden. Parsing itself is unaffected.'
  );
}

/** Absolute index of the first tab/CR/LF, with a human name for it. */
function findRawBreak(text: string): { at: number; kind: string } | null {
  const at = text.search(/[\t\n\r]/);
  if (at < 0) return null;
  const ch = text[at];
  const kind = ch === '\t' ? 'tab' : ch === '\r' ? 'carriage return (CR)' : 'line break (LF)';
  return { at, kind };
}

const SCHEME_RE = /^[A-Za-z][A-Za-z0-9+.-]*:/;

/**
 * Schemes whose payload legitimately follows the colon with no `//` — so a digit there is
 * data, not a port. `tel:5551234` must stay a tel: URL.
 */
const OPAQUE_SCHEMES = new Set([
  'mailto',
  'data',
  'tel',
  'urn',
  'blob',
  'about',
  'javascript',
  'sms',
  'geo',
  'magnet',
  'news',
  'sip',
  'file',
]);

/**
 * RFC 3986 scheme names may contain `.` and `-`, so `localhost:8080/metrics` and
 * `example.com:8443/health` both match SCHEME_RE — and the scheme-less fallback never ran,
 * so the port was rendered as the host and the tool was confidently wrong with no diagnostic.
 * A colon with no `//`, a non-opaque scheme name, and a plausible port after it means this is
 * really `host:port` pasted without a scheme.
 */
function looksLikeHostPort(trimmed: string, schemeToken: string): boolean {
  const name = schemeToken.slice(0, -1).toLowerCase();
  if (OPAQUE_SCHEMES.has(name)) return false;
  const rest = trimmed.slice(schemeToken.length);
  if (rest.startsWith('//')) return false;
  return /^\d{1,5}(?:[/?#]|$)/.test(rest);
}

function componentsOf(url: URL, rawAuthority: string): UrlComponent[] {
  const rows: UrlComponent[] = [];
  rows.push({
    label: 'Scheme',
    value: url.protocol.replace(/:$/, ''),
    gloss: 'The protocol — everything before the first colon.',
  });
  if (url.username || url.password) {
    rows.push({
      label: 'Credentials',
      value: url.password ? `${url.username}:${url.password}` : url.username,
      gloss: 'The userinfo part, before the @. Deprecated and usually stripped.',
    });
  }
  rows.push({
    label: 'Host',
    value: url.hostname,
    raw: rawAuthority && rawAuthority !== url.hostname ? rawAuthority : undefined,
    gloss: 'The registrable name or IP, lower-cased and IDN-converted.',
  });
  if (url.port) {
    rows.push({
      label: 'Port',
      value: url.port,
      gloss: 'Shown only when it is not the scheme’s default.',
    });
  }
  rows.push({
    label: 'Path',
    value: url.pathname,
    gloss: 'Everything from the first / up to the ? — percent-encoded.',
  });
  const decodedPath = decode(url.pathname, { plusAsSpace: false });
  if (decodedPath.output !== url.pathname) {
    rows.push({
      label: 'Path (decoded)',
      value: decodedPath.output,
      gloss: 'The same path with its escapes resolved — what the file is really called.',
    });
  }
  if (url.search) {
    rows.push({
      label: 'Query',
      value: url.search.replace(/^\?/, ''),
      gloss: 'Parsed into the parameter table below.',
    });
  }
  if (url.hash) {
    rows.push({
      label: 'Fragment',
      value: url.hash.replace(/^#/, ''),
      gloss: 'Client-side only — never sent to the server.',
    });
  }
  rows.push({
    label: 'Origin',
    value: url.origin,
    gloss: 'Scheme + host + port. The unit browsers isolate for same-origin policy.',
  });
  rows.push({
    label: 'As browsers see it',
    value: url.href,
    gloss: 'The WHATWG-normalized serialization every HTTP client will send.',
  });
  return rows;
}

function emptyParse(input: string): ParseResult {
  return {
    mode: 'parse',
    ok: false,
    input,
    summary: '',
    diagnostics: [],
    href: null,
    components: [],
    queryOnly: false,
    assumedScheme: false,
    isPunycode: false,
    rawQuery: '',
    fragment: null,
    params: [],
    plusAsSpace: false,
  };
}

/**
 * Split a URL (or a bare query string) into components and parameter rows.
 *
 * Accepted input shapes:
 *   1. `https://host/path?a=1#f`  — an absolute URL, parsed as-is.
 *   2. `?a=1&b=2`                 — a bare query string (leading `?`).
 *   3. `a=1&b=2`                  — a form body: no scheme, and the text before
 *                                   the first `/?#` already contains `=` or `&`.
 *   4. `host/path?a=1`            — no scheme: `https://` is assumed, with a note.
 */
export function parseUrl(input: string, opts: ParseOptions = {}): ParseResult {
  const plusAsSpace = opts.plusAsSpace ?? 'auto';
  const trimmed = input.trim();
  if (trimmed.length === 0) return emptyParse(input);

  // Absolute offsets are reported against the ORIGINAL input, so a diagnostic
  // index still points at the right character after leading whitespace.
  const base = input.length - input.trimStart().length;
  const diagnostics: Diagnostic[] = [];

  if (input.length > MAX_SHARE_LEN) {
    diagnostics.push({ level: 'info', code: 'long-input', message: longInputMsg(input.length) });
  }

  const raw = findRawBreak(trimmed);
  if (raw) {
    const result = emptyParse(input);
    return {
      ...result,
      summary: `Invalid — ${rawNewlineMsg(raw.kind, base + raw.at)}`,
      diagnostics: [
        ...diagnostics,
        {
          level: 'error',
          code: 'raw-newline',
          at: base + raw.at,
          message: rawNewlineMsg(raw.kind, base + raw.at),
        },
      ],
    };
  }

  const hashIdx = trimmed.indexOf('#');
  const beforeHash = hashIdx === -1 ? trimmed : trimmed.slice(0, hashIdx);
  const fragment = hashIdx === -1 ? null : trimmed.slice(hashIdx + 1);
  const schemeMatch = SCHEME_RE.exec(trimmed);
  const hasScheme = schemeMatch !== null && !looksLikeHostPort(trimmed, schemeMatch[0]);
  const scheme = hasScheme ? schemeMatch : null;
  // Strip `scheme://` before looking for the authority, or `https://x.test/a`
  // would split on the `//` and report the authority as `https:`.
  const afterScheme = scheme
    ? beforeHash.slice(scheme[0].length).replace(/^\/\//, '')
    : beforeHash;
  const authorityish = afterScheme.split(/[/?#]/)[0];

  let queryOnly = false;
  let rawQuery = '';
  let queryOffset = base;

  if (trimmed.startsWith('?')) {
    queryOnly = true;
    rawQuery = beforeHash.slice(1);
    queryOffset = base + 1;
  } else if (!hasScheme && /[=&]/.test(authorityish)) {
    // A bare form body — `a=1&b=2` has no host, and `new URL()` would happily
    // accept the whole thing AS a host (`=` and `&` are legal host characters).
    queryOnly = true;
    rawQuery = beforeHash;
    queryOffset = base;
  } else {
    const qIdx = beforeHash.indexOf('?');
    if (qIdx !== -1) {
      rawQuery = beforeHash.slice(qIdx + 1);
      queryOffset = base + qIdx + 1;
    }
  }

  let url: URL | null = null;
  let assumedScheme = false;
  if (!queryOnly) {
    const candidate = hasScheme ? trimmed : 'https://' + trimmed;
    assumedScheme = !hasScheme;
    try {
      url = new URL(candidate);
    } catch {
      const result = emptyParse(input);
      const message = NOT_A_URL_MSG.replace('%INPUT%', quoteForMessage(trimmed));
      return {
        ...result,
        assumedScheme,
        summary: `Invalid — ${message}`,
        diagnostics: [...diagnostics, { level: 'error', code: 'not-a-url', message }],
      };
    }
  }

  const query = parseQuery(rawQuery, { offset: queryOffset, plusAsSpace });
  let ok = query.ok;

  let isPunycode = false;
  let components: UrlComponent[] = [];
  if (url) {
    const rawAuthority = authorityish.split('@').pop() ?? '';
    components = componentsOf(url, rawAuthority);
    isPunycode = /(^|\.)xn--/i.test(url.hostname);

    if (assumedScheme) {
      diagnostics.push({ level: 'info', code: 'assumed-scheme', message: assumedSchemeMsg(url.href) });
    }
    if (url.username || url.password) {
      diagnostics.push({ level: 'warning', code: 'userinfo-credentials', message: USERINFO_MSG });
    }
    if (isPunycode) {
      const rawHost = rawAuthority.replace(/:\d+$/, '');
      diagnostics.push({
        level: 'info',
        code: 'punycode-host',
        message:
          rawHost && rawHost.toLowerCase() !== url.hostname
            ? punycodeConvertedMsg(rawHost, url.hostname)
            : punycodeAlreadyMsg(url.hostname),
      });
    }
    const asTyped = hasScheme ? trimmed : 'https://' + trimmed;
    if (url.href !== asTyped && url.href !== asTyped + '/') {
      diagnostics.push({ level: 'info', code: 'whatwg-normalized', message: normalizedMsg(url.href) });
    }
  }

  if (fragment !== null && /[=&]/.test(fragment)) {
    diagnostics.push({ level: 'info', code: 'fragment-not-query', message: fragmentMsg(fragment) });
  }

  const lowercase = lowercaseHexInfo(trimmed, base);
  if (lowercase) diagnostics.push(lowercase);

  diagnostics.push(...query.diagnostics);

  const firstError = diagnostics.find((d) => d.level === 'error');
  if (firstError) ok = false;

  const duplicates = query.params.filter((p) => p.isDuplicate).length;
  const warnings = diagnostics.filter((d) => d.level === 'warning').length;
  const parts: string[] = [
    `${query.params.length} param${query.params.length === 1 ? '' : 's'}`,
  ];
  if (duplicates) parts.push(`${duplicates} duplicate${duplicates === 1 ? '' : 's'}`);
  if (warnings) parts.push(`${warnings} warning${warnings === 1 ? '' : 's'}`);

  return {
    mode: 'parse',
    ok,
    input,
    summary: firstError ? `Invalid — ${firstError.message}` : parts.join(' · '),
    diagnostics,
    href: url ? url.href : null,
    components,
    queryOnly,
    assumedScheme,
    isPunycode,
    rawQuery,
    fragment,
    params: query.params,
    plusAsSpace: query.plusAsSpace,
  };
}

const INTERNAL_MSG =
  'Something went wrong inside the engine on this input. Nothing left your browser — please ' +
  'reload and try a shorter value.';

function internalFallback(input: string, mode: UrlCodecMode): RunResult {
  const diagnostics: Diagnostic[] = [
    { level: 'error', code: 'internal', message: INTERNAL_MSG },
  ];
  if (mode === 'encode') {
    return {
      mode: 'encode',
      ok: false,
      input,
      summary: `Invalid — ${INTERNAL_MSG}`,
      diagnostics,
      output: '',
      scope: 'component',
      form: false,
      jsEquivalent: null,
      encodedCount: 0,
    };
  }
  if (mode === 'decode') {
    return {
      mode: 'decode',
      ok: false,
      input,
      summary: `Invalid — ${INTERNAL_MSG}`,
      diagnostics,
      output: '',
      plusAsSpace: false,
      doubleEncoded: false,
      decodedCount: 0,
    };
  }
  return { ...emptyParse(input), summary: `Invalid — ${INTERNAL_MSG}`, diagnostics };
}

/** Normalize anything (including a value off a URL fragment) to a real mode. */
export function toMode(value: unknown): UrlCodecMode {
  return value === 'encode' || value === 'decode' ? value : 'parse';
}

/**
 * The playground's single entry point. Dispatches on mode and can never throw —
 * an unexpected failure becomes an `internal` error diagnostic instead.
 */
export function run(input: string, mode: UrlCodecMode, opts: RunOptions = {}): RunResult {
  const resolved = toMode(mode);
  try {
    if (resolved === 'encode') return encode(input, opts);
    if (resolved === 'decode') return decode(input, opts);
    return parseUrl(input, opts);
  } catch {
    return internalFallback(input, resolved);
  }
}

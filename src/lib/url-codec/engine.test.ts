/**
 * URL Encoder / Decoder + Query-String Parser — engine tests.
 *
 * Structure mirrors the four acceptance milestones in the build plan:
 *   1. percent core (encode / decode, incl. the `+` vs `%20` split)
 *   2. query parser (rows, duplicates, bare keys, separators)
 *   3. parseUrl (WHATWG components, punycode, scheme assumption, fragments)
 *   4. exact diagnostic strings, pinned verbatim
 * followed by the deep-link fragment, ground-truth property tests against the
 * JavaScript built-ins, and a never-throws fuzz sweep.
 *
 * The diagnostic sentences are asserted as literals on purpose. They are part of
 * this tool's contract twice over: the playground shows them to the user, and
 * `tests/e2e/tools.fixtures.ts` pins one of them byte-for-byte as the E2E
 * `calmErrorString`. Importing the message constants instead would let a typo
 * pass both here and there.
 */
import { describe, expect, it } from 'vitest';
import { decode, encode, parseUrl, parseQuery, paramLines, run, toMode } from './engine';
import { decodePercent, plusMeansSpace } from './percent';
import { buildUrlCodecHash, parseUrlCodecHash, MAX_HASH_LEN } from './hash';
import { examples } from './examples';
import type { Diagnostic, DiagnosticLevel } from './types';

/** All diagnostics carrying `code`, in order. */
function byCode(diagnostics: Diagnostic[], code: string): Diagnostic[] {
  return diagnostics.filter((d) => d.code === code);
}

function codes(diagnostics: Diagnostic[]): string[] {
  return diagnostics.map((d) => d.code);
}

function levelOf(diagnostics: Diagnostic[], code: string): DiagnosticLevel | undefined {
  return diagnostics.find((d) => d.code === code)?.level;
}

function messageOf(diagnostics: Diagnostic[], code: string): string {
  return byCode(diagnostics, code)[0]?.message ?? '(no such diagnostic)';
}

/* ══════════════════════════════════════════════════════════════════════════
   1. Percent core
   ══════════════════════════════════════════════════════════════════════════ */

describe('encode — + vs %20 (pinned edge case 1)', () => {
  it('encodes a space as %20 under RFC 3986 rules', () => {
    const result = encode('a b', { scope: 'component' });
    expect(result.output).toBe('a%20b');
    expect(result.form).toBe(false);
    expect(result.encodedCount).toBe(1);
    expect(result.jsEquivalent).toBe('encodeURIComponent');
  });

  it('encodes a space as + under form-urlencoded rules', () => {
    const result = encode('a b', { form: true });
    expect(result.output).toBe('a+b');
    expect(result.form).toBe(true);
    expect(result.jsEquivalent).toBe('URLSearchParams');
  });

  it('splits on ~ too: unreserved in RFC 3986, escaped by form rules', () => {
    expect(encode('a~b', { scope: 'component' }).output).toBe('a~b');
    expect(encode('a~b', { form: true }).output).toBe('a%7Eb');
  });
});

describe('encode — component vs full-url scope (pinned edge case 2)', () => {
  it('escapes reserved characters in component scope', () => {
    const result = encode('a=b&c/d', { scope: 'component' });
    expect(result.output).toBe('a%3Db%26c%2Fd');
    expect(result.encodedCount).toBe(3);
  });

  it('leaves reserved characters alone in full-url scope', () => {
    const result = encode('a=b&c/d', { scope: 'full-url' });
    expect(result.output).toBe('a=b&c/d');
    expect(result.encodedCount).toBe(0);
    expect(result.jsEquivalent).toBe('encodeURI');
  });

  it('defaults to component scope', () => {
    expect(encode('a/b').output).toBe('a%2Fb');
    expect(encode('a/b').scope).toBe('component');
  });
});

describe('encode — the RFC 3986 reserved set, per scope (pinned edge case 14)', () => {
  const reserved = ":/?#[]@!$&'()*+,;=";

  it('component scope escapes every reserved character', () => {
    expect(encode(reserved, { scope: 'component' }).output).toBe(
      '%3A%2F%3F%23%5B%5D%40%21%24%26%27%28%29%2A%2B%2C%3B%3D',
    );
  });

  it('full-url scope keeps gen-delims and sub-delims, escaping only [ and ]', () => {
    expect(encode(reserved, { scope: 'full-url' }).output).toBe(":/?#%5B%5D@!$&'()*+,;=");
  });

  it('keeps the unreserved set untouched in every scope', () => {
    const unreserved = 'AZaz09-._~';
    expect(encode(unreserved, { scope: 'component' }).output).toBe(unreserved);
    expect(encode(unreserved, { scope: 'full-url' }).output).toBe(unreserved);
  });
});

describe('encode — Unicode and lone surrogates (pinned edge case 12)', () => {
  it('encodes café as UTF-8 bytes', () => {
    expect(encode('café').output).toBe('caf%C3%A9');
  });

  it('encodes an astral emoji as four bytes', () => {
    expect(encode('🌍').output).toBe('%F0%9F%8C%8D');
  });

  it('never throws on a lone surrogate — encodeURIComponent does', () => {
    expect(() => encodeURIComponent('\uD83C')).toThrow(URIError);
    const result = encode('\uD83C');
    expect(result.output).toBe('%EF%BF%BD');
    expect(levelOf(result.diagnostics, 'lone-surrogate')).toBe('warning');
    expect(byCode(result.diagnostics, 'lone-surrogate')[0].at).toBe(0);
  });

  it('reports the lone surrogate at its index and keeps the rest intact', () => {
    const result = encode('ab\uDC00cd');
    expect(result.output).toBe('ab%EF%BF%BDcd');
    expect(byCode(result.diagnostics, 'lone-surrogate')[0].at).toBe(2);
  });

  it('leaves a well-formed surrogate pair alone', () => {
    expect(codes(encode('a🌍b').diagnostics)).not.toContain('lone-surrogate');
  });
});

describe('decode — basics and the + convention', () => {
  it('decodes UTF-8 escapes back to text', () => {
    expect(decode('caf%C3%A9').output).toBe('café');
    expect(decode('%F0%9F%8C%8D').output).toBe('🌍');
  });

  it('treats + as a space in something that looks like a form body', () => {
    const result = decode('name=Ada+Lovelace');
    expect(result.plusAsSpace).toBe(true);
    expect(result.output).toBe('name=Ada Lovelace');
    expect(codes(result.diagnostics)).toContain('plus-as-space');
  });

  it('keeps + literal inside an absolute URL', () => {
    const result = decode('https://x.test/a+b');
    expect(result.plusAsSpace).toBe(false);
    expect(result.output).toBe('https://x.test/a+b');
    expect(codes(result.diagnostics)).toContain('plus-literal');
  });

  it('honours an explicit override in both directions', () => {
    expect(decode('a+b', { plusAsSpace: false }).output).toBe('a+b');
    expect(decode('https://x.test/a+b', { plusAsSpace: true }).output).toBe('https://x.test/a b');
  });

  it('says nothing about + when there is no + to talk about', () => {
    const quiet = decode('a%20b');
    expect(codes(quiet.diagnostics)).not.toContain('plus-as-space');
    expect(codes(quiet.diagnostics)).not.toContain('plus-literal');
  });

  it('plusMeansSpace is the documented heuristic', () => {
    expect(plusMeansSpace('a+b')).toBe(false); // no = or &, not a form body
    expect(plusMeansSpace('a=b+c')).toBe(true);
    expect(plusMeansSpace('a&b+c')).toBe(true);
    expect(plusMeansSpace('https://x.test/?a=b+c')).toBe(false); // whole URL
    expect(plusMeansSpace('nothing here')).toBe(false);
  });

  it('decodes lowercase hex escapes (pinned edge case 18a)', () => {
    const result = decode('%3a');
    expect(result.output).toBe(':');
    expect(levelOf(result.diagnostics, 'lowercase-hex')).toBe('info');
  });

  it('is empty-safe', () => {
    const result = decode('');
    expect(result.ok).toBe(false);
    expect(result.output).toBe('');
    expect(result.diagnostics).toEqual([]);
    expect(result.summary).toBe('');
  });
});

describe('decode — double encoding (pinned edge case 3)', () => {
  it('detects %2520 and reports what a second pass yields', () => {
    const result = decode('%2520');
    expect(result.output).toBe('%20');
    expect(result.doubleEncoded).toBe(true);
    expect(result.decodedTwice).toBe(' ');
    expect(levelOf(result.diagnostics, 'double-encoded')).toBe('warning');
    expect(result.summary).toBe('5 → 3 chars · 1 escape decoded · double-encoded');
  });

  it('detects a double-encoded redirect_uri', () => {
    const result = decode('redirect_uri%3Dhttps%253A%252F%252Fapp.example.com', {
      plusAsSpace: false,
    });
    expect(result.output).toBe('redirect_uri=https%3A%2F%2Fapp.example.com');
    expect(result.doubleEncoded).toBe(true);
    expect(result.decodedTwice).toBe('redirect_uri=https://app.example.com');
  });

  it('does not flag a single-encoded value', () => {
    const result = decode('https%3A%2F%2Fapp.example.com');
    expect(result.output).toBe('https://app.example.com');
    expect(result.doubleEncoded).toBe(false);
    expect(result.decodedTwice).toBeUndefined();
  });

  it('does not mistake a literal percent sign for an escape', () => {
    const result = decode('100%25 of the time', { plusAsSpace: false });
    expect(result.output).toBe('100% of the time');
    expect(result.doubleEncoded).toBe(false);
  });
});

describe('decode — malformed escapes (pinned edge cases 4 and 5)', () => {
  it('rejects %ZZ at its exact position and keeps the rest readable', () => {
    const result = decode('a%20%ZZb');
    expect(result.ok).toBe(false);
    expect(byCode(result.diagnostics, 'bad-escape')).toHaveLength(1);
    expect(byCode(result.diagnostics, 'bad-escape')[0].at).toBe(4);
    expect(result.output).toBe('a %ZZb');
  });

  it('rejects a trailing % as a truncated escape', () => {
    const result = decode('value%');
    expect(result.ok).toBe(false);
    expect(byCode(result.diagnostics, 'truncated-escape')[0].at).toBe(5);
  });

  it('rejects "% A" — a percent followed by non-hex', () => {
    const result = decode('100% A');
    expect(result.ok).toBe(false);
    expect(codes(result.diagnostics)).toContain('bad-escape');
  });

  it('rejects a single hex digit at the end as truncated', () => {
    const result = decode('abcd%A');
    expect(result.ok).toBe(false);
    expect(byCode(result.diagnostics, 'truncated-escape')[0].at).toBe(4);
  });

  it('reports every malformed escape, not just the first', () => {
    const result = decode('%ZZ and %YY');
    expect(byCode(result.diagnostics, 'bad-escape')).toHaveLength(2);
  });

  it('skips double-encoding detection while the input is malformed', () => {
    expect(decode('%ZZ%2520').doubleEncoded).toBe(false);
  });
});

describe('decode — invalid UTF-8 (pinned edge case 6)', () => {
  it('replaces %C3%28 with U+FFFD and warns', () => {
    const result = decode('%C3%28');
    expect(result.output).toBe('�(');
    expect(levelOf(result.diagnostics, 'invalid-utf8')).toBe('warning');
    expect(result.ok).toBe(true); // a warning, not an error: the value still decodes
  });

  it('flags a continuation byte with no lead byte', () => {
    const result = decode('%80');
    expect(result.output).toBe('�');
    expect(codes(result.diagnostics)).toContain('invalid-utf8');
  });

  it('flags a truncated multi-byte sequence', () => {
    const result = decode('caf%C3');
    expect(codes(result.diagnostics)).toContain('invalid-utf8');
    expect(result.output).toBe('caf�');
  });

  it('accepts a Latin-1 %E9 as invalid UTF-8 rather than silently guessing', () => {
    const result = decode('caf%E9');
    expect(codes(result.diagnostics)).toContain('invalid-utf8');
  });

  it('says nothing for well-formed UTF-8', () => {
    expect(codes(decode('caf%C3%A9').diagnostics)).not.toContain('invalid-utf8');
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   2. Query parser
   ══════════════════════════════════════════════════════════════════════════ */

describe('parseQuery — rows', () => {
  it('splits on & and on the first = only', () => {
    const { params } = parseQuery('a=1&b=x=y');
    expect(params).toHaveLength(2);
    expect(params[1].key).toBe('b');
    expect(params[1].value).toBe('x=y');
  });

  it('keeps repeated keys as separate rows and flags the later ones (pinned edge case 7)', () => {
    const { params, diagnostics } = parseQuery('utm_source=newsletter&x=1&utm_source=twitter');
    expect(params.map((p) => p.key)).toEqual(['utm_source', 'x', 'utm_source']);
    expect(params.map((p) => p.isDuplicate)).toEqual([false, false, true]);
    expect(levelOf(diagnostics, 'duplicate-key')).toBe('warning');
  });

  it('keeps tags[] literal instead of grouping it (pinned edge case 8)', () => {
    const { params, diagnostics } = parseQuery('tags[]=devops&tags[]=sre');
    expect(params.map((p) => p.key)).toEqual(['tags[]', 'tags[]']);
    expect(params.map((p) => p.value)).toEqual(['devops', 'sre']);
    expect(levelOf(diagnostics, 'array-key')).toBe('info');
    expect(byCode(diagnostics, 'array-key')).toHaveLength(1); // noted once, not per row
  });

  it('distinguishes an empty value from a bare key (pinned edge case 10)', () => {
    const { params, diagnostics } = parseQuery('a=&b');
    expect(params[0]).toMatchObject({ key: 'a', value: '', hasValue: true, rawValue: '' });
    expect(params[1]).toMatchObject({ key: 'b', value: '', hasValue: false, rawValue: null });
    expect(levelOf(diagnostics, 'bare-key')).toBe('info');
  });

  it('warns about a semicolon without splitting on it (pinned edge case 9)', () => {
    const { params, diagnostics } = parseQuery('a=1;b=2');
    // Ground truth: URLSearchParams does NOT treat ";" as a separator.
    expect(new URLSearchParams('a=1;b=2').get('a')).toBe('1;b=2');
    expect(params).toHaveLength(1);
    expect(params[0].value).toBe('1;b=2');
    expect(levelOf(diagnostics, 'semicolon-separator')).toBe('warning');
  });

  it('decodes keys and values, with + as space inside a query', () => {
    const { params } = parseQuery('full+name=Ada+Lovelace&note=100%25');
    expect(params[0].key).toBe('full name');
    expect(params[0].value).toBe('Ada Lovelace');
    expect(params[1].value).toBe('100%');
    // Ground truth: this is exactly what URLSearchParams does.
    expect(new URLSearchParams('full+name=Ada+Lovelace').get('full name')).toBe('Ada Lovelace');
  });

  it('keeps the raw text alongside the decoded text', () => {
    const { params } = parseQuery('channel=%23alerts');
    expect(params[0].rawValue).toBe('%23alerts');
    expect(params[0].value).toBe('#alerts');
  });

  it('notes empty segments and empty names', () => {
    const first = parseQuery('a=1&&b=2');
    expect(first.params).toHaveLength(2);
    expect(codes(first.diagnostics)).toContain('empty-segment');
    const second = parseQuery('=orphan');
    expect(second.params[0].key).toBe('');
    expect(codes(second.diagnostics)).toContain('empty-name');
  });

  it('propagates a malformed escape inside a value as an error', () => {
    const { ok, diagnostics, params } = parseQuery('a=%ZZ');
    expect(ok).toBe(false);
    expect(codes(diagnostics)).toContain('bad-escape');
    expect(params[0].diagnostics[0].where).toBe('value of "a"');
  });

  it('flags a double-encoded value on the row itself', () => {
    const { params } = parseQuery('next=https%253A%252F%252Fapp.example.com');
    expect(params[0].doubleEncoded).toBe(true);
  });

  it('is empty-safe and offset-aware', () => {
    expect(parseQuery('').params).toEqual([]);
    expect(parseQuery('').diagnostics).toEqual([]);
    const { diagnostics } = parseQuery('a=%ZZ', { offset: 100 });
    expect(byCode(diagnostics, 'bad-escape')[0].at).toBe(102);
  });

  it('builds decoded key=value lines for Copy all', () => {
    const { params } = parseQuery('channel=%23alerts&text=Deploy%20failed');
    expect(paramLines(params)).toBe('channel=#alerts\ntext=Deploy failed');
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   3. parseUrl
   ══════════════════════════════════════════════════════════════════════════ */

describe('parseUrl — components', () => {
  it('splits an absolute URL into WHATWG components', () => {
    const result = parseUrl('https://api.example.com:8443/v1/users?limit=10#top');
    expect(result.ok).toBe(true);
    expect(result.href).toBe('https://api.example.com:8443/v1/users?limit=10#top');
    const values = Object.fromEntries(result.components.map((c) => [c.label, c.value]));
    expect(values.Scheme).toBe('https');
    expect(values.Host).toBe('api.example.com');
    expect(values.Port).toBe('8443');
    expect(values.Path).toBe('/v1/users');
    expect(values.Query).toBe('limit=10');
    expect(values.Fragment).toBe('top');
    expect(values.Origin).toBe('https://api.example.com:8443');
  });

  it('drops a default port the way browsers do', () => {
    const result = parseUrl('https://x.test:443/a');
    expect(result.components.some((c) => c.label === 'Port')).toBe(false);
    expect(result.href).toBe('https://x.test/a');
  });

  it('adds a decoded path row when the path carries escapes', () => {
    const result = parseUrl('https://x.test/services/T024%2FB01');
    const decoded = result.components.find((c) => c.label === 'Path (decoded)');
    expect(decoded?.value).toBe('/services/T024/B01');
  });

  it('assumes https for a scheme-less input (pinned edge case 18b)', () => {
    const result = parseUrl('x.test/a?b=1');
    expect(result.assumedScheme).toBe(true);
    expect(result.href).toBe('https://x.test/a?b=1');
    expect(levelOf(result.diagnostics, 'assumed-scheme')).toBe('info');
    expect(result.params[0].key).toBe('b');
  });

  it('never assumes a scheme when one is present', () => {
    const result = parseUrl('http://x.test/');
    expect(result.assumedScheme).toBe(false);
    expect(codes(result.diagnostics)).not.toContain('assumed-scheme');
  });

  it('warns about credentials in the userinfo part (pinned edge case 17)', () => {
    const result = parseUrl('https://svc:s3cr3t@db.example/health');
    expect(levelOf(result.diagnostics, 'userinfo-credentials')).toBe('warning');
    const creds = result.components.find((c) => c.label === 'Credentials');
    expect(creds?.value).toBe('svc:s3cr3t');
    // The host row must be the host, not the userinfo.
    expect(result.components.find((c) => c.label === 'Host')?.value).toBe('db.example');
  });

  it('converts an IDN host to punycode and says so (pinned edge case 13)', () => {
    const result = parseUrl('https://münchen.example/straße');
    expect(result.isPunycode).toBe(true);
    expect(result.components.find((c) => c.label === 'Host')?.value).toBe(
      'xn--mnchen-3ya.example',
    );
    expect(result.components.find((c) => c.label === 'Host')?.raw).toBe('münchen.example');
    expect(levelOf(result.diagnostics, 'punycode-host')).toBe('info');
  });

  it('recognises a host that is already punycode, and never reverses it', () => {
    const result = parseUrl('https://xn--mnchen-3ya.example/');
    expect(result.isPunycode).toBe(true);
    expect(messageOf(result.diagnostics, 'punycode-host')).toContain('is already punycode');
  });

  it('rejects a raw newline before the URL parser can swallow it (pinned edge case 15)', () => {
    const result = parseUrl('https://x.test/a\nb?c=1');
    expect(result.ok).toBe(false);
    expect(byCode(result.diagnostics, 'raw-newline')[0].at).toBe(16);
    // Ground truth for why this matters: WHATWG strips it silently.
    expect(new URL('https://x.test/a\nb?c=1').pathname).toBe('/ab');
  });

  it('rejects a tab and a CR the same way', () => {
    expect(codes(parseUrl('https://x.test/a\tb').diagnostics)).toContain('raw-newline');
    expect(codes(parseUrl('https://x.test/a\rb').diagnostics)).toContain('raw-newline');
  });

  it('reports an unparseable input specifically', () => {
    const result = parseUrl('%%%');
    expect(result.ok).toBe(false);
    expect(levelOf(result.diagnostics, 'not-a-url')).toBe('error');
  });

  it('is empty-safe', () => {
    const result = parseUrl('   ');
    expect(result.ok).toBe(false);
    expect(result.params).toEqual([]);
    expect(result.diagnostics).toEqual([]);
    expect(result.summary).toBe('');
  });
});

describe('parseUrl — query and fragment', () => {
  it('never parses the fragment as parameters (pinned edge case 11)', () => {
    const result = parseUrl('https://x.test/?a=1#b=2');
    expect(result.params.map((p) => p.key)).toEqual(['a']);
    expect(result.fragment).toBe('b=2');
    expect(levelOf(result.diagnostics, 'fragment-not-query')).toBe('info');
  });

  it('stays quiet about an ordinary fragment', () => {
    const result = parseUrl('https://x.test/?a=1#section-2');
    expect(codes(result.diagnostics)).not.toContain('fragment-not-query');
  });

  it('parses a bare query string that starts with ?', () => {
    const result = parseUrl('?a=1&b=2');
    expect(result.queryOnly).toBe(true);
    expect(result.href).toBeNull();
    expect(result.components).toEqual([]);
    expect(result.params.map((p) => p.key)).toEqual(['a', 'b']);
  });

  it('parses a bare form body with no scheme and no ?', () => {
    const result = parseUrl('name=Ada+Lovelace&role=sre');
    expect(result.queryOnly).toBe(true);
    expect(result.params[0].value).toBe('Ada Lovelace');
    // Without the form-body detection this would parse as a HOST — `=` and `&`
    // are legal host characters, so `new URL()` accepts it silently.
    expect(new URL('https://name=Ada&role=sre').hostname).toBe('name=ada&role=sre');
  });

  it('reports the resolved + convention so the UI never has to guess', () => {
    expect(parseUrl('https://x.test/?a=b+c').plusAsSpace).toBe(true);
    expect(parseUrl('https://x.test/?a=bc').plusAsSpace).toBe(false);
    expect(parseUrl('https://x.test/?a=b+c', { plusAsSpace: false }).plusAsSpace).toBe(false);
    expect(parseUrl('https://x.test/?a=b+c', { plusAsSpace: false }).params[0].value).toBe('b+c');
  });

  it('uses the raw query text for offsets, not the normalized one', () => {
    const result = parseUrl('https://x.test/?a=%ZZ');
    expect(result.rawQuery).toBe('a=%ZZ');
    expect(byCode(result.diagnostics, 'bad-escape')[0].at).toBe(18);
    expect(result.ok).toBe(false);
  });

  it('notes WHATWG normalization when it changes the URL', () => {
    const result = parseUrl('https://X.TEST/a/./b?q=<x>');
    expect(result.href).toBe('https://x.test/a/b?q=%3Cx%3E');
    expect(levelOf(result.diagnostics, 'whatwg-normalized')).toBe('info');
  });

  it('notes an input past the shareable-fragment cap (pinned edge case 16a)', () => {
    const long = 'https://x.test/?q=' + 'a'.repeat(2413);
    expect(long).toHaveLength(2431);
    const result = parseUrl(long);
    expect(result.ok).toBe(true);
    expect(levelOf(result.diagnostics, 'long-input')).toBe('info');
    expect(codes(parseUrl('https://x.test/?q=a').diagnostics)).not.toContain('long-input');
  });

  it('summarises parameter counts for the status line', () => {
    expect(parseUrl('https://x.test/?a=1').summary).toBe('1 param');
    expect(parseUrl('https://x.test/?a=1&a=2').summary).toBe('2 params · 1 duplicate · 1 warning');
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   4. Exact diagnostic strings — pinned verbatim
   ══════════════════════════════════════════════════════════════════════════ */

describe('diagnostic wording (pinned byte-for-byte)', () => {
  it('bad-escape names the sequence and the index', () => {
    expect(messageOf(decode('a%20%ZZb').diagnostics, 'bad-escape')).toBe(
      'Invalid percent-escape "%ZZ" at index 4 — "%" must be followed by two hex digits ' +
        '(0-9, A-F). Percent-encode a literal "%" as "%25".',
    );
  });

  it('truncated-escape distinguishes a trailing % from one hex digit', () => {
    expect(messageOf(decode('value%').diagnostics, 'truncated-escape')).toBe(
      'Truncated percent-escape at index 5 — "%" is the last character, so both of its hex ' +
        'digits are missing. Percent-encode a literal "%" as "%25".',
    );
    expect(messageOf(decode('abcd%A').diagnostics, 'truncated-escape')).toBe(
      'Truncated percent-escape "%A" at index 4 — "%" needs two hex digits but only 1 ' +
        'character follows. Percent-encode a literal "%" as "%25".',
    );
  });

  it('invalid-utf8 names the offending bytes and the Latin-1 cause', () => {
    expect(messageOf(decode('%C3%28').diagnostics, 'invalid-utf8')).toBe(
      'Bytes %C3 %28 are not valid UTF-8 — they decoded to U+FFFD (the replacement ' +
        'character). %C3 must be followed by a continuation byte in the %80–%BF range. This ' +
        'usually means the text was percent-encoded from Latin-1, not UTF-8.',
    );
    expect(messageOf(decode('%80').diagnostics, 'invalid-utf8')).toBe(
      'Byte %80 is not valid UTF-8 — it decoded to U+FFFD (the replacement character). No ' +
        'UTF-8 character can start with it: lead bytes are %00–%7F, %C2–%DF, %E0–%EF and %F0–%F4.',
    );
    expect(messageOf(decode('caf%C3').diagnostics, 'invalid-utf8')).toBe(
      'Sequence %C3 is incomplete UTF-8 — it decoded to U+FFFD (the replacement character). ' +
        '%C3 announces a multi-byte character, but the value ends before its continuation bytes.',
    );
  });

  it('lone-surrogate points at encodeURIComponent throwing', () => {
    expect(messageOf(encode('\uD83C').diagnostics, 'lone-surrogate')).toBe(
      'Input contains an unpaired UTF-16 surrogate at index 0 — encodeURIComponent() throws a ' +
        'URIError on this. It was encoded as the replacement character U+FFFD (%EF%BF%BD) ' +
        'instead, so the rest of the value still round-trips.',
    );
  });

  it('double-encoded shows both passes and the "decode again" outcome', () => {
    expect(messageOf(decode('%2520').diagnostics, 'double-encoded')).toBe(
      'This value is double-encoded: decoding once gives "%20", which still contains escapes; ' +
        'decoding that again gives " ". Something percent-encoded it twice — usually a client ' +
        'that called encodeURIComponent() on an already-encoded URL.',
    );
  });

  it('plus-as-space and plus-literal explain the choice they made', () => {
    expect(messageOf(decode('a=b+c').diagnostics, 'plus-as-space')).toBe(
      '"+" was read as a space because this looks like a query string or form body — the ' +
        'convention comes from HTML form submission, not RFC 3986. Turn "+ is a space" off to ' +
        'keep it literal.',
    );
    expect(messageOf(decode('https://x.test/a+b').diagnostics, 'plus-literal')).toBe(
      '"+" was kept literal because this does not look like a form body. Turn "+ is a space" ' +
        'on if the value came from an application/x-www-form-urlencoded payload, where "+" ' +
        'means U+0020.',
    );
  });

  it('lowercase-hex quotes the escape and its uppercase form', () => {
    expect(messageOf(decode('%3a').diagnostics, 'lowercase-hex')).toBe(
      'Lowercase hex in "%3a" — decoding is case-insensitive, so this decodes correctly. RFC ' +
        '3986 §6.2.2.1 says producers should use uppercase ("%3A"), which is what the Encode ' +
        'mode emits.',
    );
  });

  it('rfc-stricter-than-js names the characters that differ', () => {
    const result = encode("a(b)c'd");
    expect(result.jsEquivalent).toBeNull();
    expect(messageOf(result.diagnostics, 'rfc-stricter-than-js')).toBe(
      "RFC 3986 lists ' ( ) as sub-delimiters, so they are percent-encoded here. " +
        'encodeURIComponent() leaves them alone — that is the one place the browser built-in ' +
        'is not component-safe, and the difference bites inside OAuth redirect_uri values.',
    );
  });

  it('semicolon-separator explains the 2014 spec change', () => {
    expect(messageOf(parseQuery('a=1;b=2').diagnostics, 'semicolon-separator')).toBe(
      'Found ";" in the query string. Browsers and URLSearchParams treat it as an ordinary ' +
        'character, not a separator — the pre-2014 convention of splitting on ";" was dropped ' +
        'from the HTML spec, so it is kept literal here. Split on "&" only.',
    );
  });

  it('bare-key separates "b" from "b="', () => {
    expect(messageOf(parseQuery('a=&b').diagnostics, 'bare-key')).toBe(
      'This query contains a bare key with no "=". A bare key is not the same as an empty ' +
        'value: "b" and "b=" arrive differently, and frameworks disagree on whether a bare key ' +
        'means "", null, or true.',
    );
  });

  it('array-key names the key and blames PHP/Rack, not the URL spec', () => {
    expect(messageOf(parseQuery('tags[]=devops').diagnostics, 'array-key')).toBe(
      'Key "tags[]" is kept literal. The trailing "[]" array convention belongs to PHP and ' +
        'Rack, not to the URL spec, so nothing here groups those values — repeated keys are ' +
        'listed as separate rows.',
    );
  });

  it('duplicate-key counts the rows and refuses to pick a winner', () => {
    expect(messageOf(parseQuery('a=1&a=2').diagnostics, 'duplicate-key')).toBe(
      'Key "a" appears 2 times and every value is listed below. No spec says which one wins: ' +
        'PHP and Express keep the last, Go’s r.URL.Query() keeps all of them, and ASP.NET ' +
        'joins them with commas.',
    );
  });

  it('raw-newline names the character class and the index', () => {
    expect(messageOf(parseUrl('https://x.test/a\nb?c=1').diagnostics, 'raw-newline')).toBe(
      'Input contains a raw line break (LF) at index 16. The URL standard strips tab, CR and ' +
        'LF from a URL silently, so a browser would parse this as if the break were not there ' +
        '— remove it, or percent-encode it (%0A for a line feed).',
    );
    expect(messageOf(parseUrl('a\tb').diagnostics, 'raw-newline')).toContain('a raw tab at index 1');
    expect(messageOf(parseUrl('a\rb').diagnostics, 'raw-newline')).toContain(
      'a raw carriage return (CR) at index 1',
    );
  });

  it('userinfo-credentials cites RFC 3986 §3.2.1 and never echoes the password', () => {
    const message = messageOf(parseUrl('https://svc:s3cr3t@db.example/').diagnostics, 'userinfo-credentials');
    expect(message).toBe(
      'This URL carries credentials in its userinfo part (user:password@host). RFC 3986 ' +
        '§3.2.1 deprecates the practice, Chrome and Safari strip it, and proxies log the whole ' +
        'URL — send the secret in an Authorization header instead.',
    );
    expect(message).not.toContain('s3cr3t');
  });

  it('punycode-host shows both forms and refuses to reverse them', () => {
    expect(messageOf(parseUrl('https://münchen.example/').diagnostics, 'punycode-host')).toBe(
      'Host "münchen.example" was converted to punycode: "xn--mnchen-3ya.example". That ASCII ' +
        'form is what DNS actually resolves and what a TLS certificate must match. This tool ' +
        'does not convert punycode back to Unicode.',
    );
  });

  it('assumed-scheme quotes the URL it settled on', () => {
    expect(messageOf(parseUrl('x.test/a?b=1').diagnostics, 'assumed-scheme')).toBe(
      'No scheme in the input, so it was parsed as "https://x.test/a?b=1". Add http:// or ' +
        'https:// explicitly when the scheme matters — a scheme-relative "//host/path" ' +
        'inherits the scheme of whatever page it sits on instead.',
    );
  });

  it('fragment-not-query quotes the fragment', () => {
    expect(messageOf(parseUrl('https://x.test/?a=1#b=2').diagnostics, 'fragment-not-query')).toBe(
      'The fragment "#b=2" is not part of the query string: it is never sent to the server and ' +
        'is not parsed into parameters here. Client-side routers sometimes parse it themselves.',
    );
  });

  it('long-input reports the length with a thousands separator', () => {
    const long = 'https://x.test/?q=' + 'a'.repeat(2413);
    expect(messageOf(parseUrl(long).diagnostics, 'long-input')).toBe(
      'Input is 2,431 characters — past the ~2,000-character cap for a shareable fragment, so ' +
        '"Copy link" stays hidden. Parsing itself is unaffected.',
    );
  });

  it('not-a-url quotes the input and suggests the "?" prefix', () => {
    expect(messageOf(parseUrl('%%%').diagnostics, 'not-a-url')).toBe(
      'Not a URL — "%%%" could not be parsed. A URL needs at least a scheme and a host, e.g. ' +
        'https://example.com/path?a=1. To parse a bare query string, start the input with "?".',
    );
  });

  it('truncates a very long value inside a message instead of pasting a wall', () => {
    const message = messageOf(parseUrl('x'.repeat(400) + '%%%').diagnostics, 'not-a-url');
    expect(message).toContain('…');
    expect(message.length).toBeLessThan(300);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   Ground truth: agreement with the JavaScript built-ins
   ══════════════════════════════════════════════════════════════════════════ */

describe('ground truth against the built-ins', () => {
  const printable = Array.from({ length: 0x7f - 0x20 }, (_, i) => String.fromCharCode(0x20 + i));

  it('full-url scope is encodeURI, character for character', () => {
    for (const ch of printable) {
      expect(encode(ch, { scope: 'full-url' }).output, `char ${JSON.stringify(ch)}`).toBe(
        encodeURI(ch),
      );
    }
  });

  it('form mode is URLSearchParams, character for character', () => {
    for (const ch of printable) {
      const expected = new URLSearchParams([['k', ch]]).toString().slice(2);
      expect(encode(ch, { form: true }).output, `char ${JSON.stringify(ch)}`).toBe(expected);
    }
  });

  it('component scope is encodeURIComponent everywhere except the RFC 2396 marks', () => {
    const marks = new Set(["!", "'", '(', ')', '*']);
    for (const ch of printable) {
      const mine = encode(ch, { scope: 'component' }).output;
      if (marks.has(ch)) {
        expect(mine, `mark ${ch}`).not.toBe(encodeURIComponent(ch));
        expect(mine).toBe('%' + ch.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0'));
      } else {
        expect(mine, `char ${JSON.stringify(ch)}`).toBe(encodeURIComponent(ch));
      }
    }
  });

  it('decode agrees with decodeURIComponent on every well-formed input', () => {
    for (const value of ['a b', 'café', '🌍', 'a/b?c=d#e', '100%', ':;,/?@&=+$']) {
      const encoded = encodeURIComponent(value);
      expect(decode(encoded, { plusAsSpace: false }).output).toBe(decodeURIComponent(encoded));
    }
  });

  it('round-trips through every mode', () => {
    for (const value of ['a b', 'café 🌍', "x!'()*", 'a=b&c/d', '#alerts']) {
      expect(decode(encode(value, { scope: 'component' }).output, { plusAsSpace: false }).output).toBe(value);
      expect(decode(encode(value, { form: true }).output, { plusAsSpace: true }).output).toBe(value);
    }
  });

  it('parses the same parameters URLSearchParams does', () => {
    const query = 'a=1&b=x+y&b=z&c&d=&e=%23alerts&tags[]=one';
    const mine = parseQuery(query).params.map((p) => [p.key, p.value]);
    const theirs = Array.from(new URLSearchParams(query).entries());
    expect(mine).toEqual(theirs);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   Deep-link fragment
   ══════════════════════════════════════════════════════════════════════════ */

describe('#in= deep link (hash-in-hash)', () => {
  it('builds the documented shape', () => {
    expect(buildUrlCodecHash('a b', 'parse')).toBe('#in=a%20b&mode=parse');
  });

  it('round-trips a URL that itself contains #, % and &', () => {
    const input = 'https://x.test/?a=1&b=%2520#frag';
    for (const mode of ['parse', 'decode', 'encode'] as const) {
      expect(parseUrlCodecHash(buildUrlCodecHash(input, mode))).toEqual({ input, mode });
    }
  });

  it('defaults to parse mode when the fragment has no mode', () => {
    expect(parseUrlCodecHash('#in=' + encodeURIComponent('https://x.test/?a=%ZZ'))).toEqual({
      input: 'https://x.test/?a=%ZZ',
      mode: 'parse',
    });
  });

  it('falls back to raw text for an undecodable payload instead of dropping it', () => {
    expect(parseUrlCodecHash('#in=%%%')).toEqual({ input: '%%%', mode: 'parse' });
  });

  it('ignores an unknown mode and another tool’s fragment', () => {
    expect(parseUrlCodecHash('#in=a&mode=nonsense')?.mode).toBe('parse');
    expect(parseUrlCodecHash('#ip=10.0.0.1')).toBeNull();
    expect(parseUrlCodecHash('')).toBeNull();
    expect(parseUrlCodecHash('#in=')).toBeNull();
  });

  it('keeps the shareable cap at 2000 characters', () => {
    expect(MAX_HASH_LEN).toBe(2000);
  });

  it('toMode normalizes anything', () => {
    expect(toMode('encode')).toBe('encode');
    expect(toMode('decode')).toBe('decode');
    expect(toMode('parse')).toBe('parse');
    expect(toMode(undefined)).toBe('parse');
    expect(toMode('DROP TABLE')).toBe('parse');
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   run() + bundled examples + never-throws
   ══════════════════════════════════════════════════════════════════════════ */

describe('run', () => {
  it('dispatches to each mode', () => {
    expect(run('a b', 'encode').mode).toBe('encode');
    expect(run('a%20b', 'decode').mode).toBe('decode');
    expect(run('https://x.test/?a=1', 'parse').mode).toBe('parse');
  });

  it('falls back to parse for a bogus mode', () => {
    expect(run('https://x.test/', 'bogus' as never).mode).toBe('parse');
  });
});

describe('bundled examples', () => {
  it('ships the six chips the plan names, each with a real mode', () => {
    expect(examples).toHaveLength(6);
    expect(examples.map((e) => e.mode)).toEqual([
      'parse',
      'parse',
      'decode',
      'encode',
      'parse',
      'decode',
    ]);
    expect(new Set(examples.map((e) => e.id)).size).toBe(6);
  });

  it('every example evaluates cleanly on the DEFAULT options', () => {
    // The `#in=…&mode=…` fragment carries no option state, so a chip that needed
    // a non-default checkbox could not survive a shared link.
    for (const example of examples) {
      const result = run(example.input, example.mode);
      expect(result.ok, `${example.id} should be ok`).toBe(true);
      expect(codes(result.diagnostics), example.id).not.toContain('bad-escape');
      expect(result.summary.length, example.id).toBeGreaterThan(0);
    }
  });

  it('the first chip is the boot seed and shows a decoded #alerts channel', () => {
    const seeded = run(examples[0].input, examples[0].mode);
    expect(seeded.mode).toBe('parse');
    if (seeded.mode !== 'parse') throw new Error('unreachable');
    expect(seeded.params.map((p) => p.value)).toContain('#alerts');
  });

  it('the form-body chip resolves + to a space on auto', () => {
    const result = run(examples[5].input, examples[5].mode);
    if (result.mode !== 'decode') throw new Error('unreachable');
    expect(result.plusAsSpace).toBe(true);
    expect(result.output).toContain('Ada Lovelace');
  });

  it('the double-encoded chip is detected as double-encoded', () => {
    const result = run(examples[2].input, examples[2].mode);
    if (result.mode !== 'decode') throw new Error('unreachable');
    expect(result.doubleEncoded).toBe(true);
  });
});

describe('never throws (fuzz sweep)', () => {
  const nasty = [
    '',
    ' ',
    ' ',
    '%',
    '%%',
    '%%%',
    '%2',
    '%zz',
    '%C3',
    '%C3%28',
    '%FF%FE',
    '+',
    '&&&',
    '=',
    '?',
    '?&=&',
    '#',
    '#in=x',
    '://x',
    'http://',
    'https://',
    'https:',
    'mailto:a@b.test?subject=hi',
    'javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'https://[::1]:8080/x?a=1',
    'https://user:pass@[::1]/',
    'https://x.test/?a=1&a=2&a=3;b=4&&=5&tags[]=6&c',
    'https://münchen.example/straße?q=café#füß',
    '\uD800',
    '\uDFFF',
    'a\uD83Cb',
    '🌍'.repeat(1000),
    'https://x.test/' + '%'.repeat(500),
    'a=1&'.repeat(5000),
    '\n\r\t',
    '  https://x.test/  ',
    'HTTPS://X.TEST/A',
    '//x.test/a',
    '/relative/path?a=1',
    'x'.repeat(100_000),
  ];

  for (const mode of ['parse', 'decode', 'encode'] as const) {
    it(`survives every nasty input in ${mode} mode`, () => {
      for (const input of nasty) {
        const result = run(input, mode);
        expect(typeof result.summary, JSON.stringify(input.slice(0, 40))).toBe('string');
        expect(result.mode).toBe(mode);
        expect(Array.isArray(result.diagnostics)).toBe(true);
        for (const d of result.diagnostics) {
          expect(typeof d.message).toBe('string');
          expect(d.message.length).toBeGreaterThan(0);
        }
      }
    });
  }

  it('stays O(n) on a 100 KB payload (pinned edge case 16b)', () => {
    const big = 'a b&'.repeat(25_000); // 100,000 chars
    expect(big).toHaveLength(100_000);
    const encoded = encode(big, { scope: 'component' });
    expect(encoded.output.length).toBeGreaterThan(big.length);
    expect(decode(encoded.output, { plusAsSpace: false }).output).toBe(big);
    const parsed = parseUrl('https://x.test/?' + 'k=v&'.repeat(20_000));
    expect(parsed.params).toHaveLength(20_000);
  });

  it('decodePercent reports positions relative to its offset', () => {
    const result = decodePercent('%ZZ', { offset: 7 });
    expect(result.diagnostics[0].at).toBe(7);
    expect(result.ok).toBe(false);
  });
});

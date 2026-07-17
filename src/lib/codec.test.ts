/**
 * Shared base64url codec — UTF-8 safe, URL-safe (no +/=), used anywhere a
 * client-side feature needs a copy-pasteable or hash-embeddable string (share
 * links, progress export codes). Round-trip correctness is the whole contract.
 */
import { describe, it, expect } from 'vitest';
import { base64UrlEncode, base64UrlDecode } from './codec';

describe('base64UrlEncode() / base64UrlDecode()', () => {
  it('round-trips plain ASCII', () => {
    const input = 'hello world';
    expect(base64UrlDecode(base64UrlEncode(input))).toBe(input);
  });

  it('round-trips JSON payloads', () => {
    const input = JSON.stringify({ rules: 'a: 1', test: 'b: 2', n: 42, ok: true });
    expect(base64UrlDecode(base64UrlEncode(input))).toBe(input);
  });

  it('round-trips the empty string', () => {
    expect(base64UrlDecode(base64UrlEncode(''))).toBe('');
  });

  it('round-trips UTF-8 (accents, CJK, emoji)', () => {
    const input = 'café — 日本語 — 🚀✅';
    expect(base64UrlDecode(base64UrlEncode(input))).toBe(input);
  });

  it('round-trips strings that need base64 padding (1 and 2 trailing bytes)', () => {
    // Deliberately exercise both padding lengths the trailing "=+" strip removes.
    expect(base64UrlDecode(base64UrlEncode('a'))).toBe('a'); // 1 byte  → 2 padding chars
    expect(base64UrlDecode(base64UrlEncode('ab'))).toBe('ab'); // 2 bytes → 1 padding char
    expect(base64UrlDecode(base64UrlEncode('abc'))).toBe('abc'); // 3 bytes → 0 padding
  });

  it('produces URL-safe output with no +, / or = characters', () => {
    // Long, high-entropy input to make +/=/ collisions in standard base64 likely.
    const input = JSON.stringify({ blob: 'x'.repeat(200), id: 'abc123-XYZ_789' });
    const encoded = base64UrlEncode(input);
    expect(encoded).not.toMatch(/[+/=]/);
  });

  it('base64UrlDecode throws on input outside the base64 alphabet (callers must guard)', () => {
    // Matches the pre-existing AlertLint contract: base64UrlDecode is a raw
    // codec, not a validator — decodeState()/importProgress() wrap it in
    // try/catch rather than have the codec swallow errors itself.
    expect(() => base64UrlDecode('not-valid-base64!!!')).toThrow();
  });
});

describe('equivalence vs the TextEncoder/TextDecoder codec duplicated in 4 playgrounds', () => {
  // GhaValidator, GitlabCiValidator, PrometheusRelabelTester and
  // AlertmanagerRouteTester each hand-roll this exact pair for their
  // share-link hash. Before migrating those call sites onto base64UrlEncode/
  // base64UrlDecode, prove the two implementations agree byte-for-byte on
  // well-formed input — otherwise a live user's bookmarked share link would
  // silently stop decoding after deploy.
  function referenceEncode(text: string): string {
    const bytes = new TextEncoder().encode(text);
    let bin = '';
    for (const b of bytes) bin += String.fromCharCode(b);
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function referenceDecode(b64raw: string): string {
    let b64 = b64raw.replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) b64 += '=';
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }

  const corpus = [
    '',
    'hello world',
    'name: relabel-test\nrules:\n  - source_labels: [__name__]\n    regex: "foo.*"\n    action: keep\n',
    'café — 日本語 — 🚀✅',
    'x'.repeat(500),
    JSON.stringify({ deploy: { image: 'registry.example.com/app:1.2.3' }, stages: ['build', 'test', '部署'] }),
  ];

  it.each(corpus)('encodes byte-identically to the reference impl: %j', (input) => {
    expect(base64UrlEncode(input)).toBe(referenceEncode(input));
  });

  it.each(corpus)('codec.ts decodes the reference impl’s own output: %j', (input) => {
    expect(base64UrlDecode(referenceEncode(input))).toBe(input);
  });

  it.each(corpus)('the reference impl decodes codec.ts’s own output: %j', (input) => {
    expect(referenceDecode(base64UrlEncode(input))).toBe(input);
  });

  it('diverges only on corrupted (non-UTF-8) byte sequences: TextDecoder replaces, codec.ts throws', () => {
    // A lone continuation byte (0x80) is never produced by TextEncoder, but a
    // hand-tampered hash could contain one. This is the one documented
    // behavior change from migrating: callers already wrap base64UrlDecode in
    // try/catch and return null, so a corrupted link now correctly reports
    // "invalid" instead of silently rendering a replacement character.
    const corruptB64 = btoa(String.fromCharCode(0x80))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    expect(referenceDecode(corruptB64)).toBe('�');
    expect(() => base64UrlDecode(corruptB64)).toThrow();
  });
});

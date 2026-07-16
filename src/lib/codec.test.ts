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

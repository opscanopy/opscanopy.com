/**
 * Base64 Encoder / Decoder — engine tests. Asserts the canonical RFC 4648
 * vectors: "hello" <-> "aGVsbG8=", a multibyte UTF-8 round-trip, the url-safe
 * alphabet (no padding, -/_ instead of +//), that decode accepts url-safe input,
 * that genuinely invalid base64 returns { valid:false } rather than throwing,
 * and that the reported byte count matches the underlying data.
 *
 * Synchronous: convert() is pure and runs through TextEncoder/TextDecoder
 * (available globally on Node 18+), so no awaiting is required.
 */
import { describe, it, expect } from 'vitest';
import { convert } from './engine';

describe('convert() — encode', () => {
  it('encodes "hello" to the RFC 4648 vector "aGVsbG8="', () => {
    const result = convert('hello', 'encode', false);
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
    expect(result.output).toBe('aGVsbG8=');
    // "hello" is five ASCII bytes.
    expect(result.bytes).toBe(5);
  });

  it('does not reject on normal input (returns valid, never throws)', () => {
    expect(convert('hello world', 'encode', false)).toMatchObject({ valid: true });
    expect(convert('{"name":"Café","ok":true}', 'encode', false)).toMatchObject({ valid: true });
  });
});

describe('convert() — decode', () => {
  it('decodes "aGVsbG8=" back to "hello"', () => {
    const result = convert('aGVsbG8=', 'decode', false);
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
    expect(result.output).toBe('hello');
    expect(result.bytes).toBe(5);
  });

  it('round-trips a multibyte UTF-8 string faithfully', () => {
    // "Café🌎" mixes a 2-byte (é) and a 4-byte (🌎) code point: 9 UTF-8 bytes.
    const text = 'Café🌎';
    const encoded = convert(text, 'encode', false);
    expect(encoded.valid).toBe(true);
    expect(encoded.bytes).toBe(9);

    const decoded = convert(encoded.output, 'decode', false);
    expect(decoded.valid).toBe(true);
    expect(decoded.output).toBe(text);
    // Byte count is preserved across the round-trip.
    expect(decoded.bytes).toBe(9);
  });

  it('returns valid:false (no throw) for input outside the base64 alphabet', () => {
    const result = convert('!!!not base64!!!', 'decode', false);
    expect(result.valid).toBe(false);
    expect(result.error).toBeTruthy();
    expect(result.output).toBe('');
  });

  it('returns valid:false (no throw) for a malformed base64 length', () => {
    // Length % 4 === 1 can never be a valid base64 encoding.
    const result = convert('aGVsb', 'decode', false);
    expect(result.valid).toBe(false);
    expect(result.error).toBeTruthy();
    expect(result.output).toBe('');
  });
});

describe('convert() — url-safe alphabet', () => {
  it('encodes url-safe with no "=" padding and only the -_ alphabet', () => {
    // "Hello, 🌎" forces both a + and a / in standard base64, so url-safe
    // output must remap them; the trailing padding must be stripped.
    const result = convert('Hello, 🌎', 'encode', true);
    expect(result.valid).toBe(true);
    expect(result.output).not.toContain('=');
    expect(result.output).not.toMatch(/[+/]/);
    // Sanity-check against the standard encoding remapped by hand.
    const standard = convert('Hello, 🌎', 'encode', false).output;
    const expected = standard.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
    expect(result.output).toBe(expected);
  });

  it('decodes url-safe input (-_ alphabet, no padding) back to text', () => {
    // "SGVsbG8sIPCfjI4" is the url-safe, unpadded encoding of "Hello, 🌎".
    const result = convert('SGVsbG8sIPCfjI4', 'decode', true);
    expect(result.valid).toBe(true);
    expect(result.output).toBe('Hello, 🌎');
    // 11 UTF-8 bytes: "Hello, " (7) + 🌎 (4).
    expect(result.bytes).toBe(11);
  });

  it('round-trips through the url-safe alphabet', () => {
    const text = 'subjects?_=ok/+more';
    const encoded = convert(text, 'encode', true);
    expect(encoded.valid).toBe(true);
    expect(encoded.output).not.toContain('=');
    expect(encoded.output).not.toMatch(/[+/]/);

    const decoded = convert(encoded.output, 'decode', true);
    expect(decoded.valid).toBe(true);
    expect(decoded.output).toBe(text);
  });
});

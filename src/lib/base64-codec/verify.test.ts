import { describe, it, expect } from 'vitest';
import { verifyClaims, compareOutputs } from './verify';

describe('base64 verifyClaims()', () => {
  describe('base input', () => {
    it('is invalid for empty encode input', () => {
      const r = verifyClaims('', 'encode', false, {});
      expect(r.valid).toBe(false);
      expect(r.error).toBeTruthy();
    });

    it('is invalid for malformed decode input', () => {
      const r = verifyClaims('not@@base64!!', 'decode', false, {});
      expect(r.valid).toBe(false);
    });

    it('is valid with zero checks when no claim is given', () => {
      const r = verifyClaims('hello', 'encode', false, {});
      expect(r.valid).toBe(true);
      expect(r.checks).toEqual([]);
    });
  });

  describe('encode', () => {
    it('matches the correct base64 for "hello"', () => {
      const r = verifyClaims('hello world', 'encode', false, { output: 'aGVsbG8gd29ybGQ=' });
      expect(r.checks[0].verdict).toBe('match');
    });

    it('flags a wrong claim as a mismatch', () => {
      const r = verifyClaims('hello world', 'encode', false, { output: 'totally wrong' });
      expect(r.checks[0].verdict).toBe('mismatch');
    });
  });

  describe('decode', () => {
    it('matches the correct decoded text', () => {
      const r = verifyClaims('aGVsbG8gd29ybGQ=', 'decode', false, { output: 'hello world' });
      expect(r.checks[0].verdict).toBe('match');
    });

    // Regression: decoded text is plain TEXT, not base64 — the alphabet-swap
    // and padding-diff heuristics assume a base64 charset on both sides, so
    // applying them to arbitrary decoded text produced affirmatively FALSE
    // notes (e.g. claiming "Right bytes, wrong alphabet" between two
    // genuinely different strings that merely happen to differ by a
    // "-"/"_" vs "+"/"/" character). Decode-mode mismatches must fall
    // straight through to plain first-divergence, no base64-shaped notes.
    it('does not attach a base64 alphabet/padding note to a decoded-text mismatch', () => {
      const r = verifyClaims('YV9i', 'decode', false, { output: 'a/b' }); // actual decodes to "a_b"
      expect(r.checks[0].verdict).toBe('mismatch');
      expect(r.checks[0].note).not.toMatch(/alphabet/i);
      expect(r.checks[0].note).not.toMatch(/padding/i);
    });
  });

  it('checks only the field that was actually claimed', () => {
    const r = verifyClaims('hi', 'encode', false, { output: 'aGk=' });
    expect(r.checks.map((c) => c.field)).toEqual(['output']);
  });

  it('never throws on adversarial input', () => {
    expect(() => verifyClaims('¯\\_(ツ)_/¯', 'decode', false, { output: '{}' })).not.toThrow();
  });
});

describe('compareOutputs() — diagnosis of near-miss claims', () => {
  it('matches identical strings exactly', () => {
    expect(compareOutputs('aGVsbG8=', 'aGVsbG8=').verdict).toBe('match');
  });

  it('diagnoses a whitespace-only difference (line-wrapped output)', () => {
    const r = compareOutputs('aGVs\nbG8=', 'aGVsbG8=');
    expect(r.verdict).toBe('mismatch');
    expect(r.note).toMatch(/whitespace/i);
  });

  it('diagnoses a standard vs URL-safe alphabet swap', () => {
    // Actual used the standard alphabet with '+' and '/'; the claim used '-' and '_' instead.
    const r = compareOutputs('PDw-Pz8_Kys', 'PDw+Pz8/Kys');
    expect(r.verdict).toBe('mismatch');
    expect(r.note).toMatch(/alphabet/i);
  });

  it('diagnoses a padding-only difference', () => {
    const r = compareOutputs('aGVsbG8', 'aGVsbG8=');
    expect(r.verdict).toBe('mismatch');
    expect(r.note).toMatch(/padding/i);
  });

  it('falls back to a first-divergence index for a genuine mismatch', () => {
    const r = compareOutputs('aGVsbG9X', 'aGVsbG8=');
    expect(r.verdict).toBe('mismatch');
    expect(r.note).toMatch(/character \d+/i);
  });
});

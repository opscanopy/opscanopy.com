/**
 * `encodeState()` is pure (no `window` access) and is covered directly here.
 * `decodeState()` reads `window.location.hash` and is intentionally left
 * untested under this project's node-environment vitest config — matching
 * the existing untested `ip-hash.ts` / AlertLint `decodeState()` precedent —
 * and is instead verified via the browser/manual runtime check.
 */
import { describe, it, expect } from 'vitest';
import { encodeState, run } from './engine';
import { base64UrlDecode } from '../codec';

describe('run() — zero-width matches and the u / v flags', () => {
  // 'a🚀b' is FOUR UTF-16 code units: 'a', D83D, DE80, 'b'.
  // Under /u the spec's RegExpBuiltinExec snaps a mid-surrogate lastIndex back
  // down to the start of the code point, so a naive `lastIndex++` re-matches
  // the same position forever. AdvanceStringIndex must step over the pair.
  it('steps over a surrogate pair on a zero-width match under /u', () => {
    const r = run('\\d*', 'gu', 'a🚀b');
    expect(r.valid).toBe(true);
    expect(r.matchCount).toBe(4);
    expect(r.matches.map((m) => m.index)).toEqual([0, 1, 3, 4]);
    expect(r.matches.every((m) => m.match === '')).toBe(true);
  });

  it('steps over a surrogate pair on a zero-width match under /v', () => {
    const r = run('\\d*', 'gv', 'a🚀b');
    expect(r.valid).toBe(true);
    expect(r.matchCount).toBe(4);
    expect(r.matches.map((m) => m.index)).toEqual([0, 1, 3, 4]);
  });

  it('keeps the UTF-16-code-unit behaviour when u/v is absent', () => {
    const r = run('\\d*', 'g', 'a🚀b');
    expect(r.valid).toBe(true);
    expect(r.matchCount).toBe(5);
    expect(r.matches.map((m) => m.index)).toEqual([0, 1, 2, 3, 4]);
  });

  it('still advances one unit at a time under /u on BMP-only text', () => {
    const r = run('\\d*', 'gu', 'abc');
    expect(r.matchCount).toBe(4);
    expect(r.matches.map((m) => m.index)).toEqual([0, 1, 2, 3]);
  });

  it('does not treat a lone high surrogate as a pair under /u', () => {
    const r = run('(?:)', 'gu', 'a\ud83db');
    expect(r.matchCount).toBe(4);
    expect(r.matches.map((m) => m.index)).toEqual([0, 1, 2, 3]);
  });
});

describe('run() — the 10,000-match cap', () => {
  it('reports the cap through a non-fatal notice, not through error', () => {
    const r = run('.', 'g', 'a'.repeat(20000));
    expect(r.valid).toBe(true);
    expect(r.error).toBeUndefined();
    expect(r.matches.length).toBe(10000);
    expect(r.matchCount).toBe(10000);
    expect(r.notice).toBe('Stopped after the first 10,000 matches.');
  });

  it('leaves notice absent when the cap is not reached', () => {
    const r = run('.', 'g', 'a'.repeat(50));
    expect(r.valid).toBe(true);
    expect(r.matchCount).toBe(50);
    expect(r.notice).toBeUndefined();
    expect(r.error).toBeUndefined();
  });
});

describe('run() — large-input truncation', () => {
  // 'ERROR disk full\n' (16 chars) + 200,010 filler = 200,026 characters, over
  // the 200,000-character scan cap. The pattern is perfectly valid, so this is
  // an informational notice — NOT an `error`, which the playground reads as
  // "invalid pattern" and uses to discard every match.
  it('reports the scan cap as a notice and still returns real matches', () => {
    const text = 'ERROR disk full\n' + 'x'.repeat(200010);
    expect(text.length).toBe(200026);

    const r = run('ERROR', 'g', text);
    expect(r.valid).toBe(true);
    expect(r.error).toBeUndefined();
    // The digit grouping comes from toLocaleString(), which differs by host
    // locale ("200,000" vs "2,00,000") — assert the shape, not the separators.
    expect(r.notice).toMatch(
      /^Input is large — only the first [\d,. ]+ characters were scanned\.$/,
    );
    expect(r.matchCount).toBe(1);
    expect(r.matches[0].index).toBe(0);
    expect(r.matches[0].match).toBe('ERROR');
  });

  it('leaves notice absent for input under the scan cap', () => {
    const r = run('ERROR', 'g', 'ERROR disk full');
    expect(r.valid).toBe(true);
    expect(r.notice).toBeUndefined();
    expect(r.matchCount).toBe(1);
  });

  it('still reports a genuinely invalid pattern through error, not notice', () => {
    const r = run('(', 'g', 'anything');
    expect(r.valid).toBe(false);
    expect(typeof r.error).toBe('string');
    expect(r.notice).toBeUndefined();
    expect(r.matchCount).toBe(0);
  });
});

describe('encodeState()', () => {
  it('produces a "#s=" hash fragment', () => {
    const hash = encodeState('foo.*', 'gi', 'sample log line');
    expect(hash.startsWith('#s=')).toBe(true);
  });

  it('base64url-decodes back to the exact pattern/flags/text payload', () => {
    const hash = encodeState('(?<level>ERROR)', 'gm', 'line one\nline two');
    const json = base64UrlDecode(hash.slice('#s='.length));
    expect(JSON.parse(json)).toEqual({
      pattern: '(?<level>ERROR)',
      flags: 'gm',
      text: 'line one\nline two',
    });
  });

  it('round-trips empty pattern/flags/text', () => {
    const hash = encodeState('', '', '');
    const json = base64UrlDecode(hash.slice('#s='.length));
    expect(JSON.parse(json)).toEqual({ pattern: '', flags: '', text: '' });
  });

  it('round-trips unicode content (accents, CJK, emoji) in the sample text', () => {
    const hash = encodeState('\\d+', 'g', 'café — 日本語 — 🚀 42');
    const json = base64UrlDecode(hash.slice('#s='.length));
    expect(JSON.parse(json)).toEqual({
      pattern: '\\d+',
      flags: 'g',
      text: 'café — 日本語 — 🚀 42',
    });
  });
});

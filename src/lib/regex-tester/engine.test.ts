/**
 * `encodeState()` is pure (no `window` access) and is covered directly here.
 * `decodeState()` reads `window.location.hash` and is intentionally left
 * untested under this project's node-environment vitest config — matching
 * the existing untested `ip-hash.ts` / AlertLint `decodeState()` precedent —
 * and is instead verified via the browser/manual runtime check.
 */
import { describe, it, expect } from 'vitest';
import { encodeState } from './engine';
import { base64UrlDecode } from '../codec';

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

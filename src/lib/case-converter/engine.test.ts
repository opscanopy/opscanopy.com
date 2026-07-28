import { describe, it, expect } from 'vitest';
import { tokenize, convertCases } from './engine';
import type { CaseKind, CaseResult } from './types';
import { examples } from './examples';

/** Look up a row value by its kind. */
function val(result: CaseResult, kind: CaseKind): string {
  const found = result.rows.find((r) => r.kind === kind);
  if (!found) throw new Error(`no row of kind "${kind}"`);
  return found.value;
}

describe('case-converter tokenize()', () => {
  it('splits acronym runs at the run→word boundary and normalizes them', () => {
    expect(tokenize('getHTTPResponse')).toEqual(['get', 'http', 'response']);
  });

  it('splits on separators (underscore, hyphen)', () => {
    expect(tokenize('user_profile-id')).toEqual(['user', 'profile', 'id']);
  });

  it('handles a leading acronym before a mixed-case word', () => {
    expect(tokenize('XMLHttpRequest')).toEqual(['xml', 'http', 'request']);
  });

  it('splits letter→number transitions', () => {
    expect(tokenize('v2Release')).toEqual(['v', '2', 'release']);
  });

  it('splits number→letter transitions (trailing number)', () => {
    expect(tokenize('Release2')).toEqual(['release', '2']);
  });

  it('is Unicode-aware — a non-ASCII lowercase letter stays inside its word', () => {
    expect(tokenize('straßeName')).toEqual(['straße', 'name']);
  });

  it('returns an empty array for empty / token-less input', () => {
    expect(tokenize('')).toEqual([]);
    expect(tokenize('   ')).toEqual([]);
    expect(tokenize('-_./')).toEqual([]);
  });

  it('normalizes acronyms so camelCase round-trips are stable', () => {
    expect(tokenize('userProfileID')).toEqual(['user', 'profile', 'id']);
    expect(tokenize('getURLFromString')).toEqual(['get', 'url', 'from', 'string']);
  });
});

describe('case-converter convertCases()', () => {
  const result = convertCases('user profile ID');

  it('is valid for real input', () => {
    expect(result.valid).toBe(true);
  });

  it('produces camelCase', () => {
    expect(val(result, 'camel')).toBe('userProfileId');
  });

  it('produces PascalCase', () => {
    expect(val(result, 'pascal')).toBe('UserProfileId');
  });

  it('produces snake_case', () => {
    expect(val(result, 'snake')).toBe('user_profile_id');
  });

  it('produces SCREAMING_SNAKE_CASE and CONSTANT_CASE identically', () => {
    expect(val(result, 'screamingSnake')).toBe('USER_PROFILE_ID');
    expect(val(result, 'constant')).toBe('USER_PROFILE_ID');
  });

  it('produces kebab-case', () => {
    expect(val(result, 'kebab')).toBe('user-profile-id');
  });

  it('produces Train-Case', () => {
    expect(val(result, 'train')).toBe('User-Profile-Id');
  });

  it('produces Title Case', () => {
    expect(val(result, 'title')).toBe('User Profile Id');
  });

  it('produces sentence case', () => {
    expect(val(result, 'sentence')).toBe('User profile id');
  });

  it('produces dot.case', () => {
    expect(val(result, 'dot')).toBe('user.profile.id');
  });

  it('produces path/case', () => {
    expect(val(result, 'path')).toBe('user/profile/id');
  });

  it('keeps SCREAMING_SNAKE_CASE and CONSTANT_CASE as distinct labeled rows', () => {
    const screaming = result.rows.find((r) => r.kind === 'screamingSnake');
    const constant = result.rows.find((r) => r.kind === 'constant');
    expect(screaming?.label).toBe('SCREAMING_SNAKE_CASE');
    expect(constant?.label).toBe('CONSTANT_CASE');
  });

  it('normalizes an acronym-carrying camelCase identifier round-trip-stably', () => {
    const r = convertCases('userProfileID');
    expect(val(r, 'camel')).toBe('userProfileId');
    expect(val(r, 'snake')).toBe('user_profile_id');
    // Feeding the camelCase output back in yields the same tokens.
    expect(tokenize(val(r, 'camel'))).toEqual(['user', 'profile', 'id']);
  });

  it('returns { valid:false } with no rows for empty / token-less input', () => {
    const empty = convertCases('');
    expect(empty.valid).toBe(false);
    expect(empty.rows).toEqual([]);
    expect(empty.error).toBeTruthy();
    expect(convertCases('   ').valid).toBe(false);
    expect(convertCases('-_./').valid).toBe(false);
  });

  it('emits eleven rows for valid input', () => {
    expect(result.rows).toHaveLength(11);
  });

  it('never throws on odd input', () => {
    expect(() => convertCases('🎉')).not.toThrow();
    expect(convertCases('🎉').valid).toBe(false);
  });
});

describe('case-converter examples', () => {
  it('every example converts cleanly', () => {
    for (const ex of examples) {
      expect(convertCases(ex.input).valid).toBe(true);
    }
  });
});

/**
 * Combining marks are neither \p{L} nor \p{N}, so the tokenizer's
 * [^\p{L}\p{N}]+ split treated them as WORD SEPARATORS. Decomposed (NFD) text —
 * exactly what a macOS paste produces — lost its accents and split mid-word,
 * and Indic/Hebrew text was shredded at every vowel sign and virama.
 */
describe('tokenize() — combining marks are part of words, not separators', () => {
  const NFD = 'Cafe\u0301 Mu\u0308ller'; // e + U+0301, u + U+0308
  const NFC = 'Caf\u00e9 M\u00fcller';

  it('treats decomposed and precomposed input identically', () => {
    expect(tokenize(NFD)).toEqual(tokenize(NFC));
  });

  it('does not split Müller in two at the diaeresis', () => {
    expect(tokenize(NFD)).toHaveLength(2);
  });

  it('does not delete the accent from Café', () => {
    expect(convertCases(NFD).rows.find((r) => r.kind === 'snake')?.value).toBe('café_müller');
  });

  it('keeps a Devanagari phrase as two words, not five', () => {
    // नमस्ते विश्व — the virama and vowel signs are \p{M}.
    expect(tokenize('\u0928\u092e\u0938\u094d\u0924\u0947 \u0935\u093f\u0936\u094d\u0935')).toHaveLength(2);
  });

  it('keeps pointed Hebrew as a single word', () => {
    expect(tokenize('\u05e9\u05b8\u05c1\u05dc\u05d5\u05b9\u05dd')).toHaveLength(1);
  });
});

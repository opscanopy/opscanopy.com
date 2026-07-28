import { describe, it, expect } from 'vitest';
import { slugify } from './engine';
import { examples } from './examples';
import type { SlugifyOptions } from './types';

/** Default options for the common URL-slug case (kebab, lowercase). */
const DEFAULTS: SlugifyOptions = { separator: '-', maxLength: 0, lowercase: true };

/** Slugify with the defaults, overriding only the fields a case cares about. */
function slug(input: string, opts: Partial<SlugifyOptions> = {}): string {
  const r = slugify(input, { ...DEFAULTS, ...opts });
  return r.slug;
}

describe('slugify engine', () => {
  describe('diacritics and Unicode normalization', () => {
    it('strips accents/diacritics — "Héllo Wörld" → "hello-world"', () => {
      expect(slug('Héllo Wörld')).toBe('hello-world');
    });

    it('decomposes NFKD ligatures — "ﬁle" → "file"', () => {
      expect(slug('ﬁle')).toBe('file');
    });

    it('removes all combining marks via \\p{M}, not just U+0300–036F', () => {
      // A decomposed "é" = "e" + U+0301 COMBINING ACUTE ACCENT.
      expect(slug('e\u0301')).toBe('e');
      // U+1DC0 is a combining mark outside the 0300–036F block.
      expect(slug('a\u1dc0b')).toBe('ab');
    });

    it('drops the "café" accent — "café" → "cafe"', () => {
      expect(slug('café')).toBe('cafe');
    });
  });

  describe('symbols and emoji', () => {
    it('removes symbols and emoji entirely', () => {
      expect(slug('Hello 🎉 World! ★')).toBe('hello-world');
    });

    it('drops punctuation from "10 Things About C++"', () => {
      expect(slug('10 Things About C++')).toBe('10-things-about-c');
    });
  });

  describe('separator handling', () => {
    it('collapses runs of separators — "a   b" → "a-b"', () => {
      expect(slug('a   b')).toBe('a-b');
    });

    it('trims leading and trailing separators', () => {
      expect(slug('  --Hello--  ')).toBe('hello');
      expect(slug('  Spaces   & Symbols  ')).toBe('spaces-symbols');
    });

    it('supports an underscore separator', () => {
      expect(slug('Hello World Again', { separator: '_' })).toBe('hello_world_again');
    });

    it('supports a dot separator', () => {
      expect(slug('Hello World Again', { separator: '.' })).toBe('hello.world.again');
    });

    it('collapses repeats with a non-default separator', () => {
      expect(slug('a   b', { separator: '_' })).toBe('a_b');
    });
  });

  describe('lowercase option', () => {
    it('preserves case when lowercase is false', () => {
      expect(slug('Hello World', { lowercase: false })).toBe('Hello-World');
    });
  });

  describe('maxLength enforcement', () => {
    it('truncates at the last separator boundary at or before the limit', () => {
      // "hello-world-again" — with maxLength 12 the boundary is after "hello-world".
      const r = slugify('Hello World Again', { ...DEFAULTS, maxLength: 12 });
      expect(r.slug).toBe('hello-world');
      expect(r.truncated).toBe(true);
    });

    it('hard-cuts when there is no separator before the limit', () => {
      const r = slugify('supercalifragilistic', { ...DEFAULTS, maxLength: 5 });
      expect(r.slug).toBe('super');
      expect(r.truncated).toBe(true);
    });

    it('strips a trailing separator left by the cut', () => {
      // "aaa-bbbb" cut at 4 → "aaa-" → trailing separator removed → "aaa".
      const r = slugify('aaa bbbb', { ...DEFAULTS, maxLength: 4 });
      expect(r.slug).toBe('aaa');
      expect(r.truncated).toBe(true);
    });

    it('leaves the slug intact and truncated undefined when within the limit', () => {
      const r = slugify('Hello World', { ...DEFAULTS, maxLength: 60 });
      expect(r.slug).toBe('hello-world');
      expect(r.truncated).toBeUndefined();
    });

    it('treats maxLength 0 as no limit', () => {
      const r = slugify('supercalifragilistic', { ...DEFAULTS, maxLength: 0 });
      expect(r.slug).toBe('supercalifragilistic');
      expect(r.truncated).toBeUndefined();
    });
  });

  describe('validation', () => {
    it('rejects empty input', () => {
      const r = slugify('', DEFAULTS);
      expect(r.valid).toBe(false);
      expect(r.slug).toBe('');
      expect(r.error).toContain('Enter a title');
    });

    it('rejects whitespace-only input', () => {
      const r = slugify('   ', DEFAULTS);
      expect(r.valid).toBe(false);
    });

    it('rejects an invalid separator', () => {
      const r = slugify('Hello World', { ...DEFAULTS, separator: '/' });
      expect(r.valid).toBe(false);
      expect(r.error).toContain('Separator');
    });

    it('rejects a multi-character separator', () => {
      const r = slugify('Hello World', { ...DEFAULTS, separator: '--' });
      expect(r.valid).toBe(false);
    });
  });

  describe('bundled examples', () => {
    it('every example produces a non-empty slug', () => {
      for (const ex of examples) {
        const r = slugify(ex.input, DEFAULTS);
        expect(r.valid).toBe(true);
        expect(r.slug.length).toBeGreaterThan(0);
      }
    });

    it('the accented example round-trips to a clean kebab slug', () => {
      expect(slug('Blog post: Héllo Wörld!')).toBe('blog-post-hello-world');
    });
  });
});

/**
 * NFKD does not decompose ß ø ł æ œ đ þ ð — they are distinct letters, not
 * accented bases — so they fell through to the disallowed-character rule and
 * became separators or vanished. "Łódź" slugged to "odz".
 */
describe('slugify() — non-decomposing Latin letters transliterate', () => {
  const slug = (s: string) =>
    slugify(s, { separator: '-', lowercase: true, maxLength: 80 }).slug;

  it('does not delete a slashed o', () => {
    expect(slug('Malm\u00f6 \u00f8sten')).toBe('malmo-osten');
  });

  it('does not delete a barred L', () => {
    expect(slug('\u0141\u00f3d\u017a')).toBe('lodz');
  });

  it('expands eszett to ss', () => {
    expect(slug('Stra\u00dfe')).toBe('strasse');
  });

  it('expands thorn and eth', () => {
    expect(slug('Vi\u00f0ar \u00feorn')).toBe('vidar-thorn');
  });

  it('expands the ae and oe ligatures', () => {
    expect(slug('Encyclop\u00e6dia c\u0153ur')).toBe('encyclopaedia-coeur');
  });

  it('drops an apostrophe instead of splitting the word', () => {
    expect(slug("Don't Panic")).toBe('dont-panic');
  });

  it('leaves plain ASCII untouched', () => {
    expect(slug('Hello World')).toBe('hello-world');
  });
});

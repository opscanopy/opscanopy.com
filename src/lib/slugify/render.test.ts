/**
 * The pure HTML builders shared by the playground's server-rendered seed and
 * its client re-render. If these two ever diverge, a no-JS visitor (and every
 * AI crawler, which does not run JS) sees different markup from a browser.
 */
import { describe, it, expect } from 'vitest';
import { slugify } from './engine';
import { examples } from './examples';
import { resultHtml, errorHtml, summaryText, EMPTY_HTML } from './render';
import type { SlugifyOptions } from './types';

/** The playground's markup defaults: sep "-", max 60, lowercase on. */
const SEED_OPTS: SlugifyOptions = { separator: '-', maxLength: 60, lowercase: true };
const seed = slugify(examples[0].input, SEED_OPTS); // "Blog post: Héllo Wörld!"

describe('resultHtml', () => {
  it('renders the seeded slug into static HTML', () => {
    const html = resultHtml(seed, SEED_OPTS);
    expect(html).toContain('blog-post-hello-world');
    expect(html).toContain('data-copy="blog-post-hello-world"');
    expect(html).toContain('slug-slug-row__v');
  });

  it('renders engine notes under the slug', () => {
    const r = slugify('ten little words in a row here now', { separator: '-', maxLength: 12, lowercase: true });
    const html = resultHtml(r, { separator: '-', maxLength: 12, lowercase: true });
    expect(html).toContain('slug-note');
    expect(html).toContain('12-character limit');
  });

  it('renders the no-characters card when nothing slug-worthy survived', () => {
    const r = slugify('!!! ???', SEED_OPTS);
    const html = resultHtml(r, SEED_OPTS);
    expect(html).toContain('No slug characters');
    expect(html).not.toContain('slug-slug-row');
  });

  it('escapes engine strings rather than trusting them as markup', () => {
    const evil = { ...seed, slug: '<img src=x onerror=alert(1)>' };
    const html = resultHtml(evil, SEED_OPTS);
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img');
  });
});

describe('summaryText', () => {
  it('reads the length budget and separator', () => {
    expect(summaryText(seed, SEED_OPTS)).toBe('21 / 60 chars · sep "-"');
    expect(summaryText(seed, { ...SEED_OPTS, maxLength: 0 })).toBe('21 chars · sep "-"');
  });
});

describe('errorHtml', () => {
  it('escapes the diagnostic message and adds role=alert only on request', () => {
    expect(errorHtml('bad <input>')).toContain('bad &lt;input&gt;');
    expect(errorHtml('x')).not.toContain('role="alert"');
    expect(errorHtml('x', true)).toContain('role="alert"');
  });
});

describe('EMPTY_HTML', () => {
  it('is the empty-state paragraph', () => {
    expect(EMPTY_HTML).toContain('class="slug-empty');
  });
});

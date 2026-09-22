/**
 * The pure HTML builders shared by the playground's server-rendered seed and
 * its client re-render. If these two ever diverge, a no-JS visitor (and every
 * AI crawler, which does not run JS) sees different markup from a browser.
 */
import { describe, it, expect } from 'vitest';
import { convertCases } from './engine';
import { examples } from './examples';
import { resultHtml, errorHtml, buildCopyAll, summaryText, EMPTY_HTML } from './render';

const seed = convertCases(examples[0].input); // userProfileID

describe('resultHtml', () => {
  it('renders the seeded example as one labeled row per case style', () => {
    const html = resultHtml(seed);
    expect(html).toContain('snake_case');
    expect(html).toContain('user_profile_id');
    expect(html).toContain('camelCase');
    expect(html).toContain('userProfileId');
    expect(html).toContain('kebab-case');
    expect(html).toContain('user-profile-id');
    expect((html.match(/class="cc-row"/g) ?? []).length).toBe(seed.rows.length);
  });

  it('gives every row a copy button carrying the raw value', () => {
    const html = resultHtml(seed);
    expect(html).toContain('data-copy="user_profile_id"');
    expect(html).toContain('aria-label="Copy snake_case"');
  });

  it('escapes engine strings rather than trusting them as markup', () => {
    const evil = { ...seed, rows: [{ ...seed.rows[0], value: '<img src=x onerror=alert(1)>' }] };
    const html = resultHtml(evil);
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img');
  });
});

describe('summaryText', () => {
  it('counts the case rows and the words of the snake_case row', () => {
    expect(summaryText(seed)).toBe('11 cases · 3 words');
  });
});

describe('errorHtml', () => {
  it('escapes the diagnostic message', () => {
    expect(errorHtml('bad <input>')).toContain('bad &lt;input&gt;');
  });
});

describe('EMPTY_HTML', () => {
  it('is the empty-state paragraph', () => {
    expect(EMPTY_HTML).toContain('class="cc-empty');
  });
});

describe('buildCopyAll', () => {
  it('emits one label: value line per row', () => {
    const text = buildCopyAll(seed);
    expect(text.split('\n').length).toBe(seed.rows.length);
    expect(text).toContain('snake_case: user_profile_id');
  });
});

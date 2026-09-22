/**
 * The pure HTML builders shared by the playground's server-rendered seed and
 * its client re-render. If these two ever diverge, a no-JS visitor (and every
 * AI crawler, which does not run JS) sees different markup from a browser.
 */
import { describe, it, expect } from 'vitest';
import { parseOctal } from './engine';
import { examples } from './examples';
import { resultHtml, errorHtml, buildCopyAll, summaryText, EMPTY_HTML } from './render';

const seed = parseOctal(examples[0].octal); // 755

describe('resultHtml', () => {
  it('renders the seeded 755 answer rows into static HTML', () => {
    const html = resultHtml(seed);
    expect(html).toContain('rwxr-xr-x');
    expect(html).toContain('-rwxr-xr-x');
    expect(html).toContain('chmod 755 file');
    expect((html.match(/class="chmod-row"/g) ?? []).length).toBe(4);
  });

  it('gives every row a copy button carrying the raw value', () => {
    const html = resultHtml(seed);
    expect(html).toContain('data-copy="chmod 755 file"');
    expect(html).toContain('aria-label="Copy Symbolic"');
  });

  it('escapes engine strings rather than trusting them as markup', () => {
    const evil = { ...seed, command: '<img src=x onerror=alert(1)>' };
    const html = resultHtml(evil);
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img');
  });
});

describe('summaryText', () => {
  it('reads octal · symbolic · file', () => {
    expect(summaryText(seed)).toBe('755 · rwxr-xr-x · file');
  });
});

describe('errorHtml', () => {
  it('escapes the diagnostic message', () => {
    expect(errorHtml('bad <input>')).toContain('bad &lt;input&gt;');
  });
});

describe('EMPTY_HTML', () => {
  it('is the empty-state paragraph', () => {
    expect(EMPTY_HTML).toContain('class="chmod-empty');
  });
});

describe('buildCopyAll', () => {
  it('emits the four aligned lines', () => {
    const text = buildCopyAll(seed);
    expect(text.split('\n').length).toBe(4);
    expect(text).toContain('symbolic: rwxr-xr-x');
    expect(text).toContain('command:  chmod 755 file');
  });
});

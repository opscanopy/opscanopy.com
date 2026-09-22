/**
 * The pure HTML builders shared by the playground's server-rendered seed and
 * its client re-render. If these two ever diverge, a no-JS visitor (and every
 * AI crawler, which does not run JS) sees different markup from a browser.
 */
import { describe, it, expect } from 'vitest';
import { generate } from './engine';
import { examples } from './examples';
import { resultHtml, errorHtml, summaryText, EMPTY_HTML } from './render';

const seed = generate(examples[0].input); // 192.0.2.1

describe('resultHtml', () => {
  it('renders the seeded IPv4 host answer into static HTML', () => {
    const html = resultHtml(seed);
    expect(html).toContain('1.2.0.192.in-addr.arpa');
    expect(html).toContain('2.0.192.in-addr.arpa');
    expect(html).toContain('dig -x 192.0.2.1');
    expect(html).toContain('<span class="ptr-title__badge">IPv4</span>');
  });

  it('gives every non-empty row a copy button carrying the raw value', () => {
    const html = resultHtml(seed);
    expect(html).toContain('data-copy-value="1.2.0.192.in-addr.arpa"');
    expect(html).toContain('aria-label="Copy PTR record name"');
  });

  it('badges IPv6 results', () => {
    expect(resultHtml(generate('2001:db8::1'))).toContain('<span class="ptr-title__badge">IPv6</span>');
  });

  it('escapes engine strings rather than trusting them as markup', () => {
    const evil = { ...seed, rows: [{ label: 'x', value: '<img src=x onerror=alert(1)>' }] };
    const html = resultHtml(evil);
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img');
  });
});

describe('summaryText', () => {
  it('names the IP version', () => {
    expect(summaryText(seed)).toBe('IPv4');
    expect(summaryText(generate('2001:db8::/48'))).toBe('IPv6');
  });
});

describe('errorHtml', () => {
  it('escapes the diagnostic message', () => {
    expect(errorHtml('bad <input>')).toContain('bad &lt;input&gt;');
  });
});

describe('EMPTY_HTML', () => {
  it('is the empty-state paragraph', () => {
    expect(EMPTY_HTML).toContain('class="ptr-empty');
  });
});

/**
 * The pure HTML builders shared by the playground's server-rendered seed and
 * its client re-render. If these two ever diverge, a no-JS visitor (and every
 * AI crawler, which does not run JS) sees different markup from a browser.
 */
import { describe, it, expect } from 'vitest';
import { format } from './engine';
import { examples } from './examples';
import { resultHtml, errorHtml, EMPTY_HTML } from './render';

const seed = format(examples[0].input); // 00:1a:2b:3c:4d:5e

describe('resultHtml', () => {
  it('renders every representation of the seeded MAC into static HTML', () => {
    const html = resultHtml(seed, { localePrefix: '' });
    expect(html).toContain('00:1a:2b:3c:4d:5e');
    expect(html).toContain('00-1A-2B-3C-4D-5E');
    expect(html).toContain('001a.2b3c.4d5e');
    expect(html).toContain('001a2b3c4d5e');
    expect(html).toContain('00:1A:2B');
    expect(html).toContain('fe80::21a:2bff:fe3c:4d5e');
    expect(html).toContain('Universal / OUI-assigned');
    expect(html).toContain('8 representations');
  });

  it('gives every value a copy button carrying the raw value', () => {
    const html = resultHtml(seed, { localePrefix: '' });
    expect(html).toContain('data-copy-value="fe80::21a:2bff:fe3c:4d5e"');
  });

  it('builds the IP Address Converter chain link under the given locale prefix', () => {
    expect(resultHtml(seed, { localePrefix: '' })).toContain(
      'href="/ip-address-converter/#ip=fe80%3A%3A21a%3A2bff%3Afe3c%3A4d5e"'
    );
    expect(resultHtml(seed, { localePrefix: '/de' })).toContain(
      'href="/de/ip-address-converter/#ip='
    );
  });

  it('omits the chain link for a group address (no link-local row)', () => {
    const broadcast = format('ff:ff:ff:ff:ff:ff');
    expect(resultHtml(broadcast, { localePrefix: '' })).not.toContain('ip-address-converter');
  });

  it('escapes engine strings rather than trusting them as markup', () => {
    const evil = {
      ...seed,
      rows: [{ label: '<img src=x onerror=alert(1)>', value: '"><script>alert(1)</script>' }],
    };
    const html = resultHtml(evil, { localePrefix: '' });
    expect(html).not.toContain('<img src=x');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;img');
  });
});

describe('errorHtml', () => {
  it('escapes the diagnostic message', () => {
    expect(errorHtml('bad <input>')).toContain('bad &lt;input&gt;');
  });
});

describe('EMPTY_HTML', () => {
  it('is the empty-state paragraph', () => {
    expect(EMPTY_HTML).toMatch(/^<p class="mac-empty /);
  });
});

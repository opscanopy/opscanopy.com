/**
 * The pure HTML builders shared by the playground's server-rendered seed and
 * its client re-render. If these two ever diverge, a no-JS visitor (and every
 * AI crawler, which does not run JS) sees different markup from a browser.
 */
import { describe, it, expect } from 'vitest';
import { calculate } from './engine';
import { examples } from './examples';
import { resultHtml, errorHtml, buildCopyAll } from './render';

const seed = calculate(examples[0].input); // 192.168.1.0/24

describe('resultHtml', () => {
  it('renders the seeded /24 answer values into static HTML', () => {
    const html = resultHtml(seed, { localePrefix: '' });
    expect(html).toContain('192.168.1.0');
    expect(html).toContain('255.255.255.0');
    expect(html).toContain('192.168.1.255');
    expect(html).toContain('254');
  });

  it('keys every value element so the changed-value tick can diff them', () => {
    const html = resultHtml(seed, { localePrefix: '' });
    expect(html).toMatch(/data-k="stat:[^"]+"/);
    expect(html).toMatch(/data-k="row:[^"]+"/);
  });

  it('builds cross-tool links under the given locale prefix', () => {
    expect(resultHtml(seed, { localePrefix: '' })).toContain('href="/cidr-checker/#ip=');
    expect(resultHtml(seed, { localePrefix: '/de' })).toContain('href="/de/cidr-checker/#ip=');
    expect(resultHtml(seed, { localePrefix: '' })).toContain('href="/subnet-splitter/#ip=');
    expect(resultHtml(seed, { localePrefix: '' })).toContain('href="/ip-address-converter/#ip=');
  });

  it('escapes engine strings rather than trusting them as markup', () => {
    const evil = { ...seed, title: '<img src=x onerror=alert(1)>' };
    const html = resultHtml(evil, { localePrefix: '' });
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img');
  });
});

describe('errorHtml', () => {
  it('escapes the diagnostic message', () => {
    expect(errorHtml('bad <input>')).toContain('bad &lt;input&gt;');
  });
});

describe('buildCopyAll', () => {
  it('emits one label: value line per stat and row', () => {
    const text = buildCopyAll(seed);
    expect(text.split('\n').length).toBeGreaterThan(5);
    expect(text).toContain('255.255.255.0');
  });
});

/**
 * The pure HTML builders shared by the playground's server-rendered seed and
 * its client re-render. If these two ever diverge, a no-JS visitor (and every
 * AI crawler, which does not run JS) sees different markup from a browser.
 */
import { describe, it, expect } from 'vitest';
import { convert } from './engine';
import { examples } from './examples';
import { resultHtml, errorHtml, summaryText, EMPTY_HTML } from './render';

const rawInput = examples[0].input; // 192.168.1.10
const seed = convert(rawInput);

describe('resultHtml', () => {
  it('renders the decimal / integer / hex / binary rows of the seed into static HTML', () => {
    const html = resultHtml(seed, { localePrefix: '', rawInput });
    expect(html).toContain('IPv4');
    expect(html).toContain('read as dotted decimal');
    expect(html).toContain('data-copy="192.168.1.10"');
    expect(html).toContain('data-copy="3232235786"');
    expect(html).toContain('data-copy="0xC0A8010A"');
    expect(html).toContain('data-copy="11000000.10101000.00000001.00001010"');
    expect(html).toContain('data-copy="10.1.168.192.in-addr.arpa"');
  });

  it('marks the row that echoes the input as "input"', () => {
    const html = resultHtml(seed, { localePrefix: '', rawInput });
    expect(html).toContain('<span class="ipc-chip-input">input</span>');
    const other = resultHtml(seed, { localePrefix: '', rawInput: '192.168.001.010' });
    expect(other).toContain('<span class="ipc-chip-input">input format</span>');
  });

  it('builds cross-tool links under the given locale prefix', () => {
    const en = resultHtml(seed, { localePrefix: '', rawInput });
    expect(en).toContain('href="/subnet-calculator#ip=192.168.1.10"');
    expect(en).toContain('href="/cidr-checker#ip=192.168.1.10"');
    expect(en).toContain('href="/reverse-dns-ptr/#ip=192.168.1.10"');
    expect(en).toContain('href="/reverse-dns-ptr/"');
    const de = resultHtml(seed, { localePrefix: '/de', rawInput });
    expect(de).toContain('href="/de/subnet-calculator#ip=192.168.1.10"');
    expect(de).toContain('href="/de/reverse-dns-ptr/"');
  });

  it('renders warnings above the card', () => {
    const withPrefix = convert('192.168.1.10/24');
    const html = resultHtml(withPrefix, { localePrefix: '', rawInput: '192.168.1.10/24' });
    expect(html).toContain('ipc-warnings__item');
    expect(html).toContain('Prefix /24 was ignored');
  });

  it('escapes engine strings rather than trusting them as markup', () => {
    const evil = { ...seed, detected: '<img src=x onerror=alert(1)>' };
    const html = resultHtml(evil, { localePrefix: '', rawInput });
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img');
  });
});

describe('summaryText', () => {
  it('names the version, and counts warnings when there are any', () => {
    expect(summaryText(seed)).toBe('IPv4');
    expect(summaryText(convert('192.168.1.10/24'))).toBe('IPv4 — 1 warning');
    expect(summaryText(convert('2001:db8::1'))).toBe('IPv6');
  });
});

describe('errorHtml', () => {
  it('escapes the diagnostic message', () => {
    expect(errorHtml('bad <input>')).toContain('bad &lt;input&gt;');
  });
});

describe('EMPTY_HTML', () => {
  it('is the empty-state paragraph', () => {
    expect(EMPTY_HTML).toMatch(/^<p class="ipc-empty /);
  });
});

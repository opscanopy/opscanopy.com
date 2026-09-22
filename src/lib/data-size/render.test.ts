/**
 * The pure HTML builders shared by the playground's server-rendered seed and
 * its client re-render. If these two ever diverge, a no-JS visitor (and every
 * AI crawler, which does not run JS) sees different markup from a browser.
 */
import { describe, it, expect } from 'vitest';
import { convert, transferTime, significantLadder } from './engine';
import { examples } from './examples';
import { resultHtml, errorCardHtml, buildCopyAll, crossLinksHtml, EMPTY_HTML } from './render';

const seed = convert(examples[0].size); // 1.5 GiB
const seedRungs = significantLadder(seed.ladder ?? []);

describe('resultHtml', () => {
  it('renders the seeded 1.5 GiB answer into static HTML', () => {
    const html = resultHtml(seed, null, seedRungs, { localePrefix: '' });
    expect(html).toContain('1610612736');
    expect(html).toContain('12884901888'); // bits
    expect(html).toContain('Exact size');
  });

  it('renders the SI/IEC ladder rungs', () => {
    const html = resultHtml(seed, null, seedRungs, { localePrefix: '' });
    expect(html).toContain('dsz-rung');
    expect(html).toContain('>GiB<');
    expect(html).toContain('>GB<');
    expect(html).toContain('IEC is ');
  });

  it('adds the transfer block only when the rate parsed', () => {
    const t = transferTime('500 GB', '1 Gbps');
    const r = convert('500 GB');
    const html = resultHtml(r, t, significantLadder(r.ladder ?? []), { localePrefix: '' });
    expect(html).toContain('Transfer time');
    expect(html).toContain('At line rate');
    expect(resultHtml(seed, null, seedRungs, { localePrefix: '' })).not.toContain('Transfer time');
  });

  it('builds cross-tool links under the given locale prefix', () => {
    expect(resultHtml(seed, null, seedRungs, { localePrefix: '' })).toContain(
      'href="/kubernetes-resource-calculator/"',
    );
    expect(resultHtml(seed, null, seedRungs, { localePrefix: '/de' })).toContain(
      'href="/de/kubernetes-resource-calculator/"',
    );
    expect(crossLinksHtml({ localePrefix: '/fr' })).toContain('href="/fr/subnet-calculator/"');
  });

  it('escapes engine strings rather than trusting them as markup', () => {
    const evil = { ...seed, notes: ['<img src=x onerror=alert(1)>'] };
    const html = resultHtml(evil, null, seedRungs, { localePrefix: '' });
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img');
  });
});

describe('errorCardHtml', () => {
  it('escapes the diagnostic and toggles role=alert', () => {
    const html = errorCardHtml('Bad', 'bad <input>', true, 'dsz-error-detail');
    expect(html).toContain('bad &lt;input&gt;');
    expect(html).toContain('role="alert"');
    expect(errorCardHtml('Bad', 'x', false, 'dsz-error-detail')).not.toContain('role="alert"');
  });
});

describe('buildCopyAll', () => {
  it('emits one label: value line per figure', () => {
    const text = buildCopyAll(seed, null);
    expect(text).toContain('Bytes: 1610612736');
    expect(text.split('\n').length).toBeGreaterThan(5);
  });
});

describe('EMPTY_HTML', () => {
  it('is the empty-state paragraph', () => {
    expect(EMPTY_HTML).toContain('class="dsz-empty');
  });
});

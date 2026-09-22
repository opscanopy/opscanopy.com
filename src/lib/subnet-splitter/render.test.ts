/**
 * The pure HTML builders shared by the playground's server-rendered seed and
 * its client re-render. If these two ever diverge, a no-JS visitor (and every
 * AI crawler, which does not run JS) sees different markup from a browser.
 */
import { describe, it, expect } from 'vitest';
import { split } from './engine';
import { examples } from './examples';
import { resultHtml, errorHtml, summaryText, EMPTY_HTML } from './render';

// 10.0.0.0/24 with 10.0.0.0/26 + 10.0.0.128/26 allocated, split into /26
const seedExample = examples[0];
const seed = split(seedExample.parent, seedExample.allocated, seedExample.newPrefix);

describe('resultHtml', () => {
  it('renders the free blocks of the seeded /24 into static HTML', () => {
    const html = resultHtml(seed);
    expect(html).toContain('Free space (minimal CIDRs)');
    expect(html).toContain('10.0.0.64/26');
    expect(html).toContain('10.0.0.192/26');
    expect(html).toContain('2 blocks');
  });

  it('renders the equal-size split with each subnet flagged', () => {
    const html = resultHtml(seed);
    expect(html).toContain('Split into /26');
    expect(html).toContain('4 subnets');
    expect(html).toContain('Next free: 10.0.0.64/26');
    expect(html).toContain('spl-dot--used');
    expect(html).toContain('spl-dot--free');
    expect(html).toContain('10.0.0.128/26');
  });

  it('renders the parsed allocations', () => {
    const html = resultHtml(seed);
    expect(html).toContain('Allocations');
    expect(html).toContain('2 lines');
    expect(html).toContain('spl-dot--ok');
  });

  it('escapes engine strings rather than trusting them as markup', () => {
    const evil = { ...seed, freeCidrs: ['<img src=x onerror=alert(1)>'] };
    const html = resultHtml(evil);
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img');
  });
});

describe('summaryText', () => {
  it('reads out the used percentage and free count', () => {
    expect(summaryText(seed)).toBe('used 50% · 128 free');
  });

  it('is empty without stats', () => {
    expect(summaryText({ ...seed, stats: undefined })).toBe('');
  });
});

describe('errorHtml', () => {
  it('escapes the diagnostic message', () => {
    expect(errorHtml('bad <input>')).toContain('bad &lt;input&gt;');
  });
});

describe('EMPTY_HTML', () => {
  it('is the empty-state paragraph', () => {
    expect(EMPTY_HTML).toMatch(/^<p class="spl-empty /);
  });
});

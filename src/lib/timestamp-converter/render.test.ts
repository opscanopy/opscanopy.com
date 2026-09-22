/**
 * The pure HTML builders shared by the playground's server-rendered seed and
 * its client re-render. If these two ever diverge, a no-JS visitor (and every
 * AI crawler, which does not run JS) sees different markup from a browser.
 *
 * The seed is PARTIAL by design: `Local` depends on the machine's timezone and
 * `Relative` on the clock, so the build renders those two rows as client-only
 * placeholders and the browser fills them in. Everything else about the fixed
 * epoch 1516239022 is deterministic.
 */
import { describe, it, expect } from 'vitest';
import { convert } from './engine';
import { examples } from './examples';
import { resultHtml, errorHtml, CLIENT_ONLY_LABELS, EMPTY_HTML } from './render';

const FIXED_NOW = Date.UTC(2026, 0, 1);
const seed = convert(examples[0].input, FIXED_NOW); // 1516239022

describe('resultHtml (server: two client-only rows)', () => {
  const html = resultHtml(seed, { clientOnlyLabels: CLIENT_ONLY_LABELS });

  it('renders the five deterministic representations of 1516239022', () => {
    expect(html).toContain('1516239022');
    expect(html).toContain('1516239022000');
    expect(html).toContain('2018-01-18T01:30:22.000Z');
    expect(html).toContain('Thursday');
    expect(html).toContain('January 18, 2018');
    expect(html).toContain('epoch seconds');
  });

  it('never bakes the clock- or timezone-dependent rows into HTML', () => {
    expect(html).not.toContain('ago');
    const local = seed.rows.find((r) => r.label === 'Local')!.value;
    const utc = seed.rows.find((r) => r.label === 'UTC')!.value;
    // On a UTC build machine Local === UTC; only assert the local value is
    // absent when the two actually differ.
    if (local !== utc) expect(html).not.toContain(local);
    expect(html.match(/data-client-only/g)?.length).toBe(2);
    expect(html).toContain('loads with JavaScript');
    // The labels still appear so the row structure is complete.
    expect(html).toContain('>Local<');
    expect(html).toContain('>Relative<');
    // Placeholders carry no copy button — there is no value to copy.
    expect(html.match(/ts-copy-btn/g)?.length).toBe(5);
  });
});

describe('resultHtml (client: full rows)', () => {
  it('renders every row with a value and a copy button when nothing is client-only', () => {
    const html = resultHtml(seed);
    expect(html).not.toContain('data-client-only');
    expect(html.match(/ts-copy-btn/g)?.length).toBe(7);
    expect(html).toContain('ago');
  });
});

describe('escaping', () => {
  it('escapes engine strings rather than trusting them as markup', () => {
    const evil = {
      ...seed,
      detected: '<script>alert(1)</script>',
      rows: [{ label: '<b>k</b>', value: '"><img src=x onerror=alert(1)>', mono: true }],
    };
    const html = resultHtml(evil);
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&quot;&gt;&lt;img');
  });

  it('escapes the diagnostic message', () => {
    expect(errorHtml('bad <input>')).toContain('bad &lt;input&gt;');
    expect(EMPTY_HTML).toMatch(/^<p class="ts-empty/);
  });
});

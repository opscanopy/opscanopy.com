/**
 * The pure HTML builders shared by the playground's server-rendered seed and
 * its client re-render. If these two ever diverge, a no-JS visitor (and every
 * AI crawler, which does not run JS) sees different markup from a browser.
 *
 * `explain()` is pure, synchronous and clock-free, so the whole result is safe
 * to bake at build time.
 */
import { describe, it, expect } from 'vitest';
import { explain } from './engine';
import { examples } from './examples';
import { resultHtml, summaryText, errorHtml, EMPTY_HTML, LOADING_HTML } from './render';

const seed = explain(examples[0].query); // histogram_quantile(0.95, sum by(le) (rate(...[5m])))

describe('the seeded example', () => {
  it('explains cleanly and renders one breakdown row per part', () => {
    expect(seed.error).toBeUndefined();
    const html = resultHtml(seed);
    expect(html).toContain('pq-explanation__text');
    expect(html).toContain('Estimates the p95');
    expect(html).toContain('histogram_quantile()');
    expect(html).toContain('http_request_duration_seconds_bucket');
    expect(html.match(/<li class="pq-part">/g)?.length).toBe(seed.breakdown.length);
    expect(seed.breakdown.length).toBeGreaterThan(0);
  });

  it('summarises as an N-parts count the way the client status line does', () => {
    expect(summaryText(seed)).toBe(`${seed.breakdown.length} parts`);
  });
});

describe('resultHtml', () => {
  it('escapes every injected value', () => {
    const html = resultHtml({
      explanation: 'a < b & c',
      breakdown: [{ token: '<x>', meaning: '"q" & r' }],
    });
    expect(html).toContain('a &lt; b &amp; c');
    expect(html).toContain('&lt;x&gt;');
    expect(html).toContain('&quot;q&quot; &amp; r');
    expect(html).not.toContain('<x>');
  });

  it('routes an error result to the alert banner and an empty one to the empty state', () => {
    expect(resultHtml({ error: 'bad <q>', explanation: '', breakdown: [] })).toContain('bad &lt;q&gt;');
    expect(resultHtml({ error: 'x', explanation: '', breakdown: [] })).toContain('role="alert"');
    expect(resultHtml({ explanation: '', breakdown: [] })).toBe(EMPTY_HTML);
  });

  it('drops rows with neither token nor meaning and tolerates a missing breakdown', () => {
    const html = resultHtml({ explanation: 'ok.', breakdown: [{ token: '', meaning: '' }] });
    expect(html).not.toContain('pq-part');
    expect(resultHtml({ explanation: 'ok.' } as never)).toContain('ok.');
  });
});

describe('summaryText', () => {
  it('reads Error / empty / Explained / 1 part / N parts', () => {
    expect(summaryText({ error: 'x', explanation: '', breakdown: [] })).toBe('Error');
    expect(summaryText({ explanation: '', breakdown: [] })).toBe('');
    expect(summaryText({ explanation: 'ok.', breakdown: [] })).toBe('Explained');
    expect(summaryText({ explanation: 'ok.', breakdown: [{ token: 'a', meaning: 'b' }] })).toBe('1 part');
  });
});

describe('errorHtml / static states', () => {
  it('escapes the diagnostic message', () => {
    expect(errorHtml('bad <input>')).toContain('bad &lt;input&gt;');
    expect(errorHtml('x')).toContain('Could not explain this query');
  });

  it('keeps the empty and loading states stable strings', () => {
    expect(EMPTY_HTML).toMatch(/^<p class="pq-empty/);
    expect(LOADING_HTML).toContain('Explaining…');
  });
});

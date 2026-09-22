/**
 * The pure HTML builders shared by the playground's server-rendered seed and
 * its client re-render. If these two ever diverge, a no-JS visitor (and every
 * AI crawler, which does not run JS) sees different markup from a browser.
 *
 * `applyRelabel()` is pure and synchronous — even `hashmod` is a deterministic
 * MD5 — so the whole result is safe to bake at build time.
 */
import { describe, it, expect } from 'vitest';
import { applyRelabel } from './engine';
import { examples } from './examples';
import {
  resultsHtml,
  summaryText,
  allDropped,
  errorHtml,
  EMPTY_HTML,
  LOADING_HTML,
} from './render';
import type { TargetResult } from './types';

const seed = applyRelabel(examples[0].configs, examples[0].labels); // k8s keep + labelmap

describe('the seeded example', () => {
  it('keeps the opted-in pod and drops the other, one card per label set', () => {
    expect(seed.ok).toBe(true);
    const results = seed.results ?? [];
    expect(results.length).toBe(2);
    const html = resultsHtml(seed);
    expect(html.match(/class="prt-card(?: prt-card--dropped)?"/g)?.length).toBe(2);
    expect(html).toContain('Set 1');
    expect(html).toContain('Set 2');
    expect(html).toContain('prt-pill--kept');
    expect(html).toContain('prt-pill--dropped');
    expect(html).toContain('by rule 1 (<code>keep</code>)');
    // labelmap promoted app/tier — tagged as added.
    expect(html).toContain('<span class="prt-label__name">app</span>');
    expect(html).toContain('prt-tag--added');
    expect(html).toContain('10.0.0.5:8080');
  });

  it('summarises kept / dropped / sets the way the client status line does', () => {
    expect(summaryText(seed.results ?? [])).toBe('1 kept · 1 dropped · 2 sets');
    expect(allDropped(seed.results ?? [])).toBe(false);
  });
});

describe('resultsHtml', () => {
  const base: TargetResult = {
    index: 1,
    input: [{ name: 'a<b', value: 'x&y' }],
    dropped: false,
    output: [{ name: 'a<b', value: 'x&y' }, { name: 'n', value: '"q"' }],
    changes: [
      { name: 'n', kind: 'added', after: '"q"' },
      { name: 'gone', kind: 'removed', before: '<old>' },
    ],
  };

  it('escapes names, values and removed labels', () => {
    const html = resultsHtml({ ok: true, results: [base], warnings: [] });
    expect(html).toContain('a&lt;b');
    expect(html).toContain('x&amp;y');
    expect(html).toContain('&quot;q&quot;');
    expect(html).toContain('gone="&lt;old&gt;"');
    expect(html).not.toContain('<old>');
    expect(html).toContain('prt-section-label">Removed');
  });

  it('renders warnings after the cards and escapes them', () => {
    const html = resultsHtml({ ok: true, results: [base], warnings: ['note <1>'] });
    expect(html).toContain('prt-warning');
    expect(html).toContain('note &lt;1&gt;');
    expect(html.indexOf('prt-card')).toBeLessThan(html.indexOf('prt-warnings'));
  });

  it('routes a failed run and an empty result set to the error banner', () => {
    expect(resultsHtml({ ok: false, error: 'bad <yaml>', warnings: [] })).toContain('bad &lt;yaml&gt;');
    expect(resultsHtml({ ok: true, results: [], warnings: [] })).toContain(
      'No label sets were produced'
    );
  });
});

describe('summaryText / allDropped', () => {
  it('pluralises sets and omits a zero dropped count', () => {
    const kept: TargetResult = { index: 1, input: [], dropped: false, output: [], changes: [] };
    const dropped: TargetResult = { ...kept, index: 2, dropped: true };
    expect(summaryText([kept])).toBe('1 kept · 1 set');
    expect(summaryText([dropped, dropped])).toBe('0 kept · 2 dropped · 2 sets');
    expect(allDropped([dropped, dropped])).toBe(true);
    expect(allDropped([])).toBe(false);
  });
});

describe('errorHtml / static states', () => {
  it('escapes the diagnostic message', () => {
    expect(errorHtml('bad <input>')).toContain('bad &lt;input&gt;');
    expect(errorHtml('x')).toContain('role="alert"');
  });

  it('keeps the empty and loading states stable strings', () => {
    expect(EMPTY_HTML).toMatch(/^<p class="prt-empty/);
    expect(LOADING_HTML).toContain('Applying rules…');
  });
});

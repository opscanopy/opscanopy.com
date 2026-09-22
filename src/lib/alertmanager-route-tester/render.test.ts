/**
 * The pure HTML builders shared by the playground's server-rendered seed and
 * its client re-render. If these two ever diverge, a no-JS visitor (and every
 * AI crawler, which does not run JS) sees different markup from a browser.
 *
 * `matchRoute()` is pure and synchronous — no clock, no DOM — so the whole
 * result is safe to bake at build time.
 */
import { describe, it, expect } from 'vitest';
import { matchRoute } from './engine';
import { examples } from './examples';
import { resultHtml, resultSummaryText, errorHtml, matchHtml, EMPTY_HTML } from './render';

const seed = matchRoute(examples[0].config, examples[0].labels); // docs tree → database team

describe('resultHtml (the seeded docs-tree example)', () => {
  it('renders the matched receiver, its path breadcrumb and the inherited grouping', () => {
    expect(seed.ok).toBe(true);
    const html = resultHtml(seed);
    expect(html).toContain('amr-match__rx">team-DB-pages<');
    expect(html).toContain('amr-crumb">root<');
    expect(html).toContain('amr-crumb amr-crumb--last">team-DB-pages<');
    expect(html).toContain('[alertname, cluster, database]');
    expect(html).toContain('group_wait</span> <span class="amr-group__v">30s');
  });

  it('emits exactly one .amr-match card per terminal receiver', () => {
    const one = resultHtml(seed).match(/class="amr-match"/g) ?? [];
    expect(one.length).toBe(1);
    const cont = matchRoute(examples[1].config, examples[1].labels); // continue → two receivers
    const two = resultHtml(cont).match(/class="amr-match"/g) ?? [];
    expect(two.length).toBe(2);
    expect(resultHtml(cont)).toContain('via continue');
  });

  it('escapes receiver names, path segments and grouping values', () => {
    const evil = {
      ...seed,
      matches: [
        {
          receiver: '<img src=x onerror=alert(1)>',
          path: ['root', 'a & b'],
          grouping: { group_by: ['<x>'], group_wait: '1s<' },
          viaContinue: false,
          matchers: [],
        },
      ],
    };
    const html = resultHtml(evil);
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img');
    expect(html).toContain('a &amp; b');
    expect(html).toContain('[&lt;x&gt;]');
  });

  it('renders the error card for a failed result', () => {
    const bad = matchRoute('route: [', 'a=b');
    expect(bad.ok).toBe(false);
    const html = resultHtml(bad);
    expect(html).toContain('amr-error');
    expect(html).toContain('Could not evaluate the route');
  });

  it('renders the warnings list under the matches', () => {
    const html = resultHtml({ ...seed, warnings: ['careful <here>'] });
    expect(html).toContain('amr-warns');
    expect(html).toContain('careful &lt;here&gt;');
  });
});

describe('resultSummaryText', () => {
  it('counts receivers and names them', () => {
    expect(resultSummaryText(seed)).toBe('1 receiver · team-DB-pages');
    const cont = matchRoute(examples[1].config, examples[1].labels);
    expect(resultSummaryText(cont)).toBe('2 receivers · all-critical-audit, team-Y-pages');
  });

  it('says Error for a failed result', () => {
    expect(resultSummaryText(matchRoute('', ''))).toBe('Error');
  });
});

describe('errorHtml / matchHtml / EMPTY_HTML', () => {
  it('escapes the diagnostic message', () => {
    expect(errorHtml('bad <input>')).toContain('bad &lt;input&gt;');
  });

  it('labels a blank receiver as (no receiver) and numbers multi-match cards', () => {
    const m = { receiver: '  ', path: ['root'], grouping: {}, viaContinue: true, matchers: [] };
    const html = matchHtml(m, 1, 2);
    expect(html).toContain('(no receiver)');
    expect(html).toContain('amr-pill">#2<');
    expect(html).toContain('via continue');
  });

  it('keeps the empty-state copy the shell used to hardcode', () => {
    expect(EMPTY_HTML).toContain('amr-empty');
  });
});

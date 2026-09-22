/**
 * The pure HTML builders shared by the playground's server-rendered seed and
 * its client re-render. If these two ever diverge, a no-JS visitor (and every
 * AI crawler, which does not run JS) sees different markup from a browser.
 *
 * `run()` is pure and synchronous (a RegExp over a fixed string), so the match
 * table AND the highlighted preview are safe to bake at build time.
 */
import { describe, it, expect } from 'vitest';
import { run } from './engine';
import { examples } from './examples';
import { resultsHtml, summaryText, buildHighlight, errorHtml, EMPTY_HTML } from './render';

const ex = examples[0]; // nginx access log — four lines, four numbered groups
const seed = run(ex.pattern, ex.flags, ex.text);

describe('the seeded example', () => {
  it('matches every access-log line and renders one table row per match', () => {
    expect(seed.valid).toBe(true);
    expect(seed.matchCount).toBe(4);
    const html = resultsHtml(seed);
    expect(html).toContain('rx-table');
    expect(html.match(/<tr><td/g)?.length).toBe(4);
    expect(html).toContain('192.168.1.24');
    expect(html).toContain('/api/health');
    expect(html).toContain('rx-group__key">$1<');
    // The matched substring contains quotes — they must arrive escaped.
    expect(html).toContain('&quot;GET /api/health HTTP/1.1&quot; 200');
    expect(html).not.toContain('"GET /api/health');
    expect(summaryText(seed)).toBe('4 matches');
  });

  it('highlights the same four spans in the preview', () => {
    const html = buildHighlight(ex.text, seed.matches);
    expect(html).toMatch(/^<pre class="rx-pre">/);
    expect(html.match(/<mark class="rx-mark/g)?.length).toBe(4);
    expect(html).toContain('rx-mark--alt');
    expect(html).toContain('&quot;curl/8.4.0&quot;');
  });
});

describe('resultsHtml', () => {
  it('escapes matched text and group values', () => {
    const r = run('(<[^>]+>)', 'g', 'a <script>alert(1)</script> b');
    const html = resultsHtml(r);
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script>');
  });

  it('renders named groups, empty groups and zero-width matches', () => {
    const r = run('(?<lvl>WARN|ERROR)(x)?', 'g', 'a WARN b');
    const html = resultsHtml(r);
    expect(html).toContain('rx-group__key">lvl<');
    expect(html).toContain('rx-group__val--empty">empty<');
    const z = resultsHtml(run('^', 'gm', 'a\nb'));
    expect(z).toContain('(empty match)');
    expect(summaryText(run('^', 'gm', 'a\nb'))).toBe('2 matches');
    expect(summaryText(run('^', '', 'a'))).toBe('1 match');
  });

  it('shows the no-match note, keeps a notice above real results, and flags an invalid pattern', () => {
    expect(resultsHtml(run('zzz', 'g', 'abc'))).toContain('rx-nomatch');
    const noticed = resultsHtml({ valid: true, notice: 'cap <hit>', matchCount: 0, matches: [] });
    expect(noticed).toContain('rx-notice');
    expect(noticed).toContain('cap &lt;hit&gt;');
    const bad = run('(', 'g', 'abc');
    expect(bad.valid).toBe(false);
    expect(resultsHtml(bad)).toContain('Invalid pattern');
    expect(resultsHtml(bad)).toContain('role="alert"');
    expect(summaryText(bad)).toBe('Invalid');
  });
});

describe('buildHighlight', () => {
  it('escapes unmatched text and shows the empty note for empty text', () => {
    expect(buildHighlight('', [])).toContain('rx-hl-empty');
    expect(buildHighlight('<b>&', [])).toContain('&lt;b&gt;&amp;');
    const z = buildHighlight('ab', [{ index: 1, length: 0, match: '', groups: [], named: {} }]);
    expect(z).toContain('rx-mark--empty');
  });
});

describe('errorHtml / static states', () => {
  it('escapes the diagnostic message', () => {
    expect(errorHtml('Invalid pattern', 'bad <input>')).toContain('bad &lt;input&gt;');
  });
  it('keeps the empty state a stable string', () => {
    expect(EMPTY_HTML).toMatch(/^<p class="rx-empty/);
  });
});

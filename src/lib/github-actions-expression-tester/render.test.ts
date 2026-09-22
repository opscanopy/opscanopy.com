/**
 * The pure HTML builders shared by the expression tab's server-rendered seed
 * and its client re-render. If these two ever diverge, a no-JS visitor (and
 * every AI crawler, which does not run JS) sees different markup from a browser.
 *
 * `defaultContext()` is a frozen literal and `evaluateIfCondition` is pure, so
 * the seed is deterministic and safe to bake at build time.
 */
import { describe, it, expect } from 'vitest';
import { evaluateIfCondition, defaultContext } from './engine';
import { expressionExamples } from './examples';
import { exprResultHtml, exprSummaryText, warnHtml, evalErrorHtml, EXPR_EMPTY_HTML } from './render';

const seed = evaluateIfCondition(expressionExamples[0].expression, defaultContext());

describe('exprResultHtml (the seeded footgun example)', () => {
  it('renders the verdict, the returned value and the footgun warning', () => {
    const html = exprResultHtml(seed);
    expect(seed.truthy).toBe(true);
    expect(html).toContain('ga-verdict__badge is-true');
    expect(html).toContain('>TRUE<');
    expect(html).toContain('would <strong>RUN</strong> the step');
    expect(html).toContain('Always-true footgun (runner#1173)');
    expect(html).toContain('ALWAYS true');
  });

  it('escapes the rendered value and every engine string rather than trusting them as markup', () => {
    const html = exprResultHtml(seed);
    // The rendered value is `push == 'push'` — the quotes must be entity-escaped.
    expect(html).toContain('push == &#39;push&#39;');
    const evil = {
      ...seed,
      rendered: '<img src=x onerror=alert(1)>',
      explanation: 'a & b <c>',
      breakdown: [{ token: '<t>', meaning: 'm & n' }],
    };
    const evilHtml = exprResultHtml(evil);
    expect(evilHtml).not.toContain('<img src=x');
    expect(evilHtml).toContain('&lt;img');
    expect(evilHtml).toContain('a &amp; b &lt;c&gt;');
    expect(evilHtml).toContain('&lt;t&gt;');
  });

  it('renders null as an explicit "null (an empty string)" value', () => {
    const html = exprResultHtml({ ...seed, value: null, rendered: '', truthy: false });
    expect(html).toContain('null (an empty string)');
    expect(html).toContain('>FALSE<');
    expect(html).toContain('would <strong>SKIP</strong> the step');
  });

  it('prepends a context note when the mock context could not be parsed', () => {
    const html = exprResultHtml(seed, { contextError: 'Bad JSON <here>' });
    expect(html).toContain('Bad JSON &lt;here&gt; Using the default context.');
    expect(html).toContain('ga-warn is-info');
  });

  it('emits one breakdown row per part', () => {
    const wrapped = evaluateIfCondition(expressionExamples[1].expression, defaultContext());
    const html = exprResultHtml(wrapped);
    const rows = html.match(/class="ga-part"/g) ?? [];
    expect(rows.length).toBe(wrapped.breakdown.length);
    expect(rows.length).toBeGreaterThan(0);
  });
});

describe('exprSummaryText', () => {
  it('is the bare truthiness word the status line shows', () => {
    expect(exprSummaryText(seed)).toBe('true');
    expect(exprSummaryText({ ...seed, truthy: false })).toBe('false');
  });
});

describe('warnHtml / evalErrorHtml / EXPR_EMPTY_HTML', () => {
  it('uses role="note" for infos and role="alert" for warnings', () => {
    expect(warnHtml({ id: 'x', severity: 'info', message: 'm' })).toContain('role="note"');
    expect(warnHtml({ id: 'x', severity: 'warning', message: 'm' })).toContain('role="alert"');
  });

  it('escapes the thrown error text', () => {
    expect(evalErrorHtml('Could not evaluate', 'boom <b>')).toContain('boom &lt;b&gt;');
  });

  it('keeps the empty-state copy the shell used to hardcode', () => {
    expect(EXPR_EMPTY_HTML).toContain('ga-empty');
  });
});

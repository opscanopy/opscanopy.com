/**
 * The pure HTML builders shared by the playground's server-rendered seed and
 * its client re-render. If these two ever diverge, a no-JS visitor (and every
 * AI crawler, which does not run JS) sees different markup from a browser.
 *
 * `lintDashboard()` reads a clock in exactly one rule (`time-range-absurd`), so
 * the seed is built with a pinned `now` and this suite asserts nothing
 * wall-clock-shaped leaks into the markup.
 */
import { describe, it, expect } from 'vitest';
import { lintDashboard, summaryLine, RULE_IDS } from './engine';
import { examples } from './examples';
import {
  resultHtml,
  rowHtml,
  rowText,
  reportText,
  errorCardHtml,
  cleanHtml,
  ruleAnchor,
  EMPTY_HTML,
  MAX_ROWS_PER_GROUP,
} from './render';

const SEED_NOW = Date.UTC(2026, 0, 1);
const seed = lintDashboard(examples[0].json, { now: SEED_NOW }); // kitchen sink
const opts = { ruleCount: RULE_IDS.length };

describe('resultHtml (the seeded kitchen-sink example)', () => {
  it('renders the three severity groups with one .gd-row per finding', () => {
    expect(seed.ok).toBe(true);
    const html = resultHtml(seed, opts);
    const rows = html.match(/class="gd-row gd-row--(?:error|warning|info)"/g) ?? [];
    expect(rows.length).toBe(seed.diagnostics.length);
    expect(html).toContain('<span>Errors</span>');
    expect(html).toContain('<span>Warnings</span>');
    expect(html).toContain('<span>Notes</span>');
    expect(html).toContain('Panel id 1 is already used by &quot;Requests&quot; (panels[0]).');
    expect(html).toContain('href="#rule-duplicate-panel-id"');
  });

  it('carries no wall-clock text — the time-range finding quotes the expressions verbatim', () => {
    const html = resultHtml(seed, opts);
    expect(html).toContain('&quot;now-5y&quot; to &quot;now&quot;');
    expect(html).not.toMatch(/20\d\d-\d\d-\d\dT/);
    expect(html).not.toContain(String(SEED_NOW));
  });

  it('is byte-identical across two builds with the same pinned now', () => {
    const again = lintDashboard(examples[0].json, { now: SEED_NOW });
    expect(resultHtml(again, opts)).toBe(resultHtml(seed, opts));
  });

  it('escapes paths, messages and hints — attribute contexts included', () => {
    const evil = {
      ...seed,
      diagnostics: [
        {
          id: 'no-uid' as const,
          severity: 'error' as const,
          path: 'panels[0]."<x>"',
          message: 'a & b <c>',
          hint: 'fix "<d>"',
        },
      ],
    };
    const html = resultHtml(evil, opts);
    expect(html).not.toContain('<x>');
    expect(html).toContain('&lt;x&gt;');
    expect(html).toContain('a &amp; b &lt;c&gt;');
    expect(html).toContain('fix &quot;&lt;d&gt;&quot;');
  });

  it('renders the clean card for a dashboard with no findings', () => {
    const clean = lintDashboard(examples[1].json, { now: SEED_NOW });
    expect(clean.diagnostics).toEqual([]);
    const html = resultHtml(clean, opts);
    expect(html).toContain('gd-clean');
    expect(html).toContain(`All ${RULE_IDS.length} rules ran`);
  });

  it('caps each group at MAX_ROWS_PER_GROUP and says so', () => {
    const many = Array.from({ length: MAX_ROWS_PER_GROUP + 3 }, (_, i) => ({
      id: 'empty-targets' as const,
      severity: 'warning' as const,
      path: `panels[${i}]`,
      message: `m${i}`,
    }));
    const html = resultHtml({ ...seed, diagnostics: many }, opts);
    const rows = html.match(/class="gd-row gd-row--warning"/g) ?? [];
    expect(rows.length).toBe(MAX_ROWS_PER_GROUP);
    expect(html).toContain(`Showing the first ${MAX_ROWS_PER_GROUP} of ${MAX_ROWS_PER_GROUP + 3}`);
  });
});

describe('rowText / reportText', () => {
  it('shapes one plain-text line per finding for a review comment', () => {
    const d = seed.diagnostics[0];
    const line = rowText(d);
    expect(line.startsWith(`${d.severity === 'info' ? 'note' : d.severity} ${d.id} (${d.path}): `)).toBe(true);
  });

  it('builds the copy-all report from the summary line', () => {
    const text = reportText(seed, summaryLine(seed));
    expect(text).toContain('Grafana Dashboard Validator — 7 errors, 12 warnings, 3 notes');
    expect(text).toContain('ERRORS (7)');
    expect(text).toContain('opscanopy.com/grafana-dashboard-validator/');
  });
});

describe('rowHtml / errorCardHtml / cleanHtml / ruleAnchor / EMPTY_HTML', () => {
  it('links the rule id to its catalog anchor and indexes the copy button', () => {
    const html = rowHtml(seed.diagnostics[2], 2);
    expect(html).toContain('data-gd-row="2"');
    expect(html).toContain(`href="${ruleAnchor(seed.diagnostics[2].id)}"`);
  });

  it('escapes the error detail and toggles role="alert"', () => {
    expect(errorCardHtml('bad <input>', true)).toContain('bad &lt;input&gt;');
    expect(errorCardHtml('x', true)).toContain('role="alert"');
    expect(errorCardHtml('x', false)).not.toContain('role="alert"');
  });

  it('phrases the clean card scope with rows when there are rows', () => {
    const withRows = { ...seed, stats: { ...seed.stats, panels: 4, rows: 2 } };
    expect(cleanHtml(withRows, 22)).toContain('4 panels in 2 rows');
  });

  it('keeps the empty-state copy the shell used to hardcode', () => {
    expect(EMPTY_HTML).toContain('gd-empty');
  });
});

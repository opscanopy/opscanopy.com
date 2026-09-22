/**
 * The pure HTML builders shared by the playground's server-rendered seed and
 * its client re-render. If these two ever diverge, a no-JS visitor (and every
 * AI crawler, which does not run JS) sees different markup from a browser.
 *
 * `runTests()` is deterministic EXCEPT for `summary.durationMs`, a wall-clock
 * reading. The builders here never render it: the client appends the timing
 * itself (`formatDuration`), and the build-time seed leaves it out entirely so
 * the static HTML is reproducible.
 */
import { describe, it, expect } from 'vitest';
import { runTests } from './engine';
import { examples } from './examples';
import {
  resultsHtml,
  countsText,
  formatDuration,
  rowHtml,
  errorHtml,
  EMPTY_HTML,
  NO_TESTS_HTML,
} from './render';

const seed = runTests(examples[0].rulesYaml, examples[0].testYaml); // High auth failure rate

describe('resultsHtml (the seeded passing example)', () => {
  it('renders one .al-row per assertion with its name, kind, eval time and message', () => {
    expect(seed.ok).toBe(true);
    const html = resultsHtml(seed);
    const rows = html.match(/class="al-row al-row--(?:pass|fail)"/g) ?? [];
    expect(rows.length).toBe(seed.results.length);
    expect(rows.length).toBe(1);
    expect(html).toContain('al-row al-row--pass');
    expect(html).toContain('HighAuthFailureRate');
    expect(html).toContain('alert · @ 5m');
    expect(html).toContain('Fired 1 alert(s) with the expected labels and annotations.');
    expect(html).toContain('<span class="sr-only">Passed: </span>');
  });

  it('never carries the wall-clock duration', () => {
    const html = resultsHtml(seed);
    expect(seed.summary.durationMs).toBeGreaterThanOrEqual(0);
    expect(html).not.toMatch(/\bms\b/);
    expect(html).not.toMatch(/ran in/i);
    expect(html).not.toContain(String(seed.summary.durationMs) + ' ms');
  });

  it('escapes names, messages and diff values', () => {
    const evil = {
      ...seed,
      results: [
        {
          name: '<img src=x onerror=alert(1)>',
          evalTime: '5m',
          status: 'fail' as const,
          kind: 'alert' as const,
          message: 'a & b',
          diff: { expected: '<e>', actual: { labels: '<a>' } },
        },
      ],
    };
    const html = resultsHtml(evil);
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img');
    expect(html).toContain('a &amp; b');
    expect(html).toContain('al-diff__row--exp');
    expect(html).toContain('&lt;e&gt;');
    expect(html).toContain('&quot;labels&quot;: &quot;&lt;a&gt;&quot;');
  });

  it('renders the error card for a failed run and the empty note for zero cases', () => {
    const bad = runTests('groups: [', examples[0].testYaml);
    expect(bad.ok).toBe(false);
    expect(resultsHtml(bad)).toContain('al-error');
    expect(resultsHtml(bad)).toContain('Could not run tests');
    expect(resultsHtml({ ...seed, results: [] })).toBe(NO_TESTS_HTML);
  });
});

describe('countsText', () => {
  it('reports passed only, or passed and failed, with no timing', () => {
    expect(countsText(seed.summary)).toBe('1 passed');
    expect(countsText({ total: 3, passed: 2, failed: 1, durationMs: 42 })).toBe('2 passed · 1 failed');
    expect(countsText(seed.summary)).not.toMatch(/ms/);
  });
});

describe('formatDuration', () => {
  it('formats the client-only timing suffix', () => {
    expect(formatDuration(0.4)).toBe('<1 ms');
    expect(formatDuration(3.4)).toBe('3 ms');
    expect(formatDuration(Number.NaN)).toBe('');
  });
});

describe('rowHtml / errorHtml / EMPTY_HTML', () => {
  it('shows the diff only on a failing row', () => {
    const base = { name: 'n', evalTime: '1m', kind: 'alert' as const, message: 'm', diff: { expected: 'x', actual: 'y' } };
    expect(rowHtml({ ...base, status: 'pass' })).not.toContain('al-diff');
    expect(rowHtml({ ...base, status: 'fail' })).toContain('al-diff');
  });

  it('escapes the diagnostic message', () => {
    expect(errorHtml('bad <input>')).toContain('bad &lt;input&gt;');
  });

  it('keeps the empty-state copy the shell used to hardcode', () => {
    expect(EMPTY_HTML).toContain('al-empty');
  });
});

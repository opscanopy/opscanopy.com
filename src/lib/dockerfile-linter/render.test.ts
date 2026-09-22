/**
 * The pure HTML builders shared by the playground's server-rendered seed and
 * its client re-render. If these two ever diverge, a no-JS visitor (and every
 * AI crawler, which does not run JS) sees different markup from a browser.
 */
import { describe, it, expect } from 'vitest';
import { lint, summaryLine } from './engine';
import { examples } from './examples';
import {
  resultHtml,
  rowHtml,
  rowText,
  errorCardHtml,
  reportText,
  truncationHtml,
  EMPTY_HTML,
  MAX_ROWS_PER_GROUP,
} from './render';
import type { Finding, LintResult } from './types';

const seed = lint(examples[0].dockerfile); // "Kitchen sink" — 15 findings
const clean = lint(examples[1].dockerfile); // "Clean multi-stage Node"

describe('resultHtml', () => {
  it('renders the seeded kitchen-sink findings into static HTML', () => {
    const html = resultHtml(seed);
    expect(seed.ok).toBe(true);
    expect(html).toContain('Piping a download straight into a shell.');
    expect(html).toContain('href="#rule-df012"');
    expect(html).toContain('data-df-jump="8"');
    expect(html).toContain('class="df-row df-row--error"');
    expect(html.match(/class="df-row df-row--/g)).toHaveLength(15);
  });

  it('heads each group with its name and count, errors first', () => {
    const html = resultHtml(seed);
    const errors = html.indexOf('<span>Errors</span>');
    const warnings = html.indexOf('<span>Warnings</span>');
    const notes = html.indexOf('<span>Notes</span>');
    expect(errors).toBeGreaterThanOrEqual(0);
    expect(warnings).toBeGreaterThan(errors);
    expect(notes).toBeGreaterThan(warnings);
    expect(html).toContain('<span class="df-group__count">12</span>');
  });

  it('renders the clean frame with the real instruction and stage counts', () => {
    const html = resultHtml(clean);
    expect(clean.findings).toEqual([]);
    expect(html).toContain('No findings — nice Dockerfile.');
    expect(html).toContain('2 stages');
  });

  it('never emits a live region or a time-dependent value', () => {
    const html = resultHtml(seed);
    expect(html).not.toContain('aria-live');
    expect(html).not.toMatch(/\d+\s?ms\b/);
  });
});

describe('rowHtml / rowText', () => {
  const evil: Finding = {
    id: 'DF001',
    severity: 'warning',
    title: '<img src=x onerror=alert(1)>',
    detail: 'a & b < c',
    line: 3,
    remediation: 'Use `COPY` & not <ADD>',
  };

  it('escapes every injected value, including those inside attributes', () => {
    const html = rowHtml(evil, 0);
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img');
    expect(html).toContain('a &amp; b &lt; c');
    expect(html).toContain('<code>COPY</code>');
    expect(html).toContain('&lt;ADD&gt;');
    expect(html).toContain('data-df-row="0"');
  });

  it('builds one plain-text line per finding', () => {
    expect(rowText(evil)).toBe('L3 DF001: <img src=x onerror=alert(1)> — fix: Use `COPY` & not <ADD>');
  });
});

describe('errorCardHtml', () => {
  it('escapes the message and only carries role=alert on a committed run', () => {
    expect(errorCardHtml('bad <x>', false)).toContain('bad &lt;x&gt;');
    expect(errorCardHtml('m', false)).not.toContain('role="alert"');
    expect(errorCardHtml('m', true)).toContain('role="alert"');
  });
});

describe('reportText', () => {
  it('opens with the summary line and lists each severity group', () => {
    const text = reportText(seed, summaryLine(seed));
    expect(text.startsWith('Dockerfile Linter — 1 error, 12 warnings, 2 info across')).toBe(true);
    expect(text).toContain('ERRORS (1)');
    expect(text).toContain('WARNINGS (12)');
    expect(text).toContain('L8 DF012: Piping a download straight into a shell.');
  });
});

describe('truncationHtml', () => {
  it('states the engine caps rather than hiding them', () => {
    const capped: LintResult = {
      ...seed,
      truncatedRules: [{ ruleId: 'DF012', shown: 20, total: 30 }],
      truncated: true,
    };
    const html = truncationHtml(capped);
    expect(html).toContain('DF012 matched 30 places; the first 20 are listed.');
    expect(html).toContain('the list stops here');
    expect(truncationHtml(seed)).toBe('');
  });

  it('caps the rows rendered per group in the DOM', () => {
    expect(MAX_ROWS_PER_GROUP).toBe(50);
  });
});

describe('EMPTY_HTML', () => {
  it('keeps the empty-state copy the script and the markup agree on', () => {
    expect(EMPTY_HTML).toContain('df-empty');
  });
});

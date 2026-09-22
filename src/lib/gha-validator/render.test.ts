/**
 * The pure HTML builders shared by the playground's server-rendered seed and
 * its client re-render. If these two ever diverge, a no-JS visitor (and every
 * AI crawler, which does not run JS) sees different markup from a browser.
 */
import { describe, it, expect } from 'vitest';
import { validate } from './engine';
import { examples } from './examples';
import { resultsHtml, resultSummary, errorHtml, findingHtml, EMPTY_HTML } from './render';
import type { Finding, ValidateResult } from './types';

const seed = validate(examples[0].yaml); // "Vulnerable workflow"

const clean: ValidateResult = { ok: true, findings: [], summary: { errors: 0, warnings: 0, infos: 0 } };
const broken: ValidateResult = {
  ok: false,
  error: 'bad indentation of a mapping entry (3:5)',
  findings: [],
  summary: { errors: 0, warnings: 0, infos: 0 },
};

describe('resultsHtml', () => {
  it('renders the seeded vulnerable workflow findings into static HTML', () => {
    const html = resultsHtml(seed);
    expect(seed.ok).toBe(true);
    expect(html).toContain('pull_request_target checks out untrusted PR code.');
    expect(html).toContain('class="gha-row gha-row--error"');
    expect(html).toMatch(/<span class="gha-line">Line \d+<\/span>/);
    expect(html).toContain('<div class="gha-fix">');
  });

  it('groups findings error → warning → info with a count per group', () => {
    const html = resultsHtml(seed);
    const errors = html.indexOf('Errors <span aria-hidden="true">·</span>');
    const warnings = html.indexOf('Warnings <span aria-hidden="true">·</span>');
    expect(errors).toBeGreaterThanOrEqual(0);
    expect(warnings).toBeGreaterThan(errors);
  });

  it('renders the success frame for a clean workflow', () => {
    const html = resultsHtml(clean);
    expect(html).toContain('No issues found.');
    expect(html).toContain('gha-success');
  });

  it('renders the parse-error banner for ok:false', () => {
    const html = resultsHtml(broken);
    expect(html).toContain('Could not parse workflow');
    expect(html).toContain('bad indentation of a mapping entry (3:5)');
  });

  it('never emits a live region or a time-dependent value', () => {
    const html = resultsHtml(seed);
    expect(html).not.toContain('aria-live');
    expect(html).not.toMatch(/\d+\s?ms\b/);
  });
});

describe('findingHtml', () => {
  it('escapes finding text rather than trusting it as markup', () => {
    const evil: Finding = {
      id: 'x',
      severity: 'warning',
      title: '<img src=x onerror=alert(1)>',
      detail: 'a & b < c',
      remediation: 'Use `permissions: read-all` & pin <sha>',
    };
    const html = findingHtml(evil);
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img');
    expect(html).toContain('a &amp; b &lt; c');
    // Backticks become inline code; everything else stays escaped.
    expect(html).toContain('<code>permissions: read-all</code>');
    expect(html).toContain('&lt;sha&gt;');
  });

  it('coerces an unknown severity to info', () => {
    const f = { id: 'x', severity: 'fatal', title: 't', detail: 'd' } as unknown as Finding;
    expect(findingHtml(f)).toContain('gha-row--info');
  });
});

describe('resultSummary', () => {
  it('counts the seed and flags it as an error tone', () => {
    const s = resultSummary(seed);
    expect(s.text).toMatch(/^\d+ errors? · \d+ warnings?/);
    expect(s.tone).toBe('error');
  });

  it('reads "No issues" in a muted tone for a clean workflow', () => {
    expect(resultSummary(clean)).toEqual({ text: 'No issues', tone: 'mute' });
  });

  it('reads "Parse error" for ok:false', () => {
    expect(resultSummary(broken)).toEqual({ text: 'Parse error', tone: 'error' });
  });
});

describe('errorHtml / EMPTY_HTML', () => {
  it('escapes the diagnostic message', () => {
    expect(errorHtml('bad <input>')).toContain('bad &lt;input&gt;');
  });

  it('keeps the empty-state copy the script and the markup agree on', () => {
    expect(EMPTY_HTML).toContain('gha-empty');
  });
});

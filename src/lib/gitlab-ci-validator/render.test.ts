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

const seed = validate(examples[0].yaml); // "Clean pipeline"
const undefinedStage = validate(examples.find((e) => e.id === 'undefined-stage')!.yaml);

const clean: ValidateResult = { ok: true, findings: [], summary: { errors: 0, warnings: 0, infos: 0 } };
const broken: ValidateResult = {
  ok: false,
  error: 'bad indentation of a mapping entry (3:5)',
  findings: [],
  summary: { errors: 0, warnings: 0, infos: 0 },
};

describe('resultsHtml', () => {
  it('renders the seeded clean pipeline without a parse-error banner', () => {
    const html = resultsHtml(seed);
    expect(seed.ok).toBe(true);
    expect(seed.summary.errors).toBe(0);
    expect(html).not.toContain('glci-error');
    expect(html).not.toContain('glci-row--error');
    // Either the success frame or a warnings/info group — never empty.
    expect(html.length).toBeGreaterThan(40);
  });

  it('renders an error row with a line chip for the undefined-stage example', () => {
    const html = resultsHtml(undefinedStage);
    expect(html).toContain('class="glci-row glci-row--error"');
    expect(html).toMatch(/<span class="glci-line">Line \d+<\/span>/);
    expect(html).toContain('Errors <span aria-hidden="true">·</span>');
  });

  it('renders the success frame for a clean pipeline', () => {
    const html = resultsHtml(clean);
    expect(html).toContain('No issues found.');
    expect(html).toContain('This pipeline passed every YAML and structural check.');
  });

  it('renders the parse-error banner for ok:false', () => {
    const html = resultsHtml(broken);
    expect(html).toContain('Could not parse pipeline');
    expect(html).toContain('bad indentation of a mapping entry (3:5)');
  });

  it('never emits a live region or a time-dependent value', () => {
    const html = resultsHtml(undefinedStage);
    expect(html).not.toContain('aria-live');
    expect(html).not.toMatch(/\d+\s?ms\b/);
  });
});

describe('findingHtml', () => {
  it('escapes finding text rather than trusting it as markup', () => {
    const evil: Finding = {
      id: 'x',
      severity: 'error',
      title: '<img src=x onerror=alert(1)>',
      detail: 'a & b < c',
      remediation: 'Add `script:` & drop <only>',
    };
    const html = findingHtml(evil);
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img');
    expect(html).toContain('a &amp; b &lt; c');
    expect(html).toContain('<code>script:</code>');
    expect(html).toContain('&lt;only&gt;');
  });
});

describe('resultSummary', () => {
  it('reads "No issues" in a muted tone for a clean pipeline', () => {
    expect(resultSummary(clean)).toEqual({ text: 'No issues', tone: 'mute' });
  });

  it('counts errors in an error tone', () => {
    const s = resultSummary(undefinedStage);
    expect(s.text).toMatch(/^\d+ errors?/);
    expect(s.tone).toBe('error');
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
    expect(EMPTY_HTML).toContain('glci-empty');
  });
});

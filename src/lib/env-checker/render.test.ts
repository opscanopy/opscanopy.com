/**
 * The pure HTML builders shared by the playground's server-rendered seed and
 * its client re-render. If these two ever diverge, a no-JS visitor (and every
 * AI crawler, which does not run JS) sees different markup from a browser.
 */
import { describe, it, expect } from 'vitest';
import { check } from './engine';
import { examples } from './examples';
import { reportHtml, reportSummary, errorHtml, strList, EMPTY_HTML } from './render';
import type { EnvResult } from './types';

const seed = check(examples[0].code, examples[0].envExample); // Node — a key missing
const inSync = check(examples[1].code, examples[1].envExample); // Python — fully in sync

describe('reportHtml', () => {
  it('renders the seeded drift report into static HTML', () => {
    const html = reportHtml(seed);
    expect(html).toContain('Missing from .env.example');
    expect(html).toContain('data-copy="STRIPE_SECRET_KEY="');
    expect(html).toContain('<span>STRIPE_SECRET_KEY</span>');
    expect(html).toContain('Unused in code');
    expect(html).toContain('LEGACY_API_URL');
    expect(html).toContain('ec-group ec-group--miss');
    expect(html).toContain('data-copy-all="missing"');
  });

  it('renders the clean frame when nothing drifted', () => {
    const html = reportHtml(inSync);
    expect(html).toContain('No drift detected.');
    expect(html).not.toContain('ec-group');
  });

  it('renders the error banner when the engine reports one', () => {
    const html = reportHtml({ error: 'boom <x>', usedVars: [], exampleVars: [], missingInExample: [], unusedInExample: [] });
    expect(html).toContain('Could not check');
    expect(html).toContain('boom &lt;x&gt;');
  });

  it('escapes variable names, including inside the copy attribute', () => {
    const evil: EnvResult = {
      usedVars: ['<X>'],
      exampleVars: ['A&B'],
      missingInExample: ['<X>'],
      unusedInExample: ['A&B'],
    };
    const html = reportHtml(evil);
    expect(html).not.toContain('<X>');
    expect(html).toContain('&lt;X&gt;');
    expect(html).toContain('data-copy="&lt;X&gt;="');
    expect(html).toContain('A&amp;B');
  });

  it('never emits a live region or a time-dependent value', () => {
    const html = reportHtml(seed);
    expect(html).not.toContain('aria-live');
    expect(html).not.toMatch(/\d+\s?ms\b/);
  });
});

describe('reportSummary', () => {
  it('counts the seed drift in an error tone', () => {
    expect(reportSummary(seed)).toEqual({ text: '1 missing · 1 unused', tone: 'error' });
  });

  it('reads the var count in a success tone when in sync', () => {
    expect(reportSummary(inSync)).toEqual({ text: '4 vars · in sync', tone: 'success' });
  });

  it('is muted when only unused keys remain', () => {
    const r: EnvResult = { usedVars: ['A'], exampleVars: ['A', 'B'], missingInExample: [], unusedInExample: ['B'] };
    expect(reportSummary(r)).toEqual({ text: '1 unused', tone: 'mute' });
  });

  it('reads "Error" for an engine error', () => {
    expect(reportSummary({ error: 'x', usedVars: [], exampleVars: [], missingInExample: [], unusedInExample: [] })).toEqual({
      text: 'Error',
      tone: 'error',
    });
  });
});

describe('strList / errorHtml / EMPTY_HTML', () => {
  it('dedupes and drops non-strings', () => {
    expect(strList(['A', 'A', 1, '', 'B'])).toEqual(['A', 'B']);
    expect(strList(undefined)).toEqual([]);
  });

  it('escapes the diagnostic message', () => {
    expect(errorHtml('bad <input>')).toContain('bad &lt;input&gt;');
  });

  it('keeps the empty-state copy the script and the markup agree on', () => {
    expect(EMPTY_HTML).toContain('ec-empty');
  });
});

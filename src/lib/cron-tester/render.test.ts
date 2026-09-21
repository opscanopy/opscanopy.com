/**
 * Only the DETERMINISTIC half of the cron result is server-rendered: the
 * plain-English description and the parsed fields. Next-run times depend on
 * `new Date()` and the visitor's timezone, so they stay client-only — baking
 * them into static HTML would ship a frozen "in 5 minutes" to every reader.
 */
import { describe, it, expect } from 'vitest';
import { explain } from './engine';
import { examples } from './examples';
import { descHtml, fieldsHtml, runsSkeletonHtml } from './render';

const seed = explain(examples[0].expr, { timeZone: 'UTC' }); // */5 * * * *

describe('descHtml', () => {
  it('renders the plain-English description', () => {
    expect(descHtml(seed.description)).toContain('Every 5 minutes.');
  });
  it('escapes the description', () => {
    expect(descHtml('<b>x</b>')).toContain('&lt;b&gt;');
  });
});

describe('fieldsHtml', () => {
  it('renders every parsed field with its label and keys them', () => {
    const html = fieldsHtml(seed.fields);
    expect(html).toContain('*/5');
    expect(html).toContain('Minute');
    expect(html).toContain('Day of month');
    expect(html).toContain('data-k="field:minute"');
  });
});

describe('runsSkeletonHtml', () => {
  it('reserves the next-runs block without asserting any time', () => {
    const html = runsSkeletonHtml();
    expect(html).toContain('cron-runs');
    expect(html).not.toMatch(/\d{2}:\d{2}/);
  });
});

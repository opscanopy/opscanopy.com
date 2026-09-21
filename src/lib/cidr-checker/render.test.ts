import { describe, it, expect } from 'vitest';
import { check } from './engine';
import { examples } from './examples';
import { resultHtml, summaryText } from './render';

const seed = check(examples[0].input); // 10.0.0.5 against 10.0.0.0/24 + 172.16.0.0/12

describe('resultHtml', () => {
  it('renders the in-range verdict as static HTML', () => {
    const html = resultHtml(seed);
    expect(html).toContain('10.0.0.5');
    expect(html).toContain('is inside');
    expect(html).toContain('10.0.0.0/24');
  });

  it('keys each verdict row for the changed-value tick', () => {
    expect(resultHtml(seed)).toContain('data-k="verdict:10.0.0.5"');
  });

  it('renders the merged block list', () => {
    expect(resultHtml(seed)).toContain('172.16.0.0/12');
  });

  it('escapes hostile entry text', () => {
    const evil = check('<script>alert(1)</script>\n10.0.0.0/24');
    const html = resultHtml(evil);
    expect(html).not.toContain('<script>alert(1)');
  });
});

describe('summaryText', () => {
  it('states the verdict and the counts', () => {
    const text = summaryText(seed);
    expect(text).toContain('in range');
    expect(text).toContain('valid');
  });
});

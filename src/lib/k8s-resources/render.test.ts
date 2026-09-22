/**
 * The pure HTML builders shared by the playground's server-rendered seed and
 * its client re-render. If these two ever diverge, a no-JS visitor (and every
 * AI crawler, which does not run JS) sees different markup from a browser.
 */
import { describe, it, expect } from 'vitest';
import { calculate } from './engine';
import { examples } from './examples';
import { resultHtml, errorHtml, summaryText, markdownFields, EMPTY_HTML } from './render';

const seedInput = examples[0].input; // 500m / 1, 256Mi / 512Mi x 3
const seed = calculate(seedInput);
const seedReplicas = Number(seedInput.replicas) || 1;

describe('resultHtml', () => {
  it('renders the seeded web-pod breakdown into static HTML', () => {
    const html = resultHtml(seed, seedReplicas);
    expect(html).toContain('500m (0.5 cores)');
    expect(html).toContain('1000m (1 core)');
    expect(html).toContain('256Mi (0.25Gi, 268435456 bytes)');
    expect(html).toContain('512Mi (0.5Gi, 536870912 bytes)');
    expect(html).toContain('1.5 cores (1500m)');
    expect(html).toContain('768Mi (0.75Gi, 805306368 bytes)');
    expect(html).toContain('Total memory limit');
  });

  it('hides the Total rows when there is a single replica', () => {
    const one = calculate({ ...seedInput, replicas: '1' });
    const html = resultHtml(one, 1);
    expect(html).not.toContain('Total CPU request');
    expect(html).toContain('CPU request (per pod)');
  });

  it('renders advisory warnings after the table', () => {
    const misconfigured = calculate(examples[2].input);
    const html = resultHtml(misconfigured, 1);
    expect(html).toContain('class="k8s-warnings"');
    expect(html).toContain('CPU limit is below the CPU request');
  });

  it('escapes engine strings rather than trusting them as markup', () => {
    const evil = {
      ...seed,
      rows: [{ label: 'x', value: '<img src=x onerror=alert(1)>' }],
      warnings: ['<b>w</b>'],
    };
    const html = resultHtml(evil, 1);
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img');
    expect(html).toContain('&lt;b&gt;w');
  });
});

describe('summaryText', () => {
  it('reads ok with no warnings and counts them otherwise', () => {
    expect(summaryText(seed)).toBe('ok');
    expect(summaryText(calculate(examples[2].input))).toBe('2 warnings');
    expect(summaryText({ valid: true, rows: [], warnings: ['x'] })).toBe('1 warning');
  });
});

describe('markdownFields', () => {
  it('mirrors the visible rows plus warnings', () => {
    const fields = markdownFields(seed, seedReplicas);
    expect(fields.map((f) => f.label)).toContain('Total CPU request');
    expect(markdownFields(calculate(examples[2].input), 1).some((f) => f.label === 'Warning')).toBe(true);
  });
});

describe('errorHtml', () => {
  it('escapes the diagnostic message', () => {
    expect(errorHtml('bad <input>')).toContain('bad &lt;input&gt;');
  });
});

describe('EMPTY_HTML', () => {
  it('is the empty-state paragraph', () => {
    expect(EMPTY_HTML).toContain('class="k8s-empty');
  });
});

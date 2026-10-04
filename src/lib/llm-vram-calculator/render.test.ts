import { describe, it, expect } from 'vitest';
import { estimate } from './engine';
import { examples } from './examples';
import { EMPTY_HTML, resultHtml, summaryText, buildCopyAll, errorHtml } from './render';

const seed = estimate(examples[0].input);

describe('resultHtml', () => {
  it('renders the seeded values with data-k keys for the changed-value tick', () => {
    const html = resultHtml(seed);
    expect(html).toContain('data-k="stat:Total VRAM"');
    expect(html).toContain('data-k="stat:KV cache"');
    expect(html).toContain('data-k="tier:24"');
    expect(html).toContain('Llama 3.1 8B');
    expect(html).toContain('lvc-bar__seg--weights');
    expect(html).toContain('1.00 GiB');
  });
  it('escapes engine strings', () => {
    const evil = { ...seed, arch: { ...seed.arch, presetName: '<img src=x onerror=alert(1)>' } };
    const html = resultHtml(evil);
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img');
  });
  it('renders the error state for invalid input', () => {
    const html = resultHtml(estimate({ params: NaN, quant: 'fp16', context: 1 }));
    expect(html).toContain('role="alert"');
    expect(html).toContain('Parameter count');
    expect(errorHtml('<b>')).toContain('&lt;b&gt;');
  });
});

it('EMPTY_HTML is non-empty', () => {
  expect(EMPTY_HTML.length).toBeGreaterThan(20);
});

describe('summaryText', () => {
  it('mentions the total GiB and the minimum tier', () => {
    const s = summaryText(seed);
    expect(s).toMatch(/\d GiB total/);
    expect(s).toContain('fits an 8 GiB GPU');
  });
  it('says when nothing fits', () => {
    expect(summaryText(estimate({ params: 405, quant: 'fp16', context: 8192 }))).toContain('exceeds');
  });
});

it('buildCopyAll emits one line per part', () => {
  expect(buildCopyAll(seed).split('\n')).toHaveLength(5);
});

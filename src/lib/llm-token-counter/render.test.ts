import { describe, it, expect } from 'vitest';
import * as o200k from 'gpt-tokenizer/encoding/o200k_base';
import { countTokens, VIS_MAX_TOKENS } from './engine';
import { examples } from './examples';
import { EMPTY_HTML, resultHtml, summaryText, buildCopyAll, errorHtml, formatUsd } from './render';

const seed = countTokens(examples[0].input, 'o200k_base', o200k);

describe('resultHtml', () => {
  it('renders every stat with a data-k key', () => {
    const html = resultHtml(seed);
    for (const k of ['Tokens', 'Characters', 'Words', 'Bytes', 'Chars per token', 'Cost']) {
      expect(html).toContain(`data-k="stat:${k}"`);
    }
    expect(html).toContain('class="ltc-tokens" aria-hidden="true"');
    expect(html).toContain('ltc-group__h');
    expect(html).toContain('o200k_base');
  });
  it('escapes span text', () => {
    const html = resultHtml(countTokens('<img src=x>', 'o200k_base', o200k));
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img');
    expect(errorHtml('<b>')).toContain('&lt;b&gt;');
  });
  it('cost is a client-only placeholder without a price, dollars with one', () => {
    expect(resultHtml(seed)).toContain('data-client-only');
    const priced = resultHtml(seed, { price: 2.5 });
    expect(priced).not.toContain('data-client-only');
    expect(priced).toContain('$0.00012'); // 48 tokens x $2.50 / 1M
  });
  it('formatUsd keeps tiny costs visible', () => {
    expect(formatUsd(0)).toBe('$0');
    expect(formatUsd(0.0000375)).toBe('$0.0000375');
    expect(formatUsd(0.123456)).toBe('$0.123');
    expect(formatUsd(12.3456)).toBe('$12.35');
  });
  it('replaces the visualiser with a note above VIS_MAX_TOKENS', () => {
    const big = countTokens('hello '.repeat(VIS_MAX_TOKENS + 10), 'o200k_base', o200k);
    expect(big.tokens.length).toBeGreaterThan(VIS_MAX_TOKENS);
    const html = resultHtml(big);
    expect(html).not.toContain('ltc-tok"');
    expect(html).toContain('ltc-vis-note');
  });
});

it('EMPTY_HTML, summaryText, buildCopyAll', () => {
  expect(EMPTY_HTML.length).toBeGreaterThan(20);
  expect(summaryText(seed)).toContain('48 tokens in o200k_base');
  expect(buildCopyAll(seed)).toContain('Tokens: 48');
  expect(buildCopyAll(seed)).not.toContain('Cost');
  expect(buildCopyAll(seed, 2.5)).toContain('Cost: $0.0001');
});

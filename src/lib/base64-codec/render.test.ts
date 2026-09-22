/**
 * The pure HTML builders shared by the playground's server-rendered seed and
 * its client re-render. If these two ever diverge, a no-JS visitor (and every
 * AI crawler, which does not run JS) sees different markup from a browser.
 */
import { describe, it, expect } from 'vitest';
import { convert } from './engine';
import { examples } from './examples';
import { resultHtml, errorHtml, summaryText, chainsHtml, EMPTY_HTML } from './render';

const seedExample = examples[0]; // Encode — "hello world"
const seed = convert(seedExample.input, seedExample.mode, seedExample.urlSafe);

describe('resultHtml', () => {
  it('renders the seeded encode answer into static HTML', () => {
    const html = resultHtml(seed, seedExample.input);
    expect(html).toContain('aGVsbG8gd29ybGQ=');
    expect(html).toContain('11 bytes');
    expect(html).toContain('b64-result__body');
  });

  it('appends the secret-safe hand-off chips for a non-empty input', () => {
    const html = resultHtml(seed, seedExample.input);
    expect(html).toContain('data-handoff-to="/hash-generator/"');
    expect(html).not.toContain('data-handoff-to="/jwt-decoder/"');
  });

  it('marks an empty decoded result instead of rendering nothing', () => {
    const html = resultHtml({ valid: true, output: '', bytes: 0 }, 'x');
    expect(html).toContain('is-empty-text');
    expect(html).toContain('(empty result)');
  });

  it('escapes decoded output rather than trusting it as markup', () => {
    const evil = convert('PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==', 'decode', false);
    expect(evil.valid).toBe(true);
    const html = resultHtml(evil, 'PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });
});

describe('chainsHtml', () => {
  it('offers the JWT chip only for a three-segment token shape', () => {
    expect(chainsHtml('aaa.bbb.ccc')).toContain('/jwt-decoder/');
    expect(chainsHtml('hello world')).not.toContain('/jwt-decoder/');
    expect(chainsHtml('   ')).toBe('');
  });
});

describe('summaryText', () => {
  it('reads the byte count with the right noun', () => {
    expect(summaryText(seed)).toBe('11 bytes');
    expect(summaryText({ valid: true, output: 'AQ==', bytes: 1 })).toBe('1 byte');
    expect(summaryText({ valid: true, output: '' })).toBe('');
  });
});

describe('errorHtml', () => {
  it('escapes the diagnostic message', () => {
    expect(errorHtml('bad <input>')).toContain('bad &lt;input&gt;');
  });
});

describe('EMPTY_HTML', () => {
  it('is the empty-state paragraph', () => {
    expect(EMPTY_HTML).toContain('class="b64-empty');
  });
});

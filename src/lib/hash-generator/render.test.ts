/**
 * The pure HTML builders shared by the playground's server-rendered seed and
 * its client re-render. If these two ever diverge, a no-JS visitor (and every
 * AI crawler, which does not run JS) sees different markup from a browser.
 *
 * `hash()` is async (SHA-* come from SubtleCrypto), which Node provides on
 * `globalThis.crypto.subtle` — so the seed is computed exactly as the Astro
 * frontmatter computes it at build time.
 */
import { describe, it, expect } from 'vitest';
import { hash } from './engine';
import { examples } from './examples';
import { resultHtml, errorHtml, rowHtml, chainHtml, summaryText, EMPTY_HTML } from './render';

const seedInput = examples[0].input; // "abc"
const seed = await hash(seedInput);

describe('resultHtml', () => {
  it('renders the four "abc" digests into static HTML', () => {
    const html = resultHtml(seed, null, seedInput);
    // RFC 1321 MD5("abc") and NIST FIPS 180-4 SHA-256("abc").
    expect(html).toContain('900150983cd24fb0d6963f7d28e17f72');
    expect(html).toContain('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(html).toContain('MD5');
    expect(html).toContain('SHA-512');
    expect(html.match(/class="hash-row"/g)?.length).toBe(4);
  });

  it('appends the HMAC row, highlighted, when one is given', () => {
    const html = resultHtml(seed, { label: 'HMAC-SHA-256', value: 'deadbeef', mono: true }, seedInput);
    expect(html).toContain('hash-row--hmac');
    expect(html).toContain('HMAC-SHA-256');
    expect(html).toContain('deadbeef');
  });

  it('adds the Base64 handoff chip only for non-empty input', () => {
    expect(resultHtml(seed, null, seedInput)).toContain('data-handoff-to="/base64-encoder-decoder/"');
    expect(chainHtml('')).toBe('');
  });

  it('escapes engine strings rather than trusting them as markup', () => {
    const html = rowHtml({ label: '<b>x</b>', value: '"><img src=x onerror=alert(1)>', mono: true }, false);
    expect(html).not.toContain('<img src=x');
    expect(html).not.toContain('<b>x</b>');
    expect(html).toContain('&lt;img');
    expect(html).toContain('&quot;&gt;&lt;img');
  });
});

describe('summaryText', () => {
  it('counts digests and the optional HMAC the way the status line reads', () => {
    expect(summaryText(seed, null)).toBe('4 digests');
    expect(summaryText(seed, { label: 'HMAC-SHA-256', value: 'x' })).toBe('4 digests · 1 HMAC');
  });
});

describe('errorHtml / EMPTY_HTML', () => {
  it('escapes the diagnostic message', () => {
    expect(errorHtml('bad <input>')).toContain('bad &lt;input&gt;');
    expect(errorHtml('x')).toContain('role="alert"');
  });

  it('keeps the empty state a single paragraph', () => {
    expect(EMPTY_HTML).toMatch(/^<p class="hash-empty/);
  });
});

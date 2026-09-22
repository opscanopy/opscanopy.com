/**
 * The pure HTML builders shared by the playground's server-rendered seed and
 * its client re-render. If the two ever diverge, a no-JS visitor — and every AI
 * crawler, which does not run JS — sees different markup from a browser.
 *
 * `run()` is pure and synchronous and takes no clock, no key and no randomness,
 * so the whole result is safe to bake at build time.
 */
import { describe, it, expect } from 'vitest';
import { run } from './engine';
import { examples } from './examples';
import {
  EMPTY_HTML,
  MAX_RENDERED_PARAMS,
  MODE_COPY,
  TYPING_HTML,
  errorCardHtml,
  invalidHtml,
  notesBlockHtml,
  resultHtml,
} from './render';
import type { ParseResult, QueryParam } from './types';

/** Every `data-copy-ref` in a fragment, in render order. */
function copyRefs(html: string): number[] {
  return Array.from(html.matchAll(/data-copy-ref="(\d+)"/g)).map((m) => Number(m[1]));
}

const seedExample = examples[0];
const seed = run(seedExample.input, seedExample.mode, {});

describe('the seeded example', () => {
  it('is a clean parse of the webhook callback URL', () => {
    expect(seedExample.mode).toBe('parse');
    expect(seed.ok).toBe(true);
    expect(seed.mode).toBe('parse');
  });

  it('server-renders the decoded components and every query parameter', () => {
    const { html } = resultHtml(seed);
    // Components card — the WHATWG-normalized host and scheme.
    expect(html).toContain('URL components');
    expect(html).toContain('hooks.example.com');
    // Parameter rows — the point of the tool: the DECODED values, not the raw ones.
    expect(html).toContain('Query parameters');
    expect(html).toContain('#alerts');
    expect(html).toContain('abc==');
    expect(html).toContain('Deploy failed on api-7');
    // …with the raw text kept beside them.
    expect(html).toContain('%23alerts');
    expect(html).toContain('uc-row');
  });

  it('carries a one-line summary for the role="status" span', () => {
    expect(seed.summary.length).toBeGreaterThan(0);
  });

  it('renders one copy button per payload, numbered in render order', () => {
    const { html, payloads } = resultHtml(seed);
    const refs = copyRefs(html);
    expect(refs.length).toBe(payloads.length);
    expect(refs).toEqual(payloads.map((_, i) => i));
    // The payloads are the real values, not the display placeholders.
    expect(payloads).toContain('#alerts');
  });

  it('emits no link at all — the builders never need a locale prefix', () => {
    const { html } = resultHtml(seed);
    expect(html).not.toContain('<a ');
    for (const [, href] of html.matchAll(/href="([^"]*)"/g)) {
      expect(href.endsWith('/')).toBe(true);
    }
  });
});

describe('escaping', () => {
  const nasty = 'https://example.com/?q=%3Cimg%20src%3Dx%20onerror%3Dalert(1)%3E&a=%26amp%3B';

  it('escapes < and & in every decoded value', () => {
    const result = run(nasty, 'parse', {});
    const { html } = resultHtml(result);
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&amp;amp;');
  });

  it('escapes the decoded output in decode and encode mode', () => {
    const decoded = run('%3Cscript%3E&%3C', 'decode', {});
    const { html } = resultHtml(decoded);
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script>');

    const encoded = run('<a href="x">&', 'encode', {});
    const { html: encHtml } = resultHtml(encoded);
    expect(encHtml).not.toContain('<a href=');
  });

  it('escapes diagnostic messages', () => {
    expect(
      errorCardHtml(
        [{ level: 'error', code: 'x', message: 'bad <input> & worse', at: 3, where: 'value of "q"' }],
        true,
      ),
    ).toContain('bad &lt;input&gt; &amp; worse');
    expect(
      notesBlockHtml([{ level: 'warning', code: 'y', message: 'note <b>' }]),
    ).toContain('note &lt;b&gt;');
  });
});

describe('static states', () => {
  it('EMPTY_HTML and TYPING_HTML are the paragraphs the client paints', () => {
    expect(EMPTY_HTML).toContain('uc-empty');
    expect(EMPTY_HTML).toContain('Paste a URL');
    expect(TYPING_HTML).toContain('Still typing');
  });

  it('MODE_COPY carries a label, placeholder and eyebrow per mode', () => {
    for (const mode of ['parse', 'decode', 'encode'] as const) {
      expect(MODE_COPY[mode].label.length).toBeGreaterThan(0);
      expect(MODE_COPY[mode].placeholder.length).toBeGreaterThan(0);
      expect(MODE_COPY[mode].eyebrow.length).toBeGreaterThan(0);
    }
  });
});

describe('invalidHtml', () => {
  it('shows the first error and still lists any parsed parameters', () => {
    const result = run('https://exa mple.com/?a=1', 'parse', {});
    expect(result.ok).toBe(false);
    const { html, payloads } = invalidHtml(result, true);
    expect(html).toContain('This input is not valid yet');
    expect(html).toContain('role="alert"');
    expect(copyRefs(html).length).toBe(payloads.length);
  });

  it('omits role="alert" while the error is merely held', () => {
    const result = run('https://exa mple.com/?a=1', 'parse', {});
    expect(invalidHtml(result, false).html).not.toContain('role="alert"');
  });
});

describe('the rendered-row cap', () => {
  it('stops at MAX_RENDERED_PARAMS and says so', () => {
    const many = Array.from({ length: MAX_RENDERED_PARAMS + 25 }, (_, i) => `k${i}=v${i}`).join('&');
    const result = run(`?${many}`, 'parse', {}) as ParseResult;
    expect(result.params.length).toBe(MAX_RENDERED_PARAMS + 25);
    const { html, payloads } = resultHtml(result);
    expect(html).toContain(`Showing the first ${MAX_RENDERED_PARAMS} of ${result.params.length}`);
    // One payload per RENDERED row — the cap is a DOM cap, so the array follows it.
    expect(copyRefs(html).length).toBe(payloads.length);
    expect(payloads.length).toBeLessThanOrEqual(MAX_RENDERED_PARAMS + 4);
  });
});

describe('the parameter badges', () => {
  it('flags duplicates, bare keys, array-style names and double encoding', () => {
    const result = run('?a=1&a=2&b&c[]=x&d=%25C3%25A9', 'parse', {}) as ParseResult;
    const { html } = resultHtml(result);
    expect(html).toContain('duplicate');
    expect(html).toContain('bare key');
    expect(html).toContain('array-style');
    expect(html).toContain('double-encoded');
    const bare = result.params.find((p: QueryParam) => p.key === 'b');
    expect(bare?.hasValue).toBe(false);
    expect(html).toContain('(no value — bare key)');
  });
});

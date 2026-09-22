/**
 * The pure HTML builders shared by the playground's server-rendered seed and
 * its client re-render. If these two ever diverge, a no-JS visitor (and every
 * AI crawler, which does not run JS) sees different markup from a browser.
 */
import { describe, it, expect } from 'vitest';
import { convert } from './engine';
import { examples } from './examples';
import { resultHtml, errorHtml, summaryText, diagnosticText, EMPTY_HTML } from './render';
import type { ConvertResult, Diagnostic } from './types';

const seedExample = examples[0]; // K8s Deployment → JSON
const seed = convert(seedExample.input, { direction: seedExample.direction, indent: 2, sortKeys: false });

const countPayloadButtons = (html: string): number => (html.match(/data-payload="\d+"/g) ?? []).length;

describe('resultHtml', () => {
  it('renders the seeded conversion into static HTML', () => {
    expect(seed.ok).toBe(true);
    const { html } = resultHtml(seed);
    expect(html).toContain('output.json');
    // JSON quotes are escaped as text inside <code>, so the answer is citable but inert.
    expect(html).toContain('&quot;apiVersion&quot;: &quot;apps/v1&quot;');
    expect(html).toContain('&quot;replicas&quot;: 3');
    expect(html).toContain('What the conversion cost');
  });

  it('returns exactly one copy payload per data-payload button, output first', () => {
    const { html, payloads } = resultHtml(seed);
    expect(payloads.length).toBe(countPayloadButtons(html));
    expect(payloads.length).toBe(1 + seed.diagnostics.length);
    expect(payloads[0]).toBe(seed.output);
    seed.diagnostics.forEach((d, i) => expect(payloads[i + 1]).toBe(diagnosticText(d)));
  });

  it('numbers payload buttons sequentially from zero', () => {
    const { html, payloads } = resultHtml(seed);
    const indices = [...html.matchAll(/data-payload="(\d+)"/g)].map((m) => Number(m[1]));
    expect(indices).toEqual(payloads.map((_, i) => i));
  });

  it('escapes engine output and diagnostics rather than trusting them as markup', () => {
    const evil: ConvertResult = {
      ...seed,
      output: '<script>alert(1)</script> & co',
      diagnostics: [
        { id: 'x', severity: 'warning', message: 'lost <b>bold</b> & more', path: '$.a<b' },
      ],
    };
    const { html } = resultHtml(evil);
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt; &amp; co');
    expect(html).toContain('lost &lt;b&gt;bold&lt;/b&gt; &amp; more');
    expect(html).toContain('$.a&lt;b');
  });

  it('never emits an internal href without a trailing slash', () => {
    const { html } = resultHtml(seed);
    for (const m of html.matchAll(/href="(\/[^"#?]*)/g)) expect(m[1]).toMatch(/\/$/);
  });

  it('leaves the multi-line payloads out of the markup entirely', () => {
    const { html } = resultHtml(seed);
    // Every copy button carries an EMPTY data-copy; the client binds the text.
    expect(html).not.toMatch(/data-copy="[^"]/);
  });
});

describe('summaryText', () => {
  it('names the direction, doc and key counts and the loss state', () => {
    const text = summaryText(seed);
    expect(text).toContain('YAML → JSON');
    expect(text).toContain('1 doc');
    expect(text).toMatch(/\d+ keys/);
    expect(text).toContain('no losses');
  });
});

describe('errorHtml', () => {
  it('escapes the diagnostic message and binds extra diagnostics as payloads', () => {
    const extra: Diagnostic[] = [{ id: 'y', severity: 'note', message: 'note <one>' }];
    const { html, payloads } = errorHtml('yaml-to-json', 'bad <input>', true, extra);
    expect(html).toContain('bad &lt;input&gt;');
    expect(html).toContain('role="alert"');
    expect(html).toContain('note &lt;one&gt;');
    expect(payloads.length).toBe(countPayloadButtons(html));
    expect(payloads).toEqual([diagnosticText(extra[0])]);
  });
});

describe('EMPTY_HTML', () => {
  it('is the empty-state paragraph', () => {
    expect(EMPTY_HTML).toContain('jy-empty');
  });
});

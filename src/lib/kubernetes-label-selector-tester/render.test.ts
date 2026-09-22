/**
 * The pure HTML builders shared by the playground's server-rendered seed and
 * its client re-render. If these two ever diverge, a no-JS visitor (and every
 * AI crawler, which does not run JS) sees different markup from a browser.
 */
import { describe, it, expect } from 'vitest';
import { testSelector } from './engine';
import { examples } from './examples';
import {
  resultHtml,
  errorHtml,
  canonicalHtml,
  reportText,
  verdictText,
  EMPTY_HTML,
} from './render';
import type { SelectorTestResult } from './types';

const seedExample = examples[0]; // Service misses 2 pods
const seed = testSelector(seedExample.resources, seedExample.selector, seedExample.mode);

const countPayloadButtons = (html: string): number => (html.match(/data-payload="\d+"/g) ?? []).length;

describe('resultHtml', () => {
  it('renders one verdict card per resource with the seeded answer', () => {
    expect(seed.ok).toBe(true);
    expect(seed.summary).toBe('3 of 5 resources match');
    const { html } = resultHtml(seed);
    expect((html.match(/klt-verdict klt-verdict--/g) ?? []).length).toBe(5);
    expect(html).toContain('Pod/web-a');
    expect(html).toContain('Pod/web-d');
    expect(html).toContain('klt-verdict--miss');
    expect(html).toContain('tier=frontnd');
    expect(html).toContain('tier=frontend');
  });

  it('returns exactly one copy payload per data-payload button, in card order', () => {
    const { html, payloads } = resultHtml(seed);
    expect(payloads.length).toBe(countPayloadButtons(html));
    expect(payloads.length).toBe(seed.verdicts.length);
    const indices = [...html.matchAll(/data-payload="(\d+)"/g)].map((m) => Number(m[1]));
    expect(indices).toEqual(payloads.map((_, i) => i));
    expect(payloads).toEqual(seed.verdicts.map(verdictText));
    expect(payloads[0]).toMatch(/^MATCH — Pod\/web-a/);
  });

  it('escapes resource names, labels and reasons rather than trusting them as markup', () => {
    const evil: SelectorTestResult = {
      ...seed,
      verdicts: [
        {
          ...seed.verdicts[0],
          kind: 'Pod<x>',
          name: 'a&b',
          namespace: '<ns>',
          labels: { 'k<': 'v&' },
          clauses: seed.verdicts[0].clauses.map((c) => ({ ...c, reason: 'because <b>x</b>' })),
        },
      ],
    };
    const { html } = resultHtml(evil);
    expect(html).not.toContain('<b>x</b>');
    expect(html).toContain('Pod&lt;x&gt;/a&amp;b');
    expect(html).toContain('&lt;ns&gt;');
    expect(html).toContain('k&lt;=v&amp;');
    expect(html).toContain('because &lt;b&gt;x&lt;/b&gt;');
  });

  it('never emits an internal href without a trailing slash', () => {
    const { html } = resultHtml(seed);
    for (const m of html.matchAll(/href="(\/[^"#?]*)/g)) expect(m[1]).toMatch(/\/$/);
  });

  it('leaves the payload text out of the markup entirely', () => {
    const { html } = resultHtml(seed);
    expect(html).not.toMatch(/data-copy="[^"]/);
  });
});

describe('canonicalHtml', () => {
  it('shows the canonical selector and clause count for a valid run', () => {
    const html = canonicalHtml(seed);
    expect(html).toContain('app=web,tier=frontend');
    expect(html).toContain('2 clauses');
  });

  it('escapes the canonical form', () => {
    expect(canonicalHtml({ ...seed, canonical: 'a<b' })).toContain('a&lt;b');
  });

  it('is empty text for a failed run and a sentence for the empty selector', () => {
    expect(canonicalHtml({ ...seed, ok: false })).toBe('');
    expect(canonicalHtml({ ...seed, empty: true })).toContain('matches every resource');
  });
});

describe('errorHtml', () => {
  it('escapes the diagnostic message and names the field at fault', () => {
    const html = errorHtml(
      { severity: 'error', where: 'selector', message: 'bad <sel>' },
      true,
      [{ severity: 'note', where: 'resources', message: 'also <this>' }],
    );
    expect(html).toContain('This selector could not be read');
    expect(html).toContain('bad &lt;sel&gt;');
    expect(html).toContain('also &lt;this&gt;');
    expect(html).toContain('role="alert"');
  });
});

describe('reportText', () => {
  it('emits the summary, the selector and one block per verdict', () => {
    const text = reportText(seed, seedExample.selector);
    expect(text).toContain('Kubernetes Label Selector Tester — 3 of 5 resources match');
    expect(text).toContain('selector: app=web,tier=frontend');
    expect(text.split('\n').filter((l) => /^(MATCH|NO MATCH) — /.test(l)).length).toBe(5);
  });
});

describe('EMPTY_HTML', () => {
  it('is the empty-state paragraph', () => {
    expect(EMPTY_HTML).toContain('klt-empty');
  });
});

/**
 * The pure HTML builders shared by the playground's server-rendered seed and
 * its client re-render. If these two ever diverge, a no-JS visitor (and every
 * AI crawler, which does not run JS) sees different markup from a browser.
 */
import { describe, it, expect } from 'vitest';
import { lint, summaryLine, kindLabel } from './engine';
import { examples } from './examples';
import { resultHtml, errorHtml, reportText, rowText, EMPTY_HTML } from './render';
import type { LintResult } from './types';

const seedExample = examples[0]; // 3 planted issues
const seed = lint(seedExample.unit, { scope: seedExample.scope ?? 'system' });
const seedSummary = summaryLine(seed);
const seedKind = kindLabel(seed.kind);

const countPayloadButtons = (html: string): number => (html.match(/data-payload="\d+"/g) ?? []).length;

describe('resultHtml', () => {
  it('renders the seeded findings into static HTML', () => {
    expect(seed.ok).toBe(true);
    expect(seed.findings.length).toBe(3);
    const { html } = resultHtml(seed, seedKind);
    expect(html).toContain('su-group__head');
    expect(html).toContain('Errors');
    expect(html).toContain('WantedBy');
    // Every finding names its line; the badge jumps there in the editor.
    expect(html).toContain('data-su-jump="3"');
    expect(html).toContain('ExecStrat');
  });

  it('returns exactly one copy payload per data-payload button, in render order', () => {
    const { html, payloads } = resultHtml(seed, seedKind);
    expect(payloads.length).toBe(countPayloadButtons(html));
    expect(payloads.length).toBe(seed.findings.length);
    const indices = [...html.matchAll(/data-payload="(\d+)"/g)].map((m) => Number(m[1]));
    expect(indices).toEqual(payloads.map((_, i) => i));
    // One finding (missing-install) is about the whole file, so it carries no line.
    for (const p of payloads) expect(p).toMatch(/^(L\d+ )?[a-z-]+: /);
    expect(payloads).toContain(rowText(seed.findings[0]));
  });

  it('renders the clean card, with no payload buttons, for a file with no findings', () => {
    const clean = lint(examples[1].unit);
    expect(clean.findings.length).toBe(0);
    const { html, payloads } = resultHtml(clean, kindLabel(clean.kind));
    expect(html).toContain('su-clean');
    expect(html).toContain('.service');
    expect(payloads).toEqual([]);
    expect(countPayloadButtons(html)).toBe(0);
  });

  it('escapes finding text rather than trusting it as markup', () => {
    const evil: LintResult = {
      ...seed,
      findings: [
        {
          id: 'x',
          severity: 'error',
          title: 'title <b>bold</b> & co',
          detail: 'detail <i>x</i>',
          line: 2,
          directive: 'Exec<Start>',
          remediation: 'use `Type=simple` & <not> this',
        },
      ],
    };
    const { html } = resultHtml(evil, 'unit');
    expect(html).not.toContain('<b>bold</b>');
    expect(html).toContain('title &lt;b&gt;bold&lt;/b&gt; &amp; co');
    expect(html).toContain('detail &lt;i&gt;x&lt;/i&gt;');
    expect(html).toContain('Exec&lt;Start&gt;');
    // Backticks in remediation become inline code; everything else stays escaped.
    expect(html).toContain('<code>Type=simple</code> &amp; &lt;not&gt; this');
  });

  it('never emits an internal href without a trailing slash', () => {
    const { html } = resultHtml(seed, seedKind);
    for (const m of html.matchAll(/href="(\/[^"#?]*)/g)) expect(m[1]).toMatch(/\/$/);
  });

  it('leaves the payload text out of the markup entirely', () => {
    const { html } = resultHtml(seed, seedKind);
    expect(html).not.toMatch(/data-copy="[^"]/);
  });
});

describe('errorHtml', () => {
  it('escapes the diagnostic message', () => {
    const html = errorHtml('bad <input>', true);
    expect(html).toContain('bad &lt;input&gt;');
    expect(html).toContain('role="alert"');
    expect(errorHtml('x', false)).not.toContain('role="alert"');
  });
});

describe('reportText', () => {
  it('emits one line per finding under its severity heading', () => {
    const text = reportText(seed, seedSummary);
    expect(text).toContain(`Systemd Unit Validator — ${seedSummary}`);
    expect(text).toContain('ERRORS (2)');
    expect(text).toContain('WARNINGS (1)');
    expect(text.split('\n').filter((l) => /^  (L\d+ )?[a-z-]+: /.test(l)).length).toBe(3);
  });
});

describe('EMPTY_HTML', () => {
  it('is the empty-state paragraph', () => {
    expect(EMPTY_HTML).toContain('su-empty');
  });
});

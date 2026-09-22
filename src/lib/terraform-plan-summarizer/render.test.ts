/**
 * The pure HTML builders shared by the playground's server-rendered seed and
 * its client re-render. If the two ever diverge, a no-JS visitor — and every AI
 * crawler, which does not run JS — sees different markup from a browser.
 *
 * `summarizePlan()` is pure and synchronous: no clock, no randomness, no key,
 * and no elapsed-time field anywhere in `PlanSummary`. The one piece of view
 * state, `grouping`, defaults to `'action'` on both sides, so the seed is
 * reproducible byte-for-byte.
 */
import { describe, it, expect } from 'vitest';
import { formatTerraformTotals, summarizePlan } from './engine';
import { examples } from './examples';
import {
  EMPTY_HTML,
  MAX_RENDERED_ROWS,
  TYPING_HTML,
  errorHtml,
  resultHtml,
  summaryText,
} from './render';

/** Every `data-copy-ref` in a fragment, in render order. */
function copyRefs(html: string): number[] {
  return Array.from(html.matchAll(/data-copy-ref="(\d+)"/g)).map((m) => Number(m[1]));
}

const seedExample = examples[0];
const seed = summarizePlan(seedExample.input);
const seedOpts = { grouping: 'action' as const, terraformTotals: formatTerraformTotals(seed.totals) };

describe('the seeded example', () => {
  it('is a clean parse of the web-deploy plan text', () => {
    expect(seedExample.id).toBe('web-deploy');
    expect(seed.ok).toBe(true);
    expect(seed.format).toBe('text');
    expect(seed.counts.create).toBe(1);
    expect(seed.counts.update).toBe(1);
    expect(seed.counts.destroy).toBe(1);
    expect(seed.counts.replace).toBe(0);
  });

  it('server-renders the stat band, every resource address and the cross-check', () => {
    const { html } = resultHtml(seed, seedOpts);
    expect(html).toContain('tps-stats');
    expect(html).toContain('aws_ecs_task_definition.web');
    expect(html).toContain('aws_ecs_service.web');
    expect(html).toContain('aws_cloudwatch_log_group.web_old');
    expect(html).toContain('Creates · 1');
    expect(html).toContain('Destroys · 1');
    expect(html).toContain('Reconciliation');
    expect(html).toContain('Plan: 1 to add, 1 to change, 1 to destroy.');
    // Terraform's own overlapping accounting, printed beside the disjoint tiles.
    expect(html).toContain(formatTerraformTotals(seed.totals));
  });

  it('carries the one-line status summary the role="status" span shows', () => {
    const text = summaryText(seed);
    expect(text).toContain('plan text');
    expect(text).toContain('3 actions');
    expect(text).toContain('counts reconcile');
  });

  it('renders one copy button per payload, numbered in render order', () => {
    const { html, payloads } = resultHtml(seed, seedOpts);
    const refs = copyRefs(html);
    expect(refs.length).toBe(payloads.length);
    expect(refs).toEqual(payloads.map((_, i) => i));
    expect(payloads).toContain('aws_ecs_task_definition.web');
  });

  it('emits no link at all — the builders never need a locale prefix', () => {
    const { html } = resultHtml(seed, seedOpts);
    expect(html).not.toContain('<a ');
    for (const [, href] of html.matchAll(/href="([^"]*)"/g)) {
      expect(href.endsWith('/')).toBe(true);
    }
  });

  it('bakes in nothing clock-, key- or randomness-dependent', () => {
    const again = resultHtml(summarizePlan(seedExample.input), {
      grouping: 'action',
      terraformTotals: formatTerraformTotals(seed.totals),
    });
    expect(again.html).toBe(resultHtml(seed, seedOpts).html);
    // No elapsed-ms, no timestamp, no "ago" — nothing that changes between builds.
    expect(again.html).not.toMatch(/\bms\b|\bago\b|\d{4}-\d{2}-\d{2}T/);
  });
});

describe('escaping', () => {
  const nasty = [
    'Terraform will perform the following actions:',
    '',
    '  # aws_s3_bucket.x<img src=x onerror=alert(1)> will be created',
    '  + resource "aws_s3_bucket" "x<img src=x onerror=alert(1)>" {',
    '      + bucket = "a&b"',
    '    }',
    '',
    'Plan: 1 to add, 0 to change, 0 to destroy.',
  ].join('\n');

  it('escapes < and & in every resource address', () => {
    const summary = summarizePlan(nasty);
    const { html } = resultHtml(summary, {
      grouping: 'action',
      terraformTotals: formatTerraformTotals(summary.totals),
    });
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).not.toContain('<img src=x');
  });

  it('escapes the diagnostic message in the hard-error card', () => {
    const summary = summarizePlan('this is not a plan at all');
    expect(summary.ok).toBe(false);
    const html = errorHtml(summary, true);
    expect(html).toContain('role="alert"');
    expect(html).toContain('No plan to summarize yet');
    expect(errorHtml(summary, false)).not.toContain('role="alert"');
  });
});

describe('grouping', () => {
  it('renders action bands riskiest-first, and module bands on request', () => {
    const summary = summarizePlan(examples[2].input);
    const totals = formatTerraformTotals(summary.totals);
    const byAction = resultHtml(summary, { grouping: 'action', terraformTotals: totals });
    const byModule = resultHtml(summary, { grouping: 'module', terraformTotals: totals });
    expect(byAction.html).not.toBe(byModule.html);
    expect(byModule.html).toMatch(/Root module|module /);
    // Both groupings render the same resources, so the payload counts agree.
    expect(copyRefs(byAction.html).length).toBe(byAction.payloads.length);
    expect(copyRefs(byModule.html).length).toBe(byModule.payloads.length);
  });
});

describe('static states', () => {
  it('EMPTY_HTML and TYPING_HTML are the paragraphs the client paints', () => {
    expect(EMPTY_HTML).toContain('tps-empty');
    expect(EMPTY_HTML).toContain('Paste a plan');
    expect(TYPING_HTML).toContain('Still typing');
  });
});

describe('the rendered-row cap', () => {
  it('stops at MAX_RENDERED_ROWS and says so', () => {
    const rows = Array.from(
      { length: MAX_RENDERED_ROWS + 40 },
      (_, i) =>
        `  # aws_s3_bucket.b${i} will be created\n  + resource "aws_s3_bucket" "b${i}" {\n      + bucket = "b${i}"\n    }\n`,
    ).join('\n');
    const summary = summarizePlan(
      `Terraform will perform the following actions:\n\n${rows}\nPlan: ${MAX_RENDERED_ROWS + 40} to add, 0 to change, 0 to destroy.\n`,
    );
    const { html, payloads } = resultHtml(summary, {
      grouping: 'action',
      terraformTotals: formatTerraformTotals(summary.totals),
    });
    expect(summary.changes.length).toBe(MAX_RENDERED_ROWS + 40);
    expect(html).toContain(`Showing ${MAX_RENDERED_ROWS} of ${MAX_RENDERED_ROWS + 40} rows`);
    expect(copyRefs(html).length).toBe(payloads.length);
  });
});

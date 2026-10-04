import { describe, it, expect } from 'vitest';
import { buildPolicy, toTerraform } from './engine';
import { PRESETS } from './presets';
import { FIXTURE_CATALOG } from './fixture-catalog';
import { EMPTY_HTML, resultHtml, summaryText, errorHtml } from './render';

const p0 = PRESETS[0];
const seed = buildPolicy(p0.kind, p0.statements, FIXTURE_CATALOG);
const tf = toTerraform(p0.statements);

describe('resultHtml', () => {
  it('renders stats with data-k keys and the JSON tab by default', () => {
    const html = resultHtml(seed, tf);
    expect(html).toContain('data-k="stat:Size"');
    expect(html).toContain('data-k="stat:Warnings"');
    expect(html).toContain('data-tab="json"');
    expect(html).toContain('&quot;s3:ListBucket&quot;');
    expect(html).toContain('class="iam-group__h"');
    expect(html).not.toContain('iam-findings');
  });
  it('renders the Terraform tab', () => {
    const html = resultHtml(seed, tf, 'terraform');
    expect(html).toContain('data-tab="terraform"');
    expect(html).toContain('data &quot;aws_iam_policy_document&quot;');
  });
  it('lists findings and escapes them', () => {
    const r = buildPolicy('identity', [{ effect: 'Allow', actions: ['<img src=x>'], resources: ['*'] }]);
    const html = resultHtml(r, toTerraform([]));
    expect(html).toContain('iam-finding--error');
    expect(html).not.toContain('<img src=x>');
    expect(html).toContain('&lt;img src=x&gt;');
  });
  it('marks the meter over the limit', () => {
    const big = buildPolicy('identity', [{ effect: 'Allow', actions: Array.from({ length: 400 }, (_, i) => `s3:A${i}`), resources: ['*'] }], undefined, 'inline-user');
    expect(resultHtml(big, '')).toContain('iam-meter is-over');
  });
  it('errorHtml escapes', () => expect(errorHtml('<b>')).toBe('<p class="iam-error text-inverse-error" role="alert">&lt;b&gt;</p>'));
  it('EMPTY_HTML is non-empty', () => expect(EMPTY_HTML.length).toBeGreaterThan(20));
});

describe('summaryText', () => {
  it('valid, no warnings', () => expect(summaryText(seed)).toMatch(/^Valid policy, \d+ of 6,144 characters, no warnings\.$/));
  it('valid with a warning', () => {
    const p = PRESETS[1];
    expect(summaryText(buildPolicy(p.kind, p.statements))).toMatch(/of 20,480 characters, 1 warning\.$/);
  });
  it('errors', () => expect(summaryText(buildPolicy('identity', []))).toMatch(/^1 error — IAM would reject/));
});

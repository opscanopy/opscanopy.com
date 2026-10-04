/**
 * AWS IAM Policy Generator — pure HTML builders shared by the Astro frontmatter (SSR seed)
 * and the island's <script>. No window, no document, no clock. Every value is escaped;
 * stat values carry `data-k` for the changed-value tick.
 */
import { escapeHtml } from '../escape-html';
import type { PolicyResult } from './types';

export const EMPTY_HTML =
  '<p class="iam-empty body-sm text-inverse-mute">Pick a preset or add a statement to generate a policy.</p>';

const fmt = (n: number) => n.toLocaleString('en-US');

function stat(label: string, value: string, cap?: string): string {
  return (
    '<div class="iam-stat">' +
    `<span class="iam-stat__k">${escapeHtml(label)}</span>` +
    `<span class="iam-stat__v" data-k="stat:${escapeHtml(label)}">${escapeHtml(value)}</span>` +
    (cap ? `<span class="iam-stat__cap">${escapeHtml(cap)}</span>` : '') +
    '</div>'
  );
}

export function errorHtml(msg: string): string {
  return `<p class="iam-error text-inverse-error" role="alert">${escapeHtml(msg)}</p>`;
}

export function resultHtml(r: PolicyResult, tf: string, tab: 'json' | 'terraform' = 'json'): string {
  const pct = Math.min(100, (r.minifiedLength / r.limit.chars) * 100);
  const errors = r.warnings.filter((w) => w.level === 'error').length;
  const warns = r.warnings.length - errors;
  const stats =
    stat('Size', `${fmt(r.minifiedLength)} / ${fmt(r.limit.chars)}`, `${r.limit.label}, characters without whitespace`) +
    stat('Errors', String(errors)) +
    stat('Warnings', String(warns));
  const meter =
    `<div class="iam-meter${r.overLimit ? ' is-over' : ''}" role="img" aria-label="${escapeHtml(`${pct.toFixed(0)}% of the ${r.limit.label} limit`)}">` +
    `<div class="iam-meter__fill" style="width:${pct.toFixed(1)}%"></div></div>`;
  const findings = r.warnings.length
    ? `<h3 class="iam-group__h">Findings</h3><ul class="iam-findings">` +
      r.warnings
        .map(
          (w) =>
            `<li class="iam-finding iam-finding--${w.level}">` +
            `<span class="iam-finding__lvl">${w.level === 'error' ? 'error' : 'warn'}</span>` +
            `<span class="iam-finding__msg is-prose">${escapeHtml(w.message)}</span></li>`,
        )
        .join('') +
      '</ul>'
    : '';
  const code = tab === 'terraform' ? tf : r.json;
  return (
    '<div class="iam-card">' +
    `<div class="iam-stats">${stats}</div>` +
    meter +
    findings +
    `<h3 class="iam-group__h">${tab === 'terraform' ? 'Terraform' : 'Policy JSON'}</h3>` +
    `<pre class="iam-code code-mono" data-tab="${tab}"><code>${escapeHtml(code)}</code></pre>` +
    '</div>'
  );
}

/** One line for the role="status" summary. */
export function summaryText(r: PolicyResult): string {
  const errors = r.warnings.filter((w) => w.level === 'error').length;
  const warns = r.warnings.length - errors;
  const size = `${fmt(r.minifiedLength)} of ${fmt(r.limit.chars)} characters`;
  if (errors) return `${errors} error${errors === 1 ? '' : 's'} — IAM would reject this policy (${size}).`;
  return `Valid policy, ${size}${warns ? `, ${warns} warning${warns === 1 ? '' : 's'}` : ', no warnings'}.`;
}

/**
 * Kubernetes Resource Calculator — the pure HTML builders for the result panel.
 *
 * Shared by BOTH the Astro frontmatter (which server-renders the seeded
 * example so a no-JS visitor — and every AI crawler, which does not execute
 * JS — sees a real computed answer) and the island's <script> (which rebuilds
 * the same markup on every eval). One implementation, so the two can never
 * drift apart.
 *
 * Everything here is pure: no `window`, no `document`, no clock.
 */
import { escapeHtml } from '../escape-html';
import type { K8sResult, K8sRow } from './types';

export const ALERT_SVG =
  '<svg class="k8s-error__icon" width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 2.5L18.5 17H1.5z"></path><path d="M10 8v4"></path><path d="M10 14.6v.01"></path></svg>';

export const WARN_SVG =
  '<svg class="k8s-warn__icon" width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 2.5L18.5 17H1.5z"></path><path d="M10 8v4"></path><path d="M10 14.6v.01"></path></svg>';

/** The empty-state paragraph, so the SSR placeholder and `renderEmpty` agree. */
export const EMPTY_HTML =
  '<p class="k8s-empty body-sm text-mute">Enter a CPU or memory value — or pick an example — to see a per-pod and total-across-replicas breakdown here.</p>';

export function errorHtml(message: string): string {
  return (
    '<div class="k8s-error" role="alert">' +
    ALERT_SVG +
    '<div><p class="k8s-error__title">Nothing to calculate</p>' +
    `<p class="k8s-error__detail">${escapeHtml(message)}</p></div></div>`
  );
}

/** Labels that are "Total …" rows produced by the engine. */
export const TOTAL_LABELS = new Set([
  'Total CPU request',
  'Total CPU limit',
  'Total memory request',
  'Total memory limit',
]);

export function rowsHtml(rows: K8sRow[], replicas: number): string {
  const hideTotals = replicas <= 1;
  const lines = rows
    .filter((r) => !(hideTotals && TOTAL_LABELS.has(r.label)))
    .map((r) => {
      const cls = r.mono ? 'k8s-row__value k8s-row__value--mono' : 'k8s-row__value';
      return (
        '<div class="k8s-row">' +
        `<span class="k8s-row__label">${escapeHtml(r.label)}</span>` +
        `<span class="${cls}">${escapeHtml(r.value)}</span></div>`
      );
    })
    .join('');
  return '<div class="k8s-table">' + lines + '</div>';
}

export function warningsHtml(warnings: string[]): string {
  if (!warnings.length) return '';
  const notes = warnings
    .map((w) => '<p class="k8s-warn">' + WARN_SVG + `<span>${escapeHtml(w)}</span></p>`)
    .join('');
  return `<div class="k8s-warnings">${notes}</div>`;
}

/** The one-line status readout: "ok", or "N warning(s)". */
export function summaryText(result: K8sResult): string {
  const warnCount = result.warnings?.length ?? 0;
  return warnCount ? `${warnCount} warning${warnCount === 1 ? '' : 's'}` : 'ok';
}

export function resultHtml(result: K8sResult, replicas: number): string {
  return rowsHtml(result.rows ?? [], replicas) + warningsHtml(result.warnings ?? []);
}

/**
 * Build the {label, value} fields for "Copy as Markdown" — the same rows
 * the results table shows (per-pod values + totals, with totals hidden
 * when replicas <= 1, matching rowsHtml's own filtering) plus any advisory
 * warnings, so the pasted block matches what's on screen.
 */
export function markdownFields(result: K8sResult, replicas: number): Array<{ label: string; value: string }> {
  const hideTotals = replicas <= 1;
  const fields = (result.rows ?? [])
    .filter((r) => !(hideTotals && TOTAL_LABELS.has(r.label)))
    .map((r) => ({ label: r.label, value: r.value }));
  for (const w of result.warnings ?? []) {
    fields.push({ label: 'Warning', value: w });
  }
  return fields;
}

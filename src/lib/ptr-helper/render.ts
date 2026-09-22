/**
 * Reverse DNS / PTR Helper — the pure HTML builders for the result panel.
 *
 * Shared by BOTH the Astro frontmatter (which server-renders the seeded
 * example so a no-JS visitor — and every AI crawler, which does not execute
 * JS — sees a real computed answer) and the island's <script> (which rebuilds
 * the same markup on every eval). One implementation, so the two can never
 * drift apart.
 *
 * Everything here is pure: no `window`, no `document`, no clock. Wiring the
 * per-row copy buttons is DOM work and stays in the component.
 */
import { escapeHtml } from '../escape-html';
import type { PtrResult } from './types';

export const ALERT_SVG =
  '<svg class="ptr-error__icon" width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 2.5L18.5 17H1.5z"></path><path d="M10 8v4"></path><path d="M10 14.6v.01"></path></svg>';

export const COPY_SVG =
  '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="5" width="9" height="9" rx="1.5"></rect><path d="M3 11H2a1 1 0 01-1-1V2a1 1 0 011-1h8a1 1 0 011 1v1"></path></svg>';
export const CHECK_SVG =
  '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 8l4 4 7-7"></path></svg>';

/** The empty-state paragraph, so the SSR placeholder and `renderEmpty` agree. */
export const EMPTY_HTML =
  '<p class="ptr-empty body-sm text-mute">Type an IP address or IP/prefix or pick an example to see its PTR record name, reverse zone and a ready-to-run dig command here.</p>';

export function errorHtml(message: string): string {
  return (
    '<div class="ptr-error" role="alert">' +
    ALERT_SVG +
    '<div><p class="ptr-error__title">Could not read that address</p>' +
    `<p class="ptr-error__detail">${escapeHtml(message)}</p></div></div>`
  );
}

/** The one-line status readout: the IP version badge text. */
export function summaryText(result: PtrResult): string {
  return result.version === 6 ? 'IPv6' : 'IPv4';
}

export function resultHtml(result: PtrResult): string {
  const version = summaryText(result);
  const rows = Array.isArray(result.rows) ? result.rows : [];
  const rowsHtml = rows
    .map((r) => {
      const v = typeof r.value === 'string' ? r.value : '';
      const cls = r.mono ? 'ptr-row__v is-mono' : 'ptr-row__v';
      const copyBtn = v
        ? `<button class="ptr-copy-btn" data-copy-value="${escapeHtml(v)}" title="Copy" aria-label="Copy ${escapeHtml(r.label ?? '')}">${COPY_SVG}</button>`
        : '<span></span>';
      return (
        '<div class="ptr-row">' +
        `<span class="ptr-row__k">${escapeHtml(r.label ?? '')}</span>` +
        `<span class="${cls}">${escapeHtml(v)}</span>` +
        copyBtn +
        '</div>'
      );
    })
    .join('');
  return (
    '<div class="ptr-card">' +
    `<div class="ptr-title"><span class="ptr-title__badge">${version}</span><span>reverse DNS</span></div>` +
    rowsHtml +
    '</div>'
  );
}

/**
 * Case Converter — the pure HTML builders for the result panel.
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
import type { CaseResult } from './types';

export const ALERT_SVG =
  '<svg class="cc-error__icon" width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 2.5L18.5 17H1.5z"></path><path d="M10 8v4"></path><path d="M10 14.6v.01"></path></svg>';
export const COPY_ICON_SVG =
  '<svg class="cc-copy-icon" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="5" width="9" height="9" rx="1.5"/><path d="M3 11H2a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v1"/></svg>';
export const CHECK_ICON_SVG =
  '<svg class="cc-check-icon hidden" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 8.5l3.5 3.5L13 4.5"/></svg>';

/** The empty-state paragraph, so the SSR placeholder and `renderEmpty` agree. */
export const EMPTY_HTML =
  '<p class="cc-empty body-sm text-mute">Type or paste any identifier — or tap an example — to see it in camelCase, snake_case, kebab-case and more, each with a Copy button.</p>';

export function copyBtnHtml(label: string, value: string): string {
  return (
    `<button class="cc-copy-btn" type="button" aria-label="Copy ${escapeHtml(label)}" data-copy="${escapeHtml(value)}">` +
    COPY_ICON_SVG +
    CHECK_ICON_SVG +
    '</button>'
  );
}

export function errorHtml(message: string): string {
  return (
    '<div class="cc-error" role="alert">' +
    ALERT_SVG +
    '<div><p class="cc-error__title">Nothing to convert</p>' +
    `<p class="cc-error__detail">${escapeHtml(message)}</p></div></div>`
  );
}

export function resultHtml(result: CaseResult): string {
  const rows = Array.isArray(result.rows) ? result.rows : [];
  const rowsHtml = rows
    .map((r) => {
      const label = r.label ?? '';
      const value = typeof r.value === 'string' ? r.value : '';
      return (
        '<div class="cc-row">' +
        `<span class="cc-row__k">${escapeHtml(label)}</span>` +
        `<span class="cc-row__v-wrap"><span class="cc-row__v">${escapeHtml(value)}</span>${copyBtnHtml(label, value)}</span>` +
        '</div>'
      );
    })
    .join('');
  return '<div class="cc-card">' + rowsHtml + '</div>';
}

/** The one-line status readout: "11 cases · 3 words" (words counted off the snake_case row). */
export function summaryText(result: CaseResult): string {
  const wordCount = result.rows.length ? result.rows[2].value.split('_').length : 0;
  return `${result.rows.length} cases · ${wordCount} words`;
}

/** "Label: value" lines for the Copy all button. */
export function buildCopyAll(result: CaseResult): string {
  return result.rows.map((r) => `${r.label}: ${r.value}`).join('\n');
}

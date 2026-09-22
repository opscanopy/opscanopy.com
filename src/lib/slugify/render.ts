/**
 * Slugify — the pure HTML builders for the result panel.
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
import type { SlugifyOptions, SlugifyResult } from './types';

export const ALERT_SVG =
  '<svg class="slug-error__icon" width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 2.5L18.5 17H1.5z"></path><path d="M10 8v4"></path><path d="M10 14.6v.01"></path></svg>';
export const COPY_ICON_SVG =
  '<svg class="slug-copy-icon" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="5" width="9" height="9" rx="1.5"/><path d="M3 11H2a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v1"/></svg>';
export const CHECK_ICON_SVG =
  '<svg class="slug-check-icon hidden" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 8.5l3.5 3.5L13 4.5"/></svg>';

/** The empty-state paragraph, so the SSR placeholder and the client agree. */
export const EMPTY_HTML =
  '<p class="slug-empty body-sm text-mute">Type a title or pick an example to see its URL-safe slug here.</p>';

/** The length-budget line for the status slot, e.g. `21 / 60 chars · sep "-"`. */
export function summaryText(result: SlugifyResult, opts: SlugifyOptions): string {
  const max = opts.maxLength;
  const budget = max > 0 ? `${result.slug.length} / ${max} chars` : `${result.slug.length} chars`;
  return `${budget} · sep "${opts.separator}"`;
}

export function errorHtml(message: string, isAlert = false): string {
  return (
    `<div class="slug-error"${isAlert ? ' role="alert"' : ''}>` +
    ALERT_SVG +
    `<p class="slug-error__detail">${escapeHtml(message)}</p></div>`
  );
}

export function resultHtml(result: SlugifyResult, _opts: SlugifyOptions): string {
  if (result.slug.length === 0) {
    // Valid input but nothing slug-worthy survived (e.g. only symbols).
    return '<div class="slug-card"><div class="slug-note">No slug characters — the title has no letters or digits.</div></div>';
  }

  const noteHtml =
    Array.isArray(result.notes) && result.notes.length
      ? result.notes
          .map((n) => `<div class="slug-note">${escapeHtml(n)}</div>`)
          .join('')
      : '';

  return (
    '<div class="slug-card">' +
    '<div class="slug-slug-row">' +
    `<span class="slug-slug-row__v">${escapeHtml(result.slug)}</span>` +
    `<button class="slug-copy-icon-btn" type="button" aria-label="Copy slug" data-copy="${escapeHtml(result.slug)}">${COPY_ICON_SVG}${CHECK_ICON_SVG}</button>` +
    '</div>' +
    noteHtml +
    '</div>'
  );
}

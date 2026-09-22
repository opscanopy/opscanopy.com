/**
 * Timestamp Converter — the pure HTML builders for the result card.
 *
 * Shared by BOTH the Astro frontmatter (which server-renders the seeded
 * example so a no-JS visitor — and every AI crawler, which does not execute
 * JS — sees a real converted instant) and the island's <script> (which
 * rebuilds the same markup on every eval). One implementation, so the two can
 * never drift apart.
 *
 * The server render is PARTIAL by design. Two of the engine's rows are not
 * build-time facts: `Local` is the machine's timezone and `Relative` is the
 * clock ("7 years ago" drifts with the build date). The frontmatter passes
 * their labels as `clientOnlyLabels`, and those rows render with a
 * "loads with JavaScript" placeholder instead of a value; the client passes
 * nothing and gets the full rows.
 *
 * Everything here is pure: no `window`, no `document`, no clock.
 */
import { escapeHtml } from '../escape-html';
import type { TimeResult } from './types';

export const COPY_SVG =
  '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="5" width="8" height="9" rx="1.2"></rect><path d="M3 11V3a1 1 0 0 1 1-1h7"></path></svg>';
export const CHECK_SVG =
  '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 8.5l3.5 3.5 7-7"></path></svg>';
export const ALERT_SVG =
  '<svg class="ts-error__icon" width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 2.5L18.5 17H1.5z"></path><path d="M10 8v4"></path><path d="M10 14.6v.01"></path></svg>';

/** The empty-state paragraph, so the SSR placeholder and `renderEmpty` agree. */
export const EMPTY_HTML =
  '<p class="ts-empty body-sm text-mute">Type a Unix timestamp or date string, pick an example, or hit Now to see it in seconds, milliseconds, ISO 8601, UTC and local time here.</p>';

/** The rows a build must never bake a value for: browser timezone and wall clock. */
export const CLIENT_ONLY_LABELS: ReadonlySet<string> = new Set(['Local', 'Relative']);

/** The value cell for a client-only row — honest about why it is blank. */
export const CLIENT_ONLY_HTML =
  '<span class="ts-client-only" data-client-only>loads with JavaScript</span>';

export function errorHtml(message: string): string {
  return (
    '<div class="ts-error" role="alert">' +
    ALERT_SVG +
    '<div><p class="ts-error__title">Could not read that timestamp</p>' +
    `<p class="ts-error__detail">${escapeHtml(message)}</p></div></div>`
  );
}

export interface RenderOptions {
  /** Row labels to render as placeholders instead of values (server only). */
  clientOnlyLabels?: ReadonlySet<string>;
}

export function resultHtml(result: TimeResult, { clientOnlyLabels }: RenderOptions = {}): string {
  const detected = result.detected ?? '';
  const rows = Array.isArray(result.rows) ? result.rows : [];
  const rowsHtml = rows
    .map((r) => {
      const label = r.label ?? '';
      const safeLabel = escapeHtml(label);
      if (clientOnlyLabels?.has(label)) {
        return `<div class="ts-row"><span class="ts-row__k">${safeLabel}</span>${CLIENT_ONLY_HTML}</div>`;
      }
      const v = typeof r.value === 'string' ? r.value : '';
      const cls = r.mono ? 'ts-row__v is-mono' : 'ts-row__v';
      return (
        '<div class="ts-row">' +
        `<span class="ts-row__k">${safeLabel}</span>` +
        `<span class="${cls}">${escapeHtml(v)}</span>` +
        `<button class="ts-copy-btn" type="button" data-copy-value="${escapeHtml(v)}" aria-label="Copy ${safeLabel} value">${COPY_SVG}</button>` +
        '</div>'
      );
    })
    .join('');
  const badge = detected ? `read as ${detected}` : 'instant';
  return (
    '<div class="ts-card">' +
    `<div class="ts-title"><span class="ts-title__badge">${escapeHtml(detected || 'parsed')}</span><span>${escapeHtml(badge)}</span></div>` +
    rowsHtml +
    '</div>'
  );
}

/**
 * LogQL ↔ PromQL Helper — the pure HTML builders for the notes panel.
 *
 * Shared by BOTH the Astro frontmatter (which server-renders the seeded first
 * example so a no-JS visitor — and every AI crawler, which does not execute JS
 * — sees the real translated query and the notes on what did not map) and the
 * island's <script> (which rebuilds the same markup on every conversion). One
 * implementation, so the two can never drift apart.
 *
 * `convert()` is pure and synchronous — no clock, no random, no network — so
 * the whole result is safe to bake at build time. The one part of this tool
 * that is NOT build-time knowable is the share link (`#s=`) and the "Explain
 * this query" chip, because both are built from `window.location`; they stay
 * hidden until the client converts.
 *
 * Everything here is pure: no `window`, no `document`, no clock.
 */
import { escapeHtml } from '../escape-html';
import type { ConvertResult, Direction } from './types';

export const NOTE_SVG =
  '<svg class="lp-note__icon" width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="10" cy="10" r="8"></circle><path d="M10 9v4.5"></path><path d="M10 6.4v.01"></path></svg>';
export const ALERT_SVG =
  '<svg class="lp-error__icon" width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 2.5L18.5 17H1.5z"></path><path d="M10 8v4"></path><path d="M10 14.6v.01"></path></svg>';
export const CHECK_SVG =
  '<svg class="lp-ok__icon" width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="10" cy="10" r="8"></circle><path d="M6.5 10.5l2.4 2.4 4.6-5"></path></svg>';

/** The empty-state paragraph, so the SSR placeholder and `renderEmpty` agree. */
export const EMPTY_HTML =
  '<p class="lp-empty body-sm text-mute">Pick a direction, paste or load a query, then convert to see the ' +
  'translated query and notes on what does and does not map here.</p>';

export const LOADING_HTML =
  '<div class="lp-loading"><span class="lp-loading__dot"></span>' +
  '<span class="lp-loading__dot"></span><span class="lp-loading__dot"></span>' +
  '<span>Converting…</span></div>';

export function errorHtml(message: string): string {
  return (
    '<div class="lp-error" role="alert">' +
    ALERT_SVG +
    '<div class="lp-error__body"><p class="lp-error__title">Could not convert</p>' +
    `<p class="lp-error__detail">${escapeHtml(message)}</p></div></div>`
  );
}

/** Filenames for the dark editor chrome, per direction. */
export function filesFor(direction: Direction): { input: string; output: string } {
  return direction === 'logql-to-promql'
    ? { input: 'query.logql', output: 'query.promql' }
    : { input: 'query.promql', output: 'query.logql' };
}

/** The translated query, or '' when the conversion failed. */
export function outputText(result: ConvertResult): string {
  if (!result || result.error) return '';
  return typeof result.output === 'string' ? result.output : '';
}

/** The status-line text beside "Notes": "Converted", "1 note", "3 notes". */
export function notesSummaryText(notes: string[]): string {
  const n = notes.length;
  if (n === 0) return 'Converted';
  return `${n} ${n === 1 ? 'note' : 'notes'}`;
}

/** The notes panel: a green "mapped cleanly" row, or the conversion-notes list. */
export function notesHtml(notes: string[]): string {
  if (notes.length === 0) {
    return (
      '<div class="lp-ok">' +
      CHECK_SVG +
      '<span class="lp-ok__text">Converted with a clean mapping. The translated query is on the right.</span></div>'
    );
  }
  const n = notes.length;
  const items = notes.map((note) => `<li class="lp-note__item">${escapeHtml(note)}</li>`).join('');
  return (
    '<div class="lp-note">' +
    NOTE_SVG +
    '<div class="lp-note__body">' +
    `<p class="lp-note__title">${n === 1 ? 'Conversion note' : 'Conversion notes'}</p>` +
    `<ul class="lp-note__list">${items}</ul>` +
    '</div></div>'
  );
}

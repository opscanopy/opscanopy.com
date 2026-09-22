/**
 * Cron → systemd Converter — the pure HTML builders for the notes panel and
 * the OnCalendar strip.
 *
 * Shared by BOTH the Astro frontmatter (which server-renders the seeded
 * example so a no-JS visitor — and every AI crawler, which does not execute
 * JS — sees a real `OnCalendar=` answer, the unit texts and the migration
 * notes) and the island's <script> (which rebuilds the same markup on every
 * conversion). One implementation, so the two can never drift apart.
 *
 * `convert()` is pure and synchronous and emits a calendar EXPRESSION, never a
 * next-run time, so the whole result is safe to bake at build time. The two
 * unit bodies are plain text — the frontmatter writes them straight into
 * `<pre data-cm-fallback>` elements that the island removes once CodeMirror has
 * mounted — so they need no builder here.
 *
 * Everything here is pure: no `window`, no `document`, no clock.
 */
import { escapeHtml } from '../escape-html';
import type { SystemdResult } from './types';

export const NOTE_SVG =
  '<svg class="cs-note__icon" width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="10" cy="10" r="8"></circle><path d="M10 9v4.5"></path><path d="M10 6.4v.01"></path></svg>';
export const ALERT_SVG =
  '<svg class="cs-error__icon" width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 2.5L18.5 17H1.5z"></path><path d="M10 8v4"></path><path d="M10 14.6v.01"></path></svg>';
export const CHECK_SVG =
  '<svg class="cs-ok__icon" width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="10" cy="10" r="8"></circle><path d="M6.5 10.5l2.4 2.4 4.6-5"></path></svg>';

/** The empty-state paragraph, so the SSR placeholder and `renderEmpty` agree. */
export const EMPTY_HTML =
  '<p class="cs-empty body-sm text-mute">Paste a crontab line, then convert to see the equivalent systemd ' +
  '<code class="code-mono">.timer</code> and <code class="code-mono">.service</code> units, plus any migration notes here.</p>';

export const LOADING_HTML =
  '<div class="cs-loading"><span class="cs-loading__dot"></span>' +
  '<span class="cs-loading__dot"></span><span class="cs-loading__dot"></span>' +
  '<span>Converting…</span></div>';

export function errorHtml(message: string): string {
  return (
    '<div class="cs-error" role="alert">' +
    ALERT_SVG +
    '<div class="cs-error__body"><p class="cs-error__title">Could not convert</p>' +
    `<p class="cs-error__detail">${escapeHtml(message)}</p></div></div>`
  );
}

/** The OnCalendar strip's text — the expression, or an em dash when there is none. */
export function onCalendarText(result: SystemdResult): string {
  return typeof result.onCalendar === 'string' && result.onCalendar ? result.onCalendar : '—';
}

/** The status-line text beside "Notes": "Converted", "1 note", "3 notes". */
export function notesSummaryText(notes: string[]): string {
  const n = notes.length;
  if (n === 0) return 'Converted';
  return `${n} ${n === 1 ? 'note' : 'notes'}`;
}

/** The notes panel: a green "converted cleanly" row, or the migration-notes list. */
export function notesHtml(notes: string[]): string {
  if (notes.length === 0) {
    return (
      '<div class="cs-ok">' +
      CHECK_SVG +
      '<span class="cs-ok__text">Converted cleanly. Install the units below with systemctl.</span></div>'
    );
  }
  const n = notes.length;
  const items = notes.map((note) => `<li class="cs-note__item">${escapeHtml(note)}</li>`).join('');
  return (
    '<div class="cs-note">' +
    NOTE_SVG +
    '<div class="cs-note__body">' +
    `<p class="cs-note__title">${n === 1 ? 'Migration note' : 'Migration notes'}</p>` +
    `<ul class="cs-note__list">${items}</ul>` +
    '</div></div>'
  );
}

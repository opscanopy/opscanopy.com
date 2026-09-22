/**
 * Docker Run ↔ Compose — the pure HTML builders for the output pane.
 *
 * Shared by BOTH the Astro frontmatter (which server-renders the seeded
 * example so a no-JS visitor — and every AI crawler, which does not execute
 * JS — sees the real Compose YAML and the migration notes) and the island's
 * <script> (which rebuilds the same markup on every conversion). One
 * implementation, so the two can never drift apart.
 *
 * `runToCompose()` / `composeToRun()` are pure and synchronous and emit
 * deterministic text, so the whole result is safe to bake at build time.
 * Everything here is pure: no `window`, no `document`.
 */
import { escapeHtml } from '../escape-html';

export const ICON_ALERT =
  '<svg class="drc-error__icon" width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 2.5L18.5 17H1.5z"></path><path d="M10 8v4"></path><path d="M10 14.6v.01"></path></svg>';
export const ICON_WARN =
  '<svg class="drc-warn__icon" width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 2.5L18.5 17H1.5z"></path><path d="M10 8v4"></path><path d="M10 14.6v.01"></path></svg>';

/** The empty-state paragraph, so the SSR placeholder and `renderEmpty` agree. */
export const EMPTY_HTML =
  '<p class="drc-empty body-sm text-mute">Pick a mode, load an example or paste your own, then convert to see the result here.</p>';

export function errorHtml(message: string): string {
  return (
    '<div class="drc-error" role="alert">' +
    ICON_ALERT +
    '<div><p class="drc-error__title">Could not convert</p>' +
    `<p class="drc-error__detail">${escapeHtml(message)}</p></div></div>`
  );
}

/** Render warning text, escaping HTML but rendering `code` spans inline. */
export function warnHtml(text: string): string {
  return escapeHtml(text).replace(/`([^`]+)`/g, (_m, code: string) => `<code>${code}</code>`);
}

/** The converted output as a dark code slab titled with its file / command name. */
export function resultHtml(name: string, code: string): string {
  const dots = '<span class="drc-result__dot"></span>'.repeat(3);
  return (
    '<div class="drc-result">' +
    `<div class="drc-result__bar">${dots}<span class="drc-result__name">${escapeHtml(name)}</span></div>` +
    `<pre class="drc-result__pre"><code>${escapeHtml(code)}</code></pre>` +
    '</div>'
  );
}

/** The non-fatal notes list ('' when there are none, so `:empty` hides the box). */
export function warningsHtml(warnings: string[]): string {
  return warnings
    .map((w) => '<div class="drc-warn">' + ICON_WARN + `<p class="drc-warn__text">${warnHtml(w)}</p></div>`)
    .join('');
}

/** The status-line text beside the output label: "Converted", "1 note", "N notes". */
export function statusText(warnings: string[]): string {
  const n = warnings.length;
  if (n === 0) return 'Converted';
  return `${n} ${n === 1 ? 'note' : 'notes'}`;
}

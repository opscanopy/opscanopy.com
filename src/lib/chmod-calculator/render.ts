/**
 * chmod Calculator — the pure HTML builders for the output panel.
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
import type { ChmodResult } from './types';

export const ALERT_SVG =
  '<svg class="chmod-error__icon" width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 2.5L18.5 17H1.5z"></path><path d="M10 8v4"></path><path d="M10 14.6v.01"></path></svg>';
export const COPY_ICON_SVG =
  '<svg class="chmod-copy-icon" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="5" width="9" height="9" rx="1.5"/><path d="M3 11H2a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v1"/></svg>';
export const CHECK_ICON_SVG =
  '<svg class="chmod-check-icon hidden" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 8.5l3.5 3.5L13 4.5"/></svg>';

/** The empty-state paragraph, so the SSR placeholder and the client fallback agree. */
export const EMPTY_HTML =
  '<p class="chmod-empty body-sm text-mute">Toggle the matrix or type an octal or symbolic value to see the octal, symbolic, <span class="code-mono">ls -l</span> and <span class="code-mono">chmod</span> forms here.</p>';

export function copyBtnHtml(label: string, value: string): string {
  return (
    `<button class="chmod-copy-btn" type="button" aria-label="Copy ${escapeHtml(label)}" data-copy="${escapeHtml(value)}">` +
    COPY_ICON_SVG +
    CHECK_ICON_SVG +
    '</button>'
  );
}

export function errorHtml(message: string): string {
  return (
    '<div class="chmod-error">' +
    ALERT_SVG +
    '<div><p class="chmod-error__title">Could not read that value</p>' +
    `<p id="chmod-error-detail" class="chmod-error__detail">${escapeHtml(message)}</p></div></div>`
  );
}

export function resultHtml(result: ChmodResult): string {
  const octal = result.octal ?? '';
  const symbolic = result.symbolic ?? '';
  const lsStyle = result.lsStyle ?? '';
  const command = result.command ?? '';

  const row = (label: string, value: string): string =>
    '<div class="chmod-row">' +
    `<span class="chmod-row__k">${escapeHtml(label)}</span>` +
    `<span class="chmod-row__v-wrap"><span class="chmod-row__v">${escapeHtml(value)}</span>${copyBtnHtml(label, value)}</span></div>`;

  return (
    '<div class="chmod-card">' +
    row('Octal', octal) +
    row('Symbolic', symbolic) +
    row('ls -l', lsStyle) +
    row('Command', command) +
    '</div>'
  );
}

/** The one-line status readout: "755 · rwxr-xr-x · file". */
export function summaryText(result: ChmodResult): string {
  return `${result.octal ?? ''} · ${result.symbolic ?? ''} · file`;
}

/** The aligned four-line payload for the Copy all button. */
export function buildCopyAll(result: ChmodResult): string {
  return [
    `octal:    ${result.octal}`,
    `symbolic: ${result.symbolic}`,
    `ls -l:    ${result.lsStyle}`,
    `command:  ${result.command}`,
  ].join('\n');
}

/**
 * Hash Generator — the pure HTML builders for the digests panel.
 *
 * Shared by BOTH the Astro frontmatter (which server-renders the seeded
 * example so a no-JS visitor — and every AI crawler, which does not execute
 * JS — sees the real digests) and the island's <script> (which rebuilds the
 * same markup on every eval). One implementation, so the two can never drift.
 *
 * `hash()` is async because SHA-* come from SubtleCrypto — which Node exposes
 * on `globalThis.crypto.subtle`, so the frontmatter simply awaits it at build
 * time. Everything here is pure: no `window`, no `document`, no clock. The
 * handoff chip carries a `data-handoff-to` path, not an href — the click
 * handler in the island localises it, so no locale prefix is needed here.
 */
import { escapeHtml } from '../escape-html';
import type { HashResult, HashRow } from './types';

export const ALERT_SVG =
  '<svg class="hash-error__icon" width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 2.5L18.5 17H1.5z"></path><path d="M10 8v4"></path><path d="M10 14.6v.01"></path></svg>';

export const COPY_ICON =
  '<svg class="hash-copy__icon" width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5.5" y="5.5" width="8" height="8" rx="1.5"></rect><path d="M3.5 10.5h-.5a1 1 0 01-1-1v-6a1 1 0 011-1h6a1 1 0 011 1v.5"></path></svg>';

/** The empty-state paragraph, so the SSR placeholder and `renderEmpty` agree. */
export const EMPTY_HTML =
  '<p class="hash-empty body-sm text-mute">Type or paste text — or pick an example — to see its MD5, SHA-1, SHA-256 and SHA-512 digests here, each with a Copy button.</p>';

export function errorHtml(message: string): string {
  return (
    '<div class="hash-error" role="alert">' +
    ALERT_SVG +
    '<div><p class="hash-error__title">Could not compute hashes</p>' +
    `<p class="hash-error__detail">${escapeHtml(message)}</p></div></div>`
  );
}

export function rowHtml(row: HashRow, hmac: boolean): string {
  const label = row.label ?? '';
  const value = typeof row.value === 'string' ? row.value : '';
  const cls = row.mono ? 'hash-row__v is-mono' : 'hash-row__v';
  const rowCls = hmac ? 'hash-row hash-row--hmac' : 'hash-row';
  const safeLabel = escapeHtml(label);
  return (
    `<div class="${rowCls}">` +
    `<span class="hash-row__k">${safeLabel}</span>` +
    `<span class="${cls}">${escapeHtml(value)}</span>` +
    `<button type="button" class="hash-copy hash-tap" data-copy="${escapeHtml(value)}" ` +
    `aria-label="Copy ${safeLabel} digest">${COPY_ICON}<span class="hash-copy__lbl">Copy</span></button>` +
    '</div>'
  );
}

/** Secret-safe handoff chip — never a #-fragment (see src/lib/tool-state/handoff.ts). */
export function chainHtml(rawInput: string): string {
  if (rawInput.length === 0) return '';
  return (
    '<div class="hash-chips"><button type="button" class="hash-chip" ' +
    'data-handoff-to="/base64-encoder-decoder/">View as Base64 &rarr;</button></div>'
  );
}

/** The status-line text: "4 digests" or "4 digests · 1 HMAC". */
export function summaryText(result: HashResult, hmacRow: HashRow | null): string {
  const baseCount = Array.isArray(result.rows) ? result.rows.length : 0;
  return hmacRow ? `${baseCount} digests · 1 HMAC` : `${baseCount} digests`;
}

export function resultHtml(result: HashResult, hmacRow: HashRow | null, rawInput: string): string {
  const rows = Array.isArray(result.rows) ? result.rows : [];
  const rowsHtml = rows.map((r) => rowHtml(r, false)).join('');
  const hmacHtml = hmacRow ? rowHtml(hmacRow, true) : '';
  return '<div class="hash-card">' + rowsHtml + hmacHtml + '</div>' + chainHtml(rawInput);
}

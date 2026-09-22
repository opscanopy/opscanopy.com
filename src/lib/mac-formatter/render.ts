/**
 * MAC Address Formatter — the pure HTML builders for the result panel.
 *
 * Shared by BOTH the Astro frontmatter (which server-renders the seeded
 * example so a no-JS visitor — and every AI crawler, which does not execute
 * JS — sees a real computed answer) and the island's <script> (which rebuilds
 * the same markup on every eval). One implementation, so the two can never
 * drift apart.
 *
 * Everything here is pure: no `window`, no `document`, no clock. The locale
 * prefix for the cross-tool chain link is passed in — the browser derives it
 * from `window.location`, the build derives it from `Astro.currentLocale`.
 */
import { escapeHtml } from '../escape-html';
import { buildIpHash } from '../ip-hash';
import type { MacResult, MacRow } from './types';

export const ALERT_SVG =
  '<svg class="mac-error__icon" width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 2.5L18.5 17H1.5z"></path><path d="M10 8v4"></path><path d="M10 14.6v.01"></path></svg>';

export const COPY_SVG =
  '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="5" width="9" height="9" rx="1.5"></rect><path d="M3 11H2a1 1 0 01-1-1V2a1 1 0 011-1h8a1 1 0 011 1v1"></path></svg>';
export const CHECK_SVG =
  '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 8l4 4 7-7"></path></svg>';

/** The empty-state paragraph, so the SSR placeholder and `renderEmpty` agree. */
export const EMPTY_HTML =
  '<p class="mac-empty body-sm text-mute">Type a MAC in any form or pick an example to see every separator form, the OUI, the transmission and administration bits, and the IPv6 link-local here.</p>';

export function errorHtml(message: string): string {
  return (
    '<div class="mac-error" role="alert">' +
    ALERT_SVG +
    '<div><p class="mac-error__title">Could not read that address</p>' +
    `<p class="mac-error__detail">${escapeHtml(message)}</p></div></div>`
  );
}

export interface RenderOptions {
  /** '' for English, '/de' etc. for a localized page — prefixes cross-tool links. */
  localePrefix: string;
}

/** Cross-tool chain chip — MAC Address Formatter → IP Address Converter. */
function chainHtml(rows: MacRow[], localePrefix: string): string {
  const linkLocal = rows.find((r) => r.label === 'IPv6 link-local (EUI-64)');
  if (!linkLocal || typeof linkLocal.value !== 'string' || !linkLocal.value) return '';
  const href = `${localePrefix}/ip-address-converter/` + buildIpHash(linkLocal.value);
  return `<div class="mac-chips"><a class="mac-chip" href="${escapeHtml(href)}">Open in IP Address Converter</a></div>`;
}

export function resultHtml(result: MacResult, { localePrefix }: RenderOptions): string {
  const rows = Array.isArray(result.rows) ? result.rows : [];
  const rowsHtml = rows
    .map((r) => {
      const v = typeof r.value === 'string' ? r.value : '';
      const cls = r.mono ? 'mac-row__v is-mono' : 'mac-row__v';
      const copyBtn = v
        ? `<button class="mac-copy-btn" data-copy-value="${escapeHtml(v)}" title="Copy" aria-label="Copy ${escapeHtml(r.label ?? '')}">${COPY_SVG}</button>`
        : '<span></span>';
      return (
        '<div class="mac-row">' +
        `<span class="mac-row__k">${escapeHtml(r.label ?? '')}</span>` +
        `<span class="${cls}">${escapeHtml(v)}</span>` +
        copyBtn +
        '</div>'
      );
    })
    .join('');
  const count = `${rows.length} ${rows.length === 1 ? 'representation' : 'representations'}`;
  return (
    '<div class="mac-card">' +
    `<div class="mac-title"><span class="mac-title__badge">EUI-48</span><span>${escapeHtml(count)}</span></div>` +
    rowsHtml +
    '</div>' +
    chainHtml(rows, localePrefix)
  );
}

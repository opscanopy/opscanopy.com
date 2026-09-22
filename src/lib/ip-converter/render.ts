/**
 * IP Address Converter — the pure HTML builders for the single-mode result
 * panel.
 *
 * Shared by BOTH the Astro frontmatter (which server-renders the seeded
 * example so a no-JS visitor — and every AI crawler, which does not execute
 * JS — sees a real computed answer) and the island's <script> (which rebuilds
 * the same markup on every eval). One implementation, so the two can never
 * drift apart. Bulk mode is client-only and stays in the component.
 *
 * Everything here is pure: no `window`, no `document`, no clock. The locale
 * prefix for cross-tool links is passed in — the browser derives it from
 * `window.location`, the build derives it from `Astro.currentLocale`.
 */
import { escapeHtml } from '../escape-html';
import { buildIpHash } from '../ip-hash';
import type { ConvertResult } from './types';

export const ALERT_SVG =
  '<svg class="ipc-error__icon" width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 2.5L18.5 17H1.5z"></path><path d="M10 8v4"></path><path d="M10 14.6v.01"></path></svg>';
export const COPY_ICON_SVG =
  '<svg class="ipc-copy-icon" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="5" width="9" height="9" rx="1.5"/><path d="M3 11H2a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v1"/></svg>';
export const CHECK_ICON_SVG =
  '<svg class="ipc-check-icon hidden" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 8.5l3.5 3.5L13 4.5"/></svg>';

/** The empty-state paragraph, so the SSR placeholder and `renderEmpty` agree. */
export const EMPTY_HTML =
  '<p class="ipc-empty body-sm text-mute">Type an IP in any form or pick an example to see it in dotted decimal, integer, hex and binary here.</p>';

/** Escape, then allow soft breaks after separators so long mono values wrap cleanly. */
export function monoHtml(s: string): string {
  return escapeHtml(s).replace(/([.:])/g, '$1<wbr>');
}

export function copyBtnHtml(label: string, value: string): string {
  return (
    `<button class="ipc-copy-btn" type="button" aria-label="Copy ${escapeHtml(label)} value" data-copy="${escapeHtml(value)}">` +
    COPY_ICON_SVG +
    CHECK_ICON_SVG +
    '</button>'
  );
}

export function errorHtml(message: string, isAlert = false): string {
  return (
    `<div class="ipc-error"${isAlert ? ' role="alert"' : ''}>` +
    ALERT_SVG +
    '<div><p class="ipc-error__title">Could not read that address</p>' +
    `<p id="ipc-error-detail" class="ipc-error__detail">${escapeHtml(message)}</p></div></div>`
  );
}

function cleanWarnings(result: ConvertResult): string[] {
  return Array.isArray(result.warnings)
    ? result.warnings.filter((w): w is string => typeof w === 'string' && w.length > 0)
    : [];
}

/** The one-line `role="status"` readout: "IPv4", or "IPv4 — 2 warnings". */
export function summaryText(result: ConvertResult): string {
  const version = result.version === 6 ? 'IPv6' : 'IPv4';
  const warnings = cleanWarnings(result);
  return warnings.length
    ? `${version} — ${warnings.length} warning${warnings.length > 1 ? 's' : ''}`
    : version;
}

export interface RenderOptions {
  /** '' for English, '/de' etc. for a localized page — prefixes cross-tool links. */
  localePrefix: string;
  /** What the user typed — decides whether the echo row says "input" or "input format". */
  rawInput: string;
}

export function resultHtml(result: ConvertResult, { localePrefix, rawInput }: RenderOptions): string {
  const version = result.version === 6 ? 'IPv6' : 'IPv4';
  const warnings = cleanWarnings(result);

  const trimmedInput = rawInput.trim().toLowerCase();
  const rows = Array.isArray(result.rows) ? result.rows : [];
  const rowsHtml = rows
    .map((r) => {
      const label = typeof r.label === 'string' ? r.label : '';
      const value = typeof r.value === 'string' ? r.value : '';
      const shown = typeof r.display === 'string' && r.display ? r.display : value;
      const cls = r.mono ? 'ipc-row__v is-mono' : 'ipc-row__v';
      const shownHtml = r.mono ? monoHtml(shown) : escapeHtml(shown);
      const inputChip = r.isInput
        ? `<span class="ipc-chip-input">${value.toLowerCase() === trimmedInput ? 'input' : 'input format'}</span>`
        : '';
      const zoneLink =
        label === 'PTR name'
          ? `<a class="ipc-row__zone-link" href="${escapeHtml(`${localePrefix}/reverse-dns-ptr/`)}">reverse zone →</a>`
          : '';
      return (
        '<div class="ipc-row">' +
        `<span class="ipc-row__k">${escapeHtml(label)}${inputChip}</span>` +
        `<span class="ipc-row__v-wrap"><span class="${cls}">${shownHtml}</span>${zoneLink}${copyBtnHtml(label, value)}</span></div>`
      );
    })
    .join('');

  const detected = result.detected ? `read as ${escapeHtml(result.detected)}` : '';
  const warnHtml = warnings.length
    ? `<div class="ipc-warnings">${warnings.map((w) => `<p class="ipc-warnings__item">${escapeHtml(w)}</p>`).join('')}</div>`
    : '';

  const canonical =
    result.version === 6
      ? rows.find((r) => r.label === 'Compressed')?.value
      : rows.find((r) => r.label === 'Dotted decimal')?.value;
  let chipsHtml = '';
  if (canonical) {
    const hash = buildIpHash(canonical);
    const chip = (href: string, text: string): string =>
      `<a class="ipc-chip" href="${escapeHtml(href)}">${text}</a>`;
    chipsHtml =
      '<div class="ipc-chips">' +
      chip(`${localePrefix}/subnet-calculator${hash}`, 'Open in Subnet Calculator') +
      chip(`${localePrefix}/cidr-checker${hash}`, 'Check against CIDRs') +
      chip(`${localePrefix}/reverse-dns-ptr/${hash}`, 'Build PTR record') +
      '</div>';
  }

  return (
    warnHtml +
    '<div class="ipc-card">' +
    `<div class="ipc-title"><span class="ipc-title__badge">${version}</span><span class="ipc-title__detected">${detected}</span></div>` +
    rowsHtml +
    '</div>' +
    chipsHtml
  );
}

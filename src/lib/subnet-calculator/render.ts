/**
 * Subnet Calculator — the pure HTML builders for the result panel.
 *
 * Shared by BOTH the Astro frontmatter (which server-renders the seeded
 * example so a no-JS visitor — and every AI crawler, which does not execute
 * JS — sees a real computed answer) and the island's <script> (which rebuilds
 * the same markup on every eval). One implementation, so the two can never
 * drift apart.
 *
 * Everything here is pure: no `window`, no `document`, no clock. The locale
 * prefix for cross-tool links is passed in — the browser derives it from
 * `window.location`, the build derives it from `Astro.currentLocale`.
 */
import { escapeHtml } from '../escape-html';
import { buildIpHash } from '../ip-hash';
import type { SubnetResult } from './types';

export const ALERT_SVG =
  '<svg class="snc-error__icon" width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 2.5L18.5 17H1.5z"></path><path d="M10 8v4"></path><path d="M10 14.6v.01"></path></svg>';
export const COPY_ICON_SVG =
  '<svg class="snc-copy-icon" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="5" width="9" height="9" rx="1.5"/><path d="M3 11H2a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v1"/></svg>';
export const CHECK_ICON_SVG =
  '<svg class="snc-check-icon hidden" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 8.5l3.5 3.5L13 4.5"/></svg>';

/** The empty-state paragraph, so the SSR placeholder and `renderEmpty` agree. */
export const EMPTY_HTML =
  '<p class="snc-empty body-sm text-inverse-mute">Type an address — with a prefix or a netmask — or tap an example to see its network, range and host counts here.</p>';

/** Escape, then allow soft breaks after separators so long mono values wrap cleanly. */
export function monoHtml(s: string): string {
  return escapeHtml(s).replace(/([.:])/g, '$1<wbr>');
}

export function copyBtnHtml(label: string, value: string): string {
  return (
    `<button class="snc-copy-btn" type="button" aria-label="Copy ${escapeHtml(label)}" data-copy="${escapeHtml(value)}">` +
    COPY_ICON_SVG +
    CHECK_ICON_SVG +
    '</button>'
  );
}

export function errorHtml(message: string, isAlert = false): string {
  return (
    `<div class="snc-error"${isAlert ? ' role="alert"' : ''}>` +
    ALERT_SVG +
    '<div><p class="snc-error__title">Could not calculate this subnet</p>' +
    `<p id="snc-error-detail" class="snc-error__detail">${escapeHtml(message)}</p></div></div>`
  );
}

export interface RenderOptions {
  /** '' for English, '/de' etc. for a localized page — prefixes cross-tool links. */
  localePrefix: string;
}

export function resultHtml(result: SubnetResult, { localePrefix }: RenderOptions): string {
  const version = result.version === 6 ? 'IPv6' : 'IPv4';

  const stats = Array.isArray(result.stats) ? result.stats : [];
  const statsHtml = stats
    .map((s, i) => {
      const value = typeof s.value === 'string' ? s.value : '';
      const shown = typeof s.display === 'string' && s.display ? s.display : value;
      const cls = 'snc-answer__v' + (i === 0 ? ' is-hero' : '') + (s.mono ? ' is-mono' : '');
      const shownHtml = s.mono ? monoHtml(shown) : escapeHtml(shown);
      const caption = s.caption ? `<span class="snc-answer__cap">${escapeHtml(s.caption)}</span>` : '';
      return (
        '<div class="snc-answer__tile">' +
        `<span class="snc-answer__k">${escapeHtml(s.label ?? '')}</span>` +
        `<span class="${cls}" data-k="stat:${escapeHtml(s.label ?? '')}">${shownHtml}</span>${caption}</div>`
      );
    })
    .join('');

  const noteHtml = result.note ? `<p class="snc-note">${escapeHtml(result.note)}</p>` : '';

  const groups = Array.isArray(result.groups) ? result.groups : [];
  const groupsHtml = groups
    .map((g) => {
      const rowsHtml = (Array.isArray(g.rows) ? g.rows : [])
        .map((r) => {
          const value = typeof r.value === 'string' ? r.value : '';
          const shown = typeof r.display === 'string' && r.display ? r.display : value;
          const cls = r.mono ? 'snc-row__v is-mono' : 'snc-row__v';
          const shownHtml = r.mono ? monoHtml(shown) : escapeHtml(shown);
          const label = r.label ?? '';
          const gloss = r.gloss ? `<span class="snc-row__gloss">${escapeHtml(r.gloss)}</span>` : '';
          return (
            '<div class="snc-row">' +
            `<dt class="snc-row__k">${escapeHtml(label)}${gloss}</dt>` +
            `<dd class="snc-row__v-wrap"><span class="${cls}" data-k="row:${escapeHtml(label)}">${shownHtml}</span>${copyBtnHtml(label, value)}</dd>` +
            '</div>'
          );
        })
        .join('');
      return (
        '<section class="snc-group">' +
        `<h3 class="snc-group__h">${escapeHtml(g.heading ?? '')}</h3>` +
        `<dl class="snc-group__dl">${rowsHtml}</dl></section>`
      );
    })
    .join('');

  let chipsHtml = '';
  if (result.normalized) {
    const hash = buildIpHash(result.normalized);
    const chip = (href: string, text: string): string =>
      `<a class="snc-chip" href="${escapeHtml(href)}">${text}</a>`;
    chipsHtml =
      '<div class="snc-xchips">' +
      chip(`${localePrefix}/cidr-checker${hash}`, 'Check against CIDRs') +
      chip(`${localePrefix}/subnet-splitter${hash}`, 'Split this subnet') +
      chip(`${localePrefix}/ip-address-converter${hash}`, 'Convert this address') +
      '</div>';
  }

  return (
    '<div>' +
    '<div class="snc-card">' +
    `<div class="snc-title"><span class="snc-title__badge">${version}</span><span class="snc-title__net">${monoHtml(result.title ?? '')}</span></div>` +
    `<div class="snc-answer">${statsHtml}</div>` +
    noteHtml +
    groupsHtml +
    '</div>' +
    chipsHtml +
    '</div>'
  );
}

/** "Label: value" lines for the Copy all button. */
export function buildCopyAll(result: SubnetResult): string {
  const lines: string[] = [`Network: ${result.title ?? ''}`];
  for (const s of result.stats) lines.push(`${s.label}: ${s.value}`);
  for (const g of result.groups) for (const r of g.rows) lines.push(`${r.label}: ${r.value}`);
  return lines.join('\n');
}

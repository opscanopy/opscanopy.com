/**
 * Subnet Splitter — the pure HTML builders for the result panel.
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
import type { SplitAllocation, SplitResult, SplitSection } from './types';

export const ALERT_SVG =
  '<svg class="spl-error__icon" width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 2.5L18.5 17H1.5z"></path><path d="M10 8v4"></path><path d="M10 14.6v.01"></path></svg>';

/** The empty-state paragraph, so the SSR placeholder and `renderEmpty` agree. */
export const EMPTY_HTML =
  '<p class="spl-empty body-sm text-mute">Enter a parent CIDR or pick an example to see the free space, an equal-size split, and a parsed breakdown of your allocations here.</p>';

export function errorHtml(message: string): string {
  return (
    '<div class="spl-error" role="alert">' +
    ALERT_SVG +
    '<div><p class="spl-error__title">Nothing to split</p>' +
    `<p class="spl-error__detail">${escapeHtml(message)}</p></div></div>`
  );
}

function freeHtml(freeCidrs: string[]): string {
  if (freeCidrs.length === 0) {
    return (
      '<div class="spl-block"><div class="spl-block__head"><span>Free space (minimal CIDRs)</span></div>' +
      '<p class="spl-none">None — the parent is fully allocated.</p></div>'
    );
  }
  const lines = freeCidrs
    .map((c) => `<div class="spl-line"><span class="spl-dot"></span><span>${escapeHtml(c)}</span></div>`)
    .join('');
  return (
    '<div class="spl-block">' +
    `<div class="spl-block__head"><span>Free space (minimal CIDRs)</span><span class="spl-line__meta">${freeCidrs.length} block${freeCidrs.length === 1 ? '' : 's'}</span></div>` +
    lines +
    '</div>'
  );
}

function splitHtml(split: SplitSection, nextFree: string | null | undefined): string {
  const note =
    `<p class="spl-block__note">Next free: ${escapeHtml(nextFree ?? 'none')}</p>`;
  const rows = split.subnets
    .map((s) => {
      const cls =
        s.status === 'used' ? 'spl-dot--used' : s.status === 'partial' ? 'spl-dot--partial' : 'spl-dot--free';
      return (
        '<div class="spl-line">' +
        `<span class="spl-dot ${cls}"></span>` +
        `<span>${escapeHtml(s.cidr)}</span>` +
        `<span class="spl-line__meta">${escapeHtml(s.status)}</span></div>`
      );
    })
    .join('');
  // `split.total` is the REAL count; `split.subnets.length` is the capped
  // render list and reported 256 for a 512-subnet split in both places.
  const shownCount = split.subnets.length;
  const totalLabel = split.total;
  const truncatedBanner = split.truncated
    ? `<div class="mt-3 rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/40 dark:border-amber-700 px-4 py-2.5 text-sm text-amber-800 dark:text-amber-300">Showing first ${escapeHtml(String(shownCount))} of ${escapeHtml(totalLabel)} subnets — narrow your prefix to see all results.</div>`
    : '';
  const head =
    `<div class="spl-block__head"><span>Split into /${escapeHtml(String(split.prefix))}</span>` +
    `<span class="spl-line__meta">${escapeHtml(totalLabel)} subnet${totalLabel === '1' ? '' : 's'}</span></div>`;
  return '<div class="spl-block">' + head + note + rows + truncatedBanner + '</div>';
}

function allocatedHtml(allocated: SplitAllocation[]): string {
  if (allocated.length === 0) {
    return (
      '<div class="spl-block"><div class="spl-block__head"><span>Allocations</span></div>' +
      '<p class="spl-none">None — add allocated CIDRs above to track used space.</p></div>'
    );
  }
  const rows = allocated
    .map((a) => {
      if (!a.ok) {
        return (
          '<div class="spl-line spl-line--bad"><span class="spl-dot spl-dot--bad"></span>' +
          `<span>${escapeHtml(a.cidr)}</span>` +
          `<span class="spl-line__meta">${escapeHtml(a.note ?? 'invalid')}</span></div>`
        );
      }
      return (
        '<div class="spl-line"><span class="spl-dot spl-dot--ok"></span>' +
        `<span>${escapeHtml(a.cidr)}</span>` +
        `<span class="spl-line__meta">${escapeHtml(a.note ?? '')}</span></div>`
      );
    })
    .join('');
  return (
    '<div class="spl-block"><div class="spl-block__head"><span>Allocations</span>' +
    `<span class="spl-line__meta">${allocated.length} line${allocated.length === 1 ? '' : 's'}</span></div>` +
    rows +
    '</div>'
  );
}

/** The one-line `role="status"` readout: "used 50% · 128 free", or '' without stats. */
export function summaryText(result: SplitResult): string {
  const stats = result.stats;
  return stats ? `used ${stats.usedPct}% · ${stats.free} free` : '';
}

export function resultHtml(result: SplitResult): string {
  return (
    freeHtml(result.freeCidrs ?? []) +
    (result.split ? splitHtml(result.split, result.nextFree) : '') +
    allocatedHtml(result.allocated ?? [])
  );
}

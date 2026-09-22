/**
 * Alertmanager Route Tester — the pure HTML builders for the results panel.
 *
 * Shared by BOTH the Astro frontmatter (which server-renders the seeded
 * example so a no-JS visitor — and every AI crawler, which does not execute
 * JS — sees the real receiver, the route-path breadcrumb and the inherited
 * grouping) and the island's <script> (which rebuilds the same markup on every
 * run). One implementation, so the two can never drift apart.
 *
 * `matchRoute()` is pure and synchronous — no clock, no DOM — so the whole
 * result is safe to bake at build time.
 *
 * Everything here is pure: no `window`, no `document`, no clock.
 */
import { escapeHtml } from '../escape-html';
import type { Grouping, MatchRouteResult, RouteMatch } from './types';

export const ICON_CHECK =
  '<svg class="amr-match__icon" width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="10" cy="10" r="8"></circle><path d="M6.5 10.2l2.4 2.4 4.6-5"></path></svg>';
export const ICON_WARN =
  '<svg class="amr-warn__icon" width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 2.5L18.5 17H1.5z"></path><path d="M10 8v4"></path><path d="M10 14.6v.01"></path></svg>';
export const ICON_ALERT =
  '<svg class="amr-error__icon" width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 2.5L18.5 17H1.5z"></path><path d="M10 8v4"></path><path d="M10 14.6v.01"></path></svg>';

/** The empty-state paragraph, so the SSR placeholder and `renderEmpty` agree. */
export const EMPTY_HTML =
  '<p class="amr-empty body-sm text-mute">Load an example or paste a route tree and an alert’s labels, ' +
  'then run to see which receiver(s) the alert reaches.</p>';

export const LOADING_HTML =
  '<div class="amr-loading"><span class="amr-loading__dot"></span>' +
  '<span class="amr-loading__dot"></span><span class="amr-loading__dot"></span>' +
  '<span>Walking the route tree…</span></div>';

/** Structurally unreachable (the root always matches), kept so the UI is never blank. */
export const NO_MATCH_HTML =
  '<p class="amr-empty body-sm text-mute">The route tree produced no terminal match. ' +
  'Check that the root route is well-formed.</p>';

export function errorHtml(message: string): string {
  return (
    '<div class="amr-error" role="alert">' +
    ICON_ALERT +
    '<div class="amr-error__body"><p class="amr-error__title">Could not evaluate the route</p>' +
    `<p class="amr-error__detail">${escapeHtml(message)}</p></div></div>`
  );
}

export function warningsHtml(warnings: string[]): string {
  if (!warnings.length) return '';
  const items = warnings
    .map((w) => `<div class="amr-warn">${ICON_WARN}<span>${escapeHtml(w)}</span></div>`)
    .join('');
  return `<div class="amr-warns">${items}</div>`;
}

/** The root → … → terminal breadcrumb. */
export function pathHtml(path: string[]): string {
  if (!path.length) return '';
  const crumbs = path
    .map((seg, i) => {
      const last = i === path.length - 1;
      const cls = last ? 'amr-crumb amr-crumb--last' : 'amr-crumb';
      const sep = i > 0 ? '<span class="amr-sep" aria-hidden="true">→</span>' : '';
      return `${sep}<span class="${cls}">${escapeHtml(seg)}</span>`;
    })
    .join('');
  return `<div class="amr-path">${crumbs}</div>`;
}

/** The effective (inherited + own) grouping line. */
export function groupingHtml(g: Grouping): string {
  const items: string[] = [];
  const add = (k: string, v: string | undefined): void => {
    if (v !== undefined && v !== '') {
      items.push(
        `<span class="amr-group__item"><span class="amr-group__k">${escapeHtml(k)}</span> ` +
          `<span class="amr-group__v">${escapeHtml(v)}</span></span>`,
      );
    }
  };
  const gb = Array.isArray(g.group_by) ? g.group_by.join(', ') : undefined;
  add('group_by', gb !== undefined ? `[${gb}]` : undefined);
  add('group_wait', g.group_wait);
  add('group_interval', g.group_interval);
  add('repeat_interval', g.repeat_interval);
  if (!items.length) return '';
  return `<div class="amr-group">${items.join('')}</div>`;
}

/** One terminal match card. */
export function matchHtml(m: RouteMatch, index: number, total: number): string {
  const rx = m.receiver.trim() === '' ? '(no receiver)' : m.receiver;
  const ordinal = total > 1 ? `<span class="amr-pill">#${index + 1}</span>` : '';
  const cont = m.viaContinue ? '<span class="amr-pill amr-pill--continue">via continue</span>' : '';
  return (
    '<div class="amr-match">' +
    `<div class="amr-match__head">${ICON_CHECK}` +
    `<span class="amr-match__rx">${escapeHtml(rx)}</span>${ordinal}${cont}</div>` +
    pathHtml(m.path) +
    groupingHtml(m.grouping) +
    '</div>'
  );
}

/** "1 receiver · team-DB-pages", "2 receivers · a, b". */
export function summaryText(matches: RouteMatch[]): string {
  const names = matches.map((m) => (m.receiver.trim() === '' ? '(none)' : m.receiver));
  const n = matches.length;
  return `${n} receiver${n === 1 ? '' : 's'} · ${names.join(', ')}`;
}

/** The status-line text for any result, including the failure states. */
export function resultSummaryText(result: MatchRouteResult): string {
  if (!result || result.ok === false || result.error) return 'Error';
  const matches = Array.isArray(result.matches) ? result.matches : [];
  if (matches.length === 0) return 'No match';
  return summaryText(matches);
}

/** The whole results panel for any result: error card, no-match note, or match cards + warnings. */
export function resultHtml(result: MatchRouteResult): string {
  if (!result || result.ok === false || result.error) {
    return errorHtml(result?.error ?? 'Unknown error while evaluating the route.');
  }
  const matches = Array.isArray(result.matches) ? result.matches : [];
  const warnings = Array.isArray(result.warnings) ? result.warnings : [];
  if (matches.length === 0) return NO_MATCH_HTML + warningsHtml(warnings);
  const rows = matches.map((m, i) => matchHtml(m, i, matches.length)).join('');
  return rows + warningsHtml(warnings);
}

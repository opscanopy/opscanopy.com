/**
 * Regex Log Tester — the pure HTML builders for the match table and the
 * highlighted preview.
 *
 * Shared by BOTH the Astro frontmatter (which server-renders the seeded
 * example so a no-JS visitor — and every AI crawler, which does not execute
 * JS — sees the real matches, their capture groups and the highlighted log)
 * and the island's <script> (which rebuilds the same markup on every run).
 * One implementation, so the two can never drift apart.
 *
 * `run()` is pure and synchronous (a RegExp over a fixed string), so the whole
 * result is safe to bake at build time. Everything here is pure: no `window`,
 * no `document`.
 */
import { escapeHtml } from '../escape-html';
import type { RegexMatch, RegexResult } from './types';

export const CHECK_SVG =
  '<svg class="rx-nomatch__icon" width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="10" cy="10" r="8"></circle><path d="M7 10.2l-.01.01"></path><path d="M10 10.2l-.01.01"></path><path d="M13 10.2l-.01.01"></path></svg>';
export const ALERT_SVG =
  '<svg class="rx-error__icon" width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 2.5L18.5 17H1.5z"></path><path d="M10 8v4"></path><path d="M10 14.6v.01"></path></svg>';
export const INFO_SVG =
  '<svg class="rx-notice__icon" width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="10" cy="10" r="8"></circle><path d="M10 9v4.5"></path><path d="M10 6.4v.01"></path></svg>';

/** The empty-state paragraph, so the SSR placeholder and `renderEmpty` agree. */
export const EMPTY_HTML =
  '<p class="rx-empty body-sm text-mute">Enter a pattern above to see live matches, capture groups and named groups here.</p>';

export function errorHtml(title: string, message: string): string {
  return (
    '<div class="rx-error" role="alert">' +
    ALERT_SVG +
    `<div class="rx-error__body"><p class="rx-error__title">${escapeHtml(title)}</p>` +
    `<p class="rx-error__detail">${escapeHtml(message)}</p></div></div>`
  );
}

/**
 * Build the highlighted HTML by walking sorted, clamped, non-overlapping
 * match ranges. Every text run is escaped; only our own <mark> wrappers are
 * raw markup, so user content can never inject HTML.
 */
export function buildHighlight(text: string, matches: RegexMatch[]): string {
  if (text.length === 0) {
    return '<p class="rx-hl-empty">No sample text.</p>';
  }
  // Sort by start index; skip ranges that overlap an already-emitted one so
  // the slicing stays well-formed even if the engine returns odd offsets.
  const sorted = matches
    .filter((m) => Number.isFinite(m.index) && m.index >= 0 && m.index <= text.length)
    .slice()
    .sort((a, b) => a.index - b.index);

  let html = '';
  let cursor = 0;
  let i = 0;
  sorted.forEach((m) => {
    const start = Math.max(m.index, cursor);
    const rawLen = Number.isFinite(m.length) ? Math.max(0, m.length) : 0;
    const end = Math.min(m.index + rawLen, text.length);
    if (start < cursor) return; // overlaps a prior match — skip
    if (m.index > cursor) {
      html += escapeHtml(text.slice(cursor, m.index));
    }
    const cls = i % 2 === 0 ? 'rx-mark' : 'rx-mark rx-mark--alt';
    if (end <= m.index) {
      // Zero-length match (e.g. anchors / lookarounds) — render a caret marker.
      html += `<mark class="${cls} rx-mark--empty"></mark>`;
      cursor = Math.max(cursor, m.index);
    } else {
      html += `<mark class="${cls}">${escapeHtml(text.slice(m.index, end))}</mark>`;
      cursor = end;
    }
    i += 1;
  });
  if (cursor < text.length) {
    html += escapeHtml(text.slice(cursor));
  }
  return `<pre class="rx-pre">${html}</pre>`;
}

/** A single group chip (capture index or named). */
function groupChip(key: string, value: string | undefined): string {
  const has = typeof value === 'string';
  const valHtml = !has
    ? '<span class="rx-group__val rx-group__val--empty">undefined</span>'
    : value === ''
      ? '<span class="rx-group__val rx-group__val--empty">empty</span>'
      : `<span class="rx-group__val">${escapeHtml(value)}</span>`;
  return `<span class="rx-group"><span class="rx-group__key">${escapeHtml(key)}</span>${valHtml}</span>`;
}

function matchRow(m: RegexMatch, n: number): string {
  const idx = Number.isFinite(m.index) ? m.index : 0;
  const full =
    m.match === ''
      ? '<span class="rx-val rx-val--empty">(empty match)</span>'
      : `<span class="rx-val">${escapeHtml(m.match)}</span>`;

  const chips: string[] = [];
  const groups = Array.isArray(m.groups) ? m.groups : [];
  groups.forEach((g, gi) => {
    chips.push(groupChip(`$${gi + 1}`, g));
  });
  const named = m.named && typeof m.named === 'object' ? m.named : {};
  Object.keys(named).forEach((name) => {
    chips.push(groupChip(name, named[name]));
  });
  const groupsHtml = chips.length
    ? `<div class="rx-groups">${chips.join('')}</div>`
    : '<span class="rx-nogroups">—</span>';

  return (
    '<tr>' +
    `<td class="rx-idx">${n}</td>` +
    `<td class="rx-idx">${idx}</td>` +
    `<td>${full}</td>` +
    `<td>${groupsHtml}</td>` +
    '</tr>'
  );
}

/** The status-line text beside "Matches": "Invalid", "1 match", "N matches". */
export function summaryText(result: RegexResult): string {
  if (!result || result.valid === false) return 'Invalid';
  const count = Number.isFinite(result.matchCount) ? result.matchCount : 0;
  return count === 1 ? '1 match' : `${count} matches`;
}

/**
 * The results panel: the match table (or the no-match note), with any
 * non-fatal notice above it; an invalid pattern becomes the alert banner.
 *
 * ONLY `valid === false` is an invalid pattern. A truthy `notice` is a caveat
 * on a perfectly good run (input over the scan cap, matching stopped at the
 * match cap) and must never suppress the real matches below it.
 */
export function resultsHtml(result: RegexResult): string {
  if (!result || result.valid === false) {
    return errorHtml(
      'Invalid pattern',
      result?.error ?? 'The regular expression could not be compiled.'
    );
  }

  const notice =
    typeof result.notice === 'string' && result.notice
      ? '<div class="rx-notice">' +
        INFO_SVG +
        `<span class="rx-notice__text">${escapeHtml(result.notice)}</span></div>`
      : '';

  const matches = Array.isArray(result.matches) ? result.matches : [];
  if (matches.length === 0) {
    return (
      notice +
      '<div class="rx-nomatch">' +
      CHECK_SVG +
      '<span class="rx-nomatch__text">No matches. Adjust the pattern, flags or sample text.</span></div>'
    );
  }

  const rows = matches.map((m, i) => matchRow(m, i + 1)).join('');
  return (
    notice +
    '<div class="rx-table-wrap"><table class="rx-table">' +
    '<thead><tr><th scope="col">#</th><th scope="col">Index</th>' +
    '<th scope="col">Match</th><th scope="col">Groups</th></tr></thead>' +
    `<tbody>${rows}</tbody></table></div>`
  );
}

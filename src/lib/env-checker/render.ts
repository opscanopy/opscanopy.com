/**
 * Env Example Checker — the pure HTML builders for the drift report.
 *
 * Shared by BOTH the Astro frontmatter (which server-renders the seeded
 * example so a no-JS visitor — and every AI crawler, which does not execute
 * JS — sees the real "missing / unused" verdict) and the island's <script>
 * (which rebuilds the same markup on every check). One implementation, so the
 * two can never drift apart.
 *
 * `check()` is pure and synchronous and its arrays are sorted, so the whole
 * result is safe to bake at build time. Everything here is pure: no `window`,
 * no `document`, no clock.
 */
import { escapeHtml } from '../escape-html';
import type { EnvResult } from './types';

/* ---- Icons (decorative) ------------------------------------------------- */

export const MISS_SVG =
  '<svg class="ec-group__icon" width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 2.5L18.5 17H1.5z"></path><path d="M10 8v4"></path><path d="M10 14.6v.01"></path></svg>';
export const UNUSED_SVG =
  '<svg class="ec-group__icon" width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="10" cy="10" r="8"></circle><path d="M10 6v4.5"></path><path d="M10 13.6v.01"></path></svg>';
export const OK_SVG =
  '<svg class="ec-ok__icon" width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="10" cy="10" r="8"></circle><path d="M6.5 10.5l2.4 2.4 4.6-5"></path></svg>';
export const ALERT_SVG =
  '<svg class="ec-error__icon" width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 2.5L18.5 17H1.5z"></path><path d="M10 8v4"></path><path d="M10 14.6v.01"></path></svg>';
export const COPY_ICON =
  '<svg class="ec-copy__icon" width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5.5" y="5.5" width="8" height="8" rx="1.5"></rect><path d="M3.5 10.5h-.5a1 1 0 01-1-1v-6a1 1 0 011-1h6a1 1 0 011 1v.5"></path></svg>';
export const COPYALL_ICON =
  '<svg class="ec-copyall__icon" width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5.5" y="5.5" width="8" height="8" rx="1.5"></rect><path d="M3.5 10.5h-.5a1 1 0 01-1-1v-6a1 1 0 011-1h6a1 1 0 011 1v.5"></path></svg>';

/** The empty-state paragraph, so the SSR placeholder and `renderEmpty` agree. */
export const EMPTY_HTML =
  '<p class="ec-empty body-sm text-mute">Load an example or paste your own code and .env.example, then check to see which variables drifted.</p>';

export const LOADING_HTML =
  '<div class="ec-loading"><span class="ec-loading__dot"></span>' +
  '<span class="ec-loading__dot"></span><span class="ec-loading__dot"></span>' +
  '<span>Checking…</span></div>';

export const OK_HTML =
  '<div class="ec-ok">' +
  OK_SVG +
  '<span class="ec-ok__text">No drift detected. Every variable your code reads is declared in .env.example, with nothing left over.</span>' +
  '</div>';

/** Coerce an unknown into a deduped string array of non-empty keys. */
export function strList(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const x of v) {
    if (typeof x === 'string' && x.length > 0 && !seen.has(x)) {
      seen.add(x);
      out.push(x);
    }
  }
  return out;
}

export function errorHtml(message: string): string {
  return (
    '<div class="ec-error" role="alert">' +
    ALERT_SVG +
    '<div class="ec-error__body"><p class="ec-error__title">Could not check</p>' +
    `<p class="ec-error__detail">${escapeHtml(message)}</p></div></div>`
  );
}

/** Build the "Missing from .env.example" group (copyable KEY= rows). */
export function missingGroupHtml(keys: string[]): string {
  const n = keys.length;
  const items = keys
    .map((k) => {
      const safe = escapeHtml(k);
      return (
        '<li class="ec-item">' +
        `<span class="ec-item__key"><span>${safe}</span><span class="ec-item__eq">=</span></span>` +
        `<button type="button" class="ec-copy ec-tap" data-copy="${safe}=" ` +
        `aria-label="Copy ${safe}= line">${COPY_ICON}<span class="ec-copy__lbl">Copy</span></button>` +
        '</li>'
      );
    })
    .join('');
  return (
    '<section class="ec-group ec-group--miss">' +
    '<div class="ec-group__head">' +
    MISS_SVG +
    `<h3 class="ec-group__title">Missing from .env.example</h3>` +
    `<span class="ec-group__count">${n}</span>` +
    `<button type="button" class="ec-copyall ec-tap" data-copy-all="missing" ` +
    `aria-label="Copy all missing keys as .env lines">${COPYALL_ICON}<span class="ec-copyall__lbl">Copy all</span></button>` +
    '</div>' +
    '<p class="ec-group__hint">Used in code but absent from your example. Add these placeholder lines so teammates know what to set.</p>' +
    `<ul class="ec-list">${items}</ul>` +
    '</section>'
  );
}

/** Build the "Unused in code" group (muted, informational). */
export function unusedGroupHtml(keys: string[]): string {
  const n = keys.length;
  const items = keys
    .map(
      (k) =>
        `<li class="ec-item ec-item--unused"><span class="ec-item__key">${escapeHtml(k)}</span></li>`,
    )
    .join('');
  return (
    '<section class="ec-group ec-group--unused">' +
    '<div class="ec-group__head">' +
    UNUSED_SVG +
    `<h3 class="ec-group__title">Unused in code</h3>` +
    `<span class="ec-group__count">${n}</span>` +
    '</div>' +
    '<p class="ec-group__hint">Declared in .env.example but never read in the code you pasted. Safe to remove if truly unused.</p>' +
    `<ul class="ec-list">${items}</ul>` +
    '</section>'
  );
}

/** The whole drift report for one `check()` result. */
export function reportHtml(result: EnvResult): string {
  if (!result || result.error) {
    return errorHtml(result?.error ?? 'Unknown error while checking.');
  }
  const missing = strList(result.missingInExample);
  const unused = strList(result.unusedInExample);
  if (missing.length === 0 && unused.length === 0) return OK_HTML;

  const blocks: string[] = [];
  if (missing.length) blocks.push(missingGroupHtml(missing));
  if (unused.length) blocks.push(unusedGroupHtml(unused));
  return blocks.join('');
}

export type SummaryTone = 'success' | 'error' | 'mute';
export interface ReportSummary {
  text: string;
  tone: SummaryTone;
}

/** The `role="status"` summary text + tone for one result. */
export function reportSummary(result: EnvResult): ReportSummary {
  if (!result || result.error) return { text: 'Error', tone: 'error' };
  const missing = strList(result.missingInExample);
  const unused = strList(result.unusedInExample);
  const used = strList(result.usedVars);

  if (missing.length === 0 && unused.length === 0) {
    return {
      text: used.length ? `${used.length} ${used.length === 1 ? 'var' : 'vars'} · in sync` : 'In sync',
      tone: 'success',
    };
  }
  const parts: string[] = [];
  if (missing.length) parts.push(`${missing.length} missing`);
  if (unused.length) parts.push(`${unused.length} unused`);
  return { text: parts.join(' · '), tone: missing.length > 0 ? 'error' : 'mute' };
}

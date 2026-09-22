/**
 * AlertLint — the pure HTML builders for the results panel.
 *
 * Shared by BOTH the Astro frontmatter (which server-renders the seeded
 * example so a no-JS visitor — and every AI crawler, which does not execute
 * JS — sees the real pass/fail rows) and the island's <script> (which rebuilds
 * the same markup on every run). One implementation, so the two never drift.
 *
 * `runTests()` is deterministic EXCEPT for `summary.durationMs`, which is a
 * wall-clock reading. Nothing here renders it: `countsText` gives the
 * "N passed · M failed" part, and the client alone appends `formatDuration`.
 * The build-time seed therefore carries no timing and stays reproducible.
 *
 * Everything here is pure: no `window`, no `document`, no clock.
 */
import { escapeHtml } from '../escape-html';
import type { RunResult, RunSummary, TestResult } from './types';

export const CHECK_SVG =
  '<svg class="al-row__icon" width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="10" cy="10" r="8"></circle><path d="M6.5 10.5l2.4 2.4 4.6-5"></path></svg>';
export const CROSS_SVG =
  '<svg class="al-row__icon" width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="10" cy="10" r="8"></circle><path d="M7.2 7.2l5.6 5.6M12.8 7.2l-5.6 5.6"></path></svg>';
export const ALERT_SVG =
  '<svg class="al-error__icon" width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 2.5L18.5 17H1.5z"></path><path d="M10 8v4"></path><path d="M10 14.6v.01"></path></svg>';

/** The empty-state paragraph, so the SSR placeholder and `renderEmpty` agree. */
export const EMPTY_HTML =
  '<p class="al-empty body-sm text-mute">Load an example or paste your own rules, then run to see pass/fail results here.</p>';

export const LOADING_HTML =
  '<div class="al-loading"><span class="al-loading__dot"></span>' +
  '<span class="al-loading__dot"></span><span class="al-loading__dot"></span>' +
  '<span>Running tests…</span></div>';

/** A run that parsed fine but declared no assertions. */
export const NO_TESTS_HTML =
  '<p class="al-empty body-sm text-mute">No test cases found in this document.</p>';

/** Client-only: the wall-clock suffix ("3 ms", "<1 ms"); '' when unknown. */
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms)) return '';
  if (ms < 1) return '<1 ms';
  return `${Math.round(ms)} ms`;
}

/** "1 passed" or "2 passed · 1 failed" — never the duration. */
export function countsText(s: RunSummary): string {
  return s.failed > 0 ? `${s.passed} passed · ${s.failed} failed` : `${s.passed} passed`;
}

export function errorHtml(message: string): string {
  return (
    '<div class="al-error" role="alert">' +
    ALERT_SVG +
    '<div class="al-error__body"><p class="al-error__title">Could not run tests</p>' +
    `<p class="al-error__detail">${escapeHtml(message)}</p></div></div>`
  );
}

/** The Expected / Actual block under a failing row. */
export function diffHtml(diff: { expected?: unknown; actual?: unknown }): string {
  const rows: string[] = [];
  // The engine may send diff values as strings OR as objects/arrays (e.g. label
  // maps). Stringify non-strings so the block renders for every failing case.
  const fmt = (v: unknown): string => (typeof v === 'string' ? v : JSON.stringify(v, null, 2));
  if (diff.expected !== undefined && diff.expected !== null) {
    rows.push(
      '<div class="al-diff__row al-diff__row--exp"><span class="al-diff__label">Expected</span>' +
        `<span class="al-diff__val">${escapeHtml(fmt(diff.expected))}</span></div>`,
    );
  }
  if (diff.actual !== undefined && diff.actual !== null) {
    rows.push(
      '<div class="al-diff__row al-diff__row--act"><span class="al-diff__label">Actual</span>' +
        `<span class="al-diff__val">${escapeHtml(fmt(diff.actual))}</span></div>`,
    );
  }
  if (rows.length === 0) return '';
  return `<div class="al-diff">${rows.join('')}</div>`;
}

/** One assertion row. */
export function rowHtml(r: TestResult): string {
  const pass = r.status === 'pass';
  const icon = pass ? CHECK_SVG : CROSS_SVG;
  const cls = pass ? 'al-row al-row--pass' : 'al-row al-row--fail';
  // The icon is decorative; expose pass/fail to assistive tech as text.
  const statusSr = `<span class="sr-only">${pass ? 'Passed: ' : 'Failed: '}</span>`;
  const meta: string[] = [];
  if (r.kind) meta.push(escapeHtml(r.kind));
  if (r.evalTime) meta.push(`@ ${escapeHtml(r.evalTime)}`);
  const metaHtml = meta.length ? `<p class="al-row__meta">${meta.join(' · ')}</p>` : '';
  const msgHtml = r.message ? `<p class="al-row__msg">${escapeHtml(r.message)}</p>` : '';
  const diff = r.diff && !pass ? diffHtml(r.diff) : '';
  return (
    `<div class="${cls}">${icon}` +
    `<div class="al-row__body"><p class="al-row__name">${statusSr}${escapeHtml(r.name)}</p>` +
    `${metaHtml}${msgHtml}${diff}</div></div>`
  );
}

/** The whole results panel for any result: error card, no-tests note, or the rows. */
export function resultsHtml(result: RunResult): string {
  if (!result || result.ok === false || result.error) {
    return errorHtml(result?.error ?? 'Unknown error while running tests.');
  }
  const results = Array.isArray(result.results) ? result.results : [];
  if (results.length === 0) return NO_TESTS_HTML;
  return results.map(rowHtml).join('');
}

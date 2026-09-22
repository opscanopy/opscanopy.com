/**
 * GitLab CI Validator — the pure HTML builders for the results panel.
 *
 * Shared by BOTH the Astro frontmatter (which server-renders the seeded
 * example so a no-JS visitor — and every AI crawler, which does not execute
 * JS — sees the real verdict for the first pipeline) and the island's
 * <script> (which rebuilds the same markup on every run). One implementation,
 * so the two can never drift apart. Mirrors `gha-validator/render.ts`.
 *
 * `validate()` is pure and synchronous, so the whole result is safe to bake at
 * build time. Everything here is pure: no `window`, no `document`, no clock.
 */
import { escapeHtml } from '../escape-html';
import type { Finding, Severity, ValidateResult } from './types';

/* ---- Severity icons (explicit width/height; decorative) ------------------- */

export const ICON_ERROR =
  '<svg class="glci-row__icon" width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="10" cy="10" r="8"></circle><path d="M7.2 7.2l5.6 5.6M12.8 7.2l-5.6 5.6"></path></svg>';
export const ICON_WARNING =
  '<svg class="glci-row__icon" width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 2.5L18.5 17H1.5z"></path><path d="M10 8v4"></path><path d="M10 14.6v.01"></path></svg>';
export const ICON_INFO =
  '<svg class="glci-row__icon" width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="10" cy="10" r="8"></circle><path d="M10 9v4.5"></path><path d="M10 6.4v.01"></path></svg>';
export const ICON_FIX =
  '<svg class="glci-fix__icon" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9.5 2.5a3 3 0 0 0 3.8 3.8l-7 7a1.8 1.8 0 0 1-2.6-2.6z"></path></svg>';
export const ICON_ALERT =
  '<svg class="glci-error__icon" width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 2.5L18.5 17H1.5z"></path><path d="M10 8v4"></path><path d="M10 14.6v.01"></path></svg>';
export const ICON_CHECK =
  '<svg class="glci-success__icon" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9.5"></circle><path d="M7.5 12.5l3 3 6-6.5"></path></svg>';

/** The empty-state paragraph, so the SSR placeholder and `renderEmpty` agree. */
export const EMPTY_HTML =
  '<p class="glci-empty body-sm text-mute">Load an example or paste a pipeline, then validate to see YAML errors and pipeline checks here.</p>';

export const LOADING_HTML =
  '<div class="glci-loading"><span class="glci-loading__dot"></span>' +
  '<span class="glci-loading__dot"></span><span class="glci-loading__dot"></span>' +
  '<span>Validating…</span></div>';

export const SUCCESS_HTML =
  '<div class="glci-success">' +
  ICON_CHECK +
  '<div><p class="glci-success__title">No issues found.</p>' +
  '<p class="glci-success__sub">This pipeline passed every YAML and structural check.</p></div></div>';

const SEV_ORDER: Severity[] = ['error', 'warning', 'info'];
const SEV_LABEL: Record<Severity, string> = {
  error: 'Errors',
  warning: 'Warnings',
  info: 'Info',
};

export function normSeverity(s: string): Severity {
  return s === 'error' || s === 'warning' || s === 'info' ? s : 'info';
}

export function severityIcon(sev: Severity): string {
  if (sev === 'error') return ICON_ERROR;
  if (sev === 'warning') return ICON_WARNING;
  return ICON_INFO;
}

/** Render remediation text, escaping HTML but rendering `code` spans inline. */
export function remediationHtml(text: string): string {
  return escapeHtml(text).replace(/`([^`]+)`/g, (_m, code: string) => `<code>${code}</code>`);
}

/** The parse-error banner (result.error). */
export function errorHtml(message: string): string {
  return (
    '<div class="glci-error" role="alert">' +
    ICON_ALERT +
    '<div class="glci-error__body"><p class="glci-error__title">Could not parse pipeline</p>' +
    `<p class="glci-error__detail">${escapeHtml(message)}</p></div></div>`
  );
}

/** Pluralised "N errors · M warnings · K info", omitting zero buckets. */
export function summaryText(s: ValidateResult['summary']): string {
  const parts: string[] = [];
  if (s.errors > 0) parts.push(`${s.errors} ${s.errors === 1 ? 'error' : 'errors'}`);
  if (s.warnings > 0) parts.push(`${s.warnings} ${s.warnings === 1 ? 'warning' : 'warnings'}`);
  if (s.infos > 0) parts.push(`${s.infos} info`);
  return parts.length ? parts.join(' · ') : 'No issues';
}

export function findingHtml(f: Finding): string {
  const sev = normSeverity(String(f.severity));
  const icon = severityIcon(sev);
  const srLabel = sev === 'error' ? 'Error: ' : sev === 'warning' ? 'Warning: ' : 'Info: ';
  const pill = `<span class="glci-pill glci-pill--${sev}">${sev}</span>`;
  const line =
    typeof f.line === 'number' && Number.isFinite(f.line)
      ? `<span class="glci-line">Line ${f.line}</span>`
      : '';
  const detail = f.detail ? `<p class="glci-row__detail">${escapeHtml(f.detail)}</p>` : '';
  const fix = f.remediation
    ? '<div class="glci-fix">' +
      ICON_FIX +
      '<div><span class="glci-fix__label">Fix</span>' +
      `<p class="glci-fix__text">${remediationHtml(f.remediation)}</p></div></div>`
    : '';
  return (
    `<div class="glci-row glci-row--${sev}">${icon}` +
    '<div class="glci-row__body">' +
    `<div class="glci-row__head">${pill}` +
    `<span class="glci-row__title"><span class="sr-only">${srLabel}</span>${escapeHtml(f.title)}</span>` +
    `${line}</div>${detail}${fix}</div></div>`
  );
}

/** Roll-up counts, falling back to a recount when the engine omitted them. */
function countsOf(result: ValidateResult, findings: Finding[]): ValidateResult['summary'] {
  return (
    result.summary ?? {
      errors: findings.filter((f) => normSeverity(String(f.severity)) === 'error').length,
      warnings: findings.filter((f) => normSeverity(String(f.severity)) === 'warning').length,
      infos: findings.filter((f) => normSeverity(String(f.severity)) === 'info').length,
    }
  );
}

/**
 * The whole results panel for one `validate()` result: the parse-error banner,
 * the success frame, or the findings grouped error → warning → info (input
 * order preserved within a group).
 */
export function resultsHtml(result: ValidateResult): string {
  if (!result || result.ok === false || result.error) {
    return errorHtml(result?.error ?? 'Unknown error while validating the pipeline.');
  }
  const findings = Array.isArray(result.findings) ? result.findings : [];
  if (findings.length === 0) return SUCCESS_HTML;

  const buckets: Record<Severity, Finding[]> = { error: [], warning: [], info: [] };
  for (const f of findings) buckets[normSeverity(String(f.severity))].push(f);

  return SEV_ORDER.filter((sev) => buckets[sev].length > 0)
    .map((sev) => {
      const rows = buckets[sev].map(findingHtml).join('');
      const count = buckets[sev].length;
      return (
        '<div class="glci-group">' +
        `<p class="glci-group__head">${SEV_LABEL[sev]} <span aria-hidden="true">·</span> ${count}</p>` +
        rows +
        '</div>'
      );
    })
    .join('');
}

export type SummaryTone = 'error' | 'mute';
export interface ResultSummary {
  text: string;
  tone: SummaryTone;
}

/** The `role="status"` summary text + tone for one result. */
export function resultSummary(result: ValidateResult): ResultSummary {
  if (!result || result.ok === false || result.error) return { text: 'Parse error', tone: 'error' };
  const findings = Array.isArray(result.findings) ? result.findings : [];
  if (findings.length === 0) return { text: 'No issues', tone: 'mute' };
  const s = countsOf(result, findings);
  return { text: summaryText(s), tone: s.errors > 0 ? 'error' : 'mute' };
}

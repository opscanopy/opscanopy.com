/**
 * Systemd Unit Validator — the pure HTML builders for the findings panel.
 *
 * Shared by BOTH the Astro frontmatter (which server-renders the seeded
 * example so a no-JS visitor — and every AI crawler, which does not execute
 * JS — sees the real line-numbered findings) and the island's <script> (which
 * rebuilds the same markup on every check). One implementation, so the two can
 * never drift apart.
 *
 * Copy payloads: multi-line text round-trips badly through HTML attributes,
 * and `innerHTML` serialization does not re-escape `<` inside attribute values,
 * so every copy button carries an EMPTY `data-copy` (the shared analytics
 * selector) plus a `data-payload="<n>"` index into the `payloads` array
 * `resultHtml` returns, numbered in render order. The client binds the text
 * after `innerHTML`; the server ignores the array.
 *
 * Everything here is pure: no `window`, no `document`, no clock.
 */
import { escapeHtml } from '../escape-html';
import type { Finding, LintResult, Severity } from './types';

/** Markup plus the copy text for each `data-payload` button it contains, by index. */
export interface Rendered {
  html: string;
  payloads: string[];
}

/* DOM cap: the engine caps findings at 20 per rule, but ten capped rules is
   still 200 rows, and rendering those is what freezes a tab — not the engine,
   which is linear. Each group says what it is hiding. */
export const MAX_ROWS_PER_GROUP = 50;

/* ---- Icons (decorative) --------------------------------------------------- */

export const ALERT_SVG =
  '<svg class="su-error__icon" width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 2.5L18.5 17H1.5z"></path><path d="M10 8v4"></path><path d="M10 14.6v.01"></path></svg>';
export const CHECK_SVG =
  '<svg class="su-clean__icon" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9.5"></circle><path d="M7.5 12.5l3 3 6-6.5"></path></svg>';
export const COPY_ICON_SVG =
  '<svg class="su-copy-icon" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="5" width="9" height="9" rx="1.5"/><path d="M3 11H2a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v1"/></svg>';
export const CHECK_ICON_SVG =
  '<svg class="su-check-icon hidden" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 8.5l3.5 3.5L13 4.5"/></svg>';

/** The empty-state paragraph, so the SSR placeholder and `renderEmpty` agree. */
export const EMPTY_HTML =
  '<p class="su-empty body-sm text-mute">Paste a <span class="code-mono">.service</span>, ' +
  '<span class="code-mono">.timer</span> or <span class="code-mono">.socket</span> file above — ' +
  'or tap an example — to see line-numbered findings here, each with the reason it matters and ' +
  'the fix.</p>';

/* ---- Text helpers --------------------------------------------------------- */

export const SEV_ORDER: Severity[] = ['error', 'warning', 'info'];
export const SEV_GROUP: Record<Severity, string> = {
  error: 'Errors',
  warning: 'Warnings',
  info: 'Notes',
};
export const SEV_WORD: Record<Severity, string> = {
  error: 'error',
  warning: 'warning',
  info: 'note',
};

export function normSeverity(value: string): Severity {
  return value === 'error' || value === 'warning' || value === 'info' ? value : 'info';
}

export function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

/** Escape, then render `backticks` as inline code — remediation text only. */
export function remediationHtml(text: string): string {
  return escapeHtml(text).replace(/`([^`]+)`/g, (_m, code: string) => `<code>${code}</code>`);
}

/** One plain-text line per finding: `L12 wrong-section: message — fix: hint`. */
export function rowText(finding: Finding): string {
  const where = typeof finding.line === 'number' ? `L${finding.line} ` : '';
  const fix = finding.remediation ? ` — fix: ${finding.remediation}` : '';
  return `${where}${finding.id}: ${finding.title}${fix}`;
}

/** The plain-text report behind "Copy report" — built for a PR comment. */
export function reportText(result: LintResult, summary: string): string {
  const lines = [`Systemd Unit Validator — ${summary}`, `Scope: ${result.scope}`, ''];
  for (const sev of SEV_ORDER) {
    const group = result.findings.filter((f) => normSeverity(String(f.severity)) === sev);
    if (group.length === 0) continue;
    lines.push(`${SEV_GROUP[sev].toUpperCase()} (${group.length})`);
    for (const finding of group) lines.push(`  ${rowText(finding)}`);
    lines.push('');
  }
  if (result.findings.length === 0) lines.push('No findings.', '');
  for (const rule of result.truncatedRules) {
    lines.push(`Note: ${rule.ruleId} matched ${rule.total} places; ${rule.shown} listed.`);
  }
  if (result.truncated) lines.push('Note: the finding list was capped.');
  lines.push('Checked client-side at opscanopy.com/systemd-unit-validator/ — 0 bytes uploaded.');
  return lines.join('\n');
}

/* ---- Blocks --------------------------------------------------------------- */

function rowHtml(finding: Finding, payloads: string[]): string {
  const sev = normSeverity(String(finding.severity));
  const hasLine = typeof finding.line === 'number' && Number.isFinite(finding.line);
  const jump = hasLine
    ? `<button type="button" class="su-jump" data-su-jump="${escapeHtml(String(finding.line))}" ` +
      `aria-label="Jump to line ${escapeHtml(String(finding.line))} in the editor">Line ${escapeHtml(
        String(finding.line),
      )}</button>`
    : '';
  const directive = finding.directive
    ? `<span class="su-directive">${escapeHtml(finding.directive)}</span>`
    : '';
  const fix = finding.remediation
    ? '<div class="su-fix"><span class="su-fix__label">Fix</span>' +
      `<p class="su-fix__text">${remediationHtml(finding.remediation)}</p></div>`
    : '';
  const idx = payloads.push(rowText(finding)) - 1;
  return (
    `<div class="su-row su-row--${sev}">` +
    '<div class="su-row__body">' +
    '<div class="su-row__head">' +
    `<span class="su-pill su-pill--${sev}">${escapeHtml(SEV_WORD[sev])}</span>` +
    directive +
    jump +
    `<p class="su-row__title">${escapeHtml(finding.title)}</p>` +
    '</div>' +
    `<p class="su-row__detail">${escapeHtml(finding.detail)}</p>` +
    fix +
    '</div>' +
    `<button class="su-copy" type="button" data-payload="${idx}" data-copy="" ` +
    `aria-label="Copy this ${escapeHtml(SEV_WORD[sev])}" title="Copy">` +
    COPY_ICON_SVG +
    CHECK_ICON_SVG +
    '</button></div>'
  );
}

function groupHtml(sev: Severity, findings: Finding[], payloads: string[]): string {
  const shown = findings.slice(0, MAX_ROWS_PER_GROUP);
  const rows = shown.map((finding) => rowHtml(finding, payloads)).join('');
  const cap =
    findings.length > shown.length
      ? `<p class="su-note">Showing the first ${shown.length} of ${findings.length} ` +
        `${SEV_WORD[sev]}s. Fix these and re-run to see the rest.</p>`
      : '';
  return (
    '<div class="su-group">' +
    `<p class="su-group__head"><span>${escapeHtml(SEV_GROUP[sev])}</span>` +
    `<span class="su-group__count">${escapeHtml(String(findings.length))}</span></p>` +
    rows +
    cap +
    '</div>'
  );
}

/** Engine-level caps, stated rather than hidden. */
function truncationHtml(result: LintResult): string {
  const notes: string[] = [];
  for (const rule of result.truncatedRules.slice(0, 6)) {
    notes.push(
      `${escapeHtml(rule.ruleId)} matched ${escapeHtml(String(rule.total))} places; the first ` +
        `${escapeHtml(String(rule.shown))} are listed.`,
    );
  }
  if (result.truncatedRules.length > 6) {
    notes.push(`…and ${escapeHtml(String(result.truncatedRules.length - 6))} more capped rules.`);
  }
  if (result.truncated) {
    notes.push(
      'This file produced more findings than one report can usefully hold, so the list stops here.',
    );
  }
  if (notes.length === 0) return '';
  return `<div class="su-group"><p class="su-group__head"><span>Limits</span></p>${notes
    .map((n) => `<p class="su-note">${n}</p>`)
    .join('')}</div>`;
}

function cleanHtml(result: LintResult, kindWord: string): string {
  return (
    '<div class="su-clean">' +
    CHECK_SVG +
    `<div><p class="su-clean__title">Nothing matched — this ${escapeHtml(kindWord)} looks like it ` +
    'was written on purpose.</p>' +
    `<p class="su-clean__sub">Every rule ran over ${escapeHtml(
      plural(result.stats.directives, 'directive'),
    )} in ${escapeHtml(plural(result.stats.sections, 'section'))} and none of them matched. ` +
    'The reference below lists exactly what was checked — and what this validator deliberately ' +
    'does not check.</p></div></div>'
  );
}

/**
 * A successful check: findings grouped by severity (errors, warnings, notes),
 * or the clean card when nothing matched. `kindWord` is `kindLabel(result.kind)`.
 */
export function resultHtml(result: LintResult, kindWord: string): Rendered {
  const payloads: string[] = [];
  if (result.findings.length === 0) {
    return { html: cleanHtml(result, kindWord), payloads };
  }
  const html =
    SEV_ORDER.map((sev) => {
      const group = result.findings.filter((f) => normSeverity(String(f.severity)) === sev);
      return group.length > 0 ? groupHtml(sev, group, payloads) : '';
    }).join('') + truncationHtml(result);
  return { html, payloads };
}

/** The "cannot read this file" card. No copy buttons, so no payloads. */
export function errorHtml(message: string, isAlert: boolean): string {
  return (
    `<div class="su-error"${isAlert ? ' role="alert"' : ''}>` +
    ALERT_SVG +
    '<div><p class="su-error__title">This is not a unit file this validator can read</p>' +
    `<p id="su-error-detail" class="su-error__detail">${escapeHtml(message)}</p></div></div>`
  );
}

/**
 * Dockerfile Linter — the pure HTML builders for the findings panel.
 *
 * Shared by BOTH the Astro frontmatter (which server-renders the seeded
 * kitchen-sink example so a no-JS visitor — and every AI crawler, which does
 * not execute JS — sees fifteen real, line-numbered findings) and the island's
 * <script> (which rebuilds the same markup on every lint). One implementation,
 * so the two can never drift apart.
 *
 * `lint()` is pure and synchronous, so the whole result is safe to bake at
 * build time. The per-row copy payloads are NOT written into attributes here
 * (multi-line, quote-bearing text round-trips badly through HTML); the island
 * assigns them on the live elements after innerHTML via `rowText()`.
 *
 * Everything here is pure: no `window`, no `document`, no clock.
 */
import { escapeHtml } from '../escape-html';
import type { Finding, LintResult, Severity } from './types';

/* DOM cap: a 4,000-line Dockerfile can legitimately produce a hundred findings
   per severity, and rendering all of them is what freezes the tab — not the
   engine, which is linear. Each group says what it is hiding. */
export const MAX_ROWS_PER_GROUP = 50;

/* ---- Icons (decorative) ------------------------------------------------- */

export const ALERT_SVG =
  '<svg class="df-error__icon" width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 2.5L18.5 17H1.5z"></path><path d="M10 8v4"></path><path d="M10 14.6v.01"></path></svg>';
export const CHECK_SVG =
  '<svg class="df-clean__icon" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9.5"></circle><path d="M7.5 12.5l3 3 6-6.5"></path></svg>';
export const COPY_ICON_SVG =
  '<svg class="df-copy-icon" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="5" width="9" height="9" rx="1.5"/><path d="M3 11H2a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v1"/></svg>';
export const CHECK_ICON_SVG =
  '<svg class="df-check-icon hidden" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 8.5l3.5 3.5L13 4.5"/></svg>';

/** The empty-state paragraph, so the SSR placeholder and `renderEmpty` agree. */
export const EMPTY_HTML =
  '<p class="df-empty body-sm text-mute">Paste a Dockerfile above — or tap an example — to ' +
  'see line-numbered findings here, each with the reason it matters and the fix.</p>';

/* ---- Pure render helpers ------------------------------------------------ */

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

/** Rule id → the page catalog anchor, e.g. `DF007` → `#rule-df007`. */
export function ruleAnchor(id: string): string {
  return `#rule-${id.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
}

/** Escape, then render `backticks` as inline code — remediation text only. */
export function remediationHtml(text: string): string {
  return escapeHtml(text).replace(/`([^`]+)`/g, (_m, code: string) => `<code>${code}</code>`);
}

/** One plain-text line per finding: `L12 DF007: message — fix: hint`. */
export function rowText(finding: Finding): string {
  const where = typeof finding.line === 'number' ? `L${finding.line} ` : '';
  const fix = finding.remediation ? ` — fix: ${finding.remediation}` : '';
  return `${where}${finding.id}: ${finding.title}${fix}`;
}

export function rowHtml(finding: Finding, index: number): string {
  const sev = normSeverity(String(finding.severity));
  const hasLine = typeof finding.line === 'number' && Number.isFinite(finding.line);
  const jump = hasLine
    ? `<button type="button" class="df-jump" data-df-jump="${escapeHtml(String(finding.line))}" ` +
      `aria-label="Jump to line ${escapeHtml(String(finding.line))} in the editor">Line ${escapeHtml(
        String(finding.line),
      )}</button>`
    : '';
  const rule =
    `<a class="df-rule" href="${escapeHtml(ruleAnchor(finding.id))}" ` +
    `aria-label="${escapeHtml(finding.id)} reference">${escapeHtml(finding.id)}</a>`;
  const fix = finding.remediation
    ? '<div class="df-fix"><span class="df-fix__label">Fix</span>' +
      `<p class="df-fix__text">${remediationHtml(finding.remediation)}</p></div>`
    : '';
  return (
    `<div class="df-row df-row--${sev}">` +
    '<div class="df-row__body">' +
    '<div class="df-row__head">' +
    `<span class="df-pill df-pill--${sev}">${escapeHtml(SEV_WORD[sev])}</span>` +
    rule +
    jump +
    `<p class="df-row__title">${escapeHtml(finding.title)}</p>` +
    '</div>' +
    `<p class="df-row__detail">${escapeHtml(finding.detail)}</p>` +
    fix +
    '</div>' +
    `<button class="df-copy" type="button" data-df-row="${escapeHtml(String(index))}" data-copy="" ` +
    `aria-label="Copy this ${escapeHtml(SEV_WORD[sev])}" title="Copy">` +
    COPY_ICON_SVG +
    CHECK_ICON_SVG +
    '</button></div>'
  );
}

export function groupHtml(sev: Severity, findings: { finding: Finding; index: number }[]): string {
  const shown = findings.slice(0, MAX_ROWS_PER_GROUP);
  const rows = shown.map(({ finding, index }) => rowHtml(finding, index)).join('');
  const cap =
    findings.length > shown.length
      ? `<p class="df-note">Showing the first ${shown.length} of ${findings.length} ` +
        `${SEV_WORD[sev]}s. Fix these and re-run to see the rest.</p>`
      : '';
  return (
    '<div class="df-group">' +
    `<p class="df-group__head"><span>${escapeHtml(SEV_GROUP[sev])}</span>` +
    `<span class="df-group__count">${escapeHtml(String(findings.length))}</span></p>` +
    rows +
    cap +
    '</div>'
  );
}

/** Engine-level caps, stated rather than hidden. */
export function truncationHtml(result: LintResult): string {
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
      'This Dockerfile produced more findings than one report can usefully hold, so the list stops here.',
    );
  }
  if (notes.length === 0) return '';
  return `<div class="df-group"><p class="df-group__head"><span>Limits</span></p>${notes
    .map((n) => `<p class="df-note">${n}</p>`)
    .join('')}</div>`;
}

export function cleanHtml(result: LintResult): string {
  return (
    '<div class="df-clean">' +
    CHECK_SVG +
    '<div><p class="df-clean__title">No findings — nice Dockerfile.</p>' +
    `<p class="df-clean__sub">All 17 rules ran over ${escapeHtml(
      plural(result.stats.instructions, 'instruction'),
    )} in ${escapeHtml(plural(result.stats.stages, 'stage'))} and none of them matched. ` +
    'The rule catalog below lists exactly what was checked — and what this linter deliberately ' +
    'does not check.</p></div></div>'
  );
}

export function errorCardHtml(message: string, isAlert: boolean): string {
  return (
    `<div class="df-error"${isAlert ? ' role="alert"' : ''}>` +
    ALERT_SVG +
    '<div><p class="df-error__title">This is not a Dockerfile this linter can read</p>' +
    `<p id="df-error-detail" class="df-error__detail">${escapeHtml(message)}</p></div></div>`
  );
}

/**
 * The findings panel for one successful (`ok: true`) lint: the clean frame, or
 * the severity groups (error → warning → note) followed by any engine-cap
 * notes. Row indices are positions in `result.findings`, which is what the
 * island's per-row copy binding reads back.
 */
export function resultHtml(result: LintResult): string {
  const indexed = result.findings.map((finding, index) => ({ finding, index }));
  const groups = SEV_ORDER.map((sev) =>
    indexed.filter(({ finding }) => normSeverity(String(finding.severity)) === sev),
  );
  return result.findings.length === 0
    ? cleanHtml(result)
    : groups.map((group, i) => (group.length > 0 ? groupHtml(SEV_ORDER[i], group) : '')).join('') +
        truncationHtml(result);
}

/** The plain-text report behind "Copy report" — built for a PR comment. */
export function reportText(result: LintResult, summary: string): string {
  const lines = [`Dockerfile Linter — ${summary}`, ''];
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
  lines.push('Checked client-side at opscanopy.com/dockerfile-linter/ — 0 bytes uploaded.');
  return lines.join('\n');
}

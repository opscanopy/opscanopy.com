/**
 * Grafana Dashboard Validator — the pure HTML builders for the findings panel.
 *
 * Shared by BOTH the Astro frontmatter (which server-renders the seeded
 * kitchen-sink example so a no-JS visitor — and every AI crawler, which does
 * not execute JS — sees real findings with their JSON paths and fixes) and the
 * island's <script> (which rebuilds the same markup on every lint). One
 * implementation, so the two can never drift apart.
 *
 * `lintDashboard()` reads a clock in exactly one rule (`time-range-absurd`), so
 * the frontmatter pins `now` when it builds the seed. Nothing here reads one.
 *
 * Per-row copy payloads are NOT written into attributes: multi-line,
 * quote-bearing text round-trips badly through HTML, so the island assigns
 * `dataset.copy` from `rowText()` on the live buttons after `innerHTML`, and
 * the server simply leaves them empty.
 *
 * Everything here is pure: no `window`, no `document`, no clock.
 */
import { escapeHtml } from '../escape-html';
import type { Diagnostic, LintResult, Severity } from './types';

/* DOM cap. The engine already caps itself at 50 diagnostics per rule and 400 in
   total; this caps what is RENDERED per severity group, because a 400-row panel
   is what freezes the tab. Each group states what it is hiding. */
export const MAX_ROWS_PER_GROUP = 50;
/* Parser notes are bounded too — a hostile file can produce one per panel. */
export const MAX_PARSE_NOTES = 8;

/* ---- Icons (decorative) ------------------------------------------------- */

export const ALERT_SVG =
  '<svg class="gd-error__icon" width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 2.5L18.5 17H1.5z"></path><path d="M10 8v4"></path><path d="M10 14.6v.01"></path></svg>';
export const CHECK_SVG =
  '<svg class="gd-clean__icon" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9.5"></circle><path d="M7.5 12.5l3 3 6-6.5"></path></svg>';
export const COPY_ICON_SVG =
  '<svg class="gd-copy-icon" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="5" width="9" height="9" rx="1.5"/><path d="M3 11H2a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v1"/></svg>';
export const CHECK_ICON_SVG =
  '<svg class="gd-check-icon hidden" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 8.5l3.5 3.5L13 4.5"/></svg>';

/** The empty-state paragraph, so the SSR placeholder and `renderEmpty` agree. */
export const EMPTY_HTML =
  '<p class="gd-empty body-sm text-mute">Paste a Grafana dashboard JSON above — or tap an ' +
  'example — to see every finding here, with the JSON path it lives at and the fix.</p>';

/* ---- Severity vocabulary ------------------------------------------------ */

export const SEV_ORDER: readonly Severity[] = ['error', 'warning', 'info'];
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

/** Rule id → its subsection anchor in the page catalog (`#rule-no-uid`). */
export function ruleAnchor(id: string): string {
  return `#rule-${id.toLowerCase().replace(/[^a-z0-9-]/g, '')}`;
}

/* ---- Text builders ------------------------------------------------------ */

/** One plain-text line per finding, shaped for a pull-request comment. */
export function rowText(diagnostic: Diagnostic): string {
  const sev = normSeverity(String(diagnostic.severity));
  const where = diagnostic.path ? ` (${diagnostic.path})` : '';
  const fix = diagnostic.hint ? ` — fix: ${diagnostic.hint}` : '';
  return `${SEV_WORD[sev]} ${diagnostic.id}${where}: ${diagnostic.message}${fix}`;
}

/** The plain-text report behind "Copy report" — built for a review comment. */
export function reportText(result: LintResult, summary: string): string {
  const lines = [`Grafana Dashboard Validator — ${summary}`, `Rules: ${result.rulesVersion}`, ''];
  if (result.parseNotes.length > 0) {
    lines.push('READ AS');
    for (const note of result.parseNotes) lines.push(`  ${note}`);
    lines.push('');
  }
  for (const sev of SEV_ORDER) {
    const group = result.diagnostics.filter((d) => normSeverity(String(d.severity)) === sev);
    if (group.length === 0) continue;
    lines.push(`${SEV_GROUP[sev].toUpperCase()} (${group.length})`);
    for (const diagnostic of group) lines.push(`  ${rowText(diagnostic)}`);
    lines.push('');
  }
  if (result.diagnostics.length === 0) lines.push('No findings.', '');
  for (const rule of result.truncatedRules) {
    lines.push(`Note: ${rule.ruleId} matched ${rule.total} places; ${rule.shown} listed.`);
  }
  if (result.truncated) lines.push('Note: the finding list was capped.');
  lines.push('Checked client-side at opscanopy.com/grafana-dashboard-validator/ — 0 bytes uploaded.');
  return lines.join('\n');
}

/* ---- HTML builders ------------------------------------------------------ */

/** One finding row. `index` is its position in `result.diagnostics`, for the copy button. */
export function rowHtml(diagnostic: Diagnostic, index: number): string {
  const sev = normSeverity(String(diagnostic.severity));
  const rule =
    `<a class="gd-rule" href="${escapeHtml(ruleAnchor(diagnostic.id))}" ` +
    `aria-label="${escapeHtml(diagnostic.id)} rule reference">${escapeHtml(diagnostic.id)}</a>`;
  const path = diagnostic.path ? `<span class="gd-path">${escapeHtml(diagnostic.path)}</span>` : '';
  const fix = diagnostic.hint
    ? '<div class="gd-fix"><span class="gd-fix__label">Fix</span>' +
      `<p class="gd-fix__text">${escapeHtml(diagnostic.hint)}</p></div>`
    : '';
  return (
    `<div class="gd-row gd-row--${sev}">` +
    '<div class="gd-row__body">' +
    '<div class="gd-row__head">' +
    `<span class="gd-pill gd-pill--${sev}">${escapeHtml(SEV_WORD[sev])}</span>` +
    rule +
    path +
    `<p class="gd-row__title">${escapeHtml(diagnostic.message)}</p>` +
    '</div>' +
    fix +
    '</div>' +
    `<button class="gd-copy" type="button" data-gd-row="${escapeHtml(String(index))}" data-copy="" ` +
    `aria-label="Copy this ${escapeHtml(SEV_WORD[sev])}" title="Copy">` +
    COPY_ICON_SVG +
    CHECK_ICON_SVG +
    '</button></div>'
  );
}

export function groupHtml(sev: Severity, rows: { diagnostic: Diagnostic; index: number }[]): string {
  const shown = rows.slice(0, MAX_ROWS_PER_GROUP);
  const body = shown.map(({ diagnostic, index }) => rowHtml(diagnostic, index)).join('');
  const cap =
    rows.length > shown.length
      ? `<p class="gd-note">Showing the first ${shown.length} of ${rows.length} ` +
        `${SEV_WORD[sev]}s. Fix these and re-run to see the rest.</p>`
      : '';
  return (
    '<div class="gd-group">' +
    `<p class="gd-group__head"><span>${escapeHtml(SEV_GROUP[sev])}</span>` +
    `<span class="gd-group__count">${escapeHtml(String(rows.length))}</span></p>` +
    body +
    cap +
    '</div>'
  );
}

/** What the parser had to tolerate. Never hidden: Grafana is not this lenient. */
export function parseNotesHtml(result: LintResult): string {
  if (result.parseNotes.length === 0) return '';
  const shown = result.parseNotes.slice(0, MAX_PARSE_NOTES);
  const notes = shown.map((note) => `<p class="gd-note">${escapeHtml(note)}</p>`);
  if (result.parseNotes.length > shown.length) {
    notes.push(
      `<p class="gd-note">…and ${escapeHtml(String(result.parseNotes.length - shown.length))} more parser notes.</p>`,
    );
  }
  return '<div class="gd-group"><p class="gd-group__head"><span>Read as</span></p>' + notes.join('') + '</div>';
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
      'This dashboard produced more findings than one report can usefully hold, so the list stops here.',
    );
  }
  if (notes.length === 0) return '';
  return `<div class="gd-group"><p class="gd-group__head"><span>Limits</span></p>${notes
    .map((n) => `<p class="gd-note">${n}</p>`)
    .join('')}</div>`;
}

export function cleanHtml(result: LintResult, ruleCount: number): string {
  const scope =
    result.stats.rows > 0
      ? `${plural(result.stats.panels, 'panel')} in ${plural(result.stats.rows, 'row')}`
      : plural(result.stats.panels, 'panel');
  return (
    '<div class="gd-clean">' +
    CHECK_SVG +
    '<div><p class="gd-clean__title">No findings — this dashboard imports cleanly.</p>' +
    `<p class="gd-clean__sub">All ${escapeHtml(String(ruleCount))} rules ran over ${escapeHtml(scope)} ` +
    'and none of them matched. The rule catalog below lists exactly what was checked — and ' +
    'what this linter deliberately does not check.</p></div></div>'
  );
}

export function errorCardHtml(message: string, isAlert: boolean): string {
  return (
    `<div class="gd-error"${isAlert ? ' role="alert"' : ''}>` +
    ALERT_SVG +
    '<div><p class="gd-error__title">This is not a dashboard this linter can read</p>' +
    `<p id="gd-error-detail" class="gd-error__detail">${escapeHtml(message)}</p></div></div>`
  );
}

export interface ResultRenderOptions {
  /** `RULE_IDS.length` — quoted by the clean card. */
  ruleCount: number;
}

/** The whole findings panel for an `ok: true` result: parser notes, groups (or the clean card), limits. */
export function resultHtml(result: LintResult, opts: ResultRenderOptions): string {
  const indexed = result.diagnostics.map((diagnostic, index) => ({ diagnostic, index }));
  const groups = SEV_ORDER.map((sev) =>
    indexed.filter(({ diagnostic }) => normSeverity(String(diagnostic.severity)) === sev),
  );
  const body =
    result.diagnostics.length === 0
      ? cleanHtml(result, opts.ruleCount)
      : groups.map((group, i) => (group.length > 0 ? groupHtml(SEV_ORDER[i], group) : '')).join('');
  return parseNotesHtml(result) + body + truncationHtml(result);
}

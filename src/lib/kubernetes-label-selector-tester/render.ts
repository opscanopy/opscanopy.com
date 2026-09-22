/**
 * Kubernetes Label Selector Tester — the pure HTML builders for the verdicts
 * panel and the "Reads as …" canonical line.
 *
 * Shared by BOTH the Astro frontmatter (which server-renders the seeded
 * example so a no-JS visitor — and every AI crawler, which does not execute
 * JS — sees one real MATCH / NO MATCH card per resource with the clause that
 * decided it) and the island's <script> (which rebuilds the same markup on
 * every run). One implementation, so the two can never drift apart.
 *
 * Copy payloads live in the returned `payloads` array, not in `data-copy`
 * attributes, for two reasons: multi-line text round-trips badly through an
 * attribute, and — the one that matters for security review — `innerHTML`
 * serialization does not re-escape `<` inside an attribute value, so a
 * correctly-escaped payload in an attribute still shows up as literal markup
 * in the serialized HTML. Each copy button carries an EMPTY `data-copy` (the
 * shared analytics selector) plus `data-payload="<n>"`, its index into the
 * array, numbered in render order. Nothing user-supplied enters an attribute.
 *
 * Everything here is pure: no `window`, no `document`, no clock.
 */
import { escapeHtml } from '../escape-html';
import type { ClauseTrace, Diagnostic, ResourceVerdict, SelectorTestResult } from './types';

/** Markup plus the copy text for each `data-payload` button it contains, by index. */
export interface Rendered {
  html: string;
  payloads: string[];
}

/* DOM caps. The engine is linear and already caps at 500 resources; rendering
   500 cards × 100 clauses is what freezes the tab. Every cap states itself. */
export const MAX_CARDS = 60;
export const MAX_CLAUSES_PER_CARD = 24;
export const MAX_LABEL_CHIPS = 14;
export const MAX_ISSUES_PER_CARD = 4;
export const MAX_DIAG_ROWS = 20;

/* ---- Icons (decorative) --------------------------------------------------- */

export const ALERT_SVG =
  '<svg class="klt-error__icon" width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 2.5L18.5 17H1.5z"></path><path d="M10 8v4"></path><path d="M10 14.6v.01"></path></svg>';
export const COPY_ICON_SVG =
  '<svg class="klt-copy-icon" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="5" width="9" height="9" rx="1.5"/><path d="M3 11H2a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v1"/></svg>';
export const CHECK_ICON_SVG =
  '<svg class="klt-check-icon hidden" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 8.5l3.5 3.5L13 4.5"/></svg>';

/** The empty-state paragraph, so the SSR placeholder and `renderEmpty` agree. */
export const EMPTY_HTML =
  '<p class="klt-empty body-sm text-mute">Paste the resources above — or tap an example — to ' +
  'see, per resource, whether the selector matches it and which clause decided.</p>';

/* ---- Text helpers --------------------------------------------------------- */

export function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

/**
 * The label set as it should be SHOWN: the readable string labels, plus every
 * key whose YAML value was not a string. The second group is flagged, never
 * dropped — dropping it made the card claim the key was absent.
 */
export function labelEntries(
  verdict: ResourceVerdict,
): { key: string; text: string; unreadable: boolean }[] {
  return [
    ...Object.entries(verdict.labels).map(([key, value]) => ({
      key,
      text: value === '' ? '""' : value,
      unreadable: false,
    })),
    ...Object.entries(verdict.unreadableLabels ?? {}).map(([key, kind]) => ({
      key,
      text: `(${kind}, not a string)`,
      unreadable: true,
    })),
  ];
}

/** `app=web, tier=frontend` — the label set as plain text. */
export function labelsText(verdict: ResourceVerdict): string {
  const entries = labelEntries(verdict);
  if (entries.length === 0) return '(no labels)';
  return entries.map((entry) => `${entry.key}=${entry.text}`).join(', ');
}

/** One resource's whole verdict as plain text, fit for a PR comment. */
export function verdictText(verdict: ResourceVerdict): string {
  const lines = [
    `${verdict.matches ? 'MATCH' : 'NO MATCH'} — ${verdict.kind}/${verdict.name}${
      verdict.namespace ? ` (namespace ${verdict.namespace})` : ''
    }`,
    `  ${verdict.labelsPath}: ${labelsText(verdict)}`,
  ];
  for (const clause of verdict.clauses) {
    lines.push(`  [${clause.holds ? 'ok' : 'no'}] ${clause.requirement.display} — ${clause.reason}`);
  }
  for (const issue of verdict.labelIssues) lines.push(`  ! ${issue.message}`);
  if (verdict.clauses.length === 0) {
    lines.push('  (empty selector — every resource matches)');
  }
  return lines.join('\n');
}

export const DIAG_WORD: Record<Diagnostic['severity'], string> = {
  error: 'error',
  warning: 'warning',
  note: 'note',
};

/** The plain-text report behind "Copy report". */
export function reportText(result: SelectorTestResult, selectorText: string): string {
  const lines = [
    `Kubernetes Label Selector Tester — ${result.summary}`,
    `selector: ${result.empty ? '(empty — matches everything)' : result.canonical}`,
    `as written: ${selectorText.trim().length === 0 ? '(empty)' : selectorText.trim()}`,
    '',
  ];
  for (const verdict of result.verdicts) {
    lines.push(verdictText(verdict), '');
  }
  // No truncation line here: `resourceCount` counts VERDICT ROWS (a Deployment
  // yields two) while `totalResources` counts DOCUMENTS, so mixing them read
  // "only the first 1000 resources were evaluated; 600 were found". The
  // engine's own warning — in documents, and correct — is printed below.
  for (const diagnostic of result.diagnostics) {
    lines.push(`${DIAG_WORD[diagnostic.severity]}: ${diagnostic.message}`);
  }
  lines.push(
    '',
    'Checked client-side at opscanopy.com/kubernetes-label-selector-tester/ — 0 bytes uploaded.',
  );
  return lines.join('\n');
}

/**
 * The "Reads as …" caption under the selector field. Empty for a failed run;
 * plain text for the empty selector; otherwise the canonical `-l` form and the
 * clause count. Injected with innerHTML / set:html.
 */
export function canonicalHtml(result: SelectorTestResult): string {
  if (!result.ok) return '';
  if (result.empty) return 'Empty selector — it matches every resource.';
  return (
    `Reads as <span class="code-mono">${escapeHtml(result.canonical)}</span> · ` +
    escapeHtml(plural(result.requirements.length, 'clause')) +
    ', ANDed.'
  );
}

/* ---- Blocks --------------------------------------------------------------- */

function labelsHtml(verdict: ResourceVerdict): string {
  // Unreadable keys are listed too: they ARE in the document, and a card that
  // showed "no labels at all" for a pod with `released: 2024-06-01` would be
  // making the same false claim the clause reasons no longer make.
  const entries = labelEntries(verdict);
  const shown = entries.slice(0, MAX_LABEL_CHIPS);
  const chips = shown
    .map(
      (entry) =>
        `<span class="klt-label${entry.unreadable ? ' klt-label--unreadable' : ''}">${escapeHtml(
          entry.key,
        )}=${escapeHtml(entry.text)}</span>`,
    )
    .join('');
  const more =
    entries.length > shown.length
      ? `<span class="klt-label klt-label--none">+${escapeHtml(
          String(entries.length - shown.length),
        )} more</span>`
      : '';
  const none =
    entries.length === 0 ? '<span class="klt-label klt-label--none">no labels at all</span>' : '';
  return (
    '<div class="klt-labels">' +
    chips +
    more +
    none +
    `<span class="klt-path">${escapeHtml(verdict.labelsPath)}</span>` +
    '</div>'
  );
}

function clauseHtml(clause: ClauseTrace): string {
  const state = clause.holds ? 'hold' : 'fail';
  const annotation = clause.absentKeyMatch
    ? '<span class="klt-annot">Matches <em>because</em> the key is absent. ' +
      'NotIn and != are satisfied by a resource that carries no such label at all — the one ' +
      'label-selector rule that is most often answered backwards.</span>'
    : clause.undecided
      ? '<span class="klt-annot">Not decided — the key <em>is</em> in the document, but YAML ' +
        'did not read its value as a string, so there is nothing to compare. This is not an ' +
        'absent key: kubectl apply would reject the manifest outright.</span>'
      : '';
  return (
    `<li class="klt-clause klt-clause--${state}">` +
    `<span class="klt-clause__mark" aria-hidden="true">${clause.holds ? '✓' : '✗'}</span>` +
    '<span class="klt-clause__body">' +
    `<span class="sr-only">${
      clause.undecided ? 'Not decided: ' : clause.holds ? 'Holds: ' : 'Fails: '
    }</span>` +
    `<span class="klt-req">${escapeHtml(clause.requirement.display)}</span>` +
    `<span class="klt-reason">${escapeHtml(clause.reason)}</span>` +
    annotation +
    '</span></li>'
  );
}

function cardHtml(verdict: ResourceVerdict, payloads: string[]): string {
  const shown = verdict.clauses.slice(0, MAX_CLAUSES_PER_CARD);
  const clauses = shown.map(clauseHtml).join('');
  const clauseCap =
    verdict.clauses.length > shown.length
      ? `<p class="klt-note">Showing the first ${escapeHtml(
          String(shown.length),
        )} of ${escapeHtml(String(verdict.clauses.length))} clauses on this resource.</p>`
      : '';
  const empty =
    verdict.clauses.length === 0
      ? '<p class="klt-note">The selector has no clauses, so it matches this resource — and every other one.</p>'
      : '';
  const issuesShown = verdict.labelIssues.slice(0, MAX_ISSUES_PER_CARD);
  const issues =
    issuesShown.map((issue) => `<p class="klt-issue">${escapeHtml(issue.message)}</p>`).join('') +
    (verdict.labelIssues.length > issuesShown.length
      ? `<p class="klt-issue">…and ${escapeHtml(
          String(verdict.labelIssues.length - issuesShown.length),
        )} more label problems on this resource.</p>`
      : '');
  const name =
    escapeHtml(`${verdict.kind}/${verdict.name}`) +
    (verdict.namespace ? ` <span class="klt-ns">· ${escapeHtml(verdict.namespace)}</span>` : '');
  const idx = payloads.push(verdictText(verdict)) - 1;
  return (
    '<div class="klt-card">' +
    '<div class="klt-card__head">' +
    `<span class="klt-verdict klt-verdict--${verdict.matches ? 'match' : 'miss'}">${
      verdict.matches ? 'match' : 'no match'
    }</span>` +
    `<span class="klt-name">${name}</span>` +
    '<span class="klt-card__actions">' +
    // The accessible name is a STATIC sr-only span, not an aria-label built
    // from the resource name — nothing user-supplied may enter an attribute
    // inside this container (see the module header). Text nodes are safe;
    // attributes are not.
    `<button class="klt-copy" type="button" data-payload="${idx}" data-copy="" ` +
    'data-copy-label="Copy this verdict" title="Copy">' +
    COPY_ICON_SVG +
    CHECK_ICON_SVG +
    '<span class="sr-only klt-copy-label">Copy this verdict</span>' +
    '</button></span>' +
    '</div>' +
    labelsHtml(verdict) +
    (clauses ? `<ul class="klt-clauses">${clauses}</ul>` : '') +
    clauseCap +
    empty +
    issues +
    '</div>'
  );
}

/** The non-blocking diagnostics block ("What the tester noticed"). '' when there are none. */
export function diagnosticsHtml(diagnostics: Diagnostic[]): string {
  if (diagnostics.length === 0) return '';
  const shown = diagnostics.slice(0, MAX_DIAG_ROWS);
  const rows = shown
    .map(
      (diagnostic) =>
        '<div class="klt-diag">' +
        `<span class="klt-diag__pill klt-diag__pill--${diagnostic.severity}">${escapeHtml(
          DIAG_WORD[diagnostic.severity],
        )}</span>` +
        `<p class="klt-diag__text">${escapeHtml(diagnostic.message)}</p></div>`,
    )
    .join('');
  const cap =
    diagnostics.length > shown.length
      ? `<p class="klt-note">…and ${escapeHtml(
          String(diagnostics.length - shown.length),
        )} more diagnostics.</p>`
      : '';
  return `<div class="klt-card"><p class="klt-group__head"><span>What the tester noticed</span></p>${rows}${cap}</div>`;
}

/** A successful run: diagnostics first, then one card per verdict (capped at MAX_CARDS). */
export function resultHtml(result: SelectorTestResult): Rendered {
  const payloads: string[] = [];
  const shown = result.verdicts.slice(0, MAX_CARDS);
  const cards = shown.map((verdict) => cardHtml(verdict, payloads)).join('');
  const cardCap =
    result.verdicts.length > shown.length
      ? `<div class="klt-card"><p class="klt-note">Showing the first ${escapeHtml(
          String(shown.length),
        )} of ${escapeHtml(String(result.verdicts.length))} resources. ${escapeHtml(
          String(result.matchCount),
        )} of them match in total — trim the paste to read the rest.</p></div>`
      : '';
  return { html: diagnosticsHtml(result.diagnostics) + cards + cardCap, payloads };
}

/** The blocking-error card for the field at fault, then any remaining diagnostics. */
export function errorHtml(first: Diagnostic, isAlert: boolean, rest: Diagnostic[] = []): string {
  const title =
    first.where === 'selector'
      ? 'This selector could not be read'
      : 'These resources could not be read';
  return (
    `<div class="klt-error"${isAlert ? ' role="alert"' : ''}>` +
    ALERT_SVG +
    `<div><p class="klt-error__title">${escapeHtml(title)}</p>` +
    `<p id="klt-error-detail" class="klt-error__detail">${escapeHtml(first.message)}</p></div></div>` +
    diagnosticsHtml(rest)
  );
}

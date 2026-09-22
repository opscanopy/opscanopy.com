/**
 * Prometheus Relabel Tester — the pure HTML builders for the results panel.
 *
 * Shared by BOTH the Astro frontmatter (which server-renders the seeded
 * example so a no-JS visitor — and every AI crawler, which does not execute
 * JS — sees which label sets are kept, changed or dropped) and the island's
 * <script> (which rebuilds the same markup on every run). One implementation,
 * so the two can never drift apart.
 *
 * `applyRelabel()` is pure and synchronous — `hashmod` is a deterministic MD5,
 * there is no clock and no randomness — so the whole result is safe to bake at
 * build time. Everything here is pure: no `window`, no `document`.
 */
import { escapeHtml } from '../escape-html';
import type { ChangeKind, LabelChange, LabelPair, RelabelResult, TargetResult } from './types';

export const ICON_ALERT =
  '<svg class="prt-banner__icon" width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 2.5L18.5 17H1.5z"></path><path d="M10 8v4"></path><path d="M10 14.6v.01"></path></svg>';
export const ICON_WARN =
  '<svg class="prt-warning__icon" width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 2.5L18.5 17H1.5z"></path><path d="M10 8v4"></path><path d="M10 14.6v.01"></path></svg>';

/** The empty-state paragraph, so the SSR placeholder and `renderEmpty` agree. */
export const EMPTY_HTML =
  '<p class="prt-empty body-sm text-mute">Load an example or paste relabel rules and label sets, then run to see which labels survive, change, or get dropped.</p>';

export const LOADING_HTML =
  '<div class="prt-loading"><span class="prt-loading__dot"></span>' +
  '<span class="prt-loading__dot"></span><span class="prt-loading__dot"></span>' +
  '<span>Applying rules…</span></div>';

export function errorHtml(message: string): string {
  return (
    '<div class="prt-banner" role="alert">' +
    ICON_ALERT +
    '<div><p class="prt-banner__title">Could not apply relabel rules</p>' +
    `<p class="prt-banner__detail">${escapeHtml(message)}</p></div></div>`
  );
}

function labelRowHtml(p: LabelPair, tag: '' | 'added' | 'changed'): string {
  const tagHtml = tag === '' ? '' : `<span class="prt-tag prt-tag--${tag}">${tag}</span>`;
  return (
    '<div class="prt-label">' +
    `<span class="prt-label__name">${escapeHtml(p.name)}</span>` +
    '<span class="prt-label__eq">=</span>' +
    `<span class="prt-label__value">"${escapeHtml(p.value)}"</span>${tagHtml}</div>`
  );
}

/** Build a name → change-kind map (added / changed) for output labels. */
function changeIndex(changes: LabelChange[]): Map<string, ChangeKind> {
  const m = new Map<string, ChangeKind>();
  for (const c of changes) m.set(c.name, c.kind);
  return m;
}

/** One card per input label set: its input, then its output (or the drop note). */
export function resultCardHtml(r: TargetResult): string {
  const statusPill = r.dropped
    ? '<span class="prt-pill prt-pill--dropped">Dropped</span>'
    : '<span class="prt-pill prt-pill--kept">Kept</span>';

  const head =
    '<div class="prt-card__head">' +
    `<span class="prt-card__title">Set ${r.index}</span>${statusPill}</div>`;

  const inputRows = r.input.length
    ? r.input.map((p) => labelRowHtml(p, '')).join('')
    : '<p class="prt-empty-labels">(no labels)</p>';
  const inputSection =
    '<div class="prt-section"><p class="prt-section-label">Input</p>' +
    `<div class="prt-labels">${inputRows}</div></div>`;

  let resultSection: string;
  if (r.dropped) {
    const by =
      r.droppedByAction && r.droppedByRule
        ? ` by rule ${r.droppedByRule} (<code>${escapeHtml(r.droppedByAction)}</code>)`
        : '';
    resultSection =
      '<div class="prt-section"><p class="prt-section-label">Result</p>' +
      `<p class="prt-drop-note">Target dropped${by} — this series would not be scraped or stored.</p></div>`;
  } else {
    const ci = changeIndex(r.changes);
    const outRows = r.output.length
      ? r.output
          .map((p) => {
            const kind = ci.get(p.name);
            const tag = kind === 'added' ? 'added' : kind === 'changed' ? 'changed' : '';
            return labelRowHtml(p, tag);
          })
          .join('')
      : '<p class="prt-empty-labels">(no labels remain)</p>';

    const removed = r.changes.filter((c) => c.kind === 'removed');
    const removedHtml = removed.length
      ? '<div class="prt-section"><p class="prt-section-label">Removed</p><div class="prt-labels">' +
        removed
          .map((c) => `<div class="prt-removed">${escapeHtml(c.name)}="${escapeHtml(c.before ?? '')}"</div>`)
          .join('') +
        '</div></div>'
      : '';

    resultSection =
      '<div class="prt-section"><p class="prt-section-label">Output</p>' +
      `<div class="prt-labels">${outRows}</div></div>${removedHtml}`;
  }

  const dropClass = r.dropped ? ' prt-card--dropped' : '';
  return (
    `<div class="prt-card${dropClass}">${head}` +
    `<div class="prt-card__body">${inputSection}${resultSection}</div></div>`
  );
}

export function warningsHtml(warnings: string[]): string {
  if (!warnings.length) return '';
  return (
    '<div class="prt-warnings">' +
    warnings.map((w) => `<div class="prt-warning">${ICON_WARN}<span>${escapeHtml(w)}</span></div>`).join('') +
    '</div>'
  );
}

/** The status-line text beside "Results": "1 kept · 1 dropped · 2 sets". */
export function summaryText(results: TargetResult[]): string {
  const total = results.length;
  const dropped = results.filter((r) => r.dropped).length;
  const kept = total - dropped;
  const parts: string[] = [];
  parts.push(`${kept} kept`);
  if (dropped > 0) parts.push(`${dropped} dropped`);
  parts.push(`${total} ${total === 1 ? 'set' : 'sets'}`);
  return parts.join(' · ');
}

/** True when every label set was dropped — the status line turns red. */
export function allDropped(results: TargetResult[]): boolean {
  return results.length > 0 && results.every((r) => r.dropped);
}

/**
 * The whole results panel: one card per label set, then any warnings. A
 * failed run (bad YAML, empty input) or an empty result set becomes the error
 * banner — so the frontmatter and the client render the same thing for every
 * shape the engine can return.
 */
export function resultsHtml(result: RelabelResult): string {
  if (!result || result.ok === false || result.error) {
    return errorHtml(result?.error ?? 'Unknown error while applying relabel rules.');
  }
  const results = Array.isArray(result.results) ? result.results : [];
  if (results.length === 0) return errorHtml('No label sets were produced from the input.');
  const cards = results.map(resultCardHtml).join('');
  return cards + warningsHtml(Array.isArray(result.warnings) ? result.warnings : []);
}

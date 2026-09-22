/**
 * Terraform Plan Summarizer — the pure HTML builders for the results panel.
 *
 * Shared by BOTH the Astro frontmatter (which server-renders the seeded example
 * so a no-JS visitor — and every AI crawler, which does not execute JS — sees
 * the real stat band, the resource rows and the count cross-check) and the
 * island's `<script>` (which rebuilds the same markup on every parse and on
 * every grouping change). One implementation, so the two can never drift apart.
 *
 * `summarizePlan()` is pure and synchronous: no clock, no randomness, no key,
 * and `PlanSummary` carries no elapsed-time field — so the whole result is safe
 * to bake at build time. The one piece of view state, `grouping`, defaults to
 * `'action'` on both sides.
 *
 * Copy payloads are RETURNED, never pushed into a closure array and never
 * written into an attribute. That is a deliberate rule rather than an
 * implementation detail:
 *
 *   1. A newline-joined list of 200 addresses does not round-trip through an
 *      HTML attribute at all.
 *   2. HTML attribute-value serialization escapes only `&`, `"` and U+00A0 —
 *      NOT `<`. So a resource address like `aws_s3_bucket.<img src=x
 *      onerror=alert(1)>` assigned to `data-copy` or echoed into an
 *      `aria-label` reappears as literal `<img` when the container's innerHTML
 *      is read back, even though `escapeHtml()` was applied on the way in. It
 *      is inert — an attribute value is never parsed as markup — but it is
 *      indistinguishable from a real escaping bug, so this module keeps every
 *      attribute static and every untrusted value in TEXT position, where
 *      `escapeHtml()` is genuinely sufficient.
 *
 * `data-copy` therefore stays present-but-empty: Layout.astro's analytics
 * listener matches on the attribute's presence, not its value. Each button
 * carries `data-copy-ref="<n>"`, its index into the returned array.
 *
 * Everything here is pure: no `window`, no `document`, no clock, no
 * `localePath()` — and no links at all, so no locale prefix is needed. It also
 * deliberately does NOT import the engine: the island imports this module
 * eagerly (it must exist before hydration paints) while the engine is lazy, so
 * an engine import here would drag the parsers into the page shell. The one
 * engine-derived string the stat band needs, `formatTerraformTotals(totals)`,
 * is passed in by the caller.
 */
import { escapeHtml } from '../escape-html';
import type { PlanSummary, ResourceChange } from './types';

/** Markup plus the copy text for each `data-copy-ref` button it contains, by index. */
export interface Rendered {
  html: string;
  payloads: string[];
}

export interface ResultOptions {
  /** View state, `'action'` on first paint in both the server and the client. */
  grouping: 'action' | 'module';
  /** `formatTerraformTotals(summary.totals)` — see the module header. */
  terraformTotals: string;
}

/* ---- DOM caps. The engine already caps parsing at 2,000 changes; these cap
   what is RENDERED, because 2,000 rows each with a copy button is what stalls
   the tab. Every cap carries a visible note. ------------------------------- */

export const MAX_RENDERED_ROWS = 200;
/** Module bands in "by module" grouping. */
export const MAX_RENDERED_BANDS = 40;
/** `forces replacement` chips shown per row. */
export const MAX_RENDERED_FORCES = 8;
/** Diagnostic rows in the notes block. */
export const MAX_RENDERED_NOTES = 12;
/** Output-change rows. */
export const MAX_RENDERED_OUTPUTS = 40;
/** Drift rows. */
export const MAX_RENDERED_DRIFT = 20;

/* ---- Icons (decorative) --------------------------------------------------- */

export const ALERT_SVG =
  '<svg class="tps-error__icon" width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 2.5L18.5 17H1.5z"></path><path d="M10 8v4"></path><path d="M10 14.6v.01"></path></svg>';
export const WARN_SVG =
  '<svg class="tps-note__icon" width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 2.5L18.5 17H1.5z"></path><path d="M10 8v4"></path><path d="M10 14.6v.01"></path></svg>';
export const INFO_SVG =
  '<svg class="tps-note__icon" width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="10" cy="10" r="7.5"></circle><path d="M10 9v4.5"></path><path d="M10 6.4v.01"></path></svg>';
export const OK_SVG =
  '<svg class="tps-note__icon" width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="10" cy="10" r="7.5"></circle><path d="M6.6 10.3l2.4 2.4 4.4-5"></path></svg>';
export const COPY_ICON_SVG =
  '<svg class="tps-copy-icon" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="5" width="9" height="9" rx="1.5"/><path d="M3 11H2a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v1"/></svg>';
export const CHECK_ICON_SVG =
  '<svg class="tps-check-icon hidden" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 8.5l3.5 3.5L13 4.5"/></svg>';

/* ---- Static states -------------------------------------------------------- */

/** The empty-state paragraph, so the SSR placeholder and `renderEmpty` agree. */
export const EMPTY_HTML =
  '<p class="tps-empty body-sm text-mute">Paste a plan to see adds, changes, destroys and ' +
  'replacements counted separately, the replacement-forcing attributes named, and the ' +
  'totals cross-checked against Terraform&rsquo;s own summary line.</p>';

/** Shown while a previously-invalid paste is being re-typed. */
export const TYPING_HTML =
  '<p class="tps-empty body-sm text-mute">Still typing — results appear once there is a ' +
  'plan to read.</p>';

/** The island failed to import its engine. Client-only, but it lives with its siblings. */
export const LOAD_ERROR_HTML =
  '<div class="tps-error" role="alert">' +
  ALERT_SVG +
  '<div><p class="tps-error__title">Summarizer unavailable</p>' +
  '<p class="tps-error__detail">The plan engine failed to load. Reload the page to try ' +
  'again — nothing you pasted was sent anywhere.</p></div></div>';

/* ---- Vocabulary ----------------------------------------------------------- */

/** Symbol + label + explanation. Colour never carries meaning on its own. */
export const STAT_TILES = [
  { key: 'create', cls: 'add', symbol: '+', label: 'add', sub: 'created outright' },
  { key: 'update', cls: 'change', symbol: '~', label: 'change', sub: 'updated in place' },
  { key: 'destroy', cls: 'destroy', symbol: '−', label: 'destroy', sub: 'destroyed outright' },
  {
    key: 'replace',
    cls: 'replace',
    symbol: '±',
    label: 'replace',
    sub: 'destroyed and recreated',
  },
] as const;

export const ACTION_LABEL: Record<string, string> = {
  create: 'create',
  update: 'update',
  delete: 'destroy',
  replace: 'replace',
  read: 'read',
  import: 'import',
  move: 'move',
  'no-op': 'no change',
  forget: 'forget',
};

export const ACTION_BADGE_CLASS: Record<string, string> = {
  create: 'tps-badge--add',
  update: 'tps-badge--change',
  delete: 'tps-badge--destroy',
  replace: 'tps-badge--replace',
};

export const RISK_CLASS_LABEL: Record<string, string> = {
  'data-store': 'data store',
  'egress-path': 'egress path',
  'control-plane': 'control plane',
  'crypto-key': 'encryption key',
};

/** Action bands, riskiest first — the default reading order. */
export const ACTION_BANDS: { title: string; actions: string[] }[] = [
  { title: 'Replacements', actions: ['replace'] },
  { title: 'Destroys', actions: ['delete'] },
  { title: 'Creates', actions: ['create'] },
  { title: 'Updates', actions: ['update'] },
  {
    title: 'Reads, imports, moves and forgets',
    actions: ['read', 'import', 'move', 'forget', 'no-op'],
  },
];

export function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}

/* ---- Copy buttons --------------------------------------------------------- */

/**
 * An icon-only per-row copy button. `label` must be a STATIC string — never a
 * resource address — for the reason in the module header.
 */
function copyBtnHtml(label: string, payload: string, payloads: string[]): string {
  const ref = payloads.push(payload) - 1;
  return (
    `<button class="tps-copy" type="button" data-copy="" data-copy-ref="${ref}" ` +
    `aria-label="${escapeHtml(label)}" title="${escapeHtml(label)}">` +
    COPY_ICON_SVG +
    CHECK_ICON_SVG +
    '</button>'
  );
}

/** A labeled band button. `data-copy-all` puts it in the 36px tap tier. */
function copyAllBtnHtml(label: string, payload: string, payloads: string[]): string {
  const ref = payloads.push(payload) - 1;
  return (
    '<button class="tps-copy tps-copy--labeled" type="button" data-copy-all data-copy="" ' +
    `data-copy-ref="${ref}" data-copy-label="${escapeHtml(label)}">` +
    COPY_ICON_SVG +
    CHECK_ICON_SVG +
    `<span class="tps-copy-label">${escapeHtml(label)}</span></button>`
  );
}

/**
 * Deliberately short and count-bearing rather than descriptive: the band
 * heading right next to it already says which addresses these are, and a
 * `white-space: nowrap` label like "Copy reads, imports, moves and forgets
 * addresses" is 310px wide, which overflows a 390px viewport.
 */
export function addressCopyLabel(n: number): string {
  return n === 1 ? 'Copy the address' : `Copy the ${n} addresses`;
}

/* ---- Blocks --------------------------------------------------------------- */

export function statsHtml(summary: PlanSummary, terraformTotals: string): string {
  const tiles = STAT_TILES.map((tile) => {
    const n = summary.counts[tile.key];
    return (
      `<div class="tps-stat tps-stat--${tile.cls}">` +
      `<span class="tps-stat__n"><span class="tps-stat__sym" aria-hidden="true">${escapeHtml(tile.symbol)}</span>${n}</span>` +
      `<span class="tps-stat__label">${escapeHtml(tile.label)}</span>` +
      `<span class="tps-stat__sub">${escapeHtml(tile.sub)}</span></div>`
    );
  }).join('');

  const extras: string[] = [];
  if (summary.counts.read > 0) {
    extras.push(
      `${summary.counts.read} data ${plural(summary.counts.read, 'source', 'sources')} read during apply`,
    );
  }
  if (summary.counts.import > 0) extras.push(`${summary.counts.import} imported`);
  if (summary.counts.move > 0) extras.push(`${summary.counts.move} moved`);
  if (summary.counts.forget > 0) {
    extras.push(`${summary.counts.forget} removed from state but left in place`);
  }
  if (summary.counts.noop > 0) extras.push(`${summary.counts.noop} with no change`);

  const tfLine =
    `Terraform&rsquo;s own accounting counts each replacement once as an add <em>and</em> once ` +
    `as a destroy: ${escapeHtml(terraformTotals)}.` +
    (extras.length > 0 ? ` Outside those three: ${escapeHtml(extras.join(', '))}.` : '');

  return `<div class="tps-stats">${tiles}</div><p class="tps-tf-line">${tfLine}</p>`;
}

export function reconciliationHtml(summary: PlanSummary, payloads: string[]): string {
  const status = summary.reconciliation.status;
  const cls =
    status === 'mismatch' ? 'tps-note--warning' : status === 'match' ? 'tps-note--ok' : '';
  const icon = status === 'mismatch' ? WARN_SVG : status === 'match' ? OK_SVG : INFO_SVG;
  const heading =
    status === 'match'
      ? 'Cross-check: reconciles'
      : status === 'mismatch'
        ? 'Cross-check: COUNT MISMATCH'
        : 'Cross-check: no summary line to compare against';
  const line =
    summary.summaryLine !== null
      ? `<span class="tps-row__note">Terraform printed: ${escapeHtml(summary.summaryLine)}</span>`
      : '';
  return (
    '<div class="tps-block">' +
    '<div class="tps-block__head"><span class="tps-block__title">Reconciliation</span>' +
    (summary.summaryLine !== null
      ? `<span class="tps-block__actions">${copyBtnHtml("Copy Terraform’s own summary line", summary.summaryLine, payloads)}</span>`
      : '') +
    '</div>' +
    `<div class="tps-note ${cls}">${icon}<span><strong>${escapeHtml(heading)}</strong> ` +
    `${escapeHtml(summary.reconciliation.message)}${line}</span></div>` +
    '</div>'
  );
}

function forcesHtml(change: ResourceChange): string {
  if (change.replaceReasons.length === 0 && !change.replaceReasonsTruncated) return '';
  const shown = change.replaceReasons.slice(0, MAX_RENDERED_FORCES);
  const chipsHtml = shown
    .map((attr) => `<span class="tps-force">${escapeHtml(attr)}</span>`)
    .join('');
  const hidden = change.replaceReasons.length - shown.length;
  const more =
    hidden > 0 || change.replaceReasonsTruncated
      ? `<span class="tps-force">${hidden > 0 ? `and ${hidden} more` : 'and more, not listed'}</span>`
      : '';
  return (
    '<span class="tps-row__note">forces replacement:</span>' +
    `<span class="tps-forces">${chipsHtml}${more}</span>`
  );
}

function rowHtml(change: ResourceChange, showModule: boolean, payloads: string[]): string {
  const notes: string[] = [];
  if (change.replaceOrder === 'destroy-create') {
    notes.push('destroy then create — the resource does not exist in between');
  } else if (change.replaceOrder === 'create-destroy') {
    notes.push('create then destroy (create_before_destroy)');
  }
  if (change.tainted) notes.push('marked tainted');
  if (change.imported) notes.push('imported into state');
  if (change.movedFrom !== null) notes.push(`moved from ${change.movedFrom}`);
  if (change.sensitive) notes.push('has attributes the plan marked sensitive');
  if (change.actionReason !== null) notes.push(change.actionReason);
  if (showModule && change.moduleChain.length > 0) {
    notes.push(`in module ${change.moduleChain.join(' › ')}`);
  }
  if (change.provider !== null) notes.push(change.provider);

  const badgeClass = ACTION_BADGE_CLASS[change.action] ?? '';
  return (
    '<div class="tps-row">' +
    '<div class="tps-row__main">' +
    `<span class="tps-row__addr">${escapeHtml(change.address)}</span>` +
    (notes.length > 0 ? `<span class="tps-row__note">${escapeHtml(notes.join(' · '))}</span>` : '') +
    forcesHtml(change) +
    '</div>' +
    '<span class="tps-row__side">' +
    `<span class="tps-badge ${badgeClass}">${escapeHtml(ACTION_LABEL[change.action] ?? change.action)}</span>` +
    copyBtnHtml('Copy this resource address', change.address, payloads) +
    '</span></div>'
  );
}

interface Band {
  title: string;
  rows: ResourceChange[];
}

export function bandsFor(summary: PlanSummary, grouping: 'action' | 'module'): Band[] {
  if (grouping === 'action') {
    return ACTION_BANDS.map((band) => ({
      title: band.title,
      rows: summary.changes.filter((change) => band.actions.includes(change.action)),
    })).filter((band) => band.rows.length > 0);
  }
  const groups = new Map<string, ResourceChange[]>();
  for (const change of summary.changes) {
    const key = change.moduleChain.length === 0 ? '' : change.moduleChain.join('.');
    const list = groups.get(key);
    if (list) list.push(change);
    else groups.set(key, [change]);
  }
  return Array.from(groups.entries()).map(([key, rows]) => ({
    title: key === '' ? 'Root module' : `module ${key.split('.').join(' › ')}`,
    rows,
  }));
}

export function bandsHtml(
  summary: PlanSummary,
  grouping: 'action' | 'module',
  payloads: string[],
): string {
  const all = bandsFor(summary, grouping);
  const bands = all.slice(0, MAX_RENDERED_BANDS);
  let budget = MAX_RENDERED_ROWS;
  let dropped = 0;
  let rendered = 0;
  const html: string[] = [];

  for (const band of bands) {
    // With the row budget spent, a band renders as a heading, a copy button
    // and the note "Showing 0 of N rows in this group" — a dead shell. In
    // "by module" grouping the band order is arbitrary insertion order, so
    // 300 updates over 15 modules left five modules as empty shells. Stop
    // here instead; the note below says how many groups are missing.
    if (budget <= 0) break;
    rendered += 1;
    const shown = band.rows.slice(0, Math.max(0, budget));
    dropped += band.rows.length - shown.length;
    budget -= shown.length;
    const addresses = band.rows.map((change) => change.address).join('\n');
    html.push(
      '<div class="tps-block">' +
        '<div class="tps-block__head">' +
        `<span class="tps-block__title">${escapeHtml(band.title)} · ${band.rows.length}</span>` +
        `<span class="tps-block__actions">${copyAllBtnHtml(addressCopyLabel(band.rows.length), addresses, payloads)}</span>` +
        '</div>' +
        shown.map((change) => rowHtml(change, grouping === 'action', payloads)).join('') +
        (shown.length < band.rows.length
          ? `<p class="tps-none">Showing ${shown.length} of ${band.rows.length} rows in this group. The copy button above still copies every address.</p>`
          : '') +
        '</div>',
    );
  }

  if (all.length > rendered) {
    html.push(
      `<p class="tps-none">Showing the first ${rendered} of ${all.length} groups` +
        (dropped > 0
          ? `, and ${dropped} further ${plural(dropped, 'row was', 'rows were')} not rendered`
          : '') +
        '. Copy the Markdown summary for the whole plan.</p>',
    );
  } else if (dropped > 0) {
    html.push(
      `<p class="tps-none">${dropped} further ${plural(dropped, 'row was', 'rows were')} not rendered, to keep this page responsive.</p>`,
    );
  }
  return html.join('');
}

export function riskHtml(summary: PlanSummary, payloads: string[]): string {
  if (summary.highRisk.length === 0) return '';
  const shown = summary.highRisk.slice(0, MAX_RENDERED_ROWS);
  const rows = shown
    .map((change) => {
      // `highRisk` only ever holds classified changes, but narrow rather than
      // assert: a non-null assertion here would survive a change to the engine.
      const risk = change.risk;
      if (risk === null) return '';
      return (
        '<div class="tps-risk__row">' +
        `<span class="tps-risk__addr">${escapeHtml(change.address)}` +
        `<span class="tps-risk__why">${escapeHtml(risk.reason)}</span></span>` +
        '<span class="tps-row__side">' +
        `<span class="tps-risk__class">${escapeHtml(RISK_CLASS_LABEL[risk.klass] ?? risk.klass)}</span>` +
        copyBtnHtml('Copy this resource address', change.address, payloads) +
        '</span></div>'
      );
    })
    .join('');
  const addresses = summary.highRisk.map((change) => change.address).join('\n');
  const n = summary.highRisk.length;
  return (
    '<div class="tps-risk">' +
    `<div class="tps-risk__head"><span>Read this first · ${n} high blast radius</span>` +
    `<span class="tps-block__actions">${copyAllBtnHtml(addressCopyLabel(n), addresses, payloads)}</span></div>` +
    `<p class="tps-risk__lead">${n} destructive ${plural(n, 'action', 'actions')} ` +
    'in this plan hits a resource type that holds data, carries your egress path, or is a ' +
    'cluster control plane. A type that is <em>not</em> listed here is unclassified, not ' +
    'proven safe — nobody can enumerate every provider&rsquo;s stateful resources.</p>' +
    rows +
    '</div>'
  );
}

export function outputsHtml(summary: PlanSummary, payloads: string[]): string {
  if (summary.outputChanges.length === 0) return '';
  const shown = summary.outputChanges.slice(0, MAX_RENDERED_OUTPUTS);
  const rows = shown
    .map((output) => {
      const badge =
        output.action === 'create'
          ? 'tps-badge--add'
          : output.action === 'delete'
            ? 'tps-badge--destroy'
            : output.action === 'update'
              ? 'tps-badge--change'
              : '';
      return (
        '<div class="tps-row"><div class="tps-row__main">' +
        `<span class="tps-row__addr">${escapeHtml(output.name)}</span>` +
        (output.sensitive
          ? '<span class="tps-row__note">marked sensitive — the value is not printed in the plan</span>'
          : '') +
        '</div><span class="tps-row__side">' +
        `<span class="tps-badge ${badge}">${escapeHtml(output.action === 'delete' ? 'destroy' : output.action)}</span>` +
        copyBtnHtml('Copy this output name', output.name, payloads) +
        '</span></div>'
      );
    })
    .join('');
  return (
    '<div class="tps-block"><div class="tps-block__head">' +
    `<span class="tps-block__title">Output changes · ${summary.outputChanges.length}</span></div>` +
    rows +
    (shown.length < summary.outputChanges.length
      ? `<p class="tps-none">Showing ${shown.length} of ${summary.outputChanges.length} outputs.</p>`
      : '') +
    '</div>'
  );
}

export function driftHtml(summary: PlanSummary, payloads: string[]): string {
  if (summary.drift.length === 0) return '';
  const shown = summary.drift.slice(0, MAX_RENDERED_DRIFT);
  const rows = shown
    .map(
      (change) =>
        '<div class="tps-row"><div class="tps-row__main">' +
        `<span class="tps-row__addr">${escapeHtml(change.address)}</span></div>` +
        '<span class="tps-row__side">' +
        copyBtnHtml('Copy this resource address', change.address, payloads) +
        '</span></div>',
    )
    .join('');
  return (
    '<div class="tps-block"><div class="tps-block__head">' +
    `<span class="tps-block__title">Changed outside Terraform · ${summary.drift.length}</span></div>` +
    '<p class="tps-none">Drift: Terraform found these already different from the last state it ' +
    'recorded. They are NOT part of the counts above.</p>' +
    rows +
    (shown.length < summary.drift.length
      ? `<p class="tps-none">Showing ${shown.length} of ${summary.drift.length}.</p>`
      : '') +
    '</div>'
  );
}

export function notesHtml(summary: PlanSummary): string {
  const notes = summary.diagnostics.filter(
    (diagnostic) => diagnostic.message !== summary.reconciliation.message,
  );
  if (notes.length === 0) return '';
  const shown = notes.slice(0, MAX_RENDERED_NOTES);
  const rows = shown
    .map((diagnostic) => {
      const icon = diagnostic.severity === 'info' ? INFO_SVG : WARN_SVG;
      return (
        `<div class="tps-note tps-note--${escapeHtml(diagnostic.severity)}">${icon}` +
        `<span>${escapeHtml(diagnostic.message)}</span></div>`
      );
    })
    .join('');
  return (
    '<div class="tps-block"><div class="tps-block__head">' +
    `<span class="tps-block__title">Notes · ${notes.length}</span></div>` +
    rows +
    (shown.length < notes.length
      ? `<p class="tps-none">…and ${notes.length - shown.length} more, not shown.</p>`
      : '') +
    '</div>'
  );
}

/* ---- Panels --------------------------------------------------------------- */

/** The whole results panel for a plan that parsed. */
export function resultHtml(summary: PlanSummary, opts: ResultOptions): Rendered {
  const payloads: string[] = [];
  const body = summary.noChanges
    ? '<div class="tps-block"><div class="tps-block__head"><span class="tps-block__title">No changes</span></div>' +
      '<p class="tps-none">Terraform found nothing to do: your configuration and the real ' +
      'infrastructure already agree. Nothing will be created, changed or destroyed.</p></div>'
    : statsHtml(summary, opts.terraformTotals) +
      riskHtml(summary, payloads) +
      bandsHtml(summary, opts.grouping, payloads);

  const html =
    body +
    reconciliationHtml(summary, payloads) +
    outputsHtml(summary, payloads) +
    driftHtml(summary, payloads) +
    notesHtml(summary);
  return { html, payloads };
}

/** The `role="status"` line: format, action count, risk, and the cross-check verdict. */
export function summaryText(summary: PlanSummary): string {
  const bits = [
    summary.format === 'json' ? 'show -json' : 'plan text',
    summary.noChanges
      ? 'no changes'
      : `${summary.stats.changes} ${plural(summary.stats.changes, 'action', 'actions')}`,
  ];
  // `show -json` carries every declared resource, so say how many were
  // unchanged rather than letting them vanish without a figure.
  if (summary.stats.unchanged > 0) bits.push(`${summary.stats.unchanged} unchanged`);
  if (summary.highRisk.length > 0) bits.push(`${summary.highRisk.length} high risk`);
  bits.push(
    summary.reconciliation.status === 'match'
      ? 'counts reconcile'
      : summary.reconciliation.status === 'mismatch'
        ? 'COUNT MISMATCH'
        : 'no cross-check',
  );
  return bits.join(' · ');
}

/** The hard-error card: shown when nothing usable was found at all. */
export function errorHtml(summary: PlanSummary, isAlert: boolean): string {
  const worst =
    summary.diagnostics.find((d) => d.severity === 'error') ??
    summary.diagnostics.find((d) => d.severity === 'warning') ??
    summary.diagnostics[0];
  const others = summary.diagnostics.filter((d) => d !== worst);
  return (
    `<div class="tps-error"${isAlert ? ' role="alert"' : ''}>` +
    ALERT_SVG +
    '<div><p class="tps-error__title">No plan to summarize yet</p>' +
    `<p id="tps-error-detail" class="tps-error__detail">${escapeHtml(worst?.message ?? '')}</p>` +
    '</div></div>' +
    (others.length > 0
      ? '<div class="tps-block"><div class="tps-block__head"><span class="tps-block__title">Also noticed</span></div>' +
        others
          .slice(0, MAX_RENDERED_NOTES)
          .map(
            (d) =>
              `<div class="tps-note tps-note--${escapeHtml(d.severity)}">${d.severity === 'info' ? INFO_SVG : WARN_SVG}<span>${escapeHtml(d.message)}</span></div>`,
          )
          .join('') +
        '</div>'
      : '')
  );
}

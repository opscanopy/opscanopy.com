/**
 * JSON ↔ YAML Converter — the pure HTML builders for the results panel.
 *
 * Shared by BOTH the Astro frontmatter (which server-renders the seeded
 * example so a no-JS visitor — and every AI crawler, which does not execute
 * JS — sees the real converted document and its loss report) and the island's
 * <script> (which rebuilds the same markup on every conversion). One
 * implementation, so the two can never drift apart.
 *
 * Copy payloads: multi-line text round-trips badly through HTML attributes,
 * and `innerHTML` serialization does not re-escape `<` inside attribute values,
 * so every copy button carries an EMPTY `data-copy` (the shared analytics
 * selector) plus a `data-payload="<n>"` index into the `payloads` array each
 * builder returns. The client binds the text after `innerHTML`; the server
 * ignores the array.
 *
 * Everything here is pure: no `window`, no `document`, no clock.
 */
import { escapeHtml } from '../escape-html';
import type { ConvertResult, ConvertStats, Diagnostic, DiagnosticSeverity, Direction } from './types';

/** Markup plus the copy text for each `data-payload` button it contains, by index. */
export interface Rendered {
  html: string;
  payloads: string[];
}

/* ---- Icons (decorative) --------------------------------------------------- */

export const ALERT_SVG =
  '<svg class="jy-error__icon" width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 2.5L18.5 17H1.5z"></path><path d="M10 8v4"></path><path d="M10 14.6v.01"></path></svg>';
export const COPY_ICON_SVG =
  '<svg class="jy-copy-icon" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="5" width="9" height="9" rx="1.5"/><path d="M3 11H2a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v1"/></svg>';
export const CHECK_ICON_SVG =
  '<svg class="jy-check-icon hidden" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 8.5l3.5 3.5L13 4.5"/></svg>';

/** The empty-state paragraph, so the SSR placeholder and `renderEmpty` agree. */
export const EMPTY_HTML =
  '<p class="jy-empty body-sm text-mute">Paste JSON or YAML above — or tap an example — to ' +
  'see the converted document here, plus every comment, anchor, timestamp and ' +
  'out-of-range number the conversion costs you.</p>';

/* ---- Text helpers --------------------------------------------------------- */

export const SEV_LABEL: Record<DiagnosticSeverity, string> = {
  error: 'Error',
  warning: 'Warning',
  note: 'Note',
};

export function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

export function directionLabel(direction: Direction): string {
  return direction === 'yaml-to-json' ? 'YAML → JSON' : 'JSON → YAML';
}

export function outputName(direction: Direction): string {
  return direction === 'yaml-to-json' ? 'output.json' : 'output.yaml';
}

/** `line 3, column 1` / `$.spec.replicas` — whichever the engine supplied. */
export function locationText(d: Diagnostic): string {
  if (typeof d.path === 'string' && d.path.length > 0) return d.path;
  if (typeof d.line !== 'number') return '';
  return typeof d.column === 'number' ? `line ${d.line}, column ${d.column}` : `line ${d.line}`;
}

/** One plain-text line per diagnostic, for its per-row copy button. */
export function diagnosticText(d: Diagnostic): string {
  const where = locationText(d);
  return `${SEV_LABEL[d.severity] ?? 'Note'}${where ? ` (${where})` : ''}: ${d.message}`;
}

/** The status-line text: `YAML → JSON · 1 doc · 14 keys · no losses`. */
export function summaryText(result: ConvertResult): string {
  const parts = [
    directionLabel(result.direction),
    plural(result.stats.docs, 'doc'),
    plural(result.stats.keys, 'key'),
  ];
  const warnings = result.diagnostics.filter((d) => d.severity === 'warning').length;
  const notes = result.diagnostics.filter((d) => d.severity === 'note').length;
  if (warnings) parts.push(plural(warnings, 'warning'));
  if (notes) parts.push(plural(notes, 'note'));
  if (!warnings && !notes) parts.push('no losses');
  return parts.join(' · ');
}

/* ---- Blocks --------------------------------------------------------------- */

function copyButton(payloads: string[], text: string, ariaLabel: string): string {
  const idx = payloads.push(text) - 1;
  return (
    `<button class="jy-copy" type="button" data-payload="${idx}" data-copy="" ` +
    `aria-label="${escapeHtml(ariaLabel)}" title="Copy">` +
    COPY_ICON_SVG +
    CHECK_ICON_SVG +
    '</button>'
  );
}

function outputBlockHtml(
  direction: Direction,
  output: string,
  stats: ConvertStats,
  payloads: string[],
): string {
  const lines = output.length === 0 ? 0 : output.replace(/\n$/, '').split('\n').length;
  const meta = `${plural(lines, 'line')} · ${plural(stats.keys, 'key')}`;
  return (
    '<div class="jy-out">' +
    '<div class="jy-out__bar">' +
    `<span class="jy-out__name">${escapeHtml(outputName(direction))}</span>` +
    `<span class="jy-out__meta">${escapeHtml(meta)}</span>` +
    copyButton(payloads, output, `Copy the converted ${direction === 'yaml-to-json' ? 'JSON' : 'YAML'}`) +
    '</div>' +
    // tabindex makes the horizontally scrollable output reachable by keyboard (WCAG 2.1.1;
    // axe flags it as scrollable-region-focusable). A long line is otherwise unreadable
    // without a pointer.
    `<pre class="jy-out__pre" tabindex="0"><code>${escapeHtml(output)}</code></pre>` +
    '</div>'
  );
}

function diagnosticsBlockHtml(diagnostics: Diagnostic[], payloads: string[]): string {
  const errors = diagnostics.filter((d) => d.severity === 'error').length;
  const warnings = diagnostics.filter((d) => d.severity === 'warning').length;
  const notes = diagnostics.filter((d) => d.severity === 'note').length;
  const counts = [
    errors ? plural(errors, 'error') : '',
    warnings ? plural(warnings, 'warning') : '',
    notes ? plural(notes, 'note') : '',
  ]
    .filter(Boolean)
    .join(' · ');

  const head =
    '<div class="jy-block__head"><span>What the conversion cost</span>' +
    (counts ? `<span class="jy-block__meta">${escapeHtml(counts)}</span>` : '') +
    '</div>';

  if (diagnostics.length === 0) {
    return (
      '<div class="jy-block">' +
      head +
      '<p class="jy-clean">Nothing this converter can detect was lost: no comments, anchors, ' +
      'merge keys, timestamps, multi-document stream, or numbers outside the range JavaScript ' +
      'can represent exactly.</p></div>'
    );
  }

  const rows = diagnostics
    .map((d) => {
      const sev: DiagnosticSeverity =
        d.severity === 'error' || d.severity === 'warning' ? d.severity : 'note';
      const where = locationText(d);
      return (
        `<div class="jy-diag jy-diag--${sev}">` +
        `<span class="jy-diag__sev">${escapeHtml(SEV_LABEL[sev])}</span>` +
        '<div class="jy-diag__body">' +
        `<p class="jy-diag__msg">${escapeHtml(d.message)}</p>` +
        (where ? `<span class="jy-diag__loc">${escapeHtml(where)}</span>` : '') +
        '</div>' +
        copyButton(payloads, diagnosticText(d), `Copy this ${SEV_LABEL[sev].toLowerCase()}`) +
        '</div>'
      );
    })
    .join('');

  return (
    '<div class="jy-block">' +
    head +
    '<p class="jy-block__sub">Each line below is something the target format cannot express. ' +
    'Warnings changed a value; notes flattened something the output has no syntax for.</p>' +
    rows +
    '</div>'
  );
}

/** A successful conversion: the output pane plus the loss report. `payloads[0]` is the output. */
export function resultHtml(result: ConvertResult): Rendered {
  const payloads: string[] = [];
  const html =
    outputBlockHtml(result.direction, result.output, result.stats, payloads) +
    diagnosticsBlockHtml(result.diagnostics, payloads);
  return { html, payloads };
}

/** The parse-error card, followed by any further diagnostics the engine still produced. */
export function errorHtml(
  direction: Direction,
  message: string,
  isAlert: boolean,
  extra: Diagnostic[] = [],
): Rendered {
  const payloads: string[] = [];
  const source = direction === 'yaml-to-json' ? 'YAML' : 'JSON';
  const html =
    `<div class="jy-error"${isAlert ? ' role="alert"' : ''}>` +
    ALERT_SVG +
    `<div><p class="jy-error__title">Could not read this ${escapeHtml(source)}</p>` +
    `<p id="jy-error-detail" class="jy-error__detail">${escapeHtml(message)}</p></div></div>` +
    (extra.length > 0 ? diagnosticsBlockHtml(extra, payloads) : '');
  return { html, payloads };
}

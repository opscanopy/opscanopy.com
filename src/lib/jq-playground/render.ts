/**
 * jq Playground — the pure HTML builders for the result panel.
 *
 * Shared by BOTH the Astro frontmatter (which server-renders the seeded first
 * example from `fixtures/example-1.out.json`, so a no-JS visitor — and every
 * AI crawler, which does not execute JS — sees jq's real output for it) and
 * the island's <script> (which rebuilds the same markup on every run). One
 * implementation, so the two can never drift apart. Moved here verbatim from
 * the island script when the playground adopted the kit (plan "Batch C",
 * Wave 3).
 *
 * The per-row copy payloads are NOT written into attributes (newlines
 * round-trip badly through HTML); the island binds them on the live
 * `[data-jq-row]` buttons after writing the markup.
 *
 * Everything here is pure: no `window`, no `document`, no clock. Timing is
 * only ever read from a result the caller passes in.
 */
import { escapeHtml } from '../escape-html';
import type { JqErr, JqErrorKind, JqOk } from './types';

/* A single output can be megabytes. Clip what goes into the DOM, keep the
   whole value on the copy button, and say so. */
export const MAX_ROW_DISPLAY_CHARS = 4000;

/* ---- Icons (decorative) ------------------------------------------------- */

export const ALERT_SVG =
  '<svg class="jqp-error__icon" width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 2.5L18.5 17H1.5z"></path><path d="M10 8v4"></path><path d="M10 14.6v.01"></path></svg>';
export const COPY_ICON_SVG =
  '<svg class="jqp-copy-icon" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="5" width="9" height="9" rx="1.5"/><path d="M3 11H2a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v1"/></svg>';
export const CHECK_ICON_SVG =
  '<svg class="jqp-check-icon hidden" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 8.5l3.5 3.5L13 4.5"/></svg>';

/* ---- Numbers ------------------------------------------------------------ */

/** `1234` → `1,234`, without depending on the runtime's ICU data. */
export function group(n: number): string {
  const digits = String(Math.trunc(Math.abs(n)));
  let out = '';
  for (let i = 0; i < digits.length; i += 1) {
    if (i > 0 && (digits.length - i) % 3 === 0) out += ',';
    out += digits[i];
  }
  return (n < 0 ? '-' : '') + out;
}

export function plural(n: number, word: string): string {
  return `${group(n)} ${word}${n === 1 ? '' : 's'}`;
}

/* ---- Fixed states ------------------------------------------------------- */

export const LOADING_HTML =
  '<p class="jqp-empty body-sm text-mute">Loading jq — the real binary, compiled to ' +
  'WebAssembly (250–340 KB over the wire, cached after your first visit). The example ' +
  'below runs as soon as it lands.</p>';

export function emptyHtml(message: string): string {
  return `<p class="jqp-empty body-sm text-mute">${escapeHtml(message)}</p>`;
}

/** The card shown when the editor/engine CODE (not the WASM) failed to load. */
export const CODE_LOAD_FAILED_HTML =
  '<div class="jqp-error" role="alert">' +
  ALERT_SVG +
  '<div class="jqp-error__body"><p class="jqp-error__title">The playground failed to load</p>' +
  '<p class="jqp-error__detail">Its editor or engine code could not be fetched. Reload the ' +
  'page to try again.</p></div></div>';

export const ERROR_TITLES: Record<JqErrorKind, string> = {
  compile: 'That program does not compile',
  input: 'That input is not valid JSON',
  runtime: 'jq stopped with a runtime error',
  engine: 'jq could not run',
};

/* ---- Outputs ------------------------------------------------------------ */

/** One card per jq output. `dim` marks partial output from a failed run. */
export function outputsHtml(rows: string[], total: number, truncated: boolean, dim: boolean): string {
  return rows
    .map((row, i) => {
      const clipped = row.length > MAX_ROW_DISPLAY_CHARS;
      const shown = clipped ? row.slice(0, MAX_ROW_DISPLAY_CHARS) : row;
      const lines = row.length === 0 ? 1 : row.split('\n').length;
      const meta = clipped
        ? `clipped to ${group(MAX_ROW_DISPLAY_CHARS)} of ${group(row.length)} chars`
        : `${plural(lines, 'line')} · ${plural(row.length, 'char')}`;
      const label = truncated || total > rows.length ? `output ${group(i + 1)} of ${group(total)}` : `output ${group(i + 1)}`;
      return (
        `<div class="jqp-out${dim ? ' jqp-out--dim' : ''}">` +
        '<div class="jqp-out__bar">' +
        `<span class="jqp-out__name">${escapeHtml(label)}</span>` +
        `<span class="jqp-out__meta">${escapeHtml(meta)}</span>` +
        `<button class="jqp-copy" type="button" data-jq-row="${i}" data-copy="" ` +
        `aria-label="Copy output ${group(i + 1)} to clipboard" title="Copy">` +
        COPY_ICON_SVG +
        CHECK_ICON_SVG +
        '</button></div>' +
        // tabindex makes a horizontally scrollable output reachable by
        // keyboard (WCAG 2.1.1) — a long line is otherwise unreadable
        // without a pointer.
        `<pre class="jqp-out__pre" tabindex="0"><code>${escapeHtml(shown)}${
          clipped ? '\n…' : ''
        }</code></pre>` +
        '</div>'
      );
    })
    .join('');
}

export function capNoteHtml(text: string): string {
  return `<p class="jqp-cap">${escapeHtml(text)}</p>`;
}

export function noticesHtml(notices: string[], total: number, truncated: boolean, exitCode: number): string {
  if (notices.length === 0) return '';
  const sub =
    exitCode === 0
      ? 'jq exited 0 but still wrote to stderr. Its exit code only reflects the LAST input, so ' +
        'a filter that failed on an earlier input can still look like a clean run.'
      : 'Everything else jq wrote to stderr for this run.';
  return (
    '<div class="jqp-block">' +
    '<div class="jqp-block__head"><span>jq also wrote to stderr</span>' +
    `<span class="jqp-block__meta">${escapeHtml(plural(total, 'line'))}</span></div>` +
    `<p class="jqp-block__sub">${escapeHtml(sub)}</p>` +
    notices.map((line) => `<p class="jqp-note">${escapeHtml(line)}</p>`).join('') +
    (truncated
      ? `<p class="jqp-note">Showing the first ${group(notices.length)} of ${group(total)} lines.</p>`
      : '') +
    '</div>'
  );
}

/* ---- A successful run --------------------------------------------------- */

/** The whole result for one `ok: true` run: the output cards (or the empty-stream card), caveat notes, stderr notices. */
export function okHtml(result: JqOk): string {
  const notes: string[] = [];
  if (result.truncated) {
    notes.push(
      `Showing the first ${group(result.outputs.length)} of ${group(result.totalOutputs)} ` +
        `outputs — "Copy all" still copies every one.`,
    );
  }
  if (!result.outputsExact) {
    // Two things land here, so the note must not name only one of them: a
    // raw string containing newlines, and a filter whose two passes disagree
    // (anything non-deterministic — `now` is the common one). Claiming the
    // newline reason for a `now` filter would be a confident wrong answer.
    notes.push(
      `jq produced ${plural(result.totalOutputs, 'output')}, but the row boundaries cannot be ` +
        `proven from -r text — a raw string may contain newlines, and a non-deterministic ` +
        `filter such as now differs between the two passes. The whole raw output is shown as ` +
        `one block instead of guessing at rows.`,
    );
  }
  const body =
    result.outputs.length === 0
      ? '<div class="jqp-block"><div class="jqp-block__head"><span>No output</span>' +
        '<span class="jqp-block__meta">exit 0</span></div>' +
        '<p class="jqp-block__sub">This is a real result, not a failure: the filter matched ' +
        'nothing, so jq emitted an empty stream and exited 0. <span class="code-mono">empty' +
        '</span>, a false <span class="code-mono">select()</span> and ' +
        '<span class="code-mono">.[]?</span> on a non-iterable all do this.</p></div>'
      : outputsHtml(result.outputs, result.totalOutputs, result.truncated, false);
  return body + notes.map(capNoteHtml).join('') + noticesHtml(result.notices, result.totalNotices, result.noticesTruncated, result.exitCode);
}

/**
 * The one-line summary. `withTiming` is false only for the build-time seed:
 * the elapsed time is a property of one run in one browser, so the static
 * HTML never states it.
 */
export function okSummary(result: JqOk, withTiming = true): string {
  const parts: string[] = [];
  if (result.truncated) {
    parts.push(`showing ${group(result.outputs.length)} of ${plural(result.totalOutputs, 'output')}`);
  } else {
    parts.push(plural(result.totalOutputs, 'output'));
  }
  if (result.flags.length > 0) parts.push(result.flags.join(' '));
  if (withTiming) parts.push(`${group(result.elapsedMs)} ms`);
  if (result.totalNotices > 0) parts.push(plural(result.totalNotices, 'stderr line'));
  return parts.join(' · ');
}

/* ---- A failed run ------------------------------------------------------- */

export function errorCardHtml(result: JqErr, isAlert: boolean, withRetry: boolean): string {
  const where =
    result.errorScope !== null && result.errorLine !== undefined
      ? `${result.errorScope === 'program' ? 'program' : 'JSON input'} line ${group(result.errorLine)}` +
        (result.errorColumn !== undefined ? `, column ${group(result.errorColumn)}` : '')
      : '';
  return (
    `<div class="jqp-error"${isAlert ? ' role="alert"' : ''}>` +
    ALERT_SVG +
    '<div class="jqp-error__body">' +
    `<p class="jqp-error__title">${escapeHtml(ERROR_TITLES[result.errorKind] ?? ERROR_TITLES.engine)}</p>` +
    `<p id="jq-error-detail" class="jqp-error__detail">${escapeHtml(result.error)}</p>` +
    (where ? `<span class="jqp-error__where">${escapeHtml(where)}</span>` : '') +
    (result.excerpt ? `<pre class="jqp-error__excerpt"><code>${escapeHtml(result.excerpt)}</code></pre>` : '') +
    (withRetry ? '<button type="button" class="jqp-retry" data-jq-retry>Retry loading jq</button>' : '') +
    '</div></div>'
  );
}

/**
 * The error report for one failed run — what the island writes into the
 * `#jq-error` slot above the (dimmed, kept) output cards: the error card, any
 * partial outputs jq emitted before it stopped (dimmed), and its stderr.
 */
export function errHtml(result: JqErr, isAlert: boolean, withRetry: boolean): string {
  const partials =
    result.partialOutputs.length > 0
      ? capNoteHtml(
          `jq had already emitted ${plural(result.totalPartialOutputs, 'output')} before it ` +
            `stopped. They are shown below, dimmed.`,
        ) + outputsHtml(result.partialOutputs, result.totalPartialOutputs, result.partialTruncated, true)
      : '';
  return (
    errorCardHtml(result, isAlert, withRetry) +
    partials +
    noticesHtml(result.notices, result.totalNotices, result.noticesTruncated, result.exitCode)
  );
}

/**
 * URL Encoder / Decoder + Query-String Parser — the pure HTML builders for the
 * results panel.
 *
 * Shared by BOTH the Astro frontmatter (which server-renders the seeded example
 * so a no-JS visitor — and every AI crawler, which does not execute JS — sees
 * the real components card and the decoded parameter table) and the island's
 * `<script>` (which rebuilds the same markup on every eval). One
 * implementation, so the two can never drift apart.
 *
 * `run()` is pure and synchronous and takes no clock, no key and no randomness,
 * so the whole result is safe to bake at build time.
 *
 * Copy payloads are RETURNED, never pushed into a closure array and never
 * written into an attribute: a decoded value can carry newlines, quotes and
 * `<`, and `innerHTML` serialization does not re-escape `<` inside an attribute
 * value, so a correctly-escaped payload in `data-copy` still reads back as
 * literal markup. Each copy button therefore carries an EMPTY `data-copy` (the
 * shared analytics selector in Layout.astro matches on the attribute's
 * presence) plus `data-copy-ref="<n>"`, its index into the returned array,
 * numbered in render order. Nothing user-supplied enters an attribute.
 *
 * Everything here is pure: no `window`, no `document`, no clock, no
 * `localePath()` — and no links at all, so no locale prefix is needed.
 */
import { escapeHtml } from '../escape-html';
import type {
  DecodeResult,
  Diagnostic,
  EncodeResult,
  ParseResult,
  QueryParam,
  RunResult,
  UrlCodecMode,
  UrlComponent,
} from './types';

/** Markup plus the copy text for each `data-copy-ref` button it contains, by index. */
export interface Rendered {
  html: string;
  payloads: string[];
}

/** Rendered query rows. Past this the DOM, not the parse, is what stalls the tab. */
export const MAX_RENDERED_PARAMS = 500;

/* ---- Icons (decorative) --------------------------------------------------- */

export const ALERT_SVG =
  '<svg class="uc-error__icon" width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 2.5L18.5 17H1.5z"></path><path d="M10 8v4"></path><path d="M10 14.6v.01"></path></svg>';
export const WARN_SVG =
  '<svg class="uc-note__icon" width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 2.5L18.5 17H1.5z"></path><path d="M10 8v4"></path><path d="M10 14.6v.01"></path></svg>';
export const INFO_SVG =
  '<svg class="uc-note__icon" width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="10" cy="10" r="7.5"></circle><path d="M10 9v4.5"></path><path d="M10 6.4v.01"></path></svg>';
export const COPY_ICON_SVG =
  '<svg class="uc-copy-icon" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="5" width="9" height="9" rx="1.5"/><path d="M3 11H2a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v1"/></svg>';
export const CHECK_ICON_SVG =
  '<svg class="uc-check-icon hidden" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 8.5l3.5 3.5L13 4.5"/></svg>';

/* ---- Static states -------------------------------------------------------- */

/** The empty-state paragraph, so the SSR placeholder and `renderEmpty` agree. */
export const EMPTY_HTML =
  '<p class="uc-empty body-sm text-mute">Paste a URL to see its components and every query ' +
  'parameter decoded — or switch to Decode or Encode to work on one value at a time.</p>';

/** Shown while a previously-invalid value is being re-typed. */
export const TYPING_HTML =
  '<p class="uc-empty body-sm text-mute">Still typing — results appear once the value ' +
  'parses.</p>';

/** The island failed to import its engine. Client-only, but it lives with its siblings. */
export const LOAD_ERROR_HTML =
  '<div class="uc-error" role="alert">' +
  ALERT_SVG +
  '<div><p class="uc-error__title">Tool unavailable</p>' +
  '<p class="uc-error__detail">The URL engine failed to load. Reload the page to try ' +
  'again — nothing you typed was sent anywhere.</p></div></div>';

/** Per-mode chrome: the input label, its placeholder, and the result block's eyebrow. */
export const MODE_COPY: Record<
  UrlCodecMode,
  { label: string; placeholder: string; eyebrow: string }
> = {
  parse: {
    label: 'URL or query string',
    placeholder: 'https://example.com/path?a=1&b=two%20words',
    eyebrow: 'Components & parameters',
  },
  decode: {
    label: 'Percent-encoded text',
    placeholder: 'name=Ada+Lovelace&note=100%25',
    eyebrow: 'Decoded',
  },
  encode: {
    label: 'Text to encode',
    placeholder: 'https://app.example.com/callback?next=/settings',
    eyebrow: 'Encoded',
  },
};

/* ---- Blocks --------------------------------------------------------------- */

/**
 * An icon-only copy button. `label` is a STATIC-ish description used only in
 * the accessible name; the value itself goes into `payloads`, never into an
 * attribute (see the module header).
 */
function copyBtnHtml(label: string, payload: string, payloads: string[]): string {
  const ref = payloads.push(payload) - 1;
  return (
    `<button class="uc-copy" type="button" data-copy="" data-copy-ref="${ref}" ` +
    `aria-label="Copy ${escapeHtml(label)}" title="Copy">` +
    COPY_ICON_SVG +
    CHECK_ICON_SVG +
    '</button>'
  );
}

export function noteHtml(d: Diagnostic): string {
  const icon = d.level === 'warning' ? WARN_SVG : INFO_SVG;
  const where =
    d.where || typeof d.at === 'number'
      ? `<span class="uc-note__where">${escapeHtml(
          [d.where, typeof d.at === 'number' ? `index ${d.at}` : ''].filter(Boolean).join(' · '),
        )}</span>`
      : '';
  return (
    `<div class="uc-note uc-note--${d.level}">` +
    icon +
    `<span>${escapeHtml(d.message)}${where}</span></div>`
  );
}

export function notesBlockHtml(diagnostics: Diagnostic[]): string {
  const notes = diagnostics.filter((d) => d.level !== 'error');
  if (notes.length === 0) return '';
  const warnings = notes.filter((d) => d.level === 'warning').length;
  const label = warnings > 0 ? `Notes — ${warnings} warning${warnings === 1 ? '' : 's'}` : 'Notes';
  return (
    '<div class="uc-block">' +
    `<div class="uc-block__head"><span>${escapeHtml(label)}</span>` +
    `<span class="uc-block__actions"><span class="uc-meta">${notes.length} item${notes.length === 1 ? '' : 's'}</span></span></div>` +
    notes.map(noteHtml).join('') +
    '</div>'
  );
}

export function errorCardHtml(diagnostics: Diagnostic[], isAlert: boolean): string {
  const errors = diagnostics.filter((d) => d.level === 'error');
  if (errors.length === 0) return '';
  const extra =
    errors.length > 1
      ? `<p class="uc-error__more">${escapeHtml(
          `${errors.length - 1} more problem${errors.length === 2 ? '' : 's'}: ` +
            errors
              .slice(1)
              .map((d) => d.message)
              .join(' '),
        )}</p>`
      : '';
  return (
    `<div class="uc-error"${isAlert ? ' role="alert"' : ''}>` +
    ALERT_SVG +
    '<div><p class="uc-error__title">This input is not valid yet</p>' +
    `<p id="uc-error-detail" class="uc-error__detail">${escapeHtml(errors[0].message)}</p>` +
    extra +
    '</div></div>'
  );
}

/**
 * One key/value row. `display` is what the user reads (may be a placeholder
 * like "(empty value)"); `copyValue` is what the copy button puts on the
 * clipboard (the real value, which for a placeholder row is `''`).
 */
function rowHtml(
  key: string,
  keyExtra: string,
  display: string,
  copyValue: string,
  copyLabel: string,
  quiet: boolean,
  payloads: string[],
): string {
  return (
    '<div class="uc-row">' +
    `<div class="uc-row__k">${escapeHtml(key)}${keyExtra}</div>` +
    `<div class="uc-row__v-wrap"><span class="uc-row__v${quiet ? ' is-quiet' : ''}">${escapeHtml(display)}</span>` +
    copyBtnHtml(copyLabel, copyValue, payloads) +
    '</div></div>'
  );
}

export function componentsHtml(components: UrlComponent[], payloads: string[]): string {
  const rows = components
    .map((c) => {
      const gloss = c.gloss ? `<span class="uc-row__gloss">${escapeHtml(c.gloss)}</span>` : '';
      const raw =
        c.raw && c.raw !== c.value
          ? `<span class="uc-row__raw">raw: ${escapeHtml(c.raw)}</span>`
          : '';
      return rowHtml(c.label, gloss + raw, c.value, c.value, c.label, false, payloads);
    })
    .join('');
  return (
    '<div class="uc-block">' +
    '<div class="uc-block__head"><span>URL components</span>' +
    '<span class="uc-block__actions"><span class="uc-meta">as browsers see it</span></span></div>' +
    '<p class="uc-block__sub">The WHATWG-normalized value of each part, with the raw text you ' +
    'pasted underneath wherever normalization changed it — punycode hosts, dropped default ' +
    'ports, resolved paths.</p>' +
    rows +
    '</div>'
  );
}

export function badgesHtml(p: QueryParam): string {
  const badges: string[] = [];
  if (p.isDuplicate) badges.push('<span class="uc-badge uc-badge--warn">duplicate</span>');
  if (!p.hasValue) badges.push('<span class="uc-badge">bare key</span>');
  else if (p.value === '') badges.push('<span class="uc-badge">empty</span>');
  if (p.key.endsWith('[]')) badges.push('<span class="uc-badge">array-style</span>');
  if (p.doubleEncoded) badges.push('<span class="uc-badge uc-badge--warn">double-encoded</span>');
  if (p.rawValue !== null && p.rawValue !== p.value)
    badges.push('<span class="uc-badge uc-badge--ok">decoded</span>');
  return badges.length ? `<span class="uc-badges">${badges.join('')}</span>` : '';
}

export function paramsHtml(params: QueryParam[], rawQuery: string, payloads: string[]): string {
  const head =
    '<div class="uc-block__head"><span>Query parameters</span>' +
    `<span class="uc-block__actions"><span class="uc-meta">${params.length} row${params.length === 1 ? '' : 's'} · read-only</span></span></div>` +
    '<p class="uc-block__sub">Split on <span class="code-mono">&amp;</span> exactly the way ' +
    '<span class="code-mono">URLSearchParams</span> does, then percent-decoded. Repeated keys ' +
    'stay as separate rows — nothing here picks a winner for you.</p>';
  if (params.length === 0) {
    const message = rawQuery.length
      ? 'The query string is present but produced no parameters.'
      : 'No query string — nothing after a “?”.';
    return `<div class="uc-block">${head}<p class="uc-none">${escapeHtml(message)}</p></div>`;
  }
  // Cap rendered rows. 4 000 params built ~3.8 MB of innerHTML and 4 006 copy buttons,
  // blocking the main thread for ~2 s — the engine was linear; the DOM was the problem.
  // Same affordance as SubnetSplitterPlayground's "Showing first N of M".
  const shown = params.slice(0, MAX_RENDERED_PARAMS);
  const truncated =
    params.length > MAX_RENDERED_PARAMS
      ? `<p class="uc-none">Showing the first ${MAX_RENDERED_PARAMS} of ${params.length} parameters. Copy all still copies every row.</p>`
      : '';
  const rows = shown
    .map((p) => {
      const raw =
        p.rawValue === null
          ? `<span class="uc-row__raw">raw: ${escapeHtml(p.rawKey)}</span>`
          : `<span class="uc-row__raw">raw: ${escapeHtml(p.rawKey)}=${escapeHtml(p.rawValue)}</span>`;
      const quiet = !p.hasValue || p.value === '';
      const display = p.hasValue
        ? p.value === ''
          ? '(empty value)'
          : p.value
        : '(no value — bare key)';
      const keyLabel = p.key === '' ? '(empty name)' : p.key;
      return rowHtml(
        keyLabel,
        badgesHtml(p) + raw,
        display,
        p.value,
        `the value of ${keyLabel}`,
        quiet,
        payloads,
      );
    })
    .join('');
  return `<div class="uc-block">${head}${rows}${truncated}</div>`;
}

export function outputCardHtml(
  result: DecodeResult | EncodeResult,
  payloads: string[],
): string {
  const value = result.output;
  const isDecode = result.mode === 'decode';
  const meta: string[] = [];
  if (result.mode === 'decode') {
    meta.push(result.plusAsSpace ? '+ read as space' : '+ kept literal');
  } else if (result.jsEquivalent) {
    meta.push(`matches ${result.jsEquivalent}()`);
  } else {
    meta.push('stricter than encodeURIComponent()');
  }
  const again =
    result.mode === 'decode' && result.doubleEncoded
      ? '<button class="uc-again" type="button" data-again>Decode again →</button>'
      : '';
  const quiet = value.length === 0;
  const sub = isDecode
    ? 'Percent-decoding — every <span class="code-mono">%XX</span> escape turned back into the ' +
      'byte it stands for, then read as UTF-8.'
    : 'Percent-encoding — replacing a byte with <span class="code-mono">%</span> plus its two ' +
      'hex digits, so it survives inside a URL.';
  return (
    '<div class="uc-block">' +
    `<div class="uc-block__head"><span>${escapeHtml(MODE_COPY[result.mode].eyebrow)}</span>` +
    `<span class="uc-block__actions"><span class="uc-meta">${escapeHtml(meta.join(' · '))}</span>` +
    copyBtnHtml('the result', value, payloads) +
    '</span></div>' +
    `<p class="uc-block__sub">${sub}</p>` +
    '<div class="uc-out">' +
    `<p class="uc-out__value${quiet ? ' is-quiet' : ''}">${quiet ? 'Empty result.' : escapeHtml(value)}</p>` +
    '</div>' +
    again +
    '</div>'
  );
}

/* ---- Panels --------------------------------------------------------------- */

/** A successful run: the components card plus the parameter table, or the output card. */
export function resultHtml(result: RunResult): Rendered {
  const payloads: string[] = [];
  let html = '';
  if (result.mode === 'parse') {
    if (!result.queryOnly && result.components.length > 0) {
      html += componentsHtml(result.components, payloads);
    }
    html += paramsHtml(result.params, result.rawQuery, payloads);
  } else {
    html += outputCardHtml(result, payloads);
  }
  html += notesBlockHtml(result.diagnostics);
  return { html, payloads };
}

/**
 * A failed run: the error card first, then the notes — and, in parse mode, any
 * parameters that were still readable, because a URL with one broken escape
 * still has a query worth showing.
 */
export function invalidHtml(result: RunResult, isAlert: boolean): Rendered {
  const payloads: string[] = [];
  let html = errorCardHtml(result.diagnostics, isAlert) + notesBlockHtml(result.diagnostics);
  if (result.mode === 'parse' && (result as ParseResult).params.length > 0) {
    html += paramsHtml(result.params, result.rawQuery, payloads);
  }
  return { html, payloads };
}

/** "Copy all": the parameter table as text, or the components, or the output. */
export function copyAllText(result: RunResult, paramLines: (params: QueryParam[]) => string): string {
  if (result.mode !== 'parse') return result.output;
  if (result.params.length > 0) return paramLines(result.params);
  return result.components.map((c) => `${c.label}: ${c.value}`).join('\n');
}

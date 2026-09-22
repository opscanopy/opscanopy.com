/**
 * UUID / ULID Generator — the pure HTML builders for the results panel and the
 * inspector card.
 *
 * Shared by BOTH the Astro frontmatter and the island's <script>, so the two
 * can never drift apart — but the server render is a DELIBERATE PARTIAL.
 *
 * Generation is random by definition: `generateUuidV4` and `generateUlid` pull
 * from a CSPRNG (and a ULID also embeds `Date.now()`). Baking one of those into
 * the static HTML would serve every visitor — and quote to every crawler — the
 * same "random" identifier, which is worse than showing nothing. So the build
 * seeds only what this tool can state as fact at any moment on any machine:
 *
 *   • the Nil UUID (all bits zero, RFC 4122 §4.1.7), via `nilCardHtml`, with a
 *     labelled `data-client-only` note for the batch the browser will mint;
 *   • the inspection of one fixed example UUID, via `inspectResultHtml` —
 *     `inspectUuid` reads only its argument, so it is build-time stable.
 *
 * `src/lib/uuid-ulid-generator/render.test.ts` asserts the absence of any v4
 * UUID or ULID from the seeded card, so a future "just seed the batch too"
 * turns the suite red.
 *
 * Everything here is pure: no `window`, no `document`, no clock, no random.
 */
import { escapeHtml } from '../escape-html';
import type { GenerateMode, InspectResult } from './types';

export const COPY_ICON_SVG =
  '<svg class="uug-copy-icon" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="5" width="9" height="9" rx="1.5"/><path d="M3 11H2a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v1"/></svg>';
export const CHECK_ICON_SVG =
  '<svg class="uug-check-icon hidden" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 8.5l3.5 3.5L13 4.5"/></svg>';
export const ALERT_SVG =
  '<svg class="uug-error__icon" width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 2.5L18.5 17H1.5z"></path><path d="M10 8v4"></path><path d="M10 14.6v.01"></path></svg>';

/** The empty-state paragraph, so the SSR placeholder and the script agree. */
export const EMPTY_HTML =
  '<p class="uug-empty body-sm text-mute">Pick a type and press Generate — or tap an example — to produce ' +
  'identifiers here.</p>';

/**
 * The labelled stand-in for the one thing a build must never bake: a batch of
 * freshly minted, random identifiers. Honest about why it is not there.
 */
export const CLIENT_ONLY_HTML =
  '<p class="uug-client-only caption text-mute" data-client-only>UUID v4 and ULID values are minted in your ' +
  'browser from a secure random source — press Generate for a fresh batch.</p>';

export function copyBtnHtml(label: string, value: string): string {
  return (
    `<button class="uug-copy-btn" type="button" aria-label="Copy ${escapeHtml(label)}" data-copy="${escapeHtml(value)}">` +
    COPY_ICON_SVG +
    CHECK_ICON_SVG +
    '</button>'
  );
}

export function modeLabel(mode: GenerateMode): string {
  return mode === 'v4' ? 'UUID v4' : mode === 'nil' ? 'Nil UUID' : 'ULID';
}

/** The numbered, per-row-copyable list of generated values. */
export function valuesHtml(values: string[]): string {
  const rows = values
    .map(
      (v, i) =>
        '<div class="uug-val-row">' +
        `<span class="uug-val-row__idx">${i + 1}</span>` +
        `<span class="uug-val-row__v">${escapeHtml(v)}</span>` +
        copyBtnHtml(`value ${i + 1}`, v) +
        '</div>'
    )
    .join('');
  return `<div class="uug-rescard">${rows}</div>`;
}

/**
 * The build-time seed for the results panel: the Nil UUID — the only value
 * this generator can mint deterministically — plus the client-only note.
 * `nil` comes from the engine's `nilUuid()`, passed in so this module needs no
 * engine import of its own.
 */
export function nilCardHtml(nil: string): string {
  return valuesHtml([nil]) + CLIENT_ONLY_HTML;
}

export function generateErrorHtml(message: string): string {
  return (
    '<div class="uug-error">' +
    ALERT_SVG +
    '<div><p class="uug-error__title">Could not generate</p>' +
    `<p class="uug-error__detail">${escapeHtml(message)}</p></div></div>`
  );
}

/** The card shown when the engine chunk itself fails to arrive. */
export const LOAD_ERROR_HTML =
  '<div class="uug-error">' +
  ALERT_SVG +
  '<div><p class="uug-error__title">Could not load the generator</p>' +
  '<p class="uug-error__detail">Reload the page to try again.</p></div></div>';

export function inspectErrorHtml(message: string): string {
  return (
    '<div class="uug-rescard mt-3"><div class="uug-error">' +
    ALERT_SVG +
    '<div><p class="uug-error__title">Not a recognised identifier</p>' +
    `<p class="uug-error__detail">${escapeHtml(message)}</p></div></div></div>`
  );
}

/** The summary line beside "Generated". */
export function summaryText(
  mode: GenerateMode,
  count: number,
  uppercase: boolean,
  note: string
): string {
  const caseWord = mode === 'ulid' || uppercase ? 'uppercase' : 'lowercase';
  const countPart = mode === 'nil' ? '' : `${count} × `;
  let summary = `${countPart}${modeLabel(mode)} · ${caseWord}`;
  if (note) summary += ` · ${note}`;
  return summary;
}

/**
 * The inspector card for one pasted identifier. `value` is the raw input (used
 * for the card's title); an empty input renders nothing, mirroring the script's
 * "clear the box" branch.
 */
export function inspectResultHtml(value: string, res: InspectResult): string {
  const input = value.trim();
  if (input.length === 0) return '';
  if (!res || !res.valid) return inspectErrorHtml(res?.error ?? '');

  const rows: Array<{ k: string; v: string; mono?: boolean; copy?: boolean }> = [];
  if (res.kind === 'uuid') {
    rows.push({ k: 'Format', v: 'UUID (8-4-4-4-12 hex)' });
    if (typeof res.version === 'number') rows.push({ k: 'Version', v: String(res.version) });
    if (res.variant) rows.push({ k: 'Variant', v: res.variant });
  } else {
    rows.push({ k: 'Format', v: 'Crockford base32 ULID (26 chars)' });
    if (res.timestamp) rows.push({ k: 'Timestamp', v: res.timestamp, mono: true, copy: true });
    for (const n of res.notes ?? []) {
      const m = /^Unix \(ms\): (.+)$/.exec(n);
      if (m) rows.push({ k: 'Unix (ms)', v: m[1], mono: true, copy: true });
      const r = /^Randomness: (.+)$/.exec(n);
      if (r) rows.push({ k: 'Randomness', v: r[1], mono: true });
    }
  }

  const rowsHtml = rows
    .map((row) => {
      const cls = row.mono ? 'uug-kv-row__v is-mono' : 'uug-kv-row__v';
      const copy = row.copy ? copyBtnHtml(row.k, row.v) : '';
      return (
        '<div class="uug-kv-row">' +
        `<span class="uug-kv-row__k">${escapeHtml(row.k)}</span>` +
        `<span class="uug-kv-row__v-wrap"><span class="${cls}">${escapeHtml(row.v)}</span>${copy}</span>` +
        '</div>'
      );
    })
    .join('');

  const badge = res.kind === 'ulid' ? 'ULID' : 'UUID';
  return (
    '<div class="uug-rescard mt-3">' +
    `<div class="uug-kv-title"><span class="uug-badge">${badge}</span><span class="uug-kv-title__net">${escapeHtml(input)}</span></div>` +
    rowsHtml +
    '</div>'
  );
}

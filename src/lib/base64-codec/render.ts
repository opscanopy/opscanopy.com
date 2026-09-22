/**
 * Base64 Encoder / Decoder — the pure HTML builders for the output panel.
 *
 * Shared by BOTH the Astro frontmatter (which server-renders the seeded
 * example so a no-JS visitor — and every AI crawler, which does not execute
 * JS — sees a real computed answer) and the island's <script> (which rebuilds
 * the same markup on every eval). One implementation, so the two can never
 * drift apart.
 *
 * Everything here is pure: no `window`, no `document`, no clock. The hand-off
 * chips carry a bare `data-handoff-to` path — the browser localizes it on
 * click, so no locale prefix is needed at build time.
 */
import { escapeHtml } from '../escape-html';
import type { Base64Result } from './types';

export const ALERT_SVG =
  '<svg class="b64-error__icon" width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 2.5L18.5 17H1.5z"></path><path d="M10 8v4"></path><path d="M10 14.6v.01"></path></svg>';

/** The empty-state paragraph, so the SSR placeholder and the client agree. */
export const EMPTY_HTML =
  '<p class="b64-empty body-sm text-mute">Type or paste on the left, then flip Encode / Decode — the result appears here, ready to copy.</p>';

/**
 * Secret-safe handoff chains (never a #-fragment — a JWT or arbitrary text
 * here may be a secret, which is exactly why this tool is excluded from
 * URL-hash sharing; see src/lib/tool-state/handoff.ts).
 */
const JWT_SHAPE = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*$/;

export function chainsHtml(rawInput: string): string {
  const trimmed = rawInput.trim();
  const chips: string[] = [];
  if (JWT_SHAPE.test(trimmed)) {
    chips.push('<button type="button" class="b64-chip" data-handoff-to="/jwt-decoder/">Decode as JWT &rarr;</button>');
  }
  if (trimmed.length > 0) {
    chips.push('<button type="button" class="b64-chip" data-handoff-to="/hash-generator/">Hash this text &rarr;</button>');
  }
  return chips.length > 0 ? `<div class="b64-chips">${chips.join('')}</div>` : '';
}

/** The "N bytes" line for the status slot ('' when the engine gave no count). */
export function summaryText(result: Base64Result): string {
  const bytes = typeof result.bytes === 'number' ? result.bytes : null;
  if (bytes === null) return '';
  return `${bytes} ${bytes === 1 ? 'byte' : 'bytes'}`;
}

export function errorHtml(message: string): string {
  return (
    '<div class="b64-error" role="alert">' +
    ALERT_SVG +
    '<div><p class="b64-error__title">Could not convert that input</p>' +
    `<p class="b64-error__detail">${escapeHtml(message)}</p></div></div>`
  );
}

export function resultHtml(result: Base64Result, rawInput: string): string {
  const out = typeof result.output === 'string' ? result.output : '';
  const bytes = typeof result.bytes === 'number' ? result.bytes : null;
  const noun = bytes === 1 ? 'byte' : 'bytes';

  const isEmptyText = out.length === 0;
  const bodyCls = isEmptyText ? 'b64-result__body is-empty-text' : 'b64-result__body';
  const bodyText = isEmptyText ? '(empty result)' : out;

  const metaBits: string[] = [];
  if (bytes !== null) metaBits.push(`<span>${bytes} ${noun}</span>`);
  if (result.note) metaBits.push(`<span class="b64-result__note">${escapeHtml(result.note)}</span>`);
  const meta = metaBits.length
    ? `<div class="b64-result__meta">${metaBits.join('')}</div>`
    : '';

  return (
    '<div class="b64-result">' +
    `<pre class="${bodyCls}"><code>${escapeHtml(bodyText)}</code></pre>` +
    meta +
    '</div>' +
    chainsHtml(rawInput)
  );
}

/**
 * LLM Token Counter — pure HTML builders shared by the Astro frontmatter (SSR seed) and the
 * island's <script>. No window, no document, no clock. Every value is escaped; value elements
 * carry `data-k` for the changed-value tick.
 */
import { escapeHtml } from '../escape-html';
import { ENCODINGS, VIS_MAX_TOKENS, costUsd } from './engine';
import type { TokenCount } from './types';

export const EMPTY_HTML =
  '<p class="ltc-empty body-sm text-inverse-mute">Paste or type text to count its tokens.</p>';

const int = (n: number) => n.toLocaleString('en-US');
const ratio = (r: TokenCount) => r.charsPerToken.toFixed(2);
/** Dollars: 2 decimals from $1, else 3 significant figures, so a 15-token prompt reads $0.0000375, not $0.0000. */
export const formatUsd = (usd: number): string =>
  usd === 0 ? '$0' : usd >= 1 ? `$${usd.toFixed(2)}` : `$${Number(usd.toPrecision(3))}`;
const cost = (r: TokenCount, price: number) => formatUsd(costUsd(r.tokens.length, price));
const encodingOf = (r: TokenCount) => ENCODINGS.find((e) => e.id === r.encoding);

function stat(label: string, valueHtml: string): string {
  return (
    '<div class="ltc-stat">' +
    `<span class="ltc-stat__k">${escapeHtml(label)}</span>` +
    `<span class="ltc-stat__v" data-k="stat:${escapeHtml(label)}">${valueHtml}</span>` +
    '</div>'
  );
}

export function errorHtml(message: string): string {
  return `<p class="ltc-error text-inverse-error" role="alert">${escapeHtml(message)}</p>`;
}

export function resultHtml(r: TokenCount, opts: { price?: number } = {}): string {
  const { price } = opts;
  const costHtml =
    price === undefined
      ? '—<span class="ltc-client-only" data-client-only>enter a price above</span>'
      : escapeHtml(cost(r, price));
  const stats =
    stat('Tokens', int(r.tokens.length)) +
    stat('Characters', int(r.chars)) +
    stat('Words', int(r.words)) +
    stat('Bytes', int(r.bytes)) +
    stat('Chars per token', ratio(r)) +
    stat('Cost', costHtml);

  const vis =
    r.tokens.length > VIS_MAX_TOKENS
      ? `<p class="ltc-vis-note body-sm text-inverse-mute">${int(r.tokens.length)} tokens — the visualiser shows up to ${int(VIS_MAX_TOKENS)}; the counts above cover the full text.</p>`
      : '<p class="ltc-tokens" aria-hidden="true">' +
        r.spans
          .map((s) => `<span class="ltc-tok" title="token ${s.ids.join(' ')}">${escapeHtml(s.text)}</span>`)
          .join('') +
        '</p>';

  const e = encodingOf(r);
  return (
    '<div class="ltc-card">' +
    `<div class="ltc-stats">${stats}</div>` +
    `<h3 class="ltc-group__h">Tokens</h3>${vis}` +
    `<p class="ltc-encoding body-sm text-inverse-mute"><span class="code-mono">${escapeHtml(r.encoding)}</span> — ${escapeHtml(e?.models ?? '')}</p>` +
    '</div>'
  );
}

/** One line for the role="status" summary. */
export function summaryText(r: TokenCount): string {
  const n = r.tokens.length;
  return `${int(n)} ${n === 1 ? 'token' : 'tokens'} in ${r.encoding} — ${int(r.chars)} characters, ${ratio(r)} chars per token.`;
}

/** "Label: value" lines for the Copy all button. */
export function buildCopyAll(r: TokenCount, price?: number): string {
  const lines = [
    `Encoding: ${r.encoding}`,
    `Tokens: ${r.tokens.length}`,
    `Characters: ${r.chars}`,
    `Words: ${r.words}`,
    `Bytes: ${r.bytes}`,
    `Chars per token: ${ratio(r)}`,
  ];
  if (price !== undefined) lines.push(`Cost: ${cost(r, price)} at $${price} per 1M tokens`);
  return lines.join('\n');
}

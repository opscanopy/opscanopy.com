/**
 * PromQL Explainer — the pure HTML builders for the explanation panel.
 *
 * Shared by BOTH the Astro frontmatter (which server-renders the seeded
 * example so a no-JS visitor — and every AI crawler, which does not execute
 * JS — sees the real plain-English reading and the token breakdown) and the
 * island's <script> (which rebuilds the same markup on every explain). One
 * implementation, so the two can never drift apart.
 *
 * `explain()` is pure, synchronous and clock-free, so the whole result is safe
 * to bake at build time. Everything here is pure: no `window`, no `document`.
 */
import { escapeHtml } from '../escape-html';
import type { ExplainPart, ExplainResult } from './types';

export const ALERT_SVG =
  '<svg class="pq-error__icon" width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 2.5L18.5 17H1.5z"></path><path d="M10 8v4"></path><path d="M10 14.6v.01"></path></svg>';

/** The empty-state paragraph, so the SSR placeholder and `renderEmpty` agree. */
export const EMPTY_HTML =
  '<p class="pq-empty body-sm text-mute">Load an example or paste your own PromQL query, then explain it to see a plain-English summary and a token-by-token breakdown here.</p>';

export const LOADING_HTML =
  '<div class="pq-loading"><span class="pq-loading__dot"></span>' +
  '<span class="pq-loading__dot"></span><span class="pq-loading__dot"></span>' +
  '<span>Explaining…</span></div>';

export function errorHtml(message: string): string {
  return (
    '<div class="pq-error" role="alert">' +
    ALERT_SVG +
    '<div class="pq-error__body"><p class="pq-error__title">Could not explain this query</p>' +
    `<p class="pq-error__detail">${escapeHtml(message)}</p></div></div>`
  );
}

/** Normalise a result's breakdown into a clean part list (drops blank rows). */
export function normaliseBreakdown(raw: unknown): ExplainPart[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      const o = (item ?? {}) as Record<string, unknown>;
      return {
        token: typeof o.token === 'string' ? o.token : '',
        meaning: typeof o.meaning === 'string' ? o.meaning : '',
      } satisfies ExplainPart;
    })
    .filter((p) => p.token.length > 0 || p.meaning.length > 0);
}

function partHtml(p: ExplainPart): string {
  const token = p.token ? `<code class="pq-part__token">${escapeHtml(p.token)}</code>` : '';
  const meaning = p.meaning ? `<span class="pq-part__meaning">${escapeHtml(p.meaning)}</span>` : '';
  return `<li class="pq-part">${token}${meaning}</li>`;
}

/** The status-line text beside "Explanation": "Error", "", "Explained", "N parts". */
export function summaryText(result: ExplainResult): string {
  if (!result || result.error) return 'Error';
  const breakdown = normaliseBreakdown(result.breakdown);
  const explanation = typeof result.explanation === 'string' ? result.explanation : '';
  if (!explanation && breakdown.length === 0) return '';
  const n = breakdown.length;
  return n > 0 ? `${n} ${n === 1 ? 'part' : 'parts'}` : 'Explained';
}

/**
 * The explanation panel: the prose card followed by the token → meaning list.
 * An error result becomes the alert banner; a result with nothing to say
 * becomes the empty state — so the frontmatter and the client render the same
 * thing for every shape the engine can return.
 */
export function resultHtml(result: ExplainResult): string {
  if (!result || result.error) {
    return errorHtml(result?.error ?? 'Unknown error while explaining the query.');
  }
  const breakdown = normaliseBreakdown(result.breakdown);
  const explanation = typeof result.explanation === 'string' ? result.explanation : '';
  if (!explanation && breakdown.length === 0) return EMPTY_HTML;

  const explanationHtml = explanation
    ? '<div class="pq-explanation">' +
      `<p class="pq-explanation__text">${escapeHtml(explanation)}</p></div>`
    : '';
  const breakdownHtml =
    breakdown.length > 0 ? `<ul class="pq-breakdown">${breakdown.map(partHtml).join('')}</ul>` : '';
  return explanationHtml + breakdownHtml;
}

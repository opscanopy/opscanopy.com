/**
 * GitHub Actions Expression Tester — the pure HTML builders for the expression
 * tab's result panel.
 *
 * Shared by BOTH the Astro frontmatter (which server-renders the seeded
 * footgun example so a no-JS visitor — and every AI crawler, which does not
 * execute JS — sees the real TRUE/FALSE verdict, the substituted value and the
 * runner#1173 warning) and the island's <script> (which rebuilds the same
 * markup on every evaluation). One implementation, so the two can never drift.
 *
 * `evaluateIfCondition()` is pure and `defaultContext()` is a frozen literal,
 * so the seed is deterministic and safe to bake at build time. The trigger tab
 * is NOT seeded — its builders stay in the island — but it borrows `warnHtml`
 * and `evalErrorHtml` from here so the two tabs' warnings look identical.
 *
 * Everything here is pure: no `window`, no `document`, no clock.
 */
import { escapeHtml } from '../escape-html';
import type { EvaluateResult } from './types';

export const WARN_SVG =
  '<svg class="ga-warn__icon" width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 2.5L18.5 17H1.5z"></path><path d="M10 8v4"></path><path d="M10 14.6v.01"></path></svg>';

/** The expression tab's empty state, so the SSR placeholder and the client agree. */
export const EXPR_EMPTY_HTML =
  '<p class="ga-empty body-sm text-mute">Load an example or write an <span class="code-mono">if:</span> condition, ' +
  'then Evaluate to see whether it is true, the returned value, and a token-by-token breakdown.</p>';

/** The shape both tabs' warnings share (the engine's `ExprWarning` satisfies it). */
export interface WarnLike {
  id: string;
  severity: string;
  message: string;
}

/** One advisory card. Infos are notes; everything else is an alert. */
export function warnHtml(w: WarnLike): string {
  const isInfo = w.severity === 'info';
  const title =
    w.id === 'literal-if-always-true'
      ? 'Always-true footgun (runner#1173)'
      : isInfo
        ? 'Note'
        : 'Warning';
  return (
    `<div class="ga-warn ${isInfo ? 'is-info' : ''}" role="${isInfo ? 'note' : 'alert'}">${WARN_SVG}` +
    `<div class="ga-warn__body"><p class="ga-warn__title">${escapeHtml(title)}</p><p>${escapeHtml(w.message)}</p></div></div>`
  );
}

/** The red card for a thrown error or an unparseable workflow. */
export function evalErrorHtml(title: string, detail: string): string {
  return (
    `<div class="ga-error" role="alert">${WARN_SVG}<div><p class="ga-warn__title">${escapeHtml(title)}</p>` +
    `<p class="ga-error__detail">${escapeHtml(detail)}</p></div></div>`
  );
}

/** The status-line text beside "Result": the bare truthiness word. */
export function exprSummaryText(result: Pick<EvaluateResult, 'truthy'>): string {
  return result.truthy ? 'true' : 'false';
}

export interface ExprRenderOptions {
  /** `parseContext(...).error` — when the mock context JSON was unusable. */
  contextError?: string;
}

/**
 * The expression tab's whole result panel: verdict card, optional context
 * note, the engine's warnings, the inside-out explanation and the token
 * breakdown.
 */
export function exprResultHtml(result: EvaluateResult, opts: ExprRenderOptions = {}): string {
  const badge = `<span class="ga-verdict__badge ${result.truthy ? 'is-true' : 'is-false'}">${result.truthy ? 'TRUE' : 'FALSE'}</span>`;
  const renderedTxt = result.value === null ? 'null (an empty string)' : result.rendered;
  const verdict =
    `<div class="ga-verdict">${badge}<div class="ga-verdict__text">An <code class="code-mono">if:</code> using this would ` +
    `<strong>${result.truthy ? 'RUN' : 'SKIP'}</strong> the step. Returned value: ` +
    `<span class="ga-rendered">${escapeHtml(renderedTxt)}</span>.</div></div>`;
  const ctxErr = opts.contextError
    ? warnHtml({ id: 'ctx', severity: 'info', message: `${opts.contextError} Using the default context.` })
    : '';
  const warns = result.warnings.map(warnHtml).join('');
  const explanation = `<p class="ga-explanation">${escapeHtml(result.explanation)}</p>`;
  const breakdown = result.breakdown.length
    ? `<ul class="ga-breakdown">${result.breakdown
        .map(
          (p) =>
            `<li class="ga-part"><code class="ga-part__token">${escapeHtml(p.token)}</code>` +
            `<span class="ga-part__meaning">${escapeHtml(p.meaning)}</span></li>`,
        )
        .join('')}</ul>`
    : '';
  return verdict + ctxErr + warns + explanation + breakdown;
}

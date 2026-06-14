/**
 * The #1 GitHub Actions footgun (actions/runner#1173).
 *
 * GitHub treats an `if:` value as an expression. The runner ONLY evaluates the
 * parts inside `${{ }}`; any operator/literal text OUTSIDE the delimiters is left
 * as literal text after substitution. Because a non-empty string is always
 * truthy, a condition like:
 *
 *     if: ${{ github.event_name }} == 'push'
 *
 * substitutes `${{ github.event_name }}` to e.g. `push`, leaving the literal
 * string `push == 'push'` — which, as a whole non-empty string, is ALWAYS TRUE.
 * The fix is to wrap the WHOLE condition in one `${{ … }}`:
 *
 *     if: ${{ github.event_name == 'push' }}
 *
 * This module detects both shapes (mixed text outside `${{ }}`, and bare literal
 * text with no delimiters) and returns a warning the island surfaces prominently.
 */
import type { ExprWarning } from './types';
import { parse } from './expr-parser';

const SPAN_RE = /\$\{\{[\s\S]*?\}\}/g;

/** Analyse a full `if:` value. Returns a warning when the footgun is present. */
export function analyzeIfCondition(raw: string): ExprWarning | null {
  const text = raw.trim();
  if (text === '') return null;

  const spans = [...text.matchAll(SPAN_RE)];

  // Case A — no ${{ }} at all.
  if (spans.length === 0) {
    // GitHub evaluates a bare `if:` value as an expression too, so
    // `if: success()` and `if: github.ref == 'refs/heads/main'` are valid and
    // NOT always-true. Only warn when the text is NOT a valid expression — i.e.
    // genuine literal prose like "merge me" that coerces to a truthy string.
    const lowered = text.toLowerCase();
    if (lowered === 'true' || lowered === 'false') return null;
    if (!parse(text).error) return null;
    return {
      id: 'literal-if-always-true',
      severity: 'warning',
      message:
        'This if: has no ${{ }} and is not a valid expression, so GitHub treats it as a non-empty string — it is ALWAYS true. Wrap the whole condition in ${{ … }}.',
      from: 0,
      to: raw.length,
    };
  }

  // Case B — one or more ${{ }} spans, but meaningful text exists OUTSIDE them.
  // After substitution that leftover text makes the whole value a literal string.
  const outside = text.replace(SPAN_RE, '').trim();
  if (outside !== '') {
    return {
      id: 'literal-if-always-true',
      severity: 'warning',
      message:
        'Operators (==, &&, …) appear OUTSIDE ${{ }}. After substitution the result is a literal string, which is always true. Move the ENTIRE condition inside one ${{ … }}.',
      from: 0,
      to: raw.length,
    };
  }

  return null;
}

/** Extract the bare expression body from an `if:` value for evaluation.
 *  If the whole (trimmed) value is exactly one `${{ … }}`, return its inner
 *  body; otherwise return the raw string (the evaluator will parse it as a body,
 *  and the footgun warning will already have fired). */
export function extractExpressionBody(raw: string): string {
  const text = raw.trim();
  const m = text.match(/^\$\{\{([\s\S]*)\}\}$/);
  if (m) return m[1].trim();
  return text;
}

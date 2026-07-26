/**
 * GitHub Actions Expression & Trigger Tester — PUBLIC façade.
 *
 * This is the only module the island (GithubActionsExpressionPlayground.astro)
 * imports. It fans out to the expression VM (parser + evaluator + functions) and
 * the trigger simulator. Every entry is synchronous, deterministic, and NEVER
 * throws — fatal problems come back via the result's `error`/`warnings`.
 */
import type { EvalContext, EvaluateResult } from './types';
import { parse } from './expr-parser';
import { evaluateAst } from './expr-eval';
import { analyzeIfCondition, extractExpressionBody } from './if-footgun';
import { defaultContext } from './context';
import { matchList } from './glob';
import { render, truthy } from './values';
import { GHA_SEMANTICS_VERSION } from './conformance';

export { simulateTriggers } from './triggers';
export { GHA_SEMANTICS_VERSION } from './conformance';
export { defaultContext, parseContext } from './context';
export type {
  EvalContext,
  EvaluateResult,
  ExprPart,
  ExprWarning,
  GhaValue,
  SimEvent,
  SimulateResult,
  JobDecision,
  FilterTrace,
} from './types';

/** Evaluate a BARE expression body (no `${{ }}` delimiters). Never throws. */
export function evaluateExpression(expr: string, ctx: EvalContext = defaultContext()): EvaluateResult {
  const { ast, error } = parse(expr);
  const out = evaluateAst(ast, ctx);
  return {
    value: out.value,
    rendered: render(out.value),
    truthy: truthy(out.value),
    explanation: out.explanation,
    breakdown: out.breakdown,
    warnings: out.warnings,
    error,
    semanticsVersion: GHA_SEMANTICS_VERSION,
  };
}

/** Evaluate a full `if:` VALUE (may contain `${{ }}` + literal text). Runs the
 *  actions/runner#1173 footgun analysis in addition to evaluation. Never throws. */
export function evaluateIfCondition(raw: string, ctx: EvalContext = defaultContext()): EvaluateResult {
  const footgun = analyzeIfCondition(raw);
  const body = extractExpressionBody(raw);

  if (footgun) {
    // Model what the runner ACTUALLY does, rather than reporting the failed
    // parse of a string that was never a single expression.
    //
    // extractExpressionBody only unwraps `${{ … }}` when it spans the WHOLE
    // value, so here it hands back the raw text; evaluating that as one
    // expression fails on the literal `${{` and yields ''/false. The UI then
    // rendered "would SKIP the step" directly above a warning saying the
    // condition is ALWAYS TRUE — the two contradicted each other in exactly
    // the case this tool exists to explain (actions/runner#1173).
    //
    // The runner substitutes each `${{ }}` span in place, leaves the text
    // between spans literal, and coerces the resulting STRING. So substitute,
    // then apply string truthiness: non-empty wins, which is the whole bug.
    const substituted = substituteSpans(raw, ctx);
    return {
      value: substituted,
      rendered: substituted,
      truthy: truthy(substituted),
      // Field is `breakdown`, not `parts` — the playground reads
      // `result.breakdown.length` OUTSIDE its try/catch, so getting this name
      // wrong throws a TypeError and the whole result panel silently fails to
      // render. Keep the empty array: the warning and explanation carry the
      // message here, and a partial token gloss of a non-expression would
      // mislead more than it helps.
      breakdown: [],
      warnings: [footgun],
      // `error` is `string | undefined` — omit it rather than passing null.
      // There is no parse failure here: the substitution succeeded, and the
      // footgun is reported as a warning, not an error.
      explanation:
        'GitHub only evaluates what is inside ${{ }} — the rest stays literal text. ' +
        `After substitution this if: becomes the string "${substituted}", which is ` +
        'non-empty and therefore ALWAYS true. The step runs on every event.',
      semanticsVersion: GHA_SEMANTICS_VERSION,
    };
  }

  return evaluateExpression(body, ctx);
}

/**
 * Replace every `${{ … }}` span with its evaluated, rendered value, leaving all
 * text outside the spans exactly as written. This reproduces the runner's
 * substitution pass for an `if:` value that is not one single expression.
 *
 * A span that fails to evaluate renders empty, matching the runner treating an
 * unresolvable context lookup as the empty string.
 */
function substituteSpans(raw: string, ctx: EvalContext): string {
  return raw.trim().replace(/\$\{\{([\s\S]*?)\}\}/g, (_match, inner: string) => {
    const res = evaluateExpression(String(inner).trim(), ctx);
    return res.error ? '' : res.rendered;
  });
}

/** Test one ref/path name against one filter pattern (for the cheat-sheet). */
export function testGlob(name: string, pattern: string): { matched: boolean; reason: string } {
  const { included, decidedBy } = matchList(name, [pattern]);
  return {
    matched: included,
    reason: included ? `"${name}" matches ${decidedBy}.` : `"${name}" does not match "${pattern}".`,
  };
}

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
  const base = evaluateExpression(body, ctx);
  if (footgun) {
    return {
      ...base,
      warnings: [footgun, ...base.warnings],
      explanation:
        'GitHub only evaluates what is inside ${{ }} — the rest stays literal text. ' +
        'After substitution this if: becomes a non-empty string, so it is ALWAYS true. ' +
        base.explanation,
    };
  }
  return base;
}

/** Test one ref/path name against one filter pattern (for the cheat-sheet). */
export function testGlob(name: string, pattern: string): { matched: boolean; reason: string } {
  const { included, decidedBy } = matchList(name, [pattern]);
  return {
    matched: included,
    reason: included ? `"${name}" matches ${decidedBy}.` : `"${name}" does not match "${pattern}".`,
  };
}

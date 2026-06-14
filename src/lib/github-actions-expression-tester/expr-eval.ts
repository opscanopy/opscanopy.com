/**
 * GitHub Actions expression evaluator — walks an `Expr` AST against an
 * `EvalContext`, applying GitHub's EXACT coercion/operator rules (see values.ts)
 * and the function library (functions.ts). It collects non-fatal warnings,
 * produces a deterministic value, and builds a plain-English explanation plus a
 * token-by-token breakdown for the playground. It never throws.
 */
import type { Expr } from './expr-parser';
import type { EvalContext, ExprPart, ExprWarning, GhaObject, GhaValue } from './types';
import { callFunction, type FnContext } from './functions';
import {
  castToNumber,
  ciGet,
  compare,
  isGhaArray,
  isGhaObject,
  looseEquals,
  render,
  truthy,
} from './values';

const KNOWN_CONTEXTS = new Set([
  'github',
  'env',
  'job',
  'jobs',
  'steps',
  'runner',
  'needs',
  'matrix',
  'strategy',
  'inputs',
  'vars',
  'secrets',
]);

export interface EvalOutput {
  value: GhaValue;
  warnings: ExprWarning[];
  explanation: string;
  breakdown: ExprPart[];
}

/** Evaluate an AST. Never throws. */
export function evaluateAst(ast: Expr, ctx: EvalContext): EvalOutput {
  const warnings: ExprWarning[] = [];
  const seenWarn = new Set<string>();
  const warn = (w: ExprWarning) => {
    const key = `${w.id}:${w.message}`;
    if (seenWarn.has(key)) return;
    seenWarn.add(key);
    warnings.push(w);
  };
  const fctx: FnContext = { ctx, warn };

  let value: GhaValue = null;
  try {
    value = evalNode(ast, ctx, fctx);
  } catch {
    value = null;
  }

  const breakdown = buildBreakdown(ast, ctx);
  const explanation = describeResult(ast, value);
  return { value, warnings, explanation, breakdown };
}

/* ── core evaluation ─────────────────────────────────────────────────────── */

function evalNode(node: Expr, ctx: EvalContext, f: FnContext): GhaValue {
  switch (node.t) {
    case 'lit':
      return node.value;
    case 'ctx':
      return resolveContext(node.name, ctx, f);
    case 'prop':
      return getProp(evalNode(node.obj, ctx, f), node.name);
    case 'index':
      return getIndex(evalNode(node.obj, ctx, f), evalNode(node.index, ctx, f));
    case 'filter':
      return applyFilter(evalNode(node.obj, ctx, f));
    case 'call':
      return callFunction(
        node.name,
        node.args.map((a) => evalNode(a, ctx, f)),
        f,
      );
    case 'not':
      return !truthy(evalNode(node.arg, ctx, f));
    case 'logic': {
      const left = evalNode(node.left, ctx, f);
      if (node.op === '&&') return truthy(left) ? evalNode(node.right, ctx, f) : left;
      return truthy(left) ? left : evalNode(node.right, ctx, f);
    }
    case 'eq': {
      const eq = looseEquals(evalNode(node.left, ctx, f), evalNode(node.right, ctx, f));
      return node.op === '==' ? eq : !eq;
    }
    case 'cmp':
      return compare(evalNode(node.left, ctx, f), node.op, evalNode(node.right, ctx, f));
    case 'error':
      return null;
  }
}

function resolveContext(name: string, ctx: EvalContext, f: FnContext): GhaValue {
  const lower = name.toLowerCase();
  if (!KNOWN_CONTEXTS.has(lower)) {
    f.warn({
      id: 'unknown-context',
      severity: 'info',
      message: `"${name}" is not a recognised GitHub Actions context. Known contexts: github, env, job, steps, runner, needs, matrix, strategy, inputs, vars, secrets.`,
    });
    return null;
  }
  const record = ctx as unknown as Record<string, GhaValue | undefined>;
  const v = record[lower];
  return v === undefined ? null : v;
}

function getProp(obj: GhaValue, name: string): GhaValue {
  if (isGhaObject(obj)) return ciGet(obj, name);
  if (isGhaArray(obj)) return obj.map((el) => getProp(el, name)); // object-filter mapping
  return null;
}

function getIndex(obj: GhaValue, idx: GhaValue): GhaValue {
  if (isGhaArray(obj)) {
    const n = castToNumber(idx);
    if (Number.isInteger(n) && n >= 0 && n < obj.length) return obj[n];
    return null;
  }
  if (isGhaObject(obj)) return ciGet(obj, render(idx));
  return null;
}

function applyFilter(obj: GhaValue): GhaValue {
  if (isGhaArray(obj)) return obj;
  if (isGhaObject(obj)) return Object.values(obj);
  return null;
}

/* ── explanation ─────────────────────────────────────────────────────────── */

function describeResult(ast: Expr, value: GhaValue): string {
  const isTruthy = truthy(value);
  let lead = 'This expression ';
  switch (ast.t) {
    case 'logic':
      lead +=
        ast.op === '&&'
          ? 'requires both sides to be truthy, and '
          : 'returns the first truthy side (the default-value idiom), and ';
      break;
    case 'eq':
      lead += 'compares two values for equality, and ';
      break;
    case 'cmp':
      lead += 'compares two values numerically, and ';
      break;
    case 'not':
      lead += 'negates its operand, and ';
      break;
    case 'call':
      lead += `calls ${ast.name}(), and `;
      break;
    case 'error':
      return 'This expression could not be parsed, so it evaluates to null (an empty string) and is falsy.';
    default:
      break;
  }
  return `${lead}evaluates to ${describeValue(value)}, which is ${
    isTruthy ? 'truthy' : 'falsy'
  } — an if: using it would ${isTruthy ? 'RUN' : 'SKIP'} the step.`;
}

function describeValue(v: GhaValue): string {
  if (v === null) return 'null (an empty string when substituted)';
  if (typeof v === 'string') return `the string "${v}"`;
  if (typeof v === 'boolean') return String(v);
  if (typeof v === 'number') return String(v);
  const json = render(v);
  return json.length > 80 ? `${json.slice(0, 77)}…` : json;
}

/* ── breakdown ───────────────────────────────────────────────────────────── */

function buildBreakdown(ast: Expr, ctx: EvalContext): ExprPart[] {
  const rows: ExprPart[] = [];
  const noopF: FnContext = { ctx, warn: () => {} };
  const evalSafe = (n: Expr): GhaValue => {
    try {
      return evalNode(n, ctx, noopF);
    } catch {
      return null;
    }
  };

  const walk = (node: Expr, isChainChild: boolean): void => {
    switch (node.t) {
      case 'ctx':
        if (!isChainChild) {
          rows.push({
            token: exprToString(node),
            meaning: `the ${node.name} context → ${describeValue(evalSafe(node))}`,
          });
        }
        break;
      case 'prop':
      case 'index':
      case 'filter': {
        if (!isChainChild) {
          rows.push({
            token: exprToString(node),
            meaning: `resolves to ${describeValue(evalSafe(node))}`,
          });
        }
        walk(node.obj, true);
        if (node.t === 'index') walk(node.index, false);
        break;
      }
      case 'call': {
        rows.push({
          token: exprToString(node),
          meaning: `${functionMeaning(node.name)} → ${describeValue(evalSafe(node))}`,
        });
        node.args.forEach((a) => walk(a, false));
        break;
      }
      case 'logic':
        rows.push({
          token: `${node.op}`,
          meaning:
            node.op === '&&'
              ? 'logical AND — returns the right operand when the left is truthy, otherwise the left'
              : 'logical OR — returns the left operand when it is truthy, otherwise the right (default value)',
        });
        walk(node.left, false);
        walk(node.right, false);
        break;
      case 'eq':
        rows.push({
          token: node.op,
          meaning:
            node.op === '=='
              ? 'equality — strings compare case-insensitively; mixed types coerce to number'
              : 'inequality — the negation of ==',
        });
        walk(node.left, false);
        walk(node.right, false);
        break;
      case 'cmp':
        rows.push({
          token: node.op,
          meaning: 'numeric comparison — both operands are coerced to a number first',
        });
        walk(node.left, false);
        walk(node.right, false);
        break;
      case 'not':
        rows.push({ token: '!', meaning: 'logical NOT — the only operator that returns a real boolean' });
        walk(node.arg, false);
        break;
      default:
        break;
    }
  };

  walk(ast, false);
  // De-duplicate identical token rows and cap the list.
  const seen = new Set<string>();
  const out: ExprPart[] = [];
  for (const r of rows) {
    const key = `${r.token}|${r.meaning}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
    if (out.length >= 14) break;
  }
  return out;
}

function functionMeaning(name: string): string {
  switch (name.toLowerCase()) {
    case 'contains':
      return 'contains(search, item) — substring (string) or membership (array), case-insensitive';
    case 'startswith':
      return 'startsWith(s, prefix) — case-insensitive prefix test';
    case 'endswith':
      return 'endsWith(s, suffix) — case-insensitive suffix test';
    case 'format':
      return 'format(fmt, …) — substitutes {0}, {1}, … placeholders';
    case 'join':
      return 'join(array, sep) — joins array elements with a separator';
    case 'tojson':
      return 'toJSON(value) — pretty JSON of the value';
    case 'fromjson':
      return 'fromJSON(string) — parses JSON into an object/array/value';
    case 'hashfiles':
      return 'hashFiles(…) — not available client-side (placeholder)';
    case 'success':
      return 'success() — true when no previous step/job failed';
    case 'failure':
      return 'failure() — true when a previous step/job failed';
    case 'always':
      return 'always() — always true, even on cancellation';
    case 'cancelled':
      return 'cancelled() — true when the run was cancelled';
    default:
      return `${name}() — unknown function`;
  }
}

/** Canonical source-ish rendering of an AST node (for breakdown tokens). */
export function exprToString(node: Expr): string {
  switch (node.t) {
    case 'lit':
      if (node.value === null) return 'null';
      if (typeof node.value === 'string') return `'${node.value}'`;
      return String(node.value);
    case 'ctx':
      return node.name;
    case 'prop':
      return `${exprToString(node.obj)}.${node.name}`;
    case 'index':
      return `${exprToString(node.obj)}[${exprToString(node.index)}]`;
    case 'filter':
      return `${exprToString(node.obj)}.*`;
    case 'call':
      return `${node.name}(${node.args.map(exprToString).join(', ')})`;
    case 'not':
      return `!${exprToString(node.arg)}`;
    case 'logic':
    case 'eq':
    case 'cmp':
      return `${exprToString(node.left)} ${node.op} ${exprToString(node.right)}`;
    case 'error':
      return '<error>';
  }
}

export { truthy, render };
export type { GhaObject };

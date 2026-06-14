/**
 * Shared value semantics for GitHub Actions expressions — the EXACT coercion,
 * truthiness, equality and string-substitution rules the runner uses. Both the
 * evaluator (expr-eval.ts) and the function library (functions.ts) import these,
 * so the rules live in one place and are unit-testable in isolation.
 *
 * Sources: GitHub Docs "Evaluate expressions in workflows and actions" and
 * observed runner behaviour (some edge cases — e.g. `'true' == true` ⇒ false,
 * `null == ''` ⇒ true — are not spelled out in docs and are pinned by the
 * conformance corpus). See conformance.ts / GHA_SEMANTICS_VERSION.
 */
import type { GhaValue, GhaArray, GhaObject } from './types';

export function isGhaArray(v: GhaValue): v is GhaArray {
  return Array.isArray(v);
}
export function isGhaObject(v: GhaValue): v is GhaObject {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/** Coarse type category used by equality. Objects and arrays share 'object'. */
type Cat = 'null' | 'boolean' | 'number' | 'string' | 'object';
function cat(v: GhaValue): Cat {
  if (v === null) return 'null';
  if (typeof v === 'boolean') return 'boolean';
  if (typeof v === 'number') return 'number';
  if (typeof v === 'string') return 'string';
  return 'object';
}

/** Truthiness — what an `if:` decides. Falsy iff null, false, 0, '', NaN. */
export function truthy(v: GhaValue): boolean {
  if (v === null) return false;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0 && !Number.isNaN(v);
  if (typeof v === 'string') return v !== '';
  return true; // objects and arrays (even {} / []) are truthy
}

/** Coerce to number exactly as the runner does (JS `Number()` semantics). */
export function castToNumber(v: GhaValue): number {
  if (v === null) return 0;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const t = v.trim();
    if (t === '') return 0;
    return Number(t); // handles 0x.., decimals, exponent, Infinity, NaN → NaN
  }
  return NaN; // arrays / objects
}

/** String substitution — how GitHub renders a value into a string context. */
export function render(v: GhaValue): string {
  if (v === null) return '';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number') return String(v); // 5, 1.5, Infinity, NaN
  if (typeof v === 'string') return v;
  return JSON.stringify(v); // compact JSON for objects/arrays
}

/** `==` semantics: same-type direct compare (strings case-insensitive, objects
 *  by reference); mixed types coerce both to number; any NaN ⇒ false. */
export function looseEquals(a: GhaValue, b: GhaValue): boolean {
  const ca = cat(a);
  const cb = cat(b);
  if (ca === cb) {
    switch (ca) {
      case 'null':
        return true;
      case 'boolean':
        return a === b;
      case 'number':
        return a === b; // NaN === NaN is false (correct)
      case 'string':
        return (a as string).toLowerCase() === (b as string).toLowerCase();
      case 'object':
        return a === b; // reference identity
    }
  }
  const na = castToNumber(a);
  const nb = castToNumber(b);
  if (Number.isNaN(na) || Number.isNaN(nb)) return false;
  return na === nb;
}

/** `< > <= >=` — always coerce to number; any NaN result ⇒ false. */
export function compare(a: GhaValue, op: '<' | '>' | '<=' | '>=', b: GhaValue): boolean {
  const na = castToNumber(a);
  const nb = castToNumber(b);
  if (Number.isNaN(na) || Number.isNaN(nb)) return false;
  switch (op) {
    case '<':
      return na < nb;
    case '>':
      return na > nb;
    case '<=':
      return na <= nb;
    case '>=':
      return na >= nb;
  }
}

/** Case-insensitive property lookup (GitHub treats context keys case-insensitively). */
export function ciGet(obj: GhaObject, key: string): GhaValue {
  if (Object.prototype.hasOwnProperty.call(obj, key)) return obj[key];
  const lower = key.toLowerCase();
  for (const k of Object.keys(obj)) {
    if (k.toLowerCase() === lower) return obj[k];
  }
  return null;
}

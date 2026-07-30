/**
 * JSON ↔ YAML Converter — the value walk.
 *
 * One recursive pass over the parsed value tree that does four jobs at once:
 *
 *   1. CYCLE DETECTION, before anything can throw. A recursive YAML alias
 *      (`a: &x {self: *x}`) produces a genuinely circular object; handing that
 *      to `JSON.stringify` throws a TypeError. The engine promises never to
 *      throw, so the walk finds the cycle first and reports it as a normal
 *      error diagnostic with the path where it closes.
 *   2. LOSSY CONVERSIONS, each logged. YAML's DEFAULT_SCHEMA resolves
 *      timestamps to `Date`, `!!binary` to `Uint8Array`, and `.inf`/`.nan` to
 *      non-finite numbers — none of which JSON can express. Every substitution
 *      emits a diagnostic naming the path, so nothing changes silently.
 *   3. STATS (`docs`/`keys`/`depth`) for the status line.
 *   4. KEY SORTING, when the caller asked for it — rebuilding objects in sorted
 *      order so the JSON side matches what js-yaml's `dump({sortKeys:true})`
 *      does on the YAML side.
 *
 * Note the one thing sorting CANNOT fix, and which `findIntegerLikeKeys` below
 * exists to disclose: JavaScript objects always enumerate integer-like keys
 * first, in ascending numeric order, before any string key. `{"2":…,"1":…}`
 * comes back as `1, 2` from `JSON.parse` and there is no way to hold the
 * original order without abandoning plain objects entirely.
 */
import { joinPath } from './diagnose';
import type { ConvertStats, Diagnostic } from './types';

/** Result of one walk. `ok` is false only when a cycle was found. */
export interface WalkResult {
  value: unknown;
  stats: ConvertStats;
  ok: boolean;
}

/** Which language the walk is producing, which changes the wording it emits. */
export type WalkTarget = 'json' | 'yaml';

const EMPTY_STATS: ConvertStats = { docs: 0, keys: 0, depth: 0 };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isDate(value: unknown): value is Date {
  return value instanceof Date;
}

function isByteArray(value: unknown): value is Uint8Array {
  return typeof Uint8Array !== 'undefined' && value instanceof Uint8Array;
}

/** Base64 without Buffer, so the engine stays runtime-agnostic. */
function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  try {
    if (typeof btoa === 'function') return btoa(binary);
  } catch {
    /* fall through to the hex fallback below */
  }
  let hex = '';
  for (let i = 0; i < bytes.length; i += 1) hex += bytes[i].toString(16).padStart(2, '0');
  return hex;
}

function nonFiniteLabel(value: number): string {
  if (Number.isNaN(value)) return 'NaN';
  return value > 0 ? 'Infinity' : '-Infinity';
}

/**
 * Walk one document. `target` only affects diagnostic wording — the structural
 * work (cycles, stats, sorting) is identical in both directions.
 */
export function walkDocument(
  root: unknown,
  diagnostics: Diagnostic[],
  options: { target: WalkTarget; sortKeys: boolean },
): WalkResult {
  const { target, sortKeys } = options;
  const ancestors = new Set<object>();
  let keys = 0;
  let maxDepth = 0;
  let cyclic = false;

  const visit = (value: unknown, path: string, depth: number): unknown => {
    if (cyclic) return null;

    if (typeof value === 'number' && !Number.isFinite(value)) {
      diagnostics.push({
        id: 'non-finite-number',
        severity: 'warning',
        path,
        message:
          target === 'json'
            ? `${nonFiniteLabel(value)} at ${path} has no JSON representation and was written ` +
              'as null.'
            : `The number at ${path} overflowed to ${nonFiniteLabel(value)} while parsing and ` +
              'was written as ' +
              (Number.isNaN(value) ? '.nan' : value > 0 ? '.inf' : '-.inf') +
              '.',
      });
      return target === 'json' ? null : value;
    }

    if (isDate(value)) {
      const iso = Number.isNaN(value.getTime()) ? null : value.toISOString();
      if (iso === null) {
        diagnostics.push({
          id: 'invalid-timestamp',
          severity: 'warning',
          path,
          message: `The timestamp at ${path} is not a valid date and was written as null.`,
        });
        return null;
      }
      diagnostics.push({
        id: 'timestamp-to-string',
        severity: 'note',
        path,
        message:
          `The timestamp at ${path} was written as the ISO-8601 string "${iso}" — JSON has no ` +
          'date type. Quote it in the YAML to keep the original text.',
      });
      return iso;
    }

    if (isByteArray(value)) {
      const encoded = toBase64(value);
      diagnostics.push({
        id: 'binary-to-base64',
        severity: 'note',
        path,
        message:
          `The !!binary value at ${path} was written as the base64 string "${encoded}" — JSON ` +
          'has no binary type.',
      });
      return encoded;
    }

    if (Array.isArray(value)) {
      if (ancestors.has(value)) {
        cyclic = true;
        diagnostics.push({
          id: 'cycle',
          severity: 'error',
          path,
          message:
            `Recursive alias: the value at ${path} points back to a node that contains it. ` +
            (target === 'json'
              ? 'JSON cannot represent a cycle, so there is nothing to write.'
              : 'This converter expands aliases, so a cycle would expand forever.'),
        });
        return null;
      }
      if (depth + 1 > maxDepth) maxDepth = depth + 1;
      ancestors.add(value);
      const out = value.map((item, i) => visit(item, joinPath(path, i), depth + 1));
      ancestors.delete(value);
      return out;
    }

    if (isPlainObject(value)) {
      if (ancestors.has(value)) {
        cyclic = true;
        diagnostics.push({
          id: 'cycle',
          severity: 'error',
          path,
          message:
            `Recursive alias: the value at ${path} points back to a node that contains it. ` +
            (target === 'json'
              ? 'JSON cannot represent a cycle, so there is nothing to write.'
              : 'This converter expands aliases, so a cycle would expand forever.'),
        });
        return null;
      }
      if (depth + 1 > maxDepth) maxDepth = depth + 1;
      ancestors.add(value);
      const names = Object.keys(value);
      const ordered = sortKeys ? [...names].sort() : names;
      const out: Record<string, unknown> = {};
      for (const name of ordered) {
        keys += 1;
        out[name] = visit(value[name], joinPath(path, name), depth + 1);
      }
      ancestors.delete(value);
      return out;
    }

    // Anything else js-yaml could hand back that JSON has no form for
    // (functions and regexes only appear under the EXTENDED schema, which this
    // engine never enables — but the guard costs nothing and keeps the promise).
    if (typeof value === 'function' || typeof value === 'symbol' || value === undefined) {
      diagnostics.push({
        id: 'unsupported-value',
        severity: 'warning',
        path,
        message: `The ${typeof value} at ${path} has no JSON or YAML form and was written as null.`,
      });
      return null;
    }

    if (typeof value === 'bigint') {
      diagnostics.push({
        id: 'unsupported-value',
        severity: 'warning',
        path,
        message: `The big integer at ${path} was written as the string "${value.toString()}".`,
      });
      return value.toString();
    }

    return value;
  };

  const value = visit(root, '$', 0);
  return {
    value: cyclic ? null : value,
    stats: { docs: 1, keys, depth: maxDepth },
    ok: !cyclic,
  };
}

/** Walk a whole YAML stream: one document, or several merged into an array. */
export function walkStream(
  docs: unknown[],
  diagnostics: Diagnostic[],
  options: { target: WalkTarget; sortKeys: boolean },
): WalkResult {
  if (docs.length === 0) return { value: null, stats: { ...EMPTY_STATS }, ok: true };
  let keys = 0;
  let depth = 0;
  let ok = true;
  const values: unknown[] = [];
  for (const doc of docs) {
    const walked = walkDocument(doc, diagnostics, options);
    if (!walked.ok) ok = false;
    keys += walked.stats.keys;
    depth = Math.max(depth, walked.stats.depth);
    values.push(walked.value);
  }
  return {
    value: docs.length === 1 ? values[0] : values,
    stats: { docs: docs.length, keys, depth },
    ok,
  };
}

/**
 * Every integer-like key in the tree, in the order JavaScript enumerates them.
 *
 * Their mere PRESENCE is the diagnostic: a plain object always lists array-index
 * keys first, in ascending numeric order, whatever order they were written in
 * and whether or not they were quoted in the JSON. So this needs no comparison
 * against the source — if the list is non-empty, the output ordering is
 * JavaScript's, not the author's. Reported as a warning rather than a note
 * because the output really can differ from the input, and no option in this
 * tool can change it.
 */
export function findIntegerLikeKeys(value: unknown): string[] {
  const hits: string[] = [];
  const seen = new Set<object>();
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) {
      if (seen.has(node)) return;
      seen.add(node);
      node.forEach(visit);
      return;
    }
    if (!isPlainObject(node)) return;
    if (seen.has(node)) return;
    seen.add(node);
    for (const key of Object.keys(node)) {
      if (/^(0|[1-9]\d*)$/.test(key)) hits.push(key);
      visit(node[key]);
    }
  };
  visit(value);
  // Distinct keys only: the same numeric key repeated across sibling objects
  // (`items[].0`) is one fact about the document, not many.
  return [...new Set(hits)];
}

/** Collect strings from the value tree, for the output-side quoting notes. */
export function collectStrings(value: unknown, limit = 500): string[] {
  const out: string[] = [];
  const seen = new Set<object>();
  const visit = (node: unknown): void => {
    if (out.length >= limit) return;
    if (typeof node === 'string') {
      out.push(node);
      return;
    }
    if (Array.isArray(node)) {
      if (seen.has(node)) return;
      seen.add(node);
      node.forEach(visit);
      return;
    }
    if (!isPlainObject(node)) return;
    if (seen.has(node)) return;
    seen.add(node);
    for (const key of Object.keys(node)) visit(node[key]);
  };
  visit(value);
  return out;
}

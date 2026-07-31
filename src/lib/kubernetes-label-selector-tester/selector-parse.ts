/**
 * The two selector grammars, both normalized to the same `Requirement[]`.
 *
 *   1. `parseExprSelector` — the `kubectl -l` string grammar. A hand port of
 *      `k8s.io/apimachinery/pkg/labels`' Lexer + Parser, including the two
 *      details that are easy to get wrong and that people hit for real:
 *        · the lexer is CONTEXT-SENSITIVE. `in` and `notin` are operator tokens
 *          where an operator is expected and ordinary identifiers where a value
 *          is expected, so `op in (in,notin)` is a legal selector.
 *        · whitespace is skipped everywhere, so `env in ( prod , staging )` and
 *          `env in (prod,staging)` are the same selector.
 *      And the deliberate divergence: `>` / `<` (Gt/Lt) are REFUSED with an
 *      explanation instead of parsed. They exist on a NodeSelectorRequirement,
 *      not on a LabelSelector, and quietly evaluating them here would be a
 *      confidently wrong answer about a different API type.
 *
 *   2. `parseYamlSelector` — the structured form. `matchLabels` +
 *      `matchExpressions` per `LabelSelectorAsSelector`, and a plain YAML map is
 *      read as `matchLabels` so that a Service's `spec.selector` pastes in
 *      directly. A whole manifest is accepted too: `spec.selector` for
 *      workloads and Services, `spec.podSelector` for a NetworkPolicy.
 *
 * Canonicalization matches apimachinery exactly, because the canonical string is
 * what the UI shows as "the selector you actually wrote":
 *   · `In`/`NotIn` value sets are de-duplicated and sorted (`sets.String.List()`);
 *   · clauses are sorted by key (`ByKey`), stably;
 *   · `Requirement.String()` renders `k=v`, `k==v`, `k!=v`, `k in (a,b)`,
 *     `k notin (a,b)`, `k`, `!k` — no spaces inside the value list.
 *
 * Nothing in this module throws. `parseYamlSelector` catches js-yaml's
 * exceptions (a duplicated mapping key is a THROW, not a warning) and turns them
 * into line-referenced diagnostics.
 */

/**
 * js-yaml has no bundled types in this project, so each engine declares the
 * sliver it uses. `loadAll` + `dump` are already declared by
 * `json-yaml-converter`; identical signatures merge as overloads, so declaring
 * `loadAll` the same way here is safe. Nothing else is declared.
 */
declare module 'js-yaml' {
  export function loadAll(input: string, iterator?: null, options?: unknown): unknown[];
}

import { loadAll } from 'js-yaml';
import type {
  Diagnostic,
  Operator,
  Requirement,
  RequirementSource,
  WrittenOp,
} from './types';
import {
  coerceLabelScalar,
  group,
  nonStringLabelNote,
  show,
  validateLabelKey,
  validateLabelValue,
} from './validate';

/** A selector longer than this is not a selector. Guards the lexer, not the tab. */
export const MAX_SELECTOR_CHARS = 20_000;
/** More clauses than any human reviews. Bounds verdicts × clauses in the UI. */
export const MAX_REQUIREMENTS = 100;

export interface SelectorParse {
  requirements: Requirement[];
  diagnostics: Diagnostic[];
  /** Zero requirements AND nothing wrong — the selector that matches everything. */
  empty: boolean;
  /** apimachinery's whole-selector `String()`. */
  canonical: string;
}

/* ── diagnostics ───────────────────────────────────────────────────────── */

function err(message: string, line?: number): Diagnostic {
  return { severity: 'error', message: `Selector: ${message}`, where: 'selector', line };
}
function warn(message: string): Diagnostic {
  return { severity: 'warning', message: `${message}`, where: 'selector' };
}
function note(message: string): Diagnostic {
  return { severity: 'note', message: `${message}`, where: 'selector' };
}

/* ── requirement construction ──────────────────────────────────────────── */

/** apimachinery `Requirement.String()`. */
function displayOf(key: string, written: WrittenOp, values: string[]): string {
  switch (written) {
    case '=':
    case 'matchLabels':
      return `${key}=${values[0] ?? ''}`;
    case '==':
      return `${key}==${values[0] ?? ''}`;
    case '!=':
      return `${key}!=${values[0] ?? ''}`;
    case 'in':
    case 'In':
      return `${key} in (${values.join(',')})`;
    case 'notin':
    case 'NotIn':
      return `${key} notin (${values.join(',')})`;
    case 'key':
    case 'Exists':
      return key;
    case '!key':
    case 'DoesNotExist':
      return `!${key}`;
    default:
      return key;
  }
}

/** Sorted, de-duplicated — `sets.String.List()`. */
function valueSet(values: string[]): string[] {
  return Array.from(new Set(values)).sort();
}

function makeRequirement(
  key: string,
  op: Operator,
  values: string[],
  source: RequirementSource,
  written: WrittenOp,
): Requirement {
  const normalized = op === 'In' || op === 'NotIn' ? values : [];
  return {
    key,
    op,
    values: normalized,
    source,
    written,
    display: displayOf(key, written, normalized),
  };
}

/** Stable sort by key — apimachinery's `ByKey`, applied by `Parse` and `Add`. */
function sortByKey(requirements: Requirement[]): Requirement[] {
  return requirements
    .map((requirement, index) => ({ requirement, index }))
    .sort((a, b) =>
      a.requirement.key < b.requirement.key
        ? -1
        : a.requirement.key > b.requirement.key
          ? 1
          : a.index - b.index,
    )
    .map((entry) => entry.requirement);
}

function finish(requirements: Requirement[], diagnostics: Diagnostic[]): SelectorParse {
  const fatal = diagnostics.some((d) => d.severity === 'error');
  if (fatal) return { requirements: [], diagnostics, empty: false, canonical: '' };
  if (requirements.length > MAX_REQUIREMENTS) {
    diagnostics.push(
      err(
        `this selector has ${group(requirements.length)} clauses and this tester reads up to ${MAX_REQUIREMENTS} — that is not a selector anyone reviews by hand.`,
      ),
    );
    return { requirements: [], diagnostics, empty: false, canonical: '' };
  }
  const sorted = sortByKey(requirements);
  return {
    requirements: sorted,
    diagnostics,
    empty: sorted.length === 0,
    canonical: sorted.map((r) => r.display).join(','),
  };
}

/** Validate one key/value pair coming from a selector — a hard error there. */
function checkKey(key: string, diagnostics: Diagnostic[]): boolean {
  const problem = validateLabelKey(key);
  if (problem) {
    diagnostics.push(err(problem));
    return false;
  }
  return true;
}
function checkValues(key: string, values: string[], diagnostics: Diagnostic[]): boolean {
  let ok = true;
  for (const value of values) {
    const problem = validateLabelValue(key, value);
    if (problem) {
      diagnostics.push(err(problem));
      ok = false;
    }
  }
  return ok;
}

/* ══════════════════════════════════════════════════════════════════════════
   1. The kubectl -l grammar
   ═════════════════════════════════════════════════════════════════════════ */

type Tok =
  | 'ident'
  | 'end'
  | 'openPar'
  | 'closePar'
  | 'comma'
  | 'not'
  | 'eq'
  | 'doubleEq'
  | 'notEq'
  | 'in'
  | 'notin'
  | 'gt'
  | 'lt';

interface Item {
  tok: Tok;
  lit: string;
}

const SPECIAL = new Set(['=', '!', '(', ')', ',', '>', '<']);

/** apimachinery's Lexer: skip whitespace, scan a special symbol, else an identifier. */
function lex(input: string): Item[] {
  const items: Item[] = [];
  let i = 0;
  while (i < input.length) {
    const ch = input[i];
    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r' || ch === '\f' || ch === '\v') {
      i += 1;
      continue;
    }
    if (SPECIAL.has(ch)) {
      // Two-character symbols first: `==` and `!=`.
      const two = input.slice(i, i + 2);
      if (two === '==') {
        items.push({ tok: 'doubleEq', lit: '==' });
        i += 2;
        continue;
      }
      if (two === '!=') {
        items.push({ tok: 'notEq', lit: '!=' });
        i += 2;
        continue;
      }
      const single: Record<string, Tok> = {
        '=': 'eq',
        '!': 'not',
        '(': 'openPar',
        ')': 'closePar',
        ',': 'comma',
        '>': 'gt',
        '<': 'lt',
      };
      items.push({ tok: single[ch], lit: ch });
      i += 1;
      continue;
    }
    let j = i;
    while (j < input.length && !SPECIAL.has(input[j]) && !/\s/.test(input[j])) j += 1;
    const lit = input.slice(i, j);
    items.push({ tok: lit === 'in' ? 'in' : lit === 'notin' ? 'notin' : 'ident', lit });
    i = j;
  }
  items.push({ tok: 'end', lit: '' });
  return items;
}

/** What the parser says a token is, given where it stands. */
type Context = 'operator' | 'values';

function describe(item: Item): string {
  return item.tok === 'end' ? 'the end of the selector' : `"${show(item.lit)}"`;
}

export function parseExprSelector(input: string): SelectorParse {
  const diagnostics: Diagnostic[] = [];
  if (input.length > MAX_SELECTOR_CHARS) {
    diagnostics.push(
      err(
        `this selector is ${group(input.length)} characters and this tester reads up to ${group(MAX_SELECTOR_CHARS)} characters — that is not a label selector.`,
      ),
    );
    return finish([], diagnostics);
  }

  const items = lex(input);
  let pos = 0;
  const requirements: Requirement[] = [];

  /** In `values` context, `in`/`notin` are ordinary identifiers. */
  function at(context: Context): Item {
    const item = items[pos];
    if (context === 'values' && (item.tok === 'in' || item.tok === 'notin')) {
      return { tok: 'ident', lit: item.lit };
    }
    return item;
  }
  function take(context: Context): Item {
    const item = at(context);
    pos += 1;
    return item;
  }

  /** Push an error and stop. Returns false so callers can bail cleanly. */
  function fail(message: string): false {
    diagnostics.push(err(message));
    return false;
  }

  function refuseComparison(): false {
    return fail(
      '">" and "<" are not label-selector operators. Gt and Lt exist only on a NodeSelectorRequirement (node affinity), which is a different API type — a labelSelector has In, NotIn, Exists and DoesNotExist.',
    );
  }

  /** `(a,b,c)` → sorted set. apimachinery quirks kept: `()` is `{""}`. */
  function parseValues(opName: string): string[] | null {
    const open = take('values');
    if (open.tok !== 'openPar') {
      fail(`found ${describe(open)}, expected "(" after ${opName}.`);
      return null;
    }
    const collected: string[] = [];
    // `()` — the one-element set containing the empty string, per apimachinery.
    if (at('values').tok === 'closePar') {
      pos += 1;
      return [''];
    }
    for (;;) {
      const item = take('values');
      if (item.tok === 'ident') {
        collected.push(item.lit);
      } else if (item.tok === 'comma') {
        // `(,a)` / `(a,,b)` / `(,)` all contribute the empty string.
        collected.push('');
        continue;
      } else if (item.tok === 'gt' || item.tok === 'lt') {
        refuseComparison();
        return null;
      } else {
        fail(`found ${describe(item)}, expected a value or ")".`);
        return null;
      }
      const next = at('values');
      if (next.tok === 'comma') {
        pos += 1;
        if (at('values').tok === 'closePar') {
          pos += 1;
          collected.push('');
          return valueSet(collected);
        }
        continue;
      }
      if (next.tok === 'closePar') {
        pos += 1;
        return valueSet(collected);
      }
      fail(`found ${describe(next)}, expected "," or ")".`);
      return null;
    }
  }

  /** `=value` / `==value` / `!=value`, where an absent value is the empty string. */
  function parseExactValue(): string[] | null {
    const next = at('values');
    if (next.tok === 'end' || next.tok === 'comma') return [''];
    const item = take('values');
    if (item.tok !== 'ident') {
      fail(`found ${describe(item)}, expected a value.`);
      return null;
    }
    return [item.lit];
  }

  function parseRequirement(): boolean {
    let existence: 'none' | 'doesNotExist' = 'none';
    let item = take('values');
    if (item.tok === 'not') {
      existence = 'doesNotExist';
      item = take('values');
    }
    if (item.tok !== 'ident') {
      return fail(`found ${describe(item)}, expected a label key.`);
    }
    const key = item.lit;
    if (!checkKey(key, diagnostics)) return false;

    const lookahead = at('operator');
    if (lookahead.tok === 'end' || lookahead.tok === 'comma') {
      requirements.push(
        existence === 'doesNotExist'
          ? makeRequirement(key, 'DoesNotExist', [], 'expr', '!key')
          : makeRequirement(key, 'Exists', [], 'expr', 'key'),
      );
      return true;
    }
    if (existence === 'doesNotExist') {
      // apimachinery returns the DoesNotExist requirement here and lets the
      // caller trip over the unconsumed operator — same outcome, same message.
      requirements.push(makeRequirement(key, 'DoesNotExist', [], 'expr', '!key'));
      return true;
    }

    const opItem = take('operator');
    let op: Operator;
    let written: WrittenOp;
    let values: string[] | null;
    switch (opItem.tok) {
      case 'eq':
        op = 'In';
        written = '=';
        values = parseExactValue();
        break;
      case 'doubleEq':
        op = 'In';
        written = '==';
        values = parseExactValue();
        break;
      case 'notEq':
        op = 'NotIn';
        written = '!=';
        values = parseExactValue();
        break;
      case 'in':
        op = 'In';
        written = 'in';
        values = parseValues('in');
        break;
      case 'notin':
        op = 'NotIn';
        written = 'notin';
        values = parseValues('notin');
        break;
      case 'gt':
      case 'lt':
        return refuseComparison();
      default:
        return fail(
          `found ${describe(opItem)}, expected one of: in, notin, =, ==, != — selector operators are case-sensitive, so write "in", not "IN".`,
        );
    }
    if (values === null) return false;
    if (!checkValues(key, values, diagnostics)) return false;
    requirements.push(makeRequirement(key, op, values, 'expr', written));
    return true;
  }

  for (;;) {
    const head = at('values');
    if (head.tok === 'end') break;
    if (head.tok === 'ident' || head.tok === 'not') {
      if (!parseRequirement()) return finish([], diagnostics);
      const after = take('values');
      if (after.tok === 'end') break;
      if (after.tok !== 'comma') {
        fail(`found ${describe(after)}, expected "," or the end of the selector.`);
        return finish([], diagnostics);
      }
      const next = at('values');
      if (next.tok !== 'ident' && next.tok !== 'not') {
        fail(`found ${describe(next)}, expected a key after ",".`);
        return finish([], diagnostics);
      }
      continue;
    }
    if (head.tok === 'gt' || head.tok === 'lt') {
      refuseComparison();
      return finish([], diagnostics);
    }
    fail(`found ${describe(head)}, expected a label key, "!" or the end of the selector.`);
    return finish([], diagnostics);
  }

  const parsed = finish(requirements, diagnostics);
  if (parsed.empty && parsed.diagnostics.every((d) => d.severity !== 'error')) {
    parsed.diagnostics.push(note(EMPTY_SELECTOR_NOTE));
  }
  return parsed;
}

/* ══════════════════════════════════════════════════════════════════════════
   2. The structured form
   ═════════════════════════════════════════════════════════════════════════ */

export const EMPTY_SELECTOR_NOTE =
  'An empty selector matches every resource — that is what a NetworkPolicy podSelector: {} means. ' +
  'A Service is different: an empty spec.selector is omitted by the API, so the Service gets no ' +
  'automatically managed endpoints at all.';

const MATCH_LABELS_NOTE =
  'Read as matchLabels: a plain YAML map is equality-only, which is exactly what a Service spec.selector is.';

const SERVICE_SET_BASED_WARNING =
  'A Service spec.selector is a plain label map: it supports neither matchLabels nor matchExpressions, ' +
  'and the API server rejects those fields there. The set-based result below is what a Deployment or ' +
  'NetworkPolicy would do with it, not what this Service will do.';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** What YAML made of a document, in the words the diagnostics use. */
function typeName(value: unknown): string {
  if (Array.isArray(value)) return 'list';
  if (value === null) return 'null value';
  if (typeof value === 'string') return 'string';
  if (typeof value === 'number') return 'number';
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'object') return 'map';
  return 'value';
}

interface YamlError {
  message: string;
  line?: number;
}

/** Physical lines in the input, ignoring one trailing newline. */
function lineCount(text: string): number {
  const parts = text.split('\n');
  return parts.length > 1 && parts[parts.length - 1] === '' ? parts.length - 1 : parts.length;
}

/**
 * js-yaml's exception, translated into our own sentence. Never rethrown.
 *
 * The line number is CLAMPED to the input's real line count. js-yaml points an
 * "unexpected end of the stream" mark one line PAST the end, so an unterminated
 * flow map on a single line reports `line: 2` — a line that does not exist. A
 * diagnostic that names a line the user cannot find is worse than one that names
 * no line at all.
 */
function describeYamlError(error: unknown, subject: 'Selector' | 'Resources', text: string): YamlError {
  const raw = error as { message?: unknown; reason?: unknown; mark?: { line?: unknown } } | null;
  const rawLine = raw && raw.mark && typeof raw.mark.line === 'number' ? raw.mark.line + 1 : undefined;
  const markLine = rawLine === undefined ? undefined : Math.max(1, Math.min(rawLine, lineCount(text)));
  const reason = raw && typeof raw.reason === 'string' ? raw.reason : '';
  const message = raw && typeof raw.message === 'string' ? raw.message : '';
  const detail = reason || message || 'the document could not be parsed';
  if (/duplicated mapping key/i.test(detail)) {
    const where = markLine === undefined ? '' : ` on line ${markLine}`;
    return {
      message: `duplicate key${where} — YAML keeps only the last value, so this ${
        subject === 'Selector' ? 'selector' : 'manifest'
      } does not mean what it looks like.`,
      line: markLine,
    };
  }
  const where = markLine === undefined ? '' : ` — line ${markLine}`;
  return { message: `could not read this as YAML${where}: ${detail}.`, line: markLine };
}

/** All documents in `text`, or the translated error. */
export function loadYamlDocuments(
  text: string,
  subject: 'Selector' | 'Resources',
): { docs: unknown[] } | { error: YamlError } {
  try {
    return { docs: loadAll(text, null, { json: false }) };
  } catch (error) {
    return { error: describeYamlError(error, subject, text) };
  }
}

/** One `matchExpressions` entry → a Requirement, or a diagnostic. */
function parseExpression(
  entry: unknown,
  index: number,
  diagnostics: Diagnostic[],
): Requirement | null {
  const path = `matchExpressions[${index}]`;
  if (!isPlainObject(entry)) {
    diagnostics.push(err(`${path} is a ${typeName(entry)}, not a {key, operator, values} map.`));
    return null;
  }
  const rawKey = entry.key;
  if (typeof rawKey !== 'string' || rawKey.length === 0) {
    diagnostics.push(err(rawKey === undefined ? `${path} has no key.` : `${path}.key must be a string.`));
    return null;
  }
  if (!checkKey(rawKey, diagnostics)) return null;

  const rawOp = entry.operator;
  if (typeof rawOp !== 'string') {
    diagnostics.push(err(`${path}.operator is missing — use In, NotIn, Exists or DoesNotExist.`));
    return null;
  }
  if (rawOp !== 'In' && rawOp !== 'NotIn' && rawOp !== 'Exists' && rawOp !== 'DoesNotExist') {
    diagnostics.push(
      err(
        `${path}.operator is "${show(rawOp)}", which is not a label-selector operator — use In, NotIn, Exists or DoesNotExist. They are case-sensitive.`,
      ),
    );
    return null;
  }
  const op = rawOp as Operator;

  const rawValues = entry.values;
  const values: string[] = [];
  if (rawValues !== undefined && rawValues !== null) {
    if (!Array.isArray(rawValues)) {
      diagnostics.push(err(`${path}.values must be a list, not a ${typeName(rawValues)}.`));
      return null;
    }
    for (let i = 0; i < rawValues.length; i += 1) {
      const coerced = coerceLabelScalar(rawValues[i]);
      if (coerced === null) {
        diagnostics.push(err(`${path}.values[${i}] is a ${typeName(rawValues[i])}, not a label value.`));
        return null;
      }
      if (coerced.kind !== null) {
        diagnostics.push(
          note(nonStringLabelNote(`${path}.values[${i}]`, coerced.text, coerced.kind)),
        );
      }
      values.push(coerced.text);
    }
  }

  if (op === 'In' || op === 'NotIn') {
    if (values.length === 0) {
      diagnostics.push(
        err(`${path} uses ${op} with no values — In and NotIn require at least one value.`),
      );
      return null;
    }
  } else if (values.length !== 0) {
    diagnostics.push(
      err(
        `${path} uses ${op} with ${values.length} value${values.length === 1 ? '' : 's'} — Exists and DoesNotExist must have no values.`,
      ),
    );
    return null;
  }

  if (!checkValues(rawKey, values, diagnostics)) return null;
  return makeRequirement(rawKey, op, valueSet(values), 'matchExpressions', op as WrittenOp);
}

/** A `matchLabels` map → equality Requirements. */
function parseMatchLabels(
  raw: unknown,
  diagnostics: Diagnostic[],
  fieldName: string,
): Requirement[] | null {
  if (raw === undefined || raw === null) return [];
  if (!isPlainObject(raw)) {
    diagnostics.push(err(`${fieldName} must be a map of label key/value pairs, not a ${typeName(raw)}.`));
    return null;
  }
  const out: Requirement[] = [];
  let ok = true;
  for (const [key, value] of Object.entries(raw)) {
    if (!checkKey(key, diagnostics)) {
      ok = false;
      continue;
    }
    const coerced = coerceLabelScalar(value);
    if (coerced === null) {
      diagnostics.push(err(`${fieldName}.${key} is a ${typeName(value)}, not a label value.`));
      ok = false;
      continue;
    }
    if (coerced.kind !== null) {
      diagnostics.push(note(nonStringLabelNote(`${fieldName}.${key}`, coerced.text, coerced.kind)));
    }
    if (!checkValues(key, [coerced.text], diagnostics)) {
      ok = false;
      continue;
    }
    out.push(makeRequirement(key, 'In', [coerced.text], 'matchLabels', 'matchLabels'));
  }
  return ok ? out : null;
}

/** The `{matchLabels, matchExpressions}` shape. */
function parseLabelSelectorObject(
  selector: Record<string, unknown>,
  diagnostics: Diagnostic[],
  matchLabelsField: string,
): Requirement[] | null {
  const requirements: Requirement[] = [];
  let ok = true;

  const labels = parseMatchLabels(selector.matchLabels, diagnostics, matchLabelsField);
  if (labels === null) ok = false;
  else requirements.push(...labels);

  const rawExpressions = selector.matchExpressions;
  if (rawExpressions !== undefined && rawExpressions !== null) {
    if (!Array.isArray(rawExpressions)) {
      diagnostics.push(
        err(
          `matchExpressions must be a list of {key, operator, values} entries, not a ${typeName(rawExpressions)}.`,
        ),
      );
      ok = false;
    } else {
      for (let i = 0; i < rawExpressions.length; i += 1) {
        const requirement = parseExpression(rawExpressions[i], i, diagnostics);
        if (requirement === null) ok = false;
        else requirements.push(requirement);
      }
    }
  }
  return ok ? requirements : null;
}

/** Does this object use the structured LabelSelector fields? */
function hasSelectorFields(value: Record<string, unknown>): boolean {
  return (
    Object.prototype.hasOwnProperty.call(value, 'matchLabels') ||
    Object.prototype.hasOwnProperty.call(value, 'matchExpressions')
  );
}

export function parseYamlSelector(input: string): SelectorParse {
  const diagnostics: Diagnostic[] = [];
  if (input.length > MAX_SELECTOR_CHARS) {
    diagnostics.push(
      err(
        `this selector is ${group(input.length)} characters and this tester reads up to ${group(MAX_SELECTOR_CHARS)} characters — that is not a label selector.`,
      ),
    );
    return finish([], diagnostics);
  }
  const text = input.replace(/^﻿/, '');
  if (text.trim().length === 0) {
    const parsed = finish([], diagnostics);
    parsed.diagnostics.push(note(EMPTY_SELECTOR_NOTE));
    return parsed;
  }

  const loaded = loadYamlDocuments(text, 'Selector');
  if ('error' in loaded) {
    diagnostics.push(err(loaded.error.message, loaded.error.line));
    return finish([], diagnostics);
  }
  const docs = loaded.docs.filter((doc) => doc !== undefined && doc !== null);
  if (docs.length === 0) {
    const parsed = finish([], diagnostics);
    parsed.diagnostics.push(note(EMPTY_SELECTOR_NOTE));
    return parsed;
  }
  if (docs.length > 1) {
    diagnostics.push(
      warn(
        `The selector has ${docs.length} YAML documents; only the first was used. A selector is one object.`,
      ),
    );
  }

  const root = docs[0];
  if (!isPlainObject(root)) {
    diagnostics.push(
      err(
        `expected a YAML map — matchLabels/matchExpressions, or a plain label map — but this is a ${typeName(root)}.`,
      ),
    );
    return finish([], diagnostics);
  }

  /* Full manifest? Pull the selector out of it and say where from. */
  const kind = typeof root.kind === 'string' ? root.kind : null;
  const spec = isPlainObject(root.spec) ? root.spec : null;
  let target: Record<string, unknown> = root;
  let matchLabelsField = 'matchLabels';
  let extractedFrom: 'root' | 'spec.selector' | 'spec.podSelector' = 'root';

  if (!hasSelectorFields(root) && spec !== null) {
    if (isPlainObject(spec.selector)) {
      target = spec.selector;
      extractedFrom = 'spec.selector';
    } else if (isPlainObject(spec.podSelector)) {
      target = spec.podSelector;
      extractedFrom = 'spec.podSelector';
    } else if (spec.selector !== undefined || spec.podSelector !== undefined) {
      diagnostics.push(
        err(
          `spec.${spec.selector !== undefined ? 'selector' : 'podSelector'} is a ${typeName(
            spec.selector !== undefined ? spec.selector : spec.podSelector,
          )}, not a selector map.`,
        ),
      );
      return finish([], diagnostics);
    } else {
      diagnostics.push(
        err(
          `this looks like a ${kind ?? 'Kubernetes'} manifest, but it has no spec.selector or spec.podSelector — paste the selector itself, or a manifest that has one.`,
        ),
      );
      return finish([], diagnostics);
    }
  } else if (!hasSelectorFields(root) && kind !== null && spec === null) {
    diagnostics.push(
      err(
        `this looks like a ${kind} manifest, but it has no spec.selector or spec.podSelector — paste the selector itself, or a manifest that has one.`,
      ),
    );
    return finish([], diagnostics);
  }

  const structured = hasSelectorFields(target);
  if (extractedFrom !== 'root') {
    const label = extractedFrom === 'spec.podSelector' ? 'spec.podSelector' : 'spec.selector';
    if (extractedFrom === 'spec.selector' && kind === 'Service' && !structured) {
      diagnostics.push(
        note(
          'Read spec.selector from the Service manifest. A Service selector is equality-only: every key/value pair is ANDed.',
        ),
      );
    } else {
      diagnostics.push(note(`Read ${label} from the ${kind ?? 'pasted'} manifest.`));
    }
    if (kind === 'Service' && structured) diagnostics.push(warn(SERVICE_SET_BASED_WARNING));
    matchLabelsField = `${label}.matchLabels`;
  }

  let requirements: Requirement[] | null;
  if (structured) {
    requirements = parseLabelSelectorObject(target, diagnostics, matchLabelsField);
  } else {
    requirements = parseMatchLabels(target, diagnostics, matchLabelsField);
    // Not for `{}`: "read as matchLabels" says nothing about a map with no keys,
    // and the empty-selector note below is the one that matters there.
    if (requirements !== null && requirements.length > 0 && extractedFrom === 'root') {
      diagnostics.push(note(MATCH_LABELS_NOTE));
    }
  }
  if (requirements === null) return finish([], diagnostics);

  const parsed = finish(requirements, diagnostics);
  if (parsed.empty && parsed.diagnostics.every((d) => d.severity !== 'error')) {
    parsed.diagnostics.push(note(EMPTY_SELECTOR_NOTE));
  }
  return parsed;
}

/** Dispatch on the mode. Anything that is not `'yaml'` is the `-l` grammar. */
export function parseSelector(input: string, mode: string): SelectorParse {
  const text = typeof input === 'string' ? input : '';
  return mode === 'yaml' ? parseYamlSelector(text) : parseExprSelector(text);
}

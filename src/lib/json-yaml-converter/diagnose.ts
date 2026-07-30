/**
 * JSON ↔ YAML Converter — source-text diagnostics.
 *
 * Everything in here works on the RAW TEXT, before or instead of parsing:
 *
 *   - format detection (drives the "looks like YAML — switch direction?" nudge);
 *   - parser-error translation, because neither js-yaml's `reason` strings nor
 *     V8's `JSON.parse` messages are stable or actionable. V8's wording in
 *     particular changed shape between Node releases ("Unexpected token , in
 *     JSON at position 8" → "Expected double-quoted property name in JSON at
 *     position 8 (line 1 column 9)"), so we take only the `position` number out
 *     of it and write our own sentence with a line/column we computed
 *     ourselves. That keeps the pinned test vectors stable across runtimes;
 *   - the YAML-1.1-versus-1.2 heuristics (the "Norway problem" family), which
 *     genuinely need the source text: once js-yaml has resolved `no` to the
 *     string "no" there is nothing left in the value tree to notice.
 *
 * Every scan here first MASKS quoted spans (`maskQuoted`), so a `#` or a
 * bool-lookalike token inside a quoted scalar is not mistaken for the real
 * thing. The documented limit of the heuristic is the reverse case — a genuine
 * comment on a line that also contains a quoted `#` may be missed. False
 * negatives are acceptable; false positives would be lies.
 */
import type { DetectedFormat, Diagnostic } from './types';

/** The parser identity every diagnostic in this tool is written against. */
export const YAML_SEMANTICS = 'js-yaml 4 — YAML 1.2 core schema';

/** Per-id diagnostic cap, so a 5,000-line file cannot emit 5,000 notes. */
export const MAX_PER_ID = 25;

/**
 * Scalars YAML 1.1 resolves to a boolean but YAML 1.2 leaves as strings.
 * `true`/`false` are deliberately absent — they are booleans in both versions,
 * so they are not part of the Norway problem.
 */
const YAML_11_ONLY_BOOL =
  /^(y|Y|yes|Yes|YES|n|N|no|No|NO|on|On|ON|off|Off|OFF)$/;

/** Scalars a YAML 1.2 parser resolves to something other than a string. */
const YAML_12_NON_STRING =
  /^(|~|null|Null|NULL|true|True|TRUE|false|False|FALSE|[+-]?\d+|0o[0-7]+|0x[0-9a-fA-F]+|[+-]?(\d+\.\d*|\.\d+|\d+)([eE][+-]?\d+)?|[+-]?\.(inf|Inf|INF)|\.(nan|NaN|NAN))$/;

/** CloudFormation's shorthand tags — the overwhelmingly common "unknown tag". */
const CFN_TAGS = new Set([
  'Ref',
  'GetAtt',
  'Sub',
  'Join',
  'Select',
  'Split',
  'If',
  'Not',
  'Equals',
  'And',
  'Or',
  'Base64',
  'Cidr',
  'FindInMap',
  'GetAZs',
  'ImportValue',
  'Condition',
  'Transform',
]);

/* ────────────────────────────────────────────────────────────────────────── *
 *  Text utilities
 * ────────────────────────────────────────────────────────────────────────── */

/** Strip a single leading UTF-8 BOM. Returns the text and whether one was cut. */
export function stripBom(text: string): { text: string; removed: boolean } {
  if (text.charCodeAt(0) === 0xfeff) return { text: text.slice(1), removed: true };
  return { text, removed: false };
}

/**
 * Replace the CONTENTS of every quoted span with spaces, preserving length and
 * newlines so positions stay valid. Handles `\"` inside double quotes and `''`
 * inside single quotes (YAML's escape) — an unterminated quote masks to the end
 * of input, which is the conservative choice.
 */
export function maskQuoted(text: string): string {
  const out = text.split('');
  let i = 0;
  while (i < out.length) {
    const ch = out[i];
    if (ch !== '"' && ch !== "'") {
      i += 1;
      continue;
    }
    const quote = ch;
    i += 1;
    while (i < out.length) {
      const c = out[i];
      if (quote === '"' && c === '\\') {
        // Blank the escape pair, but never a newline (keeps line numbers right).
        if (out[i] !== '\n') out[i] = ' ';
        if (i + 1 < out.length && out[i + 1] !== '\n') out[i + 1] = ' ';
        i += 2;
        continue;
      }
      if (c === quote) {
        if (quote === "'" && out[i + 1] === "'") {
          out[i] = ' ';
          out[i + 1] = ' ';
          i += 2;
          continue;
        }
        i += 1;
        break;
      }
      if (c !== '\n') out[i] = ' ';
      i += 1;
    }
  }
  return out.join('');
}

/** Drop `#` comments from an already-masked line. */
function stripComment(maskedLine: string): string {
  const hash = maskedLine.indexOf('#');
  return hash === -1 ? maskedLine : maskedLine.slice(0, hash);
}

/** 1-based line/column for a 0-based character offset. Clamped to the text. */
export function offsetToLineCol(text: string, offset: number): { line: number; column: number } {
  const safe = Math.max(0, Math.min(offset, text.length));
  let line = 1;
  let lineStart = 0;
  for (let i = 0; i < safe; i += 1) {
    if (text.charCodeAt(i) === 10) {
      line += 1;
      lineStart = i + 1;
    }
  }
  return { line, column: safe - lineStart + 1 };
}

/* ────────────────────────────────────────────────────────────────────────── *
 *  Format detection
 * ────────────────────────────────────────────────────────────────────────── */

/**
 * What the input looks like. Deliberately conservative: a value that is legal
 * in both languages is `'ambiguous'`, never a guess. Broken JSON still reads as
 * `'json'` (by its opening brace) because the useful signal for the UI is the
 * author's INTENT, not whether it currently parses.
 */
export function detectFormat(input: unknown): DetectedFormat {
  if (typeof input !== 'string') return 'ambiguous';
  const text = stripBom(input).text.trim();
  if (text.length === 0) return 'ambiguous';
  const first = text[0];
  const jsonShaped = first === '{' || first === '[' || first === '"';
  if (jsonShaped) return 'json';
  try {
    JSON.parse(text);
    // Parses as JSON but is a bare scalar — also valid YAML. No guess.
    return 'ambiguous';
  } catch {
    return 'yaml';
  }
}

/* ────────────────────────────────────────────────────────────────────────── *
 *  Parser-error translation
 * ────────────────────────────────────────────────────────────────────────── */

interface YamlMark {
  line?: number;
  column?: number;
}

interface YamlishError {
  reason?: string;
  message?: string;
  mark?: YamlMark;
}

function asYamlError(err: unknown): YamlishError {
  return (err ?? {}) as YamlishError;
}

/** Uppercase the first letter without touching the rest. */
function sentence(text: string): string {
  return text.length === 0 ? text : text[0].toUpperCase() + text.slice(1);
}

/**
 * Turn a js-yaml `YAMLException` into a Diagnostic with our own wording. The
 * three cases with a dedicated message are the ones users actually hit; the
 * rest fall through to js-yaml's `reason`, which is short and decent, wrapped
 * in a sentence with a line reference.
 */
export function describeYamlError(err: unknown): Diagnostic {
  const e = asYamlError(err);
  const reason = typeof e.reason === 'string' ? e.reason : '';
  const line = typeof e.mark?.line === 'number' ? e.mark.line + 1 : undefined;
  const column = typeof e.mark?.column === 'number' ? e.mark.column + 1 : undefined;
  const at =
    line !== undefined && column !== undefined ? `at line ${line}, column ${column}` : '';

  if (/duplicated mapping key/i.test(reason)) {
    return {
      id: 'yaml-duplicate-key',
      severity: 'error',
      line,
      column,
      message:
        `Duplicated mapping key ${at}`.trim() +
        '. YAML rejects a key that already exists in the same mapping.',
    };
  }

  if (/tab characters must not be used/i.test(reason)) {
    return {
      id: 'yaml-tab-indent',
      severity: 'error',
      line,
      column,
      message:
        `Tab characters must not be used for indentation ${at}`.trim() +
        '. YAML requires spaces.',
    };
  }

  const unknownTag = /unknown tag !<!?([^>]*)>/i.exec(reason);
  if (unknownTag) {
    const tag = unknownTag[1];
    const shorthand = `!${tag}`;
    if (CFN_TAGS.has(tag)) {
      return {
        id: 'yaml-unknown-tag',
        severity: 'error',
        line,
        column,
        message:
          `Unknown YAML tag "${shorthand}" ${at}`.trim() +
          '. This looks like an AWS CloudFormation template — !Ref, !GetAtt and !Sub are ' +
          'CloudFormation shorthand, not standard YAML tags. Rewrite them in their long form ' +
          '(Ref: BucketName instead of !Ref BucketName) to convert this file.',
      };
    }
    return {
      id: 'yaml-unknown-tag',
      severity: 'error',
      line,
      column,
      message:
        `Unknown YAML tag "${shorthand}" ${at}`.trim() +
        '. This converter uses the standard YAML 1.2 schema and has no constructor for ' +
        'custom tags.',
    };
  }

  const alias = /unidentified alias "(.*)"/i.exec(reason);
  if (alias) {
    return {
      id: 'yaml-unknown-alias',
      severity: 'error',
      line,
      column,
      message:
        `Unknown alias *${alias[1]} ${at}`.trim() +
        `. No anchor &${alias[1]} is defined before this point.`,
    };
  }

  const detail = reason.length > 0 ? sentence(reason) : 'This is not valid YAML';
  return {
    id: 'yaml-parse-error',
    severity: 'error',
    line,
    column,
    message: at.length > 0 ? `${detail} — ${at}.` : `${detail}.`,
  };
}

/** Human name for a character in an error sentence. */
function charLabel(text: string, index: number): string {
  if (index >= text.length) return 'end of input';
  const ch = text[index];
  if (ch === '\n') return 'end of line';
  if (ch === '\t') return 'a tab';
  return `"${ch}"`;
}

/**
 * Translate a `JSON.parse` failure. `position` is the only part of V8's message
 * we trust; line and column are computed here so the wording is runtime-stable.
 */
export function describeJsonError(err: unknown, source: string): Diagnostic {
  const raw = String((err as { message?: unknown } | undefined)?.message ?? '');
  const posMatch = /position (\d+)/.exec(raw);
  let position = posMatch ? Number(posMatch[1]) : /end of JSON input/i.test(raw) ? source.length : 0;
  if (!Number.isFinite(position) || position < 0) position = 0;

  const suffix =
    detectFormat(source) === 'yaml'
      ? ' This looks like YAML, not JSON — switch the direction to convert it.'
      : '';

  const build = (message: string, at: number): Diagnostic => {
    const { line, column } = offsetToLineCol(source, at);
    return { id: 'json-parse-error', severity: 'error', line, column, message: message + suffix };
  };

  // A stray comma is by far the most common JSON paste failure (a trailing
  // comma copied out of JavaScript, or a doubled one from a bad edit). Point at
  // the comma itself, wherever it is relative to the reported position.
  const here = position < source.length ? source[position] : '';
  let commaAt = -1;
  if (here === ',') {
    commaAt = position;
  } else if (here === '' || here === '}' || here === ']') {
    let back = position - 1;
    while (back >= 0 && /\s/.test(source[back])) back -= 1;
    if (back >= 0 && source[back] === ',') commaAt = back;
  }
  if (commaAt >= 0) {
    const { line, column } = offsetToLineCol(source, commaAt);
    return build(
      `Unexpected "," at line ${line}, column ${column}. JSON does not allow trailing or ` +
        'repeated commas.',
      commaAt,
    );
  }

  if (here === "'" || (position > 0 && source[position - 1] === "'")) {
    const at = here === "'" ? position : position - 1;
    const { line, column } = offsetToLineCol(source, at);
    return build(
      `Single quotes are not valid in JSON at line ${line}, column ${column}. JSON strings ` +
        'must use double quotes.',
      at,
    );
  }

  const twoChars = source.slice(position, position + 2);
  if (twoChars === '//' || twoChars === '/*') {
    const { line, column } = offsetToLineCol(source, position);
    return build(
      `JSON does not allow comments — found "${twoChars}" at line ${line}, column ${column}. ` +
        'Strip the comment, or convert the file as YAML instead, where comments are legal.',
      position,
    );
  }

  if (/property name/i.test(raw) && /[A-Za-z_$]/.test(here)) {
    const { line, column } = offsetToLineCol(source, position);
    return build(
      `Property names must be double-quoted at line ${line}, column ${column}. JSON has no ` +
        'bare keys.',
      position,
    );
  }

  if (/end of JSON input/i.test(raw)) {
    const { line, column } = offsetToLineCol(source, source.length);
    return build(
      `Unexpected end of input at line ${line}, column ${column} — a brace, bracket or quote ` +
        'is still open.',
      source.length,
    );
  }

  if (/after JSON/i.test(raw)) {
    const { line, column } = offsetToLineCol(source, position);
    return build(
      `Unexpected content after the JSON value at line ${line}, column ${column}. JSON allows ` +
        'only one top-level value — a multi-document stream has to be converted as YAML.',
      position,
    );
  }

  const { line, column } = offsetToLineCol(source, position);
  return build(
    `Unexpected ${charLabel(source, position)} at line ${line}, column ${column}. This is not ` +
      'valid JSON.',
    position,
  );
}

/* ────────────────────────────────────────────────────────────────────────── *
 *  Source-text heuristics
 * ────────────────────────────────────────────────────────────────────────── */

/**
 * Every scan below takes text that has ALREADY been through `maskQuoted` — the
 * engine masks once and shares the result, so a 100 KB paste is not walked six
 * times over. Masking preserves length and newlines, so line numbers derived
 * from masked text are valid against the raw source.
 */

/** True when the text carries at least one `#` comment outside a quoted span. */
export function hasComments(masked: string): boolean {
  for (const line of masked.split('\n')) {
    const hash = line.indexOf('#');
    if (hash === -1) continue;
    // A `#` only starts a comment at the start of a line or after whitespace.
    if (hash === 0 || /\s/.test(line[hash - 1])) return true;
  }
  return false;
}

/** True when the text uses an anchor or an alias outside a quoted span. */
export function hasAnchorsOrAliases(masked: string): boolean {
  for (const rawLine of masked.split('\n')) {
    const line = stripComment(rawLine);
    if (/(^|[\s:[{,])[&*][A-Za-z0-9_][^\s,\]}]*/.test(line)) return true;
  }
  return false;
}

/** True when the text uses a merge key outside a quoted span. */
export function hasMergeKey(masked: string): boolean {
  for (const rawLine of masked.split('\n')) {
    const line = stripComment(rawLine);
    if (/(^|[\s{,])<<\s*:/.test(line)) return true;
  }
  return false;
}

/** Scalar tokens on one masked, comment-stripped line: keys and plain values. */
function scalarTokens(line: string): string[] {
  const tokens: string[] = [];
  const value = /:[ \t]+(\S+)[ \t]*$/.exec(line);
  if (value) tokens.push(value[1]);
  const item = /^[ \t]*-[ \t]+(\S+)[ \t]*$/.exec(line);
  if (item) tokens.push(item[1]);
  const key = /^[ \t]*(?:-[ \t]+)?([^:#\s][^:#]*?)[ \t]*:(?:[ \t]|$)/.exec(line);
  if (key) tokens.push(key[1]);
  return tokens;
}

/** Append `n more of the same` when a scan hit the per-id cap. */
function capped(found: Diagnostic[], total: number, id: string): Diagnostic[] {
  if (total <= found.length) return found;
  return [
    ...found,
    {
      id,
      severity: found[0]?.severity ?? 'note',
      message: `…and ${total - found.length} more of the same on later lines.`,
    },
  ];
}

/**
 * YAML-source scan for the "Norway problem": scalars this YAML 1.2 parser keeps
 * as strings but a YAML 1.1 parser would turn into booleans.
 */
export function findYaml11BoolLookalikes(masked: string): Diagnostic[] {
  const lines = masked.split('\n');
  const found: Diagnostic[] = [];
  let total = 0;
  for (let i = 0; i < lines.length; i += 1) {
    const line = stripComment(lines[i]);
    const hit = scalarTokens(line).find((t) => YAML_11_ONLY_BOOL.test(t));
    if (!hit) continue;
    total += 1;
    if (found.length >= MAX_PER_ID) continue;
    found.push({
      id: 'yaml-1-1-bool-lookalike',
      severity: 'note',
      line: i + 1,
      message:
        `Line ${i + 1}: "${hit}" stayed the string "${hit}". This parser follows YAML 1.2, ` +
        'where only true/false are booleans — YAML 1.1 tools (PyYAML, Ruby Psych, older ' +
        'Kubernetes tooling) read it as ' +
        (/^(n|N|no|No|NO|off|Off|OFF)$/.test(hit) ? 'false' : 'true') +
        '. This is the "Norway problem".',
    });
  }
  return capped(found, total, 'yaml-1-1-bool-lookalike');
}

/** YAML-source scan for leading-zero numbers that YAML 1.1 reads as octal. */
export function findYaml11OctalLookalikes(masked: string): Diagnostic[] {
  const lines = masked.split('\n');
  const found: Diagnostic[] = [];
  let total = 0;
  for (let i = 0; i < lines.length; i += 1) {
    const line = stripComment(lines[i]);
    const hit = scalarTokens(line).find((t) => /^0[0-7]+$/.test(t));
    if (!hit) continue;
    total += 1;
    if (found.length >= MAX_PER_ID) continue;
    const decimal = Number(hit);
    const octal = parseInt(hit, 8);
    found.push({
      id: 'yaml-1-1-octal-lookalike',
      severity: 'note',
      line: i + 1,
      message:
        `Line ${i + 1}: ${hit} is the decimal number ${decimal} in YAML 1.2. YAML 1.1 tools ` +
        `(PyYAML) read a leading zero as octal and would give ${octal} — write 0o${hit.slice(1)} ` +
        'to be unambiguous.',
    });
  }
  return capped(found, total, 'yaml-1-1-octal-lookalike');
}

/**
 * Scan the SOURCE for integer literals outside JavaScript's exact range. Done
 * on text, not on the parsed value, so the diagnostic can quote the digits the
 * author actually wrote — by the time `JSON.parse`/`load` is done, they are
 * gone. Works for JSON and YAML alike (both write integers the same way).
 */
export function findUnsafeIntegers(masked: string): Diagnostic[] {
  const lines = masked.split('\n');
  const found: Diagnostic[] = [];
  let total = 0;
  for (let i = 0; i < lines.length; i += 1) {
    const line = stripComment(lines[i]);
    // 16+ digits is the cheap pre-filter; 2^53-1 has 16 digits.
    const matches = line.match(/-?\b\d{16,}\b/g);
    if (!matches) continue;
    for (const literal of matches) {
      let exact: bigint;
      try {
        exact = BigInt(literal);
      } catch {
        continue;
      }
      const rounded = Number(literal);
      if (!Number.isFinite(rounded)) continue;
      if (BigInt(Math.trunc(rounded)) === exact) continue;
      total += 1;
      if (found.length >= MAX_PER_ID) continue;
      found.push({
        id: 'unsafe-integer',
        severity: 'warning',
        line: i + 1,
        message:
          `Line ${i + 1}: the integer ${literal} is outside JavaScript's exact range ` +
          `(±(2^53 − 1)) and was rounded to ${rounded}. Large integers cannot survive this ` +
          'conversion — keep them as quoted strings.',
      });
    }
  }
  return capped(found, total, 'unsafe-integer');
}

/* ────────────────────────────────────────────────────────────────────────── *
 *  Output-side heuristics (json → yaml)
 * ────────────────────────────────────────────────────────────────────────── */

/** Is this string one that YAML 1.1 would resolve to a boolean? */
export function isYaml11BoolLookalike(value: string): boolean {
  return YAML_11_ONLY_BOOL.test(value);
}

/** Is this string one that YAML 1.2 itself would resolve to a non-string? */
export function isYaml12NonString(value: string): boolean {
  return YAML_12_NON_STRING.test(value);
}

/** `$`-rooted path segment, bracket-quoted when the key is not an identifier. */
export function joinPath(base: string, key: string | number): string {
  if (typeof key === 'number') return `${base}[${key}]`;
  if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key)) return `${base}.${key}`;
  return `${base}[${JSON.stringify(key)}]`;
}

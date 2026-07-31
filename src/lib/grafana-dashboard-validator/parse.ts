/**
 * Grafana Dashboard Validator — parse + normalize + index.
 *
 * Two jobs, both of which have to be honest about what they did:
 *
 *   `parseDashboardText()` turns pasted text into a dashboard OBJECT, recording
 *   every accommodation it had to make (a byte-order mark, comments, trailing
 *   commas, an API `{ dashboard: … }` wrapper, a dashboard that arrived as an
 *   escaped JSON string). Those accommodations are `parseNotes` on the result,
 *   never silent: Grafana's own API rejects comments and trailing commas, so a
 *   file that only lints here because we were lenient is a file that will fail
 *   when it is provisioned.
 *
 *   `buildContext()` flattens the three panel layouts Grafana has shipped
 *   (top-level `panels`, collapsed rows holding their children, and
 *   pre-schemaVersion-16 `rows[]`) into one list where every entry knows its JSON
 *   path, and indexes template variables against every string in the document.
 *
 * Neither function throws. Invalid JSON is located by a small strict scanner in
 * this file rather than by reading `JSON.parse`'s message: V8 rewords those
 * between Node releases ("Unexpected token , in JSON at position 8" became
 * "Expected double-quoted property name in JSON at position 8 (line 1 column 9)"),
 * and this tool pins its diagnostics.
 */
import {
  type DashboardContext,
  type DashboardStats,
  type DatasourceRef,
  type PanelNode,
  type VarUsage,
  type VariableNode,
} from './types';

/* ── small shared predicates ─────────────────────────────────────────────── */

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The keys that make an object recognisably a dashboard rather than any JSON. */
const DASHBOARD_KEYS = ['panels', 'rows', 'templating', 'schemaVersion', 'title'] as const;

function looksLikeDashboard(value: Record<string, unknown>): boolean {
  return DASHBOARD_KEYS.some((key) => key in value);
}

/* ── position helpers ────────────────────────────────────────────────────── */

export interface LineCol {
  line: number;
  column: number;
}

/** 1-based line/column of a character index. Counts `\n`; `\r\n` lands on the `\r`. */
export function lineColOf(text: string, index: number): LineCol {
  let line = 1;
  let column = 1;
  const stop = Math.min(index, text.length);
  for (let i = 0; i < stop; i += 1) {
    if (text.charCodeAt(i) === 10) {
      line += 1;
      column = 1;
    } else {
      column += 1;
    }
  }
  return { line, column };
}

/* ── strict JSON fault locator ───────────────────────────────────────────── */

export interface JsonFault {
  index: number;
  /** A sentence fragment; the caller wraps it in "Invalid JSON at line L, column C — …". */
  reason: string;
}

/**
 * Recursion guard. A 512-deep dashboard does not exist; the cap is what keeps a
 * hostile `"[".repeat(20000)` from overflowing the stack instead of producing a
 * diagnostic.
 */
const MAX_SCAN_DEPTH = 512;

class Fault {
  constructor(
    readonly index: number,
    readonly reason: string,
  ) {}
}

const NUMBER_RE = /-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/y;
const WORD_RE = /[A-Za-z]+/y;

/**
 * Find the first place `text` stops being valid JSON, or `null` when it is
 * valid. Deliberately a separate pass from `JSON.parse`: it runs only on the
 * failure path, and it owns the wording of every message a user sees.
 */
export function locateJsonFault(text: string): JsonFault | null {
  const n = text.length;
  let i = 0;
  let depth = 0;

  function ws(): void {
    while (i < n) {
      const c = text.charCodeAt(i);
      if (c === 32 || c === 9 || c === 10 || c === 13) i += 1;
      else break;
    }
  }

  function atEnd(): never {
    throw new Fault(n, 'the JSON ends before it is complete');
  }

  function string(): void {
    const open = i;
    i += 1;
    while (i < n) {
      const c = text[i];
      if (c === '"') {
        i += 1;
        return;
      }
      if (c === '\\') {
        i += 1;
        if (i >= n) break;
        const esc = text[i];
        if (esc === 'u') {
          if (!/^[0-9a-fA-F]{4}$/.test(text.slice(i + 1, i + 5))) {
            throw new Fault(i - 1, 'a "\\u" escape needs exactly four hex digits');
          }
          i += 5;
        } else if ('"\\/bfnrt'.includes(esc)) {
          i += 1;
        } else {
          throw new Fault(i - 1, `"\\${esc}" is not a valid string escape`);
        }
        continue;
      }
      if (text.charCodeAt(i) < 0x20) {
        throw new Fault(i, 'a raw control character is not allowed inside a JSON string');
      }
      i += 1;
    }
    throw new Fault(open, 'a string is opened here but never closed');
  }

  function number(): void {
    NUMBER_RE.lastIndex = i;
    const match = NUMBER_RE.exec(text);
    if (!match || match.index !== i || match[0].length === 0) {
      throw new Fault(i, `unexpected character ${JSON.stringify(text[i])}`);
    }
    i += match[0].length;
    if (i < n && /[0-9]/.test(text[i])) {
      throw new Fault(i - match[0].length, 'a JSON number may not have a leading zero');
    }
  }

  function literal(): void {
    WORD_RE.lastIndex = i;
    const match = WORD_RE.exec(text);
    const word = match && match.index === i ? match[0] : text[i];
    if (word === 'true' || word === 'false' || word === 'null') {
      i += word.length;
      return;
    }
    const suggestion = ['true', 'false', 'null'].find((k) => k.startsWith(word));
    throw new Fault(
      i,
      suggestion
        ? `"${word}" is not valid JSON — did you mean "${suggestion}"?`
        : `"${word}" is not valid JSON`,
    );
  }

  function container(close: '}' | ']'): void {
    const isObject = close === '}';
    i += 1;
    depth += 1;
    if (depth > MAX_SCAN_DEPTH) {
      throw new Fault(i, 'the JSON is nested deeper than this linter parses');
    }
    ws();
    if (i < n && text[i] === close) {
      i += 1;
      depth -= 1;
      return;
    }
    for (;;) {
      ws();
      if (i >= n) atEnd();
      if (isObject) {
        if (text[i] !== '"') {
          if (text[i] === close) throw new Fault(i, 'there is a trailing comma before this');
          if (text[i] === "'") {
            throw new Fault(i, 'single quotes are not valid in JSON — use double quotes');
          }
          throw new Fault(i, 'a property name in double quotes was expected here');
        }
        string();
        ws();
        if (i >= n) atEnd();
        if (text[i] !== ':') throw new Fault(i, 'a ":" was expected after the property name');
        i += 1;
      } else if (text[i] === close) {
        throw new Fault(i, 'there is a trailing comma before this');
      }
      value();
      ws();
      if (i >= n) atEnd();
      if (text[i] === ',') {
        i += 1;
        continue;
      }
      if (text[i] === close) {
        i += 1;
        depth -= 1;
        return;
      }
      throw new Fault(i, `a "," or "${close}" was expected here`);
    }
  }

  function value(): void {
    ws();
    if (i >= n) atEnd();
    const c = text[i];
    if (c === '{') container('}');
    else if (c === '[') container(']');
    else if (c === '"') string();
    else if (c === "'") throw new Fault(i, 'single quotes are not valid in JSON — use double quotes');
    else if (c === '-' || (c >= '0' && c <= '9')) number();
    else if (/[A-Za-z]/.test(c)) literal();
    else throw new Fault(i, `unexpected character ${JSON.stringify(c)}`);
  }

  try {
    value();
    ws();
    if (i < n) throw new Fault(i, 'unexpected content after the end of the JSON value');
    return null;
  } catch (err) {
    if (err instanceof Fault) return { index: err.index, reason: err.reason };
    // A stack overflow or anything else unforeseen: still a located fault, just
    // a vaguer one. This function must never propagate.
    return { index: 0, reason: 'this text could not be read as JSON' };
  }
}

/* ── lenient recovery ────────────────────────────────────────────────────── */

export interface StripResult {
  /** Same LENGTH as the input: removed characters become spaces, so every index still maps. */
  text: string;
  removedComments: boolean;
  removedTrailingCommas: boolean;
}

/**
 * Blank out `//` and `/* *\/` comments and trailing commas, preserving length.
 *
 * Length preservation is the point: when the lenient re-parse ALSO fails, the
 * fault is located in this text and its index has to mean the same thing in the
 * original the user is looking at.
 */
export function stripJsonExtras(text: string): StripResult {
  const n = text.length;
  const out: string[] = new Array(n);
  let removedComments = false;
  let removedTrailingCommas = false;
  let i = 0;
  let inString = false;

  function blank(from: number, to: number): void {
    for (let k = from; k < to && k < n; k += 1) {
      out[k] = text.charCodeAt(k) === 10 ? '\n' : ' ';
    }
  }

  while (i < n) {
    const c = text[i];
    if (inString) {
      out[i] = c;
      if (c === '\\' && i + 1 < n) {
        out[i + 1] = text[i + 1];
        i += 2;
        continue;
      }
      if (c === '"') inString = false;
      i += 1;
      continue;
    }
    if (c === '"') {
      inString = true;
      out[i] = c;
      i += 1;
      continue;
    }
    if (c === '/' && text[i + 1] === '/') {
      let j = i;
      while (j < n && text[j] !== '\n') j += 1;
      blank(i, j);
      removedComments = true;
      i = j;
      continue;
    }
    if (c === '/' && text[i + 1] === '*') {
      let j = i + 2;
      while (j < n && !(text[j] === '*' && text[j + 1] === '/')) j += 1;
      j = Math.min(j + 2, n);
      blank(i, j);
      removedComments = true;
      i = j;
      continue;
    }
    if (c === ',') {
      // Look ahead past whitespace AND comments: `[1, /* x */ ]` is a trailing
      // comma too.
      let j = i + 1;
      for (;;) {
        while (j < n && /\s/.test(text[j])) j += 1;
        if (text[j] === '/' && text[j + 1] === '/') {
          while (j < n && text[j] !== '\n') j += 1;
          continue;
        }
        if (text[j] === '/' && text[j + 1] === '*') {
          j += 2;
          while (j < n && !(text[j] === '*' && text[j + 1] === '/')) j += 1;
          j += 2;
          continue;
        }
        break;
      }
      if (text[j] === '}' || text[j] === ']') {
        out[i] = ' ';
        removedTrailingCommas = true;
        i += 1;
        continue;
      }
      out[i] = c;
      i += 1;
      continue;
    }
    out[i] = c;
    i += 1;
  }

  for (let k = 0; k < n; k += 1) if (out[k] === undefined) out[k] = ' ';
  return { text: out.join(''), removedComments, removedTrailingCommas };
}

/** `“ ” ‘ ’` — the quotes a document or chat window substitutes for `"`. */
const SMART_QUOTES = /[“”‘’]/;

export function hasSmartQuotes(text: string): boolean {
  return SMART_QUOTES.test(text);
}

/**
 * Grafana provisioning YAML, recognised textually. Conservative on purpose: the
 * text must not start like JSON AND must carry one of provisioning's own
 * top-level keys, so ordinary YAML falls through to the JSON diagnostic instead
 * of being mislabelled.
 */
export function looksLikeProvisioningYaml(text: string): boolean {
  const head = text.trimStart();
  if (head.startsWith('{') || head.startsWith('[')) return false;
  return /^[ \t]*(apiVersion|providers|datasources|dashboards|deleteDatasources)[ \t]*:/m.test(text);
}

/* ── parseDashboardText ──────────────────────────────────────────────────── */

export type ParseOutcome =
  | { ok: true; dashboard: Record<string, unknown>; notes: string[] }
  | { ok: false; error: string };

const NOT_AN_OBJECT_TAIL = 'paste the dashboard JSON itself, starting with "{".';

function describeTopLevel(value: unknown): string {
  if (value === null) return `This JSON is null, not an object — ${NOT_AN_OBJECT_TAIL}`;
  if (Array.isArray(value)) {
    return (
      'This JSON is an array, not an object — a Grafana dashboard is a single JSON object. If ' +
      'you exported a list of dashboards, paste one of them.'
    );
  }
  const kind = typeof value === 'boolean' ? 'a boolean' : typeof value === 'number' ? 'a number' : 'a string';
  return `This JSON is ${kind}, not an object — ${NOT_AN_OBJECT_TAIL}`;
}

function tryParse(text: string): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch {
    return { ok: false };
  }
}

/** Parse pasted text into a dashboard object, or explain why it is not one. */
export function parseDashboardText(input: string): ParseOutcome {
  const notes: string[] = [];
  let text = input;

  if (text.charCodeAt(0) === 0xfeff) {
    text = text.slice(1);
    notes.push('A byte-order mark was removed before parsing.');
  }

  let parsed = tryParse(text);

  if (!parsed.ok) {
    if (looksLikeProvisioningYaml(text)) {
      return {
        ok: false,
        error:
          'This looks like a Grafana provisioning YAML file, not dashboard JSON. Paste the ' +
          'dashboard JSON itself — in Grafana it is under Dashboard settings → JSON Model.',
      };
    }
    if (hasSmartQuotes(text)) {
      return {
        ok: false,
        error:
          'This text contains typographic quotes (“ ” ‘ ’) where JSON needs ' +
          'plain double quotes — it was probably copied out of a document or a chat window. Copy ' +
          'it again from a plain-text view, or from Grafana’s Dashboard settings → JSON Model.',
      };
    }

    const stripped = stripJsonExtras(text);
    if (stripped.removedComments || stripped.removedTrailingCommas) {
      const relaxed = tryParse(stripped.text);
      if (relaxed.ok) {
        if (stripped.removedComments) {
          notes.push(
            'Comments (// and /* */) were removed before parsing. JSON has no comments and ' +
              'Grafana rejects them.',
          );
        }
        if (stripped.removedTrailingCommas) {
          notes.push('Trailing commas were removed before parsing. Grafana rejects them.');
        }
        parsed = relaxed;
      }
    }

    if (!parsed.ok) {
      const fault = locateJsonFault(stripped.text);
      if (!fault) {
        return {
          ok: false,
          error:
            'This is not valid JSON, and the exact position could not be identified. Compare it ' +
            'against Grafana’s Dashboard settings → JSON Model view.',
        };
      }
      const at = lineColOf(stripped.text, fault.index);
      return {
        ok: false,
        error: `Invalid JSON at line ${at.line}, column ${at.column} — ${fault.reason}.`,
      };
    }
  }

  let value = parsed.value;

  // An escaped-string dashboard: unwrapped ONCE. One level is a known export
  // accident (a dashboard stored in a string field); two levels is a different
  // file, and guessing further would be guessing.
  if (typeof value === 'string') {
    const inner = value.trim();
    if (inner.startsWith('{')) {
      const unwrapped = tryParse(inner);
      if (unwrapped.ok && isPlainObject(unwrapped.value)) {
        notes.push(
          'This file is a JSON string containing dashboard JSON; it was unwrapped once before ' +
            'linting.',
        );
        value = unwrapped.value;
      }
    }
  }

  if (!isPlainObject(value)) return { ok: false, error: describeTopLevel(value) };

  // Re-bound with an explicit type rather than reusing the `unknown` binding:
  // the narrowing from the guard above does not survive the reassignment below.
  let dashboard: Record<string, unknown> = value;

  // A Grafana API response: { meta: {...}, dashboard: {...} }.
  const wrapped = dashboard.dashboard;
  if (isPlainObject(wrapped) && looksLikeDashboard(wrapped) && !looksLikeDashboard(dashboard)) {
    notes.push('The "dashboard" property of a Grafana API response was unwrapped before linting.');
    dashboard = wrapped;
  }

  if (!looksLikeDashboard(dashboard)) {
    notes.push(
      'None of the usual dashboard keys (panels, rows, templating, schemaVersion, title) are ' +
        'present, so this may not be a dashboard at all.',
    );
  }

  return { ok: true, dashboard, notes };
}

/* ── context: panels ─────────────────────────────────────────────────────── */

/** Nested rows do not exist beyond one level in Grafana; the cap is a guard, not a feature. */
const MAX_PANEL_DEPTH = 4;

function panelPath(base: string, index: number): string {
  return `${base}[${index}]`;
}

function makeNode(raw: Record<string, unknown>, path: string, forceRow = false): PanelNode {
  const rawType = raw.type;
  const type = typeof rawType === 'string' && rawType.trim() !== '' ? rawType.trim() : null;
  const rawId = raw.id;
  return {
    raw,
    path,
    title: typeof raw.title === 'string' ? raw.title : '',
    type,
    id: typeof rawId === 'number' && Number.isFinite(rawId) ? rawId : null,
    isRow: forceRow || type === 'row',
    collapsed: raw.collapsed === true,
    childCount: 0,
  };
}

/**
 * Panels a row OWNS in the layout. A collapsed row keeps them in its own
 * `panels`; an expanded one keeps them as following siblings up to the next row.
 * Getting this wrong is what would make `empty-row` fire on every expanded row
 * in every modern dashboard.
 */
function followingSiblings(list: unknown[], from: number): number {
  let count = 0;
  for (let j = from + 1; j < list.length; j += 1) {
    const entry = list[j];
    if (!isPlainObject(entry)) continue;
    if (entry.type === 'row') break;
    count += 1;
  }
  return count;
}

function collectPanels(
  list: unknown[],
  base: string,
  depth: number,
  out: PanelNode[],
  notes: string[],
): void {
  for (let i = 0; i < list.length; i += 1) {
    const entry = list[i];
    const path = panelPath(base, i);
    if (!isPlainObject(entry)) {
      notes.push(`${path} is not an object, so it was skipped.`);
      continue;
    }
    const node = makeNode(entry, path);
    const kids = entry.panels;
    const kidCount = Array.isArray(kids) ? kids.length : 0;
    if (node.isRow) {
      node.childCount = kidCount > 0 ? kidCount : node.collapsed ? 0 : followingSiblings(list, i);
    }
    out.push(node);
    if (node.isRow && Array.isArray(kids) && kids.length > 0 && depth < MAX_PANEL_DEPTH) {
      collectPanels(kids, `${path}.panels`, depth + 1, out, notes);
    }
  }
}

/* ── context: variables ─────────────────────────────────────────────────── */

/**
 * Grafana's global variables. Anything else beginning `__` is also treated as a
 * built-in: Grafana keeps adding them (`$__auto`, `$__rate_interval_ms`,
 * `$__cell_3`), and a linter that called next year's built-in an undefined
 * variable would be confidently wrong. The cost is that a typo inside a `__`
 * name goes unreported, which is listed in the page's "deliberately silent" set.
 */
const BUILT_IN_VARIABLES = new Set([
  '__interval',
  '__interval_ms',
  '__rate_interval',
  '__rate_interval_ms',
  '__range',
  '__range_s',
  '__range_ms',
  '__from',
  '__to',
  '__timeFilter',
  '__timezone',
  '__dashboard',
  '__org',
  '__user',
  '__name',
  '__field',
  '__series',
  '__value',
  '__data',
  '__auto',
  '__auto_interval',
  '__calcs',
  '__all',
  'timeFilter',
  'interval',
  'timeGroup',
  '__unixEpochFrom',
  '__unixEpochTo',
  '__unixEpochGroup',
  '__unixEpochGroupAlias',
  '__timeGroup',
  '__timeGroupAlias',
  '__timeFrom',
  '__timeTo',
]);

export function isBuiltInVariable(name: string): boolean {
  return name.startsWith('__') || BUILT_IN_VARIABLES.has(name);
}

/** `${DS_PROMETHEUS}` and friends: import placeholders, not template variables. */
export function isDatasourceInputName(name: string): boolean {
  return name.startsWith('DS_');
}

/**
 * Variable references, in the four syntaxes Grafana accepts. Names must start
 * with a letter or underscore, which is what keeps `$1` — a regex
 * backreference, extremely common in `label_replace` and `renameByRegex` — from
 * being read as a variable.
 */
const USAGE_RE =
  /\$\{([A-Za-z_][A-Za-z0-9_]*)(?::[^}]*)?\}|\$([A-Za-z_][A-Za-z0-9_]*)|\[\[([A-Za-z_][A-Za-z0-9_]*)(?::[^\]]*)?\]\]/g;

/**
 * Regex tells. `$` is an end-of-line anchor in a regular expression, so a
 * `$name` inside one is as likely to be an anchor plus a literal as a variable
 * — which is why `undefined-variable` demotes itself to a warning there.
 */
const REGEX_SIGNS = /\(\?|\.\*|\.\+|\[\^|\\d|\\w|\\s|\\\.|\{\d+(?:,\d*)?\}|=~|!~/;

export function looksLikeRegex(value: string): boolean {
  return REGEX_SIGNS.test(value);
}

/** The three datasource names Grafana defines itself; a bare name here is correct. */
const SPECIAL_DATASOURCES = new Set(['-- mixed --', '-- dashboard --', '-- grafana --']);

/* ── context: the document walk ─────────────────────────────────────────── */

/** Nodes visited before the walk gives up and says so. */
const MAX_WALK_NODES = 400_000;
/** Object/array nesting the walk descends. */
const MAX_WALK_DEPTH = 200;

function keyPath(parent: string, key: string): string {
  if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) return parent ? `${parent}.${key}` : key;
  return `${parent}[${JSON.stringify(key)}]`;
}

interface WalkFrame {
  value: unknown;
  path: string;
  key: string;
  depth: number;
}

/**
 * Visit every string in the document once, collecting variable usages and
 * bare-name datasource references. Iterative rather than recursive so hostile
 * nesting produces a note instead of a stack overflow, and budgeted so a 5 MB
 * paste cannot turn into an unbounded walk.
 */
function walkStrings(
  root: Record<string, unknown>,
  usages: VarUsage[],
  datasourceNames: DatasourceRef[],
  notes: string[],
): void {
  const stack: WalkFrame[] = [{ value: root, path: '', key: '', depth: 0 }];
  let visited = 0;
  let truncated = false;

  while (stack.length > 0) {
    const frame = stack.pop() as WalkFrame;
    visited += 1;
    if (visited > MAX_WALK_NODES) {
      truncated = true;
      break;
    }
    const { value, path, key, depth } = frame;

    if (typeof value === 'string') {
      if (key === 'datasource' && value.trim() !== '') {
        const name = value.trim();
        const isVariable = name.startsWith('$') || name.includes('${') || name.includes('[[');
        if (!isVariable && !SPECIAL_DATASOURCES.has(name.toLowerCase())) {
          datasourceNames.push({ name, path });
        }
      }
      if (value.includes('$') || value.includes('[[')) {
        const regexLike = looksLikeRegex(value) || key === 'regex';
        USAGE_RE.lastIndex = 0;
        let match: RegExpExecArray | null;
        while ((match = USAGE_RE.exec(value)) !== null) {
          const name = match[1] ?? match[2] ?? match[3];
          if (!name) continue;
          usages.push({
            name,
            syntax: match[1] !== undefined ? 'braced' : match[2] !== undefined ? 'dollar' : 'legacy',
            path,
            inRegexLike: regexLike,
          });
        }
      }
      continue;
    }

    if (depth >= MAX_WALK_DEPTH) {
      truncated = true;
      continue;
    }

    if (Array.isArray(value)) {
      // Reverse order so the stack pops in document order — the first usage of a
      // name has to be the one whose path a diagnostic reports.
      for (let i = value.length - 1; i >= 0; i -= 1) {
        const child = value[i];
        if (child !== null && (typeof child === 'object' || typeof child === 'string')) {
          stack.push({ value: child, path: `${path}[${i}]`, key, depth: depth + 1 });
        }
      }
      continue;
    }

    if (isPlainObject(value)) {
      const keys = Object.keys(value);
      for (let i = keys.length - 1; i >= 0; i -= 1) {
        const childKey = keys[i];
        const child = value[childKey];
        if (child !== null && (typeof child === 'object' || typeof child === 'string')) {
          stack.push({
            value: child,
            path: keyPath(path, childKey),
            key: childKey,
            depth: depth + 1,
          });
        }
      }
    }
  }

  if (truncated) {
    notes.push(
      'This dashboard is larger or deeper than the linter walks, so variable usage past that ' +
        'point was not scanned.',
    );
  }
}

/* ── buildContext ────────────────────────────────────────────────────────── */

/** Index a parsed dashboard into everything the rules read. Never throws. */
export function buildContext(
  dashboard: Record<string, unknown>,
  parseNotes: string[],
): DashboardContext {
  const notes = [...parseNotes];
  const panels: PanelNode[] = [];

  const rootPanels = dashboard.panels;
  if (Array.isArray(rootPanels)) {
    collectPanels(rootPanels, 'panels', 0, panels, notes);
  } else if (rootPanels !== undefined && rootPanels !== null) {
    notes.push('"panels" is not an array, so no panels were read.');
  }

  const legacyRows = dashboard.rows;
  if (Array.isArray(legacyRows)) {
    for (let i = 0; i < legacyRows.length; i += 1) {
      const row = legacyRows[i];
      const path = panelPath('rows', i);
      if (!isPlainObject(row)) {
        notes.push(`${path} is not an object, so it was skipped.`);
        continue;
      }
      const node = makeNode(row, path, true);
      const kids = row.panels;
      node.childCount = Array.isArray(kids) ? kids.length : 0;
      panels.push(node);
      if (Array.isArray(kids) && kids.length > 0) {
        collectPanels(kids, `${path}.panels`, 1, panels, notes);
      }
    }
  } else if (legacyRows !== undefined && legacyRows !== null) {
    notes.push('"rows" is not an array, so no legacy rows were read.');
  }

  const variables: VariableNode[] = [];
  const templating = dashboard.templating;
  if (isPlainObject(templating)) {
    const list = templating.list;
    if (Array.isArray(list)) {
      for (let i = 0; i < list.length; i += 1) {
        const entry = list[i];
        if (!isPlainObject(entry)) continue;
        const name = entry.name;
        if (typeof name !== 'string' || name.trim() === '') continue;
        variables.push({
          name: name.trim(),
          type: typeof entry.type === 'string' ? entry.type : '',
          path: panelPath('templating.list', i),
          raw: entry,
        });
      }
    } else if (list !== undefined && list !== null) {
      notes.push('"templating.list" is not an array, so no variables were read.');
    }
  } else if (templating !== undefined && templating !== null) {
    notes.push('"templating" is not an object, so no variables were read.');
  }

  const usages: VarUsage[] = [];
  const datasourceNames: DatasourceRef[] = [];
  walkStrings(dashboard, usages, datasourceNames, notes);

  const inputNames: string[] = [];
  const rawInputs = dashboard.__inputs;
  const hasInputs = Array.isArray(rawInputs);
  if (Array.isArray(rawInputs)) {
    for (const entry of rawInputs) {
      if (isPlainObject(entry) && typeof entry.name === 'string' && entry.name.trim() !== '') {
        inputNames.push(entry.name.trim());
      }
    }
  } else if (rawInputs !== undefined && rawInputs !== null) {
    notes.push('"__inputs" is not an array, so its import placeholders were not read.');
  }

  const definedNames = new Set(variables.map((v) => v.name));

  const usedNames = new Set<string>();
  for (const usage of usages) {
    if (!isBuiltInVariable(usage.name)) usedNames.add(usage.name);
  }
  const unresolved = new Set<string>();
  for (const name of usedNames) {
    if (!definedNames.has(name)) unresolved.add(name);
  }

  const rawSchema = dashboard.schemaVersion;
  const stats: DashboardStats = {
    schemaVersion:
      typeof rawSchema === 'number' && Number.isFinite(rawSchema) ? rawSchema : null,
    panels: panels.filter((p) => !p.isRow).length,
    rows: panels.filter((p) => p.isRow).length,
    varsDefined: definedNames.size,
    varsUsed: usedNames.size,
    varsUnresolved: unresolved.size,
  };

  return {
    dashboard,
    panels,
    variables,
    definedNames,
    usages,
    datasourceNames,
    inputNames,
    hasInputs,
    stats,
    notes,
  };
}

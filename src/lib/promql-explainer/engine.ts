/**
 * PromQL Explainer — a CLIENT-SIDE, deterministic engine that turns a Prometheus
 * PromQL query into a plain-English explanation plus a token-by-token breakdown.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │  ARCHITECTURE: tokenize → recursive-descent parse → render English.        │
 * │                                                                            │
 * │     <query text> ──tokenize──▶ Token[] ──parse──▶ AST ──render──▶ prose    │
 * │                                                          └─────▶ breakdown │
 * │                                                                            │
 * │  The parser is a pragmatic, operator-precedence recursive descent that     │
 * │  covers the shapes operators actually read every day:                      │
 * │    • instant vector selectors        http_requests_total{job="api"}        │
 * │    • range vector selectors          ...{...}[5m]  and ...[5m:1m] subqueries│
 * │    • the @ / offset modifiers        ...[5m] offset 1h   ...@ end()         │
 * │    • function calls                  rate(...), histogram_quantile(0.95,…)  │
 * │    • aggregations + grouping         sum by(job)(...), topk without(pod)(…) │
 * │    • binary arithmetic & comparison  a / b * 100,  a > 0.9,  a and b        │
 * │    • numbers, strings, durations, scalar arithmetic                        │
 * │                                                                            │
 * │  It explains INSIDE OUT: the innermost selector first, then each wrapping  │
 * │  function/aggregation/operator, mirroring how a human reads the query.     │
 * │                                                                            │
 * │  PRAGMATIC, never brittle: an unknown function is named generically        │
 * │  ("applies the foo() function to …") rather than rejected, and the engine  │
 * │  NEVER throws — a parse it cannot finish degrades to a best-effort          │
 * │  explanation with an `error` set. Output is DETERMINISTIC for a given input.│
 * └──────────────────────────────────────────────────────────────────────────┘
 */

import type { ExplainPart, ExplainResult } from './types';

/* ══════════════════════════════════════════════════════════════════════════ *
 *  TOKENIZER
 * ══════════════════════════════════════════════════════════════════════════ */

type TokKind =
  | 'ident' // metric/function/aggregation name, or keyword
  | 'number'
  | 'string'
  | 'duration' // 5m, 1h30m, 1d, …
  | 'lparen'
  | 'rparen'
  | 'lbrace'
  | 'rbrace'
  | 'lbracket'
  | 'rbracket'
  | 'comma'
  | 'colon'
  | 'op' // arithmetic / comparison / set operator
  | 'at' // @ modifier
  | 'eof';

interface Token {
  kind: TokKind;
  /** The literal source text of the token. */
  text: string;
  /** Start offset in the source (for diagnostics). */
  pos: number;
}

/** Multi-character operators, longest first so the scanner is greedy. */
const MULTI_OPS = ['==', '!=', '>=', '<=', '=~', '!~', '^'];
const SINGLE_OPS = ['+', '-', '*', '/', '%', '>', '<', '=', '~'];

/** Matches a PromQL duration like `5m`, `1h30m`, `2w`, `500ms`. */
const DURATION_RE = /^(?:\d+(?:ms|s|m|h|d|w|y))+$/;

/** Scan a duration starting at `i`; returns the end index or -1 if not one. */
function scanDuration(src: string, i: number): number {
  const m = /^(?:\d+(?:ms|s|m|h|d|w|y))+/.exec(src.slice(i));
  return m ? i + m[0].length : -1;
}

/**
 * Turn a query string into a flat token list. Tolerant: any character it does
 * not recognise becomes a single-char `op` token, so the parser can still make
 * progress (and report) rather than the tokenizer throwing.
 */
function tokenize(src: string): Token[] {
  const toks: Token[] = [];
  let i = 0;
  const n = src.length;

  while (i < n) {
    const c = src[i];

    // Whitespace.
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') {
      i++;
      continue;
    }

    // Line comments (# … to end of line).
    if (c === '#') {
      while (i < n && src[i] !== '\n') i++;
      continue;
    }

    // Strings: single, double, or backtick (raw) quoted.
    if (c === '"' || c === "'" || c === '`') {
      const start = i;
      const quote = c;
      i++;
      while (i < n && src[i] !== quote) {
        if (src[i] === '\\' && quote !== '`') i++; // skip escaped char (not in raw)
        i++;
      }
      i++; // consume closing quote (if present; tolerant of unterminated)
      toks.push({ kind: 'string', text: src.slice(start, i), pos: start });
      continue;
    }

    // Brackets / punctuation.
    const punct: Record<string, TokKind> = {
      '(': 'lparen',
      ')': 'rparen',
      '{': 'lbrace',
      '}': 'rbrace',
      '[': 'lbracket',
      ']': 'rbracket',
      ',': 'comma',
      ':': 'colon',
      '@': 'at',
    };
    if (c in punct) {
      toks.push({ kind: punct[c], text: c, pos: i });
      i++;
      continue;
    }

    // Numbers (incl. floats, scientific, hex, leading dot) — but a digit run
    // that forms a duration is a duration, not a number.
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[i + 1] ?? ''))) {
      const durEnd = scanDuration(src, i);
      if (durEnd !== -1) {
        toks.push({ kind: 'duration', text: src.slice(i, durEnd), pos: i });
        i = durEnd;
        continue;
      }
      const m = /^(?:0x[0-9a-fA-F]+|(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?|[iI]nf|[nN]a[nN])/.exec(
        src.slice(i),
      );
      const text = m ? m[0] : c;
      toks.push({ kind: 'number', text, pos: i });
      i += text.length;
      continue;
    }

    // Identifiers (and keywords). Metric names may contain ':' but we tokenize
    // ':' separately (for subqueries); recording-rule names with ':' are still
    // explained sensibly as the parser stitches ident + colon back together.
    if (/[A-Za-z_]/.test(c)) {
      let j = i + 1;
      while (j < n && /[A-Za-z0-9_]/.test(src[j])) j++;
      toks.push({ kind: 'ident', text: src.slice(i, j), pos: i });
      i = j;
      continue;
    }

    // Operators — multi-character first, then single.
    let matched = false;
    for (const op of MULTI_OPS) {
      if (src.startsWith(op, i)) {
        toks.push({ kind: 'op', text: op, pos: i });
        i += op.length;
        matched = true;
        break;
      }
    }
    if (matched) continue;
    if (SINGLE_OPS.includes(c)) {
      toks.push({ kind: 'op', text: c, pos: i });
      i++;
      continue;
    }

    // Anything else: emit as a single-char op so the parser can step past it.
    toks.push({ kind: 'op', text: c, pos: i });
    i++;
  }

  toks.push({ kind: 'eof', text: '', pos: n });
  return toks;
}

/* ══════════════════════════════════════════════════════════════════════════ *
 *  KNOWLEDGE BASE  — function & aggregation glosses, operator readings.
 * ══════════════════════════════════════════════════════════════════════════ */

/** Range-vector functions: the ones that consume a `[range]` selector. */
const RANGE_FUNCS: Record<string, string> = {
  rate: 'computes the per-second average rate of increase over the range — the standard way to turn a counter into a rate',
  irate: 'computes the per-second instant rate using only the last two samples in the range — good for fast-moving counters',
  increase: 'computes the total increase of a counter over the range (rate × the range length)',
  delta: 'computes the difference between the first and last value over the range (for gauges)',
  idelta: 'computes the difference between the last two samples in the range',
  deriv: 'computes the per-second derivative of a gauge over the range using simple linear regression',
  predict_linear: 'predicts the value a given number of seconds into the future using linear regression over the range',
  resets: 'counts how many times a counter reset (went down) over the range',
  changes: 'counts how many times the value changed over the range',
  sum_over_time: 'sums all sample values within the range, per series',
  avg_over_time: 'averages all sample values within the range, per series',
  min_over_time: 'takes the minimum sample value within the range, per series',
  max_over_time: 'takes the maximum sample value within the range, per series',
  count_over_time: 'counts how many samples fall within the range, per series',
  last_over_time: 'takes the most recent sample value within the range, per series',
  present_over_time: 'returns 1 for any series that has at least one sample within the range',
  stddev_over_time: 'computes the population standard deviation of samples within the range',
  stdvar_over_time: 'computes the population standard variance of samples within the range',
  quantile_over_time: 'computes a φ-quantile of the sample values within the range',
  mad_over_time: 'computes the median absolute deviation of samples within the range',
};

/** Instant-vector functions: operate on an instant vector (no `[range]`). */
const INSTANT_FUNCS: Record<string, string> = {
  abs: 'returns the absolute value of each sample',
  ceil: 'rounds each sample up to the nearest integer',
  floor: 'rounds each sample down to the nearest integer',
  round: 'rounds each sample to the nearest integer (or multiple)',
  exp: 'raises e to the power of each sample',
  ln: 'computes the natural logarithm of each sample',
  log2: 'computes the base-2 logarithm of each sample',
  log10: 'computes the base-10 logarithm of each sample',
  sqrt: 'computes the square root of each sample',
  sgn: 'returns the sign of each sample (-1, 0, or 1)',
  clamp: 'clamps each sample between a minimum and maximum',
  clamp_min: 'clamps each sample to a minimum value',
  clamp_max: 'clamps each sample to a maximum value',
  scalar: 'converts a single-series instant vector into a scalar value',
  vector: 'converts a scalar into a single-element instant vector',
  absent: 'returns 1 (with the given labels) when the input vector has no elements — handy for alerting on missing data',
  absent_over_time: 'returns 1 when the range vector is empty over the whole window — alerts on data that stopped',
  histogram_quantile: 'estimates a φ-quantile (e.g. a p95 latency) from a histogram’s bucket counts',
  histogram_count: 'returns the total observation count of a native histogram',
  histogram_sum: 'returns the sum of observations of a native histogram',
  histogram_fraction: 'returns the fraction of native-histogram observations in a value range',
  label_replace: 'copies/derives a label using a regular expression and stores it under a new label name',
  label_join: 'joins several label values together into one new label',
  timestamp: 'returns the Unix timestamp of each sample',
  time: 'returns the current evaluation time as a Unix timestamp',
  day_of_week: 'returns the day of the week (0–6) for each sample’s timestamp',
  day_of_month: 'returns the day of the month for each sample’s timestamp',
  day_of_year: 'returns the day of the year for each sample’s timestamp',
  days_in_month: 'returns the number of days in the month of each sample’s timestamp',
  hour: 'returns the hour of the day for each sample’s timestamp',
  minute: 'returns the minute of the hour for each sample’s timestamp',
  month: 'returns the month for each sample’s timestamp',
  year: 'returns the year for each sample’s timestamp',
  sort: 'sorts the elements of the vector in ascending order',
  sort_desc: 'sorts the elements of the vector in descending order',
};

/** Aggregation operators and how they combine series. */
const AGG_OPS: Record<string, string> = {
  sum: 'adds the series together',
  avg: 'averages the series',
  min: 'takes the minimum across the series',
  max: 'takes the maximum across the series',
  count: 'counts how many series there are',
  count_values: 'counts the number of series that share each sample value',
  stddev: 'computes the population standard deviation across the series',
  stdvar: 'computes the population standard variance across the series',
  group: 'groups the series, emitting 1 per group (membership only)',
  topk: 'keeps the k series with the largest values',
  bottomk: 'keeps the k series with the smallest values',
  quantile: 'computes a φ-quantile across the series',
  limitk: 'samples up to k arbitrary series per group',
  limit_ratio: 'samples a deterministic ratio of the series per group',
};

/** Set of all aggregation names for quick membership tests. */
const AGG_NAMES = new Set(Object.keys(AGG_OPS));

/** Aggregations that take a leading parameter (k, φ, …) before the vector. */
const AGG_WITH_PARAM = new Set(['topk', 'bottomk', 'quantile', 'count_values', 'limitk', 'limit_ratio']);

/**
 * Plain-English readings for the binary operators. Used both in the breakdown
 * legend (short verb) and, via `OP_ARITH_PHRASE` / `OP_COMPARE_PHRASE`, to build
 * natural connecting prose in the inside-out explanation.
 */
const OP_MEANINGS: Record<string, string> = {
  '+': 'adds',
  '-': 'subtracts',
  '*': 'multiplies',
  '/': 'divides',
  '%': 'takes the modulo (remainder) of',
  '^': 'raises to the power of',
  '==': 'keeps samples that are equal to',
  '!=': 'keeps samples that are not equal to',
  '>': 'keeps samples greater than',
  '<': 'keeps samples less than',
  '>=': 'keeps samples greater than or equal to',
  '<=': 'keeps samples less than or equal to',
  and: 'intersects with (keeps series present in both sides)',
  or: 'unions with (adds series from the right side that are missing on the left)',
  unless: 'excludes series that also appear on the right side',
  atan2: 'computes the arctangent of the two sides',
};

/** Connecting phrase for arithmetic ops: "…, then <phrase> <right>". */
const OP_ARITH_PHRASE: Record<string, string> = {
  '+': 'adds',
  '-': 'subtracts',
  '*': 'multiplies that by',
  '/': 'divides that by',
  '%': 'takes the remainder of that divided by',
  '^': 'raises that to the power of',
  atan2: 'computes the arctangent of that and',
};

/** Connecting phrase for comparison ops: "…, then keeps only the samples …". */
const OP_COMPARE_PHRASE: Record<string, string> = {
  '==': 'equal to',
  '!=': 'not equal to',
  '>': 'greater than',
  '<': 'less than',
  '>=': 'greater than or equal to',
  '<=': 'less than or equal to',
};

/** Connecting phrase for set ops: "…, then <phrase> <right>". */
const OP_SET_PHRASE: Record<string, string> = {
  and: 'keeps only the series that also exist in',
  or: 'adds any series missing on the left from',
  unless: 'drops the series that also appear in',
};

/** A short symbolic-vs-comparison classifier for prose. */
const COMPARISON_OPS = new Set(['==', '!=', '>', '<', '>=', '<=']);
const SET_OPS = new Set(['and', 'or', 'unless']);
const ARITH_OPS = new Set(['+', '-', '*', '/', '%', '^', 'atan2']);

/** The label-matcher operators and their readings. */
const MATCHER_OPS: Record<string, string> = {
  '=': 'equals',
  '!=': 'is not',
  '=~': 'matches the regular expression',
  '!~': 'does not match the regular expression',
};

/* ══════════════════════════════════════════════════════════════════════════ *
 *  AST
 * ══════════════════════════════════════════════════════════════════════════ */

interface NumberNode {
  type: 'number';
  text: string;
}
interface StringNode {
  type: 'string';
  text: string;
}
interface LabelMatcher {
  name: string;
  op: string; // = != =~ !~
  value: string; // includes the surrounding quotes as written
}
interface SelectorNode {
  type: 'selector';
  metric: string; // may be '' for a bare {…} selector
  matchers: LabelMatcher[];
  /** Range like `5m` when this is a range-vector selector, else null. */
  range: string | null;
  /** Subquery step like `1m` (from `[range:step]`), else null. */
  step: string | null;
  /** `@` modifier text (e.g. `start()`, a timestamp), else null. */
  at: string | null;
  /** `offset` text (e.g. `5m`, `-1h`), else null. */
  offset: string | null;
}
interface ParenNode {
  type: 'paren';
  expr: Node;
}
interface UnaryNode {
  type: 'unary';
  op: string; // '-' or '+'
  expr: Node;
}
interface CallNode {
  type: 'call';
  name: string;
  args: Node[];
}
interface AggNode {
  type: 'agg';
  name: string;
  /** 'by' | 'without' | null. */
  grouping: 'by' | 'without' | null;
  labels: string[];
  /** Leading parameter for topk/quantile/etc., else null. */
  param: Node | null;
  /** The vector being aggregated. */
  arg: Node;
}
interface BinaryNode {
  type: 'binary';
  op: string;
  /** Vector-matching modifier text, e.g. "on(job) group_left(env)", or ''. */
  matching: string;
  /** True when a `bool` modifier was present on a comparison. */
  bool: boolean;
  left: Node;
  right: Node;
}

type Node =
  | NumberNode
  | StringNode
  | SelectorNode
  | ParenNode
  | UnaryNode
  | CallNode
  | AggNode
  | BinaryNode;

/* ══════════════════════════════════════════════════════════════════════════ *
 *  PARSER  (recursive descent with operator precedence)
 * ══════════════════════════════════════════════════════════════════════════ */

/** Thrown internally to abandon a parse; always caught before returning. */
class ParseError extends Error {}

/**
 * Binary-operator precedence (higher binds tighter), per the PromQL spec:
 *   ^  >  * / %  >  + -  >  == != <= < >= >  >  and unless  >  or
 */
const PRECEDENCE: Record<string, number> = {
  or: 1,
  and: 2,
  unless: 2,
  '==': 3,
  '!=': 3,
  '<=': 3,
  '<': 3,
  '>=': 3,
  '>': 3,
  '+': 4,
  '-': 4,
  '*': 5,
  '/': 5,
  '%': 5,
  atan2: 5,
  '^': 6,
};

/** `^` is right-associative; everything else left-associative. */
const RIGHT_ASSOC = new Set(['^']);

class Parser {
  private toks: Token[];
  private p = 0;

  constructor(toks: Token[]) {
    this.toks = toks;
  }

  private peek(): Token {
    return this.toks[this.p];
  }
  private next(): Token {
    return this.toks[this.p++];
  }
  private at(kind: TokKind): boolean {
    return this.peek().kind === kind;
  }
  private isKeyword(word: string): boolean {
    const t = this.peek();
    return t.kind === 'ident' && t.text.toLowerCase() === word;
  }
  private expect(kind: TokKind, what: string): Token {
    if (this.peek().kind !== kind) {
      throw new ParseError(`Expected ${what}.`);
    }
    return this.next();
  }

  /** Entry point: parse a full expression, then require EOF. */
  parse(): Node {
    const node = this.parseBinary(0);
    if (!this.at('eof')) {
      const t = this.peek();
      throw new ParseError(`Unexpected “${t.text || 'input'}” after a complete expression.`);
    }
    return node;
  }

  /** Precedence-climbing binary-expression parser. */
  private parseBinary(minPrec: number): Node {
    let left = this.parseUnary();

    for (;;) {
      const t = this.peek();
      const opText = this.binaryOpText(t);
      if (opText === null) break;
      const prec = PRECEDENCE[opText];
      if (prec === undefined || prec < minPrec) break;

      this.next(); // consume the operator token (ident or op)

      // Optional `bool` and vector-matching modifiers after a binary operator.
      let bool = false;
      const matchingParts: string[] = [];
      if (this.isKeyword('bool')) {
        this.next();
        bool = true;
      }
      this.collectMatching(matchingParts);

      const nextMin = RIGHT_ASSOC.has(opText) ? prec : prec + 1;
      const right = this.parseBinary(nextMin);

      left = {
        type: 'binary',
        op: opText,
        matching: matchingParts.join(' '),
        bool,
        left,
        right,
      } satisfies BinaryNode;
    }

    return left;
  }

  /**
   * Return the lowercased operator text for the current token if it begins a
   * binary operator (symbolic or the `and`/`or`/`unless`/`atan2` keywords).
   */
  private binaryOpText(t: Token): string | null {
    if (t.kind === 'op' && PRECEDENCE[t.text] !== undefined) return t.text;
    if (t.kind === 'ident') {
      const w = t.text.toLowerCase();
      if (w === 'and' || w === 'or' || w === 'unless' || w === 'atan2') return w;
    }
    return null;
  }

  /** Collect `on(...)/ignoring(...)` + `group_left/group_right(...)` modifiers. */
  private collectMatching(out: string[]): void {
    while (this.isKeyword('on') || this.isKeyword('ignoring')) {
      out.push(this.next().text); // on | ignoring
      out.push(this.readParenLabelList());
      if (this.isKeyword('group_left') || this.isKeyword('group_right')) {
        out.push(this.next().text);
        if (this.at('lparen')) out.push(this.readParenLabelList());
      }
    }
  }

  /** Read a parenthesised label list as literal text, e.g. "(job, instance)". */
  private readParenLabelList(): string {
    if (!this.at('lparen')) return '()';
    let depth = 0;
    const parts: string[] = [];
    do {
      const t = this.next();
      parts.push(t.text);
      if (t.kind === 'lparen') depth++;
      else if (t.kind === 'rparen') depth--;
      if (t.kind === 'eof') break;
    } while (depth > 0);
    return parts.join('').replace(/,(?=\S)/g, ', ');
  }

  /** Unary +/- prefix, then a primary. */
  private parseUnary(): Node {
    const t = this.peek();
    if (t.kind === 'op' && (t.text === '-' || t.text === '+')) {
      this.next();
      const expr = this.parseUnary();
      return { type: 'unary', op: t.text, expr } satisfies UnaryNode;
    }
    return this.parsePostfix(this.parsePrimary());
  }

  /**
   * After a primary, attach any postfix `[range]`, `[range:step]`, `@ modifier`
   * and `offset duration` — but only when the primary is a selector (PromQL
   * only allows these on selectors / subquery expressions). For paren/call we
   * still accept a trailing subquery `[d:s]` since those are legal too.
   */
  private parsePostfix(node: Node): Node {
    // Range / subquery bracket.
    if (this.at('lbracket')) {
      this.next();
      const range = this.at('duration') || this.at('number') ? this.next().text : '';
      let step: string | null = null;
      if (this.at('colon')) {
        this.next();
        step = this.at('duration') || this.at('number') ? this.next().text : '';
      }
      this.expect('rbracket', 'a closing “]” for the range');
      node = this.attachRange(node, range, step);
    }

    // @ modifier and offset, in either order, attach to the (range) selector.
    for (;;) {
      if (this.at('at')) {
        this.next();
        const atText = this.readModifierValue();
        node = this.attachAt(node, atText);
      } else if (this.isKeyword('offset')) {
        this.next();
        const offText = this.readModifierValue();
        node = this.attachOffset(node, offText);
      } else {
        break;
      }
    }
    return node;
  }

  /** Read the value following `@` or `offset` (a duration, number, or `fn()`). */
  private readModifierValue(): string {
    const t = this.peek();
    if (t.kind === 'op' && t.text === '-') {
      this.next();
      return '-' + this.readModifierValue();
    }
    if (t.kind === 'duration' || t.kind === 'number') return this.next().text;
    if (t.kind === 'ident') {
      // start() / end() style modifiers.
      let s = this.next().text;
      if (this.at('lparen')) {
        s += '(';
        this.next();
        if (this.at('rparen')) this.next();
        s += ')';
      }
      return s;
    }
    return '';
  }

  private attachRange(node: Node, range: string, step: string | null): Node {
    if (node.type === 'selector') {
      node.range = range || node.range;
      node.step = step;
      return node;
    }
    // A subquery on a non-selector (e.g. rate(...)[5m:1m]) — wrap it so the
    // renderer can still describe it. We model it as a paren carrying range.
    return { type: 'paren', expr: node } satisfies ParenNode;
  }
  private attachAt(node: Node, at: string): Node {
    if (node.type === 'selector') node.at = at;
    return node;
  }
  private attachOffset(node: Node, offset: string): Node {
    if (node.type === 'selector') node.offset = offset;
    return node;
  }

  /** Parse a primary: number, string, paren group, function/aggregation, selector. */
  private parsePrimary(): Node {
    const t = this.peek();

    if (t.kind === 'number') {
      this.next();
      return { type: 'number', text: t.text } satisfies NumberNode;
    }
    if (t.kind === 'string') {
      this.next();
      return { type: 'string', text: t.text } satisfies StringNode;
    }
    if (t.kind === 'duration') {
      // A bare duration used as a value (rare, but tolerate it as a "number").
      this.next();
      return { type: 'number', text: t.text } satisfies NumberNode;
    }
    if (t.kind === 'lparen') {
      this.next();
      const inner = this.parseBinary(0);
      this.expect('rparen', 'a closing “)”');
      return { type: 'paren', expr: inner } satisfies ParenNode;
    }
    if (t.kind === 'lbrace') {
      // A bare label selector with no metric name: {job="api"}.
      return this.parseSelector('');
    }
    if (t.kind === 'ident') {
      return this.parseIdentExpr();
    }

    throw new ParseError(
      t.kind === 'eof'
        ? 'The query ended unexpectedly.'
        : `Did not expect “${t.text}” here.`,
    );
  }

  /**
   * An identifier may begin an aggregation, a function call, or a metric
   * selector. Disambiguate by the name and what follows.
   */
  private parseIdentExpr(): Node {
    const nameTok = this.next();
    const name = nameTok.text;
    const lower = name.toLowerCase();

    // Aggregation: name [by(...)|without(...)] ( [param ,] vector ) — or the
    // grouping clause may follow the parenthesised argument instead.
    if (AGG_NAMES.has(lower)) {
      return this.parseAggregation(name);
    }

    // Function call: name ( args... ).
    if (this.at('lparen')) {
      this.next();
      const args = this.parseArgList();
      this.expect('rparen', `a closing “)” for ${name}()`);
      return { type: 'call', name, args } satisfies CallNode;
    }

    // Otherwise it is a metric name (optionally with a {…} selector / range).
    // Support recording-rule names that include ':' — stitch ident:ident back.
    let metric = name;
    while (this.at('colon')) {
      // Only treat ':' as part of the name when NOT inside a bracket context;
      // here we are at primary position so a ':' glued to idents is a name.
      const save = this.p;
      this.next(); // colon
      if (this.at('ident')) {
        metric += ':' + this.next().text;
      } else {
        this.p = save;
        break;
      }
    }
    return this.parseSelector(metric);
  }

  /** Parse the comma-separated argument list of a function call. */
  private parseArgList(): Node[] {
    const args: Node[] = [];
    if (this.at('rparen')) return args;
    for (;;) {
      args.push(this.parseBinary(0));
      if (this.at('comma')) {
        this.next();
        continue;
      }
      break;
    }
    return args;
  }

  /** Parse `metric{matchers}` (matchers/metric optional) — no range here. */
  private parseSelector(metric: string): SelectorNode {
    const node: SelectorNode = {
      type: 'selector',
      metric,
      matchers: [],
      range: null,
      step: null,
      at: null,
      offset: null,
    };
    if (this.at('lbrace')) {
      this.next();
      node.matchers = this.parseMatchers();
      this.expect('rbrace', 'a closing “}” for the label matchers');
    }
    return node;
  }

  /** Parse the contents of a `{ … }` label-matcher block. */
  private parseMatchers(): LabelMatcher[] {
    const matchers: LabelMatcher[] = [];
    while (!this.at('rbrace') && !this.at('eof')) {
      const nameTok = this.peek();
      if (nameTok.kind !== 'ident') {
        // Skip an unexpected token defensively rather than failing the parse.
        this.next();
        if (this.at('comma')) this.next();
        continue;
      }
      const labelName = this.next().text;
      const opTok = this.peek();
      let op = '=';
      if (opTok.kind === 'op' && opTok.text in MATCHER_OPS) {
        op = this.next().text;
      }
      let value = '';
      if (this.at('string')) value = this.next().text;
      matchers.push({ name: labelName, op, value });
      if (this.at('comma')) this.next();
    }
    return matchers;
  }

  /** Parse an aggregation expression, with grouping before or after the args. */
  private parseAggregation(name: string): AggNode {
    let grouping: 'by' | 'without' | null = null;
    let labels: string[] = [];

    const readGrouping = (): void => {
      if (this.isKeyword('by') || this.isKeyword('without')) {
        grouping = this.next().text.toLowerCase() as 'by' | 'without';
        labels = this.parseLabelList();
      }
    };

    // Grouping may precede the parenthesised argument.
    readGrouping();

    this.expect('lparen', `a “(” after the ${name} aggregation`);
    const inner = this.parseArgList();
    this.expect('rparen', `a closing “)” for ${name}`);

    // …or follow it.
    if (grouping === null) readGrouping();

    let param: Node | null = null;
    let arg: Node;
    if (AGG_WITH_PARAM.has(name.toLowerCase()) && inner.length >= 2) {
      param = inner[0];
      arg = inner[1];
    } else {
      arg = inner.length > 0 ? inner[inner.length - 1] : { type: 'number', text: '' };
    }

    return { type: 'agg', name, grouping, labels, param, arg } satisfies AggNode;
  }

  /** Parse a `( label, list )` after by/without/on/ignoring into names. */
  private parseLabelList(): string[] {
    const labels: string[] = [];
    if (!this.at('lparen')) return labels;
    this.next();
    while (!this.at('rparen') && !this.at('eof')) {
      if (this.at('ident')) labels.push(this.next().text);
      else this.next();
      if (this.at('comma')) this.next();
    }
    if (this.at('rparen')) this.next();
    return labels;
  }
}

/* ══════════════════════════════════════════════════════════════════════════ *
 *  RENDERER  — AST → English explanation + token breakdown.
 * ══════════════════════════════════════════════════════════════════════════ */

/** Strip the surrounding quotes from a string-literal token, if present. */
function unquote(s: string): string {
  if (s.length >= 2) {
    const q = s[0];
    if ((q === '"' || q === "'" || q === '`') && s[s.length - 1] === q) {
      return s.slice(1, -1);
    }
  }
  return s;
}

/** Join a list of clauses with commas and a trailing "and". */
function joinList(items: string[]): string {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
}

/** A human reading of a PromQL duration like `5m` → "5 minutes". */
const DUR_UNITS: Record<string, [string, string]> = {
  ms: ['millisecond', 'milliseconds'],
  s: ['second', 'seconds'],
  m: ['minute', 'minutes'],
  h: ['hour', 'hours'],
  d: ['day', 'days'],
  w: ['week', 'weeks'],
  y: ['year', 'years'],
};

function humanDuration(dur: string): string {
  const neg = dur.startsWith('-');
  const body = neg ? dur.slice(1) : dur;
  const re = /(\d+)(ms|s|m|h|d|w|y)/g;
  const parts: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    const n = Number(m[1]);
    const [one, many] = DUR_UNITS[m[2]] ?? ['unit', 'units'];
    parts.push(`${n} ${n === 1 ? one : many}`);
  }
  if (parts.length === 0) return dur;
  const text = joinList(parts);
  return neg ? `${text} in the future` : text;
}

/** Describe a single label matcher in prose. */
function describeMatcher(m: LabelMatcher): string {
  const verb = MATCHER_OPS[m.op] ?? `(${m.op})`;
  const val = unquote(m.value);
  if (m.op === '=~' || m.op === '!~') {
    return `${m.name} ${verb} ${JSON.stringify(val)}`;
  }
  return `${m.name} ${verb} ${JSON.stringify(val)}`;
}

/** Describe the matchers of a selector as a "where …" clause (or ''). */
function describeMatchers(matchers: LabelMatcher[]): string {
  if (matchers.length === 0) return '';
  return ' where ' + joinList(matchers.map(describeMatcher));
}

/** Compose a prose description of a selector (instant or range). */
function describeSelector(s: SelectorNode): string {
  const metric = s.metric ? `the \`${s.metric}\` metric` : 'the time series';
  const where = describeMatchers(s.matchers);
  let core: string;
  if (s.range) {
    const win = humanDuration(s.range);
    if (s.step) {
      core = `the values of ${metric}${where} as a subquery over the last ${win}, evaluated every ${humanDuration(s.step)}`;
    } else {
      core = `the values of ${metric}${where} over the last ${win}`;
    }
  } else {
    core = `the current value of ${metric}${where}`;
  }
  if (s.offset) core += `, shifted back in time by ${humanDuration(s.offset)}`;
  if (s.at) core += `, evaluated at the fixed time ${atReading(s.at)}`;
  return core;
}

/** Reading for an `@` modifier value. */
function atReading(at: string): string {
  if (at === 'start()') return 'the start of the query range';
  if (at === 'end()') return 'the end of the query range';
  return `${at} (a Unix timestamp)`;
}

/** A short label-grouping clause for an aggregation. */
function groupingClause(grouping: 'by' | 'without' | null, labels: string[]): string {
  if (!grouping) return ', collapsing every series into a single result';
  const list = labels.length ? labels.map((l) => `\`${l}\``).join(', ') : '(no labels)';
  if (grouping === 'by') {
    return labels.length
      ? `, grouped by ${list} (one result per distinct combination of those labels)`
      : ', grouped into a single result';
  }
  return `, grouped by everything except ${list}`;
}

/** Reading of a scalar value node (for params and operands). */
function numberReading(text: string): string {
  if (text === '') return 'a value';
  return text;
}

/** Recursively render an AST node to a prose clause (lower-case, no trailing period). */
function renderNode(node: Node): string {
  switch (node.type) {
    case 'number':
      return `the scalar ${numberReading(node.text)}`;
    case 'string':
      return `the string ${JSON.stringify(unquote(node.text))}`;
    case 'selector':
      return describeSelector(node);
    case 'paren':
      return renderNode(node.expr);
    case 'unary':
      return node.op === '-' ? `the negation of ${renderNode(node.expr)}` : renderNode(node.expr);
    case 'call':
      return renderCall(node);
    case 'agg':
      return renderAgg(node);
    case 'binary':
      return renderBinary(node);
  }
}

/** Render a function call, with the inside-out reading of its arguments. */
function renderCall(node: CallNode): string {
  const lower = node.name.toLowerCase();
  const args = node.args;

  // Special, common shapes get tailored prose.
  if (lower === 'histogram_quantile' && args.length >= 2) {
    const phi = renderNode(args[0]);
    const inner = renderNode(args[1]);
    const pct = percentLabel(args[0]);
    return `estimates the ${pct} from a histogram, where ${inner} (using ${phi} as the target quantile)`;
  }
  if (lower === 'label_replace' && args.length >= 1) {
    return `takes ${renderNode(args[0])} and derives a new label from an existing one using a regular expression`;
  }
  if (lower === 'label_join' && args.length >= 1) {
    return `takes ${renderNode(args[0])} and joins several label values into one new label`;
  }

  const known = RANGE_FUNCS[lower] ?? INSTANT_FUNCS[lower];
  const argText = args.length ? joinList(args.map(renderNode)) : 'no arguments';

  if (known) {
    // Read as "<verb phrase> of <inner>".
    return `${known}, applied to ${argText}`;
  }
  // Unknown function — name it generically rather than failing.
  return `applies the \`${node.name}()\` function to ${argText}`;
}

/** Render an aggregation node. */
function renderAgg(node: AggNode): string {
  const lower = node.name.toLowerCase();
  const verb = AGG_OPS[lower] ?? `aggregates with \`${node.name}\``;
  const inner = renderNode(node.arg);
  const group = groupingClause(node.grouping, node.labels);

  if (AGG_WITH_PARAM.has(lower) && node.param) {
    const p = renderNode(node.param);
    if (lower === 'topk' || lower === 'bottomk' || lower === 'limitk') {
      const k = node.param.type === 'number' ? node.param.text : p;
      return `${verb.replace(/\bk\b/, k)}${group}, taken from ${inner}`;
    }
    if (lower === 'quantile') {
      return `${verb} (the ${percentLabel(node.param)})${group}, computed over ${inner}`;
    }
    return `${verb} using ${p}${group}, over ${inner}`;
  }

  return `${verb}${group}, over ${inner}`;
}

/**
 * Render a binary-operator node with arithmetic/comparison/set semantics.
 *
 * Operands are rendered as plain clauses (no leading "takes …"); a left operand
 * that is itself a binary therefore flattens naturally into the same sentence
 * (e.g. `1 - a / b` → "the scalar 1, then subtracts a, then divides that by b").
 * The single sentence-leading verb is supplied later by `finishSentence`, so we
 * deliberately do NOT prefix one here — that avoids a "takes takes …" stutter
 * when binaries nest.
 */
function renderBinary(node: BinaryNode): string {
  const left = renderNode(node.left);
  const right = renderNode(node.right);
  const matching = node.matching ? ` (matching series by ${node.matching})` : '';

  if (COMPARISON_OPS.has(node.op)) {
    const rel = OP_COMPARE_PHRASE[node.op] ?? node.op;
    if (node.bool) {
      return `${left}, then for each sample returns 1 when it is ${rel} ${right} and 0 otherwise${matching}`;
    }
    return `${left}, then keeps only the samples that are ${rel} ${right}${matching}`;
  }
  if (SET_OPS.has(node.op)) {
    const phrase = OP_SET_PHRASE[node.op] ?? `combines with “${node.op}” against`;
    return `${left}, then ${phrase} ${right}${matching}`;
  }
  // Arithmetic.
  const phrase = OP_ARITH_PHRASE[node.op] ?? `combines with “${node.op}” and`;
  return `${left}, then ${phrase} ${right}${matching}`;
}

/** Turn a quantile scalar (0.95) into a "p95"-style label when it looks like one. */
function percentLabel(node: Node): string {
  if (node.type === 'number') {
    const n = Number(node.text);
    if (Number.isFinite(n) && n > 0 && n < 1) {
      const pct = n * 100;
      const rounded = Math.round(pct * 100) / 100;
      const label = Number.isInteger(rounded) ? `p${rounded}` : `${rounded}th percentile`;
      return `${label} (the ${rounded}% quantile)`;
    }
  }
  return 'requested quantile';
}

/* ── Token breakdown ───────────────────────────────────────────────────────── */

/**
 * Walk the AST collecting `{token, meaning}` rows for the notable fragments,
 * roughly in source order. De-duplicates repeated function/operator rows so the
 * list stays a useful legend rather than an exhaustive echo.
 */
function buildBreakdown(node: Node): ExplainPart[] {
  const parts: ExplainPart[] = [];
  const seen = new Set<string>();

  const push = (token: string, meaning: string): void => {
    const key = `${token} ${meaning}`;
    if (seen.has(key)) return;
    seen.add(key);
    parts.push({ token, meaning });
  };

  const walk = (n: Node): void => {
    switch (n.type) {
      case 'number':
        if (n.text) push(n.text, 'A scalar (constant) value.');
        break;
      case 'string':
        push(n.text, 'A string literal.');
        break;
      case 'selector': {
        if (n.metric) {
          push(n.metric, `The metric being queried${n.range ? ' (as a range vector)' : ' (an instant vector)'}.`);
        } else if (n.matchers.length) {
          push('{…}', 'A label-only selector (no metric name).');
        }
        for (const m of n.matchers) {
          const verb = MATCHER_OPS[m.op] ?? m.op;
          push(`${m.name}${m.op}${m.value}`, `Selects series where the \`${m.name}\` label ${verb} ${JSON.stringify(unquote(m.value))}.`);
        }
        if (n.range) {
          const tok = n.step ? `[${n.range}:${n.step}]` : `[${n.range}]`;
          push(
            tok,
            n.step
              ? `A subquery: evaluate over the last ${humanDuration(n.range)} at a ${humanDuration(n.step)} step.`
              : `A range vector: all samples within the last ${humanDuration(n.range)}.`,
          );
        }
        if (n.offset) push(`offset ${n.offset}`, `Shifts the lookup back in time by ${humanDuration(n.offset)}.`);
        if (n.at) push(`@ ${n.at}`, `Pins evaluation to ${atReading(n.at)}.`);
        break;
      }
      case 'paren':
        walk(n.expr);
        break;
      case 'unary':
        push(n.op, n.op === '-' ? 'Negates the value.' : 'Unary plus (no effect).');
        walk(n.expr);
        break;
      case 'call': {
        const lower = n.name.toLowerCase();
        const meaning = RANGE_FUNCS[lower] ?? INSTANT_FUNCS[lower];
        push(
          `${n.name}()`,
          meaning ? capitalize(meaning) + '.' : `An unrecognised function — best-effort: applies \`${n.name}()\` to its arguments.`,
        );
        n.args.forEach(walk);
        break;
      }
      case 'agg': {
        const lower = n.name.toLowerCase();
        push(n.name, capitalize(AGG_OPS[lower] ?? `aggregates with ${n.name}`) + '.');
        if (n.grouping) {
          const list = n.labels.join(', ');
          push(
            `${n.grouping}(${list})`,
            n.grouping === 'by'
              ? `Keeps one result per distinct value of ${list ? `\`${list}\`` : 'the group'}.`
              : `Aggregates away all labels except ${list ? `\`${list}\`` : 'none'}.`,
          );
        }
        if (n.param) walk(n.param);
        walk(n.arg);
        break;
      }
      case 'binary': {
        const verb = OP_MEANINGS[n.op] ?? n.op;
        const kind = COMPARISON_OPS.has(n.op)
          ? 'comparison'
          : SET_OPS.has(n.op)
            ? 'set'
            : ARITH_OPS.has(n.op)
              ? 'arithmetic'
              : 'binary';
        push(n.op, `${capitalize(kind)} operator — ${verb}.`);
        if (n.bool) push('bool', 'Returns 1/0 from the comparison instead of filtering series.');
        if (n.matching) push(n.matching, 'Vector-matching modifier controlling how the two sides line up.');
        walk(n.left);
        walk(n.right);
        break;
      }
    }
  };

  walk(node);
  return parts;
}

/** Capitalize the first character of a clause. */
function capitalize(s: string): string {
  return s.length ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

/** Finish a prose clause into a sentence: capitalize + period-terminate. */
function finishSentence(clause: string): string {
  const trimmed = clause.trim();
  if (trimmed === '') return '';
  const capped = capitalize(trimmed);
  return /[.!?]$/.test(capped) ? capped : `${capped}.`;
}

/* ══════════════════════════════════════════════════════════════════════════ *
 *  PUBLIC API
 * ══════════════════════════════════════════════════════════════════════════ */

/**
 * Explain a PromQL query in plain English with a token-by-token breakdown.
 *
 * Never throws on user input. An empty query, or one the parser cannot finish,
 * returns an `error` together with a best-effort `explanation` so the UI always
 * has something to show. Output is deterministic for a given input.
 */
export function explain(query: string): ExplainResult {
  const raw = typeof query === 'string' ? query : '';
  const trimmed = raw.trim();

  if (trimmed === '') {
    return {
      error: 'Enter a PromQL query to explain.',
      explanation: 'Paste a PromQL query above — for example a rate over a range, or a sum aggregation — and its meaning will appear here.',
      breakdown: [],
    };
  }

  // Quick structural sanity check: balanced brackets. Reported, not thrown.
  const balanceError = checkBalanced(trimmed);

  let node: Node | null = null;
  let parseError: string | null = null;
  try {
    const toks = tokenize(trimmed);
    node = new Parser(toks).parse();
  } catch (e) {
    parseError = e instanceof ParseError ? e.message : 'This does not look like a valid PromQL query.';
  }

  if (node === null) {
    return {
      error: balanceError ?? parseError ?? 'Could not parse this PromQL query.',
      explanation:
        'OpsCanopy could not fully parse this query. Check for balanced brackets, matching quotes, and a complete expression, then try again.',
      breakdown: [],
    };
  }

  let explanation: string;
  let breakdown: ExplainPart[];
  try {
    explanation = finishSentence(renderNode(node));
    breakdown = buildBreakdown(node);
  } catch {
    // Rendering should never fail, but stay safe per the never-throw contract.
    return {
      error: 'Could not produce an explanation for this query.',
      explanation: 'This query parsed, but OpsCanopy could not render a clear explanation for it.',
      breakdown: [],
    };
  }

  // A balance warning is non-fatal once we have an explanation; surface it as a
  // soft error so the playground can still show the (best-effort) reading.
  const result: ExplainResult = { explanation, breakdown };
  if (balanceError) result.error = balanceError;
  return result;
}

/** Best-effort bracket-balance check (parentheses, braces, square brackets). */
function checkBalanced(src: string): string | null {
  const stack: string[] = [];
  const open: Record<string, string> = { '(': ')', '{': '}', '[': ']' };
  const close = new Set([')', '}', ']']);
  let inString: string | null = null;

  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inString) {
      if (c === '\\' && inString !== '`') i++;
      else if (c === inString) inString = null;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      inString = c;
      continue;
    }
    if (c in open) {
      stack.push(open[c]);
    } else if (close.has(c)) {
      const want = stack.pop();
      if (want !== c) {
        return `Unbalanced “${c}” — check your parentheses, braces, and brackets.`;
      }
    }
  }
  if (inString) return 'Unterminated string literal — check your quotes.';
  if (stack.length) return `Missing a closing “${stack[stack.length - 1]}” — check your brackets.`;
  return null;
}

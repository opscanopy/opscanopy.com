/**
 * LogQL ↔ PromQL Helper — the pure, client-side conversion engine.
 *
 * `convert(direction, query)` best-effort translates a single metric query
 * between Grafana Loki LogQL and Prometheus PromQL and returns a
 * {@link ConvertResult}: the translated `output`, a list of `notes` describing
 * what mapped, was approximated, or was dropped, and an `error` set only when
 * the input cannot be parsed at all.
 *
 * Design rules (load-bearing — the playground depends on them):
 *   • NEVER throws. Every failure path returns `{ output: '', notes, error }`.
 *   • Deterministic: same input → same output. No clocks, no randomness.
 *   • Best-effort, not a full grammar. We recognise the *common* metric-query
 *     shapes and degrade gracefully (with a note) on everything else.
 *
 * Shapes handled, in both directions:
 *   • Label matchers:   {job="api", level=~"error|warn"}  (=, !=, =~, !~)
 *   • Range-aggregations (LogQL):  rate(<sel> [5m]),
 *       count_over_time / bytes_rate / bytes_over_time / sum_over_time /
 *       avg_over_time / max_over_time / min_over_time
 *   • PromQL range functions:      rate / irate / increase / count_over_time /
 *       sum_over_time / avg_over_time / max_over_time / min_over_time (<m>[5m])
 *   • Vector aggregations:  sum / avg / min / max / count by(...) / without(...)
 *
 * Gaps we explain rather than guess (see notes):
 *   • LogQL line filters (|= "x", |~ "re", != …) and pipeline stages (| json,
 *     | logfmt, | label_format …) have NO PromQL equivalent — dropped + noted.
 *   • A PromQL leaf is a bare metric name; LogQL needs a *stream selector*.
 *     We synthesise `{__name__="<metric>"}` and note that Loki has no such
 *     series — the user must point it at a real log stream.
 */

import type { ConvertResult, Direction } from './types';

/* ────────────────────────────────────────────────────────────────────────
 * Small shared helpers
 * ──────────────────────────────────────────────────────────────────────── */

/** Build a failed result. Output is always empty on error. */
function fail(error: string, notes: string[] = []): ConvertResult {
  return { output: '', notes, error };
}

/** A label matcher: `name <op> "value"`. */
interface Matcher {
  name: string;
  op: '=' | '!=' | '=~' | '!~';
  value: string;
}

/** A parsed `{ ... }` selector: its matchers and any leading metric name. */
interface Selector {
  /** Bare metric/identifier prefix before the braces, if present (PromQL). */
  metric: string;
  matchers: Matcher[];
}

/** Escape a double-quoted label value for re-emission. */
function quote(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/** Render a matcher list back to `{a="b", c=~"d"}` form (or `{}` when empty). */
function renderMatchers(matchers: Matcher[]): string {
  const inner = matchers.map((m) => `${m.name}${m.op}${quote(m.value)}`).join(', ');
  return `{${inner}}`;
}

/**
 * Parse the matcher list inside a `{ ... }` block (the text BETWEEN the braces).
 * Returns the matchers or `{ error }`. Tolerant of whitespace and a trailing
 * comma; never throws.
 */
function parseMatchers(inner: string): Matcher[] | { error: string } {
  const text = inner.trim();
  if (text === '') return [];

  const matchers: Matcher[] = [];
  let i = 0;
  const n = text.length;

  while (i < n) {
    // Skip whitespace and separating commas.
    while (i < n && (/\s/.test(text[i]) || text[i] === ',')) i += 1;
    if (i >= n) break;

    // Label name: a Prometheus/Loki identifier.
    const nameStart = i;
    while (i < n && /[A-Za-z0-9_]/.test(text[i])) i += 1;
    const name = text.slice(nameStart, i);
    if (name === '') {
      return { error: `Unexpected character “${text[i]}” in the label matchers.` };
    }

    while (i < n && /\s/.test(text[i])) i += 1;

    // Operator: =~, !~, !=, = (check the two-char ones first).
    let op: Matcher['op'] | null = null;
    if (text.startsWith('=~', i)) op = '=~';
    else if (text.startsWith('!~', i)) op = '!~';
    else if (text.startsWith('!=', i)) op = '!=';
    else if (text[i] === '=') op = '=';
    if (op === null) {
      return { error: `Expected =, !=, =~ or !~ after label “${name}”.` };
    }
    i += op.length;

    while (i < n && /\s/.test(text[i])) i += 1;

    // Quoted value (double-quoted; honour backslash escapes).
    if (text[i] !== '"') {
      return { error: `Label “${name}” must have a double-quoted value.` };
    }
    i += 1; // opening quote
    let value = '';
    let closed = false;
    while (i < n) {
      const ch = text[i];
      if (ch === '\\' && i + 1 < n) {
        const next = text[i + 1];
        value += next === 'n' ? '\n' : next === 't' ? '\t' : next;
        i += 2;
        continue;
      }
      if (ch === '"') {
        closed = true;
        i += 1;
        break;
      }
      value += ch;
      i += 1;
    }
    if (!closed) {
      return { error: `Unterminated quoted value for label “${name}”.` };
    }

    matchers.push({ name, op, value });
  }

  return matchers;
}

/**
 * Find the LAST top-level `{ ... }` selector in `text` and parse it. Returns the
 * selector plus the slices of text BEFORE and AFTER the braces, so callers can
 * inspect a metric-name prefix or a trailing pipeline. Returns `null` when there
 * is no brace block; `{ error }` when the braces are malformed.
 */
function extractSelector(
  text: string,
): { selector: Selector; before: string; after: string } | null | { error: string } {
  const open = text.indexOf('{');
  if (open === -1) return null;

  // Find the matching close brace (selectors don't nest in these languages).
  const close = text.indexOf('}', open);
  if (close === -1) {
    return { error: 'A selector is missing its closing “}”.' };
  }

  const inner = text.slice(open + 1, close);
  const parsed = parseMatchers(inner);
  if ('error' in parsed) return parsed;

  const before = text.slice(0, open).trim();
  const after = text.slice(close + 1).trim();

  // A bare identifier immediately before the braces is a PromQL metric name.
  let metric = '';
  const metricMatch = before.match(/([A-Za-z_:][A-Za-z0-9_:]*)\s*$/);
  if (metricMatch) metric = metricMatch[1];

  return { selector: { metric, matchers: parsed }, before, after };
}

/* ────────────────────────────────────────────────────────────────────────
 * Function name tables
 * ──────────────────────────────────────────────────────────────────────── */

/** LogQL range-aggregations → the closest PromQL range function. */
const LOGQL_RANGE_TO_PROMQL: Record<string, { fn: string; note?: string }> = {
  rate: { fn: 'rate' },
  count_over_time: { fn: 'count_over_time' },
  bytes_rate: {
    fn: 'rate',
    note: 'bytes_rate measures bytes/second of log volume — there is no PromQL counterpart. Mapped to rate() over a placeholder counter; point it at a real bytes metric.',
  },
  bytes_over_time: {
    fn: 'sum_over_time',
    note: 'bytes_over_time sums log bytes in the window — no direct PromQL function. Mapped to sum_over_time() over a placeholder; substitute a real bytes metric.',
  },
  sum_over_time: { fn: 'sum_over_time' },
  avg_over_time: { fn: 'avg_over_time' },
  max_over_time: { fn: 'max_over_time' },
  min_over_time: { fn: 'min_over_time' },
  first_over_time: { fn: 'min_over_time', note: 'PromQL has no first_over_time; min_over_time used as a stand-in.' },
  last_over_time: { fn: 'last_over_time' },
  stdvar_over_time: { fn: 'stdvar_over_time' },
  stddev_over_time: { fn: 'stddev_over_time' },
  quantile_over_time: { fn: 'quantile_over_time' },
};

/** PromQL range functions → the closest LogQL range-aggregation. */
const PROMQL_RANGE_TO_LOGQL: Record<string, { fn: string; note?: string }> = {
  rate: { fn: 'rate' },
  irate: { fn: 'rate', note: 'LogQL has no irate(); rate() (average over the window) used instead.' },
  increase: {
    fn: 'count_over_time',
    note: 'increase() returns the counter delta over the window; the nearest LogQL shape is count_over_time() of matching log lines.',
  },
  count_over_time: { fn: 'count_over_time' },
  sum_over_time: { fn: 'sum_over_time' },
  avg_over_time: { fn: 'avg_over_time' },
  max_over_time: { fn: 'max_over_time' },
  min_over_time: { fn: 'min_over_time' },
  last_over_time: { fn: 'last_over_time' },
  stdvar_over_time: { fn: 'stdvar_over_time' },
  stddev_over_time: { fn: 'stddev_over_time' },
  quantile_over_time: { fn: 'quantile_over_time' },
};

/** Vector aggregation operators shared (by name) between the two languages. */
const VECTOR_AGGREGATORS = new Set([
  'sum', 'avg', 'min', 'max', 'count', 'stddev', 'stdvar', 'topk', 'bottomk', 'count_values',
]);

/* ────────────────────────────────────────────────────────────────────────
 * Top-level expression decomposition
 *
 * Both languages share the shape:
 *     [agg-op] [by/without(labels)] ( <range-fn>( <inner> [range] ) )
 * We peel that outer aggregation off (if present), translate the inner
 * range-expression, then re-wrap. The peeling is intentionally lenient.
 * ──────────────────────────────────────────────────────────────────────── */

/** A peeled outer vector aggregation. */
interface OuterAgg {
  op: string;
  /** "by" | "without" | "" (no grouping). */
  grouping: 'by' | 'without' | '';
  labels: string[];
  /** The expression inside the aggregation's parentheses. */
  inner: string;
}

/** Find the matching close paren for the open paren at `text[openIdx]`. */
function matchParen(text: string, openIdx: number): number {
  let depth = 0;
  for (let i = openIdx; i < text.length; i += 1) {
    if (text[i] === '(') depth += 1;
    else if (text[i] === ')') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/**
 * Try to peel a leading vector aggregation (`sum by (x) ( … )`). Both
 * `agg by(...) ( … )` and `agg( … ) by (...)` orderings are accepted (PromQL
 * allows the modifier on either side). Returns `null` when `text` is not a
 * recognised aggregation; `{ error }` on a malformed one.
 */
function peelOuterAgg(text: string): OuterAgg | null | { error: string } {
  const t = text.trim();
  const head = t.match(/^([A-Za-z_][A-Za-z0-9_]*)\b/);
  if (!head) return null;
  const op = head[1];
  if (!VECTOR_AGGREGATORS.has(op)) return null;

  let rest = t.slice(op.length).trim();

  let grouping: OuterAgg['grouping'] = '';
  let labels: string[] = [];

  /** Consume a leading `by(...)` / `without(...)` clause from `rest`, if present. */
  function consumeGrouping(): { error: string } | null {
    const g = rest.match(/^(by|without)\b/);
    if (!g) return null;
    const kw = g[1] as 'by' | 'without';
    let after = rest.slice(kw.length).trim();
    if (after[0] !== '(') return { error: `Expected “(” after ${kw} in the aggregation.` };
    const cl = matchParen(after, 0);
    if (cl === -1) return { error: `Unclosed “(” after ${kw}.` };
    const labelText = after.slice(1, cl);
    labels = labelText
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    grouping = kw;
    rest = after.slice(cl + 1).trim();
    return null;
  }

  // by/without may appear before the parenthesised body.
  const preErr = consumeGrouping();
  if (preErr) return preErr;

  // The aggregation body: a parenthesised expression.
  if (rest[0] !== '(') {
    // Not the agg(...) shape we handle — let the caller treat the whole thing
    // as a plain range-expression.
    return null;
  }
  const close = matchParen(rest, 0);
  if (close === -1) return { error: `Unclosed “(” in the ${op}() aggregation.` };
  const inner = rest.slice(1, close);
  const tail = rest.slice(close + 1).trim();

  // by/without may instead trail the body (PromQL).
  if (grouping === '' && tail) {
    rest = tail;
    const postErr = consumeGrouping();
    if (postErr) return postErr;
  }

  return { op, grouping, labels, inner };
}

/* ────────────────────────────────────────────────────────────────────────
 * Range-expression translation (the leaf level)
 * ──────────────────────────────────────────────────────────────────────── */

/** Match a `fn ( <body> )` call, returning the name and inner body. */
function parseCall(text: string): { fn: string; body: string } | null {
  const t = text.trim();
  const m = t.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*\(/);
  if (!m) return null;
  const openIdx = t.indexOf('(', m[1].length);
  const close = matchParen(t, openIdx);
  if (close === -1) return null;
  // Anything trailing the call (other than whitespace) means this isn't a clean
  // single call — let the caller decide.
  if (t.slice(close + 1).trim() !== '') return null;
  return { fn: m[1], body: t.slice(openIdx + 1, close) };
}

/** Pull a trailing `[5m]` (or `[1h:]`) range off a selector body. */
function splitRange(body: string): { sel: string; range: string | null } {
  const m = body.match(/\[([^\]]*)\]\s*$/);
  if (!m || m.index === undefined) return { sel: body.trim(), range: null };
  return { sel: body.slice(0, m.index).trim(), range: m[1].trim() };
}

/* ── LogQL → PromQL ──────────────────────────────────────────────────────── */

/** Translate the inner range-expression of a LogQL query to PromQL. */
function logqlRangeToPromql(text: string, notes: string[]): string | { error: string } {
  const call = parseCall(text);
  if (!call) {
    return {
      error:
        'Could not recognise a LogQL metric query. Expected something like ' +
        'rate({job="api"} |= "error" [5m]) or count_over_time({app="x"}[1m]).',
    };
  }

  const map = LOGQL_RANGE_TO_PROMQL[call.fn];
  if (!map) {
    return {
      error: `Unsupported LogQL range function “${call.fn}”. Supported: ${Object.keys(
        LOGQL_RANGE_TO_PROMQL,
      ).join(', ')}.`,
    };
  }
  if (map.note) notes.push(map.note);

  const { sel: selBody, range } = splitRange(call.body);
  if (!range) {
    notes.push('No [range] was found on the LogQL selector; defaulted to [5m].');
  }
  const rangeText = range || '5m';

  const extracted = extractSelector(selBody);
  if (extracted && 'error' in extracted) return extracted;
  if (!extracted) {
    return { error: 'The LogQL selector has no “{…}” stream selector to translate.' };
  }

  const { selector, after } = extracted;

  // LogQL pipeline stages (line filters, parsers, label filters) live after the
  // selector and have no PromQL analog — surface them, then drop.
  if (after) {
    notes.push(
      `Dropped the LogQL pipeline “${after}”. PromQL has no log-line filters or ` +
        'parser stages (|=, |~, | json, | logfmt, | label_format, …) — apply that ' +
        'filtering with label matchers on your Prometheus metric instead.',
    );
  }

  // PromQL keeps label matchers but needs a metric name, not a log stream.
  notes.push(
    'PromQL selects a metric, not a log stream. Replace the {…} matchers with a real ' +
      'Prometheus metric name (e.g. http_requests_total{…}); the labels are kept as-is.',
  );

  const matcherText = renderMatchers(selector.matchers);
  return `${map.fn}(${matcherText}[${rangeText}])`;
}

/* ── PromQL → LogQL ──────────────────────────────────────────────────────── */

/** Translate the inner range-expression of a PromQL query to LogQL. */
function promqlRangeToLogql(text: string, notes: string[]): string | { error: string } {
  const call = parseCall(text);

  // A bare instant vector (`http_requests_total{…}`) with no range function:
  // LogQL has no instant metric selector — it always needs a range-aggregation.
  if (!call) {
    const extracted = extractSelector(text);
    if (extracted && 'error' in extracted) return extracted;
    if (!extracted && !/^[A-Za-z_:][A-Za-z0-9_:]*$/.test(text.trim())) {
      return {
        error:
          'Could not recognise a PromQL query. Expected something like ' +
          'rate(http_requests_total{job="api"}[5m]) or sum by(job)(rate(metric[1m])).',
      };
    }
    const selector: Selector =
      extracted && !('error' in extracted)
        ? extracted.selector
        : { metric: text.trim(), matchers: [] };
    notes.push(
      'A bare PromQL selector has no LogQL equivalent — LogQL metric queries must ' +
        'wrap a stream in a range-aggregation. Wrapped it in count_over_time([5m]); ' +
        'adjust the function and range to suit.',
    );
    const streamSel = promqlSelectorToLogqlStream(selector, notes);
    return `count_over_time(${streamSel} [5m])`;
  }

  const map = PROMQL_RANGE_TO_LOGQL[call.fn];
  if (!map) {
    return {
      error: `Unsupported PromQL range function “${call.fn}”. Supported: ${Object.keys(
        PROMQL_RANGE_TO_LOGQL,
      ).join(', ')}.`,
    };
  }
  if (map.note) notes.push(map.note);

  const { sel: selBody, range } = splitRange(call.body);
  if (!range) {
    notes.push('No [range] was found on the PromQL selector; defaulted to [5m].');
  }
  const rangeText = range || '5m';

  const extracted = extractSelector(selBody);
  if (extracted && 'error' in extracted) return extracted;

  let selector: Selector;
  if (extracted) {
    selector = extracted.selector;
  } else {
    // Bare metric name inside the range function, e.g. rate(up[5m]).
    const bare = selBody.trim();
    if (!/^[A-Za-z_:][A-Za-z0-9_:]*$/.test(bare)) {
      return { error: `Could not parse the selector inside ${call.fn}(): “${selBody}”.` };
    }
    selector = { metric: bare, matchers: [] };
  }

  const streamSel = promqlSelectorToLogqlStream(selector, notes);
  return `${map.fn}(${streamSel} [${rangeText}])`;
}

/**
 * Turn a PromQL selector (metric name + matchers) into a LogQL stream selector.
 * The metric name becomes a synthetic `__name__` matcher with a note, since
 * Loki has no metric series — only labelled log streams.
 */
function promqlSelectorToLogqlStream(selector: Selector, notes: string[]): string {
  const matchers = [...selector.matchers];
  if (selector.metric) {
    matchers.unshift({ name: '__name__', op: '=', value: selector.metric });
    notes.push(
      `Loki has no metric named “${selector.metric}”. Kept it as {__name__="${selector.metric}"} ` +
        'for reference, but you must point this at a real log stream (e.g. {job="…"}) for it to run.',
    );
  } else if (matchers.length === 0) {
    notes.push(
      'The selector had no labels. Loki requires at least one stream label — add one ' +
        '(e.g. {job="…"}) before running this in Loki.',
    );
  }
  return renderMatchers(matchers);
}

/* ────────────────────────────────────────────────────────────────────────
 * Top-level convert()
 * ──────────────────────────────────────────────────────────────────────── */

/**
 * Translate a single metric query between LogQL and PromQL.
 *
 * @param direction Which way to translate.
 * @param query     The source query string.
 * @returns A {@link ConvertResult}. Never throws; unparseable input yields
 *          `{ output: '', notes, error }`.
 */
export function convert(direction: Direction, query: string): ConvertResult {
  const notes: string[] = [];

  if (typeof query !== 'string') return fail('No query was provided.');
  const trimmed = query.replace(/\r/g, '').trim();
  if (trimmed === '') {
    return fail('The query is empty. Paste a LogQL or PromQL metric query to translate.');
  }
  if (direction !== 'logql-to-promql' && direction !== 'promql-to-logql') {
    return fail('Unknown conversion direction.');
  }

  // Reject obvious multi-line / multi-statement pastes early with a clear hint.
  if (/\n/.test(trimmed)) {
    return fail('Please paste a single query on one line.');
  }

  const toPromql = direction === 'logql-to-promql';

  // ── Peel an optional outer vector aggregation (sum/avg/… by/without(...)). ──
  const peeled = peelOuterAgg(trimmed);
  if (peeled && 'error' in peeled) return fail(peeled.error, notes);

  const translateRange =
    toPromql
      ? (inner: string) => logqlRangeToPromql(inner, notes)
      : (inner: string) => promqlRangeToLogql(inner, notes);

  if (peeled) {
    // Note operators that aren't symmetric across the languages.
    if (peeled.op === 'count_values') {
      notes.push(
        'count_values is a PromQL aggregation with no LogQL equivalent and may not translate cleanly.',
      );
    }
    if ((peeled.op === 'topk' || peeled.op === 'bottomk') && toPromql) {
      notes.push(`${peeled.op} exists in both languages but takes a leading numeric argument; verify the count.`);
    }

    const innerOut = translateRange(peeled.inner.trim());
    if (typeof innerOut !== 'string') return fail(innerOut.error, notes);

    // Re-assemble the aggregation. Both languages share `op by/without(...)(…)`.
    const grouping =
      peeled.grouping === ''
        ? ''
        : ` ${peeled.grouping}(${peeled.labels.join(', ')})`;
    const output = `${peeled.op}${grouping}(${innerOut})`;
    return { output, notes };
  }

  // ── No outer aggregation: translate the (range-)expression directly. ──
  const out = translateRange(trimmed);
  if (typeof out !== 'string') return fail(out.error, notes);
  return { output: out, notes };
}

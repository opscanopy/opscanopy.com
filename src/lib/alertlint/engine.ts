/**
 * AlertLint preview engine — a CLIENT-SIDE, deterministic evaluator that gives
 * honest pass/fail feedback on Grafana Loki alerting & recording rules.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │  THIS IS A PREVIEW SUBSET OF LogQL — NOT THE REAL LOKI ENGINE.             │
 * │                                                                            │
 * │  The production engine will be Loki's own query path compiled to WASM.    │
 * │  Until then, this file implements just enough of LogQL to run the bundled │
 * │  examples and similarly-shaped, hand-written rules:                       │
 * │                                                                            │
 * │    • stream selectors:        {app="foo", level="error"}                  │
 * │    • equality matchers:       label="v"  /  label!="v"                     │
 * │    • regex matchers:          label=~"re" / label!~"re"                    │
 * │    • line filters:            |= "x"  != "x"  |~ "re"  !~ "re"             │
 * │    • metric queries:          count_over_time(<logsel> [<range>])         │
 * │                               rate(<logsel> [<range>])                     │
 * │    • aggregation:             sum( <metric> )   sum by (l) ( <metric> )    │
 * │    • comparison thresholds:   > >= < <= ==                                  │
 * │                                                                            │
 * │  Anything outside this subset is reported as an error rather than guessed. │
 * │  The clock is SYNTHETIC: time is derived purely from log offsets and the   │
 * │  test's eval_time, never from wall-clock — so runs are reproducible.       │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

// js-yaml v4 ships ESM but no bundled type declarations, and @types/js-yaml is
// not a project dependency. Declare the tiny surface we use so the project
// type-checks under strict mode without adding a dependency.
declare module 'js-yaml' {
  export function load(input: string, options?: unknown): unknown;
  const _default: { load: typeof load };
  export default _default;
}

import yaml from 'js-yaml';
import type { RunResult, TestResult, ShareState } from './types';

/* ────────────────────────────────────────────────────────────────────────── *
 *  Parsed-document shapes (loose — user input is validated as we read it).
 * ────────────────────────────────────────────────────────────────────────── */

interface LokiRule {
  alert?: string;
  record?: string;
  expr: string;
  for?: string;
  labels?: Record<string, string>;
  annotations?: Record<string, string>;
}

interface LokiRuleGroup {
  name?: string;
  rules?: LokiRule[];
}

interface LokiRulerFile {
  groups?: LokiRuleGroup[];
}

interface TestLogStream {
  stream?: Record<string, string>;
  logs?: string[];
}

interface ExpAlert {
  exp_labels?: Record<string, string>;
  exp_annotations?: Record<string, string>;
}

interface AlertRuleTest {
  eval_time?: string;
  alertname?: string;
  exp_alerts?: ExpAlert[];
}

interface ExpSample {
  value?: number;
  labels?: string | Record<string, string>;
}

interface RecordingRuleTest {
  eval_time?: string;
  record?: string;
  exp_samples?: ExpSample[];
}

interface TestCase {
  interval?: string;
  input_streams?: TestLogStream[];
  alert_rule_test?: AlertRuleTest[];
  recording_rule_test?: RecordingRuleTest[];
}

interface TestFile {
  rule_files?: string[];
  evaluation_interval?: string;
  tests?: TestCase[];
}

/* ────────────────────────────────────────────────────────────────────────── *
 *  Errors carrying enough context for a line-referenced message.
 * ────────────────────────────────────────────────────────────────────────── */

class EvalError extends Error {}

/* ────────────────────────────────────────────────────────────────────────── *
 *  Duration / offset parsing.  Supports the units used by Loki tests:
 *  s, m, h, d, w  (e.g. "30s", "6m", "1h").  Returns seconds.
 * ────────────────────────────────────────────────────────────────────────── */

const UNIT_SECONDS: Record<string, number> = {
  s: 1,
  m: 60,
  h: 3600,
  d: 86400,
  w: 604800,
};

/** Parse a Prometheus/Loki style duration like "0m", "30s", "1h30m" → seconds. */
function parseDuration(raw: string | number | undefined, ctx: string): number {
  if (raw === undefined || raw === null) return 0;
  if (typeof raw === 'number') return raw; // already seconds
  const s = String(raw).trim();
  if (s === '' || s === '0') return 0;
  // Allow compound durations (e.g. "1h30m") as well as single units.
  const re = /(\d+)\s*(s|m|h|d|w)/gi;
  let total = 0;
  let matched = false;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) {
    matched = true;
    const value = Number(m[1]);
    const unit = m[2].toLowerCase();
    total += value * UNIT_SECONDS[unit];
  }
  if (!matched) {
    throw new EvalError(`Could not parse duration "${raw}" in ${ctx}. Use units like 30s, 5m, 1h.`);
  }
  return total;
}

/* ────────────────────────────────────────────────────────────────────────── *
 *  Log store.  Each entry has an absolute synthetic timestamp (seconds from
 *  t=0) and the stream labels it belongs to, plus the raw line text.
 * ────────────────────────────────────────────────────────────────────────── */

interface LogEntry {
  t: number; // synthetic seconds from t=0
  labels: Record<string, string>;
  line: string;
}

/**
 * Build the in-memory log store from the test's input_streams.
 * Each log line is "<offset> <message>", e.g. "0m  Failed password for root".
 * The offset is the time (from t=0) the line was emitted; the remainder of the
 * string (after the first run of whitespace) is the log line content.
 */
function buildLogStore(streams: TestLogStream[]): LogEntry[] {
  const store: LogEntry[] = [];
  streams.forEach((stream, si) => {
    const labels = stream.stream ?? {};
    const logs = stream.logs ?? [];
    logs.forEach((raw, li) => {
      const text = String(raw);
      const space = text.search(/\s/);
      if (space === -1) {
        throw new EvalError(
          `input_streams[${si}].logs[${li}] "${text}" must be "<offset> <message>", e.g. "0m Failed login".`,
        );
      }
      const offset = text.slice(0, space);
      const line = text.slice(space + 1).replace(/^\s+/, '');
      const t = parseDuration(offset, `input_streams[${si}].logs[${li}]`);
      store.push({ t, labels, line });
    });
  });
  return store;
}

/* ────────────────────────────────────────────────────────────────────────── *
 *  Stream-selector & line-filter parsing.
 * ────────────────────────────────────────────────────────────────────────── */

type MatcherOp = '=' | '!=' | '=~' | '!~';

interface LabelMatcher {
  label: string;
  op: MatcherOp;
  value: string;
}

interface LineFilter {
  op: '|=' | '!=' | '|~' | '!~';
  value: string;
}

interface LogSelector {
  matchers: LabelMatcher[];
  filters: LineFilter[];
}

/** Parse the `{...}` label-matcher block. */
function parseMatchers(inside: string, ctx: string): LabelMatcher[] {
  const matchers: LabelMatcher[] = [];
  const body = inside.trim();
  if (body === '') return matchers;
  // Split on commas that are not inside quotes.
  const parts = splitTopLevel(body, ',');
  for (const part of parts) {
    const p = part.trim();
    if (p === '') continue;
    const m = p.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*(=~|!~|!=|=)\s*"((?:[^"\\]|\\.)*)"$/);
    if (!m) {
      throw new EvalError(`Invalid label matcher "${p}" in ${ctx}.`);
    }
    matchers.push({ label: m[1], op: m[2] as MatcherOp, value: unescape(m[3]) });
  }
  return matchers;
}

/**
 * Parse a log-stream selector with optional line filters:
 *   {app="x", level=~"err.*"} |= "boom" != "ok" |~ "re" !~ "re"
 * Returns the selector and the index just past the consumed selector.
 */
function parseLogSelector(expr: string, ctx: string): LogSelector {
  const open = expr.indexOf('{');
  const close = expr.indexOf('}', open + 1);
  if (open === -1 || close === -1) {
    throw new EvalError(`Expected a stream selector "{...}" in ${ctx}.`);
  }
  const matchers = parseMatchers(expr.slice(open + 1, close), ctx);
  const filters: LineFilter[] = [];

  // Walk the remainder for line filters.
  let rest = expr.slice(close + 1).trim();
  const filterRe = /^(\|=|!=|\|~|!~)\s*"((?:[^"\\]|\\.)*)"/;
  while (rest.length > 0) {
    const fm = rest.match(filterRe);
    if (!fm) {
      // Anything left that isn't a known filter is outside the subset.
      throw new EvalError(`Unsupported log pipeline fragment "${rest}" in ${ctx}.`);
    }
    filters.push({ op: fm[1] as LineFilter['op'], value: unescape(fm[2]) });
    rest = rest.slice(fm[0].length).trim();
  }
  return { matchers, filters };
}

/** Split a string on a delimiter, ignoring delimiters inside double quotes. */
function splitTopLevel(s: string, delim: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuote = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '"' && s[i - 1] !== '\\') inQuote = !inQuote;
    if (ch === delim && !inQuote) {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

/** Unescape the limited escapes valid inside a LogQL double-quoted string. */
function unescape(v: string): string {
  return v.replace(/\\(["\\nt])/g, (_, c) => {
    if (c === 'n') return '\n';
    if (c === 't') return '\t';
    return c;
  });
}

/** Does a log entry satisfy all label matchers? */
function matchesLabels(entry: LogEntry, matchers: LabelMatcher[]): boolean {
  for (const m of matchers) {
    const actual = entry.labels[m.label] ?? '';
    switch (m.op) {
      case '=':
        if (actual !== m.value) return false;
        break;
      case '!=':
        if (actual === m.value) return false;
        break;
      case '=~':
        if (!safeRegex(m.value).test(actual)) return false;
        break;
      case '!~':
        if (safeRegex(m.value).test(actual)) return false;
        break;
    }
  }
  return true;
}

/** Does a log line satisfy all line filters? */
function matchesFilters(line: string, filters: LineFilter[]): boolean {
  for (const f of filters) {
    switch (f.op) {
      case '|=':
        if (!line.includes(f.value)) return false;
        break;
      case '!=':
        if (line.includes(f.value)) return false;
        break;
      case '|~':
        if (!safeRegex(f.value).test(line)) return false;
        break;
      case '!~':
        if (safeRegex(f.value).test(line)) return false;
        break;
    }
  }
  return true;
}

const regexCache = new Map<string, RegExp>();
function safeRegex(pattern: string): RegExp {
  let re = regexCache.get(pattern);
  if (!re) {
    try {
      re = new RegExp(pattern);
    } catch {
      throw new EvalError(`Invalid regular expression: "${pattern}".`);
    }
    regexCache.set(pattern, re);
  }
  return re;
}

/* ────────────────────────────────────────────────────────────────────────── *
 *  Metric vector model.  After a metric query + aggregation we have a set of
 *  series, each keyed by its label set (post-aggregation) with a scalar value.
 * ────────────────────────────────────────────────────────────────────────── */

interface Series {
  labels: Record<string, string>;
  value: number;
}

/** Stable string key for a label set (sorted), used to group series. */
function labelKey(labels: Record<string, string>): string {
  return Object.keys(labels)
    .sort()
    .map((k) => `${k}=${JSON.stringify(labels[k])}`)
    .join(',');
}

/* ────────────────────────────────────────────────────────────────────────── *
 *  Expression evaluation.  We evaluate the rule's `expr` against the log store
 *  at a given evaluation time `evalT` (synthetic seconds from t=0).
 *
 *  Grammar (preview subset):
 *    expr        := aggOrMetric (cmpOp number)?
 *    cmpOp       := > | >= | < | <= | ==
 *    aggOrMetric := "sum" ("by" "(" labels ")")? "(" metric ")"  |  metric
 *    metric      := ("count_over_time"|"rate") "(" logSel "[" range "]" ")"
 * ────────────────────────────────────────────────────────────────────────── */

interface EvalOutput {
  /** The resulting series vector (after comparison filtering, if any). */
  series: Series[];
  /** True when the expression contained a comparison (alert-shaped). */
  hasComparison: boolean;
}

const CMP_RE = /(>=|<=|==|>|<)\s*(-?\d+(?:\.\d+)?)\s*$/;

/** Evaluate `expr` at synthetic time `evalT`, returning a series vector. */
function evalExpr(expr: string, store: LogEntry[], evalT: number, ctx: string): EvalOutput {
  let work = expr.trim();
  let hasComparison = false;
  let cmpOp: string | null = null;
  let threshold = 0;

  const cmp = work.match(CMP_RE);
  if (cmp) {
    hasComparison = true;
    cmpOp = cmp[1];
    threshold = Number(cmp[2]);
    work = work.slice(0, cmp.index).trim();
  }

  const series = evalAggOrMetric(work, store, evalT, ctx);

  if (!hasComparison) {
    return { series, hasComparison };
  }

  // A comparison keeps only the series that satisfy it (Prometheus filter semantics).
  const kept = series.filter((s) => compare(s.value, cmpOp as string, threshold));
  return { series: kept, hasComparison };
}

function compare(value: number, op: string, threshold: number): boolean {
  switch (op) {
    case '>':
      return value > threshold;
    case '>=':
      return value >= threshold;
    case '<':
      return value < threshold;
    case '<=':
      return value <= threshold;
    case '==':
      return value === threshold;
    default:
      return false;
  }
}

/** Evaluate either a `sum(...)` aggregation or a bare metric query. */
function evalAggOrMetric(
  expr: string,
  store: LogEntry[],
  evalT: number,
  ctx: string,
): Series[] {
  const trimmed = expr.trim();
  const sumMatch = trimmed.match(/^sum\s*(?:by\s*\(([^)]*)\)\s*)?\(([\s\S]*)\)\s*$/i);
  if (sumMatch) {
    const byLabels = (sumMatch[1] ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    const inner = evalMetric(sumMatch[2], store, evalT, ctx);
    return aggregateSum(inner, byLabels);
  }
  return evalMetric(trimmed, store, evalT, ctx);
}

/** sum() / sum by (labels)() over a series vector. */
function aggregateSum(series: Series[], byLabels: string[]): Series[] {
  const groups = new Map<string, Series>();
  for (const s of series) {
    const groupLabels: Record<string, string> = {};
    for (const l of byLabels) {
      if (s.labels[l] !== undefined) groupLabels[l] = s.labels[l];
    }
    const key = labelKey(groupLabels);
    const existing = groups.get(key);
    if (existing) {
      existing.value += s.value;
    } else {
      groups.set(key, { labels: groupLabels, value: s.value });
    }
  }
  return [...groups.values()];
}

/**
 * Evaluate a metric query: count_over_time(<logsel>[range]) or rate(...).
 * Produces one series per distinct stream label set, valued by the number of
 * matching log lines in the window (evalT - range, evalT]  (count_over_time)
 * or that count divided by the range in seconds (rate).
 */
function evalMetric(expr: string, store: LogEntry[], evalT: number, ctx: string): Series[] {
  const m = expr.trim().match(/^(count_over_time|rate)\s*\(([\s\S]*)\)\s*$/i);
  if (!m) {
    throw new EvalError(
      `Unsupported metric expression in ${ctx}. Use count_over_time(<selector>[range]) or rate(...).`,
    );
  }
  const fn = m[1].toLowerCase();
  const body = m[2].trim();

  // Pull the trailing range: "...} [5m]"
  const rangeMatch = body.match(/\[\s*([0-9]+[smhdw](?:[0-9]+[smhdw])*)\s*\]\s*$/i);
  if (!rangeMatch) {
    throw new EvalError(`Missing range "[...]" in ${ctx}, e.g. count_over_time({app="x"}[5m]).`);
  }
  const rangeSeconds = parseDuration(rangeMatch[1], ctx);
  const selectorText = body.slice(0, rangeMatch.index).trim();
  const selector = parseLogSelector(selectorText, ctx);

  const windowStart = evalT - rangeSeconds;

  // Group matching log lines by their stream label set, counting per group.
  const counts = new Map<string, Series>();
  for (const entry of store) {
    if (entry.t <= windowStart || entry.t > evalT) continue;
    if (!matchesLabels(entry, selector.matchers)) continue;
    if (!matchesFilters(entry.line, selector.filters)) continue;
    const key = labelKey(entry.labels);
    const existing = counts.get(key);
    if (existing) {
      existing.value += 1;
    } else {
      counts.set(key, { labels: { ...entry.labels }, value: 1 });
    }
  }

  let series = [...counts.values()];
  if (fn === 'rate') {
    const denom = rangeSeconds > 0 ? rangeSeconds : 1;
    series = series.map((s) => ({ labels: s.labels, value: s.value / denom }));
  }
  return series;
}

/* ────────────────────────────────────────────────────────────────────────── *
 *  `for:` duration handling.  An alert only fires at evalT if the comparison
 *  held continuously across the [evalT - for, evalT] window. We approximate
 *  Prometheus's behaviour by sampling the expression at the test `interval`
 *  cadence across that window and requiring every sample to be firing.
 * ────────────────────────────────────────────────────────────────────────── */

interface FiringAlert {
  labels: Record<string, string>;
}

/**
 * Determine which alerts fire for a rule at synthetic time `evalT`.
 * Honors the rule's `for:` window using the supplied sampling interval.
 */
function evaluateAlertRule(
  rule: LokiRule,
  store: LogEntry[],
  evalT: number,
  intervalSeconds: number,
  ctx: string,
): FiringAlert[] {
  const forSeconds = parseDuration(rule.for, `${ctx} (for:)`);

  // Sample times across the for-window, oldest → newest, inclusive of evalT.
  const sampleTimes: number[] = [];
  const step = intervalSeconds > 0 ? intervalSeconds : 60;
  for (let t = evalT - forSeconds; t < evalT; t += step) {
    if (t >= 0) sampleTimes.push(t);
  }
  sampleTimes.push(evalT);

  // The firing series must be present (and pass the comparison) at every sample.
  let intersection: Map<string, Series> | null = null;
  for (const t of sampleTimes) {
    const out = evalExpr(rule.expr, store, t, ctx);
    if (!out.hasComparison) {
      throw new EvalError(
        `Alerting rule "${rule.alert ?? '(unnamed)'}" expr must contain a comparison (>, >=, <, <=, ==) to fire.`,
      );
    }
    const present = new Map<string, Series>();
    for (const s of out.series) present.set(labelKey(s.labels), s);

    if (intersection === null) {
      intersection = present;
    } else {
      for (const key of [...intersection.keys()]) {
        if (!present.has(key)) intersection.delete(key);
      }
    }
    // Early-out: nothing held across the window.
    if (intersection.size === 0) break;
  }

  const firing: FiringAlert[] = [];
  if (intersection) {
    for (const s of intersection.values()) {
      // Alert label set = rule.labels merged over the series' own labels.
      const labels: Record<string, string> = {
        ...s.labels,
        ...(rule.labels ?? {}),
      };
      firing.push({ labels });
    }
  }
  return firing;
}

/* ────────────────────────────────────────────────────────────────────────── *
 *  Annotation templating.  We support the `{{ $value }}` and `{{ $labels.x }}`
 *  forms that appear in typical Loki annotations, plus literal text.
 * ────────────────────────────────────────────────────────────────────────── */

function renderTemplate(tpl: string, labels: Record<string, string>, value?: number): string {
  return tpl.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_, raw) => {
    const token = String(raw).trim();
    if (token === '$value' || token === '.Value') {
      return value !== undefined ? String(value) : '';
    }
    const lbl = token.match(/^(?:\$labels|\.Labels)\.([a-zA-Z_][a-zA-Z0-9_]*)$/);
    if (lbl) return labels[lbl[1]] ?? '';
    return ''; // unknown template token → empty (preview tolerance)
  });
}

/* ────────────────────────────────────────────────────────────────────────── *
 *  Diff helpers for alert assertions.
 * ────────────────────────────────────────────────────────────────────────── */

function labelsEqual(a: Record<string, string>, b: Record<string, string>): boolean {
  const ak = Object.keys(a);
  const bk = Object.keys(b);
  if (ak.length !== bk.length) return false;
  for (const k of ak) {
    if (a[k] !== b[k]) return false;
  }
  return true;
}

/* ────────────────────────────────────────────────────────────────────────── *
 *  Recording-rule sample parsing.
 * ────────────────────────────────────────────────────────────────────────── */

/** Parse exp_samples `labels`, which may be a string `metric{a="b"}` or an object. */
function parseSampleLabels(labels: ExpSample['labels']): Record<string, string> {
  if (!labels) return {};
  if (typeof labels === 'object') return labels;
  const open = labels.indexOf('{');
  if (open === -1) return {}; // just a metric name, no labels
  const close = labels.lastIndexOf('}');
  const inside = labels.slice(open + 1, close);
  const out: Record<string, string> = {};
  for (const part of splitTopLevel(inside, ',')) {
    const p = part.trim();
    if (!p) continue;
    const m = p.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*"((?:[^"\\]|\\.)*)"$/);
    if (m) out[m[1]] = unescape(m[2]);
  }
  return out;
}

const FLOAT_TOLERANCE = 1e-6;

/* ────────────────────────────────────────────────────────────────────────── *
 *  Public API.
 * ────────────────────────────────────────────────────────────────────────── */

/**
 * Run the promtool-style test file against the Loki ruler file. Never throws on
 * user input: parse/eval failures are returned as { ok: false, error }.
 */
export function runTests(rulesYaml: string, testYaml: string): RunResult {
  const started = nowMs();
  const empty = { total: 0, passed: 0, failed: 0, durationMs: 0 };

  let ruler: LokiRulerFile;
  let test: TestFile;

  try {
    ruler = (yaml.load(rulesYaml) ?? {}) as LokiRulerFile;
  } catch (e) {
    return fail(`Could not parse rules YAML: ${describeYamlError(e)}`, empty);
  }
  try {
    test = (yaml.load(testYaml) ?? {}) as TestFile;
  } catch (e) {
    return fail(`Could not parse test YAML: ${describeYamlError(e)}`, empty);
  }

  try {
    // Index every rule by alertname and by record name for quick lookup.
    const alertRules = new Map<string, LokiRule>();
    const recordRules = new Map<string, LokiRule>();
    const groups = ruler.groups ?? [];
    if (!Array.isArray(groups)) {
      throw new EvalError('Rules file must have a top-level `groups:` list.');
    }
    for (const group of groups) {
      for (const rule of group.rules ?? []) {
        if (!rule || typeof rule.expr !== 'string') {
          throw new EvalError(`Rule in group "${group.name ?? '?'}" is missing a string \`expr\`.`);
        }
        if (rule.alert) alertRules.set(rule.alert, rule);
        else if (rule.record) recordRules.set(rule.record, rule);
        else throw new EvalError('Each rule needs either an `alert:` or a `record:` field.');
      }
    }

    const results: TestResult[] = [];
    const defaultInterval = parseDuration(test.evaluation_interval ?? '1m', 'evaluation_interval');
    const cases = test.tests ?? [];
    if (!Array.isArray(cases) || cases.length === 0) {
      throw new EvalError('Test file must define at least one entry under `tests:`.');
    }

    for (let ci = 0; ci < cases.length; ci++) {
      const tc = cases[ci];
      const intervalSeconds = tc.interval
        ? parseDuration(tc.interval, `tests[${ci}].interval`)
        : defaultInterval;
      const store = buildLogStore(tc.input_streams ?? []);

      // ── Alerting-rule assertions ───────────────────────────────────────
      for (let ai = 0; ai < (tc.alert_rule_test ?? []).length; ai++) {
        const art = (tc.alert_rule_test as AlertRuleTest[])[ai];
        const ctx = `tests[${ci}].alert_rule_test[${ai}]`;
        const evalLabel = String(art.eval_time ?? '0m');
        const evalT = parseDuration(art.eval_time, `${ctx}.eval_time`);
        const alertname = art.alertname ?? '';
        const rule = alertRules.get(alertname);

        if (!rule) {
          results.push({
            name: alertname || '(missing alertname)',
            evalTime: evalLabel,
            status: 'fail',
            kind: 'alert',
            message: `No alerting rule named “${alertname}” was found in the rules file.`,
          });
          continue;
        }

        const firing = evaluateAlertRule(rule, store, evalT, intervalSeconds, ctx);
        const expected = art.exp_alerts ?? [];

        // Build a comparable “actual” alert list (with rendered annotations).
        const actualAlerts = firing.map((f) => {
          const value = computeRuleValue(rule, store, evalT, ctx);
          const annotations: Record<string, string> = {};
          for (const [k, v] of Object.entries(rule.annotations ?? {})) {
            annotations[k] = renderTemplate(v, f.labels, value);
          }
          return { labels: f.labels, annotations };
        });

        const verdict = compareAlerts(alertname, expected, actualAlerts);
        results.push({ ...verdict, evalTime: evalLabel, kind: 'alert' });
      }

      // ── Recording-rule assertions ──────────────────────────────────────
      for (let ri = 0; ri < (tc.recording_rule_test ?? []).length; ri++) {
        const rrt = (tc.recording_rule_test as RecordingRuleTest[])[ri];
        const ctx = `tests[${ci}].recording_rule_test[${ri}]`;
        const evalLabel = String(rrt.eval_time ?? '0m');
        const evalT = parseDuration(rrt.eval_time, `${ctx}.eval_time`);
        const recordName = rrt.record ?? '';
        const rule = recordRules.get(recordName);

        if (!rule) {
          results.push({
            name: recordName || '(missing record)',
            evalTime: evalLabel,
            status: 'fail',
            kind: 'recording',
            message: `No recording rule named “${recordName}” was found in the rules file.`,
          });
          continue;
        }

        const out = evalExpr(rule.expr, store, evalT, ctx);
        const verdict = compareSamples(recordName, rrt.exp_samples ?? [], out.series);
        results.push({ ...verdict, evalTime: evalLabel, kind: 'recording' });
      }
    }

    const passed = results.filter((r) => r.status === 'pass').length;
    const failed = results.length - passed;
    return {
      ok: true,
      summary: {
        total: results.length,
        passed,
        failed,
        durationMs: Math.max(0, Math.round(nowMs() - started)),
      },
      results,
    };
  } catch (e) {
    const msg = e instanceof EvalError ? e.message : `Unexpected evaluation error: ${String(e)}`;
    return fail(msg, { ...empty, durationMs: Math.max(0, Math.round(nowMs() - started)) });
  }
}

/** Compute a representative scalar `$value` for annotation templating. */
function computeRuleValue(
  rule: LokiRule,
  store: LogEntry[],
  evalT: number,
  ctx: string,
): number {
  // Strip the comparison so we report the underlying measured value.
  const noCmp = rule.expr.replace(CMP_RE, '').trim();
  const series = evalAggOrMetric(noCmp, store, evalT, ctx);
  if (series.length === 0) return 0;
  // Report the max series value (most relevant for “rate exceeded threshold”).
  return series.reduce((acc, s) => Math.max(acc, s.value), series[0].value);
}

/** Compare expected vs. actual alerts and produce a TestResult (sans evalTime/kind). */
function compareAlerts(
  alertname: string,
  expected: ExpAlert[],
  actual: { labels: Record<string, string>; annotations: Record<string, string> }[],
): Omit<TestResult, 'evalTime' | 'kind'> {
  // First-class negative test: empty exp_alerts asserts NO alert fires.
  if (expected.length === 0) {
    if (actual.length === 0) {
      return {
        name: alertname,
        status: 'pass',
        message: `No alert fired, as expected (negative test).`,
      };
    }
    return {
      name: alertname,
      status: 'fail',
      message: `Expected no alert to fire, but ${actual.length} did.`,
      diff: { expected: [], actual: actual.map((a) => a.labels) },
    };
  }

  if (actual.length !== expected.length) {
    return {
      name: alertname,
      status: 'fail',
      message: `Expected ${expected.length} alert(s), but ${actual.length} fired.`,
      diff: {
        expected: expected.map((e) => e.exp_labels ?? {}),
        actual: actual.map((a) => a.labels),
      },
    };
  }

  // Greedily match each expected alert to an unused actual alert.
  const used = new Set<number>();
  for (const exp of expected) {
    const expLabels = exp.exp_labels ?? {};
    const expAnnos = exp.exp_annotations ?? {};
    let matchedIdx = -1;
    for (let i = 0; i < actual.length; i++) {
      if (used.has(i)) continue;
      if (!labelsEqual(actual[i].labels, expLabels)) continue;
      if (!annotationsMatch(actual[i].annotations, expAnnos)) continue;
      matchedIdx = i;
      break;
    }
    if (matchedIdx === -1) {
      return {
        name: alertname,
        status: 'fail',
        message: `An expected alert did not match any fired alert (labels/annotations differ).`,
        diff: {
          expected: { labels: expLabels, annotations: expAnnos },
          actual: actual.map((a) => ({ labels: a.labels, annotations: a.annotations })),
        },
      };
    }
    used.add(matchedIdx);
  }

  return {
    name: alertname,
    status: 'pass',
    message: `Fired ${actual.length} alert(s) with the expected labels and annotations.`,
  };
}

/** Every expected annotation must be present and equal; extra actuals are fine. */
function annotationsMatch(
  actual: Record<string, string>,
  expected: Record<string, string>,
): boolean {
  for (const [k, v] of Object.entries(expected)) {
    if (actual[k] !== v) return false;
  }
  return true;
}

/** Compare expected recording samples against the computed series vector. */
function compareSamples(
  recordName: string,
  expected: ExpSample[],
  series: Series[],
): Omit<TestResult, 'evalTime' | 'kind'> {
  if (series.length !== expected.length) {
    return {
      name: recordName,
      status: 'fail',
      message: `Expected ${expected.length} sample(s) for “${recordName}”, but computed ${series.length}.`,
      diff: {
        expected: expected.map((e) => ({ value: e.value, labels: parseSampleLabels(e.labels) })),
        actual: series.map((s) => ({ value: s.value, labels: s.labels })),
      },
    };
  }

  const used = new Set<number>();
  for (const exp of expected) {
    const expLabels = parseSampleLabels(exp.labels);
    const expValue = Number(exp.value ?? 0);
    let matched = -1;
    for (let i = 0; i < series.length; i++) {
      if (used.has(i)) continue;
      if (!labelsEqual(series[i].labels, expLabels)) continue;
      if (Math.abs(series[i].value - expValue) > FLOAT_TOLERANCE) continue;
      matched = i;
      break;
    }
    if (matched === -1) {
      return {
        name: recordName,
        status: 'fail',
        message: `No computed sample matched expected value ${expValue} with the given labels.`,
        diff: {
          expected: { value: expValue, labels: expLabels },
          actual: series.map((s) => ({ value: s.value, labels: s.labels })),
        },
      };
    }
    used.add(matched);
  }

  return {
    name: recordName,
    status: 'pass',
    message: `Computed ${series.length} sample(s) matching the expected value(s).`,
  };
}

/* ────────────────────────────────────────────────────────────────────────── *
 *  Small utilities.
 * ────────────────────────────────────────────────────────────────────────── */

function fail(error: string, summary: RunResult['summary']): RunResult {
  return { ok: false, error, summary, results: [] };
}

/** Best-effort line-referenced description of a js-yaml parse error. */
function describeYamlError(e: unknown): string {
  if (e && typeof e === 'object') {
    const err = e as { reason?: string; mark?: { line?: number; column?: number }; message?: string };
    if (err.reason && err.mark && typeof err.mark.line === 'number') {
      return `${err.reason} (line ${err.mark.line + 1}, column ${(err.mark.column ?? 0) + 1}).`;
    }
    if (err.message) return err.message;
  }
  return String(e);
}

/** Monotonic-ish millisecond clock for UI timing only (never used as the eval clock). */
function nowMs(): number {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
}

/* ────────────────────────────────────────────────────────────────────────── *
 *  Shareable-URL state (base64url in the location hash).
 * ────────────────────────────────────────────────────────────────────────── */

/** URL-safe base64 of a UTF-8 string. */
function base64UrlEncode(input: string): string {
  // encodeURIComponent → percent-escape unicode → raw bytes safe for btoa.
  const bytes = encodeURIComponent(input).replace(/%([0-9A-F]{2})/g, (_, h) =>
    String.fromCharCode(parseInt(h, 16)),
  );
  return btoa(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Inverse of base64UrlEncode. */
function base64UrlDecode(input: string): string {
  let b64 = input.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4 !== 0) b64 += '=';
  const bytes = atob(b64);
  let percent = '';
  for (let i = 0; i < bytes.length; i++) {
    percent += '%' + bytes.charCodeAt(i).toString(16).padStart(2, '0');
  }
  return decodeURIComponent(percent);
}

/**
 * Encode the editor state into a URL hash fragment, e.g.
 *   "#s=eyJydWxlcyI6Ii4uLiJ9".
 */
export function encodeState(rules: string, test: string): string {
  const payload: ShareState = { rules, test };
  return '#s=' + base64UrlEncode(JSON.stringify(payload));
}

/**
 * Decode the current `location.hash` into a ShareState, or null when absent /
 * malformed. SSR-safe: returns null when `window` is undefined.
 */
export function decodeState(): ShareState | null {
  if (typeof window === 'undefined') return null;
  const hash = window.location.hash ?? '';
  const m = hash.match(/[#&]s=([^&]+)/);
  if (!m) return null;
  try {
    const json = base64UrlDecode(m[1]);
    const parsed = JSON.parse(json) as Partial<ShareState>;
    if (typeof parsed.rules === 'string' && typeof parsed.test === 'string') {
      return { rules: parsed.rules, test: parsed.test };
    }
    return null;
  } catch {
    return null;
  }
}

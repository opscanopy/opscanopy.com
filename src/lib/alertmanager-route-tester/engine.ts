/**
 * Alertmanager Route Tester — a CLIENT-SIDE, dependency-light engine that walks
 * an Alertmanager `route` tree against a sample alert's labels and reports which
 * receiver(s) the alert would reach.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │  WHAT THIS IS                                                              │
 * │                                                                            │
 * │  Alertmanager dispatches every alert by walking a routing TREE. Getting    │
 * │  that walk wrong is the difference between paging the on-call and silently │
 * │  dropping a SEV-1. This engine reproduces the routing semantics exactly:   │
 * │                                                                            │
 * │    • The ROOT route is entered for every alert (it is the catch-all).      │
 * │    • A node's own matchers (`match`, `match_re`, `matchers`) must ALL be   │
 * │      satisfied for the node to match.                                      │
 * │    • Within a matched node, child routes are evaluated IN ORDER. The alert │
 * │      descends into the FIRST matching child. If that child has            │
 * │      `continue: true`, LATER sibling routes are ALSO evaluated.            │
 * │    • A node with no matching child is itself the terminal match — its      │
 * │      receiver fires.                                                        │
 * │    • `receiver` and the grouping/timer fields (`group_by`, `group_wait`,   │
 * │      `group_interval`, `repeat_interval`) are INHERITED from the nearest   │
 * │      ancestor that set them.                                               │
 * │                                                                            │
 * │  Matcher semantics follow Alertmanager / Prometheus:                       │
 * │    • `match`      → exact string equality.                                 │
 * │    • `match_re`   → RE2 regex, FULLY ANCHORED (implicit ^…$).              │
 * │    • `matchers:`  → strings like  foo="bar" , foo=~"re" , foo!="x" ,       │
 * │                      foo!~"re"  (also unquoted values).                    │
 * │    • A label that is absent on the alert is treated as the empty string,   │
 * │      so  foo="" / foo=~""  match a missing label and  foo!=""  excludes it.│
 * │                                                                            │
 * │  It NEVER throws: a YAML parse failure or a structurally invalid route     │
 * │  returns { ok:false, error, warnings:[] } with no matches.                 │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Reference: https://prometheus.io/docs/alerting/latest/configuration/#route
 */

// js-yaml v4 ships ESM but no bundled type declarations, and @types/js-yaml is
// not a project dependency. Declare the tiny surface we use so the project
// type-checks under strict mode without adding a dependency. (Mirrors the
// gha-validator engine so YAML handling is consistent across tools.)
declare module 'js-yaml' {
  export function load(input: string, options?: unknown): unknown;
  const _default: { load: typeof load };
  export default _default;
}

import yaml from 'js-yaml';
import { checkRegexSafety, MAX_REGEX_TEXT } from '../regex-safety';
import type {
  Grouping,
  Matcher,
  MatcherOp,
  MatchRouteResult,
  RouteMatch,
} from './types';

/* ────────────────────────────────────────────────────────────────────────── *
 *  Parsed-document shapes (loose — user input is validated as we read it).
 * ────────────────────────────────────────────────────────────────────────── */

/** A route node as it appears in the YAML (every field optional / untrusted). */
interface RawRoute {
  receiver?: unknown;
  match?: unknown;
  match_re?: unknown;
  matchers?: unknown;
  group_by?: unknown;
  group_wait?: unknown;
  group_interval?: unknown;
  repeat_interval?: unknown;
  continue?: unknown;
  routes?: unknown;
}

/* ────────────────────────────────────────────────────────────────────────── *
 *  Small helpers.
 * ────────────────────────────────────────────────────────────────────────── */

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Coerce a YAML scalar to a string for label/value comparisons. */
function scalarToString(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number') return String(v);
  return String(v);
}

/**
 * Best-effort line-referenced description of a js-yaml parse error. Mirrors the
 * gha-validator engine so error messaging is consistent across tools.
 */
function describeYamlError(e: unknown): string {
  if (e && typeof e === 'object') {
    const err = e as {
      reason?: string;
      mark?: { line?: number; column?: number };
      message?: string;
    };
    if (err.reason && err.mark && typeof err.mark.line === 'number') {
      return `${err.reason} (line ${err.mark.line + 1}, column ${(err.mark.column ?? 0) + 1}).`;
    }
    if (err.message) return err.message;
  }
  return String(e);
}

/* ────────────────────────────────────────────────────────────────────────── *
 *  Anchored RE2-ish matching.
 * ────────────────────────────────────────────────────────────────────────── */

/**
 * Compile an Alertmanager regex (`match_re` value or `=~`/`!~` source) to a
 * JavaScript RegExp that is FULLY ANCHORED — Alertmanager wraps every regex as
 * `^(?:<re>)$`, so a partial match never satisfies it. Returns null if the
 * pattern is not valid JS regex syntax (the closest we can get to RE2 client
 * side without an RE2 engine). Never throws.
 *
 * Alertmanager itself uses RE2, which has no catastrophic backtracking — but we
 * compile to a backtracking JS RegExp on the MAIN THREAD. A pattern such as
 * `(a+)+$` would let user input hang the tab (ReDoS). We therefore run every
 * pattern through the project's `checkRegexSafety()` heuristic first and treat
 * an unsafe pattern exactly like an uncompilable one (return null → never
 * matches), consistent with the existing "bad regex never matches" behaviour.
 */
function compileAnchored(pattern: string): RegExp | null {
  if (!checkRegexSafety(pattern).safe) return null;
  try {
    return new RegExp(`^(?:${pattern})$`);
  } catch {
    return null;
  }
}

/* ────────────────────────────────────────────────────────────────────────── *
 *  Matcher parsing.
 * ────────────────────────────────────────────────────────────────────────── */

/**
 * Split a brace-wrapped body on TOP-LEVEL commas — commas that are not inside a
 * quoted string. Returns the list of comma-separated matcher fragments. A body
 * with no top-level comma yields a single-element array (the body itself).
 */
function splitTopLevelCommas(body: string): string[] {
  const parts: string[] = [];
  let buf = '';
  let inQuote = false;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (ch === '\\' && inQuote) {
      // Keep the escape + next char together inside a quoted value.
      buf += ch + (body[i + 1] ?? '');
      i++;
      continue;
    }
    if (ch === '"') {
      inQuote = !inQuote;
      buf += ch;
      continue;
    }
    if (ch === ',' && !inQuote) {
      parts.push(buf);
      buf = '';
      continue;
    }
    buf += ch;
  }
  parts.push(buf);
  return parts;
}

/**
 * Parse a single `matchers:` entry such as  foo="bar" ,  foo=~"re" ,
 * foo!="x" ,  foo!~"re"  — quoted or unquoted value. The operators are tried
 * longest-first (`=~`/`!~`/`!=` before `=`) so the two-char ops win. Returns
 * null for an unparseable string (surfaced as a warning by the caller).
 */
function parseMatcherString(raw: string): Matcher | null {
  const s = raw.trim();
  // Optional surrounding braces, e.g. {foo="bar"} — Alertmanager accepts both.
  const inner = s.replace(/^\{/, '').replace(/\}$/, '').trim();

  // Operator detection, longest token first so `!=`/`=~`/`!~` beat `=`.
  const ops: MatcherOp[] = ['=~', '!~', '!=', '='];
  for (const op of ops) {
    const idx = inner.indexOf(op);
    if (idx <= 0) continue;
    // `=~` and `!~` both contain `~`; ensure we picked the operator that starts
    // at this position and not a `=` that is really part of `=~`.
    const name = inner.slice(0, idx).trim();
    const rest = inner.slice(idx + op.length).trim();
    if (!isValidLabelName(name)) continue;
    // For `=`, make sure the next char is not `~` (that would be `=~`).
    if (op === '=' && rest.startsWith('~')) continue;
    const value = unquote(rest);
    if (value === null) continue;
    return { name, op, value, source: 'matchers' };
  }
  return null;
}

/** A label name is a Prometheus identifier: [a-zA-Z_][a-zA-Z0-9_]*. */
function isValidLabelName(name: string): boolean {
  return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name);
}

/**
 * Strip surrounding double quotes from a matcher value and unescape `\"` / `\\`.
 * An unquoted value is returned as-is (Alertmanager allows bare values). Returns
 * null only if a quote is opened but never closed.
 */
function unquote(raw: string): string | null {
  const s = raw.trim();
  if (s.length === 0) return '';
  if (s.startsWith('"')) {
    if (s.length < 2 || !s.endsWith('"')) return null;
    const body = s.slice(1, -1);
    return body.replace(/\\(["\\])/g, '$1');
  }
  return s;
}

/**
 * Collect every matcher on a route node from all three sources, in declaration
 * priority (match → match_re → matchers). Unparseable `matchers:` strings are
 * recorded in `warnings` and skipped (Alertmanager would reject the config, but
 * we degrade gracefully so the rest of the walk still runs).
 */
function collectMatchers(route: RawRoute, warnings: string[]): Matcher[] {
  const out: Matcher[] = [];

  if (isRecord(route.match)) {
    for (const [name, val] of Object.entries(route.match)) {
      out.push({ name, op: '=', value: matchScalar(name, val, warnings), source: 'match' });
    }
  }

  if (isRecord(route.match_re)) {
    for (const [name, val] of Object.entries(route.match_re)) {
      out.push({
        name,
        op: '=~',
        value: matchScalar(name, val, warnings),
        source: 'match_re',
      });
    }
  }

  if (Array.isArray(route.matchers)) {
    for (const m of route.matchers) {
      if (typeof m !== 'string') {
        warnings.push(`Ignored a non-string matcher entry: ${scalarToString(m)}.`);
        continue;
      }
      collectFromMatcherEntry(m, out, warnings);
    }
  } else if (typeof route.matchers === 'string') {
    // A single matcher written as a scalar instead of a one-element list.
    collectFromMatcherEntry(route.matchers, out, warnings);
  }

  return out;
}

/**
 * Coerce a `match`/`match_re` value to a string. A non-scalar value (e.g. a
 * list or mapping, which is invalid Alertmanager config) would otherwise be
 * silently stringified into something like `a,b` that never matches — so we
 * surface a warning before degrading gracefully.
 */
function matchScalar(name: string, val: unknown, warnings: string[]): string {
  if (
    val !== null &&
    val !== undefined &&
    typeof val !== 'string' &&
    typeof val !== 'number' &&
    typeof val !== 'boolean'
  ) {
    warnings.push(
      `match value for \`${name}\` is not a scalar; this is invalid Alertmanager config and will not match as written.`,
    );
  }
  return scalarToString(val);
}

/**
 * Parse one `matchers:` list entry into the `out` array. Handles the
 * brace-wrapped, comma-separated form `{a="1",b="2"}` by splitting on
 * top-level commas and parsing each fragment — the single-matcher parser alone
 * would silently corrupt the value (capturing `1",b="2` as a's value and
 * dropping b). Unparseable fragments are reported and skipped.
 */
function collectFromMatcherEntry(entry: string, out: Matcher[], warnings: string[]): void {
  const trimmed = entry.trim();
  const braceWrapped = trimmed.startsWith('{') && trimmed.endsWith('}');
  if (braceWrapped) {
    const body = trimmed.slice(1, -1);
    const fragments = splitTopLevelCommas(body);
    if (fragments.length > 1) {
      for (const frag of fragments) {
        const f = frag.trim();
        if (f === '') continue;
        const parsed = parseMatcherString(f);
        if (parsed) out.push(parsed);
        else warnings.push(`Could not parse matcher "${f}"; it was skipped.`);
      }
      return;
    }
  }
  const parsed = parseMatcherString(entry);
  if (parsed) out.push(parsed);
  else warnings.push(`Could not parse matcher "${entry}"; it was skipped.`);
}

/* ────────────────────────────────────────────────────────────────────────── *
 *  Matcher evaluation.
 * ────────────────────────────────────────────────────────────────────────── */

/**
 * Does a single matcher hold against the alert labels? A label that is absent
 * is treated as the empty string (Alertmanager semantics), so `foo=""` matches
 * a missing label and `foo!=""` requires the label to be present and non-empty.
 * An invalid regex can never match (returns false).
 */
function matcherHolds(m: Matcher, labels: Map<string, string>): boolean {
  const actual = labels.get(m.name) ?? '';
  switch (m.op) {
    case '=':
      return actual === m.value;
    case '!=':
      return actual !== m.value;
    case '=~': {
      const re = compileAnchored(m.value);
      // Cap the subject text so even a safe-looking pattern cannot be fed a huge
      // label value and hang the tab (defence-in-depth alongside the safety
      // heuristic in compileAnchored). An over-long value cannot match.
      if (actual.length > MAX_REGEX_TEXT) return false;
      return re ? re.test(actual) : false;
    }
    case '!~': {
      const re = compileAnchored(m.value);
      // An uncompilable negative regex cannot be proven false, so it does NOT
      // match (consistent with `=~` returning false on a bad pattern).
      if (actual.length > MAX_REGEX_TEXT) return false;
      return re ? !re.test(actual) : false;
    }
    default:
      return false;
  }
}

/** All matchers on a node must hold for the node to match (logical AND). */
function nodeMatches(matchers: Matcher[], labels: Map<string, string>): boolean {
  return matchers.every((m) => matcherHolds(m, labels));
}

/* ────────────────────────────────────────────────────────────────────────── *
 *  Grouping inheritance.
 * ────────────────────────────────────────────────────────────────────────── */

/** Read `group_by` as a string array (drops non-string entries defensively). */
function readGroupBy(v: unknown): string[] | undefined {
  if (Array.isArray(v)) {
    const arr = v.filter((x): x is string => typeof x === 'string');
    return arr;
  }
  return undefined;
}

/**
 * Merge a child's own grouping/timer fields over the inherited ones. Any field
 * the child does not set is carried down from the parent unchanged.
 */
function inheritGrouping(parent: Grouping, route: RawRoute): Grouping {
  const own = readGroupBy(route.group_by);
  return {
    group_by: own !== undefined ? own : parent.group_by,
    group_wait:
      typeof route.group_wait === 'string' ? route.group_wait : parent.group_wait,
    group_interval:
      typeof route.group_interval === 'string'
        ? route.group_interval
        : parent.group_interval,
    repeat_interval:
      typeof route.repeat_interval === 'string'
        ? route.repeat_interval
        : parent.repeat_interval,
  };
}

/* ────────────────────────────────────────────────────────────────────────── *
 *  Label-input parsing.
 * ────────────────────────────────────────────────────────────────────────── */

/**
 * Parse the alert-labels textarea. Each non-empty, non-comment line is
 * `key=value` or `key="value"`. Whitespace around the key and the `=` is
 * tolerated; the value may be quoted (then unescaped) or bare. Lines that do
 * not contain `=` are reported as warnings and skipped. Never throws.
 */
function parseLabels(
  input: string,
  warnings: string[],
): Map<string, string> {
  const labels = new Map<string, string>();
  const lines = input.split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line === '' || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) {
      warnings.push(`Ignored label line without "key=value": "${rawLine.trim()}".`);
      continue;
    }
    const key = line.slice(0, eq).trim();
    if (!isValidLabelName(key)) {
      warnings.push(`Ignored label with invalid name: "${key}".`);
      continue;
    }
    const value = unquote(line.slice(eq + 1)) ?? line.slice(eq + 1).trim();
    labels.set(key, value);
  }
  return labels;
}

/* ────────────────────────────────────────────────────────────────────────── *
 *  Route resolution from the config document.
 * ────────────────────────────────────────────────────────────────────────── */

/**
 * Resolve the root route from a parsed YAML document. The input may be a full
 * Alertmanager config (use its `.route`) or a bare route object. Returns null
 * with a reason when no route can be found.
 */
function resolveRoot(doc: unknown): { route: RawRoute } | { error: string } {
  if (!isRecord(doc)) {
    return {
      error:
        'The config is not a YAML mapping. Provide an Alertmanager `route:` block or a full config containing one.',
    };
  }
  // Full config: top-level `route:` key.
  if (isRecord(doc.route)) {
    return { route: doc.route as RawRoute };
  }
  if ('route' in doc && doc.route !== undefined) {
    return { error: 'The top-level `route:` is present but is not a mapping.' };
  }
  // Bare route object: it should look like a route (have routes/receiver/match…).
  const looksLikeRoute =
    'receiver' in doc ||
    'routes' in doc ||
    'match' in doc ||
    'match_re' in doc ||
    'matchers' in doc ||
    'group_by' in doc;
  if (looksLikeRoute) {
    return { route: doc as RawRoute };
  }
  return {
    error:
      'No `route:` block found. Paste a full Alertmanager config or a bare route object (with `receiver`, `routes`, `match`/`matchers`, …).',
  };
}

/* ────────────────────────────────────────────────────────────────────────── *
 *  The tree walk — the heart of the engine.
 * ────────────────────────────────────────────────────────────────────────── */

/**
 * Walk a matched route node. Resolves the receiver + grouping inherited at this
 * node, then evaluates child routes IN ORDER:
 *
 *   • The alert descends into the FIRST matching child (recursing).
 *   • If that child set `continue: true`, evaluation CONTINUES to later siblings
 *     (each of which may itself match and descend, again honouring `continue`).
 *   • If NO child matched (or the matched chain finished without a `continue`
 *     leaving siblings), THIS node is the terminal match and its receiver fires.
 *
 * `viaContinue` marks matches produced only because an ancestor opted into
 * `continue` — i.e. the second and subsequent matches on a sibling list.
 */
function walk(
  node: RawRoute,
  labels: Map<string, string>,
  parentReceiver: string,
  parentGrouping: Grouping,
  path: string[],
  warnings: string[],
  viaContinue: boolean,
  out: RouteMatch[],
): void {
  // Resolve receiver + grouping inherited at this node.
  const receiver =
    typeof node.receiver === 'string' && node.receiver.trim() !== ''
      ? node.receiver
      : parentReceiver;
  const grouping = inheritGrouping(parentGrouping, node);

  // Compute THIS node's own matchers exactly once. The same array is reused for
  // the terminal RouteMatch below; computing it again would re-emit any parse
  // warnings (a malformed matcher would otherwise be reported twice — once when
  // the parent scanned this node as a child, once when it terminates here).
  const ownMatchers = nodeOwnMatchers(node, warnings);

  const children = Array.isArray(node.routes) ? node.routes : [];

  // Find matching children, honouring first-match-then-continue semantics.
  let matchedAny = false;
  let stopAfter = false;
  // Whether a PRIMARY (first) matching child has already been consumed. The
  // first matching sibling is the alert's primary path (viaContinue carried
  // unchanged); any later matching sibling is only reachable because an earlier
  // one set `continue: true`, so its subtree is flagged viaContinue.
  let primaryConsumed = false;
  for (let i = 0; i < children.length; i++) {
    if (stopAfter) break;
    const rawChild = children[i];
    if (!isRecord(rawChild)) {
      warnings.push(`Skipped child route #${i + 1}: it is not a mapping.`);
      continue;
    }
    const child = rawChild as RawRoute;
    const childMatchers = nodeOwnMatchers(child, warnings);
    if (!nodeMatches(childMatchers, labels)) continue;

    matchedAny = true;
    const childContinue = child.continue === true;
    const childLabel = childLabelOf(child, i, childMatchers);

    // The first matching child inherits this node's viaContinue unchanged;
    // every subsequent matching sibling is reached only via an earlier
    // `continue`, so OR in `true` for those descents.
    const childViaContinue = viaContinue || primaryConsumed;

    walk(
      child,
      labels,
      receiver,
      grouping,
      [...path, childLabel],
      warnings,
      childViaContinue,
      out,
    );
    primaryConsumed = true;

    // First matching child that does NOT continue stops the sibling scan; the
    // alert has found its branch. A child with `continue: true` lets the scan
    // proceed to later siblings.
    if (!childContinue) {
      stopAfter = true;
    }
  }

  // No matching child → this node is the terminal match. Reuse the matchers we
  // already computed (and whose warnings we already emitted) above.
  if (!matchedAny) {
    out.push({
      receiver,
      path,
      grouping,
      viaContinue,
      matchers: ownMatchers,
    });
  }
}

/**
 * Per-node matcher cache so a node's `Matcher[]` (and any parse warnings) are
 * computed exactly once even though a node is inspected both as a parent's
 * child and, if terminal, when it is recorded. Keyed by object identity.
 */
const nodeMatcherCache = new WeakMap<RawRoute, Matcher[]>();

/** Collect a node's own matchers once, caching the result (and its warnings). */
function nodeOwnMatchers(node: RawRoute, warnings: string[]): Matcher[] {
  const cached = nodeMatcherCache.get(node);
  if (cached) return cached;
  const computed = collectMatchers(node, warnings);
  nodeMatcherCache.set(node, computed);
  return computed;
}

/**
 * A readable label for a child route in the breadcrumb. Prefers its receiver,
 * else a compact rendering of its first matcher, else `route #N`.
 */
function childLabelOf(child: RawRoute, index: number, matchers: Matcher[]): string {
  if (typeof child.receiver === 'string' && child.receiver.trim() !== '') {
    return child.receiver;
  }
  if (matchers.length > 0) {
    const m = matchers[0];
    return `${m.name}${m.op}${m.value}`;
  }
  return `route #${index + 1}`;
}

/* ────────────────────────────────────────────────────────────────────────── *
 *  Public API.
 * ────────────────────────────────────────────────────────────────────────── */

/**
 * Match a sample alert against an Alertmanager route tree.
 *
 * @param configYaml      A full Alertmanager config (its `.route` is used) or a
 *                        bare route object, as YAML.
 * @param alertLabelsInput  Newline-separated `key=value` / `key="value"` lines.
 *
 * NEVER throws. A YAML parse failure or an unresolvable route returns
 * { ok:false, error, warnings:[] }; otherwise { ok:true, matches, warnings }.
 * The root route is always entered (it is the catch-all), so a structurally
 * valid tree always yields at least one match.
 */
export function matchRoute(
  configYaml: string,
  alertLabelsInput: string,
): MatchRouteResult {
  // 0. Defensive: contract is `string`, but never throw on null/non-string.
  if (typeof configYaml !== 'string' || configYaml.trim() === '') {
    return {
      ok: false,
      error: 'Paste an Alertmanager route tree (or a full config with a `route:` block).',
      warnings: [],
    };
  }

  // 1. Parse YAML. Any failure is a fatal, line-referenced error.
  let doc: unknown;
  try {
    doc = yaml.load(configYaml);
  } catch (e) {
    return {
      ok: false,
      error: `Could not parse YAML: ${describeYamlError(e)}`,
      warnings: [],
    };
  }

  // 2. Resolve the root route node.
  const resolved = resolveRoot(doc);
  if ('error' in resolved) {
    return { ok: false, error: resolved.error, warnings: [] };
  }
  const root = resolved.route;

  const warnings: string[] = [];

  // 3. Parse the alert labels.
  const labels = parseLabels(
    typeof alertLabelsInput === 'string' ? alertLabelsInput : '',
    warnings,
  );
  if (labels.size === 0) {
    warnings.push(
      'No alert labels were provided. Matching against an empty label set — every `match`/`matchers` clause is compared to empty strings.',
    );
  }

  // 4. The root receiver/grouping are the inheritance baseline. The root is
  //    always entered regardless of its own matchers (it is the catch-all), so
  //    we seed inheritance from it without testing it for a match.
  const rootReceiver =
    typeof root.receiver === 'string' ? root.receiver : '';
  const rootGrouping = inheritGrouping({}, root);

  const out: RouteMatch[] = [];
  try {
    walk(root, labels, rootReceiver, rootGrouping, ['root'], warnings, false, out);
  } catch (e) {
    return {
      ok: false,
      error: `Internal error while walking the route tree: ${String(e)}`,
      warnings,
    };
  }

  // 5. Flag any terminal match that resolved to no receiver — a real
  //    misconfiguration (Alertmanager requires the root to set one).
  for (const m of out) {
    if (m.receiver.trim() === '') {
      warnings.push(
        `Route path "${m.path.join(' → ')}" resolved to NO receiver. Alertmanager requires the root route to set a default \`receiver:\`.`,
      );
    }
  }

  return { ok: true, matches: out, warnings };
}

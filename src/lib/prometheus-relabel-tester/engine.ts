/**
 * Prometheus Relabel Tester — a CLIENT-SIDE, dependency-light simulator that
 * applies a list of `relabel_configs` rules to sample label sets EXACTLY the way
 * Prometheus does, and reports — per label set — the resulting labels, the
 * per-label diff (added / changed / removed), and whether the target was dropped.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │  WHAT THIS IS                                                              │
 * │                                                                            │
 * │  Relabeling is the single most error-prone part of a Prometheus config:    │
 * │  the regex is FULLY ANCHORED, `replace` deletes the target when the        │
 * │  expanded value is empty, `keep`/`drop` decide whether a target is even    │
 * │  scraped, and `hashmod` shards targets with an MD5-based hash. Getting      │
 * │  any of these wrong silently drops metrics. This tool lets you paste rules │
 * │  + labels and see the outcome before you ship the config.                  │
 * │                                                                            │
 * │  FIDELITY — every behaviour below mirrors Prometheus `pkg/relabel`:        │
 * │    • regex anchored as ^(?:regex)$ (relabel.Regexp wraps "^(?:" … ")$").   │
 * │    • replace: join source_labels with separator; if regex matches, expand  │
 * │      $1/${1} in replacement and SET target_label — but if the expansion    │
 * │      is empty, DELETE the label. No match → labels unchanged.              │
 * │    • keep: drop the target unless the joined source matches.               │
 * │    • drop: drop the target when the joined source matches.                 │
 * │    • keepequal/dropequal: compare the joined source to the target_label    │
 * │      value (NOT a regex) and keep/drop on equality.                        │
 * │    • hashmod: target_label = md5sum64(joined source) % modulus, where       │
 * │      md5sum64 is the big-endian uint64 of MD5 bytes [8..16).                │
 * │    • labelmap: for every label NAME matching regex, set a new label named  │
 * │      after the expanded replacement to that label's VALUE.                 │
 * │    • labeldrop / labelkeep: remove labels whose NAME matches / does NOT     │
 * │      match the regex.                                                       │
 * │    • lowercase / uppercase: set target_label to the lower/upper-cased       │
 * │      joined source.                                                         │
 * │    • EVERY write goes through one setter, because Prometheus writes through │
 * │      labels.Builder.Set, which DELETES the label when the value is "".      │
 * │      That applies to lowercase/uppercase/labelmap/hashmod, not just         │
 * │      replace — see `setLabel`.                                             │
 * │    • regexes are RE2, so `(?P<name>…)` and a leading `(?i)` are translated │
 * │      into JavaScript rather than rejected, and patterns that would make the │
 * │      browser's backtracking engine explode are refused before they run —    │
 * │      see the regex-compilation section.                                     │
 * │                                                                            │
 * │  It NEVER throws: bad YAML, a non-list config, or empty input returns      │
 * │  { ok:false, error } with no results.                                      │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

import yaml from 'js-yaml';
import type {
  ChangeKind,
  LabelChange,
  LabelPair,
  RelabelAction,
  RelabelResult,
  RelabelRule,
  TargetResult,
} from './types';

/* ────────────────────────────────────────────────────────────────────────── *
 *  Small helpers.
 * ────────────────────────────────────────────────────────────────────────── */

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
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

/** Stable failure shape so callers can always read `.warnings`. */
function fail(error: string): RelabelResult {
  return { ok: false, error, warnings: [] };
}

/* ────────────────────────────────────────────────────────────────────────── *
 *  Label-set parsing.
 *
 *  Input is one label set per block. A block is a run of non-blank lines; blank
 *  lines separate blocks. Each line is `key=value` or `key="value"`. Both the
 *  Prometheus exposition style ({a="1", b="2"}) and bare key=value are accepted.
 * ────────────────────────────────────────────────────────────────────────── */

/** A label set is an insertion-ordered map; we keep order only for diffing. */
type LabelMap = Map<string, string>;

const VALID_LABEL_NAME = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

/**
 * Parse one label-name=value assignment. Accepts:
 *   key=value            (unquoted value, trimmed)
 *   key="value"          (double-quoted, with \" and \\ escapes honoured)
 * Returns null when the fragment is not a recognisable assignment.
 */
function parseAssignment(fragment: string): [string, string] | null {
  const eq = fragment.indexOf('=');
  if (eq <= 0) return null;
  const name = fragment.slice(0, eq).trim();
  if (!VALID_LABEL_NAME.test(name)) return null;
  let rawValue = fragment.slice(eq + 1).trim();
  // Strip a trailing comma left over from inline `{a="1", b="2"}` splitting.
  if (rawValue.endsWith(',')) rawValue = rawValue.slice(0, -1).trim();
  if (rawValue.startsWith('"')) {
    // Quoted value: decode \" and \\ inside the closing quote.
    const closing = findClosingQuote(rawValue);
    if (closing === -1) return null;
    const inner = rawValue.slice(1, closing);
    return [name, unescapeQuoted(inner)];
  }
  return [name, rawValue];
}

/** Index of the unescaped closing double-quote for a string that opens with one. */
function findClosingQuote(s: string): number {
  for (let i = 1; i < s.length; i++) {
    if (s[i] === '\\') {
      i++; // skip the escaped char
      continue;
    }
    if (s[i] === '"') return i;
  }
  return -1;
}

/** Decode the two escapes Prometheus exposition uses inside quotes: \" and \\. */
function unescapeQuoted(s: string): string {
  return s.replace(/\\(["\\])/g, '$1');
}

/**
 * Split a single source line into label assignments. Handles both a bare
 * `a=1 b=2` style and the exposition `{a="1", b="2"}` form. Commas and braces
 * are stripped; quoted values may contain commas/spaces safely.
 */
function splitLabelLine(line: string): string[] {
  let s = line.trim();
  // Drop a metric-name prefix and surrounding braces if present:
  //   metric{a="1",b="2"}  → a="1",b="2"
  const brace = s.indexOf('{');
  if (brace !== -1 && s.endsWith('}')) {
    s = s.slice(brace + 1, -1);
  }
  const out: string[] = [];
  let buf = '';
  let inQuote = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '\\' && inQuote) {
      buf += c + (s[i + 1] ?? '');
      i++;
      continue;
    }
    if (c === '"') {
      inQuote = !inQuote;
      buf += c;
      continue;
    }
    // Outside quotes, a comma OR whitespace separates assignments.
    if (!inQuote && (c === ',' || c === ' ' || c === '\t')) {
      if (buf.trim() !== '') out.push(buf.trim());
      buf = '';
      continue;
    }
    buf += c;
  }
  if (buf.trim() !== '') out.push(buf.trim());
  return out;
}

/**
 * Parse the full label-sets input into an array of label maps. Blocks are
 * separated by blank lines; lines beginning with `#` are comments. Returns
 * { sets, warnings }, never throws.
 */
function parseLabelSets(input: string): { sets: LabelMap[]; warnings: string[] } {
  const warnings: string[] = [];
  const sets: LabelMap[] = [];
  const lines = input.split(/\r?\n/);

  let current: LabelMap | null = null;
  const flush = () => {
    if (current && current.size > 0) sets.push(current);
    current = null;
  };

  for (const raw of lines) {
    const line = raw.replace(/^﻿/, '');
    if (line.trim() === '') {
      flush();
      continue;
    }
    if (line.trim().startsWith('#')) continue; // comment
    if (current === null) current = new Map<string, string>();
    for (const frag of splitLabelLine(line)) {
      const kv = parseAssignment(frag);
      if (kv) {
        current.set(kv[0], kv[1]);
      } else {
        warnings.push(`Ignored unrecognised label assignment: "${frag}".`);
      }
    }
  }
  flush();

  return { sets, warnings };
}

/* ────────────────────────────────────────────────────────────────────────── *
 *  Rule parsing — a YAML list of relabel_configs entries → RelabelRule[].
 * ────────────────────────────────────────────────────────────────────────── */

const VALID_ACTIONS: ReadonlySet<string> = new Set<RelabelAction>([
  'replace',
  'keep',
  'drop',
  'keepequal',
  'dropequal',
  'hashmod',
  'labelmap',
  'labeldrop',
  'labelkeep',
  'lowercase',
  'uppercase',
]);

/** Coerce a YAML scalar to a string the way Prometheus stringifies config values. */
function scalarToString(v: unknown): string {
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return '';
}

/**
 * Normalise one parsed YAML rule object into a fully-defaulted RelabelRule, or
 * return an error string describing why it is invalid.
 */
function parseRule(raw: unknown, idx: number): RelabelRule | { error: string } {
  if (!isRecord(raw)) {
    return { error: `Rule ${idx + 1} is not a mapping (expected a YAML object with fields like action, source_labels).` };
  }

  // source_labels: a list of label names (a bare string is accepted as one).
  let sourceLabels: string[] = [];
  const sl = raw.source_labels;
  if (Array.isArray(sl)) {
    sourceLabels = sl.map(scalarToString);
  } else if (typeof sl === 'string') {
    sourceLabels = [sl];
  } else if (sl !== undefined && sl !== null) {
    return { error: `Rule ${idx + 1}: source_labels must be a list of label names.` };
  }

  const action = (raw.action === undefined ? 'replace' : scalarToString(raw.action)).toLowerCase();
  if (!VALID_ACTIONS.has(action)) {
    return { error: `Rule ${idx + 1}: unknown action "${scalarToString(raw.action)}". Valid actions: replace, keep, drop, keepequal, dropequal, hashmod, labelmap, labeldrop, labelkeep, lowercase, uppercase.` };
  }

  const separator = raw.separator === undefined ? ';' : scalarToString(raw.separator);
  const regex = raw.regex === undefined ? '(.*)' : scalarToString(raw.regex);
  const replacement = raw.replacement === undefined ? '$1' : scalarToString(raw.replacement);
  const targetLabel = raw.target_label === undefined ? undefined : scalarToString(raw.target_label);

  let modulus: number | undefined;
  if (raw.modulus !== undefined) {
    const m = Number(raw.modulus);
    if (!Number.isFinite(m) || m <= 0 || !Number.isInteger(m)) {
      return { error: `Rule ${idx + 1}: modulus must be a positive integer.` };
    }
    modulus = m;
  }

  // Action-specific required fields, matching Prometheus config validation.
  const needsTarget: RelabelAction[] = ['replace', 'hashmod', 'lowercase', 'uppercase', 'keepequal', 'dropequal'];
  if (needsTarget.includes(action as RelabelAction) && (targetLabel === undefined || targetLabel === '')) {
    return { error: `Rule ${idx + 1}: action "${action}" requires a target_label.` };
  }
  if (action === 'hashmod' && modulus === undefined) {
    return { error: `Rule ${idx + 1}: action "hashmod" requires a modulus.` };
  }

  return {
    sourceLabels,
    separator,
    regex,
    targetLabel,
    replacement,
    action: action as RelabelAction,
    modulus,
  };
}

/* ────────────────────────────────────────────────────────────────────────── *
 *  Regex compilation: RE2 → JavaScript translation, anchoring, and a
 *  catastrophic-backtracking guard.
 *
 *  Prometheus compiles relabel regexes with Go's `regexp` (RE2), which differs
 *  from JavaScript in two ways that matter here:
 *
 *    1. SPELLING. RE2 writes named groups as `(?P<name>…)` and accepts a leading
 *       inline flag group `(?i)` / `(?s)` / `(?m)`. Both are valid Prometheus
 *       config and must be TRANSLATED, not rejected. Constructs that genuinely
 *       have no JavaScript equivalent (POSIX classes like `[[:alpha:]]`, `(?U)`)
 *       must be refused BY NAME — never with a bare "invalid regex", and never
 *       by handing the browser a pattern that quietly matches something else.
 *
 *    2. TIME. RE2 has no backtracking: it matches in time linear in the input,
 *       so a nested quantifier like `(a+)+b` is harmless in Prometheus. The
 *       browser's engine backtracks, and the same pattern is exponential —
 *       measured on this engine, `(a+)+b` against a non-matching 26-character
 *       value took 21s, and each extra character roughly doubles that. Since we
 *       cannot interrupt a running RegExp on the main thread, such patterns are
 *       refused BEFORE they run, loudly. A silently skipped matcher would print
 *       a wrong survivor list, which is the worse failure.
 * ────────────────────────────────────────────────────────────────────────── */

/** A compiled, fully-anchored matcher — or a specific reason we refused it. */
type CompileResult = { re: RegExp } | { error: string };

/** The only Go inline flags with a direct JavaScript RegExp flag equivalent. */
const LIFTABLE_INLINE_FLAGS = /^[ism]+$/;

/**
 * Index of the `)` closing the group that opens at `open`, skipping escapes and
 * `[...]` character classes. Returns -1 when the group is unbalanced.
 */
function matchingParen(pattern: string, open: number): number {
  let depth = 0;
  let inClass = false;
  for (let i = open; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === '\\') {
      i++;
      continue;
    }
    if (inClass) {
      if (c === ']') inClass = false;
      continue;
    }
    if (c === '[') {
      inClass = true;
      continue;
    }
    if (c === '(') depth++;
    else if (c === ')') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/**
 * Indices of `pattern` that sit at *operator* level — i.e. not consumed by a
 * backslash escape and not inside a `[...]` character class. Everything that
 * inspects regex structure below walks these, so a `+` inside `[a+]` or a `(`
 * written `\(` is never mistaken for syntax.
 */
function operatorIndices(pattern: string): number[] {
  const out: number[] = [];
  let inClass = false;
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === '\\') {
      i++;
      continue;
    }
    if (inClass) {
      if (c === ']') inClass = false;
      continue;
    }
    if (c === '[') {
      inClass = true;
      continue;
    }
    out.push(i);
  }
  return out;
}

/** True when an UNBOUNDED quantifier (`*`, `+`, `{n,}`) starts at `i`. */
function isUnboundedQuantifierAt(pattern: string, i: number): boolean {
  const c = pattern[i];
  if (c === '*' || c === '+') return true;
  if (c === '{') {
    const close = pattern.indexOf('}', i);
    if (close === -1) return false; // a literal `{`
    return /^\{\d*,\}$/.test(pattern.slice(i, close + 1));
  }
  return false;
}

/**
 * The first `(…)`-group in `pattern` that is itself repeated without an upper
 * bound AND contains an unbounded quantifier — `(a+)+`, `(a*)*`, `(\d+|x){2,}`.
 * That nesting is what makes a backtracking engine explode exponentially. A
 * BOUNDED outer quantifier (`(?::\d+)?`, `(x+){1,3}`) cannot blow up and is left
 * alone, so ordinary Prometheus patterns keep working. Returns null when clean.
 */
function nestedUnboundedQuantifier(pattern: string): string | null {
  const hasUnbounded = (s: string) =>
    operatorIndices(s).some((i) => isUnboundedQuantifierAt(s, i));

  for (const open of operatorIndices(pattern)) {
    if (pattern[open] !== '(') continue;
    const close = matchingParen(pattern, open);
    if (close === -1) continue;
    if (!isUnboundedQuantifierAt(pattern, close + 1)) continue;
    if (!hasUnbounded(pattern.slice(open + 1, close))) continue;
    const end = pattern[close + 1] === '{' ? pattern.indexOf('}', close + 1) + 1 : close + 2;
    return pattern.slice(open, end);
  }
  return null;
}

/** What one pass over the pattern found while translating RE2 spelling. */
interface Re2Scan {
  /** The pattern with `(?P<name>` rewritten to JavaScript's `(?<name>`. */
  body: string;
  /** First POSIX bracket class seen (e.g. `[:alpha:]`), else null. */
  posix: string | null;
  /** First inline flag group seen, else null (used only to explain a failure). */
  flagGroup: string | null;
}

/**
 * Single pass that rewrites RE2-only *spelling* into JavaScript and records the
 * constructs we may have to explain. `(?P<name>` → `(?<name>` is the only
 * rewrite; POSIX classes and inline flag groups are reported, not rewritten.
 */
function scanRe2(pattern: string): Re2Scan {
  let body = '';
  let posix: string | null = null;
  let flagGroup: string | null = null;
  let inClass = false;

  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];

    if (c === '\\') {
      body += c + (pattern[i + 1] ?? '');
      i++;
      continue;
    }

    if (inClass) {
      // `[[:alpha:]]` compiles in JavaScript as a class of the literal
      // characters `[`,`:`,`a`,`l`,`p`,`h` — a SILENT mis-match, so flag it.
      if (c === '[' && pattern[i + 1] === ':') {
        const close = pattern.indexOf(':]', i + 2);
        if (close !== -1 && posix === null) posix = pattern.slice(i, close + 2);
      }
      if (c === ']') inClass = false;
      body += c;
      continue;
    }

    if (c === '[') {
      inClass = true;
      body += c;
      continue;
    }

    if (c === '(') {
      if (pattern.startsWith('(?P<', i)) {
        body += '(?<';
        i += 3;
        continue;
      }
      const flags = /^\(\?([A-Za-z-]+)[):]/.exec(pattern.slice(i));
      if (flags && flagGroup === null) flagGroup = flags[0];
      body += c;
      continue;
    }

    body += c;
  }

  return { body, posix, flagGroup };
}

/**
 * Compile a Prometheus relabel regex, FULLY ANCHORED as `^(?:<regex>)$` exactly
 * like `relabel.NewRegexp` does — a partial match never counts. RE2 spelling is
 * translated first; anything unrepresentable, or anything that would make the
 * JavaScript engine backtrack catastrophically, returns a specific `error`.
 */
function compileRegex(pattern: string): CompileResult {
  let body = pattern;
  let flags = '';

  const addFlags = (set: string): string | null => {
    if (!LIFTABLE_INLINE_FLAGS.test(set)) {
      return `uses the inline flag group \`(?${set})\`, which has no JavaScript RegExp flag equivalent (only \`(?i)\`, \`(?s)\` and \`(?m)\` do). Prometheus (RE2) accepts it, so the pattern is fine in your config — but this in-browser simulator refuses to guess rather than mis-match it.`;
    }
    for (const f of set) if (!flags.includes(f)) flags += f;
    return null;
  };

  // 1. Lift leading inline flags into real RegExp flags. At position 0 a Go
  //    `(?i)` applies to the whole pattern, which is precisely what a JavaScript
  //    flag does. `(?i)(?s)foo` and a whole-pattern `(?i:foo|bar)` both reduce.
  for (let progress = true; progress; ) {
    progress = false;
    const lead = /^\(\?([A-Za-z-]+)\)/.exec(body);
    if (lead) {
      const bad = addFlags(lead[1]);
      if (bad) return { error: bad };
      body = body.slice(lead[0].length);
      progress = true;
      continue;
    }
    // `(?i:…)` only reduces to a flag when the group spans the WHOLE pattern;
    // `(?i:a)|b` must not make `b` case-insensitive too.
    const scoped = /^\(\?([A-Za-z-]+):/.exec(body);
    if (scoped && matchingParen(body, 0) === body.length - 1) {
      const bad = addFlags(scoped[1]);
      if (bad) return { error: bad };
      body = body.slice(scoped[0].length, -1);
      progress = true;
    }
  }

  // 2. Translate RE2 spelling (`(?P<name>` → `(?<name>`) and collect hazards.
  const scan = scanRe2(body);
  body = scan.body;

  if (scan.posix) {
    return {
      error: `uses the POSIX character class \`${scan.posix}\`. It is valid in Prometheus (RE2), but JavaScript reads it as a class of the literal characters instead, so this simulator would silently mis-match it. Rewrite it explicitly (\`[[:alpha:]]\` → \`[A-Za-z]\`, \`[[:digit:]]\` → \`[0-9]\`) to preview the result here.`,
    };
  }

  // 3. Refuse exponential backtracking BEFORE any matching happens.
  const nested = nestedUnboundedQuantifier(body);
  if (nested) {
    return {
      error: `was NOT evaluated: \`${nested}\` nests an unbounded quantifier inside an unbounded-quantified group, which makes JavaScript's backtracking regex engine explode exponentially (measured here: ~21s on a 26-character value, roughly doubling per extra character) and would freeze this tab. Prometheus compiles relabel regexes with RE2, which has no backtracking and evaluates this safely in linear time — the pattern is fine in your Prometheus config. Rewrite it without the nested quantifier (e.g. \`(a+)+\` → \`a+\`) to preview the result here.`,
    };
  }

  // 4. Go's `\p{…}` Unicode classes need JavaScript's `u` flag; without it JS
  //    reads `\p` as a literal `p` and would silently mis-match.
  const needsUnicode = /\\[pP]\{/.test(body);
  if (needsUnicode) flags += 'u';

  try {
    return { re: new RegExp(`^(?:${body})$`, flags) };
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    if (scan.flagGroup) {
      return {
        error: `uses the inline flag group \`${scan.flagGroup}…\`, which this browser's regex engine cannot represent. Prometheus (RE2) applies it from that point to the end of the enclosing group; JavaScript has no equivalent, so nothing was evaluated rather than mis-matched.`,
      };
    }
    if (needsUnicode) {
      return {
        error: `uses a \`\\p{…}\` Unicode class that JavaScript could not compile in Unicode mode: ${reason}`,
      };
    }
    return { error: `is not a valid regular expression here — ${reason}` };
  }
}

/* ────────────────────────────────────────────────────────────────────────── *
 *  Replacement expansion (Prometheus semantics).
 * ────────────────────────────────────────────────────────────────────────── */

/**
 * Expand `$1`, `${1}`, `$name`, `${name}` references in a replacement string
 * against a successful match, exactly as Go's Regexp.ExpandString does for
 * Prometheus relabeling. Unmatched/undefined groups expand to the empty string;
 * `$$` is a literal `$`.
 */
function expand(replacement: string, match: RegExpMatchArray): string {
  let out = '';
  for (let i = 0; i < replacement.length; i++) {
    const c = replacement[i];
    if (c !== '$') {
      out += c;
      continue;
    }
    const next = replacement[i + 1];
    if (next === '$') {
      out += '$';
      i++;
      continue;
    }
    if (next === '{') {
      const close = replacement.indexOf('}', i + 2);
      if (close !== -1) {
        const ref = replacement.slice(i + 2, close);
        out += resolveGroup(ref, match);
        i = close;
        continue;
      }
      // Unterminated ${ — emit verbatim like Go does.
      out += c;
      continue;
    }
    if (next !== undefined && /[0-9A-Za-z_]/.test(next)) {
      // Greedily read a name/number group reference.
      let j = i + 1;
      let ref = '';
      while (j < replacement.length && /[0-9A-Za-z_]/.test(replacement[j])) {
        ref += replacement[j];
        j++;
      }
      out += resolveGroup(ref, match);
      i = j - 1;
      continue;
    }
    // A lone `$` with nothing usable after it: emit as-is.
    out += c;
  }
  return out;
}

/** Resolve a numeric or named capture-group reference to its matched text. */
function resolveGroup(ref: string, match: RegExpMatchArray): string {
  if (/^[0-9]+$/.test(ref)) {
    const n = Number(ref);
    const v = match[n];
    return v === undefined ? '' : v;
  }
  const named = match.groups?.[ref];
  return named === undefined ? '' : named;
}

/* ────────────────────────────────────────────────────────────────────────── *
 *  MD5-based hash — Prometheus `hashmod` parity.
 *
 *  Prometheus (`pkg/relabel`) computes hashmod as:
 *      h := md5.Sum(b)             // b = UTF-8 bytes of the joined source
 *      hash := binary.BigEndian.Uint64(h[8:])   // last 8 MD5 bytes, big-endian
 *      target := hash % modulus
 *  We reimplement MD5 synchronously (no SubtleCrypto, which is async) so
 *  applyRelabel stays sync, take bytes [8..16) as a big-endian BigInt uint64,
 *  then `% modulus` (a small positive integer) and return a JS number.
 * ────────────────────────────────────────────────────────────────────────── */

/** UTF-8 encode a string to a byte array (TextEncoder is browser + node safe). */
function utf8Bytes(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

// Per-round left-rotate amounts for MD5.
const MD5_S = [
  7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
  5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
  4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
  6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
];

// Precomputed table K[i] = floor(2^32 * abs(sin(i + 1))).
const MD5_K = [
  0xd76aa478, 0xe8c7b756, 0x242070db, 0xc1bdceee, 0xf57c0faf, 0x4787c62a,
  0xa8304613, 0xfd469501, 0x698098d8, 0x8b44f7af, 0xffff5bb1, 0x895cd7be,
  0x6b901122, 0xfd987193, 0xa679438e, 0x49b40821, 0xf61e2562, 0xc040b340,
  0x265e5a51, 0xe9b6c7aa, 0xd62f105d, 0x02441453, 0xd8a1e681, 0xe7d3fbc8,
  0x21e1cde6, 0xc33707d6, 0xf4d50d87, 0x455a14ed, 0xa9e3e905, 0xfcefa3f8,
  0x676f02d9, 0x8d2a4c8a, 0xfffa3942, 0x8771f681, 0x6d9d6122, 0xfde5380c,
  0xa4beea44, 0x4bdecfa9, 0xf6bb4b60, 0xbebfbc70, 0x289b7ec6, 0xeaa127fa,
  0xd4ef3085, 0x04881d05, 0xd9d4d039, 0xe6db99e5, 0x1fa27cf8, 0xc4ac5665,
  0xf4292244, 0x432aff97, 0xab9423a7, 0xfc93a039, 0x655b59c3, 0x8f0ccc92,
  0xffeff47d, 0x85845dd1, 0x6fa87e4f, 0xfe2ce6e0, 0xa3014314, 0x4e0811a1,
  0xf7537e82, 0xbd3af235, 0x2ad7d2bb, 0xeb86d391,
];

/** 32-bit left rotate. */
function md5Rotl(x: number, c: number): number {
  return ((x << c) | (x >>> (32 - c))) >>> 0;
}

/**
 * MD5 digest of the bytes `msg`, returned as a 16-byte Uint8Array. Pure, sync,
 * dependency-free — a direct transcription of RFC 1321 so `hashmod` stays sync
 * (SubtleCrypto is async and unavailable in non-secure contexts).
 */
function md5(msg: Uint8Array): Uint8Array {
  const origLenBits = msg.length * 8;
  // Pad: 0x80, then zeros, until length ≡ 56 (mod 64), then 8-byte little-endian length.
  const withOne = msg.length + 1;
  const padded = new Uint8Array((Math.ceil((withOne + 8) / 64)) * 64);
  padded.set(msg);
  padded[msg.length] = 0x80;
  // Append the original bit length as a 64-bit little-endian integer.
  let lenBits = origLenBits >>> 0;
  let lenHi = Math.floor(origLenBits / 0x100000000) >>> 0;
  const lenOffset = padded.length - 8;
  for (let i = 0; i < 4; i++) {
    padded[lenOffset + i] = lenBits & 0xff;
    lenBits >>>= 8;
  }
  for (let i = 0; i < 4; i++) {
    padded[lenOffset + 4 + i] = lenHi & 0xff;
    lenHi >>>= 8;
  }

  let a0 = 0x67452301;
  let b0 = 0xefcdab89;
  let c0 = 0x98badcfe;
  let d0 = 0x10325476;

  const m = new Int32Array(16);
  for (let off = 0; off < padded.length; off += 64) {
    for (let i = 0; i < 16; i++) {
      const j = off + i * 4;
      m[i] =
        padded[j] |
        (padded[j + 1] << 8) |
        (padded[j + 2] << 16) |
        (padded[j + 3] << 24);
    }

    let a = a0;
    let b = b0;
    let c = c0;
    let d = d0;

    for (let i = 0; i < 64; i++) {
      let f: number;
      let g: number;
      if (i < 16) {
        f = (b & c) | (~b & d);
        g = i;
      } else if (i < 32) {
        f = (d & b) | (~d & c);
        g = (5 * i + 1) % 16;
      } else if (i < 48) {
        f = b ^ c ^ d;
        g = (3 * i + 5) % 16;
      } else {
        f = c ^ (b | ~d);
        g = (7 * i) % 16;
      }
      f = (f + a + MD5_K[i] + m[g]) >>> 0;
      a = d;
      d = c;
      c = b;
      b = (b + md5Rotl(f, MD5_S[i])) >>> 0;
    }

    a0 = (a0 + a) >>> 0;
    b0 = (b0 + b) >>> 0;
    c0 = (c0 + c) >>> 0;
    d0 = (d0 + d) >>> 0;
  }

  // Output digest is a0,b0,c0,d0 each little-endian.
  const out = new Uint8Array(16);
  const words = [a0, b0, c0, d0];
  for (let w = 0; w < 4; w++) {
    let v = words[w];
    for (let i = 0; i < 4; i++) {
      out[w * 4 + i] = v & 0xff;
      v >>>= 8;
    }
  }
  return out;
}

/**
 * Prometheus hashmod value: take the MD5 of the UTF-8 bytes of `value`, read its
 * last 8 bytes (h[8..16)) as a big-endian uint64, then `% modulus`, as a number.
 */
function hashmod(value: string, modulus: number): number {
  const digest = md5(utf8Bytes(value));
  let hash = 0n;
  for (let i = 8; i < 16; i++) {
    hash = (hash << 8n) | BigInt(digest[i]);
  }
  return Number(hash % BigInt(modulus));
}

/* ────────────────────────────────────────────────────────────────────────── *
 *  Applying the chain to ONE label set.
 * ────────────────────────────────────────────────────────────────────────── */

interface ApplyOutcome {
  labels: LabelMap;
  dropped: boolean;
  droppedByRule?: number;
  droppedByAction?: RelabelAction;
}

/**
 * The ONE way a relabel rule may write a label. Every Prometheus relabel action
 * writes through `labels.Builder.Set`, which opens with:
 *
 *     func (b *Builder) Set(n, v string) *Builder {
 *         if v == "" {
 *             // Empty labels are the same as missing labels.
 *             return b.Del(n)
 *         }
 *
 * So an empty value DELETES the label — for `replace`, but equally for
 * `lowercase`, `uppercase`, `labelmap` and `hashmod`. Leaving `foo=""` behind
 * would show the user a label that will not exist on the real target. Note the
 * test is `v === ''` and nothing else: a `hashmod` landing on shard `"0"` is a
 * perfectly good value and must still be written.
 */
function setLabel(labels: LabelMap, name: string, value: string): void {
  if (value === '') labels.delete(name);
  else labels.set(name, value);
}

/**
 * Apply all rules in order to a single (cloned) label set. Mirrors the control
 * flow of Prometheus `relabel.Process`: rules run sequentially; a keep/drop/
 * *equal rule can mark the whole target dropped (we stop processing it then,
 * exactly as Prometheus returns nil/false from Process).
 */
function applyRules(
  input: LabelMap,
  rules: RelabelRule[],
  regexes: RegExp[],
): ApplyOutcome {
  const labels = new Map(input);

  for (let r = 0; r < rules.length; r++) {
    const rule = rules[r];
    const re = regexes[r];
    // Joined source value: each source label's value (missing → "") joined by
    // separator. Prometheus joins ALL listed source labels with the separator.
    const joined = rule.sourceLabels.map((n) => labels.get(n) ?? '').join(rule.separator);

    switch (rule.action) {
      case 'drop': {
        if (re.test(joined)) {
          return { labels, dropped: true, droppedByRule: r + 1, droppedByAction: 'drop' };
        }
        break;
      }
      case 'keep': {
        if (!re.test(joined)) {
          return { labels, dropped: true, droppedByRule: r + 1, droppedByAction: 'keep' };
        }
        break;
      }
      case 'dropequal': {
        const target = rule.targetLabel ? labels.get(rule.targetLabel) ?? '' : '';
        if (joined === target) {
          return { labels, dropped: true, droppedByRule: r + 1, droppedByAction: 'dropequal' };
        }
        break;
      }
      case 'keepequal': {
        const target = rule.targetLabel ? labels.get(rule.targetLabel) ?? '' : '';
        if (joined !== target) {
          return { labels, dropped: true, droppedByRule: r + 1, droppedByAction: 'keepequal' };
        }
        break;
      }
      case 'replace': {
        const m = joined.match(re);
        if (!m) break; // no match → labels unchanged
        const value = expand(rule.replacement, m);
        // Prometheus also template-expands the target name through the same
        // match (target := re.ExpandString(nil, cfg.TargetLabel, val, indexes)),
        // so e.g. target_label: __param_$1 is named from capture group 1.
        const target = expand(rule.targetLabel ?? '', m);
        if (target === '') break;
        setLabel(labels, target, value);
        break;
      }
      case 'lowercase': {
        if (rule.targetLabel) setLabel(labels, rule.targetLabel, joined.toLowerCase());
        break;
      }
      case 'uppercase': {
        if (rule.targetLabel) setLabel(labels, rule.targetLabel, joined.toUpperCase());
        break;
      }
      case 'hashmod': {
        if (rule.targetLabel && rule.modulus) {
          setLabel(labels, rule.targetLabel, String(hashmod(joined, rule.modulus)));
        }
        break;
      }
      case 'labelmap': {
        // For every EXISTING label whose NAME matches, set a new label named by
        // the expanded replacement to that label's value. We collect first to
        // avoid mutating the map while iterating.
        const writes: [string, string][] = [];
        for (const [name, val] of labels) {
          const m = name.match(re);
          if (m) writes.push([expand(rule.replacement, m), val]);
        }
        for (const [name, val] of writes) setLabel(labels, name, val);
        break;
      }
      case 'labeldrop': {
        for (const name of [...labels.keys()]) {
          if (re.test(name)) labels.delete(name);
        }
        break;
      }
      case 'labelkeep': {
        for (const name of [...labels.keys()]) {
          if (!re.test(name)) labels.delete(name);
        }
        break;
      }
    }
  }

  return { labels, dropped: false };
}

/* ────────────────────────────────────────────────────────────────────────── *
 *  Diffing + sorting helpers for the result surface.
 * ────────────────────────────────────────────────────────────────────────── */

/** A label map → sorted-by-name LabelPair[] (deterministic display order). */
function toSortedPairs(map: LabelMap): LabelPair[] {
  return [...map.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

/** Compute the per-label diff between an input and output label set. */
function diff(input: LabelMap, output: LabelMap): LabelChange[] {
  const changes: LabelChange[] = [];
  const names = new Set<string>([...input.keys(), ...output.keys()]);
  for (const name of names) {
    const before = input.get(name);
    const after = output.get(name);
    let kind: ChangeKind | null = null;
    if (before === undefined && after !== undefined) kind = 'added';
    else if (before !== undefined && after === undefined) kind = 'removed';
    else if (before !== after) kind = 'changed';
    if (kind) changes.push({ name, kind, before, after });
  }
  return changes.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

/* ────────────────────────────────────────────────────────────────────────── *
 *  Public API.
 * ────────────────────────────────────────────────────────────────────────── */

/**
 * Apply a YAML list of `relabel_configs` rules to one or more sample label sets.
 * NEVER throws: empty/garbage input or a YAML parse failure returns
 * { ok:false, error }. On success, returns one TargetResult per label set with
 * the resulting labels, the per-label diff, and a dropped flag.
 *
 * @param configsYaml    A YAML list of relabel rules (the `relabel_configs:` value).
 * @param labelSetsInput One label set per block (`key=value` / `key="value"`),
 *                       blocks separated by blank lines.
 */
export function applyRelabel(configsYaml: string, labelSetsInput: string): RelabelResult {
  // 0. Defensive: the contract is `string`, but never throw on null/non-string.
  if (typeof configsYaml !== 'string' || typeof labelSetsInput !== 'string') {
    return fail('Paste relabel_configs YAML and at least one label set.');
  }

  if (configsYaml.trim() === '') {
    return fail('Paste a YAML list of relabel_configs rules to apply.');
  }
  if (labelSetsInput.trim() === '') {
    return fail('Paste at least one label set (e.g. `__name__="up", job="api"`).');
  }

  // 1. Parse the rule YAML. Any failure is fatal.
  let doc: unknown;
  try {
    doc = yaml.load(configsYaml);
  } catch (e) {
    return fail(`Could not parse relabel_configs YAML: ${describeYamlError(e)}`);
  }

  // Accept either a bare list, or a mapping with a `relabel_configs:` /
  // `metric_relabel_configs:` key (so users can paste a scrape_config snippet).
  let list: unknown = doc;
  if (isRecord(doc)) {
    if (Array.isArray(doc.relabel_configs)) list = doc.relabel_configs;
    else if (Array.isArray(doc.metric_relabel_configs)) list = doc.metric_relabel_configs;
  }

  if (!Array.isArray(list)) {
    return fail(
      'relabel_configs must be a YAML list of rules (e.g. `- source_labels: [__name__]` …), or a mapping containing a `relabel_configs:` list.',
    );
  }
  if (list.length === 0) {
    return fail('The relabel_configs list is empty — add at least one rule.');
  }

  const warnings: string[] = [];

  // 2. Normalise + validate every rule, compiling its anchored regex.
  const rules: RelabelRule[] = [];
  const regexes: RegExp[] = [];
  let usesHashmod = false;
  for (let i = 0; i < list.length; i++) {
    const parsed = parseRule(list[i], i);
    if ('error' in parsed) return fail(parsed.error);
    rules.push(parsed);
    const compiled = compileRegex(parsed.regex);
    if ('error' in compiled) {
      // compileRegex always names the construct it could not handle, so the
      // message reads as one sentence: "Rule 2: regex `…` uses the POSIX …".
      return fail(`Rule ${i + 1}: regex \`${parsed.regex}\` ${compiled.error}`);
    }
    regexes.push(compiled.re);
    if (parsed.action === 'hashmod') usesHashmod = true;
  }

  // 3. Parse the sample label sets.
  const { sets, warnings: setWarnings } = parseLabelSets(labelSetsInput);
  warnings.push(...setWarnings);
  if (sets.length === 0) {
    return fail('No valid label sets found. Use `key=value` or `key="value"` lines, one set per block.');
  }

  // 4. Apply the chain to each label set, building its result.
  const results: TargetResult[] = sets.map((set, i) => {
    const outcome = applyRules(set, rules, regexes);
    return {
      index: i + 1,
      input: toSortedPairs(set),
      dropped: outcome.dropped,
      droppedByRule: outcome.droppedByRule,
      droppedByAction: outcome.droppedByAction,
      output: outcome.dropped ? [] : toSortedPairs(outcome.labels),
      changes: outcome.dropped ? [] : diff(set, outcome.labels),
    };
  });

  if (usesHashmod) {
    warnings.push(
      'hashmod uses MD5 (the same `md5.Sum` Prometheus uses): it hashes the joined source, reads the last 8 MD5 bytes as a big-endian uint64, then takes `% modulus`, so the `__tmp_hash`-style values here match Prometheus byte-for-byte.',
    );
  }

  return { ok: true, results, warnings };
}

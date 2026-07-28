/**
 * Regex Log Tester — a CLIENT-SIDE, deterministic matching engine.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │  WHAT IT DOES                                                              │
 * │                                                                            │
 * │    run(pattern, flags, text) ──▶ RegexResult { valid, matchCount, … }     │
 * │                                                                            │
 * │  • Compiles `new RegExp(pattern, flags)` inside a try/catch. A bad         │
 * │    pattern or an illegal flag combination comes back as                    │
 * │    { valid:false, error } — the engine NEVER throws on user input.         │
 * │                                                                            │
 * │  • Finds ALL matches across the (possibly multi-line) text. The global     │
 * │    `g` flag is added automatically when the user omits it, so "find all"   │
 * │    works regardless — without mutating the flags the user typed for any    │
 * │    other purpose.                                                          │
 * │                                                                            │
 * │  • Captures numbered groups and named groups, and reports each match's     │
 * │    ABSOLUTE index/length into the full text.                               │
 * │                                                                            │
 * │  • Guards against zero-width matches (e.g. /^/m, /(?=x)/, empty match):    │
 * │    if the regex consumes nothing, lastIndex is manually advanced so        │
 * │    iteration always terminates — no infinite loop.                         │
 * │                                                                            │
 * │  Matching is DETERMINISTIC: same inputs → same ordered results.           │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

import { checkRegexSafety, MAX_REGEX_TEXT } from '../regex-safety';
import { base64UrlEncode, base64UrlDecode } from '../codec';
import type { RegexMatch, RegexResult, ShareState } from './types';

/** A failed result, with no matches. Centralized so shape stays consistent. */
function invalid(error: string): RegexResult {
  return { valid: false, error, matchCount: 0, matches: [] };
}

/**
 * Ensure the global flag is present so iteration finds every match, while
 * preserving the rest of the user's flags and rejecting duplicates the
 * RegExp constructor would otherwise reject (e.g. "gg"). De-duplicating is
 * safe and keeps the constructor happy if the user already typed `g`.
 */
function withGlobal(flags: string): string {
  // Collapse to a unique, order-stable set of flag characters, then guarantee g.
  const seen = new Set<string>();
  for (const ch of flags) seen.add(ch);
  seen.add('g');
  return Array.from(seen).join('');
}

/**
 * The spec's AdvanceStringIndex (ECMA-262 §22.2.7.3), used to step past a
 * ZERO-WIDTH match.
 *
 * Under `u`/`v` a RegExp matches whole code points: RegExpBuiltinExec snaps a
 * lastIndex that lands *inside* a surrogate pair back down to the start of that
 * pair. So a plain `lastIndex++` after a zero-width match at a high surrogate
 * makes no progress at all — exec keeps re-reporting the same index until the
 * iteration cap fires, fabricating thousands of duplicate matches. Advancing by
 * the full pair is what actually moves the scan forward.
 *
 * Without `u`/`v` a RegExp matches UTF-16 code units, and stepping one unit at
 * a time is correct (a zero-width match genuinely can occur between the two
 * halves of a surrogate pair).
 */
function advanceStringIndex(s: string, index: number, unicode: boolean): number {
  if (!unicode || index + 1 >= s.length) return index + 1;
  const first = s.charCodeAt(index);
  if (first < 0xd800 || first > 0xdbff) return index + 1;
  const second = s.charCodeAt(index + 1);
  if (second < 0xdc00 || second > 0xdfff) return index + 1;
  return index + 2; // a well-formed surrogate pair — one code point, two units
}

/**
 * Run `pattern`/`flags` against `text` and return all matches.
 *
 * Never throws. Invalid patterns (bad syntax, illegal flag, unknown flag) are
 * reported via `{ valid:false, error }`.
 */
export function run(pattern: string, flags: string, text: string): RegexResult {
  let re: RegExp;

  // Reject patterns whose shape risks catastrophic backtracking BEFORE we ever
  // construct or execute them — a single bad regex could otherwise wedge the
  // UI thread for an unbounded time.
  const safety = checkRegexSafety(pattern);
  if (!safety.safe) {
    return invalid(
      `This pattern was blocked because it could hang the page: ${
        safety.reason ?? 'it has a shape prone to catastrophic backtracking.'
      }`,
    );
  }

  // Bound total work by scanning at most the first MAX_REGEX_TEXT characters.
  let scanText = text;
  let truncated = false;
  if (scanText.length > MAX_REGEX_TEXT) {
    scanText = scanText.slice(0, MAX_REGEX_TEXT);
    truncated = true;
  }

  // Construct the RegExp defensively — invalid patterns/flags surface as errors.
  try {
    re = new RegExp(pattern, withGlobal(flags ?? ''));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return invalid(message);
  }

  const matches: RegexMatch[] = [];

  // A pathological pattern against pathological input could in principle match a
  // very large number of times; cap iterations so the UI thread can never hang.
  const MAX_MATCHES = 10000;
  let cappedAtMax = false;

  // `u`/`v` put the regex in code-point mode, which changes how a zero-width
  // match must be stepped over (see advanceStringIndex). Read it off the
  // compiled RegExp's flags so it reflects what actually got constructed.
  const fullUnicode = re.flags.includes('u') || re.flags.includes('v');

  let m: RegExpExecArray | null;
  // `re` is global, so exec advances lastIndex on each call and returns the
  // next match (or null when exhausted). We scan `scanText`, which is capped to
  // MAX_REGEX_TEXT characters to bound total work.
  while ((m = re.exec(scanText)) !== null) {
    const full = m[0];

    // Numbered groups: m[1..]. A group that didn't participate is `undefined`;
    // normalize to "" so the array stays positionally stable for the UI.
    const groups: string[] = [];
    for (let i = 1; i < m.length; i++) {
      groups.push(m[i] ?? '');
    }

    // Named groups (from m.groups when the pattern uses (?<name>…)). Normalize
    // non-participating names to "" as well.
    const named: Record<string, string> = {};
    if (m.groups) {
      for (const key of Object.keys(m.groups)) {
        named[key] = m.groups[key] ?? '';
      }
    }

    matches.push({
      index: m.index,
      length: full.length,
      match: full,
      groups,
      named,
    });

    // Zero-width-match guard: if the regex consumed nothing (full === ""),
    // lastIndex won't move on its own and exec would loop forever on the same
    // position. Step forward by one code point (u/v) or one code unit.
    if (full.length === 0) {
      re.lastIndex = advanceStringIndex(scanText, re.lastIndex, fullUnicode);
    }

    if (matches.length >= MAX_MATCHES) {
      cappedAtMax = true;
      break;
    }
  }

  const result: RegexResult = {
    valid: true,
    matchCount: matches.length,
    matches,
  };

  // Neither of these is a compile failure — the pattern is valid and the
  // matches below are real. They go on `notice`, never on `error`, because the
  // playground reads a truthy `error` as "invalid pattern" and throws the
  // results away.
  const notices: string[] = [];
  if (truncated) {
    notices.push(
      `Input is large — only the first ${MAX_REGEX_TEXT.toLocaleString()} characters were scanned.`,
    );
  }
  if (cappedAtMax) {
    notices.push(`Stopped after the first ${MAX_MATCHES.toLocaleString('en-US')} matches.`);
  }
  if (notices.length > 0) result.notice = notices.join(' ');

  return result;
}

/* ────────────────────────────────────────────────────────────────────────── *
 *  Shareable-URL state (base64url in the location hash), following the same
 *  `#s=` convention as ../alertlint/engine and ../logql-promql/engine.
 * ────────────────────────────────────────────────────────────────────────── */

/**
 * Encode the pattern + flags + sample text into a URL hash fragment, e.g.
 *   "#s=eyJwYXR0ZXJuIjoiLi4uIn0".
 */
export function encodeState(pattern: string, flags: string, text: string): string {
  const payload: ShareState = { pattern, flags, text };
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
    if (
      typeof parsed.pattern === 'string' &&
      typeof parsed.flags === 'string' &&
      typeof parsed.text === 'string'
    ) {
      return { pattern: parsed.pattern, flags: parsed.flags, text: parsed.text };
    }
    return null;
  } catch {
    return null;
  }
}

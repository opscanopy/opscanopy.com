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
    // position. Manually advance past the current position to make progress.
    if (full.length === 0) {
      re.lastIndex++;
    }

    if (matches.length >= MAX_MATCHES) break;
  }

  const result: RegexResult = {
    valid: true,
    matchCount: matches.length,
    matches,
  };
  if (truncated) {
    // Not a compile failure: the pattern is valid, but we only scanned a prefix
    // of very large input to bound work. Surface that as a note via `error`.
    result.error = `Input is large — only the first ${MAX_REGEX_TEXT.toLocaleString()} characters were scanned.`;
  }
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

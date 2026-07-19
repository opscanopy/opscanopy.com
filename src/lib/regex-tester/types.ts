/**
 * Regex Log Tester — shared types for the client-side matching engine.
 *
 * The engine compiles a user-supplied pattern + flags into a `RegExp`, runs it
 * against (possibly multi-line) log text, and returns EVERY match with its
 * absolute position, the full matched substring, and any numbered / named
 * capture groups. Everything happens in the browser — nothing is uploaded — and
 * the engine never throws on user input: an invalid pattern comes back as
 * `{ valid: false, error }`.
 */

/**
 * A single match found in the input text.
 *
 * Positions are ABSOLUTE offsets into the full text (not per-line), so the
 * playground can highlight the exact span the regex consumed.
 */
export interface RegexMatch {
  /** Zero-based character offset of the match within the full text. */
  index: number;
  /** Length, in characters, of the matched substring (0 for a zero-width match). */
  length: number;
  /** The full matched substring (equivalent to capture group 0). */
  match: string;
  /**
   * Numbered capture groups, in order (group 1, 2, …). A group that did not
   * participate in the match is represented as an empty string so the array is
   * always positionally stable for the UI.
   */
  groups: string[];
  /**
   * Named capture groups, keyed by name. A named group that did not participate
   * is represented as an empty string. Empty object when the pattern has none.
   */
  named: Record<string, string>;
}

/**
 * The result of running a pattern against text.
 *
 * On an invalid pattern, `valid` is false, `error` carries a human-readable
 * message, `matchCount` is 0 and `matches` is empty. On success, `valid` is
 * true and `error` is absent.
 */
export interface RegexResult {
  /** False only when the pattern/flags failed to compile. */
  valid: boolean;
  /** Present only on a compile failure — a helpful message. */
  error?: string;
  /** Number of matches found (equal to `matches.length`). */
  matchCount: number;
  /** Every match found, in the order they occur in the text. */
  matches: RegexMatch[];
}

/**
 * The full editor state needed to reproduce a session via the `#s=` share
 * link: the pattern, its flags, and the sample log text. Field names match
 * the vocabulary used elsewhere in this module (`RegexExample.pattern` /
 * `.flags` / `.text`) rather than the generic `re`/`log` used in other tools'
 * ShareState shapes.
 */
export interface ShareState {
  pattern: string;
  flags: string;
  text: string;
}

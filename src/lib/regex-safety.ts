/**
 * regex-safety — lightweight, dependency-free guards for user-supplied
 * regular expressions that run on the main thread (the regex playground).
 *
 * Two concerns:
 *   1. checkRegexSafety(pattern) — a static heuristic that flags the classic
 *      catastrophic-backtracking shapes (nested unbounded quantifiers such as
 *      (a+)+, (.*)*, ([a-z]*)+, (a|a)*). It is intentionally conservative and
 *      cheap; it does NOT execute the regex.
 *   2. MAX_REGEX_TEXT — a hard cap on the size of the subject text, so even a
 *      "safe-looking" pattern cannot be fed a multi-megabyte haystack and hang
 *      the tab.
 *
 * NOTE: a heuristic can never catch every pathological pattern. The bulletproof
 * follow-up is to run the match inside a Web Worker behind a hard wall-clock
 * timeout and terminate the worker if it overruns. This module is the
 * cheap-and-good-enough first line of defense.
 */

/** Maximum number of characters of subject text we will run a regex against. */
export const MAX_REGEX_TEXT = 200000;

export interface RegexSafetyResult {
  safe: boolean;
  reason?: string;
}

/**
 * Detect nested unbounded quantifiers — a group that is itself quantified by an
 * unbounded quantifier (`*`, `+`, or `{n,}`) whose body also contains an
 * unbounded quantifier or an alternation of overlapping branches. These are the
 * shapes that explode into exponential backtracking on non-matching input.
 *
 * Heuristic, not a full parser: we walk the pattern, track parenthesised groups
 * with a stack, and when a group closes we check whether (a) it is immediately
 * followed by an unbounded quantifier and (b) its body itself contained an
 * unbounded quantifier or a top-level alternation. Either combination is flagged.
 */
export function checkRegexSafety(pattern: string): RegexSafetyResult {
  // Frame per open group: does its body contain an unbounded quantifier, and
  // does it contain a top-level alternation?
  interface Frame {
    hasUnbounded: boolean;
    hasAlternation: boolean;
  }

  const stack: Frame[] = [];

  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];

    // Skip escaped characters — `\(`, `\+`, etc. are literals, not structure.
    if (ch === '\\') {
      i++;
      continue;
    }

    // Skip character classes wholesale: `[...]`. Quantifiers/alternations
    // inside a class are literal characters and never cause backtracking.
    if (ch === '[') {
      i++;
      while (i < pattern.length && pattern[i] !== ']') {
        if (pattern[i] === '\\') i++;
        i++;
      }
      continue;
    }

    if (ch === '(') {
      stack.push({ hasUnbounded: false, hasAlternation: false });
      continue;
    }

    if (ch === '|') {
      if (stack.length > 0) stack[stack.length - 1].hasAlternation = true;
      continue;
    }

    // Unbounded quantifiers: `*`, `+`, or `{n,}` (open-ended).
    let isUnbounded = false;
    if (ch === '*' || ch === '+') {
      isUnbounded = true;
    } else if (ch === '{') {
      // Look ahead for `{n,}` (a comma with nothing — or `}` — after it).
      const close = pattern.indexOf('}', i);
      if (close !== -1) {
        const inner = pattern.slice(i + 1, close);
        const commaIdx = inner.indexOf(',');
        if (commaIdx !== -1 && inner.slice(commaIdx + 1).trim() === '') {
          isUnbounded = true;
        }
        i = close; // consume the whole {…} token
      }
    }

    if (ch === ')') {
      const frame = stack.pop();
      if (frame) {
        // Is this group itself quantified by an unbounded quantifier?
        let q = i + 1;
        // Allow a lazy `?` after the closing paren before the quantifier check.
        let groupUnbounded = false;
        const next = pattern[q];
        if (next === '*' || next === '+') {
          groupUnbounded = true;
        } else if (next === '{') {
          const close = pattern.indexOf('}', q);
          if (close !== -1) {
            const inner = pattern.slice(q + 1, close);
            const commaIdx = inner.indexOf(',');
            if (commaIdx !== -1 && inner.slice(commaIdx + 1).trim() === '') {
              groupUnbounded = true;
            }
          }
        }

        if (groupUnbounded && (frame.hasUnbounded || frame.hasAlternation)) {
          return {
            safe: false,
            reason:
              'Nested unbounded quantifier detected (a repeated group whose body can also repeat, e.g. (a+)+ or (.*)*). This shape can trigger catastrophic backtracking and hang the browser tab.',
          };
        }
        // Propagate the unbounded flag up: a quantified group counts as an
        // unbounded element of its parent.
        if (stack.length > 0 && (groupUnbounded || frame.hasUnbounded)) {
          stack[stack.length - 1].hasUnbounded = true;
        }
      }
      continue;
    }

    if (isUnbounded && stack.length > 0) {
      stack[stack.length - 1].hasUnbounded = true;
    }
  }

  return { safe: true };
}

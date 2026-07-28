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
    /**
     * Does the group body end in a MANDATORY atom (a literal or class that is
     * not itself quantified)? A trailing separator like the `.` in `(\d+\.)+`
     * anchors each repetition, which removes the ambiguity that drives
     * catastrophic backtracking — so those patterns are safe despite matching
     * the nested-quantifier shape.
     */
    endsWithMandatoryAtom: boolean;
  }

  const stack: Frame[] = [];
  /** Mark the innermost group's trailing atom as mandatory / not. */
  const markAtom = (mandatory: boolean) => {
    if (stack.length > 0) stack[stack.length - 1].endsWithMandatoryAtom = mandatory;
  };

  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];

    // Skip escaped characters — `\(`, `\+`, etc. are literals, not structure.
    if (ch === '\\') {
      i++;
      markAtom(true);
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
      markAtom(true);
      continue;
    }

    if (ch === '(') {
      stack.push({ hasUnbounded: false, hasAlternation: false, endsWithMandatoryAtom: false });
      continue;
    }

    if (ch === '|') {
      if (stack.length > 0) {
        stack[stack.length - 1].hasAlternation = true;
        stack[stack.length - 1].endsWithMandatoryAtom = false;
      }
      continue;
    }

    // Unbounded quantifiers: `*`, `+`, or `{n,}` (open-ended).
    let isUnbounded = false;
    let isQuantifier = ch === '*' || ch === '+' || ch === '?';
    if (ch === '*' || ch === '+') {
      isUnbounded = true;
    } else if (ch === '{') {
      // ONLY a well-formed `{n}` / `{n,}` / `{n,m}` is a quantifier token. The
      // old code consumed EVERY `{…}` span, so a literal brace swallowed
      // whatever it wrapped: `{(a+)+}` skipped straight past the nested
      // quantifier and was reported safe, which is a share-link tab freeze.
      const close = pattern.indexOf('}', i);
      const inner = close === -1 ? null : pattern.slice(i + 1, close);
      if (inner !== null && /^\d+(,\d*)?$/.test(inner)) {
        isQuantifier = true;
        if (/,$/.test(inner)) isUnbounded = true;
        i = close; // consume the whole quantifier token
      }
      // Otherwise `{` is a literal: fall through WITHOUT moving `i`.
      else {
        markAtom(true);
        continue;
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

        // The trailing-separator exemption applies only to the nested-quantifier
        // risk. An alternation of overlapping branches — `(a|a)*` — backtracks
        // regardless of what the body ends with, so that half is unconditional.
        const risky = frame.hasUnbounded
          ? !frame.endsWithMandatoryAtom
          : frame.hasAlternation;

        if (groupUnbounded && risky) {
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
        // For the PARENT, this group is one atom — mandatory only if it is not
        // itself quantified.
        const quantifierAfter = pattern[i + 1];
        const groupIsQuantified =
          quantifierAfter === '*' ||
          quantifierAfter === '+' ||
          quantifierAfter === '?' ||
          quantifierAfter === '{';
        markAtom(!groupIsQuantified);
      }
      continue;
    }

    if (isUnbounded && stack.length > 0) {
      stack[stack.length - 1].hasUnbounded = true;
    }
    // A quantifier makes the atom it follows optional/repeatable, so the body
    // no longer ends in something mandatory. Anything else is a plain literal.
    markAtom(!isQuantifier);
  }

  return { safe: true };
}

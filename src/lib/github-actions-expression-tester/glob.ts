/**
 * GitHub filter-pattern glob engine — for on.<event>.branches / tags / paths.
 *
 * This is GitHub's own filter syntax, NOT POSIX glob and NOT regex:
 *   *    zero or more characters, but does NOT cross `/`
 *   **   zero or more characters INCLUDING `/` (crosses path segments)
 *   ?    exactly one character (not `/`)
 *   +    one or more of the PRECEDING character
 *   []   a character range, e.g. [0-9]
 *   \    escapes the next special character (\* is a literal *)
 *   !    (only at the START of a list entry) negates that entry — handled by
 *        matchList, not by the regex compiler
 *
 * Patterns are fully anchored — they must match the whole ref/path.
 */

/** Compile a single positive pattern (no leading `!`) to an anchored RegExp. */
export function compileGlob(pattern: string): RegExp {
  let re = '^';
  const n = pattern.length;
  for (let i = 0; i < n; i++) {
    const c = pattern[i];
    if (c === '\\') {
      // Escape the next char literally.
      const next = pattern[i + 1];
      if (next !== undefined) {
        re += escapeLiteral(next);
        i++;
      } else {
        re += '\\\\';
      }
    } else if (c === '*') {
      if (pattern[i + 1] === '*') {
        // `**/` → zero or more leading segments; `**` → any run including `/`.
        if (pattern[i + 2] === '/') {
          re += '(?:.*/)?';
          i += 2;
        } else {
          re += '.*';
          i += 1;
        }
      } else {
        re += '[^/]*';
      }
    } else if (c === '?') {
      re += '[^/]';
    } else if (c === '+') {
      // `+` quantifies the preceding atom. If the previous glob token emitted a
      // `*` (`[^/]*` or `.*`), collapse it to `+` so we never produce an invalid
      // possessive quantifier like `[^/]*+`.
      if (re.endsWith('*')) re = `${re.slice(0, -1)}+`;
      else re += '+';
    } else if (c === '[') {
      // Copy a character class verbatim up to the closing ].
      let j = i + 1;
      let cls = '[';
      if (pattern[j] === '!' || pattern[j] === '^') {
        cls += '^';
        j++;
      }
      while (j < n && pattern[j] !== ']') {
        cls += pattern[j];
        j++;
      }
      cls += ']';
      re += cls;
      i = j;
    } else {
      re += escapeLiteral(c);
    }
  }
  re += '$';
  return new RegExp(re);
}

function escapeLiteral(c: string): string {
  // Escape regex metacharacters so they are matched literally.
  return /[.()^${}|+\\\][?*]/.test(c) ? `\\${c}` : c;
}

/** Test one name against one positive pattern. Never throws. */
export function matchOne(name: string, pattern: string): boolean {
  try {
    return compileGlob(pattern).test(name);
  } catch {
    return false;
  }
}

/**
 * Evaluate an ordered list of patterns (which may contain `!negations`) against
 * a name, GitHub-style: walk top-to-bottom, a positive match includes, a later
 * `!match` excludes, and a later positive match can re-include. Returns whether
 * the name is finally included and which pattern decided.
 */
export function matchList(
  name: string,
  patterns: string[],
): { included: boolean; decidedBy: string } {
  let included = false;
  let decidedBy = '(no pattern matched)';
  for (const raw of patterns) {
    const negate = raw.startsWith('!');
    const pat = negate ? raw.slice(1) : raw;
    if (matchOne(name, pat)) {
      included = !negate;
      decidedBy = raw;
    }
  }
  return { included, decidedBy };
}

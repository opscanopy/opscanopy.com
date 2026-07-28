import { describe, expect, it } from 'vitest';
import { checkRegexSafety } from './regex-safety';

/**
 * This heuristic gates three tools (regex-log-tester, alertmanager-route-tester,
 * alertlint), so both failure directions are expensive: a miss lets a share link
 * freeze the recipient's tab, and a false positive silently turns a valid
 * matcher into "never matches".
 */
describe('checkRegexSafety — catches the classic ReDoS shapes', () => {
  for (const p of ['(a+)+', '(.*)*', '([a-z]*)+', '(a|a)*', '(\\s*\\w*)+', '(a+)+$']) {
    it(`flags ${p}`, () => {
      expect(checkRegexSafety(p).safe).toBe(false);
    });
  }
});

describe('checkRegexSafety — is not bypassed by a non-quantifier brace', () => {
  // The scanner used to jump i to the closing "}" for ANY {…} span, so the
  // nested quantifier inside {(a+)+} was never examined at all.
  it('flags a nested quantifier wrapped in literal braces', () => {
    expect(checkRegexSafety('{(a+)+}').safe).toBe(false);
  });

  it('flags one wrapped in a brace span containing a comma', () => {
    expect(checkRegexSafety('{a,(b+)+}').safe).toBe(false);
  });

  it('still treats a real bounded quantifier as bounded', () => {
    expect(checkRegexSafety('(ab){2,4}').safe).toBe(true);
  });

  it('still treats a real open-ended quantifier as unbounded', () => {
    expect(checkRegexSafety('(a+){2,}').safe).toBe(false);
  });
});

describe('checkRegexSafety — does not block ordinary log patterns', () => {
  // Each group body ends in a MANDATORY literal separator, which removes the
  // ambiguity that drives catastrophic backtracking.
  const safe = [
    '(\\d+\\.)+\\d+', // dotted quad / version number
    '(\\w+/)+\\w+', // path segments
    '(\\w+-)+\\w+', // hyphenated token
    '([a-z0-9-]+\\.)+[a-z]{2,}', // domain suffix
    '(\\d{2}:)+\\d{2}', // clock time
  ];
  for (const p of safe) {
    it(`allows ${p}`, () => {
      expect(checkRegexSafety(p).safe).toBe(true);
    });
  }
});

describe('checkRegexSafety — plain patterns are unaffected', () => {
  for (const p of ['ERROR', '^\\d{4}-\\d{2}-\\d{2}', 'GET|POST', '[a-z]+', '\\bwarn\\b']) {
    it(`allows ${p}`, () => {
      expect(checkRegexSafety(p).safe).toBe(true);
    });
  }
});

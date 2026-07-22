/**
 * Practice Tests — progress helper tests. Pure functions only: the module owns
 * the `oc-tests-v1` storage schema and its defensive parsing, but never touches
 * the DOM or localStorage (page scripts own I/O).
 *
 * parseProgress must never throw: null, empty, garbage, wrong-shaped JSON and
 * malformed sub-entries all collapse to a valid empty progress object, while
 * well-formed entries survive. Pass state is derived (didPass), never stored.
 */
import { describe, it, expect } from 'vitest';
import {
  parseProgress,
  bestFor,
  didPass,
  recordAttempt,
  resetTest,
  PROGRESS_KEY,
  type TestsProgress,
  type TestAttempt,
} from './progress';

const EMPTY: TestsProgress = { tests: {} };

/** Convenience: a well-formed attempt entry. */
const attempt = (over: Partial<TestAttempt> = {}): TestAttempt => ({
  bestPct: 80,
  attempts: 2,
  lastAttemptAt: '2026-07-01T10:00:00.000Z',
  ...over,
});

describe('parseProgress()', () => {
  it('returns empty progress for null and empty string', () => {
    expect(parseProgress(null)).toEqual(EMPTY);
    expect(parseProgress('')).toEqual(EMPTY);
  });

  it('returns empty progress for non-JSON garbage (never throws)', () => {
    expect(() => parseProgress('{not json')).not.toThrow();
    expect(parseProgress('{not json')).toEqual(EMPTY);
    expect(parseProgress('undefined')).toEqual(EMPTY);
  });

  it('returns empty progress for JSON of the wrong shape (array / scalar)', () => {
    expect(parseProgress('[]')).toEqual(EMPTY);
    expect(parseProgress('[1,2,3]')).toEqual(EMPTY);
    expect(parseProgress('42')).toEqual(EMPTY);
    expect(parseProgress('null')).toEqual(EMPTY);
    expect(parseProgress('true')).toEqual(EMPTY);
    expect(parseProgress('"oc-tests-v1"')).toEqual(EMPTY);
  });

  it('fills in missing keys on an empty object', () => {
    expect(parseProgress('{}')).toEqual(EMPTY);
  });

  it('drops a wrong-typed tests container', () => {
    expect(parseProgress('{"tests": 5}')).toEqual(EMPTY);
    expect(parseProgress('{"tests": []}')).toEqual(EMPTY);
    expect(parseProgress('{"tests": "x"}')).toEqual(EMPTY);
  });

  it('passes well-formed input through unchanged', () => {
    const good: TestsProgress = {
      tests: {
        'aws-devops-professional/dop-c02-sample-exam': attempt(),
        'aws-devops-professional/other': attempt({ bestPct: 100, attempts: 1 }),
      },
    };
    expect(parseProgress(JSON.stringify(good))).toEqual(good);
  });

  it('keeps valid attempts and drops malformed sub-entries', () => {
    const raw = JSON.stringify({
      tests: {
        good: attempt(),
        'bad-bestPct-type': attempt({ bestPct: '80' as unknown as number }),
        'missing-lastAttemptAt': { bestPct: 50, attempts: 1 },
        'null-entry': null,
        'scalar-entry': 'done',
        'array-entry': ['x'],
      },
    });
    expect(parseProgress(raw).tests).toEqual({ good: attempt() });
  });

  it('rejects bestPct that is <0, >100, NaN, or non-integer', () => {
    const bad = (bestPct: unknown) =>
      parseProgress(JSON.stringify({ tests: { k: { bestPct, attempts: 1, lastAttemptAt: 'z' } } })).tests;
    expect(bad(-1)).toEqual({});
    expect(bad(101)).toEqual({});
    expect(bad(80.5)).toEqual({});
    // JSON can't encode NaN, but "1e999" round-trips to Infinity.
    expect(parseProgress('{"tests":{"k":{"bestPct":1e999,"attempts":1,"lastAttemptAt":"z"}}}').tests).toEqual({});
    // Boundaries 0 and 100 are valid.
    expect(bad(0)).toEqual({ k: { bestPct: 0, attempts: 1, lastAttemptAt: 'z' } });
    expect(bad(100)).toEqual({ k: { bestPct: 100, attempts: 1, lastAttemptAt: 'z' } });
  });

  it('requires attempts to be a positive integer', () => {
    const withAttempts = (attempts: unknown) =>
      parseProgress(JSON.stringify({ tests: { k: { bestPct: 50, attempts, lastAttemptAt: 'z' } } })).tests;
    expect(withAttempts(0)).toEqual({});
    expect(withAttempts(-2)).toEqual({});
    expect(withAttempts(1.5)).toEqual({});
    expect(withAttempts('3')).toEqual({});
    expect(withAttempts(3)).toEqual({ k: { bestPct: 50, attempts: 3, lastAttemptAt: 'z' } });
  });

  it('drops hostile prototype-shaped keys and outputs a null-prototype map', () => {
    // Raw string on purpose: JSON.parse defines __proto__ as an own property,
    // which is exactly the hostile input this guards against.
    const raw =
      '{"tests": {"__proto__": {"bestPct": 90, "attempts": 1, "lastAttemptAt": "z"},' +
      ' "constructor": {"bestPct": 90, "attempts": 1, "lastAttemptAt": "z"},' +
      ' "prototype": {"bestPct": 90, "attempts": 1, "lastAttemptAt": "z"},' +
      ' "k": {"bestPct": 90, "attempts": 1, "lastAttemptAt": "z"}}}';
    const p = parseProgress(raw);
    expect(Object.keys(p.tests)).toEqual(['k']);
    expect(Object.getPrototypeOf(p.tests)).toBeNull();
    expect(Object.prototype.hasOwnProperty.call(p.tests, '__proto__')).toBe(false);
  });
});

describe('recordAttempt()', () => {
  const NOW = '2026-07-10T12:00:00.000Z';
  const KEY = 'aws-devops-professional/dop-c02-sample-exam';

  it('creates a first attempt with the given score', () => {
    const next = recordAttempt(EMPTY, KEY, 80, NOW);
    expect(next.tests[KEY]).toEqual({ bestPct: 80, attempts: 1, lastAttemptAt: NOW });
  });

  it('keeps the higher bestPct on a higher score and increments attempts', () => {
    const p: TestsProgress = { tests: { [KEY]: attempt({ bestPct: 60, attempts: 1 }) } };
    const next = recordAttempt(p, KEY, 90, NOW);
    expect(next.tests[KEY]).toEqual({ bestPct: 90, attempts: 2, lastAttemptAt: NOW });
  });

  it('keeps the old best on a lower score but still increments + restamps', () => {
    const p: TestsProgress = { tests: { [KEY]: attempt({ bestPct: 90, attempts: 3 }) } };
    const next = recordAttempt(p, KEY, 40, NOW);
    expect(next.tests[KEY]).toEqual({ bestPct: 90, attempts: 4, lastAttemptAt: NOW });
  });

  it('keeps best but increments + restamps on an equal score', () => {
    const p: TestsProgress = { tests: { [KEY]: attempt({ bestPct: 80, attempts: 1, lastAttemptAt: 'old' }) } };
    const next = recordAttempt(p, KEY, 80, NOW);
    expect(next.tests[KEY]).toEqual({ bestPct: 80, attempts: 2, lastAttemptAt: NOW });
  });

  it('never mutates the input progress', () => {
    const p: TestsProgress = { tests: { [KEY]: attempt({ bestPct: 60, attempts: 1 }) } };
    recordAttempt(p, KEY, 90, NOW);
    expect(p.tests[KEY]).toEqual(attempt({ bestPct: 60, attempts: 1 }));
  });

  it('leaves other tests untouched', () => {
    const p: TestsProgress = { tests: { other: attempt() } };
    const next = recordAttempt(p, KEY, 70, NOW);
    expect(next.tests.other).toEqual(attempt());
  });
});

describe('resetTest()', () => {
  const KEY = 'aws-devops-professional/dop-c02-sample-exam';

  it('removes the key', () => {
    const p: TestsProgress = { tests: { [KEY]: attempt(), other: attempt() } };
    const next = resetTest(p, KEY);
    expect(Object.keys(next.tests)).toEqual(['other']);
  });

  it('is a no-op for an unknown key', () => {
    const p: TestsProgress = { tests: { other: attempt() } };
    const next = resetTest(p, KEY);
    expect(next.tests).toEqual({ other: attempt() });
  });

  it('never mutates the input progress', () => {
    const p: TestsProgress = { tests: { [KEY]: attempt() } };
    resetTest(p, KEY);
    expect(Object.keys(p.tests)).toEqual([KEY]);
  });
});

describe('bestFor() / didPass()', () => {
  const KEY = 'aws-devops-professional/dop-c02-sample-exam';

  it('returns the entry or undefined', () => {
    const p: TestsProgress = { tests: { [KEY]: attempt({ bestPct: 80 }) } };
    expect(bestFor(p, KEY)).toEqual(attempt({ bestPct: 80 }));
    expect(bestFor(p, 'missing')).toBeUndefined();
  });

  it('derives pass at the >= boundary', () => {
    expect(didPass(75, 75)).toBe(true);
    expect(didPass(74, 75)).toBe(false);
    expect(didPass(100, 75)).toBe(true);
  });

  it('re-derives pass against the threshold at read time (not a stored flag)', () => {
    // A stored best of 80 passes the 75 practice mark but not a stricter 90.
    const p: TestsProgress = { tests: { [KEY]: attempt({ bestPct: 80 }) } };
    const best = bestFor(p, KEY)!;
    expect(didPass(best.bestPct, 75)).toBe(true);
    expect(didPass(best.bestPct, 90)).toBe(false);
  });
});

describe('PROGRESS_KEY', () => {
  it('is the versioned localStorage key every page script reads/writes', () => {
    expect(PROGRESS_KEY).toBe('oc-tests-v1');
  });
});

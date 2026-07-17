/**
 * Mission 90 Days — progress/streak helper tests. Pure functions only: the
 * module owns the `oc-m90-v1` storage schema and its defensive parsing, but
 * never touches the DOM or localStorage (page scripts own I/O).
 *
 * parseProgress must never throw: null, empty, garbage, wrong-shaped JSON and
 * malformed sub-entries all collapse to a valid empty progress object, while
 * well-formed entries survive. streak() operates on local calendar dates
 * (YYYY-MM-DD strings) with pure day arithmetic — no timezone conversion.
 */
import { describe, it, expect } from 'vitest';
import {
  parseProgress,
  doneCount,
  nextDay,
  resumeDay,
  phaseProgress,
  streak,
  exportProgress,
  importProgress,
  markDayDone,
  unmarkDay,
  markDaysDone,
  unmarkDays,
  markPhaseDone,
  setPace,
  recordMissionRun,
  PROGRESS_KEY,
  type M90Progress,
} from './progress';
import { base64UrlEncode } from '../codec';

/** Test-only: encode an arbitrary raw JSON string, bypassing exportProgress's
 *  M90Progress typing, so malformed-shape import cases can be constructed. */
const exportProgressOf = (rawJson: string): string => base64UrlEncode(rawJson);

const EMPTY: M90Progress = { days: {}, missions: {} };

/** Convenience: a well-formed day entry. */
const day = (iso = '2026-07-01T10:00:00.000Z') => ({ completedAt: iso });

/** Convenience: a well-formed mission entry. */
const mission = (over: Partial<M90Progress['missions'][string]> = {}) => ({
  completedAt: '2026-07-01T10:00:00.000Z',
  commands: 12,
  hints: 1,
  seconds: 340,
  ...over,
});

describe('parseProgress()', () => {
  it('returns empty progress for null', () => {
    expect(parseProgress(null)).toEqual(EMPTY);
  });

  it('returns empty progress for the empty string', () => {
    expect(parseProgress('')).toEqual(EMPTY);
  });

  it('returns empty progress for non-JSON garbage (never throws)', () => {
    expect(() => parseProgress('{not json')).not.toThrow();
    expect(parseProgress('{not json')).toEqual(EMPTY);
    expect(parseProgress('undefined')).toEqual(EMPTY);
  });

  it('returns empty progress for JSON of the wrong shape', () => {
    expect(parseProgress('[]')).toEqual(EMPTY); // array
    expect(parseProgress('[1,2,3]')).toEqual(EMPTY); // non-empty array
    expect(parseProgress('42')).toEqual(EMPTY); // number
    expect(parseProgress('null')).toEqual(EMPTY); // JSON null
    expect(parseProgress('true')).toEqual(EMPTY); // boolean
    expect(parseProgress('"oc-m90-v1"')).toEqual(EMPTY); // string
  });

  it('fills in missing keys on an empty object', () => {
    expect(parseProgress('{}')).toEqual(EMPTY);
  });

  it('drops wrong-typed days/missions containers', () => {
    expect(parseProgress('{"days": 5, "missions": "x"}')).toEqual(EMPTY);
    expect(parseProgress('{"days": [], "missions": null}')).toEqual(EMPTY);
    expect(parseProgress('{"days": [{"completedAt": "z"}]}')).toEqual(EMPTY); // array, not record
  });

  it('passes well-formed input through unchanged', () => {
    const good: M90Progress = {
      startedAt: '2026-07-01',
      lastVisitedDay: 3,
      days: { '1': day(), '2': day('2026-07-02T08:00:00.000Z') },
      missions: { 'm90-log-hunt': mission() },
    };
    expect(parseProgress(JSON.stringify(good))).toEqual(good);
  });

  it('keeps valid day entries and drops malformed ones', () => {
    const raw = JSON.stringify({
      days: {
        '1': day(), // valid — kept
        '2': { completedAt: 42 }, // wrong-typed completedAt — dropped
        '3': {}, // missing completedAt — dropped
        '4': null, // null entry — dropped
        '5': 'done', // non-object entry — dropped
        '6': ['x'], // array entry — dropped
      },
      missions: {},
    });
    expect(parseProgress(raw).days).toEqual({ '1': day() });
  });

  it('keeps valid mission entries and drops malformed ones', () => {
    const raw = JSON.stringify({
      days: {},
      missions: {
        good: mission(),
        'bad-completedAt': mission({ completedAt: 7 as unknown as string }),
        'bad-commands': mission({ commands: '12' as unknown as number }),
        'bad-hints': mission({ hints: null as unknown as number }),
        'bad-seconds': { completedAt: 'z', commands: 1, hints: 0 }, // missing seconds
        'not-an-object': 3,
      },
    });
    expect(parseProgress(raw).missions).toEqual({ good: mission() });
  });

  it('drops wrong-typed top-level scalars but keeps valid ones', () => {
    const raw = JSON.stringify({
      startedAt: 123, // wrong type — dropped
      lastVisitedDay: '7', // wrong type — dropped
      days: { '1': day() },
      missions: {},
    });
    const p = parseProgress(raw);
    expect(p.startedAt).toBeUndefined();
    expect(p.lastVisitedDay).toBeUndefined();
    expect(p.days).toEqual({ '1': day() });

    const good = parseProgress(JSON.stringify({ startedAt: '2026-07-01', lastVisitedDay: 2 }));
    expect(good.startedAt).toBe('2026-07-01');
    expect(good.lastVisitedDay).toBe(2);
  });

  it('drops non-finite lastVisitedDay', () => {
    // JSON cannot encode NaN/Infinity, but a caller could round-trip "1e999" → Infinity.
    expect(parseProgress('{"lastVisitedDay": 1e999}').lastVisitedDay).toBeUndefined();
  });

  it('drops "__proto__" keys and never hijacks the result prototype', () => {
    // Raw string on purpose: a JS object literal with a __proto__ key would set
    // the prototype instead of an own property, but JSON.parse defines it as an
    // own property — which is exactly the hostile input this guards against.
    const raw =
      '{"days": {"__proto__": {"completedAt": "2026-07-01T10:00:00.000Z"}, "1": {"completedAt": "2026-07-01T10:00:00.000Z"}},' +
      ' "missions": {"__proto__": {"completedAt": "z", "commands": 1, "hints": 0, "seconds": 5}}}';
    const p = parseProgress(raw);

    // Entry dropped on both sides, valid sibling kept.
    expect(Object.keys(p.days)).toEqual(['1']);
    expect(Object.keys(p.missions)).toEqual([]);
    expect(Object.prototype.hasOwnProperty.call(p.days, '__proto__')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(p.missions, '__proto__')).toBe(false);

    // Accumulators are null-prototype dictionaries — nothing to hijack.
    expect(Object.getPrototypeOf(p.days)).toBeNull();
    expect(Object.getPrototypeOf(p.missions)).toBeNull();

    // And the aggregate helpers ignore it.
    expect(doneCount(p)).toBe(1);
  });

  it('keeps unrelated day keys independent (partial salvage, not all-or-nothing)', () => {
    const raw = JSON.stringify({
      days: { '1': day(), '2': 'junk' },
      missions: { m1: mission(), m2: false },
    });
    const p = parseProgress(raw);
    expect(Object.keys(p.days)).toEqual(['1']);
    expect(Object.keys(p.missions)).toEqual(['m1']);
  });
});

describe('doneCount()', () => {
  it('is 0 for empty progress', () => {
    expect(doneCount({ days: {}, missions: {} })).toBe(0);
  });

  it('counts completed days', () => {
    expect(doneCount({ days: { '1': day(), '5': day(), '90': day() }, missions: {} })).toBe(3);
  });
});

describe('nextDay()', () => {
  const done = (...nums: number[]): M90Progress => ({
    days: Object.fromEntries(nums.map((n) => [String(n), day()])),
    missions: {},
  });

  it('returns the lowest live day when nothing is complete', () => {
    expect(nextDay(done(), [1, 2, 3])).toBe(1);
  });

  it('skips completed days', () => {
    expect(nextDay(done(1), [1, 2, 3])).toBe(2);
    expect(nextDay(done(1, 2), [1, 2, 3])).toBe(3);
  });

  it('returns null when every live day is done', () => {
    expect(nextDay(done(1, 2, 3), [1, 2, 3])).toBeNull();
  });

  it('returns null when there are no live days', () => {
    expect(nextDay(done(), [])).toBeNull();
  });

  it('handles unsorted live day lists', () => {
    expect(nextDay(done(1), [7, 3, 1, 5])).toBe(3);
  });

  it('handles non-contiguous live days', () => {
    expect(nextDay(done(1, 2), [1, 2, 5])).toBe(5);
  });

  it('does not mutate the liveDayNumbers argument', () => {
    const live = [7, 3, 1];
    nextDay(done(), live);
    expect(live).toEqual([7, 3, 1]);
  });
});

describe('resumeDay()', () => {
  const LIVE = Array.from({ length: 90 }, (_, i) => i + 1);
  const prog = (over: Partial<M90Progress> = {}, ...doneDays: number[]): M90Progress => ({
    days: Object.fromEntries(doneDays.map((n) => [String(n), day()])),
    missions: {},
    ...over,
  });

  it('falls back to nextDay when lastVisitedDay is unset', () => {
    expect(resumeDay(prog({}, 1, 2), LIVE)).toBe(3);
    expect(resumeDay(prog(), LIVE)).toBe(1);
  });

  it('resumes at the last visited day when it is still incomplete', () => {
    // A learner who jumped straight to Day 30 continues there, not at Day 1.
    expect(resumeDay(prog({ lastVisitedDay: 30 }), LIVE)).toBe(30);
  });

  it('advances past the last visited day once it is complete', () => {
    expect(resumeDay(prog({ lastVisitedDay: 30 }, 30), LIVE)).toBe(31);
    expect(resumeDay(prog({ lastVisitedDay: 30 }, 30, 31, 32), LIVE)).toBe(33);
  });

  it('falls back to the lowest incomplete day when everything from the anchor onward is done', () => {
    // Visited/finished the tail — circle back to the earlier gap.
    expect(resumeDay(prog({ lastVisitedDay: 89 }, 89, 90), LIVE)).toBe(1);
  });

  it('returns null when every live day is done', () => {
    const all = prog({ lastVisitedDay: 45 }, ...LIVE);
    expect(resumeDay(all, LIVE)).toBeNull();
  });

  it('ignores an anchor beyond the live range and falls back', () => {
    expect(resumeDay(prog({ lastVisitedDay: 200 }, 1), LIVE)).toBe(2);
  });

  it('handles unsorted live day lists and does not mutate them', () => {
    const live = [7, 3, 1, 5];
    expect(resumeDay(prog({ lastVisitedDay: 4 }), live)).toBe(5);
    expect(live).toEqual([7, 3, 1, 5]);
  });
});

describe('exportProgress() / importProgress()', () => {
  it('round-trips a full progress object', () => {
    const p: M90Progress = {
      startedAt: '2026-01-01T00:00:00.000Z',
      lastVisitedDay: 12,
      days: { '1': day(), '2': day('2026-01-02T00:00:00.000Z') },
      missions: { 'm90-log-hunt': mission() },
    };
    const code = exportProgress(p);
    expect(importProgress(code)).toEqual(p);
  });

  it('rejects an empty-progress code (nothing to restore — protects local progress)', () => {
    // A restore OVERWRITES the local blob, so a code that salvages to zero
    // progress (wrong paste, another tool's share code) must read as invalid
    // rather than silently wiping a learner's real progress.
    expect(importProgress(exportProgress(EMPTY))).toBeNull();
  });

  it('rejects a bare "{}" object code (the classic wrong-paste)', () => {
    expect(importProgress(exportProgressOf('{}'))).toBeNull();
  });

  it('rejects a foreign share-shaped object (e.g. an AlertLint share payload)', () => {
    expect(importProgress(exportProgressOf('{"rules":"a","test":"b"}'))).toBeNull();
  });

  it('accepts a code with only startedAt (still worth restoring)', () => {
    const p: M90Progress = { startedAt: '2026-01-01T00:00:00.000Z', days: {}, missions: {} };
    expect(importProgress(exportProgress(p))).toEqual(p);
  });

  it('produces a URL-safe code with no +, / or = characters', () => {
    const p: M90Progress = {
      days: Object.fromEntries(Array.from({ length: 40 }, (_, i) => [String(i + 1), day()])),
      missions: {},
    };
    expect(exportProgress(p)).not.toMatch(/[+/=]/);
  });

  it('tolerates surrounding whitespace on import (copy-paste noise)', () => {
    const p: M90Progress = { days: { '5': day() }, missions: {} };
    expect(importProgress(`  ${exportProgress(p)}\n`)).toEqual(p);
  });

  it('returns null for garbage / non-base64 input', () => {
    expect(importProgress('not a real code!!!')).toBeNull();
  });

  it('returns null for the empty string', () => {
    expect(importProgress('')).toBeNull();
  });

  it('returns null for a code that decodes to valid JSON but not an object', () => {
    // base64url of JSON.stringify(42) — decodes fine, but isn't a progress record.
    expect(importProgress(exportProgressOf('42'))).toBeNull();
  });

  it('salvages malformed sub-entries the same way parseProgress does', () => {
    const raw = JSON.stringify({ days: { '1': day(), '2': 'junk' }, missions: {} });
    const code = exportProgressOf(raw);
    expect(importProgress(code)).toEqual({ days: { '1': day() }, missions: {} });
  });

  it('drops out-of-program day keys, so a crafted code cannot inflate completion', () => {
    const raw = JSON.stringify({
      days: { '90': day(), '91': day(), '200': day(), '0': day(), '007': day(), abc: day() },
      missions: {},
    });
    const p = importProgress(exportProgressOf(raw));
    expect(p).not.toBeNull();
    expect(Object.keys(p!.days)).toEqual(['90']);
  });

  it('rejects a code with only a saved pace and no real progress (pace is not content)', () => {
    // A restore overwrites the local blob — a pace-only code (no days, no
    // missions, no startedAt) must still read as invalid, exactly like the
    // bare-EMPTY case above, or saving a pace before ever starting would
    // silently become "restorable" in a way that can wipe real progress.
    const raw = JSON.stringify({ days: {}, missions: {}, pace: { daysPerWeek: 5, startDate: '2026-01-01' } });
    expect(importProgress(exportProgressOf(raw))).toBeNull();
  });

  it('round-trips pace alongside real progress', () => {
    const p: M90Progress = {
      days: { '1': day() },
      missions: {},
      pace: { daysPerWeek: 5, startDate: '2026-01-01' },
    };
    expect(importProgress(exportProgress(p))).toEqual(p);
  });
});

describe('pace field salvage', () => {
  it('parseProgress keeps a well-formed pace', () => {
    const raw = JSON.stringify({ days: {}, missions: {}, pace: { daysPerWeek: 3, startDate: '2026-07-01' } });
    expect(parseProgress(raw).pace).toEqual({ daysPerWeek: 3, startDate: '2026-07-01' });
  });

  it('drops pace when absent', () => {
    expect(parseProgress(JSON.stringify({ days: {}, missions: {} })).pace).toBeUndefined();
  });

  it.each([0, 8, 1.5, -1, '5', null])('drops pace with an invalid daysPerWeek: %p', (bad) => {
    const raw = JSON.stringify({ days: {}, missions: {}, pace: { daysPerWeek: bad, startDate: '2026-07-01' } });
    expect(parseProgress(raw).pace).toBeUndefined();
  });

  it.each(['2026-7-1', '2026/07/01', 'not-a-date', 20260701, ''])(
    'drops pace with an invalid startDate: %p',
    (bad) => {
      const raw = JSON.stringify({ days: {}, missions: {}, pace: { daysPerWeek: 5, startDate: bad } });
      expect(parseProgress(raw).pace).toBeUndefined();
    },
  );

  it('drops a non-object pace value', () => {
    expect(parseProgress(JSON.stringify({ days: {}, missions: {}, pace: 'weekly' })).pace).toBeUndefined();
  });
});

describe('day-key and lastVisitedDay clamping', () => {
  it('parseProgress drops day keys outside 1–90 and non-canonical integers', () => {
    const raw = JSON.stringify({
      days: { '1': day(), '90': day(), '91': day(), '0': day(), '-3': day(), '07': day(), '1.5': day() },
      missions: {},
    });
    expect(Object.keys(parseProgress(raw).days).sort()).toEqual(['1', '90']);
  });

  it('parseProgress drops an out-of-range or non-integer lastVisitedDay', () => {
    expect(parseProgress(JSON.stringify({ days: {}, missions: {}, lastVisitedDay: 999 })).lastVisitedDay).toBeUndefined();
    expect(parseProgress(JSON.stringify({ days: {}, missions: {}, lastVisitedDay: 0 })).lastVisitedDay).toBeUndefined();
    expect(parseProgress(JSON.stringify({ days: {}, missions: {}, lastVisitedDay: 4.5 })).lastVisitedDay).toBeUndefined();
    expect(parseProgress(JSON.stringify({ days: {}, missions: {}, lastVisitedDay: 42 })).lastVisitedDay).toBe(42);
  });
});

describe('PROGRESS_KEY', () => {
  it('is the versioned localStorage key every page script reads/writes', () => {
    expect(PROGRESS_KEY).toBe('oc-m90-v1');
  });
});

describe('markDayDone()', () => {
  const NOW = '2026-07-10T12:00:00.000Z';

  it('adds a completedAt entry for the day', () => {
    const p: M90Progress = { days: {}, missions: {} };
    const next = markDayDone(p, 5, NOW);
    expect(next.days).toEqual({ '5': { completedAt: NOW } });
  });

  it('stamps startedAt only when absent (first-ever completion)', () => {
    const p: M90Progress = { days: {}, missions: {} };
    const next = markDayDone(p, 1, NOW);
    expect(next.startedAt).toBe(NOW);
  });

  it('does not restamp startedAt on a later completion', () => {
    const p: M90Progress = { startedAt: '2026-01-01T00:00:00.000Z', days: {}, missions: {} };
    const next = markDayDone(p, 2, NOW);
    expect(next.startedAt).toBe('2026-01-01T00:00:00.000Z');
  });

  it('overwrites an existing entry for the same day (re-marking is idempotent)', () => {
    const p: M90Progress = { days: { '5': day('2026-01-01T00:00:00.000Z') }, missions: {} };
    const next = markDayDone(p, 5, NOW);
    expect(next.days['5']).toEqual({ completedAt: NOW });
  });

  it('never mutates the input', () => {
    const p: M90Progress = { days: {}, missions: {} };
    markDayDone(p, 5, NOW);
    expect(p.days).toEqual({});
  });

  it('leaves other days and missions untouched', () => {
    const p: M90Progress = { days: { '1': day() }, missions: { m: mission() } };
    const next = markDayDone(p, 2, NOW);
    expect(next.days['1']).toEqual(day());
    expect(next.missions['m']).toEqual(mission());
  });
});

describe('unmarkDay()', () => {
  it('removes the day entry', () => {
    const p: M90Progress = { days: { '5': day(), '6': day() }, missions: {} };
    const next = unmarkDay(p, 5);
    expect(Object.keys(next.days)).toEqual(['6']);
  });

  it('never touches startedAt', () => {
    const p: M90Progress = { startedAt: '2026-01-01T00:00:00.000Z', days: { '5': day() }, missions: {} };
    const next = unmarkDay(p, 5);
    expect(next.startedAt).toBe('2026-01-01T00:00:00.000Z');
  });

  it('is a no-op for a day that was never marked', () => {
    const p: M90Progress = { days: { '5': day() }, missions: {} };
    const next = unmarkDay(p, 6);
    expect(next.days).toEqual({ '5': day() });
  });

  it('never mutates the input', () => {
    const p: M90Progress = { days: { '5': day() }, missions: {} };
    unmarkDay(p, 5);
    expect(p.days).toEqual({ '5': day() });
  });
});

describe('markDaysDone()', () => {
  const NOW = '2026-07-10T12:00:00.000Z';

  it('marks every day in the inclusive range', () => {
    const p: M90Progress = { days: {}, missions: {} };
    const next = markDaysDone(p, [21, 24], NOW);
    expect(Object.keys(next.days).sort()).toEqual(['21', '22', '23', '24']);
  });

  it('never overwrites an already-completed day inside the range', () => {
    const p: M90Progress = { days: { '22': day('2026-01-01T00:00:00.000Z') }, missions: {} };
    const next = markDaysDone(p, [21, 24], NOW);
    expect(next.days['22']).toEqual(day('2026-01-01T00:00:00.000Z'));
    expect(next.days['21']).toEqual(day(NOW));
  });

  it('stamps startedAt only when absent', () => {
    const p: M90Progress = { days: {}, missions: {} };
    expect(markDaysDone(p, [1, 3], NOW).startedAt).toBe(NOW);

    const started: M90Progress = { startedAt: '2026-01-01T00:00:00.000Z', days: {}, missions: {} };
    expect(markDaysDone(started, [1, 3], NOW).startedAt).toBe('2026-01-01T00:00:00.000Z');
  });

  it('clamps the range to 1–90', () => {
    const p: M90Progress = { days: {}, missions: {} };
    const next = markDaysDone(p, [88, 95], NOW);
    expect(Object.keys(next.days).sort()).toEqual(['88', '89', '90']);
  });

  it('handles a single-day range', () => {
    const p: M90Progress = { days: {}, missions: {} };
    const next = markDaysDone(p, [7, 7], NOW);
    expect(Object.keys(next.days)).toEqual(['7']);
  });

  it('never mutates the input', () => {
    const p: M90Progress = { days: {}, missions: {} };
    markDaysDone(p, [21, 24], NOW);
    expect(p.days).toEqual({});
  });
});

describe('unmarkDays()', () => {
  it('removes every day entry in the inclusive range', () => {
    const p: M90Progress = { days: { '21': day(), '22': day(), '30': day() }, missions: {} };
    const next = unmarkDays(p, [21, 24]);
    expect(Object.keys(next.days)).toEqual(['30']);
  });

  it('never touches startedAt', () => {
    const p: M90Progress = {
      startedAt: '2026-01-01T00:00:00.000Z',
      days: { '21': day() },
      missions: {},
    };
    expect(unmarkDays(p, [21, 24]).startedAt).toBe('2026-01-01T00:00:00.000Z');
  });

  it('is a no-op when nothing in the range was marked', () => {
    const p: M90Progress = { days: { '5': day() }, missions: {} };
    const next = unmarkDays(p, [21, 24]);
    expect(next.days).toEqual({ '5': day() });
  });

  it('never mutates the input', () => {
    const p: M90Progress = { days: { '21': day() }, missions: {} };
    unmarkDays(p, [21, 24]);
    expect(p.days).toEqual({ '21': day() });
  });
});

describe('setPace()', () => {
  it('sets the pace field', () => {
    const p: M90Progress = { days: {}, missions: {} };
    const next = setPace(p, { daysPerWeek: 5, startDate: '2026-07-10' });
    expect(next.pace).toEqual({ daysPerWeek: 5, startDate: '2026-07-10' });
  });

  it('replaces an existing pace', () => {
    const p: M90Progress = { days: {}, missions: {}, pace: { daysPerWeek: 3, startDate: '2026-01-01' } };
    const next = setPace(p, { daysPerWeek: 7, startDate: '2026-07-10' });
    expect(next.pace).toEqual({ daysPerWeek: 7, startDate: '2026-07-10' });
  });

  it('leaves days/missions/startedAt untouched', () => {
    const p: M90Progress = { startedAt: '2026-01-01T00:00:00.000Z', days: { '1': day() }, missions: {} };
    const next = setPace(p, { daysPerWeek: 5, startDate: '2026-07-10' });
    expect(next.days).toEqual({ '1': day() });
    expect(next.startedAt).toBe('2026-01-01T00:00:00.000Z');
  });

  it('never mutates the input', () => {
    const p: M90Progress = { days: {}, missions: {} };
    setPace(p, { daysPerWeek: 5, startDate: '2026-07-10' });
    expect(p.pace).toBeUndefined();
  });
});

describe('markPhaseDone()', () => {
  const NOW = '2026-07-10T12:00:00.000Z';

  it('marks every day in the phase range', () => {
    const p: M90Progress = { days: {}, missions: {} };
    const next = markPhaseDone(p, [21, 24], NOW);
    expect(Object.keys(next.days).sort()).toEqual(['21', '22', '23', '24']);
  });

  it('advances lastVisitedDay to just past the phase', () => {
    const p: M90Progress = { days: {}, missions: {} };
    const next = markPhaseDone(p, [21, 45], NOW);
    expect(next.lastVisitedDay).toBe(46);
  });

  it('clamps lastVisitedDay to 90 for the final phase', () => {
    const p: M90Progress = { days: {}, missions: {} };
    const next = markPhaseDone(p, [86, 90], NOW);
    expect(next.lastVisitedDay).toBe(90);
  });

  it('never rewinds lastVisitedDay if already further ahead', () => {
    const p: M90Progress = { lastVisitedDay: 60, days: {}, missions: {} };
    const next = markPhaseDone(p, [21, 45], NOW);
    expect(next.lastVisitedDay).toBe(60);
  });

  it('advances lastVisitedDay when unset, even for an early phase', () => {
    const p: M90Progress = { days: {}, missions: {} };
    const next = markPhaseDone(p, [1, 20], NOW);
    expect(next.lastVisitedDay).toBe(21);
  });

  it('never overwrites an already-completed day inside the phase', () => {
    const p: M90Progress = { days: { '22': day('2026-01-01T00:00:00.000Z') }, missions: {} };
    const next = markPhaseDone(p, [21, 24], NOW);
    expect(next.days['22']).toEqual(day('2026-01-01T00:00:00.000Z'));
  });

  it('never mutates the input', () => {
    const p: M90Progress = { days: {}, missions: {} };
    markPhaseDone(p, [21, 24], NOW);
    expect(p.days).toEqual({});
    expect(p.lastVisitedDay).toBeUndefined();
  });
});

describe('recordMissionRun()', () => {
  const NOW = '2026-07-10T12:00:00.000Z';

  it('records the first run for a mission', () => {
    const p: M90Progress = { days: {}, missions: {} };
    const next = recordMissionRun(p, 'm1', { commands: 12, hints: 1, seconds: 340 }, NOW);
    expect(next.missions['m1']).toEqual({ completedAt: NOW, commands: 12, hints: 1, seconds: 340 });
  });

  it('overwrites with a strictly better run (fewer commands)', () => {
    const p: M90Progress = { days: {}, missions: { m1: mission({ commands: 20, hints: 2 }) } };
    const next = recordMissionRun(p, 'm1', { commands: 10, hints: 3, seconds: 100 }, NOW);
    expect(next.missions['m1']).toEqual({ completedAt: NOW, commands: 10, hints: 3, seconds: 100 });
  });

  it('keeps the existing run when the new one has more commands', () => {
    const existing = mission({ commands: 10, hints: 1 });
    const p: M90Progress = { days: {}, missions: { m1: existing } };
    const next = recordMissionRun(p, 'm1', { commands: 20, hints: 0, seconds: 50 }, NOW);
    expect(next.missions['m1']).toEqual(existing);
  });

  it('tie-breaks on hints when commands are equal: overwrites with fewer hints', () => {
    const existing = mission({ commands: 10, hints: 3 });
    const p: M90Progress = { days: {}, missions: { m1: existing } };
    const next = recordMissionRun(p, 'm1', { commands: 10, hints: 1, seconds: 50 }, NOW);
    expect(next.missions['m1']).toEqual({ completedAt: NOW, commands: 10, hints: 1, seconds: 50 });
  });

  it('keeps the existing run on an exact tie (commands and hints equal)', () => {
    const existing = mission({ commands: 10, hints: 1 });
    const p: M90Progress = { days: {}, missions: { m1: existing } };
    const next = recordMissionRun(p, 'm1', { commands: 10, hints: 1, seconds: 999 }, NOW);
    expect(next.missions['m1']).toEqual(existing);
  });

  it('stamps startedAt if absent, even when the existing run is kept', () => {
    const existing = mission({ commands: 5, hints: 0 });
    const p: M90Progress = { days: {}, missions: { m1: existing } };
    const next = recordMissionRun(p, 'm1', { commands: 99, hints: 9, seconds: 1 }, NOW);
    expect(next.startedAt).toBe(NOW);
  });

  it('never mutates the input', () => {
    const p: M90Progress = { days: {}, missions: {} };
    recordMissionRun(p, 'm1', { commands: 1, hints: 0, seconds: 1 }, NOW);
    expect(p.missions).toEqual({});
  });

  it('leaves other missions and days untouched', () => {
    const p: M90Progress = { days: { '1': day() }, missions: { other: mission() } };
    const next = recordMissionRun(p, 'm1', { commands: 1, hints: 0, seconds: 1 }, NOW);
    expect(next.days['1']).toEqual(day());
    expect(next.missions['other']).toEqual(mission());
  });
});

describe('phaseProgress()', () => {
  it('counts completion within an inclusive range', () => {
    const p: M90Progress = {
      days: { '21': day(), '30': day(), '45': day() },
      missions: {},
    };
    expect(phaseProgress(p, [21, 45])).toEqual({ done: 3, total: 25 });
  });

  it('ignores completed days outside the range', () => {
    const p: M90Progress = {
      days: { '1': day(), '20': day(), '21': day(), '46': day() },
      missions: {},
    };
    expect(phaseProgress(p, [21, 45])).toEqual({ done: 1, total: 25 });
  });

  it('is zero-done for empty progress', () => {
    expect(phaseProgress({ days: {}, missions: {} }, [1, 20])).toEqual({ done: 0, total: 20 });
  });

  it('handles a single-day range', () => {
    const p: M90Progress = { days: { '7': day() }, missions: {} };
    expect(phaseProgress(p, [7, 7])).toEqual({ done: 1, total: 1 });
  });
});

describe('streak()', () => {
  const TODAY = '2026-07-05';
  const YESTERDAY = '2026-07-04';

  it('returns 0 for empty dates', () => {
    expect(streak([], TODAY)).toBe(0);
  });

  it('returns 0 when no date is today or yesterday', () => {
    expect(streak(['2026-07-01', '2026-07-02'], TODAY)).toBe(0);
  });

  it('does not continue across a gap before today (today + 3-days-ago → 1)', () => {
    expect(streak([TODAY, '2026-07-02'], TODAY)).toBe(1);
  });

  it('counts today + yesterday as 2', () => {
    expect(streak([TODAY, YESTERDAY], TODAY)).toBe(2);
  });

  it('counts ONLY yesterday as 1 (still continuable)', () => {
    expect(streak([YESTERDAY], TODAY)).toBe(1);
  });

  it('anchors at yesterday and walks back when today is absent', () => {
    expect(streak([YESTERDAY, '2026-07-03', '2026-07-02'], TODAY)).toBe(3);
  });

  it('handles unsorted input', () => {
    expect(streak(['2026-07-03', TODAY, YESTERDAY], TODAY)).toBe(3);
  });

  it('ignores duplicate dates', () => {
    expect(streak([TODAY, TODAY, YESTERDAY, YESTERDAY], TODAY)).toBe(2);
  });

  it('crosses month boundaries with plain calendar math', () => {
    expect(streak(['2026-03-01', '2026-02-28', '2026-02-27'], '2026-03-01')).toBe(3);
  });

  it('crosses a leap-day boundary', () => {
    expect(streak(['2024-03-01', '2024-02-29', '2024-02-28'], '2024-03-01')).toBe(3);
  });

  it('stops at the first gap when walking back', () => {
    // 07-05, 07-04 consecutive; 07-02 leaves a hole at 07-03.
    expect(streak([TODAY, YESTERDAY, '2026-07-02'], TODAY)).toBe(2);
  });

  it('returns 0 for a malformed today instead of hanging', () => {
    // Both inputs must map to NaN to reproduce the hang: a NaN in the dates Set
    // matches a NaN anchor under SameValueZero and NaN-- never changes, so
    // without the guard the walk-back loop spins forever.
    expect(streak(['not-a-date'], 'not-a-date')).toBe(0);
  });
});

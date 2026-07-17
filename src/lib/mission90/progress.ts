/**
 * Mission 90 Days — pure progress/streak helpers.
 *
 * This module owns the versioned localStorage schema (key `oc-m90-v1`) and its
 * defensive parsing, but performs NO I/O itself: no DOM, no localStorage. Page
 * scripts read/write storage and hand the raw string to `parseProgress`.
 *
 * All functions are pure. `streak` works on local calendar dates (`YYYY-MM-DD`
 * strings) with plain day arithmetic — inputs are already local dates, so no
 * timezone conversion is ever applied.
 */

import { base64UrlEncode, base64UrlDecode } from '../codec';

/**
 * The versioned localStorage key this module's schema lives under. Every page
 * script that reads or writes Mission-90 progress imports this rather than
 * re-declaring the string literal — a schema version bump (e.g. `oc-m90-v2`)
 * then only needs to change here.
 */
export const PROGRESS_KEY = 'oc-m90-v1';

/** Shape stored under the `oc-m90-v1` localStorage key. */
export interface M90Progress {
  /** ISO date the user first started the mission. */
  startedAt?: string;
  /** Last day page the user visited (1–90). */
  lastVisitedDay?: number;
  /** Completed days, keyed by day number as a string (e.g. "1"). */
  days: Record<string, { completedAt: string }>;
  /** Completed missions, keyed by mission id. */
  missions: Record<string, { completedAt: string; commands: number; hints: number; seconds: number }>;
}

/** True for plain-object JSON values (not null, not arrays). */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Highest day number the v1 schema accepts. The `oc-m90-v1` blob belongs to
 * the fixed 90-day program, and day keys outside 1–90 can only come from
 * corruption or a crafted import code — without this clamp, 90 junk keys
 * would flip doneCount()/the completion card to "program complete".
 */
const MAX_DAY = 90;

/** True for a canonical day key: "1"–"90", integer, no leading zeros. */
function isDayKey(key: string): boolean {
  if (!/^[1-9][0-9]?$/.test(key)) return false;
  return Number(key) <= MAX_DAY;
}

/** Salvage the well-formed `{ completedAt }` day entries; drop the rest. */
function parseDays(value: unknown): M90Progress['days'] {
  // Null-prototype accumulator: hostile keys can never reach Object.prototype.
  const days: M90Progress['days'] = Object.create(null);
  if (!isRecord(value)) return days;
  for (const [key, entry] of Object.entries(value)) {
    if (!isDayKey(key)) continue; // out-of-program or malformed key — drop it
    if (isRecord(entry) && typeof entry.completedAt === 'string') {
      days[key] = { completedAt: entry.completedAt };
    }
  }
  return days;
}

/** Salvage the well-formed mission entries; drop the rest. */
function parseMissions(value: unknown): M90Progress['missions'] {
  // Null-prototype accumulator: hostile keys can never reach Object.prototype.
  const missions: M90Progress['missions'] = Object.create(null);
  if (!isRecord(value)) return missions;
  for (const [key, entry] of Object.entries(value)) {
    if (key === '__proto__') continue; // prototype-shaped key — always malformed, drop it
    if (
      isRecord(entry) &&
      typeof entry.completedAt === 'string' &&
      typeof entry.commands === 'number' &&
      Number.isFinite(entry.commands) &&
      typeof entry.hints === 'number' &&
      Number.isFinite(entry.hints) &&
      typeof entry.seconds === 'number' &&
      Number.isFinite(entry.seconds)
    ) {
      missions[key] = {
        completedAt: entry.completedAt,
        commands: entry.commands,
        hints: entry.hints,
        seconds: entry.seconds,
      };
    }
  }
  return missions;
}

/** Build a valid M90Progress from an already-parsed JSON record. Shared by
 *  `parseProgress` (raw string → record → this) and `importProgress` (which
 *  already needs the parsed record for its own isRecord check, so it calls
 *  this directly instead of re-parsing the JSON a second time). */
function fromRecord(parsed: Record<string, unknown>): M90Progress {
  const progress: M90Progress = {
    days: parseDays(parsed.days),
    missions: parseMissions(parsed.missions),
  };
  if (typeof parsed.startedAt === 'string') progress.startedAt = parsed.startedAt;
  if (
    typeof parsed.lastVisitedDay === 'number' &&
    Number.isInteger(parsed.lastVisitedDay) &&
    parsed.lastVisitedDay >= 1 &&
    parsed.lastVisitedDay <= MAX_DAY
  ) {
    progress.lastVisitedDay = parsed.lastVisitedDay;
  }
  return progress;
}

/**
 * Defensively parse the raw localStorage string. Never throws: null, empty
 * strings, non-JSON garbage and wrong-shaped JSON all yield a valid empty
 * progress object; malformed sub-entries are dropped while valid ones are kept.
 */
export function parseProgress(raw: string | null): M90Progress {
  const empty: M90Progress = { days: {}, missions: {} };
  if (raw === null || raw === '') return empty;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return empty;
  }
  if (!isRecord(parsed)) return empty;
  return fromRecord(parsed);
}

/**
 * Serialize progress into a portable, copy-pasteable code — the same
 * base64url codec the AlertLint share links use. Lets a learner move
 * progress across browsers/devices without any backend or account.
 */
export function exportProgress(p: M90Progress): string {
  return base64UrlEncode(JSON.stringify(p));
}

/**
 * Parse a progress export code back into a validated M90Progress, or null
 * when the code is invalid (bad base64, non-JSON, JSON that isn't an object)
 * OR salvages to zero progress. The zero-progress rejection is deliberate:
 * restoring overwrites the local blob, and a structurally-valid object with
 * nothing in it is far more likely a wrong paste (e.g. another tool's share
 * code, which uses the same base64url codec) than a genuine backup — treating
 * it as invalid protects a learner's real progress from a silent wipe.
 */
export function importProgress(code: string): M90Progress | null {
  const trimmed = code.trim();
  if (!trimmed) return null;
  let json: string;
  try {
    json = base64UrlDecode(trimmed);
  } catch {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }
  if (!isRecord(parsed)) return null;
  const progress = fromRecord(parsed);
  if (
    doneCount(progress) === 0 &&
    Object.keys(progress.missions).length === 0 &&
    !progress.startedAt
  ) {
    return null;
  }
  return progress;
}

/** Count of completed days. */
export function doneCount(p: M90Progress): number {
  return Object.keys(p.days).length;
}

/**
 * Lowest live day not yet completed, or null when every live day is done.
 * `liveDayNumbers` may be unsorted; it is never mutated.
 */
export function nextDay(p: M90Progress, liveDayNumbers: number[]): number | null {
  const sorted = [...liveDayNumbers].sort((a, b) => a - b);
  for (const n of sorted) {
    if (!Object.prototype.hasOwnProperty.call(p.days, String(n))) return n;
  }
  return null;
}

/**
 * The day the learner should continue with. Unlike `nextDay` (lowest incomplete
 * overall), this respects where they actually are: the first incomplete live
 * day at or after `lastVisitedDay`, so a learner who jumped to Day 30 is not
 * sent back to Day 1. Falls back to `nextDay` when the anchor is unset or
 * everything from it onward is done; null when every live day is complete.
 */
export function resumeDay(p: M90Progress, liveDayNumbers: number[]): number | null {
  const sorted = [...liveDayNumbers].sort((a, b) => a - b);
  const anchor = p.lastVisitedDay;
  if (typeof anchor === 'number') {
    for (const n of sorted) {
      if (n >= anchor && !Object.prototype.hasOwnProperty.call(p.days, String(n))) return n;
    }
  }
  // Fall back to the lowest incomplete day overall — inlined over the same
  // `sorted` array rather than calling nextDay() (which would sort again).
  for (const n of sorted) {
    if (!Object.prototype.hasOwnProperty.call(p.days, String(n))) return n;
  }
  return null;
}

/**
 * Mark a day complete, returning a new M90Progress (never mutates `p`).
 * Stamps `startedAt` to `nowIso` only if the learner has never completed
 * anything before — re-marking an already-done day (or marking a later one
 * first) never overwrites the original start date. Re-marking the SAME day
 * is idempotent: its `completedAt` is refreshed to `nowIso`.
 */
export function markDayDone(p: M90Progress, day: number, nowIso: string): M90Progress {
  const days: M90Progress['days'] = Object.create(null);
  Object.assign(days, p.days, { [String(day)]: { completedAt: nowIso } });
  return {
    ...p,
    days,
    startedAt: p.startedAt ?? nowIso,
  };
}

/** Remove a day's completion, returning a new M90Progress (never mutates
 *  `p`). Never touches `startedAt` — un-completing a day doesn't erase when
 *  the learner started. */
export function unmarkDay(p: M90Progress, day: number): M90Progress {
  const days: M90Progress['days'] = Object.create(null);
  Object.assign(days, p.days);
  delete days[String(day)];
  return { ...p, days };
}

/**
 * Record a mission run, keeping the best of the existing and new runs
 * (fewer commands wins; equal commands falls through to fewer hints; an
 * exact tie keeps the existing run). Returns a new M90Progress (never
 * mutates `p`). Stamps `startedAt` if absent even when the existing run is
 * kept — completing ANY mission counts as having started the program.
 */
export function recordMissionRun(
  p: M90Progress,
  id: string,
  run: { commands: number; hints: number; seconds: number },
  nowIso: string,
): M90Progress {
  const existing = p.missions[id];
  const fresh = { completedAt: nowIso, ...run };
  const keepExisting =
    existing !== undefined &&
    (existing.commands < run.commands ||
      (existing.commands === run.commands && existing.hints <= run.hints));
  const missions: M90Progress['missions'] = Object.create(null);
  Object.assign(missions, p.missions, { [id]: keepExisting ? existing : fresh });
  return {
    ...p,
    missions,
    startedAt: p.startedAt ?? nowIso,
  };
}

/** Completion within an inclusive day range, e.g. [21, 45] → { done: 3, total: 25 }. */
export function phaseProgress(p: M90Progress, range: [number, number]): { done: number; total: number } {
  const [lo, hi] = range;
  let done = 0;
  for (let n = lo; n <= hi; n++) {
    if (Object.prototype.hasOwnProperty.call(p.days, String(n))) done++;
  }
  return { done, total: hi - lo + 1 };
}

/** Map a local `YYYY-MM-DD` string to an absolute day index (pure calendar math). */
function dayIndex(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  // Date.UTC is used purely as calendar arithmetic on the given Y/M/D — the
  // input is already a local calendar day, so no timezone conversion happens.
  return Date.UTC(y, m - 1, d) / 86_400_000;
}

/**
 * Count of consecutive local calendar days ending at `today` or `yesterday`.
 * `dates` may be unsorted and may contain duplicates. Returns 0 when neither
 * today nor yesterday is present (a gap breaks the streak).
 */
export function streak(dates: string[], today: string): number {
  if (dates.length === 0) return 0;
  const seen = new Set(dates.map(dayIndex));
  const todayIdx = dayIndex(today);
  // NaN guard: Set.has(NaN) matches under SameValueZero and NaN-- never
  // changes, so a malformed `today` would otherwise spin the walk-back forever.
  if (Number.isNaN(todayIdx)) return 0;

  let cursor: number;
  if (seen.has(todayIdx)) cursor = todayIdx;
  else if (seen.has(todayIdx - 1)) cursor = todayIdx - 1;
  else return 0;

  let count = 0;
  while (seen.has(cursor)) {
    count++;
    cursor--;
  }
  return count;
}

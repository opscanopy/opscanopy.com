/**
 * Practice Tests — pure progress helpers.
 *
 * This module owns the versioned localStorage schema (key `oc-tests-v1`) and
 * its defensive parsing, but performs NO I/O itself: no DOM, no localStorage.
 * Page scripts read/write storage and hand the raw string to `parseProgress`.
 *
 * All functions are pure. Pass state is DERIVED, not stored: only `bestPct` and
 * `attempts` persist, and pass/fail is computed at read time via `didPass`
 * against the current `passThreshold` — so a later threshold change can never
 * leave a stale flag behind. Mirrors the defensive-parse + immutability style
 * of src/lib/mission90/progress.ts.
 */

/**
 * The versioned localStorage key this module's schema lives under. Every page
 * script that reads or writes Practice-Tests progress imports this rather than
 * re-declaring the string literal — a schema version bump (e.g. `oc-tests-v2`)
 * then only needs to change here.
 */
export const PROGRESS_KEY = 'oc-tests-v1';

/** Per-test best-score record. Pass state is NOT stored (see module doc). */
export interface TestAttempt {
  /** Best score seen, 0–100 integer. */
  bestPct: number;
  /** Positive integer count of completed attempts. */
  attempts: number;
  /** ISO timestamp of the most recent attempt. */
  lastAttemptAt: string;
}

/** Shape stored under the `oc-tests-v1` localStorage key. */
export interface TestsProgress {
  /** Keyed by `${categorySlug}/${slug}` (see data/tests.ts testKey). */
  tests: Record<string, TestAttempt>;
}

/** True for plain-object JSON values (not null, not arrays). */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** True for a finite integer bestPct within the 0–100 range. */
function isBestPct(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= 100
  );
}

/** True for a finite positive integer attempts count. */
function isAttempts(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1;
}

/**
 * Salvage the well-formed per-test attempt entries; drop the rest. Uses a
 * null-prototype accumulator so hostile keys (`__proto__`, `prototype`,
 * `constructor`) can never reach Object.prototype.
 */
function parseTests(value: unknown): TestsProgress['tests'] {
  const tests: TestsProgress['tests'] = Object.create(null);
  if (!isRecord(value)) return tests;
  for (const [key, entry] of Object.entries(value)) {
    // Prototype-shaped keys are always malformed — drop them.
    if (key === '__proto__' || key === 'prototype' || key === 'constructor') continue;
    if (
      isRecord(entry) &&
      isBestPct(entry.bestPct) &&
      isAttempts(entry.attempts) &&
      typeof entry.lastAttemptAt === 'string'
    ) {
      tests[key] = {
        bestPct: entry.bestPct,
        attempts: entry.attempts,
        lastAttemptAt: entry.lastAttemptAt,
      };
    }
  }
  return tests;
}

/**
 * Defensively parse the raw localStorage string. Never throws: null, empty
 * strings, non-JSON garbage and wrong-shaped JSON (arrays, scalars) all yield
 * a valid empty progress object; malformed sub-entries are dropped while valid
 * ones are kept.
 */
export function parseProgress(raw: string | null): TestsProgress {
  // Every return path yields a null-prototype tests map (parseTests always
  // starts from Object.create(null)), so the keyed map can never carry an
  // Object.prototype — including the empty/fallback paths below.
  const empty = (): TestsProgress => ({ tests: parseTests(undefined) });
  if (raw === null || raw === '') return empty();

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return empty();
  }
  if (!isRecord(parsed)) return empty();
  return { tests: parseTests(parsed.tests) };
}

/** The stored attempt for a test key, or undefined when none exists. */
export function bestFor(p: TestsProgress, key: string): TestAttempt | undefined {
  return Object.prototype.hasOwnProperty.call(p.tests, key) ? p.tests[key] : undefined;
}

/** Pure pass derivation used by pages/runner at read time. */
export function didPass(bestPct: number, passThreshold: number): boolean {
  return bestPct >= passThreshold;
}

/**
 * Record a completed attempt, returning a new TestsProgress (never mutates
 * `p`). Increments the attempt count, keeps the higher of the existing and new
 * `bestPct`, and stamps `lastAttemptAt` to `nowIso` on every call.
 */
export function recordAttempt(
  p: TestsProgress,
  key: string,
  scorePct: number,
  nowIso: string,
): TestsProgress {
  const existing = bestFor(p, key);
  const attempt: TestAttempt = {
    bestPct: existing ? Math.max(existing.bestPct, scorePct) : scorePct,
    attempts: (existing?.attempts ?? 0) + 1,
    lastAttemptAt: nowIso,
  };
  const tests: TestsProgress['tests'] = Object.create(null);
  Object.assign(tests, p.tests, { [key]: attempt });
  return { ...p, tests };
}

/**
 * Remove a test's stored attempt, returning a new TestsProgress (never mutates
 * `p`). Unknown keys are a no-op.
 */
export function resetTest(p: TestsProgress, key: string): TestsProgress {
  const tests: TestsProgress['tests'] = Object.create(null);
  Object.assign(tests, p.tests);
  delete tests[key];
  return { ...p, tests };
}

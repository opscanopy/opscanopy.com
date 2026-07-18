/**
 * Cron Expression Tester — Verify-the-AI engine. Claims arrive as rows, each
 * one of three kinds — "fires at", "does not fire at", or "next run after" —
 * checked against the cron expression via the additive `matchesAt()` export.
 * The "next run after" search is a SEPARATE minute-by-minute scan over
 * `matchesAt()` (not a reuse of engine.ts's private search), so this engine
 * independently corroborates `nextRuns()` rather than trusting the same code
 * path. Never throws.
 */
import { explain, matchesAt } from './engine';
import { invalidBase, summarize, type ClaimCheck, type VerifyResult } from '../verify-shared';

export type CronClaimKind = 'fires-at' | 'does-not-fire-at' | 'next-run-after';

export interface CronClaimRow {
  kind: CronClaimKind;
  /** A parseable local date-time string, e.g. "2026-01-08T00:00". */
  when: string;
  /** Only used when kind === 'next-run-after': the AI's claimed next fire time. */
  claimedNext?: string;
}

/** Generous search horizon matching engine.ts's own bound. */
const MAX_ITERATIONS = 5 * 366 * 24 * 60;

/**
 * A bare "YYYY-MM-DD" is spec-defined as UTC midnight by `Date.parse`, but
 * every other accepted form ("...T00:00") is local time, and cron itself
 * matches in local time — so a date-only claim must be normalized to local
 * midnight first, or its verdict silently depends on the reader's timezone.
 */
function parseLocal(s: string): Date | null {
  const trimmed = s.trim();
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? `${trimmed}T00:00` : trimmed;
  const t = Date.parse(normalized);
  return Number.isNaN(t) ? null : new Date(t);
}

/** Zero-pad a number to two digits. */
function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** Format a Date as the local "YYYY-MM-DDTHH:mm" shape claims are given in —
 *  NOT `.toISOString()`, which is UTC and would show a "matching" pair of
 *  times that read hours apart from the claim in any non-UTC timezone. */
function formatLocalMinute(d: Date): string {
  return (
    `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}` +
    `T${pad2(d.getHours())}:${pad2(d.getMinutes())}`
  );
}

function floorToMinute(d: Date): Date {
  const c = new Date(d.getTime());
  c.setSeconds(0, 0);
  return c;
}

/** Scan forward minute-by-minute from `from` (exclusive) for the next fire time. */
function findNextFireAfter(expr: string, from: Date): Date | null {
  const cursor = floorToMinute(from);
  cursor.setMinutes(cursor.getMinutes() + 1);
  for (let i = 0; i < MAX_ITERATIONS; i++) {
    if (matchesAt(expr, cursor)) return new Date(cursor.getTime());
    cursor.setMinutes(cursor.getMinutes() + 1);
  }
  return null;
}

/** When both day-of-month and day-of-week are restricted, a mismatch is very
 *  often the Vixie OR-rule trap (an AI assuming AND instead of OR). */
function orRuleNote(expr: string): string | undefined {
  const info = explain(expr);
  if (!info.valid) return undefined;
  const domRestricted = info.fields.dayOfMonth.trim() !== '*';
  const dowRestricted = info.fields.dayOfWeek.trim() !== '*';
  if (domRestricted && dowRestricted) {
    return "Cron's day-of-month/day-of-week OR rule: this fires when EITHER field matches, not only when both do.";
  }
  return undefined;
}

function checkFiresAt(expr: string, whenRaw: string, expectFire: boolean): ClaimCheck {
  const field = expectFire ? 'fires-at' : 'does-not-fire-at';
  const label = `${expectFire ? 'Fires at' : 'Does not fire at'} ${whenRaw.trim()}`;
  const claimedStr = expectFire ? 'fires' : 'does not fire';
  const when = parseLocal(whenRaw);
  if (!when) {
    return {
      field,
      label,
      claimed: claimedStr,
      actual: 'unknown',
      verdict: 'unreadable',
      note: `Couldn't read "${whenRaw.trim()}" as a date and time.`,
    };
  }
  const actualFires = matchesAt(expr, when);
  const actualStr = actualFires ? 'fires' : 'does not fire';
  if (actualFires === expectFire) {
    return { field, label, claimed: claimedStr, actual: actualStr, verdict: 'match' };
  }
  return { field, label, claimed: claimedStr, actual: actualStr, verdict: 'mismatch', note: orRuleNote(expr) };
}

function checkNextRunAfter(expr: string, whenRaw: string, claimedNextRaw: string): ClaimCheck {
  const field = 'next-run-after';
  const label = `Next run after ${whenRaw.trim()}`;
  const when = parseLocal(whenRaw);
  const claimedNext = parseLocal(claimedNextRaw);
  if (!when || !claimedNext) {
    return {
      field,
      label,
      claimed: claimedNextRaw.trim(),
      actual: 'unknown',
      verdict: 'unreadable',
      note: "Couldn't read one of the two dates.",
    };
  }
  const actualNext = findNextFireAfter(expr, when);
  const actualStr = actualNext ? formatLocalMinute(actualNext) : 'never (within 5 years)';
  if (actualNext && floorToMinute(actualNext).getTime() === floorToMinute(claimedNext).getTime()) {
    return { field, label, claimed: claimedNextRaw.trim(), actual: actualStr, verdict: 'match' };
  }
  return {
    field,
    label,
    claimed: claimedNextRaw.trim(),
    actual: actualStr,
    verdict: 'mismatch',
    note: orRuleNote(expr),
  };
}

export function verifyClaims(expr: string, rows: CronClaimRow[]): VerifyResult {
  const info = explain(expr ?? '');
  if (!info.valid) return invalidBase(info.error || 'Enter a valid cron expression.');

  const checks: ClaimCheck[] = [];
  for (const row of rows ?? []) {
    if (!row || !row.when?.trim()) continue;
    if (row.kind === 'fires-at') {
      checks.push(checkFiresAt(expr, row.when, true));
    } else if (row.kind === 'does-not-fire-at') {
      checks.push(checkFiresAt(expr, row.when, false));
    } else if (row.kind === 'next-run-after' && row.claimedNext?.trim()) {
      checks.push(checkNextRunAfter(expr, row.when, row.claimedNext));
    }
  }

  return {
    valid: true,
    summary: summarize(checks),
    checks,
    mismatchCount: checks.filter((c) => c.verdict === 'mismatch').length,
  };
}

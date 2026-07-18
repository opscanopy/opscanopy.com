/**
 * Timestamp Converter — Verify-the-AI engine. Recomputes the instant from the
 * tool's own input (reusing `convert()`, this tool's one source of parsing
 * logic — there is no lower-level shared module the way ip-core is for the
 * networking tools) and checks a claimed instant / day-of-week against it.
 * Never parses free text beyond what a single structured field holds; never
 * throws.
 */
import { convert } from './engine';
import type { TimeResult } from './types';
import { invalidBase, summarize, type ClaimCheck, type VerifyResult } from '../verify-shared';

export interface TimestampClaims {
  /** The AI's claimed representation of the instant — epoch (any unit) or a date string. */
  instant?: string;
  /** The AI's claimed day of week, e.g. "Tuesday". */
  dayOfWeek?: string;
}

const LABELS = { instant: 'Claimed instant', dayOfWeek: 'Day of week' } as const;

const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

function msOf(result: TimeResult): number | null {
  const row = result.rows.find((r) => r.label === 'Unix (milliseconds)');
  if (!row) return null;
  const n = Number(row.value);
  return Number.isFinite(n) ? n : null;
}

function dayOfWeekOf(result: TimeResult): string | null {
  return result.rows.find((r) => r.label === 'Day of week')?.value ?? null;
}

/**
 * Diagnose why a claimed instant, once parsed, lands on the wrong moment.
 * Checked most-specific-first: an off-by-one-day or whole-hour-timezone delta
 * is far more likely (and far more tightly bounded) than a genuine 1000x
 * unit mix-up, so those run first — otherwise a ±1‑hour or ±1‑day claim can
 * satisfy a loose ratio test and hide the sharper, more useful diagnosis.
 */
function diagnoseDelta(claimed: string, actualMs: number, claimedMs: number): string | undefined {
  const deltaMs = claimedMs - actualMs;

  // Off-by-one-day: within a second of exactly 86400 seconds either direction.
  if (Math.abs(Math.abs(deltaMs) - 86_400_000) < 1000) {
    return 'Off by almost exactly one day — check the date, not just the time.';
  }

  // Timezone mix-up: a whole number of hours, within a plausible UTC-offset range.
  const deltaSec = deltaMs / 1000;
  if (Number.isInteger(deltaSec) && deltaSec !== 0 && deltaSec % 3600 === 0 && Math.abs(deltaSec) <= 26 * 3600) {
    const hours = Math.abs(deltaSec / 3600);
    return `Off by ${hours} whole hour${hours === 1 ? '' : 's'} — looks like a timezone mix-up (UTC vs local).`;
  }

  // Seconds <-> milliseconds mix-up: the RAW typed number (ignoring how this
  // tool's own digit-count heuristic reinterpreted it) lands within a small
  // ABSOLUTE tolerance of the correct value scaled by 1000 in either
  // direction. An absolute (not relative/ratio) tolerance matters here: at
  // ~1.7e9-second epoch magnitudes a 0.1%-relative window is ~±20 days wide
  // and would swallow the day/timezone cases above.
  if (/^-?\d+$/.test(claimed)) {
    const raw = Number(claimed);
    if (Number.isSafeInteger(raw)) {
      const actualSec = Math.round(actualMs / 1000);
      const offBy1000Smaller = Math.abs(raw * 1000 - actualMs) < 1000; // raw ~ actualSec
      const offBy1000Larger = Math.abs(raw - actualMs * 1000) < 1000; // raw ~ actualMs * 1000
      if (offBy1000Smaller || offBy1000Larger) {
        return 'Off by a factor of 1,000 — looks like a seconds ↔ milliseconds mix-up.';
      }
    }
  }

  return undefined;
}

function checkInstant(claimedRaw: string, actualMs: number): ClaimCheck {
  const claimed = claimedRaw.trim();
  const actualIso = new Date(actualMs).toISOString();
  const parsed = convert(claimed);
  if (!parsed.valid) {
    return {
      field: 'instant',
      label: LABELS.instant,
      claimed,
      actual: actualIso,
      verdict: 'unreadable',
      note: "Couldn't read that as a timestamp or date.",
    };
  }
  const claimedMs = msOf(parsed);
  if (claimedMs === null) {
    return {
      field: 'instant',
      label: LABELS.instant,
      claimed,
      actual: actualIso,
      verdict: 'unreadable',
      note: "Couldn't read that as a timestamp or date.",
    };
  }
  if (claimedMs === actualMs) {
    return { field: 'instant', label: LABELS.instant, claimed, actual: actualIso, verdict: 'match' };
  }
  return {
    field: 'instant',
    label: LABELS.instant,
    claimed,
    actual: actualIso,
    verdict: 'mismatch',
    note: diagnoseDelta(claimed, actualMs, claimedMs),
  };
}

function checkDayOfWeek(claimedRaw: string, actualDay: string): ClaimCheck {
  const claimed = claimedRaw.trim();
  if (!DAY_NAMES.includes(claimed.toLowerCase())) {
    return {
      field: 'dayOfWeek',
      label: LABELS.dayOfWeek,
      claimed,
      actual: actualDay,
      verdict: 'unreadable',
      note: `Couldn't read "${claimed}" as a day of the week.`,
    };
  }
  if (claimed.toLowerCase() === actualDay.toLowerCase()) {
    return { field: 'dayOfWeek', label: LABELS.dayOfWeek, claimed, actual: actualDay, verdict: 'match' };
  }
  return { field: 'dayOfWeek', label: LABELS.dayOfWeek, claimed, actual: actualDay, verdict: 'mismatch' };
}

export function verifyClaims(input: string, claims: TimestampClaims, nowMs?: number): VerifyResult {
  const base = convert(input, nowMs);
  if (!base.valid) {
    return invalidBase(base.error ?? 'Could not read that as a Unix timestamp or a date string.');
  }
  const actualMs = msOf(base);
  const actualDay = dayOfWeekOf(base);
  if (actualMs === null || actualDay === null) {
    return invalidBase('Could not read that as a Unix timestamp or a date string.');
  }

  const checks: ClaimCheck[] = [];
  if (claims.instant?.trim()) checks.push(checkInstant(claims.instant, actualMs));
  if (claims.dayOfWeek?.trim()) checks.push(checkDayOfWeek(claims.dayOfWeek, actualDay));

  return {
    valid: true,
    summary: summarize(checks),
    checks,
    mismatchCount: checks.filter((c) => c.verdict === 'mismatch').length,
  };
}

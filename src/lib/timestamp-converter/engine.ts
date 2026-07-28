/**
 * Timestamp Converter — engine. Detects the input form (a Unix epoch in
 * seconds / milliseconds / microseconds, or a parseable date string such as
 * ISO 8601) and renders every representation of that instant: Unix seconds and
 * milliseconds, the ISO 8601 UTC string, human-readable UTC and local times, a
 * humanized relative offset, and the UTC day of week.
 *
 * Pure + browser-safe; never throws on user input — bad input returns
 * { valid:false, error, rows:[] } so callers can render a friendly message.
 *
 * The relative offset is measured against `nowMs` (defaulting to Date.now()),
 * so callers can pass a fixed value for deterministic output.
 */
import type { TimeResult, TimeRow } from './types';
import { relative } from '../relative-time';

const ERR_EMPTY =
  'Enter a Unix timestamp (e.g. 1516239022) or a date string (e.g. 2018-01-18T01:30:22Z).';
const ERR_PARSE = 'Could not read that as a Unix timestamp or a date string.';

/** Detected input forms, surfaced to the user. */
type Detected =
  | 'epoch seconds'
  | 'epoch milliseconds'
  | 'epoch microseconds'
  | 'epoch nanoseconds'
  | 'date string';

function bad(error: string): TimeResult {
  return { valid: false, error, rows: [] };
}

export function convert(input: string, nowMs?: number): TimeResult {
  const s = (input ?? '').trim();
  if (s.length === 0) return bad(ERR_EMPTY);

  let ms: number;
  let detected: Detected;

  // An optional leading "-" is still an epoch: pre-1970 timestamps are ordinary
  // negative Unix time. Without the sign here they fell through to Date.parse()
  // and came back tens of thousands of years in the FUTURE ("-86400" rendered
  // as +086399-12-31) with no error at all.
  const epochMatch = /^(-?)(\d+)$/.exec(s);
  if (epochMatch) {
    // Disambiguate the unit by DIGIT count (excluding the sign):
    // <=11 => seconds, 12-14 => milliseconds, 15-16 => microseconds, 17+ => nanoseconds.
    // Collapse sub-millisecond units to ms via BigInt so we never lose precision
    // past Number's safe-integer range before dividing.
    const sign = epochMatch[1] === '-' ? -1 : 1;
    const digits = epochMatch[2];
    const len = digits.length;
    if (len <= 11) {
      ms = sign * Number(digits) * 1000;
      detected = 'epoch seconds';
    } else if (len <= 14) {
      ms = sign * Number(digits);
      detected = 'epoch milliseconds';
    } else if (len <= 16) {
      ms = sign * Number(BigInt(digits) / 1000n);
      detected = 'epoch microseconds';
    } else {
      ms = sign * Number(BigInt(digits) / 1000000n);
      detected = 'epoch nanoseconds';
    }
  } else {
    // Anything else: let the platform parse it (ISO 8601, RFC 2822, etc.).
    const parsed = Date.parse(s);
    if (Number.isNaN(parsed)) return bad(ERR_PARSE);
    ms = parsed;
    detected = 'date string';
  }

  if (!Number.isFinite(ms)) return bad(ERR_PARSE);

  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) return bad(ERR_PARSE);

  const rows: TimeRow[] = [
    { label: 'Unix (seconds)', value: Math.floor(ms / 1000).toString(), mono: true },
    { label: 'Unix (milliseconds)', value: ms.toString(), mono: true },
    { label: 'ISO 8601 (UTC)', value: date.toISOString(), mono: true },
    { label: 'UTC', value: readable(date, 'UTC') },
    { label: 'Local', value: readable(date, undefined) },
    { label: 'Relative', value: relative(ms, nowMs ?? Date.now()) },
    { label: 'Day of week', value: dayOfWeekUtc(date) },
  ];

  return { valid: true, detected, rows };
}

/**
 * Human-readable date + time in the given IANA zone (or the runtime local zone
 * when `timeZone` is undefined). Falls back to the ISO string if Intl is
 * unavailable so the engine still never throws.
 */
function readable(date: Date, timeZone: string | undefined): string {
  try {
    return new Intl.DateTimeFormat('en-US', {
      ...(timeZone ? { timeZone } : {}),
      dateStyle: 'full',
      timeStyle: 'long',
    }).format(date);
  } catch {
    return date.toISOString();
  }
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function dayOfWeekUtc(date: Date): string {
  return DAYS[date.getUTCDay()];
}

// relative() moved to src/lib/relative-time.ts — shared with the JWT decoder.

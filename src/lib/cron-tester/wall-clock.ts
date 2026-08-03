/**
 * Zone-aware wall-clock reads for the cron engine.
 *
 * A crontab fires on the WALL CLOCK of the host's timezone, so matching cron
 * fields against `Date#getHours()` answers in the visitor's laptop timezone
 * rather than the one the job actually runs in. These helpers read a UTC
 * instant as the calendar fields of a named IANA zone instead.
 *
 * The browser's own tz database is the source of truth via Intl — nothing is
 * shipped, and the data stays current with the platform. Formatters are
 * memoized per zone: constructing one costs orders of magnitude more than a
 * formatToParts call, and the walk in engine.ts makes one call per candidate
 * minute.
 */

/** Calendar fields of an instant, as seen in one timezone. */
export interface WallTime {
  year: number;
  /** 1-12, matching cron's month field. */
  month: number;
  /** 1-31. */
  day: number;
  /** 0-23. */
  hour: number;
  /** 0-59. */
  minute: number;
  /** 0 = Sunday … 6 = Saturday, matching cron's day-of-week field. */
  weekday: number;
}

const WEEKDAYS: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

const fmtCache = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = fmtCache.get(timeZone);
  if (f === undefined) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      weekday: 'short',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
    fmtCache.set(timeZone, f);
  }
  return f;
}

/**
 * Is `timeZone` a zone this runtime knows? Callers use this once, up front, so
 * the hot path can assume a good zone and skip try/catch per candidate minute.
 */
export function isValidTimeZone(timeZone: string): boolean {
  if (timeZone === '') return false;
  try {
    formatter(timeZone);
    return true;
  } catch {
    return false;
  }
}

/**
 * Read `epochMs` as the wall-clock fields of `timeZone`.
 * Throws RangeError on an unknown zone — gate with isValidTimeZone() first.
 */
export function wallClock(epochMs: number, timeZone: string): WallTime {
  const parts = formatter(timeZone).formatToParts(epochMs);
  let year = 0;
  let month = 0;
  let day = 0;
  let hour = 0;
  let minute = 0;
  let weekday = 0;
  for (const p of parts) {
    switch (p.type) {
      case 'year':
        year = Number(p.value);
        break;
      case 'month':
        month = Number(p.value);
        break;
      case 'day':
        day = Number(p.value);
        break;
      case 'hour':
        // h23 should never yield 24, but some engines have historically
        // rendered midnight that way — normalise so a "0 0 * * *" schedule
        // cannot silently stop matching.
        hour = Number(p.value) % 24;
        break;
      case 'minute':
        minute = Number(p.value);
        break;
      case 'weekday':
        weekday = WEEKDAYS[p.value] ?? 0;
        break;
      default:
        break;
    }
  }
  return { year, month, day, hour, minute, weekday };
}

/**
 * Offset of `timeZone` from UTC at `epochMs`, in minutes east (New York in
 * January → -300). Comparing this either side of a date is how callers detect
 * that a DST transition sits nearby.
 */
export function zoneOffsetMinutes(epochMs: number, timeZone: string): number {
  const w = wallClock(epochMs, timeZone);
  const asUtc = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute);
  // epochMs may carry seconds/ms that Date.UTC above drops; round to the
  // nearest minute so those never leak into the offset.
  return Math.round((asUtc - Math.floor(epochMs / 60000) * 60000) / 60000);
}

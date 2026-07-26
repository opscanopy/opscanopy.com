/**
 * Largest-unit relative phrase, e.g. "in 3 days" / "5 minutes ago" /
 * "just now" (|delta| < 1s). Month = 30 days, year = 365 days, Math.floor.
 * Shared by the Timestamp Converter rows and the JWT claim annotations —
 * both tools' tests pin these exact strings; change them in lockstep only.
 */
export function relative(ms: number, nowMs: number): string {
  const diff = ms - nowMs; // > 0 => future
  const abs = Math.abs(diff);

  const SECOND = 1000;
  const MINUTE = 60 * SECOND;
  const HOUR = 60 * MINUTE;
  const DAY = 24 * HOUR;
  const WEEK = 7 * DAY;
  const MONTH = 30 * DAY;
  const YEAR = 365 * DAY;

  if (abs < SECOND) return 'just now';

  const units: [number, string][] = [
    [YEAR, 'year'],
    [MONTH, 'month'],
    [WEEK, 'week'],
    [DAY, 'day'],
    [HOUR, 'hour'],
    [MINUTE, 'minute'],
    [SECOND, 'second'],
  ];

  for (const [size, name] of units) {
    if (abs >= size) {
      const n = Math.floor(abs / size);
      const phrase = `${n} ${name}${n === 1 ? '' : 's'}`;
      return diff > 0 ? `in ${phrase}` : `${phrase} ago`;
    }
  }
  return 'just now';
}

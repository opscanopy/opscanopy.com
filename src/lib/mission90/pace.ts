/**
 * Mission 90 Days — pace planning + .ics calendar export. Pure functions:
 * no Date.now()/`new Date()` read internally (callers pass `start`/`nowIso`),
 * so every projection and calendar file is deterministic and testable.
 *
 * Session spacing is NOT tied to specific weekdays (Mon/Wed/Fri, etc.) —
 * `perWeek` sessions are spread evenly across every 7-day block via simple
 * rounding, so any pace from 1 to 7 days/week produces a clean, monotonic
 * schedule without needing to know what day of the week `start` falls on.
 */

/** Day offset (from `start`) of the i-th (0-indexed) session at this pace. */
function dayOffset(i: number, perWeek: number): number {
  return Math.round((i * 7) / perWeek);
}

/** Add `days` calendar days to a `YYYY-MM-DD` date, in UTC (pure calendar
 *  arithmetic — no timezone conversion, matching progress.ts's dayIndex). */
function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const ms = Date.UTC(y, m - 1, d) + days * 86_400_000;
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * Calendar date of the i-th (0-indexed) session at `perWeek` days/week,
 * starting from `start` (`YYYY-MM-DD`, the date of session 0).
 */
export function sessionDate(start: string, i: number, perWeek: number): string {
  return addDays(start, dayOffset(i, perWeek));
}

/**
 * Calendar date the last of `remaining` sessions (starting at `start`, at
 * `perWeek` days/week) falls on. `remaining <= 0` returns `start` itself —
 * there is nothing left to schedule.
 */
export function projectedFinish(start: string, remaining: number, perWeek: number): string {
  return sessionDate(start, Math.max(0, remaining - 1), perWeek);
}

/**
 * Display a `YYYY-MM-DD` calendar date as a short localized string ("Jul 20,
 * 2026"). Deliberately NOT `new Date(date).toLocaleDateString()`: a bare date
 * string parses as UTC midnight, and formatting that in the viewer's LOCAL
 * timezone can show the wrong day for anyone west of UTC (e.g. "2026-07-20"
 * renders as "Jul 19" at UTC-8). Pinning `timeZone: 'UTC'` on the formatter
 * keeps the displayed day identical to the calendar date everywhere.
 */
export function formatSessionDate(date: string, locale?: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

export interface IcsEvent {
  /** Mission-90 day number — drives the deterministic UID. */
  day: number;
  /** Session date, `YYYY-MM-DD`. */
  date: string;
  /** Lesson title, e.g. "Linux filesystem basics". */
  title: string;
}

/**
 * CRLF-join + fold any line over 75 octets per RFC 5545 §3.1 (continuation
 * lines are prefixed with a single space, which counts against their own
 * 75-octet budget). Folds on a UTF-8 byte boundary — never inside a
 * multi-byte character.
 */
function foldLine(line: string): string {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const chunks: string[] = [];
  let offset = 0;
  let limit = 75;
  while (offset < bytes.length) {
    let end = Math.min(offset + limit, bytes.length);
    // Back off while the next byte is a UTF-8 continuation byte (10xxxxxx),
    // so a multi-byte character is never split across two folded chunks.
    while (end < bytes.length && (bytes[end] & 0xc0) === 0x80) end--;
    chunks.push(new TextDecoder().decode(bytes.slice(offset, end)));
    offset = end;
    limit = 74; // continuation lines reserve 1 octet for the leading space
  }
  return chunks.join('\r\n ');
}

function icsDate(date: string): string {
  return date.replace(/-/g, '');
}

/** Escape RFC 5545 TEXT special characters (backslash, semicolon, comma,
 *  newline) — day titles are plain strings from the registry, never
 *  pre-escaped. */
function escapeIcsText(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

/**
 * Build an RFC 5545 .ics calendar: one all-day VEVENT per event, named after
 * its lesson. Deliberately no RRULE — the pace spacing isn't a fixed weekday
 * pattern a recurrence rule could express, so each session is dated
 * individually. UIDs are deterministic (`m90-day-<n>@opscanopy.com`), so
 * re-downloading after a pace change updates the same calendar entries
 * instead of duplicating them. `nowIso` drives DTSTAMP (generation time) —
 * passed in rather than read from `Date.now()` so this stays pure/testable.
 */
export function buildIcs(events: IcsEvent[], nowIso: string): string {
  const dtstamp = nowIso.replace(/[-:]|\.\d+(?=Z)/g, '');
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//OpsCanopy//Mission 90 Days//EN',
    'CALSCALE:GREGORIAN',
  ];
  for (const e of events) {
    const start = icsDate(e.date);
    const end = icsDate(addDays(e.date, 1));
    lines.push(
      'BEGIN:VEVENT',
      `UID:m90-day-${e.day}@opscanopy.com`,
      `DTSTAMP:${dtstamp}`,
      `DTSTART;VALUE=DATE:${start}`,
      `DTEND;VALUE=DATE:${end}`,
      `SUMMARY:${escapeIcsText(`Day ${e.day}: ${e.title}`)}`,
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return lines.map(foldLine).join('\r\n') + '\r\n';
}

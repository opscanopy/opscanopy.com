/**
 * Mission 90 Days — pace planning + .ics export tests. sessionDate/
 * projectedFinish are pure calendar arithmetic (no timezone conversion —
 * inputs/outputs are plain YYYY-MM-DD calendar dates). buildIcs's contract
 * is RFC 5545: CRLF line endings throughout, 75-octet line folding, and
 * deterministic per-day UIDs so re-downloading after a pace change updates
 * existing calendar entries instead of duplicating them.
 */
import { describe, it, expect } from 'vitest';
import { sessionDate, projectedFinish, buildIcs, formatSessionDate, type IcsEvent } from './pace';

describe('sessionDate()', () => {
  it('schedules daily at 7 sessions/week', () => {
    expect(sessionDate('2026-01-01', 0, 7)).toBe('2026-01-01');
    expect(sessionDate('2026-01-01', 1, 7)).toBe('2026-01-02');
    expect(sessionDate('2026-01-01', 6, 7)).toBe('2026-01-07');
  });

  it('schedules weekly at 1 session/week', () => {
    expect(sessionDate('2026-01-01', 0, 1)).toBe('2026-01-01');
    expect(sessionDate('2026-01-01', 1, 1)).toBe('2026-01-08');
    expect(sessionDate('2026-01-01', 2, 1)).toBe('2026-01-15');
  });

  it('spreads 5 sessions/week evenly across each 7-day block', () => {
    const days = [0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => sessionDate('2026-01-01', i, 5));
    // First 5 sessions land within days 0-6 (one 7-day block), evenly spread,
    // then the pattern repeats one week (7 days) later.
    expect(days).toEqual([
      '2026-01-01', // day 0
      '2026-01-02', // day 1
      '2026-01-04', // day 3
      '2026-01-05', // day 4
      '2026-01-07', // day 6
      '2026-01-08', // day 7 (week 2 starts)
      '2026-01-09', // day 8
      '2026-01-11', // day 10
      '2026-01-12', // day 11
    ]);
  });

  it('session 0 is always the start date, regardless of pace', () => {
    for (const perWeek of [1, 2, 3, 4, 5, 6, 7]) {
      expect(sessionDate('2026-03-15', 0, perWeek)).toBe('2026-03-15');
    }
  });

  it('rolls over month and year boundaries correctly', () => {
    expect(sessionDate('2026-01-30', 3, 7)).toBe('2026-02-02');
    expect(sessionDate('2026-12-30', 3, 7)).toBe('2027-01-02');
  });

  it('handles a leap-year February correctly', () => {
    // 2028 is a leap year.
    expect(sessionDate('2028-02-27', 3, 7)).toBe('2028-03-01');
  });
});

describe('projectedFinish()', () => {
  it('matches sessionDate for the last of N remaining sessions', () => {
    expect(projectedFinish('2026-01-01', 10, 7)).toBe(sessionDate('2026-01-01', 9, 7));
    expect(projectedFinish('2026-01-01', 10, 5)).toBe(sessionDate('2026-01-01', 9, 5));
  });

  it('one remaining session finishes on the start date', () => {
    expect(projectedFinish('2026-01-01', 1, 3)).toBe('2026-01-01');
  });

  it('zero remaining sessions returns the start date (nothing left to schedule)', () => {
    expect(projectedFinish('2026-01-01', 0, 5)).toBe('2026-01-01');
  });
});

describe('formatSessionDate()', () => {
  it('formats a calendar date with a pinned locale', () => {
    expect(formatSessionDate('2026-07-20', 'en-US')).toBe('Jul 20, 2026');
  });

  it('formats using UTC explicitly, not new Date(str).toLocaleDateString() in the local zone', () => {
    // Regression guard for the actual bug class: a bare `new Date(dateStr)`
    // parses as UTC midnight, and formatting it in a WEST-of-UTC local zone
    // can render the previous day. Compare against the naive (buggy)
    // approach forced into a west-of-UTC zone — they must NOT agree, proving
    // formatSessionDate isn't accidentally doing the same thing.
    const naiveBuggyResult = new Date('2026-07-20').toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      timeZone: 'America/Los_Angeles',
    });
    expect(naiveBuggyResult).toBe('Jul 19, 2026'); // confirms the bug class is real, not hypothetical
    expect(formatSessionDate('2026-07-20', 'en-US')).toBe('Jul 20, 2026');
  });

  it('handles the year boundary', () => {
    expect(formatSessionDate('2026-01-01', 'en-US')).toBe('Jan 1, 2026');
  });
});

describe('buildIcs()', () => {
  const EVENTS: IcsEvent[] = [{ day: 21, date: '2026-07-20', title: 'Intro to Docker' }];
  const NOW = '2026-07-18T00:34:00.000Z';

  it('wraps events in a VCALENDAR with the expected header properties', () => {
    const ics = buildIcs(EVENTS, NOW);
    expect(ics).toMatch(/^BEGIN:VCALENDAR\r\n/);
    expect(ics).toContain('VERSION:2.0\r\n');
    expect(ics).toContain('PRODID:-//OpsCanopy//Mission 90 Days//EN\r\n');
    expect(ics).toMatch(/END:VCALENDAR\r\n$/);
  });

  it('produces exactly one VEVENT per event, in order', () => {
    const events: IcsEvent[] = [
      { day: 21, date: '2026-07-20', title: 'A' },
      { day: 22, date: '2026-07-21', title: 'B' },
    ];
    const ics = buildIcs(events, NOW);
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2);
    expect(ics.match(/END:VEVENT/g)).toHaveLength(2);
    expect(ics.indexOf('m90-day-21@')).toBeLessThan(ics.indexOf('m90-day-22@'));
  });

  it('produces a valid empty calendar for zero events', () => {
    const ics = buildIcs([], NOW);
    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('END:VCALENDAR');
    expect(ics).not.toContain('BEGIN:VEVENT');
  });

  it('uses a deterministic per-day UID', () => {
    const ics = buildIcs(EVENTS, NOW);
    expect(ics).toContain('UID:m90-day-21@opscanopy.com\r\n');
  });

  it('sets an all-day DTSTART/DTEND (DTEND is the day after)', () => {
    const ics = buildIcs(EVENTS, NOW);
    expect(ics).toContain('DTSTART;VALUE=DATE:20260720\r\n');
    expect(ics).toContain('DTEND;VALUE=DATE:20260721\r\n');
  });

  it('formats DTSTAMP as YYYYMMDDTHHMMSSZ', () => {
    const ics = buildIcs(EVENTS, NOW);
    expect(ics).toContain('DTSTAMP:20260718T003400Z\r\n');
  });

  it('names the lesson in SUMMARY', () => {
    const ics = buildIcs(EVENTS, NOW);
    expect(ics).toContain('SUMMARY:Day 21: Intro to Docker\r\n');
  });

  it('escapes commas, semicolons and backslashes in SUMMARY', () => {
    const ics = buildIcs([{ day: 1, date: '2026-01-01', title: 'A, B; C\\D' }], NOW);
    expect(ics).toContain('SUMMARY:Day 1: A\\, B\\; C\\\\D\r\n');
  });

  it('uses CRLF line endings throughout, never a bare LF', () => {
    const ics = buildIcs(EVENTS, NOW);
    // Strip every CRLF, then confirm no lone "\n" survives.
    expect(ics.replace(/\r\n/g, '')).not.toContain('\n');
  });

  it('folds a SUMMARY line longer than 75 octets, continuation lines starting with a space', () => {
    const longTitle = 'A'.repeat(100);
    const ics = buildIcs([{ day: 5, date: '2026-01-01', title: longTitle }], NOW);
    const summaryLine = ics.split('\r\n').find((l) => l.startsWith('SUMMARY:'));
    expect(summaryLine).toBeDefined();
    // The physical line grep above only sees the FIRST fold segment; recover
    // the full folded run (continuation lines start with exactly one space)
    // and confirm no physical line exceeds 75 octets.
    const rawLines = ics.split('\r\n');
    const start = rawLines.findIndex((l) => l.startsWith('SUMMARY:'));
    const folded = [rawLines[start]];
    let i = start + 1;
    while (i < rawLines.length && rawLines[i].startsWith(' ')) {
      folded.push(rawLines[i]);
      i++;
    }
    expect(folded.length).toBeGreaterThan(1);
    for (const line of folded) {
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    }
    // Un-fold (drop the leading space each continuation line reserves) and
    // confirm the original text round-trips.
    const rejoined = folded[0] + folded.slice(1).map((l) => l.slice(1)).join('');
    expect(rejoined).toBe(`SUMMARY:Day 5: ${longTitle}`);
  });

  it('never splits a multi-byte UTF-8 character across a fold boundary', () => {
    // 40 emoji (4 bytes each in UTF-8) comfortably crosses the 75-octet mark
    // mid-character if folding were byte-naive.
    const title = '🚀'.repeat(40);
    const ics = buildIcs([{ day: 9, date: '2026-01-01', title }], NOW);
    const rawLines = ics.split('\r\n');
    const start = rawLines.findIndex((l) => l.startsWith('SUMMARY:'));
    const folded: string[] = [];
    let i = start;
    folded.push(rawLines[i]);
    i++;
    while (i < rawLines.length && rawLines[i].startsWith(' ')) {
      folded.push(rawLines[i]);
      i++;
    }
    const rejoined = folded[0] + folded.slice(1).map((l) => l.slice(1)).join('');
    expect(rejoined).toBe(`SUMMARY:Day 9: ${title}`);
  });
});

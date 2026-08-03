import { describe, it, expect } from 'vitest';
import { wallClock, zoneOffsetMinutes, isValidTimeZone } from './wall-clock';

describe('wallClock — reads a UTC instant as zone-local calendar fields', () => {
  it('UTC is the identity case', () => {
    expect(wallClock(Date.UTC(2026, 2, 8, 14, 5), 'UTC')).toEqual({
      year: 2026,
      month: 3,
      day: 8,
      hour: 14,
      minute: 5,
      weekday: 0, // Sunday
    });
  });

  it('handles a half-hour offset zone', () => {
    // 2026-01-15T00:00Z is 05:30 on the 15th in Asia/Kolkata (+05:30, no DST).
    expect(wallClock(Date.UTC(2026, 0, 15, 0, 0), 'Asia/Kolkata')).toEqual({
      year: 2026,
      month: 1,
      day: 15,
      hour: 5,
      minute: 30,
      weekday: 4, // Thursday
    });
  });

  it('rolls the date backwards across the zone boundary', () => {
    // 01:00Z on the 15th is still 20:00 on the 14th in New York (-05:00).
    const w = wallClock(Date.UTC(2026, 0, 15, 1, 0), 'America/New_York');
    expect([w.day, w.hour, w.weekday]).toEqual([14, 20, 3]); // Wednesday
  });

  it('reports midnight as hour 0, never 24', () => {
    // Some engines format midnight as "24" under hourCycle h23/h24 — if that
    // leaked through, every "0 0 * * *" job would silently never match.
    expect(wallClock(Date.UTC(2026, 0, 15, 0, 0), 'UTC').hour).toBe(0);
    expect(wallClock(Date.UTC(2026, 0, 15, 5, 0), 'America/New_York').hour).toBe(0);
  });

  it('crosses the US spring-forward gap correctly', () => {
    // 2026-03-08: 06:59Z is 01:59 EST, 07:00Z is 03:00 EDT. 02:xx never exists.
    expect(wallClock(Date.UTC(2026, 2, 8, 6, 59), 'America/New_York').hour).toBe(1);
    expect(wallClock(Date.UTC(2026, 2, 8, 7, 0), 'America/New_York').hour).toBe(3);
  });

  it('reports both sides of the US fall-back repeat', () => {
    // 2026-11-01: 05:30Z is 01:30 EDT, 06:30Z is 01:30 EST — same wall time.
    expect(wallClock(Date.UTC(2026, 10, 1, 5, 30), 'America/New_York').hour).toBe(1);
    expect(wallClock(Date.UTC(2026, 10, 1, 6, 30), 'America/New_York').hour).toBe(1);
  });

  it('handles a southern-hemisphere zone (DST runs the other way)', () => {
    // Australia/Sydney is +11 in January, +10 in July.
    expect(wallClock(Date.UTC(2026, 0, 15, 0, 0), 'Australia/Sydney').hour).toBe(11);
    expect(wallClock(Date.UTC(2026, 6, 15, 0, 0), 'Australia/Sydney').hour).toBe(10);
  });
});

describe('zoneOffsetMinutes', () => {
  it('is signed east-of-UTC', () => {
    expect(zoneOffsetMinutes(Date.UTC(2026, 0, 15), 'America/New_York')).toBe(-300); // EST
    expect(zoneOffsetMinutes(Date.UTC(2026, 6, 15), 'America/New_York')).toBe(-240); // EDT
    expect(zoneOffsetMinutes(Date.UTC(2026, 0, 15), 'Asia/Kolkata')).toBe(330);
    expect(zoneOffsetMinutes(Date.UTC(2026, 0, 15), 'UTC')).toBe(0);
  });

  it('changes across a DST transition, which is how callers detect one', () => {
    const before = zoneOffsetMinutes(Date.UTC(2026, 2, 7), 'America/New_York');
    const after = zoneOffsetMinutes(Date.UTC(2026, 2, 9), 'America/New_York');
    expect(before).not.toBe(after);
  });
});

describe('isValidTimeZone', () => {
  it('accepts real IANA zones', () => {
    for (const z of ['UTC', 'America/New_York', 'Asia/Kolkata', 'Europe/Berlin']) {
      expect(isValidTimeZone(z)).toBe(true);
    }
  });

  it('rejects nonsense without throwing', () => {
    for (const z of ['Mars/Olympus', '', 'Not A Zone', 'UTC+5']) {
      expect(isValidTimeZone(z)).toBe(false);
    }
  });
});

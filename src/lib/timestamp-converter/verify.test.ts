import { describe, it, expect } from 'vitest';
import { verifyClaims } from './verify';

// 2024-01-15T10:00:00.000Z, a Monday.
const BASE = '1705312800';
const BASE_MS = 1705312800000;

describe('timestamp verifyClaims()', () => {
  describe('base input', () => {
    it('is invalid for empty input', () => {
      const r = verifyClaims('', {});
      expect(r.valid).toBe(false);
      expect(r.error).toBeTruthy();
    });

    it('is invalid for unparseable input', () => {
      const r = verifyClaims('not a timestamp', {});
      expect(r.valid).toBe(false);
    });

    it('is valid with zero checks when no claims are given', () => {
      const r = verifyClaims(BASE, {});
      expect(r.valid).toBe(true);
      expect(r.checks).toEqual([]);
      expect(r.summary).toBe('No claims entered yet.');
    });
  });

  describe('matching claims', () => {
    it('matches the same instant given as seconds', () => {
      const r = verifyClaims(BASE, { instant: '1705312800' });
      expect(r.checks[0].verdict).toBe('match');
    });

    it('matches the same instant given as an ISO string', () => {
      const r = verifyClaims(BASE, { instant: '2024-01-15T10:00:00.000Z' });
      expect(r.checks[0].verdict).toBe('match');
    });

    it('matches the same instant given as milliseconds', () => {
      const r = verifyClaims(BASE, { instant: String(BASE_MS) });
      expect(r.checks[0].verdict).toBe('match');
    });

    it('matches the correct day of week case-insensitively', () => {
      const r = verifyClaims(BASE, { dayOfWeek: 'monday' });
      expect(r.checks[0].verdict).toBe('match');
    });
  });

  describe('documented AI failure classes', () => {
    it('diagnoses a seconds<->ms mix-up when leading zeros push the claim into the wrong digit bucket', () => {
      // "001705312800" is numerically equal to the correct epoch SECONDS
      // value, but its leading zeros inflate the string to 12 characters —
      // this tool's own digit-count heuristic treats any 12-14 digit string
      // as MILLISECONDS, so the claim resolves to 1970 instead of the
      // correct instant, a genuine reachable case of the seconds/ms mixup.
      const r = verifyClaims(BASE, { instant: '001705312800' });
      expect(r.checks[0].verdict).toBe('mismatch');
      expect(r.checks[0].note).toMatch(/factor of 1,000/i);
    });

    // Regression: the ratio-based 1000x check used to use a RELATIVE (0.1%)
    // tolerance, which at ~1.7e9-second epoch magnitudes is a ±20-DAY window —
    // wide enough to misfire on genuine ±1-hour/±1-day claims and hide the
    // sharper, more useful day/timezone diagnosis entirely.
    it('does NOT let the 1000x check swallow a plain +1-hour digit claim', () => {
      const r = verifyClaims(BASE, { instant: String(1705312800 + 3600) });
      expect(r.checks[0].verdict).toBe('mismatch');
      expect(r.checks[0].note).toMatch(/1 whole hour/i);
      expect(r.checks[0].note).not.toMatch(/factor of 1,000/i);
    });

    it('does NOT let the 1000x check swallow a plain +1-day digit claim', () => {
      const r = verifyClaims(BASE, { instant: String(1705312800 + 86_400) });
      expect(r.checks[0].verdict).toBe('mismatch');
      expect(r.checks[0].note).toMatch(/one day/i);
      expect(r.checks[0].note).not.toMatch(/factor of 1,000/i);
    });

    it('diagnoses an off-by-one-day error', () => {
      const oneDayLater = BASE_MS + 86_400_000;
      const r = verifyClaims(BASE, { instant: new Date(oneDayLater).toISOString() });
      expect(r.checks[0].verdict).toBe('mismatch');
      expect(r.checks[0].note).toMatch(/one day/i);
    });

    it('diagnoses a timezone-style whole-hour offset', () => {
      const fiveHoursOff = BASE_MS + 5 * 3600 * 1000;
      const r = verifyClaims(BASE, { instant: new Date(fiveHoursOff).toISOString() });
      expect(r.checks[0].verdict).toBe('mismatch');
      expect(r.checks[0].note).toMatch(/5 whole hours/i);
      expect(r.checks[0].note).toMatch(/timezone/i);
    });

    it('flags a wrong day of week as a plain mismatch', () => {
      const r = verifyClaims(BASE, { dayOfWeek: 'Tuesday' });
      expect(r.checks[0].verdict).toBe('mismatch');
    });
  });

  describe('unreadable claims', () => {
    it('marks an unparseable instant claim unreadable, not a mismatch', () => {
      const r = verifyClaims(BASE, { instant: 'whenever' });
      expect(r.checks[0].verdict).toBe('unreadable');
      expect(r.mismatchCount).toBe(0);
    });

    it('marks a non-day-name claim unreadable', () => {
      const r = verifyClaims(BASE, { dayOfWeek: 'Someday' });
      expect(r.checks[0].verdict).toBe('unreadable');
    });
  });

  it('checks only the fields that were actually claimed', () => {
    const r = verifyClaims(BASE, { dayOfWeek: 'Monday' });
    expect(r.checks.map((c) => c.field)).toEqual(['dayOfWeek']);
  });

  it('never throws on adversarial input', () => {
    expect(() =>
      verifyClaims('¯\\_(ツ)_/¯', { instant: '{}', dayOfWeek: '' }),
    ).not.toThrow();
  });
});

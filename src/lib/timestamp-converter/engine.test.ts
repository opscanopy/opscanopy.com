import { describe, it, expect } from 'vitest';
import { convert } from './engine';
import { examples } from './examples';
import type { TimeResult } from './types';

/**
 * The Unix epoch on which most vectors are anchored:
 * 2018-01-18T01:30:22Z === 1516239022 s === 1516239022000 ms.
 */
const ANCHOR_MS = 1516239022000;

/** Look up a single rendered row by its label. */
function row(result: TimeResult, label: string): string {
  const found = result.rows.find((r) => r.label === label);
  if (!found) throw new Error(`no row labelled "${label}"`);
  return found.value;
}

describe('timestamp-converter convert()', () => {
  describe('epoch length detection (s / ms / µs)', () => {
    it('reads a 10-digit value as epoch seconds', () => {
      const r = convert('1516239022');
      expect(r.valid).toBe(true);
      expect(r.detected).toBe('epoch seconds');
      // 10-digit seconds scale up by 1000 to the anchor instant.
      expect(row(r, 'Unix (milliseconds)')).toBe(String(ANCHOR_MS));
      expect(row(r, 'Unix (seconds)')).toBe('1516239022');
    });

    it('reads a 13-digit value as epoch milliseconds', () => {
      const r = convert('1516239022000');
      expect(r.valid).toBe(true);
      expect(r.detected).toBe('epoch milliseconds');
      expect(row(r, 'Unix (milliseconds)')).toBe(String(ANCHOR_MS));
      expect(row(r, 'Unix (seconds)')).toBe('1516239022');
    });

    it('reads a 16-digit value as epoch microseconds (collapsed to ms via BigInt)', () => {
      const r = convert('1516239022000000');
      expect(r.valid).toBe(true);
      expect(r.detected).toBe('epoch microseconds');
      expect(row(r, 'Unix (milliseconds)')).toBe(String(ANCHOR_MS));
      expect(row(r, 'Unix (seconds)')).toBe('1516239022');
    });

    it('treats the 11-digit boundary as seconds and 12-digit as milliseconds', () => {
      expect(convert('11111111111').detected).toBe('epoch seconds'); // 11 digits
      expect(convert('111111111111').detected).toBe('epoch milliseconds'); // 12 digits
    });
  });

  describe('the documented examples', () => {
    it('every bundled example parses to a valid result', () => {
      for (const ex of examples) {
        const r = convert(ex.input);
        expect(r.valid, `${ex.label} should be valid`).toBe(true);
        expect(r.error).toBeUndefined();
        expect(r.rows.length).toBeGreaterThan(0);
      }
    });

    it('the seconds and milliseconds examples render the same instant', () => {
      const s = convert('1516239022');
      const msVal = convert('1516239022000');
      expect(row(s, 'ISO 8601 (UTC)')).toBe(row(msVal, 'ISO 8601 (UTC)'));
      expect(row(s, 'ISO 8601 (UTC)')).toBe('2018-01-18T01:30:22.000Z');
    });

    it('renders the UTC day of week for the anchor instant', () => {
      // 2018-01-18 was a Thursday (UTC).
      expect(row(convert('1516239022'), 'Day of week')).toBe('Thursday');
    });
  });

  describe('ISO 8601 round-trip', () => {
    it('parses an ISO string and re-renders the canonical ISO of the same instant', () => {
      const r = convert('2018-01-18T01:30:22Z');
      expect(r.valid).toBe(true);
      expect(r.detected).toBe('date string');
      expect(row(r, 'ISO 8601 (UTC)')).toBe('2018-01-18T01:30:22.000Z');
      expect(row(r, 'Unix (seconds)')).toBe('1516239022');
      expect(row(r, 'Unix (milliseconds)')).toBe(String(ANCHOR_MS));
    });

    it('round-trips: epoch -> ISO row -> epoch yields the original seconds', () => {
      const fromEpoch = convert('1516239022');
      const iso = row(fromEpoch, 'ISO 8601 (UTC)');
      const reparsed = convert(iso);
      expect(reparsed.valid).toBe(true);
      expect(row(reparsed, 'Unix (seconds)')).toBe('1516239022');
    });
  });

  describe('"0" is the Unix epoch', () => {
    it('renders 1970-01-01T00:00:00Z (a Thursday)', () => {
      const r = convert('0');
      expect(r.valid).toBe(true);
      expect(r.detected).toBe('epoch seconds');
      expect(row(r, 'Unix (seconds)')).toBe('0');
      expect(row(r, 'Unix (milliseconds)')).toBe('0');
      expect(row(r, 'ISO 8601 (UTC)')).toBe('1970-01-01T00:00:00.000Z');
      expect(row(r, 'Day of week')).toBe('Thursday');
    });
  });

  describe('relative offset against a fixed nowMs', () => {
    it('a now five minutes later than the instant reads as "ago"', () => {
      const now = ANCHOR_MS + 5 * 60 * 1000; // 5 minutes after the instant
      const r = convert('1516239022000', now);
      expect(row(r, 'Relative')).toBe('5 minutes ago');
    });

    it('a now five minutes before the instant reads as "in"', () => {
      const now = ANCHOR_MS - 5 * 60 * 1000; // 5 minutes before the instant
      const r = convert('1516239022000', now);
      expect(row(r, 'Relative')).toBe('in 5 minutes');
    });

    it('singularizes a one-unit offset', () => {
      const now = ANCHOR_MS + 60 * 60 * 1000; // exactly one hour later
      const r = convert('1516239022000', now);
      expect(row(r, 'Relative')).toBe('1 hour ago');
    });

    it('sub-second offsets read as "just now"', () => {
      const r = convert('1516239022000', ANCHOR_MS + 200);
      expect(row(r, 'Relative')).toBe('just now');
    });

    it('chooses the largest fitting unit (days, not hours)', () => {
      const now = ANCHOR_MS + 3 * 24 * 60 * 60 * 1000; // 3 days later
      const r = convert('1516239022000', now);
      expect(row(r, 'Relative')).toBe('3 days ago');
    });
  });

  describe('invalid input', () => {
    it('flags an empty string without throwing', () => {
      const r = convert('');
      expect(r.valid).toBe(false);
      expect(r.error).toBeTruthy();
      expect(r.rows).toEqual([]);
    });

    it('flags whitespace-only input', () => {
      const r = convert('   ');
      expect(r.valid).toBe(false);
      expect(r.rows).toEqual([]);
    });

    it('flags unparseable text', () => {
      const r = convert('not a timestamp');
      expect(r.valid).toBe(false);
      expect(r.error).toBeTruthy();
      expect(r.rows).toEqual([]);
    });

    it('never throws on hostile input', () => {
      for (const bad of ['', '   ', 'xyz', '2018-99-99', '🙂', 'NaN']) {
        expect(() => convert(bad)).not.toThrow();
      }
    });
  });
});

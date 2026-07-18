import { describe, it, expect } from 'vitest';
import { verifyClaims } from './verify';

describe('cron verifyClaims()', () => {
  describe('base input', () => {
    it('is invalid for an unparseable expression', () => {
      const r = verifyClaims('not a cron', []);
      expect(r.valid).toBe(false);
      expect(r.error).toBeTruthy();
    });

    it('is valid with zero checks when no rows are given', () => {
      const r = verifyClaims('0 9 * * *', []);
      expect(r.valid).toBe(true);
      expect(r.checks).toEqual([]);
      expect(r.summary).toBe('No claims entered yet.');
    });
  });

  describe('fires-at / does-not-fire-at', () => {
    const EXPR = '0 9 * * 1-5'; // 9am on weekdays

    it('matches a correct fires-at claim', () => {
      // 2024-01-15 is a Monday.
      const r = verifyClaims(EXPR, [{ kind: 'fires-at', when: '2024-01-15T09:00' }]);
      expect(r.checks[0].verdict).toBe('match');
    });

    it('matches a correct does-not-fire-at claim (weekend)', () => {
      // 2024-01-13 is a Saturday.
      const r = verifyClaims(EXPR, [{ kind: 'does-not-fire-at', when: '2024-01-13T09:00' }]);
      expect(r.checks[0].verdict).toBe('match');
    });

    it('flags a wrong fires-at claim (wrong hour)', () => {
      const r = verifyClaims(EXPR, [{ kind: 'fires-at', when: '2024-01-15T10:00' }]);
      expect(r.checks[0].verdict).toBe('mismatch');
    });

    it('flags a wrong does-not-fire-at claim', () => {
      const r = verifyClaims(EXPR, [{ kind: 'does-not-fire-at', when: '2024-01-15T09:00' }]);
      expect(r.checks[0].verdict).toBe('mismatch');
    });

    it('marks an unparseable date unreadable, not a mismatch', () => {
      const r = verifyClaims(EXPR, [{ kind: 'fires-at', when: 'whenever' }]);
      expect(r.checks[0].verdict).toBe('unreadable');
      expect(r.mismatchCount).toBe(0);
    });

  });

  describe('the "0 0 1 * 1" OR-rule trap', () => {
    const EXPR = '0 0 1 * 1'; // midnight on the 1st OF THE MONTH, or every Monday

    it('fires on a Monday that is not the 1st (OR semantics)', () => {
      // 2024-01-08 is a Monday, not the 1st.
      const r = verifyClaims(EXPR, [{ kind: 'fires-at', when: '2024-01-08T00:00' }]);
      expect(r.checks[0].verdict).toBe('match');
    });

    it('flags an AND-assumption mismatch with the OR-rule note', () => {
      // An AI assuming AND semantics would (wrongly) claim this does NOT fire.
      const r = verifyClaims(EXPR, [{ kind: 'does-not-fire-at', when: '2024-01-08T00:00' }]);
      expect(r.checks[0].verdict).toBe('mismatch');
      expect(r.checks[0].note).toMatch(/OR rule/i);
    });

    it('does not fire on a date that is neither the 1st nor a Monday', () => {
      // 2024-01-09 is a Tuesday, not the 1st.
      const r = verifyClaims(EXPR, [{ kind: 'does-not-fire-at', when: '2024-01-09T00:00' }]);
      expect(r.checks[0].verdict).toBe('match');
    });

    it('fires on the 1st even when it is not a Monday', () => {
      // 2024-02-01 is a Thursday.
      const r = verifyClaims(EXPR, [{ kind: 'fires-at', when: '2024-02-01T00:00' }]);
      expect(r.checks[0].verdict).toBe('match');
    });

    // Regression: `Date.parse` treats a bare "YYYY-MM-DD" as UTC MIDNIGHT but
    // "YYYY-MM-DDT00:00" as LOCAL midnight, and cron matches in LOCAL time —
    // on a machine whose timezone isn't UTC, an unnormalized date-only claim
    // lands at the wrong wall-clock hour and this expression (which only
    // fires at exactly local 00:00) would wrongly read as "does not fire".
    it('reads a date-only claim ("YYYY-MM-DD") as LOCAL midnight, not UTC midnight', () => {
      const r = verifyClaims(EXPR, [{ kind: 'fires-at', when: '2024-01-08' }]);
      expect(r.checks[0].verdict).toBe('match');
    });
  });

  describe('next-run-after', () => {
    const EXPR = '0 9 * * 1-5';

    it('matches the correct next fire time', () => {
      const r = verifyClaims(EXPR, [
        { kind: 'next-run-after', when: '2024-01-15T08:00', claimedNext: '2024-01-15T09:00' },
      ]);
      expect(r.checks[0].verdict).toBe('match');
    });

    it('rolls over to the next weekday when claimed from after the fire time', () => {
      // After 09:00 Monday, the next weekday 9am fire is Tuesday.
      const r = verifyClaims(EXPR, [
        { kind: 'next-run-after', when: '2024-01-15T09:00', claimedNext: '2024-01-16T09:00' },
      ]);
      expect(r.checks[0].verdict).toBe('match');
    });

    it('flags a wrong next-run claim', () => {
      const r = verifyClaims(EXPR, [
        { kind: 'next-run-after', when: '2024-01-15T08:00', claimedNext: '2024-01-15T10:00' },
      ]);
      expect(r.checks[0].verdict).toBe('mismatch');
      expect(r.checks[0].actual).toContain('2024-01-15');
    });

    // Regression: matchesAt() memoizes its parse of the LAST expression seen
    // (a performance fix — see engine.ts), so alternating between two
    // different expressions in the same process must still resolve each one
    // correctly and never read the other's cached parse.
    it('resolves the next run correctly across two DIFFERENT expressions in a row', () => {
      const a = verifyClaims('0 9 * * 1-5', [
        { kind: 'next-run-after', when: '2024-01-15T08:00', claimedNext: '2024-01-15T09:00' },
      ]);
      const b = verifyClaims('0 0 1 * 1', [
        { kind: 'next-run-after', when: '2024-01-01T00:00', claimedNext: '2024-01-08T00:00' },
      ]);
      const aAgain = verifyClaims('0 9 * * 1-5', [
        { kind: 'next-run-after', when: '2024-01-15T08:00', claimedNext: '2024-01-15T09:00' },
      ]);
      expect(a.checks[0].verdict).toBe('match');
      expect(b.checks[0].verdict).toBe('match');
      expect(aAgain.checks[0].verdict).toBe('match');
    });

    // A never-firing expression (Feb 31st doesn't exist) must resolve
    // quickly and correctly rather than scanning the full 5-year horizon at
    // full parse cost on every iteration.
    it('resolves a never-firing expression to "never" without hanging', () => {
      const r = verifyClaims('0 0 31 2 *', [
        { kind: 'next-run-after', when: '2024-01-01T00:00', claimedNext: '2024-01-01T00:00' },
      ]);
      expect(r.checks[0].verdict).toBe('mismatch');
      expect(r.checks[0].actual).toMatch(/never/i);
    });

    it('marks unparseable dates unreadable', () => {
      const r = verifyClaims(EXPR, [
        { kind: 'next-run-after', when: 'soon', claimedNext: 'later' },
      ]);
      expect(r.checks[0].verdict).toBe('unreadable');
    });

    it('is skipped entirely when claimedNext is missing', () => {
      const r = verifyClaims(EXPR, [{ kind: 'next-run-after', when: '2024-01-15T08:00' }]);
      expect(r.checks).toEqual([]);
    });
  });

  it('checks multiple rows independently', () => {
    const r = verifyClaims('0 9 * * 1-5', [
      { kind: 'fires-at', when: '2024-01-15T09:00' },
      { kind: 'does-not-fire-at', when: '2024-01-13T09:00' },
    ]);
    expect(r.checks).toHaveLength(2);
    expect(r.checks.every((c) => c.verdict === 'match')).toBe(true);
  });

  it('never throws on adversarial input', () => {
    expect(() =>
      verifyClaims('* * * * * * * *', [
        { kind: 'fires-at', when: '' },
        { kind: 'next-run-after', when: '{}', claimedNext: 'nope' },
      ]),
    ).not.toThrow();
  });
});

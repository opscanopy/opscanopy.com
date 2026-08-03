import { describe, it, expect } from 'vitest';
import { explain, nextRunEpochSeconds, nextRuns, matchesAt } from './engine';

describe('explain — "every N" is only claimed when the list really tiles the field', () => {
  it('does not fabricate "Every 45 minutes" for 0,45 (the real gap is 15 minutes)', () => {
    expect(explain('0,45 * * * *').description).toBe('Minute 0 and 45 of every hour.');
  });

  it('does not fabricate "Every 59 minutes" for 0,59', () => {
    expect(explain('0,59 * * * *').description).toBe('Minute 0 and 59 of every hour.');
  });

  it('does not fabricate "Every 23 hours" for hours 0,23', () => {
    expect(explain('0 0,23 * * *').description).toBe('At 00:00 and 23:00.');
  });

  it('enumerates */5 hours honestly — 20:00 → 00:00 is a 4-hour gap, not 5', () => {
    expect(explain('0 */5 * * *').description).toBe(
      'At 00:00, 05:00, 10:00, 15:00, and 20:00.',
    );
  });

  it('still says "Every 15 minutes" for a genuinely tiling list', () => {
    expect(explain('0,15,30,45 * * * *').description).toBe('Every 15 minutes.');
  });

  it('still says "Every N" for real step expressions that tile', () => {
    expect(explain('*/5 * * * *').description).toBe('Every 5 minutes.');
    expect(explain('*/15 * * * *').description).toBe('Every 15 minutes.');
    expect(explain('0 */2 * * *').description).toBe('Every 2 hours at :00.');
    expect(explain('0 */6 * * *').description).toBe('Every 6 hours at :00.');
  });
});

describe('nextRunEpochSeconds', () => {
  it('returns a real epoch for the next local midnight after `from`', () => {
    const from = '2026-07-19T10:00:00Z';
    const [first] = nextRunEpochSeconds('0 0 * * *', 1, from);
    // Cron expressions are local-time based (matching real crontab semantics —
    // see the documented UTC-vs-local fix in cron-tester's verify engine), so
    // assert on local wall-clock fields rather than a hardcoded UTC epoch.
    const d = new Date(first * 1000);
    expect(d.getHours()).toBe(0);
    expect(d.getMinutes()).toBe(0);
    expect(d.getSeconds()).toBe(0);
    expect(d.getTime()).toBeGreaterThan(Date.parse(from));
  });

  it('returns an empty array for an invalid expression', () => {
    expect(nextRunEpochSeconds('not a cron expression')).toEqual([]);
  });

  it('returns an empty array for @reboot (no schedulable times)', () => {
    expect(nextRunEpochSeconds('@reboot')).toEqual([]);
  });

  it('respects the requested count', () => {
    const runs = nextRunEpochSeconds('0 0 * * *', 3, '2026-07-19T10:00:00Z');
    expect(runs).toHaveLength(3);
    expect(runs[1]).toBeGreaterThan(runs[0]);
    expect(runs[2]).toBeGreaterThan(runs[1]);
  });
});

/* ── Timezone ────────────────────────────────────────────────────────────────
 * A crontab fires on the wall clock of the HOST's timezone. This engine matched
 * against Date#getHours(), i.e. the visitor's laptop — a defensible default
 * (see verify.ts's local-time note) that was never labelled, so a next-run time
 * computed in Asia/Calcutta was presented as fact to someone whose job runs in
 * a UTC container. The zone is now explicit, selectable, and reported back.
 * ------------------------------------------------------------------------- */

describe('timezone — explicit, selectable, reported', () => {
  const at = (iso: string) => Math.floor(Date.parse(iso) / 1000);
  const from = '2026-03-07T12:00:00.000Z'; // Saturday before US spring-forward

  it('omitting the option keeps the runtime zone — no behaviour change', () => {
    const runtime = Intl.DateTimeFormat().resolvedOptions().timeZone;
    expect(nextRunEpochSeconds('0 2 * * *', 1, from)).toEqual(
      nextRunEpochSeconds('0 2 * * *', 1, from, { timeZone: runtime }),
    );
  });

  it('an explicit zone changes the instant', () => {
    // 02:00 UTC on the 8th.
    expect(nextRunEpochSeconds('0 2 * * *', 1, from, { timeZone: 'UTC' })[0]).toBe(
      at('2026-03-08T02:00:00Z'),
    );
    // 09:00 IST on the 8th = 03:30Z.
    expect(nextRunEpochSeconds('0 9 * * *', 1, from, { timeZone: 'Asia/Kolkata' })[0]).toBe(
      at('2026-03-08T03:30:00Z'),
    );
  });

  it('spring-forward: a wall time that does not exist is skipped', () => {
    // 02:00 EST would be 07:00Z, but 2026-03-08 has no 02:xx wall hour in New
    // York, so the next fire is 02:00 EDT on the 9th = 06:00Z. The old
    // setMinutes(+1) walk lost the hour and returned nothing for that day.
    expect(nextRunEpochSeconds('0 2 * * *', 1, from, { timeZone: 'America/New_York' })[0]).toBe(
      at('2026-03-09T06:00:00Z'),
    );
  });

  it('fall-back: a repeated wall time fires once, on its first occurrence', () => {
    const f = '2026-11-01T00:00:00.000Z';
    const runs = nextRunEpochSeconds('30 1 * * *', 2, f, { timeZone: 'America/New_York' });
    expect(runs[0]).toBe(at('2026-11-01T05:30:00Z')); // 01:30 EDT
    expect(runs[1]).not.toBe(at('2026-11-01T06:30:00Z')); // not the 01:30 EST repeat
  });

  it('matchesAt honours the zone', () => {
    const t = new Date('2026-03-08T03:30:00Z'); // 09:00 IST
    expect(matchesAt('0 9 * * *', t, { timeZone: 'Asia/Kolkata' })).toBe(true);
    expect(matchesAt('0 9 * * *', t, { timeZone: 'UTC' })).toBe(false);
  });

  it('nextRuns renders the wall time of the chosen zone', () => {
    const [s] = nextRuns('0 9 * * *', 1, from, { timeZone: 'Asia/Kolkata' });
    expect(s).toMatch(/09:00/);
    const [u] = nextRuns('0 9 * * *', 1, from, { timeZone: 'UTC' });
    expect(u).toMatch(/09:00/); // same wall time, different instant
  });

  it('explain reports the zone it actually used, so the UI can label it', () => {
    expect(explain('0 9 * * *', { timeZone: 'Asia/Kolkata' }).timeZone).toBe('Asia/Kolkata');
    expect(explain('0 9 * * *', { timeZone: 'UTC' }).timeZone).toBe('UTC');
    expect(explain('0 9 * * *').timeZone).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone);
  });

  it('an unknown zone is a friendly error, never a throw', () => {
    const bad = { timeZone: 'Mars/Olympus' };
    expect(() => explain('* * * * *', bad)).not.toThrow();
    const r = explain('* * * * *', bad);
    expect(r.valid).toBe(false);
    expect(r.error).toMatch(/Mars\/Olympus/);
    expect(nextRunEpochSeconds('* * * * *', 1, from, bad)).toEqual([]);
    expect(nextRuns('* * * * *', 1, from, bad)).toEqual([]);
    expect(matchesAt('* * * * *', new Date(from), bad)).toBe(false);
  });

  it('a half-hour zone lands on :30, not :00', () => {
    // Regression guard for any future "offset in whole hours" shortcut.
    const [r] = nextRunEpochSeconds('0 0 * * *', 1, from, { timeZone: 'Asia/Kolkata' });
    expect(new Date(r * 1000).toISOString()).toBe('2026-03-07T18:30:00.000Z');
  });
});

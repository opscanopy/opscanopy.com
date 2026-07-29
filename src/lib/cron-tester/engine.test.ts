import { describe, it, expect } from 'vitest';
import { explain, nextRunEpochSeconds } from './engine';

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

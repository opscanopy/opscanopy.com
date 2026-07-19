import { describe, it, expect } from 'vitest';
import { nextRunEpochSeconds } from './engine';

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

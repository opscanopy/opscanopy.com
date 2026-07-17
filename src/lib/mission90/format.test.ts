/**
 * Mission 90 Days — shared display formatters. Pure functions, no DOM.
 * Consolidates three near-duplicate implementations that had already drifted
 * (one didn't clamp negative/fractional seconds) across complete.astro,
 * missions/index.astro, and MissionTerminal.astro.
 */
import { describe, it, expect } from 'vitest';
import { formatDuration, fmtDate } from './format';

describe('formatDuration()', () => {
  it('formats whole seconds as m:ss', () => {
    expect(formatDuration(0)).toBe('0:00');
    expect(formatDuration(59)).toBe('0:59');
    expect(formatDuration(60)).toBe('1:00');
    expect(formatDuration(125)).toBe('2:05');
  });

  it('pads seconds under 10', () => {
    expect(formatDuration(65)).toBe('1:05');
  });

  it('clamps negative seconds to zero (imported codes can carry corrupt values)', () => {
    expect(formatDuration(-125)).toBe('0:00');
  });

  it('rounds fractional seconds', () => {
    expect(formatDuration(89.6)).toBe('1:30');
    expect(formatDuration(89.4)).toBe('1:29');
  });
});

describe('fmtDate()', () => {
  it('formats an ISO string as a short date', () => {
    expect(fmtDate('2026-01-05T00:00:00.000Z', 'en-US')).toBe('Jan 5, 2026');
  });

  it('returns the input unchanged on an unparseable date (never throws)', () => {
    expect(fmtDate('garbage', 'en-US')).toBe('garbage');
    expect(() => fmtDate('garbage')).not.toThrow();
  });
});

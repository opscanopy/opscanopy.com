/**
 * Shared relative-time formatter tests. These strings are consumed by BOTH
 * the Timestamp Converter's "Relative" row and the JWT Decoder's claim
 * annotations — both tools' engine tests pin them, so they are contractual.
 */
import { describe, it, expect } from 'vitest';
import { relative } from './relative-time';

const NOW = Date.UTC(2026, 6, 25, 12, 0, 0);

describe('relative()', () => {
  it.each([
    [NOW - 5 * 60_000, '5 minutes ago'],
    [NOW - 60 * 60_000, '1 hour ago'],
    [NOW - 3 * 86_400_000, '3 days ago'],
    [NOW + 42 * 60_000, 'in 42 minutes'],
    [NOW + 2 * 86_400_000, 'in 2 days'],
    [NOW + 500, 'just now'],
  ])('formats %d as "%s"', (ms, expected) => {
    expect(relative(ms, NOW)).toBe(expected);
  });
});

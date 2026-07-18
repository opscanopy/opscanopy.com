import { describe, it, expect } from 'vitest';
import {
  TOOL_PREFS_KEY,
  parseToolPrefs,
  serializeToolPrefs,
  isPinned,
  togglePin,
  recordRecent,
  unpinnedRecentSlugs,
  type ToolPrefs,
} from './prefs';

describe('parseToolPrefs', () => {
  it('yields empty prefs for null, empty, and garbage input', () => {
    const empty = { v: 1, pins: [], recents: [] };
    expect(parseToolPrefs(null)).toEqual(empty);
    expect(parseToolPrefs('')).toEqual(empty);
    expect(parseToolPrefs('not json')).toEqual(empty);
    expect(parseToolPrefs('[1,2,3]')).toEqual(empty);
    expect(parseToolPrefs('"just a string"')).toEqual(empty);
    expect(parseToolPrefs('42')).toEqual(empty);
  });

  it('keeps well-formed pins and recents', () => {
    const raw = JSON.stringify({
      v: 1,
      pins: ['subnet-calculator', 'jwt-decoder'],
      recents: [{ slug: 'cron-expression-tester', at: '2026-07-18T10:00:00.000Z' }],
    });
    expect(parseToolPrefs(raw)).toEqual({
      v: 1,
      pins: ['subnet-calculator', 'jwt-decoder'],
      recents: [{ slug: 'cron-expression-tester', at: '2026-07-18T10:00:00.000Z' }],
    });
  });

  it('drops malformed pin entries but keeps the valid ones', () => {
    const raw = JSON.stringify({ pins: ['subnet-calculator', 123, null, 'BAD SLUG', '../etc'], recents: [] });
    expect(parseToolPrefs(raw).pins).toEqual(['subnet-calculator']);
  });

  it('deduplicates pins', () => {
    const raw = JSON.stringify({ pins: ['subnet-calculator', 'subnet-calculator'], recents: [] });
    expect(parseToolPrefs(raw).pins).toEqual(['subnet-calculator']);
  });

  // Regression: consumers key plain objects/Maps by slug (the shelf-reveal
  // scripts) — a slug like "constructor" passes the plain regex and can
  // collide with Object.prototype in a naive `{}`-keyed lookup, so it must
  // be rejected here regardless of how careful every caller is.
  it('rejects slugs that collide with JS prototype properties', () => {
    const raw = JSON.stringify({
      pins: ['constructor', 'prototype', '__proto__', 'subnet-calculator'],
      recents: [],
    });
    expect(parseToolPrefs(raw).pins).toEqual(['subnet-calculator']);
  });

  it('caps pins at 10 and recents at 8', () => {
    const pins = Array.from({ length: 15 }, (_, i) => `tool-${i}`);
    const recents = Array.from({ length: 12 }, (_, i) => ({ slug: `tool-${i}`, at: '2026-07-18T10:00:00.000Z' }));
    const raw = JSON.stringify({ pins, recents });
    const parsed = parseToolPrefs(raw);
    expect(parsed.pins).toHaveLength(10);
    expect(parsed.recents).toHaveLength(8);
  });

  it('drops recents with an invalid date or missing slug', () => {
    const raw = JSON.stringify({
      pins: [],
      recents: [
        { slug: 'subnet-calculator', at: 'not a date' },
        { slug: 123, at: '2026-07-18T10:00:00.000Z' },
        { at: '2026-07-18T10:00:00.000Z' },
        { slug: 'jwt-decoder', at: '2026-07-18T10:00:00.000Z' },
      ],
    });
    expect(parseToolPrefs(raw).recents).toEqual([{ slug: 'jwt-decoder', at: '2026-07-18T10:00:00.000Z' }]);
  });

  it('round-trips through serializeToolPrefs', () => {
    const prefs: ToolPrefs = {
      v: 1,
      pins: ['subnet-calculator'],
      recents: [{ slug: 'jwt-decoder', at: '2026-07-18T10:00:00.000Z' }],
    };
    expect(parseToolPrefs(serializeToolPrefs(prefs))).toEqual(prefs);
  });

  it('exports the storage key page scripts write under', () => {
    expect(TOOL_PREFS_KEY).toBe('oc-tools-v1');
  });
});

describe('isPinned / togglePin', () => {
  const empty: ToolPrefs = { v: 1, pins: [], recents: [] };

  it('reports pinned state correctly', () => {
    const prefs = togglePin(empty, 'subnet-calculator');
    expect(isPinned(prefs, 'subnet-calculator')).toBe(true);
    expect(isPinned(prefs, 'jwt-decoder')).toBe(false);
  });

  it('pins a new slug to the front', () => {
    let prefs = togglePin(empty, 'subnet-calculator');
    prefs = togglePin(prefs, 'jwt-decoder');
    expect(prefs.pins).toEqual(['jwt-decoder', 'subnet-calculator']);
  });

  it('unpins an already-pinned slug', () => {
    let prefs = togglePin(empty, 'subnet-calculator');
    prefs = togglePin(prefs, 'subnet-calculator');
    expect(prefs.pins).toEqual([]);
  });

  it('drops the oldest pin when the cap is exceeded', () => {
    let prefs = empty;
    for (let i = 0; i < 10; i++) prefs = togglePin(prefs, `tool-${i}`);
    expect(prefs.pins).toHaveLength(10);
    prefs = togglePin(prefs, 'tool-10');
    expect(prefs.pins).toHaveLength(10);
    expect(prefs.pins[0]).toBe('tool-10');
    expect(prefs.pins).not.toContain('tool-0');
  });

  it('ignores a malformed slug rather than throwing', () => {
    expect(() => togglePin(empty, '../etc/passwd')).not.toThrow();
    expect(togglePin(empty, '')).toEqual(empty);
  });
});

describe('recordRecent', () => {
  const empty: ToolPrefs = { v: 1, pins: [], recents: [] };

  it('records a new recent to the front', () => {
    const prefs = recordRecent(empty, 'subnet-calculator', '2026-07-18T10:00:00.000Z');
    expect(prefs.recents).toEqual([{ slug: 'subnet-calculator', at: '2026-07-18T10:00:00.000Z' }]);
  });

  it('moves a re-visited slug to the front instead of duplicating it', () => {
    let prefs = recordRecent(empty, 'subnet-calculator', '2026-07-18T09:00:00.000Z');
    prefs = recordRecent(prefs, 'jwt-decoder', '2026-07-18T09:30:00.000Z');
    prefs = recordRecent(prefs, 'subnet-calculator', '2026-07-18T10:00:00.000Z');
    expect(prefs.recents).toEqual([
      { slug: 'subnet-calculator', at: '2026-07-18T10:00:00.000Z' },
      { slug: 'jwt-decoder', at: '2026-07-18T09:30:00.000Z' },
    ]);
  });

  it('caps recents at 8, dropping the oldest', () => {
    let prefs = empty;
    for (let i = 0; i < 9; i++) {
      prefs = recordRecent(prefs, `tool-${i}`, `2026-07-18T${String(i).padStart(2, '0')}:00:00.000Z`);
    }
    expect(prefs.recents).toHaveLength(8);
    expect(prefs.recents[0].slug).toBe('tool-8');
    expect(prefs.recents.some((r) => r.slug === 'tool-0')).toBe(false);
  });

  it('ignores a malformed slug rather than throwing', () => {
    expect(recordRecent(empty, '', '2026-07-18T10:00:00.000Z')).toEqual(empty);
  });
});

describe('unpinnedRecentSlugs', () => {
  it('excludes slugs that are already pinned', () => {
    let prefs: ToolPrefs = { v: 1, pins: [], recents: [] };
    prefs = togglePin(prefs, 'subnet-calculator');
    prefs = recordRecent(prefs, 'subnet-calculator', '2026-07-18T10:00:00.000Z');
    prefs = recordRecent(prefs, 'jwt-decoder', '2026-07-18T09:00:00.000Z');
    expect(unpinnedRecentSlugs(prefs)).toEqual(['jwt-decoder']);
  });

  it('returns an empty list when everything recent is pinned', () => {
    let prefs: ToolPrefs = { v: 1, pins: [], recents: [] };
    prefs = togglePin(prefs, 'subnet-calculator');
    prefs = recordRecent(prefs, 'subnet-calculator', '2026-07-18T10:00:00.000Z');
    expect(unpinnedRecentSlugs(prefs)).toEqual([]);
  });
});

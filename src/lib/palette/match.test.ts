import { describe, it, expect } from 'vitest';
import { matchPalette, type PaletteItem } from './match';

const item = (over: Partial<PaletteItem> & { id: string }): PaletteItem => ({
  name: '',
  keywords: [],
  tagline: '',
  category: '',
  ...over,
});

describe('matchPalette — match-type tiers', () => {
  it('ranks a prefix match above a word-boundary match above a subsequence match', () => {
    const items = [
      item({ id: 'sub', name: 'vertical alignment' }), // "cal" is scattered inside "verti-cal", not a word prefix
      item({ id: 'word', name: 'ip calculator' }), // "cal" starts the second word
      item({ id: 'prefix', name: 'calculator suite' }), // "cal" is a true prefix
    ];
    const ranked = matchPalette(items, 'cal').map((m) => m.id);
    expect(ranked).toEqual(['prefix', 'word', 'sub']);
  });

  it('excludes items with no match in any field', () => {
    const items = [item({ id: 'a', name: 'Timestamp Converter', tagline: 'epoch tool' })];
    expect(matchPalette(items, 'zzz')).toEqual([]);
  });

  it('is case-insensitive', () => {
    const items = [item({ id: 'a', name: 'JWT Decoder' })];
    expect(matchPalette(items, 'JWT').map((m) => m.id)).toEqual(['a']);
    expect(matchPalette(items, 'jwt').map((m) => m.id)).toEqual(['a']);
  });
});

describe('matchPalette — field tiers', () => {
  it('ranks a name prefix match above a keywords prefix match above a tagline prefix match above a category prefix match', () => {
    const items = [
      item({ id: 'category', name: 'x', category: 'cron tools' }),
      item({ id: 'tagline', name: 'y', tagline: 'cron scheduling helper' }),
      item({ id: 'keywords', name: 'z', keywords: ['cron expression tester'] }),
      item({ id: 'name', name: 'cron expression tester' }),
    ];
    const ranked = matchPalette(items, 'cron').map((m) => m.id);
    expect(ranked).toEqual(['name', 'keywords', 'tagline', 'category']);
  });

  it('takes the best matching field, not an accumulation across fields', () => {
    const items = [
      item({ id: 'multi', name: 'x', keywords: ['docker', 'docker compose'], tagline: 'docker helper' }),
      item({ id: 'single-name', name: 'docker' }),
    ];
    // Both should tie at the "name" field tier for "single-name" vs "keywords" tier for "multi" —
    // name beats keywords regardless of how many keyword fields also match.
    const ranked = matchPalette(items, 'docker').map((m) => m.id);
    expect(ranked).toEqual(['single-name', 'multi']);
  });
});

describe('matchPalette — boost', () => {
  it('breaks a tie between two equal text matches in favor of the pinned item', () => {
    const items = [
      item({ id: 'unpinned', name: 'cron expression tester' }),
      item({ id: 'pinned', name: 'cron to systemd' }),
    ];
    const ranked = matchPalette(items, 'cron', { pinned: ['pinned'] }).map((m) => m.id);
    expect(ranked[0]).toBe('pinned');
  });

  it('never lets a pin boost override a genuinely better text match', () => {
    const items = [
      item({ id: 'pinned-weak', name: 'ip calculator' }), // word-boundary match on "cal", weaker than a prefix
      item({ id: 'unpinned-strong', name: 'calculator suite' }), // prefix match on "cal"
    ];
    const ranked = matchPalette(items, 'cal', { pinned: ['pinned-weak'] }).map((m) => m.id);
    expect(ranked[0]).toBe('unpinned-strong');
  });

  it('scores more-recent items above less-recent ones when text matches tie', () => {
    const items = [
      item({ id: 'a', name: 'cron expression tester' }),
      item({ id: 'b', name: 'cron to systemd' }),
      item({ id: 'c', name: 'cron cheat sheet' }),
    ];
    const ranked = matchPalette(items, 'cron', { recents: ['c', 'a'] }).map((m) => m.id);
    expect(ranked[0]).toBe('c');
    expect(ranked[1]).toBe('a');
  });

  it('browse mode (empty query) orders pinned first, then recents, then registry order', () => {
    const items = [
      item({ id: 'a' }),
      item({ id: 'b' }),
      item({ id: 'c' }),
      item({ id: 'd' }),
    ];
    const ranked = matchPalette(items, '', { pinned: ['c'], recents: ['b'] }).map((m) => m.id);
    expect(ranked[0]).toBe('c');
    expect(ranked[1]).toBe('b');
    expect(ranked.slice(2)).toEqual(['a', 'd']);
  });

  it('browse mode with no boost data at all returns registry order', () => {
    const items = [item({ id: 'a' }), item({ id: 'b' })];
    expect(matchPalette(items, '').map((m) => m.id)).toEqual(['a', 'b']);
    expect(matchPalette(items, '  ').map((m) => m.id)).toEqual(['a', 'b']);
  });
});

/**
 * chips.ts against DOM-shaped fakes (node environment).
 */
import { describe, it, expect } from 'vitest';
import { CHIP_SELECTOR, chipsIn, syncChips, syncChipsByInput, syncChipsByIndex, clearChips, type ChipLike } from './chips';

/** `data` keys are written as data-* attributes (chips.ts reads attributes, not dataset). */
function chip(data: Record<string, string>, pressed = 'false'): ChipLike & { attrs: Map<string, string> } {
  const kebab = (k: string) => 'data-' + k.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase());
  const attrs = new Map<string, string>([['aria-pressed', pressed], ...Object.entries(data).map(([k, v]) => [kebab(k), v] as [string, string])]);
  return {
    attrs,
    getAttribute: (n) => attrs.get(n) ?? null,
    setAttribute: (n, v) => void attrs.set(n, v),
  };
}

function group(chips: ChipLike[]) {
  const seen: string[] = [];
  return { seen, querySelectorAll: (sel: string) => (seen.push(sel), chips) };
}

const pressed = (cs: Array<{ attrs: Map<string, string> }>) => cs.map((c) => c.attrs.get('aria-pressed'));

describe('chips', () => {
  it('queries the kit hook, never a local chip class', () => {
    const g = group([]);
    chipsIn(g);
    expect(g.seen).toEqual([CHIP_SELECTOR]);
    expect(CHIP_SELECTOR).toBe('.chip[aria-pressed]');
    expect(chipsIn(null)).toEqual([]);
  });

  it('syncChipsByInput presses exactly the chip whose data-input matches', () => {
    const cs = [chip({ input: '10.0.0.0/8' }, 'true'), chip({ input: '192.168.1.0/24' }), chip({ input: '2001:db8::/48' })];
    expect(syncChipsByInput(group(cs), '192.168.1.0/24')).toBe(1);
    expect(pressed(cs)).toEqual(['false', 'true', 'false']);
    expect(syncChipsByInput(group(cs), 'typed by hand')).toBe(0);
    expect(pressed(cs)).toEqual(['false', 'false', 'false']);
  });

  it('syncChipsByIndex presses by data-example-idx; null releases all', () => {
    const cs = [chip({ exampleIdx: '0' }, 'true'), chip({ exampleIdx: '1' }), chip({ exampleIdx: '2' })];
    syncChipsByIndex(group(cs), 2);
    expect(pressed(cs)).toEqual(['false', 'false', 'true']);
    syncChipsByIndex(group(cs), null);
    expect(pressed(cs)).toEqual(['false', 'false', 'false']);
  });

  it('syncChips takes any predicate (timezone chips key on data-zone) and always writes a value', () => {
    const cs = [chip({ zone: 'UTC' }), chip({ zone: 'Europe/Berlin' }, 'true')];
    expect(syncChips(group(cs), (c) => c.getAttribute('data-zone') === 'UTC')).toBe(1);
    expect(pressed(cs)).toEqual(['true', 'false']);
    clearChips(group(cs));
    expect(pressed(cs)).toEqual(['false', 'false']);
    clearChips(null); // no group: a no-op
  });
});

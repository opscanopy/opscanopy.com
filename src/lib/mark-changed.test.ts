/**
 * mark-changed — the amber "this value just changed" tick on instrument rows.
 *
 * Pure diff (`diffKeys`) + a DOM-shaped snapshot/mark pair that only needs
 * `querySelectorAll`, `getAttribute`, `textContent`, `setAttribute` and
 * `removeAttribute`, so it runs here in vitest's node environment against
 * minimal fakes and in the browser against real elements.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { diffKeys, snapshotValues, markChanged } from './mark-changed';

type FakeEl = {
  attrs: Map<string, string>;
  textContent: string | null;
  getAttribute(name: string): string | null;
  setAttribute(name: string, value: string): void;
  removeAttribute(name: string): void;
};

function fakeEl(key: string, text: string): FakeEl {
  const attrs = new Map<string, string>([['data-k', key]]);
  return {
    attrs,
    textContent: text,
    getAttribute: (n) => attrs.get(n) ?? null,
    setAttribute: (n, v) => void attrs.set(n, v),
    removeAttribute: (n) => void attrs.delete(n),
  };
}

function fakeRoot(els: FakeEl[]) {
  return { querySelectorAll: (_sel: string) => els };
}

describe('diffKeys', () => {
  it('returns nothing on a first render (empty previous snapshot)', () => {
    const next = new Map([['row:Network', '10.0.0.0'], ['row:Broadcast', '10.0.0.255']]);
    expect(diffKeys(new Map(), next)).toEqual([]);
  });

  it('returns nothing when every shared value is unchanged', () => {
    const prev = new Map([['row:Network', '10.0.0.0']]);
    const next = new Map([['row:Network', '10.0.0.0']]);
    expect(diffKeys(prev, next)).toEqual([]);
  });

  it('returns only the keys whose value changed, in next-snapshot order', () => {
    const prev = new Map([['row:Network', '10.0.0.0'], ['row:Mask', '255.255.255.0'], ['stat:Hosts', '254']]);
    const next = new Map([['row:Network', '10.0.0.0'], ['row:Mask', '255.255.0.0'], ['stat:Hosts', '65,534']]);
    expect(diffKeys(prev, next)).toEqual(['row:Mask', 'stat:Hosts']);
  });

  it('ignores keys that were added or removed between renders', () => {
    const prev = new Map([['row:Network', '10.0.0.0'], ['row:Wildcard', '0.0.0.255']]);
    const next = new Map([['row:Network', '10.0.0.0'], ['row:Prefix', '/64']]);
    expect(diffKeys(prev, next)).toEqual([]);
  });
});

describe('snapshotValues', () => {
  it('maps each [data-k] element to its trimmed text', () => {
    const root = fakeRoot([fakeEl('row:Network', '  10.0.0.0 '), fakeEl('stat:Hosts', '254')]);
    expect(snapshotValues(root)).toEqual(new Map([['row:Network', '10.0.0.0'], ['stat:Hosts', '254']]));
  });

  it('reads a custom key attribute when asked', () => {
    const el = fakeEl('ignored', 'x');
    el.attrs.set('data-key', 'custom');
    const root = fakeRoot([el]);
    expect(snapshotValues(root, 'data-key')).toEqual(new Map([['custom', 'x']]));
  });
});

describe('markChanged', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('sets data-changed on changed rows only, and clears it after the ttl', () => {
    vi.useFakeTimers();
    const net = fakeEl('row:Network', '10.0.0.0');
    const mask = fakeEl('row:Mask', '255.255.0.0');
    const root = fakeRoot([net, mask]);
    const prev = new Map([['row:Network', '10.0.0.0'], ['row:Mask', '255.255.255.0']]);

    const changed = markChanged(root, prev, { ttlMs: 700 });

    expect(changed).toEqual(['row:Mask']);
    expect(mask.attrs.has('data-changed')).toBe(true);
    expect(net.attrs.has('data-changed')).toBe(false);

    vi.advanceTimersByTime(699);
    expect(mask.attrs.has('data-changed')).toBe(true);
    vi.advanceTimersByTime(1);
    expect(mask.attrs.has('data-changed')).toBe(false);
  });

  it('marks nothing on a first render and starts no timer', () => {
    vi.useFakeTimers();
    const el = fakeEl('row:Network', '10.0.0.0');
    const changed = markChanged(fakeRoot([el]), new Map());
    expect(changed).toEqual([]);
    expect(el.attrs.has('data-changed')).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('a second call before the ttl restarts the clock for the new marks', () => {
    vi.useFakeTimers();
    const a = fakeEl('row:A', '2');
    const root = fakeRoot([a]);
    markChanged(root, new Map([['row:A', '1']]), { ttlMs: 500 });
    vi.advanceTimersByTime(400);
    a.textContent = '3';
    markChanged(root, new Map([['row:A', '2']]), { ttlMs: 500 });
    vi.advanceTimersByTime(400);
    expect(a.attrs.has('data-changed')).toBe(true);
    vi.advanceTimersByTime(100);
    expect(a.attrs.has('data-changed')).toBe(false);
  });
});

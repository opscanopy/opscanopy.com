import { describe, it, expect } from 'vitest';
import {
  LAST_INPUT_KEY,
  parseLastInputStore,
  serializeLastInputStore,
  recordLastInput,
  getLastInput,
  type LastInputStore,
} from './last-input';

describe('parseLastInputStore', () => {
  it('yields an empty store for null, empty, and garbage input', () => {
    const empty = { v: 1, entries: {} };
    expect(parseLastInputStore(null)).toEqual(empty);
    expect(parseLastInputStore('')).toEqual(empty);
    expect(parseLastInputStore('not json')).toEqual(empty);
    expect(parseLastInputStore('[1,2,3]')).toEqual(empty);
    expect(parseLastInputStore('"a string"')).toEqual(empty);
  });

  it('keeps well-formed entries', () => {
    const raw = JSON.stringify({
      v: 1,
      entries: { 'subnet-calculator': { value: '10.0.0.0/24', at: '2026-07-19T10:00:00.000Z' } },
    });
    expect(parseLastInputStore(raw)).toEqual({
      v: 1,
      entries: { 'subnet-calculator': { value: '10.0.0.0/24', at: '2026-07-19T10:00:00.000Z' } },
    });
  });

  it('drops entries with a malformed slug, missing value, or invalid date', () => {
    const raw = JSON.stringify({
      entries: {
        '../etc': { value: 'x', at: '2026-07-19T10:00:00.000Z' },
        __proto__: { value: 'x', at: '2026-07-19T10:00:00.000Z' },
        good: { value: 'x', at: '2026-07-19T10:00:00.000Z' },
        'bad-date': { value: 'x', at: 'not a date' },
        'no-value': { at: '2026-07-19T10:00:00.000Z' },
      },
    });
    expect(Object.keys(parseLastInputStore(raw).entries)).toEqual(['good']);
  });

  it('round-trips through serializeLastInputStore', () => {
    const store: LastInputStore = {
      v: 1,
      entries: { 'jwt-decoder': { value: 'irrelevant-here', at: '2026-07-19T10:00:00.000Z' } },
    };
    expect(parseLastInputStore(serializeLastInputStore(store))).toEqual(store);
  });

  it('exports the storage key page scripts write under', () => {
    expect(LAST_INPUT_KEY).toBe('oc-last-v1');
  });
});

describe('recordLastInput', () => {
  const empty: LastInputStore = { v: 1, entries: {} };

  it('records a new slug', () => {
    const store = recordLastInput(empty, 'subnet-calculator', '10.0.0.0/24', '2026-07-19T10:00:00.000Z');
    expect(getLastInput(store, 'subnet-calculator')).toBe('10.0.0.0/24');
  });

  it('overwrites the previous value for the same slug', () => {
    let store = recordLastInput(empty, 'subnet-calculator', 'first', '2026-07-19T10:00:00.000Z');
    store = recordLastInput(store, 'subnet-calculator', 'second', '2026-07-19T10:05:00.000Z');
    expect(getLastInput(store, 'subnet-calculator')).toBe('second');
    expect(Object.keys(store.entries)).toHaveLength(1);
  });

  it('is a no-op for a value over the 16KB skip-write cap', () => {
    const huge = 'x'.repeat(16 * 1024 + 1);
    const store = recordLastInput(empty, 'subnet-calculator', huge, '2026-07-19T10:00:00.000Z');
    expect(store).toEqual(empty);
  });

  it('ignores a malformed slug rather than throwing', () => {
    expect(recordLastInput(empty, '../etc/passwd', 'x', '2026-07-19T10:00:00.000Z')).toEqual(empty);
  });

  it('evicts the least-recently-touched slug past the 12-slug cap', () => {
    let store = empty;
    for (let i = 0; i < 12; i++) {
      store = recordLastInput(store, `tool-${i}`, `v${i}`, `2026-07-19T10:${String(i).padStart(2, '0')}:00.000Z`);
    }
    expect(Object.keys(store.entries)).toHaveLength(12);
    store = recordLastInput(store, 'tool-12', 'v12', '2026-07-19T10:12:00.000Z');
    expect(Object.keys(store.entries)).toHaveLength(12);
    expect(getLastInput(store, 'tool-0')).toBeNull();
    expect(getLastInput(store, 'tool-12')).toBe('v12');
  });
});

describe('getLastInput', () => {
  it('returns null for an unknown or malformed slug', () => {
    const store: LastInputStore = { v: 1, entries: {} };
    expect(getLastInput(store, 'unknown-tool')).toBeNull();
    expect(getLastInput(store, '../etc')).toBeNull();
  });
});

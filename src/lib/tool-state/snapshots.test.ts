import { describe, it, expect } from 'vitest';
import {
  SNAPSHOT_KEY,
  parseSnapshotStore,
  serializeSnapshotStore,
  addSnapshot,
  removeSnapshotAt,
  snapshotsForSlug,
  type SnapshotStore,
} from './snapshots';

describe('parseSnapshotStore', () => {
  it('yields an empty store for null, empty, and garbage input', () => {
    const empty = { v: 1, snapshots: [] };
    expect(parseSnapshotStore(null)).toEqual(empty);
    expect(parseSnapshotStore('')).toEqual(empty);
    expect(parseSnapshotStore('not json')).toEqual(empty);
    expect(parseSnapshotStore('[1,2,3]')).toEqual(empty);
  });

  it('keeps well-formed snapshots', () => {
    const raw = JSON.stringify({
      snapshots: [{ slug: 'subnet-calculator', value: '10.0.0.0/24', at: '2026-07-19T10:00:00.000Z' }],
    });
    expect(parseSnapshotStore(raw).snapshots).toEqual([
      { slug: 'subnet-calculator', value: '10.0.0.0/24', at: '2026-07-19T10:00:00.000Z' },
    ]);
  });

  it('drops snapshots with a malformed slug, missing value, or invalid date', () => {
    const raw = JSON.stringify({
      snapshots: [
        { slug: '../etc', value: 'x', at: '2026-07-19T10:00:00.000Z' },
        { slug: 'good', value: 'x', at: '2026-07-19T10:00:00.000Z' },
        { slug: 'bad-date', value: 'x', at: 'not a date' },
        { slug: 'no-value', at: '2026-07-19T10:00:00.000Z' },
      ],
    });
    expect(parseSnapshotStore(raw).snapshots.map((s) => s.slug)).toEqual(['good']);
  });

  it('caps at 30 snapshots when parsing', () => {
    const raw = JSON.stringify({
      snapshots: Array.from({ length: 40 }, (_, i) => ({
        slug: 'subnet-calculator',
        value: `v${i}`,
        at: '2026-07-19T10:00:00.000Z',
      })),
    });
    expect(parseSnapshotStore(raw).snapshots).toHaveLength(30);
  });

  it('round-trips through serializeSnapshotStore', () => {
    const store: SnapshotStore = {
      v: 1,
      snapshots: [{ slug: 'timestamp-converter', value: '1700000000', at: '2026-07-19T10:00:00.000Z' }],
    };
    expect(parseSnapshotStore(serializeSnapshotStore(store))).toEqual(store);
  });

  it('exports the storage key page scripts write under', () => {
    expect(SNAPSHOT_KEY).toBe('oc-snap-v1');
  });
});

describe('addSnapshot', () => {
  const empty: SnapshotStore = { v: 1, snapshots: [] };

  it('adds a snapshot to the front', () => {
    let store = addSnapshot(empty, 'a', 'first', '2026-07-19T10:00:00.000Z');
    store = addSnapshot(store, 'b', 'second', '2026-07-19T10:01:00.000Z');
    expect(store.snapshots.map((s) => s.slug)).toEqual(['b', 'a']);
  });

  it('is a no-op for a value over the 24KB cap', () => {
    const huge = 'x'.repeat(24 * 1024 + 1);
    expect(addSnapshot(empty, 'a', huge, '2026-07-19T10:00:00.000Z')).toEqual(empty);
  });

  it('ignores a malformed slug rather than throwing', () => {
    expect(addSnapshot(empty, '../etc/passwd', 'x', '2026-07-19T10:00:00.000Z')).toEqual(empty);
  });

  it('evicts the oldest snapshot across all tools past the 30-snapshot cap', () => {
    let store = empty;
    for (let i = 0; i < 30; i++) {
      store = addSnapshot(store, 'a', `v${i}`, `2026-07-19T${String(10 + Math.floor(i / 60)).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}:00.000Z`);
    }
    expect(store.snapshots).toHaveLength(30);
    store = addSnapshot(store, 'b', 'newest', '2026-07-20T00:00:00.000Z');
    expect(store.snapshots).toHaveLength(30);
    expect(store.snapshots.some((s) => s.value === 'v0')).toBe(false);
    expect(store.snapshots.some((s) => s.value === 'newest')).toBe(true);
  });
});

describe('removeSnapshotAt', () => {
  it('removes the snapshot at the given index', () => {
    let store: SnapshotStore = { v: 1, snapshots: [] };
    store = addSnapshot(store, 'a', 'first', '2026-07-19T10:00:00.000Z');
    store = addSnapshot(store, 'b', 'second', '2026-07-19T10:01:00.000Z');
    store = removeSnapshotAt(store, 0);
    expect(store.snapshots).toHaveLength(1);
    expect(store.snapshots[0].value).toBe('first');
  });

  it('ignores an out-of-range index', () => {
    const store: SnapshotStore = { v: 1, snapshots: [{ slug: 'a', value: 'x', at: '2026-07-19T10:00:00.000Z' }] };
    expect(removeSnapshotAt(store, 5)).toEqual(store);
    expect(removeSnapshotAt(store, -1)).toEqual(store);
  });
});

describe('snapshotsForSlug', () => {
  it('returns only snapshots for the given tool, newest-first', () => {
    let store: SnapshotStore = { v: 1, snapshots: [] };
    store = addSnapshot(store, 'a', 'a1', '2026-07-19T10:00:00.000Z');
    store = addSnapshot(store, 'b', 'b1', '2026-07-19T10:01:00.000Z');
    store = addSnapshot(store, 'a', 'a2', '2026-07-19T10:02:00.000Z');
    expect(snapshotsForSlug(store, 'a').map((s) => s.value)).toEqual(['a2', 'a1']);
  });
});

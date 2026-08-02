import { describe, it, expect } from 'vitest';
import { LAST_INPUT_KEY } from './last-input';
import { SNAPSHOT_KEY } from './snapshots';
import { HANDOFF_KEY } from './handoff';
import { purgeStoredInputs, summarizeStoredInputs, type PurgeTargets } from './purge';

/**
 * A minimal in-memory stand-in for the two Storage objects. The real ones are
 * unavailable under this project's node-environment vitest config, which is
 * exactly why purge.ts takes them as parameters instead of reaching for the
 * globals — the pure half stays testable, matching last-input/snapshots.
 */
function fakeStorage(seed: Record<string, string> = {}) {
  const map = new Map(Object.entries(seed));
  const store = {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    key: (i: number) => [...map.keys()][i] ?? null,
    clear: () => map.clear(),
    get length() {
      return map.size;
    },
  } as unknown as Storage;
  return { store, map };
}

function seeded() {
  const local = fakeStorage({
    [LAST_INPUT_KEY]: JSON.stringify({
      v: 1,
      entries: {
        'cidr-checker': { value: '10.0.0.0/8', at: '2026-08-01T10:00:00.000Z' },
        'jq-playground': { value: '.items[]', at: '2026-08-01T11:00:00.000Z' },
      },
    }),
    [SNAPSHOT_KEY]: JSON.stringify({
      v: 1,
      snapshots: [
        { slug: 'jq-playground', value: '.foo', at: '2026-08-01T10:00:00.000Z' },
        { slug: 'hash-generator', value: 'hello', at: '2026-08-01T10:30:00.000Z' },
        { slug: 'jwt-decoder', value: 'eyJ...', at: '2026-08-01T11:00:00.000Z' },
      ],
    }),
    // Must survive: these are settings and earned progress, not pasted input.
    theme: 'dark',
    'oc-analytics-consent': 'granted',
    'oc-m90-v1': '{"days":{"1":true}}',
    'oc-tools-v1': '{"pinned":["jq-playground"]}',
  });
  const session = fakeStorage({ [HANDOFF_KEY]: JSON.stringify({ value: 'secret-in-transit' }) });
  const targets: PurgeTargets = { local: local.store, session: session.store };
  return { local, session, targets };
}

describe('summarizeStoredInputs', () => {
  it('counts what is actually there, before anything is deleted', () => {
    const { targets } = seeded();
    expect(summarizeStoredInputs(targets)).toEqual({ lastInputTools: 2, snapshots: 3, handoff: true });
  });

  it('reports zeroes on a clean browser rather than throwing', () => {
    const local = fakeStorage();
    const session = fakeStorage();
    expect(summarizeStoredInputs({ local: local.store, session: session.store })).toEqual({
      lastInputTools: 0,
      snapshots: 0,
      handoff: false,
    });
  });

  it('treats corrupt JSON as empty, not as an error', () => {
    const local = fakeStorage({ [LAST_INPUT_KEY]: 'not json{{', [SNAPSHOT_KEY]: '[[[' });
    const session = fakeStorage();
    expect(summarizeStoredInputs({ local: local.store, session: session.store })).toEqual({
      lastInputTools: 0,
      snapshots: 0,
      handoff: false,
    });
  });
});

describe('purgeStoredInputs', () => {
  it('removes exactly the input-bearing keys', () => {
    const { local, session, targets } = seeded();
    purgeStoredInputs(targets);
    expect(local.map.has(LAST_INPUT_KEY)).toBe(false);
    expect(local.map.has(SNAPSHOT_KEY)).toBe(false);
    expect(session.map.has(HANDOFF_KEY)).toBe(false);
  });

  it('leaves settings and Mission 90 progress alone', () => {
    const { local, targets } = seeded();
    purgeStoredInputs(targets);
    expect(local.map.get('theme')).toBe('dark');
    expect(local.map.get('oc-analytics-consent')).toBe('granted');
    expect(local.map.get('oc-m90-v1')).toBe('{"days":{"1":true}}');
    expect(local.map.get('oc-tools-v1')).toBe('{"pinned":["jq-playground"]}');
  });

  it('returns the summary of what it deleted, so the UI can report it', () => {
    const { targets } = seeded();
    expect(purgeStoredInputs(targets)).toEqual({ lastInputTools: 2, snapshots: 3, handoff: true });
  });

  it('is idempotent — purging twice is not an error and reports nothing the second time', () => {
    const { targets } = seeded();
    purgeStoredInputs(targets);
    expect(purgeStoredInputs(targets)).toEqual({ lastInputTools: 0, snapshots: 0, handoff: false });
  });

  it('survives storage that throws on every access', () => {
    const hostile = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      removeItem: () => {
        throw new Error('SecurityError');
      },
    } as unknown as Storage;
    expect(() => purgeStoredInputs({ local: hostile, session: hostile })).not.toThrow();
    expect(summarizeStoredInputs({ local: hostile, session: hostile })).toEqual({
      lastInputTools: 0,
      snapshots: 0,
      handoff: false,
    });
  });
});

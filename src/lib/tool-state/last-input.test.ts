import { describe, it, expect } from 'vitest';
import {
  LAST_INPUT_KEY,
  parseLastInputStore,
  serializeLastInputStore,
  recordLastInput,
  getLastInput,
  looksSecret,
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

  it('is a no-op for secret-shaped input, whatever the slug', () => {
    const key = '-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBg\n-----END PRIVATE KEY-----';
    expect(recordLastInput(empty, 'certificate-decoder', key, '2026-07-19T10:00:00.000Z')).toEqual(empty);
    expect(recordLastInput(empty, 'subnet-calculator', key, '2026-07-19T10:00:00.000Z')).toEqual(empty);
  });

  it('does not evict an existing entry when it refuses a secret', () => {
    const store = recordLastInput(empty, 'subnet-calculator', '10.0.0.0/24', '2026-07-19T10:00:00.000Z');
    const after = recordLastInput(store, 'subnet-calculator', 'ghp_16C7e42F292c6912E7710c838347Ae178B4a', '2026-07-19T10:05:00.000Z');
    expect(after).toBe(store);
    expect(getLastInput(after, 'subnet-calculator')).toBe('10.0.0.0/24');
  });
});

describe('looksSecret', () => {
  it('flags every PEM private-key variant', () => {
    for (const label of ['PRIVATE KEY', 'RSA PRIVATE KEY', 'EC PRIVATE KEY', 'ENCRYPTED PRIVATE KEY', 'OPENSSH PRIVATE KEY']) {
      expect(looksSecret(`-----BEGIN ${label}-----`)).toBe(true);
    }
  });

  it('flags well-known credential prefixes', () => {
    expect(looksSecret('token=ghp_16C7e42F292c6912E7710c838347Ae178B4a')).toBe(true);
    expect(looksSecret('github_pat_11ABCDEFG0123456789_abcdefghijklmnopqrstuvwxyz012345')).toBe(true);
    expect(looksSecret('AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE')).toBe(true);
    expect(looksSecret('xoxb-2508095029-1548959030-abcdefabcdef')).toBe(true);
    expect(looksSecret('sk-proj-abc123abc123abc123abc123')).toBe(true);
    expect(looksSecret('glpat-ABCDEFGHIJKLMNOPQRST')).toBe(true);
  });

  it('flags a three-segment JWT', () => {
    expect(
      looksSecret('eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U'),
    ).toBe(true);
  });

  it('flags credentials embedded in a URL', () => {
    expect(looksSecret('DATABASE_URL=postgres://svc:hunter2@db.internal:5432/app')).toBe(true);
  });

  it('leaves ordinary tool input alone', () => {
    // A certificate is not a secret — the cert decoder's whole job is reading these.
    expect(looksSecret('-----BEGIN CERTIFICATE-----\nMIIBkTCB+wIJAK\n-----END CERTIFICATE-----')).toBe(false);
    expect(looksSecret('-----BEGIN PUBLIC KEY-----')).toBe(false);
    expect(looksSecret('10.0.0.0/24')).toBe(false);
    expect(looksSecret('FROM node:22\nRUN npm ci')).toBe(false);
    expect(looksSecret('0 2 * * *')).toBe(false);
    expect(looksSecret('https://user@github.com/org/repo.git')).toBe(false); // user, no password
    expect(looksSecret('{"replicas": 3, "image": "app:1.2.3"}')).toBe(false);
  });
});

describe('getLastInput', () => {
  it('returns null for an unknown or malformed slug', () => {
    const store: LastInputStore = { v: 1, entries: {} };
    expect(getLastInput(store, 'unknown-tool')).toBeNull();
    expect(getLastInput(store, '../etc')).toBeNull();
  });
});

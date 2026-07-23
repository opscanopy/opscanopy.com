/**
 * UUID / ULID Generator — engine tests.
 *
 * Covers: v4 UUID structural shape (version + variant nibbles) across many
 * samples, the uppercase toggle, batch count/uniqueness, the nil UUID, the ULID
 * encoder (deterministic with injected randomness, Crockford alphabet, round-
 * trip through decodeUlidTime), an INDEPENDENT published ULID vector, timestamp
 * overflow rejection, and inspectUuid version/variant detection + no-throw on
 * garbage input.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  generateUuidV4,
  nilUuid,
  generateUlid,
  decodeUlidTime,
  inspectUuid,
} from './engine';

const V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CROCKFORD_RE = /^[0-9ABCDEFGHJKMNPQRSTVWXYZ]{26}$/;

describe('generateUuidV4', () => {
  it('matches the v4 shape across many samples', () => {
    const { valid, values } = generateUuidV4({ mode: 'v4', count: 200, uppercase: false });
    expect(valid).toBe(true);
    expect(values).toHaveLength(200);
    for (const v of values) {
      expect(v).toMatch(V4_RE);
      expect(v).toMatch(/^[0-9a-f-]+$/); // lowercase only
    }
  });

  it('uppercase toggle emits [0-9A-F]', () => {
    const { values } = generateUuidV4({ mode: 'v4', count: 50, uppercase: true });
    for (const v of values) {
      expect(v).toMatch(V4_RE);
      expect(v).toMatch(/^[0-9A-F-]+$/);
      expect(v).not.toMatch(/[a-f]/);
    }
  });

  it('returns exactly N values', () => {
    expect(generateUuidV4({ mode: 'v4', count: 1, uppercase: false }).values).toHaveLength(1);
    expect(generateUuidV4({ mode: 'v4', count: 17, uppercase: false }).values).toHaveLength(17);
  });

  it('generates a batch of unique values', () => {
    const { values } = generateUuidV4({ mode: 'v4', count: 500, uppercase: false });
    expect(new Set(values).size).toBe(500);
  });

  it('clamps out-of-range / non-numeric count and adds a note, never throwing', () => {
    const hi = generateUuidV4({ mode: 'v4', count: 99999, uppercase: false });
    expect(hi.valid).toBe(true);
    expect(hi.values).toHaveLength(1000);
    expect(hi.notes && hi.notes.length).toBeGreaterThan(0);

    const lo = generateUuidV4({ mode: 'v4', count: 0, uppercase: false });
    expect(lo.values).toHaveLength(1);
    expect(lo.notes && lo.notes.length).toBeGreaterThan(0);

    const nan = generateUuidV4({ mode: 'v4', count: Number.NaN, uppercase: false });
    expect(nan.values).toHaveLength(1);
    expect(nan.notes && nan.notes.length).toBeGreaterThan(0);
  });
});

describe('nilUuid', () => {
  it('is the all-zero UUID', () => {
    expect(nilUuid()).toBe('00000000-0000-0000-0000-000000000000');
  });
});

describe('generateUlid', () => {
  const fixedNow = 1469918176385;
  const fixedBytes = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

  it('is deterministic with injected randomness and 26 Crockford chars', () => {
    const a = generateUlid(fixedNow, fixedBytes);
    const b = generateUlid(fixedNow, fixedBytes);
    expect(a.valid).toBe(true);
    expect(a.value).toBe(b.value);
    expect(a.value).toHaveLength(26);
    expect(a.value).toMatch(CROCKFORD_RE);
  });

  it('alphabet excludes I, L, O and U', () => {
    const u = generateUlid(fixedNow, fixedBytes);
    expect(u.value).not.toMatch(/[ILOU]/);
  });

  it('round-trips through decodeUlidTime', () => {
    const u = generateUlid(fixedNow, fixedBytes);
    expect(decodeUlidTime(u.value!)).toBe(fixedNow);
  });

  it('rejects timestamps outside the 48-bit ULID domain without throwing', () => {
    for (const bad of [-1, 2 ** 48, Number.NaN, Infinity, -Infinity, 1.5]) {
      const r = generateUlid(bad, fixedBytes);
      expect(r.valid).toBe(false);
      expect(r.value).toBeUndefined();
      expect(typeof r.error).toBe('string');
    }
  });

  it('accepts the boundary timestamps 0 and 2^48 − 1', () => {
    const lo = generateUlid(0, fixedBytes);
    expect(lo.valid).toBe(true);
    expect(decodeUlidTime(lo.value!)).toBe(0);

    const hi = generateUlid(2 ** 48 - 1, fixedBytes);
    expect(hi.valid).toBe(true);
    expect(decodeUlidTime(hi.value!)).toBe(2 ** 48 - 1);
  });
});

describe('decodeUlidTime', () => {
  it('decodes the independent published spec vector', () => {
    expect(decodeUlidTime('01ARYZ6S41TSV4RRFFQ69G5FAV')).toBe(1469918176385);
  });

  it('rejects timestamp overflow (first char > "7") with null', () => {
    expect(decodeUlidTime('8ZZZZZZZZZZZZZZZZZZZZZZZZZZ')).toBeNull();
    expect(decodeUlidTime('ZZZZZZZZZZ0000000000000000')).toBeNull();
  });

  it('returns null on malformed input rather than throwing', () => {
    expect(decodeUlidTime('short')).toBeNull();
    expect(decodeUlidTime('01ARYZ6S4I' + 'TSV4RRFFQ69G5FAV')).toBeNull(); // I is not Crockford
  });
});

describe('inspectUuid', () => {
  it('detects a v4 UUID with RFC 4122 variant', () => {
    const r = inspectUuid('f47ac10b-58cc-4372-a567-0e02b2c3d479');
    expect(r.valid).toBe(true);
    expect(r.kind).toBe('uuid');
    expect(r.version).toBe(4);
    expect(r.variant).toBe('RFC 4122');
  });

  it('reports version 1 for a v1 vector', () => {
    const r = inspectUuid('c232ab00-9414-11ec-b3c8-9e6bdeced846');
    expect(r.valid).toBe(true);
    expect(r.version).toBe(1);
  });

  it('decodes a ULID timestamp', () => {
    const r = inspectUuid('01ARYZ6S41TSV4RRFFQ69G5FAV');
    expect(r.valid).toBe(true);
    expect(r.kind).toBe('ulid');
    expect(r.timestamp).toBe(new Date(1469918176385).toISOString());
  });

  it('rejects an overflowing ULID', () => {
    const r = inspectUuid('8ZZZZZZZZZZZZZZZZZZZZZZZZZZ');
    expect(r.valid).toBe(false);
  });

  it('returns { valid:false } on garbage without throwing', () => {
    expect(inspectUuid('not-an-id').valid).toBe(false);
    expect(inspectUuid('').valid).toBe(false);
    // @ts-expect-error — intentionally passing a non-string to prove no throw
    expect(inspectUuid(null).valid).toBe(false);
    // @ts-expect-error — intentionally passing a non-string to prove no throw
    expect(inspectUuid(12345).valid).toBe(false);
  });
});

describe('secure randomness enforcement', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('fails cleanly (no Math.random fallback) when Web Crypto is missing', () => {
    vi.stubGlobal('crypto', undefined);

    const u = generateUuidV4({ mode: 'v4', count: 3, uppercase: false });
    expect(u.valid).toBe(false);
    expect(u.values).toHaveLength(0);
    expect(typeof u.error).toBe('string');

    // Inject valid bytes → timestamp/randomness path still works without crypto.
    const withBytes = generateUlid(1469918176385, new Uint8Array(10).fill(7));
    expect(withBytes.valid).toBe(true);
    // No injected bytes and no crypto → clean failure, never Math.random().
    const noBytes = generateUlid(1469918176385);
    expect(noBytes.valid).toBe(false);
    expect(noBytes.value).toBeUndefined();
    expect(typeof noBytes.error).toBe('string');
  });

  it('fails cleanly when getRandomValues() throws', () => {
    vi.stubGlobal('crypto', {
      getRandomValues: () => {
        throw new Error('boom');
      },
    });

    const u = generateUuidV4({ mode: 'v4', count: 1, uppercase: false });
    expect(u.valid).toBe(false);
    expect(typeof u.error).toBe('string');

    const ul = generateUlid(1469918176385);
    expect(ul.valid).toBe(false);
    expect(typeof ul.error).toBe('string');
  });

  it('falls back to manual v4 construction when randomUUID() throws', () => {
    // getRandomValues works, but the native randomUUID throws — the engine
    // must still succeed via the manual byte-based construction path.
    vi.stubGlobal('crypto', {
      randomUUID: () => {
        throw new Error('nope');
      },
      getRandomValues: (arr: Uint8Array) => {
        for (let i = 0; i < arr.length; i++) arr[i] = (i * 37 + 11) & 0xff;
        return arr;
      },
    });

    const u = generateUuidV4({ mode: 'v4', count: 2, uppercase: false });
    expect(u.valid).toBe(true);
    expect(u.values).toHaveLength(2);
    for (const v of u.values) expect(v).toMatch(V4_RE);
  });

  it('fails cleanly when randomUUID() throws and getRandomValues() is missing', () => {
    vi.stubGlobal('crypto', {
      randomUUID: () => {
        throw new Error('nope');
      },
    });

    const u = generateUuidV4({ mode: 'v4', count: 1, uppercase: false });
    expect(u.valid).toBe(false);
    expect(typeof u.error).toBe('string');
  });
});

import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  EXP_PREFS_KEY,
  ACTIVE_EXPERIMENTS,
  parseExpPrefs,
  serializeExpPrefs,
  isActive,
  storedVariant,
  assignVariant,
  exposurePayload,
  getVariant,
  type ExpPrefs,
} from './exp';

const EMPTY: ExpPrefs = { v: 1, assignments: {} };
const AT = '2026-07-30T10:00:00.000Z';
const EXP = 'chip-count-4-vs-6';

/**
 * The kill switch ships EMPTY — a tool opts in by adding one id. Tests do
 * exactly that (the array is `readonly` to callers, plain at runtime) and
 * restore the shipped empty list afterwards, so nothing here can leave an
 * experiment live for another suite.
 */
function optIn(expId: string): void {
  (ACTIVE_EXPERIMENTS as string[]).push(expId);
}

interface FakeStorage {
  writes: string[];
  current(): string | null;
}

/** Minimal localStorage double: records writes, optionally fails read or write. */
function stubStorage(
  initial: string | null = null,
  opts: { failWrite?: boolean; failRead?: boolean } = {},
): FakeStorage {
  const writes: string[] = [];
  let value = initial;
  vi.stubGlobal('localStorage', {
    getItem(key: string): string | null {
      if (opts.failRead) throw new Error('SecurityError');
      return key === EXP_PREFS_KEY ? value : null;
    },
    setItem(key: string, next: string): void {
      writes.push(next);
      if (opts.failWrite) throw new Error('QuotaExceededError');
      if (key === EXP_PREFS_KEY) value = next;
    },
    removeItem(): void {},
    clear(): void {},
  });
  return { writes, current: () => value };
}

afterEach(() => {
  (ACTIVE_EXPERIMENTS as string[]).length = 0;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('parseExpPrefs', () => {
  it('yields empty prefs for null, empty, and garbage input', () => {
    expect(parseExpPrefs(null)).toEqual(EMPTY);
    expect(parseExpPrefs('')).toEqual(EMPTY);
    expect(parseExpPrefs('not json')).toEqual(EMPTY);
    expect(parseExpPrefs('{oops')).toEqual(EMPTY);
    expect(parseExpPrefs('[1,2,3]')).toEqual(EMPTY);
    expect(parseExpPrefs('"just a string"')).toEqual(EMPTY);
    expect(parseExpPrefs('42')).toEqual(EMPTY);
    expect(parseExpPrefs('null')).toEqual(EMPTY);
  });

  it('keeps well-formed assignments', () => {
    const raw = JSON.stringify({
      v: 1,
      assignments: {
        'chip-count-4-vs-6': { variant: 'a', at: AT },
        'jq-wasm-load-timing': { variant: 'b', at: AT },
      },
    });
    expect(parseExpPrefs(raw)).toEqual({
      v: 1,
      assignments: {
        'chip-count-4-vs-6': { variant: 'a', at: AT },
        'jq-wasm-load-timing': { variant: 'b', at: AT },
      },
    });
  });

  // Unlike tool-prefs (which ignores `v` and salvages field by field), a blob
  // from an unknown schema is discarded wholesale: a mis-read ASSIGNMENT mixes
  // two schemas' cohorts into one experiment's numbers.
  it('discards a blob with a wrong or missing version', () => {
    const assignments = { 'chip-count-4-vs-6': { variant: 'a', at: AT } };
    expect(parseExpPrefs(JSON.stringify({ v: 2, assignments }))).toEqual(EMPTY);
    expect(parseExpPrefs(JSON.stringify({ v: 0, assignments }))).toEqual(EMPTY);
    expect(parseExpPrefs(JSON.stringify({ v: '1', assignments }))).toEqual(EMPTY);
    expect(parseExpPrefs(JSON.stringify({ assignments }))).toEqual(EMPTY);
  });

  it('yields empty prefs when assignments is not a plain object', () => {
    expect(parseExpPrefs(JSON.stringify({ v: 1 }))).toEqual(EMPTY);
    expect(parseExpPrefs(JSON.stringify({ v: 1, assignments: [] }))).toEqual(EMPTY);
    expect(parseExpPrefs(JSON.stringify({ v: 1, assignments: null }))).toEqual(EMPTY);
    expect(parseExpPrefs(JSON.stringify({ v: 1, assignments: 'a' }))).toEqual(EMPTY);
    expect(parseExpPrefs(JSON.stringify({ v: 1, assignments: 7 }))).toEqual(EMPTY);
  });

  it('drops malformed entries but keeps the valid ones', () => {
    const raw = JSON.stringify({
      v: 1,
      assignments: {
        'bad-variant': { variant: 'c', at: AT },
        'variant-not-a-string': { variant: true, at: AT },
        'missing-variant': { at: AT },
        'bad-date': { variant: 'a', at: 'not a date' },
        'missing-at': { variant: 'b' },
        'not-an-object': 'a',
        'null-entry': null,
        'array-entry': ['a', AT],
        'chip-count-4-vs-6': { variant: 'b', at: AT },
      },
    });
    expect(parseExpPrefs(raw).assignments).toEqual({
      'chip-count-4-vs-6': { variant: 'b', at: AT },
    });
  });

  it('rejects experiment ids that are not kebab-case', () => {
    const raw = JSON.stringify({
      v: 1,
      assignments: {
        'BAD ID': { variant: 'a', at: AT },
        '../etc/passwd': { variant: 'a', at: AT },
        chip_count: { variant: 'a', at: AT },
        'Chip-Count': { variant: 'a', at: AT },
        '-leading': { variant: 'a', at: AT },
        'trailing-': { variant: 'a', at: AT },
        '': { variant: 'a', at: AT },
        'chip-count-4-vs-6': { variant: 'a', at: AT },
      },
    });
    expect(Object.keys(parseExpPrefs(raw).assignments)).toEqual(['chip-count-4-vs-6']);
  });

  // Regression: callers key the assignments map by id — a key like
  // "constructor" passes the plain regex and can reach Object.prototype in a
  // naive `{}`-keyed lookup, so it must be rejected here (see tool-prefs).
  it('rejects ids that collide with JS prototype properties', () => {
    const raw =
      '{"v":1,"assignments":{"__proto__":{"variant":"b","at":"' +
      AT +
      '"},"constructor":{"variant":"b","at":"' +
      AT +
      '"},"prototype":{"variant":"b","at":"' +
      AT +
      '"},"chip-count-4-vs-6":{"variant":"a","at":"' +
      AT +
      '"}}}';
    const parsed = parseExpPrefs(raw);
    expect(Object.keys(parsed.assignments)).toEqual(['chip-count-4-vs-6']);
    expect(Object.getPrototypeOf(parsed.assignments)).toBe(Object.prototype);
    expect(({} as Record<string, unknown>).variant).toBeUndefined();
  });

  it('caps stored assignments at 20', () => {
    const assignments: Record<string, { variant: string; at: string }> = {};
    for (let i = 0; i < 40; i++) assignments[`exp-${i}`] = { variant: 'a', at: AT };
    expect(Object.keys(parseExpPrefs(JSON.stringify({ v: 1, assignments })).assignments)).toHaveLength(20);
  });

  it('round-trips through serializeExpPrefs', () => {
    const prefs: ExpPrefs = {
      v: 1,
      assignments: {
        'chip-count-4-vs-6': { variant: 'a', at: AT },
        'data-size-band-default': { variant: 'b', at: AT },
      },
    };
    expect(parseExpPrefs(serializeExpPrefs(prefs))).toEqual(prefs);
    expect(parseExpPrefs(serializeExpPrefs(EMPTY))).toEqual(EMPTY);
  });

  it('exports the storage key page scripts and E2E seeding write under', () => {
    expect(EXP_PREFS_KEY).toBe('oc-exp-v1');
  });
});

describe('ACTIVE_EXPERIMENTS / isActive', () => {
  it('ships empty — nothing is live until a tool opts in', () => {
    expect(ACTIVE_EXPERIMENTS).toEqual([]);
  });

  it('reports every planned id inactive while the list is empty', () => {
    for (const id of [
      'jq-wasm-load-timing',
      'chip-count-4-vs-6',
      'terraform-copy-placement',
      'cert-hostname-visibility',
      'data-size-band-default',
    ]) {
      expect(isActive(id)).toBe(false);
    }
  });

  it('reports an opted-in id active, and only that id', () => {
    optIn(EXP);
    expect(isActive(EXP)).toBe(true);
    expect(isActive('jq-wasm-load-timing')).toBe(false);
  });

  it('rejects a malformed id rather than throwing', () => {
    optIn(EXP);
    expect(isActive('')).toBe(false);
    expect(isActive('__proto__')).toBe(false);
    expect(isActive('CHIP COUNT')).toBe(false);
  });
});

describe('assignVariant', () => {
  it('assigns "a" below 0.5 and "b" at or above 0.5', () => {
    expect(assignVariant(EMPTY, EXP, 0, AT).variant).toBe('a');
    expect(assignVariant(EMPTY, EXP, 0.25, AT).variant).toBe('a');
    expect(assignVariant(EMPTY, EXP, 0.499999, AT).variant).toBe('a');
    expect(assignVariant(EMPTY, EXP, 0.5, AT).variant).toBe('b');
    expect(assignVariant(EMPTY, EXP, 0.75, AT).variant).toBe('b');
    expect(assignVariant(EMPTY, EXP, 0.999999, AT).variant).toBe('b');
  });

  it('records the new assignment with its timestamp and flags it for persisting', () => {
    const result = assignVariant(EMPTY, EXP, 0.9, AT);
    expect(result.assigned).toBe(true);
    expect(result.prefs).toEqual({ v: 1, assignments: { [EXP]: { variant: 'b', at: AT } } });
  });

  it('never mutates the prefs it was given', () => {
    const prefs: ExpPrefs = { v: 1, assignments: {} };
    assignVariant(prefs, EXP, 0.9, AT);
    expect(prefs).toEqual(EMPTY);
  });

  it('is stable: an existing assignment wins over any later roll', () => {
    const first = assignVariant(EMPTY, EXP, 0.9, AT);
    expect(first.variant).toBe('b');
    for (const roll of [0, 0.1, 0.49, 0.5, 0.99]) {
      const again = assignVariant(first.prefs, EXP, roll, '2026-08-01T00:00:00.000Z');
      expect(again.variant).toBe('b');
      expect(again.assigned).toBe(false);
      expect(again.prefs).toBe(first.prefs);
    }
  });

  it('leaves the other experiments’ assignments intact', () => {
    const first = assignVariant(EMPTY, 'jq-wasm-load-timing', 0.1, AT);
    const second = assignVariant(first.prefs, EXP, 0.9, AT);
    expect(second.prefs.assignments).toEqual({
      'jq-wasm-load-timing': { variant: 'a', at: AT },
      'chip-count-4-vs-6': { variant: 'b', at: AT },
    });
  });

  it('generates a valid ISO timestamp when none (or a junk one) is supplied', () => {
    for (const at of [undefined, 'not a date', '']) {
      const result = assignVariant(EMPTY, EXP, 0.9, at);
      const stamp = result.prefs.assignments[EXP].at;
      expect(Number.isNaN(Date.parse(stamp))).toBe(false);
    }
  });

  it('returns the control without assigning for a malformed id', () => {
    for (const id of ['', 'BAD ID', '__proto__', 'constructor', 'prototype', '../etc']) {
      const result = assignVariant(EMPTY, id, 0.9, AT);
      expect(result).toEqual({ prefs: EMPTY, variant: 'a', assigned: false });
    }
  });

  // Never persist a coin flip we did not actually make.
  it('returns the control without assigning for an out-of-range or non-finite roll', () => {
    for (const roll of [NaN, Infinity, -Infinity, -0.1, 1, 1.5]) {
      const result = assignVariant(EMPTY, EXP, roll, AT);
      expect(result.assigned).toBe(false);
      expect(result.variant).toBe('a');
      expect(result.prefs).toBe(EMPTY);
    }
    const bogus = assignVariant(EMPTY, EXP, '0.9' as unknown as number, AT);
    expect(bogus.assigned).toBe(false);
  });

  it('refuses a new assignment once the 20-experiment cap is full', () => {
    let prefs: ExpPrefs = EMPTY;
    for (let i = 0; i < 20; i++) prefs = assignVariant(prefs, `exp-${i}`, 0.9, AT).prefs;
    expect(Object.keys(prefs.assignments)).toHaveLength(20);
    const overflow = assignVariant(prefs, EXP, 0.9, AT);
    expect(overflow).toEqual({ prefs, variant: 'a', assigned: false });
  });
});

describe('storedVariant', () => {
  it('returns the stored variant, or null when unassigned or malformed', () => {
    const prefs = assignVariant(EMPTY, EXP, 0.9, AT).prefs;
    expect(storedVariant(prefs, EXP)).toBe('b');
    expect(storedVariant(prefs, 'jq-wasm-load-timing')).toBeNull();
    expect(storedVariant(prefs, '__proto__')).toBeNull();
    expect(storedVariant(EMPTY, EXP)).toBeNull();
  });
});

describe('exposurePayload', () => {
  it('returns exactly the three GA4 params', () => {
    expect(exposurePayload(EXP, 'b', 'json-yaml-converter')).toEqual({
      experiment_id: 'chip-count-4-vs-6',
      variant: 'b',
      tool: 'json-yaml-converter',
    });
  });

  it('carries no other keys — nothing can smuggle input into analytics', () => {
    expect(Object.keys(exposurePayload(EXP, 'a', 'url-encoder-decoder')).sort()).toEqual([
      'experiment_id',
      'tool',
      'variant',
    ]);
  });

  it('blanks a non-enum id, tool or variant instead of forwarding it', () => {
    expect(
      exposurePayload('DROP TABLE users', 'z' as unknown as 'a', 'user typed <script>'),
    ).toEqual({ experiment_id: '', variant: 'a', tool: '' });
    expect(exposurePayload('__proto__', 'b', 'constructor')).toEqual({
      experiment_id: '',
      variant: 'b',
      tool: '',
    });
  });

  it('does not touch gtag', () => {
    const gtag = vi.fn();
    vi.stubGlobal('gtag', gtag);
    exposurePayload(EXP, 'a', 'json-yaml-converter');
    expect(gtag).not.toHaveBeenCalled();
  });
});

describe('getVariant', () => {
  it('returns "a" and writes NOTHING for an inactive id (kill switch)', () => {
    const store = stubStorage();
    expect(getVariant('chip-count-4-vs-6')).toBe('a');
    expect(getVariant('jq-wasm-load-timing')).toBe('a');
    expect(getVariant('')).toBe('a');
    expect(store.writes).toEqual([]);
    expect(store.current()).toBeNull();
  });

  it('assigns and persists on first read for an active id', () => {
    optIn(EXP);
    vi.spyOn(Math, 'random').mockReturnValue(0.9);
    const store = stubStorage();
    expect(getVariant(EXP)).toBe('b');
    expect(store.writes).toHaveLength(1);
    expect(parseExpPrefs(store.current()).assignments[EXP].variant).toBe('b');
  });

  it('returns the same variant on repeat reads and stops writing', () => {
    optIn(EXP);
    const random = vi.spyOn(Math, 'random').mockReturnValue(0.9);
    const store = stubStorage();
    expect(getVariant(EXP)).toBe('b');
    random.mockReturnValue(0.1);
    expect(getVariant(EXP)).toBe('b');
    expect(getVariant(EXP)).toBe('b');
    expect(store.writes).toHaveLength(1);
  });

  it('honours a variant seeded into storage (how E2E forces each arm)', () => {
    optIn(EXP);
    vi.spyOn(Math, 'random').mockReturnValue(0.9);
    stubStorage(JSON.stringify({ v: 1, assignments: { [EXP]: { variant: 'a', at: AT } } }));
    expect(getVariant(EXP)).toBe('a');
  });

  it('re-assigns over a junk blob instead of throwing', () => {
    optIn(EXP);
    vi.spyOn(Math, 'random').mockReturnValue(0.9);
    for (const junk of ['not json', '[]', '{"v":2,"assignments":{}}', '']) {
      const store = stubStorage(junk);
      expect(getVariant(EXP)).toBe('b');
      expect(parseExpPrefs(store.current()).assignments[EXP].variant).toBe('b');
      vi.unstubAllGlobals();
    }
  });

  // A variant we cannot persist would re-roll on the next page view and smear
  // one visitor across both arms — serve the control instead.
  it('returns "a" when the write is refused (quota exceeded)', () => {
    optIn(EXP);
    vi.spyOn(Math, 'random').mockReturnValue(0.9);
    const store = stubStorage(null, { failWrite: true });
    expect(getVariant(EXP)).toBe('a');
    expect(store.writes).toHaveLength(1);
    expect(store.current()).toBeNull();
  });

  it('salvages to empty prefs when the read throws, without escaping the error', () => {
    optIn(EXP);
    vi.spyOn(Math, 'random').mockReturnValue(0.9);
    const store = stubStorage(null, { failRead: true });
    // A read that throws (Safari private mode) salvages to empty prefs, so a
    // fresh assignment still happens and still persists — what must never
    // happen is a throw escaping into the boot script.
    expect(getVariant(EXP)).toBe('b');
    expect(store.writes).toHaveLength(1);
  });

  it('returns "a" when localStorage is missing entirely (SSR)', () => {
    optIn(EXP);
    vi.spyOn(Math, 'random').mockReturnValue(0.9);
    vi.stubGlobal('localStorage', undefined);
    expect(getVariant(EXP)).toBe('a');
  });

  it('returns "a" when localStorage access itself throws', () => {
    optIn(EXP);
    vi.spyOn(Math, 'random').mockReturnValue(0.9);
    vi.stubGlobal('localStorage', {
      getItem(): string | null {
        throw new Error('SecurityError');
      },
      setItem(): void {
        throw new Error('SecurityError');
      },
    });
    expect(getVariant(EXP)).toBe('a');
  });

  it('splits roughly 50/50 across visitors', () => {
    optIn(EXP);
    let a = 0;
    let b = 0;
    for (let i = 0; i < 400; i++) {
      // One fresh "visitor" per iteration: empty prefs, real coin flip.
      const variant = assignVariant(EMPTY, EXP, Math.random(), AT).variant;
      if (variant === 'a') a++;
      else b++;
    }
    expect(a + b).toBe(400);
    expect(a).toBeGreaterThan(140);
    expect(b).toBeGreaterThan(140);
  });
});

# 02d — direct coverage for every exported ip-core function

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or superpowers:executing-plans. Checkbox steps.

**Goal:** `ip-core.test.ts` exercises every exported symbol directly, so the next `1.2.3.4::`-class bug cannot survive — today the file covers 3 of ~10 exports and the tool suites only hit the rest through happy paths.

**Files:**
- Modify: `src/lib/ip-core.test.ts`
- Read first: `src/lib/ip-core.ts` top-to-bottom — enumerate the actual `export` list; the vectors below cover the known exports, add a `describe` for anything else you find.

This is coverage backfill, not TDD (the code exists) — write vectors, run, and **investigate any failure as a suspected bug** rather than pinning current behaviour blindly. 02a–02c must already be merged.

- [ ] **Step 1: parseIPv6 grammar vectors**

```ts
describe('parseIPv6 — grammar', () => {
  const good = ['::', '::1', 'fe80::1', '2001:db8::8a2e:370:7334',
    '2001:0db8:0000:0000:0000:0000:0000:0001', '::ffff:192.168.1.1'];
  const bad = ['', ':::', '1::2::3', '2001:db8', '12345::', 'g::1',
    '1:2:3:4:5:6:7:8:9', '1:2:3:4:5:6:7', '::ffff:192.168.1.256',
    'fe80::1%eth0' /* zone IDs are the converter's job, not the parser's */];
  it.each(good)('accepts %s', (s) => expect(parseIPv6(s)).not.toBeNull());
  it.each(bad)('rejects %s', (s) => expect(parseIPv6(s)).toBeNull());
  it(':: must stand for at least one group', () =>
    expect(parseIPv6('1:2:3:4::5:6:7:8')).toBeNull());
});
```

- [ ] **Step 2: compress/expand round-trips**

```ts
describe('ipv6Compress / ipv6Expand', () => {
  it('round-trips through parse', () => {
    for (const s of ['::', '::1', 'fe80::', '2001:db8::1:0:0:1', '::ffff:10.0.0.1']) {
      expect(parseIPv6(ipv6Compress(parseIPv6(s)!))).toBe(parseIPv6(s));
    }
  });
  it('RFC 5952 §4.2.3 — first-longest zero run', () => {
    expect(ipv6Compress(parseIPv6('0:0:1:0:0:1:0:0')!)).toBe('::1:0:0:1:0:0');
  });
  it('§4.2.2 — never :: for a single zero group', () => {
    expect(ipv6Compress(parseIPv6('2001:db8:0:1:1:1:1:1')!)).toBe('2001:db8:0:1:1:1:1:1');
  });
});
```

(Adjust `ipv6Expand` assertions to its real signature after reading it.)

- [ ] **Step 3: relate() full matrix**

```ts
describe('relate — same-family relations', () => {
  const r = (a: string, b: string) => relate(parseCidr(a)!, parseCidr(b)!);
  it('equal',    () => expect(r('10.0.0.0/8', '10.0.0.0/8')).toBe('equal'));
  it('within',   () => expect(r('10.1.0.0/16', '10.0.0.0/8')).toBe('within'));
  it('contains', () => expect(r('10.0.0.0/8', '10.1.0.0/16')).toBe('contains'));
  it('overlap edge: adjacent blocks are disjoint', () =>
    expect(r('10.0.0.0/25', '10.0.0.128/25')).toBe('disjoint'));
  // read the CidrRelation type first: if a partial-overlap value exists it can
  // only occur between non-CIDR ranges — CIDR blocks nest or miss; assert that.
});
```

- [ ] **Step 4: rangeToCidrs + maskForPrefix edges**

```ts
describe('rangeToCidrs', () => {
  it('full space → one /0', () =>
    expect(rangeToCidrs(0n, 2n ** 32n - 1n, 4)).toEqual([expect.objectContaining({ prefix: 0 })]));
  it('minimal cover for an unaligned range (10.0.0.1–10.0.0.6)', () => {
    const out = rangeToCidrs(parseIPv4('10.0.0.1')!, parseIPv4('10.0.0.6')!, 4);
    expect(out.map((c) => c.prefix).sort()).toEqual([31, 31, 32, 32]);
  });
  it('single address', () =>
    expect(rangeToCidrs(1n, 1n, 4)).toHaveLength(1));
});

describe('maskForPrefix', () => {
  it.each([[0, 0n], [31, 0xfffffffen], [32, 0xffffffffn]])('/%i', (p, m) =>
    expect(maskForPrefix(4, p)).toBe(m));
  it('IPv6 /128', () => expect(maskForPrefix(6, 128)).toBe(2n ** 128n - 1n));
});
```

(Adapt call signatures — `rangeToCidrs`/`maskForPrefix` argument order and return shape must be read from the source, the shapes above are the audit's best reading.)

- [ ] **Step 5:** `npx vitest run src/lib/ip-core.test.ts` — all pass. Any failure: diagnose against the relevant RFC before "fixing" the test; a failing vector here is more likely a real bug (that's the point of this plan).
- [ ] **Step 6:** `npm run test` green.
- [ ] **Step 7: Commit** — `git commit -m "test(ip-core): direct vectors for every exported function — parseIPv6, compress/expand, relate, rangeToCidrs, masks, classifiers"`

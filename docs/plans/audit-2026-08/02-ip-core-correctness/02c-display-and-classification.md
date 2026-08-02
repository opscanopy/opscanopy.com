# 02c — RFC 5952 §5 mapped-IPv4 display + special-range classification

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or superpowers:executing-plans. Checkbox steps.

**Goal:** `ipv6Compress` emits `::ffff:d.d.d.d` for IPv4-mapped addresses (RFC 5952 §5 SHOULD), and `classifyIPv4`/`classifyIPv6` label the special-purpose ranges an ops audience actually meets.

**Files:**
- Modify: `src/lib/ip-core.ts:130-153` (compress), `:240-266` (classifiers)
- Test: `src/lib/ip-core.test.ts`

### Task 1: mapped-IPv4 output form

- [ ] **Step 1: Failing tests**

```ts
import { ipv6Compress } from './ip-core';

describe('ipv6Compress — RFC 5952 §5 dotted form for IPv4-mapped', () => {
  it('renders ::ffff:0:0/96 addresses with a dotted tail', () => {
    expect(ipv6Compress(0xffffc0a80101n)).toBe('::ffff:192.168.1.1');
    expect(ipv6Compress(0xffff00000000n)).toBe('::ffff:0.0.0.0');
  });
  it('does not use dotted form outside the mapped range', () => {
    expect(ipv6Compress(0xc0a80101n)).toBe('::c0a8:101'); // plain ::/96 "compatible" form is deprecated — stays hex
    expect(ipv6Compress(1n)).toBe('::1');
  });
  it('existing compression behaviour is unchanged (regression pin)', () => {
    // first-longest zero run wins (RFC 5952 §4.2.3) — pin whatever the current
    // correct output is for 0:0:1:0:0:1:0:0 before touching the function:
    // expect(ipv6Compress(<that value>)).toBe('::1:0:0:1:0:0');
  });
});
```

(Note the second test's intent: **only** `::ffff:0:0/96` gets the dotted form. RFC 5952 §5 recommends it for the mapped prefix; extending it to `::/96` "compatible" addresses is deprecated territory — don't.)

- [ ] **Step 2:** Run — FAIL.
- [ ] **Step 3: Implement** — at the top of `ipv6Compress`:

```ts
// RFC 5952 §5: IPv4-mapped addresses SHOULD use the dotted-quad tail form.
if (v >= 0xffff00000000n && v <= 0xffffffffffffn) {
  const v4 = v & 0xffffffffn;
  return `::ffff:${ipv4ToString(v4)}`;
}
```

(`ipv4ToString` is already exported per the existing tests; confirm its exact name/signature at the top of the file.)

- [ ] **Step 4:** Tests pass. Full `npm run test`: the ip-converter has its own "Embedded IPv4" row logic (`src/lib/ip-converter/engine.ts:281-283`) — check its suite for pinned `::ffff:c0a8:101` strings and update those expectations deliberately.
- [ ] **Step 5: Commit** — `git commit -m "fix(ip-core): RFC 5952 §5 dotted form for IPv4-mapped IPv6 output"`

### Task 2: classifier corrections

- [ ] **Step 1: Failing tests**

```ts
import { classifyIPv4, classifyIPv6, parseIPv4, parseIPv6 } from './ip-core';
const c4 = (s: string) => classifyIPv4(parseIPv4(s)!);
const c6 = (s: string) => classifyIPv6(parseIPv6(s)!);

describe('classifyIPv4 — special-purpose registry (RFC 6890 family)', () => {
  it('documentation nets', () => {
    expect(c4('192.0.2.1')).toMatch(/documentation|TEST-NET/i);
    expect(c4('198.51.100.4')).toMatch(/documentation|TEST-NET/i);
    expect(c4('203.0.113.9')).toMatch(/documentation|TEST-NET/i);
  });
  it('benchmarking, 6to4 relay, limited broadcast', () => {
    expect(c4('198.18.0.1')).toMatch(/benchmark/i);           // RFC 2544
    expect(c4('192.88.99.1')).toMatch(/6to4|deprecated/i);     // RFC 7526
    expect(c4('255.255.255.255')).toMatch(/broadcast/i);       // not "Reserved (240/4)"
  });
  it('existing answers stay put', () => {
    expect(c4('10.0.0.1')).toMatch(/private/i);
    expect(c4('169.254.1.1')).toMatch(/link-local/i);
    expect(c4('8.8.8.8')).toMatch(/public|global/i);
  });
});

describe('classifyIPv6 additions', () => {
  it('NAT64 well-known prefix', () => expect(c6('64:ff9b::1')).toMatch(/NAT64/i));
  it('6to4', () => expect(c6('2002:c000:204::1')).toMatch(/6to4/i));
});
```

- [ ] **Step 2:** Run — FAIL.
- [ ] **Step 3: Implement.** Follow the existing classifier's structure at `:240-266` (ordered range checks). Insert **before** the public/global fallback, most-specific first:

| Range | Label |
|---|---|
| `192.0.2.0/24`, `198.51.100.0/24`, `203.0.113.0/24` | `Documentation (TEST-NET, RFC 5737)` |
| `198.18.0.0/15` | `Benchmarking (RFC 2544)` |
| `192.88.99.0/24` | `Deprecated 6to4 relay anycast (RFC 7526)` |
| `255.255.255.255/32` | `Limited broadcast` (check must precede the 240/4 bucket) |
| IPv6 `64:ff9b::/96` | `NAT64 well-known prefix (RFC 6052)` |
| IPv6 `2002::/16` | `6to4 (RFC 3056)` |

Match the label *format* of neighbouring entries exactly (they render on every subnet-calculator card via `subnet-calculator/engine.ts:315` and every cidr-checker line via `cidr-checker/engine.ts:185`).

Do **not** add cloud-provider notes (IMDS at 169.254.169.254, EKS on 100.64/10) here — that's plan 06's scope, and it needs UI treatment, not just a label.

- [ ] **Step 4:** Tests pass; `npm run test` green (check the subnet-calculator/cidr-checker suites for pinned "Public / global unicast" strings on these ranges and update deliberately).
- [ ] **Step 5: Commit** — `git commit -m "fix(ip-core): classify TEST-NET, benchmarking, 6to4 relay, limited broadcast, NAT64, 6to4 correctly"`

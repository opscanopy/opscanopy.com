# 02b — two guards: `relate()` family check, `parseCidr` zero-padded prefix

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or superpowers:executing-plans. Checkbox steps.

**Goal:** Cross-family `relate()` can never report containment; `parseCidr` applies its own leading-zero policy to the prefix.

Both are two-line fixes sharing one commit-per-guard cycle; grouped because each alone is too small to be a plan.

**Files:**
- Modify: `src/lib/ip-core.ts:311-319` (relate) and `:203` (parseCidr)
- Test: `src/lib/ip-core.test.ts`

### Task 1: relate() family guard

- [ ] **Step 1: Failing test**

```ts
import { relate, parseCidr } from './ip-core'; // extend existing imports

describe('relate — never compares across address families', () => {
  it('IPv4 vs IPv6 is always disjoint, both directions', () => {
    const v4 = parseCidr('10.0.0.0/8')!;
    const v6all = parseCidr('::/0')!;
    expect(relate(v4, v6all)).toBe('disjoint');   // was 'within' — bare-BigInt comparison
    expect(relate(v6all, v4)).toBe('disjoint');
  });
  it('numerically identical ranges in different families are not equal', () => {
    // 10.0.0.0/8 and ::a00:0/104 occupy the same integer range
    expect(relate(parseCidr('10.0.0.0/8')!, parseCidr('::a00:0/104')!)).toBe('disjoint');
  });
});
```

- [ ] **Step 2:** Run — FAIL (`'within'` / `'equal'`).
- [ ] **Step 3: Implement** — first line of `relate()`:

```ts
if (a.version !== b.version) return 'disjoint';
```

(Confirm the field name on the `Cidr` type at the top of `ip-core.ts` — the splitter engine references `BITS[version]`, so `version` is expected; if it's named differently, match it.)

- [ ] **Step 4:** Tests pass; full `npm run test` green (cidr-checker pre-buckets by family, so no behaviour change is expected there — if a test breaks, it was depending on the bug).
- [ ] **Step 5: Commit** — `git commit -m "fix(ip-core): relate() across address families is disjoint, never containment"`

### Task 2: parseCidr rejects zero-padded prefixes

- [ ] **Step 1: Failing test**

```ts
describe('parseCidr — prefix gets the same leading-zero strictness as octets', () => {
  it('rejects zero-padded prefixes', () => {
    expect(parseCidr('10.0.0.0/024')).toBeNull();
    expect(parseCidr('10.0.0.0/00')).toBeNull();
  });
  it('keeps /0 and unpadded prefixes', () => {
    expect(parseCidr('0.0.0.0/0')).not.toBeNull();
    expect(parseCidr('10.0.0.0/24')).not.toBeNull();
  });
});
```

- [ ] **Step 2:** Run — FAIL (`/024` parses today).
- [ ] **Step 3: Implement** — replace the regex at `:203`:

```ts
if (!/^(0|[1-9]\d{0,2})$/.test(prefixStr)) return null; // no leading zeros — same policy as octets (see module doc, :22-36)
```

- [ ] **Step 4:** Tests pass; `npm run test` green.
- [ ] **Step 5: Commit** — `git commit -m "fix(ip-core): parseCidr rejects zero-padded prefixes, matching the octet policy"`

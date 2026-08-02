# 02a — parseIPv6: embedded IPv4 accepted at the head of `::` addresses

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or superpowers:executing-plans. Checkbox steps.

**Goal:** `parseIPv6` rejects a dotted-quad segment anywhere except the final segment of the whole address.

**The bug** (`src/lib/ip-core.ts:75-108`): the address is split on `::` into halves, and `groupsOf()` is called on each half independently. The `i !== segs.length - 1` check at `:83` means "last segment of *this half*" — so a *head* half ending in a dotted quad passes. `1.2.3.4::` → `102:304::` (verified by execution; Node `net.isIP` and `new URL('http://[1.2.3.4::]/')` both reject it).

**Files:**
- Modify: `src/lib/ip-core.ts:75-108`
- Test: `src/lib/ip-core.test.ts`

- [ ] **Step 1: Write the failing tests** (append to `ip-core.test.ts`):

```ts
import { parseIPv6 } from './ip-core'; // extend the existing import line

describe('parseIPv6 — embedded IPv4 position (RFC 4291 §2.2.3: dotted quad only at the tail)', () => {
  it('rejects dotted quad in the head half of a :: address', () => {
    expect(parseIPv6('1.2.3.4::')).toBeNull();
    expect(parseIPv6('1.2.3.4::5')).toBeNull();
    expect(parseIPv6('1:2:3.4.5.6::')).toBeNull();
  });
  it('still accepts dotted quad as the true tail', () => {
    expect(parseIPv6('::ffff:192.168.1.1')).not.toBeNull();
    expect(parseIPv6('64:ff9b::192.0.2.33')).not.toBeNull();     // NAT64, tail of the tail half
    expect(parseIPv6('2001:db8:0:0:0:0:1.2.3.4')).not.toBeNull(); // no ::, dotted quad is final segment
  });
  it('rejects dotted quad mid-address without ::', () => {
    expect(parseIPv6('2001:db8:1.2.3.4:0:0:0:0')).toBeNull();
  });
});
```

- [ ] **Step 2:** `npx vitest run src/lib/ip-core.test.ts` — expected FAIL: `1.2.3.4::` returns a value, not null.

- [ ] **Step 3: Implement.** Give `groupsOf` an `allowEmbedded` flag; only the half that ends the address may carry a dotted quad:

```ts
const groupsOf = (str: string, allowEmbedded: boolean): string[] | null => {
  if (str === '') return [];
  const segs = str.split(':');
  const out: string[] = [];
  for (let i = 0; i < segs.length; i++) {
    const seg = segs[i];
    if (seg.includes('.')) {
      // RFC 4291 §2.2.3 — a dotted quad may only terminate the address.
      if (!allowEmbedded || i !== segs.length - 1) return null;
      const v4 = parseIPv4(seg);
      if (v4 === null) return null;
      out.push(((v4 >> 16n) & 0xffffn).toString(16));
      out.push((v4 & 0xffffn).toString(16));
    } else {
      if (!/^[0-9a-fA-F]{1,4}$/.test(seg)) return null;
      out.push(seg);
    }
  }
  return out;
};
```

Call sites (match the existing shape at `:97-107`): single half → `groupsOf(halves[0], true)`; two halves → `groupsOf(halves[0], false)` for head, `groupsOf(halves[1], true)` for tail. **Edge:** `::1.2.3.4` splits to halves `['', '1.2.3.4']` — head `''` returns `[]` before the flag matters, tail is allowed. Correct.

- [ ] **Step 4:** `npx vitest run src/lib/ip-core.test.ts` — PASS. Then full `npm run test` — the six networking-tool suites (`subnet-calculator`, `cidr-checker`, `ip-converter`, `subnet-splitter`, `ptr-helper`, `mac-formatter`) must stay green; if any relied on the buggy acceptance, that test was wrong — fix it and say so in the commit body.

- [ ] **Step 5:** Runtime spot-check per `.claude/skills/verify/SKILL.md`: paste `1.2.3.4::/32` into the cidr-checker — must now produce a line-level diagnostic (parsers return null; the checker already renders a specific message for unparseable lines, see `cidr-checker/engine.ts:123-127` for the shape).

- [ ] **Step 6: Commit**

```bash
git add src/lib/ip-core.ts src/lib/ip-core.test.ts
git commit -m "fix(ip-core): reject embedded IPv4 outside the address tail — 1.2.3.4:: no longer parses as 102:304::"
```

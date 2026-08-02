# 02e — subnet splitter: requested split must never vanish silently

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or superpowers:executing-plans. Checkbox steps.

**Goal:** When a user asks for a split and it can't be produced, the engine returns `{valid:false, error:'…'}` with a specific message — never `valid:true, split:null`, which the UI renders as a normal result with the split section simply missing.

**Verified failing inputs** (engine gate at `src/lib/subnet-splitter/engine.ts:128-133`; playground guard at `src/components/SubnetSplitterPlayground.astro:662-677` reads the parent prefix with `/(\d+)$/` and misses all three):

1. Parent `10.0.0.0` (bare → defaults /32) + split `/24` — guard regex doesn't match a slashless parent.
2. Parent `10.0.0.0/24` + split `/33` — guard only checks `newPrefix > parentPrefix`; the engine's `newPrefix <= BITS[version]` check then fails silently.
3. Non-numeric prefix → `Number('x')` → `NaN` → silent.

Also (SUSPECTED, from the audit): an allocation larger than its parent renders as a clean 100%-used success — add a note, not an error.

**Files:**
- Modify: `src/lib/subnet-splitter/engine.ts:128-135`
- Test: `src/lib/subnet-splitter/engine.test.ts`
- Modify (message rendering only): `src/components/SubnetSplitterPlayground.astro` — confirm the error path renders engine errors; the fix is engine-side, the playground keeps its existing error UI.

- [ ] **Step 1: Failing tests** (match the suite's existing call shape — read the top of `engine.test.ts` first; `split(parent, allocations, newPrefix)` per the audit):

```ts
describe('split — a requested split that cannot be produced is an error, not an absence', () => {
  it('split prefix beyond the family width', () => {
    const r = split('10.0.0.0/24', '', 33);
    expect(r.valid).toBe(false);
    expect(r.error).toMatch(/33.*32|prefix.*32/i); // names the limit
  });
  it('split prefix shorter than the parent', () => {
    const r = split('10.0.0.0', '', 24); // bare parent defaults to /32
    expect(r.valid).toBe(false);
    expect(r.error).toMatch(/parent/i); // "…/24 is larger than the /32 parent"
  });
  it('NaN prefix', () => {
    const r = split('10.0.0.0/24', '', Number('x'));
    expect(r.valid).toBe(false);
    expect(r.error).toMatch(/not a number|whole number/i);
  });
  it('valid splits unaffected', () => {
    const r = split('10.0.0.0/24', '', 26);
    expect(r.valid).toBe(true);
    expect(r.split).not.toBeNull();
  });
});
```

- [ ] **Step 2:** Run — FAIL (all three return `valid:true, split:null` today).

- [ ] **Step 3: Implement.** Replace the silent gate at `:128-133` with specific diagnostics, in the calm-error voice the site uses ("Octet 256 is greater than 255."):

```ts
if (newPrefixRaw !== undefined && newPrefixRaw !== null && newPrefixRaw !== '') {
  if (!Number.isInteger(newPrefix)) {
    return { valid: false, error: 'The split prefix must be a whole number, like 26.' };
  }
  if (newPrefix > BITS[version]) {
    return { valid: false, error: `/${newPrefix} is deeper than an IPv${version} address allows — the maximum is /${BITS[version]}.` };
  }
  if (newPrefix <= parent.prefix) {
    return { valid: false, error: `/${newPrefix} is not smaller than the /${parent.prefix} parent — a split must use a longer prefix.` };
  }
}
```

Adapt names (`newPrefixRaw`, `parent.prefix`) to the function's real locals. The "no split requested at all" path (empty input) stays valid-without-split — that's a legitimate state.

- [ ] **Step 4:** Tests pass; `npm run test` green.

- [ ] **Step 5 (over-large allocation note):** where allocations are clamped (`engine.ts:66-75`), when a single allocation covers the entire parent, append to that allocation's row data a note field: `'covers the entire parent — check this isn\'t a typo'`. Render it as a muted caption in the playground (glossary-caption pattern from the UX contract, no new live region). Test: `split('10.0.0.0/24', '10.0.0.0/16', 26)` → allocation carries the note.

- [ ] **Step 6:** Headless verify: enter parent `10.0.0.0/24`, split `33` → error line appears with the `/32` message; enter `26` → 4 subnets render.

- [ ] **Step 7: Commit** — `git commit -m "fix(subnet-splitter): impossible splits return a named error instead of a silently absent section"`

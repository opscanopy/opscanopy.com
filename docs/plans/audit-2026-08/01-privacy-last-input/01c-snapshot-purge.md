# 01c — one-click "delete everything OpsCanopy stored" on /privacy

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or superpowers:executing-plans. Checkbox steps.

**Goal:** A visitor can wipe `oc-last-v1` (auto-restore) and `oc-snap-v1` (explicit snapshots) from the privacy page with one button, per locale.

**Evidence:** Snapshots are explicit-consent and capped at 30 (`src/lib/tool-state/snapshots.ts:2-5,15`) but the security audit found no bulk-clear UI anywhere — plaintext saved inputs with no TTL and no purge affordance. (Also wipe `oc-m90-v1` mission progress? **No** — that's earned progress, not pasted data. Offer it as a separate labelled button only if trivial; default scope is the two input blobs.)

### Task 1: pure purge helper

**Files:**
- Create: `src/lib/tool-state/purge.ts`
- Test: `src/lib/tool-state/purge.test.ts`

- [ ] **Step 1: Failing test**

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { purgeStoredInputs, storedInputSummary } from './purge';

const store = new Map<string, string>();
const fakeLS = {
  getItem: (k: string) => store.get(k) ?? null,
  removeItem: (k: string) => void store.delete(k),
} as unknown as Storage;

beforeEach(() => {
  store.clear();
  store.set('oc-last-v1', JSON.stringify({ 'cidr-checker': { value: '10.0.0.0/8', at: '2026-08-01' } }));
  store.set('oc-snap-v1', JSON.stringify([{ slug: 'jq-playground', value: '.foo' }]));
  store.set('oc-m90-v1', '{"days":{}}');
  store.set('theme', 'dark');
});

it('summarises what exists before purging', () => {
  expect(storedInputSummary(fakeLS)).toEqual({ lastInputTools: 1, snapshots: 1 });
});

it('removes exactly the two input blobs', () => {
  purgeStoredInputs(fakeLS);
  expect(store.has('oc-last-v1')).toBe(false);
  expect(store.has('oc-snap-v1')).toBe(false);
  expect(store.has('oc-m90-v1')).toBe(true);  // progress is not pasted data
  expect(store.has('theme')).toBe(true);
});
```

- [ ] **Step 2:** `npx vitest run src/lib/tool-state/purge.test.ts` — FAIL (module missing).
- [ ] **Step 3: Implement** `purge.ts`:

```ts
import { LAST_INPUT_KEY } from './last-input';
export const SNAPSHOT_KEY = 'oc-snap-v1'; // import from snapshots.ts instead if it already exports one — check first

export function storedInputSummary(ls: Storage = localStorage) {
  const last = ls.getItem(LAST_INPUT_KEY);
  const snaps = ls.getItem(SNAPSHOT_KEY);
  const count = (raw: string | null, f: (v: unknown) => number) => {
    if (raw === null) return 0;
    try { return f(JSON.parse(raw)); } catch { return 0; }
  };
  return {
    lastInputTools: count(last, (v) => Object.keys(v as object).length),
    snapshots: count(snaps, (v) => (Array.isArray(v) ? v.length : Object.keys(v as object).length)),
  };
}

export function purgeStoredInputs(ls: Storage = localStorage): void {
  ls.removeItem(LAST_INPUT_KEY);
  ls.removeItem(SNAPSHOT_KEY);
}
```

Before committing: open `src/lib/tool-state/snapshots.ts`, confirm the real storage key and shape (array vs slug-keyed object) and correct both the constant import and the summary counter to match.

- [ ] **Step 4:** Tests pass; `npm run test` green.
- [ ] **Step 5: Commit** — `git commit -m "feat(tool-state): purge helper for oc-last-v1 + oc-snap-v1"`

### Task 2: privacy-page control

**Files:**
- Modify: the privacy page component (grep: `grep -rn "oc-last-v1" src/pages src/components --include=*.astro` to find where the inventory renders; the control belongs beside it)
- Modify: `src/i18n/pages/{en,de,es,fr,pt-br}.ts` — three new strings: button label ("Delete everything OpsCanopy has stored on this device"), confirmation line naming counts from `storedInputSummary`, done-state ("Deleted. Nothing stored.")

- [ ] **Step 1:** Add the button + a `role="status"` result line (sole live region — matches the playground a11y contract). `<script>` dynamically imports `../lib/tool-state/purge` on click (same lazy-boot pattern as playgrounds, `astro:page-load` listener).
- [ ] **Step 2:** All five locale strings in the same commit.
- [ ] **Step 3:** Headless verify: seed both keys via `page.evaluate`, click, assert keys gone and status line rendered.
- [ ] **Step 4: Commit** — `git commit -m "feat(privacy): one-click purge of stored inputs, all locales"`

**Done when** the button exists on all five /privacy pages, purges exactly the two blobs, and announces the result via the single status region.

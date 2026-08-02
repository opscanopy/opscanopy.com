# 09b — semantic YAML/JSON diff: what actually changed between two manifests

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or superpowers:executing-plans. Checkbox steps.

**Goal:** Two panes in, a key-aware change tree out: added/removed/changed paths with old→new values — order-insensitive for maps, item-tracking for k8s-style named lists. The Helm-upgrade / `kubectl get -o yaml` drift question, answered without line-diff noise.

**Files:**
- Create: `src/lib/yaml-diff/engine.ts`, `engine.test.ts`
- Create: `src/components/YamlDiffPlayground.astro`, `src/pages/yaml-diff.astro` + 4 locale pages
- Modify: `src/data/tools.ts` (Config category), E2E batch module

### Task 1: engine

- [ ] **Step 1: Failing tests**

```ts
import { diff } from './engine';

it('map key order is not a change', () => {
  expect(diff('a: 1\nb: 2', 'b: 2\na: 1').changes).toEqual([]);
});
it('changed scalar reports path and both values', () => {
  const d = diff('spec:\n  replicas: 2', 'spec:\n  replicas: 5');
  expect(d.changes).toEqual([{ kind: 'changed', path: 'spec.replicas', before: 2, after: 5 }]);
});
it('added / removed keys', () => {
  const d = diff('a: 1', 'a: 1\nb: {c: 3}');
  expect(d.changes).toEqual([{ kind: 'added', path: 'b', after: { c: 3 } }]);
});
it('named-list items match by merge key, not index (k8s containers)', () => {
  const before = 'containers:\n- name: app\n  image: app:1\n- name: sidecar\n  image: sc:1';
  const after  = 'containers:\n- name: sidecar\n  image: sc:1\n- name: app\n  image: app:2';
  const d = diff(before, after);
  expect(d.changes).toEqual([{ kind: 'changed', path: 'containers[name=app].image', before: 'app:1', after: 'app:2' }]);
});
it('plain lists fall back to index pairing, flagged as positional', () => {
  const d = diff('args: [a, b]', 'args: [b, a]');
  expect(d.changes.length).toBeGreaterThan(0);
  expect(d.notes.some((n) => /positional/.test(n))).toBe(true);
});
it('type change is one change, not remove+add', () => {
  const d = diff('x: 1', 'x: [1]');
  expect(d.changes).toEqual([{ kind: 'changed', path: 'x', before: 1, after: [1] }]);
});
it('YAML 1.2 traps handled by the parser we already trust', () => {
  // 'version: 1.10' vs 'version: "1.10"' IS a change (number vs string) — and the
  // note channel explains it, reusing the label-selector tester's insight
  const d = diff('version: 1.10', 'version: "1.10"');
  expect(d.changes[0].kind).toBe('changed');
  expect(d.notes.some((n) => /quot/i.test(n))).toBe(true);
});
it('multi-doc streams pair by index with a note', () => {
  const d = diff('a: 1\n---\nb: 2', 'a: 1\n---\nb: 3');
  expect(d.changes).toEqual([{ kind: 'changed', path: 'doc[1].b', before: 2, after: 3 }]);
});
it('invalid YAML on either side → {valid:false, error} naming the side and line', () => {
  const d = diff('a: [', 'a: 1');
  expect(d.valid).toBe(false);
  expect(d.error).toMatch(/left|first/i);
});
it('JSON input is just YAML — accepted', () => {
  expect(diff('{"a": 1}', '{"a": 2}').changes).toHaveLength(1);
});
```

- [ ] **Step 2:** Run — FAIL. **Step 3:** Implement: parse both sides with `js-yaml` `loadAll`; recursive walk producing `changes` + `notes`. Merge keys: a static table `MERGE_KEYS = ['name', 'key', 'containerPort', 'mountPath', 'topologyKey']` — a list-of-maps where **every** item on both sides has one of these keys uses it, else positional with the note. Path syntax `a.b[name=x].c`, escaping keys containing dots as `["a.b"]`. Depth cap 100 + input cap 500 KB per side with clean diagnostics (never throw).
- [ ] **Step 4:** Commit `feat(yaml-diff): key-aware diff engine — merge-key list pairing, type-change semantics, multi-doc`.

### Task 2: playground + page

- [ ] **Step 1:** Two-pane input (textareas, not CM — diff inputs are pastes, not compositions; skip the CM weight), stacked on mobile with labelled tabs. Output: change tree grouped by path prefix, `kind` badges (added=brand-strong, removed=danger token, changed=amber accent-ink), old→new rendered through `escapeHtml`. Contract checklist from 08a applies (chips-based examples: "Helm values bump", "Deployment drift", "quoting trap"); per-row copy of each change path; `data-copy-all` = the change list as Markdown (PR-comment-ready — the distribution hook); share link **with** the 2000-char cap pattern (two docs rarely fit — the cap message suggests copying the Markdown instead).
- [ ] **Step 2:** Page: why-section leads with the Helm-upgrade story; FAQ: "why is 1.10 vs "1.10" a change?", "how are lists compared?", "500 KB limit?". Five locales, one commit. Register in `tools.ts` (Config), fixture, promote.
- [ ] **Step 3:** Commit `feat(yaml-diff): playground + pages, registry, fixtures — all locales`.

**Cross-links:** json-yaml-converter ↔ yaml-diff both directions (category siblings); plan 10's `#doc=` handoff makes converter → diff carry the document once it lands.

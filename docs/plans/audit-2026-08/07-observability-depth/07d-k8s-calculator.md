# 07d — k8s resource calculator: read the manifest, answer the pod

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or superpowers:executing-plans. Checkbox steps.

**Goal:** Paste a Deployment/Pod YAML and get real pod math — multi-container, init/sidecar rules, QoS class — while the five-field quick form stays for envelope calculations. Plus two quantity-parser fixes.

**Evidence:** `engine.ts:133` handles exactly one container; playground is five number fields (`K8sResourceCalculatorPlayground.astro:43-116`); no QoS anywhere (warnings stop at `:208-217`); `parseMem` (`:82-90`) rejects `128e6` (legal `resource.Quantity` exponent form) and wrongly *accepts-or-rejects* `100m` memory inconsistently (audit: rejected — but Kubernetes accepts millibytes syntactically); `scale()` (`:100`) rounds through float for fractional magnitudes, losing the module's own BigInt-exactness claim.

**Files:**
- Modify: `src/lib/k8s-resources/engine.ts`, `engine.test.ts`, `src/components/K8sResourceCalculatorPlayground.astro`
- New: `src/lib/k8s-resources/pod.ts` (manifest walk — keep engine.ts the façade per house pattern)

### Task 1: quantity parser fixes

- [ ] **Step 1: Failing tests**
```ts
it('accepts exponent notation like the API server', () => {
  expect(parseMem('128e6')).toBe(128_000_000n);
  expect(parseMem('1e9')).toBe(1_000_000_000n);
});
it('fractional binary magnitudes stay exact', () => {
  expect(parseMem('1.5Ei')).toBe(3n * (1n << 59n)); // 1.5 × 2^60 = 3 × 2^59 — derived in BigInt, never through a float
});
it('memory in millibytes is accepted with a warning, like kubectl', () => {
  const r = parseMemWithNote('100m');
  expect(r.value).toBe(0n); // 0.1 bytes floors to 0 — and the note says "did you mean 100Mi?"
  expect(r.note).toMatch(/100Mi/);
});
```
  (Fix the 1.5Ei expectation by hand-deriving the exact integer — the point is the test is written from string arithmetic, never `Number`.)
- [ ] **Step 2:** Implement: decimal-string scaling in `scale()` (split on `.`, scale numerator as BigInt, reject >2 fractional digits against binary suffixes only if inexact — mirror `resource.Quantity`'s behaviour of exact representation); add exponent grammar `^\d+(?:\.\d+)?e\d+$`; add the millibyte note path. Commit `fix(k8s-resources): quantity parser — exponent forms, exact fractional scaling, millibyte footgun note`.

### Task 2: pod-level math from a manifest

- [ ] **Step 1: Failing tests** (`pod.ts`): given a Deployment YAML with `initContainers: [{…500m/512Mi}]`, `containers: [app 250m/256Mi, sidecar 100m/128Mi]` (sidecar = init container with `restartPolicy: Always`, the 1.29+ native form):
  - effective CPU request = `max(init, sum(app-tier) + sum(native-sidecars))` per the official formula — assert the number, not the formula;
  - per-scheduler-docs vectors for: init bigger than mains; sidecar dominating; limits absent on one container (pod has no effective limit);
  - `qosClass`: Guaranteed (all containers req==lim for both resources), Burstable, BestEffort vectors;
  - kind coverage: bare `Pod`, `Deployment` (`spec.template.spec`), `CronJob` (`spec.jobTemplate.spec.template.spec`) — walk by searching for the pod spec path, error cleanly on List/multi-doc with "paste one workload" diagnostic;
  - never throws: garbage YAML → `{valid: false, error}`.
- [ ] **Step 2:** Implement `analyzePod(yamlText)` in `pod.ts` using `js-yaml` (already a dep), returning per-container rows + pod totals + `qosClass` + warnings (`limit < request` per container — reuse the existing checks; missing requests → "BestEffort: first evicted under pressure"). Multiply by replicas only in the engine façade (replicas from the manifest when present, overridable in UI).
- [ ] **Step 3:** QoS captions in the results: Guaranteed/Burstable/BestEffort each get one sentence on eviction order — this is the judgment layer the audit called missing.
- [ ] **Step 4:** Commit `feat(k8s-resources): manifest input — multi-container pod math, init/sidecar rule, QoS class`.

### Task 3: playground — YAML mode

- [ ] **Step 1:** Add a paste-YAML textarea as the primary input with the five-field quick form collapsed behind a chip toggle (`Manifest · Quick numbers`). Manifest mode renders: per-container table, pod-effective row (the max() formula shown as a muted caption), QoS badge, totals × replicas.
- [ ] **Step 2:** This playground is on plan 08's non-compliant list (`aria-live` per-field regions at `:763-765`, no copy-all/hint line) — do the contract rework in this same touch per 08's checklist; don't ship a new mode on the old scaffolding.
- [ ] **Step 3:** Headless verify: paste the sidecar fixture → pod row matches the hand-computed number; axe pass (single status region — the per-field `aria-live` are removed by the 08 rework).
- [ ] **Step 4:** Page copy: FAQ "How do init containers and sidecars count?" — 5 locales, one commit. Commit `feat(k8s-resource-calculator): manifest mode + UX-contract rework`.

**Still deliberately silent (add to page):** no LimitRange/ResourceQuota/HPA modelling, no node bin-packing, no extended resources (`nvidia.com/gpu`) — each named with one line on why (needs cluster state this static tool doesn't have; GPU quantities are opaque strings the scheduler treats as integers — listing without modelling would mislead).

# 06a — provider profiles: engine + chips

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or superpowers:executing-plans. Checkbox steps.

**Goal:** `src/lib/cloud-net.ts` encodes the three providers' subnet rules; the subnet-calculator engine takes an optional `provider` and returns adjusted usable counts + provider warnings; calculator and splitter playgrounds grow a provider chip row (Generic default).

### Task 1: profiles module

**Files:**
- Create: `src/lib/cloud-net.ts`, `src/lib/cloud-net.test.ts`

- [ ] **Step 1: Failing tests**

```ts
import { describe, it, expect } from 'vitest';
import { PROVIDERS, usableHosts, subnetWarnings } from './cloud-net';

describe('usableHosts per provider', () => {
  // total addresses in the block minus provider-reserved; generic = -2 (network+broadcast)
  it.each([
    ['aws', 24, 251n], ['azure', 24, 251n], ['gcp', 24, 252n], ['generic', 24, 254n],
    ['aws', 28, 11n],  ['azure', 28, 11n],  ['gcp', 28, 12n],  ['generic', 28, 14n],
  ])('%s /%i → %s', (p, prefix, want) => {
    expect(usableHosts(p as never, 4, prefix)).toBe(want);
  });
});

describe('subnetWarnings', () => {
  it('below provider minimum', () => {
    expect(subnetWarnings('aws', 4, 30).some((w) => /\/28/.test(w))).toBe(true);
    expect(subnetWarnings('generic', 4, 30)).toEqual([]);
  });
  it('/31 is legal generically, flagged under a provider', () => {
    expect(subnetWarnings('aws', 4, 31).length).toBeGreaterThan(0);
  });
  it('IPv6 must be exactly /64 in cloud', () => {
    expect(subnetWarnings('aws', 6, 80).some((w) => /\/64/.test(w))).toBe(true);
    expect(subnetWarnings('aws', 6, 64)).toEqual([]);
    expect(subnetWarnings('generic', 6, 80)).toEqual([]);
  });
  it('VPC-scale prefixes note the provider VPC bounds', () => {
    expect(subnetWarnings('aws', 4, 12).some((w) => /\/16/.test(w))).toBe(true);
  });
});
```

- [ ] **Step 2:** Run — FAIL (module missing).
- [ ] **Step 3: Implement** — data first, logic thin:

```ts
/**
 * Cloud-provider subnet rules. Facts verified 2026-08 against provider docs —
 * each entry cites its source so a future correction is a one-line diff.
 * AWS:   docs.aws.amazon.com/vpc/latest/userguide/subnet-sizing.html
 * Azure: learn.microsoft.com/azure/virtual-network/virtual-networks-faq
 * GCP:   cloud.google.com/vpc/docs/subnets#reserved_ip_addresses
 */
export type Provider = 'generic' | 'aws' | 'azure' | 'gcp';

export interface ProviderProfile {
  label: string;
  /** Addresses unusable per IPv4 subnet, network+broadcast included. */
  reservedV4: bigint;
  /** Which addresses, for the caption ("network, router, DNS, future, broadcast"). */
  reservedNote: string;
  minPrefixV4: number;   // VPC/VNet-scale floor (AWS /16)
  maxPrefixV4: number;   // smallest legal subnet (AWS /28)
  v6SubnetExactly: number | null; // 64 for all three clouds; null = no rule
}

export const PROVIDERS: Record<Provider, ProviderProfile> = {
  generic: { label: 'Generic', reservedV4: 2n, reservedNote: 'network and broadcast', minPrefixV4: 0, maxPrefixV4: 32, v6SubnetExactly: null },
  aws:     { label: 'AWS',     reservedV4: 5n, reservedNote: 'network, VPC router, DNS, future use, broadcast', minPrefixV4: 16, maxPrefixV4: 28, v6SubnetExactly: 64 },
  azure:   { label: 'Azure',   reservedV4: 5n, reservedNote: 'network, gateway, two DNS, broadcast', minPrefixV4: 2, maxPrefixV4: 29, v6SubnetExactly: 64 },
  gcp:     { label: 'GCP',     reservedV4: 4n, reservedNote: 'network, gateway, second-to-last, broadcast', minPrefixV4: 0, maxPrefixV4: 29, v6SubnetExactly: 64 },
};
```

`usableHosts(provider, version, prefix)`: v4 → `2^(32-prefix) - reservedV4`, floored at `0n`; **special cases stay generic**: /31 and /32 return the RFC 3021 / host-route answers under `generic` (existing engine behaviour), and under a cloud provider they're governed by `maxPrefixV4` warnings instead of a count. v6 → the site's existing convention (no broadcast subtraction). `subnetWarnings(provider, version, prefix)`: string list from the profile bounds, each naming the provider and the limit. **Verify the four `reservedNote` strings and Azure/GCP min-subnet values against the cited docs pages before committing — the counts (5/5/4) are audit-verified, the notes are from memory.**

- [ ] **Step 4:** Tests pass.
- [ ] **Step 5: Commit** — `git commit -m "feat(cloud-net): AWS/Azure/GCP subnet profiles — reserved IPs, size bounds, IPv6 /64 rule"`

### Task 2: engine wiring

**Files:**
- Modify: `src/lib/subnet-calculator/engine.ts` (usable-host site at `:250-273`, warnings assembly), `engine.test.ts`

- [ ] **Step 1: Failing tests** — `calculate('10.0.1.0/24', {provider: 'aws'})` → result carries `usableHosts: 251n` (or the engine's display equivalent), a `reservedNote`, and empty warnings; `calculate('10.0.0.0/30', {provider: 'aws'})` → warning naming /28; no-provider calls byte-identical to today (pin one full existing result as a regression snapshot **before** touching the engine).
- [ ] **Step 2:** Implement: optional second param `{provider?: Provider}` defaulting `'generic'`; route the usable-host computation through `usableHosts()`; append `subnetWarnings()` to the existing warnings channel. The /31 + /32 special-case captions at `:260-273` remain the generic path.
- [ ] **Step 3:** Tests pass; suite green.
- [ ] **Step 4: Commit** — `git commit -m "feat(subnet-calculator): optional cloud-provider mode — adjusted usable hosts + provider warnings"`

### Task 3: playground chips (calculator + splitter)

**Files:**
- Modify: `src/components/SubnetCalculatorPlayground.astro` (already 7/7 contract-compliant — extend, don't disturb), `src/components/SubnetSplitterPlayground.astro` (post-02e; its full contract rework belongs to plan 08 — add only the chips here)

- [ ] **Step 1:** Chip row above the input: `Generic · AWS · Azure · GCP`, exact pattern from the calculator's existing example chips (radius, coarse targets, active = brand-soft + inset ring). Selection re-evaluates immediately, persists via the tool-prefs mechanism, and — since both tools read it — survives the calculator→splitter cross-link. Provider is **not** written into the `#ip=` hash (the hash carries an address between tools generically; a provider-opinionated hash would surprise the receiving tool's other users — prefs, not hash).
- [ ] **Step 2:** Result rows: usable-host row gains the reserved-note muted caption under it when provider ≠ generic (`(AWS reserves 5: network, VPC router, DNS, future use, broadcast)`); provider warnings render through the existing warnings UI.
- [ ] **Step 3:** Splitter: per-subnet usable counts route through `usableHosts(provider, …)`; a split below the provider's max prefix gets the warning row.
- [ ] **Step 4:** Headless verify: chip AWS + `10.0.1.0/24` → "251"; reload → chip still AWS; navigate to splitter via cross-link → AWS still active; axe pass (chips are buttons with `aria-pressed`).
- [ ] **Step 5: Commit** — `git commit -m "feat(networking): provider chips on subnet calculator + splitter — cloud-adjusted counts persist across tools"`

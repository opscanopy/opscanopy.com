# Point fix 02 — ip-core correctness: the parser that answers confidently and wrongly

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `src/lib/ip-core.ts` never accepts an invalid address, never silently returns a different address than pasted, displays RFC 5952-correct output, classifies special ranges correctly — and has direct test coverage for every exported function.

**Architecture:** All fixes are inside `ip-core.ts` + its test file, so all six networking tools inherit them for free. Order matters: the bug fix (02a) and guards (02b) first, display/classifier (02c) second, then the coverage backfill (02d) locks everything, then the splitter's silent-null contract (02e) which is in the splitter engine, not ip-core.

**Tech Stack:** Pure TS, BigInt, Vitest. No deps.

**Verified evidence (all confirmed by execution during the audit):**

- `ip-core.ts:83` — "embedded IPv4 must be last" is enforced per-*half*, not per-address: `1.2.3.4::` parses and silently becomes `102:304::`; flows into cidr-checker aggregates and subnet-calculator results with no warning. Node's `net.isIP('1.2.3.4::')` → `0`.
- `ip-core.ts:311-319` — `relate()` compares bare BigInts across families: `relate(10.0.0.0/8, ::/0)` → `'within'`. Latent (cidr-checker pre-buckets by family) but a landmine for the next caller.
- `ip-core.ts:203` — `parseCidr` accepts `/024` while rejecting `010.0.0.1` — same lexical form, opposite policy, one function.
- `ip-core.ts:130-153` — `ipv6Compress` never emits RFC 5952 §5 dotted form: `::ffff:192.168.1.1` displays as `::ffff:c0a8:101` everywhere `formatAddr` is used.
- `ip-core.ts:240-266` — classifier calls TEST-NET-1/2/3 (RFC 5737), `198.18.0.0/15` (RFC 2544), `192.88.99.0/24` (RFC 7526) all "Public / global unicast"; `255.255.255.255` falls into the 240/4 bucket; `64:ff9b::/96` (NAT64) and `2002::/16` (6to4) unlabelled.
- `ip-core.test.ts` — 50 lines, imports only `parseIPv4`, `ipv4ToString`, `parseCidr`. Zero direct coverage of `parseIPv6`, `ipv6Compress`, `ipv6Expand`, `relate`, `rangeToCidrs`, `maskForPrefix`, the classifiers.
- `subnet-splitter/engine.ts:128-133` — three inputs return `valid: true, split: null` with no error string (bare parent + split prefix; `/33`; non-numeric prefix), so the UI silently renders no split section.

## Children (execute in order)

| Child | Delivers | Ships alone? |
|-------|----------|--------------|
| [02a-parseipv6-embedded-v4.md](02a-parseipv6-embedded-v4.md) | The HIGH bug: reject embedded IPv4 anywhere but the true tail | Yes |
| [02b-guards.md](02b-guards.md) | `relate()` family guard + `parseCidr` zero-padded prefix | Yes |
| [02c-display-and-classification.md](02c-display-and-classification.md) | RFC 5952 §5 mapped-IPv4 output + classifier corrections | Yes |
| [02d-test-coverage.md](02d-test-coverage.md) | Direct vectors for every exported function; locks 02a–02c | Yes (after a–c) |
| [02e-splitter-silent-null.md](02e-splitter-silent-null.md) | Splitter returns `{valid:false, error}` instead of silent null | Yes |

## Done when

- [ ] `parseIPv6('1.2.3.4::')` → `null`; `parseIPv6('::ffff:192.168.1.1')` and `parseIPv6('64:ff9b::192.0.2.33')` still parse.
- [ ] `relate()` across families → `'disjoint'`; `parseCidr('10.0.0.0/024')` → `null`.
- [ ] `formatAddr` renders `::ffff:192.168.1.1`; `203.0.113.1` classified "Documentation (TEST-NET-3, RFC 5737)".
- [ ] `ip-core.test.ts` imports and exercises every exported symbol; `npm run test` green.
- [ ] The splitter never returns `valid:true` with a requested-but-absent split.

**Feeds:** plan 06 (cloud-aware networking) builds on the corrected classifier.

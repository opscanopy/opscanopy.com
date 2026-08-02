# Point fix 06 — cloud-aware networking: the right usable-host count on every cloud

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The subnet calculator (and splitter) can answer as AWS/Azure/GCP see it: reserved-IP-adjusted usable counts, illegal-in-cloud subnet shapes flagged, and the special addresses an ops audience actually meets (IMDS) called out.

**Architecture:** A small pure data+logic module `src/lib/cloud-net.ts` (provider profiles: reserved IPs, min/max prefix, IPv6 rules) consumed by the subnet-calculator engine as an *optional* input field — generic math stays the default and stays untouched. The playground adds a provider chip row. Splitter reuses the same profile for per-subnet counts.

**Tech Stack:** Pure TS, Vitest. No deps.

**Verified evidence:**

- `calculate('10.0.1.0/24')` → "254 usable". AWS/Azure: 251 (5 reserved), GCP: 252 (4 reserved). At /28 the generic answer is 27% high — and /28 is the classic RDS/interface-endpoint size.
- The correct fact exists on the site — `src/content/guides/aws/aws-for-devops-engineers.md:539` — 539 lines into a guide the calculator doesn't link.
- `src/pages/subnet-calculator.astro:44` asserts the generic −2 rule as *the* answer.
- Illegal-in-cloud accepted silently: AWS min subnet /28 (Azure/GCP ≈ /29); RFC 3021 /31 answer is right for router links and wrong as a cloud subnet; cloud IPv6 subnets must be exactly /64; AWS VPC bounds /16–/28.
- Zero grep hits for `aws|azure|gcp` in any of the six networking libs.

**Depends on:** plan 02 (don't build provider labels on top of a classifier that calls TEST-NET "public").

## Children (execute in order)

| Child | Delivers | Ships alone? |
|-------|----------|--------------|
| [06a-provider-profiles.md](06a-provider-profiles.md) | `cloud-net.ts` profiles + engine wiring + playground chips (calculator, then splitter) | Yes |
| [06b-copy-and-guides.md](06b-copy-and-guides.md) | Page copy corrections (5 locales), FAQ, guide cross-links, IMDS/link-local caption | Yes (after 06a) |

## Deliberately out of scope (record as backlog, don't creep)

- Cloud IP-range identifier ("who owns 52.94.x.x") — needs vendored `ip-ranges.json` build pipeline; that's a plan-09-class new tool.
- VLSM multi-size allocation planner — new-tool scale, listed in plan 09's backlog table.
- Kubernetes/EKS pod-IP math — belongs with the k8s calculator rework (plan 07d).

## Done when

- [ ] AWS chip + `10.0.1.0/24` → "251 usable (AWS reserves 5: network, router, DNS, future, broadcast)". GCP → 252. Generic remains 254.
- [ ] `/30` under any provider chip → warning naming that provider's minimum.
- [ ] IPv6 `/80` under a provider chip → "subnets must be exactly /64" warning.
- [ ] Copy on all five locale pages no longer asserts −2 as the only answer.
- [ ] Selected provider survives navigation calculator → splitter via the existing hash/prefs mechanism.

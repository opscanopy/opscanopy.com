# 06b — page copy, FAQ, cross-links, IMDS caption

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or superpowers:executing-plans. Checkbox steps.

**Goal:** The subnet-calculator page copy stops asserting −2 as *the* answer, a FAQ explains the provider modes, the buried guide fact gets a link both ways, and 169.254.169.254 gets its IMDS caption.

**Depends on:** 06a merged (copy references the chips).

### Task 1: page copy corrections — five locales, one commit

**Files:**
- Modify: `src/pages/subnet-calculator.astro:44` + the same passage in `src/pages/{de,es,fr,pt-br}/subnet-calculator.astro`

- [ ] **Step 1:** Replace the flat "usable hosts = total − 2" sentence with: the −2 rule *and* "on a cloud subnet the provider reserves more — AWS and Azure take 5 addresses per subnet, GCP takes 4. Pick your provider above the calculator to get the count your VPC will actually give you." Match each locale file's existing register (read the surrounding paragraph in each before translating).
- [ ] **Step 2:** Add one FAQ entry (feeds `FaqList` + `faqPageLd` JSON-LD — follow the page's existing FAQ array): **"Why does my cloud subnet have fewer usable IPs than this calculator shows?"** — answer names the three providers' reservations, the /28 example (14 generic vs 11 on AWS), and the chip row. Five locales, same commit.
- [ ] **Step 3:** `npm run build` green (JSON-LD validity is asserted by existing tests/build checks if present — confirm by grepping for faq assertions in `src/lib/jsonld.ts` tests).
- [ ] **Step 4: Commit** — `git commit -m "docs(subnet-calculator): cloud-reserved-IP copy + FAQ — all locales"`

### Task 2: guide cross-links, both directions

**Files:**
- Modify: `src/content/guides/aws/aws-for-devops-engineers.md:539` area, `src/pages/subnet-calculator.astro` (why/reference section)

- [ ] **Step 1:** In the guide's reserved-IP passage: link to `/subnet-calculator` — "the subnet calculator's AWS mode does this arithmetic for you."
- [ ] **Step 2:** In the calculator page's reference/why section: link to the guide passage as the deep-dive. (English only — the guide is English-only content under /learn conventions; the localized tool pages link the English guide, consistent with `ENGLISH_ONLY_SECTIONS` practice.)
- [ ] **Step 3: Commit** — `git commit -m "docs: cross-link subnet calculator ↔ AWS guide reserved-IP section"`

### Task 3: IMDS / metadata caption

**Files:**
- Modify: `src/lib/subnet-calculator/engine.ts` (warnings/notes assembly), `src/lib/cidr-checker/engine.ts` (line notes), tests for both

- [ ] **Step 1: Failing tests** — a block containing `169.254.169.254` (i.e. any range covering it, plus the exact address as input) carries note `Contains 169.254.169.254 — the cloud instance-metadata endpoint (IMDS). Never route, NAT, or firewall this range casually.`; `100.64.0.0/10` inputs carry `Carrier-grade NAT (RFC 6598) — also used by EKS/GKE as secondary pod space; not internet-routable.` Generic-provider runs get these too (the address is dangerous regardless of chip).
- [ ] **Step 2:** Implement as a tiny shared list in `cloud-net.ts` (`SPECIAL_V4: Array<{cidr: string, note: string}>` — the two above plus Azure's `168.63.129.16` "Azure platform wire address"), checked with `relate()` from ip-core against the input block. Consumed by both engines' notes channels.
- [ ] **Step 3:** Tests pass; suite green. Headless spot-check: `169.254.0.0/16` in the cidr-checker shows the IMDS note.
- [ ] **Step 4: Commit** — `git commit -m "feat(networking): IMDS / CGNAT / Azure-wire special-address notes in calculator + checker"`

**Done when** the generic-math claim is gone from all five locales, both cross-links resolve, and the IMDS note renders in both tools.

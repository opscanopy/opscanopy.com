# Mission 90 Days — day authoring rules

The canonical, non-negotiable rules for writing a Mission 90 day. Copy
`src/content/mission90/day-001.md` as your template — it is the reference
implementation of every rule below. When in doubt, match Day 1.

Days validate against the `mission90Days` collection schema in
`src/content.config.ts` and are cross-checked against the registry in
`src/data/mission90.ts` by `src/lib/mission90/mission90.test.ts`. The
content-shape test enforces the H2 order and the concept/lab budgets, so a day
that breaks these rules fails CI, not just review.

---

## Section budgets (hard caps)

| Section | Cap |
|---------|-----|
| **Goals** | Exactly **3**, each **≤15 words**, outcome-phrased ("Explain…", "Run and read…", "Know exactly…"). |
| **Concept** | **≤600 words**, **max 2 concepts** — if you need a third, split the day. A second concept nests as an H3 (or a second prose block) **under the single concept H2**; the fixed H2 order allows only one concept heading. |
| **Hands-On Lab** | **20–35 min**, **≤12 command blocks**, every block has a `# comment` **and** expected output. |
| **Real Errors I Hit** | **1–4** (minimum 1). |
| **Q&A (interviewQA)** | **3–5**, each answer **≤120 words** and speakable, tagged `[Service]` / `[Product]` / `[Both]`. |
| **Go Deeper** | **≤5 items**, each **time-tagged** (e.g. "10 min —"). |
| **Tomorrow** | **1 sentence** *(optional in the schema, but author it for every non-final day — it is the daily-return hook)*. |

---

## Voice & structure rules

- **Exactly ONE analogy per concept**, written as a `> **Real world:** …`
  callout (house style borrowed from the `linux-for-devops` guide).
- **Exactly ONE named industry example per concept** (a real company, product,
  or team — not a generic "a company").
- **The body H2 order is FIXED:**
  1. `## <topic-specific concept heading>`
  2. `## Hands-On Lab`
  3. `## Real Errors I Hit` **or** `## Common Errors & Fixes` — see below
  4. `## <topic> Interview Questions`
  5. `## Go Deeper` *(optional)*
- **Errors section — two accepted headings:** use `## Real Errors I Hit`
  (first-person) **only** on a day you have actually author-run in WSL2, with
  verbatim errors from that run (Day 1 is the reference). For a day authored but
  not yet personally run, use `## Common Errors & Fixes` — same
  Error → Why → Fix → How-you'd-spot-it structure, written in the third person
  (`> **Common error:**`, not `> **Real error:** I …`), so nothing falsely claims
  a personal run. Swap to `Real Errors I Hit` once you have run it for real.
- **Goals and Tomorrow render from frontmatter, NOT the body.** Never repeat
  them as body headings or prose.
- **Only two keyword-carrying headings:** the concept H2 and the interview H2.
  Every other H2 is a fixed structural label.

---

## 2026-current only

Teach the current stack. **Primary tools:**

- **Ubuntu 24.04** (noble).
- **Docker 27+**, `docker compose` (the space form — the plugin, not the
  hyphenated v1 script).
- **GitHub Actions first** for CI/CD.
- **Kubernetes 1.31+**.
- **Terraform 1.9+** (mention OpenTofu as the open-source fork).
- Networking: `ip`, `ss`, `dig`.

**Banned as the primary tool** (use the modern equivalent instead): CentOS,
Jenkins-first, Docker Swarm, `docker-compose` (v1), `ifconfig`, `netstat`,
Chef/Puppet-first, Vagrant.

Legacy tools get **at most one "you'll still see this…" aside** — never a lab,
never a goal.

---

## Visuals

- Use `public/mission-90/day{NN}-{name}.svg` **or** inline SVG. Inline SVG must
  use `currentColor`, `role="img"`, and a `<title>`.
- **1–2 diagrams max per day.** Diagrams are **flow-or-relationship only** — no
  decorative art.
- **ASCII diagrams in fenced blocks are encouraged** for terminal flows.

---

## Labs

- **Ideally author-executed before publishing** in **WSL2 Ubuntu 24.04** — run
  every command yourself, in order, on a real box, and use the `Real Errors I
  Hit` heading with verbatim errors from that run.
- **If a day is authored but not yet personally run:** use accurate,
  representative expected output (these commands are deterministic on Ubuntu
  24.04) and the `Common Errors & Fixes` heading (third person). Keep
  machine-specific detail generic — never fabricate a specific hostname/kernel/
  timestamp that implies a real session you did not run.
- **Real Errors (first-person) come from a real run** — verbatim error text in
  code blocks, never invented or paraphrased. Curated `Common Errors` may be
  authored but must still be technically correct.
- Structure each error (either heading) as: **Error → Why → Fix → How you'd spot
  it in prod.**
- **AWS days carry a "what this costs: ₹0 if…" box** so a learner never runs a
  lab that silently bills them.

---

## SEO formulas

- **Title (the page `<title>`):** `{Primary keyword}: {angle} — Mission 90, Day {N}`
  - Keyword **first**, **≤60 chars**.
  - The suffix deliberately avoids the "90 Days of DevOps" brand phrase.
  - **Where it lives:** the day-detail template builds `<title>` by appending
    `— Mission 90, Day {N}` to the frontmatter `title`. So the frontmatter
    `title` is the *content* heading (curriculum-canonical, e.g. Day 1's "What
    DevOps actually is + your first terminal session") — author it clean and
    **without** the suffix; the template adds the SEO suffix. Do not bake
    "— Mission 90, Day N" into frontmatter `title`.
- **Description:** `Learn {topic} in under an hour: {2–3 specifics}. Hands-on
  lab, {the real errors I hit | common errors and fixes}, and {k} real interview
  questions. Day {N} of the free 90-day DevOps path.` — use the errors phrase
  that matches the day's errors heading.
  - **Hard cap ≤160 characters** — the meta `description` must fit in one SERP
    snippet, so trim specifics (not the keyword-first opening) rather than
    overrun. Google truncates past ~160.

---

## Template

Start from **`src/content/mission90/day-001.md`** — it is the canonical day and
passes every rule and test above. Copy it, keep the frontmatter shape, and
replace the content.

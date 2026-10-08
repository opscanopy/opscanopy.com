# Linking OpsCanopy to Percentage Guru — placement plan

Date: 2026-10-08. For: whoever edits the OpsCanopy content (Mission 90 lessons + tool pages).

Percentage Guru (https://percentageguru.com) is a sister site of percentage calculators. On
2026-10-08 it shipped one editorial link *to* OpsCanopy on five of its pages (listed at the end).
This plan is the other direction: six places on OpsCanopy where a percentage calculation already
appears in the copy, or belongs there, and a link to the matching calculator helps the reader.

## Rules (read before editing)

1. **Body copy only.** Each link sits inside the sentence where the arithmetic happens. Never in
   the footer, the sidebar, a "partner sites" block, or the `## Go Deeper` list as a bare entry.
2. **One link per page.** Six pages in total. Do not add more; do not add one to a page not
   listed here. Both sites are small and share an owner, so a visible link-exchange pattern is
   worth less than nothing.
3. **Plain followed links.** Standard Markdown `[anchor](https://percentageguru.com/...)`. No
   `rel="nofollow"`, no `sponsored`, no `target="_blank"`.
4. **Descriptive, varied anchors.** Each placement below has its own anchor text. Do not change
   them all to "percentage calculator".
5. **No owner or author link between the sites.** Do not mention that the sites share an author,
   do not add Percentage Guru to any `sameAs`, About page or bio. (Owner decision, 2026-10-08.)
6. **Figures must be correct and marked.** Where a figure is rounded, write `≈`, not `=`. Every
   figure below was checked; if you change the numbers, re-check them.
7. **Check the target still answers 200** before committing (`curl -sI <url>`). Nothing in either
   test suite fetches the other host.

## The six placements

| # | File | Section | Target |
|---|---|---|---|
| 1 | `src/content/mission90/day-061.md` | the SLO paragraph (line ~35) | `/` |
| 2 | `src/content/mission90/day-038.md` | the canary paragraph under "Rolling, blue-green and canary" | `/` |
| 3 | `src/content/mission90/day-060.md` | the histogram / latency sentence | `/percentage-decrease-calculator` |
| 4 | `src/content/mission90/day-047.md` | the budget-alert paragraph (prose, not the FAQ) | `/percentage-increase-calculator` |
| 5 | `src/content/mission90/day-086.md` | the "Real world" resume-bullet callout (line ~63) | `/percentage-decrease-calculator` |
| 6 | `src/pages/kubernetes-resource-calculator.astro` | the "how it works" copy (requests × replicas) | `/` |

### 1. Day 61 — SLOs and error budgets → the percent-of calculator

The paragraph already says "99.9% over 30 days … about 43 minutes a month". Append one sentence:

> The budget in requests is the same sum: 0.1% of 2,600,000 requests a month is 2,600 failures
> you're allowed — [work out a percent of any number](https://percentageguru.com/) when the
> traffic figure changes.

Check: 2,600,000 × 0.001 = 2,600 exactly. Keep "about 43 minutes" as it is (30 × 24 × 60 × 0.001
= 43.2).

### 2. Day 38 — canary → the percent-of calculator

The canary paragraph describes a small slice of traffic but names no percentage. Add the figure
and the link in one sentence where the slice is introduced:

> A canary starts small — 5% of traffic on 20,000 requests per second is 1,000 rps on the new
> version ([5% of any number](https://percentageguru.com/)) — and widens to 25%, then 50%, only
> while the slice stays healthy.

Check: 20,000 × 0.05 = 1,000 exactly.

### 3. Day 60 — latency histograms → the percentage decrease calculator

Where histograms and request latency are introduced (the prose, not the FAQ answer), add:

> Report a latency win as a share of where it started: a p95 that falls from 420 ms to 310 ms is
> 110 ÷ 420 ≈ a 26% drop — the
> [percentage decrease calculator](https://percentageguru.com/percentage-decrease-calculator) does
> the division — and say which percentile it is, because the p99 rarely moves by the same share.

Check: 110 ÷ 420 = 0.2619…, so "≈ 26%" (or "≈ 26.2%"), never "= 26%".

### 4. Day 47 — AWS budgets → the percentage increase calculator

In the prose that explains the budget alert at 80% of the limit (the lab or the concept
paragraph, not the FAQ `a:` field), add:

> The alert tells you the bill crossed a line; it doesn't say by how much the bill grew. From
> $1,240 one month to $1,460 the next is 220 ÷ 1,240 ≈ 17.7% —
> [percentage increase from one month to the next](https://percentageguru.com/percentage-increase-calculator)
> — and that growth rate, not the dollar figure, is what tells you whether a tag is drifting.

Check: 220 ÷ 1,240 = 0.1774…, so "≈ 17.7%".

### 5. Day 86 — resume bullets → the percentage decrease calculator

The "Real world" callout already uses "cut image size 60%" as the model bullet. Add one sentence
after it, inside the same callout:

> Get the number right before it goes on the page: an image that went from 1.2 GB to 480 MB is
> (1,200 − 480) ÷ 1,200 = a 60% cut, and a
> [percentage decrease calculator](https://percentageguru.com/percentage-decrease-calculator)
> checks it in a second. A bullet with a wrong percentage is worse than one with none.

Check: 720 ÷ 1,200 = 0.6 exactly, so "=" is right here.

### 6. Kubernetes Resource Calculator — headroom → the percent-of calculator

In the tool page's explanatory copy (the "requests × replicas = total" sentence, around line 57 of
`src/pages/kubernetes-resource-calculator.astro`), add one sentence. This is an `.astro` page, so
the link is an `<a>`:

> A common rule is to keep total requests at or under 70% of a node's allocatable CPU so there is
> room for bursts: 70% of a 4,000 m node is 2,800 m
> (<a href="https://percentageguru.com/">percent of a number</a>), which the totals above are
> easiest compared against.

Check: 4,000 × 0.7 = 2,800 exactly. If the page has a shared "copy" object or i18n catalog, add
the sentence to the English entry only; the de/es/fr/pt-br pages do not get the link.

## Not in this plan, on purpose

- **Salary / pay raise.** Days 86–90 do not discuss offers or salary, so there is no honest place
  for `/pay-raise-calculator` or `/salary-hike-calculator`. If a lesson on offers is ever written,
  that is where one goes; do not force it into the interview drill.
- **Every other tool page** (subnet, JWT, cron, hashing, jq, …). No percentage appears in them.
- **A "related sites" or "also by us" block anywhere.**

## After deploying

1. `curl -sI` each of the four target URLs: all must be 200.
2. Confirm the six source pages are indexed (Search Console → URL inspection). A link from a
   page Google has not indexed passes nothing; if one is not, that is the thing to fix first.
3. No reciprocal pairs on purpose: Percentage Guru does not link back to Day 38, Day 60, Day 86 or
   the Kubernetes calculator, and that is fine.

## What Percentage Guru already links to on OpsCanopy (shipped 2026-10-08, branch `links-opscanopy`)

| Percentage Guru page | Links to |
|---|---|
| `/percentage-decrease-calculator` (a p95 latency example) | `/promql-explainer/` |
| `/percentage-increase-calculator` (a cloud-bill example) | `/mission-90/day/47/` |
| `/percentage-change-calculator` (alert thresholds as percentage points) | `/loki-alert-rule-tester/` |
| `/average-percentage-calculator` (monthly availability weighted by requests) | `/mission-90/day/61/` |
| `/salary-hike-calculator` (a domain switch into DevOps) | `/mission-90/` |

If any of those five OpsCanopy URLs is ever renamed, tell the Percentage Guru side; its tests do
not fetch external hosts and would not notice.

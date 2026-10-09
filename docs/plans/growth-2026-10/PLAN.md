# OpsCanopy growth plan — authority first

Date: 2026-10-09. For: the owner (who submits, posts and decides everything below by hand).
Line numbers are as of main `d3e26cc`. PR #83 and the embed PR shift some of them (`CLAUDE.md`,
`src/layouts/Layout.astro`, `astro.config.mjs`), so `CLAUDE.md` is cited by section heading.

OpsCanopy does not have a page-count problem. It has an authority problem. The 2026-10-03 SEO
report shows Domain Rating 0 (`reports/seo/2026-10-03.md:14`), 24 impressions in 28 days (down
from 47) and clicks flat at 6 (`reports/seo/2026-10-03.md:10-11`), and of a 21-URL indexation sample only `/`
is indexed: 15 are "Crawled - currently not indexed" and 5 are unknown to Google
(`reports/seo/2026-10-03.md:55-57`). The report's own guidance applies: when differentiated tools
come back "Crawled - currently not indexed", "the constraint is authority and on-page work will
not move them" (`reports/seo/2026-10-03.md:27-29`). 646 sitemap URLs drew zero impressions
(`reports/seo/2026-10-03.md:91`): 320 English and 326 localized (de 82, es 79, fr 82, pt-br 83,
recounted from the list that follows that heading). June impressions were ≈423 *(per Search
Console, not in any report in the repo — unverified)*.

So this plan is about earning referring domains and being quoted by AI assistants, not about
shipping more pages. It runs in order: authority, AI-answer shaping, one owner decision on
localized pages, then (later, and only if the numbers move) a directory hub, new tools and ads.

## Rules (read before acting)

1. **Nothing automated.** The owner submits, posts and replies under their own accounts. No
   script, bot or agent submits to any list, directory or forum.
2. **One submission per target.** Each submission says plainly "I built this". If a target
   rejects or closes it, thank them and move on; never resubmit
   (`marketing/distribution/awesome-list-prs.md:218`).
3. **Never ask for votes.** No upvote requests, vote trading or paid boosts on Product Hunt,
   Hacker News or AlternativeTo, and never buy or swap GitHub stars.
4. **Write list entries yourself.** awesome-selfhosted bans machine/LLM-generated submissions
   outright (line 121 of its data repo's CONTRIBUTING.md,
   https://github.com/awesome-selfhosted/awesome-selfhosted-data/blob/master/CONTRIBUTING.md)
   and its PR template asks a human to confirm the submission was done by a human (line 9 of
   https://github.com/awesome-selfhosted/awesome-selfhosted-data/blob/master/.github/PULL_REQUEST_TEMPLATE.md).
   awesome-sysadmin's wording is narrower: "Machine/LLM-generated contributions, that do not
   respect project guidelines are not allowed and will result in a ban" (line 93 of
   https://github.com/awesome-foss/awesome-sysadmin-data/blob/master/CONTRIBUTING.md). For both,
   the owner writes the entry text personally.
5. **No change to localized indexing and no URL changes in this plan.** Section 5 is a decision
   for the owner, with a dated trigger; nothing ships until it is taken.
6. **Most of these links are nofollow.** GitHub puts `rel="nofollow"` on every link in a README
   (`marketing/distribution/awesome-list-prs.md:25-30`). Their value is reach into AI retrieval
   and referral visits, not PageRank. That is why the kill tests in section 9 count referring
   domains and referral sessions, not Domain Rating.

## Summary

| # | Step | When | Owner action |
|---|---|---|---|
| 1 | Authority: distribution list | now | Show HN once, AlternativeTo, then dated list entries |
| 2 | AI-answer shaping | now, two PRs in this batch | Review and merge PR #83 (cheat sheets) and "PR: embed widget" (not yet opened) |
| 3 | Localized dilution | decide on the trigger date | Pick (a), (b) or (c) in section 5 |
| 4 | Directory hub | later | Nothing until its gate passes |
| 5 | New tools | ongoing, filtered | Apply the three-question filter |
| 6 | Ads | later | Nothing until 50,000 pageviews a month |

## 1. Where traffic comes from today

GA4 sessions by source for the same window (`reports/seo/2026-10-03.md:748-763`): direct 256,
chatgpt.com 101, bing 53, google 46, duckduckgo 10, copilot.com 5, plus small tails; ≈488 sessions
in 28 days. Two things follow:

- **AI assistants are the second channel** (chatgpt.com + copilot.com = 106 sessions), ahead of
  every search engine.
- **Bing sends more than Google** (53 vs 46). ChatGPT search draws on Bing's index, so Bing
  indexation likely feeds the AI channel too *(inference, unverified)*.

## 2. Step 1 — authority

Already done: the GitHub repo has its homepage set and 6 topics. It has 1 star and was created
2026-06-07. Releases: v1.0.0 on 2026-09-04 and v1.1.0 on 2026-09-22. The licence is MIT
(`LICENSE:1`), and self-hosting with Docker is documented (`README.md:139-166`). There is no
`CHANGELOG.md` in the repo, but the site has a public changelog at /changelog/
(`src/pages/changelog.astro`, linked from the footer).

### Verified submission list (checked 2026-10-09)

| Target | How to submit | Key rules | Qualifies today? | Action |
|---|---|---|---|---|
| awesome-devops.xyz | It is wmariuss/awesome-devops (repo homepage http://awesome-devops.xyz; the site is built from its README.md). PR editing README.md, one tool per PR; a bot and an AI reviewer check it | Maintained, active within 2 years. A tool **with** a public repo needs an OSS licence, ≥100 stars and 6 months of history; the domain-age path is only for tools without a repo. No tracking parameters. Entry ends with a pricing tag. The bot also checks forks, contributors and signs of inflated stars | No: 1 star. 6 months of history is reached 2026-12-07 | PR #501 is still open (created 2026-07-27, updated 2026-09-04, 0 comments, 0 reviews) and now has merge conflicts (`mergeable: CONFLICTING`, checked 2026-10-09). Leave it, or close it yourself; do not rebase it onto a list it no longer qualifies for, and do not open a second PR. If #501 is closed, resubmit only after the repo has ≥100 stars, with the tag `oss` |
| techiescamp/devops-tools | PR to README.md, `* **[Tool Name](URL)** (License Type): description` inside the category's `<details>` block | Format and the "What to Avoid" list only | On paper, yes | **Skip.** Dormant: last push 2024-10-24, 17 open PRs (oldest #20, 2024-05-01) and none merged, last 3 closed PRs (#30, #27, #26) closed unmerged. Same lesson as sdras/awesome-actions (`marketing/distribution/awesome-list-prs.md:16-23`) |
| awesome-sysadmin | PR to awesome-foss/awesome-sysadmin-data adding `software/<name>.yml` (the main repo takes no PRs); an issue is the alternative | Free software; first release >12 months ago; maintained; install docs; not already on awesome-selfhosted; not your own project unless it has a healthy ecosystem with a few contributors; the submitter must say whether and how long they have used it (the 12-month, own-project and usage rules are lines 19, 12 and 33 of the data repo's `.github/PULL_REQUEST_TEMPLATE.md`; the 12-month rule is also line 57 of `.github/ISSUE_TEMPLATE/addition.md`) | No: first release 2026-09-04, own project, weak fit | Do not self-submit. Earliest 2027-09-04, and only by a third-party user. A listing here and one on awesome-selfhosted exclude each other |
| awesome-selfhosted | PR to awesome-selfhosted/awesome-selfhosted-data adding `software/<name>.yml` (format in its `.github/ISSUE_TEMPLATE/addition.md`) | FOSS licence; first release >4 months ago; maintained; install docs; not on awesome-sysadmin; human-only submission; excludes cloud-dependent software, libraries, PaaS and plain Dockerization | Not yet: MIT and Docker docs are fine, and the **Miscellaneous** category already lists IT-Tools (`software/it-tools-by-sharevb.yml`, the sharevb fork), OmniTools and CyberChef. First release 2026-09-04 | Submit on or after **2027-01-04**. The owner writes the entry. Point it at https://opscanopy.com/changelog/ as evidence for the "maintained" check; no `CHANGELOG.md` is needed |
| AlternativeTo | Create an account, "Suggest new application", then add it as an alternative to crontab.guru (`marketing/distribution/submissions.md:120-187`) | 7-day account age before submitting; no links in descriptions; no upvote drives; links are `rel="nofollow noopener"` (repo notes) | *Unverified*: the site returns 403 to automated fetches, so rules and the account's state could not be checked | Owner checks the account. Fix the tool count in the copy first (see section 10) |
| Product Hunt | Submit, New Product, paste the URL (producthunt.com/launch); makers may post their own product | No direct upvote asks, no vote trading, no paid boosts; relaunch allowed for a significant new version | Yes (no existing product page) | Low priority. Launch only **after "PR: embed widget" is merged and deployed**, so the launch has something new. Link rel and 2026 rule changes *unverified* |
| Show HN | Normal submission titled "Show HN: …" (news.ycombinator.com/showhn.html) | Something people can try without signing up; non-trivial; personally worked on; the author is around to discuss; HN dedupes URLs, so one shot per URL (`marketing/distribution/show-hn.md:6`) | Yes: no OpsCanopy submissions found on HN | **Highest-value single action.** Post one differentiated tool, the GitHub Actions Expression Tester (`marketing/distribution/show-hn.md:29`), on a weekday, now. It is not gated on the embed PR: that tool is not in the embed set, so waiting gains it nothing, and the prepared copy is about it. Prepared replies: `marketing/distribution/hn-comment-prep.md`. The owner writes every reply. HN's stance on AI-written text *unverified* |

Also still prepared and unsent: a Console.dev email and a Changelog News submission
(`marketing/distribution/submissions.md:8-118`). Their current acceptance rules are *unverified*.

**Order:** Show HN (now) → AlternativeTo → Product Hunt → awesome-selfhosted on
2027-01-04 → awesome-devops only once the star gate is met. Console.dev and Changelog whenever
convenient.

## 3. Step 2 — shape what AI assistants find

What is already in place: every major AI crawler is explicitly allowed. The `AI_AGENTS` list
(`src/pages/robots.txt.ts:27-54`) names GPTBot, OAI-SearchBot, ChatGPT-User, ClaudeBot,
Claude-SearchBot, Claude-User, anthropic-ai, PerplexityBot, Perplexity-User, Google-Extended,
Applebot-Extended, CCBot and others, and nothing is disallowed (`src/pages/robots.txt.ts:63-66`).
`/llms.txt` and `/llms-full.txt` exist and are generated from the same registries as the site
(`CLAUDE.md`, "Site config" section).

Actions, in this batch:

- **"PR: cheat sheets"** (PR #83, open, not merged). An English-only hub at `/cheatsheets/`
  with a first set of dense, hand-checked reference pages: **docker, openssl and jq**; kubectl
  and systemctl-journalctl come in a second batch. The pages are linked to the matching tools and
  included in `llms.txt`, `llms-full.txt`, the sitemap and search. These are answer-shaped
  pages: the kind of content an assistant quotes and links.
- **"PR: embed widget"** (in this batch, not yet opened). `/embed/<tool>/` pages for four tools:
  **cron-expression-tester, subnet-calculator, chmod-calculator and llm-vram-calculator**, plus a
  copyable embed snippet on those tool pages. The backlink that counts is the plain
  `<a href=…/tool/>Tool</a> by OpsCanopy` line the snippet places **below** the iframe
  (`src/lib/embeds.ts:34` in the embed PR). The "Powered by OpsCanopy" link inside the frame sits
  on OpsCanopy's own noindex page and passes the host page nothing. Embedders can delete the
  outside line, so ask them to keep it and count only domains where it survives. Embeds are the
  one channel in this plan that can earn *followed* links. Note that this PR relaxes `frame-ancestors 'none'` (`public/_headers:92`) for the embed pages only; the
  rest of the site stays unframeable.

Ongoing:

- Keep `SITE_INTRO` (`src/pages/llms.txt.ts:32`) in step with `public/_headers`. They must be
  edited together (`CLAUDE.md`, "Site config" section).
- Set up Bing Webmaster Tools if not done yet (`docs/seo-setup.md:203`). Bing is the bigger search
  source today and likely feeds ChatGPT search *(inference, unverified)*.

Metric: GA4 sessions from chatgpt.com + copilot.com + perplexity.ai + claude.ai. Baseline 106.

## 4. Why not just publish more pages

Programmatic variants were already tried and most were declined as near-duplicates; only a
keep-list stays indexable (`src/data/variants/indexable.json`). With 15 of 21 sampled URLs crawled
and not indexed, more pages of the same kind add crawl load, not rankings. Cheat sheets are the
exception because they are a different, reference-shaped format, and their kill test is in
section 9.

## 5. Owner decision — localized dilution

**Facts.** 326 of the 646 zero-impression sitemap URLs (≈50%) are localized copies. All four
localized URLs in the indexation sample (`/{de,es,fr,pt-br}/subnet-calculator/`) are
"Crawled - currently not indexed" (`reports/seo/2026-10-03.md:50-53`). The localized pages that
drew any impressions are few (`reports/seo/2026-10-03.md:83-89`): the `/de/`, `/es/` and `/fr/`
homes with 3 each, and three `www.` rows without a trailing slash — `www.opscanopy.com/es/` (1),
`www.opscanopy.com/es/blog/reading-promql` (2) and `www.opscanopy.com/fr/subnet-calculator` (2).
So the canonical `/fr/subnet-calculator/` is not indexed, but its `www.` no-slash variant still
drew 2 impressions.

**Options.**

- **(a) Keep as is.** Cheapest. Accepts that half the sitemap is copies Google declines.
- **(b) Noindex localized blog posts only.** Keeps localized tools and homes; removes the
  largest block of thin copies.
- **(c) Noindex all localized pages except the four locale homes.** The strongest signal that
  English is the canonical body of work.

**How (b) or (c) would be built** (not in this batch). Copy the variant pattern: a JSON keep-list
read both by the sitemap filter and by the pages, as `isNoindexVariant` does
(`astro.config.mjs:40-50`, filter at `astro.config.mjs:89-100`). Pages emit `noindex,follow`
through the existing `noindex: 'follow'` prop (`src/components/SEO.astro:28-29,108`,
`src/layouts/Layout.astro:31-32`). Reverting is emptying the list.

**Caveat.** English pages declare hreflang alternates pointing at their localized copies, in the
page markup (`src/components/SEO.astro`) and in the sitemap (the sitemap integration's `i18n` option, `astro.config.mjs:80`; x-default
is added at `astro.config.mjs:104-119`). A
noindexed copy must also be dropped from its hreflang group (`noAlternates` / `availableLocales`,
`src/layouts/Layout.astro:38`); otherwise the site advertises URLs it asks Google to ignore —
the same mistake the thin-tags comment warns about (`astro.config.mjs:96-98`).

**Trigger (the single definition used in this plan).** Look at the 10 English tool pages in
the report's indexation sample (the "differentiated" and "commodity" rows,
`reports/seo/2026-10-03.md:35-44`). If on **2026-12-09** fewer than 3 of those 10 are indexed
while the four localized sample URLs are still "Crawled - currently not indexed", the owner picks
(b) or (c). Otherwise keep (a) and look again at the next monthly report.

## 6. Later — a directory hub

A curated "DevOps tools directory" hub (including other people's tools) is deferred until DR is
above 0 and at least 5 English tool pages are indexed. *This threshold is an opinion, not a
measured rule.* A directory on a domain Google does not yet trust is another set of pages it
will decline.

## 7. New tools — a filter, not a pipeline

Reuse the ranked backlog in `docs/plans/audit-2026-08/09-new-tools/PLAN.md:37-60` and its
registration checklist (`docs/plans/audit-2026-08/09-new-tools/PLAN.md:9-28`). Ship a new tool
only if all three hold:

1. There is no well-known free equivalent, or ours is clearly better.
2. It is worth embedding or linking to (it can join the embed set).
3. It fits a cheat sheet or a blog post that already exists or is planned.

At most one new tool a month until the authority checkpoint in section 9 passes. *This cadence
is an opinion.*

## 8. Ads — later, and in this order

Baseline: ≈488 GA4 sessions in 28 days (`reports/seo/2026-10-03.md:748-763`). Monthly pageviews
are not in any repo report *(unverified; likely about 1-2k)*.

- **EthicalAds** (ethicalads.io/publishers and its FAQ): "Your site needs at least 50,000
  pageviews per month"; the sign-up form's lowest bucket reads "Less than 50,000 - Not a fit
  yet". Developer sites, DevOps included; occasional exceptions for fast growth; no tracking
  cookies. Policy (ethicalads.io/publisher-policy): one EthicalAds ad per page, no competing ad
  network on the page, placed above the fold outside main content, CTR at least 0.1%. Roughly
  $2.50 per 1,000 pageviews in the EU and North America. **Not eligible today: ≈25-50× short.**
- **Carbon** (carbonads.net/faq): invitation only, apply via /join. Judged on relevance, monthly
  pageviews, maintenance, capacity, placement and exclusivity. No public minimum *(threshold
  unverified)*.
- **AdSense** (support.google.com/adsense/answer/9724): 18+, original content that attracts an
  audience, policy compliance, HTML access. Since 2024-01-16 (EEA/UK) and 2024-07-31
  (Switzerland), a Google-certified consent platform using IAB TCF is required
  (answer/13554116) *(partly unverified; read from a search summary)*. `ads.txt` requirements
  *unverified*. With 1 of 21 sampled URLs indexed, a "low value content" rejection is likely
  *(inference)*.

**Order:** wait for ≥50,000 pageviews a month → EthicalAds → consider Carbon → AdSense only after
the owner signs off the privacy changes below.

**Files that must change before any ad network** (listed only; change nothing now):

- Privacy copy in all five locales, in one commit:
  - `src/i18n/pages/en.ts:119` ("We do not use advertising cookies, cross-site trackers, or
    fingerprinting") and `src/i18n/pages/en.ts:157` ("We do not embed advertising networks or
    social tracking pixels").
  - The same two lines in `src/i18n/pages/de.ts:50,88`, `src/i18n/pages/es.ts:50,88`,
    `src/i18n/pages/fr.ts:60,98` and `src/i18n/pages/pt-br.ts:50,88`.
  - The on-device storage list, `src/i18n/pages/en.ts:124-136` (and locales), if an ad network
    stores anything.
- `public/_headers:92`, the Content-Security-Policy: `script-src`, `connect-src` and `img-src`
  would need ad hosts, and there is no `frame-src`, so `default-src 'self'` blocks ad iframes.
  The comment at `public/_headers:22-24` says `connect-src` enforces "your input never leaves
  the browser"; widening it weakens that guarantee.
- `public/_headers:81`, the Permissions-Policy, which sets `browsing-topics=()`.
- `src/pages/llms.txt.ts:32`, `SITE_INTRO`, edited together with `_headers` (`CLAUDE.md`, "Site config" section).
- `src/layouts/Layout.astro:136-151`, Consent Mode, which denies every `ad_*` signal everywhere.
- `src/lib/consent.ts` and its test: a home-made analytics-only toggle, not a TCF consent
  platform.
- `public/ads.txt`, which does not exist.
- External copy: `marketing/distribution/submissions.md` promises "no endpoint a tool page could
  send your input to", and the GitHub repo description says the tools "never touch a server".

EthicalAds alone is the smallest change: it still needs the `src/i18n/pages/en.ts:157` line (and its four
translations) and the CSP hosts, but the `src/i18n/pages/en.ts:119` promise stays true because it sets no
tracking cookies.

## 9. Metrics and kill criteria

Read every row from the weekly or monthly SEO report. Impressions lag; report them, never kill
on them.

| Step | Metric (source) | Baseline (2026-10-03) | Checkpoint | Kill or pivot |
|---|---|---|---|---|
| Authority | Referring domains, nofollow included (Ahrefs), plus referral sessions from listing sites (GA4). Report DR alongside, but do not judge on it | RDs *unknown, unverified*; DR 0; referral sessions from listings 0 | 2026-12-09: ≥5 RDs. 2027-01-09: ≥10 RDs and ≥30 referral sessions in 28 days from listings and Show HN | Fewer than 5 RDs and fewer than 10 referral sessions on 2027-01-09, after Show HN and two listings → stop list work and switch effort to embeds and guest content |
| Indexation | English tool pages indexed, out of the 10 in the sample (`reports/seo/2026-10-03.md:35-44`) | 0 of 10 | 2026-11-09: ≥2. 2027-01-09: ≥5 | Fewer than 3 on 2026-12-09 with the localized sample still not indexed → section 5 decision (same trigger, same definition) |
| AI answers | Sessions from chatgpt.com + copilot.com + perplexity.ai + claude.ai in 28 days (GA4) | 106 | 2026-11-09: ≥106. 2027-01-09: ≥200 | Below 80 in two reports running → check robots, `llms.txt` and Bing indexing before adding content |
| Show HN | Points, referral sessions that week, follow-on links | Not posted | 7 days after posting | Never repost the same URL |
| Cheat sheets (PR #83, open) | Cheat-sheet pages indexed, out of the 4 URLs in #83 (hub, docker, openssl, jq); AI referrals landing on them | 0 (not merged) | 2027-01-09: ≥2 of 4 indexed | 0 indexed on 2027-01-09 → stop writing new sheets |
| Embeds ("PR: embed widget", not yet opened) | External domains that keep the snippet's link below the iframe (Ahrefs RDs); click-throughs from the in-frame link (GA4 sessions with `utm_source=embed`) | 0 (not merged) | 2027-01-09: ≥3 domains | 0 → do not extend beyond the four tools |
| Ads | Monthly pageviews (GA4) | ≈488 sessions in 28 days; pageviews unknown | Monthly | Nothing before 50,000 pageviews a month; AdSense only after privacy sign-off |

If any listing site turns out to give a *followed* link, note it in the report; the rendered
awesome-devops.xyz page might, but that is *unverified*.

## 10. Corrections to existing notes

These notes are outdated. They are listed here, not edited, so the owner can fix them in one
pass:

- `marketing/distribution/awesome-list-prs.md:207-209` says awesome-selfhosted would close
  OpsCanopy "immediately and correctly" because it is a hosted site. Outdated: the repo documents a
  Docker self-hosting setup (`README.md:139-166`), similar browser toolboxes (IT-Tools, OmniTools, CyberChef)
  are listed under Miscellaneous, and OpsCanopy qualifies from 2027-01-04.
- `marketing/distribution/awesome-list-prs.md:5` describes PR #501 as open and mergeable. It is
  still open, but it predates the list's current entry rules: the entry
  (`marketing/distribution/awesome-list-prs.md:60`) has no pricing tag, and the repo is far below
  the 100-star rule. The list's star count in the note (4,303) is now 4,414.
- `docs/seo-setup.md:255` calls awesome-list links "real followed" links. That contradicts
  `marketing/distribution/awesome-list-prs.md:25-30`, which is correct: GitHub nofollows them.
- The tool count is **42**: 42 tools in `src/data/tools.ts` have `status: 'live'` (`liveTools`,
  `src/data/tools.ts:937`), and the live site says "42 tools" (checked 2026-10-09). Stale copies:
  "39" in `README.md:5,29`, "39" in the GitHub repo description, "39" at
  `marketing/distribution/submissions.md:149` and "29" at
  `marketing/distribution/submissions.md:22,41,51,59,157`. Fix them all before any of that copy is
  sent, ideally reading the count from `liveTools` where the copy is generated.

## Not in this plan, on purpose

- **Paid links and link exchanges.** Same reasoning as the Percentage Guru plan
  (`docs/plans/percentage-guru-links/PLAN.md:14-16`): a visible link-exchange pattern is worth
  less than nothing.
- **Buying or swapping stars or votes.** The awesome-devops bot checks for inflated stars, and
  the vote-based sites forbid vote trading (rule 3).
- **Automated posting or submission** of any kind (rule 1).
- **Any change to localized indexing** before the section 5 decision.
- **More programmatic pages.** See section 4.

## After each step

1. Show HN posted: record points, comments and that week's referral sessions in the next report.
2. Each listing accepted: add the referring domain to the report and check GA4 for its referrals.
3. Embed and cheat-sheet PRs merged and deployed: start their rows in section 9 from that date.
4. 2026-12-09: run the section 5 trigger and record the decision in this file.
5. 2027-01-04: submit to awesome-selfhosted (owner-written entry).
6. 2027-01-09: run every kill test in section 9 and record the outcome here.

## Status

Plan only. Nothing above has been submitted, posted or changed. The cheat sheets are PR #83
(open, under review); the embed PR is not yet opened. Neither is live.

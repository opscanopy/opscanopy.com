# Awesome-list pull requests

## Status: 1 submitted, 3 rejected as bad fits

**[wmariuss/awesome-devops#501](https://github.com/wmariuss/awesome-devops/pull/501)** — open.
+1 line, 0 deletions, mergeable, in Productivity Tools.

I originally planned two PRs from a shortlist I had not actually inspected.
Checking each list against the API changed the answer. Star counts and, more
importantly, **whether the list is still maintained and whether it has any
precedent for a hosted web tool**:

| List | Stars | Last push | Verdict |
|---|---|---|---|
| **wmariuss/awesome-devops** | 4,303 | 3 days ago | **Submitted.** Actively maintained, and the entry directly above mine is `YAML Validator (yamlvalidator.dev)` — an online browser validator. Exact precedent, exact section. |
| sdras/awesome-actions | 28,068 | **Sep 2024** | Skipped. Dormant ~23 months, so a PR would likely never be reviewed. Worse, the list is "awesome *actions* to use on GitHub": every Utility entry is a `github.com` repo. Of 18 non-GitHub links in the whole file, all are tutorials, blog posts or videos. **No precedent for a hosted tool** — this would be closed as off-scope, and my earlier recommendation to target it was wrong. |
| brandonhimpfen/awesome-github-actions | **6** | May 2026 | Skipped. Moved from `awesomelistsio`. Six stars is negligible authority; not worth an entry. |
| dastergon/awesome-sre | 13,402 | Aug 2025 | Skipped. Articles, books and talks. Its "SRE Tools" section is three links to *other curated lists*, not to individual tools. Off-pattern. |

**The lesson, recorded so it is not repeated:** an awesome-list link is worth
something only if the list is maintained AND the entry genuinely fits its
pattern. Star count alone is misleading — the 28k-star list is the worst target
of the four.

## Correction: these are NOT dofollow links

An earlier version of this file said awesome lists give "real dofollow links from
high-authority repos". **That is wrong.** GitHub applies `rel="nofollow"` to every
link in user content without exception — a single render of the `free-for-dev`
README carries **1,330 `rel="nofollow"` attributes**. No awesome-list entry passes
any PageRank, on any repo, ever.

The same holds for every other target in this category, verified against live HTML:

| Target | Link attribute |
|---|---|
| GitHub READMEs (all awesome lists) | `rel="nofollow"` |
| AlternativeTo | `rel="nofollow noopener"` |
| SaaSHub | `rel="nofollow"` |
| Reddit, Stack Overflow | `rel="nofollow ugc"` |
| Hacker News, LinkedIn, X, Lemmy | nofollow |

**The only followed links available to this site** are the repo's own `website`
field on github.com, and outbound links inside articles we publish on dev.to.

This matters because it changes what these submissions are *for*. They are worth
doing — but for **LLM retrieval surface**, **referral traffic**, and **second-order
editorial links** (a Show HN or Reddit hit gets picked up by newsletters, and
*those* links are followed). Not for link equity. Believing otherwise is what
justifies over-investing in directory submissions, which is the trap this file
exists to avoid.

---

## Submitted entry, for reference

Section: **Productivity Tools**, appended after the `YAML Validator` line.

```markdown
- [OpsCanopy](https://opscanopy.com/) - Browser-based DevOps utilities: GitHub Actions and GitLab CI validators, expression and trigger testers, PromQL/LogQL explainers, subnet, cron and JWT tools. No signup, runs client-side.
```

The PR body explains why Productivity Tools rather than Continuous Integration &
Delivery — that section lists CI/CD *platforms* (Jenkins, Circle CI, Travis) and
OpsCanopy is not one — and carries an explicit `Disclosure: I built this.`

---

## If you want more links later

Better use of effort than forcing more list entries:

- **The Show HN** (see `show-hn.md`) — one post on a domain search engines trust
  enormously beats several low-authority list entries.
- **Answering real questions on Reddit** (see `reddit.md`) — heavily weighted in
  LLM retrieval.
- Watch for *new* awesome lists in this space; a young list will accept an entry
  that a dormant 28k-star one never will.

---

## Original instructions (retained for the manual route)

The steps below still apply if you ever want to submit by hand.

**Why this matters — and it is NOT link equity:** every link is `rel="nofollow"`
(see the correction above), so none of it passes PageRank. What a merged entry
actually buys is being read heavily by LLMs when answering "what tool should I use
for X", which is exactly the surface you're trying to appear on, plus steady
referral traffic. That keeps working indefinitely, which is why it is still worth
the twenty minutes.

**One rule, and it is the whole game:** submit each PR **separately**, and only
to lists where the tool genuinely belongs. Maintainers close self-promotional
bulk submissions on sight, and a rejection is remembered.

---

## PR 1 — `sdras/awesome-actions` (best fit)

**Repo:** https://github.com/sdras/awesome-actions
**File:** `README.md`
**Section:** Community Resources → **Utility**
**Placement:** append to the **end** of that section's list — their
`contributing.md` requires it.

### Steps

1. Open https://github.com/sdras/awesome-actions/blob/main/README.md
2. Click the **pencil icon** (Edit this file) — GitHub forks it for you
3. Find the **Community Resources → Utility** list, scroll to its last entry
4. Add this on a new line after it:

```markdown
- [GitHub Actions Expression Tester](https://opscanopy.com/github-actions-expression-tester/) - Evaluate `${{ }}` expressions with GitHub's coercion rules and simulate which jobs run for an event, in the browser.
```

5. **Commit message** (their rules reject "Update readme.md"):

```
Add GitHub Actions Expression Tester to Utility
```

6. **PR title:**

```
Add GitHub Actions Expression Tester to Community Resources / Utility
```

7. **PR body:**

```
Adds a browser-based tester for GitHub Actions expressions and trigger filters.

Two things it does that I couldn't find elsewhere in the list:

- Evaluates `${{ }}` using GitHub's coercion rules rather than JavaScript's,
  and explicitly flags the always-true `if:` shape from actions/runner#1173 —
  `if: ${{ github.event_name }} == 'push'` substitutes to a non-empty string
  and is therefore always truthy.
- Simulates a push / pull_request / tag event against a workflow and reports
  which jobs run or skip, with the deciding filter traced. It models the
  branch-vs-tag matrix and the AND-semantics of `branches` + `paths`.

Behaviour is pinned to a versioned conformance corpus (90 tests) so the
semantics are testable rather than best-effort.

Runs fully client-side — no signup, no upload, and the site's CSP sets
`connect-src` to the origin plus Google Analytics only — the engine never transmits what you paste.

Disclosure: I built this.
```

> The disclosure line is not optional. Maintainers find out anyway, and being
> upfront reads as good faith rather than something you tried to hide.

---

## PR 2 — `wmariuss/awesome-devops`

This list explicitly accepts hosted and commercial services, not just
open-source repos, so a web tool is in scope.

**Repo:** https://github.com/wmariuss/awesome-devops
**Section:** **Continuous Integration & Delivery**

Same web-UI flow. Entry:

```markdown
- [OpsCanopy](https://opscanopy.com/) - Browser-based DevOps utilities: GitHub Actions and GitLab CI validators, expression and trigger testers, cron, subnet and JWT tools. No signup, runs client-side.
```

**PR title:**

```
Add OpsCanopy to Continuous Integration & Delivery
```

**PR body:**

```
Adds OpsCanopy, a set of 29 browser-based DevOps utilities.

Relevant to this section: GitHub Actions workflow validator, GitHub Actions
expression and trigger tester, GitLab CI validator, and a Docker run to Compose
converter. Others cover observability (PromQL, LogQL, Alertmanager routing,
Prometheus relabeling), networking (subnet, CIDR, PTR) and encoding.

Everything runs client-side with no signup and no upload — the site's CSP sets
`connect-src` to the origin plus Google Analytics only, and the engines never transmit what you paste. That is the
main reason it exists: the equivalent hosted validators all POST your CI config
to a server, which is awkward when it contains internal hostnames and secret
names.

Disclosure: I built this.
```

---

## Deliberately NOT submitting

**`dastergon/awesome-sre`** — I checked its structure. It is almost entirely
books, talks and articles, and its "SRE Tools" section links to *other curated
lists* rather than to individual tools. An entry would be off-pattern and
likely closed. Not worth spending a first impression on.

**`awesome-selfhosted`** — explicitly for software you host yourself. OpsCanopy
is a hosted site. It would be closed immediately and correctly.

---

## What to expect

Awesome-list maintainers are volunteers; merges take **days to weeks**. Some
never respond. Two PRs, maybe one merges — that is a normal and good outcome.

If a maintainer asks for a change, make it promptly. If one declines, thank them
and move on. Do not resubmit.

---

## Third target, when you have a spare 10 minutes

Your **GitHub repo itself** is an asset you aren't using. `opscanopy/opscanopy.com`
is public with 250+ commits and no description or topics set.

- Add a repo **description** and **website** link
- Add **topics**: `devops`, `github-actions`, `sre`, `astro`, `developer-tools`,
  `observability`
- Make sure the README leads with what the site is and links to the live tools

GitHub topic pages get crawled, and the repo is a followed link to your domain
that costs nothing and needs no maintainer's approval.

# Awesome-list pull requests — ready to submit

Two PRs. Each takes about 3 minutes through GitHub's web UI — no clone needed.

**Why this matters more than the traffic:** these repos have very high domain
authority and are followed links. They are also read heavily by LLMs when
answering "what tool should I use for X", which is exactly the surface you're
trying to appear on. A merged entry keeps working indefinitely.

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

Behaviour is pinned to a versioned conformance corpus (72 tests) so the
semantics are testable rather than best-effort.

Runs fully client-side — no signup, no upload, and the site's CSP sets
`connect-src 'self'`, so a pasted workflow cannot leave the browser.

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
`connect-src 'self'`, so pasted configs cannot leave the browser. That is the
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

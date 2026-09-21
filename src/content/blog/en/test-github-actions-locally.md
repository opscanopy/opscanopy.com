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

You want to know whether a workflow will actually do what you think before you push — whether a job runs on the right containers, whether your steps produce the output you expect, whether one `if:` condition evaluates the way you assumed. **Test GitHub Actions locally** usually means one of two very different things, and conflating them is why people end up frustrated with whichever tool they picked first: do you want to *run* the workflow, or do you want to *evaluate* one piece of its logic? This post covers both, and where each option starts to run out of road.

## Run GitHub Actions locally with act

[`act`](https://github.com/nektos/act) is the well-known open-source tool for this: it reads your `.github/workflows/*.yml` files and, for each job, spins up a Docker container and executes the job's steps inside it, the way a GitHub-hosted runner would. That means real shell commands actually run, real `uses:` actions actually execute (pulled and run in the container), and you get real stdout/stderr — much closer to "did this actually work" than any static check can offer.

Basic usage, once Docker and `act` are both installed:

```bash
act -l                  # list the jobs act sees in your workflows
act push                # simulate a push event and run matching jobs
act -j build            # run only the "build" job
act pull_request        # simulate a pull_request event
```

`act` accepts a `--secret-file` for supplying secrets your workflow references, and lets you choose which Docker image stands in for `ubuntu-latest` — the default minimal image is much smaller than GitHub's actual runner image and is missing tools those runners ship, so the `catthehacker` images are a commonly used, closer approximation, documented in `act`'s own README. A `.actrc` file in your repo (or home directory) lets you pin that image choice, default platform, and common flags once instead of retyping them on every invocation — install it via your platform's package manager (Homebrew's `brew install act` and a `winget`/`choco` package on Windows are both documented in the project's README) plus a working Docker installation, since every job it runs is, underneath, a container.

## test github actions locally vscode

Several community VS Code extensions wrap `act` so you can trigger a workflow or a single job from the editor's UI instead of a terminal — search the marketplace for "act" or "GitHub Actions" and you'll find a few actively maintained options. GitHub also publishes its own official "GitHub Actions" extension, which gives you workflow syntax highlighting, run monitoring, and secrets management inside VS Code, though local execution in that ecosystem still goes through `act` under the hood — the container-execution model and its limitations, described below, apply regardless of which UI is triggering it.

## What act cannot do: isolate a single expression

Here's the gap that causes the most confusion. `act` runs whole jobs in Docker containers — it does not have a mode for "evaluate just this one `if:` expression against this specific context and tell me true or false." If you want to know whether `if: ${{ steps.check.outputs.changed == 'true' }}` will be true, your options with `act` alone are: run the entire job — pulling images, executing every prior step for real — and read the logs to see whether the step was skipped, or sprinkle `run: echo "::debug::${{ ... }}"` lines through your YAML and re-run the job until you've narrowed it down. Both work, but both cost you a full container spin-up per iteration, and neither one lets you try a context you haven't actually produced yet — say, "what would this evaluate to if the previous step had failed."

That's a different job from what `act` is built to do, and it's exactly the gap the [GitHub Actions Expression Tester](/github-actions-expression-tester/) fills: paste a single expression, edit a mock `github` / `env` / `steps` / `needs` context by hand — including states you haven't triggered yet — and get the evaluated result instantly, using GitHub's documented coercion and operator rules (case-insensitive string `==`, the JS-like type coercion, `&&`/`||` returning operands rather than booleans), all in the browser with no Docker, no container pull, and no waiting on step output. It also flags the single most common cause of a condition that's silently always true: literal text left outside `${{ }}`, which the runner treats as non-empty — and therefore truthy — text rather than an expression at all. We covered that exact footgun, and its fix, in [why your GitHub Actions "if" condition always runs](/blog/github-actions-if-condition-always-true/); the short version:

```yaml
# BAD — quoting the whole condition makes it a truthy string literal
- if: "${{ steps.changed.outputs.any == 'true' }}"
  run: ./deploy.sh
```

```yaml
# FIXED — one bare expression, no surrounding quotes, no stray ${{ }}
- if: steps.changed.outputs.any == 'true'
  run: ./deploy.sh
```

An expression tester catches that instantly, with no container involved, because it's evaluating the expression grammar directly rather than waiting to observe whether a step ran.

## A quick checklist for "did I actually test this?"

1. Lint the YAML first — `actionlint` catches malformed syntax, unknown keys, and expression type errors before you spend time on anything else.
2. If a specific `if:` or `${{ }}` expression is the thing you're unsure about, evaluate it in isolation against a mock context rather than guessing from a full run.
3. If the workflow's actual behavior — the commands, the build, the side effects — is what you need confidence in, run the real job with `act` against a Docker image close enough to GitHub's own runner to matter.
4. Treat a clean local pass as strong evidence, not proof — runner labels, exact tool versions, token scoping, and unusual event payloads can still differ once the workflow runs on GitHub's actual infrastructure.

## What neither tool replaces

Neither `act` nor an expression evaluator is a substitute for `actionlint`, the widely used static linter for workflow YAML syntax and typing — that's a third, complementary job, catching malformed YAML and unknown keys before you even get to runtime behavior. And even a clean `act` run isn't identical to GitHub's hosted infrastructure: runner labels, exact tool versions, `GITHUB_TOKEN` permission scoping, and the real webhook payload for exotic event types can all differ from what a local container reproduces. Treat a good local result as strong confidence, not a formal guarantee that GitHub's own runners will behave identically.

## When to use which

- **`act`** — you want to know whether a whole job or workflow does what it's supposed to: real steps executing, real command output, real exit codes. Use it before merging anything where you can't afford a broken pipeline, and budget the time for Docker image pulls.
- **An expression tester** — you want to know, in seconds, whether one `if:` condition or `${{ }}` expression evaluates the way you think, especially against a context state you haven't actually produced yet, like a failed prior step or a specific input value. No Docker, no waiting, and it's the faster loop for the "why did my condition run when it shouldn't have" class of bug.
- **`actionlint`** — you want to catch YAML syntax errors, unknown keys, and type mismatches before either of the above even applies.
- **Together**, they cover most of what "will this workflow behave correctly" actually requires: lint the syntax, evaluate the specific conditions you're unsure about, then run the real thing in `act` before you trust it in production CI.

If you're chasing a `github actions if condition` that always runs true right now, start with the [GitHub Actions Expression Tester](/github-actions-expression-tester/) — it's free, instant, and runs entirely in your browser; then confirm the fix with a real `act` run if the job itself is complex enough to warrant it.

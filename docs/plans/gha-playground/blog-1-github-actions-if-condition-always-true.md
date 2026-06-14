---
title: "Why Your GitHub Actions \"if\" Condition Always Runs (and How to Fix It)"
description: "Your GitHub Actions if condition always runs true? It's the literal-text footgun: any text outside ${{ }} coerces to a truthy string. Here's the cause and the fix."
pubDate: 2026-06-14
tags: ["github-actions", "ci-cd"]
relatedTool:
  name: "GitHub Actions Expression & Trigger Tester"
  href: "/github-actions-expression-tester"
---

You added an `if:` to a step so it would only run on `main`, or only on a tag, or only when a previous step set an output. Then you pushed — and the step ran anyway. Every time. On every branch. The condition is just decoration.

If your GitHub Actions `if` condition is not working — specifically, if it *always* evaluates to true — you almost certainly hit the single most common footgun in the whole product: **putting literal text where GitHub expects an expression.** The runner doesn't error on it. It quietly coerces your text to a non-empty string, decides a non-empty string is truthy, and runs the step. This post shows the exact bad patterns, the fixes, and the coercion rules underneath so you stop guessing.

## The footgun: literal text outside `${{ }}` is always truthy

In an `if:`, GitHub already evaluates the value as an expression — you do **not** wrap the whole thing in `${{ }}`. But the moment any literal text leaks outside the expression braces, the runner stops treating the line as a condition and starts treating it as a string. A non-empty string is truthy. Your step always runs.

```yaml
# BAD — the ${{ }} is embedded in a larger string, so the whole if: is a string
- name: Deploy
  if: ${{ github.ref == 'refs/heads/main' }} && success()
  run: ./deploy.sh
```

That looks reasonable, but the runner sees: evaluate `${{ ... }}` to `true`, then concatenate ` && success()` as **literal text**. The final value is the string `"true && success()"` — non-empty, therefore truthy. The step runs on every branch.

The fix is to write **one** expression with no braces and no stray text:

```yaml
# FIXED — a single bare expression, no ${{ }}, no trailing literal
- name: Deploy
  if: github.ref == 'refs/heads/main' && success()
  run: ./deploy.sh
```

The same trap catches you when you quote the *whole* condition:

```yaml
# BAD — the entire condition is a quoted string literal, always truthy
- if: "${{ steps.check.outputs.changed == 'true' }}"
  run: ./build.sh
```

Wrapping the expression in quotes makes the YAML value a plain string. GitHub finds a `${{ }}` inside it, substitutes the result, and you're back to a non-empty string. Drop the quotes and the braces:

```yaml
# FIXED
- if: steps.check.outputs.changed == 'true'
  run: ./build.sh
```

Rule of thumb: **in an `if:`, there are no `${{ }}` and no surrounding quotes.** Just the expression. The braces are for interpolating values into `run:`, `name:`, and `with:` — not for conditions.

You can paste either of these into the [GitHub Actions Expression & Trigger Tester](/github-actions-expression-tester) and watch it flag the literal-text leak before you push — it warns on exactly this pattern (it's tracked as [actions/runner#1173](https://github.com/actions/runner/issues/1173), the most-reacted bug in the runner repo).

## The implicit `success()` that vanishes when you add an `if:`

Here's the second surprise, and it's the reason "my conditional step runs even though the previous step failed."

Every step and job has an **implicit `success()` condition**. With no `if:` at all, a step runs only if everything before it succeeded. That's why pipelines stop on the first failure without you writing anything.

The instant you add a *custom* `if:`, that implicit `success()` is **gone**. Your condition is now the *whole* truth.

```yaml
# BAD — you wanted "on main", but you deleted the implicit success() guard
- name: Notify on main
  if: github.ref == 'refs/heads/main'
  run: ./notify.sh   # now runs on main EVEN IF the build above failed
```

If you still want the step to require success, say so explicitly:

```yaml
# FIXED — re-add the success() guard you lost
- name: Notify on main
  if: success() && github.ref == 'refs/heads/main'
  run: ./notify.sh
```

This is also why people are confused that a "cleanup" step runs only on success when they wanted it to run no matter what — the implicit guard is still there until they add `always()`.

## `success()` vs `always()` vs `failure()` vs `cancelled()`

These four status functions decide *whether the step considers prior results at all*. Mixing them up is the other half of "my `if` doesn't behave."

- **`success()`** — true only if all previous steps/jobs succeeded. (This is the implicit default.)
- **`failure()`** — true if any previous step failed. Use it for failure notifications.
- **`always()`** — true unconditionally; the step runs even if a prior step failed *or the workflow was cancelled*. Use for cleanup that must always happen.
- **`cancelled()`** — true only when the workflow was cancelled.

The classic mistake is combining `always()` with another condition using `&&` and expecting it to still run on cancellation — it does, but people often want the opposite:

```yaml
# BAD — "always upload logs, but only on main" — this does NOT short-circuit on failure
- name: Upload logs
  if: github.ref == 'refs/heads/main'
  run: ./upload-logs.sh   # skipped when the build fails, because implicit success() is gone... wait, no — it's gone, so it runs? See below.
```

To be precise about that last one: because you supplied a custom `if:`, the implicit `success()` is dropped, so the step runs on `main` *regardless* of whether the build passed. If you actually want "upload logs on main, pass or fail," that's what you have — but make the intent explicit so the next reader isn't guessing:

```yaml
# FIXED — explicit: run on main whether the build passed or failed
- name: Upload logs
  if: always() && github.ref == 'refs/heads/main'
  run: ./upload-logs.sh
```

And for a failure-only alert:

```yaml
# FIXED — only when something upstream broke
- name: Alert
  if: failure()
  run: ./page-oncall.sh
```

## Coercion surprises: `==`, strings, and case-insensitivity

Even with correctly-formed expressions, GitHub's comparison rules trip people up because they're JavaScript-*like* but not JavaScript.

**String `==` is case-insensitive.** This burns people comparing branch refs or input values:

```yaml
# Surprise: both of these are TRUE
${{ 'MAIN' == 'main' }}          # true — case-insensitive
${{ 'Refs/Heads/Main' == github.ref }}  # may be true unexpectedly
```

**Loose coercion across types.** When the two sides differ in type, GitHub coerces toward a number: booleans become `1`/`0`, and strings are parsed as numbers (an empty string and `'0'` are `0`; non-numeric strings become `NaN`, and any comparison with `NaN` is false). So:

```yaml
${{ true == 1 }}        # true
${{ '' == 0 }}          # true  — empty string coerces to 0
${{ '3.0' == 3 }}       # true
${{ 'abc' == 0 }}       # false — 'abc' is NaN, NaN != anything
```

**`&&` and `||` return operands, not booleans.** Just like JavaScript, `a && b` returns `b` if `a` is truthy, otherwise `a`. This is great for defaults (`inputs.name || 'default'`) but means `if: inputs.flag && 'yes'` evaluates to the string `'yes'` — truthy — not a clean boolean.

The falsy values are exactly: `false`, `0`, `''` (empty string), and `null`. Everything else — including the strings `'false'` and `'0'`... wait: `'0'` is falsy because it coerces to the number `0`, but `'false'` is a **non-empty string that does not coerce to a number**, so `${{ 'false' }}` is **truthy**. That single fact causes more "my boolean input is always true" bugs than any other:

```yaml
# BAD — workflow_dispatch inputs are STRINGS; 'false' is truthy
on:
  workflow_dispatch:
    inputs:
      deploy: { type: boolean }
jobs:
  go:
    if: inputs.deploy   # with type: boolean this is fine...
```

```yaml
# BAD — but if the value arrives as a string 'false', this always runs
- if: github.event.inputs.deploy   # string 'false' is truthy!
  run: ./deploy.sh
```

```yaml
# FIXED — compare explicitly so the string is interpreted as data
- if: github.event.inputs.deploy == 'true'
  run: ./deploy.sh
```

## `contains` and `startsWith` aren't the same as `==`

Filtering by ref prefix is another spot where the wrong function silently over-matches:

```yaml
# BAD — contains matches ANYWHERE, so 'feature/main-fix' passes too
- if: contains(github.ref, 'main')
  run: ./deploy.sh
```

```yaml
# FIXED — anchor to the start, or compare the full ref
- if: startsWith(github.ref, 'refs/heads/release/')
  run: ./deploy.sh
# or, for an exact branch:
- if: github.ref == 'refs/heads/main'
  run: ./deploy.sh
```

Remember both `contains` and `startsWith` do string comparison case-insensitively, same as `==`.

## Test your `if:` before you push

The reason these bugs are so persistent is the feedback loop: the only way to "test" a condition has traditionally been to commit, push, and read the logs — then guess, edit, and push again. Every wrong guess is a round-trip.

The [GitHub Actions Expression & Trigger Tester](/github-actions-expression-tester) closes that loop. Paste your `if:` expression, set a mock `github` / `env` / `steps` / `needs` context, and see the evaluated result with GitHub's exact operator, coercion, and case-insensitivity rules — plus an explicit warning when you've left literal text outside `${{ }}` and accidentally built an always-truthy condition. It runs entirely in your browser; nothing about your workflow is uploaded.

If you've ever shipped an `if:` and hoped it would skip, this is the check that tells you before the runner does.

[Try the GitHub Actions Expression & Trigger Tester →](/github-actions-expression-tester)

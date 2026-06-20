---
title: "How to Validate .gitlab-ci.yml Before You Push"
description: "Stop pushing broken pipelines. Validate your .gitlab-ci.yml for YAML and structural errors in your browser — before the commit, not after the red pipeline."
pubDate: 2026-06-11
tags: ["gitlab-ci","ci-cd","yaml"]
relatedTool:
  name: "GitLab CI Validator"
  href: "/gitlab-ci-validator"
---

![GitLab CI validator checking a .gitlab-ci.yml for YAML and pipeline errors before push](/blog/validate-gitlab-ci-yml-hero.svg)

You change one line in `.gitlab-ci.yml`, push, and switch to something else. Two minutes later the pipeline goes red — not because the build broke, but because a job points at a `stage` you renamed last week. You fix the typo, push again, wait again. This is the loop, and the only way out is to validate `.gitlab-ci.yml` *before* the commit lands, not after the runner tells you.

The frustrating part is that GitLab already knows your config is broken the instant it parses it. It just doesn't tell you until you've pushed and burned a CI minute. The fix is to run that same check locally, in the browser, before you ever `git push`.

## The push-and-pray loop

Here's the shape of the problem. You edit a job, push, and let GitLab be your linter:

```bash
git add .gitlab-ci.yml
git commit -m "split deploy into staging + prod"
git push
# wait for the runner to pick up the pipeline...
# pipeline failed: "chosen stage prod does not exist"
git commit -am "fix: declare prod stage"
git push
# wait again...
```

Each round trip is a commit you didn't want, a runner slot you didn't need, and a context switch that costs more than the typo did. The errors that cause this almost never need a runner to detect. They're visible the moment the YAML is parsed and the job graph is resolved — which is exactly what a validator does locally.

## Two kinds of errors: YAML syntax vs structural

When GitLab rejects a pipeline, the failure is one of two categories, and they have completely different fixes.

The first is a **YAML syntax error**: the file isn't valid YAML at all, so nothing downstream can read it. The second is a **structural error**: the YAML parses fine, but the *pipeline* it describes is invalid — a job with no script, a stage that was never declared, a `needs` pointing at a job that doesn't exist.

```yaml
# YAML error — the parser can't even build a document
build:
  script:
    - make
   - make test      # inconsistent indentation: parser bails here

# Structural error — valid YAML, invalid pipeline
deploy:
  stage: prod        # "prod" is not in stages: → GitLab refuses to run it
  script: ./deploy.sh
```

Valid YAML is only half the job. The [GitLab CI Validator](/gitlab-ci-validator) checks both in one pass: it parses the YAML first, and only if that succeeds does it run the structural checks against your jobs. If the parse fails, you get a single line-referenced error and nothing else — there's no point reporting "undefined stage" on a document that didn't parse.

## YAML errors that bite: indentation, tabs, duplicate keys

YAML is whitespace-significant, and CI config is exactly the kind of nested structure where that bites. The classic GitLab error message — `did not find expected key` — is almost always one of these.

```yaml
test:
  stage: test
	script:              # a literal TAB instead of spaces → parse error
    - npm test

variables:
  DEPLOY_ENV: staging
  DEPLOY_ENV: prod       # duplicate key — the first value is silently lost

deploy:
  script: &deploy_steps  # anchor defined...
    - ./deploy.sh
rollback:
  script: *deploy_step   # ...but referenced with a typo → "unknown alias"
```

A browser validator parses with a real YAML reader, so it reports the exact line where the structure broke. When you paste config and the result is `Could not parse YAML: ... (line 4, column 2)`, that's the parser telling you precisely where to look — re-indent, swap the tab for spaces, or fix the anchor name, and re-validate.

## Structural errors GitLab catches late: undefined stages, jobs with no script, bad needs/extends

These are the ones that make you wait for a runner only to be told the pipeline never started. They're the real reason to validate GitLab CI before push. The validator models the rules from GitLab's `.gitlab-ci.yml` keyword reference and flags each one with the offending job, the line, and the fix.

![A validation pipeline flow: paste .gitlab-ci.yml, parse YAML, run structural checks, then show valid or a list of errors](/blog/validate-gitlab-ci-yml-diagram.svg)

**A job with no executable surface.** Every visible job has to *do* something: run commands with `script:` (or the newer `run:`), start a downstream pipeline with `trigger:`, or inherit one of those via `extends:`. A job with none of them is rejected with the familiar "job config should implement a script: or a trigger: keyword."

```yaml
# ERROR — empty-job defines no script, run, trigger, or extends
empty-job:
  stage: test
  # nothing here → GitLab won't run it
```

Note that an *empty* `script: []` or `script: ""` counts as missing too — the validator treats only a non-empty command string or list as a real executable surface, the same way GitLab does.

**A stage that isn't declared.** If a job's `stage:` isn't in your `stages:` list (or one of the five defaults: `.pre`, `build`, `test`, `deploy`, `.post`), GitLab doesn't know when to run it.

```yaml
stages:
  - build
  - test

release-job:
  stage: release      # ERROR — "release" is not in stages:
  script: make release
```

There's a subtle variant the validator also catches: a job that *omits* `stage:` defaults to the implicit `test` stage. If you declared a custom `stages:` list that doesn't include `test`, that job is now pointing at a stage you never declared — and GitLab fails with "chosen stage test does not exist."

**`needs` / `dependencies` / `extends` pointing at a job that doesn't exist.** Every name in `needs:`, `dependencies:`, or `extends:` has to resolve to a real job or hidden `.template` in the same file.

```yaml
test:
  stage: test
  needs:
    - compile          # ERROR — no job named "compile"
  extends: .base       # ERROR — no template named ".base"
  script: make test
```

The validator builds the set of every job id and every `.template`, then checks each reference against it. Rename a template and forget to update an `extends:`, and it tells you which job broke before the runner does.

**An invalid `when:` or a non-list `rules:`.** The `when:` keyword only accepts `on_success`, `on_failure`, `always`, `manual`, `delayed`, or `never`. And `rules:` has to be a YAML *list* of rule objects — a bare mapping is a common mistake that silently changes when a job runs.

```yaml
deploy:
  stage: deploy
  when: sometimes      # ERROR — not an allowed when value
  rules:
    if: '$CI_COMMIT_TAG'   # ERROR — rules must be a list, not a mapping
  script: ./deploy.sh
```

It also surfaces lower-severity advice: legacy `only`/`except` get an info note recommending `rules:` (the two can't be combined in one job), a top-level key that's one edit away from a reserved keyword — say `varables:` or `beforescript:` — gets a misspelling warning, and malformed `image:`/`services:` shapes are flagged as errors.

## Validating before you push: GitLab CI Lint vs an in-browser validator

GitLab ships its own checker — CI Lint, inside the pipeline editor. It's authoritative: it resolves `include:` files and project-level CI/CD variables, which a client-side tool can't see. But it has a cost: it requires a project and a sign-in. You can't lint a snippet from a code review, a config you're drafting offline, or a proprietary pipeline you'd rather not paste into a hosted form.

So what does an in-browser validator actually check? Based on the engine, the flow is deterministic and entirely local:

1. **Parse the YAML.** Any failure returns a single line-referenced error and stops — no structural findings on an unparseable document.
2. **Split the top level** into global keywords (`stages`, `default`, `variables`, `image`, `services`…), visible jobs, and hidden `.templates`.
3. **Resolve the stages** — your declared `stages:` list, or the five defaults — into the set every job's `stage:` is checked against.
4. **Check every job** for an executable surface, a known stage, real `needs`/`extends`/`dependencies` targets, a valid `when:`, a list-shaped `rules:`, and sane `image`/`services` shapes.
5. **Rank by severity** — errors first, then warnings, then info — each with the line and a concrete remediation. It never throws; a parse failure is reported, not crashed.

The honest framing: a clean result in the browser is strong pre-push confidence on *structure and syntax*. It catches the entire class of mistakes that fail a pipeline before any job runs. For absolute certainty on a config that uses `include:` or project variables, confirm with GitLab's own CI Lint once you've pushed to a project — but use the in-browser pass to make that push count.

If you also run GitHub Actions, the same idea applies there: the [GitHub Actions Validator](/github-actions-validator) finds YAML and security issues in your workflow files, and the [GitHub Actions Expression Tester](/github-actions-expression-tester) evaluates those `${{ … }}` expressions before you push.

## Wire it into your workflow

The validator is a paste-and-check tool, but the habit you want is "never push CI config you haven't validated." A pre-commit hook makes that automatic for the YAML half — catch the parse errors before the commit even forms:

```bash
#!/usr/bin/env bash
# .git/hooks/pre-commit — block a commit if .gitlab-ci.yml isn't valid YAML
set -euo pipefail

if git diff --cached --name-only | grep -q '^\.gitlab-ci\.yml$'; then
  # Fail fast on a syntax error before the commit lands.
  python -c "import sys, yaml; yaml.safe_load(open('.gitlab-ci.yml'))" \
    || { echo "✗ .gitlab-ci.yml is not valid YAML — commit blocked"; exit 1; }
  echo "✓ .gitlab-ci.yml parses — paste it into the validator for structural checks"
fi
```

A local YAML parse catches the indentation-and-tabs class instantly. For the structural class — undefined stages, broken `needs`, jobs with no script — paste the file into the browser validator before you push. The two together cover both error categories from the second section, and neither needs a runner.

```bash
# the loop you actually want
$ git add .gitlab-ci.yml          # pre-commit hook checks YAML
# paste .gitlab-ci.yml → validator → 0 errors
$ git commit -m "split deploy into staging + prod"
$ git push                        # green on the first try
```

## Validate it now

The next time you touch `.gitlab-ci.yml`, don't let the runner be the first thing to read it. Paste the file into the [GitLab CI Validator](/gitlab-ci-validator) and you'll get the YAML errors and the structural mistakes — undefined stages, jobs with no script, broken `needs`/`extends`, invalid `when:` — in one pass, with the line and the fix for each. It runs entirely in your browser: no project, no login, and nothing uploaded, so it's safe for internal pipelines.

If you've ever pushed a CI change and hoped it worked, this is the step that was missing.

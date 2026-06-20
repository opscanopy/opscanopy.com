---
title: "7 Common .gitlab-ci.yml Mistakes (and How to Catch Them)"
description: "The .gitlab-ci.yml mistakes that turn pipelines red: undefined stages, jobs without scripts, broken needs and rules, anchor misuse — each with a fix you can copy."
pubDate: 2026-06-12
tags: ["gitlab-ci","ci-cd","yaml"]
relatedTool:
  name: "GitLab CI Validator"
  href: "/gitlab-ci-validator"
---

![Annotated .gitlab-ci.yml showing the most common GitLab CI mistakes — an undefined stage, a job with no script, and a broken needs reference — flagged before the pipeline runs](/blog/common-gitlab-ci-mistakes-hero.svg)

You push a one-line change, switch tabs, and 30 seconds later the pipeline icon goes red. Not a failing test — the pipeline never started. GitLab printed `This GitLab CI configuration is invalid` and a single terse line about a stage or a script. You re-read the YAML three times, find the typo, push again, wait again. Most of the GitLab CI mistakes that cost you that round-trip are not exotic. They are the same handful of GitLab pipeline misconfigurations, repeated across every team: a stage that was never declared, a job that does nothing, a `needs` that points at a job you renamed.

The good news is that these GitLab CI YAML errors are structural, which means they are catchable before you commit. Below are the seven that show up most often, each with the symptom, a minimal broken example, and the fix you can paste in.

## 1. Referencing an undefined stage

```yaml
stages:
  - build
  - test

release-job:
  stage: release      # not in stages:
  script:
    - make release
```

GitLab rejects this with something like `chosen stage release does not exist; available stages are .pre, build, test, .post`. A job's `stage:` has to be one of the names in your top-level `stages:` list — or one of the five implicit stages GitLab always provides: `.pre`, `build`, `test`, `deploy`, and `.post`.

There is a quieter version of this bug. A job with no `stage:` at all defaults to `test`. If you declared a custom `stages:` list that does not include `test`, that job has nowhere to run and GitLab errors the same way. The fix is the same in both cases — declare the stage:

```yaml
stages:
  - build
  - test
  - release

release-job:
  stage: release
  script:
    - make release
```

## 2. A job with no script (and the global/default-script confusion)

```yaml
stages:
  - test

empty-job:
  stage: test
  # no script, run, trigger, or extends
```

This produces the GitLab CI job without script error — `job config should implement a script: or a trigger: keyword`. A visible job has to *do* something. There are exactly four ways to satisfy that: run commands with `script:` (or the newer `run:`), start a downstream pipeline with `trigger:`, or inherit one of those from somewhere else via `extends:`. A job with none of the four is rejected.

The confusion that causes this is the global/default block. Teams set a `before_script:` or a `default:` section and assume a job inherits a *command* from it. It does not. `before_script` runs *around* your script; it is not the script. `default:` supplies defaults for keys like `image:` and `cache:`, but it does not give a job an executable surface. The job still needs its own `script:` (or a `trigger`, `run`, or `extends`):

```yaml
empty-job:
  stage: test
  script:
    - make check
```

Hidden, dot-prefixed templates are the exception — more on those in mistake six. They are allowed to be partial fragments, so they are not required to carry a script.

## 3. needs pointing at a job in a later stage or a job that does not exist

```yaml
stages:
  - build
  - test

build:
  stage: build
  script: make

test:
  stage: test
  needs:
    - compile      # no such job
  script: make test
```

`needs:` builds the directed acyclic graph that lets jobs start early instead of waiting for a whole stage to finish. Every name in it has to resolve to a real job in the same pipeline. Here `compile` was renamed to `build` at some point and the `needs` reference was never updated, so the graph has a dangling edge and the pipeline fails to assemble.

The classic version of this mistake is ordering: pointing `needs` at a job in a *later* stage. `needs` can only reference jobs that run before — a job cannot need something that hasn't run yet. Point it at the real upstream job:

```yaml
test:
  stage: test
  needs:
    - build
  script: make test
```

The same rule applies to `dependencies:`. Every artifact dependency you list has to name a job that actually exists, or the download fails at runtime.

## 4. rules that never match (or always do) — and mixing only/except with rules

```yaml
deploy:
  stage: deploy
  when: sometimes        # not a valid when value
  rules:
    if: '$CI_COMMIT_TAG' # rules must be a list
  script: ./deploy.sh
```

Two GitLab CI rules and extends errors are packed into this one job. First, `when:` only accepts a fixed set of values — `on_success`, `on_failure`, `always`, `manual`, `delayed`, or `never`. `sometimes` is not one of them, and a typo here is rejected outright. Second, `rules:` has to be a YAML *list* of rule objects. Written as a bare mapping (`if:` directly under `rules:`), it is malformed; GitLab cannot read it as a rule.

![A short broken .gitlab-ci.yml snippet with red callout bubbles pointing at an undefined stage, a job with no script, and a bad needs reference](/blog/common-gitlab-ci-mistakes-diagram.svg)

The other half of this category is logic, and it is harder to spot because the YAML is valid. A rule whose `if:` references a variable that is empty on the branch you care about silently never matches, and the job never runs. A rule with no condition always matches. And `rules:` cannot be combined with the legacy `only:`/`except:` keywords in the same job — GitLab errors if you use both. `only`/`except` still work, but they are no longer actively developed, so new pipelines should standardize on `rules`. Write `rules` as a list, with each item carrying its condition and `when`:

```yaml
deploy:
  stage: deploy
  rules:
    - if: '$CI_COMMIT_TAG'
      when: manual
  script: ./deploy.sh
```

If your bug is an environment variable that is empty when you expected a value, that is a different class of problem — the [Env Example Checker](/env-example-checker) catches the `.env` versus `.env.example` drift that leaves a variable undefined in the first place.

## 5. extends a template that does not exist, or a circular extends

```yaml
.base:
  image: golang:1.22
  script: make

lint:
  extends: .bse        # typo — .bse, not .base
  script: make lint
```

`extends:` is GitLab's DRY mechanism: a job pulls in the keys of another job or hidden template and overrides what it needs. The most common failure is exactly the one above — a typo or a rename, so `extends` points at a template that is not in the file. GitLab cannot resolve `.bse`, and the job config is invalid.

The nastier variant is a circular `extends` — `a` extends `b`, `b` extends `a` — which has no base case to resolve and is rejected. Keep the chain pointing at a real, terminal template:

```yaml
.base:
  image: golang:1.22
  script: make

lint:
  extends: .base
  script: make lint
```

`extends` can also take a list of templates, and each name in that list has to resolve. A single bad entry breaks the whole job.

## 6. YAML anchors and hidden (dot-prefixed) jobs gone wrong

```yaml
.deploy_template: &deploy
  stage: deploy
  script:
    - ./deploy.sh

deploy_prod:
  <<: *deploy
  environment: production
  # inherits stage + script from the anchor
```

GitLab supports both YAML anchors (`&name` / `*name` with the `<<:` merge key) and its own `extends:`. The two solve the same problem and people mix them, which is where the trouble starts. The pattern above is correct: a dot-prefixed key is a *hidden* job — GitLab does not run it as a job, it only exists to be reused. Anchoring it with `&deploy` and merging it into `deploy_prod` with `<<: *deploy` works.

What goes wrong:

- **Forgetting the dot.** If your template is named `deploy_template:` without the leading dot, GitLab treats it as a real job — and a real job with no script (just an anchor target) triggers the no-script error from mistake two.
- **Anchors don't cross files.** A YAML anchor is local to one document. If you `include:` another file and try to reference an anchor defined there, it will not resolve. `extends:` is the cross-file-safe choice; reach for it when reuse spans includes.
- **A merge key can't be partially overridden the way you think.** `<<:` does a shallow merge, so re-declaring a nested key replaces the whole sub-tree rather than merging into it.

When in doubt, prefer `extends:` for job reuse and keep anchors for small, local scalar/list fragments. And always give a reusable template the leading dot so GitLab knows not to run it:

```yaml
.deploy_template:
  stage: deploy
  script:
    - ./deploy.sh

deploy_prod:
  extends: .deploy_template
  environment: production
```

## 7. include that 404s or points at the wrong file/ref

```yaml
include:
  - project: 'platform/ci-templates'
    ref: main
    file: '/templates/deploy.yml'   # path or ref may be wrong
```

`include:` pulls configuration from another file — local, a remote URL, a template, or another project. When the path, the `ref`, or the project is wrong, GitLab cannot fetch it and the whole pipeline fails to compile, often with a blunt `Project not found or access denied` or a 404 on the file. The usual causes are a leading-slash path mistake (local `include` paths are relative to the repo root and need the slash; a `file:` from a project also wants the absolute repo path), a `ref` that points at a branch or tag that no longer exists, or a renamed template file.

Make the path absolute-from-root, pin a `ref` that exists, and double-check the project path:

```yaml
include:
  - project: 'platform/ci-templates'
    ref: v2.3.0          # a tag that exists
    file: '/templates/deploy.yml'
  - local: '/.ci/test.yml'
```

One caveat worth knowing: resolving `include:` requires actually fetching the referenced files, which a purely client-side checker cannot do. A local linter validates the *structure* of your `include` block; for the final word on whether a remote file resolves, GitLab's own CI Lint (which fetches includes and project variables) is the backstop.

## Catch them all at once

Six of these seven mistakes are structural — they live in how the jobs, stages, and references fit together, not in whether the YAML parses. That is exactly the gap a syntax-only linter misses: a `.gitlab-ci.yml` can be perfectly valid YAML and still be a pipeline GitLab refuses to start.

The [GitLab CI Validator](/gitlab-ci-validator) runs these checks in your browser. Paste a `.gitlab-ci.yml` and it parses the YAML, then flags the structural problems above — an undefined stage, a job with no `script`/`run`/`trigger`/`extends`, `needs`/`dependencies`/`extends` references that point at jobs that do not exist, an invalid `when:`, a non-list `rules:`, legacy `only`/`except`, and bad `image`/`services` shapes — each with the line and a concrete fix. Nothing is uploaded; the whole check is client-side, so you can run it against private pipelines and proprietary runner config without sending anything anywhere.

If your pipelines also run on GitHub, the same before-you-push idea applies to workflows — our walkthrough of [GitHub Actions security misconfigurations](/blog/github-actions-security-misconfigurations) covers the GitHub-side equivalents, from over-broad token permissions to unpinned third-party actions.

A red pipeline that never ran is the cheapest possible failure to prevent. Catch the structural mistakes before the commit, and the only red you see is a test that genuinely failed.

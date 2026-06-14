# FAQ Content (English source — translate to es/de/fr/pt-br)

This array feeds BOTH `<FaqList faqs={faqs} />` and `faqPageLd(faqs)` (FAQPage JSON-LD).

```ts
const faqs = [
  {
    q: "What does the GitHub Actions Expression & Trigger Tester do?",
    a: "It has two tabs. The Expression Evaluator runs your ${{ }} expressions against an editable mock context (github, env, matrix, steps, needs) using GitHub Actions' exact semantics — the operators, the case-insensitive string ==, the JS-like coercion rules, and documented functions like contains, startsWith, endsWith, format, join, toJSON, fromJSON, success(), failure(), always() and cancelled(). The Trigger Simulator lets you describe a push, pull_request or tag event and shows a per-job RUN or SKIPPED table that explains exactly which on: branches, tags, paths or paths-ignore filter decided the outcome. Together they answer \"will this if: be true?\" and \"will this workflow even trigger?\" before you push.",
  },
  {
    q: "Why does my GitHub Actions if condition always run true?",
    a: "Almost always because the if: contains literal text outside of ${{ }} — for example if: \"${{ github.event_name }}\" == 'push' or if: always-deploy. GitHub does not evaluate the whole line as one expression; the literal characters make the condition a non-empty string, and a non-empty string is truthy, so the step runs every time. Wrap the entire condition in a single ${{ }} (e.g. if: ${{ github.event_name == 'push' }}) and the Expression Evaluator will flag the footgun (actions/runner#1173) and show you the corrected, truthy-or-falsy result.",
  },
  {
    q: "How can I test a GitHub Actions if condition or expression without pushing?",
    a: "Paste the expression into the Expression Evaluator tab and edit the mock github/env/matrix/steps/needs context to match the run you care about — no commit, no push, no waiting on a runner. You get the evaluated value instantly, plus a warning if the syntax would silently coerce to always-true. It is the fastest way to verify an if: condition or a ${{ }} interpolation before it ever reaches GitHub Actions.",
  },
  {
    q: "What is the difference between success(), failure(), always() and cancelled()?",
    a: "These are status check functions you use in an if:. success() is true only when every prior step or needed job succeeded (it is the implicit default the moment you write no if:), failure() is true when any of them failed, cancelled() is true when the workflow was cancelled, and always() forces the step to run regardless of prior status — including on cancellation. The catch is that writing any custom if: removes the implicit success() guard, so if: env.DEPLOY == 'true' will run even after a previous step failed unless you add && success(). The evaluator lets you toggle the mock status and see each function resolve.",
  },
  {
    q: "Why did my GitHub Actions workflow not trigger?",
    a: "The usual causes are a ref that does not match your on: branches or tags glob, the workflow file not existing on the target branch yet, or a paths filter excluding every changed file. A subtle one: when you set both branches and paths under the same event, they combine with AND — the event must match both, not either. Describe your event in the Trigger Simulator and it replays the on: filters and tells you the deciding reason for each job.",
  },
  {
    q: "Do GitHub Actions branch and paths filters use AND or OR?",
    a: "Within a single event, branches (or tags) and paths are ANDed: a push must be on a matching branch and touch a matching path for the workflow to run. Inside one filter the patterns are ORed — any one branch glob or any one changed path matching is enough. The Trigger Simulator makes this explicit by showing both the branch decision and the path decision separately, then the combined RUN or SKIPPED verdict.",
  },
  {
    q: "What does ** mean in a GitHub Actions branch or paths filter?",
    a: "* matches any characters except the path separator /, while ** matches across separators including /, so feature/** matches feature/a/b but feature/* matches only feature/a. The glob engine also honors +, ?, ! negation, and \\ escaping the same way GitHub does. The Trigger Simulator uses a faithful re-implementation of these rules so you can test a pattern like 'release/**' or '!**/*.md' against a real ref or file list and see what matches.",
  },
  {
    q: "How does the tool know which jobs will run or be skipped?",
    a: "In the Trigger Simulator you provide the event type, the ref name, and the list of changed files; the tool then evaluates each job's on: filters and any job-level if: against that simulated event and renders a RUN or SKIPPED row with the deciding reason — \"branch matched but path did not\", \"no paths filter\", \"if: evaluated false\", and so on. It mirrors GitHub Actions' decision order rather than guessing, so the verdict matches what the real runner would do for that event.",
  },
  {
    q: "How is this different from act or actionlint?",
    a: "actionlint is a static linter for workflow syntax and expression typing, and act actually executes your jobs in local Docker containers — both are great and worth using. This tool does neither: it does not run your steps and it is not a type checker. It is a semantics playground that evaluates a single ${{ }} expression or simulates trigger filtering against a context you control, in the browser, so you can reason about why an if: is truthy or why a workflow did or did not trigger without spinning up containers or pushing commits.",
  },
  {
    q: "What can't be reproduced in the browser?",
    a: "Anything that depends on real runner state. hashFiles() needs the actual files on disk, so the evaluator treats it as an opaque placeholder rather than computing a true hash; the full webhook payload is far larger than the mock github context we expose; and live action contents, secrets, and runner labels are not resolved. Treat a clean result as strong pre-push confidence about expression and trigger logic — not a guarantee about file hashing or the complete event payload.",
  },
  {
    q: "Does my workflow YAML or event payload ever leave my browser?",
    a: "No. Both tabs run 100% client-side. The expressions, mock context, workflow filters, and event payloads you enter are evaluated inside your browser tab — nothing is uploaded, there is no account, and there is no signup. You can safely paste internal or proprietary workflows, including secret names, private runner labels, and real branch and path lists.",
  },
  {
    q: "Is this tool affiliated with GitHub?",
    a: "No. This is an independent, community tool and is not affiliated with, endorsed by, or sponsored by GitHub, Inc. \"GitHub\" and \"GitHub Actions\" are used here only descriptively, to identify the expression and workflow-trigger format the tool evaluates.",
  },
];
```

---

## Readable

**Q: What does the GitHub Actions Expression & Trigger Tester do?**

It has two tabs. The Expression Evaluator runs your ${{ }} expressions against an editable mock context (github, env, matrix, steps, needs) using GitHub Actions' exact semantics — the operators, the case-insensitive string ==, the JS-like coercion rules, and documented functions like contains, startsWith, endsWith, format, join, toJSON, fromJSON, success(), failure(), always() and cancelled(). The Trigger Simulator lets you describe a push, pull_request or tag event and shows a per-job RUN or SKIPPED table that explains exactly which on: branches, tags, paths or paths-ignore filter decided the outcome. Together they answer "will this if: be true?" and "will this workflow even trigger?" before you push.

**Q: Why does my GitHub Actions if condition always run true?**

Almost always because the if: contains literal text outside of ${{ }} — for example if: "${{ github.event_name }}" == 'push' or if: always-deploy. GitHub does not evaluate the whole line as one expression; the literal characters make the condition a non-empty string, and a non-empty string is truthy, so the step runs every time. Wrap the entire condition in a single ${{ }} (e.g. if: ${{ github.event_name == 'push' }}) and the Expression Evaluator will flag the footgun (actions/runner#1173) and show you the corrected, truthy-or-falsy result.

**Q: How can I test a GitHub Actions if condition or expression without pushing?**

Paste the expression into the Expression Evaluator tab and edit the mock github/env/matrix/steps/needs context to match the run you care about — no commit, no push, no waiting on a runner. You get the evaluated value instantly, plus a warning if the syntax would silently coerce to always-true. It is the fastest way to verify an if: condition or a ${{ }} interpolation before it ever reaches GitHub Actions.

**Q: What is the difference between success(), failure(), always() and cancelled()?**

These are status check functions you use in an if:. success() is true only when every prior step or needed job succeeded (it is the implicit default the moment you write no if:), failure() is true when any of them failed, cancelled() is true when the workflow was cancelled, and always() forces the step to run regardless of prior status — including on cancellation. The catch is that writing any custom if: removes the implicit success() guard, so if: env.DEPLOY == 'true' will run even after a previous step failed unless you add && success(). The evaluator lets you toggle the mock status and see each function resolve.

**Q: Why did my GitHub Actions workflow not trigger?**

The usual causes are a ref that does not match your on: branches or tags glob, the workflow file not existing on the target branch yet, or a paths filter excluding every changed file. A subtle one: when you set both branches and paths under the same event, they combine with AND — the event must match both, not either. Describe your event in the Trigger Simulator and it replays the on: filters and tells you the deciding reason for each job.

**Q: Do GitHub Actions branch and paths filters use AND or OR?**

Within a single event, branches (or tags) and paths are ANDed: a push must be on a matching branch and touch a matching path for the workflow to run. Inside one filter the patterns are ORed — any one branch glob or any one changed path matching is enough. The Trigger Simulator makes this explicit by showing both the branch decision and the path decision separately, then the combined RUN or SKIPPED verdict.

**Q: What does ** mean in a GitHub Actions branch or paths filter?**

* matches any characters except the path separator /, while ** matches across separators including /, so feature/** matches feature/a/b but feature/* matches only feature/a. The glob engine also honors +, ?, ! negation, and \ escaping the same way GitHub does. The Trigger Simulator uses a faithful re-implementation of these rules so you can test a pattern like 'release/**' or '!**/*.md' against a real ref or file list and see what matches.

**Q: How does the tool know which jobs will run or be skipped?**

In the Trigger Simulator you provide the event type, the ref name, and the list of changed files; the tool then evaluates each job's on: filters and any job-level if: against that simulated event and renders a RUN or SKIPPED row with the deciding reason — "branch matched but path did not", "no paths filter", "if: evaluated false", and so on. It mirrors GitHub Actions' decision order rather than guessing, so the verdict matches what the real runner would do for that event.

**Q: How is this different from act or actionlint?**

actionlint is a static linter for workflow syntax and expression typing, and act actually executes your jobs in local Docker containers — both are great and worth using. This tool does neither: it does not run your steps and it is not a type checker. It is a semantics playground that evaluates a single ${{ }} expression or simulates trigger filtering against a context you control, in the browser, so you can reason about why an if: is truthy or why a workflow did or did not trigger without spinning up containers or pushing commits.

**Q: What can't be reproduced in the browser?**

Anything that depends on real runner state. hashFiles() needs the actual files on disk, so the evaluator treats it as an opaque placeholder rather than computing a true hash; the full webhook payload is far larger than the mock github context we expose; and live action contents, secrets, and runner labels are not resolved. Treat a clean result as strong pre-push confidence about expression and trigger logic — not a guarantee about file hashing or the complete event payload.

**Q: Does my workflow YAML or event payload ever leave my browser?**

No. Both tabs run 100% client-side. The expressions, mock context, workflow filters, and event payloads you enter are evaluated inside your browser tab — nothing is uploaded, there is no account, and there is no signup. You can safely paste internal or proprietary workflows, including secret names, private runner labels, and real branch and path lists.

**Q: Is this tool affiliated with GitHub?**

No. This is an independent, community tool and is not affiliated with, endorsed by, or sponsored by GitHub, Inc. "GitHub" and "GitHub Actions" are used here only descriptively, to identify the expression and workflow-trigger format the tool evaluates.

## Translation note

When translating to es/de/fr/pt-br, translate all prose but keep code tokens untranslated and wrapped in <span translate="no">: GitHub, GitHub Actions, ${{ }}, YAML keys (on, if, branches, tags, paths, paths-ignore, needs, env, matrix, steps, runs-on, uses, run, permissions), function names (contains, startsWith, endsWith, format, join, toJSON, fromJSON, hashFiles, success(), failure(), always(), cancelled()), glob tokens (*, **, +, ?, !), RUN/SKIPPED labels, and the actions/runner#1173 reference.

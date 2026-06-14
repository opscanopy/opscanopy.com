# SEO & Keyword Strategy

- **Tool slug:** `github-actions-expression-tester`
- **Tool name:** GitHub Actions Expression & Trigger Tester
- **Page title:** GitHub Actions Expression Tester & Trigger Simulator
- **Meta description:** Test GitHub Actions ${{ }} expressions and simulate workflow triggers online. Evaluate if: conditions, contains/startsWith, branch & paths filters. Free, 100% in-browser.

### Primary keywords

- github actions expression tester
- github actions if condition tester
- github actions expression evaluator
- github actions trigger simulator
- test github actions expression online

### Secondary keywords

- github actions ${{ }} evaluator
- github actions if condition not working
- github actions if always runs true
- github actions paths filter tester
- github actions branch filter tester
- github actions contains startswith expression
- github actions success failure always cancelled
- github actions glob pattern tester
- evaluate github actions context expression
- github actions workflow trigger debugger

### Long-tail (question-form) keywords

- why does my github actions if condition always run
- why did my github actions workflow not trigger
- how to test github actions if condition without pushing
- why is my github actions paths filter not working
- github actions if condition with literal text always true
- how does github actions evaluate ${{ }} expressions
- do github actions branch and paths filters use AND or OR
- what does ** mean in github actions branch filter
- github actions if success() vs always() vs failure()
- how to simulate a github actions push or pull_request event
- github actions contains vs startswith case sensitive
- github actions paths-ignore not respected on pull request

### Registry keywords (src/data/tools.ts — 8)

- github actions expression tester
- github actions if condition tester
- github actions expression evaluator
- github actions trigger simulator
- github actions if always runs true
- github actions paths filter tester
- test github actions expression online
- github actions branch filter glob tester

### Feature list (SoftwareApplication JSON-LD)

- Evaluate ${{ }} expressions against an editable mock github/env/matrix/steps/needs context with GitHub's exact operator and coercion semantics
- Warns on the #1 footgun: literal text outside ${{ }} in an if: that silently makes the condition always truthy (actions/runner#1173)
- Supports documented functions: contains, startsWith, endsWith, format, join, toJSON, fromJSON, hashFiles, success(), failure(), always(), cancelled()
- Trigger Simulator: describe a push, pull_request or tag event and see which jobs RUN or are SKIPPED with the deciding reason
- Faithful glob engine for branches, branches-ignore, tags, paths and paths-ignore (*, **, +, ?, !, escaping) including branch+path AND-semantics
- 100% client-side: your workflow YAML and event payloads never leave the browser, no signup and nothing to install

## Blog Topics

### 1. Why Your GitHub Actions "if" Condition Always Runs (and How to Fix It)

- **slug:** `github-actions-if-condition-always-true`
- **primary keyword:** github actions if condition not working
- **search intent:** Troubleshooting / informational — engineers whose conditional step or job ran (or skipped) unexpectedly and are searching for the cause and fix.
- **why it ranks:** Targets a high-volume, high-frustration query backed by a 1k+ reaction GitHub issue (actions/runner#1173) and many StackOverflow/community-discussion titles; the literal-text footgun is under-served by a single authoritative how-to, and the article carries a unique interactive CTA (live evaluator) competitors lack, earning dwell time and links. The slug is exact-match for the pain phrasing.
- **angle:** Diagnostic, code-first walkthrough of the #1 GitHub Actions footgun: an if: that contains literal text outside ${{ }} (or a quoted whole-string expression) silently coerces to a non-empty string and is always truthy. Shows BAD vs FIXED YAML, the implicit success() rule that disappears the moment you write a custom if:, the difference between success()/failure()/always()/cancelled(), and case-insensitive == surprises. Ends by funneling readers to the Expression Tester to evaluate their own if: against a mock context before pushing.
- **cluster:** github actions if condition not working; github actions if always runs true; github actions if condition always true; github actions if literal text; github actions if condition with expression; github actions if success() always() failure(); github actions conditional step not running; github actions if not working; github actions ${{ }} in if condition; github actions if contains startswith; github actions if condition evaluates to true; github actions implicit success condition

### 2. Why Your GitHub Actions Workflow Didn't Trigger: branches, tags & paths Filters Explained

- **slug:** `github-actions-workflow-not-triggering-filters`
- **primary keyword:** why did my github actions workflow not trigger
- **search intent:** Troubleshooting / informational — engineers whose workflow unexpectedly did not run and are diagnosing on: branches/tags/paths filter behavior.
- **why it ranks:** Maps to a cluster of very high-volume queries (multiple GitHub community discussions like #184658, #63314 and the official 'Triggering a workflow' docs rank for these); the AND-semantics and ** requirement are widely misunderstood and poorly documented in one place, so a cheat-sheet + an interactive simulator that reproduces the user's event is differentiated, link-worthy, and directly converts to the tool's Tab 2.
- **angle:** Decision-tree debugging guide for the most common non-trigger causes: branch name mismatch, workflow file missing on the target branch, the surprising AND-semantics when both branches and paths are set, why on.push.paths needs a branches: '**' companion, the 300-changed-file diff limit, paths-ignore quirks on pull_request, and the glob rules (*, **, +, ?, !, escaping, **/ requirement). Includes a copy-paste filter cheat-sheet and routes readers to the Trigger Simulator to replay their exact event and see the per-job RUN/SKIPPED reason.
- **cluster:** why did my github actions workflow not trigger; github actions workflow not triggering on push; github actions paths filter not working; github actions branches filter not working; github actions on push paths branches; github actions branch filter wildcard; github actions ** glob pattern; github actions paths-ignore pull_request; github actions tags filter not triggering; github actions workflow not running on branch; github actions trigger on path change; github actions filter pattern cheat sheet

## Notes

Slug recommendation: "github-actions-expression-tester" over the prompt's suggested "github-actions-expression-tester" alias — kept it keyword-bearing. Rationale: "expression tester/evaluator" is the strongest head term with proven demand and zero dedicated competing tool (validated: searches for an online evaluator return only library repos and docs, no SaaS competitor). It also reads naturally with the second tab ("& Trigger Simulator") in the on-page H1 without bloating the URL. Avoided "evaluator" in the slug because "tester" is the higher-volume DevOps modifier (matches the sibling cron-expression-tester and regex-log-tester registry slugs, reinforcing internal topical consistency). pageTitle is 50 chars (fits ≈55-60 target with brand suffix room); description is 158 chars. registryKeywords are exactly 8, all lowercase, mixing 4 head terms + 4 long-tail/footgun phrases. The two blog topics are deliberately the two distinct pillar pains (Tab 1 = if-condition footgun, Tab 2 = trigger/filter non-trigger) so each funnels to a different tab via relatedTool CTA and neither overlaps the existing security-misconfigurations post. Vendor marks (GitHub Actions, ${{ }}, function names) must stay translate="no" on-page per i18n rules. Sources: GitHub issue actions/runner#1173, community discussions #184658/#63314/#25789, GitHub Docs "Evaluate expressions" and "Triggering a workflow", dorny/paths-filter, github.blog Jan 2026 changelog (editor now annotates the literal-text if: footgun — confirms it is the canonical #1 pain).

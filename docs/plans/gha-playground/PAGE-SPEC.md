# Tool Page Spec (src/pages/<slug>.astro)

# Page Spec — `src/pages/github-actions-expression-tester.astro`

Mirrors `src/pages/github-actions-validator.astro` **exactly** in import set, frontmatter shape, section order, component props, and JSON-LD assembly. Differences are content-only: the `#checks` section is reimagined as an **Expression & Trigger Cheat-Sheet** (`id="reference"`), and the playground island is `GithubActionsExpressionPlayground` (the new two-tab component). Slug: `github-actions-expression-tester`. Category `CI/CD`, accent `ship`.

---

## Frontmatter (`---` block)

**Imports (same set as reference, swap playground import):**
```ts
import Shell from '../components/Shell.astro';
import GithubActionsExpressionPlayground from '../components/GithubActionsExpressionPlayground.astro';
import CodeBlock from '../components/CodeBlock.astro';
import Badge from '../components/Badge.astro';
import ToolHero from '../components/ToolHero.astro';
import ToolPipeline from '../components/ToolPipeline.astro';
import FaqList from '../components/FaqList.astro';
import ToolCrossLinks from '../components/ToolCrossLinks.astro';
import { site, navLinks } from '../data/site';
import { getTool } from '../data/tools';
import { softwareAppLd, faqPageLd } from '../lib/jsonld';

const tool = getTool('github-actions-expression-tester');
const pagePath = '/github-actions-expression-tester';
const pageUrl = `${site.url}${pagePath}`;
```

**External reference consts:**
```ts
const ghDocsExpressions = 'https://docs.github.com/actions/learn-github-actions/expressions';
const ghDocsTriggering = 'https://docs.github.com/actions/using-workflows/events-that-trigger-workflows';
const ghDocsFilterPatterns = 'https://docs.github.com/actions/using-workflows/workflow-syntax-for-github-actions#filter-pattern-cheat-sheet';
const ghRunnerIssue = 'https://github.com/actions/runner/issues/1173';
```

**`faqs` array** — SINGLE source feeding both `<FaqList>` and `faqPageLd`. Use long-tail keyword phrasings as the questions. Ship these 9:

1. q: "Why does my GitHub Actions if condition always run?"
   a: "Almost always because the if: contains literal text that sits outside the ${{ }} markers — or the whole expression is wrapped in quotes. GitHub evaluates an if: by coercing its result to a boolean, and any non-empty string is truthy. So `if: ${{ github.event_name == 'push' }} && always()` is read as the literal string '... && always()', which is non-empty, so the step always runs. The fix is to keep the entire condition inside one ${{ }} (or omit the markers and write a bare expression). This tool flags that footgun the moment you type it; it is tracked upstream as actions/runner#1173."

2. q: "Do GitHub Actions branch and paths filters use AND or OR?"
   a: "AND. When an on.push (or on.pull_request) block specifies BOTH a branch filter (branches/branches-ignore/tags) AND a path filter (paths/paths-ignore), the event must satisfy a branch/tag pattern AND a path pattern for the workflow to run. Many people assume either one is enough — it is not. The Trigger Simulator shows the per-job decision and names which filter caused a SKIP."

3. q: "What does ** mean in a GitHub Actions branch or path filter?"
   a: "** matches zero or more characters including the / separator, so 'release/**' matches release/1.0 and release/1.0/hotfix, and a bare '**' matches every branch. Plain * matches any character EXCEPT /. There is also + (one or more), ? (zero or one of the preceding character), ! (negate, at the start of a pattern), and \\ to escape a literal *, ?, [ or +. The glob engine here implements all of these faithfully."

4. q: "What is the difference between success(), failure(), always() and cancelled()?"
   a: "success() is true when no previous step or needed job failed — it is the implicit condition on every step until you write your own if:. failure() is true when any previous step failed. cancelled() is true when the workflow was cancelled. always() is true no matter what, so a step with if: always() runs even after a failure or cancellation. The catch: the moment you add a custom if:, the implicit success() disappears, so `if: ${{ github.ref == 'refs/heads/main' }}` also runs on failed runs unless you add && success()."

5. q: "Are GitHub Actions == and contains() case-sensitive?"
   a: "String comparison with == is case-INSENSITIVE in GitHub Actions, so 'Push' == 'push' is true. contains(), startsWith() and endsWith() are also case-insensitive for strings. This surprises people coming from most programming languages. The Expression Evaluator reproduces this exactly, so you can confirm a comparison before you push."

6. q: "How do I test a GitHub Actions if condition without pushing?"
   a: "Paste the expression into the Expression Evaluator, edit the mock github/env/matrix/steps/needs context to match the run you care about, and read the evaluated result — all in your browser. You get GitHub's exact operator precedence, truthy/falsy coercion, and case-insensitive ==, plus a warning if your if: would always be truthy because of literal text outside ${{ }}."

7. q: "Why didn't my GitHub Actions workflow trigger on push?"
   a: "Common causes: the pushed branch did not match any branches pattern; a branches-ignore or paths-ignore rule excluded it; you set paths but the changed files were all outside those patterns; or both a branch and a path filter are present and only one matched (they AND together). On pull_request, paths-ignore is evaluated against the PR's changed files, and the workflow file must exist on the target branch. Describe the event in the Trigger Simulator to see the deciding reason per job."

8. q: "Does anything I paste leave my browser?"
   a: "No. Both the Expression Evaluator and the Trigger Simulator run 100% client-side. Your workflow YAML, your mock context, and any event payloads are evaluated inside your browser tab — nothing is uploaded, and there is no account or signup. You can safely paste internal workflows with private branch names and secret references."

9. q: "Is this tool affiliated with GitHub?"
   a: "No. This is an independent, community tool and is not affiliated with, endorsed by, or sponsored by GitHub, Inc. 'GitHub' and 'GitHub Actions' are used here only descriptively, to identify the workflow expression and trigger syntax the tool evaluates."

**JSON-LD assembly** — see jsonLdPlan. `softwareApp` via `softwareAppLd({...})`, `faqPage = faqPageLd(faqs)`.

**`pipeline` array** — 5 steps (below). **`cheatsheet` data** — the card array replacing `checks` (below).

---

## SECTION 1 — `<Shell>` + `<ToolHero>`

```astro
<Shell
  title="GitHub Actions Expression Tester & Trigger Simulator"
  description="Test GitHub Actions ${{ }} expressions and simulate workflow triggers online. Evaluate if: conditions, contains/startsWith, branch & paths filters. Free, 100% in-browser."
  canonical="/github-actions-expression-tester"
  jsonLd={[softwareApp, faqPage]}
>
```
`title` = strategy pageTitle. `canonical` = neutral slug.

`<ToolHero>`:
- `slug="github-actions-expression-tester"` (drives breadcrumb + BreadcrumbList LD)
- `eyebrow="GitHub Actions Expression Tester · CI/CD"`
- `badges={[ { label: 'Runs in your browser', variant: 'live' }, { label: 'No signup', variant: 'neutral' }, { label: 'Two tools in one', variant: 'neutral' } ]}`
- `<Fragment slot="headline">` + `<Fragment slot="lead">` — see heroCopy. Wrap vendor marks `GitHub Actions`, `${{ }}`, `if:`, `pull_request` in `<span class="code-mono text-ink" translate="no">` (or plain `<span translate="no">` for `pull_request`).

---

## SECTION 2 — `#playground`

```astro
<section id="playground" class="scroll-mt-24 bg-canvas-soft pb-20 pt-8 sm:pb-24">
  <div class="container-page">
    <h2 class="sr-only">GitHub Actions expression and trigger playground</h2>
    <GithubActionsExpressionPlayground />
  </div>
</section>
```
The island self-mounts on `astro:page-load`, renders its own two-tab UI (Tab 1 Expression Evaluator / Tab 2 Trigger Simulator).

---

## SECTION 3 — `#why` "The Gap" (commit-push-pray loop)

Same two-column grid as reference: `<section id="why" class="scroll-mt-24 border-t border-hairline bg-canvas">` → `mx-auto grid max-w-5xl gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16`. Left col: `<p class="eyebrow">The Gap</p>` + headline. Right col: 3 body-md paragraphs + a body-sm text-mute jump line.

- Eyebrow: "The Gap"
- Headline (left, display-lg): "You can't test a workflow without running it."
- Para 1: "There is no `act --dry-run` for an `if:` condition or a `paths:` filter. So the loop is the same every time: tweak the YAML, commit, push, wait for the runner, watch the job run when it should have skipped — or skip when it should have run — then guess again. Call it commit-push-pray." (code-mono translate=no on act --dry-run, if:, paths:)
- Para 2: "Two footguns cause most of the pain. The first is the `if:` that is **always truthy**: put any literal text outside the `${{ }}` markers and GitHub coerces the whole thing to a non-empty string, so your 'conditional' step runs every single time — the single most reported Actions surprise (see actions/runner#1173). The second is the silent non-trigger: `branches` and `paths` filters **AND together**, `**` is not the same as `*`, and `paths-ignore` behaves differently on `pull_request`." Link "actions/runner#1173" → ghRunnerIssue (target _blank rel noopener noreferrer).
- Para 3: "This tool closes both gaps in your browser. Tab 1 evaluates `${{ }}` expressions against an editable mock context with GitHub's exact operators, coercion and case-insensitive `==`. Tab 2 replays a push, pull_request or tag event against your `on:` filters and shows, per job, RUNS or SKIPPED with the deciding reason — before you push." (link GitHub docs ghDocsExpressions/ghDocsTriggering inline where natural)
- Closing body-sm text-mute: 'See the <a class="link-inline" href="#reference">expression & trigger cheat-sheet</a>, or try the <a class="link-inline" href="#playground">live playground</a> above.'

All syntax tokens (`GitHub`, `${{ }}`, `if:`, `paths:`, `branches`, `paths-ignore`, `pull_request`, `**`, `*`, `on:`, `==`) wrapped `translate="no"`.

---

## SECTION 4 — `<ToolPipeline>` "How it works"

```astro
<ToolPipeline
  id="how-it-works"
  eyebrow="The Pipeline"
  heading="How it works."
  lead="Five deterministic steps, two tabs, zero pushes — every evaluation runs inside your browser tab."
  steps={pipeline}
/>
```
`pipeline` (5 steps → keeps lg:grid-cols-5). ToolPipeline renders `body` as plain text (no spans needed; vendor marks are literal strings):
1. title: "Pick a tab." body: "Choose the Expression Evaluator to test a ${{ }} condition, or the Trigger Simulator to replay an event against your on: filters."
2. title: "Set the context." body: "Edit the mock github, env, matrix, steps and needs objects — or describe the event: push / pull_request / tag, the ref name, and the list of changed files."
3. title: "Tokenize & parse." body: "The expression is lexed and parsed into an AST that mirrors GitHub's grammar — operators, precedence, function calls and the ${{ }} boundaries."
4. title: "Evaluate with GitHub's rules." body: "Operands coerce exactly as GitHub does — null/false/0/'' are falsy, && and || return operands not booleans, == is case-insensitive — and documented functions run against your context. Filters match through a faithful glob engine."
5. title: "Show the verdict — and the footgun." body: "Tab 1 prints the evaluated value and warns if literal text outside ${{ }} makes the if: always truthy. Tab 2 renders a per-job RUNS / SKIPPED table with the deciding filter and reason."

---

## SECTION 5 — `#reference` = EXPRESSION & TRIGGER CHEAT-SHEET (reimagined #checks)

Same shell as reference #checks: `<section id="reference" class="scroll-mt-24 border-t border-hairline bg-canvas">` → `container-page py-16 sm:py-20`, centered `max-w-2xl` header, then `mx-auto mt-10 grid max-w-5xl gap-6` card grid.

Header:
- `<p class="eyebrow">Cheat-Sheet</p>`
- `<h2 class="display-lg mt-3 text-ink">The expression & trigger reference.</h2>`
- lead body-md: "Everything GitHub evaluates, on one page — operators, functions, glob patterns, and the always-truthy footgun. Each card pairs the rule with a worked example."

Render `cheatsheet.map(...)` as `<article class="card-soft p-6 sm:p-7">`: an `<h3 class="display-sm text-balance text-ink">`, optional `<Badge variant="high">Footgun</Badge>` (footgun card only), a `body-md mt-3` blurb, then either a single full-width `<CodeBlock>` OR a two-up `mt-5 grid gap-5 lg:grid-cols-2` for comparison cards. Comparison column labels follow the reference: `<p class="eyebrow !text-error mb-2">` and `<p class="eyebrow !text-success mb-2">`. Inside CodeBlock pass raw template literals; write `\${{` to escape JS interpolation. Use lang="yaml" or lang="text".

**Card 1 — Operators & coercion** (single CodeBlock, lang="text"):
blurb: "Operators in precedence order, with GitHub's JS-like coercion. On a type mismatch, booleans become numbers (true→1, false→0) and strings parse as numbers; null/false/0/'' are falsy. && and || return the operand, not a boolean. == and != on strings are case-insensitive."
code:
```text
! ( )                      grouping / not
< <= > >=                  comparison        1 < 2            -> true
== !=                      equality (string ==, case-insensitive)
                           'Push' == 'push' -> true
&& ||                      returns an OPERAND, not a bool
                           'a' && 'b'       -> 'b'
                           '' || 'fallback' -> 'fallback'
falsy: null  false  0  ''  ('' is empty string, not "0")
```

**Card 2 — Functions** (single CodeBlock, lang="text"):
blurb: "The documented functions, all available in ${{ }}. String functions are case-insensitive."
code:
```text
contains(search, item)            contains('abc','b')        -> true
startsWith(str, prefix)           startsWith('refs/tags/v','refs/tags/') -> true
endsWith(str, suffix)             endsWith('main.yml','.yml')-> true
format(str, a, b, ...)            format('{0}/{1}','a','b')  -> 'a/b'
join(array, sep)                  join(matrix.os, ', ')
toJSON(value) / fromJSON(str)     fromJSON('[1,2,3]')[0]     -> 1
hashFiles(path, ...)              hashFiles('**/package-lock.json')
success() failure() always() cancelled()   job/step status checks
```

**Card 3 — Status functions: when each is true** (single CodeBlock, lang="yaml"):
blurb: "success() is the implicit if: on every step — until you write your own, which silently drops it. Add && success() back if you still want success-gating."
code:
```yaml
# implicit on every step:           if: success()
- run: deploy.sh
  if: ${{ github.ref == 'refs/heads/main' }}   # NO LONGER gated on success!
- run: deploy.sh
  if: ${{ success() && github.ref == 'refs/heads/main' }}  # fixed
- run: ./notify-failure.sh
  if: ${{ failure() }}        # only when a prior step failed
- run: ./cleanup.sh
  if: ${{ always() }}         # runs even after failure / cancel
```

**Card 4 — THE ALWAYS-TRUTHY FOOTGUN** — `<Badge variant="high">Footgun</Badge>`, two-up "Always truthy" / "Correct":
blurb: "An if: is evaluated by coercing its result to a boolean; any non-empty string is truthy. Literal text outside ${{ }} — or quoting the whole expression — turns the condition into a constant string that is ALWAYS truthy. This is the #1 GitHub Actions surprise (actions/runner#1173). The evaluator flags it."
bad column label `eyebrow !text-error` "Always truthy", lang="yaml", filename "if-condition":
```yaml
# ALWAYS RUNS — literal text sits outside ${{ }}
if: ${{ github.event_name == 'push' }} && always()
# ALWAYS RUNS — the whole expression is a quoted string
if: "${{ github.ref == 'refs/heads/main' }}"
```
good column label `eyebrow !text-success` "Correct", lang="yaml", filename "if-condition":
```yaml
# one ${{ }} wraps the WHOLE condition
if: ${{ github.event_name == 'push' && always() }}
# or omit the markers entirely (bare expression)
if: github.ref == 'refs/heads/main'
```

**Card 5 — Glob filter patterns** (single CodeBlock, lang="text"):
blurb: "The pattern syntax for branches, branches-ignore, tags, tags-ignore, paths and paths-ignore. * stops at /; ** does not."
code:
```text
*       any chars except /        'feature/*'   matches feature/x, not feature/x/y
**      any chars incl. /         '**'          matches every branch
?       0 or 1 of preceding char
+       1 or more of preceding char
!       negate (only at pattern start)   '!main'
\       escape a literal * ? [ +          'v\?'
paths:  'src/**'  '**.js'  '**/*.test.ts'
paths-ignore: 'docs/**'    # changed files all under docs -> SKIP
```

**Card 6 — Branch + path AND-semantics** — two-up "Won't trigger" / "Triggers":
blurb: "When BOTH a branch/tag filter and a path filter appear under one event, the event must match BOTH. A common mistake is expecting paths alone to gate a push on any branch — add branches: ['**'] so every branch qualifies."
bad column label `eyebrow !text-error` "Won't trigger", lang="yaml", filename ".github/workflows/ci.yml":
```yaml
# push to a feature branch touching src/** does NOT run:
on:
  push:
    branches: [main]      # AND
    paths: ['src/**']     # must satisfy BOTH
```
good column label `eyebrow !text-success` "Triggers", lang="yaml", filename ".github/workflows/ci.yml":
```yaml
# run on ANY branch when src/** changes:
on:
  push:
    branches: ['**']      # every branch qualifies
    paths: ['src/**']
```

**Cheat-sheet footnote** `<p class="caption mx-auto mt-10 max-w-3xl text-center text-pretty text-mute">`: "These rules mirror GitHub's [Evaluate expressions](ghDocsExpressions) and [filter-pattern](ghDocsFilterPatterns) docs. Edge cases are pinned in a versioned conformance corpus — see the note below." (links target _blank rel noopener noreferrer; wrap GitHub + tokens translate="no").

---

## SECTION 6 — Scope / fidelity note (conformance corpus + GHA semantics version)

Same shell as reference "Static Analysis" note: `<section class="bg-canvas-soft">` → `container-page py-12 sm:py-16` → `card-soft mx-auto max-w-3xl p-6`.
- `<p class="eyebrow">Fidelity</p>`
- body-md: "A note on fidelity: this is a faithful **re-implementation** of GitHub's documented expression and filter semantics — not a connection to GitHub's runner. Every operator, coercion rule, function and glob behaviour is backed by a **versioned conformance corpus**: a set of input→expected-output vectors derived from GitHub's docs and the runner's own behaviour, run as tests on every build. The evaluator pins a **GHA semantics version** so you always know which snapshot of GitHub's behaviour you are testing against. Undocumented internals and live hashFiles() disk reads are out of scope — hashFiles() is evaluated structurally, not against real files. Treat a green result as high pre-push confidence, and still review the run in GitHub for anything that depends on live repository state." (hashFiles(), GitHub → translate="no")

---

## SECTION 7 — `<FaqList faqs={faqs} />`

No extra props (defaults eyebrow="FAQ", heading="Questions, answered."). Same `faqs` array feeds `faqPageLd`.

---

## SECTION 8 — `<ToolCrossLinks slug="github-actions-expression-tester">`

`slug` drives the auto "More in CI/CD" sibling strip; with only one other live CI/CD tool (github-actions-validator) the strip self-omits (needs ≥2). Three slots:
- lead: 'The <span translate="no">GitHub Actions</span> Expression &amp; Trigger Tester is one tool in <span translate="no">{site.name}</span> — a growing canopy of browser-based validators, converters and testers that never touch a server.'
- links: 'Related tools: the <a class="link-inline" href="/github-actions-validator"><span translate="no">GitHub Actions</span> workflow validator</a> for YAML errors and security misconfigurations, and <a class="link-inline" href="/loki-alert-rule-tester"><span translate="no">AlertLint</span>, the <span translate="no">Loki</span> alert-rule tester</a>. Browse the full <a class="link-inline" href={navLinks[0].href}>tools directory</a>.'
- disclaimer: 'Not affiliated with, endorsed by, or sponsored by <span translate="no">GitHub, Inc.</span> <span translate="no">GitHub</span> and <span translate="no">GitHub Actions</span> are trademarks of <span translate="no">GitHub, Inc.</span>, used here only descriptively to identify the expression and trigger syntax this tool evaluates.'

Close `</Shell>`.

---

## Registry change (`src/data/tools.ts`) — add entry (status 'planned' → flip to 'live' at ship)

```ts
{
  slug: 'github-actions-expression-tester',
  name: 'GitHub Actions Expression & Trigger Tester',
  tagline: 'Test ${{ }} expressions and simulate workflow triggers — no push.',
  description:
    'Evaluate GitHub Actions ${{ }} expressions against a mock context and simulate push / pull_request / tag triggers against branch & paths filters. Catches the always-truthy if: footgun. Pure client-side.',
  status: 'planned',
  category: 'CI/CD',
  keywords: [
    'github actions expression tester',
    'github actions if condition tester',
    'github actions expression evaluator',
    'github actions trigger simulator',
    'github actions if always runs true',
    'github actions paths filter tester',
    'test github actions expression online',
    'github actions branch filter glob tester',
  ],
  accent: 'ship',
}
```
(Exactly 8 keywords = strategy registryKeywords.)

## featureList (passed to softwareAppLd) — 6 strategy strings verbatim
1. "Evaluate ${{ }} expressions against an editable mock github/env/matrix/steps/needs context with GitHub's exact operator and coercion semantics"
2. "Warns on the #1 footgun: literal text outside ${{ }} in an if: that silently makes the condition always truthy (actions/runner#1173)"
3. "Supports documented functions: contains, startsWith, endsWith, format, join, toJSON, fromJSON, hashFiles, success(), failure(), always(), cancelled()"
4. "Trigger Simulator: describe a push, pull_request or tag event and see which jobs RUN or are SKIPPED with the deciding reason"
5. "Faithful glob engine for branches, branches-ignore, tags, paths and paths-ignore (*, **, +, ?, !, escaping) including branch+path AND-semantics"
6. "100% client-side: your workflow YAML and event payloads never leave the browser, no signup and nothing to install"

## Author notes
- NO Tailwind `dark:` variants. Vendor marks (GitHub, GitHub Actions, ${{ }}, if:, function names, YAML keys, glob tokens) get `<span translate="no">` (or `class="code-mono text-ink" translate="no"` for inline-code styling).
- CodeBlock HTML-escapes and preserves whitespace — pass raw template-literal strings; write `\${{` inside template literals to avoid JS interpolation (the reference does this for `\${{ github.* }}`).
- Section order, wrapper classes, and `scroll-mt-24` anchors match the reference 1:1; only the `#checks` → `#reference` id and its content differ. The page passes ONLY [softwareApp, faqPage] to Shell — do NOT build breadcrumbLd here (ToolHero emits BreadcrumbList from the slug, avoiding a duplicate).

## Section Order

1. Shell
2. ToolHero
3. #playground
4. #why The Gap
5. ToolPipeline How it works
6. #reference Expression & Trigger Cheat-Sheet
7. Scope/Fidelity note
8. FaqList
9. ToolCrossLinks

## Hero Copy

Headline (slot="headline"):
Stop pushing just to see if your workflow runs.

Lead (slot="lead"):
Evaluate GitHub Actions ${{ }} expressions against an editable mock context, and simulate push, pull_request and tag events against your branch and paths filters — with GitHub's exact semantics. Catch the always-truthy if: footgun and the silent non-trigger before you commit. 100% in your browser, no signup.

Render with vendor marks wrapped: <span class="code-mono text-ink" translate="no">GitHub Actions</span>, <span class="code-mono text-ink" translate="no">${{ }}</span>, <span translate="no">pull_request</span>, <span class="code-mono text-ink" translate="no">if:</span>. "GitHub's" stays translate="no" too. In the .astro source the ${{ }} literal must be written as \${{ }} so it is not parsed as JSX interpolation.

## JSON-LD Plan

Assemble exactly as github-actions-validator.astro does, then pass jsonLd={[softwareApp, faqPage]} to <Shell>. Two builders from src/lib/jsonld.ts; NO breadcrumb here (ToolHero emits BreadcrumbList itself from the slug prop, so the page passes only these two objects, mirroring the reference).

1) softwareApp = softwareAppLd({
     name: 'GitHub Actions Expression & Trigger Tester',
     description: 'Test GitHub Actions ${{ }} expressions and simulate workflow triggers online. Evaluate if: conditions, contains/startsWith, branch & paths filters. Free, 100% in-browser.',
     url: pageUrl,                         // `${site.url}/github-actions-expression-tester`
     subCategory: 'CI/CD',                 // -> applicationSubCategory
     featureList: [ ...the 6 strategy featureList strings verbatim... ],
     keywords: tool?.keywords.join(', '),  // tool = getTool('github-actions-expression-tester'); the 8 registryKeywords comma-joined
   });
   -> emits @type SoftwareApplication, applicationCategory 'DeveloperApplication', operatingSystem 'Any (browser-based)', free Offer (price '0' USD), isAccessibleForFree true, publisher Organization {site.name, site.url}. Do NOT inline the object; route through softwareAppLd so the shape stays canonical.

2) faqPage = faqPageLd(faqs);             // SAME faqs array that feeds <FaqList faqs={faqs} /> — single source of truth. Emits @type FAQPage, one Question/acceptedAnswer Answer per {q,a}. Keep answers plain text (no HTML/translate spans) since they serialize into JSON-LD; the on-page FaqList renders the identical strings.

3) Hand both to Shell: jsonLd={[softwareApp, faqPage]} — order [softwareApp, faqPage], SoftwareApplication first, matching the reference. Shell serializes each into its own <script type="application/ld+json">. ToolHero independently injects BreadcrumbList (Home/Tools/CI-CD/{name}) because slug resolves in the registry — so the page must NOT also build breadcrumbLd (prevents a duplicate BreadcrumbList).

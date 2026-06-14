# GitHub Actions Expression & Trigger Playground — Implementation Plan

# Implementation Plan — GitHub Actions Expression & Trigger Tester

> Tool slug: **`github-actions-expression-tester`** · Category: **CI/CD** · Accent: **`ship`** · Status: ship as `planned` → flip to `live` when the en page + 4 locale pages exist.
> Project: `C:/Users/PUSHKAR/Desktop/my-project` (Astro v6 + Tailwind v4, 100% client-side, 5 locales).

---

## 1. Overview & Goal

A best-in-class, **100% client-side** two-tab DevOps tool that lets engineers reason about GitHub Actions behaviour **without pushing a commit**:

- **Tab 1 — Expression Evaluator.** Evaluates `${{ }}` expressions against an editable mock context (`github`/`env`/`matrix`/`steps`/`needs`/...) using GitHub's *exact* semantics: operators `== != < > <= >= && || !`; case-insensitive string `==`; JS-like coercion (`null`/`false`/`0`/`''`/`NaN` falsy; bool→number, string→number on mismatch); `&&`/`||` return **operands** (not booleans); documented functions `contains`/`startsWith`/`endsWith`/`format`/`join`/`toJSON`/`fromJSON`/`hashFiles`/`success()`/`failure()`/`always()`/`cancelled()`. **Headline feature:** detect & WARN on the "literal text outside `${{ }}` in an `if:` → always truthy" footgun (actions/runner#1173).
- **Tab 2 — Trigger Simulator.** User describes an event (push/pull_request/tag + ref + changed-file list); the tool evaluates `on:`/`branches`/`branches-ignore`/`tags`/`tags-ignore`/`paths`/`paths-ignore` through a faithful glob engine (`*`, `**`, `+`, `?`, `!`, escaping) including the **branch+path AND-semantics**, then renders a per-job RUNS/SKIPPED table with the deciding reason.

**The two moats:**
1. **Fidelity** — a versioned conformance corpus (`GHA_SEMANTICS_VERSION`) that *is* the spec, run by vitest on every build.
2. **Privacy** — workflow YAML + event payloads + mock context never leave the browser.

---

## 2. Architecture

### 2.1 Engine (`src/lib/github-actions-expression-tester/`)

The four-file contract is honored (`engine.ts` / `engine.test.ts` / `*Playground.astro` / page), but the engine **internally fans out** because the surface is genuinely two engines + a glob sub-engine. `engine.ts` remains the **only** import surface for the island.

| File | Role |
|---|---|
| `types.ts` | Public shapes only (no logic): `GhaValue`, `EvalContext`, `EvaluateResult`, `ExprPart`, `ExprWarning`, `SimEvent`, `SimulateResult`, `JobDecision`, `FilterTrace`. Mirrors `gha-validator/types.ts` voice. |
| `expr-lexer.ts` | Tolerant tokenizer for `${{ }}` body. Tokens: ident/number/string/op/dot/star/brackets/parens/comma/eof. Longest-match operators; single-quote strings with `''` escape; **no arithmetic** (`*` is the object-filter op, valid only after `.`). |
| `expr-parser.ts` | Pratt / precedence-climbing parser → `Expr` AST. Precedence: `\|\|` < `&&` < `==`/`!=` < cmp < unary `!` < postfix(prop/index/filter/call) < primary. Returns `{ast,error}`; never throws. |
| `expr-eval.ts` | Evaluator with GitHub's EXACT coercion: truthiness table, case-insensitive string `==`, `castToNumber` for mixed `==`/`!=` and all comparisons, `&&`/`||` returning operands, property/index/object-filter access, string-substitution `rendered`, plus `explanation` + `breakdown`. |
| `functions.ts` | Documented function library (case-insensitive names). `contains`/`startsWith`/`endsWith` case-insensitive; `format` (`{n}`, `{{`/`}}` escapes); `join`; `toJSON` (pretty); `fromJSON` (parse → null + warn on error); `hashFiles` (honest client-side **stub sentinel** + warning); `success`/`failure`/`always`/`cancelled` resolve from `EvalContext` status. |
| `context.ts` | `defaultContext()` editable mock tree (incl. a mock `github.event`) + validation/merge of user-edited JSON + case-insensitive key lookup helper. |
| `if-footgun.ts` | actions/runner#1173 detector. `analyzeIfCondition(raw)` flags operators/literal text outside `${{ }}` (post-substitution literal string ⇒ always truthy) or bare literal text with no `${{ }}`. Emits `literal-if-always-true` with the corrected wrapped form. |
| `glob.ts` | Faithful GitHub filter-pattern glob: `*` (not crossing `/`), `**` (crossing `/`), `?`, `+` (one-or-more of preceding), `[]` ranges, `!` in-order list negation, `\` escaping, full anchoring (`^…$`). `globToRegExp` + `matchFilter` returning the deciding pattern/reason. |
| `triggers.ts` | `simulateTriggers(yaml, event)`. Reuses the `declare module 'js-yaml'` shim + `import yaml from 'js-yaml'` verbatim from `gha-validator/engine.ts`. Normalizes `on:`, evaluates branch/tag/path filters, encodes the **branch-vs-tag matrix** and **branch+path AND-semantics**, returns per-job RUNS/SKIPPED/NOT-EVALUATED with deciding reason + `FilterTrace`. Job-level `if:` evaluated via `evaluateIfCondition`; `needs:` simplification documented. |
| `engine.ts` | PUBLIC façade. Exports `evaluateExpression`, `evaluateIfCondition`, `simulateTriggers`, `defaultContext`, `testGlob`, `GHA_SEMANTICS_VERSION`, and type re-exports. All sync, deterministic, never throw. |
| `examples.ts` | Bundled runnable examples for BOTH tabs (`{id,label,...}` shape) — `expressionExamples[]` + `triggerExamples[]`. |
| `conformance.ts` | `GHA_SEMANTICS_VERSION = 'gha-2024.11'` + flat `{id,kind,input,ctx?,expected}` corpus. The moat. |
| `engine.test.ts` | vitest (node env): `it.each` over the corpus + targeted unit vectors. |

**Invariants honored (codebase rules):** never throws (try/catch boundary → `{error}`/safe fallback); no DOM in `src/lib/**`; deterministic; honest about `hashFiles`/full `github.event` limits; `declare module 'js-yaml'` shim copied verbatim (no `@types/js-yaml`).

### 2.2 UI/UX island (`src/components/GithubActionsExpressionPlayground.astro`)

> **Naming note (resolved):** the page spec imports `GithubActionsExpressionPlayground`. Standardize on that filename. (UI spec drafts called it `GhaPlaygroundPlayground`/`GhaExpressionPlayground`; the page spec wins as the integration contract. Component class root stays `.gap`, wired-flag `data-gapWired`.)

Mirrors the verified island pattern of `GhaValidatorPlayground.astro`: server-rendered shell → one module `<script>` booting on `astro:page-load` → lazily dynamic-imports `engine` + `examples` → renders with `escapeHtml`. Key decisions:

- **Two server-rendered tab panels** (SEO-safe, zero CLS). WAI-ARIA tabs: roving tabindex, Arrow/Home/End, `aria-selected`/`aria-controls`; show/hide via an **`--active` class (NEVER the `hidden` attribute)**; inactive panel `inert`+`tabindex=-1`.
- **CodeMirror 6** for the expression input + the workflow-YAML input + 5 mini JSON context editors. Keymap MUST include the Escape→blur binding `{ key:'Escape', run: v => { v.contentDOM.blur(); return true } }` (Tab-trap fix).
- **Banner rendered purely from engine output** (`alwaysTruthy`/`literal`), never re-detected in the UI; gate it on `mode==='if'`.
- All runtime-injected result markup styled under `:global(...)` with explicit `width`/`height` on injected SVGs (scoped hash won't reach `innerHTML` nodes).
- UI chrome strings localized at runtime via `useTranslations(getLocaleFromUrl(Astro.url))` on the Astro side, handed to the boot script (`data-*` / JSON `<script type="application/json">` blob). Engine *output* (evaluated values, deciding globs, function names) rendered as-is via `escapeHtml`, untranslated.
- Lazy-mount context CM editors on first `<details>` open (perf); `view.requestMeasure()` after activating a tab (display:none breaks CM measurement).

---

## 3. Complete File Checklist

### A. Engine + tests (locale-agnostic — ONE shared copy, NOT forked per locale)
- `src/lib/github-actions-expression-tester/types.ts`
- `src/lib/github-actions-expression-tester/expr-lexer.ts`
- `src/lib/github-actions-expression-tester/expr-parser.ts`
- `src/lib/github-actions-expression-tester/expr-eval.ts`
- `src/lib/github-actions-expression-tester/functions.ts`
- `src/lib/github-actions-expression-tester/context.ts`
- `src/lib/github-actions-expression-tester/if-footgun.ts`
- `src/lib/github-actions-expression-tester/glob.ts`
- `src/lib/github-actions-expression-tester/triggers.ts`
- `src/lib/github-actions-expression-tester/engine.ts`
- `src/lib/github-actions-expression-tester/examples.ts`
- `src/lib/github-actions-expression-tester/conformance.ts`
- `src/lib/github-actions-expression-tester/engine.test.ts`

### B. Component island (ONE shared file, imported by all 5 locale pages)
- `src/components/GithubActionsExpressionPlayground.astro`

### C. English tool page
- `src/pages/github-actions-expression-tester.astro`

### D. Locale pages (mandatory the moment the en page lands — `i18n-check.mjs` hard gate)
- `src/pages/es/github-actions-expression-tester.astro`
- `src/pages/de/github-actions-expression-tester.astro`
- `src/pages/fr/github-actions-expression-tester.astro`
- `src/pages/pt-br/github-actions-expression-tester.astro`

### E. Registry edit
- `src/data/tools.ts` (add the Tool entry; `status:'planned'` → flip to `'live'` at ship)

### F. Blog — 2 English posts + 8 translations (each en post makes 4 translations mandatory)
> Blog slugs resolved to the SEO output's exact-match keyword slugs (override the i18n fileMatrix's draft names).
- `src/content/blog/en/github-actions-if-condition-always-true.md`
- `src/content/blog/en/github-actions-workflow-not-triggering-filters.md`
- `src/content/blog/es/github-actions-if-condition-always-true.md`
- `src/content/blog/de/github-actions-if-condition-always-true.md`
- `src/content/blog/fr/github-actions-if-condition-always-true.md`
- `src/content/blog/pt-br/github-actions-if-condition-always-true.md`
- `src/content/blog/es/github-actions-workflow-not-triggering-filters.md`
- `src/content/blog/de/github-actions-workflow-not-triggering-filters.md`
- `src/content/blog/fr/github-actions-workflow-not-triggering-filters.md`
- `src/content/blog/pt-br/github-actions-workflow-not-triggering-filters.md`

### G. UI dictionary keys (add the ~30 `gha-expr.*` keys)
- `src/i18n/ui/en.ts` (defines the `UiKey` union — add keys here first)
- `src/i18n/ui/es.ts`
- `src/i18n/ui/de.ts`
- `src/i18n/ui/fr.ts`
- `src/i18n/ui/pt-br.ts`

**UiKeys to add:** `gha-expr.tab.expression`, `gha-expr.tab.trigger`, `gha-expr.btn.evaluate`, `gha-expr.btn.simulate`, `gha-expr.btn.reset`, `gha-expr.btn.loadExample`, `gha-expr.btn.copy`, `gha-expr.btn.copied`, `gha-expr.label.expressionInput`, `gha-expr.label.contextInput`, `gha-expr.label.workflowInput`, `gha-expr.label.eventInput`, `gha-expr.label.preset`, `gha-expr.label.result`, `gha-expr.label.eventType`, `gha-expr.label.refName`, `gha-expr.label.changedFiles`, `gha-expr.result.value`, `gha-expr.result.type`, `gha-expr.col.job`, `gha-expr.col.status`, `gha-expr.col.reason`, `gha-expr.status.runs`, `gha-expr.status.skipped`, `gha-expr.warn.literalIfTitle`, `gha-expr.warn.literalIfBody`, `gha-expr.empty.expression`, `gha-expr.empty.trigger`, `gha-expr.error.invalidExpression`, `gha-expr.error.invalidYaml`.

**Total: 33 files to create + 6 files to edit** (`tools.ts` + 5 UI dicts).

---

## 4. UI/UX & Responsive Spec (highlights)

### Tab 1 — Expression Evaluator
- Desktop ≥1024px: 2-col 7fr/5fr (left = dark `bg-inverse` CM6 expression editor + always-truthy banner + verdict + token→meaning breakdown; right = accordion of 5 mock-context JSON editors with green/red validity dots). Mobile <1024px: single column, context stack collapsed in one outer `<details>` below the verdict.
- **Segmented "Expression" vs "`if:` condition" toggle** above the editor (default `if:`) — only the `if:` mode runs the footgun check.
- **Always-truthy WARNING banner** is the most prominent element when present: full-width, `--color-warning-soft` bg + `inset 0 0 0 1px var(--color-warning)` ring, `role="alert"`, offending substring as inline `<code>` chip, and a BAD→FIXED fix sub-block.
- **Verdict block** shows the boolean (`true` = success token + check; `false` = mute/neutral, **NOT red** — red is reserved for errors) AND the raw returned value + type chip (honors `&&`/`||` operand return).
- **Preset chips** (push/PR/tag) rewrite all 5 context editors to a coherent scenario and announce via the aria-live region.

### Tab 2 — Trigger Simulator
- Desktop ≥1024px: 2-col 6fr/6fr (left = dark CM6 workflow YAML editor; right = event-scenario form: event type `<select>`, ref/branch input with computed full-ref caption, tag input revealed via `--active`, changed-files `<textarea>` with live count, optional custom vars). Full-width per-job results table below.
- **Per-job table** = semantic `<table>` (Job / Decision / Deciding rule). Decision pills use semantic tokens: RUNS = success-soft; SKIPPED = canvas-soft-2/mute; SKIPPED (filter conflict) = warning-soft for the branch+path AND gotcha. Deciding-rule cell names the exact `on:` key + glob `<code>` chip; expandable `<details>` trace. **Mobile <640px: reflow to stacked labeled cards** (`display:block` + `data-label` `::before`), not horizontal scroll; `word-break`/`text-wrap:pretty` on code chips.
- Collapsed `<details>` "How globs are matched" doubles as on-page SEO content.

### Shared affordances & accessibility
- Examples picker + Copy + **Share** (client-side base64url codec, optional `CompressionStream('deflate-raw')`, namespaced `#gap=` + `&t=<tab>`, `history.replaceState`, nothing leaves the browser). `⌘/Ctrl+Enter` runs the **active** panel only (scope keydown to active panel).
- States per result region: empty / loading (rAF yield before heavy work) / error (`role="alert"`) / result (`gap-rise` entrance). `aria-live="polite"` regions + a dedicated `#gap-announce` `sr-only` `role="status"`.
- Every tap target ≥44×44 + `touch-action:manipulation`; Esc-to-release tip under every CodeMirror.
- `prefers-reduced-motion` disables all entrance/pulse/spin animation.
- Light & dark via `html[data-theme]` token re-pointing — **NO Tailwind `dark:` variants**; dark code surface = `bg-inverse`.

---

## 5. Internationalization (full 5-locale coverage — non-optional)

`scripts/i18n-check.mjs` is a hard CI gate (`process.exit(1)`) that (1) requires `src/pages/{es,de,fr,pt-br}/<file>.astro` for every top-level en page, and (2) requires `src/content/blog/{es,de,fr,pt-br}/<slug>.md` for every `en/*.md`. **The unit of shipping is "en file + its 4 locale copies", never a lone English file.**

**Page-copy mechanical contract** (mirror `de/github-actions-validator.astro`):
- Copy the en page; **add one `../` to every relative import** (`../components/X` → `../../components/X`, etc.).
- **`canonical` stays NEUTRAL**: `canonical="/github-actions-expression-tester"` on every locale page (Shell derives localized canonical + hreflang).
- Add the localizer block to frontmatter and route every **site-route** href through it:
  ```ts
  import type { Locale as __Locale } from '../../i18n/config';
  import { localizeKey as __l } from '../../i18n/utils';
  const __lang = (Astro.currentLocale ?? 'en') as __Locale;
  ```
  Then `href={__l("/github-actions-validator", __lang)}`, `href={__l("/loki-alert-rule-tester", __lang)}`, `href={__l(navLinks[0].href, __lang)}`. In-page anchors (`#playground`, `#why`, `#reference`, `#how-it-works`) and external URLs (`docs.github.com`, `actions/runner#1173`) stay literal.
- Translate `title`/`description`/`featureList`/`keywords` + all prose (hero, why, pipeline, cheat-sheet blurbs, scope note, FAQs, cross-links). Keep every `<CodeBlock>` body, `${{ }}`/YAML/glob/mock-JSON example, and all `glossaryDoNotTranslate` terms **byte-identical**, wrapped `<span translate="no">`.
- **Glossary `translate="no"` set:** GitHub, GitHub Actions, GitHub Inc., `${{ }}`, `if:`, `on:`, `jobs:`, `steps:`, `branches`, `branches-ignore`, `tags`, `tags-ignore`, `paths`, `paths-ignore`, `needs:`, `env:`, `matrix:`, `runs-on`, push, pull_request, pull_request_target, workflow_dispatch, `github.*`, function names (`contains`/`startsWith`/`endsWith`/`format`/`join`/`toJSON`/`fromJSON`/`hashFiles`/`success()`/`failure()`/`always()`/`cancelled()`), operators (`&&`/`||`/`==`/`!=`), glob tokens (`*`/`**`/`+`/`?`/`!`), `actions/runner#1173`, RUN/SKIPPED, CI/CD, OpsCanopy.

**Locale conventions:** es neutral Spanish with ¿/¡; de formal "Sie", „…" quotes; fr vouvoiement, « … » with NBSP; pt-br "você", "arquivo"/"tela".

**Blog translations:** copy `en/<post>.md` → `<locale>/<post>.md`, set `lang: <locale>` and `translationOf: "<en-slug>"`, translate body prose, keep fenced code + vendor terms identical, keep `relatedTool.href` neutral.

**UI-dict:** add all keys to `en.ts` first (defines the union); each locale dict is `Partial<UiDict>` `satisfies` the en union (typo'd key = compile error; missing key = silent English fallback, so dictionaries can fill incrementally without reddening CI).

**Rollout order (keep CI green at every boundary):** engine core → island + UiKeys (stub all locales) → registry (`planned`) → **en page + 4 locale pages in the same batch** → real UiKey translations → **2 en blogs + their 8 translations in the same batch** → flip `planned`→`live`.

---

## 6. SEO

**Tool page:**
- Title: `GitHub Actions Expression Tester & Trigger Simulator`
- Description: `Test GitHub Actions ${{ }} expressions and simulate workflow triggers online. Evaluate if: conditions, contains/startsWith, branch & paths filters. Free, 100% in-browser.` (158 chars)
- **Registry keywords (exactly 8):** `github actions expression tester`, `github actions if condition tester`, `github actions expression evaluator`, `github actions trigger simulator`, `github actions if always runs true`, `github actions paths filter tester`, `test github actions expression online`, `github actions branch filter glob tester`.
- JSON-LD: `softwareAppLd({name, description, url:pageUrl, subCategory:'CI/CD', featureList:[6 strings verbatim], keywords: tool?.keywords.join(', ')})` + `faqPageLd(faqs)`; pass `jsonLd={[softwareApp, faqPage]}` to Shell. **Do NOT build BreadcrumbList** in-page — ToolHero emits it from the slug (avoid duplicate).

**FAQ rich-result:** single `faqs` array (the page spec's 9 long-tail Q/As — e.g. "Why does my GitHub Actions if condition always run?", "Do GitHub Actions branch and paths filters use AND or OR?", "What does ** mean…", "What is the difference between success(), failure(), always() and cancelled()?") feeds BOTH `<FaqList>` and `faqPageLd`. Keep answers plain text (serialized into JSON-LD).

**Blog #1 — `github-actions-if-condition-always-true`** (~1520 words). Primary keyword: *github actions if condition not working* / *if always runs true*. Diagnostic, code-first BAD→FIXED walkthrough of the #1173 footgun, the implicit `success()` rule, success/failure/always/cancelled, case-insensitive `==`. `relatedTool` CTA → Tab 1.

**Blog #2 — `github-actions-workflow-not-triggering-filters`** (~1520 words). Primary keyword: *why did my github actions workflow not trigger*. Decision-tree on branch mismatch, workflow-file-on-target-branch, branch+path AND-semantics, `**` vs `*`, 300-file diff limit, `paths-ignore` on PR, glob cheat-sheet. `relatedTool` CTA → Tab 2.

Both posts mirror the voice of `en/github-actions-security-misconfigurations.md` (concrete, code-first, no fluff) and neither overlaps it.

---

## 7. Testing & Conformance (the fidelity moat)

- `conformance.ts` exports `GHA_SEMANTICS_VERSION = 'gha-2024.11'` (echoed in every result + shown in the scope-note card and the per-result UI). Corpus = flat array of `{ id, kind:'expr'|'if'|'trigger', input, ctx?, expected }`, each annotated with the doc/issue it mirrors.
- `engine.test.ts` (vitest, node env) iterates with `it.each` asserting `value`/`truthy`/`rendered` (expr) or `jobs[].decision` (trigger), plus targeted unit vectors.
- **Behavior-change protocol:** to change a verdict, add/edit a corpus row referencing the source AND bump `GHA_SEMANTICS_VERSION`. The test IS the spec.
- **Vectors to lock in (representative):**
  - *Coercion/equality:* `1 == '1'`→true; `'TRUE' == 'true'`→true; `'true' == true`→**false** (surprising — document); `null == 0`/`null == ''`/`'' == 0`→true; `0 == false`→true; `'abc' < 1`→false (NaN); `NaN == NaN`→false.
  - *Operand return:* `'' || 'def'`→`'def'`; `'a' && 'b'`→`'b'`; `0 || false`→`false`; `'x' && ''`→`''` (truthy=false); `!''`→true; `!'false'`→false.
  - *Truthiness:* `'0'`→truthy; `0`→falsy; `'[]'` vs `fromJSON('[]')`→both truthy.
  - *Functions:* `contains('Hello world','WORLD')`→true; `startsWith('refs/heads/main','refs/heads/')`→true; `format('{0}-{1}','a','b')`→`'a-b'`; `format('{{literal}} {0}','x')`→`'{literal} x'`; `join(fromJSON('[1,2,3]'),';')`→`'1;2;3'`; `fromJSON('nope')`→null+warn; `hashFiles('**/*.lock')`→sentinel+`hashfiles-stub` warn; `always()`→true.
  - *Footgun:* `${{ github.event_name }} == 'push'`→`literal-if-always-true`; `${{ github.event_name == 'push' }}`→no warning; bare `merge me`→warning.
  - *Glob:* `feature/*` matches `feature/x` not `feature/x/y`; `feature/**` matches both; `v1.*` vs `v1.2`; `[0-9]+`; `!main` ordering; `\*literal`; `**` matches `src/app/index.ts`.
  - *Triggers:* push to `main` w/ `branches:[main]`→triggered; push to `dev`→skipped; tag push `v1.0.0` w/ only `branches`→**NOT** triggered; `branches:[main]`+`paths:['src/**']` & changed `['docs/x.md']`→not triggered (AND), changed `['src/a.ts']`→triggered; `paths-ignore:['docs/**']` w/ only doc changes→not triggered; PR with matching `paths`→triggered; per-job `if:` runs/skipped; job needing a skipped job→skipped.
- **Final verification:** `npm run test` (vitest green), `node scripts/i18n-check.mjs` (✓ pages + ✓ blog, "Coverage OK."), `npx astro check` + full build (catches import-depth + UiDict type errors).

---

## 8. Build Sequence (phased, with effort)

1. **Phase 1 — Engine core (no i18n impact).** Author `types.ts`, `expr-lexer.ts`, `expr-parser.ts`, `expr-eval.ts`, `functions.ts`, `context.ts`, `if-footgun.ts`, `glob.ts`, `triggers.ts`, `engine.ts`, `examples.ts`, `conformance.ts`, `engine.test.ts`. Reuse the `declare module 'js-yaml'` shim verbatim. **Get vitest green against the corpus before anything else.** *(~2.5–3 days)*
2. **Phase 2 — Island.** Build `GithubActionsExpressionPlayground.astro` (clone `GhaValidatorPlayground.astro` structure; CM6 yaml+json+expr with Escape-blur; tabs/presets/Evaluate/Simulate/Copy/Share; `:global` result CSS). Add all `gha-expr.*` keys to `en.ts` and stub them in es/de/fr/pt-br. *(~2–2.5 days)*
3. **Phase 3 — Registry.** Add the Tool entry to `src/data/tools.ts` as `status:'planned'`. *(~0.5 hr)*
4. **Phase 4 — English page.** Build `src/pages/github-actions-expression-tester.astro` (mirror `github-actions-validator.astro` 1:1; `#checks`→`#reference` cheat-sheet; `jsonLd={[softwareApp, faqPage]}`; 9 faqs; 5 pipeline steps; 6 cheat-sheet cards incl. the Footgun and AND-semantics comparison cards). *(~1 day)*
5. **Phase 5 — 4 locale pages (same batch as Phase 4).** es/de/fr/pt-br copies: +1 `../`, neutral canonical, `__l` links, prose-only translation, real UiKey translations. Run `node scripts/i18n-check.mjs --locale=<x>` per language. *(~1.5–2 days)*
6. **Phase 6 — Blogs (en + 8 translations, same batch).** Write the 2 en posts, then 8 locale copies with `lang`/`translationOf` set. *(~2 days)*
7. **Phase 7 — Verify & ship.** `npm run test`, `node scripts/i18n-check.mjs`, `npx astro check`, full build; spot-check rendered locale pages (tab labels, banner, table in-language; code untranslated; canonical localized but pointing at neutral key). Flip `planned`→`live`. *(~0.5 day)*

---

## 9. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| **Fidelity drift** (no formal GHA spec; e.g. `'true' == true`→false, `null == ''`→true are observed, not documented). | Every such case is a named conformance vector with a source note; bump `GHA_SEMANTICS_VERSION` on re-confirm/change. |
| **Object/array equality** (GitHub compares non-primitives by reference; our model has no stable identity). | Report structural object equality as false; document in cheat-sheet (`fromJSON('{}') == fromJSON('{}')`→false). |
| **`hashFiles` / full `github.event` not reproducible client-side.** | Honest sentinel + `hashfiles-stub` warning; user-editable mock `github.event`; surfaced in the scope-note card. Never fake a 64-hex hash. |
| **`format`/`fromJSON` divergence** (runner *fails the run*; we warn & degrade). | Deliberate, documented divergence (engines never throw) — called out so users don't assume the workflow passes. |
| **Glob `+` and `[]` ranges** least-documented → wrong verdicts. | Isolated, independently unit-tested `glob.ts` + anchored corpus vectors. |
| **Branch-vs-tag matrix** (tag push w/ only `branches`→NOT triggered) is subtle. | Explicit decision table in `triggers.ts` + dedicated corpus rows. |
| **`needs:` modeling** assumes upstream success unless upstream is itself skipped. | Label as a simplification in the UI. |
| **UI re-detecting the footgun** would diverge from the corpus. | Banner renders **purely** from engine output; gate on `mode==='if'`. |
| **CM editors heavy on mobile / 0-height in display:none panels.** | Lazy-mount context editors on `<details>` open; `requestMeasure()` on tab show; debounce live-eval 250–400ms with a running lock. |
| **Share payload size.** | `CompressionStream('deflate-raw')` when available, else raw base64url; 100% client-side. |
| **js-yaml has no bundled types.** | Copy `declare module 'js-yaml'` shim exactly from `gha-validator/engine.ts`. |
| **CI reddened by lone en file.** | Treat "en + 4 locales" as one atomic change set for both pages and posts; never merge an English-only page/post. |
| **Blog/component slug discrepancies across specs.** | Resolved: component = `GithubActionsExpressionPlayground.astro`; blog slugs = `github-actions-if-condition-always-true` + `github-actions-workflow-not-triggering-filters` (SEO exact-match). Apply consistently everywhere. |

---

## 10. Acceptance Criteria / Definition of Done

- **Engine:** all public entries (`evaluateExpression`, `evaluateIfCondition`, `simulateTriggers`, `defaultContext`, `testGlob`) are sync, deterministic, never throw; no DOM in `src/lib/**`; `engine.test.ts` green over the full conformance corpus + unit vectors; `GHA_SEMANTICS_VERSION` echoed in every result.
- **Island:** WAI-ARIA tabs (roving tabindex, arrows/Home/End, `--active`, inactive `inert`); both panels server-rendered (no CLS); engine/examples lazy-loaded; always-truthy banner is the most prominent element when present (`role="alert"`, BAD→FIXED block, rendered from engine output); verdict shows boolean + raw value + type; per-job `<table>` reflows to stacked cards <640px with deciding-rule + glob chip + AND-semantics note; every target ≥44×44; Esc-to-release under every CM; `⌘/Ctrl+Enter` runs the active panel; Copy + Share work fully offline; `prefers-reduced-motion` disables animation; light & dark correct via token re-pointing (no `dark:`).
- **Page:** mirrors `github-actions-validator.astro` section order 1:1 (`#checks`→`#reference`); `jsonLd={[softwareApp, faqPage]}` only (no breadcrumb); 9 faqs feed both `<FaqList>` and `faqPageLd`; all vendor marks `<span translate="no">`; CodeBlock template literals escape `\${{`.
- **i18n:** `node scripts/i18n-check.mjs` prints ✓ for all 4 locales (pages + blog) and "Coverage OK."; all 4 locale pages use +1 `../` imports, neutral canonical, `__l`-routed site links; code blocks/vendor terms byte-identical; UiKeys present in en.ts and translated in all locales.
- **Registry:** Tool entry present with exactly 8 keywords, category `CI/CD`, accent `ship`; flipped to `status:'live'` only after en + 4 locale pages exist.
- **SEO/blog:** 2 en posts + 8 translations exist with correct `lang`/`translationOf` and neutral `relatedTool.href`.
- **Build:** `npx astro check` + full build pass with zero type/import errors; `npm run test` green.

## Build Sequence

1. Phase 1 — Engine core (no i18n impact): author types.ts, expr-lexer.ts, expr-parser.ts, expr-eval.ts, functions.ts, context.ts, if-footgun.ts, glob.ts, triggers.ts, engine.ts, examples.ts, conformance.ts, engine.test.ts. Reuse the declare module 'js-yaml' shim verbatim from gha-validator/engine.ts. Get vitest green against the conformance corpus before proceeding.
2. Phase 2 — Island: build src/components/GithubActionsExpressionPlayground.astro by cloning GhaValidatorPlayground.astro structure (toolbar/editor/results, dark CM6 setup with Escape-blur keymap, copy+share codec, loading/empty/error helpers, aria-live). Wire two-tab WAI-ARIA switcher (--active, inert), presets, Evaluate/Simulate, Copy, Share; all result markup under :global. Add all gha-expr.* UiKeys to src/i18n/ui/en.ts and stub them (English placeholders OK) in es/de/fr/pt-br.
3. Phase 3 — Registry: add the Tool entry to src/data/tools.ts with status:'planned', category:'CI/CD', accent:'ship', exactly 8 keywords.
4. Phase 4 — English page: build src/pages/github-actions-expression-tester.astro mirroring github-actions-validator.astro 1:1 (Shell→ToolHero→#playground→#why→ToolPipeline→#reference cheat-sheet→scope note→FaqList→ToolCrossLinks); jsonLd={[softwareApp, faqPage]} only (no breadcrumb); single faqs array (9 Q/As) feeds both FaqList and faqPageLd; 5 pipeline steps; 6 cheat-sheet cards incl. the Footgun and branch+path AND-semantics comparison cards; escape \${{ in CodeBlock template literals.
5. Phase 5 — 4 locale pages (same batch as Phase 4 to keep i18n-check green): copy the en page to es/de/fr/pt-br with +1 ../ on every relative import, neutral canonical, the __l/__lang localizer block, site-route hrefs through __l, prose-only translation, real UiKey translations. Run node scripts/i18n-check.mjs --locale=<x> per language.
6. Phase 6 — Blogs (en + 8 translations, same batch): write src/content/blog/en/github-actions-if-condition-always-true.md and github-actions-workflow-not-triggering-filters.md (voice mirrors github-actions-security-misconfigurations.md, relatedTool CTAs to Tab 1 / Tab 2), then 8 locale copies with lang + translationOf set, fenced code + vendor terms byte-identical, neutral relatedTool.href.
7. Phase 7 — Verify & ship: npm run test (vitest green), node scripts/i18n-check.mjs (✓ pages + ✓ blog, 'Coverage OK.'), npx astro check + full build (catch import-depth + UiDict type errors), spot-check rendered locale pages, then flip the registry entry status:'planned'→'live'.

## Full File Checklist

- [ ] `C:/Users/PUSHKAR/Desktop/my-project/src/lib/github-actions-expression-tester/types.ts`
- [ ] `C:/Users/PUSHKAR/Desktop/my-project/src/lib/github-actions-expression-tester/expr-lexer.ts`
- [ ] `C:/Users/PUSHKAR/Desktop/my-project/src/lib/github-actions-expression-tester/expr-parser.ts`
- [ ] `C:/Users/PUSHKAR/Desktop/my-project/src/lib/github-actions-expression-tester/expr-eval.ts`
- [ ] `C:/Users/PUSHKAR/Desktop/my-project/src/lib/github-actions-expression-tester/functions.ts`
- [ ] `C:/Users/PUSHKAR/Desktop/my-project/src/lib/github-actions-expression-tester/context.ts`
- [ ] `C:/Users/PUSHKAR/Desktop/my-project/src/lib/github-actions-expression-tester/if-footgun.ts`
- [ ] `C:/Users/PUSHKAR/Desktop/my-project/src/lib/github-actions-expression-tester/glob.ts`
- [ ] `C:/Users/PUSHKAR/Desktop/my-project/src/lib/github-actions-expression-tester/triggers.ts`
- [ ] `C:/Users/PUSHKAR/Desktop/my-project/src/lib/github-actions-expression-tester/engine.ts`
- [ ] `C:/Users/PUSHKAR/Desktop/my-project/src/lib/github-actions-expression-tester/examples.ts`
- [ ] `C:/Users/PUSHKAR/Desktop/my-project/src/lib/github-actions-expression-tester/conformance.ts`
- [ ] `C:/Users/PUSHKAR/Desktop/my-project/src/lib/github-actions-expression-tester/engine.test.ts`
- [ ] `C:/Users/PUSHKAR/Desktop/my-project/src/components/GithubActionsExpressionPlayground.astro`
- [ ] `C:/Users/PUSHKAR/Desktop/my-project/src/pages/github-actions-expression-tester.astro`
- [ ] `C:/Users/PUSHKAR/Desktop/my-project/src/pages/es/github-actions-expression-tester.astro`
- [ ] `C:/Users/PUSHKAR/Desktop/my-project/src/pages/de/github-actions-expression-tester.astro`
- [ ] `C:/Users/PUSHKAR/Desktop/my-project/src/pages/fr/github-actions-expression-tester.astro`
- [ ] `C:/Users/PUSHKAR/Desktop/my-project/src/pages/pt-br/github-actions-expression-tester.astro`
- [ ] `C:/Users/PUSHKAR/Desktop/my-project/src/data/tools.ts`
- [ ] `C:/Users/PUSHKAR/Desktop/my-project/src/content/blog/en/github-actions-if-condition-always-true.md`
- [ ] `C:/Users/PUSHKAR/Desktop/my-project/src/content/blog/en/github-actions-workflow-not-triggering-filters.md`
- [ ] `C:/Users/PUSHKAR/Desktop/my-project/src/content/blog/es/github-actions-if-condition-always-true.md`
- [ ] `C:/Users/PUSHKAR/Desktop/my-project/src/content/blog/de/github-actions-if-condition-always-true.md`
- [ ] `C:/Users/PUSHKAR/Desktop/my-project/src/content/blog/fr/github-actions-if-condition-always-true.md`
- [ ] `C:/Users/PUSHKAR/Desktop/my-project/src/content/blog/pt-br/github-actions-if-condition-always-true.md`
- [ ] `C:/Users/PUSHKAR/Desktop/my-project/src/content/blog/es/github-actions-workflow-not-triggering-filters.md`
- [ ] `C:/Users/PUSHKAR/Desktop/my-project/src/content/blog/de/github-actions-workflow-not-triggering-filters.md`
- [ ] `C:/Users/PUSHKAR/Desktop/my-project/src/content/blog/fr/github-actions-workflow-not-triggering-filters.md`
- [ ] `C:/Users/PUSHKAR/Desktop/my-project/src/content/blog/pt-br/github-actions-workflow-not-triggering-filters.md`
- [ ] `C:/Users/PUSHKAR/Desktop/my-project/src/i18n/ui/en.ts`
- [ ] `C:/Users/PUSHKAR/Desktop/my-project/src/i18n/ui/es.ts`
- [ ] `C:/Users/PUSHKAR/Desktop/my-project/src/i18n/ui/de.ts`
- [ ] `C:/Users/PUSHKAR/Desktop/my-project/src/i18n/ui/fr.ts`
- [ ] `C:/Users/PUSHKAR/Desktop/my-project/src/i18n/ui/pt-br.ts`

## Effort Estimate

Approximately 9.5–11.5 engineering days total (single engineer): Phase 1 engine + conformance ~2.5–3d; Phase 2 island ~2–2.5d; Phase 3 registry ~0.5h; Phase 4 en page ~1d; Phase 5 four locale pages ~1.5–2d; Phase 6 two en blogs + eight translations ~2d; Phase 7 verify & ship ~0.5d. Critical path is the engine fidelity (Phase 1) since everything depends on the conformance corpus being green; the locale pages and blog translations are the largest mechanical-but-high-volume effort. Parallelizable: a second contributor could draft the en page/cheat-sheet copy and blogs while the engine is built, and translations can be split across people once the en page and en blogs are frozen.

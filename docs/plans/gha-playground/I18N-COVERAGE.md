# Internationalization Coverage (en / es / de / fr / pt-br)

## i18n Coverage Plan — "GitHub Actions Expression & Trigger Playground"

### Slug decision (load-bearing for every path below)
- Existing tool `github-actions-validator` already owns that slug + all 5 locale pages. The new tool MUST use a distinct slug. Recommended: **`github-actions-expression-tester`** — keyword-bearing ("github actions expression tester/evaluator", "github actions if condition tester", "github actions trigger simulator"), collision-free against `src/pages/*` (verified: only `github-actions-validator.astro` and `cron-expression-tester.astro` exist), and it sits in the existing `CI/CD` category with `accent:'ship'`. Use this slug consistently as `<slug>` everywhere.

### Why full 5-locale coverage is non-optional here
`scripts/i18n-check.mjs` is a hard CI gate (`process.exit(1)` on any gap). It does TWO things automatically:
1. **Pages**: enumerates EVERY `*.astro` in `src/pages/` (minus `404.astro`, `alertlint-wasm-demo.astro`, and dynamic `[...]` routes) and requires `src/pages/{es,de,fr,pt-br}/<that-file>` to exist. The moment `src/pages/github-actions-expression-tester.astro` lands, four locale copies become mandatory.
2. **Blog**: enumerates EVERY `*.md` in `src/content/blog/en/` and requires the same filename under `src/content/blog/{es,de,fr,pt-br}/`. Any new English post you add becomes 4 mandatory translations.
So the unit of shipping is "en file + its 4 locale copies", never a lone English file (or you redden CI for the whole team).

### How locale pages mirror the en page (the mechanical contract — per GLOSSARY.md)
Each `src/pages/<locale>/<slug>.astro` is a byte-faithful copy of the English page with ONLY human prose translated. Concretely:
- **Imports**: the file is one directory deeper, so every relative import gains one `../`. `../components/X` → `../../components/X`; `../data/tools` → `../../data/tools`; `../lib/jsonld` → `../../lib/jsonld`; `../i18n/...` → `../../i18n/...`. (Confirmed in `de/github-actions-validator.astro`: `import Shell from '../../components/Shell.astro'`.)
- **canonical stays NEUTRAL**: `canonical="/github-actions-expression-tester"` on EVERY locale page (no locale prefix). The Shell/SEO layer derives the localized canonical + hreflang from the active locale. (Confirmed: `de/github-actions-validator.astro` line 225 uses `canonical="/github-actions-validator"`.)
- **Internal links route through localizeKey**: add at the end of the frontmatter, exactly as the de page does (lines 216-218):
  ```ts
  import type { Locale as __Locale } from '../../i18n/config';
  import { localizeKey as __l } from '../../i18n/utils';
  const __lang = (Astro.currentLocale ?? 'en') as __Locale;
  ```
  Then every in-page nav/cross-link to a site route becomes `href={__l("/some-tool", __lang)}` (e.g. cross-links to `/github-actions-validator`, `/cron-expression-tester`, and `navLinks[0].href` for the tools directory). In-page anchor links (`#playground`, `#why`, `#reference`, `#how-it-works`) stay literal — they are not site routes. External `https://docs.github.com/...` and `actions/runner#1173` issue links stay literal.
- **JSON-LD is assembled in-page, translated**: `softwareAppLd({name, description, subCategory, featureList, keywords})` gets a translated `description`/`featureList` and locale-specific `keywords` (localized search intent, same array length — per GLOSSARY "SEO keywords"); `name` stays the verbatim tool name. `faqPageLd(faqs)` consumes the same translated `faqs` array that `<FaqList>` renders, so FAQ text is translated once and feeds both.
- **What gets translated** (per GLOSSARY "DO translate"): page `title`/`description`, hero `eyebrow`/`headline`/`lead`, `badges[].label`, the #why prose, `ToolPipeline` step `title`/`body`, the Expression/Trigger CHEAT-SHEET blurbs + example captions/labels, the "Static analysis"/scope note card, FAQ `q`/`a`, and `ToolCrossLinks` lead/links/disclaimer Fragments.
- **What stays byte-identical** (never translated): all the `glossaryDoNotTranslate` terms wrapped in `<span translate="no">`, every `<CodeBlock code={...}>` body and fenced/template-literal example (the actual `${{ }}` expressions, YAML, glob patterns, mock-context JSON), `class`/`id`/`slot`/`data-*`/`aria-*` values, the `code` example strings, component names/props, and structure.

### Playground island (UI strings) vs. engine (locale-agnostic) — the split
- **Engine is locale-agnostic and is NOT duplicated per locale.** `src/lib/<slug>/engine.ts`, its `engine.test.ts`, and the conformance corpus/examples module are pure logic + GitHub-vendor literals (operator semantics, function names, glob rules). They contain ZERO human UI prose, so there is exactly ONE copy shared by all 5 locales. Do not fork them.
- **The component island `<...Playground.astro>` is ALSO a single shared file** (it self-mounts on `astro:page-load` and is imported by all 5 locale pages). Its visible chrome — the two tab labels ("Expression Evaluator" / "Trigger Simulator"), button labels ("Evaluate", "Simulate", "Reset", "Load example", "Copy"), preset/example dropdown labels, result-table column headers ("Job", "Status", "Reason"), the RUNS/SKIPPED status words, and the literal-text-footgun WARNING banner copy — must be localized at runtime via the UI dictionary, NOT hardcoded. Pattern: the Astro frontmatter of the component computes `const lang = getLocaleFromUrl(Astro.url)` (from `../i18n/utils`), builds `const t = useTranslations(lang)`, and emits the localized strings either into the server-rendered shell OR into a `data-i18n-*` attribute / a small JSON `<script type="application/json">` blob that the boot `<script>` reads (the module script cannot call `useTranslations` at runtime, so strings must be handed to it from the server-rendered Astro side). Engine OUTPUT that is a vendor literal (the actual evaluated value, the deciding glob, function names) is rendered as-is through `escapeHtml` and never translated.
- **CodeMirror**: the island uses CM6 for the expression/YAML inputs; the keymap MUST include the Escape→blur binding to fix the Tab-trap (mirror `PromqlExplainerPlayground.astro` line 503: `{ key: 'Escape', run: function(view){ view.contentDOM.blur(); return true; } }`). This is locale-agnostic.

### Per-language translation/QA checklist (run for es, de, fr, pt-br)
1. Copy the en page to `src/pages/<locale>/<slug>.astro`; add one `../` to every relative import; add the `__l`/`__lang` block.
2. Translate ONLY prose; keep `canonical` neutral; keep all `<span translate="no">` terms and every `code={...}`/fenced block byte-identical.
3. Route every site-route `href` through `__l(..., __lang)`; leave `#anchors` and external URLs literal.
4. Translate `title`/`description`/`featureList`; localize `keywords` to native search intent (same length).
5. Apply locale conventions from GLOSSARY: **es** neutral Spanish with ¿/¡; **de** formal "Sie", „…" quotes; **fr** vouvoiement, « … » with NBSP; **pt-br** "você", "arquivo"/"tela", Brazilian loanwords.
6. Add the new UiKeys to `src/i18n/ui/<locale>.ts` (see uiKeys list) — each locale dict is `Partial<UiDict>` and `satisfies` the en union, so a typo'd key is a compile error; a missing key silently falls back to English (so partial is safe but incomplete).
7. Blog: copy `src/content/blog/en/<post>.md` → `src/content/blog/<locale>/<post>.md`, set `lang: <locale>` and `translationOf: "<en-slug>"` (mirror `de/github-actions-security-misconfigurations.md` lines 6-7), translate body prose, keep all fenced code + vendor terms identical, keep `relatedTool.href` as the neutral en page key.
8. Run `node scripts/i18n-check.mjs --locale=<locale>` → must print `✓` for both pages and blog. Run `npx astro check` / build to catch broken imports or UiDict type errors. Spot-check the rendered locale page: tab labels, warning banner, and result table are in-language; all `${{ }}`/YAML/glob examples and function names are untranslated; canonical resolves to the localized URL while pointing at the neutral key.

## File Matrix

| Path | Purpose |
|---|---|
| `C:/Users/PUSHKAR/Desktop/my-project/src/lib/github-actions-expression-tester/engine.ts` | LOCALE-AGNOSTIC. Pure TS, no DOM, never throws (returns {error}\|null). Two engines: (1) expression evaluator replicating GitHub ${{ }} semantics (operators, case-insensitive string ==, JS-like coercion, && / \|\| return operands, all documented functions, success()/failure()/always()/cancelled()), incl. the literal-text-outside-${{ }}-in-if footgun detector (actions/runner#1173); (2) trigger simulator with a faithful glob engine (*, **, +, ?, !, escaping) and on:/branches/tags/paths AND-semantics. ONE shared copy for all 5 locales. |
| `C:/Users/PUSHKAR/Desktop/my-project/src/lib/github-actions-expression-tester/engine.test.ts` | LOCALE-AGNOSTIC. Vitest (node env) tests against the versioned conformance corpus — the FIDELITY moat. Covers operator/coercion edge cases, function outputs, the if-footgun warning, and glob + branch/path AND-semantics. One shared copy. |
| `C:/Users/PUSHKAR/Desktop/my-project/src/lib/github-actions-expression-tester/examples.ts` | LOCALE-AGNOSTIC. Conformance corpus + preset examples (mock contexts, sample expressions, sample events/changed-file lists) lazily dynamic-imported by the island. Vendor literals only, no UI prose, no translation. |
| `C:/Users/PUSHKAR/Desktop/my-project/src/components/GhaExpressionPlayground.astro` | SHARED single island (imported by all 5 locale pages). Server-rendered two-tab shell + ONE module <script> that boots on astro:page-load and lazily imports engine + examples. UI chrome strings (tab/button/preset labels, result-table headers, RUNS/SKIPPED, the if-footgun WARNING banner) are localized via useTranslations(getLocaleFromUrl(Astro.url)) on the Astro side and handed to the boot script (data-* / JSON blob). CM6 inputs include the Escape->blur keymap binding. Engine output rendered via escapeHtml, untranslated. |
| `C:/Users/PUSHKAR/Desktop/my-project/src/pages/github-actions-expression-tester.astro` | English tool page. Mirrors src/pages/github-actions-validator.astro structure: Shell(title/description/canonical=/github-actions-expression-tester/jsonLd=[softwareApp,faqPage]) -> ToolHero -> #playground(<GhaExpressionPlayground/>) -> #why -> ToolPipeline -> #reference (Expression/Trigger CHEAT-SHEET + examples) -> Static-analysis/scope note -> FaqList -> ToolCrossLinks. faqs[] single source feeds FaqList + faqPageLd. |
| `C:/Users/PUSHKAR/Desktop/my-project/src/pages/es/github-actions-expression-tester.astro` | Spanish copy of the en page. Imports +1 ../; canonical stays neutral; internal links via __l(...,__lang); all prose translated (neutral Spanish, ¿/¡); vendor terms + code blocks untranslated; keywords localized. Mandatory for i18n-check. |
| `C:/Users/PUSHKAR/Desktop/my-project/src/pages/de/github-actions-expression-tester.astro` | German copy. Formal Sie, „…" quotes. Imports +1 ../; neutral canonical; __l links; prose translated; code/vendor terms intact. Mandatory for i18n-check. |
| `C:/Users/PUSHKAR/Desktop/my-project/src/pages/fr/github-actions-expression-tester.astro` | French copy. Vouvoiement, « … » with NBSP. Imports +1 ../; neutral canonical; __l links; prose translated; code/vendor terms intact. Mandatory for i18n-check. |
| `C:/Users/PUSHKAR/Desktop/my-project/src/pages/pt-br/github-actions-expression-tester.astro` | Brazilian Portuguese copy. 'você', 'arquivo', 'tela'. Imports +1 ../; neutral canonical; __l links; prose translated; code/vendor terms intact. Mandatory for i18n-check. |
| `C:/Users/PUSHKAR/Desktop/my-project/src/content/blog/en/github-actions-if-expression-gotchas.md` | NEW English blog #1 (the headline 'always-truthy if:' footgun, runner#1173, with BAD/FIXED ${{ }} blocks; relatedTool -> {name:'GitHub Actions Expression Tester', href:'/github-actions-expression-tester'}). Adding it makes 4 translations mandatory. Voice mirrors en/github-actions-security-misconfigurations.md. |
| `C:/Users/PUSHKAR/Desktop/my-project/src/content/blog/en/github-actions-trigger-filters-explained.md` | NEW English blog #2 (how on:/branches/tags/paths/paths-ignore + glob actually decide RUNS vs SKIPPED, the branch+path AND-semantics; relatedTool -> same tool). Makes 4 more translations mandatory. |
| `C:/Users/PUSHKAR/Desktop/my-project/src/content/blog/es/github-actions-if-expression-gotchas.md` | Spanish translation of blog #1. Frontmatter lang: es, translationOf: 'github-actions-if-expression-gotchas'. Body prose translated; fenced code + vendor terms identical; relatedTool.href stays neutral. |
| `C:/Users/PUSHKAR/Desktop/my-project/src/content/blog/de/github-actions-if-expression-gotchas.md` | German translation of blog #1 (lang: de, translationOf: 'github-actions-if-expression-gotchas'). |
| `C:/Users/PUSHKAR/Desktop/my-project/src/content/blog/fr/github-actions-if-expression-gotchas.md` | French translation of blog #1 (lang: fr, translationOf: 'github-actions-if-expression-gotchas'). |
| `C:/Users/PUSHKAR/Desktop/my-project/src/content/blog/pt-br/github-actions-if-expression-gotchas.md` | Brazilian Portuguese translation of blog #1 (lang: pt-br, translationOf: 'github-actions-if-expression-gotchas'). |
| `C:/Users/PUSHKAR/Desktop/my-project/src/content/blog/es/github-actions-trigger-filters-explained.md` | Spanish translation of blog #2 (lang: es, translationOf: 'github-actions-trigger-filters-explained'). |
| `C:/Users/PUSHKAR/Desktop/my-project/src/content/blog/de/github-actions-trigger-filters-explained.md` | German translation of blog #2 (lang: de, translationOf: 'github-actions-trigger-filters-explained'). |
| `C:/Users/PUSHKAR/Desktop/my-project/src/content/blog/fr/github-actions-trigger-filters-explained.md` | French translation of blog #2 (lang: fr, translationOf: 'github-actions-trigger-filters-explained'). |
| `C:/Users/PUSHKAR/Desktop/my-project/src/content/blog/pt-br/github-actions-trigger-filters-explained.md` | Brazilian Portuguese translation of blog #2 (lang: pt-br, translationOf: 'github-actions-trigger-filters-explained'). |
| `C:/Users/PUSHKAR/Desktop/my-project/src/data/tools.ts` | REGISTRY EDIT (locale-agnostic). Add a Tool entry {slug:'github-actions-expression-tester', name:'GitHub Actions Expression Tester', tagline, description, status:'live' (set 'planned' first if scaffolding before launch), category:'CI/CD', keywords:[8], accent:'ship'}. CI/CD category + categoryAccent/categoryBlurb already exist, no new category needed. liveTools auto-drives homepage grid, /tools, and cross-links across all locales. |
| `C:/Users/PUSHKAR/Desktop/my-project/src/i18n/ui/en.ts` | Add the new playground UiKey entries to the en source (defines the UiKey union; all other dicts satisfy it). See uiKeys list. English values are the fallback for any locale that omits a key. |
| `C:/Users/PUSHKAR/Desktop/my-project/src/i18n/ui/es.ts` | Add Spanish values for the new playground UiKeys (Partial<UiDict>, satisfies en union). |
| `C:/Users/PUSHKAR/Desktop/my-project/src/i18n/ui/de.ts` | Add German values for the new playground UiKeys. |
| `C:/Users/PUSHKAR/Desktop/my-project/src/i18n/ui/fr.ts` | Add French values for the new playground UiKeys. |
| `C:/Users/PUSHKAR/Desktop/my-project/src/i18n/ui/pt-br.ts` | Add Brazilian Portuguese values for the new playground UiKeys. |

## New UI Dictionary Keys

- `gha-expr.tab.expression`
- `gha-expr.tab.trigger`
- `gha-expr.btn.evaluate`
- `gha-expr.btn.simulate`
- `gha-expr.btn.reset`
- `gha-expr.btn.loadExample`
- `gha-expr.btn.copy`
- `gha-expr.btn.copied`
- `gha-expr.label.expressionInput`
- `gha-expr.label.contextInput`
- `gha-expr.label.workflowInput`
- `gha-expr.label.eventInput`
- `gha-expr.label.preset`
- `gha-expr.label.result`
- `gha-expr.label.eventType`
- `gha-expr.label.refName`
- `gha-expr.label.changedFiles`
- `gha-expr.result.value`
- `gha-expr.result.type`
- `gha-expr.col.job`
- `gha-expr.col.status`
- `gha-expr.col.reason`
- `gha-expr.status.runs`
- `gha-expr.status.skipped`
- `gha-expr.warn.literalIfTitle`
- `gha-expr.warn.literalIfBody`
- `gha-expr.empty.expression`
- `gha-expr.empty.trigger`
- `gha-expr.error.invalidExpression`
- `gha-expr.error.invalidYaml`

## Do NOT translate (translate="no")

- `GitHub`
- `GitHub Actions`
- `GitHub, Inc.`
- `${{ }}`
- `${{ ... }}`
- `if:`
- `on:`
- `jobs:`
- `steps:`
- `uses:`
- `run:`
- `env:`
- `needs:`
- `matrix:`
- `branches`
- `branches-ignore`
- `tags`
- `tags-ignore`
- `paths`
- `paths-ignore`
- `runs-on`
- `permissions`
- `push`
- `pull_request`
- `pull_request_target`
- `workflow_dispatch`
- `github`
- `github.event`
- `github.ref`
- `github.head_ref`
- `steps.<id>.outputs`
- `GITHUB_TOKEN`
- `contains`
- `startsWith`
- `endsWith`
- `format`
- `join`
- `toJSON`
- `fromJSON`
- `hashFiles`
- `success()`
- `failure()`
- `always()`
- `cancelled()`
- `&&`
- `||`
- `==`
- `!=`
- `actions/runner#1173`
- `actions/checkout`
- `YAML`
- `CI/CD`
- `OpsCanopy`

## Rollout Plan

Ship English first, then translate — keep the CI gate (scripts/i18n-check.mjs) green at every commit boundary by landing each English file together with its 4 locale copies (never a lone en page/post, which would redden i18n-check for the whole repo).

Recommended order:
1. Locale-agnostic core FIRST (no i18n impact): engine.ts + engine.test.ts + examples.ts. Get vitest green against the conformance corpus — this is the fidelity moat and everything else depends on it.
2. Shared island GhaExpressionPlayground.astro, wired to useTranslations(getLocaleFromUrl(Astro.url)) with the new UiKeys, plus the CM6 Escape->blur binding. Add ALL new UiKeys to en.ts now (defines the union) and stub the same keys into es/de/fr/pt-br dicts — even English-for-now values are safe because t() falls back to English per-key, but adding the keys up front prevents a later 'satisfies' churn.
3. Registry: add the Tool entry to src/data/tools.ts. If you want to wire cross-links/homepage before the page copy exists, register status:'planned'; flip to 'live' only when the en page + all 4 locale pages exist (otherwise homepage links a 404 in non-en locales).
4. English page src/pages/github-actions-expression-tester.astro. At this exact moment i18n-check will start FAILING for all 4 locales (page missing) — this is expected; resolve it in the same PR/batch by adding the 4 locale page copies (es, de, fr, pt-br) per the mechanical contract (one extra ../ on imports, neutral canonical, __l-routed links, prose-only translation).
5. Translate the new UiKey values in es/de/fr/pt-br to real localized strings (replace any English placeholders from step 2).
6. English blog posts (#1 if-footgun, #2 trigger-filters). Each new en/*.md immediately makes 4 translations mandatory — add all 8 locale .md files (lang + translationOf set) in the same batch so blog coverage never goes red.
7. Verify: run `node scripts/i18n-check.mjs` (expect ✓ pages + ✓ blog for every locale, 'Coverage OK.'), then `npx astro check` and a full build to catch import-depth mistakes and UiDict type errors. Flip the tool to status:'live' if it was 'planned'.

Keeping i18n-check passing: treat "en + 4 locales" as one atomic change set for both pages and posts; run `node scripts/i18n-check.mjs --locale=<x>` while iterating on a single language; never merge an English-only page/post. UI-dict key gaps are warnings only (English fallback keeps the build green), so dictionaries can be filled incrementally without breaking CI — but the page and blog file copies are hard failures and must ship complete.

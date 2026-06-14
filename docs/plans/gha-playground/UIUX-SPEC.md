# UI/UX & Responsive Spec — GitHub Actions Expression & Trigger Playground — UI/UX & Responsive Spec for GhaPlaygroundPlayground.astro

# GitHub Actions Expression & Trigger Playground — UI/UX Spec

A best-in-class, two-tab, 100% client-side island. This spec is the contract for the Astro component `src/components/GhaPlaygroundPlayground.astro`. It mirrors the verified island pattern of `GhaValidatorPlayground.astro` (toolbar → dark CodeMirror surface → `bg-canvas-soft` results panel; one module `<script>` that boots on `astro:page-load`, lazily dynamic-imports `engine` + `examples`, renders with `escapeHtml`). Recommended slug: **`github-actions-expression-tester`** (keyword-bearing: "github actions expression tester / trigger simulator"); the component class root is `.gap` and the data-wired flag is `data-gapWired`.

---

## 0. Design language anchors (from DESIGN.md + global.css — do not deviate)

- **Surfaces ladder:** `bg-canvas` (white cards) → `bg-canvas-soft` (results panel) → `bg-canvas-soft-2` (inset chips) → `bg-inverse` (dark code editor mockup). Theme switches via `html[data-theme="dark"]` re-pointing tokens — **NEVER use `dark:` variants.**
- **Brand emerald** `--color-brand #10b981` (light) / `#34d399` (dark). Accent for this tool is `'ship'` (coral→amber gradient) — used only as the hero accent bar, never inside the playground chrome.
- **Semantic tokens only** for verdicts: `--color-success` (true / RUNS), `--color-error*` (false-by-footgun / errors), `--color-warning*` (the always-truthy footgun banner + SKIPPED-with-caveat), `--color-mute` (neutral / SKIPPED).
- **Elevation:** Level 1 inset hairline (`--shadow-hairline`) for rows; Level 2 (`--shadow-subtle`) on hover; Level 4 (`shadow-float`) on the outer `card`. Stacked shadows only — never a single heavy drop.
- **Radius:** `--radius-sm` 6px (controls), `--radius-md` 8px (rows/cards), `--radius-lg` 12px (outer card). **Pill 100px is reserved for marketing CTAs only** — in-app buttons use `btn btn-sm` (already pill-shaped via the design system; keep as-is to match siblings).
- **Type:** headlines sentence-case weight 600; technical labels in mono (`code-mono`, `caption`, `eyebrow`); body never mono.
- **Motion:** `gap-rise` 0.18s ease (opacity + 3px translateY); all keyframes wrapped in `@media (prefers-reduced-motion: reduce){ animation:none }`. Loading dots animate opacity only.
- **GOTCHAS (load-bearing):**
  - Runtime-injected SVGs need explicit `width`/`height` attrs AND `:global(...)` CSS (scoped hash won't reach `innerHTML` nodes). Every result-markup class is styled under `:global(...)`.
  - Show/hide driven by an **`--active` class, NOT the `hidden` attribute** (applies to tab panels too).
  - The engine never throws; the island still wraps calls in try/catch for defense.
  - CodeMirror keymap MUST include the Escape blur binding: `{ key:'Escape', run: v => { v.contentDOM.blur(); return true } }` (Tab-trap fix), placed in the keymap array exactly as the two existing islands do.

---

## 1. Component shell & tab switcher

### 1.1 Outer structure
```
<section class="gap" aria-label="GitHub Actions Expression & Trigger Playground">
  <div class="card shadow-float rounded-lg overflow-hidden">
    [A] Tab bar          role="tablist"
    [B] Tab panel 1      role="tabpanel"  (Expression Evaluator)  — default --active
    [C] Tab panel 2      role="tabpanel"  (Trigger Simulator)     — hidden via missing --active
  </div>
  <span id="gap-announce" class="sr-only" role="status" aria-live="polite"></span>
</section>
```
Both panels are **server-rendered into the DOM at build time** (SEO-safe, no layout shift on hydration). Inactive panel is visually hidden + `inert`/`tabindex=-1`, NOT removed.

### 1.2 Tab bar (roving tabindex + ARIA)
- Container: `<div class="gap-tabs" role="tablist" aria-label="Playground mode">`, a 2-up flex strip sitting on `bg-canvas-soft` with a bottom hairline.
- Each tab is a real `<button role="tab">`:
  - `id="gap-tab-expr"` / `aria-controls="gap-panel-expr"` / `aria-selected="true"` / `tabindex="0"` (active)
  - `id="gap-tab-trig"` / `aria-controls="gap-panel-trig"` / `aria-selected="false"` / `tabindex="-1"` (inactive)
  - Label: an inline 16px SVG glyph + text. Expression tab glyph = `${{ }}` braces mark; Trigger tab glyph = a branching/flow node mark. Each SVG has explicit `width="16" height="16"`.
- **Active styling** via `.gap-tab[aria-selected="true"]`: ink text, weight 500, a 2px brand underline bar (`box-shadow: inset 0 -2px 0 var(--color-brand)`); inactive = `text-mute`, hover → `text-body` + faint `bg-canvas-hover`.
- **Roving tabindex / keyboard model** (WAI-ARIA tabs, automatic activation):
  - `ArrowLeft`/`ArrowRight` (and `ArrowUp`/`ArrowDown`) move selection between tabs, wrapping; `Home`/`End` jump to first/last.
  - On move: set `aria-selected`, swap `tabindex` (0 active / -1 others), call `.focus()` on the new tab, and activate its panel.
  - `Enter`/`Space` are no-ops beyond default activation (selection follows focus).
  - Clicking a tab activates it and focuses it.
- **Panel activation** = toggle the `--active` class on the target `.gap-panel` and remove it from the sibling; set `inert` + `tabindex=-1` (and `hidden`-less display:none via `.gap-panel:not(.--active){display:none}`) on the deactivated panel. Each panel: `role="tabpanel"`, `aria-labelledby` its tab, `tabindex="0"` only when active.
- **State persistence:** active tab index is part of the shareable hash (`t=0|1`, see §6) so a shared link opens on the right tab. No localStorage (privacy/static).
- Tap target: each tab is min 44px tall (`min-height:44px`) and ≥80px wide.

---

## 2. TAB 1 — Expression Evaluator

### 2.1 Layout (desktop two-column; mobile single column)
```
[ Toolbar: Examples ▾ | event preset chips (push/PR/tag) | Copy | Share | Evaluate ⌘⏎ ]
┌───────────────────────────── desktop ≥1024px: 2 cols (7fr / 5fr) ─────────────────────────────┐
│  LEFT  (primary)                              │  RIGHT (context)                                │
│  ── Expression editor (dark CM6) ──           │  ── Mock context panels (accordion of JSON) ──  │
│  label tab: "if-condition or ${{ … }}"        │  github ▸  env ▸  matrix ▸  steps ▸  needs ▸     │
│  [ CodeMirror, lang: plain/expr, min-h-32 ]   │  each = collapsible <details> with a small CM   │
│  Esc-to-release tip                           │  JSON editor + a green/red validity dot         │
│  ── Always-truthy WARNING banner (cond.) ──   │                                                 │
│  ── Verdict block (big true/false) ──         │                                                 │
│  ── Token → meaning breakdown ──              │                                                 │
└───────────────────────────────────────────────────────────────────────────────────────────────┘
```
On mobile (<1024px) the RIGHT context column stacks **below** the verdict (collapsed by default to keep the editor + verdict above the fold).

### 2.2 Expression input editor
- Dark `bg-inverse` mockup pane with the 3-dot chrome row + mono filename label `if-condition`.
- CodeMirror 6 single editor, `min-h-32`, `lineWrapping`, line numbers, history, oneDark theme, the shared `baseTheme`, and the Escape-blur keymap. Language: a light highlighting (use `@codemirror/lang-javascript` for `${{ }}` interiors gives free operator/string coloring, OR plain). The editor accepts EITHER a raw expression OR a full `if:` line; the engine decides (see warning, §2.4).
- A small segmented toggle above the editor: **"Expression"** vs **"`if:` condition"** — purely a hint that flips a header label and tells the engine whether to apply the bare-string footgun check (an `if:` with literal text outside `${{ }}` is the footgun; a pure expression field is not). Default = `if:` condition (that's where the footgun bites).
- Esc tip line beneath: `Tip: press Esc to release keyboard focus from the editor.` (`<kbd>` styled as siblings do).

### 2.3 Mock-context panels (github / env / matrix / steps / needs)
- Rendered as a vertical stack of **`<details class="gap-ctx">`** accordions (native, no JS needed to open/close; SEO + a11y for free). `<summary>` shows the context name in mono + a validity dot + a caret SVG (explicit size).
- Each open panel hosts a **compact CodeMirror JSON editor** (`@codemirror/lang-json`, `min-h-24`, max-h 200px scroll) seeded with realistic JSON, plus inline JSON-validity feedback: a green dot + "valid" when parseable, a red dot + the parse message (truncated) when not. Invalid JSON in any panel disables Evaluate and shows a context-error toast in the verdict region rather than throwing.
- **Presets** (the push/PR/tag chips in the toolbar) rewrite ALL five context editors at once to a coherent scenario:
  - `push` → `github.event_name='push'`, `github.ref='refs/heads/main'`, `github.ref_type='branch'`, sample `steps`/`needs` successes.
  - `pull_request` → `event_name='pull_request'`, `base_ref`/`head_ref` set, `github.event.pull_request.draft=false`, a label array.
  - `tag` → `event_name='push'`, `ref='refs/tags/v1.2.3'`, `ref_type='tag'`.
  Selecting a preset re-seeds context, clears the verdict to empty, and announces "Loaded push preset." via the aria-live region.
- "Reset context" ghost link under the stack restores the active preset's defaults.
- Mobile: the whole context stack is itself wrapped in one outer `<details>` ("Mock context ▸") collapsed by default; desktop shows it expanded inline.

### 2.4 Always-truthy WARNING banner (the headline feature)
- When the engine flags `alwaysTruthy: true` (literal non-`${{}}` text in an `if:`, per actions/runner#1173), render a **prominent warning banner ABOVE the verdict**, full width, `--color-warning-soft` bg + `inset 0 0 0 1px var(--color-warning)` ring + warning-deep text, warning-triangle icon (explicit 18px).
  - Title: "This `if:` is **always true**." Body: plain-English explanation that any text outside `${{ }}` is treated as a literal string, which is truthy, so the step/job will **always run** regardless of the apparent condition. Show the offending literal substring as an inline `<code>` chip.
  - A "Fix" sub-block (mirrors `gha-fix` styling) showing the corrected form: wrap the whole condition in `${{ … }}`. Render the BAD vs FIXED as two mono lines.
  - `role="alert"` so it's announced immediately. This banner is sticky-relevant: it persists with the verdict until the next Evaluate.
- This is the moat moment — give it the most visual weight on the tab (more than the verdict color when present).

### 2.5 Verdict block
- A large result card on `bg-canvas`, Level 1 shadow. Two-part:
  - **Boolean verdict**: a big pill/badge — `true` (success token: brand/green ring + check glyph) or `false` (mute/neutral ring + dash glyph; NOT red — false is a valid answer, red is reserved for errors). Font: `display-sm` weight 600 for the word.
  - **Returned value & type**: GitHub's `&&`/`||` return operands (not booleans), so always show the **raw returned value** and its **type** (`string` / `number` / `boolean` / `null` / `array` / `object`) in a mono sub-row, e.g. verdict `true` · returns `"production"` · type `string`. Use a `gap-typechip` (canvas-soft-2 pill).
- `aria-live="polite"` region; the verdict text is also written to the polite announcer.

### 2.6 Token → meaning breakdown
- Reuse the PromQL `pq-breakdown` pattern: an `<ul>` of `token → meaning` rows (`:global(.gap-part)`), each row = a mono token chip (≤42% width) + a plain-English meaning. Engine returns `breakdown: {token, meaning}[]`.
- Surfaces GitHub-specific semantics teaching: e.g. `==` → "case-insensitive string compare", `&&` → "returns the right operand if left is truthy, else the left", `contains(a,b)` → "substring/array membership", coercion notes ("`'' ` is falsy", "string coerced to number for `<`"). This is the fidelity payoff and the SEO body.
- Hover raises to Level 2; rows animate in with `gap-rise` (reduced-motion safe).

---

## 3. TAB 2 — Trigger Simulator

### 3.1 Layout
```
[ Toolbar: Examples ▾ | Copy | Share | Simulate ⌘⏎ ]
┌──────────────────── desktop ≥1024px: 2 cols (6fr / 6fr) ────────────────────┐
│  LEFT: Workflow YAML editor (dark CM6, yaml)  │  RIGHT: Event scenario builder │
│  filename: .github/workflows/ci.yml           │  (form card)                   │
│                                               │   • Event type   <select>      │
│                                               │   • Ref / branch <input>       │
│                                               │   • Tag (if tag) <input>       │
│                                               │   • Changed files <textarea>   │
│                                               │   • Custom vars  <textarea>    │
└─────────────────────────────────────────────────────────────────────────────┘
        ── Per-job RUNS / SKIPPED results table (full width, below both cols) ──
```
Mobile: YAML editor → scenario builder → results table, all stacked full-width.

### 3.2 Workflow YAML editor
- Identical to the validator's dark pane: `@codemirror/lang-yaml`, `min-h-80`, oneDark, Escape-blur keymap, internal scroll (`max-height:520px`), thin themed scrollbars, 3-dot chrome + `.github/workflows/ci.yml` filename, "Runs entirely in your browser — nothing is uploaded." note, and the Esc tip.

### 3.3 Event-scenario builder (form card)
On `bg-canvas`, Level 1 shadow, `rounded-md`, padded. Native form controls styled to `form-input-sm` scale (height 32–40px, `--radius-sm`, hairline ring). Each control has a visible `<label>` (mono `eyebrow`).
- **Event type** `<select>`: `push`, `pull_request`, `pull_request_target`, tag push, `workflow_dispatch`, `schedule`, … (drives which fields show). Styled like the existing `.gha-select` (custom caret SVG, appearance:none).
- **Ref / branch** text input: e.g. `main`, `feature/login`. Helper caption shows the computed full ref (`refs/heads/feature/login`).
- **Tag** input (revealed via `--active` only when event = tag push): e.g. `v1.2.3` → `refs/tags/v1.2.3`.
- **Changed files** `<textarea class="gap-files">`: one path per line; monospace; placeholder shows examples (`src/app.ts`, `docs/readme.md`). A live count caption ("4 files").
- **Custom vars** `<textarea>` (optional): `KEY=value` per line for any extra context the glob/filter eval may read; collapsed in a `<details>` by default.
- All inputs ≥44px tap height on touch (inflate via padding at <640px).

### 3.4 Per-job RUNS / SKIPPED results table
- Full-width card on `bg-canvas-soft`; header `eyebrow` "Result" + a mono summary (`2 run · 1 skipped`, tabular-nums).
- A real semantic **`<table>`** (a11y + responsive) with `role`-clean markup:
  | Job | Decision | Deciding rule |
  |---|---|---|
  | `build` | **RUNS** (green pill + check) | `on.push.branches: [main]` matched `refs/heads/main` |
  | `deploy` | **SKIPPED** (mute pill + dash) | `paths: ['src/**']` did not match any changed file |
- **Decision pill** uses semantic tokens: RUNS = success-soft bg / success-deep text + check glyph; SKIPPED = canvas-soft-2 bg / mute text + dash glyph. A third state, **SKIPPED (filter conflict)** = warning-soft, used for the AND-semantics gotcha (both branch and path filters present and one fails).
- **Deciding-rule cell** is the fidelity payoff: it names the exact `on:` key (`branches` / `branches-ignore` / `tags` / `tags-ignore` / `paths` / `paths-ignore`) and the matched/unmatched glob, with the literal pattern shown as a `<code>` chip. When BOTH a branch filter AND a path filter are configured, render a small note row clarifying the **AND semantics** ("branch AND path must both match"), since that is the #2 footgun.
- Expandable row detail (`<details>` inside the rule cell on desktop; full-row tap on mobile) shows the full filter evaluation trace: each pattern tested, matched/skipped, with `!` negation and `**` handling annotated.
- **Empty / pre-run state**: a centered `gap-empty` frame: "Describe an event and simulate to see which jobs run."

### 3.5 Glob-engine transparency
A collapsed `<details>` "How globs are matched" below the table summarizes the faithful glob rules (`*`, `**`, `+`, `?`, `!`, escaping, `**` crossing `/`) so users trust the verdict — and it doubles as on-page SEO content. (The actual matching lives in the engine; this is explanatory copy only.)

---

## 4. Mobile / responsive behavior (mobile-first → desktop)

| Area | <640px (mobile) | 640–1023px (tablet) | ≥1024px (desktop) |
|---|---|---|---|
| Tab bar | 2 full-width tabs, 44px tall, text + glyph | same | same, left-aligned |
| Toolbar | wraps to 2 rows; example select full-width; action buttons in a wrap row, icon+label | select fixed-width, single row | single row, space-between |
| Tab 1 cols | single column; context stack collapsed in one outer `<details>` below verdict | single column, context expanded | 2-col 7/5, context inline-right |
| Tab 1 context editors | each `<details>` collapsed; opening reveals a `max-h-44 → 200px` mini CM | first (github) open by default | all relevant open |
| Tab 2 cols | stacked: YAML → builder → table | stacked | 2-col 6/6, table full-width below |
| Results table | **horizontal scroll** wrapper (`overflow-x:auto`) OR card-per-job stacked layout (preferred): each job becomes a stacked card with Job/Decision/Rule as labeled rows; deciding-rule wraps | table with horizontal scroll | full table |
| Verdict | full-width, big | full-width | sits left column |
| Tap targets | every button/select/tab ≥44×44; `touch-action:manipulation` | same | same |
| Esc tip | shown under each editor; `⌘/Ctrl+Enter` caption hidden <640px (shown sm:inline-flex) | shown | shown |

- **Results table mobile choice:** prefer the **stacked-card** reflow over horizontal scroll for the per-job table (3 columns of unequal length scroll poorly). Use `@media (max-width:640px)` to set the table rows to `display:block` cards with `::before` labels from `data-label`, OR render a parallel card list — implement via CSS only on the same `<table>` markup so it stays semantic.
- The deciding-rule `<code>` chips use `word-break:break-word` + `text-wrap:pretty` so long globs never overflow.

---

## 5. Shared affordances

- **Examples picker** (`.gap-select`, per tab): styled exactly like `.gha-select` (appearance:none, custom caret SVG with explicit size, 32px tall, max-w 280px mobile / min 220px desktop). Tab 1 examples = curated expression scenarios (matrix dereference, `contains(github.event.head_commit.message,'[skip ci]')`, the always-truthy footgun, `success() && needs.build.result=='success'`). Tab 2 examples = workflow+event pairs.
- **Run shortcut:** `⌘/Ctrl + Enter` anywhere in the active panel triggers Evaluate/Simulate (root `keydown`, `preventDefault`). Buttons carry `aria-keyshortcuts="Meta+Enter Control+Enter"` + a `caption` hint (`hidden sm:inline-flex`).
- **Copy buttons:** Tab 1 copies the expression; Tab 2 copies the YAML. Reuse the validator's `copyText` (Clipboard API + textarea fallback), the label-swap to "Copied" for 1800ms, and the polite announcer.
- **Share link (client-side only):** state encoded into a compressed hash fragment, namespaced. Reuse the validator's UTF-8-safe base64url codec but extend to a small JSON payload `{ t, expr|yaml, ctx, scenario, mode }` → `JSON.stringify` → (optionally `CompressionStream('deflate-raw')` when available, else raw) → base64url → `#gap=<payload>` plus `&t=<tab>`. Decoding seeds the correct tab + all editors. Tooltip on Share: "This link encodes your workflow/expression and mock data — it stays in your browser; review before sharing." `history.replaceState` (no history spam). Never hits the network.
- **States (every result region):**
  - *Empty:* centered `gap-empty` frame with guidance copy.
  - *Loading:* three-dot `gap-loading` (opacity pulse) + "Evaluating…/Simulating…"; button gets `is-busy` + runtime-injected spinner (inline `cssText`, `.animate()` skipped under reduced-motion — copy the validator approach since the spinner is a runtime node outside the scoped hash).
  - *Error:* `gap-error` banner (`role="alert"`, error-soft bg + error ring) for engine/parse failures and for invalid context/YAML.
  - *Result:* verdict/table with `gap-rise` entrance.
- **aria-live:** each result container is `aria-live="polite" aria-atomic="false"`; the summary span is `role="status" aria-live="polite"`; a dedicated `#gap-announce` `sr-only` `role="status"` handles clipboard/preset/tab toasts. The always-truthy banner and hard errors use `role="alert"` (assertive).
- **prefers-reduced-motion:** all `@keyframes` (`gap-rise`, `gap-pulse`) gated off; loading dots drop to static 0.6 opacity; the runtime spinner skips `.animate()`.
- **Instant feel:** editors + examples + engine are lazily dynamic-imported (kept off the initial path); shells render server-side so there is zero CLS; an optional debounced auto-evaluate (250–400ms after typing settles, behind a "live" default-on toggle) makes it feel real-time, with the explicit Evaluate button always available. Yield a frame (`requestAnimationFrame`) before heavy work so the loading state paints (copy the validator pattern).

---

## 6. Boot / hydration script structure (single module `<script>`)

Mirror both existing islands exactly:

```ts
import { EditorState } from '@codemirror/state';
import { EditorView, keymap, lineNumbers, highlightActiveLine } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { yaml } from '@codemirror/lang-yaml';          // Tab 2 workflow
import { json } from '@codemirror/lang-json';          // Tab 1 context panels
import { javascript } from '@codemirror/lang-javascript'; // optional: ${{ }} highlighting
import { oneDark } from '@codemirror/theme-one-dark';
import { escapeHtml } from '../lib/escape-html';

const ROOT_SEL = '.gap';
const SHARE_KEY = 'gap';

function boot() {
  document.querySelectorAll<HTMLElement>(ROOT_SEL).forEach((root) => {
    if (root.dataset.gapWired === 'true') return;
    root.dataset.gapWired = 'true';
    void init(root);
  });
}

async function init(root: HTMLElement) {
  // 1. Query all elements (tabs, panels, editors, selects, buttons, result boxes, summaries, announcer).
  // 2. Lazy import the engine + examples (Promise.all), guarded by try/catch → renderError on failure:
  //      import('../lib/github-actions-expression-tester/engine')      // evaluateExpression(), simulateTrigger()
  //      import('../lib/github-actions-expression-tester/examples')    // { expressionExamples, triggerExamples }
  // 3. Build the dark CM6 editors (shared makeEditor factory + per-lang variant) with the Escape-blur keymap.
  // 4. Build mini JSON CM editors for the 5 context panels.
  // 5. Wire: tab switcher (roving tabindex + --active + inert), example pickers, preset chips,
  //    Evaluate/Simulate (non-blocking: is-busy + loading + rAF yield + try/catch),
  //    Copy, Share (encode/decode hash incl. tab index), optional debounced live-eval.
  // 6. Decode share hash → seed correct tab + all editors/scenario; else seed example[0].
  // 7. Render initial empty states; if seeded from share or default example, auto-run the active tab.
}

boot();
document.addEventListener('astro:page-load', boot);
```

**Engine contract this UI assumes** (built by sibling agents; structurally mirrored, not imported as types):
```ts
// Tab 1
evaluateExpression(input: {
  expr: string; mode: 'if' | 'expression';
  context: { github?: unknown; env?: unknown; matrix?: unknown; steps?: unknown; needs?: unknown };
}) => {
  error?: string;
  value: unknown;            // raw returned value (&&/|| return operands)
  type: 'string'|'number'|'boolean'|'null'|'array'|'object';
  truthy: boolean;           // GitHub-coerced boolean verdict
  alwaysTruthy?: boolean;    // the if: literal-text footgun
  literal?: string;          // the offending bare substring (for the banner chip)
  breakdown?: { token: string; meaning: string }[];
}

// Tab 2
simulateTrigger(input: {
  yaml: string;
  event: { name: string; ref?: string; tag?: string; changedFiles: string[]; vars?: Record<string,string> };
}) => {
  error?: string;
  jobs: { name: string; decision: 'runs'|'skipped'|'conflict'; rule: string; pattern?: string; trace?: {pattern:string; matched:boolean; key:string}[] }[];
  summary: { runs: number; skipped: number };
}
```

**Rendering helpers** (all use `escapeHtml`; all result CSS under `:global(...)`; all icons are inline SVG strings with explicit `width`/`height`): `renderEmpty`, `renderLoading`, `renderError`, `renderVerdict` (Tab 1: warning banner → verdict → type chip → breakdown list), `renderJobsTable` (Tab 2). Severity/decision icon string constants mirror the validator's `ICON_*` approach.

---

## 7. Acceptance checklist (UX/a11y)
- Tabs: full WAI-ARIA tabs pattern (roving tabindex, arrows/Home/End, `aria-selected`/`aria-controls`); panels toggle via `--active`, never `hidden`; inactive panel `inert`.
- Both panels server-rendered (no CLS); engine/examples lazy-loaded; results paint a loading state before heavy work.
- Always-truthy banner is the most prominent element when present, `role="alert"`, with a concrete BAD→FIXED fix block.
- Verdict shows boolean + raw returned value + type (honors `&&`/`||` operand return).
- Per-job table is a semantic `<table>`, reflows to stacked labeled cards <640px, with the deciding `on:` rule + glob chip and AND-semantics note.
- Every interactive target ≥44×44 on touch; `touch-action:manipulation`; Esc-to-release tip under every CodeMirror; `⌘/Ctrl+Enter` to run.
- Copy + Share work fully offline; Share encodes tab + state into a base64url (optionally deflate) hash via `history.replaceState`; nothing leaves the browser.
- `prefers-reduced-motion` disables all entrance/pulse/spin animation.
- Light & dark themes both correct via token re-pointing (no `dark:` variants); dark code surface = `bg-inverse`.
- Vendor marks (GitHub, `${{ }}`, function/YAML key names) wrapped `<span translate="no">` in surrounding page copy.

## Files

| Path | Purpose |
|---|---|
| `C:/Users/PUSHKAR/Desktop/my-project/src/components/GhaPlaygroundPlayground.astro` | NEW — the two-tab interactive island this spec defines. Server-rendered shell (tablist + 2 tabpanels) + scoped <style> (all result markup under :global) + single module <script> that boots on astro:page-load, builds the CM6 editors (yaml + json + expr) with the Escape-blur keymap, lazily imports engine+examples, and wires the tab switcher, presets, Evaluate/Simulate, Copy, Share. Class root '.gap'. |
| `C:/Users/PUSHKAR/Desktop/my-project/src/components/GhaValidatorPlayground.astro` | REFERENCE (read, do not edit) — the canonical island this component clones for toolbar/editor/results structure, dark CM6 setup, copy+share codec, busy-spinner-as-runtime-node, loading/empty/error render helpers, and aria-live wiring. |
| `C:/Users/PUSHKAR/Desktop/my-project/src/components/PromqlExplainerPlayground.astro` | REFERENCE (read, do not edit) — source of the token→meaning breakdown list pattern (pq-breakdown / pq-part) reused for Tab 1's expression breakdown, plus the Esc-blur keymap, baseTheme, and empty/loading CSS patterns. |
| `C:/Users/PUSHKAR/Desktop/my-project/src/lib/github-actions-expression-tester/engine.ts` | NEW (sibling agent) — pure TS engine: evaluateExpression() (GitHub expression semantics + always-truthy detection) and simulateTrigger() (glob/filter engine + per-job decision). Never throws; returns {error} or null. UI imports it lazily by this path. |
| `C:/Users/PUSHKAR/Desktop/my-project/src/lib/github-actions-expression-tester/examples.ts` | NEW (sibling agent) — exports expressionExamples[] and triggerExamples[] consumed by the two example pickers; UI normalizes defensively as the existing islands do. |
| `C:/Users/PUSHKAR/Desktop/my-project/src/lib/escape-html.ts` | REFERENCE — escapeHtml used for ALL runtime-injected result markup (XSS-safe rendering of user expression/YAML/context). |
| `C:/Users/PUSHKAR/Desktop/my-project/src/styles/global.css` | REFERENCE — @theme tokens (colors, radius, shadow) the component's :global CSS must reference; defines light + dark via html[data-theme] re-pointing. No new tokens needed. |
| `C:/Users/PUSHKAR/Desktop/my-project/DESIGN.md` | REFERENCE — elevation ladder, radius scale, surface ladder, type rules, and the do/don'ts the playground chrome adheres to (pill reserved for marketing CTAs; mono for technical labels; sentence-case headlines). |

## Risks

- Always-truthy footgun fidelity depends on the engine flag (alwaysTruthy/literal). If the UI tries to detect the footgun itself it will diverge from the conformance corpus — the banner MUST render purely from engine output. UI risk: showing the banner for a pure 'expression' mode field (no if:) would be wrong; gate it on mode==='if'.
- Operand-returning operators: showing only a boolean verdict would be a fidelity bug (GitHub's && / || return operands). The verdict block MUST always show raw value + type alongside the boolean, or users won't trust it.
- Five embedded JSON CodeMirror editors + 1–2 large editors per tab can be heavy on low-end mobile. Mitigate by lazy-mounting context CM editors only when their <details> opens (build the EditorView on first 'toggle'/open), not all five eagerly.
- Runtime-injected SVGs and result rows will lose Astro's scoped-style hash. Every result/table/banner class MUST be authored under :global(...) with explicit width/height on SVGs, or styling silently drops (verified gotcha from both sibling islands).
- Tab panels hidden with display:none can break CodeMirror layout measurement (editors created while their panel is display:none may render 0-height). Mitigate: create each tab's editors on first activation, or call view.requestMeasure() on tab show.
- Share-link payload can get large (full YAML + 5 context blobs). Without compression the hash may exceed comfortable URL limits. Use CompressionStream('deflate-raw') when available (feature-detect) and fall back to raw base64url; keep it 100% client-side (no shortener).
- Results table responsive reflow: a 3-col table with long glob/rule text scrolls poorly on mobile. The CSS stacked-card reflow (display:block + data-label ::before) must be tested with very long deciding-rule strings to avoid overflow; word-break/text-wrap on code chips is required.
- Auto/live-evaluate debounce could fire heavy work on every keystroke. Must debounce (250–400ms) AND keep it cancelable/guarded by the existing 'running' lock to avoid overlapping evaluations and jank.
- i18n: the locale page copies must wrap all vendor marks (GitHub, ${{ }}, function names, YAML keys, glob tokens) in <span translate="no"> and route internal links through localizeKey; the playground island itself ships English UI strings — confirm whether result-string labels (RUNS/SKIPPED/true/false) need UI-dictionary keys per locale or stay as untranslated technical tokens.
- Keyboard focus management on tab switch: focusing the newly activated tab is correct, but if a user activates via Cmd+Enter from inside an editor in panel 1 then switches tabs, ensure the run handler targets the ACTIVE panel only (scope keydown to the active panel, not the whole root, to avoid evaluating the hidden tab).

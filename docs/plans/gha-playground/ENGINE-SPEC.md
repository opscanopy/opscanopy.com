# Engine Spec — Engine architecture: GitHub Actions Expression & Trigger Playground (slug: github-actions-expression-tester)

# Engine Architecture — `src/lib/github-actions-expression-tester/`

This document specifies the pure-TypeScript engine(s) for the two-tab tool. It is codebase-accurate: it matches the verified conventions in `src/lib/gha-validator/engine.ts`, `src/lib/promql-explainer/engine.ts`, and `src/lib/cron-tester/` (boxed banner header comment, `isRecord` helpers, the `declare module 'js-yaml'` shim with no `@types`, deterministic + never-throwing public entry points, `engine.test.ts` next to the engine, `examples.ts` shape with `{id,label,...}`, and reuse of `src/lib/escape-html.ts` from the island, NOT the engine).

**Slug justification.** Keep `github-actions-expression-tester` — it is the highest-volume keyword head ("github actions expression tester / evaluator / if condition tester"), it is short, and it cleanly subsumes Tab 2 (the trigger simulator is cross-linked under the same page). Category `CI/CD` (accent `ship`) already exists in `src/data/tools.ts`.

---

## 0. Module layout

```
src/lib/github-actions-expression-tester/
  types.ts        public result/IO shapes (no logic) — mirrors gha-validator/types.ts doc voice
  expr-lexer.ts   expression tokenizer (${{ }} body → Token[])
  expr-parser.ts  Pratt / precedence-climbing parser → Expr AST (never throws; returns {ast,error})
  expr-eval.ts    evaluator: AST + Context → GhaValue, implementing GitHub's EXACT coercion table
  functions.ts    the documented function library (contains/startsWith/.../toJSON/fromJSON/hashFiles/status fns)
  context.ts      default mock Context (github/env/job/steps/runner/needs/matrix/strategy/inputs/vars/secrets) + validation/merge of user-edited context
  if-footgun.ts   actions/runner#1173 "literal text in if: is always truthy" detector
  glob.ts         faithful filter-pattern glob engine (*, **, +, ?, !, escaping) for branches/tags/paths
  triggers.ts     parses on:, evaluates an event against branches/tags/paths(+ignore), AND-semantics, per-job decision model
  engine.ts       PUBLIC façade — re-exports evaluateExpression() and simulateTriggers(); the ONLY import surface for the island
  examples.ts     bundled runnable examples for BOTH tabs ({id,label,...})
  conformance.ts  the versioned conformance corpus (GHA_SEMANTICS_VERSION + vectors) — imported by the test
  engine.test.ts  vitest (node env) — runs the conformance corpus + targeted unit vectors
```

Rationale for splitting (vs. one big `engine.ts` like the other tools): the surface here is genuinely two engines (expression VM + trigger simulator) plus a glob sub-engine; splitting keeps each file readable and lets the test import sub-modules directly. `engine.ts` stays the single public import the island uses, preserving the four-file *contract* (engine.ts / engine.test.ts / Playground / page) even though the engine internally fans out.

---

## 1. `types.ts` — public shapes

```ts
/* ── Tab 1: expression evaluator ─────────────────────────────────────────── */

/** The runtime value domain GitHub expressions operate over. `Null` is a
 *  first-class falsy value distinct from undefined-context-access. Objects/arrays
 *  appear via fromJSON/context/toJSON. */
export type GhaValue = null | boolean | number | string | GhaObject | GhaArray;
export interface GhaObject { [k: string]: GhaValue }
export type GhaArray = GhaValue[];

/** The mock evaluation context — the editable "what GitHub would inject" tree.
 *  All top-level contexts are optional; missing access yields null (GitHub
 *  returns an empty-string-ish null for unknown properties, see §3). */
export interface EvalContext {
  github?: GhaObject;   env?: GhaObject;   job?: GhaObject;   steps?: GhaObject;
  runner?: GhaObject;   needs?: GhaObject; matrix?: GhaObject; strategy?: GhaObject;
  inputs?: GhaObject;   vars?: GhaObject;  secrets?: GhaObject;
  /** Optional status the status-functions resolve against (success()/failure()/…). */
  jobStatus?: 'success' | 'failure' | 'cancelled';
  /** Optional list of step conclusions used to compute success()/failure() when no explicit override. */
  stepConclusions?: Array<'success' | 'failure' | 'cancelled' | 'skipped'>;
}

/** One token-meaning row for the breakdown panel (mirrors PromQL ExplainPart). */
export interface ExprPart { token: string; meaning: string }

/** A non-fatal advisory raised during parse/eval (the footgun lives here). */
export interface ExprWarning {
  id: 'literal-if-always-true' | 'unknown-function' | 'unknown-context'
    | 'undefined-property' | 'fromjson-parse' | 'hashfiles-stub'
    | 'event-payload-stub' | 'deprecated-set-output';
  severity: 'warning' | 'info';
  message: string;
  /** 0-based char offsets into the *raw input* when locatable. */
  from?: number; to?: number;
}

export interface EvaluateResult {
  /** Best-effort even on error so the UI always renders something. */
  value: GhaValue;
  /** Pretty, deterministic string rendering of `value` exactly as GitHub
   *  substitutes it into a string context (true→"true", null→"", obj→JSON, …). */
  rendered: string;
  /** Truthiness under GitHub's rules — what an `if:` would decide. */
  truthy: boolean;
  /** Inside-out reading of the expression (period-terminated, OpsCanopy voice). */
  explanation: string;
  /** Token-by-token glosses. */
  breakdown: ExprPart[];
  /** Footgun + advisory diagnostics. NEVER throws — fatal parse problems also land here. */
  warnings: ExprWarning[];
  /** Present only on an unrecoverable parse problem; `value` still holds a safe fallback (null). */
  error?: string;
  /** Echo of the GHA semantics version the result conforms to. */
  semanticsVersion: string;
}

/** When the input is an *if-condition string* (may mix literal text and ${{ }}),
 *  not a bare expression body, the island calls evaluateIfCondition() which adds
 *  the footgun analysis. Same result shape. */

/* ── Tab 2: trigger simulator ────────────────────────────────────────────── */

export type EventName = 'push' | 'pull_request' | 'pull_request_target'
  | 'workflow_dispatch' | 'schedule' | 'release' | 'tag' | string;

export interface SimEvent {
  event: EventName;
  /** Branch name for push/PR base, or undefined for tag events. e.g. "main", "feature/x". */
  branch?: string;
  /** Tag name for tag/release pushes, e.g. "v1.2.3". */
  tag?: string;
  /** Files added/modified/removed in the push or PR diff (repo-relative paths). */
  changedFiles?: string[];
}

export type Decision = 'runs' | 'skipped' | 'not-evaluated';

export interface FilterTrace {
  /** Which filter decided, e.g. 'branches', 'branches-ignore', 'tags', 'paths', 'paths-ignore', 'event'. */
  filter: string;
  outcome: 'match' | 'no-match' | 'excluded' | 'n/a';
  /** The concrete pattern that decided (or a human reason). */
  reason: string;
}

export interface JobDecision {
  jobId: string;
  decision: Decision;
  /** The single human-readable deciding reason for the table cell. */
  reason: string;
  /** Ordered trace of every filter consulted (for the expandable detail). */
  trace: FilterTrace[];
}

export interface SimulateResult {
  /** Workflow-level: did `on:` accept this event at all? */
  workflowTriggered: boolean;
  workflowReason: string;
  jobs: JobDecision[];
  /** Parse-or-input advisories (e.g. both push & PR not modeled, ignored keys). */
  warnings: ExprWarning[];
  error?: string;
  semanticsVersion: string;
}
```

---

## 2. Expression grammar (lexer + parser)

### 2.1 `expr-lexer.ts`
Tokenizes the **body** of a `${{ … }}` (the parser is also driven on a raw body when the island strips the delimiters). Tolerant like the PromQL tokenizer: unknown chars become a single-char `op` so the parser can still report. Token kinds:

```
ident   property/context/function/keyword (true,false,null,Infinity,NaN are reserved literals)
number  decimal (123, 1.5, .5), hex (0xFF) — GitHub accepts hex & exponent; we parse JS Number()
string  single-quoted only; '' inside is a literal ' (GitHub uses doubled single-quotes to escape)
op      &&  ||  ==  !=  <  >  <=  >=  !   (longest-match first: MULTI before SINGLE)
dot     . (property access)
star    *  (the object-filter / "splat" operator: steps.*.outputs.x)
lbracket rbracket  [ ]  (index + filter)
lparen rparen comma
eof
```
Note: there is NO arithmetic in GHA expressions (no `+ - * /` math) — `*` is ONLY the object-filter operator and is only valid after a `.`. The lexer emits `star`; the parser rejects it outside filter position (degrades to a warning, not a throw).

### 2.2 `expr-parser.ts` — Pratt parser, AST
Precedence-climbing (binding powers), lowest→highest:

| Prec | Operators | Assoc | Notes |
|------|-----------|-------|-------|
| 1 | `\|\|` | left | returns an **operand**, not a bool (§3.4) |
| 2 | `&&` | left | returns an **operand**, not a bool |
| 3 | `==` `!=` | left | case-insensitive string compare (§3.2) |
| 4 | `<` `>` `<=` `>=` | left | numeric coercion compare (§3.3) |
| 5 | `!` (unary) | right | logical NOT → real boolean |
| 6 | postfix: `.ident`, `.*`, `[expr]`, call `(...)` | left | property/index/filter/function-call |
| 7 | primary: literal, ident, `(...)` | — | grouping |

AST nodes:
```ts
type Expr =
  | { t:'lit'; value: GhaValue; raw:string }
  | { t:'ctx'; name:string }                              // top-level context identifier
  | { t:'prop'; obj:Expr; name:string }                   // obj.name
  | { t:'index'; obj:Expr; index:Expr }                   // obj[expr]
  | { t:'filter'; obj:Expr }                              // obj.*  (object/array filter)
  | { t:'call'; name:string; args:Expr[] }                // fn(...)
  | { t:'not'; arg:Expr }                                 // !x
  | { t:'logic'; op:'&&'|'||'; left:Expr; right:Expr }
  | { t:'eq'; op:'=='|'!='; left:Expr; right:Expr }
  | { t:'cmp'; op:'<'|'>'|'<='|'>='; left:Expr; right:Expr }
  | { t:'error'; raw:string };                            // unrecoverable fragment, never throws
```
`parse(body): { ast: Expr; error?: string }` — on syntax failure returns `{ ast:{t:'error',raw}, error }`. Public entry never throws.

---

## 3. Evaluator (`expr-eval.ts`) — GitHub's EXACT semantics

### 3.1 Truthiness (the `if:` decision)
A value is **falsy** iff it is one of: `null`, `false`, `0`, `''` (empty string), `NaN`. Everything else is truthy — including the strings `'false'`, `'0'`, `'null'`, the empty object `{}` and empty array `[]` (objects/arrays are always truthy). This is the JS-like table GitHub documents.

```
truthy(null)=false  truthy(false)=false  truthy(0)=false  truthy('')=false  truthy(NaN)=false
truthy(true)=true   truthy(1)=true       truthy('false')=true  truthy({})=true  truthy([])=true
```

### 3.2 `==` / `!=` — equality with coercion + case-insensitive string compare
GitHub coerces operands to a common type, **then** compares; string-to-string comparison is **case-insensitive**.
Algorithm (faithful to runner): 
1. If both are the same type → compare directly; **strings compared case-insensitively** (`'ABC' == 'abc'` ⇒ true; objects/arrays compared by reference-identity, which for our value model means structural identity is false unless it is literally the same node ⇒ document as "objects are equal only if the same object").
2. Mixed types → coerce both to **number** and compare numerically (see 3.3 coercion-to-number). Special: `null == ''`? GitHub coerces null→0 and ''→0 ⇒ **true** for `null == 0` and `null == ''` and `'' == 0`. We replicate: `castToNumber(null)=0`, `castToNumber('')=0`. So `null == 0` ⇒ true.
3. `NaN == anything` ⇒ false (including `NaN == NaN`).

### 3.3 Numeric coercion table (`castToNumber`)
Used by `< > <= >=` (always) and by `== !=` on mixed types:
```
null    → 0
false   → 0
true    → 1
''      → 0
'0x1F'  → parsed as hex → 31           (leading 0x)
'010'   → 10 (decimal; NO octal)
'1.5'   → 1.5
'  3 '  → 3 (trimmed)
'abc'   → NaN  (any non-numeric, non-empty string)
'Infinity' → Infinity ; '-Infinity' → -Infinity ; 'NaN' → NaN
number  → itself
array/object → NaN
```
Comparisons with a resulting `NaN` are **always false** (`'abc' < 1` ⇒ false; `'abc' >= 1` ⇒ false). Document explicitly: this is JS `Number()` semantics, which is what the runner uses.

### 3.4 `&&` / `||` return **operands**, not booleans
- `a && b` → if `truthy(a)` then `b` else `a`.
- `a || b` → if `truthy(a)` then `a` else `b`.
So `'' || 'default'` ⇒ `'default'`; `github.x && 'yes'` ⇒ `'yes'` when x truthy. This is the documented "default value" idiom — the evaluator must return the raw operand value, and `rendered`/`truthy` are derived from it. `!x` is the ONLY logical op that yields a real boolean.

### 3.5 Property / index / filter / context access
- `github`, `env`, … resolve from `EvalContext`. **Missing top-level context → `null`** + an `unknown-context` info warning.
- `obj.name` / `obj['name']`: property names are **case-insensitive** for object keys (GitHub treats context property access case-insensitively). Missing property → `null` (NOT undefined) + optional `undefined-property` info (suppressed by default to avoid noise; surfaced only when the whole expression evaluates to a surprising null).
- `obj.*` filter: if `obj` is an array → returns an array of each element's subsequent-access target; if `obj` is an object → returns an array of its values. Supports the chain `steps.*.outputs.foo` ⇒ array of each step's `outputs.foo`. Index access on the filtered array works.
- `array[n]` numeric index; out of range → `null`.

### 3.6 String substitution rendering (`rendered`)
How GitHub converts the final value when interpolated into a string:
```
null    → ''            true → 'true'    false → 'false'
number  → minimal decimal ('5', '1.5'; Infinity→'Infinity', NaN→'NaN')
string  → itself
object/array → its JSON (compact) — matches GitHub's documented "object → JSON" substitution
```

`evaluate(ast, ctx): EvaluateResult` — wraps every node in try/catch at the boundary so a bug degrades to `{value:null, error}`; **never throws**. Deterministic for a given (ast, ctx).

---

## 4. Function library (`functions.ts`) — semantics + honest stubs

All function names are **case-insensitive** (GitHub lowercases). Each is `(args: GhaValue[], ctx: EvalContext) => GhaValue`. Argument arity/coercion follows the runner.

| Function | Semantics (faithful) | Notes |
|---|---|---|
| `contains(search, item)` | If `search` is an **array** → true if any element `==`-equals `item` (case-insensitive string eq, §3.2). If `search` is a **string** → true if it contains `item` as a substring, **case-insensitive**. Other → coerce search to string. | Both branches case-insensitive — faithful. |
| `startsWith(s, prefix)` | Coerce both to string, **case-insensitive** prefix test. | |
| `endsWith(s, suffix)` | Coerce both to string, **case-insensitive** suffix test. | |
| `format(fmt, ...vals)` | Replace `{0}`,`{1}`,… with the string-substitution of each arg (§3.6). `{{` → literal `{`, `}}` → literal `}`. Out-of-range index → error→ we degrade to leaving the placeholder + a warning (runner errors here; we choose non-throw). | Document the divergence: runner *fails the run*; we warn. |
| `join(array, sep?)` | Join array elements (string-substituted) with `sep` (default `,`). If `array` is a single value, returns its string form. | |
| `toJSON(value)` | Pretty JSON (2-space indent) of the value — matches runner's pretty output. | Returns a string. |
| `fromJSON(str)` | `JSON.parse` the string → GhaValue (object/array/number/bool/null/string). On parse error → `null` + `fromjson-parse` warning (runner errors; we warn). | Enables matrix/object construction. |
| `hashFiles(...globs)` | **CANNOT be faithfully reproduced client-side** (needs the repo file tree + SHA-256 of file contents). Returns a **clearly-marked deterministic placeholder** string `'<hashFiles: not available client-side>'`-style sentinel and raises a `hashfiles-stub` info warning explaining why. The *shape* (a 64-hex-ish string) is documented as not emitted to avoid implying a real hash. | Honest stub. |
| `success()` | Status function. Resolves from `ctx.jobStatus`/`stepConclusions`: true when no prior step/job failed or was cancelled. Default true if no status provided. | |
| `failure()` | True when a prior step/job **failed** (and run not cancelled). From `ctx.jobStatus==='failure'` or any `stepConclusions` failure. | |
| `always()` | Always returns **true** — even on cancellation. | Constant. |
| `cancelled()` | True when `ctx.jobStatus==='cancelled'`. Default false. | |

**Honesty note surfaced in UI/spec:** `hashFiles` and the *full event payload* (`github.event.*` deep tree) cannot be reproduced without GitHub's servers. We model `github.event` as a **user-editable mock object** in the default context (so users can populate the fields their expression reads) and we never claim to fetch a real payload. Unknown functions → return `null` + `unknown-function` warning (named generically in the breakdown, PromQL-style), never throw.

---

## 5. The `if:` footgun (`if-footgun.ts`) — actions/runner#1173

**Rule.** GitHub treats an `if:` value as an expression. If the user writes a condition that is **not wrapped in `${{ }}` but is also not a valid bare-expression** — i.e. it contains literal free text such as `if: ${{ github.event_name }} == 'push'` or `if: success() && github.x` mixed with stray text, or worse `if: <some literal sentence>` — the runner may evaluate the **literal string**, which is a non-empty string ⇒ **always truthy**. The canonical footgun: writing `if: ${{ github.event_name == 'push' }}` is fine, but `if: ${{ github.event_name }} == 'push'` evaluates `${{ github.event_name }}` to e.g. `push`, substitutes it, leaving the literal string `push == 'push'`, which as a whole is a **non-empty literal string ⇒ always true**.

**Detection (`analyzeIfCondition(raw: string)`):**
1. Find all `${{ … }}` spans in `raw`.
2. If there are **zero** spans AND `raw` is not itself a syntactically-valid expression (e.g. it parses to a bare unquoted multi-word literal) → if it is plain literal text ⇒ raise `literal-if-always-true` (severity `warning`): "This `if:` has no `${{ }}` and is literal text, so GitHub treats it as a non-empty string — it is ALWAYS true."
3. If there are **one or more** spans BUT text exists **outside** the spans that is not exclusively whitespace AND not a valid wrapping (i.e. the whole line is NOT a single `${{ … }}` covering the meaningful condition) → the value after substitution becomes a literal string ⇒ raise `literal-if-always-true`: "Operators (`==`, `&&`, …) appear OUTSIDE `${{ }}`. After substitution the result is a literal string, which is always true. Move the whole condition inside one `${{ }}`."
4. The corrected form is offered in the message: wrap the entire condition in a single `${{ … }}`.

This is the headline feature: it surfaces as an `ExprWarning` in `EvaluateResult.warnings` whenever the island calls `evaluateIfCondition`. The plain `evaluateExpression` (bare body) path does not run it (no delimiters present by definition).

---

## 6. Glob engine (`glob.ts`) — branch/tag/path filters

Implements GitHub's filter-pattern syntax (a custom glob, **not** POSIX, **not** regex). `globToRegExp(pattern)` compiles once; `matchFilter(name, pattern)` tests.

Token semantics:
| Token | Meaning |
|---|---|
| `*` | matches zero or more chars **except `/`** (e.g. in branch names `*` does not cross `/`; `feature/*` matches `feature/a` not `feature/a/b`). |
| `**` | matches zero or more chars **including `/`** (crosses segments). For paths, `**` matches any path; `'**'` alone matches everything. |
| `?` | matches exactly one non-`/` char. |
| `+` | matches one or more of the **preceding** character (e.g. `v1.0.*` … `+` is the "one or more of preceding" quantifier per GitHub docs). |
| `[]` | char ranges, e.g. `[0-9]`. |
| `!` | as the **first character of a whole pattern entry** → negates that entry (exclude). Inside `branches-ignore`/`paths-ignore` you do NOT use `!`; `!` is used inside the positive `branches:`/`paths:` list to carve exclusions. |
| `\` | escapes the next special char (`\*` is a literal `*`). |
| `/` | literal separator; `*`/`?` never cross it (only `**` does). |

`*` and `**` anchoring: filter patterns are **fully anchored** (must match the whole ref/path), so compile to `^…$`.

**`!` ordering semantics:** within a single `branches:`/`tags:`/`paths:` list, GitHub evaluates patterns **in order**; a later `!pattern` removes previously-matched items, and a later positive pattern can re-add. The engine evaluates the list top-to-bottom maintaining a boolean "currently included" and records which pattern flipped it (for the trace reason).

---

## 7. Trigger simulator (`triggers.ts`) — decision model

`simulateTriggers(workflowYaml: string, event: SimEvent): SimulateResult`. Uses the same `declare module 'js-yaml'` shim + `import yaml from 'js-yaml'` pattern as `gha-validator/engine.ts`. On YAML parse failure → `{ workflowTriggered:false, error, jobs:[], … }` (never throws). Uses `describeYamlError`-style line-referenced messages (mirror gha-validator).

### 7.1 Workflow-level `on:` evaluation
1. Normalize `on:` (string → `{push:{}}`; array → set of events; map → per-event filter objects).
2. Is `event.event` present in `on:`? No → `workflowTriggered=false`, reason "Workflow does not list `<event>` in `on:`".
3. For the matched event block, evaluate filters:
   - **Branch events (push/pr with a branch, no tag):** consult `branches` / `branches-ignore` (mutually exclusive per GitHub — if both present, warn). `branches` present → ref must match at least one (with `!` ordering); else excluded. `branches-ignore` present → ref must NOT match any. No branch/tag filter → matches all branches.
   - **Tag events (push of a tag):** consult `tags` / `tags-ignore` the same way. **Key fidelity rule:** if a push event has `tags`/`branches` filters and the ref is a tag but only `branches` is specified (no `tags`), the tag push is **NOT** triggered (branch filters don't apply to tags, and specifying `branches` without `tags` means tags are excluded). The engine encodes this matrix explicitly with a documented table.
   - **Path filters:** `paths` / `paths-ignore` evaluated against `event.changedFiles`. `paths` present → at least one changed file must match. `paths-ignore` present → triggers only if at least one changed file does NOT match the ignore set.
4. **AND-semantics when branch + path filters coexist:** when BOTH a branch filter (`branches`/`branches-ignore`) AND a path filter (`paths`/`paths-ignore`) are present on the same event, BOTH must pass for the workflow to trigger (logical AND). The trace records each independently and the deciding reason names the one that failed.
   - Edge case faithfully modeled: `pull_request` does **not** support `tags`; `paths`/`paths-ignore` on `pull_request` use the PR's changed files.

### 7.2 Per-job decision
For each job in `jobs:`:
- If `workflowTriggered` is false → job `decision='not-evaluated'`, reason "Workflow not triggered by this event."
- Else evaluate the job-level `if:` (if present) by calling `evaluateIfCondition` with a context auto-populated from the `SimEvent` (`github.event_name`, `github.ref`, `github.ref_name`, `github.base_ref` etc.). Truthy → `runs`; falsy → `skipped` with reason "Job `if:` evaluated to false." Also surfaces the literal-footgun warning if the job's `if:` triggers it.
- `needs:` modeling: a job that `needs:` a skipped job is reported `skipped` with reason "Needs a skipped job." (We assume upstream success unless the job is itself skipped/footgunned; documented as a simplification since real conclusions depend on runtime.)

Render a per-job RUNS/SKIPPED/NOT-EVALUATED row with the single deciding `reason` and an expandable `trace`.

---

## 8. Conformance corpus (`conformance.ts`) + CI

`export const GHA_SEMANTICS_VERSION = 'gha-2024.11'` (a date-stamped label the engine echoes in every result and the UI shows as "Conforms to GitHub Actions semantics: gha-2024.11"). The corpus is a flat array of `{ id, kind:'expr'|'if'|'trigger', input, ctx?, expected }` fixtures, each annotated with the doc/issue it mirrors. `engine.test.ts` iterates the corpus with `it.each` and asserts `value`/`truthy`/`rendered` (expr) or `jobs[].decision` (trigger). Bumping behavior = bump `GHA_SEMANTICS_VERSION` + add a corpus row referencing the source. This is the **moat**: the test IS the spec, versioned.

### Concrete vectors to include
**Coercion / equality:**
- `1 == 1` → true; `1 == '1'` → true (mixed→number); `'TRUE' == 'true'` → true (case-insensitive); `'true' == true` → coerce 'true'→NaN, true→1 ⇒ **false** (document this surprising one); `null == 0` → true; `null == ''` → true; `'' == 0` → true; `0 == false` → true; `'abc' == 'ABC'` → true; `'abc' < 1` → false (NaN); `NaN == NaN` → false.
**Logical operand return:**
- `'' || 'def'` → `'def'` (rendered `def`); `'a' && 'b'` → `'b'`; `0 || false` → `false`; `'x' && ''` → `''` (truthy=false); `!'' ` → true; `!'false'` → false (non-empty string truthy).
**Truthiness:**
- `if: ${{ '0' }}` → truthy (non-empty string); `if: ${{ 0 }}` → falsy; `if: ${{ '[]' }}` vs `if: ${{ fromJSON('[]') }}` → both truthy.
**Functions:**
- `contains('Hello world','WORLD')` → true; `contains(fromJSON('["a","b"]'),'B')` → true; `startsWith('refs/heads/main','refs/heads/')` → true; `format('{0}-{1}','a','b')` → `'a-b'`; `format('{{literal}} {0}','x')` → `'{literal} x'`; `join(fromJSON('[1,2,3]'),';')` → `'1;2;3'`; `toJSON(fromJSON('{"a":1}'))` → pretty JSON string; `fromJSON('nope')` → null + warning; `hashFiles('**/*.lock')` → stub sentinel + `hashfiles-stub` warning; `always()` → true; `cancelled()` with jobStatus cancelled → true.
**Footgun (#1173):**
- `${{ github.event_name }} == 'push'` (with text outside `${{ }}`) → `literal-if-always-true` warning; `${{ github.event_name == 'push' }}` → no warning; bare literal `merge me` → warning.
**Glob (branches/tags/paths):**
- `feature/*` matches `feature/x` but NOT `feature/x/y`; `feature/**` matches both; `releases/**` matches `releases/v1/a`; `v1.*` vs tag `v1.2`; `[0-9]+` ; `!main` ordering inside a list; `\*literal`; `**` matches `src/app/index.ts` for paths.
**Trigger decisions:**
- push to `main` with `on.push.branches:[main]` → workflowTriggered; push to `dev` → skipped (branch no-match); tag push `v1.0.0` with only `branches` set → NOT triggered (tags excluded); push with `branches:[main]` + `paths:['src/**']` and changedFiles `['docs/x.md']` → not triggered (AND: path failed); same with changedFiles `['src/a.ts']` → triggered; `paths-ignore:['docs/**']` with only doc changes → not triggered; pull_request with `paths` + matching files → triggered; per-job `if: ${{ github.ref == 'refs/heads/main' }}` → runs/skipped accordingly; job needing a skipped job → skipped.

---

## 9. Public surface (`engine.ts`) — what the island imports

```ts
export { GHA_SEMANTICS_VERSION } from './conformance';
export type { EvalContext, EvaluateResult, ExprPart, ExprWarning, GhaValue,
  SimEvent, SimulateResult, JobDecision, FilterTrace } from './types';

/** Evaluate a BARE expression body (no ${{ }} delimiters). Never throws. */
export function evaluateExpression(expr: string, ctx?: EvalContext): EvaluateResult;

/** Evaluate a full `if:` VALUE (may contain ${{ }} + literal text). Runs the
 *  #1173 footgun analysis in addition to evaluation. Never throws. */
export function evaluateIfCondition(raw: string, ctx?: EvalContext): EvaluateResult;

/** Tab 2. Parse a workflow YAML and decide per-job RUNS/SKIPPED for an event.
 *  Never throws; YAML errors come back via SimulateResult.error. */
export function simulateTriggers(workflowYaml: string, event: SimEvent): SimulateResult;

/** Convenience used by the context editor: the default editable mock context. */
export function defaultContext(): EvalContext;

/** Convenience for the glob cheat-sheet / playground: test one name against one
 *  filter pattern, returning {matched, reason}. Never throws. */
export function testGlob(name: string, pattern: string): { matched: boolean; reason: string };
```

All public entries are sync. `evaluateExpression`/`evaluateIfCondition` are deterministic; `simulateTriggers` is deterministic given (yaml, event). The island lazily `import()`s `engine.ts` + `examples.ts` on `astro:page-load` (matching the existing tools) and uses the shared `escapeHtml` from `src/lib/escape-html.ts` when injecting `rendered`/reasons into innerHTML. CodeMirror is used for the expression input and the workflow-YAML input; the CM keymap MUST include the Escape→blur binding (Tab-trap fix from CLAUDE.md).

## 10. Engine invariants (codebase rules honored)
- **Never throws.** Every public fn wraps internals in try/catch and returns `{error}` / safe fallback (`value:null`, `decision:'not-evaluated'`). Matches PromQL/cron/gha-validator.
- **No DOM** anywhere in `src/lib/**`. Rendering to HTML is the island's job.
- **Deterministic** output for fixed input → makes the conformance corpus stable.
- **Honest about limits:** `hashFiles` and the full `github.event` payload are explicitly stubbed/mock-editable, never faked, surfaced as warnings and noted in the page's "Static analysis / scope" card.
- `declare module 'js-yaml'` shim reused verbatim (no `@types/js-yaml` dependency), `import yaml from 'js-yaml'`.

## Files

| Path | Purpose |
|---|---|
| `C:/Users/PUSHKAR/Desktop/my-project/src/lib/github-actions-expression-tester/types.ts` | Public IO/result shapes only (GhaValue, EvalContext, EvaluateResult, ExprPart, ExprWarning, SimEvent, SimulateResult, JobDecision, FilterTrace). No logic. Mirrors gha-validator/types.ts doc voice. |
| `C:/Users/PUSHKAR/Desktop/my-project/src/lib/github-actions-expression-tester/expr-lexer.ts` | Tolerant tokenizer for the ${{ }} expression body. Token kinds: ident/number/string/op/dot/star/brackets/parens/comma/eof. Longest-match operators; single-quote strings with '' escape; no arithmetic (* is the object-filter op). |
| `C:/Users/PUSHKAR/Desktop/my-project/src/lib/github-actions-expression-tester/expr-parser.ts` | Pratt / precedence-climbing parser -> Expr AST. Precedence: \|\| < && < ==/!= < cmp < unary! < postfix(prop/index/filter/call) < primary. Returns {ast,error}; never throws. |
| `C:/Users/PUSHKAR/Desktop/my-project/src/lib/github-actions-expression-tester/expr-eval.ts` | Evaluator implementing GitHub's EXACT coercion: truthiness table, case-insensitive == on strings, castToNumber for mixed-type ==/!= and all comparisons, && / \|\| returning operands, property/index/object-filter access, string-substitution rendering. Builds explanation + breakdown. |
| `C:/Users/PUSHKAR/Desktop/my-project/src/lib/github-actions-expression-tester/functions.ts` | Documented function library: contains/startsWith/endsWith (case-insensitive), format ({n}, {{ }} escapes), join, toJSON (pretty), fromJSON (parse->null+warn on error), hashFiles (honest client-side stub + warning), success/failure/always/cancelled (resolve from EvalContext status). |
| `C:/Users/PUSHKAR/Desktop/my-project/src/lib/github-actions-expression-tester/context.ts` | defaultContext() editable mock tree (github/env/job/steps/runner/needs/matrix/strategy/inputs/vars/secrets + github.event mock) and validation/merge of user-edited JSON context. Case-insensitive key lookup helper. |
| `C:/Users/PUSHKAR/Desktop/my-project/src/lib/github-actions-expression-tester/if-footgun.ts` | actions/runner#1173 detector: flags an if: whose operators/literal text sit OUTSIDE ${{ }} (post-substitution literal string => always truthy) or that is bare literal text with no ${{ }}. Emits literal-if-always-true ExprWarning with the corrected wrapped form. |
| `C:/Users/PUSHKAR/Desktop/my-project/src/lib/github-actions-expression-tester/glob.ts` | Faithful GitHub filter-pattern glob: * (not crossing /), ** (crossing /), ?, + (one-or-more of preceding), [] ranges, ! list-negation with in-order evaluation, \ escaping, full anchoring. globToRegExp + matchFilter returning the deciding pattern/reason. |
| `C:/Users/PUSHKAR/Desktop/my-project/src/lib/github-actions-expression-tester/triggers.ts` | simulateTriggers(): js-yaml parse of workflow (shim, never throws), on:/branches/branches-ignore/tags/tags-ignore/paths/paths-ignore evaluation, branch-vs-tag matrix, AND-semantics when branch+path coexist, per-job RUNS/SKIPPED/NOT-EVALUATED with deciding reason + FilterTrace, needs/if handling. |
| `C:/Users/PUSHKAR/Desktop/my-project/src/lib/github-actions-expression-tester/engine.ts` | PUBLIC facade and the ONLY import surface for the island: evaluateExpression, evaluateIfCondition, simulateTriggers, defaultContext, testGlob, plus GHA_SEMANTICS_VERSION and type re-exports. All sync, deterministic, never throw. |
| `C:/Users/PUSHKAR/Desktop/my-project/src/lib/github-actions-expression-tester/examples.ts` | Bundled runnable examples for BOTH tabs ({id,label,...}): expression idioms (default via \|\|, contains, format, footgun example) and trigger scenarios (push to main, tag push, branch+path AND, paths-ignore, PR paths). Matches existing examples.ts shape. |
| `C:/Users/PUSHKAR/Desktop/my-project/src/lib/github-actions-expression-tester/conformance.ts` | Versioned conformance corpus: GHA_SEMANTICS_VERSION label + flat {id,kind,input,ctx?,expected} fixtures mirrored to documented GitHub behavior and source issues (incl #1173). The moat; imported by engine.test.ts. |
| `C:/Users/PUSHKAR/Desktop/my-project/src/lib/github-actions-expression-tester/engine.test.ts` | Vitest (node env) suite: runs the conformance corpus via it.each plus targeted unit vectors for coercion/equality, operand-returning &&/\|\|, the function library (incl hashFiles/fromJSON stubs/warnings), the #1173 footgun, the glob engine, and per-job trigger decisions. |
| `C:/Users/PUSHKAR/Desktop/my-project/src/data/tools.ts` | Registry: add the Tool entry {slug:'github-actions-expression-tester', name, tagline, description, status, category:'CI/CD', keywords[8], accent:'ship'} and flip planned->live when shipping (no engine logic, but the engine slug must match this entry). |

## Risks

- Fidelity drift: GitHub's runner does NOT publish a formal expression spec; some edge cases (e.g. 'true' == true coercing to false, null == '' being true) are derived from observed runner behavior, not docs. Mitigation: every such case is a named conformance vector with a source note, and GHA_SEMANTICS_VERSION is bumped when behavior is re-confirmed/changed.
- Equality of objects/arrays: GitHub compares non-primitives by reference; our value model has no stable identity across fromJSON calls, so structural object equality is reported false. Must be documented in the cheat-sheet so users are not surprised by `fromJSON('{}') == fromJSON('{}')` => false.
- hashFiles and full github.event payload are genuinely not reproducible client-side. Returning a fake-looking 64-hex hash would mislead; the spec mandates an explicit sentinel + warning and a user-editable mock github.event. Risk is users expecting real values — surfaced honestly in the scope note card.
- format()/fromJSON() divergence: the real runner FAILS the workflow on a bad format index or invalid JSON; we choose to warn and degrade (engines never throw). This is a deliberate, documented behavioral divergence that must be called out so users don't assume their workflow will pass.
- Glob `+` quantifier and `[]` ranges are the least-documented parts of GitHub's filter syntax; mis-modeling them yields wrong RUNS/SKIPPED verdicts. Mitigation: anchor with conformance vectors and keep glob.ts isolated/unit-tested independently of the YAML layer.
- Branch-vs-tag filter matrix (e.g. push of a tag when only `branches` is set => NOT triggered) is a subtle, frequently-misunderstood rule; encoding it wrong inverts a decision. Mitigation: explicit decision table in triggers.ts plus dedicated corpus rows.
- needs:/job-conclusion modeling is a simplification (we assume upstream success unless the upstream job is itself skipped). Real conclusions depend on runtime status the simulator can't know; must be labeled a simplification in the UI to avoid over-promising.
- CodeMirror Tab-trap: the YAML + expression inputs must include the Escape->blur keymap binding from CLAUDE.md; an engine-design omission here would cause an accessibility regression in the island (out of engine scope but a downstream dependency to flag).
- js-yaml has no bundled types and @types/js-yaml is not a dependency; the `declare module 'js-yaml'` shim must be copied exactly from gha-validator/engine.ts or strict typecheck fails.
- Scope creep: the full GHA expression language has rarely-used corners (composite-action inputs, reusable-workflow `inputs`/`secrets` inheritance). Spec intentionally scopes to the documented contexts/functions; advertising '100% fidelity' beyond the corpus would be a credibility risk — keep claims tied to the versioned corpus.

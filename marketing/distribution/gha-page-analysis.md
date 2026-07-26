# GitHub Actions Expression Tester — competitive & UX analysis

Everything below is measured against the live page or fetched from the competing
tool, not assumed. Where something is my judgement rather than a measurement, it
says so.

---

## 1. Deploy status — fixed and verified

The crash is gone from production. Driven in a real browser against
`https://opscanopy.com/github-actions-expression-tester/`:

| Input | Verdict | Value | Warning |
|---|---|---|---|
| `${{ github.event_name }} == 'push'` | RUN | `push == 'push'` | Always-true footgun ✓ |
| `${{ github.event_name == 'push' }}` | RUN | `true` | none ✓ |
| `'' == 0` | RUN | `true` | none ✓ |
| `contains('hello', 'ell')` | RUN | `true` | none ✓ |
| `=== &&& (((` | RUN | literal | footgun ✓ |

Trigger simulator tab also works: *"Event push matches the configured filters —
build RUNS."* Zero JS errors on desktop or mobile.

That last row surprised me and the tool is right: a bare `if:` that isn't a valid
expression is a non-empty string, so GitHub treats it as true. Correct behaviour,
wrong expectation on my part.

---

## 2. Who actually lands on this page

Inferred from the query shapes this page targets and from what the tool does —
not from analytics, which has too little data yet to segment.

### Persona A — "It ran when it shouldn't have" (highest intent, biggest group)

Searched *"github actions if condition always runs"* at 6pm with a broken
pipeline. **Does not want a tool.** Wants a sentence telling them what's wrong.

- Attention budget: ~10 seconds before hitting back
- Success = they read "your condition is a literal string, always true" and leave
- They will never click a tab, load an example, or edit a context

**This persona decides whether the page succeeds.** Everything else is secondary.

### Persona B — "Let me check before I push" (best retention)

Writing a condition, wants to verify it. Will paste their own expression, edit
the mock context, iterate a few times. This is the persona that bookmarks the
tool and comes back — the one worth optimising depth for.

### Persona C — The learner

Working through Actions docs, wants to understand coercion. Reads the FAQ and the
token breakdown. Low commercial value, high link value — this is who writes blog
posts that link to you.

### Persona D — The reviewer

Reviewing a colleague's workflow PR, wants to confirm a `paths` filter behaves.
Uses tab 2 almost exclusively. Currently underserved — tab 2 is hidden behind a
click and nothing on the page advertises it.

---

## 3. What competitors actually do

Researched directly, not assumed.

| Tool | What it does | Where it stops |
|---|---|---|
| **actionlint playground** (rhysd.github.io/actionlint) | Static lint + type-check of workflow YAML, WASM in-browser. Well known, well respected. | **Does not evaluate.** Tells you an expression is *valid*, never what it *returns*. No trigger simulation. |
| **actions/languageservices** (GitHub's own) | Real parser *and evaluator*; powers VS Code IntelliSense. Has a `browser-playground` package. | **Not publicly hosted.** You must clone and build it. No URL to send anyone. |
| **act** (nektos) | Runs whole workflows locally in Docker | Needs Docker, takes minutes, can't isolate one expression, can't reach secrets |
| **wrkflw** | Rust CLI local runner with expression evaluation | Install required; terminal-only |
| **commit → push → pray** | — | The real competitor. Twenty dummy commits. |

### The honest position

> **actionlint answers "is this valid?" This answers "what does it return, and
> will my job run?"**

Those are complementary, not competing. The defensible claim is narrow and true:
this is the only **publicly hosted** tool that evaluates a GitHub Actions
expression to a value against an editable context and simulates trigger filters.

**This changes the Show HN copy.** Do not imply nothing like this exists —
actionlint is widely loved and the top comment would be "how is this different
from actionlint?" Name it first, in the post. HN rewards that heavily.

---

## 4. UX findings, in priority order

### 🔴 Critical — the seeded example is not evaluated on load

Measured. On first load the editor contains the footgun example, and the results
panel reads:

> *"Load an example or write an `if:` condition, then Evaluate…"*

So Persona A — who has ten seconds and will not click anything — sees a code
editor and an empty box. **The single most valuable moment this tool has, "your
condition is always true and here is why", is hidden behind a button press.**

This also breaks the site's own rule. `CLAUDE.md` specifies for playgrounds:
*"Live eval + Enter: single ~130–220ms debounce and the exact hint line 'Results
update as you type — press Enter to run now.'"* Every other OpsCanopy tool does
this. This one doesn't.

**Fix:** evaluate the seeded example during boot, then debounce-evaluate on
input. Keep the Evaluate button for the explicit ⌘/Ctrl+Enter affordance.

Expected effect: the largest single lift available on this page. It converts a
bounce into an answer for the biggest persona.

### 🔴 High — horizontal overflow on mobile

Measured at 390px: `document.documentElement.scrollWidth > window.innerWidth`.
The example dropdown clips mid-word — *"The always-true footgun (runner…"* runs
off the right edge.

The whole page can be swiped sideways, which reads as broken. Fix the dropdown's
`max-width` / truncation and re-assert no overflow at 390px.

### 🟡 Medium — the tool sits below the fold on mobile

Hero, lead paragraph and four badges consume the entire first screen at 390px;
the editor starts around 500px down. Persona A has to scroll before seeing
anything interactive.

Consider tightening the mobile hero — the four badges especially could collapse
to one line or move below the playground.

### 🟡 Medium — tab 2 is invisible

The trigger simulator is genuinely differentiated and no competitor has it, but
nothing above the fold says it exists beyond a tab label. Persona D never
discovers it. Worth a line in the lead paragraph.

### 🟢 Low — page length

10,164px on mobile. Not wrong for SEO (the FAQ block is 40% of the word count and
carries the `FAQPage` schema), but consider whether the reference section needs
to be that long above the FAQ.

---

## 5. Recommended order of work

1. **Auto-evaluate on load + debounce on input.** Biggest lift, matches the
   documented UX contract, ~30 lines in the playground island.
2. **Fix the mobile overflow.** Small CSS fix, removes a "this is broken" signal.
3. **Mention the trigger simulator in the lead.** One sentence.
4. **Then post the Show HN** — after 1 and 2, not before. The post drives a
   traffic spike to a page whose first impression is currently an empty results
   box.
5. Tighten the mobile hero if there's appetite.

I'd do 1–3 before any distribution work. Sending HN traffic to a page where the
demo does not run itself wastes the one shot.

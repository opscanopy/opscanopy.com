# Show HN — ready to post

**Post at:** https://news.ycombinator.com/submit

**Timing:** Tuesday–Thursday, **08:00–10:00 UTC** (early morning US Eastern). Avoid
weekends. You get one shot per URL — HN dedupes, and a reposted URL usually dies.

---

## Why this tool and not AlertLint

I originally suggested AlertLint. I read its engine first and changed my mind.
`src/lib/alertlint/engine.ts` opens with its own banner: *"THIS IS A PREVIEW
SUBSET OF LogQL — NOT THE REAL LOKI ENGINE."* It supports stream selectors, line
filters, `count_over_time`/`rate`, `sum by`, and threshold comparisons — and
errors on anything else.

That is honest engineering, but HN is unforgiving: the first commenter would
paste a real-world rule using an unsupported feature, get an error, and the
thread would be about what the tool can't do.

The GitHub Actions Expression Tester has no such gap. It is complete for its
domain, has **72 passing tests against a versioned conformance corpus**
(`gha-2024.11`), and the bug it catches — `actions/runner#1173` — is one almost
every Actions user has been bitten by. Instant recognition, nothing to pick apart.

---

## Title

Copy exactly (78 characters, under HN's 80 limit):

```
Show HN: GitHub Actions expression tester that catches the always-true if: bug
```

**URL field:**

```
https://opscanopy.com/github-actions-expression-tester/
```

---

## Text field

```
GitHub treats `if:` as an expression, but only evaluates what's inside ${{ }}.
Text outside the delimiters survives as literal text. So this:

    if: ${{ github.event_name }} == 'push'

substitutes to the string `push == 'push'` — a non-empty string, which is
truthy. The step runs on every event. It has never once done what it looks
like it does. (actions/runner#1173, open since 2021.)

I got caught by this twice in the same month, the second time on a deploy job,
so I built something that just tells you.

Paste an expression and it shows the parse, the substitution, the final value,
and whether the `if:` is truthy — using GitHub's actual coercion rules, not
JavaScript's. It flags the always-true shape explicitly rather than leaving you
to spot it.

The second tab simulates triggers: paste a workflow, describe an event
(push to a branch, a PR, a tag), and it tells you whether the workflow fires
and which jobs run or skip, with the deciding filter in a trace. It models the
parts people get wrong — that `branches` and `paths` are ANDed, that branch
filters don't apply to tag pushes, and that `!` ordering inside a filter list
matters.

Implementation notes: it's a hand-written lexer, parser and evaluator, not a
regex approximation, because the coercion rules are the whole point — `'' == 0`
is true, `'true'` is truthy, objects render as their JSON. Behaviour is pinned
to a versioned conformance corpus (currently gha-2024.12) with 72 tests; the
corpus is the spec, and changing engine behaviour means adding a fixture and
bumping the version. The evaluator never throws — malformed input comes back as
a structured error.

It runs entirely in your browser. No signup, no upload, nothing to install.
The site has a CSP with `connect-src 'self'`, so a page physically cannot POST
your workflow anywhere — worth stating plainly given workflows contain secret
names and internal repo paths. In the interest of full disclosure: the site does
load Google Analytics for pageviews, behind Consent Mode set to denied by
default. Your pasted workflow is never part of that.

Static Astro, no framework. It's one of 29 browser-only DevOps tools I've been
building; this is the one I use most.

Happy to hear where the semantics are wrong — that's the part I care about
getting right.
```

---

## A bug this exercise already found and fixed

Writing this copy meant verifying every claim against the engine, and the
headline example was broken.

For `${{ github.event_name }} == 'push'`, `extractExpressionBody` only unwraps
`${{ … }}` when it spans the *whole* value. With trailing text it handed the raw
string to the expression parser, which choked on the literal `${{` and returned
empty. The UI renders `result.truthy ? 'RUN' : 'SKIP'`, so the page showed:

> **"An `if:` using this would SKIP the step."**

directly above a warning saying the condition is **ALWAYS true**. The tool
contradicted itself in precisely the case it exists to explain — and that is the
first thing anyone from HN would have pasted.

`evaluateIfCondition` now models what the runner actually does: substitute each
`${{ }}` span in place, leave the text between spans literal, and apply string
truthiness to the result. It returns `rendered: "push == 'push'"`, `truthy: true`
— "would RUN" — which agrees with the warning and demonstrates the bug instead
of hiding it.

Conformance fixtures now assert `truthy` and `rendered` for footgun vectors, not
just that a warning appears, so the verdict can't drift out of agreement again.
Version bumped `gha-2024.11` → `gha-2024.12` per the corpus's own rule. 72 tests
still pass.

## Before you post — a 5-minute check

Someone **will** try to break it in the first ten minutes. Confirm these on the
live page yourself:

| Paste this | Expect |
|---|---|
| `${{ github.event_name }} == 'push'` | flagged always-true, verdict **RUN**, renders `push == 'push'` |
| `${{ github.event_name == 'push' }}` | evaluates properly, no warning |
| `'' == 0` | `true` (GitHub coerces) |
| `contains('hello', 'ell')` | `true` |
| `=== &&& (((` | a clean error, not a crash |

If any misbehave, tell me before posting.

---

## After posting

- **Reply to every comment for the first 3 hours.** Engagement is most of what
  determines whether a Show HN survives. A post the author abandons sinks.
- **Never argue.** "Good catch, that's a real gap" beats defending every time.
- **Don't ask for upvotes anywhere.** HN detects voting rings and will ban the
  domain — which would cost you far more than this post gains.
- If someone reports a semantics bug, fix it the same day and reply with the
  commit. That single move converts critics into advocates more reliably than
  anything else.

## Realistic outcome

Most Show HN posts get 1–5 upvotes and vanish. A good one for a niche dev tool
lands 30–80 points and a few thousand visitors in a day.

The traffic spike is not the point and will decay within 48 hours. **The
durable value is the backlink** from a domain search engines trust enormously,
pointing at a seven-week-old site that currently has almost none. That is the
constraint the last report exposed, and it's what this fixes.

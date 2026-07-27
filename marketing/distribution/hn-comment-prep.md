# Show HN — prepared replies

Every fact below was checked against the live site or the repo. Adapt the wording
so it sounds like you; do not paste any of it verbatim if it doesn't.

**Three rules that matter more than any script here:**

1. **Reply to everything for the first 3 hours.** Engagement is most of what
   decides whether a Show HN survives.
2. **Never argue.** "Good catch, that's a real gap" outperforms a defence every
   single time, even when you're right.
3. **If someone finds a real bug, fix it that day and reply with the commit.**
   Nothing converts a critic faster. You did exactly this today with the
   `breakdown`/`parts` crash — that story is worth telling if it comes up.

---

## 1. "How is this different from actionlint?" — you WILL get this

> actionlint is great and I use it. It's a static checker — it tells you an
> expression is *valid*. This tells you what it *returns*.
>
> Concretely: paste `${{ github.event_name }} == 'push'` into actionlint and it's
> fine, because it is syntactically fine. Paste it here and you get "this
> substitutes to the string `push == 'push'`, which is non-empty, so the step
> always runs".
>
> They're complementary. actionlint catches shapes that are wrong; this answers
> "what will actually happen on this event".

## 2. "Why not just use `act`?"

> act is the right tool for "does my whole workflow work". It runs the real thing
> in Docker.
>
> This is for the much smaller question I hit more often: "what does this one
> condition evaluate to?" Docker, image pulls and a full job run is a lot of
> machinery for that, and act can't reach your repo secrets anyway.
>
> Different questions. I use both.

## 3. "Is it open source?" — the answer is YES, use it

The repo is **public and MIT**. Lead with this; it's a strong card and the post
already links it.

> Yes — MIT, https://github.com/opscanopy/opscanopy.com
>
> The engine is `src/lib/github-actions-expression-tester/`. The bit worth looking
> at is `conformance.ts`: a versioned corpus of fixtures that pins the semantics,
> asserted by 72 tests. Changing engine behaviour means adding a fixture and
> bumping the version, so the corpus is the spec rather than the code being the
> spec. If you think a coercion is wrong, that's the file to open — and a PR
> adding a failing fixture is the most useful bug report I could get.

## 4. "You have Google Analytics on a privacy tool" — someone will run `curl -I`

Do **not** get defensive, and do **not** repeat the absolute version of the CSP
claim. The real header is:

```
connect-src 'self' https://*.google-analytics.com https://*.analytics.google.com https://www.googletagmanager.com
```

> Fair, and you're right that it's in the header — I'd rather say it plainly than
> have you find it.
>
> GA is there for pageviews, behind Consent Mode v2 set to denied by default, so
> nothing is sent unless you opt in. What it never sees is tool input: the engines
> are pure client-side functions and there's no code path that posts what you
> paste. The CSP allows exactly two destinations — the origin and GA — so there's
> nowhere for a token to go even by accident.
>
> I've gone back and forth on dropping GA entirely. If it bothers people it's an
> easy thing to cut.

If several people push on this, **actually consider removing GA.** For a tool
whose pitch is privacy, the analytics are worth less than the objection costs.

## 5. "Your semantics are wrong for `<X>`" — the highest-value comment you'll get

Do not defend. This is the template:

> Can you give me the exact expression and the context you'd expect? If it
> disagrees with the runner I'll add it to the conformance corpus as a failing
> fixture and fix it — that corpus is the spec, so a case like this is genuinely
> the most useful thing I can be handed.

Then **actually do it, the same day**, and reply with the commit link.

Known genuine limits, if pressed — better volunteered than discovered:
- `hashFiles()` is a stub. It can't read your filesystem, so it returns a
  placeholder and warns.
- The context is a mock you edit by hand; it isn't your real repo state.
- Implemented functions: `contains`, `startsWith`, `endsWith`, `format`, `join`,
  `toJSON`, `fromJSON`, `success`, `always`, `cancelled`, `failure`.

## 6. "Just read the docs / this is trivial"

Don't take the bait, and don't over-justify.

> The docs do cover it — the issue is that `if:` reads like it works and doesn't,
> so you don't go looking. actions/runner#1173 has been open since 2021 with a
> long tail of people hitting it. I built it after getting caught twice in a
> month, the second time on a deploy job.

## 7. "Does it handle `needs.*`, matrix, reusable workflows, composite actions?"

Answer honestly per feature rather than hand-waving. What exists today:
expression evaluation against an editable context, the `if:` footgun analysis,
and trigger simulation (branches / tags / paths filters, including the
AND-semantics of `branches` + `paths` and `!` ordering).

> Not yet — right now it's expressions plus trigger filters. `needs`/matrix is the
> most-requested direction and it's the obvious next thing. Is that the case that
> bites you most, or something else?

Turning a gap into a question is how you get a roadmap out of the thread.

## 8. "Nice, but I'd want a CLI"

> Reasonable. The engine is a dependency-free TS module with no DOM, so wrapping
> it in a CLI is genuinely small. If a few people want it I'll do it.

---

## Before you post — 5-minute self-check

Run these on the live page yourself. I verified them, but I've been wrong today
and you shouldn't take my word for it a fourth time.

| Paste | Expect |
|---|---|
| `${{ github.event_name }} == 'push'` | **RUN**, `push == 'push'`, footgun warning |
| `${{ github.event_name == 'push' }}` | RUN, `true`, no warning |
| `'' == 0` | `true` |
| `contains('hello', 'ell')` | `true` |
| `=== &&& (((` | RUN + footgun warning (correct — a bare non-expression `if:` is a truthy string) |

Also confirm the page shows a result **before you click anything**.

---

## Timing

**Tuesday–Thursday, 08:00–10:00 UTC.** Prefilled submission link:

```
https://news.ycombinator.com/submit?u=https%3A%2F%2Fopscanopy.com%2Fgithub-actions-expression-tester%2F&t=Show%20HN%3A%20GitHub%20Actions%20expression%20tester%20that%20catches%20the%20always-true%20if%3A%20bug
```

URL and title are prefilled; paste the body from `show-hn.md`.

**Only post when you have the next 3 hours free.** A post you can't reply to is
worth less than no post, and you get one shot at this URL.

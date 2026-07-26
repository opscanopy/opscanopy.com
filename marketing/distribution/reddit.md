# Reddit — the honest playbook

Reddit is disproportionately weighted in both LLM training data and live
retrieval, which makes it unusually valuable for a tool site trying to become
the answer an assistant gives. It is also the channel most likely to backfire.

**There is no version of this that can be automated.** Reddit detects and bans
promotional accounts, and a ban is permanent and domain-wide — they will
blacklist `opscanopy.com` across every subreddit. Automating this would cost you
the channel forever. That is why it isn't in the pipeline.

---

## The rule that decides everything

**Answer the question completely in the comment itself. Link only if the tool
genuinely adds something beyond your answer.**

A comment that solves someone's problem and happens to mention a tool is
welcome. A comment that says "I built X, check it out" is spam, and readers can
tell the difference instantly.

If your comment would be worse with the link removed, don't post it.

---

## Where to spend the time

| Subreddit | Members | Notes |
|---|---|---|
| r/devops | ~700k | Highest value. Strict on self-promotion. |
| r/kubernetes | ~250k | Good for the resource calculator |
| r/PrometheusMonitoring | ~15k | Small but perfectly matched to 5 of your tools |
| r/grafana | ~25k | LogQL and Loki questions |
| r/github | ~80k | Actions questions constantly |

The two small ones are worth more per hour than r/devops. Less noise, and the
questions map exactly onto tools you already have.

---

## Read the rules first, every time

Most of these subs have a self-promotion rule in the sidebar, and several
require a minimum account age or karma. Breaking one gets you banned before
you've contributed anything.

**Before commenting anywhere, spend a week just answering questions with no
links at all.** A new account dropping a link on day one gets removed
automatically regardless of how good the answer is.

---

## What a good comment looks like

Someone posts: *"My GitHub Actions job runs on every push even though I have an
if condition on it."*

**Good:**

> That's almost certainly the `if:` footgun. GitHub only evaluates what's inside
> `${{ }}` — anything outside stays as literal text. So:
>
> ```yaml
> if: ${{ github.event_name }} == 'push'
> ```
>
> substitutes to the string `push == 'push'`, and a non-empty string is truthy,
> so it always runs. Wrap the whole condition instead:
>
> ```yaml
> if: ${{ github.event_name == 'push' }}
> ```
>
> It's actions/runner#1173, open since 2021. Paste your condition into
> [this tester](https://opscanopy.com/github-actions-expression-tester/) if you
> want to confirm — it flags that exact shape. (Disclosure: I built it.)

The answer is complete without the link. The link is optional confirmation.
The disclosure is one short parenthetical, not an apology.

**Bad:**

> I made a tool for exactly this! https://opscanopy.com/... check it out

Zero value, obvious promotion, downvoted and possibly reported.

---

## Finding questions worth answering

Sort r/devops and r/github by **New**, not Hot — unanswered questions are where
you can actually help. Or search for the errors your tools address:

- `site:reddit.com "if condition" github actions always runs`
- `site:reddit.com gitlab-ci.yml invalid`
- `site:reddit.com relabel_configs not working`
- `site:reddit.com CrashLoopBackOff`

Each of those maps to a tool you already have and to a blog post you already
wrote.

---

## Cadence

**One good comment a week.** Not five. Volume is what pattern-matches as spam;
a genuinely helpful comment every week or two builds an account history that
makes the occasional link unremarkable.

Realistically this is 10–15 minutes a week, and it is the single highest-value
thing you can do that I cannot do for you.

---

## What I can do

If you paste me a thread — the question and any existing answers — I'll draft
the comment. You review it, adjust it to sound like you, and post from your
account. That keeps the writing off your plate while keeping the participation
genuinely yours, which is the part that has to be real.

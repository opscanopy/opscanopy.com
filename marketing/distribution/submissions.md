# Ready-to-send submissions

Two emails/forms, both free, both human-reviewed, ~15 minutes total. Send from
`hello@opscanopy.com` so replies reach you.

---

## 1. Console.dev — email `hello@console.dev`

The best-fit target found in the research: free, editorially independent
(*"Partners must meet their selection criteria and we don't do sponsored reviews"*),
and its audience is CTOs, engineering managers and experienced developers.

**How you score against their 12 published criteria** — checked honestly, because
they will check too:

| Criterion | OpsCanopy |
|---|---|
| Interesting/useful to developers | Yes |
| Primary user is a developer | Yes |
| Self-service signup | **Better than required — no signup at all** |
| Regular-use tool set | Yes — 29 tools |
| Makes me a better developer | Partly — the footgun explanations do |
| Used by advanced power-users | Yes |
| High quality | Yes — 1,713 tests, versioned conformance corpus |
| Actively maintained | Yes — 250+ commits, updated this week |
| Good documentation | **Weakest point.** Per-tool FAQs and reference sections, no separate docs site |
| Fast | Yes — static Astro, client-side, no network round-trip |
| Negative security/privacy impact | **Strongest card — the opposite** |
| Recommend to a friend | Their call |

> **Before sending, verify the two weak ones.** Their criteria explicitly mention
> power-user features (keyboard shortcuts, dark mode, accessibility). You have a
> command palette (Ctrl/⌘+K), a dark theme, and a skip-to-content link — so say so
> rather than leaving them to look. Documentation is genuinely thinner than a
> dedicated docs site; don't overclaim it.

### Subject

```
Tool submission: OpsCanopy — 29 DevOps utilities that run entirely in the browser
```

### Body

```
Hi,

I'd like to submit OpsCanopy for consideration: https://opscanopy.com

It's a set of 29 browser-based DevOps utilities — GitHub Actions and GitLab CI
validators, a GitHub Actions expression and trigger tester, PromQL and LogQL
explainers, Prometheus relabel and Alertmanager route testers, plus subnet/CIDR,
cron, JWT and hashing tools.

The reason it exists, and the thing I'd point you at first:

Every hosted CI validator I could find POSTs your config to a server. A workflow
file contains internal hostnames, secret names, and repo paths. So all 29 tools
run entirely client-side — no signup, no upload, no account. The engines are plain
browser code, and the site's CSP restricts outbound connections to the origin plus
Google Analytics (pageviews only, Consent Mode denied by default). There is no
endpoint a tool page could send your input to. That's verifiable with curl -I
rather than something you have to take on trust.

The one I'd suggest trying is the GitHub Actions Expression Tester:
https://opscanopy.com/github-actions-expression-tester/

It evaluates ${{ }} using GitHub's coercion rules rather than JavaScript's, and
flags the always-true `if:` shape from actions/runner#1173 — where
`if: ${{ github.event_name }} == 'push'` substitutes to a non-empty string and
therefore runs on every event. The page loads with that exact case pre-evaluated.
The semantics are pinned to a versioned conformance corpus with 72 tests, so
behaviour is testable rather than best-effort. A second tab simulates which jobs
run for a push, PR or tag against a real workflow.

Against your criteria: no signup at all (rather than self-service), static Astro
so it's fast, command palette on Ctrl/⌘+K, dark mode, actively maintained with
250+ commits. Source is MIT: https://github.com/opscanopy/opscanopy.com

Fair warning on one criterion: documentation is per-tool FAQ and reference
sections rather than a separate docs site. If that's a blocker I'd rather know.

Happy to answer anything.

Pushkar
hello@opscanopy.com
```

---

## 2. Changelog News — `https://changelog.com/news/submit`

Free, curated, correct audience. Five minutes. **Send it the same day as the
Show HN** — their editors read HN, and the two reinforce each other.

Submit the **single tool**, not the collection — news items are about one thing.

| Field | Value |
|---|---|
| URL | `https://opscanopy.com/github-actions-expression-tester/` |
| Title | GitHub Actions expression tester that catches the always-true `if:` bug |

**Description:**

```
GitHub only evaluates what's inside ${{ }} in an `if:` — text outside the
delimiters stays literal. So `if: ${{ github.event_name }} == 'push'` becomes the
string "push == 'push'", which is non-empty and therefore always true. It has
never done what it looks like it does (actions/runner#1173, open since 2021).

This evaluates expressions using GitHub's actual coercion rules, flags that exact
shape, and simulates which jobs run for a push, PR or tag. Runs entirely in the
browser, no signup. Semantics pinned to a versioned conformance corpus with 72
tests. MIT.
```

---

## 3. AlternativeTo — create the account TODAY, submit in 7 days

**There is a hard 7-day account-age gate before you may submit an app.** Creating
the account costs two minutes and starts the clock; the listing happens next week.
Do this even if you do nothing else today.

Sign up at `https://alternativeto.net` with `hello@opscanopy.com`.

**Then wait.** Two rules worth knowing before you act:
- *"Using user profiles to advertise products or software is not allowed. Accounts
  used for this purpose will be blocked for spam."* Create the app page properly;
  don't decorate the profile.
- Upvote drives are explicitly penalised. Don't ask anyone to vote.

### When the week is up

Submit via User menu → **Suggest new application**. Descriptions **cannot contain
links** — URLs go only in the dedicated fields.

| Field | Value |
|---|---|
| Name | OpsCanopy |
| Official website | `https://opscanopy.com` |
| Platforms | Web / Self-Hosted: no · Online |
| License | Free / Open Source (MIT) |

**Short description:**

```
29 free DevOps utilities that run entirely in your browser — CI validators, PromQL
and LogQL explainers, subnet and CIDR calculators, cron tools and a JWT decoder.
No signup, nothing uploaded.
```

**Long description:**

```
OpsCanopy is a collection of 29 browser-based tools for platform and DevOps
engineers: GitHub Actions and GitLab CI validators, a GitHub Actions expression
and trigger tester, PromQL and LogQL explainers, Prometheus relabel and
Alertmanager route testers, a Docker run to Compose converter, subnet, CIDR and
PTR calculators, cron and systemd timer tools, and JWT, Base64 and hashing
utilities.

Everything runs client-side. There is no account, no upload and no server
processing — which matters because CI configs and tokens contain internal
hostnames and secret names. The site's Content-Security-Policy restricts outbound
connections so there is no endpoint a tool page could send your input to.

Open source under MIT. Also available in German, Spanish, French and Portuguese.
```

**Tags:** `devops`, `sre`, `developer-tools`, `online-tools`, `no-registration`,
`privacy`, `kubernetes`, `ci-cd`

### Attach as an alternative to

Do this **after** the OpsCanopy page is approved:

1. **`crontab.guru`** — `alternativeto.net/software/crontab-guru/`. Best fit; 16
   alternatives listed, has an "Add Alternatives" button. You have a cron
   expression tester and a cron→systemd converter.
2. **`regex101`** — listed under the slug `regular-expressions-101`. Crowded (42
   alternatives) and your regex tester isn't your strongest tool. Low priority.

**`jwt.io` is not listed on AlternativeTo at all.** Creating that page purely so
you can attach yourself to it is transparent, and the moderators are the people who
wrote the anti-advertising rule. Skip it.

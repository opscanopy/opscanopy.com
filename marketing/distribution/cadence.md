# Publishing cadence — the rules

**Publishing only happens when Pushkar asks for it. There is no schedule.**

## What went wrong on 2026-07-27

Seven dev.to articles went out in a single day against an account that had twelve:
three marketing originals, then four blog syndications. **A 58% jump in one day.**

That is the exact velocity pattern platforms flag as spam — a sudden burst of
same-domain links from one account. Nothing stopped it because nothing was
designed to: `--limit` defaulted to Infinity, and I kept going because each batch
succeeded. Success at each step is not evidence the aggregate is sensible.

Nothing bad has happened to the account. This is a near-miss, written down so it
stays one.

## The rules now

| Rule | Value |
|---|---|
| Publishing trigger | **Manual only** — Pushkar says "push" |
| Max per session | **2 articles** (hard cap of 3 in the script) |
| Min gap between sessions | **1 day** |
| Bluesky per session | **2 posts** |
| Target steady state | ~2–4 dev.to posts per week, spread out |

**There is no publishing cron.** `syndicate.yml` runs a weekly canonical *drift
check* only — it repairs metadata on articles that already exist and never creates
anything. The `publish` job requires a human to tick a box in the Actions tab.

Enforced in code, not just documented:
- `scripts/syndicate.mjs` defaults to **2** when `--publish` is passed
- `MAX_PER_RUN = 3` is a ceiling `--limit` cannot exceed
- A dry run still shows the whole queue — that is information, not action

## Operational rules for whoever runs this

**Never pipe a `--publish` run.** On 2026-07-31 a publish command piped to `head -4`
was killed by SIGPIPE after its first post, publishing 1 of 2 and reporting nothing.
Redirect to a file and `cat` it instead:

```bash
node scripts/syndicate.mjs --target bluesky --limit 1 --publish > /tmp/pub.txt 2>&1; cat /tmp/pub.txt
```

**Preview and publish are different commands.** The same day, `--publish` was passed
on a command intended as a preview. Dry-run first, read it, then re-run with
`--publish` added. Never assemble both in one step.

## Session log

| Date | dev.to | Bluesky | Notes |
|---|---|---|---|
| 2026-07-27 | **7** | 2 | Too many. See the near-miss above. |
| 2026-07-31 | 0 | 2 | Normal. 4-day gap. dev.to key dead — see below. |

## Current state

**dev.to — 20 published, 13 still queued** (blocked, see key note below)

Done today: 7 Common .gitlab-ci.yml Mistakes · How to Convert a docker run Command
· Why Isn't My Alert Reaching the Right Receiver · Why Did Prometheus Drop My Target

Remaining queue (6 blog + 7 guides):

```
docker run vs Docker Compose: A Practical Migration Guide
How Alertmanager Routing Works: Matchers, continue, and the Route Tree
Learn DevOps in 90 Days
Prometheus relabel_configs Explained
Unit Testing Loki Alert Rules
How to Validate .gitlab-ci.yml Before You Push
--- guides (long-form, hold until the blog backlog clears) ---
AWS for DevOps Engineers · Docker for DevOps · Docker Interview Prep
Kubernetes for DevOps · Linux for DevOps · Networking for DevOps · DevOps Projects
```

At 2 per session, roughly one session a day, the blog backlog clears in **3
sessions**. The 7 guides should wait until after that — they are long-form (one is
a 200-minute read) and posting them alongside would look like bulk dumping.

**dev.to key is dead — 401 as of 2026-07-31.** It authenticated on 27 Jul and no
longer does, so it was revoked or expired. Nothing can publish there until it is
replaced: dev.to → Settings → Extensions → DEV Community API Keys → Generate.

> Note on diagnosing this: **curl returns a false 401 on this machine** for keys
> that Node's `fetch` authenticates fine — verified by comparing SHA-256 of the
> exact bytes both clients sent. Always test with `fetch`, never curl, or you will
> chase a key that was never broken. The 401 above was confirmed via fetch.

**Bluesky — 4 posted, 23 queued.** Healthy: 8 followers, following 50, so posts now
actually reach people. Lower risk than dev.to since these are link posts rather
than full articles.

## How to run it

Say **"push"** and I will:

1. Dry-run and show exactly what would go out
2. Publish 2, no more
3. Verify each: canonical points home, no relative paths, article resolves
4. Report and stop

Locally, if you ever want to do it yourself:

```bash
npm run syndicate                                    # preview everything
npm run syndicate -- --target devto --limit 2 --publish
```

## Signals to watch

Stop and reassess if any of these appear:

- A dev.to post gets unpublished or the account is flagged
- Posts stop appearing in tag feeds (a soft shadowban)
- Engagement is zero across several posts — a sign of downranking, not just a
  quiet audience
- Any `429` outside the normal ~30s creation limit

## What is NOT rate-limited

These are separate and unaffected:
- The **weekly canonical drift check** — repairs only, creates nothing
- **IndexNow / Bing** submission on deploy — search engines, not a community
- The **weekly Search Console report**

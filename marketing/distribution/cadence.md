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
| 2026-07-31 | 0 | 2 | Normal. 4-day gap. dev.to 401 (turned out to be a delay). |
| 2026-08-02 | 2 | 0 | Normal. 6-day gap on dev.to. Key started working again. |
| 2026-08-09 | 2 | 1 | Normal. 7-day dev.to gap, 8-day Bluesky gap. Tests page promoted. |
| 2026-08-11 | 2 | 2 | Normal. 2-day gap both. **Blog backlog cleared** — guides next, 1/session. |
| 2026-08-15 | 1 | 2 | Normal. 4-day gap both. First guide (43-min read). |

## Current state

**dev.to — 26 published, 6 still queued (all long-form guides)**

Syndicated on 2026-07-27: 7 Common .gitlab-ci.yml Mistakes · How to Convert a docker
run Command · Why Isn't My Alert Reaching the Right Receiver · Why Did Prometheus
Drop My Target

Syndicated on 2026-08-02: docker run vs Docker Compose · How Alertmanager Routing Works

Syndicated on 2026-08-09: Learn DevOps in 90 Days · Prometheus relabel_configs Explained

Syndicated on 2026-08-11: Unit Testing Loki Alert Rules · How to Validate .gitlab-ci.yml

Syndicated on 2026-08-15: AWS for DevOps Engineers (guide 1 of 7)

Remaining queue (6 guides, no blog posts left):

```
Docker for DevOps · Docker Interview Prep · Kubernetes for DevOps
Linux for DevOps · Networking for DevOps · DevOps Projects
```

**The blog backlog is cleared as of 2026-08-11.** All 20 blog posts are syndicated.

**The guides go ONE per session, not two.** Confirmed by the first one: *AWS for
DevOps Engineers* published at **10,554 words / 43-minute read / 52 headings**. Two
of those in a session is not a cadence, it is a dump — and `linux-for-devops` is
larger still. Six left means six more sessions, which is the right rhythm.

Practical note for every guide run: pass `--limit 1` for dev.to explicitly. The
script's default of 2 is correct for blog posts and too fast for these.

## RESOLVED 2026-08-02 — it was a delay, not a restriction

**The exact same key started working two days later.** Same SHA-256
(`d5242dd10103c3eb`), untouched file, no action taken on the account — it simply
began authenticating on 02 Aug.

So the diagnosis below was **wrong**. dev.to did not restrict anything; a newly
generated key took somewhere between one and two days to become active, far longer
than the 20-second retry that was used to rule out "activation delay". Nothing was
wrong with the account, and no email to support was needed.

**The lesson is about the inference, not the key.** Every individual fact in the
table below was correct, and the conclusion drawn from them still managed to be
wrong: a plausible story (burst → restriction) was fitted to a coincidence in
timing. When a platform behaves oddly, "wait a day and retry" belongs above
"reason about why" — and a hypothesis that cannot be confirmed from outside should
be labelled as such and left alone, not acted on.

The cadence limits stay regardless. They were the right call for their own reasons;
they just were not vindicated by this.

<details>
<summary>Original (incorrect) diagnosis, kept for the record</summary>

**dev.to API access is not working — 401 as of 2026-07-31.** Publishing there is
paused until this is resolved. Do NOT keep generating keys; two have already failed
and a third will behave the same.

What has been ruled out:

| Checked | Result |
|---|---|
| Old key expired? | Yes — but a **freshly generated key also 401s** (different SHA-256, so genuinely new) |
| Key malformed? | No — 24 chars, all alphanumeric, no BOM or stray whitespace |
| Activation delay? | No — still 401 after 20s and on a later retry |
| My tooling? | No — **Pushkar reproduced the 401 with curl on his own shell** |
| Account suspended? | No — profile visible, joined Jun 13, public API returns 200 |
| Content moderated? | **No — all 7 articles from 27 Jul are still live**, canonicals intact |

Healthy account, intact content, two valid-looking keys, and every authenticated
endpoint refuses (`/users/me` and `/articles/me` both 401).

**Leading hypothesis: dev.to restricted API access on the account after the 27 Jul
burst.** The timing fits — the working key died within days of seven posts going out
in one day, replacement keys do not work either, and the articles themselves were
left untouched, which is what an API restriction looks like rather than content
moderation. It cannot be confirmed from outside the platform.

If that is the cause, it is the concrete cost of over-posting on 27 Jul, and the
reason the limits above are now enforced in code instead of documented as intent.

**Next step is human:** email **yo@dev.to** from the account address and ask whether
API access has been restricted and what restores it.

</details>

> Separate diagnostic trap, still true: **curl returns false 401s on this machine**
> for keys that Node's `fetch` accepts — verified by comparing SHA-256 of the identical
> bytes each client sent. That is why a working key was once regenerated twice for
> nothing. Always confirm with `fetch` before concluding a key is bad.

**Bluesky — 9 posted, 19 queued.** Healthy: 21 followers, following 50, so posts now
actually reach people. Lower risk than dev.to since these are link posts rather
than full articles.

## How to run it

Say **"push"** and I will:

1. Dry-run and show exactly what would go out
2. Publish **1 dev.to guide + 2 Bluesky links** — while guides are the queue.
   (It was 2 dev.to articles while blog posts remained; that phase ended 11 Aug.)
3. Verify each: canonical points home, no relative paths, article resolves
4. Report and stop

Locally, if you ever want to do it yourself:

```bash
npm run syndicate                                     # preview everything
npm run syndicate -- --target devto   --limit 1 --publish   # guides: ONE
npm run syndicate -- --target bluesky --limit 2 --publish
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

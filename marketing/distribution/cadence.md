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
| 2026-08-16 | 1 | 0 | Guide 2. Bluesky skipped — their feed API was 502 all session. |
| 2026-08-17 | 1 | 2 | Guide 3. Bluesky feed recovered. 24h gap. |
| 2026-08-19 | 1 | 2 | Guide 4. 2-day gap both. |
| 2026-08-25 | 1 | 2 | Guide 5 (Linux). 6-day gap both. **dev.to returned HTTP 500 and published anyway** — second occurrence, see the trap below. |
| 2026-08-31 | 2 | 2 | Normal. 6-day gap both. First of the error-string posts — blog-sized, so 2 rather than 1. |

## Current state

**dev.to — 32 published, 3 still queued (1 error-string post + 2 long-form guides)**

Syndicated on 2026-07-27: 7 Common .gitlab-ci.yml Mistakes · How to Convert a docker
run Command · Why Isn't My Alert Reaching the Right Receiver · Why Did Prometheus
Drop My Target

Syndicated on 2026-08-02: docker run vs Docker Compose · How Alertmanager Routing Works

Syndicated on 2026-08-09: Learn DevOps in 90 Days · Prometheus relabel_configs Explained

Syndicated on 2026-08-11: Unit Testing Loki Alert Rules · How to Validate .gitlab-ci.yml

Syndicated on 2026-08-15: AWS for DevOps Engineers (guide 1 of 7)

Syndicated on 2026-08-16: Docker for DevOps (guide 2 of 7) — 49,329 words, 182-min read

Syndicated on 2026-08-17: Docker Interview Prep (guide 3 of 7) — 41-min read

Syndicated on 2026-08-19: Kubernetes for DevOps (guide 4 of 7) — 36-min read

Syndicated on 2026-08-25: Linux for DevOps (guide 5 of 7) — 40,331 words, 144-min read

Remaining queue (2 guides, no blog posts left):

```
Networking for DevOps · DevOps Projects
```

**The blog backlog is cleared as of 2026-08-11.** All 20 blog posts are syndicated.

**The guides go ONE per session, not two**, and the sizes settle any argument:

| Guide | Words | Read |
|---|---|---|
| AWS for DevOps Engineers | 10,554 | 43 min |
| Docker for DevOps | **49,329** | **182 min** |
| Docker Interview Prep | — | 41 min |
| Kubernetes for DevOps | — | 36 min |
| Linux for DevOps | 40,331 | **144 min** |

A three-hour read is not something you publish two of in a sitting. **Two left, two more sessions.**

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

## RESOLVED 2026-08-22 — the CVE duplicate, and why it existed

`unifying-cve-ignore-files` had two published dev.to articles. Resolved by
unpublishing **`...-4m57`** (id 3890110) and keeping **`...-4i0m`** (id 3890176).

The pair is a textbook case of the "a dev.to 500 can still create the article" trap
below, and the metadata says so plainly:

| | `-4m57` (unpublished) | `-4i0m` (kept) |
|---|---|---|
| published | 08:13:24 | 08:26:39 (13 min later) |
| canonical_url | **itself** | opscanopy.com/blog/unifying-cve-ignore-files/ |
| reactions / views | 0 / 74 | 1 / 31 |

`-4m57` is the orphan of a first POST that looked like it failed: it never got a
canonical, so it declared itself the original and competed with the site. `-4i0m` is
the deliberate retry, with the canonical set correctly. Kept the correctly-canonical
one even though the orphan had more lifetime views — 74 views is not an asset, and a
self-canonical duplicate is the exact harm this whole effort exists to remove.

Audit is now clean: **24 canonical · 0 need fixing · 5 no local match**, and the
unpublished URL 404s.

Two notes for next time:

- **Verify an unpublish against `/api/articles/me/all`, not the PUT response.** The
  `PUT published:false` returned HTTP 200 with `published: undefined` in the body.
  The authoritative endpoint confirmed `published=false`.
- **`scripts/devto-sync.mjs` still lists from the PUBLIC endpoint** (`?username=`),
  which the trap section below says never to trust. `syndicate.mjs` was migrated to
  `/api/articles/me/all`; devto-sync was not. So a "0 need fixing" result from it is
  only as good as a listing known to drop the newest article. Worth switching to the
  authenticated endpoint when a key is present, falling back to public when not —
  but note that coupling the audit to the key means a missing secret would start
  failing the job, which it currently does not.

## RECURRED 2026-08-29 — the CVE duplicate came back, and why that matters

`...-4m57` was published again, self-canonical, having been unpublished and verified
404 on 22 Aug. Unpublished a second time; the audit is clean again (25 canonical, 0
need fixing) and the URL 404s.

**The cause is not known, and the obvious explanations are ruled out:**

| Checked | Result |
|---|---|
| Did the syndicator republish it? | No. `syndicate.mjs` only sets `published: true` when CREATING an article; this kept its original id 3890110. |
| Edited in the dev.to UI? | `edited_at` is still `2026-08-22T10:27:11Z` — the timestamp of the unpublish PUT itself. Nothing has edited it since. |
| Front matter in `body_markdown` overriding `published`? | Neither copy has any front matter. |

So the unpublish took effect (verified `published=false` AND a live 404 at the time)
and later reverted with no edit recorded. **Treat "unpublished via the API" as
possibly non-durable on Forem** — re-check rather than assuming it stuck.

**Forem enforces one article per `canonical_url`.** Pointing `-4m57` at the opscanopy
original returns:

```
422 {"error":"Canonical url has already been taken. ..."}
```

because `-4i0m` already claims it. That kills the obvious belt-and-braces fix: you
cannot neutralise the duplicate by canonicalising it home and leaving it published.
Unpublishing one copy is the only lever available.

It also means **the weekly canonicals job fails for as long as this duplicate is
published**: `devto-sync --apply` attempts the PUT, gets 422, exits 1. That is a
useful alarm rather than a bug — it is why the 24 Aug run passed (the duplicate was
unpublished then) and why 31 Aug would have failed. `devto-sync.mjs` now prints what
a 422 canonical collision actually means instead of the bare status line.

**If it returns a third time**, escalate to support@dev.to — the 422 text points
there itself — because an article that republishes with no edit trace is a
platform-side behaviour, not something this repo can fix.

## 2026-08-31 — the error-string posts start syndicating

Published `docker-build-failed-to-solve-exit-code-1` and
`kubernetes-oomkilled-exit-code-137` to dev.to plus the same two as Bluesky links.
Two dev.to articles rather than one because these are blog-sized (~1,700 words), not
the 3-hour guides that forced the one-per-session rule.

Both verified against `/api/articles/me/all`: published, canonical pointing home, zero
relative paths surviving absolutisation. Audit clean afterwards — 27 canonical, 0 need
fixing, no duplicates. `x509-certificate-signed-by-unknown-authority` is next in the
queue and was deliberately held back rather than making it three in one sitting.

Why these two first: they are the posts targeting literal error strings, which is the
only channel currently proven to rank — `/blog/github-actions-if-condition-always-true/`
reaches page one against GitHub Docs, while every tool page still draws zero
impressions.

## Diagnostic traps — read before debugging anything here

**curl returns false 401s on this machine** for keys that Node's `fetch` accepts —
verified by comparing SHA-256 of the identical bytes each client sent. That is why a
working key was once regenerated twice for nothing. Always confirm with `fetch`.

**dev.to's PUBLIC listing is eventually-consistent — never trust it.**
`/api/articles?username=` gave 27 articles including the newest on one call and 26
without it on the next six, same URL, seconds apart (2026-08-16). Use
`/api/articles/me/all` with the api-key: three consecutive calls agreed, and it
shows drafts too. The syndicator now does.

**A dev.to 500 can still create the article — this has now happened TWICE.** On 2026-08-16 a publish returned HTTP
500; the public listing and a direct slug fetch both said the article did not exist,
so a retry looked safe. It had in fact been created, under a different slug than the
response implied, and only Forem's canonical-uniqueness guard prevented a duplicate.
After any failed publish, check `/api/articles/me/all` before retrying — not the
public listing, and not a guessed slug.

It recurred on 2026-08-25 publishing the Linux guide: `FAILED: HTTP 500`, and the
article was live under `linux-for-devops-engineers-5616` (id 4486744) with the
canonical already correct. Checking `/me/all` first is what stopped a retry from
manufacturing the same duplicate that had just been cleaned up three days earlier.

**A 500 also leaves `.syndicate-state.json` unwritten**, because the script records
state only on success. That matters: the cadence guard sums the state file and the
live listing, so a stale state file plus a lagging listing could report "6 days ago"
on a day something was already published, and wave through a second post. After a
500 that turns out to have published, patch the state file by hand — set
`devto.lastPublish` to the article's `created_at` and append its slug. (Side effect:
the counter then double-counts that one article across both sources, so it reads one
higher for 24h. It errs toward holding back, which is the safe direction.)

**Bluesky — 15 posted, 13 queued.** Healthy: 23 followers, following 50, so posts now
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

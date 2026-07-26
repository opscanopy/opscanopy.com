# SEO automation — setup checklist

Everything the automation needs from you, in priority order. Nothing here is code.

Total time: about **35 minutes**, and you can stop after step 3 and still have
gained most of the value.

**Never paste a secret into a chat, an issue, or a commit.** Every credential
below goes straight into GitHub Actions secrets. Tell me only the secret *name*
once it is added.

---

## Step 1 — Unblock the AI crawlers (2 min) · BLOCKING

**Why:** GPTBot and ClaudeBot are OpenAI's and Anthropic's main crawlers. While
they are blocked, ChatGPT and Claude cannot read your pages, so they can never
cite your tools. This is a dashboard setting that sits *above* `robots.txt` —
no code change can override it.

1. Cloudflare dashboard → select **opscanopy.com**
2. Left sidebar → **AI Crawl Control** → **Security**
3. You will see a table: Crawler / Category / Bytes Transferred / Requests /
   **Block Crawler**
4. Turn the **Block Crawler** toggle **OFF** (grey, not blue) for:

   | Crawler | Owner | Why it matters |
   |---|---|---|
   | **GPTBot** | OpenAI | Feeds ChatGPT's knowledge. **Most important.** |
   | **ClaudeBot** | Anthropic | Feeds Claude's knowledge. **Most important.** |
   | **Claude-User** | Anthropic | Live fetch when a Claude user follows a link to you |
   | Bytespider | ByteDance | Optional — TikTok's crawler, no search value. Your call. |

5. **Scroll the whole table.** There may be more blocked crawlers below
   Bytespider (look for `Meta-ExternalAgent`, `CCBot`, `Amazonbot`,
   `PerplexityBot`).

**Also check the legacy switch**, which can block independently:

6. Left sidebar → **Security** → **Settings** → filter chip **Bot traffic**
7. Confirm Search / Agent / Training all say **Allow (do not block)** — they
   already do in your screenshot
8. **Scroll down** past those to **"Block AI bots [Deprecating on September 15]"**
   — this was cut off in your screenshot. Make sure it is **off**.

**How to verify:** wait ~10 minutes, then come back to AI Crawl Control →
Security and check that GPTBot / ClaudeBot start showing non-zero **Allowed**
counts. That table is the real answer — a `curl` test cannot tell you, because
Cloudflare verifies crawlers by IP address, not by user-agent.

---

## Step 2 — Rotate the dev.to key (3 min) · BLOCKING

**Why:** the key was pasted into a chat, so treat it as public. It can publish,
edit and unpublish articles on your account.

1. dev.to → **Settings** → **Extensions** → **DEV Community API Keys**
2. **Revoke** the existing key (`841HBL…`)
3. **Generate** a new one, name it `opscanopy-ci`
4. Copy it, then add it as a GitHub secret (see step 3) named **`DEVTO_API_KEY`**

---

## Step 3 — Where all secrets go (1 min, do once)

`github.com/opscanopy/opscanopy.com` → **Settings** → **Secrets and variables**
→ **Actions** → **New repository secret**

Every secret in steps 4–8 is added here. Full list:

| Secret name | Needed for | Blocking? |
|---|---|---|
| `CLOUDFLARE_API_TOKEN` | automatic deploys | Yes — nothing is automatic without it |
| `CLOUDFLARE_ACCOUNT_ID` | automatic deploys | Yes |
| `GCP_SA_KEY` | weekly Search Console report | Yes — content strategy is guesswork without it |
| `GSC_SITE_URL` | weekly report | Yes |
| `DEVTO_API_KEY` | dev.to canonical drift check | Recommended |
| `GA4_PROPERTY_ID` | traffic section of the report | Optional |
| `BING_API_KEY` | faster Bing indexing | Optional |

---

## Step 4 — Cloudflare deploy credentials (5 min) · BLOCKING

**Why:** you currently deploy by hand with `npm run deploy`. Until CI can
deploy, "fully automatic" cannot exist — every other automation runs *after* a
deploy.

**API token:**

1. Cloudflare dashboard → click your profile icon (top right) → **My Profile**
2. **API Tokens** → **Create Token**
3. Use the template **"Edit Cloudflare Workers"**
4. Under *Account Resources*: select your account
5. Under *Zone Resources*: select **opscanopy.com**
6. Continue → Create → **copy the token now** (it is shown only once)
7. GitHub secret → **`CLOUDFLARE_API_TOKEN`**

**Account ID:**

1. Cloudflare dashboard → **Workers & Pages**
2. The **Account ID** is in the right-hand sidebar — a 32-character hex string
3. GitHub secret → **`CLOUDFLARE_ACCOUNT_ID`**

---

## Step 5 — Google service account (10 min) · BLOCKING

**Why:** this is the single highest-value credential. It gives the weekly report
your real search queries — which then tells us exactly what content to write
instead of guessing. One service account covers both Search Console and GA4.

1. Go to `console.cloud.google.com`
2. Create a new project (name it `opscanopy-seo`) or pick an existing one
3. **APIs & Services** → **Library** → search for and **Enable** both:
   - **Google Search Console API**
   - **Google Analytics Data API**
4. **IAM & Admin** → **Service Accounts** → **Create service account**
   - Name: `opscanopy-seo-reporter`
   - Skip the optional "grant roles" step — it needs no project-level role,
     because it reads from Search Console and GA4, not from Google Cloud
   - Click **Done**
5. Click the service account you just made → **Keys** tab → **Add Key** →
   **Create new key** → choose **JSON** → **Create**. A `.json` file downloads.
6. Open that file in a text editor. Two things matter:
   - The **entire file contents** → GitHub secret **`GCP_SA_KEY`**
     (paste the whole thing, `{` to `}`, as one secret)
   - The **`client_email`** value — looks like
     `opscanopy-seo-reporter@opscanopy-seo.iam.gserviceaccount.com`.
     You need it for steps 6 and 7.

> Creating the key grants nothing on its own. Steps 6 and 7 are what actually
> give it access. This is the part people miss, and it shows up as a `403`.

---

## Step 6 — Grant it access in Search Console (2 min) · BLOCKING

1. `search.google.com/search-console` → select the **opscanopy.com** property
2. Left sidebar, bottom → **Settings** → **Users and permissions**
3. **Add user** → paste the `client_email` from step 5 → Permission: **Full**
4. Add

**Then find your `GSC_SITE_URL` value** — look at the property selector at the
top left:

| What you see | Property type | Secret value |
|---|---|---|
| `opscanopy.com` with a globe/domain icon | Domain | `sc-domain:opscanopy.com` |
| `https://opscanopy.com/` | URL-prefix | `https://opscanopy.com/` |

It must match **exactly**, including the trailing slash. GitHub secret →
**`GSC_SITE_URL`**.

---

## Step 7 — Grant it access in GA4 (2 min) · Optional

Skip this and the report still works — it just won't include traffic-by-source.

1. `analytics.google.com` → **Admin** (gear icon, bottom left)
2. **Property Access Management** → **+** (top right) → **Add users**
3. Paste the same `client_email` → role **Viewer** → untick "Notify by email" → **Add**

**Then find your property ID:**

4. **Admin** → **Property Settings**
5. Copy the **PROPERTY ID** — a number like `498372615`

> This is **not** `G-EGNWVFWMP0`. That is the measurement ID and it will not
> work here.

GitHub secret → **`GA4_PROPERTY_ID`**

---

## Step 8 — Bing Webmaster Tools (3 min) · Optional but cheap

**Why:** Bing's index is one of the sources behind ChatGPT Search, and you don't
have Bing set up at all yet. The import route skips all verification.

1. `bing.com/webmasters`
2. Choose **Import from Google Search Console**
3. Sign in with the Google account that owns the GSC property, and grant access
4. Pick **opscanopy.com** → **Import**. It auto-verifies and pulls your sitemap.
5. Data appears after ~48 hours
6. Then: **Settings** (gear) → **API access** → **API Key** → copy
7. GitHub secret → **`BING_API_KEY`**

> New properties get a low daily submission quota. The script caps its batch and
> treats "quota exceeded" as non-fatal, so it will never fail a deploy.

---

## Step 9 — Tell me to merge and deploy

Five commits are sitting on the branch `seo/phase1-internal-linking`. Nothing is
live yet. Once step 1 is done, say the word and I will merge to `main`, deploy,
and verify the whole chain end to end.

---

## Optional — full content automation

Everything above makes the site fast to index, readable by AI assistants, and
self-reporting. It does **not** write new content.

Ranking growth past month two comes from acting on the weekly striking-distance
report. Two ways to close that gap:

- **`ANTHROPIC_API_KEY`** as a repo secret → a scheduled workflow reads the
  weekly report and opens PRs with new and expanded pages. Genuinely hands-off.
  Roughly $5–20/month.
- **Or ping me monthly** and I'll do a content batch in a session.

You declined the API key earlier, so I have not built that workflow. Say so if
you change your mind.

---

## Things automation cannot do for you

Being straight about the ceiling. The three highest-return actions for a
seven-week-old developer-tool site all need a human account, because automating
them gets the account banned:

1. **A Show HN post** for your strongest single tool (AlertLint or the GitHub
   Actions Expression Tester — the most differentiated, least commoditised).
2. **Pull requests to `awesome-devops` / `awesome-sre` lists** — real followed
   links from high-authority repos, and LLMs read those lists heavily.
3. **One genuine Reddit comment a week** in r/devops or r/kubernetes, linking a
   tool only where it actually answers the question. Reddit is weighted
   unusually heavily in both LLM training data and live retrieval.

That is roughly 20 minutes a month. I can write all three ready to paste; only
the posting needs you. If you never do it the plan still works, just slower.

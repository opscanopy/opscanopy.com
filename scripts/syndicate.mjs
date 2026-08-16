// Syndicate opscanopy blog posts and guides to external platforms.
//
// Companion to scripts/devto-sync.mjs, which REPAIRS canonicals on things already
// posted. This one PUBLISHES. Both share the same conventions deliberately:
// frontmatter read with a narrow regex (no YAML dep), titles compared after
// normalisation, dry-run by default, `process.exitCode` instead of process.exit()
// (on Windows, exiting while undici holds a keep-alive socket trips a libuv
// assertion and replaces the real exit code with 127).
//
//   node scripts/syndicate.mjs                      # dry run, all targets
//   node scripts/syndicate.mjs --target devto       # one target
//   node scripts/syndicate.mjs --target devto --publish
//   node scripts/syndicate.mjs --limit 3 --publish  # drip a few at a time
//
// Credentials come from the environment, never from a file in the repo:
//   DEVTO_API_KEY   dev.to -> Settings -> Extensions -> DEV Community API Keys
//
// TWO TRANSFORMS THAT ARE EASY TO GET WRONG AND SILENTLY BREAK EVERYTHING:
//
//   1. Relative paths must be absolutised. Posts contain
//      `![alt](/blog/reading-promql-hero.svg)` and `[text](/promql-explainer)`.
//      Published verbatim, every image 404s and every internal link points at the
//      syndication platform's own domain. See absolutise().
//
//   2. canonical_url must point at the opscanopy original. dev.to massively
//      outranks a young domain; an uncanonicalised repost outranks and cannibalises
//      the thing it was copied from. Ten posts already had to be repaired for
//      exactly this. A target that cannot express a canonical does not get prose.

import { readFile, readdir, stat } from 'node:fs/promises';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const SITE = 'https://opscanopy.com';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Load credentials from .env if the environment does not already supply them.
 *
 * Keys previously lived in the agent session's temp scratchpad, which Windows
 * purges — they vanished between sessions and had to be re-pasted each time.
 * `.env` is already gitignored (alongside .env.production) and sits next to the
 * project, so it survives.
 *
 * Real environment variables always win, which keeps CI working unchanged: the
 * workflow injects secrets and never has a .env to read.
 */
(function loadEnvFile() {
  let raw;
  try {
    raw = readFileSync(join(ROOT, '.env'), 'utf8');
  } catch {
    return; // no .env is normal in CI
  }
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!m) continue;
    const key = m[1];
    const value = m[2].trim().replace(/^["']|["']$/g, '');
    if (value && !process.env[key]) process.env[key] = value;
  }
})();

const args = process.argv.slice(2);
const PUBLISH = args.includes('--publish');
const flag = (name, fallback) => {
  const i = args.indexOf(name);
  return i !== -1 && args[i + 1] ? args[i + 1] : fallback;
};
const ONLY_TARGET = flag('--target', null);

/**
 * Promote one specific piece by slug, jumping the queue.
 *
 * The queue is ordered blog → tests → guides, so a newly shipped page sits behind
 * twenty older posts and would not surface for weeks. When there is a reason to
 * push something now (a page just launched), this posts exactly that.
 */
const ONLY_SLUG = flag('--only', null);

/**
 * Publishing is capped, deliberately and by default.
 *
 * On 2026-07-27 seven articles went out in one day against an account that had
 * twelve — a 58% jump. Nothing rate-limited it because nothing was meant to: the
 * limit defaulted to Infinity and only `--limit` held it back. That is the wrong
 * default for an irreversible, account-risking action.
 *
 * A dry run still lists the whole queue (that is just information). Publishing
 * without an explicit --limit does 2, and MAX_PER_RUN is a ceiling that --limit
 * cannot exceed.
 */
const MAX_PER_RUN = 3;
const DEFAULT_PUBLISH_LIMIT = 2;

/**
 * Minimum hours since the target's most recent post before publishing again.
 * 20 rather than 24 so "same time tomorrow" is never rejected by a few minutes,
 * while a second session on the same day is.
 */
const MIN_GAP_HOURS = 20;
const FORCE = args.includes('--force');

/**
 * Local record of what has been published, per target: the last publish time and
 * every slug sent. Gitignored.
 *
 * Both fields exist because dev.to's /api/articles CANNOT be trusted for either
 * question, and for a worse reason than lag. Measured 2026-08-16, seconds apart
 * against the identical URL:
 *
 *   one call  -> 27 articles, yesterday's guide present
 *   six calls -> 26 articles, yesterday's guide absent
 *
 * It is eventually-consistent across cache nodes, so a given request may or may
 * not see a recent article. That breaks dedupe (the guide was queued for a second
 * posting) and it breaks the cadence guard (which once read "last post 6 days ago"
 * minutes after publishing, and approved another batch).
 *
 * So both take the union of what the platform reports and what we recorded
 * ourselves. A missing file degrades to the remote view rather than failing.
 *
 * Shape: { target: { lastPublish: ISO, slugs: [...] } }. The older
 * { target: ISO } form is still read, so an existing file keeps working.
 */
const STATE_PATH = join(ROOT, '.syndicate-state.json');

function readState() {
  try {
    return JSON.parse(readFileSync(STATE_PATH, 'utf8'));
  } catch {
    return {};
  }
}

/** Normalise either state shape to { lastPublish, slugs }. */
function targetState(name) {
  const raw = readState()[name];
  if (!raw) return { lastPublish: null, slugs: [] };
  if (typeof raw === 'string') return { lastPublish: raw, slugs: [] };
  return { lastPublish: raw.lastPublish ?? null, slugs: raw.slugs ?? [] };
}

function recordPublish(targetName, slug) {
  const state = readState();
  const prev = targetState(targetName);
  state[targetName] = {
    lastPublish: new Date().toISOString(),
    slugs: [...new Set([...prev.slugs, slug])].filter(Boolean),
  };
  try {
    writeFileSync(STATE_PATH, JSON.stringify(state, null, 2) + '\n', 'utf8');
  } catch (err) {
    console.warn(`   (could not record publish: ${err.message})`);
  }
}
const requested = Number(flag('--limit', '0'));
const LIMIT = PUBLISH
  ? Math.min(requested || DEFAULT_PUBLISH_LIMIT, MAX_PER_RUN)
  : requested || Infinity;
if (PUBLISH && requested > MAX_PER_RUN) {
  console.log(`--limit ${requested} exceeds the ${MAX_PER_RUN}-per-run cap; using ${MAX_PER_RUN}.\n`);
}

/* ── frontmatter ─────────────────────────────────────────────────────────── */

/** Split YAML frontmatter from the body. Returns null when there is none. */
function split(src) {
  const m = src.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return null;
  const fm = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([a-zA-Z_]+):\s*(.*)$/);
    if (kv) fm[kv[1]] = kv[2].trim().replace(/^["']|["']$/g, '');
  }
  // tags: ["a", "b"] — the only array field we need.
  const tagLine = m[1].match(/^tags:\s*\[(.*)\]$/m);
  fm.tagList = tagLine
    ? tagLine[1].split(',').map((t) => t.trim().replace(/^["']|["']$/g, '')).filter(Boolean)
    : [];
  return { fm, body: m[2].trim() };
}

/** Lowercase, strip punctuation, collapse whitespace — matches devto-sync.mjs. */
const normalize = (s) =>
  s.toLowerCase().replace(/[‘’“”]/g, "'").replace(/[^a-z0-9]+/g, ' ').trim();

/**
 * Is `title` already present in `liveTitles`?
 *
 * Exact normalised equality is NOT enough, and the dry run proved it: the blog
 * post "Reading cron expressions: a field-by-field guide" is already on dev.to as
 * "Reading cron expressions" — the syndicated copy dropped the subtitle — so an
 * exact check queued it for a second posting.
 *
 * Same containment matcher devto-sync.mjs uses: score against the SHORTER title so
 * a dropped subtitle still matches, with a 3-shared-token floor so short titles
 * cannot collide on one common word ("cron" alone must not match every cron post).
 */
function alreadyPublished(title, liveNorms) {
  const n = normalize(title);
  if (liveNorms.has(n)) return true;
  const a = new Set(n.split(' '));
  for (const live of liveNorms) {
    const b = new Set(live.split(' '));
    const shared = [...a].filter((t) => b.has(t)).length;
    if (shared < 3) continue;
    if (shared / Math.min(a.size, b.size) >= 0.8) return true;
  }
  return false;
}

/**
 * Rewrite root-relative markdown targets to absolute opscanopy URLs.
 *
 * Matches `](/…)` in both images and links. Deliberately does NOT touch `](#…)`
 * anchors, `](http…)` absolutes, or `](//…)` protocol-relative URLs.
 */
function absolutise(md) {
  return md.replace(/\]\((\/(?!\/)[^)\s]*)/g, (_m, p) => `](${SITE}${p}`);
}

/* ── content sources ─────────────────────────────────────────────────────── */

async function loadPosts() {
  const out = [];

  const blogDir = join(ROOT, 'src/content/blog/en');
  for (const file of await readdir(blogDir)) {
    if (!file.endsWith('.md')) continue;
    const parsed = split(await readFile(join(blogDir, file), 'utf8'));
    if (!parsed || parsed.fm.draft === 'true') continue;
    const slug = basename(file, '.md');
    out.push({
      slug,
      kind: 'blog',
      title: parsed.fm.title,
      description: parsed.fm.description ?? '',
      tags: parsed.fm.tagList,
      canonical: `${SITE}/blog/${slug}/`,
      body: absolutise(parsed.body),
    });
  }

  /**
   * Practice-test CATEGORY hub pages (e.g. /tests/aws-devops-professional/).
   *
   * Only the category hubs, never the individual test-taking pages: those are
   * noindex and excluded from the sitemap, so linking to them from an external
   * platform would point people at a page search engines are told to ignore.
   *
   * Parsed from src/data/tests.ts with a regex rather than imported, because this
   * script is plain Node and the registry is TypeScript with a build-time
   * validation block that would need the whole toolchain to execute.
   */
  try {
    const src = await readFile(join(ROOT, 'src/data/tests.ts'), 'utf8');
    const block = src.slice(
      src.indexOf('export const categories'),
      src.indexOf('export const tests'),
    );
    for (const m of block.matchAll(
      /slug:\s*'([a-z0-9-]+)'[\s\S]*?name:\s*'([^']*)'[\s\S]*?description:\s*\n?\s*'([^']*)'[\s\S]*?status:\s*'(live|draft)'/g,
    )) {
      const [, slug, name, description, status] = m;
      if (status !== 'live') continue;
      out.push({
        slug,
        kind: 'test',
        title: name,
        description,
        tags: ['aws', 'devops', 'certification', 'career'],
        canonical: `${SITE}/tests/${slug}/`,
        // No prose body — a hub page is a link target, not an article. Article
        // targets skip these; link targets (Bluesky) post the card.
        body: '',
      });
    }
  } catch {
    // Registry missing or restructured — skip rather than fail the whole run.
  }

  const guidesRoot = join(ROOT, 'src/content/guides');
  for (const track of await readdir(guidesRoot)) {
    const dir = join(guidesRoot, track);
    if (!(await stat(dir)).isDirectory()) continue;
    for (const file of await readdir(dir)) {
      if (!file.endsWith('.md')) continue;
      const parsed = split(await readFile(join(dir, file), 'utf8'));
      if (!parsed || parsed.fm.draft === 'true') continue;
      const slug = basename(file, '.md');
      out.push({
        slug,
        kind: 'guide',
        title: parsed.fm.title,
        description: parsed.fm.metaDescription || parsed.fm.description || '',
        tags: parsed.fm.tagList,
        canonical: `${SITE}/learn/guides/${slug}/`,
        body: absolutise(parsed.body),
      });
    }
  }

  return out;
}

/* ── targets ─────────────────────────────────────────────────────────────── */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * dev.to / Forem. `canonical_url` is a documented first-class field here —
 * cross-posting with a canonical is an intended product feature, not a hack.
 *
 * DO NOT add Forem "subforems" (zeroday.forem.com, core.forem.com) as extra hosts.
 * They authenticate with the same api-key, which makes them look like free extra
 * audiences, but their API 301-redirects straight to dev.to:
 *
 *   zeroday.forem.com/api/articles -> 301 -> dev.to/api/articles
 *
 * One shared article pool, not separate publications. Posting to a subforem host
 * would just create another dev.to article — a duplicate, and a wasted slot
 * against the cadence limits. Checked 2026-08-15.
 */
function foremTarget({ name, host, username }) {
  return {
    name,
    key: () => process.env.DEVTO_API_KEY,
    keyName: 'DEVTO_API_KEY',
    /**
     * Use the AUTHENTICATED endpoint, not the public one.
     *
     * `/api/articles?username=` is eventually-consistent across cache nodes and
     * routinely omits recent posts. Measured 2026-08-16 against the identical URL
     * seconds apart: one call returned 27 articles including the newest, six
     * returned 26 without it. That caused a guide published the previous day to be
     * queued for a second posting.
     *
     * `/api/articles/me/all` with the api-key returned 28 items including the
     * newest on three consecutive calls. It is the same data the account owner
     * sees, so there is no cache tier in front of it — and it also surfaces
     * unpublished drafts, which the public listing cannot.
     */
    async listPublished() {
      const key = process.env.DEVTO_API_KEY;
      if (!key) throw new Error(`${name}: DEVTO_API_KEY required to list articles`);
      const res = await fetch(`https://${host}/api/articles/me/all?per_page=1000`, {
        headers: { 'api-key': key },
      });
      if (!res.ok) throw new Error(`${name}: list failed HTTP ${res.status}`);
      const arr = await res.json();
      // Stash timestamps for the cadence guard; the runner reads them separately.
      this._published = arr.map((a) => a.published_at).filter(Boolean);
      return arr.map((a) => a.title);
    },
    publishedTimestamps() {
      return this._published ?? [];
    },
    async create(post, key) {
      const res = await fetch(`https://${host}/api/articles`, {
        method: 'POST',
        headers: { 'api-key': key, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          article: {
            title: post.title,
            body_markdown: post.body,
            published: true,
            canonical_url: post.canonical,
            description: post.description.slice(0, 250) || undefined,
            tags: post.tags.slice(0, 4).map((t) => t.replace(/[^a-z0-9]/gi, '')),
          },
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        // dev.to's /api/articles listing lags behind publication by a minute or
        // two, so a run started right after a previous one can read a stale list
        // and re-attempt something that already exists. Forem then refuses it on
        // canonical-uniqueness or the five-minute title guard.
        //
        // That is the backstop working, not an error: the article IS published.
        // Reporting it as a failure would fail the scheduled drip job for doing
        // exactly the right thing.
        const msg = JSON.stringify(json);
        if (res.status === 422 && /already been taken|already been used/i.test(msg)) {
          const e = new Error('already published (Forem duplicate guard)');
          e.alreadyPublished = true;
          throw e;
        }
        throw new Error(`HTTP ${res.status}: ${msg.slice(0, 180)}`);
      }
      return json.url;
    },
    // Forem's ARTICLE-CREATION limiter is far stricter than its general
    // 10-req/30s API budget: measured in production, the third create inside
    // ~12s returned `429 {"error":"Rate limit reached, try again in 30 seconds"}`.
    // So the real constraint is roughly one new article per 30 seconds. 33s
    // leaves margin without being slow enough to matter — a 2-post drip run
    // takes about half a minute.
    delayMs: 33000,
  };
}

/**
 * Bluesky. Fundamentally different from Forem: this is a LINK BROADCAST, not
 * article syndication. No copy of the body is created, so there is no duplicate
 * content and canonical is meaningless here — the value is referral traffic
 * (links are nofollow) to a ~27.5M-MAU, dev-heavy audience.
 *
 * Bots are officially supported; Bluesky ships bot starter templates.
 *
 * Two things that bite:
 *   - Session creation is capped at 30/5min and 300/day, far tighter than the
 *     posting budget, so the JWT is created ONCE per run and reused. This is the
 *     limit people actually hit, not the post limit.
 *   - `text` is capped at 300 graphemes. The URL lives in the embed card, not the
 *     text, so we spend the whole budget on title + description.
 */
function blueskyTarget() {
  const HOST = 'https://bsky.social';
  let jwt = null;
  let did = null;

  /** Intl.Segmenter counts graphemes the way Bluesky does; .length would overcount emoji. */
  const graphemes = (s) => [...new Intl.Segmenter().segment(s)].length;
  function fit(title, description, max = 300) {
    if (graphemes(title) >= max) {
      return [...new Intl.Segmenter().segment(title)].slice(0, max - 1).map((g) => g.segment).join('') + '…';
    }
    const room = max - graphemes(title) - 2; // "\n\n"
    if (room < 24 || !description) return title;
    const segs = [...new Intl.Segmenter().segment(description)];
    const desc =
      segs.length <= room ? description : segs.slice(0, room - 1).map((g) => g.segment).join('') + '…';
    return `${title}\n\n${desc}`;
  }

  return {
    name: 'bluesky',
    key: () => (process.env.BLUESKY_HANDLE && process.env.BLUESKY_APP_PASSWORD ? 'set' : ''),
    keyName: 'BLUESKY_HANDLE + BLUESKY_APP_PASSWORD',

    async login() {
      if (jwt) return;
      const res = await fetch(`${HOST}/xrpc/com.atproto.server.createSession`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identifier: process.env.BLUESKY_HANDLE,
          password: process.env.BLUESKY_APP_PASSWORD,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(`bluesky login HTTP ${res.status}: ${JSON.stringify(json).slice(0, 160)}`);
      jwt = json.accessJwt;
      did = json.did;
    },

    /**
     * Dedupe by the URL already embedded in the author's own feed — stateless, so
     * it survives a fresh CI checkout with no cache. Returns canonical URLs, and
     * the runner compares those instead of titles for this target.
     */
    async listPublished() {
      if (!process.env.BLUESKY_HANDLE) return [];
      await this.login();
      const seen = [];
      const stamps = [];
      let cursor;
      for (let page = 0; page < 5; page++) {
        const u = new URL(`${HOST}/xrpc/app.bsky.feed.getAuthorFeed`);
        u.searchParams.set('actor', did);
        u.searchParams.set('limit', '100');
        if (cursor) u.searchParams.set('cursor', cursor);
        const res = await fetch(u, { headers: { Authorization: `Bearer ${jwt}` } });
        if (!res.ok) {
          // Failing the FIRST page must abort, not return an empty list.
          // Bluesky returned 502 on this endpoint during testing, and a silent
          // empty result makes every post look unpublished — with --publish that
          // is a re-post of things already live. Later pages failing is a partial
          // read, which is safe here because it only shrinks the "already
          // published" set for OLDER items we are not about to post anyway.
          if (page === 0) {
            throw new Error(
              `bluesky: getAuthorFeed HTTP ${res.status} — refusing to treat an ` +
                'unreadable feed as "nothing published yet"',
            );
          }
          break;
        }
        const json = await res.json();
        for (const item of json.feed ?? []) {
          const ext = item.post?.record?.embed?.external?.uri;
          if (ext) seen.push(ext);
          if (item.post?.record?.createdAt) stamps.push(item.post.record.createdAt);
        }
        cursor = json.cursor;
        if (!cursor) break;
      }
      this._published = stamps;
      return seen;
    },
    publishedTimestamps() {
      return this._published ?? [];
    },

    async create(post) {
      await this.login();
      const res = await fetch(`${HOST}/xrpc/com.atproto.repo.createRecord`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repo: did,
          collection: 'app.bsky.feed.post',
          record: {
            $type: 'app.bsky.feed.post',
            text: fit(post.title, post.description),
            createdAt: new Date().toISOString(),
            langs: ['en'],
            embed: {
              $type: 'app.bsky.embed.external',
              external: {
                uri: post.canonical,
                title: post.title.slice(0, 300),
                description: post.description.slice(0, 1000),
              },
            },
          },
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${JSON.stringify(json).slice(0, 180)}`);
      const rkey = String(json.uri || '').split('/').pop();
      return `https://bsky.app/profile/${process.env.BLUESKY_HANDLE}/post/${rkey}`;
    },

    // A post costs 3 points against 5,000/hour, so the budget is not the concern —
    // looking human is. One every few seconds, dripped by --limit.
    delayMs: 5000,
    // Compare canonical URLs rather than titles for this target.
    dedupeBy: 'canonical',
  };
}

const TARGETS = [
  foremTarget({ name: 'devto', host: 'dev.to', username: 'opscanopy' }),
  blueskyTarget(),
];

/* ── run ─────────────────────────────────────────────────────────────────── */

const posts = await loadPosts();

// Guard the transform that silently breaks every image if it regresses.
const unabsolutised = posts.filter((p) => /\]\(\/(?!\/)/.test(p.body));
if (unabsolutised.length) {
  throw new Error(
    `absolutise() missed ${unabsolutised.length} post(s): ${unabsolutised
      .map((p) => p.slug)
      .join(', ')}`,
  );
}
console.log(`${posts.length} local piece(s) loaded — all relative paths absolutised\n`);

let failed = 0;

for (const target of TARGETS) {
  if (ONLY_TARGET && target.name !== ONLY_TARGET) continue;

  // Article targets dedupe on title (fuzzily — syndicated copies drop subtitles).
  // Link-broadcast targets dedupe on the canonical URL they embedded, which is
  // exact and needs no fuzziness.
  const byUrl = target.dedupeBy === 'canonical';

  // A target that cannot tell us what it already has is a target we must not
  // publish to — without that list every piece looks unpublished. Skip it and
  // carry on with the others rather than crashing the whole run: one platform
  // being down should not stop the other from posting.
  let published;
  try {
    published = await target.listPublished();
  } catch (err) {
    console.log(`── ${target.name} ──`);
    console.log(`   SKIPPED: ${err.message}`);
    console.log('   Cannot verify what is already published, so nothing is sent.\n');
    failed++;
    continue;
  }

  const live = new Set(byUrl ? published.map((u) => u.replace(/\/$/, '')) : published.map(normalize));

  // Body-less entries (practice-test hub pages) are link targets only. Posting
  // one to an article platform would publish an empty article, so those targets
  // filter them out; link-broadcast targets keep them.
  let eligible = byUrl ? posts : posts.filter((p) => p.body.trim().length > 0);

  if (ONLY_SLUG) {
    const match = eligible.filter((p) => p.slug === ONLY_SLUG);
    if (!match.length) {
      const bodyless = posts.find((p) => p.slug === ONLY_SLUG && !p.body.trim());
      console.log(
        `   --only ${ONLY_SLUG}: ` +
          (bodyless
            ? 'that piece has no article body, so it can only go to a link target.'
            : 'no piece with that slug.'),
      );
      continue;
    }
    eligible = match;
  }

  // Union the remote view with our own record — the remote listing is
  // eventually-consistent and routinely omits recent posts (see STATE_PATH).
  const localSlugs = new Set(targetState(target.name).slugs);

  const pending = eligible.filter((p) => {
    if (localSlugs.has(p.slug)) return false;
    return byUrl ? !live.has(p.canonical.replace(/\/$/, '')) : !alreadyPublished(p.title, live);
  });

  console.log(`── ${target.name} ──`);
  console.log(`   ${live.size} already published · ${pending.length} to syndicate`);

  if (!pending.length) {
    console.log('   nothing to do\n');
    continue;
  }

  /**
   * Cadence guard — refuses to publish too soon after the last post.
   *
   * The real spam signal is SHAPE, not volume. This account's history was 20 posts
   * over 45 days — a healthy-looking 3.1/week — but spread across only FIVE active
   * days: 9, then 2, then 1, 1, and 7. Long silences punctuated by bursts is what a
   * bulk import looks like; a person writing looks like 2 posts on Tuesday and 2 on
   * Friday. Averages hide that completely, so this checks recency directly.
   *
   * Bypassable with --force, which prints loudly, because a legitimate reason to
   * override should still leave a trace in the log.
   */
  const stamps = (target.publishedTimestamps?.() ?? [])
    .map((t) => Date.parse(t))
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => b - a);

  // Trust whichever source saw a post most recently — see STATE_PATH above for
  // why the remote listing alone is not enough.
  const localLast = Date.parse(targetState(target.name).lastPublish ?? '');
  if (Number.isFinite(localLast)) stamps.push(localLast);
  stamps.sort((a, b) => b - a);

  if (stamps.length) {
    const hoursSince = (Date.now() - stamps[0]) / 3_600_000;
    const inLast24 = stamps.filter((t) => Date.now() - t < 86_400_000).length;
    const inLast7d = stamps.filter((t) => Date.now() - t < 7 * 86_400_000).length;
    console.log(
      `   last post ${hoursSince < 48 ? hoursSince.toFixed(1) + 'h ago' : Math.round(hoursSince / 24) + ' days ago'}` +
        ` · ${inLast24} in last 24h · ${inLast7d} in last 7d`,
    );

    if (PUBLISH && hoursSince < MIN_GAP_HOURS && !FORCE) {
      console.log(
        `   BLOCKED: only ${hoursSince.toFixed(1)}h since the last post ` +
          `(minimum ${MIN_GAP_HOURS}h).\n` +
          `   Two sessions in one day is the burst pattern this guard exists to stop.\n` +
          `   Come back tomorrow, or pass --force if you have a reason.\n`,
      );
      continue;
    }
    if (PUBLISH && hoursSince < MIN_GAP_HOURS && FORCE) {
      console.log(`   --force: overriding the ${MIN_GAP_HOURS}h minimum gap.\n`);
    }
  }

  const batch = pending.slice(0, LIMIT);
  if (batch.length < pending.length) {
    console.log(`   --limit ${LIMIT}: doing ${batch.length}, leaving ${pending.length - batch.length}`);
  }
  console.log('');

  const key = target.key();
  if (PUBLISH && !key) {
    console.error(`   ${target.keyName} is not set — skipping ${target.name}\n`);
    failed++;
    continue;
  }

  for (const post of batch) {
    console.log(`   ${PUBLISH ? 'PUBLISH' : 'would  '} ${post.title.slice(0, 62)}`);
    console.log(`           canonical: ${post.canonical}`);
    console.log(`           tags: ${post.tags.slice(0, 4).join(', ') || '(none)'}`);
    if (!PUBLISH) continue;
    try {
      const url = await target.create(post, key);
      console.log(`           LIVE: ${url}`);
      recordPublish(target.name, post.slug);
    } catch (err) {
      if (err.alreadyPublished) {
        console.log(`           SKIP: ${err.message}`);
      } else {
        failed++;
        console.error(`           FAILED: ${err.message}`);
      }
    }
    await sleep(target.delayMs);
  }
  console.log('');
}

if (!PUBLISH) {
  console.log('Dry run — pass --publish to post. Use --limit N to drip.');
}
if (failed) process.exitCode = 1;

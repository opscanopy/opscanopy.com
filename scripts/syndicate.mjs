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
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const SITE = 'https://opscanopy.com';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const args = process.argv.slice(2);
const PUBLISH = args.includes('--publish');
const flag = (name, fallback) => {
  const i = args.indexOf(name);
  return i !== -1 && args[i + 1] ? args[i + 1] : fallback;
};
const ONLY_TARGET = flag('--target', null);
const LIMIT = Number(flag('--limit', '0')) || Infinity;

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
 * Subforems (zeroday.forem.com, core.forem.com) run the same Rails app and accept
 * the SAME api-key, so they are the same adapter with a different host.
 */
function foremTarget({ name, host, username }) {
  return {
    name,
    key: () => process.env.DEVTO_API_KEY,
    keyName: 'DEVTO_API_KEY',
    async listPublished() {
      const res = await fetch(
        `https://${host}/api/articles?username=${encodeURIComponent(username)}&per_page=100`,
      );
      if (!res.ok) throw new Error(`${name}: list failed HTTP ${res.status}`);
      return (await res.json()).map((a) => a.title);
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
      let cursor;
      for (let page = 0; page < 5; page++) {
        const u = new URL(`${HOST}/xrpc/app.bsky.feed.getAuthorFeed`);
        u.searchParams.set('actor', did);
        u.searchParams.set('limit', '100');
        if (cursor) u.searchParams.set('cursor', cursor);
        const res = await fetch(u, { headers: { Authorization: `Bearer ${jwt}` } });
        if (!res.ok) break;
        const json = await res.json();
        for (const item of json.feed ?? []) {
          const ext = item.post?.record?.embed?.external?.uri;
          if (ext) seen.push(ext);
        }
        cursor = json.cursor;
        if (!cursor) break;
      }
      return seen;
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
  const published = await target.listPublished();
  const live = new Set(byUrl ? published.map((u) => u.replace(/\/$/, '')) : published.map(normalize));
  const pending = posts.filter((p) =>
    byUrl ? !live.has(p.canonical.replace(/\/$/, '')) : !alreadyPublished(p.title, live),
  );

  console.log(`── ${target.name} ──`);
  console.log(`   ${live.size} already published · ${pending.length} to syndicate`);

  if (!pending.length) {
    console.log('   nothing to do\n');
    continue;
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

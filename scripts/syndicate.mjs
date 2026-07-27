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
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${JSON.stringify(json).slice(0, 180)}`);
      return json.url;
    },
    // Forem rate-limits article creation to roughly 10 req/30s and separately
    // rejects a title reused within five minutes.
    delayMs: 4000,
  };
}

const TARGETS = [
  foremTarget({ name: 'devto', host: 'dev.to', username: 'opscanopy' }),
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

  const live = new Set((await target.listPublished()).map(normalize));
  const pending = posts.filter((p) => !alreadyPublished(p.title, live));

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
      failed++;
      console.error(`           FAILED: ${err.message}`);
    }
    await sleep(target.delayMs);
  }
  console.log('');
}

if (!PUBLISH) {
  console.log('Dry run — pass --publish to post. Use --limit N to drip.');
}
if (failed) process.exitCode = 1;

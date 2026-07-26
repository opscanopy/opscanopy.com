// Keep dev.to syndication canonically pointed back at opscanopy.com.
//
// WHY THIS EXISTS
// dev.to has far more domain authority than a young opscanopy.com. When the same article
// exists in both places and the dev.to copy does not declare `canonical_url` pointing home,
// dev.to outranks the original — the site competes against itself and loses. Every syndicated
// copy must canonicalise to the opscanopy URL.
//
// WHAT IT DOES
//   1. Fetches every published article for DEVTO_USERNAME (public API, no key needed).
//   2. Matches each one to a local post in src/content/blog/en/ by frontmatter title.
//   3. Reports the current vs. correct canonical_url.
//   4. With --apply, PUTs the corrected canonical_url (requires DEVTO_API_KEY).
//
// Dry-run by default. Nothing is written without --apply.
//
//   node scripts/devto-sync.mjs                  # report only
//   DEVTO_API_KEY=… node scripts/devto-sync.mjs --apply
//
// Zero dependencies: Node 22 built-in fetch + node: modules.

import { readdir, readFile } from 'node:fs/promises';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const SITE = 'https://opscanopy.com';
const USERNAME = process.env.DEVTO_USERNAME ?? 'opscanopy';
const API_KEY = process.env.DEVTO_API_KEY;
const APPLY = process.argv.includes('--apply');

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const blogDir = join(root, 'src', 'content', 'blog', 'en');

// --- Manual overrides for articles that are not 1:1 with a blog post -------------------
// Keyed by a distinctive lowercase substring of the dev.to title.
//
// `null` means "dev.to original — do not canonicalise". Only set a canonical when the two
// pages are genuinely the same article. Pointing canonical at a merely *related* page is
// wrong: search engines either ignore it or treat it as a bad signal, and it gains nothing.
// Both entries below were checked against their body text — they are dev.to originals that
// link to opscanopy, not reposts of it.
const OVERRIDES = {
  '90-day devops roadmap': null,
  '6 years of frontend': null,
};

// --- Load local blog posts -------------------------------------------------------------
/** Pull `title:` out of YAML frontmatter without a YAML dep. */
function frontmatterTitle(src) {
  const fm = src.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!fm) return null;
  const line = fm[1].match(/^title:\s*(.+)$/m);
  if (!line) return null;
  return line[1].trim().replace(/^["']|["']$/g, '');
}

/** Lowercase, strip punctuation and collapse whitespace so titles compare reliably. */
function normalize(s) {
  return s
    .toLowerCase()
    .replace(/[‘’“”]/g, "'")
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const posts = [];
for (const file of await readdir(blogDir)) {
  if (!file.endsWith('.md')) continue;
  const title = frontmatterTitle(await readFile(join(blogDir, file), 'utf8'));
  if (title) posts.push({ slug: basename(file, '.md'), title, norm: normalize(title) });
}

// --- Fetch dev.to articles --------------------------------------------------------------
const res = await fetch(
  `https://dev.to/api/articles?username=${encodeURIComponent(USERNAME)}&per_page=100`,
);
// Throw rather than process.exit() — see the note at the bottom of this file.
if (!res.ok) {
  throw new Error(`Failed to list articles for @${USERNAME} — HTTP ${res.status}`);
}
const articles = await res.json();

// --- Match ------------------------------------------------------------------------------
/**
 * Token-containment match. Scored against the SHORTER title so a syndicated headline that
 * drops the original's subtitle still matches — "Reading cron expressions" vs
 * "Reading cron expressions: a field-by-field guide" scores 1.0, where scoring against the
 * longer title would give 0.375 and miss it.
 *
 * Guarded by a 3-shared-token floor so short titles can't collide on one common word
 * (e.g. "cron" alone must not match every cron post).
 */
function bestMatch(devtoTitle) {
  const n = normalize(devtoTitle);
  let best = null;
  let bestScore = 0;
  for (const p of posts) {
    if (p.norm === n) return { post: p, score: 1 };
    const a = new Set(n.split(' '));
    const b = new Set(p.norm.split(' '));
    const shared = [...a].filter((t) => b.has(t)).length;
    if (shared < 3) continue;
    const score = shared / Math.min(a.size, b.size);
    if (score > bestScore) {
      bestScore = score;
      best = p;
    }
  }
  return bestScore >= 0.8 ? { post: best, score: bestScore } : null;
}

const plan = [];
for (const a of articles) {
  const overrideKey = Object.keys(OVERRIDES).find((k) => a.title.toLowerCase().includes(k));
  let target;

  if (overrideKey !== undefined) {
    const v = OVERRIDES[overrideKey];
    target = v === null ? null : `${SITE}${v}`;
  } else {
    const m = bestMatch(a.title);
    target = m ? `${SITE}/blog/${m.post.slug}/` : null;
  }

  const current = a.canonical_url ?? '';
  const pointsHome = current.startsWith(SITE);
  plan.push({
    id: a.id,
    title: a.title,
    url: a.url,
    current,
    target,
    needsFix: Boolean(target) && !pointsHome,
    unmatched: !target && !pointsHome,
  });
}

// --- Report -------------------------------------------------------------------------------
const fix = plan.filter((p) => p.needsFix);
const ok = plan.filter((p) => !p.needsFix && !p.unmatched);
const unmatched = plan.filter((p) => p.unmatched);

console.log(`\ndev.to canonical audit — @${USERNAME} (${articles.length} published)\n`);

for (const p of plan) {
  const flag = p.needsFix ? 'FIX ' : p.unmatched ? 'SKIP' : 'OK  ';
  console.log(`${flag} ${p.title.slice(0, 66)}`);
  if (p.needsFix) console.log(`       ${p.current || '(none)'}\n    -> ${p.target}`);
}

console.log(
  `\n${ok.length} already canonical · ${fix.length} need fixing · ${unmatched.length} no local match`,
);

if (unmatched.length) {
  console.log(
    '\nNo local match (dev.to originals, or add an entry to OVERRIDES if they should point somewhere):',
  );
  unmatched.forEach((p) => console.log(`  - ${p.title}`));
}

// Duplicate detection — two dev.to posts with the same target cannibalise each other.
const byTarget = new Map();
for (const p of plan) {
  if (!p.target) continue;
  byTarget.set(p.target, [...(byTarget.get(p.target) ?? []), p]);
}
const dupes = [...byTarget.entries()].filter(([, v]) => v.length > 1);
if (dupes.length) {
  console.log('\nDUPLICATES on dev.to — same target, delete or unpublish all but one:');
  for (const [target, group] of dupes) {
    console.log(`  ${target}`);
    group.forEach((p) => console.log(`    - ${p.url}`));
  }
}

// --- Apply ----------------------------------------------------------------------------------
// Set `process.exitCode` rather than calling `process.exit()`: on Windows, exiting while
// undici still holds a keep-alive socket trips a libuv assertion in win/async.c and the
// real exit code is replaced by 127 — which would make this look like a CI failure.
if (fix.length) {
  if (!APPLY) {
    console.log('\nDry run. Re-run with --apply (and DEVTO_API_KEY set) to write these changes.');
  } else if (!API_KEY) {
    console.error('\n--apply given but DEVTO_API_KEY is not set.');
    process.exitCode = 1;
  } else {
    let failed = 0;
    for (const p of fix) {
      const r = await fetch(`https://dev.to/api/articles/${p.id}`, {
        method: 'PUT',
        headers: { 'api-key': API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ article: { canonical_url: p.target } }),
      });
      if (r.ok) {
        console.log(`updated  ${p.title.slice(0, 60)}`);
      } else {
        failed++;
        console.error(
          `FAILED ${r.status}  ${p.title.slice(0, 60)}  ${await r.text().catch(() => '')}`,
        );
      }
      // dev.to rate-limits writes; ~1 req/s is comfortably under the limit.
      await new Promise((resolve) => setTimeout(resolve, 1100));
    }
    console.log(`\n${fix.length - failed}/${fix.length} updated.`);
    if (failed) process.exitCode = 1;
  }
}

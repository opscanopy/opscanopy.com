// Submit CHANGED canonical URLs from the production sitemap to IndexNow so Bing,
// Yandex and other participating engines re-crawl them quickly.
//
// What it does:
//   1. Reads ./dist/sitemap-0.xml (produced by `npm run build`).
//   2. Extracts every <loc> URL with its <lastmod> (ignoring hreflang alternates).
//   3. Diffs against the previous run's snapshot and submits only what changed.
//   4. POSTs them as a single JSON batch to https://api.indexnow.org/indexnow.
//
// WHY THE DIFF: re-submitting all 445 URLs on every deploy is a spam signal —
// it tells engines the whole site changed when almost none of it did, and it
// burns the daily quota. This became possible once scripts/gen-lastmod.mjs gave
// each URL a real date instead of the build timestamp; before that every URL
// looked new on every build and a diff was meaningless.
//
// The snapshot lives at .indexnow-state.json (gitignored). With no snapshot —
// first run, or a fresh CI checkout without the cache — it submits everything
// once, which is correct for a first announcement.
//
//   node scripts/indexnow.mjs            # changed URLs only
//   node scripts/indexnow.mjs --all      # force a full re-submit
//   node scripts/indexnow.mjs --dry-run  # print what would be sent
//
// Ownership is proven by the key file served at
//   https://opscanopy.com/a3f8c1d24b9e6705e2c8f4a17d093b6e.txt
// (committed at public/a3f8c1d24b9e6705e2c8f4a17d093b6e.txt).
//
// IMPORTANT: run this AFTER a production build *and* deploy — the URLs you
// submit must already be live, or engines may drop them. Typical flow:
//   npm run build && npm run deploy && npm run indexnow
//
// Zero external dependencies: uses Node 22 built-in fetch and node: modules.

import { readFile, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const KEY = 'a3f8c1d24b9e6705e2c8f4a17d093b6e';
const HOST = 'opscanopy.com';
const KEY_LOCATION = `https://${HOST}/${KEY}.txt`;
const ENDPOINT = 'https://api.indexnow.org/indexnow';
const MAX_URLS = 10000; // IndexNow caps a single submission at 10,000 URLs.

const FORCE_ALL = process.argv.includes('--all');
const DRY_RUN = process.argv.includes('--dry-run');

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const sitemapPath = join(ROOT, 'dist', 'sitemap-0.xml');
/** url -> lastmod from the previous successful run. Gitignored; cached in CI. */
const STATE_PATH = join(ROOT, '.indexnow-state.json');
/**
 * The URLs this run considered changed. Written for scripts/bing-submit.mjs,
 * which runs after this one: by then STATE_PATH has already been advanced, so
 * Bing cannot re-derive the diff itself. Handing over the explicit list keeps
 * the two submitters in lockstep.
 */
const CHANGED_PATH = join(ROOT, '.indexnow-changed.json');

let xml;
try {
  xml = await readFile(sitemapPath, 'utf8');
} catch (err) {
  if (err.code === 'ENOENT') {
    console.error(
      `Sitemap not found at ${sitemapPath}\n` +
        'Run `npm run build` first to generate dist/sitemap-0.xml.',
    );
  } else {
    console.error(`Failed to read sitemap: ${err.message}`);
  }
  process.exit(1);
}

// Match each <url> block so a <loc> stays paired with its own <lastmod> — the
// alternate hrefs inside <xhtml:link> are never captured, so each canonical URL
// appears exactly once.
const current = {};
for (const block of xml.matchAll(/<url>([\s\S]*?)<\/url>/g)) {
  const loc = block[1].match(/<loc>(.*?)<\/loc>/)?.[1]?.trim();
  if (!loc) continue;
  current[loc] = block[1].match(/<lastmod>(.*?)<\/lastmod>/)?.[1]?.trim() ?? '';
}

const urlList = Object.keys(current);
if (urlList.length === 0) {
  console.error('No <loc> URLs found in dist/sitemap-0.xml — nothing to submit.');
  process.exit(1);
}

// Previous snapshot, if any.
let previous = null;
try {
  previous = JSON.parse(await readFile(STATE_PATH, 'utf8'));
} catch {
  // Absent on the first run or a cold CI cache — handled below.
}

let changed;
if (FORCE_ALL || !previous) {
  changed = urlList;
  console.log(
    FORCE_ALL
      ? `--all: submitting all ${changed.length} URL(s).`
      : `No previous snapshot — submitting all ${changed.length} URL(s) (first run).`,
  );
} else {
  changed = urlList.filter((u) => previous[u] !== current[u]);
  const added = changed.filter((u) => !(u in previous)).length;
  console.log(
    `${changed.length} of ${urlList.length} URL(s) changed since the last run ` +
      `(${added} new, ${changed.length - added} updated).`,
  );
}

await writeFile(CHANGED_PATH, JSON.stringify(changed, null, 2) + '\n', 'utf8');

if (changed.length === 0) {
  console.log('Nothing changed — skipping IndexNow submission.');
  await writeFile(STATE_PATH, JSON.stringify(current, null, 2) + '\n', 'utf8');
  process.exit(0);
}

const batch = changed.slice(0, MAX_URLS);
if (changed.length > MAX_URLS) {
  console.warn(
    `${changed.length} URLs changed; submitting first ${MAX_URLS} (IndexNow limit).`,
  );
}

if (DRY_RUN) {
  console.log('\n--dry-run, would submit:');
  batch.forEach((u) => console.log('  ' + u));
  process.exit(0);
}

let res;
try {
  res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify({
      host: HOST,
      key: KEY,
      keyLocation: KEY_LOCATION,
      urlList: batch,
    }),
  });
} catch (err) {
  console.error(`IndexNow request failed: ${err.message}`);
  process.exit(1);
}

console.log(`Submitted ${batch.length} URL(s) to IndexNow — HTTP ${res.status}`);

// 200 OK and 202 Accepted both mean the submission was received successfully.
if (res.status === 200 || res.status === 202) {
  // Only advance the snapshot on success. A failed submission must stay
  // "pending" so the next run retries it instead of silently dropping it.
  await writeFile(STATE_PATH, JSON.stringify(current, null, 2) + '\n', 'utf8');
  process.exit(0);
}

const bodyText = await res.text().catch(() => '');
if (bodyText) console.error(`Response body: ${bodyText}`);
console.error('Snapshot not advanced — these URLs will be retried on the next run.');
process.exit(1);

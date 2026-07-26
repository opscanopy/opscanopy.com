// Submit changed URLs to the Bing Webmaster Tools URL Submission API.
//
// Complements scripts/indexnow.mjs rather than duplicating it. IndexNow is the
// open protocol (Bing, Yandex, Seznam, Naver); this is Bing's own endpoint,
// which historically acts faster on the pages it accepts. Bing's index also
// feeds ChatGPT Search, so it is worth the second call for a tool site.
//
// Reads .indexnow-changed.json — the explicit changed-URL list that
// indexnow.mjs writes — so both submitters send the identical set. Run it
// AFTER indexnow.mjs in the deploy chain.
//
// Requires BING_API_KEY (Bing Webmaster Tools -> Settings -> API access).
// Skips cleanly with exit 0 when the key is absent, so the deploy pipeline
// still succeeds before the secret is configured.
//
//   BING_API_KEY=… node scripts/bing-submit.mjs
//   node scripts/bing-submit.mjs --dry-run
//
// Quota note: new sites get a low daily quota (often ~10 URLs/day) that rises
// with history. Over-quota returns an error rather than partially succeeding,
// so this caps the batch and reports what it dropped instead of failing the
// deploy — IndexNow has already carried the same URLs.

import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SITE_URL = 'https://opscanopy.com';
const API_KEY = process.env.BING_API_KEY;
const DRY_RUN = process.argv.includes('--dry-run');
// Conservative cap. Bing allows up to 10k on established sites, but a young
// property's quota is far lower and exceeding it errors the whole batch.
const MAX_URLS = Number(process.env.BING_MAX_URLS ?? 100);

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const sitemapPath = join(ROOT, 'dist', 'sitemap-0.xml');
/** Changed-URL list handed over by scripts/indexnow.mjs. */
const CHANGED_PATH = join(ROOT, '.indexnow-changed.json');

if (!API_KEY && !DRY_RUN) {
  console.log('BING_API_KEY not set — skipping Bing submission.');
  process.exit(0);
}

let changed;
try {
  changed = JSON.parse(await readFile(CHANGED_PATH, 'utf8'));
} catch {
  // No handover file: indexnow.mjs did not run. Fall back to the full sitemap
  // so a standalone invocation still does something sensible.
  console.log(`No ${CHANGED_PATH} — falling back to every URL in the sitemap.`);
  let xml;
  try {
    xml = await readFile(sitemapPath, 'utf8');
  } catch (err) {
    console.error(
      err.code === 'ENOENT'
        ? `Sitemap not found at ${sitemapPath}. Run \`npm run build\` first.`
        : `Failed to read sitemap: ${err.message}`,
    );
    process.exit(1);
  }
  changed = [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map((m) => m[1].trim());
}

if (changed.length === 0) {
  console.log('Nothing changed — skipping Bing submission.');
  process.exit(0);
}

const batch = changed.slice(0, MAX_URLS);
if (changed.length > MAX_URLS) {
  console.warn(
    `${changed.length} URLs changed; submitting first ${MAX_URLS} to Bing ` +
      `(cap via BING_MAX_URLS). The rest were still sent via IndexNow.`,
  );
}

if (DRY_RUN) {
  console.log(`--dry-run, would submit ${batch.length} URL(s) to Bing:`);
  batch.forEach((u) => console.log('  ' + u));
  process.exit(0);
}

const endpoint = `https://ssl.bing.com/webmaster/api.svc/json/SubmitUrlbatch?apikey=${API_KEY}`;
let res;
try {
  res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ siteUrl: SITE_URL, urlList: batch }),
  });
} catch (err) {
  console.error(`Bing submission request failed: ${err.message}`);
  process.exit(1);
}

const body = await res.text().catch(() => '');

if (res.ok) {
  console.log(`Submitted ${batch.length} URL(s) to Bing — HTTP ${res.status}`);
  process.exit(0);
}

// Quota exhaustion is expected on a young property and must not fail a deploy:
// IndexNow already carried the same URLs, so Bing will still discover them.
console.error(`Bing submission returned HTTP ${res.status}: ${body}`);
if (/quota/i.test(body)) {
  console.warn('Quota exceeded — not treating as a deploy failure.');
  process.exit(0);
}
process.exit(1);

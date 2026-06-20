// Submit every canonical URL in the production sitemap to IndexNow so Bing,
// Yandex and other participating engines re-crawl changed pages quickly.
//
// What it does:
//   1. Reads ./dist/sitemap-0.xml (produced by `npm run build`).
//   2. Extracts every <loc> URL (ignoring hreflang <xhtml:link> alternates).
//   3. POSTs them as a single JSON batch to https://api.indexnow.org/indexnow.
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

import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const KEY = 'a3f8c1d24b9e6705e2c8f4a17d093b6e';
const HOST = 'opscanopy.com';
const KEY_LOCATION = `https://${HOST}/${KEY}.txt`;
const ENDPOINT = 'https://api.indexnow.org/indexnow';
const MAX_URLS = 10000; // IndexNow caps a single submission at 10,000 URLs.

const sitemapPath = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'dist',
  'sitemap-0.xml',
);

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

// Match only <loc>…</loc> entries — not the hreflang alternate hrefs — so each
// canonical URL is submitted exactly once.
const urlList = [
  ...xml.matchAll(/<loc>(.*?)<\/loc>/g),
].map((m) => m[1].trim());

if (urlList.length === 0) {
  console.error('No <loc> URLs found in dist/sitemap-0.xml — nothing to submit.');
  process.exit(1);
}

const batch = urlList.slice(0, MAX_URLS);
if (urlList.length > MAX_URLS) {
  console.warn(
    `Sitemap has ${urlList.length} URLs; submitting first ${MAX_URLS} (IndexNow limit).`,
  );
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
  process.exit(0);
}

const bodyText = await res.text().catch(() => '');
if (bodyText) console.error(`Response body: ${bodyText}`);
process.exit(1);

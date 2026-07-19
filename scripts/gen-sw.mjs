// Postbuild: generate dist/sw.js from scripts/sw.template.js. Stamps a
// git-short-SHA BUILD_ID (so every deploy gets its own precache name — the
// activate handler purges any older one) and discovers the /offline/ shell's
// ACTUAL content-hashed asset URLs by reading the built HTML, rather than
// guessing filenames, so the precache list can never drift from what the
// page really requests.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');

function buildId() {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
      cwd: ROOT,
      encoding: 'utf-8',
    }).trim();
  } catch {
    return 'dev';
  }
}

/** Every /_astro/* asset the built /offline/ page actually references. */
function discoverOfflineAssets() {
  const offlineHtmlPath = join(DIST, 'offline', 'index.html');
  if (!existsSync(offlineHtmlPath)) {
    console.error('gen-sw: dist/offline/index.html not found — run `npm run build` first.');
    process.exit(1);
  }
  const html = readFileSync(offlineHtmlPath, 'utf-8');
  const urls = new Set(['/offline/']);
  const re = /(?:href|src)="(\/_astro\/[^"]+)"/g;
  let match;
  while ((match = re.exec(html))) urls.add(match[1]);
  return Array.from(urls);
}

const id = buildId();
const precacheUrls = discoverOfflineAssets();
const template = readFileSync(join(ROOT, 'scripts/sw.template.js'), 'utf-8');
const output = template
  .replace(/__BUILD_ID__/g, id)
  .replace('__PRECACHE_URLS__', JSON.stringify(precacheUrls));

writeFileSync(join(DIST, 'sw.js'), output);
console.log(`gen-sw: wrote dist/sw.js (build ${id}, ${precacheUrls.length} precached URL(s))`);

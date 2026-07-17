#!/usr/bin/env node
/**
 * Trailing-slash guardrail (read-only diagnostic + build gate). Scans
 * dist/**\/*.html for every href="..." attribute — <a>, <link rel="canonical">,
 * <link rel="alternate" hreflang>, stylesheets/preloads alike, since they all
 * share the same attribute name — and flags any internal path that violates
 * localizeKey's contract (src/i18n/utils.ts, withTrailingSlash): every route
 * must end in "/" UNLESS it targets a file (last path segment has an
 * extension — this incidentally also exempts every hashed asset href) or
 * contains an in-page anchor ("#"). Astro's default build.format
 * ("directory") serves every route at a trailing slash; a bare path either
 * 404s or 308-redirects on the static host. This is a black-box check that
 * the CONTRACT held in the shipped output — it mirrors withTrailingSlash's
 * rules exactly rather than enforcing a stricter policy of its own.
 *
 * Usage:
 *   node scripts/check-trailing-slash.mjs             scan dist/, exit 1 on any offender
 *   node scripts/check-trailing-slash.mjs --self-test  verify this script's own logic (no dist needed)
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const ROOT = join(fileURLToPath(import.meta.url), '..', '..');
const DIST = join(ROOT, 'dist');
const HREF_RE = /\shref="([^"]*)"/g;

/**
 * Classify one href extracted from the built HTML. `skip: true` means the
 * href is exempt (external, an anchor, a file, or already slashed);
 * `skip: false` means it is an internal directory-style route missing its
 * required trailing slash.
 */
export function checkHref(href) {
  if (!href || href.startsWith('//') || !href.startsWith('/')) {
    return { skip: true, reason: 'external or non-rooted' };
  }
  if (href.includes('#')) return { skip: true, reason: 'anchor' };
  if (href.endsWith('/')) return { skip: true, reason: 'already slashed' };
  const lastSegment = href.slice(href.lastIndexOf('/') + 1);
  if (lastSegment.includes('.')) return { skip: true, reason: 'file' };
  return { skip: false, reason: 'missing trailing slash' };
}

function walkHtmlFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walkHtmlFiles(full));
    else if (extname(entry) === '.html') out.push(full);
  }
  return out;
}

function runSelfTest() {
  const cases = [
    ['/tools/', true],
    ['/tools', false],
    ['/', true],
    ['/de/', true],
    ['/de', false],
    ['/rss.xml', true],
    ['/mission-90/feed.xml', true],
    ['/_astro/chunk.Ab12Cd.js', true],
    ['/#why', true],
    ['/tools/#section', true],
    ['/tools#section', true], // permissive by design — matches withTrailingSlash's unconditional '#' skip
    ['#', true],
    ['https://example.com/foo', true],
    ['mailto:hello@opscanopy.com', true],
    ['//example.com/x', true],
  ];
  let failures = 0;
  for (const [href, expectSkip] of cases) {
    const { skip, reason } = checkHref(href);
    try {
      assert.equal(skip, expectSkip);
      console.log(`  ok    ${JSON.stringify(href).padEnd(28)} -> ${reason}`);
    } catch {
      failures++;
      console.error(`  FAIL  ${JSON.stringify(href).padEnd(28)} -> got skip=${skip}, expected skip=${expectSkip}`);
    }
  }
  console.log(failures ? `\nself-test: ${failures} FAILURE(S)` : '\nself-test: all 15 cases passed');
  process.exit(failures ? 1 : 0);
}

function runDistScan() {
  if (!existsSync(DIST)) {
    console.error('dist/ not found — run `npm run build` first.');
    process.exit(1);
  }
  const files = walkHtmlFiles(DIST);
  const offenders = new Map(); // href -> { count, firstFile }
  for (const file of files) {
    const html = readFileSync(file, 'utf-8');
    for (const match of html.matchAll(HREF_RE)) {
      const href = match[1];
      if (checkHref(href).skip) continue;
      const rec = offenders.get(href) ?? { count: 0, firstFile: file.slice(DIST.length) };
      rec.count++;
      offenders.set(href, rec);
    }
  }
  if (offenders.size) {
    const total = [...offenders.values()].reduce((n, r) => n + r.count, 0);
    console.error(`FAIL: ${offenders.size} distinct href(s) missing a trailing slash (${total} occurrence(s)):\n`);
    for (const [href, rec] of offenders) {
      console.error(`  ${href}  (${rec.count}x, e.g. ${rec.firstFile})`);
    }
  } else {
    console.log(`OK: scanned ${files.length} file(s), every internal href is correctly slashed.`);
  }
  process.exit(offenders.size ? 1 : 0);
}

if (process.argv.includes('--self-test')) runSelfTest();
else runDistScan();

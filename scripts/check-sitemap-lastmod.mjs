#!/usr/bin/env node
/**
 * Sitemap <lastmod> guardrail (postbuild gate). Every <lastmod> in
 * dist/sitemap-*.xml must be a real content date, which scripts/gen-lastmod.mjs
 * writes as a UTC day (T00:00:00.000Z). A value with a time of day is the build
 * clock leaking in: until 2026-09-26, 94 hub/info URLs carried the build time,
 * so every deploy told Google they had changed and taught it to ignore lastmod.
 * A URL with no known date must omit <lastmod>, never fall back to "now".
 *
 * Usage:
 *   node scripts/check-sitemap-lastmod.mjs          scan dist/
 *   node scripts/check-sitemap-lastmod.mjs <dir>    scan <dir> instead
 *   node scripts/check-sitemap-lastmod.mjs --self-test
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(import.meta.url), '..', '..');
const DAY = /^\d{4}-\d{2}-\d{2}T00:00:00\.000Z$/;

/** Returns "loc: lastmod" for every <url> whose lastmod is not a bare UTC day. */
export function offenders(xml) {
  const bad = [];
  for (const [, block] of xml.matchAll(/<url>([\s\S]*?)<\/url>/g)) {
    const lastmod = block.match(/<lastmod>(.*?)<\/lastmod>/)?.[1];
    if (lastmod !== undefined && !DAY.test(lastmod)) {
      bad.push(`${block.match(/<loc>(.*?)<\/loc>/)?.[1] ?? '?'}: ${lastmod}`);
    }
  }
  return bad;
}

if (process.argv[2] === '--self-test') {
  const cases = [
    ['<url><loc>a</loc><lastmod>2026-09-22T00:00:00.000Z</lastmod></url>', 0],
    ['<url><loc>a</loc></url>', 0],
    ['<url><loc>a</loc><lastmod>2026-09-23T17:52:15.593Z</lastmod></url>', 1],
    ['<url><loc>a</loc><lastmod>2026-09-23</lastmod></url><url><loc>b</loc><lastmod>x</lastmod></url>', 2],
  ];
  const failed = cases.filter(([xml, n]) => offenders(xml).length !== n);
  if (failed.length) {
    console.error(`FAIL: check-sitemap-lastmod self-test, ${failed.length} case(s) wrong`);
    process.exit(1);
  }
  console.log(`OK: check-sitemap-lastmod self-test, all ${cases.length} cases`);
  process.exit(0);
}

const DIST = process.argv[2] ? resolve(process.argv[2]) : join(ROOT, 'dist');
if (!existsSync(DIST)) {
  console.error(`FAIL: ${DIST} does not exist — run the build first.`);
  process.exit(1);
}
const maps = readdirSync(DIST).filter((f) => /^sitemap-\d+\.xml$/.test(f));
if (!maps.length) {
  console.error(`FAIL: no sitemap-N.xml in ${DIST}.`);
  process.exit(1);
}
const bad = maps.flatMap((f) => offenders(readFileSync(join(DIST, f), 'utf8')));
if (bad.length) {
  console.error(`FAIL: ${bad.length} sitemap <lastmod> value(s) are not a content date (build clock?):`);
  for (const b of bad.slice(0, 20)) console.error(`  ${b}`);
  if (bad.length > 20) console.error(`  … and ${bad.length - 20} more`);
  process.exit(1);
}
console.log(`OK: every <lastmod> in ${maps.join(', ')} is a content date.`);

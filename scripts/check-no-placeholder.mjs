#!/usr/bin/env node
/**
 * No-fabrication deploy gate. Scans dist/**\/*.html for the literal
 * `[PLACEHOLDER` sentinel used on /about (owner bios) and /verify-ai
 * (author-reproduced AI transcripts) — content that must never ship until a
 * human replaces it with the real thing, per the project's no-fabrication
 * rule. Wired as `predeploy` (not `postbuild`): a LOCAL build with
 * placeholders still in place must succeed so the team can keep working;
 * only `npm run deploy` is blocked.
 *
 * Usage:
 *   node scripts/check-no-placeholder.mjs             scan dist/, exit 1 on any occurrence
 *   node scripts/check-no-placeholder.mjs --self-test  verify this script's own logic (no dist needed)
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const ROOT = join(fileURLToPath(import.meta.url), '..', '..');
const DIST = join(ROOT, 'dist');
const SENTINEL = '[PLACEHOLDER';

function walkHtmlFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walkHtmlFiles(full));
    else if (extname(entry) === '.html') out.push(full);
  }
  return out;
}

/** Count occurrences of the sentinel in one HTML string. */
export function countPlaceholders(html) {
  let count = 0;
  let from = 0;
  for (;;) {
    const idx = html.indexOf(SENTINEL, from);
    if (idx === -1) break;
    count++;
    from = idx + SENTINEL.length;
  }
  return count;
}

function runSelfTest() {
  const cases = [
    ['<p>All real copy, nothing bracketed.</p>', 0],
    ['<p>[PLACEHOLDER: fill this in]</p>', 1],
    ['<p>[PLACEHOLDER: one] and [PLACEHOLDER: two]</p>', 2],
    ['<p>placeholder without brackets is fine</p>', 0],
  ];
  let failures = 0;
  for (const [html, expected] of cases) {
    const got = countPlaceholders(html);
    try {
      assert.equal(got, expected);
      console.log(`  ok    ${JSON.stringify(html).slice(0, 40).padEnd(42)} -> ${got}`);
    } catch {
      failures++;
      console.error(`  FAIL  ${JSON.stringify(html).slice(0, 40)} -> got ${got}, expected ${expected}`);
    }
  }
  console.log(failures ? `\nself-test: ${failures} FAILURE(S)` : '\nself-test: all 4 cases passed');
  process.exit(failures ? 1 : 0);
}

function runDistScan() {
  if (!existsSync(DIST)) {
    console.error('dist/ not found — run `npm run build` first.');
    process.exit(1);
  }
  const files = walkHtmlFiles(DIST);
  const offenders = [];
  for (const file of files) {
    const html = readFileSync(file, 'utf-8');
    const count = countPlaceholders(html);
    if (count > 0) offenders.push({ file: file.slice(DIST.length), count });
  }
  if (offenders.length) {
    const total = offenders.reduce((n, o) => n + o.count, 0);
    console.error(
      `FAIL: ${SENTINEL}...] found ${total} time(s) across ${offenders.length} page(s) — ` +
        `deploy blocked until a human replaces this content:\n`,
    );
    for (const o of offenders) console.error(`  ${o.file}  (${o.count}x)`);
  } else {
    console.log(`OK: scanned ${files.length} file(s), no unresolved ${SENTINEL}...] sentinels.`);
  }
  process.exit(offenders.length ? 1 : 0);
}

if (process.argv.includes('--self-test')) runSelfTest();
else runDistScan();

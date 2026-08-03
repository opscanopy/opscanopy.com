#!/usr/bin/env node
/**
 * Postbuild injector: replaces the `{{SCRIPT_HASHES}}` marker in dist/_headers
 * with a sha256 hash for every executable inline <script> the build emitted, so
 * the Content-Security-Policy can drop 'unsafe-inline'.
 *
 * WHY THIS EXISTS
 *
 * `script-src 'self' 'unsafe-inline'` contributes nothing against script
 * injection — it is a transport policy with an XSS-shaped hole. That matters
 * more than usual here: this site stores tool input in localStorage
 * (oc-last-v1, oc-snap-v1), so any injected script on the origin can read it.
 *
 * WHY A POSTBUILD SCRIPT AND NOT astro.config `security.csp`
 *
 * Astro's built-in CSP emits a <meta http-equiv> tag. A meta CSP cannot carry
 * `frame-ancestors`, so the policy would end up split across a meta tag and
 * this header file, and browsers enforce the INTERSECTION of both — a
 * maintenance trap where tightening one silently breaks the other. One policy,
 * one owner: this file.
 *
 * WHY IT FAILS THE BUILD RATHER THAN DEGRADING
 *
 * A hash-based CSP only works if the inline set is small and deterministic. If
 * someone adds per-page dynamic inline JS the set becomes unbounded, and the
 * honest outcome is a loud build failure, not a policy that silently stops
 * covering some pages. Same reasoning as inject-cm-modulepreload.mjs.
 *
 * NOTE: because public/_headers ships with the marker in place, a deploy that
 * skipped postbuild would serve a CSP containing a literal `{{SCRIPT_HASHES}}`
 * token. That is invalid source-expression syntax, so browsers block inline
 * scripts and the site is visibly broken in preview — it fails CLOSED, which is
 * the right direction. (CLAUDE.md already forbids bare `astro build` for
 * anything that gets served.)
 *
 * Usage: node scripts/inject-csp-hashes.mjs
 * (chained after pagefind / check-trailing-slash / inject-cm-modulepreload)
 */

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const DIST = resolve('dist');
const HEADERS = join(DIST, '_headers');
const MARKER = '{{SCRIPT_HASHES}}';

/**
 * Upper bound on distinct inline scripts. The build currently emits 11 (theme
 * no-flash, the gtag shim, SW registration, nav, lang-switcher, the command
 * palette opener, and five page-specific islands). A jump past this means
 * something started emitting per-page inline JS, which hashing cannot cover.
 */
const MAX_HASHES = 24;
/** Below this, the extractor has almost certainly stopped matching. */
const MIN_HASHES = 3;

/** Script types the browser executes; everything else (JSON-LD) is data. */
const EXECUTABLE_TYPES = new Set(['', 'text/javascript', 'module', 'application/javascript']);

function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}

async function htmlFiles(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await htmlFiles(p)));
    else if (entry.name.endsWith('.html')) out.push(p);
  }
  return out;
}

/**
 * Every executable inline script body in `html`.
 *
 * Index-scanning rather than one non-greedy regex: a `[\s\S]*?` body match over
 * ~500 minified pages backtracks badly enough to take minutes.
 */
function inlineScriptBodies(html) {
  const bodies = [];
  let pos = 0;
  for (;;) {
    const start = html.indexOf('<script', pos);
    if (start === -1) break;
    const gt = html.indexOf('>', start);
    if (gt === -1) break;
    const end = html.indexOf('</script>', gt);
    if (end === -1) break;

    const attrs = html.slice(start + '<script'.length, gt);
    const body = html.slice(gt + 1, end);
    pos = end + '</script>'.length;

    if (/\bsrc\s*=/i.test(attrs)) continue; // external — covered by 'self'
    const typeMatch = /\btype\s*=\s*["']([^"']+)["']/i.exec(attrs);
    const type = (typeMatch?.[1] ?? '').toLowerCase();
    if (!EXECUTABLE_TYPES.has(type)) continue; // application/ld+json etc.
    bodies.push(body);
  }
  return bodies;
}

/** CSP hashes the RAW source text between the tags — no trimming. */
function cspHash(body) {
  return `'sha256-${createHash('sha256').update(body, 'utf8').digest('base64')}'`;
}

async function main() {
  let pages;
  try {
    pages = await htmlFiles(DIST);
  } catch (e) {
    fail(`could not read ${DIST} — run this after astro build. (${e.message})`);
  }
  if (pages.length === 0) fail(`no .html files under ${DIST}.`);

  const hashes = new Set();
  for (const page of pages) {
    for (const body of inlineScriptBodies(readFileSync(page, 'utf8'))) {
      hashes.add(cspHash(body));
    }
  }

  if (hashes.size < MIN_HASHES) {
    fail(
      `only ${hashes.size} inline script(s) found across ${pages.length} page(s) — expected at least ${MIN_HASHES}. ` +
        'The extractor has probably stopped matching; a CSP built from this would block real scripts.',
    );
  }
  if (hashes.size > MAX_HASHES) {
    fail(
      `${hashes.size} distinct inline scripts found (cap ${MAX_HASHES}). Something is emitting PER-PAGE inline ` +
        'JavaScript, which a hash-based CSP cannot cover — the set grows without bound. Find the change and make ' +
        'the script external or deterministic, or raise MAX_HASHES here if the growth is genuinely finite.',
    );
  }

  let headers;
  try {
    headers = readFileSync(HEADERS, 'utf8');
  } catch {
    fail(`${HEADERS} is missing — public/_headers should be copied into dist by the build.`);
  }
  if (!headers.includes(MARKER)) {
    fail(
      `${MARKER} not found in ${HEADERS}. public/_headers must keep the marker inside its script-src so this ` +
        'script knows where to write the hashes.',
    );
  }

  // Sorted so the emitted header is byte-stable across builds; an unstable
  // header would churn the deploy diff for no reason.
  const sorted = [...hashes].sort();
  // replace(), not replaceAll(): exactly one marker is expected, and a second
  // occurrence (e.g. a comment that names it) would otherwise get a copy of
  // every hash inlined into it.
  const occurrences = headers.split(MARKER).length - 1;
  if (occurrences !== 1) {
    fail(
      `expected exactly 1 ${MARKER} in ${HEADERS}, found ${occurrences}. Reword any comment that names the ` +
        'marker literally — only the policy line should carry it.',
    );
  }
  writeFileSync(HEADERS, headers.replace(MARKER, sorted.join(' ')), 'utf8');

  console.log(
    `OK: injected ${sorted.length} CSP script hash(es) into dist/_headers (scanned ${pages.length} page(s)).`,
  );
}

await main();

#!/usr/bin/env node
/**
 * Emit an explicit 301 for every directory URL, appended to dist/_redirects.
 *
 * Cloudflare Static Assets normalises a missing trailing slash itself, but it
 * answers with a 307 and the status code is not configurable (`html_handling`
 * offers auto- / force- / drop-trailing-slash / none, all of them temporary).
 * A permanent redirect is the correct signal for a URL shape that will never
 * move back, so we state it ourselves: `_redirects` is evaluated with the
 * top-most matching rule winning, and supports 301.
 *
 * Loop safety: every generated rule maps `/x` (no slash) to `/x/` (slash), and
 * `/x/` is a real asset that is served, never redirected — so the pair cannot
 * cycle. If Cloudflare's own html_handling happens to run first, these rules
 * are simply unused, which is harmless.
 *
 * Limits (Cloudflare, documented): 2,000 static + 100 dynamic rules, 2,100
 * total. Every rule generated here is static (no `*`, no `:splat`), so the
 * hand-written dynamic rules in public/_redirects keep their budget. The build
 * fails rather than silently truncating if either ceiling is approached.
 */
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const DIST = resolve('dist');
const REDIRECTS = join(DIST, '_redirects');
const MARKER = '# --- generated: trailing-slash 301s (scripts/gen-slash-redirects.mjs) ---';
const MAX_STATIC = 1900;
const MAX_DYNAMIC = 100;

/** Every directory under dist/ that serves an index.html, as a URL path. */
function directoryRoutes(dir = DIST, prefix = '') {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    // Dotted segments are asset buckets (_astro, .well-known) or filenames.
    if (entry.name.startsWith('.') || entry.name.startsWith('_')) continue;
    const path = `${prefix}/${entry.name}`;
    const full = join(dir, entry.name);
    if (existsSync(join(full, 'index.html'))) out.push(path);
    out.push(...directoryRoutes(full, path));
  }
  return out;
}

function main() {
  if (!existsSync(REDIRECTS)) {
    console.error(`gen-slash-redirects: ${REDIRECTS} not found — did the build copy public/_redirects?`);
    process.exit(1);
  }

  const existing = readFileSync(REDIRECTS, 'utf-8');
  // Idempotent: drop any previously generated block before appending a new one.
  const base = existing.split(MARKER)[0].trimEnd();

  const routes = directoryRoutes().sort();
  const rules = routes.map((p) => `${p}  ${p}/  301`);

  const handWritten = base
    .split('\n')
    .filter((l) => l.trim() && !l.trim().startsWith('#'));
  const handDynamic = handWritten.filter((l) => l.includes('*') || l.includes(':splat')).length;
  const handStatic = handWritten.length - handDynamic;
  const totalStatic = handStatic + rules.length;

  if (totalStatic > MAX_STATIC) {
    console.error(
      `gen-slash-redirects: ${totalStatic} static rules exceeds the ${MAX_STATIC} guardrail ` +
        `(Cloudflare's hard limit is 2,000). Narrow the generated set rather than raising this blindly.`,
    );
    process.exit(1);
  }
  if (handDynamic > MAX_DYNAMIC) {
    console.error(`gen-slash-redirects: ${handDynamic} dynamic rules exceeds Cloudflare's ${MAX_DYNAMIC} limit.`);
    process.exit(1);
  }

  writeFileSync(REDIRECTS, `${base}\n\n${MARKER}\n${rules.join('\n')}\n`, 'utf-8');
  console.log(
    `OK: wrote ${rules.length} trailing-slash 301(s) to dist/_redirects ` +
      `(${totalStatic}/${MAX_STATIC} static, ${handDynamic}/${MAX_DYNAMIC} dynamic).`,
  );
}

main();

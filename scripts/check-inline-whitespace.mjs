#!/usr/bin/env node
/**
 * Inline-whitespace guardrail (read-only diagnostic + build gate). Scans
 * dist/**\/*.html for prose where a word runs straight into an inline tag —
 * "like<span class="code-mono">", "the<a class="link-inline">". That is what
 * Astro 7's default `compressHTML: 'jsx'` does to source authored against
 * Astro 6: it drops the newline between text and an inline element, so the
 * rendered page reads "likethis". astro.config.mjs sets `compressHTML: true`
 * (Astro 6's lossless behaviour); this script proves the shipped output held.
 *
 * Two tiers:
 *   - HARD FAIL on the site's own inline-code and inline-link classes, which
 *     never legitimately abut a letter.
 *   - WARN only on bare <code>/<strong>/<em>/<a> boundaries. German compounds
 *     ("<code>unwrap</code>en", "Sicherheits</strong>fehler") are real prose,
 *     so these are reported for a human to look at, never fail the build.
 *
 * <script>, <style> and <pre> contents are stripped before matching — code
 * samples and minified JS are not prose.
 *
 * Usage:
 *   node scripts/check-inline-whitespace.mjs          scan dist/, exit 1 on any hard offender
 *   node scripts/check-inline-whitespace.mjs <dir>    scan <dir> instead
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(import.meta.url), '..', '..');
const DIST = process.argv[2] ? resolve(process.argv[2]) : join(ROOT, 'dist');

const HARD_RE = /[a-z]<(span class="code-mono|a class="link-inline)/g;
const WARN_RES = [/[a-z]<(code|strong|em)[ >]/g, /<\/(a|code|strong|em)>[a-z]/g];
const STRIP_RE = /<(script|style|pre)\b[^>]*>[\s\S]*?<\/\1>/gi;

const HARD_LIST_CAP = 40;
const WARN_LIST_CAP = 15;

function walkHtmlFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walkHtmlFiles(full));
    else if (extname(entry) === '.html') out.push(full);
  }
  return out;
}

/** ~30 chars either side of a match, whitespace collapsed, for a one-line report. */
function snippet(html, index) {
  return html.slice(Math.max(0, index - 30), index + 40).replace(/\s+/g, ' ');
}

/** Every match of `re` in `html` as [index, snippet]. */
function findAll(html, re) {
  return [...html.matchAll(re)].map((m) => [m.index, snippet(html, m.index)]);
}

function run() {
  if (!existsSync(DIST)) {
    console.error(`${DIST} not found — run \`npm run build\` first.`);
    process.exit(1);
  }
  const files = walkHtmlFiles(DIST);
  const hard = []; // { file, count, first }
  const warn = [];
  let hardTotal = 0;
  let warnTotal = 0;
  for (const file of files) {
    const html = readFileSync(file, 'utf-8').replace(STRIP_RE, '');
    const rel = file.slice(DIST.length);
    const h = findAll(html, HARD_RE);
    if (h.length) {
      hard.push({ file: rel, count: h.length, first: h[0][1] });
      hardTotal += h.length;
    }
    const w = WARN_RES.flatMap((re) => findAll(html, re));
    if (w.length) {
      warn.push({ file: rel, count: w.length, first: w[0][1] });
      warnTotal += w.length;
    }
  }

  if (warn.length) {
    console.warn(
      `WARN: ${warnTotal} word/inline-tag boundar${warnTotal === 1 ? 'y' : 'ies'} in ${warn.length} file(s) ` +
        `(often legitimate compounds — review, not a failure):`,
    );
    for (const r of warn.slice(0, WARN_LIST_CAP)) console.warn(`  ${r.file}  (${r.count}x)  …${r.first}…`);
    if (warn.length > WARN_LIST_CAP) console.warn(`  … and ${warn.length - WARN_LIST_CAP} more file(s)`);
  }

  if (hard.length) {
    console.error(
      `\nFAIL: ${hardTotal} word(s) run into inline code/link markup in ${hard.length} file(s) ` +
        `— is compressHTML still \`true\` in astro.config.mjs?\n`,
    );
    for (const r of hard.slice(0, HARD_LIST_CAP)) console.error(`  ${r.file}  (${r.count}x)  …${r.first}…`);
    if (hard.length > HARD_LIST_CAP) console.error(`  … and ${hard.length - HARD_LIST_CAP} more file(s)`);
    process.exit(1);
  }
  console.log(`OK: scanned ${files.length} file(s), no word runs into inline code/link markup.`);
  process.exit(0);
}

run();

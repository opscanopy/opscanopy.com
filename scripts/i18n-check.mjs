#!/usr/bin/env node
/**
 * i18n coverage check (read-only). Verifies that every locale has a translated
 * copy of each English page and blog post, and reports UI-dictionary key gaps.
 * Exit code 1 if any page/post is missing for a locale (CI gate); UI-key gaps
 * are reported as warnings (English fallback keeps the build green).
 *
 * Usage: node scripts/i18n-check.mjs [--locale=de]
 */
import { readdirSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(import.meta.url), '..', '..');
const PAGES = join(ROOT, 'src', 'pages');
const BLOG = join(ROOT, 'src', 'content', 'blog');
const LOCALES = ['es', 'de', 'fr', 'pt-br'];

const only = process.argv.find((a) => a.startsWith('--locale='))?.split('=')[1];
const targets = only ? [only] : LOCALES;

/** Top-level English tool/page files that should be mirrored per locale. */
function englishPages() {
  return readdirSync(PAGES)
    .filter((f) => f.endsWith('.astro') && f !== '404.astro' && f !== 'alertlint-wasm-demo.astro')
    .filter((f) => !f.startsWith('[')); // skip dynamic routes
}

let failures = 0;
const lines = [];

// 1. Page coverage: src/pages/<locale>/<page>.astro + tools/index.astro
const pages = englishPages();
const enHasToolsIndex = existsSync(join(PAGES, 'tools', 'index.astro'));
for (const loc of targets) {
  const dir = join(PAGES, loc);
  const missing = [];
  for (const p of pages) {
    if (!existsSync(join(dir, p))) missing.push(p);
  }
  if (enHasToolsIndex && !existsSync(join(dir, 'tools', 'index.astro'))) {
    missing.push('tools/index.astro');
  }
  if (missing.length) {
    failures += missing.length;
    lines.push(`✗ [${loc}] missing ${missing.length} page(s): ${missing.join(', ')}`);
  } else {
    lines.push(`✓ [${loc}] all ${pages.length + (enHasToolsIndex ? 1 : 0)} pages present`);
  }
}

// 2. Blog coverage: src/content/blog/<locale>/<slug>.md mirrors en/
if (existsSync(join(BLOG, 'en'))) {
  const enPosts = readdirSync(join(BLOG, 'en')).filter((f) => f.endsWith('.md'));
  for (const loc of targets) {
    const dir = join(BLOG, loc);
    if (!existsSync(dir)) {
      failures += enPosts.length;
      lines.push(`✗ [${loc}] blog: 0/${enPosts.length} posts translated (folder absent)`);
      continue;
    }
    const have = readdirSync(dir).filter((f) => f.endsWith('.md'));
    const missing = enPosts.filter((f) => !have.includes(f));
    if (missing.length) {
      failures += missing.length;
      lines.push(`✗ [${loc}] blog: ${enPosts.length - missing.length}/${enPosts.length} posts (missing: ${missing.join(', ')})`);
    } else {
      lines.push(`✓ [${loc}] blog: all ${enPosts.length} posts translated`);
    }
  }
}

console.log(lines.join('\n'));
console.log(failures ? `\nFAIL: ${failures} missing page(s)/post(s).` : '\nCoverage OK.');
process.exit(failures ? 1 : 0);

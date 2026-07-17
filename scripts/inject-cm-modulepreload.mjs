#!/usr/bin/env node
/**
 * Postbuild injector: adds <link rel="modulepreload"> hints for each
 * CodeMirror playground's shared vendor chunks, on every page that uses one.
 *
 * CodeMirror is dynamically imported inside each playground's init() (so the
 * ~200KB runtime code-splits away from the page shell — see CLAUDE.md), but
 * that means the browser only discovers those chunks AFTER downloading and
 * executing the page's own script: page load → page script → chunk fetch is
 * a full extra round-trip on top of what's actually needed. A static
 * modulepreload hint lets the browser start fetching the CodeMirror chunks
 * during initial HTML parsing instead.
 *
 * Playground components are discovered dynamically (grep src/components for
 * an `@codemirror/state` import) rather than hardcoded, specifically so this
 * script can never go stale the way CLAUDE.md's old "9 tools" count did as
 * more playgrounds adopted CodeMirror.
 *
 * CodeMirror-chunk identification: Vite/Rollup names every `@codemirror/*`
 * package's own bundle `index.<hash>.js` (their npm entry file's basename),
 * while each playground's first-party `engine`/`examples` modules keep their
 * own source basename — so filtering a playground's dynamic imports to
 * `index.*` cleanly isolates the CodeMirror set with no hash hardcoding.
 * Cross-checked against a literal "cm-editor" string search (CodeMirror's
 * own editor-root CSS class) as a second, independent signal that the
 * classification is still correct.
 *
 * Usage: node scripts/inject-cm-modulepreload.mjs
 * (chained after pagefind + check-trailing-slash in postbuild)
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(import.meta.url), '..', '..');
const DIST = join(ROOT, 'dist');
const ASTRO_DIR = join(DIST, '_astro');
const COMPONENTS_DIR = join(ROOT, 'src', 'components');

const SCRIPT_SRC_RE = /<script[^>]*type="module"[^>]*src="([^"]+)"/g;
const IMPORT_RE = /import\("\.\/([^"]+)"\)/g;

/** Playground component basenames (no .astro) that import @codemirror/state
 *  in their frontmatter — discovered fresh every run, never hardcoded. */
function discoverCmPlaygrounds() {
  return readdirSync(COMPONENTS_DIR)
    .filter((f) => f.endsWith('.astro'))
    .filter((f) => readFileSync(join(COMPONENTS_DIR, f), 'utf-8').includes('@codemirror/state'))
    .map((f) => f.replace(/\.astro$/, ''));
}

function walkHtmlFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkHtmlFiles(full));
    else if (entry.name === 'index.html') out.push(full);
  }
  return out;
}

function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}

function main() {
  const playgrounds = discoverCmPlaygrounds();
  if (playgrounds.length === 0) {
    fail('no CodeMirror playground components found via an @codemirror/state import — check src/components/.');
  }

  const allChunkFiles = readdirSync(ASTRO_DIR).filter((f) => f.endsWith('.js'));
  const hasMarkerChunk = allChunkFiles.some((f) => readFileSync(join(ASTRO_DIR, f), 'utf-8').includes('cm-editor'));
  if (!hasMarkerChunk) {
    fail('no compiled chunk contains the "cm-editor" marker string — CodeMirror chunk detection may be broken (library upgrade?).');
  }

  // One CodeMirror chunk set per playground (shared across every locale that
  // uses it — same compiled script, same vendor deps).
  const cmChunksByPlayground = new Map();
  for (const name of playgrounds) {
    const scriptChunk = allChunkFiles.find((f) => f.startsWith(`${name}.astro_astro_type_script`));
    if (!scriptChunk) continue;
    const content = readFileSync(join(ASTRO_DIR, scriptChunk), 'utf-8');
    const imports = [...content.matchAll(IMPORT_RE)].map((m) => m[1]);
    const cmChunks = imports.filter((i) => i.startsWith('index.'));
    if (cmChunks.length > 0) cmChunksByPlayground.set(name, cmChunks);
  }

  if (cmChunksByPlayground.size < playgrounds.length) {
    const missing = playgrounds.filter((p) => !cmChunksByPlayground.has(p));
    fail(`found CodeMirror chunk sets for only ${cmChunksByPlayground.size}/${playgrounds.length} playgrounds. Missing: ${missing.join(', ')}`);
  }

  const htmlFiles = walkHtmlFiles(DIST);
  let pagesInjected = 0;
  const matchedPlaygrounds = new Set();

  for (const file of htmlFiles) {
    const html = readFileSync(file, 'utf-8');
    const scriptSrcs = [...html.matchAll(SCRIPT_SRC_RE)].map((m) => m[1]);
    const matched = playgrounds.find((name) =>
      scriptSrcs.some((src) => src.includes(`${name}.astro_astro_type_script`)),
    );
    if (!matched) continue;
    matchedPlaygrounds.add(matched);

    const cmChunks = cmChunksByPlayground.get(matched);
    const links = cmChunks.map((c) => `<link rel="modulepreload" href="/_astro/${c}">`).join('');
    if (html.includes(links)) continue; // already injected (idempotent re-run)

    const updated = html.replace('</head>', `${links}</head>`);
    if (updated === html) fail(`could not find </head> to inject into: ${file}`);
    writeFileSync(file, updated);
    pagesInjected++;
  }

  if (matchedPlaygrounds.size < playgrounds.length) {
    const missing = playgrounds.filter((p) => !matchedPlaygrounds.has(p));
    fail(`${missing.length} CodeMirror playground(s) had no matching page anywhere in dist: ${missing.join(', ')}`);
  }

  console.log(
    `OK: injected modulepreload hints into ${pagesInjected} page(s) across ${matchedPlaygrounds.size} CodeMirror playground(s).`,
  );
}

main();

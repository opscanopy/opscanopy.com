// Prebuild: which /blog/tag/<tag>/ pages are too thin to deserve indexing.
//
// 41 tag pages exist for 23 English posts. Sampled ones hold a single post and
// ~80 words, which is thin content on a domain that has none to spare — and all
// 41 sat in the zero-impression list of every Search Console report so far.
//
// The tag page and the sitemap filter MUST agree: a page that says
// `noindex` while still appearing in the sitemap is a self-contradicting signal,
// and astro.config.mjs's own comment states the filter is meant to mirror the
// noindex set exactly. Rather than duplicate a threshold in both places, the set
// is computed once here and read by both:
//
//   src/pages/blog/tag/[tag].astro   -> noindex when the tag is listed
//   astro.config.mjs (sitemap filter) -> drops the same URLs
//
// Tags with THRESHOLD or more posts stay indexed as genuine topic hubs.
//
// Writes src/data/thin-tags.generated.json (gitignored, like the other
// generated data). Zero dependencies — frontmatter tags are read with a narrow
// regex, matching the approach in gen-lastmod.mjs.

import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_FILE = join(ROOT, 'src/data/thin-tags.generated.json');

/** Minimum posts a tag needs to earn an indexable page. */
const THRESHOLD = 3;

/**
 * Tag list out of YAML frontmatter. Handles both the inline form
 * (`tags: [a, b]`) and the block form (`tags:\n  - a\n  - b`).
 * Lowercased to match getAllTags' canonicalisation.
 */
function frontmatterTags(src) {
  const fm = src.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!fm) return [];
  const body = fm[1];

  const inline = body.match(/^tags:\s*\[([^\]]*)\]/m);
  if (inline) {
    return inline[1]
      .split(',')
      .map((t) => t.trim().replace(/^['"]|['"]$/g, '').toLowerCase())
      .filter(Boolean);
  }

  const block = body.match(/^tags:\s*\r?\n((?:\s*-\s*.+\r?\n?)+)/m);
  if (block) {
    return block[1]
      .split('\n')
      .map((l) => l.replace(/^\s*-\s*/, '').trim().replace(/^['"]|['"]$/g, '').toLowerCase())
      .filter(Boolean);
  }

  return [];
}

// Tag pages are built for the default locale only (see the header comment in
// blog/tag/[tag].astro), so only English posts feed the count.
const dir = join(ROOT, 'src/content/blog/en');
const counts = new Map();

let files = [];
try {
  files = await readdir(dir);
} catch (err) {
  console.warn(`gen-thin-tags: cannot read ${dir} (${err.code ?? err.message}) — writing empty set.`);
}

for (const file of files) {
  if (!file.endsWith('.md')) continue;
  for (const tag of frontmatterTags(await readFile(join(dir, file), 'utf8'))) {
    counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }
}

const thin = [...counts.entries()]
  .filter(([, n]) => n < THRESHOLD)
  .map(([tag]) => tag)
  .sort();

const kept = [...counts.entries()]
  .filter(([, n]) => n >= THRESHOLD)
  .sort((a, b) => b[1] - a[1]);

await writeFile(
  OUT_FILE,
  JSON.stringify({ threshold: THRESHOLD, thin }, null, 2) + '\n',
  'utf8',
);

console.log(
  `gen-thin-tags: ${counts.size} tags — ${thin.length} below ${THRESHOLD} posts ` +
    `(noindex + out of sitemap), ${kept.length} kept: ` +
    kept.map(([t, n]) => `${t}(${n})`).join(', '),
);

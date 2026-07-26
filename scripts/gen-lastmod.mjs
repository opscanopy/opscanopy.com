// Prebuild: real per-URL <lastmod> dates for the sitemap.
//
// astro.config.mjs previously set `lastmod: new Date()`, stamping all 445 URLs
// with the build time. That tells crawlers the entire site changed on every
// deploy, which is both false and a poor freshness signal — and it makes the
// IndexNow "what changed?" diff useless, because everything always looks new.
//
// This emits a { "<pathname>": "<ISO date>" } map from data that already
// exists, consumed by the sitemap `serialize` hook:
//
//   tool pages   git-derived date from tool-meta.generated.json (written by
//                gen-tool-meta.mjs, which must run BEFORE this script)
//   blog posts   frontmatter updatedDate ?? pubDate, per locale
//   guides       frontmatter updatedDate
//
// Anything not in the map keeps the build date, which is the right answer for
// index/listing pages that genuinely do change whenever their contents do.
//
// Writes src/data/lastmod.generated.json (gitignored, like tool-meta).
// Zero dependencies — frontmatter is read with a narrow regex rather than a
// YAML parser, since only two scalar date fields are needed.

import { readFile, readdir, writeFile, stat } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_FILE = join(ROOT, 'src/data/lastmod.generated.json');
const LOCALES = ['en', 'de', 'es', 'fr', 'pt-br'];
const DEFAULT_LOCALE = 'en';

/** Pull a scalar date field out of YAML frontmatter. Returns YYYY-MM-DD or null. */
function fmDate(src, field) {
  const fm = src.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!fm) return null;
  const m = fm[1].match(new RegExp(`^${field}:\\s*["']?(\\d{4}-\\d{2}-\\d{2})`, 'm'));
  return m ? m[1] : null;
}

/** YYYY-MM-DD → ISO 8601 at midnight UTC, the form <lastmod> expects. */
function toIso(day) {
  return new Date(`${day}T00:00:00.000Z`).toISOString();
}

const map = {};

// ── Tool pages ────────────────────────────────────────────────────────────────
try {
  const toolMeta = JSON.parse(
    await readFile(join(ROOT, 'src/data/tool-meta.generated.json'), 'utf8'),
  );
  for (const [slug, day] of Object.entries(toolMeta)) {
    if (!day) continue;
    const iso = toIso(day);
    for (const locale of LOCALES) {
      map[locale === DEFAULT_LOCALE ? `/${slug}/` : `/${locale}/${slug}/`] = iso;
    }
  }
} catch (err) {
  // Not fatal: without it every tool page just falls back to the build date.
  console.warn(
    `gen-lastmod: no tool-meta.generated.json (${err.code ?? err.message}) — ` +
      'tool pages will use the build date. Run gen-tool-meta.mjs first.',
  );
}

// ── Blog posts ────────────────────────────────────────────────────────────────
let postCount = 0;
for (const locale of LOCALES) {
  const dir = join(ROOT, 'src/content/blog', locale);
  let files;
  try {
    files = await readdir(dir);
  } catch {
    continue;
  }
  for (const file of files) {
    if (!file.endsWith('.md')) continue;
    const src = await readFile(join(dir, file), 'utf8');
    const day = fmDate(src, 'updatedDate') ?? fmDate(src, 'pubDate');
    if (!day) continue;
    const slug = basename(file, '.md');
    map[locale === DEFAULT_LOCALE ? `/blog/${slug}/` : `/${locale}/blog/${slug}/`] = toIso(day);
    postCount++;
  }
}

// ── Guides (English only by design) ───────────────────────────────────────────
let guideCount = 0;
const guidesRoot = join(ROOT, 'src/content/guides');
try {
  for (const track of await readdir(guidesRoot)) {
    const trackDir = join(guidesRoot, track);
    if (!(await stat(trackDir)).isDirectory()) continue;
    for (const file of await readdir(trackDir)) {
      if (!file.endsWith('.md')) continue;
      const day = fmDate(await readFile(join(trackDir, file), 'utf8'), 'updatedDate');
      if (!day) continue;
      map[`/learn/guides/${basename(file, '.md')}/`] = toIso(day);
      guideCount++;
    }
  }
} catch (err) {
  console.warn(`gen-lastmod: could not read guides (${err.code ?? err.message})`);
}

// ── Mission 90 day pages ──────────────────────────────────────────────────────
// Only 6 of the 90 days set `updatedDate`, so prefer it where present and fall
// back to the file's last commit date. One `git log --name-only` pass over the
// directory rather than 90 separate invocations.
let dayCount = 0;
try {
  const log = execFileSync(
    'git',
    ['log', '--format=%cd', '--date=short', '--name-only', '--', 'src/content/mission90/'],
    { cwd: ROOT, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 },
  );

  // Commits stream newest-first, so the first date seen for a path is its latest.
  const gitDay = new Map();
  let currentDate = null;
  for (const line of log.split('\n')) {
    const t = line.trim();
    if (!t) continue;
    if (/^\d{4}-\d{2}-\d{2}$/.test(t)) currentDate = t;
    else if (currentDate && !gitDay.has(t)) gitDay.set(t, currentDate);
  }

  const dayDir = join(ROOT, 'src/content/mission90');
  for (const file of await readdir(dayDir)) {
    if (!file.endsWith('.md')) continue;
    const src = await readFile(join(dayDir, file), 'utf8');
    const day =
      fmDate(src, 'updatedDate') ?? gitDay.get(`src/content/mission90/${file}`) ?? null;
    if (!day) continue;
    const n = Number(basename(file, '.md').replace(/^day-/, ''));
    if (!Number.isInteger(n)) continue;
    map[`/mission-90/day/${n}/`] = toIso(day);
    dayCount++;
  }
} catch (err) {
  console.warn(`gen-lastmod: could not date mission-90 days (${err.code ?? err.message})`);
}

await writeFile(OUT_FILE, JSON.stringify(map, null, 2) + '\n', 'utf8');
console.log(
  `gen-lastmod: wrote ${Object.keys(map).length} entries ` +
    `(${postCount} post pages, ${guideCount} guides, ${dayCount} mission days) ` +
    'to src/data/lastmod.generated.json',
);

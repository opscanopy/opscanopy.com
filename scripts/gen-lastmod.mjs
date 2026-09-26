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
//   tool pages     git-derived date from tool-meta.generated.json (written by
//                  gen-tool-meta.mjs, which must run BEFORE this script)
//   blog posts     frontmatter updatedDate ?? pubDate, per locale
//   guides         frontmatter updatedDate
//   mission days   frontmatter updatedDate ?? the file's last commit
//   everything     newest of: the route file's last commit, the data/copy
//   else           files it imports, and the dates of what it lists (home,
//                  /tools/, categories, blog indexes, tags, changelog, learn,
//                  tests, missions, info pages — see routes() in lastmod-core)
//
// A URL with no derivable date gets NO <lastmod> (applyLastmod deletes it).
// Until 2026-09-26 anything missing here kept the build date, so 94 of 494
// URLs claimed a change on every deploy. The derivation is pure and lives in
// scripts/lastmod-core.mjs so src/lib/sitemap-lastmod.test.ts can pin it.
//
// Writes src/data/lastmod.generated.json (gitignored, like tool-meta).
// Zero dependencies — frontmatter is read with a narrow regex rather than a
// YAML parser, since only a few scalar fields are needed.

import { readFile, readdir, writeFile, stat } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  fmDate,
  fmTags,
  fmDraft,
  toIso,
  parseGitLog,
  routes,
  buildRouteLastmod,
} from './lastmod-core.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_FILE = join(ROOT, 'src/data/lastmod.generated.json');
const LOCALES = ['en', 'de', 'es', 'fr', 'pt-br'];
const DEFAULT_LOCALE = 'en';

const map = {};

// ── Git history, one pass ─────────────────────────────────────────────────────
// Newest commit day per path under src/. Empty without .git (the Docker build
// excludes it) — every git-dated URL is then omitted, never stamped.
let gitDay = new Map();
try {
  gitDay = parseGitLog(
    execFileSync('git', ['log', '--format=%cs', '--name-only', '--', 'src/'], {
      cwd: ROOT,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    }),
  );
} catch (err) {
  console.warn(`gen-lastmod: no git history (${err.code ?? err.message}) — git-dated URLs omit <lastmod>`);
}

// ── Tool pages ────────────────────────────────────────────────────────────────
/** @type {Record<string, string | null>} */
let toolMeta = {};
try {
  toolMeta = JSON.parse(await readFile(join(ROOT, 'src/data/tool-meta.generated.json'), 'utf8'));
  for (const [slug, day] of Object.entries(toolMeta)) {
    if (!day) continue;
    const iso = toIso(day);
    for (const locale of LOCALES) {
      map[locale === DEFAULT_LOCALE ? `/${slug}/` : `/${locale}/${slug}/`] = iso;
    }
  }
} catch (err) {
  // Not fatal: without it every tool page just omits <lastmod>.
  console.warn(
    `gen-lastmod: no tool-meta.generated.json (${err.code ?? err.message}) — ` +
      'tool pages will omit <lastmod>. Run gen-tool-meta.mjs first.',
  );
}

// ── Blog posts ────────────────────────────────────────────────────────────────
let postCount = 0;
const posts = [];
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
    posts.push({ locale, slug, day, tags: fmTags(src), draft: fmDraft(src) });
    postCount++;
  }
}

// ── Guides (English only by design) ───────────────────────────────────────────
let guideCount = 0;
const guides = [];
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
      guides.push({ slug: basename(file, '.md'), day });
      guideCount++;
    }
  }
} catch (err) {
  console.warn(`gen-lastmod: could not read guides (${err.code ?? err.message})`);
}

// ── Mission 90 day pages ──────────────────────────────────────────────────────
// Only 6 of the 90 days set `updatedDate`, so prefer it where present and fall
// back to the file's last commit date.
let dayCount = 0;
const missionDays = [];
try {
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
    missionDays.push({ n, day });
    dayCount++;
  }
} catch (err) {
  console.warn(`gen-lastmod: could not date mission-90 days (${err.code ?? err.message})`);
}

// ── Listing, hub and info pages ───────────────────────────────────────────────
// Registries are imported the way gen-tool-meta.mjs imports tools.ts (Node
// strips the types). A failed import only drops that registry's routes.
async function registry(path, pick) {
  try {
    return pick(await import(`../${path}`));
  } catch (err) {
    console.warn(`gen-lastmod: could not load ${path} (${err.message}) — its routes omit <lastmod>`);
    return [];
  }
}
const tools = (
  // `category` is the URL slug (/tools/ci-cd/), not the "CI/CD" display label.
  await registry('src/data/tools.ts', (m) =>
    m.liveTools.map((t) => ({ slug: t.slug, category: m.categoryToSlug(t.category) })),
  )
).map((t) => ({ ...t, day: toolMeta[t.slug] ?? null }));
const roadmaps = await registry('src/data/roadmaps.ts', (m) => m.roadmaps.map((r) => r.slug));
const missions = await registry('src/data/mission90.ts', (m) =>
  m.missions.filter((x) => x.status === 'live').map((x) => x.id),
);
// Test sets come from the `<category>__<test>.json` files that static-paths.ts
// cross-checks against the registry, so the two cannot disagree.
let tests = [];
try {
  tests = (await readdir(join(ROOT, 'src/content/tests')))
    .filter((f) => f.endsWith('.json') && f.includes('__'))
    .map((f) => {
      const [category, test] = basename(f, '.json').split('__');
      return { category, test };
    });
} catch (err) {
  console.warn(`gen-lastmod: could not read test sets (${err.code ?? err.message})`);
}

const inv = {
  locales: LOCALES,
  defaultLocale: DEFAULT_LOCALE,
  gitDay,
  pageSources: {},
  tools,
  posts,
  guides,
  missionDays,
  roadmaps,
  missions,
  tests,
};
// Read every candidate route file once; routes() then drops the ones a locale
// doesn't have (only en has /changelog/, for instance).
const everyPage = new Proxy({}, { has: () => true });
for (const { page } of routes({ ...inv, pageSources: everyPage })) {
  if (page in inv.pageSources) continue;
  try {
    inv.pageSources[page] = await readFile(join(ROOT, page), 'utf8');
  } catch {
    /* not built in this locale */
  }
}
const routeMap = buildRouteLastmod(inv);
Object.assign(map, routeMap);

await writeFile(OUT_FILE, JSON.stringify(map, null, 2) + '\n', 'utf8');
console.log(
  `gen-lastmod: wrote ${Object.keys(map).length} entries ` +
    `(${postCount} post pages, ${guideCount} guides, ${dayCount} mission days, ` +
    `${Object.keys(routeMap).length} listing/info pages) to src/data/lastmod.generated.json`,
);

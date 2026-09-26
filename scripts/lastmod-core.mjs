// Pure date derivation for the sitemap <lastmod> map — no fs, no git, no clock.
//
// scripts/gen-lastmod.mjs gathers the inputs (git log, frontmatter, registries)
// and writes src/data/lastmod.generated.json; astro.config.mjs applies the map
// in the sitemap `serialize` hook via `applyLastmod`. Keeping the derivation
// here lets src/lib/sitemap-lastmod.test.ts pin it with fixtures, since the
// tests run before any build exists in CI.
//
// The rule every function below serves: a URL gets the newest date among the
// things that actually render it, or NO <lastmod> at all. Never the build time
// — stamping unknown URLs with "now" made 94 of 494 URLs claim a change on
// every deploy, which teaches crawlers to ignore the field site-wide.

import { posix } from 'node:path';

/** Pull a scalar date field out of YAML frontmatter. Returns YYYY-MM-DD or null. */
export function fmDate(src, field) {
  const fm = src.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!fm) return null;
  const m = fm[1].match(new RegExp(`^${field}:\\s*["']?(\\d{4}-\\d{2}-\\d{2})`, 'm'));
  return m ? m[1] : null;
}

/** Frontmatter `tags`, lowercased like getAllTags. Inline `[..]` or a YAML list. */
export function fmTags(src) {
  const fm = src.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!fm) return [];
  const inline = fm[1].match(/^tags:\s*\[([^\]]*)\]/m);
  const raw = inline
    ? inline[1].split(',')
    : [...(fm[1].match(/^tags:\s*\r?\n((?:\s+-\s+.*\r?\n?)+)/m)?.[1] ?? '').matchAll(/-\s+(.*)/g)].map(
        (m) => m[1],
      );
  return raw.map((t) => t.trim().replace(/^["']|["']$/g, '').toLowerCase()).filter(Boolean);
}

/** `draft: true` in frontmatter — drafts never render, so they date nothing. */
export function fmDraft(src) {
  const fm = src.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  return !!fm && /^draft:\s*true\b/m.test(fm[1]);
}

/** YYYY-MM-DD → ISO 8601 at midnight UTC, the form <lastmod> expects. */
export function toIso(day) {
  return new Date(`${day}T00:00:00.000Z`).toISOString();
}

/** Newest of a list of YYYY-MM-DD strings (nulls ignored), or null. */
export function newestDay(days) {
  let best = null;
  for (const d of days) if (d && (!best || d > best)) best = d;
  return best;
}

/**
 * `git log --format=%cs --name-only` output → Map<repo path, newest day>.
 * Commits stream newest-first, so the first date seen for a path is its latest.
 */
export function parseGitLog(log) {
  const gitDay = new Map();
  let currentDate = null;
  for (const line of log.split('\n')) {
    const t = line.trim();
    if (!t) continue;
    if (/^\d{4}-\d{2}-\d{2}$/.test(t)) currentDate = t;
    else if (currentDate && !gitDay.has(t)) gitDay.set(t, currentDate);
  }
  return gitDay;
}

/** Newest commit day for a file, or for anything under it when it is a directory. */
export function gitDayFor(gitDay, path) {
  const exact = gitDay.get(path);
  if (exact) return exact;
  const prefix = path.endsWith('/') ? path : `${path}/`;
  let best = null;
  for (const [p, d] of gitDay) if (p.startsWith(prefix) && (!best || d > best)) best = d;
  return best;
}

/**
 * The data/copy files a page imports, resolved to repo paths. Only the files
 * that carry that page's own words count:
 *   - anything under src/data/ except generated JSON, and except the tool
 *     registry (tools.ts) and its tool-meta wrapper — those change with every
 *     tool, and the pages that list tools take the tools' own dates instead;
 *   - src/i18n/pages (the info-page copy) narrowed to the page's locale file.
 * Components and src/lib are deliberately left out: Shell/Header edits touch
 * every page and are not a content change a crawler should re-fetch for.
 */
export function dataImports(src, pagePath, locale) {
  const out = new Set();
  const dir = posix.dirname(pagePath);
  for (const m of src.matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*)['"](\.{1,2}\/[^'"]+)['"]/g)) {
    let p = posix.normalize(posix.join(dir, m[1]));
    if (p === 'src/i18n/pages' || p === 'src/i18n/pages.ts') {
      out.add(`src/i18n/pages/${locale}.ts`);
      continue;
    }
    if (!p.startsWith('src/data/')) continue;
    if (p.endsWith('.generated.json')) continue;
    if (!/\.[a-z]+$/.test(p)) p += '.ts';
    if (p === 'src/data/tools.ts' || p === 'src/data/tool-meta.ts') continue;
    out.add(p);
  }
  return [...out].sort();
}

/**
 * Every non-leaf URL the site builds, with what renders it.
 *   page  — the route file (its git date is required: no date → no <lastmod>)
 *   files — extra repo paths (files or directories) whose git dates count
 *   days  — content dates the page lists (tools, posts, guides, days)
 * Routes whose page file is absent from `inv.pageSources` are dropped, which
 * is how locales without a given page stay out of the map.
 */
export function routes(inv) {
  const { locales, defaultLocale } = inv;
  const pre = (l) => (l === defaultLocale ? '' : `/${l}`);
  const livePosts = inv.posts.filter((p) => !p.draft);
  const postDays = (l) => livePosts.filter((p) => p.locale === l).map((p) => p.day);
  const toolDays = inv.tools.map((t) => t.day);
  const guideDays = inv.guides.map((g) => g.day);
  const out = [];

  for (const l of locales) {
    const L = pre(l);
    const dir = l === defaultLocale ? 'src/pages' : `src/pages/${l}`;
    out.push({
      path: `${L}/`,
      locale: l,
      page: `${dir}/index.astro`,
      files: ['src/components/home'],
      days: [...toolDays, ...postDays(l)],
    });
    out.push({
      path: `${L}/tools/`,
      locale: l,
      page: `${dir}/tools/index.astro`,
      files: ['src/components/ToolsCatalog.astro'],
      days: toolDays,
    });
    out.push({
      path: `${L}/blog/`,
      locale: l,
      page: l === defaultLocale ? 'src/pages/blog/index.astro' : 'src/pages/[lang]/blog/index.astro',
      files: ['src/components/page/BlogIndexBody.astro'],
      days: postDays(l),
    });
    for (const name of ['about', 'contact', 'privacy', 'security', 'terms']) {
      out.push({
        path: `${L}/${name}/`,
        locale: l,
        page: `${dir}/${name}.astro`,
        files: ['src/components/page/InfoPage.astro'],
        days: [],
      });
    }
  }

  const en = defaultLocale;
  for (const cat of [...new Set(inv.tools.map((t) => t.category))].sort()) {
    out.push({
      path: `/tools/${cat}/`,
      locale: en,
      page: 'src/pages/tools/[category].astro',
      files: [],
      days: inv.tools.filter((t) => t.category === cat).map((t) => t.day),
    });
  }

  const tags = new Map();
  for (const p of livePosts.filter((p) => p.locale === en)) {
    for (const t of p.tags) tags.set(t, [...(tags.get(t) ?? []), p.day]);
  }
  for (const [tag, days] of [...tags].sort()) {
    out.push({ path: `/blog/tag/${tag}/`, locale: en, page: 'src/pages/blog/tag/[tag].astro', files: [], days });
  }

  const dayDays = inv.missionDays.map((d) => d.day);
  const single = [
    ['/verify-ai/', 'src/pages/verify-ai.astro', [], []],
    ['/changelog/', 'src/pages/changelog.astro', [], toolDays],
    ['/learn/', 'src/pages/learn/index.astro', [], guideDays],
    ['/learn/guides/', 'src/pages/learn/guides/index.astro', [], guideDays],
    ['/learn/roadmaps/', 'src/pages/learn/roadmaps/index.astro', [], []],
    ['/mission-90/', 'src/pages/mission-90/index.astro', [], []],
    ['/mission-90/job-ready/', 'src/pages/mission-90/job-ready.astro', ['src/content/mission90'], dayDays],
    ['/mission-90/setup/', 'src/pages/mission-90/setup.astro', [], []],
    ['/mission-90/missions/', 'src/pages/mission-90/missions/index.astro', [], []],
    ['/tests/', 'src/pages/tests/index.astro', [], []],
  ];
  for (const [path, page, files, days] of single) out.push({ path, locale: en, page, files, days });

  for (const slug of inv.roadmaps) {
    out.push({ path: `/learn/roadmaps/${slug}/`, locale: en, page: 'src/pages/learn/roadmaps/[slug].astro', files: [], days: [] });
  }
  for (const id of inv.missions) {
    out.push({
      path: `/mission-90/missions/${id}/`,
      locale: en,
      page: 'src/pages/mission-90/missions/[id].astro',
      files: [`src/lib/mission-sim/missions/${id}.ts`],
      days: [],
    });
  }
  for (const cat of [...new Set(inv.tests.map((t) => t.category))].sort()) {
    out.push({
      path: `/tests/${cat}/`,
      locale: en,
      page: 'src/pages/tests/[category]/index.astro',
      files: inv.tests.filter((t) => t.category === cat).map((t) => `src/content/tests/${cat}__${t.test}.json`),
      days: [],
    });
  }
  for (const { category, test } of inv.tests) {
    out.push({
      path: `/tests/${category}/${test}/review/`,
      locale: en,
      page: 'src/pages/tests/[category]/[test]/review.astro',
      files: [`src/content/tests/${category}__${test}.json`],
      days: [],
    });
  }

  return out.filter((r) => r.page in inv.pageSources);
}

/**
 * The listing/info-page half of the map: { "<pathname>": "<ISO date>" }.
 * A route whose page file has no git date (uncommitted, or no .git at all as
 * in the Docker build) is omitted rather than half-dated from its content.
 */
export function buildRouteLastmod(inv) {
  /** @type {Record<string, string>} */
  const map = {};
  for (const r of routes(inv)) {
    const pageDay = gitDayFor(inv.gitDay, r.page);
    if (!pageDay) continue;
    const deps = [...r.files, ...dataImports(inv.pageSources[r.page], r.page, r.locale)];
    const day = newestDay([pageDay, ...deps.map((p) => gitDayFor(inv.gitDay, p)), ...r.days]);
    map[r.path] = toIso(day);
  }
  return map;
}

/**
 * Sitemap `serialize` step: the page's real date, or no <lastmod> at all —
 * including when the integration pre-filled one. `map` may be null (no
 * generated file), which omits the field everywhere.
 *
 * @template {{ url: string, lastmod?: unknown }} T
 * @param {T} item
 * @param {Record<string, string> | null} map
 * @returns {T}
 */
export function applyLastmod(item, map) {
  const known = map?.[new URL(item.url).pathname];
  if (known) item.lastmod = known;
  else delete item.lastmod;
  return item;
}

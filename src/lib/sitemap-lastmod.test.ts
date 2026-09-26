/**
 * Sitemap <lastmod> gate.
 *
 * Until 2026-09-26 the sitemap integration's `lastmod` default was the build
 * time, and scripts/gen-lastmod.mjs only dated tools, posts, guides and mission
 * days — so the other 94 of 494 URLs (home, hubs, info pages, tag and category
 * pages, tests, missions) claimed a change on every deploy. The rule now: a URL
 * carries the newest date of what renders it, or no <lastmod> at all.
 *
 * CI runs tests before any build, so the derivation is pinned here with
 * fixtures against the pure helpers in scripts/lastmod-core.mjs. The last block
 * also checks a local dist/ when one exists (skipped on a fresh clone).
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  fmTags,
  fmDraft,
  newestDay,
  parseGitLog,
  gitDayFor,
  dataImports,
  routes,
  buildRouteLastmod,
  applyLastmod,
} from '../../scripts/lastmod-core.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const MIDNIGHT = /T00:00:00\.000Z$/;

/** A minimal two-locale site: git history, two tools, three posts. */
function fixture() {
  const gitDay = parseGitLog(
    [
      '2026-09-10',
      'src/pages/about.astro',
      'src/i18n/pages/de.ts',
      '',
      '2026-08-01',
      'src/pages/index.astro',
      'src/pages/de/index.astro',
      'src/pages/de/about.astro',
      'src/pages/tools/index.astro',
      'src/pages/tools/[category].astro',
      'src/pages/blog/index.astro',
      'src/pages/blog/tag/[tag].astro',
      'src/pages/tests/[category]/[test]/review.astro',
      'src/components/page/InfoPage.astro',
      'src/i18n/pages/en.ts',
      'src/data/tools.ts',
      '',
      '2026-07-01',
      'src/pages/about.astro',
      'src/content/tests/aws__set-1.json',
    ].join('\n'),
  );
  const infoSrc = "import { getPagesContent } from '../i18n/pages';\nimport { site } from '../data/site';";
  return {
    locales: ['en', 'de'],
    defaultLocale: 'en',
    gitDay,
    pageSources: {
      'src/pages/index.astro': "import { tools } from '../data/tools';",
      'src/pages/de/index.astro': '',
      'src/pages/about.astro': infoSrc,
      'src/pages/de/about.astro': infoSrc.replace(/\.\.\//g, '../../'),
      'src/pages/tools/index.astro': '',
      'src/pages/tools/[category].astro': '',
      'src/pages/blog/index.astro': '',
      'src/pages/blog/tag/[tag].astro': '',
      'src/pages/tests/[category]/[test]/review.astro': '',
      // Present on disk but never committed: must be omitted, not dated.
      'src/pages/changelog.astro': '',
    },
    tools: [
      { slug: 'a', category: 'ci-cd', day: '2026-08-20' },
      { slug: 'b', category: 'docker', day: '2026-09-05' },
    ],
    posts: [
      { locale: 'en', slug: 'p1', day: '2026-08-15', tags: ['cron', 'devops'], draft: false },
      { locale: 'en', slug: 'p2', day: '2026-09-20', tags: ['devops'], draft: true },
      { locale: 'de', slug: 'p1', day: '2026-08-25', tags: ['cron'], draft: false },
    ],
    guides: [],
    missionDays: [],
    roadmaps: [],
    missions: [],
    tests: [{ category: 'aws', test: 'set-1' }],
  };
}

describe('frontmatter + git helpers', () => {
  it('reads inline and list tags, lowercased like getAllTags', () => {
    expect(fmTags('---\ntags: ["CI-CD", \'Cron\']\n---\nbody')).toEqual(['ci-cd', 'cron']);
    expect(fmTags('---\ntitle: x\ntags:\n  - Docker\n  - "yaml"\n---\n')).toEqual(['docker', 'yaml']);
    expect(fmTags('---\ntitle: x\n---\ntags: ["body"]')).toEqual([]);
  });

  it('detects drafts only in frontmatter', () => {
    expect(fmDraft('---\ndraft: true\n---\n')).toBe(true);
    expect(fmDraft('---\ndraft: false\n---\ndraft: true')).toBe(false);
  });

  it('keeps the newest day per path and resolves directories', () => {
    const g = parseGitLog('2026-09-02\nsrc/a/x.ts\n\n2026-09-01\nsrc/a/x.ts\nsrc/a/y.ts\n');
    expect(g.get('src/a/x.ts')).toBe('2026-09-02');
    expect(gitDayFor(g, 'src/a')).toBe('2026-09-02');
    expect(gitDayFor(g, 'src/a/y.ts')).toBe('2026-09-01');
    expect(gitDayFor(g, 'src/ab')).toBeNull();
    expect(newestDay([null, '2026-01-02', '2026-01-10', undefined])).toBe('2026-01-10');
  });

  it('counts a page’s own data/copy imports, narrowing i18n/pages to its locale', () => {
    const src = [
      "import { getPagesContent } from '../../i18n/pages';",
      "import { site } from '../../data/site';",
      "import { tools } from '../../data/tools';",
      "import { getToolUpdatedAt } from '../../data/tool-meta';",
      "import Shell from '../../components/Shell.astro';",
      "thin = (await import('../../data/thin-tags.generated.json')).default;",
    ].join('\n');
    expect(dataImports(src, 'src/pages/de/about.astro', 'de')).toEqual([
      'src/data/site.ts',
      'src/i18n/pages/de.ts',
    ]);
  });
});

describe('buildRouteLastmod', () => {
  const map = buildRouteLastmod(fixture());

  it('dates a hub by the newest of its page file and what it lists', () => {
    expect(map['/']).toBe('2026-09-05T00:00:00.000Z'); // tool b, not tools.ts
    expect(map['/de/']).toBe('2026-09-05T00:00:00.000Z');
    expect(map['/tools/']).toBe('2026-09-05T00:00:00.000Z');
    expect(map['/tools/ci-cd/']).toBe('2026-08-20T00:00:00.000Z'); // only its own tools
  });

  it('ignores drafts and other locales when dating blog listings', () => {
    expect(map['/blog/']).toBe('2026-08-15T00:00:00.000Z');
    expect(map['/blog/tag/devops/']).toBe('2026-08-15T00:00:00.000Z');
    expect(map['/blog/tag/cron/']).toBe('2026-08-15T00:00:00.000Z'); // not the de post
  });

  it('dates info pages by page file + imported copy for that locale', () => {
    expect(map['/about/']).toBe('2026-09-10T00:00:00.000Z');
    expect(map['/de/about/']).toBe('2026-09-10T00:00:00.000Z'); // de.ts, not en.ts
  });

  it('dates a review page by its question file', () => {
    expect(map['/tests/aws/set-1/review/']).toBe('2026-08-01T00:00:00.000Z');
  });

  it('omits routes it cannot date instead of stamping them', () => {
    expect(map).not.toHaveProperty('/changelog/'); // page never committed
    expect(map).not.toHaveProperty('/de/blog/'); // page file absent
    for (const v of Object.values(map)) expect(v).toMatch(MIDNIGHT);
  });

  it('omits every git-dated route when there is no git history (Docker)', () => {
    expect(buildRouteLastmod({ ...fixture(), gitDay: new Map() })).toEqual({});
  });
});

describe('applyLastmod (sitemap serialize)', () => {
  const buildTime = '2026-09-23T17:52:15.593Z';

  it('applies a known date', () => {
    const item = applyLastmod({ url: 'https://x.test/a/', lastmod: buildTime }, { '/a/': '2026-01-01T00:00:00.000Z' });
    expect(item.lastmod).toBe('2026-01-01T00:00:00.000Z');
  });

  it('never keeps a pre-filled build time for an unknown URL', () => {
    const item = applyLastmod({ url: 'https://x.test/b/', lastmod: buildTime }, {});
    expect(item).not.toHaveProperty('lastmod');
  });

  it('omits lastmod everywhere when the generated map is missing', () => {
    expect(applyLastmod({ url: 'https://x.test/a/', lastmod: buildTime }, null)).not.toHaveProperty('lastmod');
  });
});

describe('route table vs the real repo', () => {
  it('names only page files that exist', () => {
    const everyPage = new Proxy({}, { has: () => true });
    const inv = {
      ...fixture(),
      locales: ['en', 'de', 'es', 'fr', 'pt-br'],
      pageSources: everyPage,
      roadmaps: ['x'],
      missions: ['x'],
      guides: [],
    };
    const missing = [...new Set(routes(inv).map((r) => r.page))].filter((p) => !existsSync(join(ROOT, p)));
    expect(missing, 'a route file moved — update routes() in scripts/lastmod-core.mjs').toEqual([]);
  });
});

// Local-only: after `npm run build`, no served <lastmod> may be a build time,
// and a URL is dated in dist exactly when the generated map dates it. Fails on
// a dist built before 2026-09-26 (94 × 2026-09-23T17:52:15.593Z).
const SITEMAP = join(ROOT, 'dist/sitemap-0.xml');
const GENERATED = join(ROOT, 'src/data/lastmod.generated.json');
// Skip when dist predates the generated map: the pre-ship ritual runs tests
// before the build, so a stale dist must not fail the suite. CI (fresh clone,
// no dist) skips too; scripts/check-sitemap-lastmod.mjs enforces it postbuild.
const distIsCurrent = () =>
  existsSync(SITEMAP) && existsSync(GENERATED) && statSync(SITEMAP).mtimeMs >= statSync(GENERATED).mtimeMs;
describe.skipIf(!distIsCurrent())('built dist/sitemap-0.xml', () => {
  it('has no build-time <lastmod> and matches the generated map', () => {
    const xml = readFileSync(SITEMAP, 'utf8');
    const gen: Record<string, string> = JSON.parse(readFileSync(GENERATED, 'utf8'));
    const bad: string[] = [];
    for (const [, block] of xml.matchAll(/<url>([\s\S]*?)<\/url>/g)) {
      const path = new URL(block.match(/<loc>(.*?)<\/loc>/)?.[1] ?? '').pathname;
      const lastmod = block.match(/<lastmod>(.*?)<\/lastmod>/)?.[1];
      if (lastmod === undefined) {
        if (gen[path]) bad.push(`${path}: missing, generated ${gen[path]}`);
      } else if (!MIDNIGHT.test(lastmod) || !gen[path]) {
        // Presence, not equality: a later prebuild may legitimately have moved
        // the generated date on without dist being rebuilt yet.
        bad.push(`${path}: ${lastmod} (generated ${gen[path] ?? 'none'})`);
      }
    }
    expect(bad, `${bad.length} URL(s) — rebuild with \`npm run build\` if dist is stale`).toEqual([]);
  });
});

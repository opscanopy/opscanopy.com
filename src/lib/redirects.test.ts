/**
 * public/_redirects guardrail.
 *
 * Cloudflare Static Assets evaluates _redirects BEFORE the asset lookup, so a
 * rule whose source is too broad does not merely redirect a dead URL — it
 * shadows a live page. This test compiles every rule the way the asset worker
 * does and checks three things:
 *
 *   - the file is structurally what wrangler accepts (2–3 tokens, a permitted
 *     status, no duplicate sources) and stays well inside the 100-rule dynamic
 *     budget (see the header of public/_redirects);
 *   - NO rule matches any live localized route, derived from the filesystem
 *     (src/pages/<locale>/ and src/content/blog/<locale>/), with or without
 *     the trailing slash;
 *   - every URL in the GSC 404 export (src/lib/fixtures/gsc-404-2026-09.txt)
 *     is caught by a 301 whose substituted target is a live English page.
 *
 * It reads sources only, never dist/ — CI runs the tests before the build.
 *
 * The matcher mirrors wrangler's rules-engine.ts (parseRedirects /
 * generateRuleRegExp / replacer in node_modules/wrangler/wrangler-dist/cli.js):
 * `*` → `(?<splat>.*)`, `:name` → `(?<name>[^/]+)`, anchored `^…$`, static
 * (placeholder-free) rules first, then the first matching dynamic rule wins.
 * The difference that matters here: a splat may be EMPTY, a placeholder may not.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, relative } from 'node:path';
import yaml from 'js-yaml';
import { LOCALES, DEFAULT_LOCALE } from '../i18n/config';
import { categories } from '../data/tools';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..');
const SRC = join(ROOT, 'src');

/** wrangler's PERMITTED_STATUS_CODES. */
const PERMITTED_STATUS = new Set([200, 301, 302, 303, 307, 308]);
/** Headroom policy, well under wrangler's MAX_DYNAMIC_REDIRECT_RULES (100). */
const MAX_RULES = 60;

interface Rule {
  from: string;
  to: string;
  status: number;
  line: number;
}

interface Compiled extends Rule {
  re: RegExp;
  dynamic: boolean;
}

/** Parse _redirects text the way wrangler's parseRedirects tokenises it. */
function parseRules(text: string): { rules: Rule[]; errors: string[] } {
  const rules: Rule[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();
  text.split('\n').forEach((raw, i) => {
    const line = raw.trim();
    if (line.length === 0 || line.startsWith('#')) return;
    const tokens = line.replace(/\s+#.*$/, '').split(/\s+/);
    if (tokens.length < 2 || tokens.length > 3) {
      errors.push(`line ${i + 1}: expected 2 or 3 tokens, got ${tokens.length}`);
      return;
    }
    const [from, to, statusStr = '302'] = tokens;
    const status = Number(statusStr);
    if (!PERMITTED_STATUS.has(status)) errors.push(`line ${i + 1}: status ${statusStr} not permitted`);
    if (seen.has(from)) errors.push(`line ${i + 1}: duplicate source ${from}`);
    seen.add(from);
    rules.push({ from, to, status, line: i + 1 });
  });
  return { rules, errors };
}

/** wrangler's generateRuleRegExp, path form (no cross-host rules here). */
function ruleRegExp(from: string): RegExp {
  const escape = (s: string) => s.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
  let re = from.split('*').map(escape).join('(?<splat>.*)');
  for (const m of re.matchAll(/:([A-Za-z]\w*)/g)) {
    re = re.split(m[0]).join(`(?<${m[1]}>[^/]+)`);
  }
  return new RegExp('^' + re + '$');
}

function compile(rules: Rule[]): Compiled[] {
  return rules.map((r) => ({
    ...r,
    re: ruleRegExp(r.from),
    dynamic: /\*/.test(r.from) || /:[A-Za-z]\w*/.test(r.from),
  }));
}

/** wrangler's replacer: substitute `:name` for every captured group. */
function substitute(to: string, groups: Record<string, string>): string {
  let out = to;
  for (const [k, v] of Object.entries(groups)) out = out.replaceAll(`:${k}`, v);
  return out;
}

/**
 * Resolve a pathname against the rules as the asset worker does: static rules
 * that sit above the first dynamic rule are an exact-path lookup; otherwise the
 * first matching rule (in file order) wins.
 */
function resolve(compiled: Compiled[], path: string): { rule: Compiled; target: string } | undefined {
  let staticZone = true;
  for (const r of compiled) {
    if (r.dynamic) staticZone = false;
    if (staticZone && !r.dynamic) {
      if (r.from === path) return { rule: r, target: r.to };
      continue;
    }
    const m = r.re.exec(path);
    if (m) return { rule: r, target: substitute(r.to, m.groups ?? {}) };
  }
  return undefined;
}

/** Live routes that some rule matches (checked with and without the slash). */
function shadowedRoutes(compiled: Compiled[], routes: string[]): string[] {
  const hits: string[] = [];
  for (const route of routes) {
    const bare = route.length > 1 ? route.replace(/\/$/, '') : route;
    for (const p of new Set([route, bare])) {
      const r = resolve(compiled, p);
      if (r) hits.push(`${p} ← ${r.rule.from} (line ${r.rule.line})`);
    }
  }
  return hits;
}

/* ─── Live routes, from the filesystem ─────────────────────────────────── */

const localized = LOCALES.filter((l) => l !== DEFAULT_LOCALE);

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

function frontmatter(file: string): Record<string, unknown> {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(readFileSync(file, 'utf8'));
  return (m ? (yaml.load(m[1]) as Record<string, unknown>) : null) ?? {};
}

/** Non-draft posts in a locale; the slug is the filename (glob-loader id). */
function postsFor(lang: string): { slug: string; tags: string[] }[] {
  const dir = join(SRC, 'content', 'blog', lang);
  return readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .map((f) => ({ f, fm: frontmatter(join(dir, f)) }))
    .filter(({ fm }) => fm.draft !== true)
    .map(({ f, fm }) => ({
      slug: f.replace(/\.md$/, ''),
      tags: ((fm.tags as string[] | undefined) ?? []).map((t) => t.toLowerCase()),
    }));
}

function liveLocalizedRoutes(): string[] {
  const routes = new Set<string>();
  for (const L of localized) {
    for (const p of ['/', '/tools/', '/blog/', '/search/']) routes.add(`/${L}${p}`);
    // Every .astro under src/pages/<L>/ (index → its directory).
    const pagesDir = join(SRC, 'pages', L);
    for (const file of walk(pagesDir).filter((f) => f.endsWith('.astro'))) {
      const rel = relative(pagesDir, file).replace(/\\/g, '/').replace(/\.astro$/, '');
      const path = rel === 'index' ? '' : rel.replace(/(^|\/)index$/, '') + '/';
      routes.add(`/${L}/${path}`);
    }
    for (const { slug } of postsFor(L)) routes.add(`/${L}/blog/${slug}/`);
  }
  return [...routes];
}

/* ─── Fixture ───────────────────────────────────────────────────────────── */

/** Live page reached by Cloudflare's own trailing-slash 307, not by a rule. */
const FIXTURE_EXEMPT = new Set(['/github-actions-expression-tester']);

function fixturePaths(): string[] {
  return readFileSync(join(SRC, 'lib', 'fixtures', 'gsc-404-2026-09.txt'), 'utf8')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))
    .map((l) => l.replace(/^https?:\/\/(www\.)?opscanopy\.com/, ''));
}

const liveCategorySlugs = new Set(categories.map((c) => c.slug));
const liveEnTags = new Set(postsFor(DEFAULT_LOCALE).flatMap((p) => p.tags));

function isLiveEnglishTarget(target: string): boolean {
  const cat = /^\/tools\/([^/]+)\/$/.exec(target);
  if (cat) return liveCategorySlugs.has(cat[1]);
  const tag = /^\/blog\/tag\/([^/]+)\/$/.exec(target);
  if (tag) return liveEnTags.has(tag[1]);
  return false;
}

/** Fixture URLs a rule set fails to send to a live English page by 301. */
function unresolvedFixtures(compiled: Compiled[], paths: string[]): string[] {
  const bad: string[] = [];
  for (const p of paths) {
    if (FIXTURE_EXEMPT.has(p)) continue;
    const r = resolve(compiled, p);
    if (!r) bad.push(`${p}: no rule matches`);
    else if (r.rule.status !== 301) bad.push(`${p}: status ${r.rule.status} (line ${r.rule.line})`);
    else if (!isLiveEnglishTarget(r.target)) bad.push(`${p} → ${r.target}: not a live English page`);
  }
  return bad;
}

/* ─── Tests ─────────────────────────────────────────────────────────────── */

const text = readFileSync(join(ROOT, 'public', '_redirects'), 'utf8');
const { rules, errors } = parseRules(text);
const compiled = compile(rules);
const routes = liveLocalizedRoutes();

describe('public/_redirects', () => {
  it('parses the way wrangler does: 2–3 tokens, permitted status, no duplicates', () => {
    expect(errors).toEqual([]);
    expect(rules.length).toBeGreaterThan(0);
  });

  it(`stays within the ${MAX_RULES}-rule headroom policy`, () => {
    expect(rules.length).toBeLessThanOrEqual(MAX_RULES);
  });

  it('derives a non-trivial set of live localized routes', () => {
    // Guards the guard: an empty route list would make the next test vacuous.
    for (const L of localized) {
      expect(routes).toContain(`/${L}/`);
      expect(routes).toContain(`/${L}/tools/`);
      expect(routes).toContain(`/${L}/subnet-calculator/`);
      expect(routes.filter((r) => r.startsWith(`/${L}/blog/`)).length).toBeGreaterThan(1);
    }
  });

  it('never matches a live localized route', () => {
    expect(shadowedRoutes(compiled, routes)).toEqual([]);
  });

  it('sends every GSC 404 URL to a live English page by 301', () => {
    const paths = fixturePaths();
    expect(paths.length).toBe(105);
    expect(unresolvedFixtures(compiled, paths)).toEqual([]);
  });

  it('never redirects into another rule (no chains or loops)', () => {
    const chained = fixturePaths()
      .map((p) => resolve(compiled, p))
      .filter((r): r is NonNullable<typeof r> => !!r && !/^https?:/.test(r.target))
      .filter((r) => resolve(compiled, r.target))
      .map((r) => `${r.rule.from} → ${r.target}`);
    expect(chained).toEqual([]);
  });
});

describe('the checks can fail', () => {
  it('a splat under the localized tools hub is caught (splat can be empty)', () => {
    const bad = compile(parseRules('/de/tools/*  /tools/:splat  301\n').rules);
    expect(shadowedRoutes(bad, routes)).toContain('/de/tools/ ← /de/tools/* (line 1)');
  });

  it('a placeholder at post depth under /blog/ is caught', () => {
    const bad = compile(parseRules('/fr/blog/:slug/  /blog/:slug/  301\n').rules);
    expect(shadowedRoutes(bad, routes).length).toBeGreaterThan(0);
  });

  it('a missing, wrong-status or dead-target rule is caught', () => {
    const paths = ['/de/tools/networking/', '/es/blog/tag/logql'];
    expect(unresolvedFixtures(compile([]), paths)).toHaveLength(2);
    const wrongStatus = compile(parseRules('/de/tools/:cat/  /tools/:cat/  302\n').rules);
    expect(unresolvedFixtures(wrongStatus, paths.slice(0, 1))[0]).toMatch(/status 302/);
    const deadTarget = compile(parseRules('/es/blog/tag/:tag  /tags/:tag/  301\n').rules);
    expect(unresolvedFixtures(deadTarget, paths.slice(1))[0]).toMatch(/not a live English page/);
    expect(isLiveEnglishTarget('/tools/no-such-category/')).toBe(false);
    expect(isLiveEnglishTarget('/blog/tag/no-such-tag/')).toBe(false);
  });

  it('structural errors are reported', () => {
    const { errors: e } = parseRules('/a  /b  301  extra\n/c  /d  418\n/c  /e  301\n');
    expect(e).toHaveLength(3);
  });
});

// Pure core for scripts/gsc-sync.mjs — no I/O, no network, so
// src/lib/gsc-sync.test.ts can pin every decision on synthetic data.
//
// Google exposes exactly two write-free levers for a plain content site:
//   sitemaps.submit        tell Google the sitemap changed (quota-free)
//   urlInspection.inspect  read a URL's coverage state (2,000/day, 600/min)
// There is no "request indexing" API for ordinary pages (the Indexing API is
// JobPosting/BroadcastEvent only), so the output of this module is a ranked
// list of URLs to request by hand in the Search Console UI, whose button is
// rate-limited to roughly ten a day — hence `uiQuota`.

export const LOCALES = ['de', 'es', 'fr', 'pt-br'];

/** @typedef {{ loc: string, lastmod: string | null }} SitemapRow */
/**
 * @typedef {object} Inspection
 * @property {string} url
 * @property {string | null} lastmod
 * @property {string} coverageState
 * @property {string} verdict
 * @property {string} robotsTxtState
 * @property {string} lastCrawlTime
 * @property {string} googleCanonical
 * @property {string} userCanonical
 */
/** @typedef {Inspection & { bucket: string }} ClassedInspection */

/**
 * `<url>` blocks → `{ loc, lastmod }`; alternates inside `<xhtml:link>` are never captured.
 * @param {string} xml
 * @returns {SitemapRow[]}
 */
export function parseSitemap(xml) {
  /** @type {SitemapRow[]} */
  const rows = [];
  for (const block of xml.matchAll(/<url>([\s\S]*?)<\/url>/g)) {
    const loc = block[1].match(/<loc>(.*?)<\/loc>/)?.[1]?.trim();
    if (!loc) continue;
    const lastmod = block[1].match(/<lastmod>(.*?)<\/lastmod>/)?.[1]?.trim().slice(0, 10) ?? null;
    rows.push({ loc, lastmod: lastmod || null });
  }
  return rows;
}

/**
 * Google's coverageState strings onto five buckets. Anything we do not
 * recognise but that Google judged NEUTRAL/FAIL is "excluded": the page is
 * known and deliberately not indexed (noindex, redirect, 404, duplicate), so
 * re-requesting it is pointless and the fix is on the page.
 */
/** @param {string} coverageState @param {string} verdict */
export function classify(coverageState, verdict) {
  if (verdict === 'ERROR') return 'error';
  const s = String(coverageState ?? '').toLowerCase();
  if (s.includes('unknown to google')) return 'unknown';
  if (s.startsWith('discovered')) return 'discovered-not-indexed';
  if (s.startsWith('crawled')) return 'crawled-not-indexed';
  if (s.includes('indexed') && !s.includes('not indexed')) return 'indexed';
  return 'excluded';
}

function pathOf(url) {
  try {
    return new URL(url).pathname;
  } catch {
    return url.startsWith('/') ? url : `/${url}`;
  }
}

function isLocalized(path) {
  return LOCALES.some((l) => path === `/${l}/` || path.startsWith(`/${l}/`));
}

function stripLocale(path) {
  for (const l of LOCALES) if (path.startsWith(`/${l}/`)) return path.slice(l.length + 1);
  return path;
}

/** Hubs: the homepage, section roots, category and tag listings. */
function isHub(path) {
  const p = stripLocale(path);
  if (p === '/') return true;
  const segs = p.split('/').filter(Boolean);
  if (segs.length === 1 && ['tools', 'blog', 'learn', 'tests', 'mission-90', 'changelog'].includes(segs[0]))
    return true;
  if (segs[0] === 'tools' && segs.length === 2) return true; // /tools/<category>/
  if (segs[0] === 'learn' && segs.length === 2) return true; // /learn/guides/, /learn/<section>/
  if (segs[0] === 'blog' && segs[1] === 'tag') return true;
  return false;
}

/**
 * Lower is more urgent. English content (tool pages, posts, guides) first —
 * they are the pages that can rank — then English hubs, then localized copies,
 * which have never drawn an impression and are the cheapest to leave waiting.
 */
/** @param {string} url */
export function priority(url) {
  const p = pathOf(url);
  let score = isLocalized(p) ? 20 : 0;
  score += isHub(p) ? 10 : 0;
  return score;
}

/**
 * Which URLs to inspect this run. Explicit `paths` win and keep their order
 * (a path not in the sitemap is still inspected — that is often the point).
 * Otherwise: filter by `since`, order by priority then newest lastmod, undated
 * last, and cut at `limit` so a run never approaches the daily quota.
 * @param {SitemapRow[]} rows
 * @param {{ since?: string, limit?: number, paths?: string[] }} [opts]
 * @param {string} [origin]
 * @returns {SitemapRow[]}
 */
export function selectUrls(rows, { since, limit = 50, paths } = {}, origin = 'https://opscanopy.com') {
  if (paths?.length) {
    const byPath = new Map(rows.map((r) => [pathOf(r.loc), r]));
    return paths.map((p) => {
      const path = p.startsWith('http') ? pathOf(p) : p.startsWith('/') ? p : `/${p}`;
      return byPath.get(path) ?? { loc: `${origin}${path}`, lastmod: null };
    });
  }
  let pool = rows.slice();
  if (since) pool = pool.filter((r) => r.lastmod && r.lastmod >= since);
  pool.sort((a, b) => {
    const pa = priority(a.loc);
    const pb = priority(b.loc);
    if (pa !== pb) return pa - pb;
    if (a.lastmod !== b.lastmod) return (b.lastmod ?? '').localeCompare(a.lastmod ?? '');
    return a.loc.localeCompare(b.loc);
  });
  return pool.slice(0, limit);
}

/**
 * Whether to PUT the sitemap. `remote` is the `sitemap` array from
 * sites.sitemaps.list. A pending fetch is never re-queued; otherwise submit
 * when Google has never seen the feed or last took it before our lastmod.
 */
/**
 * @param {{ path: string, lastSubmitted?: string, isPending?: boolean }[]} remote
 * @param {{ feedpath: string, localLastmod: string | null, force?: boolean }} opts
 */
export function sitemapDecision(remote, { feedpath, localLastmod, force = false }) {
  const entry = (remote ?? []).find((s) => s.path === feedpath);
  if (!entry) return { submit: true, reason: 'not registered' };
  if (entry.isPending) return { submit: false, reason: 'pending' };
  if (force) return { submit: true, reason: 'forced' };
  const seen = (entry.lastSubmitted ?? '').slice(0, 10);
  if (localLastmod && seen < localLastmod) return { submit: true, reason: `last submitted ${seen || 'never'}` };
  return { submit: false, reason: 'current' };
}

const BUCKETS = ['indexed', 'crawled-not-indexed', 'discovered-not-indexed', 'unknown', 'excluded', 'error'];

/**
 * Turn inspection rows into the two lists a human acts on:
 *   requestIndexing — unknown / discovered pages, by priority, capped at the
 *                     UI's daily "Request indexing" allowance;
 *   investigate     — canonical disagreements and API errors, which no amount
 *                     of re-requesting fixes.
 * "Crawled - currently not indexed" is reported but not listed: that verdict
 * is Google declining a page it already has, and the lever is authority.
 * @param {Inspection[]} rows
 * @param {{ uiQuota?: number }} [opts]
 */
export function summarize(rows, { uiQuota = 10 } = {}) {
  /** @type {Record<string, number>} */
  const counts = Object.fromEntries(BUCKETS.map((b) => [b, 0]));
  /** @type {ClassedInspection[]} */
  const classed = rows.map((r) => ({ ...r, bucket: classify(r.coverageState, r.verdict) }));
  for (const r of classed) counts[r.bucket] += 1;

  const candidates = classed
    .filter((r) => r.bucket === 'unknown' || r.bucket === 'discovered-not-indexed')
    .sort((a, b) => {
      const pa = priority(a.url);
      const pb = priority(b.url);
      if (pa !== pb) return pa - pb;
      return (b.lastmod ?? '').localeCompare(a.lastmod ?? '') || a.url.localeCompare(b.url);
    });
  const requestIndexing = candidates.slice(0, uiQuota);
  const requestIndexingOverflow = Math.max(0, candidates.length - uiQuota);

  const investigate = classed.filter(
    (r) =>
      r.bucket === 'error' ||
      (r.googleCanonical && r.userCanonical && r.googleCanonical !== r.userCanonical),
  );

  const md = [];
  md.push(`## Request indexing — ${candidates.length} URL(s) Google has not crawled`);
  md.push('');
  if (!candidates.length) {
    md.push('_Nothing waiting. Every inspected URL has been crawled at least once._');
  } else {
    md.push(
      'Open each in Search Console → URL inspection → **Request indexing**. The button allows about ten a day; the list is ranked so the first ten are the ones that matter.',
    );
    md.push('');
    md.push('| # | URL | State | lastmod |');
    md.push('|---|---|---|---|');
    requestIndexing.forEach((r, i) => md.push(`| ${i + 1} | ${r.url} | ${r.coverageState} | ${r.lastmod ?? '—'} |`));
    if (requestIndexingOverflow) md.push(`| | _${requestIndexingOverflow} more (lower priority)_ | | |`);
  }
  md.push('');
  if (investigate.length) {
    md.push(`## Investigate — ${investigate.length}`);
    md.push('');
    md.push('| URL | Verdict | State | Google canonical | Declared canonical |');
    md.push('|---|---|---|---|---|');
    for (const r of investigate)
      md.push(`| ${r.url} | ${r.verdict} | ${r.coverageState} | ${r.googleCanonical || '—'} | ${r.userCanonical || '—'} |`);
    md.push('');
  }
  md.push(`## Coverage — ${rows.length} inspected`);
  md.push('');
  for (const b of BUCKETS) if (counts[b]) md.push(`- **${counts[b]}** ${b}`);
  md.push('');
  md.push('| URL | State | Last crawl | robots |');
  md.push('|---|---|---|---|');
  for (const r of classed) md.push(`| ${r.url} | ${r.coverageState} | ${r.lastCrawlTime} | ${r.robotsTxtState} |`);
  md.push('');

  return { counts, requestIndexing, requestIndexingOverflow, investigate, rows: classed, markdown: md.join('\n') };
}

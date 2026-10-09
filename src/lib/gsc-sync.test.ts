import { describe, expect, it } from 'vitest';
import {
  classify,
  parseSitemap,
  priority,
  selectUrls,
  sitemapDecision,
  summarize,
} from '../../scripts/gsc-sync-core.mjs';

const XML = `<?xml version="1.0"?><urlset>
<url><loc>https://opscanopy.com/</loc><lastmod>2026-10-08T00:00:00.000Z</lastmod>
<xhtml:link rel="alternate" hreflang="de" href="https://opscanopy.com/de/"/></url>
<url><loc>https://opscanopy.com/jwt-decoder/</loc><lastmod>2026-10-04T00:00:00.000Z</lastmod></url>
<url><loc>https://opscanopy.com/de/jwt-decoder/</loc><lastmod>2026-10-04T00:00:00.000Z</lastmod></url>
<url><loc>https://opscanopy.com/blog/new-post/</loc><lastmod>2026-10-08T00:00:00.000Z</lastmod></url>
<url><loc>https://opscanopy.com/tools/networking/</loc></url>
</urlset>`;

describe('parseSitemap', () => {
  it('pairs each loc with its own lastmod and ignores hreflang alternates', () => {
    const rows = parseSitemap(XML);
    expect(rows).toHaveLength(5);
    expect(rows[0]).toEqual({ loc: 'https://opscanopy.com/', lastmod: '2026-10-08' });
    expect(rows[4]).toEqual({ loc: 'https://opscanopy.com/tools/networking/', lastmod: null });
    expect(rows.some((r) => r.loc === 'https://opscanopy.com/de/')).toBe(false);
  });
});

describe('classify', () => {
  it('maps Google coverage states onto the five buckets', () => {
    expect(classify('Submitted and indexed', 'PASS')).toBe('indexed');
    expect(classify('Indexed, not submitted in sitemap', 'PASS')).toBe('indexed');
    expect(classify('Crawled - currently not indexed', 'NEUTRAL')).toBe('crawled-not-indexed');
    expect(classify('Discovered - currently not indexed', 'NEUTRAL')).toBe('discovered-not-indexed');
    expect(classify('URL is unknown to Google', 'NEUTRAL')).toBe('unknown');
    expect(classify("Excluded by 'noindex' tag", 'FAIL')).toBe('excluded');
    expect(classify('Not found (404)', 'FAIL')).toBe('excluded');
    expect(classify('Page with redirect', 'NEUTRAL')).toBe('excluded');
    expect(classify('HTTP 429: quota', 'ERROR')).toBe('error');
  });
});

describe('priority', () => {
  it('ranks English content pages above hubs, and both above localized copies', () => {
    const p = (u: string) => priority(u);
    expect(p('https://opscanopy.com/jwt-decoder/')).toBeLessThan(p('https://opscanopy.com/tools/'));
    expect(p('https://opscanopy.com/blog/x/')).toBeLessThan(p('https://opscanopy.com/blog/'));
    expect(p('https://opscanopy.com/blog/x/')).toBeLessThan(p('https://opscanopy.com/blog/tag/x/'));
    expect(p('https://opscanopy.com/learn/guides/x/')).toBeLessThan(p('https://opscanopy.com/learn/guides/'));
    expect(p('https://opscanopy.com/tools/')).toBeLessThan(p('https://opscanopy.com/de/jwt-decoder/'));
    expect(p('https://opscanopy.com/pt-br/')).toBeGreaterThan(p('https://opscanopy.com/'));
  });
});

describe('selectUrls', () => {
  const rows = parseSitemap(XML);
  it('takes the newest first, English content before everything else, within the limit', () => {
    const picked = selectUrls(rows, { limit: 3 });
    expect(picked.map((r) => r.loc)).toEqual([
      'https://opscanopy.com/blog/new-post/',
      'https://opscanopy.com/jwt-decoder/',
      'https://opscanopy.com/', // a hub, so it trails the content pages despite being newer
    ]);
  });
  it('honours --since and keeps priority above recency (localized copies last)', () => {
    const picked = selectUrls(rows, { since: '2026-10-05', limit: 10 });
    expect(picked.map((r) => r.loc)).toEqual([
      'https://opscanopy.com/blog/new-post/',
      'https://opscanopy.com/',
    ]);
    const all = selectUrls(rows, { limit: 10 });
    expect(all.map((r) => r.loc).slice(-2)).toEqual([
      'https://opscanopy.com/tools/networking/',
      'https://opscanopy.com/de/jwt-decoder/',
    ]);
  });
  it('restricts to explicit paths, keeping their order, and accepts bare paths', () => {
    const picked = selectUrls(rows, { paths: ['/de/jwt-decoder/', '/'] });
    expect(picked.map((r) => r.loc)).toEqual([
      'https://opscanopy.com/de/jwt-decoder/',
      'https://opscanopy.com/',
    ]);
  });
  it('keeps an explicit path even when it is not in the sitemap', () => {
    const picked = selectUrls(rows, { paths: ['/not-in-sitemap/'] }, 'https://opscanopy.com');
    expect(picked).toEqual([{ loc: 'https://opscanopy.com/not-in-sitemap/', lastmod: null }]);
  });
});

describe('sitemapDecision', () => {
  const feed = 'https://opscanopy.com/sitemap-index.xml';
  it('submits when the sitemap is not registered', () => {
    expect(sitemapDecision([], { feedpath: feed, localLastmod: '2026-10-08' })).toEqual({
      submit: true,
      reason: 'not registered',
    });
  });
  it('submits when Google last fetched it before the current lastmod', () => {
    const remote = [{ path: feed, lastSubmitted: '2026-10-01T00:00:00.000Z', isPending: false }];
    expect(sitemapDecision(remote, { feedpath: feed, localLastmod: '2026-10-08' }).submit).toBe(true);
  });
  it('skips when the registered copy is already current or still pending', () => {
    const current = [{ path: feed, lastSubmitted: '2026-10-08T06:00:00.000Z', isPending: false }];
    expect(sitemapDecision(current, { feedpath: feed, localLastmod: '2026-10-08' })).toEqual({
      submit: false,
      reason: 'current',
    });
    const pending = [{ path: feed, lastSubmitted: '2026-10-01T00:00:00.000Z', isPending: true }];
    expect(sitemapDecision(pending, { feedpath: feed, localLastmod: '2026-10-08' }).reason).toBe('pending');
  });
  it('force always submits unless pending', () => {
    const current = [{ path: feed, lastSubmitted: '2026-10-08T06:00:00.000Z', isPending: false }];
    expect(sitemapDecision(current, { feedpath: feed, localLastmod: '2026-10-08', force: true })).toEqual({
      submit: true,
      reason: 'forced',
    });
  });
});

describe('summarize', () => {
  const row = (url: string, coverageState: string, extra: Record<string, unknown> = {}) => ({
    url,
    lastmod: '2026-10-08',
    coverageState,
    verdict: 'NEUTRAL',
    robotsTxtState: 'ALLOWED',
    lastCrawlTime: 'never',
    googleCanonical: '',
    userCanonical: '',
    ...extra,
  });
  const rows = [
    row('https://opscanopy.com/', 'Submitted and indexed', { verdict: 'PASS' }),
    row('https://opscanopy.com/de/x/', 'URL is unknown to Google'),
    row('https://opscanopy.com/x/', 'URL is unknown to Google'),
    row('https://opscanopy.com/y/', 'Discovered - currently not indexed'),
    row('https://opscanopy.com/z/', 'Crawled - currently not indexed'),
    row('https://opscanopy.com/w/', 'Duplicate, Google chose different canonical than user', {
      verdict: 'FAIL',
      googleCanonical: 'https://opscanopy.com/w',
      userCanonical: 'https://opscanopy.com/w/',
    }),
    row('https://opscanopy.com/q/', 'HTTP 429', { verdict: 'ERROR' }),
  ];
  const s = summarize(rows, { uiQuota: 2 });

  it('counts every bucket', () => {
    expect(s.counts).toEqual({
      indexed: 1,
      'crawled-not-indexed': 1,
      'discovered-not-indexed': 1,
      unknown: 2,
      excluded: 1,
      error: 1,
    });
  });
  it('builds the request-indexing list by priority, capped at the UI quota', () => {
    expect(s.requestIndexing.map((r) => r.url)).toEqual([
      'https://opscanopy.com/x/',
      'https://opscanopy.com/y/',
    ]);
    expect(s.requestIndexingOverflow).toBe(1);
  });
  it('flags canonical disagreements and errors for investigation, not re-submission', () => {
    expect(s.investigate.map((r) => r.url)).toEqual(['https://opscanopy.com/w/', 'https://opscanopy.com/q/']);
  });
  it('renders markdown with the actionable list first', () => {
    expect(s.markdown).toContain('## Request indexing');
    expect(s.markdown.indexOf('## Request indexing')).toBeLessThan(s.markdown.indexOf('## Coverage'));
    expect(s.markdown).toContain('| https://opscanopy.com/x/ |');
    expect(s.markdown).toContain('1 more');
  });
});

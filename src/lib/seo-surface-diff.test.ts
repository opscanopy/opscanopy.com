/**
 * SEO-surface diff guard (scripts/seo-surface-diff.mjs).
 *
 * The guard runs before every design-pass push and must fail closed on any
 * unexplained change to what a search engine reads. CI runs tests before any
 * build, so the decisions are pinned here against the pure core with in-memory
 * fixtures. `node scripts/seo-surface-diff.mjs --self-test` runs the SAME
 * cases (selfTestCases) on synthetic dist trees written to os.tmpdir(), so the
 * file-reading path is exercised too.
 */
import { describe, it, expect } from 'vitest';
import {
  selfTestCases,
  checkCase,
  indexFromFiles,
  extractOptionsFor,
  validateAllowlist,
  compareSites,
  extractPage,
  tokenize,
  decodeEntities,
  pathFromFile,
  classify,
  internalHref,
  collapseDiffs,
  renderMarkdown,
  fixtureSite,
  fixtureManyTools,
  parseSelector,
  coldVerdict,
} from '../../scripts/seo-surface-core.mjs';
import allowA from '../../scripts/seo-allow/A-tokens-css.json';

/** Run one case through the same pipeline the CLI uses, minus the file system. */
function run(c: ReturnType<typeof selfTestCases>[number]) {
  const allow = c.allow ? validateAllowlist(c.allow) : null;
  const opts = extractOptionsFor(allow);
  const base = indexFromFiles(c.base, opts.base);
  const cand = indexFromFiles(c.cand, opts.cand);
  return compareSites(base, cand, allow, { today: c.today });
}

describe('fixture cases (shared with --self-test)', () => {
  const cases = selfTestCases();

  it('covers every case the plan names', () => {
    const names = cases.map((c) => c.name).join('\n');
    for (const want of [
      'identical trees',
      'title change',
      '`to` matches',
      '`to` does not match',
      'dateModified-only',
      'H2 reorder',
      'watched anchor text change',
      'inbound 50% drop',
      'data-pagefind-body removed',
      'sitemap lastmod change',
      'page removed',
      'expired allowlist',
      '21% word drop (the >20% rule)',
      '5% word drop → informational',
      'maxDrop 0.25',
      'no <main>',
      'lang change',
      'robots flip',
      'hidden-count increase on a tool page',
      'lost inter-span H1 space on 195 pages',
      'lede text altered by one word',
      '<figure class="code-fig"> → positive pass',
    ])
      expect(names, want).toContain(want);
  });

  it('covers the cases added after the 2026-10-02 review', () => {
    const names = cases.map((c) => c.name).join('\n');
    for (const want of [
      'inbound 10% drop → informational',
      'inbound 10% drop past a maxDrop 0 rule → must-explain',
      'first matching rule wins',
      'inline display:none on a tool page',
      'tool page loses #playground',
      'unquoted href ending in "/"',
    ])
      expect(names, want).toContain(want);
  });

  it('covers the cases added after the second 2026-10-02 review', () => {
    const names = cases.map((c) => c.name).join('\n');
    for (const want of [
      'URL dropped from the sitemap while its page builds',
      'URL added to the sitemap for a page that already built',
      'page removed with its sitemap URL',
      'FAQ question text changed in JSON-LD',
      'x-default retargeted',
      'moved into a <template> inside <main>',
      'moved into a <noscript> inside <main>',
    ])
      expect(names, want).toContain(want);
  });

  for (const c of cases) {
    it(c.name, () => {
      expect(checkCase(c, run(c))).toEqual([]);
    });
  }
});

describe('extraction', () => {
  const site = fixtureSite();
  const page = extractPage(site['subnet-calculator/index.html'], '/subnet-calculator/');

  it('reads the head surface', () => {
    expect(page.errors).toEqual([]);
    expect(page.title).toBe('Subnet Calculator — Free IPv4 & IPv6');
    expect(page.canonical).toBe('https://opscanopy.com/subnet-calculator/');
    expect(page.lang).toBe('en');
    expect(page.xDefault).toBe('https://opscanopy.com/subnet-calculator/');
    expect(Object.keys(page.hreflang).sort()).toEqual(['de', 'en']);
    expect(page.og['og:image']).toBe('https://opscanopy.com/og.png');
    expect(page.pagefind).toBe(true);
    expect(page.isTool).toBe(true);
  });

  it('keeps the inter-span space in the H1 (textContent semantics)', () => {
    expect(page.h1).toEqual(['Subnet Calculator: Subnet any block at a glance.']);
  });

  it('masks dateModified in JSON-LD and sorts keys', () => {
    const app = page.ld.find((l: { type: string }) => l.type === 'SoftwareApplication');
    expect(app.body).toContain('"dateModified":"<masked>"');
    expect(app.body.indexOf('"@context"')).toBeLessThan(app.body.indexOf('"name"'));
  });

  it('a ">" or a tag inside a quoted attribute value does not end the tag', () => {
    const html = site['subnet-calculator/index.html'].replace(
      'data-copy="a -> b, x > y"',
      'data-copy="a -> b, <h1>no</h1> > z"',
    );
    const p = extractPage(html, '/subnet-calculator/');
    expect(p.errors).toEqual([]);
    expect(p.h1).toHaveLength(1);
    expect(p.words).toBe(page.words);
    const { nodes } = tokenize('<div data-x="1 > 0" class="a">t</div>');
    expect(nodes[0]).toMatchObject({ k: 's', name: 'div', attrs: { 'data-x': '1 > 0', class: 'a' } });
  });

  it('reads a trailing "/" as self-closing only after whitespace, a quote, or alone', () => {
    const at = (html: string) => tokenize(html).nodes[0];
    expect(at('<a href=/learn/>x</a>')).toMatchObject({ attrs: { href: '/learn/' }, void: false });
    expect(at('<a href=/>x</a>')).toMatchObject({ attrs: { href: '/' }, void: false });
    expect(at('<br/>')).toMatchObject({ name: 'br', void: true });
    expect(at('<img src="x.png"/>')).toMatchObject({ attrs: { src: 'x.png' }, void: true });
    expect(at('<img src=x.png />')).toMatchObject({ attrs: { src: 'x.png' }, void: true });
  });

  it('counts inline display:none / visibility:hidden as hidden, but not display:block', () => {
    const tool = site['subnet-calculator/index.html'];
    const withStyle = (style: string) =>
      extractPage(tool.replace('<p class="body-md lede">', `<p class="body-md lede" style="${style}">`), '/subnet-calculator/').hidden;
    expect(withStyle('color: red; DISPLAY:none')).toBe(page.hidden + 1);
    expect(withStyle('visibility: hidden')).toBe(page.hidden + 1);
    expect(withStyle('display: block')).toBe(page.hidden);
  });

  it('counts <template> / <noscript> inside <main> as hidden and leaves their text out of words and <main> text', () => {
    const tool = site['subnet-calculator/index.html'];
    const lede = '<p class="body-md lede">Network, broadcast, netmask &amp; wildcard for any IPv4 or IPv6 CIDR.</p>';
    expect(tool).toContain(lede);
    for (const tag of ['template', 'noscript']) {
      const p = extractPage(tool.replace(lede, `<${tag}>${lede}</${tag}>`), '/subnet-calculator/', { mainText: true });
      expect(p.errors, tag).toEqual([]);
      expect(p.hidden, tag).toBe(page.hidden + 1);
      expect(p.words, tag).toBe(page.words - 10);
      expect(p.mainText, tag).not.toContain('netmask');
    }
    // Outside <main> they are not page copy the guard watches either way.
    expect(extractPage(tool.replace('</main>', '</main><template><p>x</p></template>'), '/subnet-calculator/').hidden).toBe(page.hidden);
  });

  it('ignores an SVG <title> in the body (head title only)', () => {
    const html = site['index.html'].replace('<main id="main"', '<svg><title>Diagram</title></svg><main id="main"');
    expect(extractPage(html, '/').title).toBe('OpsCanopy');
  });

  it('fails closed: no <main>, no canonical, no head title are extraction errors', () => {
    const bare = '<html lang="en"><head></head><body><h1>x</h1></body></html>';
    expect(extractPage(bare, '/x/').errors).toEqual(['no <main>', 'no <title> in <head>', 'no canonical']);
  });

  it('records watched anchors, protected footer hrefs and the inbound index', () => {
    const tools = extractPage(site['tools/index.html'], '/tools/');
    expect(tools.anchors['/tools/networking/']).toEqual(['Networking 6']);
    expect(tools.footer).toContain('/privacy/');
    const de = extractPage(site['de/subnet-calculator/index.html'], '/de/subnet-calculator/');
    expect(de.footer).toContain('/de/privacy/');
    expect(de.footer).toContain('/changelog/');
    const idx = indexFromFiles(site);
    expect(idx.inbound['/tools/networking/']).toBe(2);
  });

  it('captures a selector text and the <main> text on demand', () => {
    const p = extractPage(site['subnet-calculator/index.html'], '/subnet-calculator/', {
      selectors: ['h1 ~ p.lede', 'figure.code-fig'],
      mainText: true,
    });
    expect(p.selected['h1 ~ p.lede']).toBe('Network, broadcast, netmask & wildcard for any IPv4 or IPv6 CIDR.');
    expect(p.selected['figure.code-fig']).toBeNull();
    expect(p.mainText).toContain('netmask & wildcard');
    expect(() => parseSelector('div > p')).toThrow(/unsupported selector/);
  });
});

describe('helpers', () => {
  it('maps dist files to site paths', () => {
    expect(pathFromFile('index.html')).toBe('/');
    expect(pathFromFile('de\\tools\\index.html')).toBe('/de/tools/');
    expect(pathFromFile('404.html')).toBe('/404.html');
  });

  it('classifies routes, with tool pages recognised by #playground', () => {
    expect(classify('/', undefined)).toBe('home');
    expect(classify('/pt-br/tools/', undefined)).toBe('tools-hub');
    expect(classify('/de/tools/networking/', undefined)).toBe('tool-category');
    expect(classify('/subnet-calculator/', { isTool: true })).toBe('tool');
    expect(classify('/about/', { isTool: false })).toBe('info');
    expect(classify('/blog/tag/ci-cd/', undefined)).toBe('blog-tag');
  });

  it('normalises internal hrefs and drops external / fragment ones', () => {
    expect(internalHref('https://opscanopy.com/blog/#x', '/')).toBe('/blog/');
    expect(internalHref('/tools/?cat=dns', '/')).toBe('/tools/?cat=dns');
    expect(internalHref('#main', '/')).toBeNull();
    expect(internalHref('https://github.com/opscanopy', '/')).toBeNull();
    expect(internalHref('mailto:hello@opscanopy.com', '/')).toBeNull();
  });

  it('decodes entities', () => {
    expect(decodeEntities('IPv4 &amp; IPv6 &#8212; &#x2192; &nbsp;')).toBe('IPv4 & IPv6 — →  ');
  });

  it('collapses identical diffs across many pages to one line with three samples', () => {
    const r = compareSites(indexFromFiles(fixtureManyTools(195, ' ')), indexFromFiles(fixtureManyTools(195, '')), null, {
      today: '2026-10-02',
    });
    const groups = collapseDiffs(r.mustExplain);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ field: 'h1', count: 195 });
    expect(groups[0].samples).toHaveLength(3);
    const md = renderMarkdown(r, { batch: 'x', date: '2026-10-02' });
    expect(md).toContain('195 pages, e.g. /tool-0/, /tool-1/, /tool-10/');
    expect(md).toContain('**Exit 1**');
  });

  it("the report's Exit line is the caller's final exit code, with the cold-build failure named", () => {
    const idx = indexFromFiles(fixtureSite());
    const r = compareSites(idx, idx, null, { today: '2026-10-02' });
    expect(r.exitCode).toBe(0);
    expect(renderMarkdown(r, { batch: 'x', date: '2026-10-02' })).toContain('**Exit 0**');
    const md = renderMarkdown(r, { batch: 'x', date: '2026-10-02', exit: 1, notCold: 'the candidate' });
    expect(md).toContain('**Exit 1**');
    expect(md).not.toContain('**Exit 0**');
    expect(md).toContain('Not a verified cold build: the candidate');
  });
});

describe('cold-build verdict', () => {
  it('rests on the rename plus a fresh store and the sync line, and never claims a pre-build absence check', () => {
    const ok = coldVerdict({ hadCache: true, storeWritten: true, synced: true });
    expect(ok).toEqual({
      cold: true,
      detail:
        'cold content layer (node_modules/.astro moved aside before the build: yes; ' +
        'fresh data-store.json written by the build: true; "[content] Synced content" logged: true)',
    });
    expect(coldVerdict({ hadCache: false, storeWritten: true, synced: true }).detail).toContain('moved aside before the build: none existed');
    expect(coldVerdict({ hadCache: true, storeWritten: false, synced: true }).cold).toBe(false);
    expect(coldVerdict({ hadCache: true, storeWritten: true, synced: false })).toMatchObject({ cold: false, detail: expect.stringMatching(/^NOT PROVABLY COLD/) });
    for (const o of [ok, coldVerdict({ hadCache: false, storeWritten: false, synced: false })]) expect(o.detail).not.toMatch(/absent before/i);
  });
});

describe('allowlist', () => {
  it('the shipped Batch A allowlist is valid, rule-free and expires 2026-11-30', () => {
    expect(validateAllowlist(structuredClone(allowA))).toBeTruthy();
    expect(allowA.rules).toEqual([]);
    expect(allowA.expires).toBe('2026-11-30');
  });

  it('rejects unknown keys, missing reasons and bad regexes', () => {
    const ok = { batch: 'b', expires: '2026-11-30', rules: [] as unknown[] };
    expect(() => validateAllowlist({ ...ok, rules: [{ field: 'h1', reason: 'x', pagez: '.' }] })).toThrow(/unknown key/);
    expect(() => validateAllowlist({ ...ok, rules: [{ field: 'h1' }] })).toThrow(/reason/);
    expect(() => validateAllowlist({ ...ok, rules: [{ field: 'h1', reason: 'x', pages: '(' }] })).toThrow(/regex/);
    expect(() => validateAllowlist({ ...ok, rules: [{ field: 'lede-present', reason: 'x' }] })).toThrow(/selector/);
    expect(() => validateAllowlist({ ...ok, expires: 'soon' })).toThrow(/expires/);
  });
});

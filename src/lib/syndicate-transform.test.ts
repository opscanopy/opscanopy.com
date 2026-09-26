import { describe, expect, it } from 'vitest';
import { transformForDevto, ogImagePath } from '../../scripts/syndicate-transform.mjs';

const ORIGIN = 'https://opscanopy.com';

/** A fake `public/` tree: the set of root-relative paths that exist. */
const siteWith = (...files: string[]) => {
  const set = new Set(files);
  return { origin: ORIGIN, hasFile: (p: string) => set.has(p) };
};

const blogPost = (body: string, slug = 'jwt-io-alternative') => ({
  slug,
  kind: 'blog',
  title: 'T',
  description: 'D',
  tags: ['a'],
  canonical: `${ORIGIN}/blog/${slug}/`,
  body,
});

const HERO = `![A JWT split into header, payload and signature.](${ORIGIN}/blog/jwt-io-alternative-hero.svg)`;

describe('transformForDevto', () => {
  it('swaps a -hero.svg image for its -og.png sibling when the png exists, keeping alt text', () => {
    const site = siteWith('/blog/jwt-io-alternative-og.png');
    const out = transformForDevto(blogPost(`Intro\n\n${HERO}\n\nMore.`), site);
    expect(out.body).toContain(
      `![A JWT split into header, payload and signature.](${ORIGIN}/blog/jwt-io-alternative-og.png)`,
    );
    expect(out.body).not.toContain('-hero.svg');
    expect(out.report.swapped).toEqual([`${ORIGIN}/blog/jwt-io-alternative-hero.svg`]);
  });

  it('also swaps a root-relative hero path (pre-absolutise input)', () => {
    const site = siteWith('/blog/jwt-io-alternative-og.png');
    const out = transformForDevto(blogPost('![x](/blog/jwt-io-alternative-hero.svg)'), site);
    expect(out.body).toBe('![x](/blog/jwt-io-alternative-og.png)');
  });

  it('leaves the hero svg untouched when no png sibling exists', () => {
    const out = transformForDevto(blogPost(HERO), siteWith());
    expect(out.body).toBe(HERO);
    expect(out.report.swapped).toEqual([]);
    expect(out.report.otherSvgs).toEqual([`${ORIGIN}/blog/jwt-io-alternative-hero.svg`]);
  });

  it('sets main_image to the absolute og png for a blog post', () => {
    const out = transformForDevto(blogPost(HERO), siteWith('/blog/jwt-io-alternative-og.png'));
    expect(out.main_image).toBe(`${ORIGIN}/blog/jwt-io-alternative-og.png`);
  });

  it('omits main_image when the og png is missing', () => {
    const out = transformForDevto(blogPost(HERO), siteWith());
    expect(out.main_image).toBeUndefined();
  });

  it('uses the site default og card for guides, matching their og:image', () => {
    const guide = { ...blogPost('Body'), kind: 'guide', slug: 'linux-for-devops' };
    expect(ogImagePath(guide)).toBe('/og-default.png');
    const out = transformForDevto(guide, siteWith('/og-default.png'));
    expect(out.main_image).toBe(`${ORIGIN}/og-default.png`);
  });

  it('leaves other images alone, but reports non-hero svgs', () => {
    const body = [
      `![diagram](${ORIGIN}/blog/jwt-io-alternative-flow.svg)`,
      `![shot](${ORIGIN}/blog/screenshot.png)`,
      `![ext](https://example.com/hero.svg)`,
      '[a link, not an image](https://opscanopy.com/blog/jwt-io-alternative-hero.svg)',
    ].join('\n');
    const site = siteWith('/blog/jwt-io-alternative-og.png', '/blog/jwt-io-alternative-flow-og.png');
    const out = transformForDevto(blogPost(body), site);
    expect(out.body).toBe(body);
    expect(out.report.otherSvgs).toEqual([
      `${ORIGIN}/blog/jwt-io-alternative-flow.svg`,
      'https://example.com/hero.svg',
    ]);
  });

  it('never touches canonical, title, description or tags', () => {
    const post = blogPost(HERO);
    const out = transformForDevto(post, siteWith('/blog/jwt-io-alternative-og.png'));
    expect(out.canonical).toBe(post.canonical);
    expect(out.title).toBe(post.title);
    expect(out.description).toBe(post.description);
    expect(out.tags).toEqual(post.tags);
  });

  it('does not mutate its input', () => {
    const post = blogPost(HERO);
    transformForDevto(post, siteWith('/blog/jwt-io-alternative-og.png'));
    expect(post.body).toBe(HERO);
    expect(post).not.toHaveProperty('main_image');
  });

  it('is idempotent', () => {
    const site = siteWith('/blog/jwt-io-alternative-og.png');
    const once = transformForDevto(blogPost(`${HERO}\n\ntext`), site);
    const twice = transformForDevto(once, site);
    expect(twice.body).toBe(once.body);
    expect(twice.main_image).toBe(once.main_image);
    expect(twice.report.swapped).toEqual([]);
  });

  it('drops a leading hero that would duplicate the cover image', () => {
    const site = siteWith('/blog/jwt-io-alternative-og.png');
    const out = transformForDevto(blogPost(`${HERO}\n\nFirst paragraph.`), site);
    expect(out.main_image).toBe(`${ORIGIN}/blog/jwt-io-alternative-og.png`);
    expect(out.body).toBe('First paragraph.');
    expect(out.report.droppedLeadingHero).toBe(true);
  });

  it('keeps a leading hero when there is no cover to show it', () => {
    const out = transformForDevto(blogPost(`${HERO}\n\nFirst paragraph.`), siteWith());
    expect(out.body.startsWith('![')).toBe(true);
  });

  it('strips internal HTML comments outside code, never inside fenced code', () => {
    const body =
      '<!-- keywords: a, b | source: ahrefs -->\n\nHello <!-- note --> world.\n\n```html\n<!-- keep me -->\n```\n';
    const out = transformForDevto(blogPost(body), siteWith());
    expect(out.body).not.toContain('keywords:');
    expect(out.body).not.toContain('<!-- note -->');
    expect(out.body).toContain('Hello  world.');
    expect(out.body).toContain('```html\n<!-- keep me -->\n```');
  });
});

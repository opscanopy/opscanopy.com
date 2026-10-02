/**
 * rehype-blog-thumb — a blog post's first body image (its own cover,
 * `/blog/<slug>-hero.svg`) ships as the title-free `/blog/<slug>-thumb.svg`.
 * Run through the real Astro markdown pipeline with rehype-img-dims behind
 * it, in the order astro.config.mjs registers them, so what is asserted is
 * what a page receives: src rewritten, alt and dimensions unchanged, no
 * other image visited, non-blog content untouched, a missing thumb never
 * substituted. The corpus leg proves every shipped post qualifies.
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { basename, join, resolve } from 'node:path';
import { createMarkdownProcessor } from '@astrojs/markdown-remark';
import rehypeBlogThumb, { firstImg, isBlogPath, thumbSrc } from './rehype-blog-thumb.mjs';
import rehypeImgDims from './rehype-img-dims.mjs';

const ROOT = resolve(__dirname, '../..');
const PUBLIC = join(ROOT, 'public');
const BLOG = join(ROOT, 'src/content/blog');
const SLUG = 'common-gitlab-ci-mistakes';
const ALT = 'Annotated .gitlab-ci.yml — an undefined stage, a job with no "script", and a broken needs reference';

async function render(md: string, opts: { thumb?: boolean; file?: string } = {}) {
  const { thumb = true, file = `src/content/blog/en/${SLUG}.md` } = opts;
  const processor = await createMarkdownProcessor({
    rehypePlugins: thumb ? [rehypeBlogThumb, rehypeImgDims] : [rehypeImgDims],
  } as Parameters<typeof createMarkdownProcessor>[0]);
  return (await processor.render(md, { fileURL: pathToFileURL(resolve(ROOT, file)) } as never)).code;
}

/** Every `<img …>` tag in the output, in order. */
const imgs = (html: string) => html.match(/<img\b[^>]*>/g) ?? [];
const attr = (tag: string | undefined, name: string) => (tag ? new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1] ?? null : null);

const POST = [`![${ALT}](/blog/${SLUG}-hero.svg)`, '', 'Intro paragraph.', '', `![The diagram](/blog/${SLUG}-diagram.svg)`, ''].join('\n');

describe('rehype-blog-thumb helpers can fail', () => {
  it('recognises only blog content paths', () => {
    expect(isBlogPath('C:\\repo\\src\\content\\blog\\en\\x.md')).toBe(true);
    expect(isBlogPath('/repo/src/content/blog/pt-br/x.md')).toBe(true);
    expect(isBlogPath('/repo/src/content/guides/x.md')).toBe(false);
    expect(isBlogPath('/repo/src/content/mission90/day-001.md')).toBe(false);
    expect(isBlogPath(undefined)).toBe(false);
  });
  it('maps only a root-relative blog hero to its thumb', () => {
    expect(thumbSrc('/blog/reading-promql-hero.svg')).toBe('/blog/reading-promql-thumb.svg');
    expect(thumbSrc('/blog/reading-promql-diagram.svg')).toBeNull();
    expect(thumbSrc('/blog/reading-promql-hero.png')).toBeNull();
    expect(thumbSrc('https://example.com/blog/x-hero.svg')).toBeNull();
    expect(thumbSrc(undefined)).toBeNull();
  });
  it('finds the first <img> in document order', () => {
    const tree = {
      type: 'root',
      children: [
        { type: 'element', tagName: 'p', children: [{ type: 'text', value: 'x' }] },
        { type: 'element', tagName: 'p', children: [{ type: 'element', tagName: 'img', properties: { src: 'a' } }] },
        { type: 'element', tagName: 'img', properties: { src: 'b' } },
      ],
    };
    expect(firstImg(tree)?.properties.src).toBe('a');
    expect(firstImg({ type: 'root', children: [] })).toBeNull();
  });
});

describe('rehypeBlogThumb through createMarkdownProcessor', () => {
  it('rewrites the first image src to the thumb and keeps alt, width and height', async () => {
    const [first] = imgs(await render(POST));
    expect(attr(first, 'src')).toBe(`/blog/${SLUG}-thumb.svg`);
    expect(attr(first, 'alt')).toBe(ALT.replace(/"/g, '&#x22;'));
    expect(attr(first, 'width')).toBe('1200');
    expect(attr(first, 'height')).toBe('630');
  });

  it('changes nothing but that one src (the rest of the HTML is byte-identical)', async () => {
    const without = await render(POST, { thumb: false });
    const withThumb = await render(POST);
    expect(imgs(without)).toHaveLength(2);
    expect(attr(imgs(without)[0], 'src')).toBe(`/blog/${SLUG}-hero.svg`);
    expect(withThumb).not.toBe(without);
    expect(withThumb).toBe(without.replace(`/blog/${SLUG}-hero.svg`, `/blog/${SLUG}-thumb.svg`));
    // The second image is the diagram, untouched.
    expect(attr(imgs(withThumb)[1], 'src')).toBe(`/blog/${SLUG}-diagram.svg`);
  });

  it('leaves a non-blog file alone', async () => {
    for (const file of ['src/content/guides/x.md', 'src/content/mission90/day-001.md']) {
      const html = await render(POST, { file });
      expect(attr(imgs(html)[0], 'src')).toBe(`/blog/${SLUG}-hero.svg`);
    }
  });

  it('only the FIRST image is a candidate — a hero later in the body is not rewritten', async () => {
    const md = [`![The diagram](/blog/${SLUG}-diagram.svg)`, '', `![${ALT}](/blog/${SLUG}-hero.svg)`, ''].join('\n');
    const html = await render(md);
    expect(attr(imgs(html)[0], 'src')).toBe(`/blog/${SLUG}-diagram.svg`);
    expect(attr(imgs(html)[1], 'src')).toBe(`/blog/${SLUG}-hero.svg`);
  });

  it('keeps the hero when no thumb exists for it', async () => {
    expect(existsSync(join(PUBLIC, 'blog/no-such-post-thumb.svg'))).toBe(false);
    const html = await render('![x](/blog/no-such-post-hero.svg)\n');
    expect(attr(imgs(html)[0], 'src')).toBe('/blog/no-such-post-hero.svg');
  });

  it('works for every locale directory', async () => {
    for (const lang of ['de', 'es', 'fr', 'pt-br']) {
      const html = await render(POST, { file: `src/content/blog/${lang}/${SLUG}.md` });
      expect(attr(imgs(html)[0], 'src')).toBe(`/blog/${SLUG}-thumb.svg`);
    }
  });
});

describe('blog corpus: every post qualifies for the swap', () => {
  const posts: Array<{ lang: string; file: string }> = [];
  for (const lang of readdirSync(BLOG)) {
    for (const f of readdirSync(join(BLOG, lang))) if (f.endsWith('.md')) posts.push({ lang, file: join(BLOG, lang, f) });
  }
  const viewBox = (file: string) => /viewBox="([^"]*)"/.exec(readFileSync(file, 'utf8'))?.[1] ?? null;

  it('finds the posts', () => {
    expect(posts.length).toBeGreaterThanOrEqual(100);
  });

  it("the first image of every post is its own hero, and the thumb exists with the same viewBox", () => {
    for (const { file } of posts) {
      const slug = basename(file, '.md');
      const body = readFileSync(file, 'utf8').replace(/^---[\s\S]*?\n---/, '');
      const first = /!\[[^\]]*\]\(([^)\s]+)\)/.exec(body)?.[1] ?? null;
      expect(first, file).toBe(`/blog/${slug}-hero.svg`);
      const hero = join(PUBLIC, 'blog', `${slug}-hero.svg`);
      const thumb = join(PUBLIC, 'blog', `${slug}-thumb.svg`);
      expect(existsSync(thumb), thumb).toBe(true);
      expect(viewBox(thumb), thumb).toBe(viewBox(hero));
      expect(viewBox(thumb)).toBe('0 0 1200 630');
    }
  });
});

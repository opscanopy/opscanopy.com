/**
 * rehype-blog-thumb — swaps a blog post's in-body cover for its title-free
 * plate at render time, without touching the markdown.
 *
 * Every post opens with `![alt](/blog/<slug>-hero.svg)`. Since the covers
 * started printing the post title (scripts/blog-cover.mjs, 2026-10-02) that
 * first image repeats the H1 directly under it. The same generator writes a
 * `<slug>-thumb.svg` — the identical plate (same 1200×630 viewBox, kind cap,
 * icon, wordmark) with no title — so the body's FIRST image, when it is the
 * post's own hero, is re-pointed at the thumb. Nothing else changes: alt and
 * every other attribute stay as written, no other image is visited, og:image
 * is the PNG the page's frontmatter names, and a file outside
 * `src/content/blog/` is left alone (guides and Mission 90 days do not carry
 * a cover in the body, and must not be rewritten if one ever does).
 *
 * Runs BEFORE rehype-img-dims, so width/height are read from the file that
 * actually ships (the two plates share a viewBox, so the numbers are the
 * same either way). If the thumb does not exist under public/ the src is
 * kept — a missing cover is a broken image, never a silent downgrade.
 *
 * node:fs + node:path only.
 */
import fs from 'node:fs';
import path from 'node:path';

/** True for a markdown file under `content/blog/` (any locale). @param {string | undefined} p */
export function isBlogPath(p) {
  return /[\\/]content[\\/]blog[\\/]/.test(p ?? '');
}

/** The thumb src for a hero src, or null when `src` is not a blog hero. @param {unknown} src */
export function thumbSrc(src) {
  const m = typeof src === 'string' ? /^\/blog\/([a-z0-9-]+)-hero\.svg$/.exec(src) : null;
  return m ? `/blog/${m[1]}-thumb.svg` : null;
}

/** First `<img>` element in document order, or null. @param {any} node */
export function firstImg(node) {
  if (node?.type === 'element' && node.tagName === 'img') return node;
  for (const child of node?.children ?? []) {
    const hit = firstImg(child);
    if (hit) return hit;
  }
  return null;
}

/** @param {{ publicDir?: string }} [options] */
export default function rehypeBlogThumb(options = {}) {
  const publicDir = path.resolve(options.publicDir ?? path.join(process.cwd(), 'public'));
  /** @type {Map<string, boolean>} */
  const exists = new Map();
  const hasFile = (/** @type {string} */ src) => {
    if (!exists.has(src)) {
      let ok = false;
      try {
        ok = fs.statSync(path.join(publicDir, '.' + src)).isFile();
      } catch {
        ok = false;
      }
      exists.set(src, ok);
    }
    return exists.get(src);
  };

  /** @param {any} tree @param {any} file */
  return (tree, file) => {
    if (!isBlogPath(file?.path ?? file?.history?.[0])) return;
    const img = firstImg(tree);
    if (!img) return;
    const thumb = thumbSrc(img.properties?.src);
    if (thumb && hasFile(thumb)) img.properties.src = thumb;
  };
}

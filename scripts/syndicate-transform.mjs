// Pure dev.to (Forem) payload transform for scripts/syndicate.mjs.
//
// Lives in its own module because syndicate.mjs does its work at import time
// (loads .env, fetches listings), so vitest cannot import it. No I/O here: the
// caller passes `site.hasFile(publicPath)` so tests can fake the public/ tree.
//
// WHY: dev.to's image proxy (media2.dev.to/dynamic/image/…) does not rasterise
// SVG. Probed 2026-09-26 on the x509 post: the proxied hero URL answers
// `200 Content-Type: image/webp` but the bytes are the original SVG. An SVG body
// under a raster content type is not something browsers render, so every
// syndicated hero was at best fragile. Each blog post also ships a 1200x630
// raster `/blog/<slug>-og.png` (its og:image), which is the same artwork — so the
// hero is swapped for that sibling, and it doubles as the article cover
// (`main_image`), which the create payload never sent before.
//
// Never touches canonical_url, title, description or tags.

/**
 * Root-relative public path of the page's og:image, or null when the kind has
 * none. Blog posts: /blog/<slug>-og.png (BlogPost.astro). Guides render the site
 * default card (verified against dist/learn/guides/<slug>/index.html, all eight
 * use og-default.png).
 */
export function ogImagePath(post) {
  if (post.kind === 'blog') return `/blog/${post.slug}-og.png`;
  if (post.kind === 'guide') return '/og-default.png';
  return null;
}

/** Markdown image: ![alt](src "optional title"). Alt may not contain `]`. */
const IMAGE_RE = /!\[([^\]]*)\]\(\s*(<[^>]+>|[^)\s]+)(\s+"[^"]*")?\s*\)/g;

/**
 * Returns a copy of `post` with `body` rewritten, `main_image` (absolute, or
 * undefined) and `report`.
 * @template {{slug:string, kind:string, body:string}} T
 * @param {T} post
 * @param {{origin:string, hasFile:(publicPath:string)=>boolean}} site
 * @returns {T & { body: string, main_image: string | undefined,
 *   report: { swapped: string[], otherSvgs: string[], droppedLeadingHero: boolean } }}
 */
export function transformForDevto(post, site) {
  const origin = site.origin.replace(/\/$/, '');
  const swapped = [];
  const otherSvgs = [];

  /** Our own asset → its root-relative path; foreign URL → null. */
  const localPath = (src) => {
    if (src.startsWith(origin + '/')) return src.slice(origin.length);
    if (src.startsWith('/') && !src.startsWith('//')) return src;
    return null;
  };

  const body = String(post.body ?? '').replace(IMAGE_RE, (whole, alt, rawSrc, title = '') => {
    const src = rawSrc.replace(/^<|>$/g, '');
    const path = localPath(src);
    const bare = src.split(/[?#]/)[0];
    if (path && /-hero\.svg$/i.test(bare)) {
      const pngPath = path.split(/[?#]/)[0].replace(/-hero\.svg$/i, '-og.png');
      if (site.hasFile(pngPath)) {
        swapped.push(src);
        const pngSrc = src.startsWith(origin) ? origin + pngPath : pngPath;
        return `![${alt}](${pngSrc}${title})`;
      }
    }
    if (/\.svg$/i.test(bare)) otherSvgs.push(src);
    return whole;
  });

  const og = ogImagePath(post);
  const main_image = og && site.hasFile(og) ? origin + og : undefined;

  // The hero IS the cover artwork: once main_image carries it, a leading hero in
  // the body would show the same picture twice at the top of the article.
  let out = stripHtmlComments(body);
  let droppedLeadingHero = false;
  if (main_image) {
    const lead = out.match(/^\s*!\[[^\]]*\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)\s*/);
    if (lead && lead[1] === main_image) {
      out = out.slice(lead[0].length);
      droppedLeadingHero = true;
    }
  }

  return { ...post, body: out, main_image, report: { swapped, otherSvgs, droppedLeadingHero } };
}

/**
 * Drop HTML comments outside fenced code. Posts open with an internal
 * `<!-- keywords: … | source: ahrefs … -->` note that is invisible on the site but
 * shows in dev.to's editor and page source. Comments inside ``` / ~~~ fences are
 * content (e.g. an HTML example) and are kept.
 */
function stripHtmlComments(md) {
  const parts = md.split(/(^(?:```|~~~)[^\n]*\n[\s\S]*?^(?:```|~~~)[ \t]*$)/m);
  return parts
    .map((p, i) => (i % 2 === 1 ? p : p.replace(/<!--[\s\S]*?-->/g, '')))
    .join('')
    .replace(/^\s+/, '');
}

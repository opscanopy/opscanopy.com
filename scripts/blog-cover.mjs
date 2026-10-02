// Blog cover rendering — pure (no file writes), so scripts/gen-blog-heroes.mjs
// can write the files and src/lib/blog-cover.test.ts can re-render every cover
// in memory and compare.
//
// Template (1200 x 630, the Field Manual instrument plate):
//   - #1b1915 plate, 2px top rule in the post category's dark hue
//     (categoryHue[category].dark; leaf when the post has no tool category).
//   - Caption row, the figure cap at card scale: three dots + mono
//     `IR-NN · <category>` for incidents (traffic dots, amber number) or
//     `note · <category>` otherwise (neutral dots). Kind, number and category
//     come from src/lib/blog-kind.ts, the same module the post-header and card
//     caps read, so all three always agree. CAPTION.size is 36px so the row is
//     >= 11px when the /blog/ grid shows the cover 370px wide (36 x 370/1200 =
//     11.1); the 22px row of the first pass rendered at 6.8px there.
//   - The post's line icon (scripts/blog-hero-icons.mjs) top-right in leaf
//     #8fc97a, its dimmed strokes and its backdrop ring in the category hue.
//   - The FULL frontmatter title, verbatim (the cover and the H1 are the same
//     words), IBM Plex Sans 600, at most two lines, wrapped by measured advance
//     width. A layout is accepted only when every title glyph's INK box (the
//     outline's own extrema, not the font ascender) is >= ICON_CLEARANCE px
//     from the ring's outer edge; the size steps down until one is, and the
//     run fails if none is.
//   - `opscanopy.com` in Plex Mono at the foot.
//   - A <metadata data-generator data-slug data-title data-cap> stamp, so a
//     test can prove the outlined (unsearchable) text matches the frontmatter.
// Every glyph is outlined to <path> (scripts/og-text.mjs): no <text>, no
// font-family, identical in librsvg and browsers. Output is deterministic.
//
// THUMBNAIL (public/blog/<slug>-thumb.svg, renderThumb): the same plate, top
// rule, caption row and footer, with the icon centred and larger — and NO
// title. The /blog/ and /blog/tag/<tag>/ cards show the thumbnail, so the
// card's <h2> is the only place the title is drawn (the full cover put the
// same words on screen twice, one above the other). The cover itself stays the
// post's hero and og:image. Stamped like the cover, minus data-title, plus
// data-variant="thumb"; src/lib/blog-cover.test.ts re-renders both.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import yaml from 'js-yaml';
import { getTool, categoryHue } from '../src/data/tools.ts';
import { blogKind, blogCategory, incidentNumbers, kindToken } from '../src/lib/blog-kind.ts';
import { heroIcons } from './blog-hero-icons.mjs';
import {
  fonts,
  esc,
  measure,
  textPath,
  glyphBoxes,
  circleClearance,
  num,
  INK,
  X,
  RIGHT,
  plate,
  captionRow,
  captionGeometry,
  svgDoc,
  beginDoc,
} from './og-text.mjs';

/** Bump when the template changes; every stamp must carry the current value. */
export const COVER_GENERATOR = 'gen-blog-heroes@2';
/** The thumbnail template's own version (bumped independently of the cover's). */
export const THUMB_GENERATOR = 'gen-blog-thumbs@1';

/** Icon ring: centre and radius as drawn; `edge` adds half the 2px stroke. */
export const ICON = { cx: 1015, cy: 250, r: 105, stroke: 2, scale: 0.5 };
/** Thumbnail icon: centred between the caption hairline (128) and the footer. */
export const THUMB_ICON = { cx: 600, cy: 345, r: 150, stroke: 2, scale: 0.72 };
export const RING_EDGE = ICON.r + ICON.stroke / 2;
/** Minimum gap between any title glyph's ink and the ring's outer edge. */
export const ICON_CLEARANCE = 12;
/** Text must stay inside this box (the 80px side rails; 56px top and bottom). */
export const SAFE = { left: X, right: RIGHT, top: 56, bottom: 630 - 56 };
/** Caption row at cover scale (see the header comment for the 36px reasoning). */
export const CAPTION = { size: 36, baseline: 100, rule: 128 };

const TITLE_SIZES = [72, 64, 56, 50, 44, 40];
const TITLE_LAST_BASELINE = 492;
const FOOTER = { text: 'opscanopy.com', baseline: 566, size: 22 };

// ── Read the English posts ────────────────────────────────────────────────────
export function readPosts(root) {
  const postsDir = join(root, 'src/content/blog/en');
  return readdirSync(postsDir)
    .filter((f) => f.endsWith('.md'))
    .sort()
    .map((file) => {
      const src = readFileSync(join(postsDir, file), 'utf8');
      const m = src.match(/^---\r?\n([\s\S]*?)\r?\n---/);
      if (!m) throw new Error(`blog-cover: ${file} has no frontmatter`);
      const data = yaml.load(m[1]);
      return {
        slug: file.replace(/\.md$/, ''),
        title: String(data.title),
        pubDate: data.pubDate instanceof Date ? data.pubDate : new Date(String(data.pubDate)),
        kind: data.kind,
        category: blogCategory(data.relatedTool?.href, data.tags, (s) => getTool(s)?.category),
      };
    });
}

/** Every post needs an icon and every icon a post — a mismatch throws. */
export function assertIcons(posts) {
  const slugs = new Set(posts.map((p) => p.slug));
  for (const p of posts) if (!heroIcons[p.slug]) throw new Error(`blog-cover: no icon for "${p.slug}" in scripts/blog-hero-icons.mjs`);
  for (const s of Object.keys(heroIcons)) if (!slugs.has(s)) throw new Error(`blog-cover: icon "${s}" has no English post`);
}

/** The caption's text, exactly as the runs draw it (also the stamp's data-cap). */
export function captionText(post, numbers) {
  const kind = blogKind(post.slug, post.kind);
  return `${kindToken(post.slug, kind, numbers)} · ${post.category.toLowerCase()}`;
}

// ── Icon recolouring ──────────────────────────────────────────────────────────
// The extracted icons are white line art; knock-out ink (drawn on a white fill)
// was the old gradient colour. On the plate: white → leaf, knock-out → plate,
// and a stroke the old art dimmed (stroke-opacity < 0.9: the "failing" or
// secondary part of the motif) takes the category hue.
function recolour(body, hue) {
  return body.replace(/<([a-z]+)\b([^>]*?)(\/?)>/g, (_, tag, attrs, close) => {
    let a = attrs.replace(/\s(stroke|fill)="(#[0-9a-fA-F]{3,8})"/g, (__, prop, colour) => {
      const white = /^#f{3}(f{3})?$/i.test(colour);
      return ` ${prop}="${white ? INK.leaf : INK.plate}"`;
    });
    const so = a.match(/\sstroke-opacity="([\d.]+)"/);
    if (so && Number(so[1]) < 0.9) {
      if (/\sstroke="#/.test(a)) a = a.replace(new RegExp(`\\sstroke="${INK.leaf}"`), ` stroke="${hue}"`);
      else a += ` stroke="${hue}"`;
    }
    return `<${tag}${a}${close}>`;
  });
}

function iconSvg(icon, hue, at = ICON) {
  const { mono, monoBold } = fonts();
  const texts = icon.texts
    .map((t) =>
      textPath(t.weight === 600 ? monoBold : mono, t.text, t.x, t.y, t.size, {
        anchor: t.anchor,
        fill: INK.leaf,
        opacity: t.opacity,
        extra: ' stroke="none"',
      }),
    )
    .join('\n');
  const ring = `<circle cx="${at.cx}" cy="${at.cy}" r="${num(at.r)}" fill="#ffffff" fill-opacity="0.03" stroke="${hue}" stroke-opacity="0.55" stroke-width="${at.stroke}"/>`;
  return `${ring}
<g transform="translate(${at.cx},${at.cy}) scale(${at.scale})" stroke="${INK.leaf}" stroke-opacity="0.95" stroke-width="${icon.strokeWidth}" fill="none" stroke-linecap="${icon.linecap}" stroke-linejoin="${icon.linejoin}">
${recolour(icon.body, hue)}${texts ? `\n${texts}` : ''}
</g>`;
}

// ── Layout checks ─────────────────────────────────────────────────────────────
/** Smallest ring clearance over a set of ink boxes. */
export function minRingClearance(boxes) {
  return Math.min(...boxes.map((b) => circleClearance(b, ICON.cx, ICON.cy, RING_EDGE)));
}

/** Throws when any box comes within ICON_CLEARANCE of the ring, or leaves SAFE. */
export function assertLayout(what, boxes, { ring = true } = {}) {
  for (const b of boxes) {
    if (b.x1 < SAFE.left - 0.01 || b.x2 > SAFE.right + 0.01 || b.y1 < SAFE.top - 0.01 || b.y2 > SAFE.bottom + 0.01) {
      throw new Error(`blog-cover: ${what}: glyph ${JSON.stringify(b.ch)} [${num(b.x1)},${num(b.y1)} – ${num(b.x2)},${num(b.y2)}] leaves the safe area`);
    }
    const c = circleClearance(b, ICON.cx, ICON.cy, RING_EDGE);
    if (ring && c < ICON_CLEARANCE) {
      throw new Error(`blog-cover: ${what}: glyph ${JSON.stringify(b.ch)} is ${num(c)}px from the icon ring (needs >= ${ICON_CLEARANCE})`);
    }
  }
}

// ── Title ─────────────────────────────────────────────────────────────────────
function titleLayout(lines, size) {
  const { sans } = fonts();
  const lh = Math.round(size * 1.14);
  const first = TITLE_LAST_BASELINE - (lines.length - 1) * lh;
  const placed = lines.map((text, i) => ({ text, y: first + i * lh }));
  const boxes = placed.flatMap((l) => glyphBoxes(sans, l.text, X, l.y, size));
  return { placed, boxes };
}

/**
 * Largest size, then fewest lines, then the most balanced two-line break,
 * whose every glyph clears the ring and fits the rails. A two-line break never
 * starts line 2 with a dash. Throws when nothing fits at the smallest size.
 */
export function fitTitle(title) {
  const { sans } = fonts();
  const words = title.split(/\s+/).filter(Boolean);
  const maxW = RIGHT - X;
  for (const size of TITLE_SIZES) {
    const candidates = [[words.join(' ')]];
    for (let k = 1; k < words.length; k++) {
      if (/^[—–-]/.test(words[k])) continue;
      candidates.push([words.slice(0, k).join(' '), words.slice(k).join(' ')]);
    }
    let best = null;
    for (const lines of candidates) {
      const width = Math.max(...lines.map((l) => measure(sans, l, size)));
      if (width > maxW) continue;
      const { placed, boxes } = titleLayout(lines, size);
      if (minRingClearance(boxes) < ICON_CLEARANCE) continue;
      // Fewer lines first; among two-line breaks the narrower longest line
      // (no widows); ties keep the earlier break, so the choice is stable.
      if (!best || lines.length < best.lines.length || (lines.length === best.lines.length && width < best.width)) {
        best = { size, lines, width, placed, boxes };
      }
    }
    if (best) return best;
  }
  throw new Error(`blog-cover: ${JSON.stringify(title)} does not fit two lines clear of the icon ring at ${TITLE_SIZES.at(-1)}px`);
}

// ── Render ────────────────────────────────────────────────────────────────────
/**
 * One cover. Pure: same post + numbers → same bytes.
 * @returns {{ svg: string, cap: string, size: number, lines: string[], clearance: number }}
 */
export function renderCover(post, numbers) {
  const { mono } = fonts();
  beginDoc();
  const kind = blogKind(post.slug, post.kind);
  const token = kindToken(post.slug, kind, numbers);
  const cap = captionText(post, numbers);
  const hue = categoryHue[post.category]?.dark ?? INK.leaf;
  const icon = heroIcons[post.slug];
  if (!icon) throw new Error(`blog-cover: no icon for "${post.slug}"`);

  const title = fitTitle(post.title);
  assertLayout(`${post.slug} title`, title.boxes);

  const g = captionGeometry(CAPTION);
  // The caption sits above the ring; it must stay on the rails and in the
  // safe area. (Its ring clearance is not a rule — it ends well above the ring
  // top by construction — but it is never allowed to cross the hairline.)
  const capBoxes = glyphBoxes(mono, cap, g.labelX, g.baseline, g.size);
  assertLayout(`${post.slug} caption`, capBoxes, { ring: false });
  for (const b of capBoxes) {
    if (b.y2 >= g.rule) throw new Error(`blog-cover: ${post.slug} caption glyph ${JSON.stringify(b.ch)} crosses the hairline`);
  }
  assertLayout(`${post.slug} footer`, glyphBoxes(mono, FOOTER.text, X, FOOTER.baseline, FOOTER.size));

  const caption = captionRow(
    [
      { text: token, fill: kind === 'incident' ? INK.amber : INK.mute },
      { text: ' · ', fill: INK.mute },
      { text: post.category.toLowerCase(), fill: hue },
    ],
    kind === 'incident' ? 'traffic' : 'mute',
    CAPTION,
  );
  const titleSvg = title.placed.map((l) => textPath(fonts().sans, l.text, X, l.y, title.size, { fill: INK.fg })).join('\n');
  const stamp = `<metadata data-generator="${COVER_GENERATOR}" data-slug="${esc(post.slug)}" data-title="${esc(post.title)}" data-cap="${esc(cap)}"/>`;
  const svg = svgDoc(
    icon.ariaLabel,
    [
      plate(hue),
      `<g data-role="caption">\n${caption}\n</g>`,
      iconSvg(icon, hue),
      `<g data-role="title">\n${titleSvg}\n</g>`,
      textPath(mono, FOOTER.text, X, FOOTER.baseline, FOOTER.size, { fill: INK.mute }),
    ].join('\n'),
    stamp,
  );
  return { svg, cap, size: title.size, lines: title.lines, clearance: minRingClearance(title.boxes) };
}

/**
 * One card thumbnail: the cover without its title (see the header comment).
 * Pure: same post + numbers → same bytes.
 * @returns {{ svg: string, cap: string }}
 */
export function renderThumb(post, numbers) {
  const { mono } = fonts();
  beginDoc();
  const kind = blogKind(post.slug, post.kind);
  const token = kindToken(post.slug, kind, numbers);
  const cap = captionText(post, numbers);
  const hue = categoryHue[post.category]?.dark ?? INK.leaf;
  const icon = heroIcons[post.slug];
  if (!icon) throw new Error(`blog-cover: no icon for "${post.slug}"`);

  const g = captionGeometry(CAPTION);
  const capBoxes = glyphBoxes(mono, cap, g.labelX, g.baseline, g.size);
  assertLayout(`${post.slug} thumb caption`, capBoxes, { ring: false });
  const footBoxes = glyphBoxes(mono, FOOTER.text, X, FOOTER.baseline, FOOTER.size);
  assertLayout(`${post.slug} thumb footer`, footBoxes, { ring: false });
  // The ring sits wholly between the caption hairline and the footer's ink.
  const ringTop = THUMB_ICON.cy - THUMB_ICON.r - THUMB_ICON.stroke / 2;
  const ringBottom = THUMB_ICON.cy + THUMB_ICON.r + THUMB_ICON.stroke / 2;
  const footTop = Math.min(...footBoxes.map((b) => b.y1));
  if (ringTop <= g.rule || ringBottom >= footTop) {
    throw new Error(`blog-cover: ${post.slug} thumb icon ring [${num(ringTop)}, ${num(ringBottom)}] overlaps the caption rule or the footer`);
  }

  const caption = captionRow(
    [
      { text: token, fill: kind === 'incident' ? INK.amber : INK.mute },
      { text: ' · ', fill: INK.mute },
      { text: post.category.toLowerCase(), fill: hue },
    ],
    kind === 'incident' ? 'traffic' : 'mute',
    CAPTION,
  );
  const stamp = `<metadata data-generator="${THUMB_GENERATOR}" data-variant="thumb" data-slug="${esc(post.slug)}" data-cap="${esc(cap)}"/>`;
  const svg = svgDoc(
    icon.ariaLabel,
    [
      plate(hue),
      `<g data-role="caption">\n${caption}\n</g>`,
      iconSvg(icon, hue, THUMB_ICON),
      textPath(mono, FOOTER.text, X, FOOTER.baseline, FOOTER.size, { fill: INK.mute }),
    ].join('\n'),
    stamp,
  );
  return { svg, cap };
}

/** All covers for `root`, in slug order. */
export function renderAll(root) {
  const posts = readPosts(root);
  assertIcons(posts);
  const numbers = incidentNumbers(posts);
  return posts.map((post) => ({ post, ...renderCover(post, numbers) }));
}

/** All card thumbnails for `root`, in slug order. */
export function renderAllThumbs(root) {
  const posts = readPosts(root);
  assertIcons(posts);
  const numbers = incidentNumbers(posts);
  return posts.map((post) => ({ post, ...renderThumb(post, numbers) }));
}

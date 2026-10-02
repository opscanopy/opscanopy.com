// Generate the 31 blog cover SVGs (public/blog/<slug>-hero.svg) and their card
// thumbnails (public/blog/<slug>-thumb.svg: the same plate, caption and icon
// with no title, so a /blog card shows its title once, in the <h2>) from the
// English post frontmatter. Run with `npm run gen:heroes`, which then runs
// `npm run gen:og` to rasterise every *-hero.svg to its *-og.png (thumbnails
// are never rasterised: they are only ever an <img> on the site).
//
// The templates, the layout checks and the stamps live in scripts/blog-cover.mjs
// (pure, so src/lib/blog-cover.test.ts re-renders every cover and thumbnail and
// fails when a file on disk is stale). This script only writes the files.
//
// The <svg aria-label> is the previous hand-authored cover's, kept verbatim.
// File paths are unchanged, so og:image, JSON-LD and every <img src> still
// resolve to the same URLs.
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderAll, renderAllThumbs } from './blog-cover.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'public/blog');

const report = [];
const covers = renderAll(root);
for (const { post, svg, cap, size, lines, clearance } of covers) {
  writeFileSync(join(outDir, `${post.slug}-hero.svg`), svg);
  report.push(
    `${cap.split(' · ')[0].padEnd(5)} ${post.category.toLowerCase().padEnd(13)} ${String(size).padStart(2)}px×${lines.length} ring+${clearance.toFixed(1).padStart(5)} ${String(svg.length).padStart(6)}B  ${post.slug}`,
  );
}

const thumbs = renderAllThumbs(root);
for (const { post, svg } of thumbs) {
  writeFileSync(join(outDir, `${post.slug}-thumb.svg`), svg);
}

console.log(report.join('\n'));
console.log(
  `gen-blog-heroes: wrote ${covers.length} cover SVG(s) and ${thumbs.length} card thumbnail(s) to public/blog/`,
);

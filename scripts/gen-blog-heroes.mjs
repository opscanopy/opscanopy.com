// Generate the 31 blog cover SVGs (public/blog/<slug>-hero.svg) from the
// English post frontmatter. Run with `npm run gen:heroes`, which then runs
// `npm run gen:og` to rasterise every *-hero.svg to its *-og.png.
//
// The template, the layout checks and the stamp live in scripts/blog-cover.mjs
// (pure, so src/lib/blog-cover.test.ts re-renders every cover and fails when a
// file on disk is stale). This script only writes the files.
//
// The <svg aria-label> is the previous hand-authored cover's, kept verbatim.
// File paths are unchanged, so og:image, JSON-LD and every <img src> still
// resolve to the same URLs.
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderAll } from './blog-cover.mjs';

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

console.log(report.join('\n'));
console.log(`gen-blog-heroes: wrote ${covers.length} cover SVG(s) to public/blog/`);

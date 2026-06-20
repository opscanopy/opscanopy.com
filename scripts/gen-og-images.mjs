// Rasterize each blog hero banner SVG to a 1200x630 PNG for per-post Open Graph
// / Twitter link-preview cards. Run with `npm run gen:og` after a banner changes.
// The PNGs are committed static assets in public/blog/ (copied to dist/ on build).
import sharp from 'sharp';
import { readdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const blogDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'blog');
const heroes = (await readdir(blogDir)).filter((f) => f.endsWith('-hero.svg'));

let count = 0;
for (const file of heroes) {
  const out = file.replace(/-hero\.svg$/, '-og.png');
  // density bumps the SVG rasterization resolution so text/edges stay crisp at 1200px.
  await sharp(join(blogDir, file), { density: 144 })
    .resize(1200, 630, { fit: 'cover' })
    .png()
    .toFile(join(blogDir, out));
  count++;
}

console.log(`Generated ${count} OG image(s) (1200x630 PNG) in public/blog/`);

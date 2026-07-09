// Rasterize each hero banner SVG to a 1200x630 PNG for Open Graph / Twitter
// link-preview cards. Run with `npm run gen:og` after a banner changes.
// The PNGs are committed static assets alongside their source SVG (copied to
// dist/ on build). Scans the blog dir plus the mission-90 program hero.
import sharp from 'sharp';
import { readdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const publicDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
const srcDirs = [join(publicDir, 'blog'), join(publicDir, 'mission-90')];

let count = 0;
for (const dir of srcDirs) {
  const heroes = (await readdir(dir)).filter((f) => f.endsWith('-hero.svg'));
  for (const file of heroes) {
    const out = file.replace(/-hero\.svg$/, '-og.png');
    // density bumps the SVG rasterization resolution so text/edges stay crisp at 1200px.
    await sharp(join(dir, file), { density: 144 })
      .resize(1200, 630, { fit: 'cover' })
      .png()
      .toFile(join(dir, out));
    count++;
  }
}

console.log(`Generated ${count} OG image(s) (1200x630 PNG) in public/blog/ + public/mission-90/`);

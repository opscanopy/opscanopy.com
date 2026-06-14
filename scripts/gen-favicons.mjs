// Rasterises public/favicon.svg into the icon set (ICO + PNGs).
// Run after editing favicon.svg:  node scripts/gen-favicons.mjs
import sharp from 'sharp';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const pub = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
const svg = await readFile(join(pub, 'favicon.svg'));

const png = (size) =>
  sharp(svg, { density: 384 }).resize(size, size, { fit: 'contain' }).png().toBuffer();

// Standalone PNGs (favicon, Apple touch + PWA manifest icons).
for (const [name, size] of [
  ['favicon-96x96.png', 96],
  ['apple-touch-icon.png', 180],
  ['icon-192.png', 192],
  ['icon-512.png', 512],
]) {
  await writeFile(join(pub, name), await png(size));
  console.log(`wrote ${name} (${size}px)`);
}

// favicon.ico — embed 16/32/48 PNG frames (modern ICO supports PNG payloads).
const sizes = [16, 32, 48];
const frames = await Promise.all(sizes.map(png));
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0); // reserved
header.writeUInt16LE(1, 2); // type: icon
header.writeUInt16LE(frames.length, 4);
const entries = [];
let offset = 6 + frames.length * 16;
frames.forEach((buf, i) => {
  const e = Buffer.alloc(16);
  e.writeUInt8(sizes[i] >= 256 ? 0 : sizes[i], 0); // width
  e.writeUInt8(sizes[i] >= 256 ? 0 : sizes[i], 1); // height
  e.writeUInt8(0, 2); // palette
  e.writeUInt8(0, 3); // reserved
  e.writeUInt16LE(1, 4); // colour planes
  e.writeUInt16LE(32, 6); // bits per pixel
  e.writeUInt32LE(buf.length, 8);
  e.writeUInt32LE(offset, 12);
  offset += buf.length;
  entries.push(e);
});
await writeFile(join(pub, 'favicon.ico'), Buffer.concat([header, ...entries, ...frames]));
console.log(`wrote favicon.ico (${sizes.join('/')}px)`);

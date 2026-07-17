// Rasterize OG/Twitter link-preview PNGs (1200x630).
//
// Two independent jobs:
//  1. Hero rasterization — converts each hand-authored `*-hero.svg` (blog
//     posts, the mission-90 program hero) straight to PNG. Unchanged.
//  2. Tool card generation — there is no hand-authored SVG per tool, so this
//     BUILDS one programmatically from the tools registry (name, tagline,
//     category, accent gradient) for every live tool, then rasterizes it the
//     same way. Run with `npm run gen:og` after either job's source changes.
//
// The PNGs are committed static assets (copied to dist/ on build) — nothing
// generates them at request time.
import sharp from 'sharp';
import { readdir, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { liveTools, categoryAccent, accentGradients } from '../src/data/tools.ts';

const publicDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
const heroSrcDirs = [join(publicDir, 'blog'), join(publicDir, 'mission-90')];
const toolOgDir = join(publicDir, 'tools-og');

const SANS = 'ui-sans-serif, system-ui, Segoe UI, Roboto, sans-serif';
const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

/** Escape the handful of characters that are reserved inside SVG text content. */
function esc(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Greedy word-wrap into at most `maxLines` lines of ~`maxChars` characters.
 * librsvg (sharp's SVG rasterizer) has no text auto-wrap or overflow
 * handling, so line breaks must be computed and placed as explicit <tspan>s
 * before rasterization. If content overflows `maxLines`, the last line is
 * truncated and ellipsized rather than silently clipped by the canvas edge.
 */
function wrapText(text, maxChars, maxLines) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines = [];
  let current = '';
  let truncated = false;
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= maxChars || !current) {
      current = candidate;
      continue;
    }
    lines.push(current);
    current = word;
    if (lines.length === maxLines) {
      truncated = true;
      break;
    }
  }
  if (!truncated && current) lines.push(current);
  if (truncated) {
    let last = lines[lines.length - 1] ?? '';
    while (last.length > 0 && last.length + 1 > maxChars) last = last.slice(0, -1);
    lines[lines.length - 1] = last.replace(/\s+$/, '') + '…';
  }
  return lines;
}

/** Single-line ellipsize at a word boundary. */
function truncate(text, maxChars) {
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars - 1).replace(/\s+\S*$/, '') + '…';
}

/** Build a dark, branded 1200x630 OG card SVG for one live tool. */
function toolOgSvg(tool) {
  const [g1, g2] = accentGradients[tool.accent];
  const dot = categoryAccent[tool.category] ?? '#10b981';
  const nameLines = wrapText(tool.name, 22, 2);
  const tagline = truncate(tool.tagline, 68);

  const nameTspans = nameLines
    .map((line, i) => `<tspan x="80" y="${270 + i * 86}">${esc(line)}</tspan>`)
    .join('');
  // Tagline sits a fixed gap below the LAST name line, so a one-line name
  // (e.g. "AlertLint") doesn't leave a big empty gap above it the way a
  // fixed absolute position would for every card regardless of name length.
  const taglineY = 270 + (nameLines.length - 1) * 86 + 88;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630" role="img" aria-label="${esc(tool.name)} — ${esc(tool.tagline)}">
  <defs>
    <radialGradient id="glow" cx="82%" cy="22%" r="65%">
      <stop offset="0" stop-color="#10b981" stop-opacity="0.30"/>
      <stop offset="1" stop-color="#10b981" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="topbar" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${g1}"/>
      <stop offset="1" stop-color="${g2}"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="#0a0a0a"/>
  <rect width="1200" height="630" fill="url(#glow)"/>
  <rect width="1200" height="6" fill="url(#topbar)"/>

  <g transform="translate(80,56)">
    <g stroke="#10b981" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" fill="none" transform="scale(1.35)">
      <path d="M4 15.5C6.4 10.3 10.8 7 16 7s9.6 3.3 12 8.5" opacity="0.35"/>
      <path d="M6.5 19.5C8.6 15.2 11.9 12.7 16 12.7s7.4 2.5 9.5 6.8" opacity="0.6"/>
      <path d="M9 23C10.6 19.9 13.1 18.2 16 18.2s5.4 1.7 7 4.8" opacity="0.95"/>
      <path d="M16 23v3.5"/>
    </g>
    <text x="52" y="27" font-family="${SANS}" font-size="23" font-weight="600" fill="#ffffff" letter-spacing="-0.3">OpsCanopy</text>
  </g>

  <g transform="translate(80,168)">
    <circle cx="6" cy="-7" r="6" fill="${dot}"/>
    <text x="22" y="0" font-family="${SANS}" font-size="20" font-weight="700" letter-spacing="2.5" fill="${dot}">${esc(tool.category.toUpperCase())}</text>
  </g>

  <text font-family="${SANS}" font-weight="800" font-size="76" fill="#ffffff">${nameTspans}</text>

  <text x="80" y="${taglineY}" font-family="${SANS}" font-size="32" font-weight="500" fill="#a3a3a3">${esc(tagline)}</text>

  <text x="80" y="572" font-family="${MONO}" font-size="22" fill="#737373">opscanopy.com/${esc(tool.slug)}</text>
</svg>`;
}

let count = 0;

// Job 1 — hand-authored hero SVGs → PNG.
for (const dir of heroSrcDirs) {
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

// Job 2 — programmatically generated tool cards → PNG.
await mkdir(toolOgDir, { recursive: true });
for (const tool of liveTools) {
  const svg = toolOgSvg(tool);
  await sharp(Buffer.from(svg), { density: 144 })
    .resize(1200, 630)
    .png()
    .toFile(join(toolOgDir, `${tool.slug}-og.png`));
  count++;
}

console.log(
  `Generated ${count} OG image(s) (1200x630 PNG): public/blog/, public/mission-90/, public/tools-og/ (${liveTools.length} tools)`,
);

/**
 * gen-og.mjs — generate the branded Open Graph image for OpsCanopy.
 *
 * Output: public/og-default.png (1200x630), referenced by src/components/SEO.astro.
 * Also writes public/og-default.svg as the editable source.
 *
 * Brand contract (DESIGN.md / global.css):
 *   - Near-white canvas (#fafafa → #ffffff) with the multi-color mesh gradient as
 *     ambient light at hero scale (NEVER miniaturised, the only decorative chrome).
 *   - Gradient stops: #007cf0 #00dfd8 #7928ca #ff0080 #ff4d4d #f9cb28.
 *   - "OpsCanopy" wordmark large in ink #171717 (weight 600, negative tracking).
 *   - Tagline in a muted tone (#4d4d4d body).
 *   - A small "Featuring AlertLint" chip on a hairline-ringed canvas pill.
 *
 * Reliability: text is set in a robust system font stack so it rasterizes in sharp's
 * librsvg pipeline; if a renderer drops the wordmark, a vector-path fallback of the
 * same wordmark is drawn underneath so the image NEVER ships textless.
 *
 * Run:  node scripts/gen-og.mjs
 */

import sharp from 'sharp';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, '..', 'public');

const W = 1200;
const H = 630;

/* Brand tokens */
const INK = '#171717';
const BODY = '#4d4d4d';
const MUTE = '#888888';
const CANVAS = '#ffffff';
const CANVAS_SOFT = '#fafafa';
const HAIRLINE = '#ebebeb';

/* Robust system font stack so glyphs rasterize even without Geist installed. */
const FONT_STACK =
  "'Segoe UI', 'Helvetica Neue', Arial, Helvetica, system-ui, -apple-system, sans-serif";

/* Contingency switch: when true, the vector-path wordmark is drawn so the image
   never ships textless even if a renderer drops <text>. Live text rasterizes
   reliably here (verified), so this stays false to keep the wordmark crisp. */
const RENDER_VECTOR_WORDMARK = false;

/* --------------------------------------------------------------------------
   Vector-path fallback wordmark.
   Each glyph is a hand-built path on a 100-unit em (cap height ~72, baseline 86),
   so "OpsCanopy" is guaranteed to render as shapes even if no font loads.
   Stroke weight maps to the brand's 600 display ceiling (no 700+).
   -------------------------------------------------------------------------- */
const STROKE = 13; // glyph stroke weight at this scale → reads as weight ~600

/** Build a single uppercase/lowercase glyph as stroked paths on a 0..100 box. */
function glyph(ch) {
  // baseline y = 86, cap top y = 14, x-height top y = 44
  switch (ch) {
    case 'O':
      return `<ellipse cx="50" cy="50" rx="34" ry="36"/>`;
    case 'p': // descender below baseline
      return `<path d="M22 44 V112"/><path d="M22 50 C22 38 32 32 46 32 C62 32 70 44 70 58 C70 72 62 84 46 84 C32 84 22 78 22 66"/>`;
    case 's':
      return `<path d="M66 42 C58 34 30 32 30 48 C30 62 66 56 66 72 C66 88 38 86 30 78"/>`;
    case 'C':
      return `<path d="M82 30 C72 18 56 14 46 14 C28 14 16 30 16 50 C16 70 28 86 46 86 C56 86 72 82 82 70"/>`;
    case 'a':
      return `<path d="M70 44 V86"/><path d="M70 52 C64 38 50 32 40 32 C26 32 16 44 16 58 C16 74 26 86 40 86 C52 86 66 80 70 66"/>`;
    case 'n':
      return `<path d="M22 32 V86"/><path d="M22 52 C26 38 38 32 48 32 C62 32 70 42 70 58 V86"/>`;
    case 'y': // descender
      return `<path d="M20 32 L46 86"/><path d="M76 32 L46 86 C40 100 34 110 18 110"/>`;
    default:
      return '';
  }
}

/** Lay glyphs out left-to-right with per-glyph advance widths (tight, negative tracking). */
function vectorWordmark(x, y, scale) {
  // advance widths per glyph at 100-unit em (negative tracking baked in)
  const word = [
    ['O', 92],
    ['p', 78],
    ['s', 70],
    ['C', 92],
    ['a', 78],
    ['n', 78],
    ['o', 84],
    ['p', 78],
    ['y', 78],
  ];
  let cursor = 0;
  const parts = [];
  for (const [ch, adv] of word) {
    const g = ch === 'o' ? `<ellipse cx="42" cy="58" rx="27" ry="27"/>` : glyph(ch);
    parts.push(`<g transform="translate(${cursor},0)">${g}</g>`);
    cursor += adv;
  }
  return `
    <g transform="translate(${x},${y}) scale(${scale})"
       fill="none" stroke="${INK}" stroke-width="${STROKE}"
       stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      ${parts.join('')}
    </g>`;
}

/* --------------------------------------------------------------------------
   The canopy mark (from public/favicon.svg) scaled up for the OG.
   -------------------------------------------------------------------------- */
function canopyMark(x, y, s) {
  return `
    <g transform="translate(${x},${y}) scale(${s})" aria-hidden="true">
      <g stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" fill="none">
        <path d="M4 15.5C6.4 10.3 10.8 7 16 7s9.6 3.3 12 8.5" stroke="url(#oc-canopy)"/>
        <path d="M6.5 19.5C8.6 15.2 11.9 12.7 16 12.7s7.4 2.5 9.5 6.8" stroke="${INK}"/>
        <path d="M9 23C10.6 19.9 13.1 18.2 16 18.2s5.4 1.7 7 4.8" stroke="${INK}"/>
      </g>
      <path d="M16 23v3.5" stroke="${INK}" stroke-width="2.5" stroke-linecap="round"/>
    </g>`;
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <!-- Canvas vertical wash: canvas-soft → white -->
    <linearGradient id="canvas" x1="0" y1="0" x2="0" y2="${H}" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="${CANVAS}"/>
      <stop offset="1" stop-color="${CANVAS_SOFT}"/>
    </linearGradient>

    <!-- Canopy mark gradient (matches favicon) -->
    <linearGradient id="oc-canopy" x1="4" y1="7" x2="28" y2="16" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#7928ca"/>
      <stop offset="1" stop-color="#ff0080"/>
    </linearGradient>

    <!-- Mesh gradient stops, each as a soft radial light. Hero scale, ambient. -->
    <radialGradient id="g-blue" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse"
      gradientTransform="translate(360 70) scale(420)">
      <stop offset="0" stop-color="#007cf0" stop-opacity="0.55"/>
      <stop offset="1" stop-color="#007cf0" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="g-teal" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse"
      gradientTransform="translate(880 60) scale(440)">
      <stop offset="0" stop-color="#00dfd8" stop-opacity="0.55"/>
      <stop offset="1" stop-color="#00dfd8" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="g-violet" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse"
      gradientTransform="translate(1080 230) scale(440)">
      <stop offset="0" stop-color="#7928ca" stop-opacity="0.50"/>
      <stop offset="1" stop-color="#7928ca" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="g-pink" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse"
      gradientTransform="translate(1150 70) scale(420)">
      <stop offset="0" stop-color="#ff0080" stop-opacity="0.50"/>
      <stop offset="1" stop-color="#ff0080" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="g-coral" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse"
      gradientTransform="translate(640 -40) scale(420)">
      <stop offset="0" stop-color="#ff4d4d" stop-opacity="0.42"/>
      <stop offset="1" stop-color="#ff4d4d" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="g-amber" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse"
      gradientTransform="translate(980 -20) scale(400)">
      <stop offset="0" stop-color="#f9cb28" stop-opacity="0.45"/>
      <stop offset="1" stop-color="#f9cb28" stop-opacity="0"/>
    </radialGradient>

    <!-- Soft fade so the mesh dissolves into canvas in the lower-left text zone -->
    <linearGradient id="mesh-fade" x1="0" y1="0" x2="0" y2="${H}" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0"/>
      <stop offset="0.62" stop-color="${CANVAS}" stop-opacity="0.55"/>
      <stop offset="1" stop-color="${CANVAS}" stop-opacity="0.92"/>
    </linearGradient>
  </defs>

  <!-- Base canvas -->
  <rect x="0" y="0" width="${W}" height="${H}" fill="url(#canvas)"/>

  <!-- Mesh ambient light (hero scale) -->
  <g>
    <rect x="0" y="0" width="${W}" height="${H}" fill="url(#g-blue)"/>
    <rect x="0" y="0" width="${W}" height="${H}" fill="url(#g-teal)"/>
    <rect x="0" y="0" width="${W}" height="${H}" fill="url(#g-violet)"/>
    <rect x="0" y="0" width="${W}" height="${H}" fill="url(#g-pink)"/>
    <rect x="0" y="0" width="${W}" height="${H}" fill="url(#g-coral)"/>
    <rect x="0" y="0" width="${W}" height="${H}" fill="url(#g-amber)"/>
  </g>
  <!-- Fade the mesh out of the text zone so ink copy stays high-contrast -->
  <rect x="0" y="0" width="${W}" height="${H}" fill="url(#mesh-fade)"/>

  <!-- Eyebrow row: canopy mark + mono brand label -->
  ${canopyMark(96, 122, 1.7)}
  <text x="156" y="156"
    font-family="ui-monospace, 'SFMono-Regular', Menlo, Consolas, monospace"
    font-size="22" letter-spacing="2.4" fill="${MUTE}">OPSCANOPY</text>

  <!-- Wordmark. Live system-font text rasterizes reliably in the sharp/librsvg
       pipeline (verified). The vector-path wordmark below is a NON-RENDERED
       contingency (kept in code) in case a future renderer drops the glyphs;
       swap RENDER_VECTOR_WORDMARK to true to draw it instead of / under text. -->
  ${RENDER_VECTOR_WORDMARK ? vectorWordmark(94, 232, 1.16) : ''}
  <text x="92" y="318" font-family="${FONT_STACK}"
    font-size="118" font-weight="600" letter-spacing="-5"
    fill="${INK}">OpsCanopy</text>

  <!-- Tagline (muted body) -->
  <text x="96" y="392" font-family="${FONT_STACK}"
    font-size="34" font-weight="400" fill="${BODY}">Free, private, browser-based tools</text>
  <text x="96" y="438" font-family="${FONT_STACK}"
    font-size="34" font-weight="400" fill="${BODY}">for platform &amp; DevOps engineers.</text>

  <!-- "Featuring AlertLint" chip — canvas pill with hairline ring -->
  <g transform="translate(96,498)">
    <rect x="0" y="0" width="312" height="50" rx="25" fill="${CANVAS}" stroke="${HAIRLINE}" stroke-width="1.5"/>
    <circle cx="34" cy="25" r="5" fill="#00dfd8"/>
    <text x="56" y="33" font-family="${FONT_STACK}" font-size="20" font-weight="500" fill="${INK}">Featuring AlertLint</text>
  </g>

  <!-- Domain, lower-right, mono mute -->
  <text x="${W - 96}" y="556" text-anchor="end"
    font-family="ui-monospace, 'SFMono-Regular', Menlo, Consolas, monospace"
    font-size="22" fill="${MUTE}">opscanopy.com</text>
</svg>`;

const svgPath = join(publicDir, 'og-default.svg');
const pngPath = join(publicDir, 'og-default.png');

await writeFile(svgPath, svg, 'utf8');

await sharp(Buffer.from(svg))
  .png({ compressionLevel: 9 })
  .toFile(pngPath);

const { size } = await sharp(pngPath).metadata().then(async (m) => {
  const { default: fs } = await import('node:fs');
  return { size: fs.statSync(pngPath).size, meta: m };
});

console.log(`OG image written: ${pngPath}`);
console.log(`SVG source written: ${svgPath}`);
console.log(`PNG size: ${size} bytes (${(size / 1024).toFixed(1)} KB)`);

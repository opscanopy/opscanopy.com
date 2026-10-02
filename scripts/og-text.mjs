// Text helpers for the build-time SVG cards (blog covers, tool OG cards, the
// Mission 90 / Verify-the-AI heroes).
//
// Every glyph is OUTLINED to a <path> with opentype.js, so the SVG never
// depends on a font being installed: librsvg (sharp's rasteriser, which only
// knows system fonts) and every browser draw the same IBM Plex shapes. Line
// breaks are measured with the font's real advance widths, never a character
// count. Output is deterministic: coordinates are rounded to 2 dp and nothing
// reads the clock, the locale or the environment.
//
// Fonts:
//   - Sans: scripts/fonts/IBMPlexSans-SemiBold.ttf (vendored, OFL 1.1, see
//     scripts/fonts/OFL.txt) — the only static Sans weight the cards use.
//   - Mono: the @fontsource/ibm-plex-mono latin WOFFs the site already ships
//     (400 and 600), parsed in place.
import opentype from 'opentype.js';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function load(path) {
  const buf = readFileSync(join(root, path));
  return opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
}

let cache;
/** @returns {{ sans: opentype.Font, mono: opentype.Font, monoBold: opentype.Font }} */
export function fonts() {
  cache ??= {
    sans: load('scripts/fonts/IBMPlexSans-SemiBold.ttf'),
    mono: load('node_modules/@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-400-normal.woff'),
    monoBold: load('node_modules/@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-600-normal.woff'),
  };
  return cache;
}

/** Escape the characters that are reserved inside SVG attribute values / text. */
export function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Round to 2 dp and print without trailing zeros (and never "-0"). */
export function num(n) {
  const r = Math.round(n * 100) / 100;
  return String(Object.is(r, -0) ? 0 : r);
}

/** Throw if the font has no glyph for a character — a .notdef box must never ship. */
function assertGlyphs(font, text) {
  for (const ch of text) {
    if (/\s/.test(ch)) continue;
    if (font.charToGlyph(ch).index === 0) {
      throw new Error(`og-text: "${font.names.fullName.en}" has no glyph for ${JSON.stringify(ch)} in ${JSON.stringify(text)}`);
    }
  }
}

/** Advance width of `text` at `size` px (kerning on, as getPath draws it). */
export function measure(font, text, size) {
  return font.getAdvanceWidth(text, size, { kerning: true });
}

/**
 * Greedy word-wrap by measured width. Returns the lines, or null when the text
 * needs more than `maxLines` (callers step the size down rather than truncate —
 * a cover title is the post's H1 verbatim and is never ellipsized).
 */
export function wrapText(font, text, size, maxWidth, maxLines) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (!current || measure(font, candidate, size) <= maxWidth) {
      current = candidate;
      continue;
    }
    lines.push(current);
    current = word;
  }
  if (current) lines.push(current);
  if (lines.length > maxLines) return null;
  if (lines.some((l) => measure(font, l, size) > maxWidth)) return null;
  if (lines.length === 2) return balance(font, words, size, maxWidth) ?? lines;
  return lines;
}

/**
 * Two-line balance: the break that minimises the longer line (so a title never
 * ends on a one-word widow). Ties keep the earlier break, so it is stable.
 */
function balance(font, words, size, maxWidth) {
  let best = null;
  let bestW = Infinity;
  for (let k = 1; k < words.length; k++) {
    // Never start the second line with a dash (an em-dash clause hangs off line 1).
    if (/^[—–-]/.test(words[k])) continue;
    const a = words.slice(0, k).join(' ');
    const b = words.slice(k).join(' ');
    const w = Math.max(measure(font, a, size), measure(font, b, size));
    if (w <= maxWidth && w < bestW) {
      best = [a, b];
      bestW = w;
    }
  }
  return best;
}

/**
 * Largest size in `sizes` (descending) at which `text` wraps into ≤ maxLines
 * within maxWidth. Throws when even the smallest size does not fit, so an
 * over-long title fails the run instead of overflowing the card.
 */
export function fitText(font, text, sizes, maxWidth, maxLines) {
  for (const size of sizes) {
    const lines = wrapText(font, text, size, maxWidth, maxLines);
    if (lines) return { size, lines };
  }
  throw new Error(`og-text: ${JSON.stringify(text)} does not fit ${maxLines} line(s) of ${maxWidth}px at ${sizes.at(-1)}px`);
}

/** Single line, ellipsized at a word boundary to fit maxWidth (taglines only). */
export function truncateToWidth(font, text, size, maxWidth) {
  if (measure(font, text, size) <= maxWidth) return text;
  const words = text.split(/\s+/);
  while (words.length > 1) {
    words.pop();
    const t = words.join(' ').replace(/[\s,;:—-]+$/, '') + '…';
    if (measure(font, t, size) <= maxWidth) return t;
  }
  return words[0];
}

// ─── Glyph sheet ───────────────────────────────────────────────────────────
// Each distinct (font, glyph) is outlined ONCE, in font units, into the
// document's <defs>; a run of text is one <g transform="translate scale">
// holding a <use href x> per glyph (x in integer font units, kerning applied).
// So a 100-character title costs one outline per distinct letter, and the same
// letter at two sizes shares its outline — a card stays well under 40 KB.
// Ids are assigned in first-use order, so a fixed draw order gives
// byte-identical output. Call beginDoc() before drawing a card and svgDoc() to
// close it.
let sheet = null;

/** Start a new card: resets the glyph sheet. */
export function beginDoc() {
  sheet = { ids: new Map(), defs: [] };
}

const norm = (d) => d.replace(/-?\d+\.\d+/g, (m) => num(Number(m)));

function glyphId(font, glyph) {
  if (!sheet) throw new Error('og-text: beginDoc() was not called');
  const key = `${font.names.fullName.en}|${glyph.index}`;
  if (sheet.ids.has(key)) return sheet.ids.get(key);
  // opentype prints fixed 2-dp numbers ("13.70"); norm() prints the shortest
  // form, so the output is smaller and stable across opentype patch releases.
  const d = norm(glyph.getPath(0, 0, font.unitsPerEm).toPathData(2));
  const id = d ? `g${sheet.defs.length}` : '';
  if (id) sheet.defs.push(`<path id="${id}" d="${d}"/>`);
  sheet.ids.set(key, id);
  return id;
}

/**
 * Outline one run of text: a <g> carrying the position, scale and fill,
 * holding one <use> per visible glyph (kerning and the font's default
 * features applied).
 * @param {opentype.Font} font
 * @param {string} text
 * @param {number} x  anchor x (left edge, centre or right edge per `anchor`)
 * @param {number} y  baseline y
 * @param {number} size px
 * @param {{ anchor?: 'start'|'middle'|'end', fill?: string, opacity?: number, extra?: string }} [opts]
 */
export function textPath(font, text, x, y, size, { anchor = 'start', fill, opacity, extra = '' } = {}) {
  assertGlyphs(font, text);
  const w = measure(font, text, size);
  const x0 = anchor === 'middle' ? x - w / 2 : anchor === 'end' ? x - w : x;
  const upm = font.unitsPerEm;
  const uses = [];
  font.forEachGlyph(text, 0, 0, upm, { kerning: true }, (glyph, gx) => {
    const id = glyphId(font, glyph);
    if (id) uses.push(`<use href="#${id}"${gx ? ` x="${num(gx)}"` : ''}/>`);
  });
  if (!uses.length) return '';
  const k = Math.round((size / upm) * 1e6) / 1e6;
  const op = opacity !== undefined && opacity < 1 ? ` fill-opacity="${num(opacity)}"` : '';
  return `<g transform="translate(${num(x0)} ${num(y)}) scale(${k})"${fill ? ` fill="${fill}"` : ''}${op}${extra}>${uses.join('')}</g>`;
}

/**
 * Outline a sequence of differently coloured runs on one baseline, e.g. the
 * caption `IR-03 · kubernetes`. Returns the elements and the end x.
 * @param {Array<{ text: string, fill: string, font?: opentype.Font, opacity?: number }>} runs
 */
export function textRuns(defaultFont, runs, x, y, size) {
  let cx = x;
  const out = [];
  for (const run of runs) {
    const font = run.font ?? defaultFont;
    if (run.text.trim()) out.push(textPath(font, run.text, cx, y, size, { fill: run.fill, opacity: run.opacity }));
    cx += measure(font, run.text, size);
  }
  return { svg: out.join(''), endX: cx };
}

// ─── Plate cards ───────────────────────────────────────────────────────────
// Shared drawing for the 1200 x 630 "plate" cards (blog covers, tool OG cards,
// the Mission 90 / Verify-the-AI heroes): the Field Manual instrument slab, a
// 2px top rule, the figure-cap caption row and the footer. All inks are the
// slab's inverse tier from src/styles/global.css (the light-theme values;
// the slab is dark in both themes).

export const W = 1200;
export const H = 630;
export const X = 80; // left rail
export const RIGHT = W - X; // right rail
export const INK = {
  plate: '#1b1915', // --color-inverse
  fg: '#f4f1ea', // --color-inverse-fg
  mute: '#b8b2a4', // --color-inverse-mute
  leaf: '#8fc97a', // --color-inverse-brand
  amber: '#e0a458', // --color-inverse-accent
  dots: ['#e0685f', '#e0b23f', '#63c079'], // --color-dot-1..3
};

/** Plate + 2px top rule. */
export function plate(rule) {
  return `<rect width="${W}" height="${H}" fill="${INK.plate}"/>\n<rect width="${W}" height="2" fill="${rule}"/>`;
}

/**
 * Geometry of the figure-cap caption row. Every dimension scales with `size`
 * from the 22px original (dot r 6, pitch 20, label at +66), so the default
 * reproduces the tool OG cards byte for byte while a cover can ask for a row
 * that stays legible when the card is shown at grid width.
 * @param {{ size?: number, baseline?: number, rule?: number }} [opts]
 */
export function captionGeometry({ size = 22, baseline = 96, rule = 128 } = {}) {
  const { mono } = fonts();
  const s = size / 22;
  const cy = baseline - (mono.tables.os2.sCapHeight / mono.unitsPerEm) * size * 0.5;
  return {
    size,
    baseline,
    rule,
    cy,
    dotR: 6 * s,
    dotXs: [0, 1, 2].map((i) => X + 6 * s + i * 20 * s),
    labelX: X + 66 * s,
  };
}

/**
 * The figure-cap caption row: three dots + a mono label made of coloured runs,
 * with the hairline under it (FigureCap.astro, drawn at card scale).
 * @param {Array<{ text: string, fill: string }>} runs
 * @param {'traffic'|'mute'} tone
 * @param {{ size?: number, baseline?: number, rule?: number }} [opts]
 */
export function captionRow(runs, tone = 'traffic', opts) {
  const { mono } = fonts();
  const g = captionGeometry(opts);
  const dots = g.dotXs
    .map((cx, i) =>
      tone === 'traffic'
        ? `<circle cx="${num(cx)}" cy="${num(g.cy)}" r="${num(g.dotR)}" fill="${INK.dots[i]}"/>`
        : `<circle cx="${num(cx)}" cy="${num(g.cy)}" r="${num(g.dotR)}" fill="#ffffff" fill-opacity="0.15"/>`,
    )
    .join('');
  const label = textRuns(mono, runs, g.labelX, g.baseline, g.size).svg;
  const rule = `<rect x="${X}" y="${g.rule}" width="${RIGHT - X}" height="1" fill="#ffffff" fill-opacity="0.12"/>`;
  return `${dots}
${label}
${rule}`;
}

/**
 * Ink bounding boxes, one per visible glyph, of a run drawn exactly as
 * textPath() draws it (same kerning, same anchor), in SVG user units (y down).
 * These are the outline's own extrema (opentype Path.getBoundingBox), not the
 * font's ascender/descender, so a layout check sees the ink that is drawn.
 * @returns {Array<{ x1: number, y1: number, x2: number, y2: number, ch: string }>}
 */
export function glyphBoxes(font, text, x, y, size, { anchor = 'start' } = {}) {
  const w = measure(font, text, size);
  const x0 = anchor === 'middle' ? x - w / 2 : anchor === 'end' ? x - w : x;
  const upm = font.unitsPerEm;
  const k = size / upm;
  const out = [];
  font.forEachGlyph(text, 0, 0, upm, { kerning: true }, (glyph, gx) => {
    if (!glyph.path.commands.length) return;
    const bb = glyph.getBoundingBox();
    out.push({
      x1: x0 + (gx + bb.x1) * k,
      x2: x0 + (gx + bb.x2) * k,
      y1: y - bb.y2 * k,
      y2: y - bb.y1 * k,
      ch: glyph.unicode !== undefined ? String.fromCodePoint(glyph.unicode) : '',
    });
  });
  return out;
}

/** Distance from a circle's EDGE to a box (negative = the box reaches inside). */
export function circleClearance(box, cx, cy, r) {
  const dx = Math.max(box.x1 - cx, 0, cx - box.x2);
  const dy = Math.max(box.y1 - cy, 0, cy - box.y2);
  return Math.hypot(dx, dy) - r;
}

/** Mono footer text at the bottom-left rail. */
export function footer(text) {
  return textPath(fonts().mono, text, X, 566, 22, { fill: INK.mute });
}

/** The OpsCanopy canopy mark (Header logo paths) + wordmark, right-aligned at baseline y. */
export function wordmark(rightX, baseline) {
  const { sans } = fonts();
  const size = 24;
  const wordW = measure(sans, 'OpsCanopy', size);
  const markW = 32 * 1.2;
  const gap = 10;
  const x0 = rightX - wordW - gap - markW;
  const markY = baseline - 30;
  return `<g transform="translate(${num(x0)},${num(markY)}) scale(1.2)" stroke="${INK.leaf}" stroke-width="2.75" stroke-linecap="square" stroke-linejoin="miter" fill="none">
<path d="M4 15.5C6.4 10.3 10.8 7 16 7s9.6 3.3 12 8.5"/>
<path d="M6.5 19.5C8.6 15.2 11.9 12.7 16 12.7s7.4 2.5 9.5 6.8"/>
<path d="M9 23C10.6 19.9 13.1 18.2 16 18.2s5.4 1.7 7 4.8"/>
<path d="M16 23v3.6"/>
</g>
${textPath(sans, 'OpsCanopy', rightX - wordW, baseline, size, { fill: INK.fg })}`;
}

/**
 * Wrap a card body in the root <svg>. `metadata` (optional, already-escaped
 * markup) goes first, before <defs>: a machine-readable stamp a test can read
 * back, since the outlined text itself is not searchable.
 */
export function svgDoc(ariaLabel, body, metadata = '') {
  if (!sheet) throw new Error('og-text: beginDoc() was not called');
  const defs = sheet.defs.length ? `<defs>\n${sheet.defs.join('\n')}\n</defs>\n` : '';
  sheet = null;
  const meta = metadata ? `${metadata}\n` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${ariaLabel}">\n${meta}${defs}${body}\n</svg>\n`;
}

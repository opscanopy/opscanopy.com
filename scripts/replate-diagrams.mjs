#!/usr/bin/env node
// Re-plate the in-article blog diagrams (public/blog/<slug>-diagram.svg) onto
// the Field Manual card palette, with every label outlined in IBM Plex.
//
//   node scripts/replate-diagrams.mjs          write public/blog/*-diagram.svg, print sha256s
//   node scripts/replate-diagrams.mjs --check  exit 1 if any file differs from a fresh render
//
// SOURCE OF TRUTH: scripts/diagram-src/<slug>-diagram.svg — the hand-authored
// diagrams with live <text>, exactly as they shipped before 2026-10-02. Edit a
// diagram there and re-run this script; never edit the public/ copy (the gate
// in src/lib/blog-diagram.test.ts re-renders every file and fails on drift).
//
// What a render does, and nothing else:
//   1. Every <text> (with its <tspan>s) becomes outlined glyphs: one <use> per
//      glyph from a per-file glyph sheet in <defs>, one <g> per style run. Fonts:
//      IBM Plex Sans Regular / SemiBold / Italic (scripts/fonts/, OFL 1.1) and
//      Plex Mono 400 / 600 (the @fontsource WOFFs the site ships, via
//      og-text.mjs). font-weight >= 600 maps to SemiBold / Mono 600.
//   2. Position is the source's, honoured exactly: x/y, tspan x/y (new chunk),
//      dx, text-anchor start/middle/end per chunk, letter-spacing, font-size,
//      xml:space="preserve" vs collapsed whitespace (SVG/CSS rules: leading and
//      trailing spaces of the element stripped, runs collapsed across tspans).
//   3. Where Plex is wider than the system font the diagram was drawn against
//      and a label would cross its box edge or run into the next label on its
//      baseline, that ONE chunk is condensed horizontally about its anchor
//      (glyph height, size, baseline and anchor untouched). The factor is
//      clamped at MIN_CONDENSE; a label that still collides there is logged as
//      residual (every one found was already colliding in the source, under
//      the system fonts) and a factor under 50% throws as a layout bug.
//   4. Colours move onto the light-theme tokens of src/styles/global.css
//      (PALETTE below). The plate stays a light card in BOTH themes: an <img>
//      cannot follow the theme, and every ink inside was chosen for paper.
//   5. Text-only attributes on <g> wrappers (font-*, letter-spacing,
//      text-anchor) are dropped; geometry, ids, markers, viewBox, width/height,
//      role and aria-label are byte-for-byte the source's.
//
// Deterministic: coordinates rounded to 2 dp, glyph ids assigned in document
// order, no clock / locale / environment reads.
import opentype from 'opentype.js';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { fonts as coverFonts, num } from './og-text.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const SRC_DIR = join(ROOT, 'scripts/diagram-src');
export const OUT_DIR = join(ROOT, 'public/blog');
export const DIAGRAM_RE = /-diagram\.svg$/;

/** Narrowest horizontal condense a label may take before the run fails. */
export const MIN_CONDENSE = 0.8;
/** A same-baseline neighbour needing more squeeze than this is a source overlap, left alone. */
export const OVERLAP_IGNORE = 0.6;

// Per-file layout facts the fitter cannot infer. reading-promql's query row
// was drawn against Consolas (0.55 em advance: "sum by (job)" spans its
// 172px bracket at 26px), and its underline brackets are geometry that must
// keep matching the tokens above them; Plex Mono is 0.6 em, so every mono
// chunk in that file is set to Consolas width. terraform-forces-replacement,
// the other bracketed diagram, was drawn at 0.6 em and needs nothing.
export const FILE_OPTIONS = {
  'reading-promql-diagram.svg': { monoScale: Math.round((0.55 / 0.6) * 1e4) / 1e4 },
};

// Source hex -> Field Manual token (light-theme value in global.css).
// Leaf, amber, error and hairline hexes are already tokens and pass through.
export const PALETTE = {
  '#ffffff': '#fffdf9', // plate + inner chips -> --color-card
  '#f7f5f0': '#f4f1ea', // neutral boxes, code panels -> --color-canvas-soft
  '#f0ede6': '#ebe7de', // "skipped" node -> --color-canvas-soft-2
  '#141310': '#211e19', // primary ink -> --color-ink
  '#3a352c': '#524f48', // label ink -> --color-body
  '#6b675f': '#5d5950', // captions -> --color-mute
  '#6b6458': '#5d5950', // -> --color-mute
  '#6b6457': '#5d5950', // -> --color-mute
  '#8a8373': '#9c968a', // dashed connectors -> --color-hairline-strong
  '#b3261e': '#c2321f', // -> --color-error
  '#fbecea': '#f6ddd6', // -> --color-error-soft
};

/** Every colour a re-plated diagram may contain (light-theme token values). */
export const ALLOWED_COLOURS = new Set([
  '#fffdf9', // card
  '#f4f1ea', // canvas-soft
  '#ebe7de', // canvas-soft-2
  '#e6e1d6', // hairline
  '#cfc9bb', // hairline-muted
  '#9c968a', // hairline-strong
  '#211e19', // ink
  '#524f48', // body
  '#5d5950', // mute
  '#4a8c3f', // brand
  '#33652c', // brand-strong
  '#e2eeda', // brand-soft
  '#c2321f', // error
  '#f6ddd6', // error-soft
  '#9c2114', // error-deep
  '#a85a06', // accent-ink
  '#904d49', // cat-security
]);

// ─── Fonts ──────────────────────────────────────────────────────────────────
function load(rel) {
  const buf = readFileSync(join(ROOT, rel));
  return opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
}
let fontCache;
function fontSet() {
  if (!fontCache) {
    const c = coverFonts();
    fontCache = {
      sans: load('scripts/fonts/IBMPlexSans-Regular.ttf'),
      sansBold: c.sans, // IBMPlexSans-SemiBold.ttf
      sansItalic: load('scripts/fonts/IBMPlexSans-Italic.ttf'),
      mono: c.mono, // ibm-plex-mono latin 400
      monoBold: c.monoBold, // ibm-plex-mono latin 600
    };
  }
  return fontCache;
}

function pickFont(style) {
  const f = fontSet();
  const mono = /mono|consolas|menlo/i.test(style.family);
  const bold = style.weight === 'bold' || Number(style.weight) >= 600;
  const italic = style.fontStyle === 'italic';
  if (mono) {
    if (italic) throw new Error('replate: italic monospace is not supported');
    return { font: bold ? f.monoBold : f.mono, fallback: bold ? f.sansBold : f.sans };
  }
  if (italic) {
    if (bold) throw new Error('replate: bold italic is not supported');
    return { font: f.sansItalic, fallback: f.sans };
  }
  return { font: bold ? f.sansBold : f.sans, fallback: null };
}

// ─── Minimal XML parser (the diagrams are hand-written, simple SVG) ─────────
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
function decode(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1)));
    if (!(e in ENT)) throw new Error(`replate: unknown entity ${m}`);
    return ENT[e];
  });
}

export function parseXml(src) {
  const root = { name: '#root', attrs: {}, children: [], parent: null };
  let cur = root;
  let i = 0;
  while (i < src.length) {
    if (src.startsWith('<!--', i)) {
      const j = src.indexOf('-->', i);
      if (j < 0) throw new Error('replate: unterminated comment');
      i = j + 3;
    } else if (src.startsWith('<?', i) || src.startsWith('<!', i)) {
      throw new Error('replate: processing instructions / doctypes are not expected');
    } else if (src.startsWith('</', i)) {
      const j = src.indexOf('>', i);
      const name = src.slice(i + 2, j).trim();
      if (name !== cur.name) throw new Error(`replate: </${name}> closes <${cur.name}>`);
      cur.end = j + 1;
      cur = cur.parent;
      i = j + 1;
    } else if (src[i] === '<') {
      const m = /^<([a-zA-Z][\w:-]*)/.exec(src.slice(i, i + 64));
      if (!m) throw new Error(`replate: bad tag at ${i}`);
      const el = { name: m[1], attrs: {}, attrOrder: [], children: [], parent: cur, start: i };
      let k = i + m[0].length;
      const attrRe = /\s*([^\s=/>]+)\s*=\s*"([^"]*)"/y;
      for (;;) {
        attrRe.lastIndex = k;
        const a = attrRe.exec(src);
        if (!a) break;
        el.attrs[a[1]] = decode(a[2]);
        el.attrOrder.push(a[1]);
        k = attrRe.lastIndex;
      }
      while (/\s/.test(src[k])) k++;
      cur.children.push(el);
      if (src.startsWith('/>', k)) {
        el.tagEnd = k + 2;
        el.end = k + 2;
        i = k + 2;
      } else if (src[k] === '>') {
        el.tagEnd = k + 1;
        i = k + 1;
        cur = el;
      } else {
        throw new Error(`replate: cannot parse <${el.name}> at ${i}`);
      }
    } else {
      const j = src.indexOf('<', i);
      const end = j < 0 ? src.length : j;
      cur.children.push({ name: '#text', value: decode(src.slice(i, end)), parent: cur });
      i = end;
    }
  }
  if (cur !== root) throw new Error(`replate: <${cur.name}> is never closed`);
  return root;
}

function* walk(el) {
  for (const c of el.children ?? []) {
    yield c;
    if (c.name !== '#text') yield* walk(c);
  }
}

// ─── Style + geometry helpers ───────────────────────────────────────────────
const TEXT_ATTRS = ['font-family', 'font-size', 'font-weight', 'font-style', 'letter-spacing', 'text-anchor'];
// Anything here on a <text>/<tspan> (or inherited) would change layout in a
// way this renderer does not model, so it fails closed instead of guessing.
const UNSUPPORTED = [
  'dominant-baseline', 'alignment-baseline', 'baseline-shift', 'textLength', 'lengthAdjust', 'rotate',
  'dy', 'style', 'class', 'word-spacing', 'font-variant', 'writing-mode', 'opacity', 'fill-opacity',
  'stroke', 'transform', 'direction', 'unicode-bidi', 'font-stretch',
];

function inherited(el, prop) {
  for (let n = el; n && n.name !== '#root'; n = n.parent) {
    if (n.attrs && prop in n.attrs) return n.attrs[prop];
  }
  return undefined;
}

function styleOf(el) {
  return {
    family: inherited(el, 'font-family') ?? 'sans-serif',
    size: Number(inherited(el, 'font-size') ?? 16),
    weight: inherited(el, 'font-weight') ?? '400',
    fontStyle: inherited(el, 'font-style') ?? 'normal',
    fill: inherited(el, 'fill') ?? '#000000',
    ls: Number(inherited(el, 'letter-spacing') ?? 0),
    anchor: inherited(el, 'text-anchor') ?? 'start',
    preserve: inherited(el, 'xml:space') === 'preserve',
  };
}

/** Sum of translate() offsets on el's ancestors (the only transform the diagrams use). */
function offsetOf(el) {
  let tx = 0;
  let ty = 0;
  for (let n = el.parent; n && n.name !== '#root'; n = n.parent) {
    const t = n.attrs?.transform;
    if (!t) continue;
    const m = /^translate\(\s*(-?[\d.]+)[\s,]+(-?[\d.]+)\s*\)$/.exec(t.trim());
    if (!m) throw new Error(`replate: unsupported transform "${t}" above <${el.name}>`);
    tx += Number(m[1]);
    ty += Number(m[2]);
  }
  return { tx, ty };
}

// ─── Glyphs ─────────────────────────────────────────────────────────────────
// U+2717 BALLOT X is in neither Plex face. It is drawn as two bars inside the
// box of Plex Sans's own U+2713 CHECK MARK, so the pair reads as one set.
function ballotX(font) {
  const ref = font.charToGlyph('✓');
  const bb = ref.getBoundingBox();
  const t = font === fontSet().sansBold ? 96 : 72; // bar thickness, font units
  const [x0, y0, x1, y1] = [bb.x1 + 40, bb.y1 + 20, bb.x2 - 40, bb.y2 - 20];
  const bar = (ax, ay, bx, by) => {
    const dx = bx - ax;
    const dy = by - ay;
    const len = Math.hypot(dx, dy);
    const nx = (-dy / len) * (t / 2);
    const ny = (dx / len) * (t / 2);
    return `M${num(ax + nx)} ${num(-(ay + ny))}L${num(bx + nx)} ${num(-(by + ny))}L${num(bx - nx)} ${num(-(by - ny))}L${num(ax - nx)} ${num(-(ay - ny))}Z`;
  };
  return { d: bar(x0, y0, x1, y1) + bar(x0, y1, x1, y0), advance: ref.advanceWidth, bbox: { x1: x0 - t / 2, x2: x1 + t / 2 } };
}

/**
 * Compact outline in integer font units with relative commands (1 unit is
 * ~0.02px at these sizes). Degenerate zero-length segments are dropped.
 */
function glyphD(glyph, upm) {
  let d = '';
  let cx = 0;
  let cy = 0;
  let sx = 0;
  let sy = 0;
  const r = Math.round;
  const n = (v) => (v < 0 ? String(v) : ` ${v}`); // a '-' separates on its own
  const pair = (x, y) => `${n(r(x) - cx)}${n(r(y) - cy)}`;
  for (const c of glyph.getPath(0, 0, upm).commands) {
    if (c.type === 'M') {
      d += `m${pair(c.x, c.y)}`;
      [cx, cy] = [r(c.x), r(c.y)];
      [sx, sy] = [cx, cy];
    } else if (c.type === 'L') {
      if (r(c.x) === cx && r(c.y) === cy) continue;
      d += `l${pair(c.x, c.y)}`;
      [cx, cy] = [r(c.x), r(c.y)];
    } else if (c.type === 'Q') {
      d += `q${pair(c.x1, c.y1)}${pair(c.x, c.y)}`;
      [cx, cy] = [r(c.x), r(c.y)];
    } else if (c.type === 'C') {
      d += `c${pair(c.x1, c.y1)}${pair(c.x2, c.y2)}${pair(c.x, c.y)}`;
      [cx, cy] = [r(c.x), r(c.y)];
    } else if (c.type === 'Z') {
      d += 'z';
      [cx, cy] = [sx, sy];
    }
  }
  return d.replace(/^m /, 'm').replace(/([a-z]) /g, '$1');
}

class Sheet {
  constructor() {
    this.ids = new Map();
    this.defs = [];
  }
  id(key, makeD) {
    if (this.ids.has(key)) return this.ids.get(key);
    const d = makeD();
    const id = d ? `gl${this.defs.length}` : '';
    if (id) this.defs.push(`<path id="${id}" d="${d}"/>`);
    this.ids.set(key, id);
    return id;
  }
}

/** One glyph: which font draws a character, its outline id, advance and ink box (font units). */
function glyphFor(sheet, choice, ch) {
  const { font, fallback } = choice;
  let f = font;
  let g = f.charToGlyph(ch);
  if (g.index === 0 && /\s/.test(ch)) g = f.charToGlyph(' ');
  if (g.index === 0 && fallback) {
    f = fallback;
    g = f.charToGlyph(ch);
  }
  if (g.index === 0 && ch === '✗') {
    const sans = choice.font === fontSet().monoBold || choice.font === fontSet().sansBold ? fontSet().sansBold : fontSet().sans;
    const x = ballotX(sans);
    const id = sheet.id(`ballotx|${sans.names.fullName.en}`, () => x.d);
    return { font: sans, glyph: null, id, advance: x.advance, ink: x.bbox };
  }
  if (g.index === 0) throw new Error(`replate: no Plex glyph for ${JSON.stringify(ch)} (U+${ch.codePointAt(0).toString(16)})`);
  const id = sheet.id(`${f.names.fullName.en}|${g.index}`, () => glyphD(g, f.unitsPerEm));
  const bb = g.getBoundingBox();
  return { font: f, glyph: g, id, advance: g.advanceWidth, ink: id ? { x1: bb.x1, x2: bb.x2 } : null };
}

// ─── Text layout ────────────────────────────────────────────────────────────
/** Flatten a <text> into positioned characters, applying SVG whitespace rules. */
function textChars(textEl) {
  const chars = [];
  // Pending position: an element's x/y/dx belong to the first character drawn
  // inside it, even when that character sits in a nested <tspan>.
  let pending = {};
  const visit = (el) => {
    for (const a of UNSUPPORTED) if (el.attrs[a] !== undefined) throw new Error(`replate: "${a}" on <${el.name}> is not supported`);
    for (const a of ['x', 'y', 'dx']) {
      if (el.attrs[a] === undefined) continue;
      if (!/^-?[\d.]+$/.test(el.attrs[a])) throw new Error(`replate: list-valued ${a} on <${el.name}> is not supported`);
      pending[a] = Number(el.attrs[a]);
    }
    const style = styleOf(el);
    for (const c of el.children) {
      if (c.name === '#text') {
        for (const ch of c.value) {
          chars.push({ ch, style, pos: pending });
          pending = {};
        }
      } else if (c.name === 'tspan') {
        visit(c);
      } else {
        throw new Error(`replate: <${c.name}> inside <text> is not supported`);
      }
    }
  };
  visit(textEl);

  // Whitespace (SVG 1.1 §10.15 / CSS white-space): newlines dropped and tabs
  // become spaces either way; without xml:space="preserve", leading/trailing
  // spaces are stripped and runs collapse to one, across tspan boundaries.
  const out = [];
  let carry = null;
  for (const c of chars) {
    let ch = c.ch;
    if (ch === '\n' || ch === '\r') ch = c.style.preserve ? ' ' : '';
    if (ch === '\t') ch = ' ';
    if (!c.style.preserve && ch === ' ') {
      const prev = out[out.length - 1];
      if (!prev || prev.ch === ' ') ch = '';
    }
    const pos = carry ? { ...carry, ...c.pos } : c.pos;
    if (!ch) {
      carry = Object.keys(pos).length ? pos : null;
      continue;
    }
    carry = null;
    out.push({ ...c, ch, pos });
  }
  while (out.length && out[out.length - 1].ch === ' ' && !out[out.length - 1].style.preserve) out.pop();
  return out;
}

/**
 * Lay out one <text> element into chunks (one per absolute x/y), each made of
 * runs of glyphs sharing font + size + fill. Positions are in the text's own
 * user space (before ancestor translates).
 */
function layoutText(sheet, textEl) {
  const chars = textChars(textEl);
  if (!chars.length) return [];
  const chunks = [];
  let cur = null;
  let penX = Number(textEl.attrs.x ?? 0);
  let penY = Number(textEl.attrs.y ?? 0);
  let prevGlyph = null;
  for (const c of chars) {
    if (c.pos.x !== undefined || c.pos.y !== undefined || !cur) {
      if (c.pos.x !== undefined) penX = c.pos.x;
      if (c.pos.y !== undefined) penY = c.pos.y;
      cur = { anchorX: penX, y: penY, anchor: c.style.anchor, glyphs: [], start: penX };
      chunks.push(cur);
      cur.pen = 0;
      prevGlyph = null;
    }
    if (c.pos.dx !== undefined) {
      cur.pen += c.pos.dx;
      prevGlyph = null;
    }
    const choice = pickFont(c.style);
    const g = glyphFor(sheet, choice, c.ch);
    const k = c.style.size / g.font.unitsPerEm;
    if (prevGlyph && prevGlyph.font === g.font && prevGlyph.size === c.style.size && prevGlyph.glyph && g.glyph && !c.style.ls) {
      cur.pen += g.font.getKerningValue(prevGlyph.glyph, g.glyph) * k;
    }
    cur.glyphs.push({ ...g, ch: c.ch, size: c.style.size, fill: c.style.fill, x: cur.pen, k });
    cur.pen += g.advance * k + c.style.ls;
    prevGlyph = { ...g, size: c.style.size };
  }
  for (const ch of chunks) {
    const adv = ch.pen;
    ch.x0 = ch.anchor === 'middle' ? ch.anchorX - adv / 2 : ch.anchor === 'end' ? ch.anchorX - adv : ch.anchorX;
    // Pivot for any condensing: the anchor itself.
    ch.pivot = ch.anchor === 'middle' ? ch.anchorX : ch.anchor === 'end' ? ch.anchorX : ch.x0;
    const inked = ch.glyphs.filter((g) => g.ink);
    ch.inkL = inked.length ? Math.min(...inked.map((g) => ch.x0 + g.x + g.ink.x1 * g.k)) : ch.x0;
    ch.inkR = inked.length ? Math.max(...inked.map((g) => ch.x0 + g.x + g.ink.x2 * g.k)) : ch.x0;
    ch.size = Math.max(...ch.glyphs.map((g) => g.size));
    ch.label = ch.glyphs.map((g) => g.ch).join('');
    ch.s = 1;
    ch.base = 1;
  }
  return chunks;
}

// ─── Fit (condense only where Plex would collide) ──────────────────────────
function fitChunks(all, rects, file, log) {
  for (const c of all) {
    const ax = c.off.tx;
    const ay = c.off.ty;
    const L = c.inkL + ax;
    const R = c.inkR + ax;
    const P = c.pivot + ax;
    const Y = c.y + ay;
    const probeY = Y - c.size * 0.3;
    const probeX = c.anchor === 'start' ? L + 2 : c.anchor === 'end' ? R - 2 : P;
    // Smallest rect that holds the label's anchor end: the box it sits in. A
    // centred label only belongs to a box it is centred in (a "convert" label
    // straddling a panel edge is not that panel's content).
    const box = rects
      .filter((r) => probeX > r.x && probeX < r.x + r.w && probeY > r.y && probeY < r.y + r.h)
      .filter((r) => c.anchor !== 'middle' || Math.abs(r.x + r.w / 2 - P) <= r.w * 0.2)
      .sort((a, b) => a.w * a.h - b.w * b.h)[0];
    let limL = -Infinity;
    let limR = Infinity;
    if (box) {
      const clampPad = (p) => Math.min(24, Math.max(3, p));
      if (c.anchor === 'start') limR = box.x + box.w - clampPad((L - box.x) * 0.5);
      else if (c.anchor === 'end') limL = box.x + clampPad((box.x + box.w - R) * 0.5);
      else {
        const pad = clampPad(Math.min(P - box.x, box.x + box.w - P) * 0.15);
        limL = box.x + pad;
        limR = box.x + box.w - pad;
      }
    }
    // The next label on the same baseline, in the direction the label grows.
    // A neighbour that would need the label squeezed under OVERLAP_IGNORE is
    // an overlap the source already has (two labels drawn on top of each
    // other); condensing cannot separate them, so it is left as drawn.
    const gap = c.size * 0.2;
    for (const o of all) {
      if (o === c || Math.abs(o.y + o.off.ty - Y) > Math.max(c.size, o.size) * 0.3) continue;
      const oL = o.inkL + o.off.tx;
      const oR = o.inkR + o.off.tx;
      if (c.anchor !== 'end' && oL >= P - 0.5 && oL > L + 1 && oL - gap < R) {
        if ((oL - gap - P) / (R - P) >= OVERLAP_IGNORE) limR = Math.min(limR, oL - gap);
      }
      if (c.anchor !== 'start' && oR <= P + 0.5 && oR < R - 1 && oR + gap > L) {
        if ((P - oR - gap) / (P - L) >= OVERLAP_IGNORE) limL = Math.max(limL, oR + gap);
      }
    }
    let s = 1;
    if (R > limR) s = Math.min(s, (limR - P) / (R - P));
    if (L < limL) s = Math.min(s, (P - limL) / (P - L));
    if (s < 1) {
      if (!(s > 0.2)) {
        // Far beyond any font-metric difference: a layout bug, not a tight label.
        throw new Error(`replate: ${file}: "${c.label}" would need ${(s * 100).toFixed(1)}% width — check the source`);
      }
      c.s = Math.round(c.base * Math.max(MIN_CONDENSE, Math.floor(s * 1000) / 1000) * 1e4) / 1e4;
      log?.push({ file, label: c.label, s: c.s, residual: s < MIN_CONDENSE ? Math.round((1 - s) * (c.anchor === 'start' ? R - P : P - L)) : 0 });
    }
  }
}

// ─── Render ─────────────────────────────────────────────────────────────────
function emitChunk(sheet, c) {
  const runs = [];
  for (const g of c.glyphs) {
    const last = runs[runs.length - 1];
    if (last && last.font === g.font && last.size === g.size && last.fill === g.fill) last.glyphs.push(g);
    else runs.push({ font: g.font, size: g.size, fill: g.fill, k: g.k, glyphs: [g] });
  }
  const out = [];
  for (const r of runs) {
    const uses = r.glyphs.filter((g) => g.id);
    if (!uses.length) continue;
    const ox = c.x0 + r.glyphs[0].x; // run origin before condensing
    const tx = c.pivot + (ox - c.pivot) * c.s;
    const kx = Math.round(r.k * c.s * 1e6) / 1e6;
    const ky = Math.round(r.k * 1e6) / 1e6;
    const scale = kx === ky ? `scale(${ky})` : `scale(${kx} ${ky})`;
    const body = uses
      .map((g) => {
        const fx = Math.round((g.x - r.glyphs[0].x) / r.k);
        return `<use href="#${g.id}"${fx ? ` x="${fx}"` : ''}/>`;
      })
      .join('');
    const fill = PALETTE[r.fill.toLowerCase()] ?? r.fill.toLowerCase();
    out.push(`<g transform="translate(${num(tx)} ${num(c.y)}) ${scale}" fill="${fill}">${body}</g>`);
  }
  return out;
}

/**
 * Re-plate one diagram. Pure: the same source always yields the same bytes.
 * @param {string} src  source SVG (with <text>)
 * @param {{ file?: string, log?: Array<{file:string,label:string,s:number}> }} [opts]
 */
export function replate(source, { file = 'diagram', log } = {}) {
  // Line endings are not content: a Windows checkout (core.autocrlf, no
  // .gitattributes) hands us CRLF; output is always LF.
  const src = source.replace(/\r\n/g, '\n');
  const doc = parseXml(src);
  const svg = doc.children.find((c) => c.name === 'svg');
  if (!svg) throw new Error(`replate: ${file}: no <svg> root`);
  const sheet = new Sheet();
  const rects = [];
  const texts = [];
  const groups = [];
  for (const n of walk(svg)) {
    if (n.name === 'rect') {
      const { tx, ty } = offsetOf(n);
      const a = n.attrs;
      rects.push({ x: Number(a.x ?? 0) + tx, y: Number(a.y ?? 0) + ty, w: Number(a.width), h: Number(a.height) });
    } else if (n.name === 'text') {
      texts.push(n);
    } else if (n.name === 'g' && TEXT_ATTRS.some((a) => a in n.attrs)) {
      groups.push(n);
    }
  }
  const laid = texts.map((t) => {
    const off = offsetOf(t);
    const chunks = layoutText(sheet, t);
    for (const c of chunks) {
      c.off = off;
      // A file drawn against Consolas metrics sets its monospace chunks to
      // that advance before fitting (see FILE_OPTIONS).
      const monoScale = FILE_OPTIONS[file]?.monoScale;
      if (monoScale && c.glyphs.every((g) => g.font === fontSet().mono || g.font === fontSet().monoBold || !g.id)) {
        c.base = c.s = monoScale;
        c.inkL = c.pivot + (c.inkL - c.pivot) * monoScale;
        c.inkR = c.pivot + (c.inkR - c.pivot) * monoScale;
      }
    }
    return { el: t, chunks };
  });
  fitChunks(laid.flatMap((t) => t.chunks), rects, file, log);

  // Splice replacements into the source so everything else stays byte-identical.
  const edits = [];
  for (const { el, chunks } of laid) {
    const lineStart = src.lastIndexOf('\n', el.start) + 1;
    const indent = /^[ \t]*/.exec(src.slice(lineStart, el.start))[0];
    const parts = chunks.flatMap((c) => emitChunk(sheet, c));
    edits.push({ start: el.start, end: el.end, text: parts.join(`\n${indent}`) });
  }
  for (const g of groups) {
    const keep = g.attrOrder.filter((a) => !TEXT_ATTRS.includes(a));
    const raw = src.slice(g.start, g.tagEnd);
    const attrSrc = (a) => new RegExp(`\\s${a.replace(/[:]/g, '\\:')}="[^"]*"`).exec(raw)[0];
    edits.push({ start: g.start, end: g.tagEnd, text: `<g${keep.map(attrSrc).join('')}>` });
  }
  // The glyph sheet goes in its own <defs> right after the root tag.
  edits.push({ start: svg.tagEnd, end: svg.tagEnd, text: `\n  <defs>\n    ${sheet.defs.join('\n    ')}\n  </defs>` });
  edits.sort((a, b) => b.start - a.start);
  let out = src;
  for (const e of edits) out = out.slice(0, e.start) + e.text + out.slice(e.end);

  out = out.replace(/(\s(?:fill|stroke)=")(#[0-9a-fA-F]{6})"/g, (m, pre, hex) => `${pre}${PALETTE[hex.toLowerCase()] ?? hex.toLowerCase()}"`);
  // Drop the whitespace-only lines left where a removed element stood alone.
  out = out.replace(/\n[ \t]+\n/g, '\n\n');
  return out;
}

export function diagramFiles() {
  return readdirSync(SRC_DIR)
    .filter((f) => DIAGRAM_RE.test(f))
    .sort();
}

const sha256 = (s) => createHash('sha256').update(s).digest('hex');

function main() {
  const check = process.argv.includes('--check');
  const verbose = process.argv.includes('--verbose');
  const log = [];
  let drift = 0;
  for (const f of diagramFiles()) {
    const out = replate(readFileSync(join(SRC_DIR, f), 'utf8'), { file: f, log });
    const dest = join(OUT_DIR, f);
    if (check) {
      let cur = '';
      try {
        cur = readFileSync(dest, 'utf8').replace(/\r\n/g, '\n');
      } catch {}
      if (cur !== out) {
        drift++;
        console.error(`drift: public/blog/${f}`);
      }
    } else {
      writeFileSync(dest, out);
    }
    console.log(`${sha256(out)}  public/blog/${f}  ${Buffer.byteLength(out)} B`);
  }
  if (verbose) for (const l of log) console.log(`condensed ${(l.s * 100).toFixed(1)}%${l.residual ? ` (residual ~${l.residual}px)` : ''}  ${l.file}  ${JSON.stringify(l.label)}`);
  else if (log.length) console.log(`${log.length} label(s) condensed to fit (min ${Math.min(...log.map((l) => l.s))}); --verbose lists them`);
  if (drift) {
    console.error(`${drift} diagram(s) differ from a fresh render — run node scripts/replate-diagrams.mjs`);
    process.exit(1);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();

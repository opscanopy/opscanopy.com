/**
 * rehype-img-dims — gives every markdown-body <img> its intrinsic width and
 * height, so the browser reserves the box before the file arrives (no layout
 * shift). Only root-relative srcs are sized, by reading the file under
 * public/ and parsing just its header: SVG width/height (else viewBox), WebP
 * (VP8 / VP8L / VP8X), PNG (IHDR) and JPEG (first SOF). An explicit width or
 * height is never overridden, and any read or parse failure leaves the node
 * exactly as it was. `.rich-text img { height: auto }` keeps the rendered
 * aspect honest when max-width shrinks it.
 *
 * node:fs + node:path only; no image library.
 */
import fs from 'node:fs';
import path from 'node:path';

/** @typedef {{ width: number, height: number }} Size */

/** @param {number} w @param {number} h @returns {Size | null} */
function size(w, h) {
  return Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0
    ? { width: Math.round(w), height: Math.round(h) }
    : null;
}

/** Numeric SVG length in user units (bare or px); null for %, em, etc. */
function svgLength(value) {
  const m = value && /^\s*([0-9]*\.?[0-9]+)\s*(px)?\s*$/.exec(value);
  return m ? Number(m[1]) : NaN;
}

/** @param {Buffer} buf @returns {Size | null} */
export function svgSize(buf) {
  const open = /<svg\b[^>]*>/i.exec(buf.toString('utf8'));
  if (!open) return null;
  const tag = open[0];
  const attr = (name) => {
    const m = new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i').exec(tag);
    return m ? (m[1] ?? m[2]) : null;
  };
  const direct = size(svgLength(attr('width')), svgLength(attr('height')));
  if (direct) return direct;
  const vb = attr('viewBox');
  if (!vb) return null;
  const parts = vb.trim().split(/[\s,]+/).map(Number);
  return parts.length === 4 ? size(parts[2], parts[3]) : null;
}

/** @param {Buffer} buf @returns {Size | null} */
export function webpSize(buf) {
  if (buf.length < 20) return null;
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WEBP') return null;
  const chunk = buf.toString('ascii', 12, 16);
  const d = 20; // chunk payload start
  if (chunk === 'VP8 ') {
    // 3-byte frame tag, then start code 9d 01 2a, then 14-bit w/h (2 scale bits).
    if (buf.length < d + 10 || buf[d + 3] !== 0x9d || buf[d + 4] !== 0x01 || buf[d + 5] !== 0x2a) return null;
    return size(buf.readUInt16LE(d + 6) & 0x3fff, buf.readUInt16LE(d + 8) & 0x3fff);
  }
  if (chunk === 'VP8L') {
    if (buf.length < d + 5 || buf[d] !== 0x2f) return null;
    const bits = buf.readUInt32LE(d + 1);
    return size((bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1);
  }
  if (chunk === 'VP8X' && buf.length >= d + 10) {
    return size(buf.readUIntLE(d + 4, 3) + 1, buf.readUIntLE(d + 7, 3) + 1);
  }
  return null;
}

const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** @param {Buffer} buf @returns {Size | null} */
export function pngSize(buf) {
  if (buf.length < 24 || PNG_SIG.some((b, i) => buf[i] !== b)) return null;
  if (buf.toString('ascii', 12, 16) !== 'IHDR') return null;
  return size(buf.readUInt32BE(16), buf.readUInt32BE(20));
}

/** @param {Buffer} buf @returns {Size | null} */
export function jpegSize(buf) {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 <= buf.length) {
    if (buf[i] !== 0xff) return null;
    const marker = buf[i + 1];
    if (marker === 0xff) {
      i += 1; // fill byte
      continue;
    }
    // SOF0–SOF15, excluding DHT (c4), JPG (c8) and DAC (cc).
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return size(buf.readUInt16BE(i + 7), buf.readUInt16BE(i + 5));
    }
    i += 2 + buf.readUInt16BE(i + 2);
  }
  return null;
}

/** @param {Buffer} buf @param {string} ext lower-case, with dot @returns {Size | null} */
export function imageSize(buf, ext) {
  switch (ext) {
    case '.svg':
      return svgSize(buf);
    case '.webp':
      return webpSize(buf);
    case '.png':
      return pngSize(buf);
    case '.jpg':
    case '.jpeg':
      return jpegSize(buf);
    default:
      return null;
  }
}

function has(props, key) {
  return props[key] !== undefined && props[key] !== null && props[key] !== '';
}

/** @param {{ publicDir?: string }} [options] */
export default function rehypeImgDims(options = {}) {
  const publicDir = path.resolve(options.publicDir ?? path.join(process.cwd(), 'public'));
  /** @type {Map<string, Size | null>} */
  const cache = new Map();

  function lookup(src) {
    if (cache.has(src)) return cache.get(src);
    let result = null;
    try {
      const clean = decodeURIComponent(src.split(/[?#]/)[0]);
      const file = path.resolve(publicDir, '.' + clean);
      if (file.startsWith(publicDir + path.sep)) {
        result = imageSize(fs.readFileSync(file), path.extname(file).toLowerCase());
      }
    } catch {
      result = null;
    }
    cache.set(src, result);
    return result;
  }

  function walk(node) {
    if (node.type === 'element' && node.tagName === 'img') {
      const props = node.properties ?? {};
      const src = props.src;
      if (typeof src === 'string' && src.startsWith('/') && !src.startsWith('//') && !has(props, 'width') && !has(props, 'height')) {
        const dims = lookup(src);
        if (dims) {
          props.width = dims.width;
          props.height = dims.height;
        }
      }
    }
    if (node.children) node.children.forEach(walk);
  }

  return (tree) => {
    walk(tree);
  };
}

/**
 * rehype-img-dims — intrinsic width/height on markdown-body <img> so the
 * browser can reserve the box before the image arrives (CLS). Tested against
 * real files in public/blog plus synthetic headers for each parser.
 */
import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import rehypeImgDims, { svgSize, webpSize, pngSize, jpegSize, imageSize } from './rehype-img-dims.mjs';

const PUBLIC_DIR = fileURLToPath(new URL('../../public', import.meta.url));

type El = { type: 'element'; tagName: string; properties: Record<string, unknown>; children: unknown[] };

function img(src: string, extra: Record<string, unknown> = {}): El {
  return { type: 'element', tagName: 'img', properties: { src, alt: 'a', ...extra }, children: [] };
}

function run(...imgs: El[]) {
  const tree = {
    type: 'root',
    children: [{ type: 'element', tagName: 'p', properties: {}, children: imgs }],
  };
  rehypeImgDims({ publicDir: PUBLIC_DIR })(tree);
  return imgs;
}

describe('rehypeImgDims (real files)', () => {
  it('sizes a viewBox-only SVG from its viewBox', () => {
    const [node] = run(img('/blog/common-gitlab-ci-mistakes-diagram.svg'));
    expect(node.properties).toEqual({
      src: '/blog/common-gitlab-ci-mistakes-diagram.svg',
      alt: 'a',
      width: 1200,
      height: 660,
    });
  });

  it('sizes a lossy WebP from its VP8 frame header', () => {
    const [node] = run(img('/blog/in-content/common-gitlab-ci-mistakes.webp'));
    expect(node.properties.width).toBe(1400);
    expect(node.properties.height).toBe(613);
    expect(node.properties).not.toHaveProperty('loading');
  });

  it('leaves a missing file untouched', () => {
    const [node] = run(img('/blog/does-not-exist.svg'));
    expect(node.properties).toEqual({ src: '/blog/does-not-exist.svg', alt: 'a' });
  });

  it('leaves external and protocol-relative URLs untouched', () => {
    const [a, b] = run(img('https://example.com/x.svg'), img('//example.com/x.svg'));
    expect(a.properties).toEqual({ src: 'https://example.com/x.svg', alt: 'a' });
    expect(b.properties).toEqual({ src: '//example.com/x.svg', alt: 'a' });
  });

  it('never overrides an explicit width or height', () => {
    const [a, b] = run(
      img('/blog/common-gitlab-ci-mistakes-diagram.svg', { width: 600 }),
      img('/blog/common-gitlab-ci-mistakes-diagram.svg', { height: 300 }),
    );
    expect(a.properties).not.toHaveProperty('height');
    expect(b.properties).not.toHaveProperty('width');
  });

  it('refuses paths that escape the public dir', () => {
    const [node] = run(img('/../package.json'));
    expect(node.properties).toEqual({ src: '/../package.json', alt: 'a' });
  });
});

describe('svgSize', () => {
  const svg = (attrs: string) => Buffer.from(`<?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg" ${attrs}><g/></svg>`);

  it('prefers numeric width/height attributes', () => {
    expect(svgSize(svg('width="320" height="200px" viewBox="0 0 10 10"'))).toEqual({ width: 320, height: 200 });
  });
  it('falls back to viewBox when width/height are relative', () => {
    expect(svgSize(svg('width="100%" height="100%" viewBox="0 0 1200 630"'))).toEqual({ width: 1200, height: 630 });
  });
  it('accepts comma-separated viewBox values', () => {
    expect(svgSize(svg("viewBox='0,0,800,450'"))).toEqual({ width: 800, height: 450 });
  });
  it('returns null with neither', () => {
    expect(svgSize(svg('class="x"'))).toBeNull();
  });
});

describe('webpSize', () => {
  const riff = (chunk: string, body: number[]) =>
    Buffer.from([...Buffer.from('RIFF'), 0, 0, 0, 0, ...Buffer.from('WEBP'), ...Buffer.from(chunk), 0, 0, 0, 0, ...body]);

  it('reads VP8 (lossy)', () => {
    // frame tag (3) + start code 9d 01 2a + 14-bit width/height, little-endian
    const b = riff('VP8 ', [0, 0, 0, 0x9d, 0x01, 0x2a, 0x40, 0x01, 0xf0, 0x00]);
    expect(webpSize(b)).toEqual({ width: 320, height: 240 });
  });
  it('reads VP8L (lossless)', () => {
    // signature 0x2f, then (w-1) 14 bits, (h-1) 14 bits, little-endian bit order
    const w = 400, h = 300;
    const bits = (w - 1) | ((h - 1) << 14);
    const b = riff('VP8L', [0x2f, bits & 0xff, (bits >> 8) & 0xff, (bits >> 16) & 0xff, (bits >>> 24) & 0xff]);
    expect(webpSize(b)).toEqual({ width: 400, height: 300 });
  });
  it('reads VP8X (extended)', () => {
    // flags (4) + (w-1) 24-bit LE + (h-1) 24-bit LE
    const b = riff('VP8X', [0, 0, 0, 0, 0x7f, 0x07, 0x00, 0x75, 0x02, 0x00]);
    expect(webpSize(b)).toEqual({ width: 1920, height: 630 });
  });
  it('returns null for a non-WebP buffer', () => {
    expect(webpSize(Buffer.from('not a webp file at all, really'))).toBeNull();
  });
});

describe('pngSize', () => {
  it('reads IHDR', () => {
    const b = Buffer.alloc(24);
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
    b.writeUInt32BE(13, 8);
    b.write('IHDR', 12, 'ascii');
    b.writeUInt32BE(1200, 16);
    b.writeUInt32BE(630, 20);
    expect(pngSize(b)).toEqual({ width: 1200, height: 630 });
  });
  it('returns null on a bad signature', () => {
    expect(pngSize(Buffer.alloc(24))).toBeNull();
  });
});

describe('jpegSize', () => {
  it('reads the first SOF marker after skipping other segments', () => {
    const b = Buffer.from([
      0xff, 0xd8, // SOI
      0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, // APP0, length 4
      0xff, 0xc0, 0x00, 0x11, 0x08, 0x02, 0x76, 0x04, 0xb0, // SOF0: height 630, width 1200
    ]);
    expect(jpegSize(b)).toEqual({ width: 1200, height: 630 });
  });
  it('returns null on a non-JPEG', () => {
    expect(jpegSize(Buffer.from([0, 1, 2, 3]))).toBeNull();
  });
});

describe('imageSize', () => {
  it('dispatches on extension and returns null for unknown types', () => {
    expect(imageSize(Buffer.from('x'), '.gif')).toBeNull();
  });
});

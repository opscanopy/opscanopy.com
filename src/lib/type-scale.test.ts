/**
 * Type-scale guardrail — keeps component styles on the integer pixel scale.
 *
 * Before 2026-09-19 the site carried 25 distinct font sizes, including 161
 * half-pixel declarations (`12.5px` ×115, `10.5px`, `11.5px`, `13.5px`) that
 * rendered as blurry in-between sizes and made the display/body/caption roles
 * in global.css meaningless. This test walks every `.astro` file under
 * src/components, src/pages and src/layouts and fails on:
 *
 *   - any fractional `font-size` in px (or a `text-[N.5px]` class), and
 *   - any integer `font-size` outside the allowed set below.
 *
 * The allowed set is the empirical post-codemod set; extend it deliberately
 * (with a reason) rather than reaching for a one-off size. The design roles
 * themselves (display-*, body-*, caption, eyebrow, code-mono) live in
 * global.css and are not walked here.
 */

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, relative } from 'node:path';

const SRC = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const ROOTS = ['components', 'pages', 'layouts'].map((d) => join(SRC, d));

/** Integer px sizes component styles may use (minimum 11px for legibility). */
const ALLOWED_PX = new Set([11, 12, 13, 14, 15, 16, 18, 20, 22, 24, 26, 28, 30, 34]);

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (name.endsWith('.astro')) out.push(full);
  }
  return out;
}

const files = ROOTS.flatMap((r) => walk(r));

describe('type scale — component font sizes', () => {
  it('walks a realistic number of .astro files', () => {
    expect(files.length).toBeGreaterThan(100);
  });

  it('has no fractional px font sizes (font-size: N.5px or text-[N.5px])', () => {
    const offenders: string[] = [];
    const re = /(?:font-size:\s*|text-\[)(\d+\.\d+)px/g;
    for (const f of files) {
      const s = readFileSync(f, 'utf-8');
      let m: RegExpExecArray | null;
      while ((m = re.exec(s)) !== null) {
        const line = s.slice(0, m.index).split('\n').length;
        offenders.push(`${relative(SRC, f)}:${line} → ${m[0]}`);
      }
    }
    expect(offenders, `fractional font sizes:\n${offenders.join('\n')}`).toEqual([]);
  });

  it('uses only the allowed integer px font sizes', () => {
    const offenders: string[] = [];
    const re = /(?:font-size:\s*|text-\[)(\d+)px/g;
    for (const f of files) {
      const s = readFileSync(f, 'utf-8');
      let m: RegExpExecArray | null;
      while ((m = re.exec(s)) !== null) {
        const px = Number(m[1]);
        if (!ALLOWED_PX.has(px)) {
          const line = s.slice(0, m.index).split('\n').length;
          offenders.push(`${relative(SRC, f)}:${line} → ${m[0]}`);
        }
      }
    }
    expect(offenders, `off-scale font sizes:\n${offenders.join('\n')}`).toEqual([]);
  });
});

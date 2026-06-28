/**
 * Contrast regression guardrail — WCAG 2.2 AA compliance lock-in.
 *
 * Parses src/styles/global.css at test-time to extract the current light
 * (@theme block) and dark (html[data-theme='dark'] block) color tokens, then
 * asserts that every text-on-background pair that matters for body content
 * meets >= 4.5:1 (WCAG AA, normal text).  A future accidental token edit that
 * silently regresses contrast will be caught here before it ships.
 *
 * No extra npm dependencies — only Node built-ins and vitest.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// CSS parsing helpers
// ---------------------------------------------------------------------------

/**
 * Resolve the path to global.css relative to this test file.
 * This file lives at src/lib/contrast.test.ts, so the CSS is at
 * src/styles/global.css — one directory up from src/lib/, then into styles/.
 */
const CSS_PATH = join(fileURLToPath(new URL('.', import.meta.url)), '../styles/global.css');

function readCss(): string {
  return readFileSync(CSS_PATH, 'utf-8');
}

/**
 * Extract `{ [token]: '#hexvalue' }` from a named CSS block.
 *
 * Matches the block by a leading regex, then scans forward for balanced
 * braces to find its extent.  Inside that range, collects every
 * `--token: #hex;` declaration (3- and 6-digit hex only; no alpha suffixes).
 */
function extractTokensFromBlock(css: string, blockPattern: RegExp): Record<string, string> {
  const startMatch = blockPattern.exec(css);
  if (!startMatch) return {};

  // Walk forward from the opening brace to find the matching closing brace.
  let depth = 0;
  let blockStart = -1;
  let blockEnd = -1;

  for (let i = startMatch.index; i < css.length; i++) {
    if (css[i] === '{') {
      if (depth === 0) blockStart = i;
      depth++;
    } else if (css[i] === '}') {
      depth--;
      if (depth === 0) {
        blockEnd = i;
        break;
      }
    }
  }

  if (blockStart === -1 || blockEnd === -1) return {};

  const block = css.slice(blockStart + 1, blockEnd);

  // Match `--color-foo: #abc123;` or `--color-foo: #abc;`
  const tokenRe = /(--[\w-]+)\s*:\s*(#[0-9a-fA-F]{6}|#[0-9a-fA-F]{3})\s*;/g;
  const tokens: Record<string, string> = {};
  let m: RegExpExecArray | null;

  while ((m = tokenRe.exec(block)) !== null) {
    tokens[m[1]] = m[2].toLowerCase();
  }

  return tokens;
}

/** Expand a 3-digit hex shorthand to 6 digits. */
function expandHex(hex: string): string {
  if (hex.length === 4) {
    // '#rgb' → '#rrggbb'
    return '#' + hex[1] + hex[1] + hex[2] + hex[2] + hex[3] + hex[3];
  }
  return hex;
}

// ---------------------------------------------------------------------------
// WCAG 2.2 contrast math
// ---------------------------------------------------------------------------

/** Convert a single sRGB channel [0..1] to linear light. */
function linearize(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** Relative luminance (WCAG 2.2 §1.4.3 formula). */
function luminance(hex: string): number {
  const h = expandHex(hex).replace('#', '');
  const r = linearize(parseInt(h.slice(0, 2), 16) / 255);
  const g = linearize(parseInt(h.slice(2, 4), 16) / 255);
  const b = linearize(parseInt(h.slice(4, 6), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between any two hex colors. */
function contrastRatio(fg: string, bg: string): number {
  const l1 = luminance(fg);
  const l2 = luminance(bg);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

// ---------------------------------------------------------------------------
// Shared assertion helper
// ---------------------------------------------------------------------------

/** Assert fg-on-bg meets the given minimum ratio; prints the actual ratio on failure. */
function assertContrast(fg: string, bg: string, min: number, label: string): void {
  const ratio = contrastRatio(fg, bg);
  expect(ratio, `${label}: expected >= ${min}:1, got ${ratio.toFixed(2)}:1 (fg=${fg}, bg=${bg})`).toBeGreaterThanOrEqual(min);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('WCAG contrast ratio math', () => {
  it('produces the published 4.54:1 ratio for #767676 on #ffffff (sanity vector)', () => {
    const ratio = contrastRatio('#767676', '#ffffff');
    expect(ratio).toBeGreaterThanOrEqual(4.5);
    expect(ratio).toBeLessThan(4.6);
  });

  it('produces near-21:1 for #000000 on #ffffff', () => {
    const ratio = contrastRatio('#000000', '#ffffff');
    expect(ratio).toBeGreaterThanOrEqual(20.9);
    expect(ratio).toBeLessThanOrEqual(21.1);
  });

  it('produces 1:1 for identical colors', () => {
    expect(contrastRatio('#888888', '#888888')).toBeCloseTo(1, 2);
  });
});

describe('CSS token extraction', () => {
  it('parses at least the expected tokens from the @theme block', () => {
    const css = readCss();
    const light = extractTokensFromBlock(css, /@theme\s*\{/);
    const required = [
      '--color-canvas',
      '--color-canvas-soft',
      '--color-canvas-soft-2',
      '--color-canvas-soft-3',
      '--color-ink',
      '--color-body',
      '--color-mute',
      '--color-brand-strong',
      '--color-link',
    ];
    for (const token of required) {
      expect(light[token], `missing light token ${token}`).toBeDefined();
    }
  });

  it('parses at least the expected tokens from the html[data-theme="dark"] block', () => {
    const css = readCss();
    const dark = extractTokensFromBlock(css, /html\[data-theme=['"]dark['"]\]\s*\{/);
    const required = [
      '--color-canvas',
      '--color-canvas-soft',
      '--color-canvas-soft-2',
      '--color-canvas-soft-3',
      '--color-ink',
      '--color-body',
      '--color-mute',
      '--color-brand-strong',
      '--color-link',
    ];
    for (const token of required) {
      expect(dark[token], `missing dark token ${token}`).toBeDefined();
    }
  });
});

describe('WCAG AA contrast — light theme tokens', () => {
  const css = readCss();
  // Light tokens come from the @theme block; the dark overrides don't apply.
  const light = extractTokensFromBlock(css, /@theme\s*\{/);

  const canvas = () => light['--color-canvas'];
  const canvasSoft3 = () => light['--color-canvas-soft-3'];

  it('body text on main canvas >= 4.5:1 (AA)', () => {
    assertContrast(light['--color-body'], canvas(), 4.5, 'light: body on canvas');
  });

  it('muted text on main canvas >= 4.5:1 (AA)', () => {
    assertContrast(light['--color-mute'], canvas(), 4.5, 'light: mute on canvas');
  });

  it('muted text on deepest canvas step (canvas-soft-3) >= 4.5:1 (AA)', () => {
    assertContrast(light['--color-mute'], canvasSoft3(), 4.5, 'light: mute on canvas-soft-3');
  });

  it('ink (heading/primary text) on canvas >= 7:1 (AAA-level)', () => {
    assertContrast(light['--color-ink'], canvas(), 7, 'light: ink on canvas');
  });

  it('brand-strong on canvas >= 4.5:1 (AA)', () => {
    assertContrast(light['--color-brand-strong'], canvas(), 4.5, 'light: brand-strong on canvas');
  });

  it('link color on canvas >= 4.5:1 (AA)', () => {
    assertContrast(light['--color-link'], canvas(), 4.5, 'light: link on canvas');
  });
});

describe('WCAG AA contrast — dark theme tokens', () => {
  const css = readCss();
  // Dark tokens come from the html[data-theme='dark'] block.
  // Tokens not overridden there fall back to the @theme defaults, but all the
  // tokens we need ARE overridden, so we read only the dark block.
  const dark = extractTokensFromBlock(css, /html\[data-theme=['"]dark['"]\]\s*\{/);

  const canvas = () => dark['--color-canvas'];
  const canvasSoft3 = () => dark['--color-canvas-soft-3'];

  it('body text on main canvas >= 4.5:1 (AA)', () => {
    assertContrast(dark['--color-body'], canvas(), 4.5, 'dark: body on canvas');
  });

  it('muted text on main canvas >= 4.5:1 (AA)', () => {
    assertContrast(dark['--color-mute'], canvas(), 4.5, 'dark: mute on canvas');
  });

  it('muted text on deepest canvas step (canvas-soft-3) >= 4.5:1 (AA)', () => {
    assertContrast(dark['--color-mute'], canvasSoft3(), 4.5, 'dark: mute on canvas-soft-3');
  });

  it('ink (heading/primary text) on canvas >= 7:1 (AAA-level)', () => {
    assertContrast(dark['--color-ink'], canvas(), 7, 'dark: ink on canvas');
  });

  it('brand-strong on canvas >= 4.5:1 (AA)', () => {
    assertContrast(dark['--color-brand-strong'], canvas(), 4.5, 'dark: brand-strong on canvas');
  });

  it('link color on canvas >= 4.5:1 (AA)', () => {
    assertContrast(dark['--color-link'], canvas(), 4.5, 'dark: link on canvas');
  });
});

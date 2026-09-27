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
import { categories, categoryHue, categoryToSlug } from '../data/tools';

// ---------------------------------------------------------------------------
// CSS parsing helpers
// ---------------------------------------------------------------------------

/**
 * Resolve the path to global.css relative to this test file.
 * This file lives at src/lib/contrast.test.ts, so the CSS is at
 * src/styles/global.css — one directory up from src/lib/, then into styles/.
 */
/** The light block is `@theme static { … }` (static: emit every token). */
const THEME_BLOCK = /@theme(?:\s+static)?\s*\{/;

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

/** CIE L* (perceptual lightness, 0–100) from relative luminance, D65 white. */
function cielabL(hex: string): number {
  const y = luminance(hex);
  return y > 0.008856 ? 116 * Math.cbrt(y) - 16 : 903.3 * y;
}

/**
 * The surface ladder must read as tiers, not one sheet: every adjacent step in
 * canvas → canvas-soft → canvas-soft-2 → canvas-soft-3 is >= minStep L* apart
 * and the sequence is monotonic (paper gets darker, charcoal gets lighter).
 * `card` is checked separately against canvas-soft (the body background) — it
 * deliberately sits between steps in the dark theme.
 */
function assertLadder(tokens: Record<string, string>, direction: 'darker' | 'lighter', minStep: number, label: string): void {
  const chain = ['--color-canvas', '--color-canvas-soft', '--color-canvas-soft-2', '--color-canvas-soft-3'];
  const ls = chain.map((t) => cielabL(tokens[t]));
  for (let i = 1; i < ls.length; i++) {
    const delta = direction === 'darker' ? ls[i - 1] - ls[i] : ls[i] - ls[i - 1];
    expect(
      delta,
      `${label}: ${chain[i - 1]} → ${chain[i]} should step ${direction} by >= ${minStep} L*, got ${delta.toFixed(2)}`,
    ).toBeGreaterThanOrEqual(minStep);
  }
  const cardDelta = Math.abs(cielabL(tokens['--color-card']) - cielabL(tokens['--color-canvas-soft']));
  expect(cardDelta, `${label}: card vs canvas-soft (body) should differ by >= ${minStep} L*, got ${cardDelta.toFixed(2)}`).toBeGreaterThanOrEqual(minStep);
}

/**
 * The footer surface is off-ladder on purpose (in dark it steps DOWN from the
 * body while the ladder climbs), so it gets its own two-sided check: it must
 * read as its own band against the body it follows (canvas-soft), AND the
 * colophon plate — an `.instrument` slab, `--color-inverse` — must stand clear
 * of it. Returns failure messages rather than asserting, so the gate itself can
 * be proven to fail (see the regression test that feeds it the old value).
 */
function footerLadderFailures(tokens: Record<string, string>, minStep: number, label: string): string[] {
  const failures: string[] = [];
  const footer = tokens['--color-footer'];
  if (!footer) return [`${label}: --color-footer is missing`];
  const pairs: [string, string][] = [
    ['--color-footer', '--color-canvas-soft'],
    ['--color-inverse', '--color-footer'],
  ];
  for (const [a, b] of pairs) {
    const delta = Math.abs(cielabL(tokens[a]) - cielabL(tokens[b]));
    if (delta < minStep) {
      failures.push(`${label}: ${a} vs ${b} should differ by >= ${minStep} L*, got ${delta.toFixed(2)}`);
    }
  }
  return failures;
}

/** Ink tokens the footer sets text in (links, captions, titles, the phone colophon line). */
const FOOTER_INKS = ['--color-body', '--color-mute', '--color-brand-strong', '--color-link'] as const;

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

// Shiki's github-dark comment ink is an inline style, not a token, so the
// override in global.css is pinned here as a literal pair.
describe('WCAG AA contrast — Shiki code-block comments (pinned pair)', () => {
  it('comment override #959da5 on github-dark #24292e >= 4.5:1 (AA)', () => {
    assertContrast('#959da5', '#24292e', 4.5, 'shiki comment on github-dark');
  });

  it('global.css still carries the override for the #6A737D comment span', () => {
    expect(readCss()).toMatch(/\.astro-code span\[style\*='#6A737D' i\]\s*\{\s*color:\s*#959da5 !important;/);
  });
});

describe('CSS token extraction', () => {
  it('parses at least the expected tokens from the @theme block', () => {
    const css = readCss();
    const light = extractTokensFromBlock(css, THEME_BLOCK);
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
      // JWT status surfaces (pill/banner/active tab) — gated pairs below rely
      // on these; keep them present in both theme blocks.
      '--color-brand',
      '--color-brand-soft',
      '--color-error',
      '--color-error-soft',
      '--color-error-deep',
      '--color-warning',
      '--color-warning-soft',
      '--color-warning-deep',
      '--color-primary',
      '--color-on-primary',
      // Dark-stable slab inks — the instrument-slab rule in DESIGN.md.
      '--color-inverse',
      '--color-inverse-fg',
      '--color-inverse-brand',
      '--color-inverse-accent',
      '--color-inverse-mute',
      '--color-inverse-error',
      '--color-card',
      // Footer surface + its hover step (the colophon footer).
      '--color-footer',
      '--color-footer-hover',
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
      // JWT status surfaces (pill/banner/active tab) — gated pairs below rely
      // on these; keep them present in both theme blocks.
      '--color-brand',
      '--color-brand-soft',
      '--color-error',
      '--color-error-soft',
      '--color-error-deep',
      '--color-warning',
      '--color-warning-soft',
      '--color-warning-deep',
      '--color-primary',
      '--color-on-primary',
      // Dark-stable slab inks — the instrument-slab rule in DESIGN.md.
      '--color-inverse',
      '--color-inverse-fg',
      '--color-inverse-brand',
      '--color-inverse-accent',
      '--color-inverse-mute',
      '--color-inverse-error',
      '--color-card',
      // Footer surface + its hover step (the colophon footer).
      '--color-footer',
      '--color-footer-hover',
    ];
    for (const token of required) {
      expect(dark[token], `missing dark token ${token}`).toBeDefined();
    }
  });
});

describe('WCAG AA contrast — light theme tokens', () => {
  const css = readCss();
  // Light tokens come from the @theme block; the dark overrides don't apply.
  const light = extractTokensFromBlock(css, THEME_BLOCK);

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

  // Field-Manual additions: amber annotation ink must be legible as text on the
  // warm canvas, and the dark "instrument slab" (inverse surface, rendered in
  // BOTH themes) must carry legible body/heading text.
  it('accent-ink (amber) on canvas >= 4.5:1 (AA)', () => {
    assertContrast(light['--color-accent-ink'], canvas(), 4.5, 'light: accent-ink on canvas');
  });

  it('inverse-fg on inverse slab >= 4.5:1 (AA, dark slab in light theme)', () => {
    assertContrast(light['--color-inverse-fg'], light['--color-inverse'], 4.5, 'light: inverse-fg on inverse');
  });

  // The slab's accent inks. This is the pair that was missing: accent-ink and
  // brand were only ever gated against the canvas, so the light-theme amber
  // (#a85a06, 3.45:1) and leaf (#4a8c3f, 4.27:1) sat below AA on the charcoal
  // slab in HeroDemo, TerminalPlay, ErrorTerminal and the homepage Mission 90
  // band without any test noticing.
  it('inverse-accent (amber) on inverse slab >= 4.5:1 (AA)', () => {
    assertContrast(light['--color-inverse-accent'], light['--color-inverse'], 4.5, 'light: inverse-accent on inverse');
  });

  it('inverse-brand (leaf) on inverse slab >= 4.5:1 (AA)', () => {
    assertContrast(light['--color-inverse-brand'], light['--color-inverse'], 4.5, 'light: inverse-brand on inverse');
  });

  it('inverse-mute (slab caption) on inverse slab >= 4.5:1 (AA)', () => {
    assertContrast(light['--color-inverse-mute'], light['--color-inverse'], 4.5, 'light: inverse-mute on inverse');
  });

  it('inverse-error on inverse slab >= 4.5:1 (AA)', () => {
    assertContrast(light['--color-inverse-error'], light['--color-inverse'], 4.5, 'light: inverse-error on inverse');
  });

  // Surface ladder — widened on 2026-09-19 (card had sat 0.37 L* off canvas).
  it('body text on canvas-soft-3 >= 4.5:1 (AA)', () => {
    assertContrast(light['--color-body'], canvasSoft3(), 4.5, 'light: body on canvas-soft-3');
  });
  it('ink on card >= 7:1 (AAA-level)', () => {
    assertContrast(light['--color-ink'], light['--color-card'], 7, 'light: ink on card');
  });
  it('accent-ink (amber) on canvas-soft >= 4.5:1 (AA)', () => {
    assertContrast(light['--color-accent-ink'], light['--color-canvas-soft'], 4.5, 'light: accent-ink on canvas-soft');
  });
  it('surface ladder steps >= 3 L* and gets darker', () => {
    assertLadder(light, 'darker', 3, 'light');
  });

  // JWT playground status surfaces (validity pill, trust banner, verify
  // badges): each *-deep/-strong text tone on its *-soft fill must be AA.
  it('brand-strong on brand-soft >= 4.5:1 (AA — pill/banner valid state)', () => {
    assertContrast(light['--color-brand-strong'], light['--color-brand-soft'], 4.5, 'light: brand-strong on brand-soft');
  });
  it('error-deep on error-soft >= 4.5:1 (AA — pill expired state)', () => {
    assertContrast(light['--color-error-deep'], light['--color-error-soft'], 4.5, 'light: error-deep on error-soft');
  });
  it('warning-deep on warning-soft >= 4.5:1 (AA — pill not-yet state)', () => {
    assertContrast(light['--color-warning-deep'], light['--color-warning-soft'], 4.5, 'light: warning-deep on warning-soft');
  });
  it('mute on canvas-soft >= 4.5:1 (AA — pill none state / results column)', () => {
    assertContrast(light['--color-mute'], light['--color-canvas-soft'], 4.5, 'light: mute on canvas-soft');
  });
  it('on-primary on primary >= 4.5:1 (AA — active mode tab text)', () => {
    assertContrast(light['--color-on-primary'], light['--color-primary'], 4.5, 'light: on-primary on primary');
  });

  // SC 1.4.11 non-text contrast (first 3:1 tier in this file): pill/banner
  // rings against the results column fill, and the active-tab boundary.
  it('brand ring on canvas-soft >= 3:1 (UI component)', () => {
    assertContrast(light['--color-brand'], light['--color-canvas-soft'], 3, 'light: brand ring on canvas-soft');
  });
  it('error ring on canvas-soft >= 3:1 (UI component)', () => {
    assertContrast(light['--color-error'], light['--color-canvas-soft'], 3, 'light: error ring on canvas-soft');
  });
  it('warning ring on canvas-soft >= 3:1 (UI component)', () => {
    assertContrast(light['--color-warning'], light['--color-canvas-soft'], 3, 'light: warning ring on canvas-soft');
  });
  it('primary (active tab fill) on canvas >= 3:1 (UI component)', () => {
    assertContrast(light['--color-primary'], light['--color-canvas'], 3, 'light: primary on canvas');
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

  it('accent-ink (amber) on canvas >= 4.5:1 (AA)', () => {
    assertContrast(dark['--color-accent-ink'], canvas(), 4.5, 'dark: accent-ink on canvas');
  });

  it('inverse-fg on inverse slab >= 4.5:1 (AA)', () => {
    assertContrast(dark['--color-inverse-fg'], dark['--color-inverse'], 4.5, 'dark: inverse-fg on inverse');
  });

  // See the light-theme block: the slab is dark in both themes, so these two
  // must hold in both. They are declared with the same values on purpose.
  it('inverse-accent (amber) on inverse slab >= 4.5:1 (AA)', () => {
    assertContrast(dark['--color-inverse-accent'], dark['--color-inverse'], 4.5, 'dark: inverse-accent on inverse');
  });

  it('inverse-brand (leaf) on inverse slab >= 4.5:1 (AA)', () => {
    assertContrast(dark['--color-inverse-brand'], dark['--color-inverse'], 4.5, 'dark: inverse-brand on inverse');
  });

  it('inverse-mute (slab caption) on inverse slab >= 4.5:1 (AA)', () => {
    assertContrast(dark['--color-inverse-mute'], dark['--color-inverse'], 4.5, 'dark: inverse-mute on inverse');
  });

  it('inverse-error on inverse slab >= 4.5:1 (AA)', () => {
    assertContrast(dark['--color-inverse-error'], dark['--color-inverse'], 4.5, 'dark: inverse-error on inverse');
  });

  it('body text on canvas-soft-3 >= 4.5:1 (AA)', () => {
    assertContrast(dark['--color-body'], canvasSoft3(), 4.5, 'dark: body on canvas-soft-3');
  });
  it('ink on card >= 7:1 (AAA-level)', () => {
    assertContrast(dark['--color-ink'], dark['--color-card'], 7, 'dark: ink on card');
  });
  it('accent-ink (amber) on canvas-soft >= 4.5:1 (AA)', () => {
    assertContrast(dark['--color-accent-ink'], dark['--color-canvas-soft'], 4.5, 'dark: accent-ink on canvas-soft');
  });
  it('surface ladder steps >= 3 L* and gets lighter', () => {
    assertLadder(dark, 'lighter', 3, 'dark');
  });

  // JWT playground status surfaces — see the light-theme block for rationale.
  it('brand-strong on brand-soft >= 4.5:1 (AA — pill/banner valid state)', () => {
    assertContrast(dark['--color-brand-strong'], dark['--color-brand-soft'], 4.5, 'dark: brand-strong on brand-soft');
  });
  it('error-deep on error-soft >= 4.5:1 (AA — pill expired state)', () => {
    assertContrast(dark['--color-error-deep'], dark['--color-error-soft'], 4.5, 'dark: error-deep on error-soft');
  });
  it('warning-deep on warning-soft >= 4.5:1 (AA — pill not-yet state)', () => {
    assertContrast(dark['--color-warning-deep'], dark['--color-warning-soft'], 4.5, 'dark: warning-deep on warning-soft');
  });
  it('mute on canvas-soft >= 4.5:1 (AA — pill none state / results column)', () => {
    assertContrast(dark['--color-mute'], dark['--color-canvas-soft'], 4.5, 'dark: mute on canvas-soft');
  });
  it('on-primary on primary >= 4.5:1 (AA — active mode tab text)', () => {
    assertContrast(dark['--color-on-primary'], dark['--color-primary'], 4.5, 'dark: on-primary on primary');
  });

  it('brand ring on canvas-soft >= 3:1 (UI component)', () => {
    assertContrast(dark['--color-brand'], dark['--color-canvas-soft'], 3, 'dark: brand ring on canvas-soft');
  });
  it('error ring on canvas-soft >= 3:1 (UI component)', () => {
    assertContrast(dark['--color-error'], dark['--color-canvas-soft'], 3, 'dark: error ring on canvas-soft');
  });
  it('warning ring on canvas-soft >= 3:1 (UI component)', () => {
    assertContrast(dark['--color-warning'], dark['--color-canvas-soft'], 3, 'dark: warning ring on canvas-soft');
  });
  it('primary (active tab fill) on canvas >= 3:1 (UI component)', () => {
    assertContrast(dark['--color-primary'], dark['--color-canvas'], 3, 'dark: primary on canvas');
  });
});

// ---------------------------------------------------------------------------
// Footer surface — `--color-footer` / `--color-footer-hover` (bg-footer,
// bg-footer-hover). The footer carries the colophon plate, a dark `.instrument`
// slab, in BOTH themes. Until 2026-09-27 the plan had it on canvas-soft-2, which
// in dark sits 2.5 L* (1.07:1) from the slab: the plate vanished into the band.
// ---------------------------------------------------------------------------

describe('Footer surface', () => {
  const css = readCss();
  const light = extractTokensFromBlock(css, THEME_BLOCK);
  const dark = extractTokensFromBlock(css, /html\[data-theme=['"]dark['"]\]\s*\{/);
  const themes = [
    ['light', light],
    ['dark', dark],
  ] as const;

  for (const [name, tokens] of themes) {
    it(`${name}: footer reads as its own band (vs canvas-soft) and the slab stands clear of it (>= 3 L*)`, () => {
      expect(footerLadderFailures(tokens, 3, name)).toEqual([]);
    });

    it(`${name}: body / mute / brand-strong / link on footer >= 4.5:1 (AA)`, () => {
      for (const ink of FOOTER_INKS) {
        assertContrast(tokens[ink], tokens['--color-footer'], 4.5, `${name}: ${ink} on footer`);
      }
    });

    it(`${name}: ink (current-page link) on footer >= 7:1 (AAA-level)`, () => {
      assertContrast(tokens['--color-ink'], tokens['--color-footer'], 7, `${name}: ink on footer`);
    });

    // The hovered control (language-switcher summary, theme toggle) keeps its
    // text legible on the hover step, and the step is visible against the band.
    it(`${name}: body and ink on footer-hover >= 4.5:1, and the hover step is >= 3 L* off the footer`, () => {
      assertContrast(tokens['--color-body'], tokens['--color-footer-hover'], 4.5, `${name}: body on footer-hover`);
      assertContrast(tokens['--color-ink'], tokens['--color-footer-hover'], 4.5, `${name}: ink on footer-hover`);
      const delta = Math.abs(cielabL(tokens['--color-footer-hover']) - cielabL(tokens['--color-footer']));
      expect(delta, `${name}: footer-hover vs footer, got ${delta.toFixed(2)} L*`).toBeGreaterThanOrEqual(3);
    });
  }

  // The hover step is defined as the neighbouring ladder value, written as a
  // literal hex because this parser (and the token rule) reads hex only. Pin
  // the equality so a ladder edit cannot silently orphan it.
  it('footer-hover equals canvas-soft-3 (light) and canvas-soft-2 (dark)', () => {
    expect(light['--color-footer-hover']).toBe(light['--color-canvas-soft-3']);
    expect(dark['--color-footer-hover']).toBe(dark['--color-canvas-soft-2']);
  });

  // Proof the gate can fail: fed the value the footer was going to use (dark
  // canvas-soft-2, 1.07:1 against the slab) it must reject it — and for the
  // slab reason specifically, since soft-2 vs the body is a legal 4.5 L* step.
  it('rejects the old dark footer value (canvas-soft-2): the slab would vanish', () => {
    const old: Record<string, string> = { ...dark, '--color-footer': dark['--color-canvas-soft-2'] };
    expect(contrastRatio(old['--color-inverse'], old['--color-footer'])).toBeLessThan(1.1);
    const failures = footerLadderFailures(old, 3, 'dark (old)');
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain('--color-inverse vs --color-footer');
  });

  // The footer language switcher's upward menu (LangSwitcher variant="footer")
  // covers the footer band, so its fill must step off the band. It is a card,
  // not the header menu's canvas: dark --color-footer IS canvas's value, so a
  // canvas menu had no fill edge at all. Its option hover is soft-3, because
  // soft-2 is ~1 L* off the dark card.
  for (const [name, tokens] of themes) {
    it(`${name}: footer lang menu (card) stands >= 3 L* off the footer, its hover (soft-3) >= 3 L* off the card, text AA on both`, () => {
      const menu = Math.abs(cielabL(tokens['--color-card']) - cielabL(tokens['--color-footer']));
      expect(menu, `${name}: card menu vs footer, got ${menu.toFixed(2)} L*`).toBeGreaterThanOrEqual(3);
      const hover = Math.abs(cielabL(tokens['--color-canvas-soft-3']) - cielabL(tokens['--color-card']));
      expect(hover, `${name}: soft-3 hover vs card menu, got ${hover.toFixed(2)} L*`).toBeGreaterThanOrEqual(3);
      for (const bg of ['--color-card', '--color-canvas-soft-3']) {
        assertContrast(tokens['--color-body'], tokens[bg], 4.5, `${name}: body on ${bg} (lang menu)`);
        assertContrast(tokens['--color-ink'], tokens[bg], 4.5, `${name}: ink on ${bg} (lang menu)`);
      }
    });
  }

  it('rejects the header menu surface (canvas) and hover (soft-2) for the footer menu in dark', () => {
    const canvasStep = Math.abs(cielabL(dark['--color-canvas']) - cielabL(dark['--color-footer']));
    expect(canvasStep).toBeLessThan(3);
    const soft2Step = Math.abs(cielabL(dark['--color-canvas-soft-2']) - cielabL(dark['--color-card']));
    expect(soft2Step).toBeLessThan(3);
  });

  it('reports a missing footer token instead of passing vacuously', () => {
    const without = Object.fromEntries(Object.entries(light).filter(([k]) => k !== '--color-footer'));
    expect(footerLadderFailures(without, 3, 'light')).toEqual(['light: --color-footer is missing']);
  });

  // Amber is NOT legal on the footer: light accent-ink (#a85a06) is 4.12:1 on
  // the #ebe7de band, below AA, and none of amber's four jobs (figure numbers,
  // the changed-value tick, warm progress fills, Badge "new") lives there. The
  // plate's own inks are the inverse tier. Pinned as a source check on the two
  // footer components rather than as a ratio, so a future amber tweak that
  // happens to pass AA still has to lift this rule deliberately.
  it('the footer components never reference accent-ink', () => {
    const AMBER = /accent-ink|highlight-pink/;
    // Self-test the pattern so the scan cannot pass vacuously.
    expect('class="text-accent-ink"').toMatch(AMBER);
    expect('color: var(--color-highlight-pink)').toMatch(AMBER);
    expect('class="text-inverse-accent"').not.toMatch(AMBER);
    for (const rel of ['../components/Footer.astro', '../components/FooterColophon.astro']) {
      const path = join(fileURLToPath(new URL('.', import.meta.url)), rel);
      // Drop comments first: the colophon's doc comment names the rule itself.
      const src = readFileSync(path, 'utf-8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
        .replace(/<!--[\s\S]*?-->/g, '');
      expect(src.length, `${rel} read as empty`).toBeGreaterThan(200);
      expect(src, `${rel} uses accent-ink (amber) on the footer surface`).not.toMatch(AMBER);
    }
  });
});

// ---------------------------------------------------------------------------
// Focus ring on a slab. The base :focus-visible ring is --color-link; in the
// light theme that is 2.54:1 on the charcoal slab, below SC 1.4.11's 3:1. The
// `.instrument :focus-visible` rule in global.css repaints it in slab leaf.
// That rule sits in @layer components, and the playgrounds' own rings are
// unlayered scoped rules that set the full `outline` shorthand, so it only
// wins because it is `!important` (layered important beats every normal
// declaration). Pinned as a source check: dropping the `!important` passes
// every ratio yet silently puts the 2.54:1 ring back on the result panels.
// ---------------------------------------------------------------------------

describe('Slab focus ring', () => {
  const css = readCss();
  const light = extractTokensFromBlock(css, THEME_BLOCK);
  const dark = extractTokensFromBlock(css, /html\[data-theme=['"]dark['"]\]\s*\{/);

  it('the base ring (link) fails 3:1 on the light slab — the reason the rule exists', () => {
    expect(contrastRatio(light['--color-link'], light['--color-inverse'])).toBeLessThan(3);
  });

  it('inverse-brand ring on the slab >= 3:1 in both themes (UI component)', () => {
    assertContrast(light['--color-inverse-brand'], light['--color-inverse'], 3, 'light: slab ring');
    assertContrast(dark['--color-inverse-brand'], dark['--color-inverse'], 3, 'dark: slab ring');
  });

  it('global.css repaints descendants of both slab classes with !important', () => {
    const RULE =
      /\.instrument\s+:focus-visible\s*,\s*\.instrument-flush\s+:focus-visible\s*\{\s*outline-color:\s*var\(--color-inverse-brand\)\s*!important\s*;?\s*\}/;
    // Self-test the pattern so the source check cannot pass vacuously.
    expect('.instrument :focus-visible,\n.instrument-flush :focus-visible {\n  outline-color: var(--color-inverse-brand) !important;\n}').toMatch(RULE);
    expect('.instrument :focus-visible,\n.instrument-flush :focus-visible {\n  outline-color: var(--color-inverse-brand);\n}').not.toMatch(RULE);
    expect(css).toMatch(RULE);
  });

  // Markdown code blocks (Shiki github-dark, #24292e in both themes) carry an
  // injected copy button; the base link ring there was 2.12:1.
  it('Shiki code-block controls get the slab ring (>= 3:1 on #24292e)', () => {
    const SHIKI_BG = '#24292e';
    expect(contrastRatio(light['--color-link'], SHIKI_BG)).toBeLessThan(3);
    assertContrast(light['--color-inverse-brand'], SHIKI_BG, 3, 'code-block ring');
    const RULE = /\.rich-text\s+pre\s+:focus-visible\s*\{\s*outline-color:\s*var\(--color-inverse-brand\)\s*!important\s*;?\s*\}/;
    expect('.rich-text pre :focus-visible {\n  outline-color: var(--color-inverse-brand) !important;\n}').toMatch(RULE);
    expect('.rich-text pre :focus-visible {\n  outline-color: var(--color-link);\n}').not.toMatch(RULE);
    expect(css).toMatch(RULE);
  });
});

// ---------------------------------------------------------------------------
// Category hues — `--color-cat-<slug>` tokens (dots + 8% art tint, never text).
// The registry map `categoryHue` in src/data/tools.ts is the source of truth
// (the OG generator reads its hex); the CSS tokens must equal it, exist in BOTH
// theme blocks for every live category, and clear SC 1.4.11's 3:1 non-text bar
// on the two surfaces the dot actually sits on (card, canvas-soft).
// ---------------------------------------------------------------------------

describe('Category hue tokens', () => {
  const css = readCss();
  const light = extractTokensFromBlock(css, THEME_BLOCK);
  const dark = extractTokensFromBlock(css, /html\[data-theme=['"]dark['"]\]\s*\{/);

  it('every live category has a hue in the registry map', () => {
    for (const c of categories) {
      expect(categoryHue[c.category], `categoryHue missing "${c.category}"`).toBeDefined();
    }
  });

  for (const category of Object.keys(categoryHue)) {
    const token = `--color-cat-${categoryToSlug(category)}`;

    it(`${token} exists in both theme blocks and matches categoryHue`, () => {
      expect(light[token], `missing light token ${token}`).toBeDefined();
      expect(dark[token], `missing dark token ${token}`).toBeDefined();
      expect(light[token]).toBe(categoryHue[category].light.toLowerCase());
      expect(dark[token]).toBe(categoryHue[category].dark.toLowerCase());
    });

    it(`${token} >= 3:1 on card and canvas-soft in both themes`, () => {
      assertContrast(light[token], light['--color-card'], 3, `light: ${token} on card`);
      assertContrast(light[token], light['--color-canvas-soft'], 3, `light: ${token} on canvas-soft`);
      assertContrast(dark[token], dark['--color-card'], 3, `dark: ${token} on card`);
      assertContrast(dark[token], dark['--color-canvas-soft'], 3, `dark: ${token} on canvas-soft`);
    });
  }

  it('hues sit at one perceptual lightness per theme (spread <= 4 L*)', () => {
    const spread = (pick: 'light' | 'dark') => {
      const ls = Object.values(categoryHue).map((h) => cielabL(h[pick]));
      return Math.max(...ls) - Math.min(...ls);
    };
    expect(spread('light'), 'light-tier L* spread').toBeLessThanOrEqual(4);
    expect(spread('dark'), 'dark-tier L* spread').toBeLessThanOrEqual(4);
  });
});

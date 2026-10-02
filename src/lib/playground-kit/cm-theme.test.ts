/**
 * cm-theme.ts — the CodeMirror plate reads the one code palette, and nothing else.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { tags as t } from '@lezer/highlight';
import { CODE_PALETTE } from '../code-palette';
import { plateThemeSpec, plateHighlightSpecs, plateTheme, plateHighlight, plate } from './cm-theme';

const HEX = /#[0-9a-f]{3,8}\b/gi;
const paletteHex = new Set(Object.values(CODE_PALETTE).map((h) => h.toLowerCase()));
/** Translucent overlays (selection / active line / search) are allowed in the theme: tints of palette inks or white. */
const OVERLAY = /^#(?:ffffff|8fc97a|e0a458)[0-9a-f]{2}$/i;

describe('cm-theme', () => {
  it('builds the extensions', () => {
    expect(plateTheme).toBeTruthy();
    expect(plateHighlight).toBeTruthy();
    expect(plate).toEqual([plateTheme, plateHighlight]);
  });

  it('paints the editor on the plate TOKEN, not a literal, and never sets the focus outline', () => {
    expect(plateThemeSpec['&'].backgroundColor).toBe('var(--color-inverse)');
    expect(plateThemeSpec['&'].color).toBe(CODE_PALETTE.fg);
    expect(plateThemeSpec['.cm-gutters'].backgroundColor).toBe('var(--color-inverse)');
    // global.css owns the focus ring (`!important`, beats CodeMirror's unlayered dotted outline).
    expect(Object.keys(plateThemeSpec).some((k) => k.includes('cm-focused') && !k.includes('selection'))).toBe(false);
    expect(JSON.stringify(plateThemeSpec)).not.toMatch(/"outline":"[^"]*dotted/);
  });

  it('every hex in the theme spec is a palette ink or a declared translucent overlay', () => {
    const stray = (JSON.stringify(plateThemeSpec).match(HEX) ?? []).filter((h) => !paletteHex.has(h.toLowerCase()) && !OVERLAY.test(h));
    expect(stray).toEqual([]);
  });

  it('every highlight colour is a palette ink (or the slab error token); no category hue', () => {
    for (const s of plateHighlightSpecs) {
      const c = (s as { color?: string }).color;
      if (c === undefined) continue;
      expect(paletteHex.has(c.toLowerCase()) || c === 'var(--color-inverse-error)', `${c}`).toBe(true);
    }
    // #7fb6ee is dark --color-cat-networking: rejected for syntax by the plan.
    const colours = plateHighlightSpecs.map((s) => (s as { color?: string }).color ?? '').join(' ');
    expect(colours).not.toMatch(/7fb6ee/i);
  });

  it('maps the roles the Shiki theme uses: keyword amber, string leaf, number violet, comment mute italic', () => {
    const colourOf = (tag: unknown) => plateHighlightSpecs.find((s) => ([] as unknown[]).concat(s.tag).includes(tag));
    expect(colourOf(t.keyword)?.color).toBe(CODE_PALETTE.amber);
    expect(colourOf(t.string)?.color).toBe(CODE_PALETTE.brand);
    expect(colourOf(t.number)?.color).toBe(CODE_PALETTE.violet);
    expect(colourOf(t.bool)?.color).toBe(CODE_PALETTE.violet);
    expect(colourOf(t.propertyName)?.color).toBe(CODE_PALETTE.key);
    expect(colourOf(t.comment)).toMatchObject({ color: CODE_PALETTE.mute, fontStyle: 'italic' });
    expect(colourOf(t.punctuation)?.color).toBe(CODE_PALETTE.mute);
  });

  it('no spec names an undefined tag (a typo in a tag name would silently drop a rule)', () => {
    for (const s of plateHighlightSpecs) for (const tag of ([] as unknown[]).concat(s.tag)) expect(tag).toBeTruthy();
  });

  it('code-palette.ts is the shared, byte-pinned table (the code-prose stream ships the same file)', () => {
    const src = readFileSync(fileURLToPath(new URL('../code-palette.ts', import.meta.url)), 'utf-8');
    expect(src).toContain("bg: '#1b1915',");
    expect(Object.keys(CODE_PALETTE)).toEqual(['bg', 'fg', 'mute', 'brand', 'amber', 'violet', 'key']);
  });
});

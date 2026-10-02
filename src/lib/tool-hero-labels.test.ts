/**
 * ToolHero label chrome — the pin button is a field label, so it takes the L2
 * `label-field` role (mono 11/16, `var(--tracking-label)`, uppercase, mute) from
 * global.css rather than its own `font-mono text-[11px] uppercase
 * tracking-wide` stack. Label roles differ by colour, weight and box, never by
 * tracking, and uppercase lives only in `eyebrow` / `label-field`
 * (global.css "LABEL ROLES"). Batch C's `tokens` gate generalises this rule to
 * every component; this pins ToolHero now.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const src = readFileSync(
  fileURLToPath(new URL('../components/ToolHero.astro', import.meta.url)),
  'utf8',
);
const classTokens = [...src.matchAll(/class="([^"]*)"/g)].flatMap((m) => m[1].split(/\s+/));

describe('ToolHero label roles', () => {
  it('the pin button uses the label-field role', () => {
    const pin = src.match(/<button[^>]*id="tool-pin-btn"[^>]*>/s)?.[0] ?? '';
    expect(pin, 'pin button not found').not.toBe('');
    const cls = pin.match(/class="([^"]*)"/)?.[1].split(/\s+/) ?? [];
    expect(cls).toContain('label-field');
    // label-field already sets these; restating them would fork the role.
    for (const t of ['font-mono', 'uppercase', 'text-mute', 'text-[11px]']) {
      expect(cls, t).not.toContain(t);
    }
  });

  it('carries no raw tracking utility or uppercase class', () => {
    expect(classTokens.filter((t) => /(^|:)tracking-/.test(t))).toEqual([]);
    expect(classTokens.filter((t) => /(^|:)uppercase$/.test(t))).toEqual([]);
  });

  it('the role it relies on resolves tracking through the token', () => {
    const css = readFileSync(
      fileURLToPath(new URL('../styles/global.css', import.meta.url)),
      'utf8',
    );
    const rule = css.match(/@utility label-field\s*\{[^}]*\}/)?.[0] ?? '';
    expect(rule).toMatch(/letter-spacing:\s*var\(--tracking-label\)/);
    expect(rule).toMatch(/text-transform:\s*uppercase/);
  });
});

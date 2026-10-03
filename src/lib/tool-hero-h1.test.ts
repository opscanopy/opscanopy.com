/**
 * ToolHero H1 — the visual split must not change the H1's text (batch D).
 *
 * Since batch D the H1 renders as two block spans: `<name>:` on a display-lg
 * line and the page's `headline` slot on a body-lg line. Google reads the
 * H1's textContent, and the SEO guard compares the whitespace-collapsed H1 of
 * all 195 tool pages against the baseline, so the text between the two spans
 * must stay exactly ": " — "Subnet Calculator: Subnet any IPv4 or IPv6 block
 * at a glance." The separator is the JSX expression `{' '}` (a text node Astro
 * always emits), never a literal newline between the two tags: whether
 * `compressHTML: true` keeps tag-to-tag whitespace is not promised, and a
 * dropped space would merge the name and the headline into one word on every
 * page ("Calculator:Subnet").
 *
 * Two layers: the source assertion pins the exact markup, and a minimal
 * renderer of that fragment proves its text; when a build exists (`dist/`),
 * the built English and German pages are checked the way the guard reads them.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { findBlocks, textContent, collapseWs } from '../../scripts/html-block.mjs';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..');
const src = readFileSync(join(ROOT, 'src/components/ToolHero.astro'), 'utf8');

/** The H1 fragment rendered when a registered tool is known (`h1Name` set). */
function h1Fragment(): string {
  const m = src.match(/h1Name \? \(\s*<>([\s\S]*?)<\/>/);
  expect(m, 'ToolHero: the `h1Name ? (<>…</>)` fragment was not found').not.toBeNull();
  return m![1];
}

/**
 * Render the fragment the way Astro's compiler does for these constructs only:
 * `{h1Name}` → the name, `{' '}` → one space, `<slot name="headline" />` → the
 * slot content; every other `{…}` expression would be a test failure (the
 * fragment must stay this simple).
 */
function render(fragment: string, name: string, headline: string): string {
  // Worst case first: every whitespace-only run containing a line break that
  // sits between two tags/expressions is dropped (a tag-to-tag space is not
  // promised by compressHTML), so only the explicit `{' '}` can separate them.
  let out = fragment.replace(/([>}])[ \t]*\n\s*(?=[<{])/g, '$1');
  out = out.replace(/\{h1Name\}/g, name).replace(/\{' '\}/g, ' ').replace(/<slot name="headline" \/>/g, headline);
  expect(out, 'unexpected expression in the H1 fragment').not.toMatch(/\{[^}]*\}/);
  return out;
}

describe('ToolHero H1 split', () => {
  it('keeps "<name>:" then the JSX {\' \'} separator then the headline span, with no literal newline between the spans', () => {
    const frag = h1Fragment();
    // `{' '}` is glued to the name span's close; only whitespace may follow it before the headline span.
    expect(frag).toMatch(/<span class="block display-lg">\{h1Name\}:<\/span>\{' '\}\s*<span class="tool-hero__headline block body-lg mt-2 text-body"><slot name="headline" \/><\/span>/);
    expect(frag, 'a literal line break between the two spans is not a text node').not.toMatch(/<\/span>\s*\n\s*<span/);
  });

  it('renders to textContent "<name>: <headline>"', () => {
    const html = render(h1Fragment(), 'Subnet Calculator', 'Subnet any IPv4 or IPv6 block at a glance.');
    expect(collapseWs(textContent(html))).toBe('Subnet Calculator: Subnet any IPv4 or IPv6 block at a glance.');
    expect(textContent(html)).toContain(': ');
    expect(textContent(html)).not.toMatch(/:\S/);
  });

  it('the fallback (no registered tool) renders the headline slot alone', () => {
    expect(src).toMatch(/\) : \(\s*<slot name="headline" \/>\s*\)/);
  });

  const built = [
    ['dist/subnet-calculator/index.html', 'Subnet Calculator: Subnet any IPv4 or IPv6 block at a glance.'],
    ['dist/de/cidr-checker/index.html', /^CIDR \/ Subnet Checker: /],
  ] as const;
  for (const [rel, want] of built) {
    const file = join(ROOT, rel);
    it.skipIf(!existsSync(file))(`built ${rel} has exactly one H1 whose collapsed text is "<name>: <headline>"`, () => {
      const html = readFileSync(file, 'utf8');
      const h1s = findBlocks(html, (t: { name: string }) => t.name === 'h1');
      expect(h1s.length).toBe(1);
      const text = collapseWs(textContent(h1s[0].inner));
      if (typeof want === 'string') expect(text).toBe(want);
      else expect(text).toMatch(want);
      // `{' '}` plus the collapsed source line break: at least one real space
      // between the spans (textContent collapses the run to the single ": ").
      expect(h1s[0].inner).toMatch(/<\/span> +<span/);
    });
  }
});

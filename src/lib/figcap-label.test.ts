/**
 * FigureCap's ` · category` split is opt-in (src/lib/figcap-label.ts +
 * FigureCap.astro `split`). Off by default so the homepage caps — HeroDemo's
 * `fig. NN — slug · category` and PrivacyProof's `devtools · network` — keep
 * the one-text-node markup they shipped with while the 2026-09-30 homepage
 * experiment is read. The dist/index.html figcap markup is proved identical to
 * main by a build diff; these tests pin the two things that make it so.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { figcapLabelParts, FIGCAP_SEP } from './figcap-label';

const HERO = 'fig. 10 — subnet-calculator · networking';

describe('figcapLabelParts', () => {
  it('does not split by default', () => {
    expect(figcapLabelParts(HERO)).toEqual({ head: HERO, sub: '' });
    expect(figcapLabelParts('devtools · network')).toEqual({ head: 'devtools · network', sub: '' });
  });

  it('does not split when split is false', () => {
    expect(figcapLabelParts(HERO, false)).toEqual({ head: HERO, sub: '' });
  });

  it('splits at the last separator when asked', () => {
    expect(figcapLabelParts(HERO, true)).toEqual({
      head: 'fig. 10 — subnet-calculator',
      sub: ' · networking',
    });
    expect(figcapLabelParts('a · b · c', true)).toEqual({ head: 'a · b', sub: ' · c' });
  });

  it('leaves a label without a separator whole', () => {
    expect(figcapLabelParts('mission: server-down', true)).toEqual({
      head: 'mission: server-down',
      sub: '',
    });
    // A leading separator has no head to keep; never emit an empty head.
    expect(figcapLabelParts(`${FIGCAP_SEP}x`, true).sub).toBe('');
  });

  it('never changes the text, split or not', () => {
    for (const s of [HERO, 'a · b · c', 'plain', '']) {
      for (const split of [true, false]) {
        const { head, sub } = figcapLabelParts(s, split);
        expect(head + sub).toBe(s);
      }
    }
  });
});

describe('FigureCap split wiring', () => {
  const root = fileURLToPath(new URL('../components/', import.meta.url));
  const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

  it('FigureCap defaults split to false and renders the bare text when off', () => {
    const src = read('FigureCap.astro');
    expect(src).toMatch(/split\s*=\s*false\s*\}\s*=\s*Astro\.props/);
    expect(src).toMatch(/figcapLabelParts\(text,\s*split\)/);
    // Off: the label's only child is the text expression, as before the split.
    expect(src).toMatch(/\{sub \? <>\{head\}<span class="figcap__sub">\{sub\}<\/span><\/> : text\}/);
  });

  it('no homepage component opts in', () => {
    const dir = join(root, 'home');
    for (const f of readdirSync(dir).filter((n) => n.endsWith('.astro'))) {
      const src = readFileSync(join(dir, f), 'utf8');
      for (const m of src.matchAll(/<FigureCap\b[^>]*>/g)) {
        expect(m[0], `home/${f}`).not.toMatch(/\bsplit\b/);
      }
    }
  });

  // Playground components are tool-date inputs (gen-tool-meta.mjs): opting a
  // result panel into the split edits the component and re-dates the tool's
  // URLs and every hub that lists it. Wave 1 moved the three FigureCap
  // playgrounds onto the kit's ResultPanel — which re-dated them honestly —
  // and turned the split on there. Their cap now comes only from ResultPanel,
  // which forwards `split` to its one FigureCap.
  it('ResultPanel forwards split to its one FigureCap', () => {
    const caps = [...read('playground/ResultPanel.astro').matchAll(/<FigureCap\b[^>]*>/g)].map((m) => m[0]);
    expect(caps.length).toBe(1);
    expect(caps[0]).toMatch(/\bsplit=\{split\}/);
  });

  it.each([
    'SubnetCalculatorPlayground.astro',
    'CidrCheckerPlayground.astro',
    'CronTesterPlayground.astro',
  ])('%s result panel opts into the split (Wave 1)', (f) => {
    const src = read(f);
    expect([...src.matchAll(/<FigureCap\b/g)].length, 'the cap comes from ResultPanel only').toBe(0);
    const panels = [...src.matchAll(/<ResultPanel\b[^>]*>/g)].map((m) => m[0]);
    expect(panels.length).toBe(1);
    expect(panels[0]).toMatch(/\bsplit\b/);
    expect(panels[0]).not.toMatch(/\bsplit=\{false\}/);
  });
});

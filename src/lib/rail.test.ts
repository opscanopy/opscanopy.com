/**
 * Rail gate — one left edge per page (plan, "Decisions taken after
 * validation", decision 1).
 *
 * The rule for the design system: inside `container-page` a section may set a
 * measure (`max-w-*`) but never centre itself. The measure hangs from the
 * container's left edge, so the eyebrow, H1, lede and every section below them
 * share one rail. Today hubs and the tool hero centre their stacks
 * (`mx-auto max-w-3xl … sm:text-center`), which is why each page reads as a
 * column of separately-centred blocks.
 *
 * Fails on an element that is a DIRECT child of an element carrying
 * `container-page` and has either
 *   - `mx-auto` together with a `max-w-*` (a centred measure), or
 *   - `text-center` / `sm:text-center` (any responsive variant).
 * Grandchildren are not checked: centring inside a card or a figure is a
 * component's own business, not the page rail. Elements rendered from an Astro
 * expression (`{cond && <div …>}`, `.map(() => <li …>)`) count as direct
 * children, because that is how they render.
 *
 * Corpus: every `.astro` under `src/pages/`, the hub/tool hero components that
 * exist (`ToolHero`, `ToolPipeline`, `ToolLede`, `PageHero`, `InfoPage`) and
 * everything in `src/components/page/`.
 *
 * RATCHET: `RAIL_ALLOWLIST` is today's offenders, computed from source
 * (file → count). A file may not exceed its count (regression) and may not
 * fall below it without the entry being lowered or deleted (stale), so the
 * list only ever shrinks. Batch B4 (hubs → PageHero) and Batch D (ToolHero +
 * the tool-page codemod) are what empty it.
 */

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync, existsSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, relative } from 'node:path';
import { findBlocks, classText, directChildren } from '../../scripts/html-block.mjs';

const SRC = join(fileURLToPath(new URL('.', import.meta.url)), '..');

/** Same walker as type-scale.test.ts. */
function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (name.endsWith('.astro')) out.push(full);
  }
  return out;
}

const HERO_COMPONENTS = ['ToolHero', 'ToolPipeline', 'ToolLede', 'PageHero', 'InfoPage']
  .map((n) => join(SRC, 'components', `${n}.astro`))
  .filter((f) => existsSync(f));

const files = [...walk(join(SRC, 'pages')), ...HERO_COMPONENTS, ...walk(join(SRC, 'components', 'page'))].sort();

/** Template only: frontmatter, <script>, <style> and comments removed. */
export function template(raw: string): string {
  return raw
    .replace(/^---\r?\n[\s\S]*?\r?\n---/, '')
    .replace(/<script\b[\s\S]*?<\/script\s*>/gi, '')
    .replace(/<style\b[\s\S]*?<\/style\s*>/gi, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/<!--[\s\S]*?-->/g, '');
}

type Tag = { name: string; attrs: string; start: number };
type Block = { start: number; inner: string; innerStart: number; tag: Tag };

const tok = (cls: string) => new RegExp(`(?:^|[\\s'"\`\\[,])${cls}(?=[\\s'"\`\\],]|$)`);
const CONTAINER = tok('container-page');
const MX_AUTO = tok('(?:[a-z0-9]+:)*mx-auto');
const MAX_W = tok('(?:[a-z0-9]+:)*max-w-[\\w.\\[\\]()-]+');
const CENTER = tok('(?:[a-z0-9]+:)*text-center');

/** Offending direct children of every `container-page` element in one template. */
export function railOffenders(tpl: string): Array<{ line: number; why: string; tag: string }> {
  const out: Array<{ line: number; why: string; tag: string }> = [];
  const containers: Block[] = findBlocks(tpl, (t: Tag) => CONTAINER.test(classText(t.attrs)));
  for (const c of containers) {
    for (const child of directChildren(c.inner) as Tag[]) {
      const cls = classText(child.attrs);
      const why: string[] = [];
      if (MX_AUTO.test(cls) && MAX_W.test(cls)) why.push('mx-auto + max-w-*');
      if (CENTER.test(cls)) why.push('text-center');
      if (!why.length) continue;
      const at = c.innerStart + child.start;
      out.push({ line: tpl.slice(0, at).split('\n').length, why: why.join(', '), tag: `<${child.name}>` });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Ratchet — today's offenders, computed from source on 2026-10-03 after the
// batch D codemod (scripts/codemods/move-tool-lede.mjs) put ToolHero,
// ToolPipeline and all 195 tool pages on the rail. Lower or delete entries as
// the remaining pages move onto it.
// ---------------------------------------------------------------------------

const RAIL_ALLOWLIST: Record<string, number> = {
  'components/page/BlogPost.astro': 1,
  'components/page/GuidePost.astro': 1,
  'pages/changelog.astro': 3,
  'pages/de/index.astro': 1,
  'pages/es/index.astro': 1,
  'pages/fr/index.astro': 1,
  'pages/index.astro': 1,
  'pages/learn/roadmaps/[slug].astro': 3,
  'pages/mission-90/complete.astro': 2,
  'pages/mission-90/job-ready.astro': 5,
  'pages/mission-90/setup.astro': 1,
  'pages/pt-br/index.astro': 1,
  'pages/verify-ai.astro': 8,
};

describe('rail gate — corpus', () => {
  it('walks the pages and the hero components', () => {
    expect(files.length).toBeGreaterThan(250);
    expect(HERO_COMPONENTS.some((f) => f.endsWith('ToolHero.astro'))).toBe(true);
    expect(files.some((f) => /[\\/]components[\\/]page[\\/]InfoPage\.astro$/.test(f))).toBe(true);
  });

  it('no file centres a direct child of container-page beyond its allowlisted count', () => {
    const regressions: string[] = [];
    const stale: string[] = [];
    const actual: Record<string, number> = {};
    const known = new Set<string>();
    for (const f of files) {
      const rel = relative(SRC, f).replace(/\\/g, '/');
      known.add(rel);
      const hits = railOffenders(template(readFileSync(f, 'utf-8')));
      if (hits.length) actual[rel] = hits.length;
      const allowed = RAIL_ALLOWLIST[rel] ?? 0;
      if (hits.length > allowed) {
        regressions.push(`${rel}: ${hits.length} > allowed ${allowed}\n${hits.map((h) => `    :${h.line} ${h.tag} ${h.why}`).join('\n')}`);
      } else if (hits.length < allowed) {
        stale.push(`${rel}: ${hits.length} < allowed ${allowed} — lower the RAIL_ALLOWLIST entry`);
      }
    }
    for (const rel of Object.keys(RAIL_ALLOWLIST)) if (!known.has(rel)) stale.push(`${rel}: not in the corpus — delete the entry`);
    const computed = Object.entries(actual)
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([k, v]) => `  '${k}': ${v},`)
      .join('\n');
    // RAIL_DUMP=<file> writes today's counts, ready to paste (only ever to shrink the list).
    if (process.env.RAIL_DUMP) writeFileSync(process.env.RAIL_DUMP, `${computed}\n`);
    expect(regressions, `centred direct children of container-page:\n${regressions.join('\n')}`).toEqual([]);
    expect(stale, `stale RAIL_ALLOWLIST entries:\n${stale.join('\n')}`).toEqual([]);
  });
});

describe('rail gate — self-tests', () => {
  const wrap = (inner: string) => `<section class="py-16"><div class="container-page">${inner}</div></section>`;
  const n = (inner: string) => railOffenders(wrap(inner)).length;

  it('flags a centred measure on a direct child', () => {
    expect(n('<div class="mx-auto max-w-3xl"><h1>t</h1></div>')).toBe(1);
    expect(n('<div class="max-w-3xl mx-auto text-left"></div>')).toBe(1);
    expect(n('<div class="sm:mx-auto max-w-[44rem]"></div>')).toBe(1);
  });

  it('flags text-center and its responsive variants', () => {
    expect(n('<p class="text-center">x</p>')).toBe(1);
    expect(n('<div class="text-left sm:text-center">x</div>')).toBe(1);
  });

  it('allows a measure that hangs from the left edge, or mx-auto without a measure', () => {
    expect(n('<div class="max-w-3xl"><p>x</p></div>')).toBe(0);
    expect(n('<div class="mx-auto"><p>x</p></div>')).toBe(0);
    expect(n('<div class="measure-prose"><p>x</p></div>')).toBe(0);
    expect(n('<div class="text-centered-ish"></div>')).toBe(0);
  });

  it('checks direct children only, including expression-rendered ones', () => {
    expect(n('<div><div class="mx-auto max-w-3xl text-center"></div></div>')).toBe(0);
    expect(n('{show && <div class="mx-auto max-w-2xl"></div>}')).toBe(1);
    expect(n('{items.map((i) => (<p class="text-center">{i}</p>))}')).toBe(1);
    expect(n(`<div class:list={['mx-auto', wide ? 'max-w-5xl' : 'max-w-3xl']}></div>`)).toBe(1);
    expect(n('<Card class="text-center" />')).toBe(1);
  });

  it('does not flag the container itself, and checks nested containers', () => {
    expect(railOffenders('<div class="container-page mx-auto max-w-6xl text-center"><p>x</p></div>').length).toBe(0);
    expect(n('<div class="container-page"><p class="text-center">x</p></div>')).toBe(1);
  });

  it('ignores frontmatter, scripts, styles and comments', () => {
    const raw = `---\nconst s = '<div class="container-page"><p class="text-center"></p></div>';\n---\n<div class="container-page">{/* <p class="text-center"></p> */}<!-- <p class="text-center"></p> --><p>ok</p></div>\n<script>const t = '<p class="text-center">';</script>\n<style>.text-center { color: red }</style>`;
    expect(railOffenders(template(raw))).toEqual([]);
  });

  it('reports the line of the offending child', () => {
    const tpl = '<div class="container-page">\n  <p>ok</p>\n  <p class="text-center">bad</p>\n</div>';
    expect(railOffenders(tpl)).toEqual([{ line: 3, why: 'text-center', tag: '<p>' }]);
  });
});

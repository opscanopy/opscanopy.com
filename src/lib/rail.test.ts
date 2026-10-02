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
// Ratchet — today's offenders, computed from source on 2026-10-02
// (main @ f7331d8). Lower or delete entries as pages move onto the rail.
// ---------------------------------------------------------------------------

const RAIL_ALLOWLIST: Record<string, number> = {
  'components/ToolHero.astro': 1,
  'components/ToolPipeline.astro': 1,
  'components/page/BlogPost.astro': 1,
  'components/page/GuidePost.astro': 1,
  'pages/alertmanager-route-tester.astro': 5,
  'pages/base64-encoder-decoder.astro': 4,
  'pages/case-converter.astro': 4,
  'pages/certificate-decoder.astro': 4,
  'pages/changelog.astro': 3,
  'pages/chmod-calculator.astro': 4,
  'pages/cidr-checker.astro': 4,
  'pages/cron-expression-tester.astro': 4,
  'pages/cron-to-systemd.astro': 6,
  'pages/cve-ignore-converter.astro': 9,
  'pages/data-size-converter.astro': 4,
  'pages/de/alertmanager-route-tester.astro': 5,
  'pages/de/base64-encoder-decoder.astro': 4,
  'pages/de/case-converter.astro': 4,
  'pages/de/certificate-decoder.astro': 4,
  'pages/de/chmod-calculator.astro': 4,
  'pages/de/cidr-checker.astro': 4,
  'pages/de/cron-expression-tester.astro': 4,
  'pages/de/cron-to-systemd.astro': 6,
  'pages/de/cve-ignore-converter.astro': 9,
  'pages/de/data-size-converter.astro': 4,
  'pages/de/docker-run-to-compose.astro': 5,
  'pages/de/dockerfile-linter.astro': 7,
  'pages/de/env-example-checker.astro': 5,
  'pages/de/github-actions-expression-tester.astro': 4,
  'pages/de/github-actions-validator.astro': 5,
  'pages/de/gitlab-ci-validator.astro': 5,
  'pages/de/grafana-dashboard-validator.astro': 7,
  'pages/de/hash-generator.astro': 4,
  'pages/de/index.astro': 1,
  'pages/de/ip-address-converter.astro': 4,
  'pages/de/jq-playground.astro': 7,
  'pages/de/json-yaml-converter.astro': 6,
  'pages/de/jwt-decoder.astro': 4,
  'pages/de/kubernetes-label-selector-tester.astro': 7,
  'pages/de/kubernetes-resource-calculator.astro': 4,
  'pages/de/logql-promql-helper.astro': 4,
  'pages/de/loki-alert-rule-tester.astro': 5,
  'pages/de/mac-address-formatter.astro': 4,
  'pages/de/prometheus-relabel-tester.astro': 6,
  'pages/de/promql-explainer.astro': 5,
  'pages/de/regex-log-tester.astro': 6,
  'pages/de/reverse-dns-ptr.astro': 4,
  'pages/de/slugify.astro': 4,
  'pages/de/subnet-calculator.astro': 4,
  'pages/de/subnet-splitter.astro': 4,
  'pages/de/systemd-unit-validator.astro': 8,
  'pages/de/terraform-plan-summarizer.astro': 4,
  'pages/de/timestamp-converter.astro': 4,
  'pages/de/url-encoder-decoder.astro': 4,
  'pages/de/uuid-ulid-generator.astro': 4,
  'pages/docker-run-to-compose.astro': 5,
  'pages/dockerfile-linter.astro': 7,
  'pages/env-example-checker.astro': 5,
  'pages/es/alertmanager-route-tester.astro': 5,
  'pages/es/base64-encoder-decoder.astro': 4,
  'pages/es/case-converter.astro': 4,
  'pages/es/certificate-decoder.astro': 4,
  'pages/es/chmod-calculator.astro': 4,
  'pages/es/cidr-checker.astro': 4,
  'pages/es/cron-expression-tester.astro': 4,
  'pages/es/cron-to-systemd.astro': 6,
  'pages/es/cve-ignore-converter.astro': 9,
  'pages/es/data-size-converter.astro': 4,
  'pages/es/docker-run-to-compose.astro': 5,
  'pages/es/dockerfile-linter.astro': 7,
  'pages/es/env-example-checker.astro': 5,
  'pages/es/github-actions-expression-tester.astro': 4,
  'pages/es/github-actions-validator.astro': 5,
  'pages/es/gitlab-ci-validator.astro': 5,
  'pages/es/grafana-dashboard-validator.astro': 7,
  'pages/es/hash-generator.astro': 4,
  'pages/es/index.astro': 1,
  'pages/es/ip-address-converter.astro': 4,
  'pages/es/jq-playground.astro': 7,
  'pages/es/json-yaml-converter.astro': 6,
  'pages/es/jwt-decoder.astro': 4,
  'pages/es/kubernetes-label-selector-tester.astro': 7,
  'pages/es/kubernetes-resource-calculator.astro': 4,
  'pages/es/logql-promql-helper.astro': 4,
  'pages/es/loki-alert-rule-tester.astro': 5,
  'pages/es/mac-address-formatter.astro': 4,
  'pages/es/prometheus-relabel-tester.astro': 6,
  'pages/es/promql-explainer.astro': 5,
  'pages/es/regex-log-tester.astro': 6,
  'pages/es/reverse-dns-ptr.astro': 4,
  'pages/es/slugify.astro': 4,
  'pages/es/subnet-calculator.astro': 4,
  'pages/es/subnet-splitter.astro': 4,
  'pages/es/systemd-unit-validator.astro': 8,
  'pages/es/terraform-plan-summarizer.astro': 4,
  'pages/es/timestamp-converter.astro': 4,
  'pages/es/url-encoder-decoder.astro': 4,
  'pages/es/uuid-ulid-generator.astro': 4,
  'pages/fr/alertmanager-route-tester.astro': 5,
  'pages/fr/base64-encoder-decoder.astro': 4,
  'pages/fr/case-converter.astro': 4,
  'pages/fr/certificate-decoder.astro': 4,
  'pages/fr/chmod-calculator.astro': 4,
  'pages/fr/cidr-checker.astro': 4,
  'pages/fr/cron-expression-tester.astro': 4,
  'pages/fr/cron-to-systemd.astro': 6,
  'pages/fr/cve-ignore-converter.astro': 9,
  'pages/fr/data-size-converter.astro': 4,
  'pages/fr/docker-run-to-compose.astro': 5,
  'pages/fr/dockerfile-linter.astro': 7,
  'pages/fr/env-example-checker.astro': 5,
  'pages/fr/github-actions-expression-tester.astro': 4,
  'pages/fr/github-actions-validator.astro': 5,
  'pages/fr/gitlab-ci-validator.astro': 5,
  'pages/fr/grafana-dashboard-validator.astro': 7,
  'pages/fr/hash-generator.astro': 4,
  'pages/fr/index.astro': 1,
  'pages/fr/ip-address-converter.astro': 4,
  'pages/fr/jq-playground.astro': 7,
  'pages/fr/json-yaml-converter.astro': 6,
  'pages/fr/jwt-decoder.astro': 4,
  'pages/fr/kubernetes-label-selector-tester.astro': 7,
  'pages/fr/kubernetes-resource-calculator.astro': 4,
  'pages/fr/logql-promql-helper.astro': 4,
  'pages/fr/loki-alert-rule-tester.astro': 5,
  'pages/fr/mac-address-formatter.astro': 4,
  'pages/fr/prometheus-relabel-tester.astro': 6,
  'pages/fr/promql-explainer.astro': 5,
  'pages/fr/regex-log-tester.astro': 6,
  'pages/fr/reverse-dns-ptr.astro': 4,
  'pages/fr/slugify.astro': 4,
  'pages/fr/subnet-calculator.astro': 4,
  'pages/fr/subnet-splitter.astro': 4,
  'pages/fr/systemd-unit-validator.astro': 8,
  'pages/fr/terraform-plan-summarizer.astro': 4,
  'pages/fr/timestamp-converter.astro': 4,
  'pages/fr/url-encoder-decoder.astro': 4,
  'pages/fr/uuid-ulid-generator.astro': 4,
  'pages/github-actions-expression-tester.astro': 4,
  'pages/github-actions-validator.astro': 5,
  'pages/gitlab-ci-validator.astro': 5,
  'pages/grafana-dashboard-validator.astro': 7,
  'pages/hash-generator.astro': 4,
  'pages/index.astro': 1,
  'pages/ip-address-converter.astro': 4,
  'pages/jq-playground.astro': 7,
  'pages/json-yaml-converter.astro': 6,
  'pages/jwt-decoder.astro': 4,
  'pages/kubernetes-label-selector-tester.astro': 7,
  'pages/kubernetes-resource-calculator.astro': 4,
  'pages/learn/roadmaps/[slug].astro': 3,
  'pages/logql-promql-helper.astro': 4,
  'pages/loki-alert-rule-tester.astro': 5,
  'pages/mac-address-formatter.astro': 4,
  'pages/mission-90/complete.astro': 2,
  'pages/mission-90/job-ready.astro': 5,
  'pages/mission-90/setup.astro': 1,
  'pages/prometheus-relabel-tester.astro': 6,
  'pages/promql-explainer.astro': 5,
  'pages/pt-br/alertmanager-route-tester.astro': 5,
  'pages/pt-br/base64-encoder-decoder.astro': 4,
  'pages/pt-br/case-converter.astro': 4,
  'pages/pt-br/certificate-decoder.astro': 4,
  'pages/pt-br/chmod-calculator.astro': 4,
  'pages/pt-br/cidr-checker.astro': 4,
  'pages/pt-br/cron-expression-tester.astro': 4,
  'pages/pt-br/cron-to-systemd.astro': 6,
  'pages/pt-br/cve-ignore-converter.astro': 9,
  'pages/pt-br/data-size-converter.astro': 4,
  'pages/pt-br/docker-run-to-compose.astro': 5,
  'pages/pt-br/dockerfile-linter.astro': 7,
  'pages/pt-br/env-example-checker.astro': 5,
  'pages/pt-br/github-actions-expression-tester.astro': 4,
  'pages/pt-br/github-actions-validator.astro': 5,
  'pages/pt-br/gitlab-ci-validator.astro': 5,
  'pages/pt-br/grafana-dashboard-validator.astro': 7,
  'pages/pt-br/hash-generator.astro': 4,
  'pages/pt-br/index.astro': 1,
  'pages/pt-br/ip-address-converter.astro': 4,
  'pages/pt-br/jq-playground.astro': 7,
  'pages/pt-br/json-yaml-converter.astro': 6,
  'pages/pt-br/jwt-decoder.astro': 4,
  'pages/pt-br/kubernetes-label-selector-tester.astro': 7,
  'pages/pt-br/kubernetes-resource-calculator.astro': 4,
  'pages/pt-br/logql-promql-helper.astro': 4,
  'pages/pt-br/loki-alert-rule-tester.astro': 5,
  'pages/pt-br/mac-address-formatter.astro': 4,
  'pages/pt-br/prometheus-relabel-tester.astro': 6,
  'pages/pt-br/promql-explainer.astro': 5,
  'pages/pt-br/regex-log-tester.astro': 6,
  'pages/pt-br/reverse-dns-ptr.astro': 4,
  'pages/pt-br/slugify.astro': 4,
  'pages/pt-br/subnet-calculator.astro': 4,
  'pages/pt-br/subnet-splitter.astro': 4,
  'pages/pt-br/systemd-unit-validator.astro': 8,
  'pages/pt-br/terraform-plan-summarizer.astro': 4,
  'pages/pt-br/timestamp-converter.astro': 4,
  'pages/pt-br/url-encoder-decoder.astro': 4,
  'pages/pt-br/uuid-ulid-generator.astro': 4,
  'pages/regex-log-tester.astro': 6,
  'pages/reverse-dns-ptr.astro': 4,
  'pages/slugify.astro': 4,
  'pages/subnet-calculator.astro': 4,
  'pages/subnet-splitter.astro': 4,
  'pages/systemd-unit-validator.astro': 8,
  'pages/terraform-plan-summarizer.astro': 4,
  'pages/timestamp-converter.astro': 4,
  'pages/url-encoder-decoder.astro': 4,
  'pages/uuid-ulid-generator.astro': 4,
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

/**
 * Variant-page data gate (/chmod-calculator/<octal>/, /subnet-calculator/<v>/,
 * /cron-expression-tester/<slug>/). Each entry is a whole indexable page, so
 * it must be unique, fit the SERP limits, carry real prose (>= 300 words —
 * thin stubs are the anti-pattern) and agree with the engine it seeds.
 */
import { describe, it, expect } from 'vitest';
import { type ToolVariant, indexable, isIndexable } from './index';
import { chmodVariants } from './chmod';
import { subnetVariants } from './subnet';
import { cronVariants } from './cron';
import { llmVramVariants } from './llm-vram';
import { variantsFor, type VariantLocale } from './chmod.i18n';
import { parseOctal } from '../../lib/chmod-calculator/engine';
import { calculate } from '../../lib/subnet-calculator/engine';
import { explain } from '../../lib/cron-tester/engine';
import { estimate } from '../../lib/llm-vram-calculator/engine';
import { formatGiB } from '../../lib/llm-vram-calculator/render';

const words = (s: string): number => s.split(/\s+/).filter(Boolean).length;
const prose = (v: ToolVariant): string => [v.lede, ...v.sections.flatMap((s) => s.paragraphs)].join(' ');
const HTML_TAG = /<\/?[a-z]/i;

const lists: [string, ToolVariant[]][] = [
  ['chmod', chmodVariants],
  ['subnet', subnetVariants],
  ['cron', cronVariants],
  ['llm-vram', llmVramVariants],
];
const chmodLocales: VariantLocale[] = ['de', 'es', 'fr', 'pt-br'];
for (const l of chmodLocales) lists.push([`chmod-${l}`, variantsFor(l)]);
const chmodAll = [...chmodVariants, ...chmodLocales.flatMap(variantsFor)];

for (const [name, list] of lists) {
  describe(`${name} variants`, () => {
    it('is non-empty with unique, URL-safe slugs and unique inputs', () => {
      expect(list.length).toBeGreaterThan(0);
      for (const v of list) expect(v.slug, v.slug).toMatch(/^[a-z0-9-]+$/);
      expect(new Set(list.map((v) => v.slug)).size).toBe(list.length);
      expect(new Set(list.map((v) => v.input)).size).toBe(list.length);
    });

    for (const v of list) {
      it(`${v.slug}: page copy fits the contract`, () => {
        expect(v.title.length, `title: ${v.title}`).toBeLessThanOrEqual(60);
        expect(v.description.length, `description: ${v.description}`).toBeLessThanOrEqual(155);
        expect(v.h1Name.trim()).not.toBe('');
        expect(v.headline.trim()).not.toBe('');
        expect(v.lede.trim()).not.toBe('');
        expect(v.sections.length).toBeGreaterThanOrEqual(3);
        expect(v.sections.length).toBeLessThanOrEqual(5);
        for (const s of v.sections) {
          expect(s.heading.trim()).not.toBe('');
          // Backtick spans are escaped by inlineCode, so placeholders like `<user>` are fine there.
          for (const p of s.paragraphs)
            expect(p.replace(/`[^`]*`/g, ''), 'no HTML in paragraphs').not.toMatch(HTML_TAG);
        }
        expect(v.faqs.length).toBeGreaterThanOrEqual(2);
        expect(v.faqs.length).toBeLessThanOrEqual(3);
        for (const f of v.faqs) {
          expect(f.q, f.q).not.toMatch(HTML_TAG);
          expect(f.a, f.q).not.toMatch(HTML_TAG);
        }
        expect(words(prose(v)), 'lede + paragraphs word count').toBeGreaterThanOrEqual(300);
      });
    }
  });
}

describe('chmod locale variants mirror English', () => {
  it('13 pages: 777/755/600/700 in de, fr, pt-br; 777 only in es', () => {
    expect(variantsFor('es').map((v) => v.slug)).toEqual(['777']);
    for (const l of ['de', 'fr', 'pt-br'] as const)
      expect(variantsFor(l).map((v) => v.slug).sort()).toEqual(['600', '700', '755', '777']);
  });
  for (const l of chmodLocales)
    for (const v of variantsFor(l)) {
      it(`${l} ${v.slug}: same slug/input as English, keyword first in title`, () => {
        const en = chmodVariants.find((e) => e.slug === v.slug);
        expect(en, v.slug).toBeDefined();
        expect(v.input).toBe(en!.input);
        expect(v.h1Name).toBe(en!.h1Name);
        expect(v.title.startsWith(`chmod ${v.slug}`), v.title).toBe(true);
      });
    }
});

describe('variants agree with their engines', () => {
  for (const v of chmodAll) {
    it(`chmod ${v.input} (${v.title}): valid, symbolic form quoted in the prose`, () => {
      const r = parseOctal(v.input);
      expect(r.valid, r.error).toBe(true);
      expect(prose(v)).toContain(r.symbolic!);
    });
  }
  for (const v of subnetVariants) {
    it(`subnet ${v.input}: valid`, () => {
      const r = calculate(v.input);
      expect(r.valid, r.error).toBe(true);
    });
  }
  for (const v of cronVariants) {
    it(`cron ${v.input}: valid, description quoted in the prose`, () => {
      const r = explain(v.input, { timeZone: 'UTC' });
      expect(r.valid, r.error).toBe(true);
      expect(prose(v)).toContain(r.description);
    });
  }
  for (const v of llmVramVariants) {
    it(`llm-vram ${v.input}: valid, input matches vram, total quoted in the prose`, () => {
      const { params, quant, context, preset } = v.vram;
      expect(v.input).toBe([params, quant, context, preset].join('|'));
      const r = estimate(v.vram);
      expect(r.valid, r.error).toBe(true);
      expect(prose(v)).toContain(`${formatGiB(r.totalGiB)} GiB`);
    });
  }
});

describe('indexable variants (the rest are noindex and out of the sitemap)', () => {
  const keep = (tool: string) => indexable[tool];
  it('pins the keep-lists, each slug a real variant', () => {
    expect(keep('chmod-calculator')).toEqual(['644', '755', '777', '600', '700']);
    expect(keep('cron-expression-tester')).toEqual(['every-5-minutes', 'every-hour', 'every-day-at-midnight', 'every-minute']);
    for (const s of keep('chmod-calculator')) expect(chmodVariants.map((v) => v.slug)).toContain(s);
    for (const s of keep('cron-expression-tester')) expect(cronVariants.map((v) => v.slug)).toContain(s);
    expect(keep('llm-vram-calculator')).toEqual(['llama-3-1-70b', 'llama-3-1-8b', 'llama-3-1-405b', 'deepseek-r1-distill-llama-70b', 'deepseek-r1-distill-qwen-32b', 'qwen2-5-72b', 'mixtral-8x7b']);
    for (const s of keep('llm-vram-calculator')) expect(llmVramVariants.map((v) => v.slug)).toContain(s);
  });
  it('sitemap filter (astro.config.mjs) drops exactly the noindex URLs, all chmod locales included', async () => {
    const src = (await import('node:fs')).readFileSync('astro.config.mjs', 'utf8');
    expect(src).toContain("require('./src/data/variants/indexable.json')");
    const m = src.match(/const isNoindexVariant = [\s\S]*?\n};\n/)!;
    const KEEP = indexable;
    const fn = new Function('VARIANT_KEEP', `${m[0]}; return isNoindexVariant;`)(KEEP) as (p: string) => boolean;
    for (const v of chmodVariants) expect(fn(`/chmod-calculator/${v.slug}/`)).toBe(!isIndexable('chmod-calculator', v.slug));
    for (const v of cronVariants) expect(fn(`/cron-expression-tester/${v.slug}/`)).toBe(!isIndexable('cron-expression-tester', v.slug));
    for (const l of chmodLocales) for (const v of variantsFor(l)) expect(fn(`/${l}/chmod-calculator/${v.slug}/`)).toBe(true);
    for (const v of llmVramVariants) expect(fn(`/llm-vram-calculator/${v.slug}/`)).toBe(!isIndexable('llm-vram-calculator', v.slug));
    for (const v of subnetVariants) expect(fn(`/subnet-calculator/${v.slug}/`)).toBe(false);
    expect(fn('/de/blog/reading-promql/')).toBe(false);
    expect(fn('/chmod-calculator/')).toBe(false);
    expect(fn('/de/chmod-calculator/')).toBe(false);
  });
  it('English chmod pages advertise no locale alternates; locale pages are noindex/noAlternates', async () => {
    const fs = await import('node:fs');
    expect(fs.readFileSync('src/pages/chmod-calculator/[octal].astro', 'utf8')).toContain("availableLocales={['en']}");
    for (const l of chmodLocales) {
      const t = fs.readFileSync(`src/pages/${l}/chmod-calculator/[octal].astro`, 'utf8');
      expect(t).toContain('noindex="follow"');
      expect(t).toContain('noAlternates={true}');
    }
  });
});

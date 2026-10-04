/**
 * Variant-page data gate (/chmod-calculator/<octal>/, /subnet-calculator/<v>/,
 * /cron-expression-tester/<slug>/). Each entry is a whole indexable page, so
 * it must be unique, fit the SERP limits, carry real prose (>= 300 words —
 * thin stubs are the anti-pattern) and agree with the engine it seeds.
 */
import { describe, it, expect } from 'vitest';
import type { ToolVariant } from './index';
import { chmodVariants } from './chmod';
import { subnetVariants } from './subnet';
import { cronVariants } from './cron';
import { parseOctal } from '../../lib/chmod-calculator/engine';
import { calculate } from '../../lib/subnet-calculator/engine';
import { explain } from '../../lib/cron-tester/engine';

const words = (s: string): number => s.split(/\s+/).filter(Boolean).length;
const prose = (v: ToolVariant): string => [v.lede, ...v.sections.flatMap((s) => s.paragraphs)].join(' ');
const HTML_TAG = /<\/?[a-z]/i;

const lists: [string, ToolVariant[]][] = [
  ['chmod', chmodVariants],
  ['subnet', subnetVariants],
  ['cron', cronVariants],
];

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

describe('variants agree with their engines', () => {
  for (const v of chmodVariants) {
    it(`chmod ${v.input}: valid, symbolic form quoted in the prose`, () => {
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
});

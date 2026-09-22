/**
 * Tool FAQ registry guardrail.
 *
 * Every live tool MUST have FAQs in every locale, index-aligned with English
 * (same count, same order) so translators diff one file against another and
 * `llms-full.txt` can carry the English set for all 39 tools. Answers are
 * plain text: FaqList renders them as text nodes (markup would be escaped) and
 * faqPageLd copies them into JSON-LD verbatim (markup would leak raw). Angle
 * brackets ARE allowed — the prose uses placeholders like `<expression>` and
 * `(?<name>…)` and Grafana's `${DS_PROMETHEUS}` — but real HTML tags are not.
 */
import { describe, it, expect } from 'vitest';
import { liveTools } from './tools';
import { LOCALES } from '../i18n/config';
import { toolFaqs, TOOL_FAQS } from './tool-faqs';

const HTML_TAG = /<\/?(p|a|br|span|code|strong|em|div|b|i|ul|ol|li|pre|h[1-6])\b/i;

describe('tool FAQ registry', () => {
  it('covers every live tool in English', () => {
    for (const t of liveTools) {
      expect(TOOL_FAQS.en[t.slug], `en FAQs missing for ${t.slug}`).toBeDefined();
    }
  });

  for (const t of liveTools) {
    for (const lang of LOCALES) {
      it(`${t.slug} · ${lang}: non-empty, plain-text, index-aligned with en`, () => {
        const en = toolFaqs(t.slug, 'en');
        const faqs = toolFaqs(t.slug, lang);
        expect(en.length, 'en has entries').toBeGreaterThan(0);
        expect(faqs.length, `${lang} count differs from en`).toBe(en.length);
        for (const f of faqs) {
          expect(typeof f.q).toBe('string');
          expect(typeof f.a).toBe('string');
          expect(f.q.trim().length).toBeGreaterThan(0);
          expect(f.a.trim().length).toBeGreaterThan(0);
          expect(f.q + f.a, `HTML tag in ${lang}/${t.slug}`).not.toMatch(HTML_TAG);
        }
      });
    }
  }

  it('falls back to English for an unknown locale entry, never to an empty list', () => {
    // @ts-expect-error — deliberately probing the fallback path with a bad locale
    expect(toolFaqs('subnet-calculator', 'xx')).toEqual(toolFaqs('subnet-calculator', 'en'));
  });

  it('returns an empty list for an unknown slug rather than throwing', () => {
    expect(toolFaqs('not-a-tool', 'en')).toEqual([]);
  });
});

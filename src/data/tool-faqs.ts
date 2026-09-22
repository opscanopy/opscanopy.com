/**
 * Tool FAQ registry — the single source of truth for every tool page's FAQ,
 * in all five locales.
 *
 * Until 2026-09-22 each of the 195 tool pages carried its own
 * `const faqs = [...]` in frontmatter, which meant `/llms-full.txt` could not
 * reach the answers (AI assistants read that file instead of executing our
 * pages) and every FAQ edit was a five-file change with no parity check.
 *
 * Shape follows src/i18n/pages.ts: English is the source of truth in
 * ./tool-faqs/en.ts; each other locale is a Partial that falls back to English
 * PER SLUG (never per entry — mixing languages inside one list would be worse
 * than an untranslated list). `src/data/tool-faqs.test.ts` enforces that every
 * live tool has FAQs in every locale, index-aligned with English, and that
 * answers are plain text: FaqList renders them as text nodes (markup would be
 * escaped) and faqPageLd copies them into JSON-LD verbatim.
 *
 * Pages: `const faqs = toolFaqs('<slug>', '<lang>');` then `<FaqList faqs={faqs} />`
 * and `faqPageLd(faqs)` exactly as before.
 */
import { DEFAULT_LOCALE, type Locale } from '../i18n/config';
import en from './tool-faqs/en';
import de from './tool-faqs/de';
import es from './tool-faqs/es';
import fr from './tool-faqs/fr';
import ptBr from './tool-faqs/pt-br';

export interface Faq {
  q: string;
  a: string;
}

/** Keyed by tool slug (`Tool['slug']` in src/data/tools.ts). */
export type ToolFaqs = Record<string, Faq[]>;

export const TOOL_FAQS: Record<Locale, Partial<ToolFaqs>> & { en: ToolFaqs } = {
  en,
  de,
  es,
  fr,
  'pt-br': ptBr,
};

/** FAQs for a tool in a locale, falling back to English for the whole slug. */
export function toolFaqs(slug: string, lang: Locale = DEFAULT_LOCALE): Faq[] {
  return TOOL_FAQS[lang]?.[slug] ?? en[slug] ?? [];
}

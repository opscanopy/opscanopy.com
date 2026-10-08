/**
 * Long-tail variant pages (/chmod-calculator/777/, /subnet-calculator/24/,
 * /cron-expression-tester/every-5-minutes/): one typed entry per URL. Each
 * page server-renders its tool's playground seeded with `input` and carries
 * hand-written prose, so the data here is the whole page copy.
 * Gated by src/data/variants/variants.test.ts.
 */
import type { Faq } from '../tool-faqs';
import indexableJson from './indexable.json';

export interface VariantSection {
  heading: string;
  /** Plain text; `backticks` become <code> via src/lib/inline-code.ts. No HTML. */
  paragraphs: string[];
}

export interface ToolVariant {
  /** URL segment, /^[a-z0-9-]+$/. */
  slug: string;
  /** Exact playground seed value. */
  input: string;
  /** Left half of the H1, e.g. "chmod 777". */
  h1Name: string;
  /** Right half of the H1, e.g. "what it means and when to use it". */
  headline: string;
  /** <title>, <= 60 chars, keyword first. */
  title: string;
  /** Meta description, <= 155 chars. */
  description: string;
  /** 1-2 sentence plain-text summary under the result panel. */
  lede: string;
  /** 3-5 sections; lede + paragraphs total >= 300 words. */
  sections: VariantSection[];
  /** 2-3 variant-specific Q&A, plain text. */
  faqs: Faq[];
}

export function variantPaths<T extends ToolVariant>(list: T[], param: string) {
  return list.map((v) => ({ params: { [param]: v.slug }, props: { variant: v } }));
}

export function siblings<T extends ToolVariant>(list: T[], slug: string): T[] {
  return list.filter((v) => v.slug !== slug);
}

/**
 * Only these variant slugs are indexable (the rest are noindex,follow and out of
 * the sitemap: Google declined them as near-duplicates). Locale chmod copies are
 * always noindex. astro.config.mjs reads the same JSON for the sitemap filter.
 */
export const indexable: Record<string, string[]> = indexableJson;
export const isIndexable = (tool: string, slug: string) => indexable[tool]?.includes(slug) ?? false;

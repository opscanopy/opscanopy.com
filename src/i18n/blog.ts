/**
 * Blog i18n helpers. Posts live in src/content/blog/<locale>/<slug>.md, so an
 * entry id looks like "en/cron-expressions-explained". These helpers split that
 * into a locale + locale-neutral slug and answer "which locales is this post
 * translated into?" (used for blog hreflang alternates + the language switcher).
 */
import { getCollection, type CollectionEntry } from 'astro:content';
import { BCP47, DEFAULT_LOCALE, LOCALES, isLocale, type Locale } from './config';

/** Long-form post date in the locale's language (shared by index + post). */
export function formatPostDate(lang: Locale, date: Date): string {
  return new Intl.DateTimeFormat(BCP47[lang], {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(date);
}

export interface LocalizedPost {
  entry: CollectionEntry<'blog'>;
  lang: Locale;
  /** Locale-neutral slug, e.g. "cron-expressions-explained". */
  slug: string;
}

function splitId(id: string): { lang: Locale; slug: string } {
  const parts = id.split('/');
  if (parts.length > 1 && isLocale(parts[0])) {
    return { lang: parts[0], slug: parts.slice(1).join('/') };
  }
  return { lang: DEFAULT_LOCALE, slug: id };
}

/** All non-draft posts, tagged with their locale + neutral slug. */
export async function getAllPosts(): Promise<LocalizedPost[]> {
  const entries = await getCollection('blog', (e) => !e.data.draft);
  return entries.map((entry) => ({ entry, ...splitId(entry.id) }));
}

/** Non-draft posts for one locale, newest first. */
export async function getPostsForLocale(lang: Locale): Promise<LocalizedPost[]> {
  const posts = (await getAllPosts()).filter((p) => p.lang === lang);
  return posts.sort((a, b) => b.entry.data.pubDate.valueOf() - a.entry.data.pubDate.valueOf());
}

/** Locales in which a given neutral slug has a (non-draft) post. */
export async function localesForSlug(slug: string): Promise<Locale[]> {
  const all = await getAllPosts();
  return LOCALES.filter((l) => all.some((p) => p.lang === l && p.slug === slug));
}

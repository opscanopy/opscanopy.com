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

/**
 * Estimated reading time in whole minutes, from the raw markdown `body` of a
 * collection entry. Words = trimmed body split on any run of whitespace.
 * Reads at ~200 wpm; clamped to a minimum of 1 so even a stub reads "1 min".
 */
export function estimateReadingTime(body: string | undefined): number {
  const trimmed = (body ?? '').trim();
  if (!trimmed) return 1;
  const words = trimmed.split(/\s+/).length;
  return Math.max(1, Math.round(words / 200));
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

/**
 * Previous/next posts for chronological article navigation, in the SAME
 * language as `current`, ordered oldest → newest by pubDate. `prev` is the
 * older post, `next` is the newer one; either is null at a boundary.
 */
export function getPrevNext(
  current: LocalizedPost,
  allPosts: LocalizedPost[],
): { prev: LocalizedPost | null; next: LocalizedPost | null } {
  const sameLang = allPosts
    .filter((p) => p.lang === current.lang)
    .sort((a, b) => a.entry.data.pubDate.valueOf() - b.entry.data.pubDate.valueOf());
  const idx = sameLang.findIndex((p) => p.slug === current.slug);
  if (idx === -1) return { prev: null, next: null };
  return {
    prev: idx > 0 ? sameLang[idx - 1] : null,
    next: idx < sameLang.length - 1 ? sameLang[idx + 1] : null,
  };
}

/**
 * Posts carrying `tag`, in the SAME language as `lang`, newest first. Tag match
 * is case-insensitive so /blog/tag/cron and a "Cron" frontmatter tag align.
 */
export function getPostsByTag(
  tag: string,
  lang: Locale,
  allPosts: LocalizedPost[],
): LocalizedPost[] {
  const needle = tag.toLowerCase();
  return allPosts
    .filter(
      (p) =>
        p.lang === lang &&
        (p.entry.data.tags ?? []).some((t) => t.toLowerCase() === needle),
    )
    .sort((a, b) => b.entry.data.pubDate.valueOf() - a.entry.data.pubDate.valueOf());
}

/**
 * Unique tags present across `lang` posts (lowercased, sorted). Drives the
 * static paths for the tag route. Case-insensitive de-duplication keeps one
 * canonical lowercase entry per tag.
 */
export function getAllTags(lang: Locale, allPosts: LocalizedPost[]): string[] {
  const set = new Set<string>();
  for (const p of allPosts) {
    if (p.lang !== lang) continue;
    for (const tag of p.entry.data.tags ?? []) set.add(tag.toLowerCase());
  }
  return [...set].sort();
}

/**
 * Posts most related to `current`, in the SAME language, ranked by shared-tag
 * count (descending) then recency (newest first). The current post and any
 * other-locale posts are excluded. Returns at most `max` posts.
 */
export function getRelatedPosts(
  current: LocalizedPost,
  allPosts: LocalizedPost[],
  max = 3,
): LocalizedPost[] {
  const currentTags = new Set(current.entry.data.tags ?? []);
  return allPosts
    .filter((p) => p.lang === current.lang && p.slug !== current.slug)
    .map((p) => {
      const shared = (p.entry.data.tags ?? []).filter((tag) => currentTags.has(tag)).length;
      return { post: p, shared };
    })
    .sort(
      (a, b) =>
        b.shared - a.shared ||
        b.post.entry.data.pubDate.valueOf() - a.post.entry.data.pubDate.valueOf(),
    )
    .slice(0, max)
    .map((ranked) => ranked.post);
}

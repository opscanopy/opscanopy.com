/**
 * Guide collection helpers. Guides live at src/content/guides/<track>/<slug>.md
 * so an entry id is "<track>/<slug>". The URL slug is the filename only
 * (last path segment). Prev/next is ordered by frontmatter `order` within a track.
 */
import { getCollection, type CollectionEntry } from 'astro:content';
import { DEFAULT_LOCALE, type Locale } from '../../i18n/config';
import { estimateReadingTime } from '../../i18n/blog';

export { estimateReadingTime };

export interface LocalizedGuide {
  entry: CollectionEntry<'guides'>;
  slug: string;
}

function slugFromId(id: string): string {
  return id.split('/').pop() ?? id;
}

export async function getGuidesForLocale(lang: Locale): Promise<LocalizedGuide[]> {
  const entries = await getCollection(
    'guides',
    (e) => !e.data.draft && (e.data.lang ?? DEFAULT_LOCALE) === lang,
  );
  return entries
    .map((entry) => ({ entry, slug: slugFromId(entry.id) }))
    .sort(
      (a, b) =>
        a.entry.data.track.localeCompare(b.entry.data.track) ||
        a.entry.data.order - b.entry.data.order,
    );
}

export function getGuidesByTrack(track: string, all: LocalizedGuide[]): LocalizedGuide[] {
  return all
    .filter((g) => g.entry.data.track === track)
    .sort((a, b) => a.entry.data.order - b.entry.data.order);
}

export function getPrevNextInTrack(
  current: LocalizedGuide,
  all: LocalizedGuide[],
): { prev: LocalizedGuide | null; next: LocalizedGuide | null } {
  const sameTrack = getGuidesByTrack(current.entry.data.track, all);
  const idx = sameTrack.findIndex((g) => g.slug === current.slug);
  if (idx === -1) return { prev: null, next: null };
  return {
    prev: idx > 0 ? sameTrack[idx - 1] : null,
    next: idx < sameTrack.length - 1 ? sameTrack[idx + 1] : null,
  };
}

export function getRelatedGuides(
  current: LocalizedGuide,
  all: LocalizedGuide[],
  max = 3,
): LocalizedGuide[] {
  const others = all.filter((g) => g.slug !== current.slug);
  const sameTrack = others.filter((g) => g.entry.data.track === current.entry.data.track);
  const rest = others.filter((g) => g.entry.data.track !== current.entry.data.track);
  return [...sameTrack, ...rest].slice(0, max);
}

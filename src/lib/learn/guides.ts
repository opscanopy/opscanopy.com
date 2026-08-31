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

/**
 * Inverse of each guide's `relatedTools` — "which guide covers this tool?".
 *
 * Guides already declare the tools they relate to, so inverting that is
 * authoritative and self-maintaining. It replaces the hand-written
 * category→track map in ToolCrossLinks, which only covered 3 of 11 categories
 * and left 26 of 29 tools with no route into /learn.
 *
 * Returns undefined when no guide claims the tool — callers must render nothing
 * rather than inventing a link.
 *
 * When several guides claim the same tool, `order` alone is not enough to choose:
 * every track's entry point is `order: 1`, so the tie fell to whatever order the
 * caller happened to pass them in (alphabetical by track). Both
 * `aws-for-devops-engineers` and `networking-for-devops` are `order: 1` and both
 * list `subnet-calculator`, so `/subnet-calculator/` advertised the **AWS** guide.
 * Passing the tool's `category` lets a matching track win first, which is the
 * relevance signal that was missing.
 */
export function getGuideForTool(
  toolSlug: string,
  all: LocalizedGuide[],
  category?: string,
): LocalizedGuide | undefined {
  const claiming = all.filter((g) => (g.entry.data.relatedTools ?? []).includes(toolSlug));
  if (claiming.length === 0) return undefined;

  // A track named for the tool's own category is the better answer than a lower
  // `order` from an unrelated track. Categories with no matching track (Encoding,
  // Security, Utilities, …) fall through to the original lowest-`order` rule.
  const track = category?.toLowerCase();
  const onTrack = track ? claiming.filter((g) => g.entry.data.track === track) : [];
  const pool = onTrack.length > 0 ? onTrack : claiming;

  return [...pool].sort((a, b) => a.entry.data.order - b.entry.data.order)[0];
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

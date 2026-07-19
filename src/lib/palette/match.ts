/**
 * Registry-driven fuzzy matcher for the command palette. Pure, synchronous,
 * dependency-free — the palette needs to feel instant and work fully offline,
 * so this is NOT Pagefind (async network chunks, prose-oriented) but a small
 * scorer purpose-built for the ~25-entry tool registry.
 *
 * Match-type tier (checked per field, highest wins): prefix > word-boundary >
 * subsequence. Field tier (checked per match-type, highest wins): name >
 * keywords > tagline > category. A pin/recency boost is added on top, scaled
 * small enough to only break ties between otherwise-equal text-match tiers —
 * it never promotes a worse text match over a better one.
 */

export interface PaletteItem {
  id: string;
  name: string;
  keywords: string[];
  tagline: string;
  category: string;
}

export interface PaletteBoost {
  /** Pinned item ids. */
  pinned?: string[];
  /** Recent item ids, most-recent first — index 0 gets the biggest boost. */
  recents?: string[];
}

export interface PaletteMatch {
  id: string;
  score: number;
}

type MatchType = 'prefix' | 'wordBoundary' | 'subsequence' | 'none';

const MATCH_TYPE_SCORE: Record<MatchType, number> = {
  prefix: 3,
  wordBoundary: 2,
  subsequence: 1,
  none: 0,
};

const FIELD_SCORE = { name: 4, keywords: 3, tagline: 2, category: 1 } as const;

const PIN_BOOST = 2;
const MAX_RECENT_BOOST = 1.9;
const RECENT_BOOST_STEP = 0.2;

/** True if every character of `needle` appears in `haystack`, in order (not necessarily contiguous). */
function isSubsequence(needle: string, haystack: string): boolean {
  let i = 0;
  for (let j = 0; j < haystack.length && i < needle.length; j++) {
    if (haystack[j] === needle[i]) i++;
  }
  return i === needle.length;
}

/** Best match tier for `query` against a single lowercased `field` value. */
function fieldMatchType(query: string, field: string): MatchType {
  if (!field) return 'none';
  if (field.startsWith(query)) return 'prefix';
  const words = field.split(/[^a-z0-9]+/i).filter(Boolean);
  if (words.some((w) => w.startsWith(query))) return 'wordBoundary';
  if (isSubsequence(query, field)) return 'subsequence';
  return 'none';
}

function bestFieldScore(query: string, field: string, fieldWeight: number): number {
  const type = fieldMatchType(query, field);
  if (type === 'none') return 0;
  return MATCH_TYPE_SCORE[type] * 10 + fieldWeight;
}

/** Score one item against a lowercased, trimmed `query`, or null when nothing matches. */
function scoreItem(item: PaletteItem, query: string): number | null {
  const scores = [
    bestFieldScore(query, item.name.toLowerCase(), FIELD_SCORE.name),
    ...item.keywords.map((k) => bestFieldScore(query, k.toLowerCase(), FIELD_SCORE.keywords)),
    bestFieldScore(query, item.tagline.toLowerCase(), FIELD_SCORE.tagline),
    bestFieldScore(query, item.category.toLowerCase(), FIELD_SCORE.category),
  ];
  const best = Math.max(...scores);
  return best > 0 ? best : null;
}

function boostFor(id: string, boost: PaletteBoost | undefined): number {
  if (!boost) return 0;
  if (boost.pinned?.includes(id)) return PIN_BOOST;
  const idx = boost.recents?.indexOf(id) ?? -1;
  if (idx === -1) return 0;
  return Math.max(0, MAX_RECENT_BOOST - idx * RECENT_BOOST_STEP);
}

/**
 * Rank `items` against `query`. An empty/whitespace query returns every item
 * ordered by boost alone (pinned first, then recents by recency, then
 * registry order) — the palette's "browse" state before the user types
 * anything. Ties within the same text-match tier are broken by boost, never
 * the other way around: boost is scaled far below one tier step.
 */
export function matchPalette(
  items: PaletteItem[],
  query: string,
  boost?: PaletteBoost,
): PaletteMatch[] {
  const q = query.trim().toLowerCase();

  if (!q) {
    return items
      .map((item, index) => ({ id: item.id, score: boostFor(item.id, boost) * 1000 - index }))
      .sort((a, b) => b.score - a.score);
  }

  const results: PaletteMatch[] = [];
  for (const item of items) {
    const textScore = scoreItem(item, q);
    if (textScore === null) continue;
    results.push({ id: item.id, score: textScore * 100 + boostFor(item.id, boost) });
  }
  return results.sort((a, b) => b.score - a.score);
}

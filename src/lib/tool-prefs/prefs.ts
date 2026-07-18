/**
 * Tool preferences — pins & recents. One versioned localStorage blob
 * (`oc-tools-v1`), read/written only through this pure module. Recents are
 * recorded on the FIRST real playground interaction per page view (see
 * Layout.astro's capture-phase listener, which mirrors its existing
 * `tool_engaged` gating) — a bounce that never touches the playground never
 * pollutes the shelf. Never throws; malformed entries are dropped, valid
 * ones kept.
 *
 * No live-sync across tabs/windows: every caller reads the CURRENT
 * localStorage value at the moment of its own read-modify-write (page load
 * for a shelf's reveal, click time for the pin toggle), last-writer-wins,
 * no merge. A shelf rendered before a pin/unpin elsewhere on the same page
 * goes stale until the next re-render; two tabs open at once can each read
 * a state the other has since changed. This is an accepted tradeoff, not an
 * oversight — a full sync layer is out of scope for a preference this low-
 * stakes (worst case: a pin toggle from a stale read, easily redone).
 */

export const TOOL_PREFS_KEY = 'oc-tools-v1';

export interface RecentEntry {
  slug: string;
  /** ISO timestamp of the interaction that recorded this entry. */
  at: string;
}

export interface ToolPrefs {
  v: 1;
  pins: string[];
  recents: RecentEntry[];
}

const MAX_PINS = 10;
const MAX_RECENTS = 8;

const EMPTY: ToolPrefs = { v: 1, pins: [], recents: [] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Real tool slugs never collide with these — reject them explicitly rather
 *  than trust the regex alone, since callers key plain objects/Maps by slug
 *  and a value like "constructor" can otherwise reach Object.prototype. */
const RESERVED = new Set(['constructor', 'prototype', '__proto__']);

/** True for a plausible tool slug: lowercase letters, digits, internal hyphens. */
function isSlug(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[a-z0-9]+(-[a-z0-9]+)*$/.test(value) &&
    !RESERVED.has(value)
  );
}

function parsePins(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const v of value) {
    if (isSlug(v) && !out.includes(v)) out.push(v);
    if (out.length >= MAX_PINS) break;
  }
  return out;
}

function parseRecents(value: unknown): RecentEntry[] {
  if (!Array.isArray(value)) return [];
  const out: RecentEntry[] = [];
  for (const v of value) {
    if (
      isRecord(v) &&
      isSlug(v.slug) &&
      typeof v.at === 'string' &&
      !Number.isNaN(Date.parse(v.at))
    ) {
      out.push({ slug: v.slug, at: v.at });
    }
    if (out.length >= MAX_RECENTS) break;
  }
  return out;
}

/** Defensively parse the raw localStorage string. Never throws: null, empty,
 *  non-JSON garbage, arrays, and wrong-shaped JSON all salvage to empty. */
export function parseToolPrefs(raw: string | null): ToolPrefs {
  if (raw === null || raw === '') return EMPTY;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return EMPTY;
  }
  if (!isRecord(parsed)) return EMPTY;
  return {
    v: 1,
    pins: parsePins(parsed.pins),
    recents: parseRecents(parsed.recents),
  };
}

export function serializeToolPrefs(prefs: ToolPrefs): string {
  return JSON.stringify(prefs);
}

/** True when `slug` is pinned. */
export function isPinned(prefs: ToolPrefs, slug: string): boolean {
  return prefs.pins.includes(slug);
}

/**
 * Toggle a pin. A newly-pinned slug goes to the FRONT (most recently pinned
 * first) and the list is capped at MAX_PINS, silently dropping the oldest
 * pin rather than refusing the new one.
 */
export function togglePin(prefs: ToolPrefs, slug: string): ToolPrefs {
  if (!isSlug(slug)) return prefs;
  if (prefs.pins.includes(slug)) {
    return { ...prefs, pins: prefs.pins.filter((s) => s !== slug) };
  }
  return { ...prefs, pins: [slug, ...prefs.pins].slice(0, MAX_PINS) };
}

/**
 * Record a recent — moves `slug` to the front (deduplicating any earlier
 * entry for the same tool) and caps the list at MAX_RECENTS.
 */
export function recordRecent(prefs: ToolPrefs, slug: string, atIso: string): ToolPrefs {
  if (!isSlug(slug)) return prefs;
  const filtered = prefs.recents.filter((r) => r.slug !== slug);
  return { ...prefs, recents: [{ slug, at: atIso }, ...filtered].slice(0, MAX_RECENTS) };
}

/**
 * Recent slugs NOT currently pinned, most-recent first — so a shelf
 * rendering "Pinned" + "Recent" sections never shows the same tool twice.
 */
export function unpinnedRecentSlugs(prefs: ToolPrefs): string[] {
  return prefs.recents.filter((r) => !prefs.pins.includes(r.slug)).map((r) => r.slug);
}

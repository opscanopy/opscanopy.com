/**
 * Auto-restore-last-input — one versioned localStorage blob (`oc-last-v1`)
 * keyed by tool slug, holding the most recent input per tool so a returning
 * visitor doesn't retype it. LRU-capped at 12 distinct tools (oldest-touched
 * slug evicted first); a value over the 16KB skip-write cap is never written
 * (the store is left as it was — a huge paste just doesn't get remembered,
 * it doesn't fail or truncate silently-wrong).
 *
 * Privacy-first by construction: this module is never imported by the four
 * HARD-excluded tools (jwt-decoder, hash-generator, base64-encoder-decoder,
 * env-example-checker) — see [[snapshots]] for their explicit-consent-only
 * "Save snapshot" alternative instead.
 */

export const LAST_INPUT_KEY = 'oc-last-v1';

const MAX_SLUGS = 12;
const MAX_VALUE_BYTES = 16 * 1024;

export interface LastInputEntry {
  value: string;
  at: string;
}

export interface LastInputStore {
  v: 1;
  entries: Record<string, LastInputEntry>;
}

const EMPTY: LastInputStore = { v: 1, entries: {} };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Real tool slugs never collide with these — reject explicitly (see tool-prefs/prefs.ts). */
const RESERVED = new Set(['constructor', 'prototype', '__proto__']);

function isSlug(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[a-z0-9]+(-[a-z0-9]+)*$/.test(value) &&
    !RESERVED.has(value)
  );
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}

/** Defensively parse the raw localStorage string. Never throws. */
export function parseLastInputStore(raw: string | null): LastInputStore {
  if (raw === null || raw === '') return EMPTY;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return EMPTY;
  }
  if (!isRecord(parsed) || !isRecord(parsed.entries)) return EMPTY;
  const entries: Record<string, LastInputEntry> = {};
  for (const [slug, v] of Object.entries(parsed.entries)) {
    if (!isSlug(slug) || !isRecord(v)) continue;
    if (typeof v.value !== 'string') continue;
    if (typeof v.at !== 'string' || Number.isNaN(Date.parse(v.at))) continue;
    entries[slug] = { value: v.value, at: v.at };
  }
  return { v: 1, entries };
}

export function serializeLastInputStore(store: LastInputStore): string {
  return JSON.stringify(store);
}

/**
 * Record `value` as the last input for `slug`. A value over MAX_VALUE_BYTES
 * is a no-op (store returned unchanged) — never written, never truncated.
 * When recording pushes distinct slugs past MAX_SLUGS, the least-recently-
 * touched slug (oldest `at`) is evicted.
 */
export function recordLastInput(
  store: LastInputStore,
  slug: string,
  value: string,
  atIso: string,
): LastInputStore {
  if (!isSlug(slug)) return store;
  if (byteLength(value) > MAX_VALUE_BYTES) return store;

  const withoutSlug = Object.fromEntries(
    Object.entries(store.entries).filter(([s]) => s !== slug),
  );
  const nextEntries = { ...withoutSlug, [slug]: { value, at: atIso } };

  const slugs = Object.keys(nextEntries);
  if (slugs.length <= MAX_SLUGS) return { v: 1, entries: nextEntries };

  const sortedOldestFirst = Object.entries(nextEntries).sort((a, b) =>
    a[1].at < b[1].at ? -1 : a[1].at > b[1].at ? 1 : 0,
  );
  const kept = sortedOldestFirst.slice(sortedOldestFirst.length - MAX_SLUGS);
  return { v: 1, entries: Object.fromEntries(kept) };
}

/** The last input recorded for `slug`, or null if none / malformed slug. */
export function getLastInput(store: LastInputStore, slug: string): string | null {
  if (!isSlug(slug)) return null;
  return store.entries[slug]?.value ?? null;
}

/**
 * Explicit "Save snapshot" — one versioned localStorage blob (`oc-snap-v1`),
 * available on EVERY tool (including the four HARD-excluded from auto-
 * restore, with a warning caption there): a user action is consent, unlike
 * [[last-input]]'s automatic save. Capped at 30 snapshots total; a single
 * snapshot over 24KB is rejected (never truncated). Oldest-first eviction
 * both when the 30-snapshot cap is hit and when the browser's storage quota
 * itself is exceeded (retried once after evicting the oldest — see
 * `writeSnapshotStore`, the DOM-touching half, untested here like every
 * other storage-writing wrapper in this codebase; verified via Playwright).
 */

export const SNAPSHOT_KEY = 'oc-snap-v1';

const MAX_SNAPSHOTS = 30;
const MAX_SNAPSHOT_BYTES = 24 * 1024;

export interface Snapshot {
  slug: string;
  value: string;
  at: string;
}

export interface SnapshotStore {
  v: 1;
  snapshots: Snapshot[];
}

const EMPTY: SnapshotStore = { v: 1, snapshots: [] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

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
export function parseSnapshotStore(raw: string | null): SnapshotStore {
  if (raw === null || raw === '') return EMPTY;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return EMPTY;
  }
  if (!isRecord(parsed) || !Array.isArray(parsed.snapshots)) return EMPTY;
  const snapshots: Snapshot[] = [];
  for (const s of parsed.snapshots) {
    if (!isRecord(s)) continue;
    if (!isSlug(s.slug)) continue;
    if (typeof s.value !== 'string') continue;
    if (typeof s.at !== 'string' || Number.isNaN(Date.parse(s.at))) continue;
    snapshots.push({ slug: s.slug, value: s.value, at: s.at });
    if (snapshots.length >= MAX_SNAPSHOTS) break;
  }
  return { v: 1, snapshots };
}

export function serializeSnapshotStore(store: SnapshotStore): string {
  return JSON.stringify(store);
}

/**
 * Add a snapshot, newest-first. A value over MAX_SNAPSHOT_BYTES is rejected
 * (store returned unchanged — never truncated). Past the 30-snapshot cap,
 * the oldest snapshot (by `at`, across ALL tools — this is one shared cap,
 * not per-tool) is dropped.
 */
export function addSnapshot(
  store: SnapshotStore,
  slug: string,
  value: string,
  atIso: string,
): SnapshotStore {
  if (!isSlug(slug)) return store;
  if (byteLength(value) > MAX_SNAPSHOT_BYTES) return store;

  const next = [{ slug, value, at: atIso }, ...store.snapshots];
  if (next.length <= MAX_SNAPSHOTS) return { v: 1, snapshots: next };

  const oldestIndex = next.reduce(
    (oldest, s, i) => (s.at < next[oldest].at ? i : oldest),
    0,
  );
  next.splice(oldestIndex, 1);
  return { v: 1, snapshots: next };
}

/** Remove one snapshot by its position in the store's array. */
export function removeSnapshotAt(store: SnapshotStore, index: number): SnapshotStore {
  if (index < 0 || index >= store.snapshots.length) return store;
  const snapshots = store.snapshots.slice();
  snapshots.splice(index, 1);
  return { v: 1, snapshots };
}

/** Snapshots for one tool, newest-first (matches storage order — see addSnapshot). */
export function snapshotsForSlug(store: SnapshotStore, slug: string): Snapshot[] {
  return store.snapshots.filter((s) => s.slug === slug);
}

/**
 * "Delete everything OpsCanopy stored on this device" — the erase half of the
 * /privacy key inventory. Covers the three keys that can hold something the
 * visitor PASTED into a tool:
 *
 *   oc-last-v1    [[last-input]]  automatic, per-tool last input
 *   oc-snap-v1    [[snapshots]]   explicitly saved snapshots
 *   oc-handoff-v1 [[handoff]]     a one-time cross-tool transfer, sessionStorage
 *
 * Deliberately NOT touched: `theme`, `oc-analytics-consent`, `oc-m90-v1`
 * (earned Mission 90 progress), `oc-tools-v1`, roadmap/guide keys. Those are
 * settings and progress, not pasted data — wiping someone's 90-day streak
 * because they wanted their clipboard history gone would be a nasty surprise,
 * and "clear site data" in the browser already covers the everything case.
 *
 * Storage objects are parameters rather than the globals so the logic stays
 * unit-testable under this project's node-environment vitest config — the same
 * split every other module here uses (see [[last-input]]'s note on wire.ts).
 * Every access is individually guarded: Safari in private mode and hardened
 * enterprise profiles throw SecurityError on plain property reads.
 */
import { LAST_INPUT_KEY } from './last-input';
import { SNAPSHOT_KEY } from './snapshots';
import { HANDOFF_KEY } from './handoff';

export interface PurgeTargets {
  local: Storage;
  session: Storage;
}

export interface StoredInputSummary {
  /** How many distinct tools have a remembered last input. */
  lastInputTools: number;
  /** How many saved snapshots exist, across all tools. */
  snapshots: number;
  /** Whether a one-time cross-tool handoff is sitting in this tab. */
  handoff: boolean;
}

const NOTHING: StoredInputSummary = { lastInputTools: 0, snapshots: 0, handoff: false };

function read(storage: Storage, key: string): string | null {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

function remove(storage: Storage, key: string): void {
  try {
    storage.removeItem(key);
  } catch {
    /* storage blocked — there was nothing we could have written either */
  }
}

/** Count `raw` via `count`, treating absent/corrupt JSON as zero. Never throws. */
function countIn(raw: string | null, count: (parsed: unknown) => number): number {
  if (raw === null || raw === '') return 0;
  try {
    return count(JSON.parse(raw));
  } catch {
    return 0;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** What is stored right now, for a "this will delete N things" confirmation. */
export function summarizeStoredInputs(targets: PurgeTargets): StoredInputSummary {
  const { local, session } = targets;
  return {
    lastInputTools: countIn(read(local, LAST_INPUT_KEY), (p) =>
      isRecord(p) && isRecord(p.entries) ? Object.keys(p.entries).length : 0,
    ),
    snapshots: countIn(read(local, SNAPSHOT_KEY), (p) =>
      isRecord(p) && Array.isArray(p.snapshots) ? p.snapshots.length : 0,
    ),
    handoff: read(session, HANDOFF_KEY) !== null,
  };
}

/**
 * Delete the three input-bearing keys and return what was there, so the caller
 * can report it without having to summarize first (and without a race between
 * the two calls).
 */
export function purgeStoredInputs(targets: PurgeTargets): StoredInputSummary {
  let summary: StoredInputSummary;
  try {
    summary = summarizeStoredInputs(targets);
  } catch {
    summary = NOTHING;
  }
  remove(targets.local, LAST_INPUT_KEY);
  remove(targets.local, SNAPSHOT_KEY);
  remove(targets.session, HANDOFF_KEY);
  return summary;
}

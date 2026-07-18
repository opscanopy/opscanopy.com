/**
 * Mission 90 backup-file + backup-nudge helpers — pure, DOM-free.
 *
 * Owns the tiny `oc-m90-backup-meta` localStorage memo (when the learner last
 * backed up their progress or dismissed the backup nudge). Deliberately a
 * SEPARATE key from the `oc-m90-v1` progress blob: progress.ts owns that
 * schema, and mixing UI memory into it would churn its salvage rules for zero
 * learner value. Page scripts do the actual localStorage I/O; this module
 * only parses and decides.
 */

import { doneCount, type M90Progress } from './progress';

export const BACKUP_META_KEY = 'oc-m90-backup-meta';

/**
 * Mirrors importProgress's deliberate emptiness rule (see progress.ts): a
 * code exported from this state would be REJECTED by the Restore box, so the
 * backup file must not promise it restores. lastVisitedDay/pace alone do not
 * count — that is the pinned spec, not an oversight.
 */
export function isRestorableProgress(p: M90Progress): boolean {
  return doneCount(p) > 0 || Object.keys(p.missions).length > 0 || Boolean(p.startedAt);
}

export interface BackupMeta {
  /** ISO timestamp of the last successful backup (code copy or file download). */
  backedUpAt?: string;
  /** Fully-completed phase count at that backup. */
  backedUpPhases?: number;
  /** ISO timestamp of the last nudge dismissal. */
  dismissedAt?: string;
  /** Fully-completed phase count at that dismissal. */
  dismissedPhases?: number;
}

/**
 * Defensively parse the raw localStorage string. Never throws: null, empty,
 * non-JSON garbage, arrays, and wrong-typed fields all salvage to {} or to
 * the subset of well-typed fields.
 */
export function parseBackupMeta(raw: string | null): BackupMeta {
  if (raw === null || raw === '') return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
  const rec = parsed as Record<string, unknown>;
  const meta: BackupMeta = {};
  if (typeof rec.backedUpAt === 'string') meta.backedUpAt = rec.backedUpAt;
  if (typeof rec.backedUpPhases === 'number') meta.backedUpPhases = rec.backedUpPhases;
  if (typeof rec.dismissedAt === 'string') meta.dismissedAt = rec.dismissedAt;
  if (typeof rec.dismissedPhases === 'number') meta.dismissedPhases = rec.dismissedPhases;
  return meta;
}

export function serializeBackupMeta(meta: BackupMeta): string {
  return JSON.stringify(meta);
}

/** Days of progress a learner must have before the nudge is worth showing. */
export const NUDGE_MIN_DONE = 5;

/** A backup or dismissal older than this no longer silences the nudge. */
export const NUDGE_STALE_DAYS = 10;

export function backupFileName(dateStr: string): string {
  return `opscanopy-mission90-backup-${dateStr}.txt`;
}

/**
 * The downloadable backup file: three instruction lines, then the code.
 * `restorable: false` (nothing completed/started yet — see
 * isRestorableProgress) swaps the restore promise for an honest heads-up,
 * because the Restore box would reject the embedded code.
 */
export function backupFileText(code: string, restorable = true): string {
  const instruction = restorable
    ? 'To restore: open opscanopy.com/mission-90/ on the other browser or device, expand "Back up or restore your progress", paste the code below, and press Restore.'
    : 'Heads up: no completed day, mission, or program start was recorded when this file was saved, so the Restore box will reject the code below. Mark at least one day done, then download a fresh backup.';
  return [
    'OpsCanopy Mission 90 — progress backup file.',
    instruction,
    'This file contains only your local progress ticks — no personal data.',
    '',
    code,
    '',
  ].join('\n');
}

/**
 * Whether the hub should show the backup nudge. True only when the learner
 * has meaningful progress (≥ NUDGE_MIN_DONE days) AND both the last backup
 * and the last dismissal are stale — missing, older than NUDGE_STALE_DAYS,
 * or from before a phase the learner has since fully completed.
 */
export function shouldNudgeBackup(input: {
  done: number;
  phasesDone: number;
  nowIso: string;
  meta: BackupMeta;
}): boolean {
  const { done, phasesDone, nowIso, meta } = input;
  if (done < NUDGE_MIN_DONE) return false;
  return (
    markIsStale(meta.backedUpAt, meta.backedUpPhases, phasesDone, nowIso) &&
    markIsStale(meta.dismissedAt, meta.dismissedPhases, phasesDone, nowIso)
  );
}

function markIsStale(
  atIso: string | undefined,
  phasesAtMark: number | undefined,
  phasesDone: number,
  nowIso: string,
): boolean {
  if (!atIso) return true;
  const at = Date.parse(atIso);
  const now = Date.parse(nowIso);
  // Unparseable timestamps fail open: showing the nudge once too often is
  // cheaper than never reminding a learner whose meta got corrupted.
  if (!Number.isFinite(at) || !Number.isFinite(now)) return true;
  // Future timestamps (clock skew at write time) fail open the same way —
  // otherwise a once-wrong clock could silence the nudge for months.
  if (at > now) return true;
  if (now - at >= NUDGE_STALE_DAYS * 86_400_000) return true;
  // A whole phase completed since the mark = a new milestone worth protecting.
  if (phasesDone > (phasesAtMark ?? 0)) return true;
  return false;
}

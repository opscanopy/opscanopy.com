import { describe, expect, it } from 'vitest';
import {
  BACKUP_META_KEY,
  NUDGE_MIN_DONE,
  NUDGE_STALE_DAYS,
  backupFileName,
  backupFileText,
  isRestorableProgress,
  parseBackupMeta,
  serializeBackupMeta,
  shouldNudgeBackup,
} from './backup';

const NOW = '2026-07-18T12:00:00.000Z';
const daysAgo = (n: number) => new Date(Date.parse(NOW) - n * 86_400_000).toISOString();

describe('parseBackupMeta', () => {
  it('yields {} for null, empty, garbage, and non-object JSON', () => {
    expect(parseBackupMeta(null)).toEqual({});
    expect(parseBackupMeta('')).toEqual({});
    expect(parseBackupMeta('not json')).toEqual({});
    expect(parseBackupMeta('[1,2]')).toEqual({});
    expect(parseBackupMeta('"just a string"')).toEqual({});
  });

  it('keeps only well-typed known fields and drops the rest', () => {
    const raw = JSON.stringify({
      backedUpAt: NOW,
      backedUpPhases: 2,
      dismissedAt: 42,
      dismissedPhases: 'three',
      extra: true,
    });
    expect(parseBackupMeta(raw)).toEqual({ backedUpAt: NOW, backedUpPhases: 2 });
  });

  it('round-trips through serializeBackupMeta', () => {
    const meta = { backedUpAt: NOW, backedUpPhases: 1, dismissedAt: NOW, dismissedPhases: 0 };
    expect(parseBackupMeta(serializeBackupMeta(meta))).toEqual(meta);
  });
});

describe('shouldNudgeBackup', () => {
  const base = { phasesDone: 0, nowIso: NOW, meta: {} };

  it('never nudges below the progress threshold, even with no meta at all', () => {
    expect(shouldNudgeBackup({ ...base, done: 0 })).toBe(false);
    expect(shouldNudgeBackup({ ...base, done: NUDGE_MIN_DONE - 1 })).toBe(false);
  });

  it('nudges at the threshold when nothing was ever backed up or dismissed', () => {
    expect(shouldNudgeBackup({ ...base, done: NUDGE_MIN_DONE })).toBe(true);
  });

  it('a fresh backup silences it; a stale one does not', () => {
    expect(
      shouldNudgeBackup({ ...base, done: 10, meta: { backedUpAt: daysAgo(2), backedUpPhases: 0 } }),
    ).toBe(false);
    expect(
      shouldNudgeBackup({
        ...base,
        done: 10,
        meta: { backedUpAt: daysAgo(NUDGE_STALE_DAYS + 1), backedUpPhases: 0 },
      }),
    ).toBe(true);
  });

  it('a fresh dismissal silences it independently of any backup', () => {
    expect(
      shouldNudgeBackup({ ...base, done: 10, meta: { dismissedAt: daysAgo(1), dismissedPhases: 0 } }),
    ).toBe(false);
  });

  it('completing a whole new phase re-arms the nudge past a fresh mark', () => {
    expect(
      shouldNudgeBackup({
        ...base,
        done: 20,
        phasesDone: 1,
        meta: { backedUpAt: daysAgo(1), backedUpPhases: 0 },
      }),
    ).toBe(true);
    expect(
      shouldNudgeBackup({
        ...base,
        done: 20,
        phasesDone: 1,
        meta: { dismissedAt: daysAgo(1), dismissedPhases: 1 },
      }),
    ).toBe(false);
  });

  it('unparseable timestamps count as stale (fail open — nudge shown)', () => {
    expect(
      shouldNudgeBackup({ ...base, done: 10, meta: { backedUpAt: 'not-a-date', backedUpPhases: 0 } }),
    ).toBe(true);
  });

  it('future timestamps count as stale too (clock skew fails open)', () => {
    expect(
      shouldNudgeBackup({ ...base, done: 10, meta: { backedUpAt: daysAgo(-30), backedUpPhases: 0 } }),
    ).toBe(true);
  });

  it('a mark missing its phase count treats it as 0, so any completed phase re-arms', () => {
    expect(
      shouldNudgeBackup({ ...base, done: 20, phasesDone: 1, meta: { backedUpAt: daysAgo(1) } }),
    ).toBe(true);
  });
});

describe('backup file artifacts', () => {
  it('names the file with the date', () => {
    expect(backupFileName('2026-07-18')).toBe('opscanopy-mission90-backup-2026-07-18.txt');
  });

  it('embeds the code below the restore instructions', () => {
    const text = backupFileText('CODE123');
    expect(text).toContain('CODE123');
    expect(text).toContain('opscanopy.com/mission-90/');
    expect(text.indexOf('CODE123')).toBeGreaterThan(text.indexOf('To restore:'));
  });

  it('exports the storage key page scripts write under', () => {
    expect(BACKUP_META_KEY).toBe('oc-m90-backup-meta');
  });

  it('swaps the restore promise for a heads-up when the state is not restorable', () => {
    const text = backupFileText('CODE123', false);
    expect(text).toContain('CODE123');
    expect(text).not.toContain('To restore:');
    expect(text).toContain('will reject the code below');
  });
});

describe('isRestorableProgress', () => {
  const day = { completedAt: '2026-07-01T10:00:00.000Z' };

  it('mirrors importProgress: days, missions, or startedAt make a blob restorable', () => {
    expect(isRestorableProgress({ days: { '1': day }, missions: {} })).toBe(true);
    expect(
      isRestorableProgress({
        days: {},
        missions: { m: { completedAt: day.completedAt, commands: 1, hints: 0, seconds: 60 } },
      }),
    ).toBe(true);
    expect(isRestorableProgress({ days: {}, missions: {}, startedAt: day.completedAt })).toBe(true);
  });

  it('lastVisitedDay/pace alone are NOT restorable (the pinned importProgress spec)', () => {
    expect(isRestorableProgress({ days: {}, missions: {} })).toBe(false);
    expect(isRestorableProgress({ days: {}, missions: {}, lastVisitedDay: 3 })).toBe(false);
    expect(
      isRestorableProgress({ days: {}, missions: {}, pace: { daysPerWeek: 5, startDate: '2026-01-01' } }),
    ).toBe(false);
  });
});

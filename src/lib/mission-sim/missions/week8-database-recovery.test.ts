/**
 * Config-validation + playthrough tests for the Week 8 mission ("Database
 * Recovery"), a config-only restore-then-verify: the fix is a SCRIPTED
 * `aws rds restore-db-instance-from-db-snapshot …` whose effect flips a flag,
 * appends a success line to the (evidence-preserving) incident log, and writes
 * a separate status marker. Verification is a DIAGNOSTIC, effect-free `psql`
 * that is deliberately two-faced: an `err` before the restore (completes
 * nothing), an out line naming `orders` after it (completes the verify) — the
 * gate is enforced entirely by the engine's "any err line completes nothing"
 * rule + the pre-fix flag, with zero engine domain logic.
 *
 * ISLAND CONTRACT: imports ONLY the engine façade, the mission config, and the
 * shared config validator (test-only shared tooling, not island code).
 */
import { describe, it, expect } from 'vitest';
import { createMission, runCommand, getStats, rankFor, readFile } from '../engine';
import type { MissionEffect, MissionState, RunResult } from '../engine';
import { validateMissionConfig } from './_validation';
import { week8DatabaseRecovery } from './week8-database-recovery';

const config = week8DatabaseRecovery;

const RESTORE =
  'aws rds restore-db-instance-from-db-snapshot ' +
  '--db-instance-identifier prod-db-restored ' +
  '--db-snapshot-identifier rds:prod-db-2026-07-10-06-00';
const VERIFY = 'psql -c "select count(*) from orders;"';

/** Every effect authored anywhere in config.commands (responses + defaults). */
function allEffects(): MissionEffect[] {
  const effects: MissionEffect[] = [];
  for (const sc of Object.values(config.commands ?? {})) {
    for (const r of sc.responses ?? []) if (r.effect) effects.push(r.effect);
    if (sc.default?.effect) effects.push(sc.default.effect);
  }
  return effects;
}

describe('week8-database-recovery — config validation', () => {
  it('has the canonical identity fields', () => {
    expect(config.id).toBe('week8-database-recovery');
    expect(config.title).toBe('Database Recovery');
    expect(config.week).toBe(8);
    expect(config.unlockAfterDay).toBe(56);
    expect(config.promptUser).toBe('ops');
    expect(config.promptHost).toBe('ops-jump-01');
    expect(config.optimalCommands).toBe(6);
  });

  it('passes every shared mission-config guard', () => {
    // Trigger-cmd support, scripted-verb dispatch (G6), effect write paths (G7),
    // err+effect, state-based whens on mutating verbs, evidence protection
    // (G8/G8b), processStarted sanity (G9), hints/story shape, flag seeding.
    expect(validateMissionConfig(config)).toEqual([]);
  });

  // ── week8-specific domain facts the generic validator cannot know ─────────

  it('the hints point at the real evidence files and teach the exact fix', () => {
    const hints = config.hints.join(' ');
    expect(hints).toContain('~/db/incident.log');
    expect(hints).toContain('~/db/snapshots.txt');
    expect(hints).toContain(RESTORE);
  });

  it('the fix appends to the evidence log (never overwrites it) and writes a separate status', () => {
    const appendPaths = allEffects().flatMap((e) => Object.keys(e.appendFiles ?? {}));
    expect(appendPaths).toContain('~/db/incident.log');
    const writePaths = allEffects().flatMap((e) => Object.keys(e.writeFiles ?? {}));
    expect(writePaths).not.toContain('~/db/incident.log');
    expect(writePaths).toContain('~/db/status');
  });

  it('this mission remediates without killing — no effect removes a pid', () => {
    for (const eff of allEffects()) {
      expect(eff.removePids ?? []).toEqual([]);
    }
  });

  it('the verify verb (psql) is purely diagnostic — it carries no effect at all', () => {
    const psql = config.commands!.psql;
    for (const r of psql.responses ?? []) expect(r.effect).toBeUndefined();
    expect(psql.default?.effect).toBeUndefined();
  });

  it('the evidence strings are distinct and not cross-contaminated between files', () => {
    const log = readFile(config.filesystem, '~/db/incident.log');
    const snaps = readFile(config.filesystem, '~/db/snapshots.txt');
    expect(log).not.toBeNull();
    expect(snaps).not.toBeNull();
    // Each file carries its OWN objective's evidence…
    expect(log!).toContain('DROP TABLE orders');
    expect(snaps!).toContain('rds:prod-db-2026-07-10-06-00');
    // …and NOT the other's — so a single cat/grep cannot complete both reads.
    expect(log!).not.toContain('rds:prod-db-2026-07-10-06-00');
    expect(snaps!).not.toContain('DROP TABLE orders');
  });
});

describe('week8-database-recovery — intended playthrough (~5 commands)', () => {
  it('reaches victory with SRE material rank via a config-only restore + verify', () => {
    let s: MissionState = createMission(config);
    let r: RunResult;

    r = runCommand(s, 'cd ~/db');
    expect(r.completed).toEqual([1]); // oriented
    s = r.state;

    r = runCommand(s, 'cat incident.log');
    expect(r.completed).toEqual([2]); // DROP TABLE orders
    s = r.state;

    r = runCommand(s, 'grep 06-00 snapshots.txt');
    expect(r.completed).toEqual([3]); // newest pre-drop snapshot
    s = r.state;

    r = runCommand(s, RESTORE);
    expect(r.completed).toEqual([4]); // restore fired
    expect(r.victory).toBe(false); // verify still pending
    expect(s.flags?.restored).toBe(false); // pre-command state unchanged
    s = r.state;

    // the restore is narrated (sys), flips the flag, appends to the log, writes status.
    const fixText = r.output.map((l) => l.text).join('\n');
    expect(fixText).toContain('prod-db-restored is available');
    expect(r.output.some((l) => l.kind === 'err')).toBe(false);
    expect(s.flags?.restored).toBe(true);

    r = runCommand(s, VERIFY);
    expect(r.completed).toEqual([5]); // orders present — verified
    expect(r.victory).toBe(true);
    s = r.state;

    const verifyText = r.output.map((l) => l.text).join('\n');
    expect(verifyText).toContain('1240132');
    expect(verifyText).toContain('orders'); // the out line objective 5 reads

    // evidence preserved (append-only) + separate status written.
    const log = readFile(s.fs, '~/db/incident.log')!;
    expect(log).toContain('DROP TABLE orders'); // original evidence intact
    expect(log).toContain('14:37:52'); // the appended success line
    expect(readFile(s.fs, '~/db/status')).toContain('RESTORED');

    const stats = getStats(s);
    expect(stats).toEqual({ commandsRun: 5, hintsUsed: 0 });
    expect(rankFor(stats, config)).toBe('SRE material');
  });
});

describe('week8-database-recovery — anti-soft-lock (verify gate + fix-first)', () => {
  it('psql before the restore errs and completes nothing; the restore alone completes only its objective', () => {
    let s: MissionState = createMission(config);

    // VERIFY BEFORE RESTORE: the table is still gone — deliberate err, and an
    // err line completes NO objective. The verify objective stays pending, and
    // the command is fully retryable (no state mutated).
    let r = runCommand(s, VERIFY);
    expect(r.completed).toEqual([]);
    expect(r.output.some((l) => l.kind === 'err')).toBe(true);
    expect(r.output.some((l) => l.text.includes('does not exist'))).toBe(true);
    expect(r.state.flags?.restored).toBe(false);
    expect(r.state.objectivesDone.some(Boolean)).toBe(false);
    s = r.state;

    // REMEDIATE FIRST (before gathering any read-evidence): completes ONLY obj 4.
    r = runCommand(s, RESTORE);
    expect(r.completed).toEqual([4]);
    expect(r.victory).toBe(false); // 1–3 and 5 still pending
    expect(r.state.flags?.restored).toBe(true);
    s = r.state;

    // The DROP TABLE orders evidence is STILL in the append-only log.
    r = runCommand(s, 'grep "DROP TABLE orders" ~/db/incident.log');
    expect(r.completed).toEqual([2]);
    s = r.state;

    // The snapshot list is unchanged — the pre-drop id is still readable.
    r = runCommand(s, 'cat ~/db/snapshots.txt');
    expect(r.completed).toEqual([3]);
    s = r.state;

    r = runCommand(s, 'cd ~/db');
    expect(r.completed).toEqual([1]);
    s = r.state;

    // NOW the verify succeeds (table is back) — completes obj 5 and wins.
    r = runCommand(s, VERIFY);
    expect(r.completed).toEqual([5]);
    expect(r.victory).toBe(true);
    expect(r.state.objectivesDone.every(Boolean)).toBe(true);
    s = r.state;

    // Re-running the restore is idempotent + honest, and never double-credits.
    const again = runCommand(s, RESTORE);
    expect(again.output.some((l) => l.text.includes('already available'))).toBe(true);
    expect(again.completed).toEqual([]);
  });
});

describe('week8-database-recovery — scrambled-order playthrough (order-independent)', () => {
  it('completes in a fully scrambled order, including a grep-piped evidence step', () => {
    let s: MissionState = createMission(config);

    // Diagnostic listing — completes nothing (obj 3 reads the file via cat/grep).
    let r = runCommand(s, 'aws rds describe-db-snapshots');
    expect(r.completed).toEqual([]);
    s = r.state;

    r = runCommand(s, 'cat ~/db/snapshots.txt | grep 06-00');
    expect(r.completed).toEqual([3]);
    s = r.state;

    r = runCommand(s, RESTORE);
    expect(r.completed).toEqual([4]);
    expect(r.victory).toBe(false);
    s = r.state;

    r = runCommand(s, VERIFY);
    expect(r.completed).toEqual([5]);
    s = r.state;

    r = runCommand(s, 'cat ~/db/incident.log');
    expect(r.completed).toEqual([2]);
    s = r.state;

    r = runCommand(s, 'cd ~/db');
    expect(r.completed).toEqual([1]);
    expect(r.victory).toBe(true);
  });
});

describe('week8-database-recovery — per-mission UX checklist', () => {
  it('≥4 progressive hints, plain-language objectives, honest defaults, exact-fix hint, help-terminated briefing', () => {
    expect(config.hints.length).toBeGreaterThanOrEqual(4);
    expect(config.hints.length).toBeGreaterThanOrEqual(config.objectives.length - 1);

    // Progressive specificity: the first hint orients (cd into ~/db), and the
    // full fix command appears ONLY in the last hint.
    expect(config.hints[0]).toContain('cd ~/db');
    const withFix = config.hints.filter((h) => h.includes(RESTORE));
    expect(withFix).toEqual([config.hints.at(-1)]);
    // The last hint teaches BOTH the restore and the verify command.
    expect(config.hints.at(-1)).toContain('psql -c "select count(*) from orders;"');

    for (const o of config.objectives) {
      expect(o.text.trim().length).toBeGreaterThan(0);
      expect(o.successLine.trim().length).toBeGreaterThan(0);
    }

    // Every scripted command has honest, non-empty output (responses + default).
    for (const sc of Object.values(config.commands ?? {})) {
      if (sc.default) {
        expect(sc.default.output.length).toBeGreaterThan(0);
        expect(sc.default.output.every((l) => l.trim().length > 0)).toBe(true);
      }
      for (const r of sc.responses ?? []) {
        expect(r.output.length).toBeGreaterThan(0);
        expect(r.output.every((l) => l.trim().length > 0)).toBe(true);
      }
    }

    // The restore response carries the effect and prints no err line.
    const aws = config.commands!.aws;
    const fix = (aws.responses ?? []).find((r) => r.effect !== undefined);
    expect(fix).toBeDefined();
    expect(fix!.effect?.setFlags?.restored).toBe(true);
    expect(fix!.outKind).not.toBe('err');

    // Briefing ends by pointing at help.
    expect(config.story.at(-1)).toContain('help');
  });

  it('psql is two-faced by flag: err before the restore, orders-bearing out line after', () => {
    // Pre-restore: err (no obj), retryable.
    const cold = createMission(config);
    const pre = runCommand(cold, VERIFY);
    expect(pre.output.some((l) => l.kind === 'err')).toBe(true);
    expect(pre.completed).toEqual([]);

    // Post-restore: an out/sys line literally contains "orders" so outputMatched fires.
    const warm = runCommand(cold, RESTORE).state;
    const post = runCommand(warm, VERIFY);
    expect(post.output.some((l) => l.kind === 'err')).toBe(false);
    expect(post.output.some((l) => (l.kind === 'out' || l.kind === 'sys') && l.text.includes('orders'))).toBe(true);
    expect(post.completed).toEqual([5]);
  });
});

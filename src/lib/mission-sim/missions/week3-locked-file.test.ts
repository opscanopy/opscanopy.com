/**
 * Config-validation + playthrough tests for the Week 3 mission ("Locked Out"),
 * the worked example proving the engine is config-only for a NON-kill fix.
 *
 * ISLAND CONTRACT: imports ONLY the engine façade, the mission config, and the
 * shared config validator — exactly what the Astro island is allowed to
 * import (the validator is test-only shared tooling, not island code).
 *
 * The generic config guards live in ./_validation (validateMissionConfig);
 * this file keeps only week3-SPECIFIC domain assertions + playthroughs.
 */
import { describe, it, expect } from 'vitest';
import { createMission, runCommand, getStats, rankFor, readFile } from '../engine';
import type { MissionEffect, MissionState, RunResult } from '../engine';
import { validateMissionConfig } from './_validation';
import { week3LockedFile } from './week3-locked-file';

const config = week3LockedFile;

/** Every effect authored anywhere in config.commands (responses + defaults). */
function allEffects(): MissionEffect[] {
  const effects: MissionEffect[] = [];
  for (const sc of Object.values(config.commands ?? {})) {
    for (const r of sc.responses ?? []) if (r.effect) effects.push(r.effect);
    if (sc.default?.effect) effects.push(sc.default.effect);
  }
  return effects;
}

describe('week3-locked-file — config validation', () => {
  it('has the canonical identity fields', () => {
    expect(config.id).toBe('week3-locked-file');
    expect(config.title).toBe('Locked Out');
    expect(config.week).toBe(3);
    expect(config.unlockAfterDay).toBe(21);
    expect(config.promptUser).toBe('student');
    expect(config.promptHost).toBe('prod-web-02');
    expect(config.optimalCommands).toBe(6);
  });

  it('passes every shared mission-config guard', () => {
    // Trigger-cmd support, scripted-verb dispatch (G6), effect write paths (G7),
    // err+effect, state-based whens on mutating verbs, evidence protection
    // (G8/G8b), processStarted sanity (G9), hints/story shape, flag seeding —
    // all factored into the shared validator; violations print in this diff.
    expect(validateMissionConfig(config)).toEqual([]);
  });

  // ── week3-specific domain facts the generic validator cannot know ─────────

  it('the hints point at the real evidence log and teach the exact fix', () => {
    const hints = config.hints.join(' ');
    expect(hints).toContain('~/logs/cron.log');
    expect(hints).toContain('chmod +x ~/deploy/deploy.sh');
  });

  it('the fix appends to the evidence log (never overwrites it)', () => {
    const appendPaths = allEffects().flatMap((e) => Object.keys(e.appendFiles ?? {}));
    expect(appendPaths).toContain('~/logs/cron.log');
    const writePaths = allEffects().flatMap((e) => Object.keys(e.writeFiles ?? {}));
    expect(writePaths).not.toContain('~/logs/cron.log');
  });

  it('this mission remediates without killing — no effect removes a pid', () => {
    for (const eff of allEffects()) {
      expect(eff.removePids ?? []).toEqual([]);
    }
  });

  it('the cron log names the failure (Permission denied) and the script', () => {
    const log = readFile(config.filesystem, '~/logs/cron.log');
    expect(log).not.toBeNull();
    expect(log!).toContain('Permission denied');
    expect(log!).toContain('deploy.sh');
  });
});

describe('week3-locked-file — intended playthrough (~6 commands)', () => {
  it('reaches victory with SRE material rank via a config-only fix', () => {
    let s: MissionState = createMission(config);
    let r: RunResult;

    r = runCommand(s, 'pwd');
    expect(r.completed).toEqual([1]);
    s = r.state;

    r = runCommand(s, 'ls');
    expect(r.completed).toEqual([2]);
    s = r.state;

    r = runCommand(s, 'cat ~/logs/cron.log');
    expect(r.completed).toEqual([3]); // "Permission denied" evidence
    s = r.state;

    r = runCommand(s, 'git log');
    expect(r.completed).toEqual([]); // investigation only — no objective
    expect(r.output.map((l) => l.text).join('\n')).toContain('modes reset to 0644');
    s = r.state;

    r = runCommand(s, 'crontab -l');
    expect(r.completed).toEqual([4]); // schedule names deploy.sh
    s = r.state;

    r = runCommand(s, 'chmod +x ~/deploy/deploy.sh');
    expect(r.completed).toEqual([5]);
    expect(r.victory).toBe(true);
    s = r.state;

    // the fix is narrated, flips the flag, appends to the log, rewrites status
    const fixText = r.output.map((l) => l.text).join('\n');
    expect(fixText).toContain('restored the execute bit');
    expect(s.flags?.deployFixed).toBe(true);
    expect(readFile(s.fs, '~/deploy/status')).toContain('OK — deploying on schedule');
    const log = readFile(s.fs, '~/logs/cron.log')!;
    expect(log).toContain('Permission denied'); // evidence preserved (append-only)
    expect(log).toContain('09:20:03'); // the appended success line

    const stats = getStats(s);
    expect(stats).toEqual({ commandsRun: 6, hintsUsed: 0 });
    expect(rankFor(stats, config)).toBe('SRE material');
  });
});

describe('week3-locked-file — anti-soft-lock (fix-first still completes the evidence objectives)', () => {
  it('fixing first does not lock out the read-the-log objective (append-only preserves it)', () => {
    let s: MissionState = createMission(config);

    // Fix BEFORE gathering any evidence.
    let r = runCommand(s, 'chmod +x ~/deploy/deploy.sh');
    expect(r.completed).toEqual([5]);
    expect(r.victory).toBe(false); // 1–4 still pending
    s = r.state;

    // The "Permission denied" evidence is STILL in the append-only log.
    r = runCommand(s, 'cat ~/logs/cron.log');
    expect(r.completed).toEqual([3]);
    s = r.state;

    r = runCommand(s, 'crontab -l');
    expect(r.completed).toEqual([4]);
    s = r.state;

    r = runCommand(s, 'pwd');
    expect(r.completed).toEqual([1]);
    s = r.state;

    r = runCommand(s, 'ls');
    expect(r.completed).toEqual([2]);
    expect(r.victory).toBe(true);
    expect(r.state.objectivesDone.every(Boolean)).toBe(true);
    s = r.state;

    // Re-running the fix is idempotent + honest, and never double-credits.
    const again = runCommand(s, 'chmod +x ~/deploy/deploy.sh');
    expect(again.output.some((l) => l.text.includes('already executable'))).toBe(true);
    expect(again.completed).toEqual([]);
  });
});

describe('week3-locked-file — scrambled-order playthrough (order-independent)', () => {
  it('completes in a fully scrambled order, including grep-based evidence', () => {
    let s: MissionState = createMission(config);

    let r = runCommand(s, 'crontab -l');
    expect(r.completed).toEqual([4]);
    s = r.state;

    r = runCommand(s, 'grep "Permission denied" ~/logs/cron.log');
    expect(r.completed).toEqual([3]);
    s = r.state;

    r = runCommand(s, 'chmod +x ~/deploy/deploy.sh');
    expect(r.completed).toEqual([5]);
    expect(r.victory).toBe(false);
    s = r.state;

    r = runCommand(s, 'ls');
    expect(r.completed).toEqual([2]);
    s = r.state;

    r = runCommand(s, 'pwd');
    expect(r.completed).toEqual([1]);
    expect(r.victory).toBe(true);
  });
});

describe('week3-locked-file — per-mission UX checklist', () => {
  it('≥4 progressive hints, plain-language objectives, honest defaults, exact-fix hint, help-terminated briefing', () => {
    expect(config.hints.length).toBeGreaterThanOrEqual(4);

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

    // The final hint teaches the exact fix.
    expect(config.hints.some((h) => h.includes('chmod +x'))).toBe(true);
    // Briefing ends by pointing at help.
    expect(config.story.at(-1)).toContain('help');
  });
});

/**
 * Config-validation + playthrough tests for the Week 7 mission ("AWS Bill Shock"),
 * a cloud cost-hygiene remediation that proves the engine is config-only for a
 * scripted third-party CLI (`aws`) used for BOTH diagnostics and the fix.
 *
 * ISLAND CONTRACT: imports ONLY the engine façade, the mission config, and the
 * shared config validator — exactly what the Astro island is allowed to import
 * (the validator is test-only shared tooling, not island code).
 *
 * Generic config guards live in ./_validation (validateMissionConfig); this
 * file keeps only week7-SPECIFIC domain assertions + playthroughs.
 */
import { describe, it, expect } from 'vitest';
import { createMission, runCommand, getStats, rankFor, readFile } from '../engine';
import type { MissionEffect, MissionState, RunResult } from '../engine';
import { validateMissionConfig } from './_validation';
import { week7AwsBillShock } from './week7-aws-bill-shock';

const config = week7AwsBillShock;

/** Every effect authored anywhere in config.commands (responses + defaults). */
function allEffects(): MissionEffect[] {
  const effects: MissionEffect[] = [];
  for (const sc of Object.values(config.commands ?? {})) {
    for (const r of sc.responses ?? []) if (r.effect) effects.push(r.effect);
    if (sc.default?.effect) effects.push(sc.default.effect);
  }
  return effects;
}

describe('week7-aws-bill-shock — config validation', () => {
  it('has the canonical identity fields', () => {
    expect(config.id).toBe('week7-aws-bill-shock');
    expect(config.title).toBe('AWS Bill Shock');
    expect(config.week).toBe(7);
    expect(config.unlockAfterDay).toBe(49);
    expect(config.promptUser).toBe('student');
    expect(config.promptHost).toBe('ops-jump-01');
    expect(config.optimalCommands).toBe(5);
  });

  it('passes every shared mission-config guard', () => {
    // Trigger-cmd support, scripted-verb dispatch (G6), effect write paths (G7),
    // err+effect, state-based whens on the mutating verb, evidence protection
    // (G8/G8b), processStarted sanity (G9), hints/story shape, flag seeding —
    // all factored into the shared validator; violations print in this diff.
    expect(validateMissionConfig(config)).toEqual([]);
  });

  // ── week7-specific domain facts the generic validator cannot know ─────────

  it('the hints point at the real evidence files and teach the exact fix', () => {
    const hints = config.hints.join(' ');
    expect(hints).toContain('~/aws/cost-report.csv');
    expect(hints).toContain('~/aws/instances.txt');
    expect(hints).toContain('aws ec2 terminate-instances --instance-ids i-0abc123def');
  });

  it('the fix appends to the cost report (never overwrites it) and writes a separate status file', () => {
    const appendPaths = allEffects().flatMap((e) => Object.keys(e.appendFiles ?? {}));
    expect(appendPaths).toContain('~/aws/cost-report.csv');
    const writePaths = allEffects().flatMap((e) => Object.keys(e.writeFiles ?? {}));
    expect(writePaths).not.toContain('~/aws/cost-report.csv');
    expect(writePaths).toContain('~/aws/status');
  });

  it('this mission remediates without killing — no effect removes a pid', () => {
    for (const eff of allEffects()) {
      expect(eff.removePids ?? []).toEqual([]);
    }
  });

  it('the cost report names the expensive resource and the instances file names the id', () => {
    const report = readFile(config.filesystem, '~/aws/cost-report.csv');
    expect(report).not.toBeNull();
    expect(report!).toContain('p3.2xlarge');
    const inst = readFile(config.filesystem, '~/aws/instances.txt');
    expect(inst).not.toBeNull();
    expect(inst!).toContain('i-0abc123def');
    expect(inst!).toContain('DELETEME');
  });
});

describe('week7-aws-bill-shock — intended playthrough (5 commands)', () => {
  it('reaches victory with SRE material rank via a config-only fix', () => {
    let s: MissionState = createMission(config);
    let r: RunResult;

    r = runCommand(s, 'ls');
    expect(r.completed).toEqual([1]);
    s = r.state;

    r = runCommand(s, 'grep p3.2xlarge ~/aws/cost-report.csv');
    expect(r.completed).toEqual([2]); // "p3.2xlarge" is the dominant line item
    s = r.state;

    r = runCommand(s, 'grep DELETEME ~/aws/instances.txt');
    expect(r.completed).toEqual([3]); // the matching row carries the exact id
    expect(r.output.map((l) => l.text).join('\n')).toContain('i-0abc123def');
    s = r.state;

    r = runCommand(s, 'aws ec2 describe-instances');
    expect(r.completed).toEqual([]); // corroboration only — no objective, no effect
    expect(s.flags?.billFixed).toBe(false);
    s = r.state;

    r = runCommand(s, 'aws ec2 terminate-instances --instance-ids i-0abc123def');
    expect(r.completed).toEqual([4]);
    expect(r.victory).toBe(true);
    s = r.state;

    // the fix is narrated (sys), flips the flag, appends to the report, writes status
    const fixText = r.output.map((l) => l.text).join('\n');
    expect(fixText).toContain('Terminating i-0abc123def');
    expect(s.flags?.billFixed).toBe(true);
    expect(readFile(s.fs, '~/aws/status')).toContain('OK — spend normal');
    const report = readFile(s.fs, '~/aws/cost-report.csv')!;
    expect(report).toContain('p3.2xlarge'); // evidence preserved (append-only)
    expect(report).toContain('TERMINATED'); // the appended remediation line

    const stats = getStats(s);
    expect(stats).toEqual({ commandsRun: 5, hintsUsed: 0 });
    expect(rankFor(stats, config)).toBe('SRE material');
  });
});

describe('week7-aws-bill-shock — anti-soft-lock (fix-first still completes the evidence objectives)', () => {
  it('terminating first completes only its own objective; evidence is still gatherable', () => {
    let s: MissionState = createMission(config);

    // Fix BEFORE gathering any evidence.
    let r = runCommand(s, 'aws ec2 terminate-instances --instance-ids i-0abc123def');
    expect(r.completed).toEqual([4]); // only the remediation objective
    expect(r.victory).toBe(false); // 1–3 still pending
    expect(r.state.flags?.billFixed).toBe(true);
    s = r.state;

    // The "p3.2xlarge" spike is STILL in the append-only cost report.
    r = runCommand(s, 'grep p3.2xlarge ~/aws/cost-report.csv');
    expect(r.completed).toEqual([2]);
    s = r.state;

    r = runCommand(s, 'grep DELETEME ~/aws/instances.txt');
    expect(r.completed).toEqual([3]);
    s = r.state;

    r = runCommand(s, 'ls');
    expect(r.completed).toEqual([1]);
    expect(r.victory).toBe(true);
    expect(r.state.objectivesDone.every(Boolean)).toBe(true);
    s = r.state;

    // Re-running the fix is idempotent + honest, and never double-credits.
    const again = runCommand(s, 'aws ec2 terminate-instances --instance-ids i-0abc123def');
    expect(again.output.some((l) => l.text.includes('already terminated'))).toBe(true);
    expect(again.completed).toEqual([]);

    // Post-fix honesty: a live query must not keep claiming the box is running.
    const desc = runCommand(s, 'aws ec2 describe-instances');
    const runawayLine = desc.output.map((l) => l.text).find((t) => t.includes('i-0abc123def'));
    expect(runawayLine).toContain('terminated');
    expect(runawayLine).not.toContain('running');
  });
});

describe('week7-aws-bill-shock — scrambled-order playthrough (order-independent)', () => {
  it('completes in a fully scrambled order, including a grep-piped evidence step', () => {
    let s: MissionState = createMission(config);

    // The aws verb surfaces both needles but never completes a read objective —
    // objectives 2 & 3 trigger on [cat, grep] only.
    let r = runCommand(s, 'aws ec2 describe-instances');
    expect(r.completed).toEqual([]);
    expect(s.flags?.billFixed).toBe(false);
    s = r.state;

    // grep-piped evidence: the instances row legitimately carries BOTH the type
    // and the id, so one pipe-grep discovers both facts (order-independent).
    r = runCommand(s, 'cat ~/aws/instances.txt | grep DELETEME');
    expect(r.completed).toEqual([2, 3]);
    expect(r.output.map((l) => l.text).join('\n')).toContain('i-0abc123def');
    s = r.state;

    r = runCommand(s, 'aws ec2 terminate-instances --instance-ids i-0abc123def');
    expect(r.completed).toEqual([4]);
    expect(r.victory).toBe(false); // "Look around" still pending
    s = r.state;

    r = runCommand(s, 'ls');
    expect(r.completed).toEqual([1]);
    expect(r.victory).toBe(true);
  });
});

describe('week7-aws-bill-shock — per-mission UX checklist', () => {
  it('progressive hints, plain-language objectives, honest defaults, exact-fix hint, help-terminated briefing', () => {
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

    // Monotonic specificity: the first hint just orients (no fix command); the
    // exact terminate command is revealed ONLY in the final hint.
    const fix = 'aws ec2 terminate-instances --instance-ids i-0abc123def';
    expect(config.hints[0]).not.toContain(fix);
    expect(config.hints.filter((h) => h.includes(fix))).toHaveLength(1);
    expect(config.hints.at(-1)).toContain(fix);

    // The success response carries the effect and prints no err line.
    const term = config.commands!.aws.responses!.find(
      (r) => r.match?.argIncludes === 'i-0abc123def',
    )!;
    expect(term.effect?.setFlags?.billFixed).toBe(true);
    expect(term.outKind).not.toBe('err');

    // Briefing ends by pointing at help.
    expect(config.story.at(-1)).toContain('help');
  });
});

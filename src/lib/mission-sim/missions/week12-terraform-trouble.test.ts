/**
 * Config-validation + playthrough tests for the Week 12 mission ("Terraform
 * Trouble"), a config-only ORDERED two-step fix: release an abandoned state
 * lock (`terraform force-unlock 7f3a9b2c`, flips `unlocked`), THEN reconcile
 * drift (`terraform apply`, guarded on `unlocked`, flips `applied`). Ordering
 * is enforced purely by flag guards: apply-before-unlock falls to an `out`
 * PRECONDITION line that carries no effect and completes nothing (no
 * soft-lock), and idempotent already-done guards come before the success
 * responses so re-runs are honest. The two read/orient objectives fire on the
 * read-only verbs cat/grep via outputMatched.
 *
 * ISLAND CONTRACT: imports ONLY the engine façade, the mission config, and the
 * shared config validator (test-only shared tooling, not island code).
 */
import { describe, it, expect } from 'vitest';
import { createMission, runCommand, getStats, rankFor, readFile } from '../engine';
import type { MissionEffect, MissionState, RunResult } from '../engine';
import { validateMissionConfig } from './_validation';
import { week12TerraformTrouble } from './week12-terraform-trouble';

const config = week12TerraformTrouble;

const UNLOCK = 'terraform force-unlock 7f3a9b2c';
const APPLY = 'terraform apply';

/** Every effect authored anywhere in config.commands (responses + defaults). */
function allEffects(): MissionEffect[] {
  const effects: MissionEffect[] = [];
  for (const sc of Object.values(config.commands ?? {})) {
    for (const r of sc.responses ?? []) if (r.effect) effects.push(r.effect);
    if (sc.default?.effect) effects.push(sc.default.effect);
  }
  return effects;
}

describe('week12-terraform-trouble — config validation', () => {
  it('has the canonical identity fields', () => {
    expect(config.id).toBe('week12-terraform-trouble');
    expect(config.title).toBe('Terraform Trouble');
    expect(config.week).toBe(12);
    expect(config.unlockAfterDay).toBe(80);
    expect(config.promptHost).toBe('tf-runner');
    expect(config.optimalCommands).toBe(6);
  });

  it('passes every shared mission-config guard', () => {
    // Trigger-cmd support, scripted-verb dispatch (G6), effect write paths (G7),
    // err+effect, state-based whens on the mutating verb, evidence protection
    // (G8/G8b), processStarted sanity (G9), hints/story shape, flag seeding.
    expect(validateMissionConfig(config)).toEqual([]);
  });

  // ── week12-specific domain facts the generic validator cannot know ────────

  it('seeds both ordering flags false', () => {
    expect(config.flags).toEqual({ unlocked: false, applied: false });
  });

  it('the fix appends to the evidence log (never overwrites it) and writes a separate status', () => {
    const appendPaths = allEffects().flatMap((e) => Object.keys(e.appendFiles ?? {}));
    expect(appendPaths).toContain('~/infra/errors.log');
    const writePaths = allEffects().flatMap((e) => Object.keys(e.writeFiles ?? {}));
    expect(writePaths).not.toContain('~/infra/errors.log');
    expect(writePaths).toContain('~/infra/status');
  });

  it('this mission remediates without killing — no effect removes a pid', () => {
    for (const eff of allEffects()) {
      expect(eff.removePids ?? []).toEqual([]);
    }
  });

  it('the diagnostic reads (plan drift / state list) carry no effect at all', () => {
    const tf = config.commands!.terraform;
    const diagnostics = (tf.responses ?? []).filter(
      (r) => r.match?.args?.includes('plan') || r.match?.args?.includes('state'),
    );
    expect(diagnostics.length).toBeGreaterThan(0);
    for (const r of diagnostics) expect(r.effect).toBeUndefined();
  });

  it('the apply precondition is out (not err) and carries no effect nor other objective strings', () => {
    const tf = config.commands!.terraform;
    // The precondition is the apply response with neither an unlocked nor an
    // applied flag guard (it is the fall-through for a still-locked apply).
    const precond = (tf.responses ?? []).find(
      (r) => r.match?.args?.includes('apply') && r.match?.flag === undefined,
    );
    expect(precond).toBeDefined();
    expect(precond!.outKind).not.toBe('err'); // out — err would complete nothing but reads wrong
    expect(precond!.effect).toBeUndefined();
    const text = precond!.output.join('\n');
    expect(text).not.toContain('state lock'); // obj 2 string
    expect(text).not.toContain('instance_type'); // obj 1 string
  });

  it('the evidence strings live in the files the read objectives scan', () => {
    const plan = readFile(config.filesystem, '~/infra/plan.txt');
    const errors = readFile(config.filesystem, '~/infra/errors.log');
    expect(plan).not.toBeNull();
    expect(errors).not.toBeNull();
    expect(plan!).toContain('instance_type'); // obj 1
    expect(errors!).toContain('state lock'); // obj 2
  });
});

describe('week12-terraform-trouble — intended playthrough (~4 commands)', () => {
  it('reaches victory with SRE material rank via read → read → unlock → apply', () => {
    let s: MissionState = createMission(config);
    let r: RunResult;

    r = runCommand(s, 'cat ~/infra/plan.txt');
    expect(r.completed).toEqual([1]); // drift on instance_type
    s = r.state;

    r = runCommand(s, 'grep "state lock" ~/infra/errors.log');
    expect(r.completed).toEqual([2]); // blocked acquiring the state lock
    s = r.state;

    r = runCommand(s, UNLOCK);
    expect(r.completed).toEqual([3]); // lock released
    expect(r.victory).toBe(false); // apply still pending
    expect(s.flags?.unlocked).toBe(false); // pre-command state unchanged
    s = r.state;

    // the unlock is narrated (sys), flips the flag, appends to the log, no err.
    const unlockText = r.output.map((l) => l.text).join('\n');
    expect(unlockText).toContain('7f3a9b2c');
    expect(r.output.some((l) => l.kind === 'err')).toBe(false);
    expect(s.flags?.unlocked).toBe(true);
    expect(s.flags?.applied).toBe(false);

    r = runCommand(s, APPLY);
    expect(r.completed).toEqual([4]); // reconciled
    expect(r.victory).toBe(true);
    s = r.state;

    const applyText = r.output.map((l) => l.text).join('\n');
    expect(applyText).toContain('Apply complete!');
    expect(applyText).toContain('m5.large');
    expect(r.output.some((l) => l.kind === 'err')).toBe(false);
    expect(s.flags?.applied).toBe(true);

    // evidence preserved (append-only) + separate status written.
    const log = readFile(s.fs, '~/infra/errors.log')!;
    expect(log).toContain('state lock'); // original evidence intact
    expect(log).toContain('lock 7f3a9b2c released'); // appended unlock line
    expect(log).toContain('apply complete'); // appended apply line
    expect(readFile(s.fs, '~/infra/status')).toContain('reconciled');

    const stats = getStats(s);
    expect(stats).toEqual({ commandsRun: 4, hintsUsed: 0 });
    expect(rankFor(stats, config)).toBe('SRE material');
  });
});

describe('week12-terraform-trouble — anti-soft-lock (ordered fix, apply-before-unlock)', () => {
  it('apply before the unlock hits the precondition (no effect, no credit), then in order wins', () => {
    let s: MissionState = createMission(config);

    // APPLY BEFORE UNLOCK: the state is still locked. Precondition is an `out`
    // line — it completes nothing AND (being effect-free) leaves `applied`
    // false, so the command is fully retryable and never soft-locks.
    let r = runCommand(s, APPLY);
    expect(r.completed).toEqual([]);
    expect(r.output.some((l) => l.kind === 'err')).toBe(false); // out, not err
    expect(r.output.some((l) => l.text.includes('still locked'))).toBe(true);
    expect(r.state.flags?.applied).toBe(false); // no false credit
    expect(r.state.flags?.unlocked).toBe(false); // no flag set
    expect(r.state.objectivesDone.some(Boolean)).toBe(false);
    s = r.state;

    // NOW IN ORDER: release the lock first.
    r = runCommand(s, UNLOCK);
    expect(r.completed).toEqual([3]);
    expect(r.state.flags?.unlocked).toBe(true);
    expect(r.state.flags?.applied).toBe(false);
    s = r.state;

    // Then apply succeeds (guarded on unlocked).
    r = runCommand(s, APPLY);
    expect(r.completed).toEqual([4]);
    expect(r.state.flags?.applied).toBe(true);
    expect(r.victory).toBe(false); // reads 1–2 still pending
    s = r.state;

    // The read evidence is still there (append-only log + untouched plan).
    r = runCommand(s, 'cat ~/infra/plan.txt');
    expect(r.completed).toEqual([1]);
    s = r.state;

    r = runCommand(s, 'grep "state lock" ~/infra/errors.log');
    expect(r.completed).toEqual([2]);
    expect(r.victory).toBe(true);
    expect(r.state.objectivesDone.every(Boolean)).toBe(true);
    s = r.state;

    // Re-running each fix is idempotent + honest, and never double-credits.
    const unlockAgain = runCommand(s, UNLOCK);
    expect(unlockAgain.output.some((l) => l.text.includes('already been released'))).toBe(true);
    expect(unlockAgain.completed).toEqual([]);

    const applyAgain = runCommand(s, APPLY);
    expect(applyAgain.output.some((l) => l.text.includes('No changes'))).toBe(true);
    expect(applyAgain.completed).toEqual([]);
  });
});

describe('week12-terraform-trouble — scrambled-order playthrough (order-independent reads)', () => {
  it('completes in a scrambled order, including a grep-piped evidence step', () => {
    let s: MissionState = createMission(config);

    // Diagnostic drift + state list — complete nothing (obj 1 reads the file via
    // cat/grep, NOT terraform; obj 2 likewise reads the log via cat/grep).
    let r = runCommand(s, 'terraform state list');
    expect(r.completed).toEqual([]);
    s = r.state;

    r = runCommand(s, 'terraform plan');
    expect(r.completed).toEqual([]); // terraform plan cannot credit the cat/grep read objective
    s = r.state;

    // Read obj 2 via a grep-piped step.
    r = runCommand(s, 'cat ~/infra/errors.log | grep "state lock"');
    expect(r.completed).toEqual([2]);
    s = r.state;

    // Unlock, then read obj 1, then apply — a legal (unlock-before-apply) order.
    r = runCommand(s, UNLOCK);
    expect(r.completed).toEqual([3]);
    s = r.state;

    r = runCommand(s, 'grep instance_type ~/infra/plan.txt');
    expect(r.completed).toEqual([1]);
    s = r.state;

    r = runCommand(s, APPLY);
    expect(r.completed).toEqual([4]);
    expect(r.victory).toBe(true);
  });
});

describe('week12-terraform-trouble — per-mission UX checklist', () => {
  it('≥3 progressive hints, plain objectives, honest defaults, last hint names the full fix sequence', () => {
    expect(config.hints.length).toBeGreaterThanOrEqual(config.objectives.length - 1);

    // Progressive specificity: the first hint orients, and the full ORDERED fix
    // sequence (both commands) appears in the LAST hint.
    expect(config.hints[0]).toContain('~/infra');
    const last = config.hints.at(-1)!;
    expect(last).toContain('terraform force-unlock 7f3a9b2c');
    expect(last).toContain('terraform apply');

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

    // Both success responses carry their effect and print no err line.
    const tf = config.commands!.terraform;
    const unlockFix = (tf.responses ?? []).find((r) => r.effect?.setFlags?.unlocked === true);
    const applyFix = (tf.responses ?? []).find((r) => r.effect?.setFlags?.applied === true);
    expect(unlockFix).toBeDefined();
    expect(applyFix).toBeDefined();
    expect(unlockFix!.outKind).not.toBe('err');
    expect(applyFix!.outKind).not.toBe('err');
    // The apply success is guarded on the unlock flag (ordering).
    expect(applyFix!.match?.flag?.name).toBe('unlocked');

    // Briefing ends by pointing at help.
    expect(config.story.at(-1)).toContain('help');
  });

  it('the plan diagnostic is two-faced by flag: drift before apply, no-changes after', () => {
    // Pre-apply: drift shown (instance_type change), no objective credited (terraform verb).
    const cold = createMission(config);
    const pre = runCommand(cold, 'terraform plan');
    expect(pre.output.some((l) => l.text.includes('instance_type'))).toBe(true);
    expect(pre.output.some((l) => l.text.includes('1 to change'))).toBe(true);
    expect(pre.completed).toEqual([]);

    // Post-apply: drift is gone — plan tells the honest truth.
    const warm = runCommand(runCommand(cold, UNLOCK).state, APPLY).state;
    const post = runCommand(warm, 'terraform plan');
    expect(post.output.some((l) => l.text.includes('No changes'))).toBe(true);
    expect(post.output.some((l) => l.text.includes('1 to change'))).toBe(false);
  });
});

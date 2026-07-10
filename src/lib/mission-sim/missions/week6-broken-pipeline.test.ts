/**
 * Config-validation + playthrough tests for the Week 6 mission ("Broken
 * Pipeline") — a secrets-management remediation proving the engine is
 * config-only for a scripted `gh` fix.
 *
 * ISLAND CONTRACT: imports ONLY the engine façade, the mission config, and the
 * shared config validator — exactly what the Astro island is allowed to import
 * (the validator is test-only shared tooling, not island code).
 *
 * The generic config guards live in ./_validation (validateMissionConfig);
 * this file keeps only week6-SPECIFIC domain assertions + playthroughs.
 */
import { describe, it, expect } from 'vitest';
import { createMission, runCommand, getStats, rankFor, readFile } from '../engine';
import type { MissionEffect, MissionState, RunResult } from '../engine';
import { validateMissionConfig } from './_validation';
import { week6BrokenPipeline } from './week6-broken-pipeline';

const config = week6BrokenPipeline;

/** Every effect authored anywhere in config.commands (responses + defaults). */
function allEffects(): MissionEffect[] {
  const effects: MissionEffect[] = [];
  for (const sc of Object.values(config.commands ?? {})) {
    for (const r of sc.responses ?? []) if (r.effect) effects.push(r.effect);
    if (sc.default?.effect) effects.push(sc.default.effect);
  }
  return effects;
}

describe('week6-broken-pipeline — config validation', () => {
  it('has the canonical identity fields', () => {
    expect(config.id).toBe('week6-broken-pipeline');
    expect(config.title).toBe('Broken Pipeline');
    expect(config.week).toBe(6);
    expect(config.unlockAfterDay).toBe(40);
    expect(config.promptUser).toBe('student');
    expect(config.promptHost).toBe('ci-runner-01');
    expect(config.optimalCommands).toBe(5);
  });

  it('passes every shared mission-config guard', () => {
    expect(validateMissionConfig(config)).toEqual([]);
  });

  // ── week6-specific domain facts the generic validator cannot know ─────────

  it('the hints point at the real evidence log/workflow and teach the exact fix', () => {
    const hints = config.hints.join(' ');
    expect(hints).toContain('~/logs/release.log');
    expect(hints).toContain('~/project/.github/workflows/release.yml');
    expect(hints).toContain('gh secret set REGISTRY_TOKEN');
  });

  it('the fix appends to the evidence log (never overwrites it) and writes a separate status file', () => {
    const appendPaths = allEffects().flatMap((e) => Object.keys(e.appendFiles ?? {}));
    expect(appendPaths).toContain('~/logs/release.log');
    const writePaths = allEffects().flatMap((e) => Object.keys(e.writeFiles ?? {}));
    expect(writePaths).not.toContain('~/logs/release.log');
    expect(writePaths).toContain('~/ci-status');
  });

  it('this mission remediates without killing — no effect removes a pid', () => {
    for (const eff of allEffects()) {
      expect(eff.removePids ?? []).toEqual([]);
    }
  });

  it('the run log names the auth failure; the workflow (not the log) names the secret — two distinct evidence steps', () => {
    const log = readFile(config.filesystem, '~/logs/release.log');
    expect(log).not.toBeNull();
    expect(log!).toContain('authentication required');
    // The failure line does NOT name the secret — obj 3 must come from the workflow.
    expect(log!).not.toContain('REGISTRY_TOKEN');

    const wf = readFile(config.filesystem, '~/project/.github/workflows/release.yml');
    expect(wf).not.toBeNull();
    expect(wf!).toContain('secrets.REGISTRY_TOKEN');
  });
});

describe('week6-broken-pipeline — intended playthrough (~5 commands)', () => {
  it('reaches victory with SRE material rank via a config-only fix', () => {
    let s: MissionState = createMission(config);
    let r: RunResult;

    r = runCommand(s, 'ls');
    expect(r.completed).toEqual([1]);
    s = r.state;

    r = runCommand(s, 'grep "authentication required" ~/logs/release.log');
    expect(r.completed).toEqual([2]); // the outage
    s = r.state;

    r = runCommand(s, 'cat ~/project/.github/workflows/release.yml');
    expect(r.completed).toEqual([3]); // publish job references secrets.REGISTRY_TOKEN
    s = r.state;

    r = runCommand(s, 'gh secret list');
    expect(r.completed).toEqual([]); // diagnostic only — no objective, no effect
    // The evidence is the ABSENCE of REGISTRY_TOKEN from the list (it was rotated
    // and never re-added) — not a spoon-fed parenthetical.
    expect(r.output.map((l) => l.text).join('\n')).not.toContain('REGISTRY_TOKEN');
    expect(s.flags?.secretSet).toBe(false);
    s = r.state;

    r = runCommand(s, 'gh secret set REGISTRY_TOKEN --body ghp_examplenewtoken123');
    expect(r.completed).toEqual([4]);
    expect(r.victory).toBe(true);
    s = r.state;

    // the fix is narrated, flips the flag, appends to the log, writes status.
    const fixText = r.output.map((l) => l.text).join('\n');
    expect(fixText).toContain('Set Actions secret REGISTRY_TOKEN');
    expect(fixText).toContain('run #4472 succeeded');
    // The scripted RESPONSE (everything except the terminal's own echo of the
    // typed line) never interpolates the player-typed token value.
    const responseText = r.output.filter((l) => l.kind !== 'echo').map((l) => l.text).join('\n');
    expect(responseText).not.toContain('ghp_examplenewtoken123');
    expect(s.flags?.secretSet).toBe(true);
    expect(readFile(s.fs, '~/ci-status')).toContain('OK — release green');
    const log = readFile(s.fs, '~/logs/release.log')!;
    expect(log).toContain('authentication required'); // evidence preserved (append-only)
    expect(log).toContain('#4472 publish OK'); // the appended success line

    const stats = getStats(s);
    expect(stats).toEqual({ commandsRun: 5, hintsUsed: 0 });
    expect(rankFor(stats, config)).toBe('SRE material');
  });
});

describe('week6-broken-pipeline — anti-soft-lock (fix-first still completes the evidence objectives)', () => {
  it('fixing first does not lock out the read objectives (append-only preserves them) and completes only its own objective', () => {
    let s: MissionState = createMission(config);

    // Fix BEFORE gathering any evidence.
    let r = runCommand(s, 'gh secret set REGISTRY_TOKEN --body ghp_x');
    expect(r.completed).toEqual([4]);
    expect(r.victory).toBe(false); // 1–3 still pending
    s = r.state;

    // The "authentication required" evidence is STILL in the append-only log.
    r = runCommand(s, 'grep "authentication required" ~/logs/release.log');
    expect(r.completed).toEqual([2]);
    s = r.state;

    // The workflow still names the secret.
    r = runCommand(s, 'cat ~/project/.github/workflows/release.yml');
    expect(r.completed).toEqual([3]);
    s = r.state;

    r = runCommand(s, 'ls');
    expect(r.completed).toEqual([1]);
    expect(r.victory).toBe(true);
    expect(r.state.objectivesDone.every(Boolean)).toBe(true);
    s = r.state;

    // Re-running the fix is idempotent + honest, and never double-credits.
    const again = runCommand(s, 'gh secret set REGISTRY_TOKEN --body ghp_x');
    expect(again.output.some((l) => l.text.includes('already set'))).toBe(true);
    expect(again.completed).toEqual([]);
  });
});

describe('week6-broken-pipeline — scrambled-order playthrough (order-independent)', () => {
  it('completes in a fully scrambled order, including a grep-piped evidence step', () => {
    let s: MissionState = createMission(config);

    // grep piped from cat — obj 3 (workflow names REGISTRY_TOKEN).
    let r = runCommand(s, 'cat ~/project/.github/workflows/release.yml | grep REGISTRY_TOKEN');
    expect(r.completed).toEqual([3]);
    s = r.state;

    r = runCommand(s, 'gh secret set REGISTRY_TOKEN --body ghp_x');
    expect(r.completed).toEqual([4]);
    expect(r.victory).toBe(false);
    s = r.state;

    r = runCommand(s, 'ls');
    expect(r.completed).toEqual([1]);
    s = r.state;

    r = runCommand(s, 'cat ~/logs/release.log');
    expect(r.completed).toEqual([2]); // "authentication required" evidence
    expect(r.victory).toBe(true);
  });
});

describe('week6-broken-pipeline — per-mission UX checklist', () => {
  it('≥3 progressive hints, plain-language objectives, honest non-empty outputs, exact-fix hint, help-terminated briefing', () => {
    expect(config.hints.length).toBeGreaterThanOrEqual(config.objectives.length - 1);

    // Hints grow more specific: the last hint contains the exact fix string.
    expect(config.hints.at(-1)!).toContain('gh secret set REGISTRY_TOKEN');
    // Earlier hints do NOT already spell the exact fix (monotonic specificity).
    for (const h of config.hints.slice(0, -1)) {
      expect(h.includes('gh secret set REGISTRY_TOKEN')).toBe(false);
    }

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

    // The success response carries the effect and emits NO err line.
    const success = config.commands!.gh.responses!.find((r) =>
      (r.match?.args ?? []).includes('set'),
    )!;
    expect(success.effect).toBeDefined();
    expect(success.outKind).not.toBe('err');

    // Briefing ends by pointing at help.
    expect(config.story.at(-1)).toContain('help');
  });
});

/**
 * Config-validation + playthrough tests for the Week 4 mission ("Docker Rescue"),
 * a config-only stack bring-up: the fix is a SCRIPTED `docker compose up -d`
 * whose effect flips a flag, adds the two containers to the process table,
 * appends a success line to the (evidence-preserving) web log, and rewrites a
 * status marker — zero domain logic in the engine.
 *
 * ISLAND CONTRACT: imports ONLY the engine façade, the mission config, and the
 * shared config validator (test-only shared tooling, not island code).
 */
import { describe, it, expect } from 'vitest';
import { createMission, runCommand, getStats, rankFor, readFile } from '../engine';
import type { MissionEffect, MissionState, RunResult } from '../engine';
import { validateMissionConfig } from './_validation';
import { week4DockerRescue } from './week4-docker-rescue';

const config = week4DockerRescue;

/** Every effect authored anywhere in config.commands (responses + defaults). */
function allEffects(): MissionEffect[] {
  const effects: MissionEffect[] = [];
  for (const sc of Object.values(config.commands ?? {})) {
    for (const r of sc.responses ?? []) if (r.effect) effects.push(r.effect);
    if (sc.default?.effect) effects.push(sc.default.effect);
  }
  return effects;
}

describe('week4-docker-rescue — config validation', () => {
  it('has the canonical identity fields', () => {
    expect(config.id).toBe('week4-docker-rescue');
    expect(config.title).toBe('Docker Rescue');
    expect(config.week).toBe(4);
    expect(config.unlockAfterDay).toBe(28);
    expect(config.promptUser).toBe('student');
    expect(config.promptHost).toBe('prod-web-04');
    expect(config.optimalCommands).toBe(5);
  });

  it('passes every shared mission-config guard', () => {
    // Trigger-cmd support, scripted-verb dispatch (G6), effect write paths (G7),
    // err+effect, state-based whens on mutating verbs, evidence protection
    // (G8/G8b), processStarted sanity (G9), hints/story shape, flag seeding.
    expect(validateMissionConfig(config)).toEqual([]);
  });

  // ── week4-specific domain facts the generic validator cannot know ─────────

  it('the hints point at the real evidence files and teach the exact fix', () => {
    const hints = config.hints.join(' ');
    expect(hints).toContain('~/logs/web.log');
    expect(hints).toContain('~/app/docker-compose.yml');
    expect(hints).toContain('docker compose up -d');
  });

  it('the fix appends to the evidence log (never overwrites it) and writes a separate status', () => {
    const appendPaths = allEffects().flatMap((e) => Object.keys(e.appendFiles ?? {}));
    expect(appendPaths).toContain('~/logs/web.log');
    const writePaths = allEffects().flatMap((e) => Object.keys(e.writeFiles ?? {}));
    expect(writePaths).not.toContain('~/logs/web.log');
    expect(writePaths).toContain('~/app/status');
  });

  it('this mission remediates without killing — no effect removes a pid', () => {
    for (const eff of allEffects()) {
      expect(eff.removePids ?? []).toEqual([]);
    }
  });

  it('the web log names the crash-loop reason and the compose file names the dependency', () => {
    const log = readFile(config.filesystem, '~/logs/web.log');
    expect(log).not.toBeNull();
    expect(log!).toContain('ECONNREFUSED db:5432');
    const compose = readFile(config.filesystem, '~/app/docker-compose.yml');
    expect(compose).not.toBeNull();
    expect(compose!).toContain('depends_on');
  });
});

describe('week4-docker-rescue — intended playthrough (~5 commands)', () => {
  it('reaches victory with SRE material rank via a config-only fix', () => {
    let s: MissionState = createMission(config);
    let r: RunResult;

    r = runCommand(s, 'ls');
    expect(r.completed).toEqual([1]);
    s = r.state;

    r = runCommand(s, 'grep "ECONNREFUSED db:5432" ~/logs/web.log');
    expect(r.completed).toEqual([2]); // crash-loop evidence
    s = r.state;

    r = runCommand(s, 'cat ~/app/docker-compose.yml');
    expect(r.completed).toEqual([3]); // depends_on wiring
    s = r.state;

    r = runCommand(s, 'docker ps -a');
    expect(r.completed).toEqual([]); // diagnostic only — no objective, no effect
    expect(r.output.map((l) => l.text).join('\n')).toContain('Restarting');
    expect(s.flags?.stackUp).toBe(false);
    s = r.state;

    r = runCommand(s, 'docker compose up -d');
    expect(r.completed).toEqual([4]);
    expect(r.victory).toBe(true);
    s = r.state;

    // the fix is narrated, flips the flag, adds the containers, appends to the
    // log, rewrites status.
    const fixText = r.output.map((l) => l.text).join('\n');
    expect(fixText).toContain('connected to db:5432 OK');
    expect(s.flags?.stackUp).toBe(true);
    expect(s.processes.some((p) => p.command === 'node server.js')).toBe(true);
    expect(s.processes.some((p) => p.command === 'postgres')).toBe(true);
    expect(readFile(s.fs, '~/app/status')).toContain('OK — stack up');
    const log = readFile(s.fs, '~/logs/web.log')!;
    expect(log).toContain('ECONNREFUSED db:5432'); // evidence preserved (append-only)
    expect(log).toContain('09:20:03'); // the appended success line

    const stats = getStats(s);
    expect(stats).toEqual({ commandsRun: 5, hintsUsed: 0 });
    expect(rankFor(stats, config)).toBe('SRE material');
  });
});

describe('week4-docker-rescue — anti-soft-lock (fix-first still completes the evidence objectives)', () => {
  it('bringing the stack up first does not lock out the read-the-evidence objectives', () => {
    let s: MissionState = createMission(config);

    // Fix BEFORE gathering any evidence.
    let r = runCommand(s, 'docker compose up -d');
    expect(r.completed).toEqual([4]);
    expect(r.victory).toBe(false); // 1–3 still pending
    s = r.state;

    // The ECONNREFUSED evidence is STILL in the append-only log.
    r = runCommand(s, 'grep "ECONNREFUSED db:5432" ~/logs/web.log');
    expect(r.completed).toEqual([2]);
    s = r.state;

    // The compose file is unchanged — depends_on is still readable.
    r = runCommand(s, 'cat ~/app/docker-compose.yml');
    expect(r.completed).toEqual([3]);
    s = r.state;

    r = runCommand(s, 'ls');
    expect(r.completed).toEqual([1]);
    expect(r.victory).toBe(true);
    expect(r.state.objectivesDone.every(Boolean)).toBe(true);
    s = r.state;

    // Re-running the fix is idempotent + honest, and never double-credits.
    const again = runCommand(s, 'docker compose up -d');
    expect(again.output.some((l) => l.text.includes('already up'))).toBe(true);
    expect(again.completed).toEqual([]);
  });
});

describe('week4-docker-rescue — scrambled-order playthrough (order-independent)', () => {
  it('completes in a fully scrambled order, including grep-piped evidence', () => {
    let s: MissionState = createMission(config);

    let r = runCommand(s, 'docker ps -a');
    expect(r.completed).toEqual([]);
    s = r.state;

    r = runCommand(s, 'cat ~/app/docker-compose.yml | grep depends_on');
    expect(r.completed).toEqual([3]);
    s = r.state;

    r = runCommand(s, 'docker compose up -d');
    expect(r.completed).toEqual([4]);
    expect(r.victory).toBe(false);
    s = r.state;

    r = runCommand(s, 'grep "ECONNREFUSED db:5432" ~/logs/web.log');
    expect(r.completed).toEqual([2]);
    s = r.state;

    r = runCommand(s, 'ls');
    expect(r.completed).toEqual([1]);
    expect(r.victory).toBe(true);
  });
});

describe('week4-docker-rescue — per-mission UX checklist', () => {
  it('≥4 progressive hints, plain-language objectives, honest defaults, exact-fix hint, help-terminated briefing', () => {
    expect(config.hints.length).toBeGreaterThanOrEqual(4);

    // Progressive specificity: the exact fix command appears ONLY in the last
    // hint, and the first hint orients with `ls`.
    expect(config.hints[0]).toContain('ls');
    const withFix = config.hints.filter((h) => h.includes('docker compose up -d'));
    expect(withFix).toEqual([config.hints.at(-1)]);

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

    // The success response carries the effect and prints no err line.
    const docker = config.commands!.docker;
    const fix = (docker.responses ?? []).find((r) => r.effect !== undefined);
    expect(fix).toBeDefined();
    expect(fix!.effect?.setFlags?.stackUp).toBe(true);
    expect(fix!.outKind).not.toBe('err');

    // The final hint teaches the exact fix.
    expect(config.hints.some((h) => h.includes('docker compose up -d'))).toBe(true);
    // Briefing ends by pointing at help.
    expect(config.story.at(-1)).toContain('help');
  });
});

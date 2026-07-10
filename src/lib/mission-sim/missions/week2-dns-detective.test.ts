/**
 * Config-validation + playthrough tests for the Week 2 mission ("DNS Detective"),
 * a config-only DNS-as-code revert: `dig` is a DIAGNOSTIC verb (no effect, gated
 * on the pre-fix flag so it stays honest after the fix) that an `outputMatched`
 * objective reads; the fix is a SCRIPTED `git revert` whose effect flips a flag,
 * appends a healthy line to the (evidence-preserving) uptime log, and writes a
 * separate status marker — zero domain logic in the engine.
 *
 * ISLAND CONTRACT: imports ONLY the engine façade, the mission config, and the
 * shared config validator (test-only shared tooling, not island code).
 */
import { describe, it, expect } from 'vitest';
import { createMission, runCommand, getStats, rankFor, readFile } from '../engine';
import type { MissionEffect, MissionState, RunResult } from '../engine';
import { validateMissionConfig } from './_validation';
import { week2DnsDetective } from './week2-dns-detective';

const config = week2DnsDetective;

/** Every effect authored anywhere in config.commands (responses + defaults). */
function allEffects(): MissionEffect[] {
  const effects: MissionEffect[] = [];
  for (const sc of Object.values(config.commands ?? {})) {
    for (const r of sc.responses ?? []) if (r.effect) effects.push(r.effect);
    if (sc.default?.effect) effects.push(sc.default.effect);
  }
  return effects;
}

describe('week2-dns-detective — config validation', () => {
  it('has the canonical identity fields', () => {
    expect(config.id).toBe('week2-dns-detective');
    expect(config.title).toBe('DNS Detective');
    expect(config.week).toBe(2);
    expect(config.unlockAfterDay).toBe(14);
    expect(config.promptUser).toBe('student');
    expect(config.promptHost).toBe('prod-web-03');
    expect(config.optimalCommands).toBe(5);
  });

  it('passes every shared mission-config guard', () => {
    // Trigger-cmd support, scripted-verb dispatch (G6), effect write paths (G7),
    // err+effect, state-based whens on mutating verbs, evidence protection
    // (G8/G8b), processStarted sanity (G9), hints/story shape, flag seeding.
    expect(validateMissionConfig(config)).toEqual([]);
  });

  // ── week2-specific domain facts the generic validator cannot know ─────────

  it('the hints point at the real evidence file and teach the exact fix', () => {
    const hints = config.hints.join(' ');
    expect(hints).toContain('~/logs/uptime.log');
    expect(hints).toContain('git revert 9c1f2ab');
  });

  it('the fix appends to the evidence log (never overwrites it) and writes a separate status', () => {
    const appendPaths = allEffects().flatMap((e) => Object.keys(e.appendFiles ?? {}));
    expect(appendPaths).toContain('~/logs/uptime.log');
    const writePaths = allEffects().flatMap((e) => Object.keys(e.writeFiles ?? {}));
    expect(writePaths).not.toContain('~/logs/uptime.log');
    expect(writePaths).not.toContain('~/dns/records.zone'); // read-only context, never rewritten
    expect(writePaths).toContain('~/dns/status');
  });

  it('this mission remediates without killing — no effect removes a pid', () => {
    for (const eff of allEffects()) {
      expect(eff.removePids ?? []).toEqual([]);
    }
  });

  it('the diagnostic dig carries NO effect (safe for outputMatched)', () => {
    const dig = config.commands!.dig;
    for (const r of dig.responses ?? []) expect(r.effect).toBeUndefined();
    expect(dig.default?.effect).toBeUndefined();
  });

  it('the uptime log names the failing host and the zone file carries the stale record', () => {
    const log = readFile(config.filesystem, '~/logs/uptime.log');
    expect(log).not.toBeNull();
    expect(log!).toContain('TIMEOUT');
    expect(log!).toContain('203.0.113.99');
    const zone = readFile(config.filesystem, '~/dns/records.zone');
    expect(zone).not.toBeNull();
    expect(zone!).toContain('203.0.113.99');
  });
});

describe('week2-dns-detective — intended playthrough (~5 commands)', () => {
  it('reaches victory with SRE material rank via a config-only revert', () => {
    let s: MissionState = createMission(config);
    let r: RunResult;

    r = runCommand(s, 'pwd');
    expect(r.completed).toEqual([1]);
    s = r.state;

    r = runCommand(s, 'grep TIMEOUT ~/logs/uptime.log');
    expect(r.completed).toEqual([2]); // intermittent-failure evidence
    s = r.state;

    r = runCommand(s, 'dig shop.opscanopy.io');
    expect(r.completed).toEqual([3]); // two A records, one dead
    expect(r.output.map((l) => l.text).join('\n')).toContain('203.0.113.99');
    expect(s.flags?.dnsFixed).toBe(false);
    s = r.state;

    r = runCommand(s, 'git log');
    expect(r.completed).toEqual([]); // read-only history — no objective, no effect
    expect(r.output.map((l) => l.text).join('\n')).toContain('9c1f2ab');
    expect(s.flags?.dnsFixed).toBe(false);
    s = r.state;

    r = runCommand(s, 'git revert 9c1f2ab');
    expect(r.completed).toEqual([4]);
    expect(r.victory).toBe(true);
    s = r.state;

    // the fix is narrated, flips the flag, appends to the log, writes status.
    const fixText = r.output.map((l) => l.text).join('\n');
    expect(fixText).toContain('Reverted 9c1f2ab');
    expect(s.flags?.dnsFixed).toBe(true);
    expect(readFile(s.fs, '~/dns/status')).toContain('OK');
    const log = readFile(s.fs, '~/logs/uptime.log')!;
    expect(log).toContain('TIMEOUT'); // evidence preserved (append-only)
    expect(log).toContain('08:12:07'); // the appended success line

    const stats = getStats(s);
    expect(stats).toEqual({ commandsRun: 5, hintsUsed: 0 });
    expect(rankFor(stats, config)).toBe('SRE material');
  });
});

describe('week2-dns-detective — anti-soft-lock (fix-first still completes the evidence objectives)', () => {
  it('reverting first does not lock out the read-the-evidence objectives', () => {
    let s: MissionState = createMission(config);

    // Fix BEFORE gathering any evidence — completes ONLY its own objective.
    let r = runCommand(s, 'git revert 9c1f2ab');
    expect(r.completed).toEqual([4]);
    expect(r.victory).toBe(false); // 1–3 still pending
    s = r.state;

    // The TIMEOUT evidence is STILL in the append-only log.
    r = runCommand(s, 'grep TIMEOUT ~/logs/uptime.log');
    expect(r.completed).toEqual([2]);
    s = r.state;

    // dig is now honest (one A record) but still NAMES 203.0.113.99 as removed,
    // so the "trace DNS" objective is still completable after the fix.
    r = runCommand(s, 'dig shop.opscanopy.io');
    expect(r.completed).toEqual([3]);
    const digText = r.output.map((l) => l.text).join('\n');
    expect(digText).toContain('203.0.113.99');
    expect(digText).toContain('One A record now');
    s = r.state;

    r = runCommand(s, 'pwd');
    expect(r.completed).toEqual([1]);
    expect(r.victory).toBe(true);
    expect(r.state.objectivesDone.every(Boolean)).toBe(true);
    s = r.state;

    // Re-running the fix is idempotent + honest, and never double-credits.
    const again = runCommand(s, 'git revert 9c1f2ab');
    expect(again.output.some((l) => l.text.includes('already reverted'))).toBe(true);
    expect(again.completed).toEqual([]);
  });
});

describe('week2-dns-detective — scrambled-order playthrough (order-independent)', () => {
  it('completes in a fully scrambled order, including grep-piped evidence', () => {
    let s: MissionState = createMission(config);

    let r = runCommand(s, 'dig shop.opscanopy.io');
    expect(r.completed).toEqual([3]);
    s = r.state;

    r = runCommand(s, 'cat ~/logs/uptime.log | grep TIMEOUT');
    expect(r.completed).toEqual([2]);
    s = r.state;

    r = runCommand(s, 'git revert 9c1f2ab');
    expect(r.completed).toEqual([4]);
    expect(r.victory).toBe(false);
    s = r.state;

    r = runCommand(s, 'pwd');
    expect(r.completed).toEqual([1]);
    expect(r.victory).toBe(true);
  });
});

describe('week2-dns-detective — per-mission UX checklist', () => {
  it('≥4 progressive hints, plain-language objectives, honest defaults, exact-fix hint, help-terminated briefing', () => {
    expect(config.hints.length).toBeGreaterThanOrEqual(4);

    // Progressive specificity: the exact fix command appears ONLY in the last
    // hint, and the first hint orients with `pwd`.
    expect(config.hints[0]).toContain('pwd');
    const withFix = config.hints.filter((h) => h.includes('git revert 9c1f2ab'));
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
    const git = config.commands!.git;
    const fix = (git.responses ?? []).find((r) => r.effect !== undefined);
    expect(fix).toBeDefined();
    expect(fix!.effect?.setFlags?.dnsFixed).toBe(true);
    expect(fix!.outKind).not.toBe('err');

    // The final hint teaches the exact fix.
    expect(config.hints.some((h) => h.includes('git revert 9c1f2ab'))).toBe(true);
    // Briefing ends by pointing at help.
    expect(config.story.at(-1)).toContain('help');
  });
});

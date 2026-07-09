/**
 * Config-validation + playthrough tests for the Week 3 mission ("Locked Out"),
 * the worked example proving the engine is config-only for a NON-kill fix.
 *
 * ISLAND CONTRACT: imports ONLY the engine façade and the mission config —
 * exactly what the Astro island is allowed to import.
 *
 * The config-validation guards here are written generically (they operate on
 * `config`, not on hard-coded week3 values) so future missions reuse them.
 */
import { describe, it, expect } from 'vitest';
import { createMission, runCommand, getStats, rankFor, getNode, readFile } from '../engine';
import type { MissionEffect, MissionState, RunResult } from '../engine';
import { week3LockedFile } from './week3-locked-file';

const config = week3LockedFile;

// Built-in verbs the engine reserves (never shadowable by scripted commands).
const BUILTINS = ['pwd', 'ls', 'cd', 'cat', 'grep', 'ps', 'kill', 'help', 'hint', 'clear'];
const RESERVED = new Set(BUILTINS);
const STATE_WHENS = ['flagSet', 'flagIs', 'fileContains', 'processStarted'];

/** Every effect authored anywhere in config.commands (responses + defaults). */
function allEffects(): MissionEffect[] {
  const effects: MissionEffect[] = [];
  for (const sc of Object.values(config.commands ?? {})) {
    for (const r of sc.responses ?? []) if (r.effect) effects.push(r.effect);
    if (sc.default?.effect) effects.push(sc.default.effect);
  }
  return effects;
}

describe('week3-locked-file — config validation (week1-style)', () => {
  it('has the canonical identity fields', () => {
    expect(config.id).toBe('week3-locked-file');
    expect(config.title).toBe('Locked Out');
    expect(config.week).toBe(3);
    expect(config.unlockAfterDay).toBe(21);
    expect(config.promptUser).toBe('student');
    expect(config.promptHost).toBe('prod-web-02');
    expect(config.optimalCommands).toBe(6);
  });

  it('every objective trigger cmd is a supported command', () => {
    for (const obj of config.objectives) {
      const cmds = Array.isArray(obj.trigger.cmd) ? obj.trigger.cmd : [obj.trigger.cmd];
      for (const cmd of cmds) {
        expect(config.supportedCommands, `objective ${obj.id} trigger '${cmd}'`).toContain(cmd);
      }
    }
  });

  it('every ~-rooted path mentioned in hints and story exists in the filesystem', () => {
    const text = [...config.hints, ...config.story].join(' ');
    const paths = text.match(/~\/[A-Za-z0-9._/-]+/g) ?? [];
    expect(paths.length).toBeGreaterThan(0);
    for (const path of paths) {
      expect(getNode(config.filesystem, path), `path ${path} from hints/story`).not.toBeNull();
    }
  });

  it('has enough progressive hints (≥ objectives − 1)', () => {
    expect(config.hints.length).toBeGreaterThanOrEqual(config.objectives.length - 1);
  });

  it('the story ends by pointing the player at help', () => {
    expect(config.story.length).toBeGreaterThanOrEqual(2);
    expect(config.story.at(-1)).toContain('help');
  });
});

describe('week3-locked-file — config validation (scripted-command guards)', () => {
  it('G6: every scripted command key is supported AND disjoint from RESERVED built-ins', () => {
    for (const name of Object.keys(config.commands ?? {})) {
      expect(config.supportedCommands, `scripted verb '${name}' must be supported`).toContain(name);
      expect(RESERVED.has(name), `scripted verb '${name}' must not shadow a built-in`).toBe(false);
    }
  });

  it('G7: every effect writeFiles/appendFiles path has an existing parent directory', () => {
    for (const eff of allEffects()) {
      const paths = [...Object.keys(eff.writeFiles ?? {}), ...Object.keys(eff.appendFiles ?? {})];
      for (const p of paths) {
        const parent = p.replace(/\/[^/]+\/?$/, '') || '~';
        const node = getNode(config.filesystem, parent);
        expect(node, `effect file parent ${parent} (for ${p})`).not.toBeNull();
        expect(typeof node, `effect file parent ${parent} must be a directory`).toBe('object');
      }
    }
  });

  it('no response is both an `err` line AND effect-bearing', () => {
    for (const sc of Object.values(config.commands ?? {})) {
      const items = [...(sc.responses ?? []), ...(sc.default ? [sc.default] : [])];
      for (const it2 of items) {
        const isErr = it2.outKind === 'err';
        const hasEffect = !!it2.effect && Object.keys(it2.effect).length > 0;
        expect(isErr && hasEffect, 'an err line must never bear an effect (it would mutate but credit nothing)').toBe(false);
      }
    }
  });

  it('a remediation objective (triggered by a mutating scripted verb) uses a state-based `when`', () => {
    const mutatingVerbs = new Set<string>();
    for (const [name, sc] of Object.entries(config.commands ?? {})) {
      const anyEffect = [...(sc.responses ?? []), ...(sc.default ? [sc.default] : [])]
        .some((it2) => !!it2.effect && Object.keys(it2.effect).length > 0);
      if (anyEffect) mutatingVerbs.add(name);
    }
    // sanity: this mission has at least one mutating verb (chmod)
    expect(mutatingVerbs.has('chmod')).toBe(true);

    for (const obj of config.objectives) {
      const cmds = Array.isArray(obj.trigger.cmd) ? obj.trigger.cmd : [obj.trigger.cmd];
      if (!cmds.some((c) => mutatingVerbs.has(c))) continue;
      const when = obj.trigger.when;
      expect(when && typeof when === 'object', `objective ${obj.id} needs a state-based when`).toBe(true);
      const key = Object.keys(when as object)[0];
      expect(STATE_WHENS, `objective ${obj.id} when '${key}' must be state-based`).toContain(key);
    }
  });

  it('G8: no effect overwrites (writeFiles) a path another objective reads as evidence; appendFiles is allowed', () => {
    const evidencePaths = new Set<string>();
    for (const obj of config.objectives) {
      const when = obj.trigger.when;
      if (when && typeof when === 'object') {
        if ('fileContains' in when) evidencePaths.add(when.fileContains.path);
        if ('argIncludes' in when) evidencePaths.add(when.argIncludes);
      }
    }
    for (const eff of allEffects()) {
      for (const p of Object.keys(eff.writeFiles ?? {})) {
        expect(evidencePaths.has(p), `writeFiles '${p}' overwrites objective evidence — use appendFiles`).toBe(false);
      }
    }
    // The fix DOES append to the evidence log — that must be preserved, so it is
    // append-only (never overwrite). Confirm the intent explicitly.
    const appendPaths = allEffects().flatMap((e) => Object.keys(e.appendFiles ?? {}));
    expect(appendPaths).toContain('~/logs/cron.log');
  });

  it('G8b: this mission remediates without killing — no effect removes a pid', () => {
    // (The general rule: a removePids effect must not orphan an objective whose
    //  only evidence is that process. Week 3 removes nothing, so it holds.)
    for (const eff of allEffects()) {
      expect(eff.removePids ?? []).toEqual([]);
    }
  });

  it('G9: no processStarted objective targets a process already present-and-running at start', () => {
    for (const obj of config.objectives) {
      const when = obj.trigger.when;
      if (when && typeof when === 'object' && 'processStarted' in when) {
        const needle = when.processStarted;
        const running = config.processes.some((p) => p.command.includes(needle) && p.stat !== 'crashed');
        expect(running, `processStarted target '${needle}' already running at start`).toBe(false);
      }
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

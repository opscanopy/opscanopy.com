/**
 * Config-validation + playthrough tests for the Week 1 mission.
 *
 * ISLAND CONTRACT: this file imports ONLY the engine façade and the mission
 * config — exactly what the Astro island is allowed to import.
 */
import { describe, it, expect } from 'vitest';
import { createMission, runCommand, getStats, rankFor, getNode, readFile } from '../engine';
import type { MissionState, RunResult } from '../engine';
import { week1ServerDown } from './week1-server-down';

const config = week1ServerDown;

describe('week1-server-down — config validation', () => {
  it('has the canonical identity fields', () => {
    expect(config.id).toBe('week1-server-down');
    expect(config.title).toBe('Server Down!');
    expect(config.week).toBe(1);
    expect(config.unlockAfterDay).toBe(7);
    expect(config.promptUser).toBe('student');
    expect(config.promptHost).toBe('prod-web-01');
    expect(config.optimalCommands).toBe(7);
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
    expect(paths.length).toBeGreaterThan(0); // the hints must point somewhere real
    for (const path of paths) {
      expect(getNode(config.filesystem, path), `path ${path} from hints/story`).not.toBeNull();
    }
  });

  it('has enough progressive hints (≥ objectives − 1)', () => {
    expect(config.hints.length).toBeGreaterThanOrEqual(config.objectives.length - 1);
  });

  it('onKill pids all exist in the process table', () => {
    const pids = new Set(config.processes.map((p) => p.pid));
    for (const rule of config.onKill ?? []) {
      expect(pids.has(rule.pid), `onKill pid ${rule.pid}`).toBe(true);
      for (const pid of rule.removeProcs) {
        expect(pids.has(pid), `removeProcs pid ${pid}`).toBe(true);
      }
    }
  });

  it('every onKill.writeFiles target has an existing parent directory', () => {
    // Guards against a typo'd write path in a future mission: the kill handler
    // narrates the write as a success, so a path that silently no-ops would be
    // an in-game lie. The write needs its parent dir to resolve to a directory.
    for (const rule of config.onKill ?? []) {
      for (const path of Object.keys(rule.writeFiles ?? {})) {
        const parent = path.replace(/\/[^/]+\/?$/, '') || '~';
        const node = getNode(config.filesystem, parent);
        expect(node, `onKill writeFiles parent dir ${parent} (for ${path})`).not.toBeNull();
        expect(typeof node, `onKill writeFiles parent ${parent} must be a directory`).toBe('object');
      }
    }
  });

  it('the culprit pid 4521 is named in the server log (and so is the script)', () => {
    const log = readFile(config.filesystem, '~/logs/server.log');
    expect(log).not.toBeNull();
    expect(log!).toContain('4521');
    expect(log!).toContain('backup-script');
  });

  it('the story ends by pointing the player at help', () => {
    expect(config.story.length).toBeGreaterThanOrEqual(2);
    expect(config.story.at(-1)).toContain('help');
  });

  it('the process table matches the fiction', () => {
    const byPid = new Map(config.processes.map((p) => [p.pid, p]));
    expect(byPid.get(1)?.command).toBe('systemd');
    expect(byPid.get(812)?.command).toBe('sshd');
    expect(byPid.get(2201)?.command).toBe('node server.js');
    expect(byPid.get(2201)?.stat).toBe('crashed');
    expect(byPid.get(4521)?.command).toBe('backup-script.sh');
    expect(byPid.get(4521)?.cpu).toBeGreaterThan(90);
    expect(byPid.get(5000)?.command).toBe('bash');
  });
});

describe('week1-server-down — intended playthrough (~7 commands)', () => {
  it('reaches victory with SRE material rank', () => {
    let s: MissionState = createMission(config);
    let r: RunResult;

    r = runCommand(s, 'pwd');
    expect(r.completed).toEqual([1]);
    s = r.state;

    r = runCommand(s, 'ls');
    expect(r.completed).toEqual([2]);
    s = r.state;

    r = runCommand(s, 'cd logs');
    expect(r.completed).toEqual([]);
    expect(r.state.cwd).toBe('~/logs');
    s = r.state;

    r = runCommand(s, 'cat server.log');
    // one read of the log yields BOTH the evidence and the culprit
    expect(r.completed).toEqual([3, 4]);
    s = r.state;

    r = runCommand(s, 'ps');
    expect(r.completed).toEqual([]); // objective 4 already done — no double credit
    s = r.state;

    r = runCommand(s, 'kill 4521');
    expect(r.completed).toEqual([5]);
    expect(r.victory).toBe(true);
    s = r.state;

    // recovery auto-printed on the kill itself — no further command needed
    const killText = r.output.map((l) => l.text).join('\n');
    expect(killText).toContain('backup-script.sh');
    expect(killText).toContain('2310');
    expect(killText).toContain('OK — serving traffic');
    expect(killText).toContain('The runaway process is dead. Watch the recovery roll in…');

    const stats = getStats(s);
    expect(stats).toEqual({ commandsRun: 6, hintsUsed: 0 });
    expect(rankFor(stats, config)).toBe('SRE material');

    // the box is visibly healthy afterwards
    const psAfter = runCommand(s, 'ps');
    const table = psAfter.output.map((l) => l.text).join('\n');
    expect(table).toContain('2310');
    expect(table).not.toContain('backup-script');

    const status = runCommand(s, 'cat ~/app/status');
    expect(status.output[1].text).toBe('OK — serving traffic');
  });
});

describe('week1-server-down — kill-first speedrun (anti-soft-lock regression)', () => {
  it('reaches victory in scrambled order', () => {
    let s: MissionState = createMission(config);

    let r = runCommand(s, 'pwd');
    expect(r.completed).toEqual([1]);
    s = r.state;

    r = runCommand(s, 'ls');
    expect(r.completed).toEqual([2]);
    s = r.state;

    r = runCommand(s, 'kill 4521');
    expect(r.completed).toEqual([5]); // kill completes even with 3 & 4 pending
    expect(r.victory).toBe(false);
    s = r.state;

    r = runCommand(s, 'cat ~/logs/server.log');
    // the evidence is still in the log after the culprit is gone
    expect(r.completed).toEqual([3, 4]);
    expect(r.victory).toBe(true);
    s = r.state;

    r = runCommand(s, 'ps');
    expect(r.victory).toBe(true);
    expect(r.state.objectivesDone.every(Boolean)).toBe(true);
  });

  it('grep-only evidence also works (no cat required)', () => {
    let s: MissionState = createMission(config);
    for (const c of ['pwd', 'ls', 'kill 4521']) s = runCommand(s, c).state;
    const r = runCommand(s, 'grep ERROR ~/logs/server.log');
    expect(r.completed).toEqual([3, 4]);
    expect(r.victory).toBe(true);
  });

  it('a ps-runner completes objective 4 without ever reading the log', () => {
    let s: MissionState = createMission(config);
    const r = runCommand(s, 'ps');
    expect(r.completed).toEqual([4]); // backup-script visible in the table
  });

  it('a rejected pipe (`kill 4521 | ls`) is a true no-op — no state mutation, no soft-lock', () => {
    let s: MissionState = createMission(config);
    for (const c of ['pwd', 'ls']) s = runCommand(s, c).state;

    // Pipe the kill into a non-grep command: the box rejects it. The kill must
    // NOT take effect (else obj 5 would be consumed with no credit, permanently
    // soft-locking the mission).
    const r = runCommand(s, 'kill 4521 | ls');
    expect(r.completed).toEqual([]); // no objective credited
    expect(r.output.some((l) => l.kind === 'err')).toBe(true); // rejection shown
    // state is untouched: culprit alive, no healthy respawn, status still crashed
    expect(r.state.processes.some((p) => p.pid === 4521)).toBe(true);
    expect(r.state.processes.some((p) => p.pid === 2310)).toBe(false);
    expect(readFile(r.state.fs, '~/app/status')).toBe('CRASHED — waiting for CPU');
    s = r.state;

    // mission is still winnable: a real kill now completes objective 5
    for (const c of ['cat ~/logs/server.log']) s = runCommand(s, c).state;
    const kill = runCommand(s, 'kill 4521');
    expect(kill.completed).toEqual([5]);
    expect(kill.victory).toBe(true);
  });
});

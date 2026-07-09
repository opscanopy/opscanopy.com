/**
 * Tests for the 5 NEW state-based objective triggers added for the Mission 90
 * engine expansion: flagSet, flagIs, fileContains, processStarted, processGone.
 * These are evaluated on the RESULTING (next) state.
 *
 * Lives in its own file so the original objectives.test.ts stays byte-for-byte
 * unedited (the additivity acceptance proof).
 */
import { describe, it, expect } from 'vitest';
import { checkObjectives } from './objectives';
import { parseCommand } from './parser';
import type { MissionConfig, MissionObjective, MissionProcess, MissionState, OutputLine, ParsedCommand } from './types';

function makeConfig(objectives: MissionObjective[], over: Partial<MissionConfig> = {}): MissionConfig {
  return {
    id: 'test',
    title: 'Test',
    week: 0,
    story: [],
    promptHost: 'box',
    promptUser: 'student',
    unlockAfterDay: 0,
    filesystem: { '~': { deploy: { status: 'stale', 'deploy.sh': '#!/bin/sh' } } },
    processes: [
      { pid: 1, user: 'root', cpu: 0, mem: 0.1, command: 'systemd' },
      { pid: 2201, user: 'app', cpu: 0, mem: 1.5, command: 'node server.js', stat: 'crashed' },
      { pid: 4521, user: 'root', cpu: 94.2, mem: 20, command: 'backup-script.sh', stat: 'R' },
    ],
    supportedCommands: ['pwd', 'ls', 'cd', 'cat', 'grep', 'ps', 'kill', 'chmod'],
    objectives,
    hints: [],
    optimalCommands: 5,
    ...over,
  };
}

function stateFor(config: MissionConfig, over: Partial<MissionState> = {}): MissionState {
  return {
    config,
    cwd: '~',
    fs: JSON.parse(JSON.stringify(config.filesystem)),
    processes: config.processes.map((p) => ({ ...p })),
    objectivesDone: config.objectives.map(() => false),
    hintsUsed: 0,
    commandsRun: 0,
    startedAtMs: null,
    victory: false,
    flags: { ...(config.flags ?? {}) },
    ...over,
  };
}

function parsed(input: string): ParsedCommand {
  const p = parseCommand(input);
  expect(p).not.toBeNull();
  return p!;
}

const out = (text: string): OutputLine => ({ text, kind: 'out' });
const sys = (text: string): OutputLine => ({ text, kind: 'sys' });
const err = (text: string): OutputLine => ({ text, kind: 'err' });

const crashedNode: MissionProcess = { pid: 2201, user: 'app', cpu: 0, mem: 1.5, command: 'node server.js', stat: 'crashed' };
const healthyNode: MissionProcess = { pid: 2310, user: 'app', cpu: 2.1, mem: 3.2, command: 'node server.js' };
const hog: MissionProcess = { pid: 4521, user: 'root', cpu: 94.2, mem: 20, command: 'backup-script.sh', stat: 'R' };

describe('checkObjectives — flagSet', () => {
  const obj: MissionObjective = { id: 1, text: 'fix', trigger: { cmd: 'chmod', when: { flagSet: 'deployFixed' } }, successLine: 'fixed' };

  it('completes when the flag became truthy in next', () => {
    const cfg = makeConfig([obj]);
    const prev = stateFor(cfg);
    const next = stateFor(cfg, { flags: { deployFixed: true } });
    expect(checkObjectives(prev, next, parsed('chmod +x deploy.sh'), [out('ok')])).toEqual([1]);
  });

  it('treats a non-empty string flag as set', () => {
    const cfg = makeConfig([{ id: 1, text: 'x', trigger: { cmd: 'chmod', when: { flagSet: 'mode' } }, successLine: 'ok' }]);
    const prev = stateFor(cfg);
    const next = stateFor(cfg, { flags: { mode: '0755' } });
    expect(checkObjectives(prev, next, parsed('chmod 0755 deploy.sh'), [out('ok')])).toEqual([1]);
  });

  it('does not complete while the flag is unset', () => {
    const cfg = makeConfig([obj]);
    const s = stateFor(cfg);
    expect(checkObjectives(s, s, parsed('chmod +x deploy.sh'), [out('ok')])).toEqual([]);
  });

  it('does not complete for a flag explicitly set false', () => {
    const cfg = makeConfig([obj]);
    const prev = stateFor(cfg);
    const next = stateFor(cfg, { flags: { deployFixed: false } });
    expect(checkObjectives(prev, next, parsed('chmod +x deploy.sh'), [out('ok')])).toEqual([]);
  });

  it('reads next.flags defensively when it is undefined', () => {
    const cfg = makeConfig([obj]);
    const prev = stateFor(cfg, { flags: undefined });
    const next = stateFor(cfg, { flags: undefined });
    expect(checkObjectives(prev, next, parsed('chmod +x deploy.sh'), [out('ok')])).toEqual([]);
  });
});

describe('checkObjectives — flagIs', () => {
  it('matches an exact string value', () => {
    const cfg = makeConfig([{ id: 1, text: 'x', trigger: { cmd: 'chmod', when: { flagIs: { name: 'mode', value: 'exec' } } }, successLine: 'ok' }]);
    const prev = stateFor(cfg);
    const next = stateFor(cfg, { flags: { mode: 'exec' } });
    expect(checkObjectives(prev, next, parsed('chmod +x x'), [out('ok')])).toEqual([1]);
  });

  it('does not match a different value', () => {
    const cfg = makeConfig([{ id: 1, text: 'x', trigger: { cmd: 'chmod', when: { flagIs: { name: 'mode', value: 'exec' } } }, successLine: 'ok' }]);
    const prev = stateFor(cfg);
    const next = stateFor(cfg, { flags: { mode: 'read' } });
    expect(checkObjectives(prev, next, parsed('chmod +x x'), [out('ok')])).toEqual([]);
  });

  it('matches a boolean value', () => {
    const cfg = makeConfig([{ id: 1, text: 'x', trigger: { cmd: 'chmod', when: { flagIs: { name: 'done', value: true } } }, successLine: 'ok' }]);
    const prev = stateFor(cfg);
    const next = stateFor(cfg, { flags: { done: true } });
    expect(checkObjectives(prev, next, parsed('chmod +x x'), [out('ok')])).toEqual([1]);
  });
});

describe('checkObjectives — fileContains', () => {
  const obj: MissionObjective = { id: 1, text: 'x', trigger: { cmd: 'chmod', when: { fileContains: { path: '~/deploy/status', text: 'OK' } } }, successLine: 'ok' };

  it('completes when the file in next contains the text', () => {
    const cfg = makeConfig([obj]);
    const prev = stateFor(cfg); // status is 'stale'
    const next = stateFor(cfg, { fs: { '~': { deploy: { status: 'OK — serving', 'deploy.sh': '#!/bin/sh' } } } });
    expect(checkObjectives(prev, next, parsed('chmod +x deploy.sh'), [out('ok')])).toEqual([1]);
  });

  it('does not complete when the text is absent', () => {
    const cfg = makeConfig([obj]);
    const s = stateFor(cfg); // status 'stale'
    expect(checkObjectives(s, s, parsed('chmod +x deploy.sh'), [out('ok')])).toEqual([]);
  });

  it('does not complete (and does not throw) for a missing file', () => {
    const cfg = makeConfig([{ id: 1, text: 'x', trigger: { cmd: 'chmod', when: { fileContains: { path: '~/nope', text: 'OK' } } }, successLine: 'ok' }]);
    const s = stateFor(cfg);
    expect(checkObjectives(s, s, parsed('chmod +x deploy.sh'), [out('ok')])).toEqual([]);
  });
});

describe('checkObjectives — processStarted', () => {
  const obj: MissionObjective = { id: 5, text: 'restart', trigger: { cmd: 'kill', when: { processStarted: 'node server.js' } }, successLine: 'back up' };

  it('completes when a healthy proc appears alongside a lingering crashed one', () => {
    const cfg = makeConfig([obj]);
    const prev = stateFor(cfg, { processes: [crashedNode, hog] });
    const next = stateFor(cfg, { processes: [crashedNode, healthyNode] });
    expect(checkObjectives(prev, next, parsed('kill 4521'), [sys('recovered')])).toEqual([5]);
  });

  it('does NOT complete when only a crashed same-named proc is present (both states)', () => {
    const cfg = makeConfig([obj]);
    const prev = stateFor(cfg, { processes: [crashedNode, hog] });
    const next = stateFor(cfg, { processes: [crashedNode] }); // still only crashed
    expect(checkObjectives(prev, next, parsed('kill 4521'), [sys('down')])).toEqual([]);
  });

  it('does NOT complete when the proc was already present-and-running in prev', () => {
    const cfg = makeConfig([obj]);
    const prev = stateFor(cfg, { processes: [healthyNode, hog] });
    const next = stateFor(cfg, { processes: [healthyNode] });
    expect(checkObjectives(prev, next, parsed('kill 4521'), [sys('x')])).toEqual([]);
  });
});

describe('checkObjectives — processGone', () => {
  const obj: MissionObjective = { id: 5, text: 'kill', trigger: { cmd: 'kill', when: { processGone: 'backup-script.sh' } }, successLine: 'dead' };

  it('completes when a present proc is gone in next', () => {
    const cfg = makeConfig([obj]);
    const prev = stateFor(cfg, { processes: [crashedNode, hog] });
    const next = stateFor(cfg, { processes: [crashedNode] });
    expect(checkObjectives(prev, next, parsed('kill 4521'), [sys('terminated')])).toEqual([5]);
  });

  it('does not complete while the proc is still present', () => {
    const cfg = makeConfig([obj]);
    const s = stateFor(cfg, { processes: [crashedNode, hog] });
    expect(checkObjectives(s, s, parsed('kill 4521'), [sys('x')])).toEqual([]);
  });
});

describe('checkObjectives — state triggers respect the err rule + no ordering', () => {
  it('any err line completes nothing even when the state condition holds', () => {
    const cfg = makeConfig([{ id: 1, text: 'fix', trigger: { cmd: 'chmod', when: { flagSet: 'deployFixed' } }, successLine: 'fixed' }]);
    const prev = stateFor(cfg);
    const next = stateFor(cfg, { flags: { deployFixed: true } });
    expect(checkObjectives(prev, next, parsed('chmod +x deploy.sh'), [err('Permission denied')])).toEqual([]);
  });

  it('a state-based objective completes while an earlier objective is still pending (unordered)', () => {
    const cfg = makeConfig([
      { id: 1, text: 'orient', trigger: { cmd: 'pwd', when: 'always' }, successLine: 'a' },
      { id: 2, text: 'fix', trigger: { cmd: 'chmod', when: { flagSet: 'deployFixed' } }, successLine: 'b' },
    ]);
    const prev = stateFor(cfg);
    const next = stateFor(cfg, { flags: { deployFixed: true } });
    expect(checkObjectives(prev, next, parsed('chmod +x deploy.sh'), [out('ok')])).toEqual([2]);
  });
});

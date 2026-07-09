import { describe, it, expect } from 'vitest';
import { checkObjectives } from './objectives';
import { parseCommand } from './parser';
import type { MissionConfig, MissionObjective, MissionState, OutputLine, ParsedCommand } from './types';

function makeConfig(objectives: MissionObjective[]): MissionConfig {
  return {
    id: 'test',
    title: 'Test',
    week: 0,
    story: [],
    promptHost: 'box',
    promptUser: 'student',
    unlockAfterDay: 0,
    filesystem: { '~': { logs: { 'a.log': 'x' } } },
    processes: [
      { pid: 1, user: 'root', cpu: 0, mem: 0.1, command: 'systemd' },
      { pid: 4521, user: 'root', cpu: 94.2, mem: 20, command: 'backup-script.sh' },
    ],
    supportedCommands: ['pwd', 'ls', 'cd', 'cat', 'grep', 'ps', 'kill'],
    objectives,
    hints: [],
    optimalCommands: 5,
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
const echo = (text: string): OutputLine => ({ text, kind: 'echo' });
const hint = (text: string): OutputLine => ({ text, kind: 'hint' });

describe('checkObjectives — cmd matching', () => {
  const obj: MissionObjective = { id: 1, text: 'orient', trigger: { cmd: 'pwd', when: 'always' }, successLine: 'ok' };

  it("completes on a matching cmd with 'always'", () => {
    const cfg = makeConfig([obj]);
    const s = stateFor(cfg);
    expect(checkObjectives(s, s, parsed('pwd'), [out('~')])).toEqual([1]);
  });

  it('does not complete on a non-matching cmd', () => {
    const cfg = makeConfig([obj]);
    const s = stateFor(cfg);
    expect(checkObjectives(s, s, parsed('ls'), [out('a')])).toEqual([]);
  });

  it('treats an undefined when as always', () => {
    const cfg = makeConfig([{ id: 1, text: 'x', trigger: { cmd: 'pwd' }, successLine: 'ok' }]);
    const s = stateFor(cfg);
    expect(checkObjectives(s, s, parsed('pwd'), [out('~')])).toEqual([1]);
  });

  it('matches any cmd in an array trigger', () => {
    const cfg = makeConfig([{ id: 1, text: 'x', trigger: { cmd: ['cat', 'grep'], when: 'always' }, successLine: 'ok' }]);
    const s = stateFor(cfg);
    expect(checkObjectives(s, s, parsed('grep x a.log'), [out('x')])).toEqual([1]);
    expect(checkObjectives(s, s, parsed('ps'), [out('x')])).toEqual([]);
  });

  it('counts BOTH sides of a pipe as run commands', () => {
    const cfg = makeConfig([{ id: 1, text: 'x', trigger: { cmd: 'grep', when: 'always' }, successLine: 'ok' }]);
    const s = stateFor(cfg);
    expect(checkObjectives(s, s, parsed('cat a.log | grep x'), [out('x')])).toEqual([1]);
  });

  it('does not complete when the command errored', () => {
    const cfg = makeConfig([obj]);
    const s = stateFor(cfg);
    expect(checkObjectives(s, s, parsed('pwd'), [err('boom')])).toEqual([]);
  });

  it('skips objectives that are already done', () => {
    const cfg = makeConfig([obj]);
    const prev = stateFor(cfg, { objectivesDone: [true] });
    expect(checkObjectives(prev, prev, parsed('pwd'), [out('~')])).toEqual([]);
  });
});

describe('checkObjectives — argIncludes', () => {
  it('matches a raw arg', () => {
    const cfg = makeConfig([
      { id: 1, text: 'x', trigger: { cmd: 'cat', when: { argIncludes: 'a.log' } }, successLine: 'ok' },
    ]);
    const s = stateFor(cfg);
    expect(checkObjectives(s, s, parsed('cat logs/a.log'), [out('x')])).toEqual([1]);
  });

  it('matches via the resolved path when the raw arg is relative', () => {
    const cfg = makeConfig([
      { id: 1, text: 'x', trigger: { cmd: 'cat', when: { argIncludes: '~/logs/a.log' } }, successLine: 'ok' },
    ]);
    const s = stateFor(cfg, { cwd: '~/logs' });
    expect(checkObjectives(s, s, parsed('cat a.log'), [out('x')])).toEqual([1]);
  });

  it('checks pipe-target args too', () => {
    const cfg = makeConfig([
      { id: 1, text: 'x', trigger: { cmd: 'grep', when: { argIncludes: '4521' } }, successLine: 'ok' },
    ]);
    const s = stateFor(cfg);
    expect(checkObjectives(s, s, parsed('cat a.log | grep 4521'), [])).toEqual([1]);
  });

  it('does not match an absent arg', () => {
    const cfg = makeConfig([
      { id: 1, text: 'x', trigger: { cmd: 'cat', when: { argIncludes: 'server.log' } }, successLine: 'ok' },
    ]);
    const s = stateFor(cfg);
    expect(checkObjectives(s, s, parsed('cat a.log'), [out('x')])).toEqual([]);
  });
});

describe('checkObjectives — cwdIs', () => {
  it('matches the NEXT cwd', () => {
    const cfg = makeConfig([
      { id: 1, text: 'x', trigger: { cmd: 'cd', when: { cwdIs: '~/logs' } }, successLine: 'ok' },
    ]);
    const prev = stateFor(cfg);
    const next = stateFor(cfg, { cwd: '~/logs' });
    expect(checkObjectives(prev, next, parsed('cd logs'), [])).toEqual([1]);
  });

  it('does not match a different cwd', () => {
    const cfg = makeConfig([
      { id: 1, text: 'x', trigger: { cmd: 'cd', when: { cwdIs: '~/app' } }, successLine: 'ok' },
    ]);
    const prev = stateFor(cfg);
    const next = stateFor(cfg, { cwd: '~/logs' });
    expect(checkObjectives(prev, next, parsed('cd logs'), [])).toEqual([]);
  });
});

describe('checkObjectives — killedPid', () => {
  const obj: MissionObjective = {
    id: 5,
    text: 'kill it',
    trigger: { cmd: 'kill', when: { killedPid: 4521 } },
    successLine: 'dead',
  };

  it('completes when the pid vanished between prev and next', () => {
    const cfg = makeConfig([obj]);
    const prev = stateFor(cfg);
    const next = stateFor(cfg, { processes: prev.processes.filter((p) => p.pid !== 4521) });
    expect(checkObjectives(prev, next, parsed('kill 4521'), [sys('terminated')])).toEqual([5]);
  });

  it('does not complete while the pid is still alive', () => {
    const cfg = makeConfig([obj]);
    const prev = stateFor(cfg);
    expect(checkObjectives(prev, prev, parsed('kill 4521'), [sys('nope')])).toEqual([]);
  });
});

describe('checkObjectives — outputMatched', () => {
  const obj: MissionObjective = {
    id: 3,
    text: 'evidence',
    trigger: { cmd: ['cat', 'grep'], when: { outputMatched: '4521' } },
    successLine: 'found',
  };

  it('matches out lines', () => {
    const cfg = makeConfig([obj]);
    const s = stateFor(cfg);
    expect(checkObjectives(s, s, parsed('cat a.log'), [out('blocked by pid 4521')])).toEqual([3]);
  });

  it('matches sys lines', () => {
    const cfg = makeConfig([obj]);
    const s = stateFor(cfg);
    expect(checkObjectives(s, s, parsed('cat a.log'), [sys('pid 4521 gone')])).toEqual([3]);
  });

  it('ignores echo and hint lines', () => {
    const cfg = makeConfig([obj]);
    const s = stateFor(cfg);
    expect(checkObjectives(s, s, parsed('cat 4521'), [echo('student@box:~$ cat 4521')])).toEqual([]);
    expect(checkObjectives(s, s, parsed('cat a.log'), [hint('try kill 4521')])).toEqual([]);
  });
});

describe('checkObjectives — no ordering constraint (anti-soft-lock)', () => {
  it('completes a later objective while earlier ones are still pending', () => {
    const cfg = makeConfig([
      { id: 1, text: 'orient', trigger: { cmd: 'pwd', when: 'always' }, successLine: 'a' },
      { id: 5, text: 'kill', trigger: { cmd: 'kill', when: { killedPid: 4521 } }, successLine: 'b' },
    ]);
    const prev = stateFor(cfg);
    const next = stateFor(cfg, { processes: prev.processes.filter((p) => p.pid !== 4521) });
    expect(checkObjectives(prev, next, parsed('kill 4521'), [sys('terminated')])).toEqual([5]);
  });

  it('completes multiple objectives on a single command', () => {
    const cfg = makeConfig([
      { id: 3, text: 'a', trigger: { cmd: ['cat', 'grep'], when: { outputMatched: '4521' } }, successLine: 'a' },
      { id: 4, text: 'b', trigger: { cmd: ['ps', 'cat', 'grep'], when: { outputMatched: 'backup-script' } }, successLine: 'b' },
    ]);
    const s = stateFor(cfg);
    const output = [out('blocked by pid 4521 (backup-script.sh)')];
    expect(checkObjectives(s, s, parsed('cat a.log'), output)).toEqual([3, 4]);
  });
});

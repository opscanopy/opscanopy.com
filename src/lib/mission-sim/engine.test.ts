import { describe, it, expect } from 'vitest';
import { createMission, runCommand, getStats, rankFor } from './engine';
import type { MissionConfig, MissionState } from './types';

function testConfig(): MissionConfig {
  return {
    id: 'test-mission',
    title: 'Test Mission',
    week: 0,
    story: ['Something is wrong on test-box.'],
    promptHost: 'test-box',
    promptUser: 'student',
    unlockAfterDay: 0,
    filesystem: {
      '~': {
        logs: { 'app.log': 'INFO boot ok\nERROR blocked by pid 42 (hog)' },
        'readme.txt': 'go read the logs',
      },
    },
    processes: [
      { pid: 1, user: 'root', cpu: 0.0, mem: 0.1, command: 'systemd' },
      { pid: 42, user: 'root', cpu: 97.0, mem: 12.0, command: 'hog', stat: 'R' },
      { pid: 7, user: 'app', cpu: 0.0, mem: 1.0, command: 'node app.js', stat: 'crashed' },
    ],
    supportedCommands: ['pwd', 'ls', 'cd', 'cat', 'grep', 'ps', 'kill', 'help', 'hint', 'clear'],
    objectives: [
      { id: 1, text: 'orient', trigger: { cmd: 'pwd', when: 'always' }, successLine: 'oriented' },
      { id: 2, text: 'evidence', trigger: { cmd: ['cat', 'grep'], when: { outputMatched: '42' } }, successLine: 'evidence found' },
      { id: 3, text: 'kill it', trigger: { cmd: 'kill', when: { killedPid: 42 } }, successLine: 'hog is dead' },
    ],
    hints: ['try pwd', 'read ~/logs/app.log'],
    optimalCommands: 4,
    onKill: [
      {
        pid: 42,
        removeProcs: [42],
        addProcs: [{ pid: 43, user: 'app', cpu: 1.0, mem: 1.0, command: 'node app.js' }],
        writeFiles: { '~/readme.txt': 'all good now' },
      },
    ],
  };
}

describe('createMission', () => {
  it('boots at ~ with cloned fs and processes', () => {
    const config = testConfig();
    const s = createMission(config);
    expect(s.cwd).toBe('~');
    expect(s.commandsRun).toBe(0);
    expect(s.hintsUsed).toBe(0);
    expect(s.victory).toBe(false);
    expect(s.objectivesDone).toEqual([false, false, false]);
    expect(s.startedAtMs).toBeNull();
    // deep clone: mutating state.fs must not touch the config
    (s.fs['~'] as Record<string, unknown>)['x.txt'] = 'scribble';
    expect((config.filesystem['~'] as Record<string, unknown>)['x.txt']).toBeUndefined();
    s.processes[0].cpu = 99;
    expect(config.processes[0].cpu).toBe(0.0);
  });
});

describe('runCommand — basics', () => {
  it('echoes the prompt + input as the first output line', () => {
    const s = createMission(testConfig());
    const r = runCommand(s, 'pwd');
    expect(r.output[0]).toEqual({ text: 'student@test-box:~$ pwd', kind: 'echo' });
    expect(r.output[1]).toEqual({ text: '~', kind: 'out' });
  });

  it('reports missing files with the exact error at output[1]', () => {
    const s = createMission(testConfig());
    const r = runCommand(s, 'cat nope.txt');
    expect(r.output[1].text).toBe('cat: nope.txt: No such file or directory');
    expect(r.output[1].kind).toBe('err');
  });

  it('increments commandsRun even for erroring commands', () => {
    const s = createMission(testConfig());
    const r = runCommand(s, 'frobnicate');
    expect(r.output[1].text).toBe('bash: frobnicate: command not found');
    expect(r.state.commandsRun).toBe(1);
  });

  it('does NOT increment commandsRun for empty input', () => {
    const s = createMission(testConfig());
    for (const input of ['', '   ', '\t']) {
      const r = runCommand(s, input);
      expect(r.state.commandsRun).toBe(0);
      expect(r.completed).toEqual([]);
      expect(r.output[0].kind).toBe('echo');
    }
  });

  it('reports a pipe syntax error and still counts the command', () => {
    const s = createMission(testConfig());
    const r = runCommand(s, '|||');
    expect(r.output[1].kind).toBe('err');
    expect(r.output[1].text).toContain('syntax error');
    expect(r.state.commandsRun).toBe(1);
  });

  it('is immutable at the top level — the previous state is untouched', () => {
    const s = createMission(testConfig());
    const r1 = runCommand(s, 'cd logs');
    expect(s.cwd).toBe('~');
    expect(r1.state.cwd).toBe('~/logs');
    expect(s.commandsRun).toBe(0);

    const r2 = runCommand(r1.state, 'kill 42');
    expect(r1.state.processes.some((p) => p.pid === 42)).toBe(true);
    expect(r2.state.processes.some((p) => p.pid === 42)).toBe(false);
    expect(r1.state.objectivesDone).toEqual([false, false, false]);
  });

  it('hint output is kind hint and hintsUsed increments', () => {
    const s = createMission(testConfig());
    const r = runCommand(s, 'hint');
    expect(r.output[1]).toEqual({ text: 'try pwd', kind: 'hint' });
    expect(r.state.hintsUsed).toBe(1);
  });

  it('the echo prompt reflects the current cwd', () => {
    const s = createMission(testConfig());
    const r = runCommand(runCommand(s, 'cd logs').state, 'pwd');
    expect(r.output[0].text).toBe('student@test-box:~/logs$ pwd');
  });
});

describe('runCommand — objectives, kill effects, victory', () => {
  it('plays through to victory with stats and rank', () => {
    let s = createMission(testConfig());

    let r = runCommand(s, 'pwd');
    expect(r.completed).toEqual([1]);
    expect(r.output.at(-1)).toEqual({ text: 'oriented', kind: 'ok' });
    expect(r.victory).toBe(false);
    s = r.state;

    r = runCommand(s, 'cat logs/app.log');
    expect(r.completed).toEqual([2]);
    expect(r.victory).toBe(false);
    s = r.state;

    r = runCommand(s, 'kill 42');
    expect(r.completed).toEqual([3]);
    expect(r.victory).toBe(true);
    expect(r.state.victory).toBe(true);
    s = r.state;

    // kill effects applied AND narrated without another command
    const killText = r.output.map((l) => l.text).join('\n');
    expect(killText).toContain('hog');
    expect(killText).toContain('43');
    expect(killText).toContain('all good now');
    expect(s.processes.some((p) => p.pid === 42)).toBe(false);
    expect(s.processes.some((p) => p.pid === 43)).toBe(true);

    // the rewritten file is readable in-game
    const after = runCommand(s, 'cat readme.txt');
    expect(after.output[1].text).toBe('all good now');

    const stats = getStats(s);
    expect(stats).toEqual({ commandsRun: 3, hintsUsed: 0 });
    expect(rankFor(stats, s.config)).toBe('SRE material');
  });

  it('victory persists across later commands', () => {
    let s = createMission(testConfig());
    for (const c of ['pwd', 'cat logs/app.log', 'kill 42']) s = runCommand(s, c).state;
    expect(s.victory).toBe(true);
    const r = runCommand(s, 'ls');
    expect(r.victory).toBe(true);
    expect(r.state.victory).toBe(true);
  });

  it('completes objectives in any order (kill-first must not soft-lock)', () => {
    let s = createMission(testConfig());
    let r = runCommand(s, 'kill 42');
    expect(r.completed).toEqual([3]);
    expect(r.victory).toBe(false);
    s = r.state;

    r = runCommand(s, 'cat ~/logs/app.log');
    expect(r.completed).toEqual([2]); // the log still holds the evidence post-kill
    s = r.state;

    r = runCommand(s, 'pwd');
    expect(r.completed).toEqual([1]);
    expect(r.victory).toBe(true);
  });
});

describe('rankFor', () => {
  const config = testConfig(); // optimalCommands: 4

  it('SRE material: within optimal and no hints', () => {
    expect(rankFor({ commandsRun: 4, hintsUsed: 0 }, config)).toBe('SRE material');
    expect(rankFor({ commandsRun: 3, hintsUsed: 0 }, config)).toBe('SRE material');
  });

  it('Solid on-call: within optimal+4 OR at most one hint', () => {
    expect(rankFor({ commandsRun: 8, hintsUsed: 0 }, config)).toBe('Solid on-call');
    expect(rankFor({ commandsRun: 4, hintsUsed: 1 }, config)).toBe('Solid on-call');
    expect(rankFor({ commandsRun: 30, hintsUsed: 1 }, config)).toBe('Solid on-call');
  });

  it('Survived — that counts: everything else', () => {
    expect(rankFor({ commandsRun: 9, hintsUsed: 2 }, config)).toBe('Survived — that counts');
    expect(rankFor({ commandsRun: 30, hintsUsed: 4 }, config)).toBe('Survived — that counts');
  });
});

describe('runCommand — never throws (fuzz)', () => {
  const GARBAGE: string[] = [
    '',
    '   ',
    '\t\t',
    '|||',
    '|',
    'a | b | c',
    'kill',
    'kill abc',
    'kill -9 42',
    'kill 99999999999999999999',
    'kill 0',
    '🚀🔥💥',
    'cat 🚀',
    'x'.repeat(1000),
    'grep',
    'grep "',
    '"""',
    '"unclosed quote',
    'cd ../../../../..',
    'cd //',
    'ls -l -a --wat',
    '-l',
    '--',
    'cat | grep',
    'cat "" ""',
    'sudo rm -rf /',
    'kill 1',
    'ps aux | grep node',
    'cat ~/logs/app.log|grep|',
    'help me please now',
    'hint hint hint',
    'grep ] [',
    'pwd extra args here',
    ' ',
    'ls -l',
  ];

  it(`survives ${GARBAGE.length} garbage inputs with a coherent state`, () => {
    expect(GARBAGE.length).toBeGreaterThanOrEqual(20);
    let s: MissionState = createMission(testConfig());
    for (const input of GARBAGE) {
      let r!: ReturnType<typeof runCommand>;
      expect(() => {
        r = runCommand(s, input);
      }).not.toThrow();
      // state coherence after every input
      expect(typeof r.state.cwd).toBe('string');
      expect(r.state.cwd.startsWith('~')).toBe(true);
      expect(Array.isArray(r.state.processes)).toBe(true);
      expect(Array.isArray(r.output)).toBe(true);
      expect(r.output[0].kind).toBe('echo');
      expect(typeof r.victory).toBe('boolean');
      expect(r.state.commandsRun).toBeGreaterThanOrEqual(s.commandsRun);
      expect(r.state.objectivesDone).toHaveLength(s.config.objectives.length);
      s = r.state;
    }
    // note: 'kill -9 42' legitimately kills the hog — fuzz only asserts coherence
    expect(s.processes.some((p) => p.pid === 1)).toBe(true); // pid 1 survives everything
  });
});

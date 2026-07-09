import { describe, it, expect } from 'vitest';
import { execute } from './commands';
import { parseCommand } from './parser';
import type { MissionConfig, MissionState, ParsedCommand } from './types';

function makeConfig(overrides: Partial<MissionConfig> = {}): MissionConfig {
  return {
    id: 'test-mission',
    title: 'Test Mission',
    week: 0,
    story: ['a test'],
    promptHost: 'test-box',
    promptUser: 'student',
    unlockAfterDay: 0,
    filesystem: {
      '~': {
        app: { 'server.js': '// stub', status: 'CRASHED — waiting for CPU' },
        logs: {
          'server.log':
            '01:54 [INFO] boot ok\n01:55 [ERROR] worker starved, blocked by pid 4521 (backup-script.sh)\n01:56 [ERROR] Retry failed',
        },
        'notes.txt': 'check the logs',
      },
    },
    processes: [
      { pid: 1, user: 'root', cpu: 0.0, mem: 0.1, command: 'systemd' },
      { pid: 812, user: 'root', cpu: 0.0, mem: 0.2, command: 'sshd' },
      { pid: 2201, user: 'app', cpu: 0.0, mem: 1.5, command: 'node server.js', stat: 'crashed' },
      { pid: 4521, user: 'root', cpu: 94.2, mem: 22.4, command: 'backup-script.sh', stat: 'R' },
      { pid: 5000, user: 'student', cpu: 0.0, mem: 0.3, command: 'bash' },
    ],
    supportedCommands: ['pwd', 'ls', 'cd', 'cat', 'grep', 'ps', 'kill', 'help', 'hint', 'clear'],
    objectives: [{ id: 1, text: 'x', trigger: { cmd: 'pwd', when: 'always' }, successLine: 'ok' }],
    hints: ['first hint', 'second hint'],
    optimalCommands: 5,
    onKill: [
      {
        pid: 4521,
        removeProcs: [4521],
        addProcs: [{ pid: 2310, user: 'app', cpu: 2.1, mem: 3.2, command: 'node server.js' }],
        writeFiles: { '~/app/status': 'OK — serving traffic' },
      },
    ],
    ...overrides,
  };
}

function makeState(overrides: Partial<MissionState> = {}): MissionState {
  const config = overrides.config ?? makeConfig();
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
    ...overrides,
  };
}

function run(state: MissionState, input: string) {
  const parsed = parseCommand(input) as ParsedCommand;
  expect(parsed).not.toBeNull();
  return execute(state, parsed);
}

describe('pwd', () => {
  it('prints the cwd', () => {
    const r = run(makeState(), 'pwd');
    expect(r.output).toEqual([{ text: '~', kind: 'out' }]);
  });

  it('prints a nested cwd', () => {
    const r = run(makeState({ cwd: '~/logs' }), 'pwd');
    expect(r.output[0].text).toBe('~/logs');
  });
});

describe('ls', () => {
  it('lists the cwd with dirs marked by a trailing slash', () => {
    const r = run(makeState(), 'ls');
    expect(r.output.map((l) => l.text)).toEqual(['app/', 'logs/', 'notes.txt']);
    expect(r.output.every((l) => l.kind === 'out')).toBe(true);
  });

  it('lists a path argument', () => {
    const r = run(makeState(), 'ls logs');
    expect(r.output.map((l) => l.text)).toEqual(['server.log']);
  });

  it('tolerates -l with fake perms columns', () => {
    const r = run(makeState(), 'ls -l');
    expect(r.output).toHaveLength(3);
    expect(r.output[0].text).toMatch(/^drwx/);
    expect(r.output[2].text).toMatch(/^-rw-/);
    expect(r.output[2].text).toContain('notes.txt');
  });

  it('prints the operand when target is a file', () => {
    const r = run(makeState(), 'ls notes.txt');
    expect(r.output.map((l) => l.text)).toEqual(['notes.txt']);
  });

  it('errors on a missing path', () => {
    const r = run(makeState(), 'ls nope');
    expect(r.output[0]).toEqual({
      text: "ls: cannot access 'nope': No such file or directory",
      kind: 'err',
    });
  });
});

describe('cd', () => {
  it('changes directory via effects', () => {
    const r = run(makeState(), 'cd logs');
    expect(r.output).toEqual([]);
    expect(r.effects.cwd).toBe('~/logs');
  });

  it('goes up with ..', () => {
    const r = run(makeState({ cwd: '~/logs' }), 'cd ..');
    expect(r.effects.cwd).toBe('~');
  });

  it('goes home with no args', () => {
    const r = run(makeState({ cwd: '~/logs' }), 'cd');
    expect(r.effects.cwd).toBe('~');
  });

  it('errors on a file target with the exact bash string', () => {
    const r = run(makeState(), 'cd notes.txt');
    expect(r.output[0]).toEqual({ text: 'bash: cd: notes.txt: Not a directory', kind: 'err' });
    expect(r.effects.cwd).toBeUndefined();
  });

  it('errors on a missing target with the exact bash string', () => {
    const r = run(makeState(), 'cd ghost');
    expect(r.output[0]).toEqual({ text: 'bash: cd: ghost: No such file or directory', kind: 'err' });
  });
});

describe('cat', () => {
  it('prints file lines', () => {
    const r = run(makeState(), 'cat notes.txt');
    expect(r.output).toEqual([{ text: 'check the logs', kind: 'out' }]);
  });

  it('prints a multi-line file as separate lines', () => {
    const r = run(makeState(), 'cat logs/server.log');
    expect(r.output).toHaveLength(3);
    expect(r.output[1].text).toContain('4521');
  });

  it('errors on a missing file with the exact string', () => {
    const r = run(makeState(), 'cat nope.txt');
    expect(r.output[0]).toEqual({ text: 'cat: nope.txt: No such file or directory', kind: 'err' });
  });

  it('errors on a directory', () => {
    const r = run(makeState(), 'cat app');
    expect(r.output[0]).toEqual({ text: 'cat: app: Is a directory', kind: 'err' });
  });

  it('errors with no operand', () => {
    const r = run(makeState(), 'cat');
    expect(r.output[0].kind).toBe('err');
  });
});

describe('grep', () => {
  it('prints matching lines from a file', () => {
    const r = run(makeState({ cwd: '~/logs' }), 'grep ERROR server.log');
    expect(r.output).toHaveLength(2);
    expect(r.output[0].text).toContain('[ERROR]');
  });

  it('is case-insensitive with -i', () => {
    const r = run(makeState({ cwd: '~/logs' }), 'grep -i retry server.log');
    expect(r.output).toHaveLength(1);
    expect(r.output[0].text).toContain('Retry failed');
  });

  it('prints nothing on no match (no error)', () => {
    const r = run(makeState({ cwd: '~/logs' }), 'grep zzz server.log');
    expect(r.output).toEqual([]);
  });

  it('errors on a missing file with the exact string', () => {
    const r = run(makeState(), 'grep x nope');
    expect(r.output[0]).toEqual({ text: 'grep: nope: No such file or directory', kind: 'err' });
  });

  it('errors with no pattern or no file', () => {
    expect(run(makeState(), 'grep').output[0].kind).toBe('err');
    expect(run(makeState(), 'grep onlypattern').output[0].kind).toBe('err');
  });
});

describe('pipe: cat | grep', () => {
  it('feeds cat stdout into grep', () => {
    const r = run(makeState(), 'cat logs/server.log | grep 4521');
    expect(r.output).toHaveLength(1);
    expect(r.output[0].text).toContain('blocked by pid 4521');
    expect(r.output[0].kind).toBe('out');
  });

  it('propagates the left error and matches nothing', () => {
    const r = run(makeState(), 'cat nope.txt | grep x');
    expect(r.output).toHaveLength(1);
    expect(r.output[0]).toEqual({ text: 'cat: nope.txt: No such file or directory', kind: 'err' });
  });

  it('pipes ps into grep', () => {
    const r = run(makeState(), 'ps | grep backup');
    expect(r.output).toHaveLength(1);
    expect(r.output[0].text).toContain('backup-script.sh');
  });

  it('rejects a non-grep pipe target', () => {
    const r = run(makeState(), 'cat notes.txt | cat');
    expect(r.output.some((l) => l.kind === 'err')).toBe(true);
  });
});

describe('ps', () => {
  it('renders an aux-style header and rows', () => {
    const r = run(makeState(), 'ps');
    expect(r.output).toHaveLength(6); // header + 5 procs
    const header = r.output[0].text;
    for (const col of ['USER', 'PID', '%CPU', '%MEM', 'STAT', 'COMMAND']) {
      expect(header).toContain(col);
    }
  });

  it('shows the stat note for flagged processes', () => {
    const r = run(makeState(), 'ps');
    const nodeRow = r.output.find((l) => l.text.includes('2201'))!;
    expect(nodeRow.text).toContain('crashed');
    const hogRow = r.output.find((l) => l.text.includes('4521'))!;
    expect(hogRow.text).toContain('backup-script.sh');
    expect(hogRow.text).toContain('94.2');
  });
});

describe('kill', () => {
  it('refuses pid 1 with the exact string', () => {
    const r = run(makeState(), 'kill 1');
    expect(r.output[0]).toEqual({ text: 'bash: kill: (1) - Operation not permitted', kind: 'err' });
    expect(r.effects.removePids).toBeUndefined();
  });

  it('errors on an unknown pid with the exact string', () => {
    const r = run(makeState(), 'kill 999');
    expect(r.output[0]).toEqual({ text: 'bash: kill: (999) - No such process', kind: 'err' });
  });

  it('errors on a non-numeric pid', () => {
    const r = run(makeState(), 'kill abc');
    expect(r.output[0]).toEqual({
      text: 'bash: kill: abc: arguments must be process or job IDs',
      kind: 'err',
    });
  });

  it('errors with no args', () => {
    expect(run(makeState(), 'kill').output[0].kind).toBe('err');
  });

  it('kills a live non-target pid with a consequence line', () => {
    const r = run(makeState(), 'kill 812');
    expect(r.effects.removePids).toEqual([812]);
    expect(r.output.length).toBeGreaterThanOrEqual(2);
    expect(r.output[0].kind).toBe('sys');
    expect(r.output[0].text).toContain('sshd');
    expect(r.output[1].kind).toBe('sys');
  });

  it('triggers onKill effects for the target pid and auto-prints the recovery', () => {
    const r = run(makeState(), 'kill 4521');
    expect(r.effects.removePids).toEqual([4521]);
    expect(r.effects.addProcs).toHaveLength(1);
    expect(r.effects.addProcs![0].pid).toBe(2310);
    expect(r.effects.writeFiles).toEqual({ '~/app/status': 'OK — serving traffic' });
    const text = r.output.map((l) => l.text).join('\n');
    expect(text).toContain('backup-script.sh');
    expect(text).toContain('2310');
    expect(text).toContain('OK — serving traffic');
    expect(r.output.every((l) => l.kind === 'sys')).toBe(true);
  });
});

describe('help', () => {
  it('lists every supported command with a one-liner', () => {
    const state = makeState();
    const r = run(state, 'help');
    expect(r.output).toHaveLength(state.config.supportedCommands.length);
    for (const cmd of state.config.supportedCommands) {
      expect(r.output.some((l) => l.text.includes(cmd))).toBe(true);
    }
  });
});

describe('hint', () => {
  it('returns the next progressive hint and increments hintsUsed via effects', () => {
    const r = run(makeState(), 'hint');
    expect(r.output).toEqual([{ text: 'first hint', kind: 'hint' }]);
    expect(r.effects.hintsUsedDelta).toBe(1);
  });

  it('returns the second hint when one is used', () => {
    const r = run(makeState({ hintsUsed: 1 }), 'hint');
    expect(r.output[0].text).toBe('second hint');
  });

  it('is gentle when hints are exhausted and does not over-increment', () => {
    const r = run(makeState({ hintsUsed: 2 }), 'hint');
    expect(r.output[0].kind).toBe('hint');
    expect(r.effects.hintsUsedDelta).toBeUndefined();
  });
});

describe('clear', () => {
  it('is a no-op in the engine (island handles it)', () => {
    const r = run(makeState(), 'clear');
    expect(r.output).toEqual([]);
    expect(r.effects).toEqual({});
  });
});

describe('unsupported and unknown commands', () => {
  it('denies sudo in fiction', () => {
    const r = run(makeState(), 'sudo rm -rf /');
    expect(r.output[0].text).toBe('sudo: not available on this training box');
    expect(r.output[0].kind).toBe('err');
  });

  it('denies other real commands in fiction', () => {
    for (const input of ['vim server.js', 'top', 'nano notes.txt', 'systemctl restart app']) {
      const r = run(makeState(), input);
      expect(r.output[0].kind).toBe('err');
      expect(r.output[0].text).toContain('not available');
    }
  });

  it('reports unknown commands with the exact bash string', () => {
    const r = run(makeState(), 'frobnicate');
    expect(r.output[0]).toEqual({ text: 'bash: frobnicate: command not found', kind: 'err' });
  });

  it('denies implemented commands that the mission does not support', () => {
    const config = makeConfig({ supportedCommands: ['pwd', 'ls'] });
    const r = run(makeState({ config }), 'grep x y');
    expect(r.output[0].kind).toBe('err');
    expect(r.output[0].text).toContain('not available');
  });
});

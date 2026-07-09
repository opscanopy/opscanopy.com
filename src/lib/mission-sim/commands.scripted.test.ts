/**
 * Tests for config-authored scripted commands added for the Mission 90 engine
 * expansion: per-verb, state-dependent output + immutable effects, dispatch
 * precedence (scripted-beats-denial, built-ins never shadowable), match fields,
 * help lookup, piping, and rejected-pipe effect drop.
 *
 * Lives in its own file so commands.test.ts stays byte-for-byte unedited.
 */
import { describe, it, expect } from 'vitest';
import { execute } from './commands';
import { parseCommand } from './parser';
import type { MissionConfig, MissionState, ParsedCommand } from './types';

const BUILTINS = ['pwd', 'ls', 'cd', 'cat', 'grep', 'ps', 'kill', 'help', 'hint', 'clear'];

function makeConfig(over: Partial<MissionConfig> = {}): MissionConfig {
  return {
    id: 'scripted-test',
    title: 'Scripted Test',
    week: 3,
    story: ['a test'],
    promptHost: 'box',
    promptUser: 'student',
    unlockAfterDay: 0,
    filesystem: {
      '~': {
        deploy: { status: 'stale', 'deploy.sh': '#!/bin/sh\necho deploy' },
        logs: { 'cron.log': 'cron started' },
        'notes.txt': 'hi',
      },
    },
    processes: [
      { pid: 1, user: 'root', cpu: 0.0, mem: 0.1, command: 'systemd' },
      { pid: 4521, user: 'root', cpu: 94.2, mem: 22.4, command: 'backup-script.sh', stat: 'R' },
      { pid: 2201, user: 'app', cpu: 0.0, mem: 1.5, command: 'node server.js', stat: 'crashed' },
    ],
    supportedCommands: [...BUILTINS],
    objectives: [{ id: 1, text: 'x', trigger: { cmd: 'pwd', when: 'always' }, successLine: 'ok' }],
    hints: ['a hint'],
    optimalCommands: 5,
    ...over,
  };
}

function makeState(over: Partial<MissionState> = {}): MissionState {
  const config = over.config ?? makeConfig();
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

function run(state: MissionState, input: string) {
  const parsed = parseCommand(input) as ParsedCommand;
  expect(parsed).not.toBeNull();
  return execute(state, parsed);
}

function texts(r: ReturnType<typeof run>): string[] {
  return r.output.map((l) => l.text);
}

describe('scripted dispatch — basics', () => {
  it('runs a scripted + supported verb', () => {
    const config = makeConfig({
      supportedCommands: [...BUILTINS, 'chmod'],
      commands: { chmod: { oneLiner: 'change file mode bits', responses: [{ output: ['mode changed'] }] } },
    });
    const r = run(makeState({ config }), 'chmod +x deploy.sh');
    expect(r.output).toEqual([{ text: 'mode changed', kind: 'out' }]);
  });

  it('maps outKind onto every response line', () => {
    const config = makeConfig({
      supportedCommands: [...BUILTINS, 'crontab'],
      commands: { crontab: { oneLiner: 'list cron', responses: [{ output: ['*/5 * * * * deploy'], outKind: 'sys' }] } },
    });
    const r = run(makeState({ config }), 'crontab -l');
    expect(r.output[0]).toEqual({ text: '*/5 * * * * deploy', kind: 'sys' });
  });

  it('first matching response wins (ordered)', () => {
    const config = makeConfig({
      supportedCommands: [...BUILTINS, 'git'],
      commands: {
        git: {
          oneLiner: 'read-only git',
          responses: [
            { match: { args: ['log'] }, output: ['first'] },
            { output: ['catch-all'] }, // no match → matches anything
          ],
        },
      },
    });
    expect(texts(run(makeState({ config }), 'git log'))).toEqual(['first']);
    expect(texts(run(makeState({ config }), 'git status'))).toEqual(['catch-all']);
  });

  it('falls back to default when no response matches', () => {
    const config = makeConfig({
      supportedCommands: [...BUILTINS, 'git'],
      commands: {
        git: { oneLiner: 'g', responses: [{ match: { args: ['log'] }, output: ['LOG'] }], default: { output: ['usage: git <cmd>'] } },
      },
    });
    expect(texts(run(makeState({ config }), 'git push'))).toEqual(['usage: git <cmd>']);
  });

  it('emits a generic non-empty diagnostic line when there is no response and no default', () => {
    const config = makeConfig({
      supportedCommands: [...BUILTINS, 'noop'],
      commands: { noop: { oneLiner: 'nothing' } },
    });
    const r = run(makeState({ config }), 'noop');
    expect(r.output).toHaveLength(1);
    expect(r.output[0].text.length).toBeGreaterThan(0);
    expect(r.output[0].text).toContain('noop');
    expect(r.effects).toEqual({});
  });

  it('carries a response effect straight through', () => {
    const config = makeConfig({
      supportedCommands: [...BUILTINS, 'chmod'],
      commands: {
        chmod: {
          oneLiner: 'c',
          responses: [{ match: { argIncludes: 'deploy.sh' }, output: ['now executable'], effect: { setFlags: { deployFixed: true } } }],
        },
      },
    });
    const r = run(makeState({ config }), 'chmod +x deploy.sh');
    expect(r.output).toEqual([{ text: 'now executable', kind: 'out' }]);
    expect(r.effects.setFlags).toEqual({ deployFixed: true });
  });
});

describe('scripted match fields (each ANDs)', () => {
  function cfgWith(responses: NonNullable<MissionConfig['commands']>['x']['responses']): MissionConfig {
    return makeConfig({
      supportedCommands: [...BUILTINS, 'probe'],
      commands: { probe: { oneLiner: 'probe', responses, default: { output: ['DEFAULT'] } } },
    });
  }

  it('args — every token must be present', () => {
    const config = cfgWith([{ match: { args: ['a', 'b'] }, output: ['HIT'] }]);
    expect(texts(run(makeState({ config }), 'probe a b'))).toEqual(['HIT']);
    expect(texts(run(makeState({ config }), 'probe a'))).toEqual(['DEFAULT']);
  });

  it('argIncludes — substring of the joined args', () => {
    const config = cfgWith([{ match: { argIncludes: 'deploy.sh' }, output: ['HIT'] }]);
    expect(texts(run(makeState({ config }), 'probe /home/deploy.sh'))).toEqual(['HIT']);
    expect(texts(run(makeState({ config }), 'probe other'))).toEqual(['DEFAULT']);
  });

  it('flags — every flag must be present', () => {
    const config = cfgWith([{ match: { flags: ['-r'] }, output: ['HIT'] }]);
    expect(texts(run(makeState({ config }), 'probe -r thing'))).toEqual(['HIT']);
    expect(texts(run(makeState({ config }), 'probe thing'))).toEqual(['DEFAULT']);
  });

  it('cwdIs — matches the current working directory', () => {
    const config = cfgWith([{ match: { cwdIs: '~/deploy' }, output: ['HIT'] }]);
    expect(texts(run(makeState({ config, cwd: '~/deploy' }), 'probe'))).toEqual(['HIT']);
    expect(texts(run(makeState({ config, cwd: '~' }), 'probe'))).toEqual(['DEFAULT']);
  });

  it('flag — state flag equals value (defaults to true), read defensively', () => {
    const config = cfgWith([{ match: { flag: { name: 'done' } }, output: ['HIT'] }]);
    // makeState seeds NO flags → state.flags is undefined → must not match, must not throw
    expect(texts(run(makeState({ config }), 'probe'))).toEqual(['DEFAULT']);
    expect(texts(run(makeState({ config, flags: { done: true } }), 'probe'))).toEqual(['HIT']);
    expect(texts(run(makeState({ config, flags: { done: false } }), 'probe'))).toEqual(['DEFAULT']);
  });

  it('flag — explicit string equals', () => {
    const config = cfgWith([{ match: { flag: { name: 'mode', equals: 'exec' } }, output: ['HIT'] }]);
    expect(texts(run(makeState({ config, flags: { mode: 'exec' } }), 'probe'))).toEqual(['HIT']);
    expect(texts(run(makeState({ config, flags: { mode: 'read' } }), 'probe'))).toEqual(['DEFAULT']);
  });

  it('fileContains — file contents include the text (null-safe)', () => {
    const config = cfgWith([{ match: { fileContains: { path: '~/deploy/status', text: 'OK' } }, output: ['HIT'] }]);
    expect(texts(run(makeState({ config }), 'probe'))).toEqual(['DEFAULT']); // status is 'stale'
    const okFs = { '~': { deploy: { status: 'OK — serving', 'deploy.sh': '' }, logs: { 'cron.log': '' }, 'notes.txt': '' } };
    expect(texts(run(makeState({ config, fs: okFs }), 'probe'))).toEqual(['HIT']);
    const missFs = { '~': { deploy: { 'deploy.sh': '' } } };
    expect(texts(run(makeState({ config, fs: missFs }), 'probe'))).toEqual(['DEFAULT']); // missing file → no throw
  });

  it('processPresent — a proc whose command contains the text exists', () => {
    const config = cfgWith([{ match: { processPresent: 'backup-script' }, output: ['HIT'] }]);
    expect(texts(run(makeState({ config }), 'probe'))).toEqual(['HIT']);
    const noHog = makeState({ config, processes: makeConfig().processes.filter((p) => !p.command.includes('backup-script')) });
    expect(texts(run(noHog, 'probe'))).toEqual(['DEFAULT']);
  });

  it('processAbsent — no proc whose command contains the text exists', () => {
    const config = cfgWith([{ match: { processAbsent: 'backup-script' }, output: ['HIT'] }]);
    expect(texts(run(makeState({ config }), 'probe'))).toEqual(['DEFAULT']); // hog present
    const noHog = makeState({ config, processes: makeConfig().processes.filter((p) => !p.command.includes('backup-script')) });
    expect(texts(run(noHog, 'probe'))).toEqual(['HIT']);
  });

  it('ANDs multiple fields — all must hold', () => {
    const config = cfgWith([{ match: { argIncludes: 'deploy.sh', flag: { name: 'ready' } }, output: ['HIT'] }]);
    expect(texts(run(makeState({ config, flags: { ready: true } }), 'probe deploy.sh'))).toEqual(['HIT']);
    expect(texts(run(makeState({ config }), 'probe deploy.sh'))).toEqual(['DEFAULT']); // flag missing
    expect(texts(run(makeState({ config, flags: { ready: true } }), 'probe other'))).toEqual(['DEFAULT']); // arg missing
  });
});

describe('dispatch precedence', () => {
  it('a scripted + supported verb BEATS a DENIAL entry (chmod runs)', () => {
    const config = makeConfig({
      supportedCommands: [...BUILTINS, 'chmod'],
      commands: { chmod: { oneLiner: 'c', responses: [{ output: ['+x applied'] }] } },
    });
    const r = run(makeState({ config }), 'chmod +x deploy.sh');
    expect(r.output[0].kind).toBe('out');
    expect(r.output[0].text).toBe('+x applied');
  });

  it('a scripted verb NOT in supportedCommands still denies', () => {
    const config = makeConfig({
      supportedCommands: [...BUILTINS], // chmod scripted but NOT supported
      commands: { chmod: { oneLiner: 'c', responses: [{ output: ['should not run'] }] } },
    });
    const r = run(makeState({ config }), 'chmod +x deploy.sh');
    expect(r.output[0].kind).toBe('err');
    expect(r.output[0].text).toContain('not available');
  });

  it('enables other real commands from config (docker, dig, terraform, aws, kubectl, git)', () => {
    for (const verb of ['docker', 'dig', 'terraform', 'aws', 'kubectl', 'git']) {
      const config = makeConfig({
        supportedCommands: [...BUILTINS, verb],
        commands: { [verb]: { oneLiner: verb, responses: [{ output: [`${verb} ran`] }] } },
      });
      const r = run(makeState({ config }), `${verb} something`);
      expect(r.output[0].kind, verb).toBe('out');
      expect(r.output[0].text).toBe(`${verb} ran`);
    }
  });

  it('never shadows a built-in even if config defines it as scripted', () => {
    const config = makeConfig({
      supportedCommands: [...BUILTINS],
      commands: { ls: { oneLiner: 'HACKED', responses: [{ output: ['pwned'] }] } },
    });
    const r = run(makeState({ config }), 'ls');
    expect(texts(r)).toContain('deploy/'); // real built-in listing
    expect(texts(r)).not.toContain('pwned');
  });

  it('an unknown, non-scripted verb is still command-not-found', () => {
    const r = run(makeState(), 'frobnicate');
    expect(r.output[0]).toEqual({ text: 'bash: frobnicate: command not found', kind: 'err' });
  });
});

describe('help with scripted verbs', () => {
  it('lists a scripted oneLiner and keeps length === supportedCommands.length', () => {
    const config = makeConfig({
      supportedCommands: [...BUILTINS, 'chmod'],
      commands: { chmod: { oneLiner: 'change file mode bits', responses: [{ output: ['x'] }] } },
    });
    const state = makeState({ config });
    const r = run(state, 'help');
    expect(r.output).toHaveLength(state.config.supportedCommands.length);
    expect(r.output.some((l) => l.text.includes('chmod') && l.text.includes('change file mode bits'))).toBe(true);
    // built-in oneLiners still present
    expect(r.output.some((l) => l.text.includes('pwd'))).toBe(true);
  });
});

describe('scripted output + pipes', () => {
  it('pipes scripted out lines into grep', () => {
    const config = makeConfig({
      supportedCommands: [...BUILTINS, 'git'],
      commands: {
        git: {
          oneLiner: 'g',
          responses: [{ match: { args: ['log'] }, output: ['abc123 strip +x from deploy.sh', 'def456 unrelated change'] }],
        },
      },
    });
    const r = run(makeState({ config }), 'git log | grep deploy.sh');
    expect(r.output).toHaveLength(1);
    expect(r.output[0].text).toContain('deploy.sh');
    expect(r.output[0].kind).toBe('out');
  });

  it('a rejected pipe (scripted | non-grep) drops the scripted effect', () => {
    const config = makeConfig({
      supportedCommands: [...BUILTINS, 'chmod'],
      commands: {
        chmod: {
          oneLiner: 'c',
          responses: [{ match: { argIncludes: 'deploy.sh' }, output: ['fixed'], effect: { setFlags: { deployFixed: true } } }],
        },
      },
    });
    const r = run(makeState({ config }), 'chmod +x deploy.sh | ls');
    expect(r.effects).toEqual({}); // effect dropped — no state mutation
    expect(r.output.some((l) => l.kind === 'err')).toBe(true);
    expect(r.output.some((l) => l.text === 'fixed')).toBe(false); // out line stripped
  });
});

/**
 * Tests for the engine effect pipeline added for the Mission 90 expansion:
 * applyEffect (immutable, fixed order: procs → files → flags → cwd), append
 * semantics + clone-on-append, createMission flag seeding, and a scripted-verb
 * extension of the never-throws fuzz.
 *
 * Lives in its own file so engine.test.ts stays byte-for-byte unedited.
 */
import { describe, it, expect } from 'vitest';
import { createMission, applyEffect, runCommand, readFile } from './engine';
import type { MissionConfig, MissionState } from './types';

function testConfig(over: Partial<MissionConfig> = {}): MissionConfig {
  return {
    id: 'effects-test',
    title: 'Effects Test',
    week: 3,
    story: ['Something is off.'],
    promptHost: 'box',
    promptUser: 'student',
    unlockAfterDay: 0,
    filesystem: {
      '~': {
        deploy: { status: 'stale', 'deploy.sh': '#!/bin/sh' },
        logs: { 'cron.log': 'line1' },
        'notes.txt': 'hi',
      },
    },
    processes: [
      { pid: 1, user: 'root', cpu: 0.0, mem: 0.1, command: 'systemd' },
      { pid: 4521, user: 'root', cpu: 94.2, mem: 22.4, command: 'backup-script.sh', stat: 'R' },
      { pid: 2201, user: 'app', cpu: 0.0, mem: 1.5, command: 'node server.js', stat: 'crashed' },
    ],
    supportedCommands: ['pwd', 'ls', 'cd', 'cat', 'grep', 'ps', 'kill', 'help', 'hint', 'clear'],
    objectives: [{ id: 1, text: 'orient', trigger: { cmd: 'pwd', when: 'always' }, successLine: 'ok' }],
    hints: ['a hint'],
    optimalCommands: 5,
    ...over,
  };
}

describe('applyEffect — flags', () => {
  it('sets flags into a fresh object without mutating the input state', () => {
    const s = createMission(testConfig()); // flags {}
    const s2 = applyEffect(s, { setFlags: { deployFixed: true } });
    expect(s2.flags).toEqual({ deployFixed: true });
    expect(s.flags).toEqual({}); // untouched
    expect(s2).not.toBe(s);
  });

  it('merges over existing flags, leaving the original object untouched', () => {
    const s: MissionState = { ...createMission(testConfig()), flags: { a: '1' } };
    const s2 = applyEffect(s, { setFlags: { b: true } });
    expect(s2.flags).toEqual({ a: '1', b: true });
    expect(s.flags).toEqual({ a: '1' }); // not mutated
    expect(s2.flags).not.toBe(s.flags);
  });

  it('tolerates undefined state.flags defensively', () => {
    const s: MissionState = { ...createMission(testConfig()), flags: undefined };
    const s2 = applyEffect(s, { setFlags: { x: true } });
    expect(s2.flags).toEqual({ x: true });
  });
});

describe('applyEffect — files (append is evidence-preserving and clones)', () => {
  it('appends a newline-joined line and does NOT mutate the previous state fs', () => {
    const s = createMission(testConfig());
    const s2 = applyEffect(s, { appendFiles: { '~/logs/cron.log': 'line2' } });
    expect(readFile(s2.fs, '~/logs/cron.log')).toBe('line1\nline2');
    // the clone-on-append is what protects the prior state — this is the trap
    expect(readFile(s.fs, '~/logs/cron.log')).toBe('line1');
    expect(s2.fs).not.toBe(s.fs);
  });

  it('overwrites via writeFiles, THEN appends (fixed order) on the same path', () => {
    const s = createMission(testConfig());
    const s2 = applyEffect(s, {
      writeFiles: { '~/deploy/status': 'OK' },
      appendFiles: { '~/deploy/status': 'extra' },
    });
    expect(readFile(s2.fs, '~/deploy/status')).toBe('OK\nextra');
    expect(readFile(s.fs, '~/deploy/status')).toBe('stale'); // original untouched
  });

  it('appending to a fresh file (existing parent) creates it with a leading newline', () => {
    const s = createMission(testConfig());
    const s2 = applyEffect(s, { appendFiles: { '~/deploy/newlog': 'first' } });
    expect(readFile(s2.fs, '~/deploy/newlog')).toBe('\nfirst');
  });

  it('soft-fails (no throw) when the append parent directory is missing', () => {
    const s = createMission(testConfig());
    let s2!: MissionState;
    expect(() => {
      s2 = applyEffect(s, { appendFiles: { '~/nope/deep/x': 'y' } });
    }).not.toThrow();
    expect(readFile(s2.fs, '~/nope/deep/x')).toBeNull();
  });
});

describe('applyEffect — processes and cwd', () => {
  it('removes pids then adds procs, immutably', () => {
    const s = createMission(testConfig());
    const s2 = applyEffect(s, {
      removePids: [4521],
      addProcs: [{ pid: 2310, user: 'app', cpu: 2.1, mem: 3.2, command: 'node server.js' }],
    });
    expect(s2.processes.some((p) => p.pid === 4521)).toBe(false);
    expect(s2.processes.some((p) => p.pid === 2310)).toBe(true);
    expect(s.processes.some((p) => p.pid === 4521)).toBe(true); // untouched
    expect(s2.processes).not.toBe(s.processes);
  });

  it('sets cwd', () => {
    const s = createMission(testConfig());
    const s2 = applyEffect(s, { cwd: '~/deploy' });
    expect(s2.cwd).toBe('~/deploy');
    expect(s.cwd).toBe('~');
  });

  it('an empty effect changes nothing and clones nothing', () => {
    const s = createMission(testConfig());
    const s2 = applyEffect(s, {});
    expect(s2.fs).toBe(s.fs); // no file change → no clone
    expect(s2.processes).toBe(s.processes); // no proc change → same ref
    expect(s2.flags).toBe(s.flags);
    expect(s2.cwd).toBe(s.cwd);
  });
});

describe('createMission — flag seeding', () => {
  it('seeds flags from config.flags into a fresh object', () => {
    const config = testConfig({ flags: { started: true, mode: 'x' } });
    const s = createMission(config);
    expect(s.flags).toEqual({ started: true, mode: 'x' });
    expect(s.flags).not.toBe(config.flags); // fresh copy
  });

  it('defaults to an empty flags object when config has none', () => {
    const s = createMission(testConfig());
    expect(s.flags).toEqual({});
  });
});

describe('runCommand — never throws (scripted-verb fuzz)', () => {
  const scriptedConfig = testConfig({
    supportedCommands: [
      'pwd', 'ls', 'cd', 'cat', 'grep', 'ps', 'kill', 'help', 'hint', 'clear',
      'chmod', 'docker', 'dig', 'terraform', 'git', 'kubectl', 'crontab', 'aws',
    ],
    commands: {
      chmod: { oneLiner: 'chmod', responses: [{ match: { argIncludes: 'deploy.sh' }, output: ['ok'], effect: { setFlags: { fixed: true } } }], default: { output: ['chmod: usage'] } },
      docker: { oneLiner: 'docker', default: { output: ['docker: read-only'] } },
      dig: { oneLiner: 'dig', default: { output: ['dig: no answer'] } },
      terraform: { oneLiner: 'terraform', default: { output: ['terraform: plan only'] } },
      git: { oneLiner: 'git', responses: [{ match: { args: ['log'] }, output: ['abc deploy.sh'] }], default: { output: ['git: read-only'] } },
      kubectl: { oneLiner: 'kubectl', default: { output: ['kubectl: no cluster'] } },
      crontab: { oneLiner: 'crontab', responses: [{ match: { flags: ['-l'] }, output: ['*/5 * * * * deploy'] }], default: { output: ['crontab: usage'] } },
      aws: { oneLiner: 'aws', default: { output: ['aws: offline'] } },
    },
  });

  const GARBAGE: string[] = [
    'docker', 'chmod +x', 'chmod', 'chmod +x deploy.sh', 'dig @', 'dig @8.8.8.8 example.com',
    'terraform apply | ls', 'git log | grep deploy.sh', 'kubectl get pods', 'git',
    'crontab -l', 'aws s3 ls', 'docker ps | docker', 'chmod 🚀', 'terraform |',
    '| chmod', 'git | git | git', 'x'.repeat(500), 'chmod +x "', 'docker run --rm -it img',
    'chmod +x deploy.sh | terraform', '', '   ', 'kill 4521', 'crontab', 'aws',
  ];

  it(`survives ${GARBAGE.length} scripted-verb garbage inputs with a coherent state`, () => {
    expect(GARBAGE.length).toBeGreaterThanOrEqual(20);
    let s: MissionState = createMission(scriptedConfig);
    for (const input of GARBAGE) {
      let r!: ReturnType<typeof runCommand>;
      expect(() => {
        r = runCommand(s, input);
      }, `input: ${JSON.stringify(input)}`).not.toThrow();
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
    expect(s.processes.some((p) => p.pid === 1)).toBe(true); // pid 1 survives everything
  });
});

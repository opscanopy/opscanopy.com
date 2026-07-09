import { describe, it, expect } from 'vitest';
import { resolvePath, getNode, listDir, readFile, writeFile } from './filesystem';
import type { MissionFsNode } from './types';

function sampleFs(): MissionFsNode {
  return {
    '~': {
      app: {
        'server.js': 'console.log("hi");',
        status: 'CRASHED — waiting for CPU',
      },
      logs: {
        'server.log': 'line one\nline two',
      },
      'notes.txt': 'welcome aboard',
    },
  };
}

describe('resolvePath', () => {
  it('resolves a relative child from ~', () => {
    expect(resolvePath('~', 'logs')).toBe('~/logs');
  });

  it('resolves a nested relative path', () => {
    expect(resolvePath('~', 'logs/server.log')).toBe('~/logs/server.log');
  });

  it('resolves .. up one level', () => {
    expect(resolvePath('~/logs', '..')).toBe('~');
  });

  it('.. from root stays at root', () => {
    expect(resolvePath('~', '..')).toBe('~');
    expect(resolvePath('~', '../../..')).toBe('~');
  });

  it('resolves . as a no-op', () => {
    expect(resolvePath('~/logs', '.')).toBe('~/logs');
    expect(resolvePath('~', './logs/./server.log')).toBe('~/logs/server.log');
  });

  it('treats ~ as absolute home', () => {
    expect(resolvePath('~/logs', '~')).toBe('~');
    expect(resolvePath('~/logs', '~/app/status')).toBe('~/app/status');
  });

  it('treats /-rooted paths as ~-rooted', () => {
    expect(resolvePath('~/logs', '/')).toBe('~');
    expect(resolvePath('~/logs', '/app')).toBe('~/app');
  });

  it('tolerates a trailing slash', () => {
    expect(resolvePath('~', 'logs/')).toBe('~/logs');
    expect(resolvePath('~', 'logs//server.log')).toBe('~/logs/server.log');
  });

  it('empty arg resolves to cwd', () => {
    expect(resolvePath('~/logs', '')).toBe('~/logs');
  });

  it('mixed .. inside a path', () => {
    expect(resolvePath('~', 'logs/../app/status')).toBe('~/app/status');
  });
});

describe('getNode', () => {
  it('returns the root dir for ~', () => {
    const fs = sampleFs();
    const node = getNode(fs, '~');
    expect(node).not.toBeNull();
    expect(typeof node).toBe('object');
  });

  it('returns a file string', () => {
    expect(getNode(sampleFs(), '~/notes.txt')).toBe('welcome aboard');
  });

  it('returns a nested file', () => {
    expect(getNode(sampleFs(), '~/logs/server.log')).toBe('line one\nline two');
  });

  it('returns null for a missing path', () => {
    expect(getNode(sampleFs(), '~/nope')).toBeNull();
    expect(getNode(sampleFs(), '~/logs/nope.log')).toBeNull();
  });

  it('returns null when traversing through a file', () => {
    expect(getNode(sampleFs(), '~/notes.txt/deeper')).toBeNull();
  });
});

describe('listDir', () => {
  it('lists entries of a directory', () => {
    const names = listDir(sampleFs(), '~');
    expect(names).toEqual(['app', 'logs', 'notes.txt']);
  });

  it('returns null for a file', () => {
    expect(listDir(sampleFs(), '~/notes.txt')).toBeNull();
  });

  it('returns null for a missing path', () => {
    expect(listDir(sampleFs(), '~/ghost')).toBeNull();
  });
});

describe('readFile', () => {
  it('reads file contents', () => {
    expect(readFile(sampleFs(), '~/app/status')).toBe('CRASHED — waiting for CPU');
  });

  it('returns null for a directory', () => {
    expect(readFile(sampleFs(), '~/app')).toBeNull();
  });

  it('returns null for a missing file', () => {
    expect(readFile(sampleFs(), '~/app/missing')).toBeNull();
  });
});

describe('writeFile', () => {
  it('overwrites an existing file in place', () => {
    const fs = sampleFs();
    expect(writeFile(fs, '~/app/status', 'OK — serving traffic')).toBe(true);
    expect(readFile(fs, '~/app/status')).toBe('OK — serving traffic');
  });

  it('creates a new file in an existing directory', () => {
    const fs = sampleFs();
    expect(writeFile(fs, '~/logs/new.log', 'fresh')).toBe(true);
    expect(readFile(fs, '~/logs/new.log')).toBe('fresh');
  });

  it('fails softly when the parent directory is missing', () => {
    const fs = sampleFs();
    expect(writeFile(fs, '~/ghost/file.txt', 'x')).toBe(false);
  });

  it('fails softly when the target is a directory', () => {
    const fs = sampleFs();
    expect(writeFile(fs, '~/app', 'x')).toBe(false);
  });
});

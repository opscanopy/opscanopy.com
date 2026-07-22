import { describe, it, expect } from 'vitest';
import { classifyLine, parseTranscript, splitPrompt } from './terminal-play';

describe('classifyLine', () => {
  it('classifies a prompted shell command as cmd', () => {
    expect(classifyLine('student@prod-web-01:~$ ps aux --sort=-%cpu')).toBe('cmd');
  });
  it('classifies a bare-prompt line as cmd', () => {
    expect(classifyLine('root@host:/#')).toBe('out'); // ends with # → not our note (leading), no `$ `
    expect(classifyLine('$')).toBe('cmd');
  });
  it('classifies a leading-# commentary line as note', () => {
    expect(classifyLine('# 02:07 — the site is back.')).toBe('note');
    expect(classifyLine('   # indented note')).toBe('note');
  });
  it('classifies command output as out', () => {
    expect(classifyLine('USER   PID   %CPU  COMMAND')).toBe('out');
    expect(classifyLine('root   4521  94.0  /opt/scripts/nightly-backup.sh')).toBe('out');
    expect(classifyLine('HTTP/1.1 200 OK')).toBe('out');
  });
});

describe('parseTranscript', () => {
  const raw = [
    'student@prod-web-01:~$ ps aux --sort=-%cpu | head -3',
    'USER   PID   %CPU  COMMAND',
    'root   4521  94.0  /opt/scripts/nightly-backup.sh',
    'student@prod-web-01:~$ kill 4521',
    '# 02:07 — the site is back. You did that.',
  ].join('\n');

  it('splits into one classified line per input line', () => {
    const lines = parseTranscript(raw);
    expect(lines).toHaveLength(5);
    expect(lines.map((l) => l.kind)).toEqual(['cmd', 'out', 'out', 'cmd', 'note']);
    expect(lines[0].text).toBe('student@prod-web-01:~$ ps aux --sort=-%cpu | head -3');
  });

  it('normalizes CRLF to LF', () => {
    expect(parseTranscript('a\r\nb')).toHaveLength(2);
  });
});

describe('splitPrompt', () => {
  it('separates the prompt prefix from the typed command', () => {
    expect(splitPrompt('student@prod-web-01:~$ kill 4521')).toEqual({
      prompt: 'student@prod-web-01:~$ ',
      command: 'kill 4521',
    });
  });
  it('types the whole line when there is no prompt', () => {
    expect(splitPrompt('HTTP/1.1 200 OK')).toEqual({ prompt: '', command: 'HTTP/1.1 200 OK' });
  });
});

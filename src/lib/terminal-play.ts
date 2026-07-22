/**
 * terminal-play — pure helpers for the TerminalPlay transcript component.
 *
 * The component server-renders the full transcript (so it is the no-JS state,
 * the reduced-motion final frame, the print state, and Pagefind-indexed content)
 * and only *animates* it on the client. All parsing/classification lives here as
 * pure functions so it can be unit-tested without a DOM.
 */

export type LineKind = 'cmd' | 'out' | 'note';

export interface TranscriptLine {
  kind: LineKind;
  text: string;
}

/**
 * Classify a single transcript line:
 *  - `note` — a commentary line beginning with `#` (after optional indent).
 *  - `cmd`  — a shell command line: contains a `$ ` prompt separator, or ends
 *             at a bare `$` prompt.
 *  - `out`  — anything else (command output).
 */
export function classifyLine(line: string): LineKind {
  if (line.trimStart().startsWith('#')) return 'note';
  if (line.includes('$ ') || /\$\s*$/.test(line)) return 'cmd';
  return 'out';
}

/** Parse a raw multi-line transcript string into classified lines. */
export function parseTranscript(raw: string): TranscriptLine[] {
  return raw
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((text) => ({ kind: classifyLine(text), text }));
}

/**
 * For a `cmd` line that carries a `user@host:path$ ` prompt, split it into the
 * static prompt prefix (rendered immediately) and the command that types out.
 * Lines without a recognizable prompt type in full (prompt = '').
 */
export function splitPrompt(line: string): { prompt: string; command: string } {
  const idx = line.indexOf('$ ');
  if (idx === -1) return { prompt: '', command: line };
  return { prompt: line.slice(0, idx + 2), command: line.slice(idx + 2) };
}

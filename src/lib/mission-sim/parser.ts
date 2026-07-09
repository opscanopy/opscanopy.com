/**
 * mission-sim/parser — turn a raw terminal line into a ParsedCommand.
 *
 * Grammar (deliberately tiny):
 *   - tokens split on whitespace
 *   - simple double-quote grouping: "two words" is one arg (no escapes)
 *   - unquoted tokens starting with `-` become flags
 *   - at most ONE `|` splits the line into command + pipeTo
 *
 * Returns null on empty/whitespace-only input or a malformed pipe.
 * Never throws.
 */
import type { ParsedCommand } from './types';

/** Split a segment into whitespace tokens with double-quote grouping. */
function tokenize(segment: string): { token: string; quoted: boolean }[] {
  const out: { token: string; quoted: boolean }[] = [];
  let cur = '';
  let curQuoted = false;
  let inQuote = false;
  let started = false;

  const push = () => {
    if (started) out.push({ token: cur, quoted: curQuoted });
    cur = '';
    curQuoted = false;
    started = false;
  };

  for (const ch of segment) {
    if (ch === '"') {
      inQuote = !inQuote;
      started = true;        // "" is a legal (empty) token
      curQuoted = true;
      continue;
    }
    if (!inQuote && /\s/.test(ch)) {
      push();
      continue;
    }
    cur += ch;
    started = true;
  }
  push(); // unclosed quote: whatever accumulated becomes the final token
  return out;
}

/** Parse one pipe segment into cmd/args/flags, or null if it is empty. */
function parseSegment(segment: string): { cmd: string; args: string[]; flags: Set<string> } | null {
  const tokens = tokenize(segment);
  if (tokens.length === 0) return null;
  const [head, ...rest] = tokens;
  const cmd = head.token;
  if (cmd === '') return null;
  const args: string[] = [];
  const flags = new Set<string>();
  for (const t of rest) {
    if (!t.quoted && t.token.startsWith('-') && t.token !== '-') flags.add(t.token);
    else args.push(t.token);
  }
  return { cmd, args, flags };
}

/**
 * Parse a raw input line. Null on empty/whitespace-only input, on a pipe
 * with an empty side, or on more than one pipe.
 */
export function parseCommand(input: string): ParsedCommand | null {
  if (typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (trimmed === '') return null;

  // Split on `|` outside quotes; more than one pipe is unsupported.
  const segments: string[] = [];
  let cur = '';
  let inQuote = false;
  for (const ch of trimmed) {
    if (ch === '"') inQuote = !inQuote;
    if (ch === '|' && !inQuote) {
      segments.push(cur);
      cur = '';
      continue;
    }
    cur += ch;
  }
  segments.push(cur);
  if (segments.length > 2) return null;

  const left = parseSegment(segments[0]);
  if (!left) return null;

  if (segments.length === 2) {
    const right = parseSegment(segments[1]);
    if (!right) return null;
    return { ...left, pipeTo: right };
  }
  return left;
}

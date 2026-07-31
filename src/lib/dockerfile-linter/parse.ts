/**
 * Dockerfile parser — the half of this tool that has to be right before any rule
 * can be trusted.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │  WHAT THIS IS                                                            │
 * │                                                                          │
 * │  A hand-rolled reader for the Dockerfile format as BuildKit actually      │
 * │  reads it, built so that every finding can name a PHYSICAL line:          │
 * │                                                                          │
 * │    • parser directives (`# escape=` / `# syntax=`) — only at the very     │
 * │      top, and `escape` really does flip the continuation character.       │
 * │    • line continuations, with whole-line comments INSIDE them dropped     │
 * │      without ending the instruction (the trap that makes naive line-based │
 * │      linters split one RUN into two).                                     │
 * │    • heredocs (`<<EOF`, `<<-DONE`, `<<'EOF'`) — the body is consumed as   │
 * │      an opaque script, so a `FROM ubuntu` inside one creates no stage,    │
 * │      while shell rules can still scan it with correct line numbers.       │
 * │    • the JSON exec form, kept separate from shell form, including the     │
 * │      `['nginx']` near-miss that Docker silently runs through /bin/sh -c.  │
 * │    • stages (`FROM … AS name`) and the pre-FROM ARG symbol table that     │
 * │      `FROM node:${VERSION}` needs.                                       │
 * │                                                                          │
 * │  NEVER THROWS. Truncated input, unterminated heredocs, unbalanced quotes  │
 * │  and binary noise all produce a partial-but-consistent parse rather than  │
 * │  an exception: the caller is a linter, and a linter that crashes on a     │
 * │  half-typed file is worse than one that says nothing.                     │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
import type {
  Directives,
  Heredoc,
  Instruction,
  InstructionFlag,
  ParsedDockerfile,
  ShellSegment,
  ShellText,
  SourcePart,
  Stage,
} from './types';

/** Every instruction Docker accepts. Anything else is a fatal parse error for Docker. */
export const KNOWN_INSTRUCTIONS: readonly string[] = [
  'ADD',
  'ARG',
  'CMD',
  'COPY',
  'ENTRYPOINT',
  'ENV',
  'EXPOSE',
  'FROM',
  'HEALTHCHECK',
  'LABEL',
  'MAINTAINER',
  'ONBUILD',
  'RUN',
  'SHELL',
  'STOPSIGNAL',
  'USER',
  'VOLUME',
  'WORKDIR',
];

/** Instructions Docker defines `--flags` for; nothing else has its arguments stripped. */
const FLAG_BEARING = new Set(['ADD', 'COPY', 'FROM', 'RUN', 'HEALTHCHECK']);

/** Instructions that accept the JSON exec form. */
export const EXEC_FORM_KEYWORDS = new Set([
  'ADD',
  'CMD',
  'COPY',
  'ENTRYPOINT',
  'RUN',
  'SHELL',
  'VOLUME',
]);

/** Directive names BuildKit recognises. Anything else ends the directive block. */
const KNOWN_DIRECTIVES = new Set(['syntax', 'escape', 'check']);

/* ────────────────────────────────────────────────────────────────────────── *
 *  Small helpers.
 * ────────────────────────────────────────────────────────────────────────── */

function isBlank(line: string): boolean {
  return line.trim() === '';
}

function isComment(line: string): boolean {
  return /^\s*#/.test(line);
}

/** Splits on every newline flavour, so LF, CRLF and lone-CR files number identically. */
const NEWLINE_RE = /\r\n|\n|\r/;

/** Physical line count: a trailing newline does not add a line. */
export function countLines(text: string): number {
  if (text === '') return 0;
  const parts = text.split(NEWLINE_RE);
  return parts[parts.length - 1] === '' ? parts.length - 1 : parts.length;
}

/**
 * Replace every character inside single or double quotes with a space, keeping
 * the string LENGTH identical so character offsets still map to physical lines.
 * Used by the shell rules so `RUN echo "curl x | bash"` stays silent.
 */
export function maskQuoted(text: string): string {
  const out = text.split('');
  let quote = '';
  for (let i = 0; i < out.length; i += 1) {
    const ch = out[i];
    if (quote === '') {
      if (ch === "'" || ch === '"') {
        quote = ch;
        out[i] = ' ';
      } else if (ch === '\\' && i + 1 < out.length) {
        out[i] = ' ';
        out[i + 1] = ' ';
        i += 1;
      }
      continue;
    }
    if (ch === '\\' && quote === '"' && i + 1 < out.length) {
      out[i] = ' ';
      out[i + 1] = ' ';
      i += 1;
      continue;
    }
    if (ch === quote) {
      quote = '';
      out[i] = ' ';
      continue;
    }
    // Newlines must survive masking: they are command separators.
    if (ch !== '\n') out[i] = ' ';
  }
  return out.join('');
}

function sliceShell(shell: ShellText, from: number): ShellText {
  return { text: shell.text.slice(from), lineAt: shell.lineAt.slice(from) };
}

/** Damerau-ish distance, capped: enough to tell FORM from FROM. */
function editDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (Math.abs(m - n) > 2) return 3;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i += 1) {
    const cur = [i];
    for (let j = 1; j <= n; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    prev = cur;
  }
  return prev[n];
}

/** Closest known instruction within edit distance 2, or undefined. */
export function suggestInstruction(keyword: string): string | undefined {
  const upper = keyword.toUpperCase();
  let best: string | undefined;
  let bestScore = 3;
  for (const known of KNOWN_INSTRUCTIONS) {
    const d = editDistance(upper, known);
    if (d < bestScore) {
      bestScore = d;
      best = known;
    }
  }
  return bestScore <= 2 ? best : undefined;
}

/* ────────────────────────────────────────────────────────────────────────── *
 *  Quote-aware shell segmentation.
 *
 *  Adapted from the tokenizer in `src/lib/docker-run-to-compose/engine.ts`
 *  (single quotes literal, double quotes with \" and \\ escapes, backslash
 *  escapes outside quotes) — reduced to what a linter needs: WHERE the command
 *  separators are, and which physical line each command starts on.
 * ────────────────────────────────────────────────────────────────────────── */

export function segmentShell(shell: ShellText): ShellSegment[] {
  const { text, lineAt } = shell;
  const segments: ShellSegment[] = [];
  let start = 0;
  let sep: ShellSegment['sepBefore'] = '';
  let quote = '';
  let i = 0;

  const lineOf = (from: number, to: number): number => {
    for (let k = from; k < to; k += 1) {
      if (!/\s/.test(text[k])) return lineAt[k] ?? 1;
    }
    return lineAt[from] ?? lineAt[Math.max(0, from - 1)] ?? 1;
  };

  const push = (end: number, nextSep: ShellSegment['sepBefore'], nextStart: number): void => {
    segments.push({ text: text.slice(start, end), start, line: lineOf(start, end), sepBefore: sep });
    sep = nextSep;
    start = nextStart;
  };

  while (i < text.length) {
    const ch = text[i];

    if (quote !== '') {
      if (ch === '\\' && quote === '"') {
        i += 2;
        continue;
      }
      if (ch === quote) quote = '';
      i += 1;
      continue;
    }

    if (ch === '\\') {
      i += 2;
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      i += 1;
      continue;
    }
    if (ch === '&' && text[i + 1] === '&') {
      push(i, '&&', i + 2);
      i += 2;
      continue;
    }
    if (ch === '|' && text[i + 1] === '|') {
      push(i, '||', i + 2);
      i += 2;
      continue;
    }
    if (ch === '|') {
      push(i, '|', i + 1);
      i += 1;
      continue;
    }
    if (ch === ';') {
      push(i, ';', i + 1);
      i += 1;
      continue;
    }
    if (ch === '\n') {
      push(i, '\n', i + 1);
      i += 1;
      continue;
    }
    i += 1;
  }

  segments.push({
    text: text.slice(start),
    start,
    line: lineOf(start, text.length),
    sepBefore: sep,
  });
  return segments;
}

/* ────────────────────────────────────────────────────────────────────────── *
 *  Word splitting (quote-aware) with offsets — for ENV/ARG/COPY/ADD arguments.
 * ────────────────────────────────────────────────────────────────────────── */

export interface Word {
  text: string;
  /** Offset of the word's first character within the source text. */
  start: number;
}

export function splitWords(text: string): Word[] {
  const words: Word[] = [];
  let cur = '';
  let curStart = -1;
  let quote = '';
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quote !== '') {
      if (ch === '\\' && quote === '"' && i + 1 < text.length) {
        cur += text[i + 1];
        i += 1;
        continue;
      }
      if (ch === quote) {
        quote = '';
        continue;
      }
      cur += ch;
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      if (curStart === -1) curStart = i;
      continue;
    }
    if (/\s/.test(ch)) {
      if (curStart !== -1) {
        words.push({ text: cur, start: curStart });
        cur = '';
        curStart = -1;
      }
      continue;
    }
    if (ch === '\\' && i + 1 < text.length && /\s/.test(text[i + 1])) {
      // An escaped space keeps the word together.
      if (curStart === -1) curStart = i;
      cur += text[i + 1];
      i += 1;
      continue;
    }
    if (curStart === -1) curStart = i;
    cur += ch;
  }
  if (curStart !== -1) words.push({ text: cur, start: curStart });
  return words;
}

/* ────────────────────────────────────────────────────────────────────────── *
 *  ARG expansion for FROM references.
 * ────────────────────────────────────────────────────────────────────────── */

/**
 * Expand `$NAME`, `${NAME}` and `${NAME:-default}` against the pre-FROM ARG
 * table. Returns the expansion plus whether anything was left unresolved — an
 * unresolvable reference makes every tag rule fall silent, because the real tag
 * is decided at build time by `--build-arg`.
 */
export function expandArgs(
  ref: string,
  args: Map<string, string>,
): { value: string; unresolved: boolean } {
  let unresolved = false;
  const value = ref.replace(
    /\$\{([A-Za-z_][A-Za-z0-9_]*)(?::[-+]([^}]*))?\}|\$([A-Za-z_][A-Za-z0-9_]*)/g,
    (_m, braced: string | undefined, fallback: string | undefined, bare: string | undefined) => {
      const name = braced ?? bare ?? '';
      const known = args.get(name);
      if (known !== undefined && known !== '') return known;
      if (fallback !== undefined && fallback !== '') return fallback;
      unresolved = true;
      return '';
    },
  );
  return { value, unresolved };
}

/* ────────────────────────────────────────────────────────────────────────── *
 *  Parser directives.
 * ────────────────────────────────────────────────────────────────────────── */

function parseDirectives(lines: string[]): { directives: Directives; consumed: number } {
  const directives: Directives = { escape: '\\' };
  let i = 0;
  for (; i < lines.length; i += 1) {
    const m = /^#\s*([A-Za-z][A-Za-z0-9_-]*)\s*=\s*(.*)$/.exec(lines[i]);
    if (!m) break;
    const name = m[1].toLowerCase();
    if (!KNOWN_DIRECTIVES.has(name)) break;
    const value = m[2].trim();
    if (name === 'escape' && (value === '\\' || value === '`')) directives.escape = value;
    if (name === 'syntax') directives.syntax = value;
  }
  return { directives, consumed: i };
}

/**
 * Strip a trailing continuation character. An ODD number of trailing escape
 * characters continues the line; an even number is an escaped literal (so
 * `RUN echo a\\` does NOT fold into the next line).
 */
function stripContinuation(line: string, escape: string): { text: string; continues: boolean } {
  // Only trailing whitespace after the escape char is tolerated by BuildKit.
  const trimmedEnd = line.replace(/[ \t]+$/, '');
  let run = 0;
  while (run < trimmedEnd.length && trimmedEnd[trimmedEnd.length - 1 - run] === escape) run += 1;
  if (run % 2 === 0) return { text: line, continues: false };
  return { text: trimmedEnd.slice(0, trimmedEnd.length - 1), continues: true };
}

/* ────────────────────────────────────────────────────────────────────────── *
 *  Heredocs.
 * ────────────────────────────────────────────────────────────────────────── */

interface HeredocMarker {
  delimiter: string;
  stripTabs: boolean;
}

const HEREDOC_RE = /<<(-?)\s*(?:"([^"\n]*)"|'([^'\n]*)'|([A-Za-z_][A-Za-z0-9_]*))/g;

/**
 * Heredoc openers in `argText`. Matches are found on the RAW text (so the
 * `<<"EOF"` form keeps its delimiter) but rejected when the `<<` itself sits
 * inside quotes — `RUN echo "a << b"` opens nothing, and treating it as an
 * opener would swallow the rest of the file.
 */
function heredocMarkers(argText: string): HeredocMarker[] {
  const masked = maskQuoted(argText);
  const markers: HeredocMarker[] = [];
  HEREDOC_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = HEREDOC_RE.exec(argText)) !== null) {
    const delimiter = m[2] ?? m[3] ?? m[4] ?? '';
    if (delimiter === '') continue;
    if (masked[m.index] !== '<') continue; // the `<<` was inside quotes
    markers.push({ delimiter, stripTabs: m[1] === '-' });
    if (markers.length >= 4) break; // no real Dockerfile opens five heredocs on one line
  }
  return markers;
}

/** Consume one heredoc body starting at `from` (0-based line index). */
function readHeredoc(
  lines: string[],
  from: number,
  marker: HeredocMarker,
): { heredoc: Heredoc; next: number } {
  const bodyLines: { line: number; text: string }[] = [];
  let i = from;
  let terminated = false;
  for (; i < lines.length; i += 1) {
    const raw = lines[i];
    const candidate = marker.stripTabs ? raw.replace(/^\t+/, '') : raw;
    if (candidate.trim() === marker.delimiter) {
      terminated = true;
      i += 1;
      break;
    }
    // A whole-line shell COMMENT is space-filled, keeping its length so every
    // `lineAt` offset still maps to the right physical line. A comment can never
    // contain a command, but an apostrophe in one ("# don't ask why") would be
    // read by `maskQuoted` as an opening single quote and blank the ENTIRE rest
    // of the body — which silently switched off DF007/008/011/012/015 for the
    // whole heredoc and made the tool announce "nice Dockerfile" on a file with
    // `curl … | sh` in it.
    bodyLines.push({
      line: i + 1,
      text: /^\s*#/.test(candidate) ? ' '.repeat(candidate.length) : candidate,
    });
  }

  let text = '';
  const lineAt: number[] = [];
  bodyLines.forEach((entry, idx) => {
    if (idx > 0) {
      text += '\n';
      lineAt.push(bodyLines[idx - 1].line);
    }
    text += entry.text;
    for (let k = 0; k < entry.text.length; k += 1) lineAt.push(entry.line);
  });

  return {
    heredoc: {
      delimiter: marker.delimiter,
      stripTabs: marker.stripTabs,
      startLine: from + 1,
      body: { text, lineAt },
      terminated,
    },
    next: i,
  };
}

/* ────────────────────────────────────────────────────────────────────────── *
 *  Instruction assembly.
 * ────────────────────────────────────────────────────────────────────────── */

function parseFlags(
  keyword: string,
  shell: ShellText,
): { flags: InstructionFlag[]; rest: ShellText } {
  if (!FLAG_BEARING.has(keyword)) return { flags: [], rest: shell };
  const flags: InstructionFlag[] = [];
  let rest = shell;
  for (;;) {
    const m = /^[ \t]*--([A-Za-z][A-Za-z0-9-]*)(?:=(\S*))?[ \t]*/.exec(rest.text);
    if (!m) break;
    const dashOffset = Math.max(0, m[0].indexOf('--'));
    flags.push({
      name: m[1].toLowerCase(),
      value: m[2] ?? '',
      line: rest.lineAt[dashOffset] ?? rest.lineAt[0] ?? 1,
    });
    rest = sliceShell(rest, m[0].length);
    if (flags.length >= 24) break; // defensive: no instruction carries two dozen flags
  }
  return { flags, rest };
}

/**
 * Tell a POSIX `[ … ]` test apart from a botched JSON array.
 *
 * `RUN [ -f /etc/passwd ] && echo present` opens with `[` and does not parse as
 * JSON, but it is not an exec-form attempt at all: Docker runs exactly what the
 * author wrote. Reporting it as DF014 was an ERROR on valid input whose stated
 * fix (`RUN ["-f","/etc/passwd"]`) breaks the build. Three shapes that no JSON
 * array can have, and every `['nginx']`-style near-miss still falls through:
 *
 *   • a first word starting `-` or `!` (`[ -d /tmp ]`, `[ ! -f x ]`);
 *   • a bare comparison operator and no comma (`[ "$X" = "y" ]`);
 *   • a shell command separator right after the closing bracket (`] && …`,
 *     `] || exit 1`, `] | tee …`).
 *
 * An UNTERMINATED array (`CMD ["nginx"`) is deliberately still DF014: it has no
 * closing bracket to reason about and Docker really does demote it to shell form.
 */
function looksLikeShellTest(trimmed: string): boolean {
  const close = trimmed.endsWith(']') ? trimmed.length - 1 : trimmed.indexOf(']');
  if (close < 1) return false;
  const inner = trimmed.slice(1, close).trim();
  const after = trimmed.slice(close + 1).trim();

  const first = inner.split(/\s+/)[0] ?? '';
  if (first === '!' || /^-[A-Za-z]/.test(first)) return true;
  if (!inner.includes(',') && /(?:^|\s)(?:=|==|!=|-eq|-ne|-lt|-le|-gt|-ge)(?:\s|$)/.test(inner)) {
    return true;
  }
  return /^(?:&&|\|\||\|)/.test(after);
}

function execFormOf(
  keyword: string,
  argText: string,
): { execArgv?: string[]; brokenJson: boolean } {
  const trimmed = argText.trim();
  if (!EXEC_FORM_KEYWORDS.has(keyword) || !trimmed.startsWith('[')) {
    return { brokenJson: false };
  }
  if (looksLikeShellTest(trimmed)) return { brokenJson: false };
  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (Array.isArray(parsed) && parsed.every((v) => typeof v === 'string')) {
      return { execArgv: parsed as string[], brokenJson: false };
    }
    return { brokenJson: true };
  } catch {
    return { brokenJson: true };
  }
}

function makeInstruction(
  rawKeyword: string,
  argShell: ShellText,
  parts: SourcePart[],
  line: number,
  endLine: number,
  stageIndex: number,
  onbuild: boolean,
  heredocs: Heredoc[],
): Instruction {
  const keyword = rawKeyword.toUpperCase();
  const { flags, rest } = parseFlags(keyword, argShell);
  const { execArgv, brokenJson } = execFormOf(keyword, rest.text);
  return {
    keyword,
    rawKeyword,
    line,
    endLine,
    argText: rest.text,
    argShell: rest,
    parts,
    stageIndex,
    onbuild,
    flags,
    execArgv,
    brokenJson,
    heredocs,
  };
}

/* ────────────────────────────────────────────────────────────────────────── *
 *  Public API.
 * ────────────────────────────────────────────────────────────────────────── */

/** Parse a Dockerfile. Never throws — see the header. */
export function parseDockerfile(input: string): ParsedDockerfile {
  // A leading BOM is stripped so line 1 parses as a directive or instruction.
  const text = typeof input === 'string' ? input.replace(/^﻿/, '') : '';
  // Every newline flavour splits the same way here, so a Windows checkout of a
  // Dockerfile produces byte-identical findings on identical line numbers.
  const lines = text.split(NEWLINE_RE);
  const { directives, consumed } = parseDirectives(lines);
  const escape = directives.escape;

  const instructions: Instruction[] = [];
  const stages: Stage[] = [];
  const preFromArgs = new Map<string, string>();
  let unknown: ParsedDockerfile['unknown'];

  let i = consumed;
  while (i < lines.length) {
    if (isBlank(lines[i]) || isComment(lines[i])) {
      i += 1;
      continue;
    }

    /* ── fold the logical line ─────────────────────────────────────────── */
    const parts: SourcePart[] = [];
    let folded = '';
    const foldedLines: number[] = [];
    let j = i;
    for (;;) {
      const { text: partText, continues } = stripContinuation(lines[j], escape);
      parts.push({ line: j + 1, text: partText });
      folded += partText;
      for (let k = 0; k < partText.length; k += 1) foldedLines.push(j + 1);
      if (!continues) break;
      let k = j + 1;
      // Blank lines and whole-line comments inside a continuation contribute
      // nothing AND do not end the instruction.
      while (k < lines.length && (isBlank(lines[k]) || isComment(lines[k]))) k += 1;
      if (k >= lines.length) break;
      j = k;
    }

    const lastPartLine = parts[parts.length - 1].line;
    let cursor = lastPartLine; // 0-based index of the next unread line
    let endLine = lastPartLine;

    /* ── keyword + argument text ───────────────────────────────────────── */
    const head = /^[ \t]*(\S+)[ \t]*/.exec(folded);
    if (!head) {
      i = cursor;
      continue;
    }
    const rawKeyword = head[1];
    const keyword = rawKeyword.toUpperCase();
    const argShellFull: ShellText = {
      text: folded.slice(head[0].length),
      lineAt: foldedLines.slice(head[0].length),
    };

    if (!KNOWN_INSTRUCTIONS.includes(keyword) && unknown === undefined) {
      unknown = {
        keyword: rawKeyword,
        line: parts[0].line,
        suggestion: suggestInstruction(rawKeyword),
      };
    }

    /* ── heredoc bodies ────────────────────────────────────────────────── */
    const heredocs: Heredoc[] = [];
    for (const marker of heredocMarkers(argShellFull.text)) {
      const { heredoc, next } = readHeredoc(lines, cursor, marker);
      heredocs.push(heredoc);
      cursor = next;
      endLine = Math.max(endLine, next);
    }

    /* ── ONBUILD unwrapping ────────────────────────────────────────────── */
    let effKeyword = rawKeyword;
    let effShell = argShellFull;
    let onbuild = false;
    if (keyword === 'ONBUILD') {
      const innerHead = /^[ \t]*(\S+)[ \t]*/.exec(argShellFull.text);
      const innerKeyword = innerHead?.[1]?.toUpperCase() ?? '';
      // A nested `ONBUILD ONBUILD` is not unwrapped: Docker rejects it, and
      // recursing would let a crafted file nest arbitrarily deep.
      if (innerHead && innerKeyword !== 'ONBUILD') {
        effKeyword = innerHead[1];
        effShell = sliceShell(argShellFull, innerHead[0].length);
        onbuild = true;
        if (!KNOWN_INSTRUCTIONS.includes(innerKeyword) && unknown === undefined) {
          unknown = {
            keyword: innerHead[1],
            line: parts[0].line,
            suggestion: suggestInstruction(innerHead[1]),
          };
        }
      }
    }

    const stageIndex = stages.length - 1;
    const instruction = makeInstruction(
      effKeyword,
      effShell,
      parts,
      parts[0].line,
      endLine,
      effKeyword.toUpperCase() === 'FROM' ? stages.length : stageIndex,
      onbuild,
      heredocs,
    );

    /* ── stage bookkeeping ─────────────────────────────────────────────── */
    if (instruction.keyword === 'FROM') {
      const words = splitWords(instruction.argText);
      const image = words[0]?.text ?? '';
      const asIndex = words.findIndex((w) => w.text.toUpperCase() === 'AS');
      const rawName = asIndex > 0 ? words[asIndex + 1]?.text : undefined;
      const { value, unresolved } = expandArgs(image, preFromArgs);
      stages.push({
        index: stages.length,
        name: rawName ? rawName.toLowerCase() : undefined,
        rawName,
        image,
        resolvedImage: value,
        unresolved,
        line: instruction.line,
        instructions: [instruction],
      });
    } else {
      if (instruction.keyword === 'ARG' && stages.length === 0) {
        for (const word of splitWords(instruction.argText)) {
          const eq = word.text.indexOf('=');
          if (eq > 0) preFromArgs.set(word.text.slice(0, eq), word.text.slice(eq + 1));
          else if (word.text.length > 0 && !preFromArgs.has(word.text)) {
            preFromArgs.set(word.text, '');
          }
        }
      }
      if (stages.length > 0) stages[stages.length - 1].instructions.push(instruction);
    }

    instructions.push(instruction);
    i = Math.max(cursor, lastPartLine);
  }

  return {
    directives,
    instructions,
    stages,
    preFromArgs,
    lines: countLines(text),
    unknown,
  };
}

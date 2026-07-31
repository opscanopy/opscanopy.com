/**
 * The unit-file parser — INI, plus every systemd quirk that changes the answer.
 *
 * Modelled on systemd's own `config_parse()` (src/shared/conf-parser.c), because
 * the differences from a generic INI parser are exactly where the bugs people
 * come here to find live:
 *
 *   • A line whose first non-blank character is `#` or `;` is a comment. There
 *     are NO end-of-line comments: everything after the first `=` is the value,
 *     `# nightly` included. (Reported by a rule, not by the parser.)
 *   • A trailing `\` continues onto the next line, and systemd replaces the
 *     backslash with a space. A full-line comment INSIDE such a continuation is
 *     dropped rather than folded into the value — recorded, because it has not
 *     always behaved that way and every reader has to work it out.
 *   • A section header must be the WHOLE line and must end in `]`. Anything else
 *     — `[Unit`, `[Service] # notes` — is an invalid section header and systemd
 *     refuses to load the file. That is the parser's only fatal.
 *   • A line with no `=` is logged and skipped ("Missing '=', ignoring line.").
 *   • An assignment before the first section header is logged and skipped
 *     ("Assignment outside of section. Ignoring.").
 *   • Repeated section headers MERGE — the second `[Service]` keeps assigning
 *     into the same section — so both headers are recorded and the assignments
 *     stay in file order.
 *
 * `parseUnit` NEVER THROWS.
 */
import type { Assignment, CommentInContinuation, ParsedUnit, Section, SourcePart } from './types';

/** Physical line count: a single trailing newline does not add a line. */
export function countLines(text: string): number {
  if (text === '') return 0;
  const normalised = text.replace(/\r\n?/g, '\n');
  return normalised.replace(/\n$/, '').split('\n').length;
}

/** True when this line is a comment — leading whitespace allowed. */
function isCommentLine(line: string): boolean {
  const trimmed = line.replace(/^[ \t]+/, '');
  return trimmed.startsWith('#') || trimmed.startsWith(';');
}

/**
 * Does this line continue onto the next one? A trailing `\` continues — unless
 * it is itself escaped (`\\` at the end is a literal backslash).
 */
function continuesOnNextLine(line: string): boolean {
  if (!line.endsWith('\\')) return false;
  let backslashes = 0;
  for (let i = line.length - 1; i >= 0 && line[i] === '\\'; i -= 1) backslashes += 1;
  return backslashes % 2 === 1;
}

/** Drop the trailing continuation backslash. */
function stripContinuation(line: string): string {
  return line.replace(/\\$/, '');
}

/** Parse a unit file. Never throws; a fatal is reported in `fatal`. */
export function parseUnit(text: string): ParsedUnit {
  const empty: ParsedUnit = {
    sections: [],
    assignments: [],
    strayLines: [],
    commentsInContinuations: [],
    lines: 0,
  };
  if (typeof text !== 'string' || text === '') return empty;

  // A UTF-8 BOM is invisible in an editor but would make the first section
  // header start with a stray character; systemd skips it, so we do too.
  const source = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const physical = source.replace(/\n$/, '').split('\n');

  const sections: Section[] = [];
  const assignments: Assignment[] = [];
  const strayLines: ParsedUnit['strayLines'] = [];
  const commentsInContinuations: CommentInContinuation[] = [];

  let current: Section | null = null;
  let fatal: ParsedUnit['fatal'] | undefined;

  for (let index = 0; index < physical.length; index += 1) {
    const rawLine = physical[index];
    const lineNumber = index + 1;
    const trimmed = rawLine.trim();

    if (trimmed === '') continue;
    if (isCommentLine(rawLine)) continue;

    /* ── Section header ──────────────────────────────────────────────── */
    if (trimmed.startsWith('[')) {
      if (!trimmed.endsWith(']')) {
        // systemd: "Invalid section header '…'" and it refuses the file.
        fatal = {
          line: lineNumber,
          message:
            `“${trimmed}” on line ${lineNumber} looks like a section header but has no closing “]” — ` +
            'systemd refuses to load a unit file with an invalid section header.',
        };
        break;
      }
      const name = trimmed.slice(1, -1);
      if (name.trim() === '') {
        fatal = {
          line: lineNumber,
          message: `The section header on line ${lineNumber} has no name — “[]” is not a section.`,
        };
        break;
      }
      current = { name, line: lineNumber, index: sections.length, assignments: [] };
      sections.push(current);
      continue;
    }

    /* ── Fold a continuation into one logical line ───────────────────── */
    const parts: SourcePart[] = [];
    /** Comment lines swallowed by THIS fold, keyed once the directive is known. */
    const foldComments: number[] = [];
    let logical = '';
    let cursor = index;
    let anchored = false;

    for (;;) {
      const physicalLine = physical[cursor];

      // A comment line inside the continuation is dropped, exactly as systemd
      // does, and does not end the continuation.
      if (anchored && isCommentLine(physicalLine)) {
        foldComments.push(cursor + 1);
        if (cursor + 1 >= physical.length) break;
        cursor += 1;
        continue;
      }

      const continues = continuesOnNextLine(physicalLine);
      const body = continues ? stripContinuation(physicalLine) : physicalLine;
      parts.push({ line: cursor + 1, text: body });
      // systemd replaces the backslash with a space, so the pieces are joined by
      // whitespace rather than concatenated. Collapsed to ONE space at the seam:
      // systemd would leave `tool  --first` with two (the trailing space plus the
      // replaced backslash), and it makes no difference to any consumer — Exec
      // lines are split on whitespace runs — but it does make the value we echo
      // back into a finding read like the line the author wrote.
      logical = anchored ? `${logical.replace(/\s+$/, '')} ${body.trim()}` : body;
      anchored = true;

      if (!continues || cursor + 1 >= physical.length) break;
      cursor += 1;
    }

    const endLine = parts.length > 0 ? parts[parts.length - 1].line : lineNumber;
    index = cursor;

    const logicalTrimmed = logical.trim();

    /* ── Assignment or stray line ────────────────────────────────────── */
    const eq = logicalTrimmed.indexOf('=');
    const key = eq === -1 ? '' : logicalTrimmed.slice(0, eq).trim();

    if (eq === -1 || key === '') {
      // No `=` at all, or `=value` with no name to assign to: systemd logs
      // "Missing '=', ignoring line." and moves on.
      strayLines.push({ line: lineNumber, text: logicalTrimmed });
      for (const line of foldComments) commentsInContinuations.push({ line, key: logicalTrimmed });
      continue;
    }

    const value = logicalTrimmed.slice(eq + 1).trim();
    for (const line of foldComments) commentsInContinuations.push({ line, key });

    const assignment: Assignment = {
      key,
      value,
      line: lineNumber,
      endLine,
      section: current ? current.name : null,
      sectionIndex: current ? current.index : -1,
      raw: logicalTrimmed,
      parts,
    };
    assignments.push(assignment);
    if (current) current.assignments.push(assignment);
  }

  return {
    sections,
    assignments,
    strayLines,
    commentsInContinuations,
    lines: countLines(source),
    ...(fatal ? { fatal } : {}),
  };
}

/**
 * Split a value on top-level whitespace, honouring single and double quotes the
 * way systemd's own `extract_first_word` does. Used by the Exec rules, so a `;`
 * inside `'daemon on; master_process on;'` is not mistaken for a shell separator.
 */
export function splitQuoted(value: string): string[] {
  const out: string[] = [];
  let token = '';
  let quote: '"' | "'" | null = null;
  let escaped = false;

  for (const ch of value) {
    if (escaped) {
      token += ch;
      escaped = false;
      continue;
    }
    if (ch === '\\') {
      escaped = true;
      token += ch;
      continue;
    }
    if (quote) {
      if (ch === quote) quote = null;
      else token += ch;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === ' ' || ch === '\t') {
      if (token !== '') {
        out.push(token);
        token = '';
      }
      continue;
    }
    token += ch;
  }
  if (token !== '') out.push(token);
  return out;
}

/**
 * Blank out every quoted run in `value`, keeping the string's length and its
 * unquoted characters. Scanning the mask lets a rule look for `#`, `;` or `|`
 * outside quotes while still reporting a position that lines up with the
 * original text.
 */
export function maskQuoted(value: string): string {
  let out = '';
  let quote: '"' | "'" | null = null;
  let escaped = false;

  for (const ch of value) {
    if (escaped) {
      out += ' ';
      escaped = false;
      continue;
    }
    if (ch === '\\') {
      escaped = true;
      out += ' ';
      continue;
    }
    if (quote) {
      if (ch === quote) quote = null;
      out += ' ';
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      out += ' ';
      continue;
    }
    out += ch;
  }
  return out;
}

/**
 * The `Exec*` prefix characters, per systemd.service(5): `@` (pass argv[0]),
 * `-` (ignore failure), `:` (no environment expansion), `+` (full privileges),
 * `!` and `!!` (privileged, differing in ambient-capability handling). They may
 * be combined, in any order, before the executable path.
 */
export function stripExecPrefixes(value: string): { prefixes: string; command: string } {
  let i = 0;
  while (i < value.length) {
    const ch = value[i];
    if (ch === '@' || ch === '-' || ch === ':' || ch === '+' || ch === '!') {
      i += 1;
      continue;
    }
    break;
  }
  return { prefixes: value.slice(0, i), command: value.slice(i).trimStart() };
}

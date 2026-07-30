/**
 * jq Playground — the engine. A thin, honest wrapper around REAL jq 1.8.2
 * compiled to WebAssembly (`jq-wasm@3.0.0-jq-1.8.2`).
 *
 * The wrapper's whole job is to turn jq's Unix-shaped result — stdout, stderr,
 * an exit code — into something a browser UI can render without ever guessing:
 *
 *   1. CLASSIFY the failure. `jq.raw()` does not throw on user errors; it
 *      returns exit codes, and jq overloads code 5 for BOTH "your program blew
 *      up at runtime" and "your input is not JSON". Those need different
 *      wording and point at different editors, so they are disambiguated by the
 *      first stderr line (`jq: parse error:` ⇒ the input).
 *   2. SPLIT the stream. jq emits a stream of values, not one value, and the
 *      UI shows one card per output. For JSON output that split is provable
 *      from the text; for `-r` it is not (a raw string can contain newlines),
 *      so the engine runs a second JSON-mode pass and derives the rows from
 *      jq's own values instead of guessing at newlines.
 *   3. BOUND everything. jq is synchronous: a filter that never terminates
 *      freezes the tab, and a 500 000-row output freezes the DOM. Input, program
 *      length, row count, total output characters and stderr notices all have
 *      hard caps, and every cap reports the real number it capped.
 *
 * Nothing in here approximates. Where an exact answer is not available the
 * result carries a flag saying so (`outputsExact`, `truncated`,
 * `noticesTruncated`) — a rounded number presented as exact is the one mistake
 * a ground-truth tool cannot make.
 *
 * `runJq` never throws. Not on garbage, not on 2 MB of binary, not when the
 * WASM module fails to instantiate.
 */
import type {
  JqErr,
  JqErrorKind,
  JqErrorScope,
  JqFlags,
  JqLoadInit,
  JqOk,
  JqRunOptions,
  JqRunResult,
} from './types';

/* ────────────────────────────────────────────────────────────────────────── *
 *  Caps. Every one of these exists because the alternative is a frozen tab.
 * ────────────────────────────────────────────────────────────────────────── */

/** Input ceiling, in UTF-8 bytes — jq's stdin is bytes, not JS characters. */
export const MAX_INPUT_BYTES = 2_000_000;
/** Program ceiling, in characters. */
export const MAX_PROGRAM_CHARS = 20_000;
/** Most output rows rendered. The real count is always reported. */
export const MAX_OUTPUT_ROWS = 200;
/** Most output characters collected across all rows. */
export const MAX_OUTPUT_CHARS = 400_000;
/** Most stderr lines kept as notices. */
export const MAX_NOTICES = 20;
/**
 * Above this much stdout the `-r` reconstruction skips its cross-check (it
 * would mean joining a second multi-megabyte copy). The rows still come from
 * jq's own JSON-mode values, so they stay exact — only the belt-and-braces
 * verification is skipped.
 */
const MAX_VERIFY_CHARS = 4_000_000;

/* ────────────────────────────────────────────────────────────────────────── *
 *  The jq handle
 * ────────────────────────────────────────────────────────────────────────── */

/**
 * The loaded handle's shape, mirrored structurally rather than imported as a
 * type, so this module has no build-time dependency on jq-wasm's typings.
 * VERIFIED by probing the real package: these methods are SYNCHRONOUS and
 * `version` is a string PROPERTY — only jq-wasm's top-level convenience
 * wrappers (`raw`/`json`/`first`/`version`) are async.
 */
interface JqHandle {
  raw(input: string, query: string, flags?: string[]): { stdout: string; stderr: string; exitCode: number };
  readonly version: string;
}

let handlePromise: Promise<JqHandle> | null = null;
let defaultInit: JqLoadInit = {};

/**
 * Set the load options used by a later `getJq()` with no argument — the
 * playground calls this with Vite's hashed `jq-wasm/jq.wasm?url` asset before
 * anything else touches the engine. A no-op once the module has loaded.
 */
export function configureJq(init: JqLoadInit): void {
  if (handlePromise) return;
  defaultInit = init ?? {};
}

/**
 * Load jq once and memoize it. On failure the memo is CLEARED, so the
 * playground's Retry button can genuinely retry instead of re-awaiting the same
 * rejected promise forever.
 *
 * In Node (vitest) call it bare: jq-wasm then reads the `.wasm` out of
 * `node_modules` with no shims at all.
 */
export function getJq(init?: JqLoadInit): Promise<JqHandle> {
  if (handlePromise) return handlePromise;
  const options = init ?? defaultInit;
  handlePromise = (async () => {
    const mod = (await import('jq-wasm')) as unknown as {
      loadJq: (opts?: { wasmURL?: string | URL }) => Promise<JqHandle>;
    };
    return options.wasmURL ? mod.loadJq({ wasmURL: options.wasmURL }) : mod.loadJq();
  })().catch((err: unknown) => {
    handlePromise = null;
    throw err;
  });
  return handlePromise;
}

/**
 * Drop the memoized module so the next `getJq()` builds a fresh one.
 *
 * Called after an Emscripten `abort()` — a filter that never terminates
 * exhausts jq's WebAssembly heap and aborts (verified: `[repeat(1)]` throws a
 * `WebAssembly.RuntimeError` after ~0.8 s, `[recurse(.next?)]` after ~3 s).
 * Empirically the module keeps working afterwards, but "empirically" is not a
 * guarantee about a heap that just ran out, so the next run starts clean. The
 * `.wasm` itself comes from the HTTP cache, so re-instantiation is cheap.
 */
export function resetJq(): void {
  handlePromise = null;
}

/** jq's own version string, read from the binary. Never a literal. */
export async function getJqVersion(): Promise<string> {
  return (await getJq()).version;
}

/* ────────────────────────────────────────────────────────────────────────── *
 *  Flags
 * ────────────────────────────────────────────────────────────────────────── */

/**
 * Assemble jq's argv from the option object, in a stable order so a snapshot,
 * a deep link and the flags row all agree.
 *
 * `--indent` is deliberately NOT emitted alongside `-c`: verified against jq
 * 1.8.2, a later `--indent` re-enables pretty printing, which would make the
 * compact toggle silently do nothing.
 */
export function buildFlags(options: JqRunOptions = {}): string[] {
  const flags: string[] = [];
  if (options.rawOutput) flags.push('-r');
  if (options.slurp) flags.push('-s');
  if (options.nullInput) flags.push('-n');
  if (options.compact) {
    flags.push('-c');
    return flags;
  }
  const width = options.tabWidth;
  if (typeof width === 'number' && Number.isInteger(width)) {
    if (width === 0) flags.push('--tab');
    else if (width > 0 && width !== 2) flags.push('--indent', String(Math.min(width, 7)));
  }
  return flags;
}

/* ────────────────────────────────────────────────────────────────────────── *
 *  Output splitting
 * ────────────────────────────────────────────────────────────────────────── */

interface Span {
  start: number;
  end: number;
}

const WHITESPACE = new Set([' ', '\t', '\n', '\r']);
/** Permissive scalar shape — jq prints large numbers as `1E+1000`. */
const SCALAR_RE = /^(?:true|false|null|[-+0-9.eE]+)$/;

/**
 * Locate every top-level JSON value in jq's stdout, as offsets (no slicing, so
 * scanning a huge output costs no extra memory). Returns `null` when the text
 * cannot be proven to be a sequence of complete JSON values — the caller then
 * presents the text as one block and says so rather than inventing rows.
 */
function scanSpans(text: string): Span[] | null {
  const spans: Span[] = [];
  const len = text.length;
  let i = 0;
  while (i < len) {
    while (i < len && WHITESPACE.has(text[i])) i += 1;
    if (i >= len) break;
    const start = i;
    const first = text[i];

    if (first === '{' || first === '[') {
      let depth = 0;
      let inString = false;
      let escaped = false;
      let closed = false;
      for (; i < len; i += 1) {
        const ch = text[i];
        if (inString) {
          if (escaped) escaped = false;
          else if (ch === '\\') escaped = true;
          else if (ch === '"') inString = false;
          else if (ch === '\n') return null;
          continue;
        }
        if (ch === '"') {
          inString = true;
          continue;
        }
        if (ch === '{' || ch === '[') depth += 1;
        else if (ch === '}' || ch === ']') {
          depth -= 1;
          if (depth === 0) {
            i += 1;
            closed = true;
            break;
          }
          if (depth < 0) return null;
        }
      }
      if (!closed || inString) return null;
    } else if (first === '"') {
      i += 1;
      let escaped = false;
      let closed = false;
      for (; i < len; i += 1) {
        const ch = text[i];
        if (escaped) {
          escaped = false;
          continue;
        }
        if (ch === '\\') {
          escaped = true;
          continue;
        }
        if (ch === '"') {
          i += 1;
          closed = true;
          break;
        }
        // A raw newline inside a JSON string is impossible in jq's output;
        // seeing one means this is not JSON-mode text.
        if (ch === '\n') return null;
      }
      if (!closed) return null;
    } else if (first === '}' || first === ']' || first === ',' || first === ':') {
      return null;
    } else {
      while (i < len && !WHITESPACE.has(text[i])) i += 1;
      if (!SCALAR_RE.test(text.slice(start, i))) return null;
    }
    spans.push({ start, end: i });
  }
  return spans;
}

/**
 * Split jq's JSON-mode stdout into one string per output, or `null` when the
 * split cannot be proven. Exported because it is the load-bearing piece of the
 * "one card per output" UI and is worth pinning directly.
 */
export function splitJsonOutputs(stdout: string): string[] | null {
  const spans = scanSpans(stdout);
  if (!spans) return null;
  return spans.map((span) => stdout.slice(span.start, span.end));
}

interface Rows {
  rows: string[];
  exact: boolean;
  total: number;
  truncated: boolean;
}

/** Apply the row and character caps, reporting the true total either way. */
function capRows(all: string[]): Rows {
  const rows: string[] = [];
  let chars = 0;
  for (const row of all) {
    if (rows.length >= MAX_OUTPUT_ROWS) break;
    if (rows.length > 0 && chars + row.length > MAX_OUTPUT_CHARS) break;
    rows.push(row);
    chars += row.length;
  }
  return { rows, exact: true, total: all.length, truncated: rows.length < all.length };
}

/**
 * Turn one jq run's stdout into display rows.
 *
 * JSON mode: scan the text, done. `-r` mode: the text is ambiguous by
 * construction (a raw string output may contain newlines), so run the identical
 * program again WITHOUT `-r` and derive each row from jq's own JSON value —
 * a string chunk unwraps to its contents, anything else prints as it stands.
 * That is also how leading whitespace survives: jq-wasm `.trim()`s stdout, so
 * `stdout` itself has already lost it.
 */
function collectRows(
  jq: JqHandle,
  input: string,
  program: string,
  flags: string[],
  stdout: string,
  rawOutput: boolean,
): Rows {
  if (stdout.length === 0 && !rawOutput) {
    return { rows: [], exact: true, total: 0, truncated: false };
  }

  if (!rawOutput) {
    const chunks = splitJsonOutputs(stdout);
    if (!chunks) return { rows: [stdout], exact: false, total: 1, truncated: false };
    return capRows(chunks);
  }

  // `-r`: reconstruct from a JSON-mode pass.
  let jsonStdout = '';
  try {
    jsonStdout = jq.raw(input, program, flags.filter((flag) => flag !== '-r')).stdout;
  } catch {
    // The primary run succeeded, so this can realistically only be an abort on
    // a re-run of identical work. Start the next run from a clean module.
    resetJq();
    return rawFallback(stdout, -1);
  }
  const chunks = splitJsonOutputs(jsonStdout);
  if (!chunks) return rawFallback(stdout, -1);

  const rebuilt: string[] = [];
  for (const chunk of chunks) {
    if (chunk.charCodeAt(0) === 34 /* " */) {
      try {
        rebuilt.push(JSON.parse(chunk) as string);
      } catch {
        return rawFallback(stdout, chunks.length);
      }
    } else {
      rebuilt.push(chunk);
    }
  }

  const capped = capRows(rebuilt);
  // Cross-check, when it is affordable and nothing was dropped: jq-wasm trims
  // stdout, so the comparison trims too.
  if (!capped.truncated && stdout.length <= MAX_VERIFY_CHARS) {
    if (rebuilt.join('\n').trim() !== stdout) return rawFallback(stdout, rebuilt.length);
  }
  return capped;
}

/** `-r` rows could not be proven: present one block and say the real count. */
function rawFallback(stdout: string, total: number): Rows {
  return {
    rows: [stdout],
    exact: false,
    total: total >= 0 ? total : 1,
    truncated: false,
  };
}

/* ────────────────────────────────────────────────────────────────────────── *
 *  stderr parsing
 * ────────────────────────────────────────────────────────────────────────── */

const COMPILE_PREFIX = 'jq: error: ';
const PARSE_PREFIX = 'jq: parse error: ';
const RUNTIME_PREFIX_RE = /^jq: error \(at [^)]*\)\s*/;
const COMPILE_SUMMARY_RE = /^jq: \d+ compile error/;
/** ` at <top-level>, line 1, column 5:` — compile positions. */
const PROGRAM_POS_RE = /\s+at\s+<[^>]*>,\s*line\s+(\d+)(?:,\s*column\s+(\d+))?:?\s*$/;
/** ` at line 1, column 5` — input parse positions. */
const INPUT_POS_RE = /\s+at\s+line\s+(\d+)(?:,\s*column\s+(\d+))?\s*$/;

interface Positioned {
  message: string;
  line?: number;
  column?: number;
}

function splitPosition(raw: string, pattern: RegExp): Positioned {
  const match = pattern.exec(raw);
  if (!match) return { message: raw.replace(/:\s*$/, '') };
  const message = raw.slice(0, match.index).trimEnd().replace(/:\s*$/, '');
  const line = Number(match[1]);
  const column = match[2] === undefined ? undefined : Number(match[2]);
  return {
    message: message.length > 0 ? message : raw,
    line: Number.isFinite(line) ? line : undefined,
    column: Number.isFinite(column as number) ? column : undefined,
  };
}

/** Strip whichever `jq: …` scaffolding a stderr line carries. */
function cleanLine(line: string): string {
  if (line.startsWith(PARSE_PREFIX)) return line.slice(PARSE_PREFIX.length);
  if (line.startsWith(COMPILE_PREFIX)) return line.slice(COMPILE_PREFIX.length);
  const runtime = RUNTIME_PREFIX_RE.exec(line);
  if (runtime) {
    let rest = line.slice(runtime[0].length).replace(/^:\s*/, '');
    // `(not a string): {"code":1}` reads better unparenthesized, and it is
    // still jq's own wording.
    rest = rest.replace(/^\(([^)]*)\):\s*/, '$1: ');
    return rest;
  }
  return line;
}

function capNotices(lines: string[]): {
  notices: string[];
  noticesTruncated: boolean;
  totalNotices: number;
} {
  return {
    notices: lines.slice(0, MAX_NOTICES),
    noticesTruncated: lines.length > MAX_NOTICES,
    totalNotices: lines.length,
  };
}

/* ────────────────────────────────────────────────────────────────────────── *
 *  Guards
 * ────────────────────────────────────────────────────────────────────────── */

/** `1234567` → `1,234,567`, without depending on the runtime's ICU data. */
function group(n: number): string {
  const digits = String(Math.trunc(Math.abs(n)));
  let out = '';
  for (let i = 0; i < digits.length; i += 1) {
    if (i > 0 && (digits.length - i) % 3 === 0) out += ',';
    out += digits[i];
  }
  return (n < 0 ? '-' : '') + out;
}

/** Exact UTF-8 length, with a cheap upper-bound fast path for small inputs. */
function utf8Length(text: string): number {
  // Every UTF-16 code unit costs at most 3 UTF-8 bytes (a surrogate PAIR costs
  // 4 bytes for 2 units, i.e. 2 per unit), so this bound is safe.
  if (text.length * 3 <= MAX_INPUT_BYTES) return text.length;
  return new TextEncoder().encode(text).length;
}

const EMPTY_PROGRAM_MESSAGE =
  'Enter a jq program — "." is the identity filter and a fine start.';

export const UNBOUNDED_HINT =
  'This program can generate an unbounded stream (repeat/range(infinite)). jq runs ' +
  'synchronously in this tab, so a filter that never ends will freeze the page until you ' +
  'reload — wrap it in limit(n; …) or first(…).';

export const RECURSE_HINT =
  'recurse(.field) keeps recursing after it reaches the end: .field on the last node is null, ' +
  'and null.field is null again, forever — adding ? does not stop it. jq will exhaust its memory ' +
  'and abort. Write recurse(.field?; . != null) instead.';

/**
 * `recurse(f)` where `f` is a bare field path — the shape that walks off the end
 * of a linked structure onto `null` and then recurses on `null` for ever. An
 * array step (`recurse(.children[]?)`) or a conditional body cannot do that, so
 * they are deliberately not matched.
 */
const RECURSE_PATH_RE = /\brecurse\s*\(\s*\.[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*\??\s*\)/;

/**
 * Advisory, never a refusal: name the shapes that are unbounded unless something
 * stops them. Deliberately narrow — plain `recurse`, `..` and `while` terminate
 * on ordinary data, and crying wolf on them would train people to ignore this.
 */
export function unboundedRiskHint(program: string): string | null {
  if (typeof program !== 'string') return null;
  const guarded = /\blimit\s*\(/.test(program) || /\bfirst\s*\(/.test(program);
  if (RECURSE_PATH_RE.test(program) && !guarded) return RECURSE_HINT;
  const risky = /\brepeat\s*\(/.test(program) || /\brange\s*\(\s*infinite\b/.test(program);
  if (!risky || guarded) return null;
  return UNBOUNDED_HINT;
}

/* ────────────────────────────────────────────────────────────────────────── *
 *  runJq
 * ────────────────────────────────────────────────────────────────────────── */

function nowMs(): number {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
}

interface ErrParts {
  kind: JqErrorKind;
  message: string;
  line?: number;
  column?: number;
  scope: JqErrorScope;
  excerpt?: string;
}

function makeError(
  parts: ErrParts,
  base: {
    elapsedMs: number;
    flags: string[];
    version: string;
    exitCode: number;
    stderr: string;
    notices: string[];
    noticesTruncated: boolean;
    totalNotices: number;
  },
  partial: Rows,
): JqErr {
  return {
    ok: false,
    errorKind: parts.kind,
    error: parts.message,
    errorLine: parts.line,
    errorColumn: parts.column,
    errorScope: parts.scope,
    excerpt: parts.excerpt,
    partialOutputs: partial.rows,
    partialTruncated: partial.truncated,
    totalPartialOutputs: partial.total,
    ...base,
  };
}

const NO_ROWS: Rows = { rows: [], exact: true, total: 0, truncated: false };

/**
 * Run a jq program against a JSON input. Resolves — never rejects, never
 * throws.
 *
 * Note that the caps are checked AFTER the module loads, so every result
 * carries jq's real version string even when jq itself was never invoked.
 */
export async function runJq(
  program: string,
  input: string,
  options: JqRunOptions = {},
): Promise<JqRunResult> {
  const started = nowMs();
  const flags = buildFlags(options ?? {});
  const elapsed = (): number => Math.round(nowMs() - started);

  let jq: JqHandle;
  try {
    jq = await getJq();
  } catch (err) {
    return makeError(
      {
        kind: 'engine',
        message:
          'jq could not be loaded in this browser: ' +
          (err instanceof Error ? err.message : 'unknown error') +
          '.',
        scope: null,
      },
      {
        elapsedMs: elapsed(),
        flags,
        version: '',
        exitCode: 0,
        stderr: '',
        ...capNotices([]),
      },
      NO_ROWS,
    );
  }

  const version = jq.version;
  const guardBase = (): {
    elapsedMs: number;
    flags: string[];
    version: string;
    exitCode: number;
    stderr: string;
    notices: string[];
    noticesTruncated: boolean;
    totalNotices: number;
  } => ({
    elapsedMs: elapsed(),
    flags,
    version,
    exitCode: 0,
    stderr: '',
    ...capNotices([]),
  });

  try {
    const prog = typeof program === 'string' ? program : '';
    const text = typeof input === 'string' ? input : '';

    if (prog.trim().length === 0) {
      return makeError(
        { kind: 'compile', message: EMPTY_PROGRAM_MESSAGE, scope: null },
        guardBase(),
        NO_ROWS,
      );
    }
    if (prog.length > MAX_PROGRAM_CHARS) {
      return makeError(
        {
          kind: 'compile',
          message:
            `The program is ${group(prog.length)} characters — this playground caps it at ` +
            `${group(MAX_PROGRAM_CHARS)} characters. Shorten it and try again.`,
          scope: null,
        },
        guardBase(),
        NO_ROWS,
      );
    }
    const bytes = utf8Length(text);
    if (bytes > MAX_INPUT_BYTES) {
      return makeError(
        {
          kind: 'input',
          message:
            `The JSON input is ${group(bytes)} bytes — this playground caps input at 2 MB ` +
            `(${group(MAX_INPUT_BYTES)} bytes) so one paste can never freeze your tab. Trim it ` +
            `and try again.`,
          scope: null,
        },
        guardBase(),
        NO_ROWS,
      );
    }

    let run: { stdout: string; stderr: string; exitCode: number };
    try {
      run = jq.raw(text, prog, flags);
    } catch (err) {
      // Emscripten `abort()`: jq ran out of WebAssembly heap. Verified against
      // jq 1.8.2 — `[repeat(1)]` aborts after ~0.8 s and `[recurse(.next?)]`
      // after ~3 s, which is the tab's real protection against a filter that
      // never terminates. The module is replaced before the next run.
      resetJq();
      const aborted = /abort/i.test(err instanceof Error ? err.message : '');
      return makeError(
        {
          kind: 'engine',
          message: aborted
            ? `jq aborted this run after ${group(elapsed())} ms: it ran out of memory. The usual ` +
              `cause is a filter that never terminates — an unguarded repeat, or ` +
              `recurse(.field), which walks onto null and then recurses on null for ever. Wrap ` +
              `the generator in limit(n; …), or use recurse(.field?; . != null).`
            : 'jq hit an unexpected problem with this run: ' +
              (err instanceof Error ? err.message : 'unknown error') +
              '.',
          scope: null,
        },
        guardBase(),
        NO_ROWS,
      );
    }
    const stderrLines = run.stderr.length > 0 ? run.stderr.split('\n') : [];

    if (run.exitCode === 0) {
      const rows = collectRows(jq, text, prog, flags, run.stdout, Boolean(options?.rawOutput));
      const result: JqOk = {
        ok: true,
        outputs: rows.rows,
        outputsExact: rows.exact,
        truncated: rows.truncated,
        totalOutputs: rows.total,
        stdout: run.stdout,
        outputText: rows.exact && !rows.truncated ? rows.rows.join('\n') : run.stdout,
        elapsedMs: elapsed(),
        flags,
        version,
        exitCode: run.exitCode,
        stderr: run.stderr,
        ...capNotices(stderrLines.map(cleanLine)),
      };
      return result;
    }

    // ── Failure: classify, then keep whatever jq had already emitted ──────
    // Classification, verified against jq 1.8.2: 3 is the only compile code; 5
    // covers BOTH a runtime error and an input parse error (disambiguated by the
    // stderr prefix); and `halt_error(n)` can produce ANY other code (1 and 2
    // observed), which is still the user's program talking, not ours.
    const firstLine = stderrLines[0] ?? '';
    const kind: JqErrorKind =
      run.exitCode === 3 ? 'compile' : firstLine.startsWith('jq: parse error:') ? 'input' : 'runtime';

    let parts: ErrParts;
    let noticeLines: string[];

    if (kind === 'compile') {
      const index = stderrLines.findIndex((line) => line.startsWith(COMPILE_PREFIX));
      const raw = index >= 0 ? stderrLines[index].slice(COMPILE_PREFIX.length) : firstLine;
      const positioned = splitPosition(raw, PROGRAM_POS_RE);
      const excerptLines: string[] = [];
      for (let i = index + 1; i < stderrLines.length; i += 1) {
        if (stderrLines[i].startsWith('jq: ')) break;
        excerptLines.push(stderrLines[i]);
      }
      const excerpt = excerptLines.join('\n').replace(/\s+$/, '');
      parts = {
        kind,
        message: positioned.message.length > 0 ? positioned.message : 'The program did not compile.',
        line: positioned.line,
        column: positioned.column,
        scope: positioned.line === undefined ? null : 'program',
        excerpt: excerpt.length > 0 ? excerpt : undefined,
      };
      noticeLines = stderrLines
        .filter(
          (line, i) =>
            i !== index && line.startsWith(COMPILE_PREFIX) && !COMPILE_SUMMARY_RE.test(line),
        )
        .map(cleanLine);
    } else if (kind === 'input') {
      const positioned = splitPosition(firstLine.slice(PARSE_PREFIX.length), INPUT_POS_RE);
      parts = {
        kind,
        message:
          positioned.message.length > 0 ? positioned.message : 'The JSON input could not be parsed.',
        line: positioned.line,
        column: positioned.column,
        scope: positioned.line === undefined ? null : 'input',
      };
      noticeLines = stderrLines.slice(1).map(cleanLine);
    } else {
      const message = cleanLine(firstLine);
      parts = {
        kind,
        message:
          message.length > 0
            ? message
            : `jq exited with code ${run.exitCode} and wrote nothing to explain why.`,
        // jq prints `/dev/stdin:0` for runtime errors — a placeholder, not a
        // line number. Reporting it as one would be a confidently wrong answer.
        scope: null,
      };
      noticeLines = stderrLines.slice(1).map(cleanLine);
    }

    const partial = collectRows(
      jq,
      text,
      prog,
      flags,
      run.stdout,
      Boolean(options?.rawOutput),
    );

    return makeError(
      parts,
      {
        elapsedMs: elapsed(),
        flags,
        version,
        exitCode: run.exitCode,
        stderr: run.stderr,
        ...capNotices(noticeLines),
      },
      partial,
    );
  } catch (err) {
    return makeError(
      {
        kind: 'engine',
        message:
          'jq hit an unexpected problem with this run: ' +
          (err instanceof Error ? err.message : 'unknown error') +
          '.',
        scope: null,
      },
      guardBase(),
      NO_ROWS,
    );
  }
}

/** Convenience: the default (all-off) flag set, for callers building state. */
export const DEFAULT_FLAGS: JqFlags = {
  rawOutput: false,
  slurp: false,
  nullInput: false,
  compact: false,
};

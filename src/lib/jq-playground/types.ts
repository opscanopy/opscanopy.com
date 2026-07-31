/**
 * jq Playground — shared types.
 *
 * The tool's whole claim is "this is real jq 1.8.2, not an approximation", so
 * the result type is shaped around what the actual binary reports rather than
 * around what a JS reimplementation could conveniently produce:
 *
 *   - jq writes to stdout AND stderr, and a run can carry both (`debug`, a
 *     runtime error after two good outputs). Both are preserved.
 *   - jq classifies failures by EXIT CODE, not by exception type: 3 is a
 *     compile error, 5 is *both* a runtime error and an input parse error.
 *     `JqErrorKind` is that classification, disambiguated by the stderr prefix.
 *   - a stream of outputs is not one value. `outputs[]` is the stream, one
 *     entry per jq output, and `outputsExact` says whether the split is
 *     provably correct (it always is for JSON output; `-r` needs a second
 *     pass — see `engine.ts`).
 *
 * Nothing here is approximate, and nothing rounds: when a value cannot be
 * reported exactly, a flag says so instead of the value being fudged.
 */

/** The four output/input flags the playground exposes, plus the indent width. */
export interface JqRunOptions {
  /** `-r` — string outputs print raw, without JSON quotes. */
  rawOutput?: boolean;
  /** `-s` — read the whole input stream into one array first. */
  slurp?: boolean;
  /** `-n` — run once with `null` as input; the stream is read via `inputs`. */
  nullInput?: boolean;
  /** `-c` — one line per output instead of jq's pretty printer. */
  compact?: boolean;
  /**
   * Pretty-printer indent width, 0–7. `0` means TABS (`--tab`), matching jq's
   * own `--indent 0` being illegal. Ignored entirely when `compact` is set,
   * because jq lets a later `--indent` silently re-enable pretty printing.
   * Defaults to 2, which is jq's own default and emits no flag at all.
   */
  tabWidth?: number;
}

/**
 * How a failed run failed.
 *
 * - `compile` — the PROGRAM is not valid jq (exit 3).
 * - `input`   — the JSON INPUT could not be parsed (exit 5, `jq: parse error:`).
 * - `runtime` — the program compiled and the input parsed, but evaluation
 *               failed (exit 5, anything else — including `halt_error`, which
 *               prints a bare message with no `jq:` prefix at all).
 * - `engine`  — nothing to do with the user: the WASM module would not load,
 *               an input guard tripped, or jq returned an exit code jq itself
 *               does not document. Never blame the user for one of these.
 */
export type JqErrorKind = 'compile' | 'runtime' | 'input' | 'engine';

/**
 * Which document `errorLine` / `errorColumn` point into. jq reports compile
 * positions against the program and parse positions against the input, and
 * showing one against the other is exactly the kind of confidently-wrong
 * answer this site exists to avoid — so the scope travels with the numbers.
 * `null` when jq gave no usable position (every runtime error: jq prints
 * `/dev/stdin:0` there, which is a placeholder, not a line number).
 */
export type JqErrorScope = 'program' | 'input' | null;

/** A line jq wrote to stderr that is not the primary error. */
export interface JqNotices {
  /** Up to `MAX_NOTICES` lines, in jq's own order. */
  notices: string[];
  /** True when jq wrote more lines than `notices` holds. */
  noticesTruncated: boolean;
  /** How many lines jq actually wrote (never rounded, never estimated). */
  totalNotices: number;
}

/** Fields present on every result, success or failure. */
export interface JqResultCommon extends JqNotices {
  /** Wall-clock time for the jq call(s), rounded to whole milliseconds. */
  elapsedMs: number;
  /** The exact argv jq was given, in order — the flags row's ground truth. */
  flags: string[];
  /** jq's own version string, read from the binary (e.g. `jq-1.8.2`). */
  version: string;
  /** jq's exit code, verbatim. */
  exitCode: number;
  /** Everything jq wrote to stderr, verbatim. */
  stderr: string;
}

export interface JqOk extends JqResultCommon {
  ok: true;
  /** One entry per jq output, in order. Capped — see `truncated`. */
  outputs: string[];
  /**
   * False when the rows could not be proven to be jq's real output boundaries.
   * Only ever false in `-r` mode, and only when a raw string output contains a
   * newline that makes the reconstruction ambiguous; then `outputs` holds ONE
   * entry with the whole raw text and `totalOutputs` still reports the true
   * count. Never present a `false` here as though it were `true`.
   */
  outputsExact: boolean;
  /** True when `outputs` holds fewer rows than jq produced. */
  truncated: boolean;
  /** The real number of outputs jq produced, cap or no cap. */
  totalOutputs: number;
  /** jq's stdout, verbatim (leading/trailing whitespace is trimmed by jq-wasm). */
  stdout: string;
  /**
   * The full output as text, for "Copy all". Rebuilt from `outputs` when the
   * split is exact — that restores the leading whitespace of a raw first output
   * that jq-wasm's `stdout.trim()` throws away — and falls back to `stdout`
   * otherwise.
   */
  outputText: string;
}

export interface JqErr extends JqResultCommon {
  ok: false;
  errorKind: JqErrorKind;
  /** One sentence in jq's own words, with the `jq: …` scaffolding removed. */
  error: string;
  /** 1-based line, or undefined when jq gave none. See `errorScope`. */
  errorLine?: number;
  /** 1-based column, or undefined when jq gave none. See `errorScope`. */
  errorColumn?: number;
  /** Which document `errorLine`/`errorColumn` belong to. */
  errorScope: JqErrorScope;
  /**
   * jq's own source excerpt with the caret line, when it printed one (compile
   * errors). Verbatim, newlines included.
   */
  excerpt?: string;
  /**
   * Outputs jq had already emitted before it failed — a runtime error on the
   * third of five inputs still produced two real results. Capped like
   * `outputs`.
   */
  partialOutputs: string[];
  /** True when `partialOutputs` holds fewer rows than jq emitted. */
  partialTruncated: boolean;
  /** The real number of outputs jq emitted before failing. */
  totalPartialOutputs: number;
}

export type JqRunResult = JqOk | JqErr;

/** Everything the `#q=` deep link and a saved snapshot need to restore. */
export interface JqShareState {
  program: string;
  /**
   * The JSON input, or `null` when the fragment carried only a program (a
   * hand-written `#q=.foo` link). The caller seeds the input itself in that
   * case — it must never be silently invented here.
   */
  input: string | null;
  flags: JqFlags;
}

/** The four boolean flags, exactly as the flags row shows them. */
export interface JqFlags {
  rawOutput: boolean;
  slurp: boolean;
  nullInput: boolean;
  compact: boolean;
}

export interface JqExample {
  id: string;
  label: string;
  program: string;
  input: string;
  flags: JqFlags;
}

/** Options for loading the WASM module. See `getJq` in `engine.ts`. */
export interface JqLoadInit {
  /**
   * URL of the `jq.wasm` asset. The playground passes Vite's hashed
   * `jq-wasm/jq.wasm?url` import so the binary is served same-origin from
   * `/_astro/` (the CSP allows `connect-src 'self'` only). Omit it in Node —
   * jq-wasm then reads the file out of `node_modules` itself.
   */
  wasmURL?: string;
}

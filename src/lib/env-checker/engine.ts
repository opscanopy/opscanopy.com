/**
 * Env Example Checker — a CLIENT-SIDE, deterministic drift checker.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │  WHAT IT DOES                                                              │
 * │                                                                            │
 * │    check(code, envExample) ──▶ EnvResult { usedVars, exampleVars, … }      │
 * │                                                                            │
 * │  • Scans the `code` string for environment-variable READS across many      │
 * │    languages/frameworks (see ACCESS_PATTERNS below) and collects the       │
 * │    unique set of variable names referenced.                                │
 * │                                                                            │
 * │  • Parses the `.env.example` template: every non-comment, non-blank line   │
 * │    of the form `KEY=...` (optionally `export KEY=...`) contributes KEY.    │
 * │                                                                            │
 * │  • Computes the two directions of drift:                                   │
 * │      missingInExample = used − example   (code reads it; example omits it) │
 * │      unusedInExample  = example − used    (example declares it; code does  │
 * │                                            not read it)                    │
 * │                                                                            │
 * │  • Ignores dynamic accesses it cannot statically resolve (e.g.             │
 * │    process.env[varName] with a non-literal key) — those simply contribute  │
 * │    nothing rather than producing noise.                                    │
 * │                                                                            │
 * │  The comparison is DETERMINISTIC: identical inputs → identical, sorted     │
 * │  output. The engine NEVER throws on user input; any unexpected internal    │
 * │  failure is caught and returned as `{ error }`.                            │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

import type { EnvResult } from './types';

/**
 * Recognized environment-variable READ patterns, one regex per access shape.
 *
 * Each pattern MUST be global (`g`) and MUST place the variable name in a
 * capture group. Where the key can be quoted (e.g. Python/Ruby/PHP/Deno) the
 * group sits inside `["']…["']`; for dotted property access (JS/Vite) the group
 * captures a bare identifier. The first capture group that matched is taken as
 * the variable name (some patterns offer alternative quote/bracket shapes).
 *
 * Notes on intentional scoping:
 *   • Bare identifiers (process.env.X, import.meta.env.X) are constrained to
 *     a leading [A-Za-z_] then [A-Za-z0-9_]* so we never capture a numeric or
 *     a chained method call.
 *   • Quoted-key forms accept the same identifier charset between the quotes,
 *     so `process.env["X-Y"]` (not a valid shell env name) is ignored, while
 *     `process.env["X_Y"]` is captured.
 *   • The JS/TS forms tolerate optional chaining (`process.env?.X`), since that
 *     reads exactly the same variable.
 *   • The shell forms are deliberately narrower — see SHELL NAMING GATE below.
 */
const ACCESS_PATTERNS: RegExp[] = [
  // JS/TS (Node): process.env.X / process.env?.X  and  process.env["X"]
  /process\.env\??\.([A-Za-z_][A-Za-z0-9_]*)/g,
  /process\.env\??(?:\.)?\[\s*["'`]([A-Za-z_][A-Za-z0-9_]*)["'`]\s*\]/g,

  // Vite / import.meta: import.meta.env.X / import.meta.env?.X  and  […]["X"]
  /import\.meta\.env\??\.([A-Za-z_][A-Za-z0-9_]*)/g,
  /import\.meta\.env\??(?:\.)?\[\s*["'`]([A-Za-z_][A-Za-z0-9_]*)["'`]\s*\]/g,

  // Deno: Deno.env.get("X")
  /Deno\.env\.get\(\s*["'`]([A-Za-z_][A-Za-z0-9_]*)["'`]\s*\)/g,

  // Python: os.getenv("X") / os.environ["X"] / os.environ.get("X")
  /os\.getenv\(\s*["'`]([A-Za-z_][A-Za-z0-9_]*)["'`]/g,
  /os\.environ\[\s*["'`]([A-Za-z_][A-Za-z0-9_]*)["'`]\s*\]/g,
  /os\.environ\.get\(\s*["'`]([A-Za-z_][A-Za-z0-9_]*)["'`]/g,

  // Ruby: ENV["X"] / ENV.fetch("X")
  /ENV\[\s*["'`]([A-Za-z_][A-Za-z0-9_]*)["'`]\s*\]/g,
  /ENV\.fetch\(\s*["'`]([A-Za-z_][A-Za-z0-9_]*)["'`]/g,

  // Go: os.Getenv("X")  (also covers os.LookupEnv via the Getenv form is most common)
  /os\.Getenv\(\s*["'`]([A-Za-z_][A-Za-z0-9_]*)["'`]\s*\)/g,

  // Java: System.getenv("X")
  /System\.getenv\(\s*["'`]([A-Za-z_][A-Za-z0-9_]*)["'`]\s*\)/g,

  // PHP: getenv("X")  and  $_ENV["X"] / $_ENV['X']
  /getenv\(\s*["'`]([A-Za-z_][A-Za-z0-9_]*)["'`]\s*\)/g,
  /\$_ENV\[\s*["'`]([A-Za-z_][A-Za-z0-9_]*)["'`]\s*\]/g,

  /*
   * Shell expansion — bash/sh scripts, Dockerfiles, docker-compose
   * interpolation and CI job steps: ${X}, ${X:-default}, ${X:?msg}, $X.
   *
   * ── SHELL NAMING GATE ──────────────────────────────────────────────────
   * Unlike every pattern above, `$X` has no anchoring prefix to prove intent,
   * so it is gated by NAMING CONVENTION rather than by sniffing whether the
   * whole paste "looks like" shell (a document-level sniff misfires on the
   * mixed pastes people actually submit — a repo dump, a script beside its
   * consumer). Only SCREAMING_SNAKE_CASE names that START WITH A LETTER are
   * captured, which:
   *   • matches how env vars are named in every shell/Docker/CI context,
   *   • skips realistic JS template-literal noise (`${apiBase}`, `${userId}`),
   *   • skips PHP superglobals ($_ENV, $_SERVER — all begin with `_`), and
   *   • skips positional/special params ($1, $@, $#, $?, $$) and `$100`.
   * `${{ … }}` (GitHub Actions) never matches: `{` is not `[A-Z]`.
   *
   * Residual, deliberate trade-off: an UPPERCASE JS interpolation such as
   * `` `${API_BASE}/v1` `` is read as an env access. That errs toward "used",
   * which can only ever SUPPRESS an unused-key warning — never tell a user to
   * delete a key their code needs.
   * ──────────────────────────────────────────────────────────────────────
   */
  /\$\{([A-Z][A-Z0-9_]*)\b/g,
  /\$([A-Z][A-Z0-9_]*)\b/g,
];

/**
 * `const { X, Y } = process.env` — the single most common Node idiom, plus the
 * `import.meta.env` equivalent. Unlike ACCESS_PATTERNS this captures the whole
 * BINDING LIST (`X, Y: y, Z = 'd'`), which `collectDestructuredVars` then
 * splits, so it is handled separately rather than being mixed into that array.
 *
 * `[^}]*` cannot cross the closing brace, so a nested pattern simply fails to
 * match rather than mis-capturing.
 */
const ENV_DESTRUCTURE =
  /\b(?:const|let|var)\s*\{([^}]*)\}\s*=\s*(?:process\.env|import\.meta\.env)\b/g;

/**
 * One entry of a destructuring binding list, as it appears before the `,` split.
 * The ENV KEY is whatever sits in *key position* — i.e. the leading identifier,
 * terminated by `:` (rename: `API_KEY: apiKey`), `=` (default: `PORT = 3000`)
 * or the end of the entry (plain: `NODE_ENV`). A rest element (`...rest`) has
 * no leading identifier and is therefore skipped.
 */
const BINDING_KEY = /^["'`]?([A-Za-z_][A-Za-z0-9_]*)["'`]?[ \t]*(?:[:=]|$)/;

/**
 * Matches a single declaration line of a `.env`/`.env.example` file:
 *
 *   FOO=bar
 *   export FOO=bar
 *   FOO =          (empty value is fine — we only care about the KEY)
 *
 * Anchored to the start of a line (after optional leading whitespace and an
 * optional `export`), the KEY is `[A-Za-z_][A-Za-z0-9_]*`, followed by an
 * optional run of spaces and a literal `=`. Comment lines (`#`) and blank
 * lines never match because they lack a leading identifier + `=`.
 */
const ENV_LINE = /^[ \t]*(?:export[ \t]+)?([A-Za-z_][A-Za-z0-9_]*)[ \t]*=/;

/** Sort + de-duplicate a list of names for stable, deterministic output. */
function uniqueSorted(values: Iterable<string>): string[] {
  return Array.from(new Set(values)).sort();
}

/**
 * Add every env key bound by a `{ … } = process.env` destructure to `used`.
 *
 * Splitting the binding list on `,` is safe for real code; if a default value
 * ever contained a comma the surplus fragment simply fails `BINDING_KEY` and is
 * dropped, so the failure mode is a missed key, never a bogus one.
 */
function collectDestructuredVars(code: string, used: Set<string>): void {
  // Reset lastIndex defensively — module-level global regex, reused per call.
  ENV_DESTRUCTURE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = ENV_DESTRUCTURE.exec(code)) !== null) {
    for (const entry of m[1].split(',')) {
      const key = BINDING_KEY.exec(entry.trim());
      if (key && key[1]) used.add(key[1]);
    }
    // The match always consumes `= process.env`, so it can never be zero-width.
  }
}

/**
 * Extract the unique set of env-var names READ by `code`.
 *
 * Runs every access pattern over the full source, then the destructuring pass.
 * Because the patterns are line-agnostic, a var read on any line (in any of the
 * supported languages) is found regardless of surrounding syntax. Dynamic,
 * non-literal accesses simply do not match and are therefore ignored.
 */
function collectUsedVars(code: string): string[] {
  const used = new Set<string>();

  for (const pattern of ACCESS_PATTERNS) {
    // Reset lastIndex defensively: these are module-level globals reused across
    // calls, and a prior partial iteration must never leak into this scan.
    pattern.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(code)) !== null) {
      // The variable name is whichever capture group participated (each pattern
      // has exactly one such group, but we scan defensively from group 1).
      let name = '';
      for (let i = 1; i < m.length; i++) {
        if (m[i]) {
          name = m[i];
          break;
        }
      }
      if (name) used.add(name);

      // Zero-width-match guard: should never trigger for these anchored
      // patterns, but advancing on an empty match keeps iteration finite.
      if (m[0] === '') pattern.lastIndex++;
    }
  }

  collectDestructuredVars(code, used);

  return uniqueSorted(used);
}

/**
 * Extract the unique set of KEYs declared by an `.env.example` template.
 *
 * Splits on any newline style (\r\n, \n, \r) and tests each line against
 * `ENV_LINE`. Comments and blanks are skipped automatically (they don't match).
 * A later duplicate key collapses into the set without error.
 */
function collectExampleVars(envExample: string): string[] {
  const declared = new Set<string>();

  // Split on CRLF / LF / CR so Windows, Unix and old-Mac files all parse.
  const lines = envExample.split(/\r\n|\r|\n/);
  for (const line of lines) {
    const m = ENV_LINE.exec(line);
    if (m && m[1]) declared.add(m[1]);
  }

  return uniqueSorted(declared);
}

/** Members of `a` that are not present in `set b`. Inputs are pre-sorted. */
function difference(a: string[], b: string[]): string[] {
  const exclude = new Set(b);
  // `a` is already unique + sorted, so the filtered result stays unique + sorted.
  return a.filter((name) => !exclude.has(name));
}

/**
 * Compare env-var usage in `code` against the keys declared in `envExample`.
 *
 * Never throws: any unexpected internal error is caught and reported via the
 * `error` field on an otherwise-empty result.
 */
export function check(code: string, envExample: string): EnvResult {
  try {
    // Coerce defensively — the playground passes strings, but guard anyway so a
    // stray null/undefined can never reach `.split` / `.exec`.
    const source = typeof code === 'string' ? code : '';
    const example = typeof envExample === 'string' ? envExample : '';

    const usedVars = collectUsedVars(source);
    const exampleVars = collectExampleVars(example);

    return {
      usedVars,
      exampleVars,
      missingInExample: difference(usedVars, exampleVars),
      unusedInExample: difference(exampleVars, usedVars),
    };
  } catch (err) {
    // Defensive backstop — the logic above should not throw on any input.
    const message = err instanceof Error ? err.message : 'Unexpected error while checking.';
    return {
      error: message,
      usedVars: [],
      exampleVars: [],
      missingInExample: [],
      unusedInExample: [],
    };
  }
}

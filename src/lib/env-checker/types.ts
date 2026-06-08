/**
 * Env Example Checker — shared types for the client-side drift checker.
 *
 * The checker compares the environment variables a codebase READS at runtime
 * against the keys declared in its `.env.example` template, and reports the two
 * directions of drift:
 *
 *   • missingInExample — vars the code uses but the example file forgot to list
 *     (the dangerous one: a fresh clone boots without them).
 *   • unusedInExample  — keys the example declares that no code path reads
 *     (stale documentation; usually harmless but worth pruning).
 *
 * Everything runs in the browser — nothing is uploaded.
 */

/**
 * The outcome of one `check(code, envExample)` comparison.
 *
 * All four string arrays are unique and sorted (ASCII/lexicographic) so the
 * result is fully deterministic for identical inputs and stable for the UI.
 */
export interface EnvResult {
  /**
   * Present only on an unexpected internal failure. The engine is designed to
   * NEVER throw on user input, so in practice this should stay undefined; it
   * exists so the playground can surface a graceful message if it ever appears.
   */
  error?: string;
  /** Unique, sorted env-var names the code was found to read. */
  usedVars: string[];
  /** Unique, sorted keys declared by the `.env.example` template. */
  exampleVars: string[];
  /** Used in code but absent from the example (sorted). The actionable gap. */
  missingInExample: string[];
  /** Declared in the example but never read by the code (sorted). */
  unusedInExample: string[];
}

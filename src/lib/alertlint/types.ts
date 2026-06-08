/**
 * AlertLint — shared types for the client-side preview engine.
 *
 * NOTE: This is the type contract for a PRAGMATIC PREVIEW of Loki alert-rule
 * testing that runs entirely in the browser. It is intentionally NOT the real
 * Loki/LogQL engine (a future Go→WASM build will supersede it). The shapes here
 * model just enough of the promtool-style test surface to give honest pass/fail
 * feedback on the bundled examples and similar hand-written rules.
 */

/** Aggregate counts for a single test run, plus deterministic timing. */
export interface RunSummary {
  /** Total number of assertions evaluated (alert + recording). */
  total: number;
  /** Number of assertions that passed. */
  passed: number;
  /** Number of assertions that failed. */
  failed: number;
  /** Wall-clock duration of the run, in milliseconds (UI only — not the synthetic clock). */
  durationMs: number;
}

/** The outcome of a single assertion at a single evaluation time. */
export interface TestResult {
  /** Human-readable label, e.g. the alertname or `record` expression. */
  name: string;
  /** The `eval_time` offset this assertion was checked at, e.g. "5m". */
  evalTime: string;
  /** Whether the assertion held. */
  status: 'pass' | 'fail';
  /** Whether this assertion came from an alerting rule or a recording rule. */
  kind: 'alert' | 'recording';
  /** A readable explanation of what was expected vs. what happened. */
  message: string;
  /** Optional structured expected/actual payload for rich diff rendering. */
  diff?: { expected: unknown; actual: unknown };
}

/** The complete result of a `runTests` call. */
export interface RunResult {
  /** True when parsing + evaluation completed (individual tests may still fail). */
  ok: boolean;
  /** Present only when `ok` is false — a line-referenced parse/eval error. */
  error?: string;
  /** Roll-up counts for the run. */
  summary: RunSummary;
  /** Per-assertion results, in evaluation order. */
  results: TestResult[];
}

/** The minimal state captured in a shareable URL hash. */
export interface ShareState {
  /** The Loki ruler YAML document. */
  rules: string;
  /** The promtool-style test YAML document. */
  test: string;
}

/**
 * LogQL ↔ PromQL Helper — shared types for the client-side conversion engine.
 *
 * The helper best-effort translates common *metric-query* shapes between Grafana
 * Loki's LogQL and Prometheus' PromQL, in both directions. The two query
 * languages share a lot of surface syntax (label matchers, range vectors,
 * aggregation operators) but diverge in fundamental ways:
 *
 *   • LogQL queries a *stream* of log lines. A metric query wraps a log-stream
 *     selector in a range-aggregation (`rate(...[5m])`, `count_over_time`, …).
 *     It can also pipe line filters (`|= "error"`) and label filters that have
 *     no PromQL analog at all.
 *   • PromQL queries pre-aggregated *time series*. Its leaf is a bare metric
 *     name (with optional label matchers); there is no notion of a log line.
 *
 * Because the leaves differ, a clean round-trip is impossible for many inputs.
 * The engine emits the closest equivalent it can AND a clear `notes[]` entry
 * explaining every gap (a dropped line filter, a synthesised metric name, an
 * unsupported function), rather than silently losing meaning.
 *
 * Everything runs in the browser — nothing is uploaded, and `convert()` never
 * throws on user input.
 */

/** Translation direction. */
export type Direction = 'logql-to-promql' | 'promql-to-logql';

/** Result of a single conversion. Mirrors the playground's runtime contract. */
export interface ConvertResult {
  /** The translated query (empty string when `error` is set). */
  output: string;
  /**
   * Best-effort, human-readable notes: what mapped cleanly, what was dropped
   * or approximated, and any manual follow-up the user should do. May be empty.
   */
  notes: string[];
  /** Present only on unparseable input — a helpful, specific message. */
  error?: string;
}

/**
 * Display metadata for each direction, handy for UI selectors. Not required by
 * the engine, but exported so the playground can label its direction picker
 * without hard-coding strings.
 */
export const DIRECTIONS: { value: Direction; label: string; from: string; to: string }[] = [
  { value: 'logql-to-promql', label: 'LogQL → PromQL', from: 'LogQL', to: 'PromQL' },
  { value: 'promql-to-logql', label: 'PromQL → LogQL', from: 'PromQL', to: 'LogQL' },
];

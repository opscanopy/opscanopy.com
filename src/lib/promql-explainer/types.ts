/**
 * PromQL Explainer — shared types for the client-side, deterministic engine.
 *
 * The explainer takes a Prometheus PromQL query string and produces a
 * plain-English explanation plus a token-by-token breakdown. It runs entirely
 * in the browser — nothing is uploaded — and the public `explain()` entry point
 * NEVER throws on user input. Anything it cannot fully understand is described
 * generically rather than failing, and unrecoverable problems (e.g. a totally
 * empty query) come back as a populated `error` alongside a best-effort
 * explanation, so the playground always has something honest to render.
 *
 * The breakdown is a flat list of `{ token, meaning }` rows — `token` is the
 * literal source fragment (a function name, an operator, a selector, …) and
 * `meaning` is a short, sentence-cased gloss of what that fragment does. The
 * top-level `explanation` is a fuller, inside-out prose reading of the whole
 * query (period-terminated, matching the OpsCanopy voice).
 */

/** One row of the token-by-token breakdown shown beside the explanation. */
export interface ExplainPart {
  /** The literal source fragment this row describes (e.g. `rate`, `[5m]`). */
  token: string;
  /** A short, plain-English gloss of what the fragment does. */
  meaning: string;
}

/** The full result of explaining a single PromQL query. */
export interface ExplainResult {
  /**
   * Present only when the input could not be meaningfully explained (e.g. an
   * empty query, or unbalanced brackets). When set, `explanation` still holds a
   * safe, human-readable fallback so the UI can render a message either way.
   */
  error?: string;
  /** A plain-English, inside-out reading of the whole query (period-terminated). */
  explanation: string;
  /** Token-by-token glosses, in left-to-right source order where practical. */
  breakdown: ExplainPart[];
}

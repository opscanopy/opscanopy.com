/**
 * Cron Expression Tester — shared types for the client-side parsing engine.
 *
 * The engine parses a cron expression into a normalized set of allowed values
 * per field, produces a plain-English description, and computes the next N fire
 * times. Everything runs in the browser — deterministic, no network, and the
 * public entry points NEVER throw on user input (bad input yields
 * `{ valid: false, error }`).
 *
 * Supported syntax (see engine.ts for the parser):
 *   - Standard 5-field cron:  minute hour day-of-month month day-of-week
 *   - 6-field form with a leading SECONDS field (tolerated; seconds ignored
 *     for "next run" granularity but surfaced in the description)
 *   - Named macros: @yearly @annually @monthly @weekly @daily @midnight
 *     @hourly @reboot
 *   - Wildcards (*), ranges (1-5), steps (* /15, 1-30/5), lists (1,3,5)
 *   - 3-letter names: JAN-DEC for months, SUN-SAT for days of week
 */

/**
 * The result of explaining a cron expression.
 *
 * This is the exact shape the playground depends on. `valid` reports whether
 * the expression parsed; on failure `error` carries a friendly message and the
 * other fields hold safe placeholders. On success `description` is a readable
 * English sentence, `fields` echoes the raw sub-expressions (for display), and
 * `nextRuns` lists the upcoming fire times as readable strings.
 */
export interface CronResult {
  /** True when the expression parsed cleanly; false on any error. */
  valid: boolean;
  /** Present only when `valid` is false — a clear, friendly message. */
  error?: string;
  /** Plain-English description, e.g. "At 09:00, Monday through Friday." */
  description: string;
  /** The raw per-field sub-expressions, echoed back for display. */
  fields: CronFields;
  /** Upcoming fire times as readable strings (absolute + relative hint). */
  nextRuns: string[];
}

/** The five raw cron sub-expressions, exactly as written by the user. */
export interface CronFields {
  minute: string;
  hour: string;
  dayOfMonth: string;
  month: string;
  dayOfWeek: string;
}

/**
 * A single runnable example for the playground's example picker.
 * Each `expr` parses cleanly and produces a sensible description + next runs.
 */
export interface CronExample {
  /** Stable id used by the playground selector. */
  id: string;
  /** Short human label for the example. */
  label: string;
  /** The cron expression (or @macro) the example demonstrates. */
  expr: string;
}

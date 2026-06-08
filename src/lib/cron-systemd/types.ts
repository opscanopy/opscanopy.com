/**
 * Cron to systemd Converter — shared types for the client-side engine.
 *
 * The converter reads ONE crontab line (either "MIN HOUR DOM MON DOW command",
 * just the five schedule fields, or an @macro such as @daily / @reboot) and maps
 * it to the systemd equivalent: an `OnCalendar=` expression plus a complete
 * `.timer` unit and a matching oneshot `.service` unit.
 *
 * Everything happens in the browser — nothing is uploaded. The engine is pure,
 * deterministic, and NEVER throws on user input; problems are returned as a
 * `valid: false` result with a helpful `error`, and survivable caveats are
 * surfaced through `notes` (e.g. "@reboot mapped to OnBootSec", "step expression
 * is an approximation", "no command supplied — ExecStart left as a placeholder").
 */

/**
 * The full result of converting a single crontab line.
 *
 * This is the exact shape the sibling playground depends on. On a parse failure
 * `valid` is false and `error` explains why; the unit strings are still present
 * (best-effort / empty) so the UI never has to special-case undefined.
 */
export interface SystemdResult {
  /** True when the cron line parsed and a timer/service could be emitted. */
  valid: boolean;
  /** Present only on failure — a helpful, human-readable message. */
  error?: string;
  /** The translated systemd `OnCalendar=` expression (or "" on failure). */
  onCalendar: string;
  /** The complete rendered `.timer` unit file (or "" on failure). */
  timerUnit: string;
  /** The complete rendered oneshot `.service` unit file (or "" on failure). */
  serviceUnit: string;
  /** Non-fatal caveats: mapping approximations, command-parsing notes, etc. */
  notes: string[];
}

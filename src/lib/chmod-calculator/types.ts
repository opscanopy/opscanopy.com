/**
 * chmod Calculator — shared types for the client-side engine.
 *
 * The engine is pure bit math and NEVER throws on user input; invalid input
 * yields { valid: false, error } with a specific diagnostic. Every entry point
 * (parseOctal, parseSymbolic, fromState) returns the SAME fully-populated
 * ChmodResult shape so the playground can keep its matrix, octal and symbolic
 * fields in sync from any of them.
 */

/** Read / write / execute triad for one of user, group, other. */
export interface Perm {
  read: boolean;
  write: boolean;
  execute: boolean;
}

/** The three special mode bits (the high octal digit). */
export interface Special {
  setuid: boolean;
  setgid: boolean;
  sticky: boolean;
}

/** The full permission matrix: special bits + the three rwx triads. */
export interface ChmodState {
  special: Special;
  user: Perm;
  group: Perm;
  other: Perm;
}

/**
 * The result of any conversion.
 *
 * Canonical octal (locked): the CONVENTIONAL form — 3 digits when the special
 * digit is 0 (e.g. `755`, `644`, `700`), 4 digits ONLY when a special bit is
 * set (e.g. `4755`, `2755`, `1777`). Never zero-padded to 4 (`0755` is wrong).
 *
 * Canonical command (locked): exactly `chmod <octal> <file>`, e.g.
 * `chmod 755 file` / `chmod 4755 file`.
 */
export interface ChmodResult {
  valid: boolean;
  error?: string;
  state?: ChmodState;
  octal?: string;
  symbolic?: string;
  lsStyle?: string;
  command?: string;
}

/** One example chip. `octal` seeds the playground's octal field. */
export interface ChmodExample {
  id: string;
  label: string;
  octal: string;
}

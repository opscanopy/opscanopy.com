/**
 * Systemd Unit Validator — shared types.
 *
 * The parse model is an INI parser with systemd's own quirks, not a generic one.
 * Three of those quirks decide the whole shape of this file:
 *
 *   1. A logical assignment can span many PHYSICAL lines (a trailing `\`
 *      continues onto the next line, and a full-line comment may sit inside the
 *      continuation). Every finding still has to name the line the user sees, so
 *      an assignment keeps `parts: SourcePart[]` — one entry per physical line
 *      that contributed text — alongside its folded `value`.
 *   2. There are NO end-of-line comments. `RestartSec=30 # later` sets
 *      `RestartSec` to the literal string `30 # later`, so the parser keeps the
 *      value exactly as systemd would read it and a rule reports the trap.
 *   3. Repeating a directive means one of two completely different things: for a
 *      LIST directive (`ExecStartPre=`, `After=`, `OnCalendar=`) the values
 *      append; for a scalar (`Type=`, `User=`) the last one silently wins. An
 *      empty assignment (`After=`) RESETS the list. So assignments are kept in
 *      file order, never collapsed into a map.
 *
 * The `Finding` shape mirrors `gitlab-ci-validator`'s so both playgrounds render
 * findings the same way; `directive` is the one field this tool adds.
 */

/**
 * How serious a finding is.
 *
 * `error`   — systemd refuses to load the unit, OR it discards the setting
 *             entirely, so the file does not do what it says.
 * `warning` — the unit loads and the setting takes effect, but it is wrong or a
 *             known trap.
 * `info`    — worth knowing. Notably, `unknown-directive` is ALWAYS info: this
 *             validator ships a directive table, not the systemd on your box, so
 *             a name it does not recognise may simply be newer than the table.
 */
export type Severity = 'error' | 'warning' | 'info';

/** Which systemd manager the unit is meant for — changes a handful of rules. */
export type Scope = 'system' | 'user';

/**
 * The kind of unit, derived from the sections present. `unsupported` covers the
 * unit types this validator deliberately does not check directive-by-directive
 * ([Mount], [Path], [Swap], [Automount], [Slice], [Scope]).
 */
export type UnitKind = 'service' | 'timer' | 'socket' | 'unsupported' | 'unknown';

/** One structural, syntactic or semantic finding about the unit file. */
export interface Finding {
  /** Stable, machine-readable rule id, e.g. `wrong-section`. */
  id: string;
  severity: Severity;
  /** One sentence naming what is wrong. Rendered as the row title. */
  title: string;
  /** Why it matters. Plain text — never contains markup. */
  detail: string;
  /** 1-based PHYSICAL line, honest even inside a folded assignment. */
  line?: number;
  /** The directive or section the finding is about, when there is one. */
  directive?: string;
  /** What to do instead. `backticks` become inline code in the UI. */
  remediation?: string;
}

/** One physical line's contribution to a folded assignment. */
export interface SourcePart {
  /** 1-based physical line number in the original text. */
  line: number;
  /** That line's text with the trailing continuation backslash removed. */
  text: string;
}

/** One `Name=value` assignment, as systemd would read it. */
export interface Assignment {
  /** The directive name exactly as written — systemd compares it case-SENSITIVELY. */
  key: string;
  /** The value exactly as systemd would read it: folded, trimmed, comments included. */
  value: string;
  /** 1-based physical line the key is written on. */
  line: number;
  /** 1-based physical line the assignment ends on (differs when folded). */
  endLine: number;
  /** Owning section name as written, or `null` before the first section header. */
  section: string | null;
  /** Index into `ParsedUnit.sections`, or `-1` before the first section header. */
  sectionIndex: number;
  /** The whole logical line as written, `Name=value` — used to echo it back. */
  raw: string;
  /** Every physical line that contributed text. */
  parts: SourcePart[];
}

/** One `[Section]` block. Repeated headers each get their own entry. */
export interface Section {
  /** The name inside the brackets, exactly as written. */
  name: string;
  /** 1-based line of the header. */
  line: number;
  /** Index in `ParsedUnit.sections`. */
  index: number;
  assignments: Assignment[];
}

/** A line that is neither blank, comment, section header nor assignment. */
export interface StrayLine {
  line: number;
  text: string;
}

/** A full-line comment that appeared INSIDE a `\` continuation. */
export interface CommentInContinuation {
  /** The comment's own physical line. */
  line: number;
  /** The directive whose value it interrupted. */
  key: string;
}

/** The parse of a unit file. Never thrown — see `fatal`. */
export interface ParsedUnit {
  sections: Section[];
  /** Every assignment in file order, including those before the first section. */
  assignments: Assignment[];
  strayLines: StrayLine[];
  commentsInContinuations: CommentInContinuation[];
  /** Physical line count of the input. */
  lines: number;
  /**
   * Set when systemd itself would refuse the file outright (an invalid section
   * header). When present, no rule output is trustworthy and `lint` reports only
   * this.
   */
  fatal?: { message: string; line: number };
}

/** How many findings a single rule contributed before it was capped. */
export interface TruncatedRule {
  ruleId: string;
  /** How many findings were kept. */
  shown: number;
  /** How many the rule actually matched. */
  total: number;
}

export interface LintSummary {
  errors: number;
  warnings: number;
  infos: number;
}

export interface LintStats {
  /** Physical lines in the input. */
  lines: number;
  /** Section headers found (a repeated header counts twice). */
  sections: number;
  /** `Name=value` assignments found. */
  directives: number;
}

/**
 * `lint()`'s return value. NEVER a thrown exception.
 *
 * `ok: false` means the file could not be checked at all — it is empty, it is
 * not a unit file, it is past the scan limit, or systemd itself would reject it
 * with an invalid section header. In that case `error` carries one specific,
 * line-referenced sentence and `findings` is EMPTY: a partial rule report on a
 * file systemd refuses to load is a confidently wrong answer, and this tool
 * exists to be checkable.
 *
 * `ok: true` with `findings: []` is the good case, not a failure.
 */
export interface LintResult {
  ok: boolean;
  error?: string;
  findings: Finding[];
  summary: LintSummary;
  stats: LintStats;
  /** Unit kind derived from the sections present. */
  kind: UnitKind;
  /** The scope the rules ran under. */
  scope: Scope;
  /** Rules whose findings hit the per-rule cap. Empty in almost every run. */
  truncatedRules: TruncatedRule[];
  /** True when the TOTAL finding cap was reached and later findings were dropped. */
  truncated: boolean;
}

/** One bundled example chip. */
export interface SystemdExample {
  id: string;
  label: string;
  /** The unit file text. */
  unit: string;
  /**
   * The scope this example is meant to be read in. The playground flips its
   * System/User toggle to match when the chip is tapped, because two of the
   * rules (`wantedby-scope-mismatch`, the `%h` note) only make sense in one.
   */
  scope?: Scope;
}

/**
 * Prometheus Relabel Tester — shared types for the client-side relabeling engine.
 *
 * The tester runs ENTIRELY in the browser: paste a YAML list of `relabel_configs`
 * rules and one or more sample label sets, and get back — for each label set —
 * the resulting labels, which were added / changed / removed, and whether the
 * target was DROPPED. The point of the tool is byte-for-byte fidelity to the
 * official Prometheus relabeling semantics (regex fully anchored, `$1`/`${1}`
 * replacement expansion, MD5-based hashmod, labelmap/labeldrop/labelkeep,
 * keepequal/dropequal, lowercase/uppercase), so the shapes below model just that
 * result surface. The engine NEVER throws — bad YAML or empty input returns
 * `{ ok: false, error }`.
 */

/** The relabel actions Prometheus supports (mirrors `RelabelAction` upstream). */
export type RelabelAction =
  | 'replace'
  | 'keep'
  | 'drop'
  | 'keepequal'
  | 'dropequal'
  | 'hashmod'
  | 'labelmap'
  | 'labeldrop'
  | 'labelkeep'
  | 'lowercase'
  | 'uppercase';

/**
 * One parsed relabel rule with every field resolved to its Prometheus default.
 * Defaults: `source_labels: []`, `separator: ";"`, `regex: "(.*)"`,
 * `replacement: "$1"`, `action: "replace"`.
 */
export interface RelabelRule {
  sourceLabels: string[];
  separator: string;
  regex: string;
  targetLabel?: string;
  replacement: string;
  action: RelabelAction;
  modulus?: number;
}

/** How a single label changed across the whole rule chain for one label set. */
export type ChangeKind = 'added' | 'changed' | 'removed';

/** One label-level diff entry: name + before/after values + the kind of change. */
export interface LabelChange {
  /** The label name that changed. */
  name: string;
  /** Kind of change relative to the input label set. */
  kind: ChangeKind;
  /** Value before the chain ran (undefined when the label was newly added). */
  before?: string;
  /** Value after the chain ran (undefined when the label was removed). */
  after?: string;
}

/** A single output label as a name/value pair (sorted by name for stability). */
export interface LabelPair {
  name: string;
  value: string;
}

/** The full result of applying the rule chain to ONE input label set. */
export interface TargetResult {
  /** 1-based index of this label set in the input (for display). */
  index: number;
  /** The original input label set, sorted by name. */
  input: LabelPair[];
  /** Whether this target was dropped by a `keep` / `drop` / `*equal` action. */
  dropped: boolean;
  /** The id of the rule that dropped the target (1-based), when dropped. */
  droppedByRule?: number;
  /** The action of the rule that dropped the target, when dropped. */
  droppedByAction?: RelabelAction;
  /** Resulting labels after the chain, sorted by name (empty when dropped). */
  output: LabelPair[];
  /** Per-label diff (added / changed / removed) relative to the input. */
  changes: LabelChange[];
}

/**
 * The complete result of an `applyRelabel` call. Never thrown — a YAML parse
 * failure or empty input is surfaced via `ok: false` + `error`; non-fatal notes
 * (e.g. the MD5 hashmod parity note, an ignored rule) go into `warnings`.
 */
export interface RelabelResult {
  /** True when both inputs parsed and the chain ran. */
  ok: boolean;
  /** Present only when `ok` is false — a human-readable reason. */
  error?: string;
  /** One entry per input label set, in input order. */
  results?: TargetResult[];
  /** Non-fatal advisories (parity notes, ignored fields, …). Always present. */
  warnings: string[];
}

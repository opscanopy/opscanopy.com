/**
 * types.ts — the shape of a summarized Terraform plan.
 *
 * Two input formats reach these types: the human-readable `terraform plan`
 * transcript (what people actually paste out of a CI log) and
 * `terraform show -json <planfile>` (a documented, versioned format). The text
 * format is explicitly NOT a stable API, which is why every summary carries a
 * `Reconciliation` — the parsed per-resource list is cross-checked against
 * Terraform's own "Plan:" line, and a disagreement is reported as a WARNING
 * rather than silently producing a confidently wrong total.
 *
 * Nothing here models cost. That is permanent: pricing goes stale, and a stale
 * number printed with confidence is the one mistake a ground-truth tool cannot
 * make.
 */

/** Which parser produced the summary. `unknown` means nothing usable was found. */
export type PlanFormat = 'text' | 'json' | 'unknown';

/**
 * One resource action. Mirrors the `actions` arrays in
 * `terraform show -json` (plus `replace`, which Terraform encodes as the
 * two-element arrays `["delete","create"]` / `["create","delete"]`).
 */
export type PlanAction =
  | 'create'
  | 'update'
  | 'delete'
  | 'replace'
  | 'read'
  | 'import'
  | 'move'
  | 'no-op'
  | 'forget';

/**
 * Which half of a replacement happens first.
 *
 *   `destroy-create` — Terraform prints `-/+`. The resource is gone in between.
 *   `create-destroy` — Terraform prints `+/-` (`create_before_destroy = true`).
 */
export type ReplaceOrder = 'destroy-create' | 'create-destroy';

/**
 * What kind of damage a destructive action to this resource type does. Four
 * classes rather than the three the plan named, because a KMS key is none of
 * data store / egress path / control plane and calling it one would be wrong.
 */
export type RiskClass = 'data-store' | 'egress-path' | 'control-plane' | 'crypto-key';

/** A high-blast-radius verdict. `null` on a ResourceChange means "not flagged". */
export interface RiskVerdict {
  klass: RiskClass;
  /** Which pattern matched, so the verdict is auditable rather than magic. */
  pattern: string;
  /** Class-specific, resource-specific sentence. Never a generic "be careful". */
  reason: string;
}

/** One resource action in the plan (or in the drift preamble). */
export interface ResourceChange {
  /** Full address exactly as Terraform writes it, module prefix and index included. */
  address: string;
  /** Module names from the outside in: `module.a.module.b` → `['a', 'b']`. */
  moduleChain: string[];
  /** `managed` for `resource`, `data` for a data source. */
  mode: 'managed' | 'data';
  /** Resource type, e.g. `aws_db_instance`. */
  type: string;
  /** Local name inside its module, e.g. `primary`. */
  name: string;
  /** `count`/`for_each` key as written (`0`, `prod`), or null when unindexed. */
  index: string | null;
  /** Provider as the JSON format reports it; null for text input (not printed). */
  provider: string | null;
  action: PlanAction;
  /** Only set when `action === 'replace'`. */
  replaceOrder: ReplaceOrder | null;
  /** Attribute paths Terraform blamed for the replacement, e.g. `engine_version`. */
  replaceReasons: string[];
  /** True when a resource blamed more attributes than the per-resource cap keeps. */
  replaceReasonsTruncated: boolean;
  /**
   * Why Terraform chose this action, in Terraform's own words: the verbatim
   * `(because …)` parenthetical for text input, a translated `action_reason`
   * enum for JSON input. Null when Terraform gave no reason.
   */
  actionReason: string | null;
  tainted: boolean;
  imported: boolean;
  /** Previous address when this resource is being moved, else null. */
  movedFrom: string | null;
  /** Best-effort: the plan marked at least one attribute sensitive. Never a completeness claim. */
  sensitive: boolean;
  /** Non-null only for destructive actions on a high-blast-radius type. */
  risk: RiskVerdict | null;
}

/** One entry from the "Changes to Outputs:" block / `output_changes`. */
export interface OutputChange {
  name: string;
  action: 'create' | 'update' | 'delete' | 'no-op';
  sensitive: boolean;
}

/** Per-action tallies. Nothing is double-counted here — see `PlanTotals`. */
export interface PlanCounts {
  /** Created outright (NOT including the create half of a replacement). */
  create: number;
  update: number;
  /** Destroyed outright (NOT including the destroy half of a replacement). */
  destroy: number;
  replace: number;
  /** Data sources read during apply. Never part of add/change/destroy. */
  read: number;
  import: number;
  move: number;
  forget: number;
  noop: number;
}

/**
 * Terraform's own accounting, the one printed on the "Plan:" line: each
 * replacement counts once as an add AND once as a destroy.
 */
export interface PlanTotals {
  add: number;
  change: number;
  destroy: number;
  import: number;
  forget: number;
}

/** The numbers Terraform itself printed, parsed off its summary line. */
export interface ReportedTotals {
  add: number | null;
  change: number | null;
  destroy: number | null;
  import: number | null;
  forget: number | null;
  /** `N to X` pairs this tool does not model, kept so nothing is silently dropped. */
  unmodeled: { key: string; value: number }[];
}

/**
 * The safety net. `mismatch` means the per-resource list below cannot be
 * trusted as complete — Terraform's own line wins, and the UI says so.
 */
export interface Reconciliation {
  status: 'match' | 'mismatch' | 'absent';
  reported: ReportedTotals | null;
  computed: PlanTotals;
  message: string;
}

export interface PlanVersions {
  /** `Terraform` or `OpenTofu` when the paste says so, else null. */
  product: 'Terraform' | 'OpenTofu' | null;
  /** CLI version string, e.g. `1.9.5`. */
  version: string | null;
  /** `format_version` from the JSON format, e.g. `1.2`. Null for text input. */
  formatVersion: string | null;
}

export type Severity = 'error' | 'warning' | 'info';

export interface Diagnostic {
  severity: Severity;
  message: string;
}

/** What was dropped to keep a 50k-line paste from freezing the tab. */
export interface PlanLimits {
  inputTruncated: boolean;
  changesTruncated: boolean;
  diagnosticsTruncated: boolean;
  /** Characters supplied. */
  inputChars: number;
  /** Characters actually parsed (equal to `inputChars` unless truncated). */
  readChars: number;
}

export interface PlanSummary {
  /** True when something usable was parsed. False means the diagnostics explain why not. */
  ok: boolean;
  format: PlanFormat;
  /** Terraform said "No changes." — a calm success, not an empty result. */
  noChanges: boolean;
  counts: PlanCounts;
  totals: PlanTotals;
  /** The verbatim "Plan: …" or "No changes. …" line, when the paste had one. */
  summaryLine: string | null;
  changes: ResourceChange[];
  /** Resources changed outside Terraform. Deliberately NOT part of counts. */
  drift: ResourceChange[];
  driftCount: number;
  outputChanges: OutputChange[];
  /** Destructive actions on high-blast-radius types, in `changes` order. */
  highRisk: ResourceChange[];
  reconciliation: Reconciliation;
  diagnostics: Diagnostic[];
  versions: PlanVersions;
  limits: PlanLimits;
  stats: { errors: number; warnings: number; changes: number };
}

/** Overridable caps. Defaults are the shipped ones; tests narrow them. */
export interface SummarizeOptions {
  /** Characters of input read before truncation. Default 2,097,152 (2 MiB). */
  maxInputChars?: number;
  /** Resource changes parsed before the parser stops. Default 2,000. */
  maxChanges?: number;
  /** Diagnostics kept. Default 50. */
  maxDiagnostics?: number;
}

/**
 * Kubernetes Label Selector Tester — shared types.
 *
 * The whole product is the WHY, not the verdict. That is why `ClauseTrace`
 * carries a `reason` that is ALWAYS populated — there is no code path in this
 * engine that produces a clause without a sentence explaining it — and why the
 * absent-key cases are flagged separately (`absentKeyMatch`): a `NotIn` or `!=`
 * clause MATCHING a resource that has no such label at all is the single piece
 * of apimachinery semantics that people, and language models, get backwards.
 *
 * Operator vocabulary is apimachinery's, deliberately narrowed to the four
 * operators a **LabelSelector** actually has. `Gt`/`Lt` belong to
 * `NodeSelectorRequirement` (node affinity), a different API surface, and are
 * refused with a message that says so rather than silently mis-evaluated.
 */

/** The four `LabelSelectorOperator` values. Case-sensitive, like the API. */
export type Operator = 'In' | 'NotIn' | 'Exists' | 'DoesNotExist';

/** Which selector grammar the user is writing. */
export type SelectorMode = 'expr' | 'yaml';

/** Where a requirement came from — the two grammars, and which YAML field. */
export type RequirementSource = 'expr' | 'matchLabels' | 'matchExpressions';

/**
 * The operator EXACTLY as the user wrote it. Needed because four semantic
 * operators are spelled seven ways, and a trace that renders `In` at a user who
 * typed `!=` is a trace they will not trust.
 *
 *   `'='` `'=='` `'!='`      kubectl `-l` equality forms
 *   `'in'` `'notin'`         kubectl `-l` set-based forms
 *   `'key'` `'!key'`         kubectl `-l` existence forms (`app`, `!app`)
 *   `'In'` `'NotIn'` …       structured `matchExpressions` operators
 *   `'matchLabels'`          a `matchLabels` entry (equality, rendered `k=v`)
 */
export type WrittenOp =
  | '='
  | '=='
  | '!='
  | 'in'
  | 'notin'
  | 'key'
  | '!key'
  | 'matchLabels'
  | 'In'
  | 'NotIn'
  | 'Exists'
  | 'DoesNotExist';

/** One clause of a selector, normalized the way apimachinery normalizes it. */
export interface Requirement {
  key: string;
  op: Operator;
  /**
   * For `In`/`NotIn`: the value set, de-duplicated and sorted — apimachinery
   * stores `sets.String.List()`, so `(staging,prod)` and `(prod,staging)` are
   * the same requirement. Empty for `Exists`/`DoesNotExist`.
   */
  values: string[];
  source: RequirementSource;
  written: WrittenOp;
  /** `apimachinery`'s `Requirement.String()`: `env in (prod,staging)`, `tier=web`, `!debug`. */
  display: string;
}

/** One requirement evaluated against one resource. `reason` is never empty. */
export interface ClauseTrace {
  requirement: Requirement;
  holds: boolean;
  /** Why it holds or fails, naming the actual label value. ALWAYS populated. */
  reason: string;
  /** The resource carries no label with this key at all. */
  keyAbsent: boolean;
  /**
   * The resource CARRIES this key, but YAML did not read its value as a string
   * (a map, a list, or an unquoted date), so `In`/`NotIn` cannot be decided.
   * `holds` is false in that case — never a match on an unknown value, and
   * never `keyAbsent`, because the key is right there in the document.
   */
  undecided: boolean;
  /**
   * The clause HOLDS *because* the key is absent, under an operator where that
   * surprises people (`NotIn`, and therefore `!=`). The UI gives these an amber
   * annotation; nothing else in this engine treats them specially.
   */
  absentKeyMatch: boolean;
}

/** An advisory problem with a RESOURCE's own labels — never blocking. */
export interface LabelIssue {
  key: string;
  message: string;
}

/** One resource, with the verdict and the clause-by-clause trace behind it. */
export interface ResourceVerdict {
  /** `kind` as written, `Object` when the document has none, `Pod template` for a workload's template. */
  kind: string;
  name: string;
  namespace?: string;
  labels: Record<string, string>;
  /** The field these labels were read from: `metadata.labels`, `spec.template.metadata.labels`, `labels`. */
  labelsPath: string;
  matches: boolean;
  clauses: ClauseTrace[];
  labelIssues: LabelIssue[];
  /**
   * Keys present in the document whose value YAML did not read as a scalar
   * (a map, a list, or an unquoted date), mapped to what YAML made of them.
   * These are NOT absent keys — see `undecided` on `ClauseTrace`.
   */
  unreadableLabels: Record<string, string>;
}

export type DiagnosticSeverity = 'error' | 'warning' | 'note';

/** Which input a diagnostic belongs to — the UI flags that field, not both. */
export type DiagnosticWhere = 'selector' | 'resources' | 'result';

export interface Diagnostic {
  severity: DiagnosticSeverity;
  /** One specific sentence. Never "invalid". */
  message: string;
  where: DiagnosticWhere;
  /** 1-based line in the offending input, when a YAML mark is known. */
  line?: number;
}

/**
 * `testSelector()`'s return value. NEVER a thrown exception.
 *
 * `ok: false` means at least one `error` diagnostic fired and no verdicts were
 * computed: a per-resource verdict derived from a selector the API would reject
 * is exactly the confidently-wrong answer this codebase must not ship.
 */
export interface SelectorTestResult {
  ok: boolean;
  mode: SelectorMode;
  requirements: Requirement[];
  /** The whole selector in `kubectl -l` form, clauses sorted by key. `''` when empty. */
  canonical: string;
  /** True for a selector with zero requirements — it matches everything. */
  empty: boolean;
  verdicts: ResourceVerdict[];
  matchCount: number;
  /** Resources actually evaluated (after the cap). */
  resourceCount: number;
  /** Resource documents found before the cap was applied. */
  totalResources: number;
  /** True when resources past the cap were dropped. */
  truncated: boolean;
  diagnostics: Diagnostic[];
  /** `3 of 5 resources match` — the visible `role="status"` line. */
  summary: string;
}

/** The `#s=` payload: both inputs plus which grammar the selector is in. */
export interface ShareState {
  resources: string;
  selector: string;
  mode: SelectorMode;
}

/** One bundled example chip. */
export interface SelectorExample {
  id: string;
  label: string;
  resources: string;
  selector: string;
  mode: SelectorMode;
}

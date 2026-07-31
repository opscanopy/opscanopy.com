/**
 * Grafana Dashboard Validator — shared types.
 *
 * The model this linter works on is deliberately NOT "the dashboard object".
 * Two things about Grafana dashboards make a naive walk wrong:
 *
 *   1. Panels nest. A collapsed row keeps its children in its own `panels`
 *      array; an EXPANDED row keeps them as following siblings; and a
 *      pre-schemaVersion-16 dashboard keeps everything under `rows[]`. All three
 *      shapes have to flatten into one list, and every entry has to remember the
 *      JSON path it came from, because the path is the finding's only address.
 *   2. Variables are referenced from anywhere — queries, titles, links,
 *      annotations, other variables' queries — in four syntaxes. So usages are
 *      collected by walking every string in the document, not by looking in the
 *      places one would expect.
 */

/**
 * What this rule set is pinned to. Rendered verbatim on the tool page, carried
 * on every `LintResult`, and quoted in the `schema-version-unknown` hint — so a
 * report is self-describing and version drift is visible rather than implied.
 *
 * Bump it only together with the rules it describes: `KNOWN_SCHEMA_VERSION`
 * decides what counts as "newer than this linter", and every version-sensitive
 * message is phrased as a RANGE around this point.
 */
export const GRAFANA_RULES_VERSION = 'grafana-12 / schemaVersion 41';

/** The newest `schemaVersion` this rule set understands. */
export const KNOWN_SCHEMA_VERSION = 41;

/**
 * `error` — Grafana will reject, drop or silently mis-render this.
 * `warning` — it loads, and it is wrong or unportable.
 * `info` — worth knowing.
 */
export type Severity = 'error' | 'warning' | 'info';

/**
 * The fixed v1 rule set.
 *
 * NOTE ON THE COUNT: the build plan's prose says "21 rules total (19 original +
 * panel-no-type + panel-zero-size)", but the list it actually names contains
 * twenty-two rules — its "19 original" is a miscount of a twenty-item list.
 * Every named rule is implemented here rather than one being dropped to satisfy
 * the arithmetic, so the catalog is 22 and every count rendered on the page is
 * derived from `RULE_IDS.length` rather than typed by hand.
 */
export type RuleId =
  | 'no-uid'
  | 'root-id-set'
  | 'empty-title'
  | 'duplicate-panel-id'
  | 'duplicate-variable'
  | 'schema-version-old'
  | 'schema-version-unknown'
  | 'undefined-variable'
  | 'unused-variable'
  | 'legacy-var-syntax'
  | 'datasource-by-name'
  | 'unresolved-ds-input'
  | 'empty-targets'
  | 'deprecated-panel-type'
  | 'angular-panel'
  | 'repeat-undefined'
  | 'time-range-absurd'
  | 'refresh-aggressive'
  | 'override-suspect'
  | 'empty-row'
  | 'panel-no-type'
  | 'panel-zero-size';

/** Every rule id in catalog order — drives the page's anchors and the test sweep. */
export const RULE_IDS: readonly RuleId[] = [
  'no-uid',
  'root-id-set',
  'empty-title',
  'duplicate-panel-id',
  'duplicate-variable',
  'schema-version-old',
  'schema-version-unknown',
  'undefined-variable',
  'unused-variable',
  'legacy-var-syntax',
  'datasource-by-name',
  'unresolved-ds-input',
  'empty-targets',
  'deprecated-panel-type',
  'angular-panel',
  'repeat-undefined',
  'time-range-absurd',
  'refresh-aggressive',
  'override-suspect',
  'empty-row',
  'panel-no-type',
  'panel-zero-size',
];

/** One finding. `message` and `hint` are plain text and never contain markup. */
export interface Diagnostic {
  id: RuleId;
  severity: Severity;
  /** JSON path into the dashboard, e.g. `panels[3].datasource`. The finding's address. */
  path: string;
  /** One sentence stating what is wrong. */
  message: string;
  /** What to do about it. Optional only because a few notes have nothing to add. */
  hint?: string;
  /** The owning panel's title, when the finding belongs to a panel. */
  panelTitle?: string;
}

/** One panel-shaped node, wherever it was nested. Rows are panels in Grafana. */
export interface PanelNode {
  raw: Record<string, unknown>;
  /** `panels[3]`, `panels[2].panels[0]`, `rows[1].panels[0]`. */
  path: string;
  /** Title as written, or `''` when absent — never undefined, so messages are simple. */
  title: string;
  /** `type` when it is a non-empty string, else null (which is what `panel-no-type` reports). */
  type: string | null;
  /** Numeric `id`, or null when absent/not a number. */
  id: number | null;
  isRow: boolean;
  /** `collapsed: true` on a row. Meaningless for non-rows. */
  collapsed: boolean;
  /**
   * How many panels Grafana shows under this row: its own `panels` for a
   * collapsed or legacy row, the count of following siblings up to the next row
   * for an expanded one. `0` for non-rows.
   */
  childCount: number;
}

/** One declared template variable. */
export interface VariableNode {
  name: string;
  type: string;
  /** `templating.list[2]`. */
  path: string;
  raw: Record<string, unknown>;
}

/** How a variable reference was written. */
export type UsageSyntax = 'dollar' | 'braced' | 'legacy';

/** One place a variable name appears in the document. */
export interface VarUsage {
  name: string;
  syntax: UsageSyntax;
  /** Path of the STRING the reference was found in, e.g. `panels[0].targets[0].expr`. */
  path: string;
  /** True when the surrounding string looks like a regular expression. */
  inRegexLike: boolean;
}

/** A `datasource` field written as a bare name string. */
export interface DatasourceRef {
  name: string;
  path: string;
}

/** Everything the rules read. Built once, in `parse.ts`. */
export interface DashboardContext {
  dashboard: Record<string, unknown>;
  panels: PanelNode[];
  variables: VariableNode[];
  /** Declared variable names, lowercase-sensitive (Grafana names are case-sensitive). */
  definedNames: Set<string>;
  usages: VarUsage[];
  /** Bare-name `datasource` references, in document order. */
  datasourceNames: DatasourceRef[];
  /** `__inputs[].name` values, in order. Empty when there is no `__inputs` block. */
  inputNames: string[];
  /** True when the root carried an `__inputs` array at all. */
  hasInputs: boolean;
  stats: DashboardStats;
  notes: string[];
}

export interface DashboardStats {
  /** Numeric `schemaVersion`, or null when absent or not a number. */
  schemaVersion: number | null;
  /** Non-row panels, nested ones included. */
  panels: number;
  /** Row panels, legacy `rows[]` included. */
  rows: number;
  /** Distinct declared variable names. */
  varsDefined: number;
  /** Distinct referenced names, Grafana built-ins excluded. */
  varsUsed: number;
  /** Distinct referenced names that are neither declared nor built-in. */
  varsUnresolved: number;
}

export interface LintSummary {
  errors: number;
  warnings: number;
  infos: number;
}

/** A rule that matched more than the per-rule cap allows it to report. */
export interface TruncatedRule {
  ruleId: RuleId;
  shown: number;
  total: number;
}

/**
 * `lintDashboard()`'s return value. NEVER a thrown exception.
 *
 * `ok: false` means the input could not be linted at all — empty, over the size
 * limit, not JSON, or JSON that is not a dashboard object. `error` then carries
 * one specific sentence and `diagnostics` is EMPTY: half a rule report on
 * something that is not a dashboard would be a confidently wrong answer.
 *
 * `ok: true` with `diagnostics: []` is the good case, not a failure.
 */
export interface LintResult {
  ok: boolean;
  error?: string;
  /** What the parser had to do to read the input, in the order it did it. */
  parseNotes: string[];
  diagnostics: Diagnostic[];
  summary: LintSummary;
  stats: DashboardStats;
  truncatedRules: TruncatedRule[];
  /** True when the TOTAL diagnostic cap was hit and later findings were dropped. */
  truncated: boolean;
  /** `GRAFANA_RULES_VERSION`, carried on every result so a stored report is self-describing. */
  rulesVersion: string;
}

/** One bundled example chip. `json` is strict JSON text, exactly as it seeds the editor. */
export interface DashboardExample {
  id: string;
  label: string;
  json: string;
}

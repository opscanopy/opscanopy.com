/**
 * Grafana Dashboard Validator — public engine.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │  WHAT THIS IS                                                            │
 * │                                                                          │
 * │  A CLIENT-SIDE, dependency-free structural linter for Grafana dashboard   │
 * │  JSON. It parses the file the way Grafana's importer would have to, indexes│
 * │  its panels and template variables, and runs a fixed rule set over the    │
 * │  result. There is no Grafana instance behind it, no plugin registry and no│
 * │  network: everything it knows comes from the text in front of it.         │
 * │                                                                          │
 * │  SCOPE FENCE. This is a STRUCTURAL lint, not schema validation. It does   │
 * │  not check the dashboard against Grafana's schema, does not parse PromQL  │
 * │  or LogQL inside targets, and does not know whether a uid, plugin or      │
 * │  folder exists on your instance. The full list of what it deliberately    │
 * │  stays silent about is at the top of `rules.ts`, and on the tool page.    │
 * │                                                                          │
 * │  THE CONTRACT                                                            │
 * │                                                                          │
 * │    lintDashboard(text) NEVER THROWS. Empty, truncated, binary, enormous,  │
 * │    YAML or simply not-a-dashboard input all return a `LintResult`.        │
 * │                                                                          │
 * │    `ok: false` means the input could not be linted AT ALL. `error` then   │
 * │    carries one specific sentence and `diagnostics` is EMPTY: half a rule  │
 * │    report on something that is not a dashboard is a confidently wrong     │
 * │    answer, and this tool exists to be checkable.                         │
 * │                                                                          │
 * │    `ok: true` with `diagnostics: []` is the good case, not a failure.     │
 * │                                                                          │
 * │    A rule that crashes on unexpected input degrades to ONE info           │
 * │    diagnostic attributed to that rule; every other rule still runs.       │
 * │                                                                          │
 * │    Everything the parser had to tolerate to read the input is reported in │
 * │    `parseNotes`, never silently — Grafana's own API rejects comments and   │
 * │    trailing commas, so leniency here has to be visible.                   │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
import { buildContext, parseDashboardText } from './parse';
import { RULES } from './rules';
import {
  GRAFANA_RULES_VERSION,
  RULE_IDS,
  type DashboardStats,
  type Diagnostic,
  type LintResult,
  type RuleId,
  type Severity,
  type TruncatedRule,
} from './types';

export { GRAFANA_RULES_VERSION, KNOWN_SCHEMA_VERSION, RULE_IDS } from './types';
export { RULES, RULE_SEVERITY } from './rules';
export {
  buildContext,
  isBuiltInVariable,
  locateJsonFault,
  looksLikeProvisioningYaml,
  parseDashboardText,
  stripJsonExtras,
} from './parse';
export type {
  DashboardContext,
  DashboardExample,
  DashboardStats,
  Diagnostic,
  LintResult,
  LintSummary,
  PanelNode,
  RuleId,
  Severity,
  TruncatedRule,
  VarUsage,
  VariableNode,
} from './types';

/**
 * How much text the linter reads. Real dashboards run from a few kilobytes to a
 * megabyte or two; five million characters covers the largest generated ones with
 * room to spare. Past this the input is a log, an archive or a paste accident,
 * and scanning it would buy a frozen tab and a wrong report.
 */
export const MAX_INPUT_CHARS = 5_000_000;

/** Diagnostics kept per rule before the rule is capped (and says so). */
export const MAX_DIAGNOSTICS_PER_RULE = 50;

/** Diagnostics kept in total before the run is capped (and says so). */
export const MAX_DIAGNOSTICS_TOTAL = 400;

const SEVERITY_ORDER: Record<Severity, number> = { error: 0, warning: 1, info: 2 };

const RULE_ORDER = new Map<RuleId, number>(RULE_IDS.map((id, index) => [id, index]));

function emptyStats(): DashboardStats {
  return {
    schemaVersion: null,
    panels: 0,
    rows: 0,
    varsDefined: 0,
    varsUsed: 0,
    varsUnresolved: 0,
  };
}

function fatal(error: string, stats: DashboardStats = emptyStats()): LintResult {
  return {
    ok: false,
    error,
    parseNotes: [],
    diagnostics: [],
    summary: { errors: 0, warnings: 0, infos: 0 },
    stats,
    truncatedRules: [],
    truncated: false,
    rulesVersion: GRAFANA_RULES_VERSION,
  };
}

/**
 * Compare two JSON paths the way a reader scans them: numerically inside
 * brackets, so `panels[2]` sorts before `panels[10]` instead of after it.
 */
function comparePaths(a: string, b: string): number {
  const chunks = /(\d+)|(\D+)/g;
  const left = a.match(chunks) ?? [a];
  const right = b.match(chunks) ?? [b];
  const shared = Math.min(left.length, right.length);
  for (let i = 0; i < shared; i += 1) {
    const l = left[i];
    const r = right[i];
    if (l === r) continue;
    const ln = Number(l);
    const rn = Number(r);
    if (Number.isInteger(ln) && Number.isInteger(rn)) return ln - rn;
    return l < r ? -1 : 1;
  }
  return left.length - right.length;
}

/**
 * Collects diagnostics while enforcing both caps and de-duplicating on
 * `id@path@message`. Duplicates are dropped BEFORE the per-rule tally, so a
 * capped rule's reported total is a count of real, distinct findings.
 */
class Collector {
  readonly diagnostics: Diagnostic[] = [];
  private readonly seen = new Set<string>();
  private readonly kept = new Map<RuleId, number>();
  private readonly matched = new Map<RuleId, number>();
  truncated = false;

  add = (diagnostic: Diagnostic): void => {
    const key = `${diagnostic.id}@${diagnostic.path}@${diagnostic.message}`;
    if (this.seen.has(key)) return;
    this.seen.add(key);
    this.matched.set(diagnostic.id, (this.matched.get(diagnostic.id) ?? 0) + 1);

    if ((this.kept.get(diagnostic.id) ?? 0) >= MAX_DIAGNOSTICS_PER_RULE) return;
    if (this.diagnostics.length >= MAX_DIAGNOSTICS_TOTAL) {
      this.truncated = true;
      return;
    }
    this.kept.set(diagnostic.id, (this.kept.get(diagnostic.id) ?? 0) + 1);
    this.diagnostics.push(diagnostic);
  };

  /** Rules that matched more than they reported, in catalog order. */
  truncatedRules(): TruncatedRule[] {
    const out: TruncatedRule[] = [];
    for (const ruleId of RULE_IDS) {
      const total = this.matched.get(ruleId) ?? 0;
      const shown = this.kept.get(ruleId) ?? 0;
      if (total > shown) out.push({ ruleId, shown, total });
    }
    return out;
  }
}

/** Lint a Grafana dashboard JSON. Never throws — see the contract in the header. */
export function lintDashboard(input: string): LintResult {
  if (typeof input !== 'string' || input.trim() === '') {
    return fatal('Paste a Grafana dashboard JSON to lint.');
  }
  if (input.length > MAX_INPUT_CHARS) {
    return fatal(
      `This input is ${input.length.toLocaleString('en-US')} characters — larger than the ` +
        `${MAX_INPUT_CHARS.toLocaleString('en-US')}-character limit this linter scans. Paste the ` +
        'dashboard JSON on its own.',
    );
  }

  let parsed;
  try {
    parsed = parseDashboardText(input);
  } catch (err) {
    // The parser's own contract is "never throws"; this is belt and braces so a
    // future edit to it can never take the playground down.
    return fatal(
      `This text could not be read as a Grafana dashboard (${String(err)}). Compare it against ` +
        'Grafana’s Dashboard settings → JSON Model view.',
    );
  }
  if (!parsed.ok) return fatal(parsed.error);

  let context;
  try {
    context = buildContext(parsed.dashboard, parsed.notes);
  } catch (err) {
    return fatal(
      `This dashboard could not be indexed (${String(err)}). Compare it against Grafana’s ` +
        'Dashboard settings → JSON Model view.',
    );
  }

  const collector = new Collector();
  for (const rule of RULES) {
    try {
      rule.run(context, collector.add);
    } catch (err) {
      // One rule tripping must never lose the other twenty-one.
      collector.add({
        id: rule.id,
        severity: 'info',
        path: '',
        message: `The "${rule.id}" check could not finish on this dashboard.`,
        hint: `It stopped early (${String(err)}). Every other rule still ran, and the findings listed here are unaffected.`,
      });
    }
  }

  const diagnostics = [...collector.diagnostics].sort((a, b) => {
    const bySeverity = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
    if (bySeverity !== 0) return bySeverity;
    const byRule = (RULE_ORDER.get(a.id) ?? 0) - (RULE_ORDER.get(b.id) ?? 0);
    if (byRule !== 0) return byRule;
    return comparePaths(a.path, b.path);
  });

  return {
    ok: true,
    parseNotes: context.notes,
    diagnostics,
    summary: {
      errors: diagnostics.filter((d) => d.severity === 'error').length,
      warnings: diagnostics.filter((d) => d.severity === 'warning').length,
      infos: diagnostics.filter((d) => d.severity === 'info').length,
    },
    stats: context.stats,
    truncatedRules: collector.truncatedRules(),
    truncated: collector.truncated,
    rulesVersion: GRAFANA_RULES_VERSION,
  };
}

function count(n: number, singular: string, plural = `${singular}s`): string {
  return `${n} ${n === 1 ? singular : plural}`;
}

/**
 * The one-line summary the playground announces and the page quotes. Lives here
 * so the wording is covered by the engine's own vectors instead of being retyped
 * in five locale pages.
 */
export function summaryLine(result: LintResult): string {
  if (!result.ok) return 'Could not lint';
  const { errors, warnings, infos } = result.summary;
  const parts: string[] = [];
  if (errors > 0) parts.push(count(errors, 'error'));
  if (warnings > 0) parts.push(count(warnings, 'warning'));
  if (infos > 0) parts.push(count(infos, 'note'));
  const head =
    parts.length > 0
      ? parts.join(', ')
      : `No problems found in ${count(result.stats.panels, 'panel')}`;

  const variables =
    result.stats.varsUnresolved > 0
      ? `variables: ${result.stats.varsDefined} defined, ${result.stats.varsUnresolved} unresolved`
      : `variables: ${result.stats.varsDefined} defined`;
  const schema =
    result.stats.schemaVersion === null
      ? 'schemaVersion not set'
      : `schemaVersion ${result.stats.schemaVersion}`;

  return `${head} — ${variables}, ${schema}`;
}

/**
 * Grafana Dashboard Validator — the rule set.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │  DELIBERATELY SILENT — read this before adding a rule                     │
 * │                                                                          │
 * │  · Full schema validation. v1 is a structural lint, not a schema check:   │
 * │    Grafana's dashboard schema is large, versioned and still moving, and a │
 * │    partial schema check reported as a schema check would be a lie.        │
 * │  · PromQL / LogQL / SQL inside `targets`. A query language deserves its   │
 * │    own tool; this one cross-links to the PromQL Explainer instead of      │
 * │    half-parsing expressions.                                             │
 * │  · Anything that needs a Grafana instance: whether a `uid` exists,        │
 * │    whether a plugin is installed, whether a folder is there. No network.  │
 * │  · Typos inside `$__names`. Everything beginning `__` is treated as a     │
 * │    Grafana built-in, because Grafana keeps adding them and calling next   │
 * │    year's built-in "undefined" would be worse than missing a typo.        │
 * │  · Panels with no title. Text panels and single-stat tiles are            │
 * │    legitimately untitled; only the DASHBOARD title is required.           │
 * │  · `gridPos` overlap and layout geometry. Grafana repacks the grid on     │
 * │    load, so an overlap in the JSON is not an overlap on screen.           │
 * │  · Legacy `rows[]` panel sizing. Pre-schemaVersion-16 layouts used        │
 * │    `span`, not `gridPos`; reporting a missing `gridPos` there would fire  │
 * │    on every panel of a dashboard whose real problem is already an error.  │
 * │  · A `refresh` this linter cannot parse. Guessing what "1m30s" means is   │
 * │    guessing.                                                             │
 * │  · Deprecated field names inside panel options. They are per-plugin, they │
 * │    move every release, and Grafana migrates them on load.                │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Every rule is a `{ id, severity, run }` record. `run` may add zero or more
 * diagnostics through the collector it is handed; the engine wraps each `run` in
 * its own try/catch, so a rule that trips on unforeseen input costs one info
 * diagnostic and never the other twenty-one.
 *
 * Version-sensitive rules are phrased as RANGES ("Grafana 9–12", "removed in
 * Grafana 11–12") rather than as a single version, because the linter is pinned
 * to one point in Grafana's history (`GRAFANA_RULES_VERSION`) and the reader's
 * instance is somewhere near it, not exactly on it.
 */
import { isBuiltInVariable, isDatasourceInputName, isPlainObject } from './parse';
import {
  KNOWN_SCHEMA_VERSION,
  GRAFANA_RULES_VERSION,
  type DashboardContext,
  type Diagnostic,
  type PanelNode,
  type RuleId,
  type Severity,
  type VarUsage,
} from './types';

export type Emit = (diagnostic: Diagnostic) => void;

export interface Rule {
  id: RuleId;
  /** The severity the catalog advertises. A few rules pick a lower one at runtime. */
  severity: Severity;
  run: (ctx: DashboardContext, emit: Emit) => void;
}

/* ── shared phrasing helpers ─────────────────────────────────────────────── */

/** `"Requests"` when the panel has a title, `at panels[0]` when it does not. */
function panelRef(node: PanelNode): string {
  const title = node.title.trim();
  return title !== '' ? `"${node.title}"` : `at ${node.path}`;
}

function panelTitleOf(node: PanelNode): string | undefined {
  return node.title.trim() !== '' ? node.title : undefined;
}

function pluralPlaces(count: number): string {
  return `${count} places`;
}

/* ── 1. no-uid ───────────────────────────────────────────────────────────── */

const UID_HINT =
  'Set a stable "uid" of up to 40 characters (letters, digits, "-" and "_") and keep it in ' +
  'version control.';

const noUid: Rule = {
  id: 'no-uid',
  severity: 'warning',
  run: (ctx, emit) => {
    const uid = ctx.dashboard.uid;
    if (typeof uid === 'string' && uid.trim() !== '') return;
    let message: string;
    if (uid === undefined || uid === null) {
      message =
        'This dashboard has no "uid", so every import creates a new dashboard instead of ' +
        'updating the one you already have.';
    } else if (typeof uid === 'string') {
      message =
        'The "uid" is empty, so every import creates a new dashboard instead of updating the one ' +
        'you already have.';
    } else {
      message =
        'The "uid" is not a string, so Grafana ignores it: every import creates a new dashboard ' +
        'instead of updating the one you already have.';
    }
    emit({ id: 'no-uid', severity: 'warning', path: 'uid', message, hint: UID_HINT });
  },
};

/* ── 2. root-id-set ──────────────────────────────────────────────────────── */

const rootIdSet: Rule = {
  id: 'root-id-set',
  severity: 'warning',
  run: (ctx, emit) => {
    const id = ctx.dashboard.id;
    if (typeof id !== 'number' || !Number.isFinite(id)) return;
    emit({
      id: 'root-id-set',
      severity: 'warning',
      path: 'id',
      message: `The root "id" is ${id} — a database row id from the Grafana instance this JSON came from.`,
      hint:
        'Set "id": null before you commit or import this file. Grafana assigns its own id, and a ' +
        'stale one makes an import fail or land on an unrelated dashboard.',
    });
  },
};

/* ── 3. empty-title ──────────────────────────────────────────────────────── */

const TITLE_HINT =
  'Give it the name you will search for later — the title is what the dashboard list and the ' +
  'search index show.';

const emptyTitle: Rule = {
  id: 'empty-title',
  severity: 'warning',
  run: (ctx, emit) => {
    const title = ctx.dashboard.title;
    if (typeof title === 'string' && title.trim() !== '') return;
    let message: string;
    if (title === undefined || title === null) {
      message = 'This dashboard has no "title", so Grafana lists it as "New dashboard".';
    } else if (typeof title === 'string') {
      message = 'The "title" is empty, so Grafana lists this dashboard as "New dashboard".';
    } else {
      message = 'The "title" is not a string, so Grafana lists this dashboard as "New dashboard".';
    }
    emit({ id: 'empty-title', severity: 'warning', path: 'title', message, hint: TITLE_HINT });
  },
};

/* ── 4. duplicate-panel-id ───────────────────────────────────────────────── */

const duplicatePanelId: Rule = {
  id: 'duplicate-panel-id',
  severity: 'error',
  run: (ctx, emit) => {
    const seen = new Map<number, PanelNode>();
    for (const node of ctx.panels) {
      if (node.id === null) continue;
      const first = seen.get(node.id);
      if (first === undefined) {
        seen.set(node.id, node);
        continue;
      }
      const who =
        first.title.trim() !== ''
          ? `"${first.title}" (${first.path})`
          : `the panel at ${first.path}`;
      emit({
        id: 'duplicate-panel-id',
        severity: 'error',
        path: `${node.path}.id`,
        panelTitle: panelTitleOf(node),
        message: `Panel id ${node.id} is already used by ${who}.`,
        hint:
          'Renumber one of them. Ids only have to be unique inside the dashboard, and Grafana keys ' +
          'panel links, "View panel" URLs and repeats by id.',
      });
    }
  },
};

/* ── 5. duplicate-variable ───────────────────────────────────────────────── */

const duplicateVariable: Rule = {
  id: 'duplicate-variable',
  severity: 'error',
  run: (ctx, emit) => {
    const seen = new Set<string>();
    for (const variable of ctx.variables) {
      if (!seen.has(variable.name)) {
        seen.add(variable.name);
        continue;
      }
      emit({
        id: 'duplicate-variable',
        severity: 'error',
        path: `${variable.path}.name`,
        message:
          `Template variable "${variable.name}" is declared twice. Grafana keeps the last ` +
          'declaration and silently drops the first.',
        hint: 'Rename or delete one of them — variable names must be unique within a dashboard.',
      });
    }
  },
};

/* ── 6. schema-version-old ───────────────────────────────────────────────── */

/** panels moved out of `rows` into a top-level `panels` array. */
const SCHEMA_PANELS_MOVED = 16;
/** panel `datasource` became a `{ type, uid }` reference instead of a name. */
const SCHEMA_DATASOURCE_REF = 36;

const schemaVersionOld: Rule = {
  id: 'schema-version-old',
  severity: 'warning',
  run: (ctx, emit) => {
    const version = ctx.stats.schemaVersion;
    if (version === null) return;
    if (version < SCHEMA_PANELS_MOVED) {
      emit({
        id: 'schema-version-old',
        severity: 'error',
        path: 'schemaVersion',
        message:
          `"schemaVersion": ${version} is older than ${SCHEMA_PANELS_MOVED}, the version where ` +
          'panels moved out of "rows" into a top-level "panels" array.',
        hint:
          'Open this dashboard in Grafana 9 or newer and re-export it. Grafana migrates on load, ' +
          'but the JSON in your repository does not migrate itself — so a review of this file is a ' +
          'review of something Grafana will never render.',
      });
      return;
    }
    if (version < SCHEMA_DATASOURCE_REF) {
      emit({
        id: 'schema-version-old',
        severity: 'warning',
        path: 'schemaVersion',
        message:
          `"schemaVersion": ${version} is older than ${SCHEMA_DATASOURCE_REF}, the version where ` +
          'a panel\'s "datasource" became a { type, uid } reference instead of a name.',
        hint:
          'Re-export from Grafana 9 or newer so the JSON matches what your instance runs. ' +
          'Findings about datasource names below are the direct consequence.',
      });
    }
  },
};

/* ── 7. schema-version-unknown ───────────────────────────────────────────── */

const SCHEMA_UNKNOWN_HINT =
  `This linter is pinned to ${GRAFANA_RULES_VERSION}, and nothing is reported as an error on ` +
  'schema grounds alone.';

const schemaVersionUnknown: Rule = {
  id: 'schema-version-unknown',
  severity: 'info',
  run: (ctx, emit) => {
    const raw = ctx.dashboard.schemaVersion;
    let message: string | null = null;
    if (raw === undefined || raw === null) {
      message =
        'This dashboard has no "schemaVersion", so neither Grafana nor this linter can tell which ' +
        'migrations it still needs.';
    } else if (typeof raw === 'string') {
      message = `"schemaVersion" is the string "${raw}", but Grafana writes it as a number.`;
    } else if (typeof raw !== 'number' || !Number.isFinite(raw)) {
      message = '"schemaVersion" is not a number, but Grafana writes it as one.';
    } else if (raw > KNOWN_SCHEMA_VERSION) {
      message =
        `"schemaVersion": ${raw} is newer than ${KNOWN_SCHEMA_VERSION}, the newest schema this ` +
        'linter knows (Grafana 12). Treat the schema-specific findings below as advisory.';
    }
    if (message === null) return;
    // Never an error: an unknown schema is a limit of this linter, not a defect
    // in the dashboard.
    emit({
      id: 'schema-version-unknown',
      severity: 'info',
      path: 'schemaVersion',
      message,
      hint: SCHEMA_UNKNOWN_HINT,
    });
  },
};

/* ── 8. undefined-variable ───────────────────────────────────────────────── */

/** Group usages by name, preserving document order of both names and usages. */
function groupUsages(usages: VarUsage[], keep: (usage: VarUsage) => boolean): Map<string, VarUsage[]> {
  const grouped = new Map<string, VarUsage[]>();
  for (const usage of usages) {
    if (!keep(usage)) continue;
    const list = grouped.get(usage.name);
    if (list) list.push(usage);
    else grouped.set(usage.name, [usage]);
  }
  return grouped;
}

const undefinedVariable: Rule = {
  id: 'undefined-variable',
  severity: 'error',
  run: (ctx, emit) => {
    const grouped = groupUsages(
      ctx.usages,
      (usage) =>
        !isBuiltInVariable(usage.name) &&
        // `${DS_PROMETHEUS}` is an import placeholder, and `unresolved-ds-input`
        // owns it. Reporting it twice, under two names, would be noise.
        !isDatasourceInputName(usage.name) &&
        !ctx.definedNames.has(usage.name),
    );
    for (const [name, list] of grouped) {
      const first = list[0];
      const allRegexLike = list.every((usage) => usage.inRegexLike);
      const where =
        list.length === 1 ? 'is used here' : `is used in ${pluralPlaces(list.length)}`;
      emit({
        id: 'undefined-variable',
        severity: allRegexLike ? 'warning' : 'error',
        path: first.path,
        message:
          `"$${name}" ${where}, but no template variable named "${name}" is defined and it is ` +
          'not a Grafana built-in.',
        hint: allRegexLike
          ? 'This string looks like a regular expression, where "$" is also an end-of-line ' +
            'anchor — check whether a Grafana variable was meant at all.'
          : 'Add it under "templating.list", or fix the spelling. Grafana leaves an unknown ' +
            `variable in the query as literal text, so the query runs with "$${name}" still in it.`,
      });
    }
  },
};

/* ── 9. unused-variable ──────────────────────────────────────────────────── */

const unusedVariable: Rule = {
  id: 'unused-variable',
  severity: 'info',
  run: (ctx, emit) => {
    const repeated = new Set<string>();
    for (const node of ctx.panels) {
      const repeat = node.raw.repeat;
      if (typeof repeat !== 'string') continue;
      // `repeat` names its variable BARE. Normalised the same way
      // `repeat-undefined` normalises it, so the two rules cannot disagree.
      const name = repeat.trim().replace(/^\$\{?/, '').replace(/\}$/, '');
      if (name !== '') repeated.add(name);
    }
    for (const variable of ctx.variables) {
      // An ad-hoc filter variable can never be referenced by name: Grafana
      // injects its filters into every matching query automatically. "Never
      // referenced" would be true and the advice to delete it would be wrong.
      if (variable.type === 'adhoc') continue;
      if (repeated.has(variable.name)) continue;
      // A variable referenced only from inside its OWN definition is not used:
      // that is a self-referencing query, not a consumer.
      const used = ctx.usages.some(
        (usage) => usage.name === variable.name && !usage.path.startsWith(`${variable.path}.`),
      );
      if (used) continue;
      emit({
        id: 'unused-variable',
        severity: 'info',
        path: variable.path,
        message:
          `Template variable "${variable.name}" is defined but never referenced by any panel, ` +
          'query, title or annotation.',
        hint:
          'Delete it, or use it. A "query" variable nobody reads still runs its query on every ' +
          'dashboard load.',
      });
    }
  },
};

/* ── 10. legacy-var-syntax ───────────────────────────────────────────────── */

const legacyVarSyntax: Rule = {
  id: 'legacy-var-syntax',
  severity: 'warning',
  run: (ctx, emit) => {
    const grouped = groupUsages(ctx.usages, (usage) => usage.syntax === 'legacy');
    for (const [name, list] of grouped) {
      const tail = list.length === 1 ? '.' : `; it appears in ${pluralPlaces(list.length)}.`;
      emit({
        id: 'legacy-var-syntax',
        severity: 'warning',
        path: list[0].path,
        message: `"[[${name}]]" is the pre-Grafana 6 variable syntax${tail}`,
        hint:
          `Write "\${${name}}" instead. The braced form is the current one, and the only one that ` +
          'supports formats such as "${env:csv}".',
      });
    }
  },
};

/* ── 11. datasource-by-name ──────────────────────────────────────────────── */

const datasourceByName: Rule = {
  id: 'datasource-by-name',
  severity: 'warning',
  run: (ctx, emit) => {
    for (const ref of ctx.datasourceNames) {
      emit({
        id: 'datasource-by-name',
        severity: 'warning',
        path: ref.path,
        message:
          `The datasource is referenced by name, "${ref.name}". A name only resolves if a ` +
          'datasource with exactly that name exists on the target instance.',
        hint:
          'Replace it with a { "type": …, "uid": … } object, or with a datasource variable so the ' +
          `dashboard stays portable. Grafana has written the { type, uid } form since ` +
          `schemaVersion ${SCHEMA_DATASOURCE_REF}.`,
      });
    }
  },
};

/* ── 12. unresolved-ds-input ─────────────────────────────────────────────── */

const DS_INPUT_HINT_DECLARED =
  'Import this file through Dashboards → Import so Grafana can prompt for it, or replace every ' +
  '"${DS_…}" reference with a real { type, uid } before provisioning it — provisioning does not ' +
  'run the import dialog, which is what turns into "Datasource not found".';

const unresolvedDsInput: Rule = {
  id: 'unresolved-ds-input',
  severity: 'error',
  run: (ctx, emit) => {
    if (ctx.hasInputs) {
      ctx.inputNames.forEach((name, index) => {
        emit({
          id: 'unresolved-ds-input',
          severity: 'error',
          path: `__inputs[${index}]`,
          message:
            `"__inputs" declares "${name}", an import placeholder that only the Grafana import ` +
            'dialog fills in.',
          hint: DS_INPUT_HINT_DECLARED,
        });
      });
    }

    const declared = new Set(ctx.inputNames);
    const grouped = groupUsages(
      ctx.usages,
      (usage) => isDatasourceInputName(usage.name) && !declared.has(usage.name),
    );
    for (const [name, list] of grouped) {
      emit({
        id: 'unresolved-ds-input',
        severity: 'error',
        path: list[0].path,
        message:
          `"\${${name}}" is an import placeholder, but this file has no "__inputs" block that ` +
          `declares it — Grafana reports "Datasource \${${name}} not found".`,
        hint:
          'Replace it with the real { type, uid } of the datasource, or re-export the dashboard ' +
          'with "Export for sharing externally" so the "__inputs" block comes with it.',
      });
    }
  },
};

/* ── 13. empty-targets ───────────────────────────────────────────────────── */

/** Panel types that never issue a query, so an empty `targets` is correct. */
const NO_QUERY_PANEL_TYPES = new Set([
  'row',
  'text',
  'dashlist',
  'news',
  'alertlist',
  'annolist',
  'welcome',
  'gettingstarted',
  'add-panel',
]);

const emptyTargets: Rule = {
  id: 'empty-targets',
  severity: 'warning',
  run: (ctx, emit) => {
    for (const node of ctx.panels) {
      if (node.isRow) continue;
      if (node.type !== null && NO_QUERY_PANEL_TYPES.has(node.type)) continue;
      // A library panel keeps its queries in the library, not in this file.
      if (isPlainObject(node.raw.libraryPanel)) continue;
      const targets = node.raw.targets;
      if (Array.isArray(targets) && targets.length > 0) continue;
      emit({
        id: 'empty-targets',
        severity: 'warning',
        path: `${node.path}.targets`,
        panelTitle: panelTitleOf(node),
        message: `The panel ${panelRef(node)} has no queries, so it renders as an empty panel.`,
        hint:
          'Add a query under "targets", or delete the panel. Panel types that never query — row, ' +
          'text, dashlist, news, alertlist, annolist — are not reported, and neither are library ' +
          'panels.',
      });
    }
  },
};

/* ── 14. deprecated-panel-type ───────────────────────────────────────────── */

/**
 * Core panel types with a core replacement. Kept DISJOINT from
 * `ANGULAR_PANEL_PLUGINS` so a `graph` panel produces one finding, not two —
 * these four were Angular as well, which the shared hint says.
 */
const DEPRECATED_PANEL_TYPES: Record<string, { replacement: string; since: number }> = {
  graph: { replacement: 'timeseries', since: 8 },
  'table-old': { replacement: 'table', since: 7 },
  singlestat: { replacement: 'stat', since: 7 },
  'grafana-singlestat-panel': { replacement: 'stat', since: 7 },
};

const DEPRECATED_PANEL_HINT =
  'Grafana 9–12 migrates it when the dashboard loads, so what you review here is not what you ' +
  'will see. Re-save from Grafana 9 or newer to write the migration into the JSON — the original ' +
  'Angular implementation no longer exists in Grafana 11–12.';

const deprecatedPanelType: Rule = {
  id: 'deprecated-panel-type',
  severity: 'warning',
  run: (ctx, emit) => {
    for (const node of ctx.panels) {
      if (node.type === null) continue;
      const replacement = DEPRECATED_PANEL_TYPES[node.type];
      if (!replacement) continue;
      emit({
        id: 'deprecated-panel-type',
        severity: 'warning',
        path: `${node.path}.type`,
        panelTitle: panelTitleOf(node),
        message:
          `The panel ${panelRef(node)} uses the "${node.type}" panel type, replaced by ` +
          `"${replacement.replacement}" in Grafana ${replacement.since}.`,
        hint: DEPRECATED_PANEL_HINT,
      });
    }
  },
};

/* ── 15. angular-panel ───────────────────────────────────────────────────── */

/**
 * AngularJS panel PLUGINS. `null` means there is no single core equivalent worth
 * naming — better a generic hint than a confidently wrong recommendation.
 * `grafana-clock-panel` is deliberately absent: current releases of it are React.
 */
const ANGULAR_PANEL_PLUGINS: Record<string, string | null> = {
  'grafana-piechart-panel': 'piechart',
  'grafana-worldmap-panel': 'geomap',
  'natel-discrete-panel': 'state-timeline',
  'briangann-datatable-panel': 'table',
  'flant-statusmap-panel': 'status-history',
  'mtanda-histogram-panel': 'histogram',
  'pr0ps-trackmap-panel': 'geomap',
  'blackmirror1-singlestat-math-panel': 'stat',
  'grafana-polystat-panel': null,
  'jdbranham-diagram-panel': null,
  'vonage-status-panel': null,
  'michaeldmoore-annunciator-panel': null,
  'snuids-trafficlights-panel': null,
  'petrslavotinek-carpetplot-panel': null,
  'digiapulssi-breadcrumb-panel': null,
  'ryantxu-ajax-panel': null,
  'bessler-pictureit-panel': null,
  'neocat-cal-heatmap-panel': null,
};

const angularPanel: Rule = {
  id: 'angular-panel',
  severity: 'error',
  run: (ctx, emit) => {
    for (const node of ctx.panels) {
      if (node.type === null) continue;
      if (!(node.type in ANGULAR_PANEL_PLUGINS)) continue;
      const replacement = ANGULAR_PANEL_PLUGINS[node.type];
      emit({
        id: 'angular-panel',
        severity: 'error',
        path: `${node.path}.type`,
        panelTitle: panelTitleOf(node),
        message:
          `The panel ${panelRef(node)} uses "${node.type}", an AngularJS plugin. Angular support ` +
          'was deprecated in Grafana 9 and removed in Grafana 11–12.',
        hint:
          (replacement
            ? `Replace it with the core "${replacement}" panel.`
            : 'Replace it with a core panel.') +
          ' There is no automatic migration for Angular plugins, so the panel renders nothing on ' +
          'a current Grafana.',
      });
    }
  },
};

/* ── 16. repeat-undefined ────────────────────────────────────────────────── */

const repeatUndefined: Rule = {
  id: 'repeat-undefined',
  severity: 'error',
  run: (ctx, emit) => {
    for (const node of ctx.panels) {
      const repeat = node.raw.repeat;
      if (typeof repeat !== 'string' || repeat.trim() === '') continue;
      // Some exports write the reference form; both mean the same variable.
      const name = repeat.trim().replace(/^\$\{?/, '').replace(/\}$/, '');
      if (name === '' || ctx.definedNames.has(name)) continue;
      emit({
        id: 'repeat-undefined',
        severity: 'error',
        path: `${node.path}.repeat`,
        panelTitle: panelTitleOf(node),
        message:
          `The ${node.isRow ? 'row' : 'panel'} ${panelRef(node)} repeats over "${name}", but no ` +
          `template variable named "${name}" is defined.`,
        hint:
          'Define it under "templating.list", or remove "repeat" — Grafana renders a single panel ' +
          'and reports nothing.',
      });
    }
  },
};

/* ── 17. time-range-absurd ───────────────────────────────────────────────── */

const UNIT_MS: Record<string, number> = {
  s: 1_000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
  w: 604_800_000,
  M: 2_592_000_000,
  Q: 7_776_000_000,
  y: 31_536_000_000,
};

/** 366 days: "longer than a year" is a claim we can make without rounding. */
const LONG_RANGE_SECONDS = 366 * 86_400;

/**
 * Grafana's date-math grammar. The trailing `/unit` is a ROUNDING suffix, and
 * the fiscal units `fy` (fiscal year) and `fQ` (fiscal quarter) are part of it —
 * `now/fy` is a range Grafana's own time picker offers.
 */
const NOW_RE = /^now(?:([+-])(\d+)([smhdwMQy]))?(?:\/(fy|fQ|[smhdwMQy]))?$/;

/**
 * Apply Grafana's `/unit` rounding. Grafana floors the `from` bound to the start
 * of the period and ceils the `to` bound to its END (documented behaviour), which
 * is why "now/d" to "now/d" means "today", not one instant. Rounding in UTC is
 * deliberate: the dashboard timezone is unknowable here and only the LENGTH of
 * the range matters to this rule.
 */
function roundBound(ms: number, unit: string, bound: 'from' | 'to'): number {
  const d = new Date(ms);
  switch (unit) {
    case 's':
      d.setUTCMilliseconds(0);
      break;
    case 'm':
      d.setUTCSeconds(0, 0);
      break;
    case 'h':
      d.setUTCMinutes(0, 0, 0);
      break;
    case 'd':
      d.setUTCHours(0, 0, 0, 0);
      break;
    case 'w': {
      d.setUTCHours(0, 0, 0, 0);
      // Grafana's week starts on Monday by default.
      d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
      break;
    }
    case 'M':
      d.setUTCHours(0, 0, 0, 0);
      d.setUTCDate(1);
      break;
    case 'Q':
    case 'fQ':
      d.setUTCHours(0, 0, 0, 0);
      d.setUTCDate(1);
      d.setUTCMonth(Math.floor(d.getUTCMonth() / 3) * 3);
      break;
    case 'y':
    case 'fy':
      d.setUTCHours(0, 0, 0, 0);
      d.setUTCMonth(0, 1);
      break;
    default:
      return ms;
  }
  const floored = d.getTime();
  if (bound === 'from') return floored;
  // The end of the period: the start of the next one, minus a millisecond.
  const next = new Date(floored);
  switch (unit) {
    case 's':
      next.setUTCSeconds(next.getUTCSeconds() + 1);
      break;
    case 'm':
      next.setUTCMinutes(next.getUTCMinutes() + 1);
      break;
    case 'h':
      next.setUTCHours(next.getUTCHours() + 1);
      break;
    case 'd':
      next.setUTCDate(next.getUTCDate() + 1);
      break;
    case 'w':
      next.setUTCDate(next.getUTCDate() + 7);
      break;
    case 'M':
      next.setUTCMonth(next.getUTCMonth() + 1);
      break;
    case 'Q':
    case 'fQ':
      next.setUTCMonth(next.getUTCMonth() + 3);
      break;
    default:
      next.setUTCFullYear(next.getUTCFullYear() + 1);
      break;
  }
  return next.getTime() - 1;
}

/**
 * Resolve a Grafana time expression to seconds on one shared axis, so relative
 * and absolute bounds can be compared with each other. `now` is a single
 * reference read once per call, never per bound. `bound` decides which way a
 * `/unit` rounding suffix goes.
 */
function resolveTime(value: unknown, nowMs: number, bound: 'from' | 'to'): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value / 1000;
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (text === '') return null;
  const relative = NOW_RE.exec(text);
  if (relative) {
    let ms = nowMs;
    if (relative[1]) {
      const unit = UNIT_MS[relative[3]];
      if (unit === undefined) return null;
      const offset = Number(relative[2]) * unit;
      ms = relative[1] === '-' ? ms - offset : ms + offset;
    }
    if (relative[4]) ms = roundBound(ms, relative[4], bound);
    return ms / 1000;
  }
  if (/^-?\d+$/.test(text)) return Number(text) / 1000;
  const parsed = Date.parse(text);
  return Number.isNaN(parsed) ? null : parsed / 1000;
}

function timeText(value: unknown): string {
  return typeof value === 'string' ? value : String(value);
}

const timeRangeAbsurd: Rule = {
  id: 'time-range-absurd',
  severity: 'warning',
  run: (ctx, emit) => {
    const time = ctx.dashboard.time;
    if (!isPlainObject(time)) return;
    const { from, to } = time;
    if (from === undefined || to === undefined || from === null || to === null) return;

    const nowMs = Date.now();
    const fromSeconds = resolveTime(from, nowMs, 'from');
    const toSeconds = resolveTime(to, nowMs, 'to');
    const fromLabel = timeText(from);
    const toLabel = timeText(to);

    const report = (message: string, hint: string): void => {
      emit({ id: 'time-range-absurd', severity: 'warning', path: 'time', message, hint });
    };

    if (fromSeconds === null || toSeconds === null) {
      report(
        `The default time range "${fromLabel}" to "${toLabel}" is not a time Grafana can parse.`,
        'Use a relative expression such as "now-6h", or an absolute ISO 8601 timestamp.',
      );
      return;
    }
    if (fromSeconds > toSeconds) {
      report(
        `The default time range runs backwards: "${fromLabel}" to "${toLabel}". Grafana shows an ` +
          'empty dashboard.',
        'Swap "from" and "to".',
      );
      return;
    }
    if (fromSeconds === toSeconds) {
      report(
        `The default time range "${fromLabel}" to "${toLabel}" has zero length.`,
        'Set a range with some width — Grafana\'s own default is "now-6h" to "now".',
      );
      return;
    }
    if (toSeconds - fromSeconds > LONG_RANGE_SECONDS) {
      report(
        `The default time range is "${fromLabel}" to "${toLabel}", longer than a year. Every ` +
          'panel runs that query the moment the dashboard opens.',
        'Save a shorter default — Grafana\'s own is "now-6h" — and let people widen it themselves.',
      );
    }
  },
};

/* ── 18. refresh-aggressive ──────────────────────────────────────────────── */

/** Below this the queries queue faster than they finish. */
const MIN_REFRESH_SECONDS = 10;

const refreshAggressive: Rule = {
  id: 'refresh-aggressive',
  severity: 'warning',
  run: (ctx, emit) => {
    const refresh = ctx.dashboard.refresh;
    if (typeof refresh !== 'string' || refresh.trim() === '') return;
    const match = /^(\d+)([smh])$/.exec(refresh.trim());
    // An interval this linter cannot parse is left alone: guessing what
    // "1m30s" means would be guessing.
    if (!match) return;
    const seconds = (Number(match[1]) * UNIT_MS[match[2]]) / 1000;
    if (!Number.isFinite(seconds) || seconds >= MIN_REFRESH_SECONDS) return;
    emit({
      id: 'refresh-aggressive',
      severity: 'warning',
      path: 'refresh',
      message:
        `"refresh": "${refresh.trim()}" re-runs every query every ${seconds} ` +
        `${seconds === 1 ? 'second' : 'seconds'}, in every tab that has this dashboard open.`,
      hint:
        `${MIN_REFRESH_SECONDS}s is the shortest interval worth setting on a shared dashboard. ` +
        'Below that the queries queue, the datasource pays for it, and Grafana\'s own ' +
        'min_refresh_interval may override you anyway.',
    });
  },
};

/* ── 19. override-suspect ────────────────────────────────────────────────── */

/** Matchers that select nothing without a value in `options`. */
const MATCHERS_NEEDING_OPTIONS = new Set([
  'byName',
  'byNames',
  'byRegexp',
  'byType',
  'byFrameRefID',
  'byValue',
]);

const OVERRIDE_HINT =
  'Give the override something to match and something to set, or delete it. Grafana keeps it in ' +
  'the JSON and applies nothing.';

const overrideSuspect: Rule = {
  id: 'override-suspect',
  severity: 'info',
  run: (ctx, emit) => {
    for (const node of ctx.panels) {
      const fieldConfig = node.raw.fieldConfig;
      if (!isPlainObject(fieldConfig)) continue;
      const overrides = fieldConfig.overrides;
      if (!Array.isArray(overrides)) continue;
      for (let i = 0; i < overrides.length; i += 1) {
        const override = overrides[i];
        const path = `${node.path}.fieldConfig.overrides[${i}]`;
        const label = `Override ${i + 1} on the panel ${panelRef(node)}`;
        const report = (message: string): void => {
          emit({
            id: 'override-suspect',
            severity: 'info',
            path,
            panelTitle: panelTitleOf(node),
            message,
            hint: OVERRIDE_HINT,
          });
        };
        if (!isPlainObject(override)) {
          report(`${label} is not an object.`);
          continue;
        }
        const matcher = override.matcher;
        const matcherId =
          isPlainObject(matcher) && typeof matcher.id === 'string' && matcher.id !== ''
            ? matcher.id
            : null;
        if (matcherId === null) {
          report(`${label} has no matcher, so it selects nothing.`);
          continue;
        }
        const options = isPlainObject(matcher) ? matcher.options : undefined;
        const hasOptions =
          options !== undefined &&
          options !== null &&
          options !== '' &&
          !(Array.isArray(options) && options.length === 0);
        if (MATCHERS_NEEDING_OPTIONS.has(matcherId) && !hasOptions) {
          report(`${label} matches nothing: its "${matcherId}" matcher has no value.`);
          continue;
        }
        const properties = override.properties;
        if (!Array.isArray(properties) || properties.length === 0) {
          report(`${label} sets no properties.`);
        }
      }
    }
  },
};

/* ── 20. empty-row ───────────────────────────────────────────────────────── */

const emptyRow: Rule = {
  id: 'empty-row',
  severity: 'info',
  run: (ctx, emit) => {
    for (const node of ctx.panels) {
      if (!node.isRow) continue;
      if (node.childCount > 0) continue;
      const title = node.title.trim();
      emit({
        id: 'empty-row',
        severity: 'info',
        path: node.path,
        panelTitle: panelTitleOf(node),
        message:
          title !== ''
            ? `The row "${node.title}" contains no panels.`
            : `The row at ${node.path} contains no panels.`,
        hint:
          'Delete the row, or move panels into it. A collapsed empty row is invisible until ' +
          'someone expands it and finds nothing.',
      });
    }
  },
};

/* ── 21. panel-no-type ───────────────────────────────────────────────────── */

const panelNoType: Rule = {
  id: 'panel-no-type',
  severity: 'error',
  run: (ctx, emit) => {
    for (const node of ctx.panels) {
      if (node.isRow || node.type !== null) continue;
      // Grafana's save model reduces a library panel to {id, title, gridPos,
      // libraryPanel} — the type lives in the library, not in this file. Same
      // guard `empty-targets` already carries.
      if (isPlainObject(node.raw.libraryPanel)) continue;
      emit({
        id: 'panel-no-type',
        severity: 'error',
        path: `${node.path}.type`,
        panelTitle: panelTitleOf(node),
        message:
          `The panel ${panelRef(node)} has no "type", so Grafana has nothing to render it with ` +
          'and draws an empty box.',
        hint:
          'Add "type" — "timeseries", "stat", "table" and so on. Library panels are the one ' +
          'exception, and they are not reported.',
      });
    }
  },
};

/* ── 22. panel-zero-size ─────────────────────────────────────────────────── */

const GRID_HINT =
  'The grid is 24 columns wide: give it a width between 1 and 24 and a height of at least 1.';

function dimensionText(value: unknown): string {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (value === undefined) return 'missing';
  return JSON.stringify(value) ?? 'missing';
}

const panelZeroSize: Rule = {
  id: 'panel-zero-size',
  severity: 'warning',
  run: (ctx, emit) => {
    for (const node of ctx.panels) {
      // Rows are sized by Grafana, and pre-schemaVersion-16 layouts used `span`
      // rather than `gridPos` — see the DELIBERATELY SILENT block.
      if (node.isRow || node.path.startsWith('rows[')) continue;
      const gridPos = node.raw.gridPos;
      if (!isPlainObject(gridPos)) {
        emit({
          id: 'panel-zero-size',
          severity: 'warning',
          path: `${node.path}.gridPos`,
          panelTitle: panelTitleOf(node),
          message:
            `The panel ${panelRef(node)} has no "gridPos", so Grafana falls back to a default ` +
            'position and panels can land on top of each other.',
          hint: GRID_HINT,
        });
        continue;
      }
      const width = gridPos.w;
      const height = gridPos.h;
      const widthOk = typeof width === 'number' && Number.isFinite(width) && width > 0;
      const heightOk = typeof height === 'number' && Number.isFinite(height) && height > 0;
      if (widthOk && heightOk) continue;
      emit({
        id: 'panel-zero-size',
        severity: 'warning',
        path: `${node.path}.gridPos`,
        panelTitle: panelTitleOf(node),
        message:
          `The panel ${panelRef(node)} has "gridPos" width ${dimensionText(width)} and height ` +
          `${dimensionText(height)}, so it is invisible.`,
        hint: GRID_HINT,
      });
    }
  },
};

/* ── the catalog ─────────────────────────────────────────────────────────── */

/** Every rule, in catalog order — the same order as `RULE_IDS`. */
export const RULES: readonly Rule[] = [
  noUid,
  rootIdSet,
  emptyTitle,
  duplicatePanelId,
  duplicateVariable,
  schemaVersionOld,
  schemaVersionUnknown,
  undefinedVariable,
  unusedVariable,
  legacyVarSyntax,
  datasourceByName,
  unresolvedDsInput,
  emptyTargets,
  deprecatedPanelType,
  angularPanel,
  repeatUndefined,
  timeRangeAbsurd,
  refreshAggressive,
  overrideSuspect,
  emptyRow,
  panelNoType,
  panelZeroSize,
];

/** Advertised severity per rule id — the page's catalog table reads this. */
export const RULE_SEVERITY: Record<RuleId, Severity> = RULES.reduce(
  (acc, rule) => {
    acc[rule.id] = rule.severity;
    return acc;
  },
  {} as Record<RuleId, Severity>,
);

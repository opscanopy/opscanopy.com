/**
 * Grafana Dashboard Validator — engine vectors.
 *
 * Written BEFORE the engine (TDD), and every diagnostic wording below is pinned
 * byte-for-byte: the playground renders these strings, the E2E fixture pins one
 * of them, and five locale pages quote the summary format. A reworded message is
 * a breaking change and this file is what makes that visible.
 *
 * Structure:
 *   1. public API surface (version constant, rule catalog, never-throws shape)
 *   2. the nine parser edge cases from the plan
 *   3. a CLEAN baseline that must produce ZERO diagnostics — which is the
 *      "does not fire" case for all twenty-two rules at once — then one firing
 *      case per rule, plus the targeted negatives that are easy to regress
 *      (`$1` in a regex, `-- Mixed --`, an EXPANDED row, a text panel with no
 *      queries, `$__rate_interval`, an Angular-plugin panel with a core
 *      replacement…)
 *   4. the three realistic fixtures (clean v41 / legacy v27 / __inputs export)
 *   5. caps, the 500-panel performance budget, and a hostile-input table that
 *      proves `lintDashboard` never throws
 */
import { describe, expect, it } from 'vitest';
import {
  GRAFANA_RULES_VERSION,
  KNOWN_SCHEMA_VERSION,
  MAX_DIAGNOSTICS_PER_RULE,
  MAX_INPUT_CHARS,
  RULE_IDS,
  lintDashboard,
  summaryLine,
  type Diagnostic,
  type LintResult,
  type RuleId,
} from './engine';
import { examples } from './examples';

/* ── helpers ──────────────────────────────────────────────────────────────── */

type Json = Record<string, unknown>;

function lint(value: unknown): LintResult {
  return lintDashboard(JSON.stringify(value));
}

function ids(result: LintResult): RuleId[] {
  return result.diagnostics.map((d) => d.id);
}

function one(result: LintResult, id: RuleId): Diagnostic {
  const hits = result.diagnostics.filter((d) => d.id === id);
  expect(hits.length, `expected exactly one ${id} diagnostic, got ${hits.length}`).toBe(1);
  return hits[0];
}

function all(result: LintResult, id: RuleId): Diagnostic[] {
  return result.diagnostics.filter((d) => d.id === id);
}

/**
 * A dashboard with nothing wrong: uid set, id null, titled, schemaVersion 41,
 * one typed panel with a { type, uid } datasource, a real gridPos and a query,
 * a sane time range and refresh. Every rule must be silent on it — that is the
 * negative case for all twenty-two at once.
 */
function clean(): Json {
  return {
    uid: 'ops-clean',
    id: null,
    title: 'Clean',
    schemaVersion: 41,
    time: { from: 'now-6h', to: 'now' },
    refresh: '1m',
    templating: { list: [] },
    panels: [
      {
        id: 1,
        type: 'timeseries',
        title: 'Requests',
        datasource: { type: 'prometheus', uid: 'prom-main' },
        gridPos: { h: 8, w: 12, x: 0, y: 0 },
        targets: [{ refId: 'A', expr: 'sum(rate(http_requests_total[$__rate_interval]))' }],
      },
    ],
  };
}

/** `clean()` with one mutation applied — the shape every positive case uses. */
function mutated(mutate: (d: Json) => void): Json {
  const dashboard = clean();
  mutate(dashboard);
  return dashboard;
}

function firstPanel(dashboard: Json): Json {
  return (dashboard.panels as Json[])[0];
}

/* ── 1. public API ────────────────────────────────────────────────────────── */

describe('public API', () => {
  it('pins the rules version, which the page renders verbatim', () => {
    expect(GRAFANA_RULES_VERSION).toBe('grafana-12 / schemaVersion 41');
    expect(KNOWN_SCHEMA_VERSION).toBe(41);
  });

  it('exposes the whole rule catalog, in catalog order, with no duplicates', () => {
    // The plan's prose says "21 rules total" but NAMES twenty-two (its
    // "19 original" is a miscount of a twenty-item list). Every named rule is
    // implemented rather than one being silently dropped, so this is the real
    // count and the page derives its own copy from RULE_IDS.length.
    expect(RULE_IDS).toHaveLength(22);
    expect(new Set(RULE_IDS).size).toBe(22);
    expect(RULE_IDS[0]).toBe('no-uid');
    expect(RULE_IDS).toContain('panel-no-type');
    expect(RULE_IDS).toContain('panel-zero-size');
  });

  it('returns a fully-formed result for empty input instead of throwing', () => {
    const result = lintDashboard('');
    expect(result.ok).toBe(false);
    expect(result.error).toBe('Paste a Grafana dashboard JSON to lint.');
    expect(result.diagnostics).toEqual([]);
    expect(result.parseNotes).toEqual([]);
    expect(result.summary).toEqual({ errors: 0, warnings: 0, infos: 0 });
    expect(result.rulesVersion).toBe(GRAFANA_RULES_VERSION);
  });

  it('caps the input it will scan, and says the real size', () => {
    const oversize = 'x'.repeat(MAX_INPUT_CHARS + 1);
    const result = lintDashboard(oversize);
    expect(result.ok).toBe(false);
    expect(result.error).toBe(
      'This input is 5,000,001 characters — larger than the 5,000,000-character limit this ' +
        'linter scans. Paste the dashboard JSON on its own.',
    );
  });
});

/* ── 2. the nine parser edge cases ────────────────────────────────────────── */

describe('parser', () => {
  it('1. reports invalid JSON with a line and a column, in its own stable wording', () => {
    const result = lintDashboard('{\n  "title": "Ops"\n  "uid": "x"\n}');
    expect(result.ok).toBe(false);
    // Not a V8 message: those get reworded between Node releases.
    expect(result.error).toBe('Invalid JSON at line 3, column 3 — a "," or "}" was expected here.');
  });

  it('1b. names an unterminated string, and a top-level string that parses', () => {
    expect(lintDashboard('"panels').error).toBe(
      'Invalid JSON at line 1, column 1 — a string is opened here but never closed.',
    );
    // The E2E fixture's pinned calm error: valid JSON, wrong shape.
    expect(lintDashboard('"panels"').error).toBe(
      'This JSON is a string, not an object — paste the dashboard JSON itself, starting with "{".',
    );
  });

  it('1c. distinguishes the other non-object top levels', () => {
    expect(lintDashboard('[1, 2, 3]').error).toBe(
      'This JSON is an array, not an object — a Grafana dashboard is a single JSON object. If ' +
        'you exported a list of dashboards, paste one of them.',
    );
    expect(lintDashboard('42').error).toBe(
      'This JSON is a number, not an object — paste the dashboard JSON itself, starting with "{".',
    );
    expect(lintDashboard('null').error).toBe(
      'This JSON is null, not an object — paste the dashboard JSON itself, starting with "{".',
    );
  });

  it('2. strips a byte-order mark and says so', () => {
    const result = lintDashboard('\uFEFF' + JSON.stringify(clean()));
    expect(result.ok).toBe(true);
    expect(result.parseNotes).toContain('A byte-order mark was removed before parsing.');
    expect(result.diagnostics).toEqual([]);
  });

  it('3. re-parses leniently past trailing commas and comments, and names both', () => {
    const text = [
      '{',
      '  // the dashboard people actually paste',
      '  "uid": "ops-clean",',
      '  "id": null,',
      '  "title": "Clean",',
      '  /* block comments too */',
      '  "schemaVersion": 41,',
      '  "time": { "from": "now-6h", "to": "now" },',
      '  "refresh": "1m",',
      '  "templating": { "list": [] },',
      '  "panels": [],',
      '}',
    ].join('\n');
    const result = lintDashboard(text);
    expect(result.ok).toBe(true);
    expect(result.parseNotes).toContain(
      'Comments (// and /* */) were removed before parsing. JSON has no comments and Grafana ' +
        'rejects them.',
    );
    expect(result.parseNotes).toContain(
      'Trailing commas were removed before parsing. Grafana rejects them.',
    );
  });

  it('4. detects typographic quotes and says where they came from', () => {
    const result = lintDashboard('{ “uid”: “ops” }');
    expect(result.ok).toBe(false);
    expect(result.error).toBe(
      'This text contains typographic quotes (“ ” ‘ ’) where JSON needs ' +
        'plain double quotes — it was probably copied out of a document or a chat window. Copy ' +
        'it again from a plain-text view, or from Grafana’s Dashboard settings → JSON Model.',
    );
  });

  // Regression: the smart-quote check ran on the WHOLE document before the
  // lenient re-parse, so any parse failure in a file containing a curly
  // apostrophe — ordinary in a title, a description or text-panel markdown —
  // was refused as a typographic-quote problem and the recovery never ran.
  it('4b. does not blame typographic quotes for a fault somewhere else', () => {
    const withComment = lintDashboard(
      '{\n // note\n "title":"Bob’s","schemaVersion":41,"panels":[]\n}',
    );
    expect(withComment.ok).toBe(true);
    expect(withComment.parseNotes).toContain(
      'Comments (// and /* */) were removed before parsing. JSON has no comments and ' +
        'Grafana rejects them.',
    );

    const trailingComma = lintDashboard(
      '{"title":"Bob’s board","schemaVersion":41,"panels":[],}',
    );
    expect(trailingComma.ok).toBe(true);
    expect(trailingComma.parseNotes).toContain(
      'Trailing commas were removed before parsing. Grafana rejects them.',
    );

    const truncated = lintDashboard('{"title":"l’API","schemaVersion":41,"panels":[{"type":"stat"');
    expect(truncated.ok).toBe(false);
    expect(truncated.error).toBe(
      'Invalid JSON at line 1, column 61 — the JSON ends before it is complete.',
    );
  });

  it('5. unwraps a { dashboard: … } API response', () => {
    const result = lintDashboard(
      JSON.stringify({ meta: { slug: 'clean' }, dashboard: clean() }),
    );
    expect(result.ok).toBe(true);
    expect(result.parseNotes).toContain(
      'The "dashboard" property of a Grafana API response was unwrapped before linting.',
    );
    expect(result.diagnostics).toEqual([]);
  });

  it('6. lints an export-for-sharing root rather than rejecting it', () => {
    const dashboard = mutated((d) => {
      d.__inputs = [
        {
          name: 'DS_PROMETHEUS',
          label: 'Prometheus',
          type: 'datasource',
          pluginId: 'prometheus',
          pluginName: 'Prometheus',
        },
      ];
    });
    const result = lint(dashboard);
    expect(result.ok).toBe(true);
    expect(one(result, 'unresolved-ds-input').message).toBe(
      '"__inputs" declares "DS_PROMETHEUS", an import placeholder that only the Grafana import ' +
        'dialog fills in.',
    );
    expect(one(result, 'unresolved-ds-input').path).toBe('__inputs[0]');
  });

  it('7. recognises provisioning YAML textually and redirects the paste', () => {
    const yaml = [
      'apiVersion: 1',
      'providers:',
      '  - name: default',
      '    folder: ""',
      '    type: file',
      '    options:',
      '      path: /var/lib/grafana/dashboards',
    ].join('\n');
    const result = lintDashboard(yaml);
    expect(result.ok).toBe(false);
    expect(result.error).toBe(
      'This looks like a Grafana provisioning YAML file, not dashboard JSON. Paste the dashboard ' +
        'JSON itself — in Grafana it is under Dashboard settings → JSON Model.',
    );
  });

  it('8. unwraps an escaped-string dashboard exactly once', () => {
    const result = lintDashboard(JSON.stringify(JSON.stringify(clean())));
    expect(result.ok).toBe(true);
    expect(result.parseNotes).toContain(
      'This file is a JSON string containing dashboard JSON; it was unwrapped once before linting.',
    );
    expect(result.diagnostics).toEqual([]);
    // Twice-wrapped is NOT unwrapped twice — one level is a known export
      // accident, two is a different file.
    const twice = lintDashboard(JSON.stringify(JSON.stringify(JSON.stringify(clean()))));
    expect(twice.ok).toBe(false);
  });

  it('9. skips panel entries that are not objects, and says which', () => {
    const dashboard = mutated((d) => {
      (d.panels as unknown[]).push(null, 7);
    });
    const result = lint(dashboard);
    expect(result.ok).toBe(true);
    expect(result.parseNotes).toContain('panels[1] is not an object, so it was skipped.');
    expect(result.parseNotes).toContain('panels[2] is not an object, so it was skipped.');
    expect(result.stats.panels).toBe(1);
  });

  it('notes an object with none of the usual dashboard keys, and still lints it', () => {
    const result = lintDashboard('{"hello":"world"}');
    expect(result.ok).toBe(true);
    expect(result.parseNotes).toContain(
      'None of the usual dashboard keys (panels, rows, templating, schemaVersion, title) are ' +
        'present, so this may not be a dashboard at all.',
    );
  });
});

/* ── 3. the rules ─────────────────────────────────────────────────────────── */

describe('the clean baseline', () => {
  it('produces zero diagnostics — the negative case for all 22 rules at once', () => {
    const result = lint(clean());
    expect(result.ok).toBe(true);
    expect(result.diagnostics).toEqual([]);
    expect(result.parseNotes).toEqual([]);
    expect(result.stats).toEqual({
      schemaVersion: 41,
      panels: 1,
      rows: 0,
      varsDefined: 0,
      varsUsed: 0,
      varsUnresolved: 0,
    });
    expect(summaryLine(result)).toBe(
      'No problems found in 1 panel — variables: 0 defined, schemaVersion 41',
    );
  });
});

describe('rule: no-uid', () => {
  it('fires when the uid is missing', () => {
    const result = lint(mutated((d) => delete d.uid));
    const d = one(result, 'no-uid');
    expect(d.severity).toBe('warning');
    expect(d.path).toBe('uid');
    expect(d.message).toBe(
      'This dashboard has no "uid", so every import creates a new dashboard instead of updating ' +
        'the one you already have.',
    );
    expect(d.hint).toBe(
      'Set a stable "uid" of up to 40 characters (letters, digits, "-" and "_") and keep it in ' +
        'version control.',
    );
  });

  it('fires, with its own wording, when the uid is an empty string', () => {
    expect(one(lint(mutated((d) => (d.uid = ''))), 'no-uid').message).toBe(
      'The "uid" is empty, so every import creates a new dashboard instead of updating the one ' +
        'you already have.',
    );
  });
});

describe('rule: root-id-set', () => {
  it('fires on a numeric root id and quotes it', () => {
    const d = one(lint(mutated((x) => (x.id = 42))), 'root-id-set');
    expect(d.severity).toBe('warning');
    expect(d.path).toBe('id');
    expect(d.message).toBe(
      'The root "id" is 42 — a database row id from the Grafana instance this JSON came from.',
    );
  });

  it('stays silent on id: null, which is what an export should carry', () => {
    expect(ids(lint(mutated((d) => (d.id = null))))).toEqual([]);
  });
});

describe('rule: empty-title', () => {
  it('fires on a missing title', () => {
    const d = one(lint(mutated((x) => delete x.title)), 'empty-title');
    expect(d.severity).toBe('warning');
    expect(d.message).toBe('This dashboard has no "title", so Grafana lists it as "New dashboard".');
  });

  it('fires on an empty title', () => {
    expect(one(lint(mutated((d) => (d.title = '   '))), 'empty-title').message).toBe(
      'The "title" is empty, so Grafana lists this dashboard as "New dashboard".',
    );
  });
});

describe('rule: duplicate-panel-id', () => {
  it('fires on the second panel and names the first', () => {
    const dashboard = mutated((d) => {
      (d.panels as Json[]).push({
        id: 1,
        type: 'stat',
        title: 'Errors',
        datasource: { type: 'prometheus', uid: 'prom-main' },
        gridPos: { h: 8, w: 12, x: 12, y: 0 },
        targets: [{ refId: 'A', expr: 'up' }],
      });
    });
    const d = one(lint(dashboard), 'duplicate-panel-id');
    expect(d.severity).toBe('error');
    expect(d.path).toBe('panels[1].id');
    expect(d.panelTitle).toBe('Errors');
    expect(d.message).toBe('Panel id 1 is already used by "Requests" (panels[0]).');
    expect(d.hint).toBe(
      'Renumber one of them. Ids only have to be unique inside the dashboard, and Grafana keys ' +
        'panel links, "View panel" URLs and repeats by id.',
    );
  });
});

describe('rule: duplicate-variable', () => {
  it('fires on the second declaration', () => {
    const dashboard = mutated((d) => {
      d.templating = {
        list: [
          { name: 'env', type: 'custom', query: 'prod,staging' },
          { name: 'env', type: 'custom', query: 'a,b' },
        ],
      };
      firstPanel(d).title = 'Requests $env';
    });
    const d = one(lint(dashboard), 'duplicate-variable');
    expect(d.severity).toBe('error');
    expect(d.path).toBe('templating.list[1].name');
    expect(d.message).toBe(
      'Template variable "env" is declared twice. Grafana keeps the last declaration and ' +
        'silently drops the first.',
    );
  });
});

describe('rule: schema-version-old', () => {
  it('is an error below 16, naming the rows-to-panels migration', () => {
    const d = one(lint(mutated((x) => (x.schemaVersion = 12))), 'schema-version-old');
    expect(d.severity).toBe('error');
    expect(d.path).toBe('schemaVersion');
    expect(d.message).toBe(
      '"schemaVersion": 12 is older than 16, the version where panels moved out of "rows" into a ' +
        'top-level "panels" array.',
    );
  });

  it('is a warning between 16 and 35, naming the datasource-reference change', () => {
    const d = one(lint(mutated((x) => (x.schemaVersion = 27))), 'schema-version-old');
    expect(d.severity).toBe('warning');
    expect(d.message).toBe(
      '"schemaVersion": 27 is older than 36, the version where a panel\'s "datasource" became a ' +
        '{ type, uid } reference instead of a name.',
    );
  });

  it('stays silent from 36 up to the pinned version', () => {
    expect(ids(lint(mutated((d) => (d.schemaVersion = 36))))).toEqual([]);
    expect(ids(lint(mutated((d) => (d.schemaVersion = 41))))).toEqual([]);
  });
});

describe('rule: schema-version-unknown', () => {
  it('is INFO for a schema newer than the pinned one — never an error', () => {
    const d = one(lint(mutated((x) => (x.schemaVersion = 45))), 'schema-version-unknown');
    expect(d.severity).toBe('info');
    expect(d.message).toBe(
      '"schemaVersion": 45 is newer than 41, the newest schema this linter knows (Grafana 12). ' +
        'Treat the schema-specific findings below as advisory.',
    );
    expect(d.hint).toBe(
      'This linter is pinned to grafana-12 / schemaVersion 41, and nothing is reported as an ' +
        'error on schema grounds alone.',
    );
  });

  it('is INFO when schemaVersion is missing', () => {
    const d = one(lint(mutated((x) => delete x.schemaVersion)), 'schema-version-unknown');
    expect(d.severity).toBe('info');
    expect(d.message).toBe(
      'This dashboard has no "schemaVersion", so neither Grafana nor this linter can tell which ' +
        'migrations it still needs.',
    );
  });

  it('is INFO when schemaVersion is a string', () => {
    const d = one(lint(mutated((x) => (x.schemaVersion = '39'))), 'schema-version-unknown');
    expect(d.severity).toBe('info');
    expect(d.message).toBe(
      '"schemaVersion" is the string "39", but Grafana writes it as a number.',
    );
  });
});

describe('rule: undefined-variable', () => {
  it('fires as an error, naming the variable and where it is used', () => {
    const dashboard = mutated((d) => {
      firstPanel(d).targets = [{ refId: 'A', expr: 'up{cluster="$cluster"}' }];
    });
    const d = one(lint(dashboard), 'undefined-variable');
    expect(d.severity).toBe('error');
    expect(d.path).toBe('panels[0].targets[0].expr');
    expect(d.message).toBe(
      '"$cluster" is used here, but no template variable named "cluster" is defined and it is ' +
        'not a Grafana built-in.',
    );
    expect(d.hint).toBe(
      'Add it under "templating.list", or fix the spelling. Grafana leaves an unknown variable in ' +
        'the query as literal text, so the query runs with "$cluster" still in it.',
    );
  });

  it('counts every use of the same name into one diagnostic', () => {
    const dashboard = mutated((d) => {
      firstPanel(d).title = '$cluster';
      firstPanel(d).description = 'for $cluster';
      firstPanel(d).targets = [{ refId: 'A', expr: 'up{cluster="$cluster"}' }];
    });
    const d = one(lint(dashboard), 'undefined-variable');
    expect(d.message).toBe(
      '"$cluster" is used in 3 places, but no template variable named "cluster" is defined and ' +
        'it is not a Grafana built-in.',
    );
    expect(d.path).toBe('panels[0].title');
  });

  it('accepts ${braced} and ${braced:format} forms', () => {
    const dashboard = mutated((d) => {
      d.templating = { list: [{ name: 'env', type: 'custom', query: 'prod' }] };
      firstPanel(d).targets = [{ refId: 'A', expr: 'up{env=~"${env:regex}", e="${env}"}' }];
    });
    expect(ids(lint(dashboard))).toEqual([]);
  });

  it('demotes to a warning when every use sits in a regex-looking string', () => {
    const dashboard = mutated((d) => {
      firstPanel(d).targets = [{ refId: 'A', expr: 'up{job=~"(?i)^prod-.*$env"}' }];
    });
    const d = one(lint(dashboard), 'undefined-variable');
    expect(d.severity).toBe('warning');
    expect(d.hint).toBe(
      'This string looks like a regular expression, where "$" is also an end-of-line anchor — ' +
        'check whether a Grafana variable was meant at all.',
    );
  });

  it('never reads $1 as a variable — that is a regex backreference', () => {
    const dashboard = mutated((d) => {
      firstPanel(d).targets = [{ refId: 'A', expr: 'label_replace(up, "x", "$1", "job", "(.*)")' }];
    });
    expect(ids(lint(dashboard))).toEqual([]);
  });

  it('treats Grafana built-ins, including unknown __names, as defined', () => {
    const dashboard = mutated((d) => {
      firstPanel(d).targets = [
        { refId: 'A', expr: 'rate(x[$__rate_interval]) + $__interval_ms + $__range_s' },
        { refId: 'B', expr: 'y{t="$__timeFilter", f="$__from", u="$__something_new"}' },
      ];
    });
    expect(ids(lint(dashboard))).toEqual([]);
  });
});

describe('rule: unused-variable', () => {
  it('fires as info and names the variable', () => {
    const dashboard = mutated((d) => {
      d.templating = { list: [{ name: 'region', type: 'custom', query: 'eu,us' }] };
    });
    const d = one(lint(dashboard), 'unused-variable');
    expect(d.severity).toBe('info');
    expect(d.path).toBe('templating.list[0]');
    expect(d.message).toBe(
      'Template variable "region" is defined but never referenced by any panel, query, title or ' +
        'annotation.',
    );
  });

  it('counts a use inside another variable’s query', () => {
    const dashboard = mutated((d) => {
      d.templating = {
        list: [
          { name: 'env', type: 'custom', query: 'prod,staging' },
          { name: 'host', type: 'query', query: 'label_values(up{env="$env"}, instance)' },
        ],
      };
      firstPanel(d).title = 'Host $host';
    });
    expect(ids(lint(dashboard))).toEqual([]);
  });

  // Regression: `repeat` names its variable BARE, so the `$…` usage index never
  // saw it and this rule told the reader to delete the variable that drives the
  // repeat — while `repeat-undefined` was simultaneously treating `repeat` as a
  // reference. The two rules disagreed.
  it('counts a panel "repeat" as a use, in both the bare and the ${…} form', () => {
    for (const repeat of ['server', '$server', '${server}']) {
      const dashboard = mutated((d) => {
        d.templating = {
          list: [{ name: 'server', type: 'query', query: 'label_values(up, instance)' }],
        };
        firstPanel(d).repeat = repeat;
      });
      expect(ids(lint(dashboard)), repeat).toEqual([]);
    }
  });

  // Regression: an adhoc filter variable is NEVER referenced by name — Grafana
  // injects its filters into matching queries — so every dashboard using ad-hoc
  // filters got "defined but never referenced … Delete it, or use it."
  it('never reports an adhoc variable, which is referenced by name nowhere', () => {
    const dashboard = mutated((d) => {
      d.templating = {
        list: [
          {
            name: 'filters',
            type: 'adhoc',
            datasource: { type: 'prometheus', uid: 'prom-main' },
            filters: [],
          },
        ],
      };
    });
    expect(ids(lint(dashboard))).toEqual([]);
  });
});

describe('rule: legacy-var-syntax', () => {
  it('fires on [[var]] and points at the braced form', () => {
    const dashboard = mutated((d) => {
      d.templating = { list: [{ name: 'env', type: 'custom', query: 'prod' }] };
      firstPanel(d).targets = [{ refId: 'A', expr: 'up{env="[[env]]"}' }];
    });
    const d = one(lint(dashboard), 'legacy-var-syntax');
    expect(d.severity).toBe('warning');
    expect(d.path).toBe('panels[0].targets[0].expr');
    expect(d.message).toBe('"[[env]]" is the pre-Grafana 6 variable syntax.');
    expect(d.hint).toBe(
      'Write "${env}" instead. The braced form is the current one, and the only one that ' +
        'supports formats such as "${env:csv}".',
    );
  });

  it('reports one diagnostic per name and counts the places', () => {
    const dashboard = mutated((d) => {
      d.templating = { list: [{ name: 'env', type: 'custom', query: 'prod' }] };
      firstPanel(d).title = '[[env]]';
      firstPanel(d).targets = [{ refId: 'A', expr: 'up{env="[[env]]"}' }];
    });
    expect(one(lint(dashboard), 'legacy-var-syntax').message).toBe(
      '"[[env]]" is the pre-Grafana 6 variable syntax; it appears in 2 places.',
    );
  });
});

describe('rule: datasource-by-name', () => {
  it('fires on a string datasource reference and quotes the name', () => {
    const dashboard = mutated((d) => {
      firstPanel(d).datasource = 'Prometheus';
    });
    const d = one(lint(dashboard), 'datasource-by-name');
    expect(d.severity).toBe('warning');
    expect(d.path).toBe('panels[0].datasource');
    expect(d.message).toBe(
      'The datasource is referenced by name, "Prometheus". A name only resolves if a datasource ' +
        'with exactly that name exists on the target instance.',
    );
    expect(d.hint).toBe(
      'Replace it with a { "type": …, "uid": … } object, or with a datasource variable ' +
        'so the dashboard stays portable. Grafana has written the { type, uid } form since ' +
        'schemaVersion 36.',
    );
  });

  it('stays silent on the -- Mixed --, -- Dashboard -- and -- Grafana -- specials', () => {
    for (const special of ['-- Mixed --', '-- Dashboard --', '-- Grafana --']) {
      const dashboard = mutated((d) => {
        firstPanel(d).datasource = special;
      });
      expect(ids(lint(dashboard)), special).toEqual([]);
    }
  });

  it('stays silent when the datasource IS a variable reference', () => {
    const dashboard = mutated((d) => {
      d.templating = { list: [{ name: 'ds', type: 'datasource', query: 'prometheus' }] };
      firstPanel(d).datasource = '${ds}';
    });
    expect(ids(lint(dashboard))).toEqual([]);
  });
});

describe('rule: unresolved-ds-input', () => {
  it('fires on a ${DS_*} reference with no __inputs block', () => {
    const dashboard = mutated((d) => {
      firstPanel(d).datasource = { type: 'prometheus', uid: '${DS_PROMETHEUS}' };
    });
    const d = one(lint(dashboard), 'unresolved-ds-input');
    expect(d.severity).toBe('error');
    expect(d.path).toBe('panels[0].datasource.uid');
    expect(d.message).toBe(
      '"${DS_PROMETHEUS}" is an import placeholder, but this file has no "__inputs" block that ' +
        'declares it — Grafana reports "Datasource ${DS_PROMETHEUS} not found".',
    );
  });

  it('never double-reports a DS_ placeholder as an undefined variable', () => {
    const dashboard = mutated((d) => {
      firstPanel(d).datasource = { type: 'prometheus', uid: '${DS_PROMETHEUS}' };
    });
    expect(all(lint(dashboard), 'undefined-variable')).toEqual([]);
  });
});

describe('rule: empty-targets', () => {
  it('fires on a query panel with no targets', () => {
    const dashboard = mutated((d) => {
      delete firstPanel(d).targets;
    });
    const d = one(lint(dashboard), 'empty-targets');
    expect(d.severity).toBe('warning');
    expect(d.path).toBe('panels[0].targets');
    expect(d.panelTitle).toBe('Requests');
    expect(d.message).toBe('The panel "Requests" has no queries, so it renders as an empty panel.');
  });

  it('names the path when the panel has no title', () => {
    const dashboard = mutated((d) => {
      delete firstPanel(d).targets;
      delete firstPanel(d).title;
    });
    expect(one(lint(dashboard), 'empty-targets').message).toBe(
      'The panel at panels[0] has no queries, so it renders as an empty panel.',
    );
  });

  it('stays silent for panel types that never query, and for library panels', () => {
    for (const type of ['text', 'dashlist', 'news', 'alertlist', 'annolist']) {
      const dashboard = mutated((d) => {
        firstPanel(d).type = type;
        delete firstPanel(d).targets;
      });
      expect(ids(lint(dashboard)), type).toEqual([]);
    }
    const library = mutated((d) => {
      delete firstPanel(d).targets;
      firstPanel(d).libraryPanel = { uid: 'lib-1', name: 'Shared' };
    });
    expect(ids(lint(library))).toEqual([]);
  });

  it('fires on an empty targets array too', () => {
    const dashboard = mutated((d) => {
      firstPanel(d).targets = [];
    });
    expect(all(lint(dashboard), 'empty-targets')).toHaveLength(1);
  });
});

describe('rule: deprecated-panel-type', () => {
  it('fires on graph, naming timeseries and the Grafana range', () => {
    const dashboard = mutated((d) => {
      firstPanel(d).type = 'graph';
    });
    const d = one(lint(dashboard), 'deprecated-panel-type');
    expect(d.severity).toBe('warning');
    expect(d.path).toBe('panels[0].type');
    expect(d.message).toBe(
      'The panel "Requests" uses the "graph" panel type, replaced by "timeseries" in Grafana 8.',
    );
    expect(d.hint).toBe(
      'Grafana 9–12 migrates it when the dashboard loads, so what you review here is not ' +
        'what you will see. Re-save from Grafana 9 or newer to write the migration into the ' +
        'JSON — the original Angular implementation no longer exists in Grafana 11–12.',
    );
  });

  it('fires on singlestat and table-old with their own replacements', () => {
    expect(
      one(lint(mutated((d) => (firstPanel(d).type = 'singlestat'))), 'deprecated-panel-type')
        .message,
    ).toBe('The panel "Requests" uses the "singlestat" panel type, replaced by "stat" in Grafana 7.');
    expect(
      one(lint(mutated((d) => (firstPanel(d).type = 'table-old'))), 'deprecated-panel-type').message,
    ).toBe('The panel "Requests" uses the "table-old" panel type, replaced by "table" in Grafana 7.');
  });

  it('does not also report the core deprecated types as Angular plugins', () => {
    const result = lint(mutated((d) => (firstPanel(d).type = 'graph')));
    expect(all(result, 'angular-panel')).toEqual([]);
  });
});

describe('rule: angular-panel', () => {
  it('fires as an error on an Angular plugin, naming its core replacement', () => {
    const dashboard = mutated((d) => {
      firstPanel(d).type = 'grafana-piechart-panel';
    });
    const d = one(lint(dashboard), 'angular-panel');
    expect(d.severity).toBe('error');
    expect(d.path).toBe('panels[0].type');
    expect(d.message).toBe(
      'The panel "Requests" uses "grafana-piechart-panel", an AngularJS plugin. Angular support ' +
        'was deprecated in Grafana 9 and removed in Grafana 11–12.',
    );
    expect(d.hint).toBe(
      'Replace it with the core "piechart" panel. There is no automatic migration for Angular ' +
        'plugins, so the panel renders nothing on a current Grafana.',
    );
  });

  it('has a generic hint for an Angular plugin with no core equivalent', () => {
    const dashboard = mutated((d) => {
      firstPanel(d).type = 'vonage-status-panel';
    });
    expect(one(lint(dashboard), 'angular-panel').hint).toBe(
      'Replace it with a core panel. There is no automatic migration for Angular plugins, so the ' +
        'panel renders nothing on a current Grafana.',
    );
  });

  it('stays silent on a modern community panel', () => {
    const dashboard = mutated((d) => {
      firstPanel(d).type = 'volkovlabs-form-panel';
    });
    expect(ids(lint(dashboard))).toEqual([]);
  });
});

describe('rule: repeat-undefined', () => {
  it('fires on a panel repeat that names nothing', () => {
    const dashboard = mutated((d) => {
      firstPanel(d).repeat = 'pod';
    });
    const d = one(lint(dashboard), 'repeat-undefined');
    expect(d.severity).toBe('error');
    expect(d.path).toBe('panels[0].repeat');
    expect(d.message).toBe(
      'The panel "Requests" repeats over "pod", but no template variable named "pod" is defined.',
    );
  });

  it('stays silent when the repeat variable exists', () => {
    const dashboard = mutated((d) => {
      d.templating = { list: [{ name: 'pod', type: 'query', query: 'label_values(pod)' }] };
      firstPanel(d).repeat = 'pod';
      firstPanel(d).title = 'Pod $pod';
    });
    expect(ids(lint(dashboard))).toEqual([]);
  });
});

describe('rule: time-range-absurd', () => {
  it('fires when the default range is longer than a year, quoting it verbatim', () => {
    const dashboard = mutated((d) => {
      d.time = { from: 'now-5y', to: 'now' };
    });
    const d = one(lint(dashboard), 'time-range-absurd');
    expect(d.severity).toBe('warning');
    expect(d.path).toBe('time');
    expect(d.message).toBe(
      'The default time range is "now-5y" to "now", longer than a year. Every panel runs that ' +
        'query the moment the dashboard opens.',
    );
  });

  it('fires when the range runs backwards', () => {
    const dashboard = mutated((d) => {
      d.time = { from: 'now-1h', to: 'now-2h' };
    });
    expect(one(lint(dashboard), 'time-range-absurd').message).toBe(
      'The default time range runs backwards: "now-1h" to "now-2h". Grafana shows an empty ' +
        'dashboard.',
    );
  });

  it('fires when the range has zero length', () => {
    const dashboard = mutated((d) => {
      d.time = { from: 'now', to: 'now' };
    });
    expect(one(lint(dashboard), 'time-range-absurd').message).toBe(
      'The default time range "now" to "now" has zero length.',
    );
  });

  it('fires when the expression is not a time Grafana can parse', () => {
    const dashboard = mutated((d) => {
      d.time = { from: 'yesterday', to: 'now' };
    });
    expect(one(lint(dashboard), 'time-range-absurd').message).toBe(
      'The default time range "yesterday" to "now" is not a time Grafana can parse.',
    );
  });

  it('accepts ordinary relative ranges, rounding suffixes and absolute epochs', () => {
    for (const time of [
      { from: 'now-6h', to: 'now' },
      { from: 'now-7d/d', to: 'now/d' },
      { from: 'now-1M', to: 'now' },
      { from: 1_700_000_000_000, to: 1_700_003_600_000 },
      { from: '2026-01-01T00:00:00.000Z', to: '2026-01-02T00:00:00.000Z' },
    ]) {
      expect(ids(lint(mutated((d) => (d.time = time)))), JSON.stringify(time)).toEqual([]);
    }
  });

  // Regression: `resolveTime` matched the `/unit` rounding suffix and then threw
  // it away, so both bounds resolved to the same instant and EVERY rounded quick
  // range in Grafana's own time picker — "Today", "Yesterday", "This week",
  // "This month" — was reported as a zero-length range. Grafana floors `from`
  // and ceils `to`, so these all have real width.
  it('stays silent on Grafana’s rounded quick ranges, which are not zero-length', () => {
    for (const time of [
      { from: 'now/d', to: 'now/d' },
      { from: 'now/d', to: 'now' },
      { from: 'now-1d/d', to: 'now-1d/d' },
      { from: 'now-2d/d', to: 'now-2d/d' },
      { from: 'now-7d/d', to: 'now-7d/d' },
      { from: 'now/w', to: 'now/w' },
      { from: 'now/w', to: 'now' },
      { from: 'now/M', to: 'now/M' },
      { from: 'now/M', to: 'now' },
      { from: 'now/y', to: 'now/y' },
      { from: 'now/h', to: 'now/h' },
      { from: 'now/Q', to: 'now/Q' },
    ]) {
      expect(ids(lint(mutated((d) => (d.time = time)))), JSON.stringify(time)).toEqual([]);
    }
  });

  // Regression: the fiscal units Grafana parses fine (`fy`, `fQ`) were reported
  // as "not a time Grafana can parse".
  it('parses the fiscal rounding units instead of calling them unparseable', () => {
    for (const time of [
      { from: 'now/fy', to: 'now/fy' },
      { from: 'now/fQ', to: 'now/fQ' },
      { from: 'now-1y/fy', to: 'now-1y/fy' },
    ]) {
      expect(ids(lint(mutated((d) => (d.time = time)))), JSON.stringify(time)).toEqual([]);
    }
  });

  it('still catches a genuinely backwards rounded range', () => {
    const dashboard = mutated((d) => {
      d.time = { from: 'now/d', to: 'now-1d/d' };
    });
    expect(one(lint(dashboard), 'time-range-absurd').message).toBe(
      'The default time range runs backwards: "now/d" to "now-1d/d". Grafana shows an empty ' +
        'dashboard.',
    );
  });
});

describe('rule: refresh-aggressive', () => {
  it('fires below ten seconds and quotes the interval', () => {
    const d = one(lint(mutated((x) => (x.refresh = '5s'))), 'refresh-aggressive');
    expect(d.severity).toBe('warning');
    expect(d.path).toBe('refresh');
    expect(d.message).toBe(
      '"refresh": "5s" re-runs every query every 5 seconds, in every tab that has this dashboard ' +
        'open.',
    );
  });

  it('accepts 10s and above, and an absent or disabled refresh', () => {
    for (const refresh of ['10s', '30s', '1m', '', false, undefined]) {
      const dashboard = mutated((d) => {
        if (refresh === undefined) delete d.refresh;
        else d.refresh = refresh;
      });
      expect(ids(lint(dashboard)), String(refresh)).toEqual([]);
    }
  });
});

describe('rule: override-suspect', () => {
  it('fires when a matcher has no value', () => {
    const dashboard = mutated((d) => {
      firstPanel(d).fieldConfig = {
        defaults: {},
        overrides: [{ matcher: { id: 'byName' }, properties: [{ id: 'unit', value: 's' }] }],
      };
    });
    const d = one(lint(dashboard), 'override-suspect');
    expect(d.severity).toBe('info');
    expect(d.path).toBe('panels[0].fieldConfig.overrides[0]');
    expect(d.message).toBe(
      'Override 1 on the panel "Requests" matches nothing: its "byName" matcher has no value.',
    );
    expect(d.hint).toBe(
      'Give the override something to match and something to set, or delete it. Grafana keeps it ' +
        'in the JSON and applies nothing.',
    );
  });

  it('fires when an override sets no properties', () => {
    const dashboard = mutated((d) => {
      firstPanel(d).fieldConfig = {
        defaults: {},
        overrides: [{ matcher: { id: 'byName', options: 'value' }, properties: [] }],
      };
    });
    expect(one(lint(dashboard), 'override-suspect').message).toBe(
      'Override 1 on the panel "Requests" sets no properties.',
    );
  });

  it('reports the matcher problem first when an override has both', () => {
    const dashboard = mutated((d) => {
      firstPanel(d).fieldConfig = {
        defaults: {},
        overrides: [{ matcher: { id: 'byName' }, properties: [] }],
      };
    });
    expect(one(lint(dashboard), 'override-suspect').message).toBe(
      'Override 1 on the panel "Requests" matches nothing: its "byName" matcher has no value.',
    );
  });

  it('stays silent on a complete override', () => {
    const dashboard = mutated((d) => {
      firstPanel(d).fieldConfig = {
        defaults: {},
        overrides: [
          { matcher: { id: 'byName', options: 'errors' }, properties: [{ id: 'unit', value: 's' }] },
        ],
      };
    });
    expect(ids(lint(dashboard))).toEqual([]);
  });
});

describe('rule: empty-row', () => {
  it('fires on a collapsed row with no panels', () => {
    const dashboard = mutated((d) => {
      (d.panels as Json[]).push({
        id: 9,
        type: 'row',
        title: 'Overview',
        collapsed: true,
        gridPos: { h: 1, w: 24, x: 0, y: 8 },
        panels: [],
      });
    });
    const d = one(lint(dashboard), 'empty-row');
    expect(d.severity).toBe('info');
    expect(d.path).toBe('panels[1]');
    expect(d.message).toBe('The row "Overview" contains no panels.');
  });

  it('stays silent on an EXPANDED row whose panels are its siblings', () => {
    const dashboard = mutated((d) => {
      (d.panels as Json[]).unshift({
        id: 9,
        type: 'row',
        title: 'Overview',
        collapsed: false,
        gridPos: { h: 1, w: 24, x: 0, y: 0 },
        panels: [],
      });
    });
    expect(ids(lint(dashboard))).toEqual([]);
  });

  it('fires on an expanded row followed immediately by another row', () => {
    const dashboard = mutated((d) => {
      (d.panels as Json[]).unshift(
        { id: 8, type: 'row', title: 'Empty', collapsed: false, gridPos: { h: 1, w: 24, x: 0, y: 0 }, panels: [] },
        { id: 9, type: 'row', title: 'Full', collapsed: false, gridPos: { h: 1, w: 24, x: 0, y: 1 }, panels: [] },
      );
    });
    const result = lint(dashboard);
    expect(all(result, 'empty-row')).toHaveLength(1);
    expect(one(result, 'empty-row').message).toBe('The row "Empty" contains no panels.');
  });

  it('counts a collapsed row’s children as panels and lints them', () => {
    const dashboard = mutated((d) => {
      (d.panels as Json[]).push({
        id: 9,
        type: 'row',
        title: 'Overview',
        collapsed: true,
        gridPos: { h: 1, w: 24, x: 0, y: 8 },
        panels: [{ id: 10, title: 'Nested', gridPos: { h: 4, w: 6, x: 0, y: 9 }, targets: [{ refId: 'A' }] }],
      });
    });
    const result = lint(dashboard);
    expect(result.stats.panels).toBe(2);
    expect(result.stats.rows).toBe(1);
    expect(one(result, 'panel-no-type').path).toBe('panels[1].panels[0].type');
  });
});

describe('rule: panel-no-type', () => {
  it('fires as an error and names the panel', () => {
    const dashboard = mutated((d) => {
      delete firstPanel(d).type;
    });
    const d = one(lint(dashboard), 'panel-no-type');
    expect(d.severity).toBe('error');
    expect(d.path).toBe('panels[0].type');
    expect(d.message).toBe(
      'The panel "Requests" has no "type", so Grafana has nothing to render it with and draws an ' +
        'empty box.',
    );
    expect(d.hint).toBe(
      'Add "type" — "timeseries", "stat", "table" and so on. Library panels are the one ' +
        'exception, and they are not reported.',
    );
  });

  it('fires on an empty or non-string type', () => {
    expect(all(lint(mutated((d) => (firstPanel(d).type = ''))), 'panel-no-type')).toHaveLength(1);
    expect(all(lint(mutated((d) => (firstPanel(d).type = 7))), 'panel-no-type')).toHaveLength(1);
  });

  // Regression: `panel-no-type` used to raise an ERROR on a library panel saved
  // exactly the way Grafana saves one — {id, title, gridPos, libraryPanel} and
  // NO type — telling the reader to add a key Grafana itself omits.
  it('stays silent on a library panel, which Grafana saves without a type', () => {
    const dashboard = mutated((d) => {
      (d.panels as Json[]).push({
        id: 3,
        title: 'Shared latency',
        gridPos: { h: 8, w: 24, x: 0, y: 8 },
        libraryPanel: { uid: 'kx9', name: 'Shared latency' },
      });
    });
    expect(ids(lint(dashboard))).toEqual([]);
  });
});

describe('rule: panel-zero-size', () => {
  it('fires on a zero width, naming both dimensions', () => {
    const dashboard = mutated((d) => {
      firstPanel(d).gridPos = { h: 8, w: 0, x: 0, y: 0 };
    });
    const d = one(lint(dashboard), 'panel-zero-size');
    expect(d.severity).toBe('warning');
    expect(d.path).toBe('panels[0].gridPos');
    expect(d.message).toBe(
      'The panel "Requests" has "gridPos" width 0 and height 8, so it is invisible.',
    );
    expect(d.hint).toBe(
      'The grid is 24 columns wide: give it a width between 1 and 24 and a height of at least 1.',
    );
  });

  it('fires when gridPos is missing entirely', () => {
    const dashboard = mutated((d) => {
      delete firstPanel(d).gridPos;
    });
    expect(one(lint(dashboard), 'panel-zero-size').message).toBe(
      'The panel "Requests" has no "gridPos", so Grafana falls back to a default position and ' +
        'panels can land on top of each other.',
    );
  });

  it('never reports a row, whose gridPos Grafana manages itself', () => {
    const dashboard = mutated((d) => {
      (d.panels as Json[]).unshift({ id: 9, type: 'row', title: 'R', collapsed: false, panels: [] });
    });
    expect(all(lint(dashboard), 'panel-zero-size')).toEqual([]);
  });
});

/* ── 4. realistic fixtures ────────────────────────────────────────────────── */

describe('realistic fixtures (the example chips)', () => {
  it('ships five examples, all of them parseable', () => {
    expect(examples).toHaveLength(5);
    for (const example of examples) {
      const result = lintDashboard(example.json);
      expect(result.ok, `${example.id} must parse`).toBe(true);
      expect(result.parseNotes, `${example.id} must be strict JSON`).toEqual([]);
    }
  });

  it('the boot seed (kitchen sink) fires 21 of the 22 rules', () => {
    const result = lintDashboard(examples[0].json);
    expect(examples[0].id).toBe('kitchen-sink');
    const fired = new Set(ids(result));
    const missing = RULE_IDS.filter((id) => !fired.has(id));
    // schema-version-unknown cannot co-fire with schema-version-old: the
    // dashboard's schemaVersion is 27, which is old, not unknown.
    expect(missing).toEqual(['schema-version-unknown']);
    expect(result.summary).toEqual({ errors: 7, warnings: 12, infos: 3 });
    expect(result.stats).toEqual({
      schemaVersion: 27,
      panels: 3,
      rows: 1,
      varsDefined: 2,
      varsUsed: 3,
      varsUnresolved: 2,
    });
    expect(summaryLine(result)).toBe(
      '7 errors, 12 warnings, 3 notes — variables: 2 defined, 2 unresolved, schemaVersion 27',
    );
  });

  it('the clean v41 example produces nothing at all', () => {
    expect(examples[1].id).toBe('clean-v41');
    const result = lintDashboard(examples[1].json);
    expect(result.diagnostics).toEqual([]);
    expect(result.stats.schemaVersion).toBe(41);
    expect(result.summary).toEqual({ errors: 0, warnings: 0, infos: 0 });
  });

  it('the legacy v27 example fires exactly the migration rules, and no errors', () => {
    expect(examples[2].id).toBe('legacy-v27');
    const result = lintDashboard(examples[2].json);
    expect(result.summary.errors).toBe(0);
    expect([...new Set(ids(result))].sort()).toEqual([
      'datasource-by-name',
      'deprecated-panel-type',
      'schema-version-old',
    ]);
    expect(all(result, 'deprecated-panel-type')).toHaveLength(3);
    expect(all(result, 'datasource-by-name')).toHaveLength(4);
  });

  it('the undefined-variable example fires exactly that one rule', () => {
    expect(examples[3].id).toBe('undefined-var');
    const result = lintDashboard(examples[3].json);
    expect(ids(result)).toEqual(['undefined-variable']);
    expect(one(result, 'undefined-variable').message).toContain('"$env" is used');
  });

  it('the __inputs export example reports the placeholder once', () => {
    expect(examples[4].id).toBe('inputs-export');
    const result = lintDashboard(examples[4].json);
    expect(all(result, 'unresolved-ds-input')).toHaveLength(1);
    expect(all(result, 'undefined-variable')).toEqual([]);
    expect(all(result, 'no-uid')).toHaveLength(1);
  });

  // Regression: the summary strip counted a `${DS_…}` import placeholder that
  // `__inputs` DECLARES as an "unresolved variable", so the headline said
  // "0 defined, 1 unresolved" while no variable was unresolved at all — and the
  // page's own reference table says `${DS_PROMETHEUS}` is not a variable.
  it('does not count a declared ${DS_…} placeholder as an unresolved variable', () => {
    const result = lintDashboard(examples[4].json);
    expect(result.stats.varsDefined).toBe(0);
    expect(result.stats.varsUsed).toBe(0);
    expect(result.stats.varsUnresolved).toBe(0);
    expect(summaryLine(result)).toBe(
      '1 error, 1 warning — variables: 0 defined, schemaVersion 39',
    );
  });
});

/* ── 5. caps, performance, hostility ─────────────────────────────────────── */

describe('caps', () => {
  it('caps one rule at 50 diagnostics and reports the real total', () => {
    const panels: Json[] = [];
    for (let i = 0; i < 61; i += 1) {
      panels.push({
        id: 1,
        type: 'timeseries',
        title: `P${i}`,
        datasource: { type: 'prometheus', uid: 'prom-main' },
        gridPos: { h: 4, w: 4, x: 0, y: i * 4 },
        targets: [{ refId: 'A', expr: 'up' }],
      });
    }
    const result = lint(mutated((d) => (d.panels = panels)));
    expect(MAX_DIAGNOSTICS_PER_RULE).toBe(50);
    expect(all(result, 'duplicate-panel-id')).toHaveLength(50);
    expect(result.truncatedRules).toEqual([
      { ruleId: 'duplicate-panel-id', shown: 50, total: 60 },
    ]);
  });

  it('a rule that throws degrades to one info diagnostic, not a dead engine', () => {
    // `templating.list` is an object rather than an array: every variable rule
    // has to survive it, and the rest of the run has to continue.
    const result = lint(mutated((d) => (d.templating = { list: { name: 'env' } })));
    expect(result.ok).toBe(true);
    expect(() => summaryLine(result)).not.toThrow();
  });
});

describe('performance', () => {
  it('lints a 500-panel dashboard in under 200ms', () => {
    const panels: Json[] = [];
    for (let i = 0; i < 500; i += 1) {
      panels.push({
        id: i + 1,
        type: 'timeseries',
        title: `Panel ${i + 1}`,
        datasource: { type: 'prometheus', uid: 'prom-main' },
        gridPos: { h: 8, w: 12, x: (i % 2) * 12, y: Math.floor(i / 2) * 8 },
        fieldConfig: {
          defaults: { unit: 's' },
          overrides: [
            { matcher: { id: 'byName', options: `series-${i}` }, properties: [{ id: 'unit', value: 's' }] },
          ],
        },
        targets: [
          {
            refId: 'A',
            expr: `sum by (job) (rate(http_requests_total{env="$env",shard="${i}"}[$__rate_interval]))`,
          },
          { refId: 'B', expr: `histogram_quantile(0.95, rate(latency_bucket{shard="${i}"}[5m]))` },
        ],
      });
    }
    const text = JSON.stringify(
      mutated((d) => {
        d.templating = { list: [{ name: 'env', type: 'custom', query: 'prod,staging' }] };
        d.panels = panels;
      }),
    );
    expect(text.length).toBeGreaterThan(100_000);

    const started = performance.now();
    const result = lintDashboard(text);
    const elapsed = performance.now() - started;

    expect(result.ok).toBe(true);
    expect(result.stats.panels).toBe(500);
    expect(result.diagnostics).toEqual([]);
    expect(elapsed, `500 panels took ${elapsed.toFixed(1)}ms`).toBeLessThan(200);
  });
});

describe('never throws', () => {
  const hostile: [string, string][] = [
    ['empty', ''],
    ['blank', '   \n\t '],
    ['a single brace', '{'],
    ['a truncated dashboard', '{"panels": [{"id": 1, "type": "timeser'],
    ['a lone bracket run', '['.repeat(20_000)],
    ['deeply nested arrays', '['.repeat(600) + ']'.repeat(600)],
    ['a NUL byte', '{"title": "a\u0000b"}'],
    ['lone surrogates', '{"title": "\uD800"}'],
    ['control characters', '{"title": "\u0001\u0002"}'],
    ['a bare word', 'not json at all'],
    ['YAML that is not provisioning', 'foo: bar\nbaz: 1\n'],
    ['HTML', '<html><body>404</body></html>'],
    ['panels as a string', '{"panels": "nope"}'],
    ['panels as an object', '{"panels": {"0": {"type": "row"}}}'],
    ['templating as a string', '{"templating": "nope"}'],
    ['templating.list as a number', '{"templating": {"list": 5}}'],
    ['a variable with no name', '{"templating": {"list": [{"type": "custom"}]}}'],
    ['a numeric variable name', '{"templating": {"list": [{"name": 7}]}}'],
    ['time as a string', '{"time": "now-6h"}'],
    ['gridPos as a string', '{"panels": [{"type": "stat", "gridPos": "big"}]}'],
    ['fieldConfig as an array', '{"panels": [{"type": "stat", "fieldConfig": []}]}'],
    ['overrides as a string', '{"panels": [{"type": "stat", "fieldConfig": {"overrides": "x"}}]}'],
    ['__inputs as a string', '{"__inputs": "DS_PROMETHEUS"}'],
    ['rows as a number', '{"rows": 3}'],
    ['a row whose panels is a string', '{"panels": [{"type": "row", "panels": "x"}]}'],
    ['id as a string', '{"id": "42"}'],
    ['uid as a number', '{"uid": 42}'],
    ['refresh as an object', '{"refresh": {"every": "5s"}}'],
    ['repeat as an array', '{"panels": [{"type": "stat", "repeat": ["a"]}]}'],
    ['a self-referencing variable', '{"templating": {"list": [{"name": "a", "query": "$a"}]}}'],
    ['only dollar signs', '{"title": "$$$$$$"}'],
    ['a giant single string', `{"title": ${JSON.stringify('x'.repeat(200_000))}}`],
    ['many variable uses', `{"title": ${JSON.stringify('$a '.repeat(20_000))}}`],
    ['unicode everywhere', '{"title": "\u{1F600}你好", "uid": "\u{1F600}"}'],
  ];

  for (const [label, input] of hostile) {
    it(`survives ${label}`, () => {
      let result: LintResult | undefined;
      expect(() => {
        result = lintDashboard(input);
      }).not.toThrow();
      expect(result).toBeDefined();
      expect(typeof result!.ok).toBe('boolean');
      expect(Array.isArray(result!.diagnostics)).toBe(true);
      expect(result!.rulesVersion).toBe(GRAFANA_RULES_VERSION);
      expect(() => summaryLine(result!)).not.toThrow();
      // Every diagnostic is renderable: a real rule id, a severity, a path and
      // a message. The playground assumes all four.
      for (const d of result!.diagnostics) {
        expect(RULE_IDS).toContain(d.id);
        expect(['error', 'warning', 'info']).toContain(d.severity);
        expect(typeof d.path).toBe('string');
        expect(d.message.length).toBeGreaterThan(0);
      }
    });
  }

  it('survives non-string input without throwing', () => {
    for (const value of [undefined, null, 42, {}, [], true]) {
      const result = lintDashboard(value as unknown as string);
      expect(result.ok).toBe(false);
      expect(result.error).toBe('Paste a Grafana dashboard JSON to lint.');
    }
  });
});

describe('summaryLine', () => {
  it('reads like the plan’s example', () => {
    const result: LintResult = {
      ok: true,
      parseNotes: [],
      diagnostics: [],
      summary: { errors: 2, warnings: 5, infos: 0 },
      stats: { schemaVersion: 39, panels: 12, rows: 2, varsDefined: 3, varsUsed: 3, varsUnresolved: 1 },
      truncatedRules: [],
      truncated: false,
      rulesVersion: GRAFANA_RULES_VERSION,
    };
    expect(summaryLine(result)).toBe(
      '2 errors, 5 warnings — variables: 3 defined, 1 unresolved, schemaVersion 39',
    );
  });

  it('uses singulars, and says when schemaVersion is absent', () => {
    const result: LintResult = {
      ok: true,
      parseNotes: [],
      diagnostics: [],
      summary: { errors: 1, warnings: 1, infos: 1 },
      stats: { schemaVersion: null, panels: 1, rows: 0, varsDefined: 1, varsUsed: 1, varsUnresolved: 0 },
      truncatedRules: [],
      truncated: false,
      rulesVersion: GRAFANA_RULES_VERSION,
    };
    expect(summaryLine(result)).toBe(
      '1 error, 1 warning, 1 note — variables: 1 defined, schemaVersion not set',
    );
  });

  it('says so when there is nothing to report', () => {
    const result: LintResult = {
      ok: true,
      parseNotes: [],
      diagnostics: [],
      summary: { errors: 0, warnings: 0, infos: 0 },
      stats: { schemaVersion: 41, panels: 9, rows: 0, varsDefined: 0, varsUsed: 0, varsUnresolved: 0 },
      truncatedRules: [],
      truncated: false,
      rulesVersion: GRAFANA_RULES_VERSION,
    };
    expect(summaryLine(result)).toBe(
      'No problems found in 9 panels — variables: 0 defined, schemaVersion 41',
    );
  });

  it('reports a failed parse rather than a count', () => {
    expect(summaryLine(lintDashboard('{'))).toBe('Could not lint');
  });
});

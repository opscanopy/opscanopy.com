/**
 * Grafana Dashboard Validator — the five example chips.
 *
 * Order is deliberate, and the KITCHEN SINK COMES FIRST because it is the boot
 * seed: a first-time visitor sees it before touching anything, and a dashboard
 * with nothing wrong would demonstrate nothing and leave the results panel with
 * no finding to copy. (That also makes the E2E suite's per-row copy assertion
 * reachable on first paint.) The rest walk down the severity ladder:
 *
 *   1. kitchen-sink   — 21 of the 22 rules fire at once.
 *   2. clean-v41      — the same job done right: zero findings.
 *   3. legacy-v27     — a real Grafana-6-era dashboard: migrations only, no errors.
 *   4. undefined-var  — one error, the single most common import failure.
 *   5. inputs-export  — "Export for sharing externally", the ${DS_…} trap.
 *
 * Each dashboard is written as an object and serialized with
 * `JSON.stringify(…, null, 2)`, which is both what Grafana's own JSON Model view
 * shows and a guarantee that every example is STRICT JSON — `engine.test.ts`
 * asserts that all five parse with an empty `parseNotes`, so an example can never
 * quietly depend on the lenient recovery path.
 *
 * `engine.test.ts` also pins the exact findings each example produces, including
 * the summary counts and stats of the kitchen sink. Editing an example without
 * updating those assertions fails the suite, which is the point.
 */
import type { DashboardExample } from './types';

type Json = Record<string, unknown>;

/** Everything wrong at once: 7 errors, 12 warnings, 3 notes across 21 rules. */
const KITCHEN_SINK: Json = {
  id: 42,
  title: '',
  schemaVersion: 27,
  refresh: '5s',
  time: { from: 'now-5y', to: 'now' },
  templating: {
    list: [
      { name: 'env', type: 'query', query: 'label_values(env)', datasource: 'Prometheus' },
      { name: 'env', type: 'custom', query: 'prod,staging' },
      { name: 'region', type: 'custom', query: 'eu,us' },
    ],
  },
  panels: [
    {
      id: 1,
      type: 'graph',
      title: 'Requests',
      datasource: 'Prometheus',
      gridPos: { h: 8, w: 12, x: 0, y: 0 },
      targets: [{ refId: 'A', expr: 'rate(http_requests_total{env="[[env]]"}[5m])' }],
    },
    {
      id: 1,
      type: 'grafana-piechart-panel',
      title: 'Share',
      datasource: { type: 'prometheus', uid: '${DS_PROMETHEUS}' },
      gridPos: { h: 8, w: 0, x: 12, y: 0 },
      targets: [],
    },
    {
      id: 3,
      title: 'Latency by pod',
      repeat: 'pod',
      datasource: { type: 'prometheus', uid: 'prom-main' },
      gridPos: { h: 8, w: 12, x: 0, y: 8 },
      targets: [
        {
          refId: 'A',
          expr:
            'histogram_quantile(0.95, sum by (le) ' +
            '(rate(latency_bucket{env="$env",cluster="$cluster"}[5m])))',
        },
      ],
      fieldConfig: {
        defaults: {},
        overrides: [{ matcher: { id: 'byName' }, properties: [] }],
      },
    },
    {
      id: 4,
      type: 'row',
      title: 'Overview',
      collapsed: true,
      gridPos: { h: 1, w: 24, x: 0, y: 16 },
      panels: [],
    },
  ],
};

/** The reference: a portable dashboard on the pinned schema. Zero findings. */
const CLEAN_V41: Json = {
  uid: 'ops-api-slo',
  id: null,
  title: 'API SLO',
  schemaVersion: 41,
  version: 7,
  editable: true,
  time: { from: 'now-6h', to: 'now' },
  refresh: '1m',
  templating: {
    list: [
      {
        name: 'env',
        label: 'Environment',
        type: 'custom',
        query: 'prod,staging',
        current: { text: 'prod', value: 'prod' },
      },
    ],
  },
  panels: [
    {
      id: 1,
      type: 'timeseries',
      title: 'Request rate',
      datasource: { type: 'prometheus', uid: 'P1809F7CD0C75ACF3' },
      gridPos: { h: 8, w: 12, x: 0, y: 0 },
      targets: [
        {
          refId: 'A',
          expr: 'sum by (code) (rate(http_requests_total{env="$env"}[$__rate_interval]))',
        },
      ],
    },
    {
      id: 2,
      type: 'stat',
      title: 'Error ratio',
      datasource: { type: 'prometheus', uid: 'P1809F7CD0C75ACF3' },
      gridPos: { h: 8, w: 12, x: 12, y: 0 },
      targets: [
        {
          refId: 'A',
          expr:
            'sum(rate(http_requests_total{env="$env",code="500"}[$__rate_interval])) ' +
            '/ sum(rate(http_requests_total{env="$env"}[$__rate_interval]))',
        },
      ],
    },
  ],
};

/** Grafana 6 era: three Angular core panels and name-based datasources. */
const LEGACY_V27: Json = {
  uid: 'legacy-nodes',
  id: null,
  title: 'Node exporter (legacy)',
  schemaVersion: 27,
  time: { from: 'now-6h', to: 'now' },
  refresh: '30s',
  templating: {
    list: [
      {
        name: 'node',
        type: 'query',
        query: 'label_values(node_uname_info, instance)',
        datasource: 'Prometheus',
      },
    ],
  },
  panels: [
    {
      id: 1,
      type: 'graph',
      title: 'CPU',
      datasource: 'Prometheus',
      gridPos: { h: 8, w: 12, x: 0, y: 0 },
      targets: [{ refId: 'A', expr: 'rate(node_cpu_seconds_total{instance="$node"}[5m])' }],
    },
    {
      id: 2,
      type: 'singlestat',
      title: 'Uptime',
      datasource: 'Prometheus',
      gridPos: { h: 8, w: 6, x: 12, y: 0 },
      targets: [
        {
          refId: 'A',
          expr: 'node_time_seconds{instance="$node"} - node_boot_time_seconds{instance="$node"}',
        },
      ],
    },
    {
      id: 3,
      type: 'table-old',
      title: 'Filesystems',
      datasource: 'Prometheus',
      gridPos: { h: 8, w: 6, x: 18, y: 0 },
      targets: [{ refId: 'A', expr: 'node_filesystem_avail_bytes{instance="$node"}' }],
    },
  ],
};

/** The single most common import failure: a query references a variable nobody declared. */
const UNDEFINED_VAR: Json = {
  uid: 'svc-overview',
  id: null,
  title: 'Service overview',
  schemaVersion: 41,
  time: { from: 'now-3h', to: 'now' },
  refresh: '1m',
  templating: {
    list: [
      {
        name: 'service',
        type: 'query',
        query: 'label_values(http_requests_total, service)',
        datasource: { type: 'prometheus', uid: 'prom-main' },
      },
    ],
  },
  panels: [
    {
      id: 1,
      type: 'timeseries',
      title: 'Requests per second',
      datasource: { type: 'prometheus', uid: 'prom-main' },
      gridPos: { h: 9, w: 24, x: 0, y: 0 },
      targets: [
        {
          refId: 'A',
          expr:
            'sum(rate(http_requests_total{service="$service",env="$env"}' +
            '[$__rate_interval]))',
        },
      ],
    },
  ],
};

/** "Export for sharing externally": every datasource becomes an import placeholder. */
const INPUTS_EXPORT: Json = {
  __inputs: [
    {
      name: 'DS_PROMETHEUS',
      label: 'Prometheus',
      description: '',
      type: 'datasource',
      pluginId: 'prometheus',
      pluginName: 'Prometheus',
    },
  ],
  __requires: [
    { type: 'grafana', id: 'grafana', name: 'Grafana', version: '11.4.0' },
    { type: 'datasource', id: 'prometheus', name: 'Prometheus', version: '1.0.0' },
    { type: 'panel', id: 'timeseries', name: 'Time series', version: '' },
  ],
  id: null,
  uid: '',
  title: 'Redis',
  schemaVersion: 39,
  time: { from: 'now-1h', to: 'now' },
  refresh: '',
  templating: { list: [] },
  panels: [
    {
      id: 1,
      type: 'timeseries',
      title: 'Connected clients',
      datasource: { type: 'prometheus', uid: '${DS_PROMETHEUS}' },
      gridPos: { h: 8, w: 12, x: 0, y: 0 },
      targets: [
        {
          refId: 'A',
          datasource: { type: 'prometheus', uid: '${DS_PROMETHEUS}' },
          expr: 'redis_connected_clients',
        },
      ],
    },
  ],
};

function toJson(dashboard: Json): string {
  return `${JSON.stringify(dashboard, null, 2)}\n`;
}

export const examples: DashboardExample[] = [
  { id: 'kitchen-sink', label: 'Kitchen sink', json: toJson(KITCHEN_SINK) },
  { id: 'clean-v41', label: 'Clean (schemaVersion 41)', json: toJson(CLEAN_V41) },
  { id: 'legacy-v27', label: 'Legacy graph panels (v27)', json: toJson(LEGACY_V27) },
  { id: 'undefined-var', label: 'Undefined $env variable', json: toJson(UNDEFINED_VAR) },
  { id: 'inputs-export', label: 'Export for sharing (__inputs)', json: toJson(INPUTS_EXPORT) },
];

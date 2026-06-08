/**
 * LogQL ↔ PromQL Helper — worked examples for the playground's example picker.
 *
 * Each example is a single, self-contained metric query plus the direction it
 * should be translated in. They are chosen to exercise the engine's main
 * branches: a clean rate() round-trip, an aggregation with by(...), a LogQL
 * pipeline whose line filters get dropped (with a note), and a bare PromQL
 * selector that must be wrapped for Loki.
 */

import type { Direction } from './types';

export interface Example {
  /** Stable id (used as the option value / React-style key). */
  id: string;
  /** Human label for the picker. */
  label: string;
  /** Which way this example translates. */
  direction: Direction;
  /** The source query. */
  query: string;
}

export const examples: Example[] = [
  {
    id: 'logql-rate-filter',
    label: 'LogQL → PromQL · rate of errors',
    direction: 'logql-to-promql',
    query: 'rate({app="api", env="prod"} |= "error" [5m])',
  },
  {
    id: 'logql-sum-by',
    label: 'LogQL → PromQL · sum by(level)',
    direction: 'logql-to-promql',
    query: 'sum by(level) (count_over_time({job="ingress"} | logfmt [1m]))',
  },
  {
    id: 'promql-rate',
    label: 'PromQL → LogQL · rate of a counter',
    direction: 'promql-to-logql',
    query: 'rate(http_requests_total{job="api", code=~"5.."}[5m])',
  },
  {
    id: 'promql-sum-by',
    label: 'PromQL → LogQL · sum by(instance)',
    direction: 'promql-to-logql',
    query: 'sum by(instance) (rate(node_network_receive_bytes_total[1m]))',
  },
  {
    id: 'promql-bare',
    label: 'PromQL → LogQL · bare selector',
    direction: 'promql-to-logql',
    query: 'up{job="node"}',
  },
];

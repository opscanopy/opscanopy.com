/**
 * PromQL Explainer — bundled, runnable examples for the playground.
 *
 * Each `query` parses cleanly with `explain()` in `engine.ts` and produces a
 * sensible inside-out explanation plus a token breakdown. They span the common
 * shapes operators meet day to day:
 *
 *   • histogram_quantile p95 request latency (functions + range + aggregation)
 *   • sum by(job) of the rate of HTTP 5xx errors (rate + grouped aggregation)
 *   • a memory-utilisation percentage (scalar arithmetic across two gauges)
 *   • a high-error-rate alerting comparison (ratio + threshold comparison)
 *   • a counter increase with an offset modifier
 *
 * They are realistic, hand-written queries — representative rather than
 * exhaustive of everything PromQL can express.
 */

export interface PromqlExample {
  /** Stable id used by the playground selector. */
  id: string;
  /** Short human label for the example option. */
  label: string;
  /** The PromQL query (explains cleanly with `explain(query)`). */
  query: string;
}

/* p95 request latency from a histogram — the canonical histogram_quantile shape. */
const p95Latency: PromqlExample = {
  id: 'p95-latency',
  label: 'p95 request latency (histogram_quantile)',
  query:
    'histogram_quantile(0.95, sum by(le) (rate(http_request_duration_seconds_bucket[5m])))',
};

/* Per-job rate of HTTP 5xx responses — rate inside a grouped sum. */
const fiveXxRate: PromqlExample = {
  id: 'sum-by-job-5xx-rate',
  label: '5xx error rate by job (sum by + rate)',
  query: 'sum by(job) (rate(http_requests_total{status=~"5.."}[5m]))',
};

/* Memory utilisation as a percentage — scalar arithmetic across two gauges. */
const memoryPercent: PromqlExample = {
  id: 'memory-percent',
  label: 'Memory used (% of total)',
  query:
    '(1 - node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes) * 100',
};

/* High-error-rate alert condition — a ratio compared against a threshold. */
const errorRatioAlert: PromqlExample = {
  id: 'error-ratio-alert',
  label: 'Error ratio above 5% (comparison)',
  query:
    'sum(rate(http_requests_total{status=~"5.."}[5m])) / sum(rate(http_requests_total[5m])) > 0.05',
};

/* Total restarts in the last hour — increase() with an offset modifier. */
const restartsIncrease: PromqlExample = {
  id: 'restarts-increase-offset',
  label: 'Restarts last hour vs. previous (offset)',
  query: 'increase(kube_pod_container_status_restarts_total[1h] offset 1h)',
};

export const examples: PromqlExample[] = [
  p95Latency,
  fiveXxRate,
  memoryPercent,
  errorRatioAlert,
  restartsIncrease,
];

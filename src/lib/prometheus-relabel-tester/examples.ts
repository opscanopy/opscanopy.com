/**
 * Prometheus Relabel Tester — bundled, runnable examples for the playground.
 *
 * Each example pairs a real-world `relabel_configs` snippet with sample label
 * sets so a user can copy, edit, and re-run from a known baseline. The configs
 * mirror patterns straight from the Prometheus docs (Kubernetes SD `labelmap`,
 * `keep` on `__meta_*`, `replace` building an `address`, `hashmod` sharding,
 * and `labeldrop` cleanup), so the outputs match what Prometheus would produce.
 */

export interface RelabelExample {
  /** Stable id used by the playground selector. */
  id: string;
  /** Short human label for the example tab. */
  label: string;
  /** The `relabel_configs` YAML (a list of rules). */
  configs: string;
  /** One or more sample label sets (blank-line separated). */
  labels: string;
}

/* (a) ─ keep + labelmap (Kubernetes pod discovery) ───────────────────────────
 *
 * The canonical kubernetes_sd_configs recipe: only scrape pods that opted in
 * via the `prometheus.io/scrape: "true"` annotation (keep), then map every
 * `__meta_kubernetes_pod_label_*` to a plain label (labelmap).
 */
const k8sKeepLabelmap: RelabelExample = {
  id: 'k8s-keep-labelmap',
  label: 'Kubernetes: keep + labelmap',
  configs: `# Only keep targets the pod opted into scraping.
- source_labels: [__meta_kubernetes_pod_annotation_prometheus_io_scrape]
  action: keep
  regex: "true"

# Promote every pod label to a top-level label.
- action: labelmap
  regex: __meta_kubernetes_pod_label_(.+)`,
  labels: `__meta_kubernetes_pod_annotation_prometheus_io_scrape="true"
__meta_kubernetes_pod_label_app="api"
__meta_kubernetes_pod_label_tier="backend"
__address__="10.0.0.5:8080"

__meta_kubernetes_pod_annotation_prometheus_io_scrape="false"
__meta_kubernetes_pod_label_app="batch"
__address__="10.0.0.9:9000"`,
};

/* (b) ─ replace: build __address__ from an annotated port ─────────────────────
 *
 * Rewrite the scrape address to use a custom port and metrics path taken from
 * pod annotations — the standard "override the port" relabel recipe.
 */
const replaceAddress: RelabelExample = {
  id: 'replace-address',
  label: 'replace: rewrite __address__',
  configs: `# Combine the IP (host of __address__) with the annotated port into a new __address__.
- source_labels: [__address__, __meta_kubernetes_pod_annotation_prometheus_io_port]
  action: replace
  regex: ([^:]+)(?::\\d+)?;(\\d+)
  replacement: $1:$2
  target_label: __address__

# Take the scrape path from an annotation; default left as-is if absent.
- source_labels: [__meta_kubernetes_pod_annotation_prometheus_io_path]
  action: replace
  regex: (.+)
  target_label: __metrics_path__`,
  labels: `__address__="10.0.2.4:8080"
__meta_kubernetes_pod_annotation_prometheus_io_port="9100"
__meta_kubernetes_pod_annotation_prometheus_io_path="/actuator/prometheus"`,
};

/* (c) ─ drop: silence a noisy metric in metric_relabel_configs ────────────────
 *
 * A classic metric_relabel_configs entry: drop a high-cardinality series before
 * it is stored. Here we drop everything from the `go_gc_*` family.
 */
const dropMetric: RelabelExample = {
  id: 'drop-metric',
  label: 'drop: silence a metric',
  configs: `# Drop noisy Go GC histograms before ingestion.
- source_labels: [__name__]
  action: drop
  regex: go_gc_.*`,
  labels: `__name__="go_gc_duration_seconds", quantile="0.5", job="api"

__name__="http_requests_total", method="get", job="api"

__name__="go_gc_heap_allocs_bytes_total", job="api"`,
};

/* (d) ─ hashmod: shard targets across instances (MD5-based) ───────────────────
 *
 * The horizontal-sharding recipe: hash the address, take it modulo the shard
 * count, then keep only the shard this Prometheus owns.
 */
const hashmodShard: RelabelExample = {
  id: 'hashmod-shard',
  label: 'hashmod: shard targets',
  configs: `# Compute a stable shard for each target.
- source_labels: [__address__]
  action: hashmod
  modulus: 3
  target_label: __tmp_shard

# Keep only the targets that belong to shard 0.
- source_labels: [__tmp_shard]
  action: keep
  regex: "0"`,
  labels: `__address__="10.0.0.1:9100", job="node"

__address__="10.0.0.2:9100", job="node"

__address__="10.0.0.3:9100", job="node"

__address__="10.0.0.4:9100", job="node"`,
};

/* (e) ─ labeldrop + lowercase: tidy labels ────────────────────────────────────
 *
 * Strip internal `__meta_*` bookkeeping labels and normalise an environment
 * label to lowercase — common pre-storage cleanup.
 */
const labeldropLowercase: RelabelExample = {
  id: 'labeldrop-lowercase',
  label: 'labeldrop + lowercase',
  configs: `# Normalise the environment label to lowercase.
- source_labels: [environment]
  action: lowercase
  target_label: environment

# Remove all leftover discovery metadata labels.
- action: labeldrop
  regex: __meta_.+`,
  labels: `__name__="up", job="web", environment="PRODUCTION", __meta_kubernetes_namespace="default", __meta_kubernetes_pod_name="web-7d9"`,
};

/* (f) ─ replace deletes a label when the expansion is empty ────────────────────
 *
 * A subtle but real Prometheus behaviour: a `replace` whose expanded value is
 * the empty string DELETES the target label rather than setting it blank. Here
 * an empty `instance` annotation removes the `instance` label entirely.
 */
const replaceEmptyDeletes: RelabelExample = {
  id: 'replace-empty-deletes',
  label: 'replace: empty value deletes label',
  configs: `# When the source is empty, the expanded replacement is empty,
# so Prometheus DELETES the target label instead of setting it blank.
- source_labels: [tmp_instance]
  action: replace
  regex: (.+)
  target_label: instance
  replacement: $1`,
  labels: `instance="old-value", tmp_instance="", job="api"`,
};

export const examples: RelabelExample[] = [
  k8sKeepLabelmap,
  replaceAddress,
  dropMetric,
  hashmodShard,
  labeldropLowercase,
  replaceEmptyDeletes,
];

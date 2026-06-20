---
title: "Why Did Prometheus Drop My Target? Debugging relabel_configs"
description: "A target vanished or a label disappeared after relabeling. Debug Prometheus relabel_configs vs metric_relabel_configs, regex anchoring and keep/drop logic."
pubDate: 2026-06-16
tags: ["prometheus","observability","relabeling"]
relatedTool:
  name: "Prometheus Relabel Tester"
  href: "/prometheus-relabel-tester"
---

![Debugging a dropped Prometheus target: the scrape lifecycle from service discovery through relabel_configs to the TSDB, with a target highlighted as dropped.](/blog/debug-prometheus-relabeling-hero.svg)

You added a new exporter, reloaded Prometheus, opened `/targets`, and it isn't there. No error in the logs. The scrape config parsed fine. The exporter is up and you can `curl` its `/metrics` by hand. But Prometheus dropped your target and won't tell you why. Or worse — the target shows up, but a label you depend on for routing or dashboards has silently disappeared. Both symptoms almost always trace back to one place: `relabel_configs`. This post walks through how to debug `relabel_configs`, where it differs from `metric_relabel_configs`, and the handful of mistakes that account for nearly every dropped target.

## The symptom: a missing target in /targets, or a label that vanished

There are two distinct failures and it helps to name them before you start digging.

The first is the **dropped target**: it never appears under `/targets` at all, not even in a "down" state. Service discovery found it, but a `keep` or `drop` rule removed it before the scrape ran. Prometheus does not log this — from its point of view, nothing went wrong.

The second is the **disappearing label**: the target scrapes fine, but a label you expected is gone, or got overwritten with something unexpected. You see this in `/targets` (hover the labels) or by querying the series and noticing the dimension you wanted to group by isn't there.

```bash
# The target you expect is simply absent from the list:
curl -s localhost:9090/api/v1/targets | jq '.data.activeTargets[].labels.job'
# "node-exporter"
# "blackbox"
#   ← your "api" job never shows up
```

When a target is silently absent, the cause is upstream of the scrape. That's relabeling. The good news: relabeling is deterministic. Given the same input labels and the same rules, you get the same outcome every time, which means you can reproduce it offline.

## relabel_configs vs metric_relabel_configs: where each one runs

The two config blocks apply the *exact same* relabeling actions and semantics. The only difference is **where** in the scrape lifecycle they run — and that difference decides which symptom you're debugging.

`relabel_configs` runs **at scrape time, before the scrape**, on the target labels coming from service discovery. These are the labels that decide *whether a target gets scraped at all* and what its identity (`job`, `instance`, `__address__`) is. A `keep`/`drop` here removes a whole target. This is the block to inspect when a target is missing from `/targets`.

`metric_relabel_configs` runs **after the scrape**, on every sample's label set as it's ingested. A `keep`/`drop` here removes individual time series, not the target. This is the block to inspect when the target is present but specific series or labels are missing.

![The Prometheus scrape lifecycle showing service discovery and __meta_ labels, then relabel_configs which can drop a whole target, then the scrape, then metric_relabel_configs which can drop individual samples, then the TSDB.](/blog/debug-prometheus-relabeling-diagram.svg)

```yaml
scrape_configs:
  - job_name: api
    kubernetes_sd_configs:
      - role: pod

    # Runs BEFORE the scrape, on discovery labels (__meta_*, __address__).
    # A keep/drop here removes the whole target.
    relabel_configs:
      - source_labels: [__meta_kubernetes_pod_annotation_prometheus_io_scrape]
        action: keep
        regex: "true"

    # Runs AFTER the scrape, on each sample. A drop here removes series,
    # not the target.
    metric_relabel_configs:
      - source_labels: [__name__]
        action: drop
        regex: go_gc_.*
```

If your target is missing, you never reach `metric_relabel_configs` — debug `relabel_configs` first. If the target is present but a series is gone, it's the other block. Getting this distinction right is half the battle when you're searching "metric_relabel_configs vs relabel_configs" at 2 a.m.

## The usual suspects

Almost every dropped target comes from one of these. Each is easy to make and invisible until you reproduce it.

### A keep regex that does not match (because the regex is anchored)

This is the number-one cause. **Prometheus anchors every relabel regex** — internally it wraps your pattern as `^(?:<your regex>)$`. The pattern must match the *entire* joined source value, not a substring.

```yaml
- source_labels: [job]
  action: keep
  regex: api          # anchored to ^(?:api)$
```

This keeps a target whose `job` is exactly `api`. It does **not** keep `api-server`, `api-prod`, or `payments-api`. With a `keep` action, anything that fails to match is dropped — so your `api-server` target silently vanishes. The fix is to match what you actually mean:

```yaml
- source_labels: [job]
  action: keep
  regex: api.*        # ^(?:api.*)$ — matches api, api-server, api-prod
```

### A drop that is too broad

The mirror image. An unanchored mental model plus a greedy regex catches more than intended:

```yaml
- source_labels: [__name__]
  action: drop
  regex: .*_bucket   # drops EVERY *_bucket series, including ones you need
```

`keep` is an allow-list gate; `drop` is a deny-list gate. A too-broad `drop` in `metric_relabel_configs` quietly deletes series you wanted to keep, and you only notice when a dashboard goes blank.

### Wrong source_labels, or the wrong join

When a rule lists multiple `source_labels`, Prometheus joins their values with the **separator** — which defaults to a single semicolon `;` — *before* matching the regex. If you forget the separator, your regex never matches the joined string:

```yaml
# job="api", instance="10.0.0.1:9090" joins to "api;10.0.0.1:9090"
- source_labels: [job, instance]
  action: keep
  regex: api          # ✗ never matches "api;10.0.0.1:9090"
```

You need a regex that accounts for the `;`, e.g. `api;.*`. A missing source label isn't an error either — Prometheus treats an absent label as the empty string when joining, so `source_labels: [does_not_exist]` joins to `""` and a `keep: regex: ".+"` drops everything.

### A replacement that overwrote __address__ (or deleted a label)

`replace` has a subtle, real behavior: **if the regex doesn't match, the label is left unchanged; but if it matches and the expanded replacement is the empty string, the target label is deleted, not set to blank.** Overwrite `__address__` with an empty value and the target effectively loses its scrape address.

```yaml
# If prometheus_io_port is absent, the joined value won't match this regex,
# so __address__ is left alone. But a regex that DOES match and expands to ""
# would DELETE __address__ entirely.
- source_labels: [__address__, __meta_kubernetes_pod_annotation_prometheus_io_port]
  action: replace
  regex: ([^:]+)(?::\d+)?;(\d+)
  replacement: $1:$2
  target_label: __address__
```

This is the most insidious one, because an empty `instance` or `__address__` doesn't throw — it just produces a target that can't be scraped or that collides with another.

## A debugging workflow

When a target is missing, work top-down. The whole point is to recover the *exact input* the rules saw, then replay the rules against it.

### 1. Dump the target labels, including __meta_

Prometheus exposes the pre-relabel discovery labels — the `__meta_*` labels — but only for targets that survived relabeling, so a fully dropped target won't appear. The trick is to reload with the relabel rules temporarily removed (or pared down to a single permissive `keep`), then read the raw discovery labels:

```bash
# Show discovered labels for the job, including the __meta_* set the
# relabel rules actually see as input.
curl -s 'localhost:9090/api/v1/targets?state=active' \
  | jq '.data.activeTargets[]
        | select(.discoveredLabels.job=="api")
        | .discoveredLabels'
```

`discoveredLabels` is the input to your `relabel_configs`. `labels` is the output. If a target is dropped entirely, you can also read the service discovery state directly:

```bash
curl -s localhost:9090/api/v1/targets/metadata >/dev/null  # sanity check API is up
curl -s 'localhost:9090/service-discovery' # the SD page shows pre-relabel labels
```

### 2. Test the rules against those labels

Now you have the input. Paste the `__meta_*` labels and your `relabel_configs` into [the Prometheus Relabel Tester](/prometheus-relabel-tester) and run them. It applies the rules exactly the way Prometheus does — anchored regex, `;` separator, `$1`/`${1}` expansion — and tells you, per label set, the resulting labels, which ones were added, changed, or removed, and whether the target was dropped (and by which rule).

### 3. Bisect the rule list

If you have a long chain, comment out the second half of the rules and re-run. If the target survives, the culprit is in the half you removed; if it still drops, it's in the half that's left. Halve again. Because relabeling is a deterministic top-to-bottom chain — each rule sees the output of the one before it — bisection converges fast, usually in two or three rounds.

## Worked example: the disappearing target, found and fixed

Here's a real shape of this bug. You discover a pod, want to keep only opted-in pods, and route by environment. The target never shows up.

```yaml
relabel_configs:
  - source_labels: [__meta_kubernetes_pod_annotation_prometheus_io_scrape]
    action: keep
    regex: "true"

  - source_labels: [__meta_kubernetes_pod_label_env]
    action: keep
    regex: prod
```

The discovery labels for the target you expected:

```text
__meta_kubernetes_pod_annotation_prometheus_io_scrape="true"
__meta_kubernetes_pod_label_app="api"
__meta_kubernetes_pod_label_env="production"
__address__="10.0.0.5:8080"
```

Run that input through the rules. The first `keep` passes — `prometheus_io_scrape` is exactly `"true"`. The second `keep` joins to `production` and tries to match `^(?:prod)$`. It doesn't. `production` is not `prod`, the regex is anchored, and `keep` drops anything that fails to match. **Rule 2 dropped the target.** The tester flags exactly that: dropped by rule 2, action `keep`.

The fix is to match the real value:

```yaml
  - source_labels: [__meta_kubernetes_pod_label_env]
    action: keep
    regex: prod.*       # ^(?:prod.*)$ — now matches "production"
```

Re-run. The target survives, carries `__address__="10.0.0.5:8080"`, and appears in `/targets`. Total time: under a minute, with no Prometheus reload and no waiting on a scrape interval.

While you're cleaning up, the same chain often promotes pod labels and prunes discovery metadata. Note that `labelmap` operates on label *names*, copying matching labels to a new name, and `labeldrop` removes labels whose names match — useful, but another place a label you wanted can quietly disappear:

```yaml
  # Promote pod labels: __meta_kubernetes_pod_label_app="api" → app="api"
  - action: labelmap
    regex: __meta_kubernetes_pod_label_(.+)

  # Strip leftover discovery metadata before storage.
  - action: labeldrop
    regex: __meta_.+
```

## Catch it before deploy

The fastest debugging loop is the one that never reaches a live Prometheus. The reason relabeling is so easy to get wrong is that it fails silently: there's no parse error, no log line, just a target that isn't there. The only honest check is to run the rules against representative input and read the output — the same idea behind testing any behavioral config rather than trusting a schema lint.

When you're staring at a "prometheus dropped target" mystery or a "prometheus label disappeared" report, grab the `discoveredLabels` from the API, paste them with your rules into [the Prometheus Relabel Tester](/prometheus-relabel-tester), and watch which rule does the damage — it runs entirely in your browser, so internal scrape configs and target metadata never leave your tab.

Once the labels are right, the rest of the observability chain follows. Break down a query that depends on those labels with [the PromQL Explainer](/promql-explainer), or confirm an alert on the resulting series lands in the right place with [the Alertmanager Route Tester](/alertmanager-route-tester). Shape the labels first; everything downstream depends on getting that step correct.

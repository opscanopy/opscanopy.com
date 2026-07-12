---
title: "Prometheus relabel_configs Explained: A Practical Guide"
description: "Understand Prometheus relabel_configs end to end — source_labels, regex, replacement and every action (replace, keep, drop, labelmap, hashmod) — with copy-paste recipes."
pubDate: 2026-06-13
tags: ["prometheus","observability","relabeling"]
relatedTool:
  name: "Prometheus Relabel Tester"
  href: "/prometheus-relabel-tester"
---

![Diagram of a Prometheus relabel_configs pipeline showing source_labels joined into a value, matched against an anchored regex, and an action like replace, keep, drop, labelmap or hashmod rewriting the output labels.](/blog/prometheus-relabel-configs-explained-hero.svg)

A target you expected to scrape never shows up in Prometheus. No error in the logs, no failed scrape, nothing red on the targets page — the series just isn't there. You add `--log.level=debug`, restart, squint at the output, and eventually find it: a `keep` rule three lines into your `relabel_configs` quietly dropped the target because the regex didn't match the way you assumed. That silent failure is the whole reason `relabel_configs` deserves a careful read. Prometheus relabeling rewrites, keeps, or drops targets and their labels, and when it's wrong it doesn't complain — it just discards your metrics.

This guide walks through Prometheus relabeling from the ground up: what it does, the fields every rule is built from, and each action with a small example. The semantics here match exactly what the engine in the [Prometheus Relabel Tester](/prometheus-relabel-tester) implements, so you can paste any snippet below into it and watch the labels change.

## What relabeling actually does

Relabeling runs over a label set and produces a new label set. That's it. Every target Prometheus discovers arrives as a bag of labels — its address, its job, and a pile of `__meta_*` labels from service discovery. Before the scrape happens, your `relabel_configs` rules run top to bottom over those labels. Each rule sees the output of the one before it.

A rule can do one of three things to that label set:

- **Rewrite** a label (or create one) — `replace`, `labelmap`, `lowercase`, `uppercase`, `hashmod`.
- **Drop the whole target** so it's never scraped — `keep`, `drop`, `keepequal`, `dropequal`.
- **Remove individual labels** by name — `labeldrop`, `labelkeep`.

```yaml
scrape_configs:
  - job_name: api
    static_configs:
      - targets: ["10.0.0.5:8080"]
    relabel_configs:
      - source_labels: [__address__]
        target_label: instance
```

After this rule runs, the target carries an `instance` label copied from `__address__`. Nothing errored, nothing was dropped — one label was rewritten. That is the entire job of relabeling, repeated rule by rule.

There are two places relabeling runs. `relabel_configs` runs *before* the scrape, on the target's discovery labels, and can keep or drop whole targets. `metric_relabel_configs` runs *after* the scrape, on every sample's labels, and is used to drop or rewrite individual time series. Same actions, same semantics — only the timing and the input differ.

## The building blocks: source_labels, separator, regex, modulus, target_label, replacement, action

Every relabel rule is assembled from the same handful of fields. Most have defaults, so a rule rarely sets all of them.

```yaml
- source_labels: [job, instance]   # which label values to read
  separator: ";"                   # how to join them (default ";")
  regex: "(.*);(.*)"               # pattern to match the joined value (default "(.*)")
  modulus: 8                       # only for hashmod
  target_label: combined           # label to write (required by some actions)
  replacement: "$1-$2"             # value to write, with $1/${1} expansion (default "$1")
  action: replace                  # what to do (default "replace")
```

Here's how a rule processes that. Prometheus reads each name in `source_labels`, looks up its value (a missing label reads as the empty string), and joins them with `separator`. The default separator is a single semicolon, so `source_labels: [job, instance]` on `job="api"`, `instance="10.0.0.1:9090"` produces the joined value `api;10.0.0.1:9090`.

That joined value is matched against `regex`. The one detail that catches everyone: **the regex is fully anchored**. Prometheus wraps your pattern as `^(?:your-regex)$`, so it must match the *entire* joined value, not just part of it.

```yaml
# This does NOT match "api-server" — the regex must match the whole value.
- source_labels: [job]
  regex: api
  action: keep
```

A `regex: api` rule will not keep a target whose `job` is `api-server`, because `^(?:api)$` only matches the literal string `api`. You'd need `api.*` or `(api.*)`. This single fact explains the majority of "my target vanished" mysteries.

When the regex matches and the action writes a label, `replacement` supplies the value. Capture groups expand as `$1`, `${1}`, or named groups `$name`/`${name}`; the default replacement is `$1`, which is why a bare `replace` with `regex: (.*)` copies the source value through unchanged. `modulus` is only read by `hashmod`, and `target_label` is required by `replace`, `hashmod`, `lowercase`, `uppercase`, `keepequal`, and `dropequal`.

![Synthwave illustration of a relabel rule: source_labels flow into an anchored regex, the $1:$2 replacement expands, and actions like replace, keep, labelmap and hashmod rewrite the labels.](/blog/in-content/prometheus-relabel-configs-explained.webp)

## The actions one by one: replace, keep, drop, labelmap, labelkeep, labeldrop, hashmod

Prometheus supports eleven actions. Each example below is a complete, runnable rule.

### replace

Join the source labels, match the regex, expand `$1`/`${1}` in `replacement`, and set `target_label`.

```yaml
- source_labels: [__address__]
  regex: "([^:]+):.*"
  target_label: ip
  replacement: "$1"
```

`__address__="10.0.0.5:8080"` becomes a new label `ip="10.0.0.5"`. If the regex doesn't match, the label set is left unchanged. There's a sharp edge worth memorizing: **if the expanded replacement is the empty string, `replace` deletes the target label** instead of setting it to blank.

```yaml
# When tmp_instance is empty, this DELETES the instance label.
- source_labels: [tmp_instance]
  regex: "(.+)"
  target_label: instance
  replacement: "$1"
```

On `instance="old"`, `tmp_instance=""`, the regex `(.+)` fails to match an empty value, so nothing happens — `instance` survives. But change the source so the expansion lands on an empty string and the `instance` label disappears entirely. That asymmetry is a frequent source of "where did my label go?"

### keep

Drop the whole target unless the joined source matches the regex.

```yaml
- source_labels: [__meta_kubernetes_pod_annotation_prometheus_io_scrape]
  action: keep
  regex: "true"
```

Only pods annotated `prometheus.io/scrape: "true"` survive; everything else is dropped before scraping. `keep` is an allow-list gate.

### drop

The mirror of `keep`: drop the target when the joined source *does* match.

```yaml
- source_labels: [__name__]
  action: drop
  regex: "go_gc_.*"
```

Used in `metric_relabel_configs`, this silences the entire `go_gc_*` metric family before it's stored. `drop` is a deny-list gate.

### labelmap

`labelmap` operates on label **names**, not values. For every label whose name matches the regex, it sets a new label — named by the expanded replacement — to that label's value.

```yaml
- action: labelmap
  regex: "__meta_kubernetes_pod_label_(.+)"
```

A label `__meta_kubernetes_pod_label_app="api"` produces a new label `app="api"`. This is the canonical move for promoting Kubernetes pod labels to plain labels. The default `replacement` of `$1` is what writes the captured suffix as the new name.

### labelkeep / labeldrop

Both filter labels by name. `labeldrop` removes every label whose name matches; `labelkeep` removes every label whose name does *not* match.

```yaml
# Strip all leftover service-discovery metadata.
- action: labeldrop
  regex: "__meta_.+"
```

```yaml
# Keep only the four labels you care about; drop everything else.
- action: labelkeep
  regex: "(__name__|job|instance|severity)"
```

### hashmod

`hashmod` sets `target_label` to a stable shard number. It takes the MD5 of the joined source, reads the last 8 bytes of that digest as a big-endian 64-bit integer, and stores `hash % modulus`.

```yaml
- source_labels: [__address__]
  action: hashmod
  modulus: 3
  target_label: __tmp_shard
```

Every target gets a deterministic `__tmp_shard` value of `0`, `1`, or `2`. The MD5 recipe matters: the Relabel Tester reproduces this exact byte-for-byte, so the shard values it shows are the values Prometheus will compute.

### keepequal / dropequal

These two take no regex. They compare the joined source value to the *current value* of `target_label` and keep or drop on equality.

```yaml
# Drop the target if its port already equals the discovered one.
- source_labels: [__meta_port]
  action: dropequal
  target_label: port
```

`keepequal` keeps only when the two are equal; `dropequal` drops when they're equal.

### lowercase / uppercase

Set `target_label` to the lower- or upper-cased joined source value — handy for normalizing case-inconsistent discovery labels.

```yaml
- source_labels: [environment]
  action: lowercase
  target_label: environment
```

`environment="PRODUCTION"` becomes `environment="production"`.

## __meta_ labels from service discovery and why they matter

Every service discovery mechanism — Kubernetes, EC2, Consul, file-based — attaches `__meta_*` labels to each target it finds. These are *only* available during `relabel_configs`. They are stripped before the scrape, so if you want any of that metadata to survive as a real label, you have to copy it out with `replace` or `labelmap` first.

![The relabel pipeline for one rule: input labels, join the source_labels with the separator, match the regex, apply the action, and produce the output labels.](/blog/prometheus-relabel-configs-explained-diagram.svg)

A Kubernetes pod target arrives looking roughly like this:

```text
__address__="10.0.0.5:8080"
__meta_kubernetes_namespace="default"
__meta_kubernetes_pod_name="api-7d9f"
__meta_kubernetes_pod_label_app="api"
__meta_kubernetes_pod_annotation_prometheus_io_scrape="true"
__meta_kubernetes_pod_annotation_prometheus_io_port="9100"
```

The `__meta_*` labels are why relabeling exists at all. They carry the discovery context — which namespace, which annotations, which pod labels — that you turn into scrape decisions (`keep` on the scrape annotation) and into durable labels (`labelmap` the pod labels). Anything starting with a double underscore is internal and dropped after relabeling, with `__name__` (the metric name) being the notable one that survives into storage. Because these labels only exist at relabel time, the only safe way to confirm a rule reads them correctly is to feed a realistic `__meta_*` set through your rules and look at the output.

## Recipes you will reuse

These are the patterns that show up in almost every real scrape config.

### Keep only prod targets

```yaml
- source_labels: [__meta_kubernetes_namespace]
  action: keep
  regex: "prod|production"
```

Anchored, so `prod` matches the namespace `prod` exactly and `staging-prod` would *not* match unless you write `.*prod.*`. The `|` alternation keeps both naming conventions.

### Drop noisy metrics (metric_relabel_configs)

```yaml
metric_relabel_configs:
  - source_labels: [__name__]
    action: drop
    regex: "go_gc_.*|process_.*"
```

Runs after the scrape, dropping high-cardinality families before they hit storage.

### hashmod sharding

The two-rule horizontal sharding pattern — hash into a temp label, then keep only the shard this Prometheus owns:

```yaml
- source_labels: [__address__]
  action: hashmod
  modulus: 3
  target_label: __tmp_shard

- source_labels: [__tmp_shard]
  action: keep
  regex: "0"
```

Run this against four sample addresses in the tester and you'll see exactly which two or three land on shard `0` and survive — the others are dropped, marked with the rule and action responsible.

### Map SD labels with labelmap, then rewrite the address

```yaml
# Promote every pod label to a plain label.
- action: labelmap
  regex: "__meta_kubernetes_pod_label_(.+)"

# Rebuild __address__ from the IP and an annotated port.
- source_labels: [__address__, __meta_kubernetes_pod_annotation_prometheus_io_port]
  action: replace
  regex: "([^:]+)(?::\\d+)?;(\\d+)"
  replacement: "$1:$2"
  target_label: __address__
```

The second rule shows the joined-source idiom in action: two `source_labels` joined by the default `;` separator, with a regex written to account for that separator. `__address__="10.0.2.4:8080"` joined with port `9100` becomes `10.0.2.4:8080;9100`, the regex captures `10.0.2.4` and `9100`, and the address is rebuilt as `10.0.2.4:9100`.

## Test before you ship

Relabeling is the one part of a Prometheus config where being almost right produces no error and no warning — just missing or wrong series. The regex anchoring, the empty-replacement deletion, the MD5 hashmod, the join order of multiple `source_labels`: each is easy to get subtly wrong, and a live Prometheus won't tell you which one bit you.

Paste the recipes from this post, with a realistic set of `__meta_*` labels, into the [Prometheus Relabel Tester](/prometheus-relabel-tester) and you'll see the joined value, the matched (or unmatched) regex, the per-label diff, and a clear flag — naming the rule and action — whenever a target is dropped. It runs entirely in your browser, so you can safely paste internal scrape configs.

Once the labels are shaped the way you want, the next questions are what you query and how you alert. Break down an expression with [the PromQL Explainer](/promql-explainer), or if you're moving rules between Loki and Prometheus, translate them with [the LogQL ↔ PromQL Helper](/logql-promql-helper). Get the labels right first — everything downstream depends on them.

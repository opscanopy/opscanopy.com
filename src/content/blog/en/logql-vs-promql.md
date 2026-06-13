---
title: "LogQL vs PromQL: the same query in both languages"
description: "LogQL borrows PromQL’s shape but starts from log lines, not metrics. Here is how the two query languages line up, where they translate cleanly, and where they simply don’t."
pubDate: 2026-06-05
tags: ["logql", "promql", "observability"]
relatedTool:
  name: "LogQL ↔ PromQL Helper"
  href: "/logql-promql-helper"
---

If you’ve written Prometheus queries, Grafana Loki’s LogQL looks reassuringly familiar — `rate(...)`, `sum by (...)`, `[5m]` range vectors, the same comparison operators. That familiarity is deliberate, and it’s genuinely useful: a lot of PromQL muscle memory transfers directly. But the two languages start from different raw material, and the moment you forget that, your translation breaks in ways that are hard to spot. PromQL queries a **metrics** database. LogQL queries **log lines** and turns them into metrics on the fly. Everything that maps cleanly, and everything that doesn’t, follows from that one difference.

## The two halves of LogQL

Every LogQL query begins with a **log selector** and an optional **pipeline** — the part that has no PromQL equivalent because PromQL never touches raw logs:

```logql
{app="api", env="prod"} |= "panic" | logfmt | level="error"
```

That selects the `api`/`prod` stream, keeps lines containing `panic`, parses them as logfmt, then filters to `level=error`. The result is still a set of log lines. To get something you can graph or alert on — a number over time — you wrap it in a **metric query**:

```logql
sum by (app) (count_over_time({app="api", env="prod"} |= "panic" | logfmt | level="error" [5m]))
```

Only the outer half of that expression resembles PromQL. The inner `{...} |= ... | logfmt | ...` part is pure Loki, and it’s where most translation effort actually goes.

## Where LogQL and PromQL line up

The aggregation layer is where the languages converge, and the correspondences are close to one-to-one.

A PromQL counter rate:

```promql
sum by (status) (rate(http_requests_total{job="api"}[5m]))
```

The LogQL shape that answers the same question from logs:

```logql
sum by (status) (rate({job="api"} | logfmt [5m]))
```

The aggregation operators (`sum`, `avg`, `min`, `max`, `count`, `topk`, `quantile`) and the `by` / `without` grouping clauses behave identically. Comparison operators (`>`, `<`, `==`, `!=`) and binary arithmetic work the same way, which is why an alert threshold ports over almost verbatim:

```promql
# PromQL: more than 10 errors/sec
sum(rate(http_requests_total{status=~"5.."}[5m])) > 10
```

```logql
# LogQL: more than 10 error lines/sec
sum(rate({job="api"} | logfmt | status=~"5.." [5m])) > 10
```

Loki’s `_over_time` family also mirrors Prometheus’s range functions where the concept survives: `count_over_time`, `rate`, `bytes_rate`, `avg_over_time`, `max_over_time`, `quantile_over_time`. If you’ve used `avg_over_time(metric[5m])` in PromQL, the unwrapped LogQL form reads the same once you’ve extracted a numeric value to operate on.

## Where they diverge — and why a literal port fails

The traps cluster around the half of LogQL that PromQL doesn’t have.

**`rate` means two different things.** In PromQL, `rate(counter[5m])` accounts for counter resets — it’s built for monotonically increasing series. In LogQL, `rate({...}[5m])` is per-second **line count**, with no reset semantics, because log lines don’t reset. The keyword matches; the meaning doesn’t. If you reach for `increase()` expecting PromQL counter behaviour, there’s simply nothing to increase.

**You must extract a value before you can do math on it.** PromQL samples are already numbers. Loki lines are text, so any aggregation over a *value* (latency, bytes, a numeric field) needs a parser plus `unwrap`:

```logql
quantile_over_time(0.99, {job="api"} | logfmt | unwrap duration_seconds [5m]) by (route)
```

There is no PromQL counterpart to `| logfmt`, `| json`, `| pattern`, or `| unwrap` — they exist precisely because the input is unstructured. Translating *from* PromQL means inventing this extraction step; translating *to* PromQL means deleting it and assuming a metric already exists.

**Selector syntax overlaps but isn’t interchangeable.** Both use `{label="value"}` with `=`, `!=`, `=~`, `!~`. But a PromQL selector names a metric and matches series labels; a Loki stream selector names log streams and *must* match at least one indexed stream label. A line filter like `|= "text"` has no PromQL analogue at all — the closest PromQL gets is matching on a label value, never on free text inside a sample.

**High-cardinality fields behave differently.** In PromQL, grouping by a high-cardinality label is usually a metrics-design smell. In LogQL, extracted pipeline labels (from `logfmt`/`json`) are computed at query time and aren’t indexed, so `by (user_id)` is feasible in a way it rarely is in Prometheus — at a real cost in query throughput, but without the storage explosion. The mental model for what’s “expensive” doesn’t transfer.

## A practical translation checklist

When you move a query between the two languages, walk these in order:

1. **Identify the metric layer.** Strip the PromQL query down to its aggregation (`sum by (...) (rate(...))`); that part ports almost as-is.
2. **Reconstruct the input.** In LogQL, replace the metric name with a `{stream}` selector plus the line filters and parser (`| logfmt`, `| json`) needed to get to the same data.
3. **Add `unwrap` for value math.** Any average, quantile, or sum over a number — not a line count — needs an extracted, unwrapped field.
4. **Re-check `rate` semantics.** Decide whether you mean per-second line count (Loki) or counter rate (Prometheus). They are not the same number.
5. **Accept that some things won’t map.** `histogram_quantile` over native Prometheus histograms, counter `resets()`, and recording-rule-backed series have no clean LogQL form — and free-text line filters have no PromQL form.

## Translate it without the guesswork

Holding both dialects in your head at once is exactly the kind of context-switching that produces silent bugs — a `rate` that means the wrong thing, a missing `unwrap`, a selector that compiles but matches nothing. The **LogQL ↔ PromQL Helper** does the mechanical part for you: paste a query in either language, get the closest equivalent in the other, plus explicit notes on what mapped cleanly and what couldn’t. It runs entirely in your browser — your queries never leave the device — so you can sanity-check a translation before it lands in a dashboard or an alert rule.

[Open the LogQL ↔ PromQL Helper →](/logql-promql-helper)

---
title: "How to read a PromQL query"
description: "A PromQL query is read from the inside out, not left to right. Learn the four layers — selectors, ranges, functions and aggregations — so you can decode any Prometheus expression at a glance."
pubDate: 2026-06-08
tags: ["promql", "prometheus", "observability"]
relatedTool:
  name: "PromQL Explainer"
  href: "/promql-explainer"
---

![How to read a PromQL query: decoding Prometheus selectors, ranges, functions and aggregations inside-out](/blog/reading-promql-hero.svg)

PromQL looks dense the first time you meet it. A line like `histogram_quantile(0.99, sum by (le, route) (rate(http_request_duration_seconds_bucket[5m])))` reads like one long word, and the instinct is to scan it left to right like a sentence. That’s the wrong direction. PromQL is a functional language, so the meaning flows from the **innermost** expression outward — the same way you’d evaluate a nested formula in maths. Once you read it inside-out, almost every query decomposes into the same four layers.

## The four layers

Nearly every non-trivial PromQL expression is built from these, stacked from the inside out:

1. **A selector** — which series you start from.
2. **A range** — over what window of time (only when you need history, not an instant).
3. **A function** — what transformation you apply to those samples.
4. **An aggregation** — how you collapse many series into fewer.

Read them in that order and the query explains itself.

![A PromQL query decomposed into metric name, label matcher, range selector, rate function and aggregation](/blog/reading-promql-diagram.svg)

## Layer 1: the selector

The core of any query is a **metric selector**: a metric name plus optional label matchers in braces.

```promql
http_requests_total{job="api", status=~"5.."}
```

This selects every series named `http_requests_total` where the `job` label equals `api` and the `status` label matches the regex `5..` (any 5xx code). The matchers are the important part:

- `=` exact match
- `!=` not equal
- `=~` regex match
- `!~` regex does not match

On its own a selector returns an **instant vector** — one current sample per matching series. That distinction matters for everything that follows.

## Layer 2: the range

Append a duration in square brackets and the selector becomes a **range vector** — every sample in that window, per series, not just the latest one.

```promql
http_requests_total{job="api"}[5m]
```

You can’t graph a range vector directly; it’s raw material. You hand it to a function that knows what to do with a window of samples. The classic example is `rate`:

```promql
rate(http_requests_total{job="api"}[5m])
```

`rate` looks at the counter’s samples over the last 5 minutes and returns the per-second average rate of increase. This is the single most common pattern in Prometheus, and it’s worth internalising why it exists: `http_requests_total` is a **counter** that only ever goes up (until a restart resets it), so its raw value is meaningless on a dashboard. The rate of change is what you actually care about. `rate` also transparently handles counter resets, which is why you should never compute rates by hand.

A short note on window sizing: the range (`[5m]`) should comfortably cover at least a few scrape intervals. Too short and you get noisy, gappy results; too long and you smooth away the spikes you were trying to catch.

## Layer 3: functions

Functions transform vectors. The ones you’ll see constantly:

- `rate(...)` — per-second average rate of a counter over a range.
- `irate(...)` — instant rate from the last two samples; spikier, good for fast-moving graphs.
- `increase(...)` — total increase over the range (essentially `rate × seconds`).
- `histogram_quantile(φ, ...)` — estimates a quantile (e.g. p99) from histogram buckets.
- `rate(...[5m]) > 0` style comparisons — filtering, covered below.

So `rate(http_requests_total{job="api", status=~"5.."}[5m])` reads, inside-out, as: *take the 5xx request counter for the api job, over a 5-minute window, and give me the per-second error rate, per series.*

## Layer 4: aggregation

A selector with a `job` and a `status` label can still match dozens of series — one per instance, per pod, per status code. Aggregation operators collapse them.

```promql
sum by (job) (rate(http_requests_total{status=~"5.."}[5m]))
```

`sum by (job)` adds up the per-series rates, keeping **only** the `job` label and discarding the rest. The result is one error-rate line per job. The two clauses to know:

- `by (labels)` — keep these labels, aggregate away everything else.
- `without (labels)` — aggregate away these labels, keep everything else.

Other aggregators follow the same grammar: `avg`, `max`, `min`, `count`, `topk`, `quantile`. The mental model never changes — *combine many series into fewer, grouped by the labels I name.*

## Putting it together

Now the intimidating query from the top decomposes cleanly. Read it from the inside out:

```promql
histogram_quantile(
  0.99,
  sum by (le, route) (
    rate(http_request_duration_seconds_bucket[5m])
  )
)
```

1. `http_request_duration_seconds_bucket[5m]` — the latency histogram buckets, over 5 minutes.
2. `rate(...)` — per-second rate of each bucket, so resets and scaling are handled.
3. `sum by (le, route) (...)` — add the rates across instances, keeping `le` (the bucket boundary, required by the next step) and `route`.
4. `histogram_quantile(0.99, ...)` — estimate the 99th-percentile latency from those buckets, per route.

In plain English: **the p99 request latency per route over the last 5 minutes.** One layer at a time, it’s not dense at all.

## A few traps worth knowing

- **Aggregating before rate-ing.** `rate(sum(...))` is almost always a bug. Take the `rate` first, then `sum` — summing counters across resets gives nonsense. The correct shape is `sum(rate(...))`.
- **Dropping `le`.** `histogram_quantile` needs the `le` label intact, so your `by (...)` clause must include it.
- **Comparisons filter, they don’t just colour.** `rate(...)[5m]) > 0` doesn’t return booleans — it *drops* every series where the condition is false. That’s how you build alert expressions.
- **Instant vs range mismatch.** Passing an instant vector where a function wants a range vector (or vice versa) is the most common parse error. If a function complains, check your brackets.

## Decode any query in seconds

The inside-out method works on every PromQL expression you’ll meet, but pulling apart a deeply nested production query by hand is still tedious — and easy to get subtly wrong under pressure. That’s exactly what the **PromQL Explainer** is for: paste any Prometheus query and get a plain-English, layer-by-layer breakdown of its selectors, ranges, functions, aggregations and comparisons. Everything runs client-side, so your queries never leave the browser.

Next time a dashboard panel or alert rule leaves you squinting, don’t guess at it.

[Explain a PromQL query →](/promql-explainer)

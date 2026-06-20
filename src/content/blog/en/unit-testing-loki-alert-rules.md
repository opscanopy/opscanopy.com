---
title: "Unit Testing Loki Alert Rules: the gap promtool leaves"
description: "Prometheus has promtool test rules. Loki has nothing equivalent. Here is why testing LogQL alert rules matters, what a Loki rule unit test should look like, and how to close the gap today."
pubDate: 2026-04-15
tags: ["loki", "observability", "testing"]
relatedTool:
  name: "AlertLint"
  href: "/loki-alert-rule-tester"
---

![Unit testing Loki alert rules: a promtool-style test loop for LogQL alerting rules](/blog/unit-testing-loki-alert-rules-hero.svg)

If you run Prometheus, you already have a safety net for your alerting logic: `promtool test rules`. You feed it a series of synthetic samples, declare what should fire and when, and CI tells you the moment a refactor breaks an alert. It’s the difference between catching a broken page rule in code review and discovering it during an incident.

Grafana Loki has no equivalent. You can write LogQL alerting and recording rules that look almost identical to their Prometheus cousins, load them into the ruler, and ship them — but there’s no first-class way to assert that a given stream of logs produces the alert you expect. The gap is real, it’s long-standing, and it’s exactly the kind of thing that bites you at 3&nbsp;a.m.

## Why promtool does not cover Loki

The instinctive move is to reach for `promtool` and point it at your Loki rules. It doesn’t work, and the reason is fundamental rather than cosmetic.

`promtool test rules` evaluates PromQL against a synthetic **time series** database. You describe metrics with the `series`/`values` syntax and the tool replays them through the rule engine. But a Loki alert rule doesn’t start from metrics — it starts from **log lines**. A rule like `count_over_time({app="api"} |= "panic" [5m]) > 0` has to run a LogQL pipeline (stream selector, line filter, label extraction, then a metric aggregation) over raw log entries before there’s any series to evaluate. promtool has no concept of a log stream, no LogQL parser, and no way to materialise the intermediate metrics the way Loki’s query engine does. Feeding it Loki rules either errors out or silently tests the wrong thing.

So the test surface that matters for Loki — “given these log lines, does this LogQL rule fire?” — is precisely the surface promtool can’t reach.

![A Loki alert rule unit test loop: synthetic log streams evaluated at a chosen time and asserted against the expected alerts](/blog/unit-testing-loki-alert-rules-diagram.svg)

## Why this matters

LogQL alert rules are deceptively easy to get subtly wrong:

- A line filter that matches more (or less) than you think because of an unescaped regex or a missing word boundary.
- A label that you `unwrap` or `label_format` incorrectly, so the aggregation groups the wrong way.
- A `[5m]` range and a `for: 10m` clause that interact so the alert never has enough data to fire, or fires far later than intended.
- A recording rule whose output series silently changes labels after a pipeline edit, breaking every downstream alert that selects on it.

None of these are caught by YAML linting or a schema check. They’re **behavioural** bugs, and the only honest way to catch them is to run the rule against representative input and assert on the output. Without a test harness, that verification happens manually, infrequently, and usually after something has already paged the wrong team — or failed to page the right one.

## What a Loki rule unit test should look like

The model promtool established is the right one; it just needs a log-shaped input. Instead of synthetic series, a Loki rule test should accept synthetic **streams** (a set of labels plus timestamped log lines), evaluate the rule at a chosen time, and assert on the alerts produced — something like this:

```yaml
# loki-rule-tests.yaml
tests:
  - name: panic in api logs fires PanicDetected
    # Synthetic log streams replayed through the LogQL engine.
    input_streams:
      - labels: '{app="api", env="prod"}'
        entries:
          - { ts: "2026-06-08T10:00:30Z", line: "level=info msg=ok" }
          - { ts: "2026-06-08T10:01:10Z", line: "level=error msg=panic: nil map" }
          - { ts: "2026-06-08T10:02:40Z", line: "level=error msg=panic: nil map" }

    # Evaluate the rule group at this instant.
    eval_time: 2026-06-08T10:05:00Z

    alert_rule_test:
      - alertname: PanicDetected
        # What we expect the ruler to emit at eval_time.
        exp_alerts:
          - exp_labels:
              app: api
              env: prod
              severity: critical
            exp_annotations:
              summary: "Panic detected in api"
```

The rule under test is the same rule you ship to the ruler:

```yaml
groups:
  - name: api-alerts
    rules:
      - alert: PanicDetected
        expr: |
          count_over_time({app="api", env="prod"} |= "panic" [5m]) > 1
        for: 0m
        labels:
          severity: critical
        annotations:
          summary: "Panic detected in {{ $labels.app }}"
```

Read together, the test says: given two panic lines in the five-minute window before `10:05`, the `count_over_time(...) > 1` expression should be true, and the ruler should emit a `PanicDetected` alert carrying `severity=critical` and the `app`/`env` labels from the stream. Flip the input to a single panic line, or move one entry outside the `[5m]` window, and `exp_alerts` becomes empty — the test now guards both the firing and the not-firing case.

This is the shape every team that has asked for it on the Loki tracker keeps describing — see the long-running requests in Loki issues [#7655](https://github.com/grafana/loki/issues/7655) and [#16659](https://github.com/grafana/loki/issues/16659), where the community has repeatedly pointed out that a promtool-style unit test for LogQL rules simply doesn’t exist yet.

## Closing the gap today

You don’t have to wait for upstream to ship this. **AlertLint** runs exactly this test loop in your browser: paste your Loki alerting and recording rules, define `input_streams`, declare your `exp_alerts`, and assert pass or fail before the rule ever reaches the ruler. Everything evaluates client-side — your rules and logs never leave the device — so you can wire it into review without touching infrastructure or sending data anywhere.

If you’ve ever shipped a Loki alert and hoped it worked, this is the missing step.

[Try AlertLint — the Loki alert rule tester →](/loki-alert-rule-tester)

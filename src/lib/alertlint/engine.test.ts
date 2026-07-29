/**
 * AlertLint engine tests.
 *
 * The engine is a PREVIEW subset of LogQL, so these tests assert the semantics
 * the preview promises to model faithfully — the ones a user would otherwise be
 * misled by:
 *
 *   • label-matcher regexes are ANCHORED (Loki compiles them as `^(?:re)$`),
 *     while LINE filters stay unanchored substring/regex searches;
 *   • a `for:` longer than the eval_time cannot have elapsed (Pending, not Firing);
 *   • `{{ $value }}` renders the FIRING SERIES' own value, not the group max;
 *   • durations parse under a real anchored grammar (`500ms` ≠ 500 minutes).
 *
 * Test YAML follows the only format the engine accepts: `input_streams:` with a
 * `stream:` label map and `logs: ["<offset> <message>"]`.
 */

import { describe, it, expect } from 'vitest';
import { runTests } from './engine';
import { examples } from './examples';
import type { RunResult } from './types';

/** Assert the run parsed/evaluated at all, then hand back the results. */
function run(rules: string, test: string): RunResult {
  const res = runTests(rules, test);
  return res;
}

/** Convenience: the single result of a one-assertion run. */
function only(res: RunResult) {
  expect(res.ok, res.error ?? '').toBe(true);
  expect(res.results).toHaveLength(1);
  return res.results[0];
}

/* ══════════════════════════════════════════════════════════════════════════ *
 *  BUG 1 — label-matcher regexes must be anchored; line filters must not be.
 * ══════════════════════════════════════════════════════════════════════════ */

describe('label-matcher regexes are anchored (Loki compiles ^(?:re)$)', () => {
  it('does not let namespace=~"prod" match the stream namespace "production"', () => {
    const rules = `groups:
  - name: bug1
    rules:
      - alert: ProdErrors
        expr: sum(count_over_time({namespace=~"prod"} |= "ERROR" [5m])) > 1
        for: 0m
        labels:
          severity: warning
`;
    const test = `tests:
  - interval: 1m
    input_streams:
      - stream:
          namespace: production
        logs:
          - "1m ERROR one"
          - "2m ERROR two"
          - "3m ERROR three"
    alert_rule_test:
      - eval_time: 5m
        alertname: ProdErrors
        exp_alerts: []
`;
    const r = only(run(rules, test));
    expect(r.status).toBe('pass');
  });

  it('still matches a full alternation branch exactly (prod|staging vs prod)', () => {
    const rules = `groups:
  - name: bug1
    rules:
      - alert: ProdErrors
        expr: sum(count_over_time({namespace=~"prod|staging"} |= "ERROR" [5m])) > 1
        for: 0m
        labels:
          severity: warning
`;
    const test = `tests:
  - interval: 1m
    input_streams:
      - stream:
          namespace: prod
        logs:
          - "1m ERROR one"
          - "2m ERROR two"
    alert_rule_test:
      - eval_time: 5m
        alertname: ProdErrors
        exp_alerts:
          - exp_labels:
              severity: warning
`;
    const r = only(run(rules, test));
    expect(r.status).toBe('pass');
  });

  it('does not let app!~"web" exclude the stream app="webserver"', () => {
    const rules = `groups:
  - name: bug1
    rules:
      - record: nonweb:count5m
        expr: sum(count_over_time({app!~"web"}[5m]))
`;
    const test = `tests:
  - interval: 1m
    input_streams:
      - stream:
          app: webserver
        logs:
          - "1m first"
          - "2m second"
    recording_rule_test:
      - eval_time: 5m
        record: nonweb:count5m
        exp_samples:
          - value: 2
            labels: 'nonweb:count5m'
`;
    const r = only(run(rules, test));
    expect(r.status).toBe('pass');
  });

  it('app!~"web" still excludes an exactly-matching stream', () => {
    const rules = `groups:
  - name: bug1
    rules:
      - record: nonweb:count5m
        expr: sum(count_over_time({app!~"web"}[5m]))
`;
    const test = `tests:
  - interval: 1m
    input_streams:
      - stream:
          app: web
        logs:
          - "1m first"
          - "2m second"
    recording_rule_test:
      - eval_time: 5m
        record: nonweb:count5m
        exp_samples: []
`;
    const r = only(run(rules, test));
    expect(r.status).toBe('pass');
  });

  it('keeps |~ line filters unanchored (substring regex search)', () => {
    const rules = `groups:
  - name: bug1
    rules:
      - alert: LineRegex
        expr: sum(count_over_time({job="api"} |~ "ERROR" [5m])) > 1
        for: 0m
        labels:
          severity: warning
`;
    const test = `tests:
  - interval: 1m
    input_streams:
      - stream:
          job: api
        logs:
          - "1m ts=1 level=error msg=ERROR upstream timeout"
          - "2m ts=2 level=error msg=ERROR upstream timeout"
          - "3m ts=3 level=info msg=ok"
    alert_rule_test:
      - eval_time: 5m
        alertname: LineRegex
        exp_alerts:
          - exp_labels:
              severity: warning
`;
    const r = only(run(rules, test));
    expect(r.status).toBe('pass');
  });

  it('keeps !~ line filters (after the selector) unanchored', () => {
    const rules = `groups:
  - name: bug1
    rules:
      - record: quiet:count5m
        expr: sum(count_over_time({job="api"} !~ "ERROR" [5m]))
`;
    const test = `tests:
  - interval: 1m
    input_streams:
      - stream:
          job: api
        logs:
          - "1m ts=1 msg=ERROR upstream timeout"
          - "2m ts=2 msg=ERROR upstream timeout"
          - "3m ts=3 msg=ok"
    recording_rule_test:
      - eval_time: 5m
        record: quiet:count5m
        exp_samples:
          - value: 1
            labels: 'quiet:count5m'
`;
    const r = only(run(rules, test));
    expect(r.status).toBe('pass');
  });
});

/* ══════════════════════════════════════════════════════════════════════════ *
 *  BUG 2 — a `for:` longer than eval_time means Pending, never Firing.
 * ══════════════════════════════════════════════════════════════════════════ */

describe('`for:` is honoured against eval_time', () => {
  const longForRules = `groups:
  - name: bug2
    rules:
      - alert: SlowBurn
        expr: sum(count_over_time({job="api"}[10m])) > 5
        for: 24h
        labels:
          severity: warning
`;

  it('does not fire when for: 24h exceeds eval_time 5m', () => {
    const test = `tests:
  - interval: 1m
    input_streams:
      - stream:
          job: api
        logs:
          - "0s one"
          - "0s two"
          - "0s three"
          - "0s four"
          - "0s five"
          - "0s six"
    alert_rule_test:
      - eval_time: 5m
        alertname: SlowBurn
        exp_alerts: []
`;
    const r = only(run(longForRules, test));
    expect(r.status).toBe('pass');
  });

  it('explains that the alert would still be Pending', () => {
    const test = `tests:
  - interval: 1m
    input_streams:
      - stream:
          job: api
        logs:
          - "0s one"
          - "0s two"
          - "0s three"
          - "0s four"
          - "0s five"
          - "0s six"
    alert_rule_test:
      - eval_time: 5m
        alertname: SlowBurn
        exp_alerts: []
`;
    const r = only(run(longForRules, test));
    expect(r.message).toMatch(/Pending/);
    expect(r.message).toContain('24h');
    expect(r.message).toContain('5m');
  });

  it('still fires when the for: window fits inside eval_time', () => {
    const rules = `groups:
  - name: bug2
    rules:
      - alert: SlowBurn
        expr: sum(count_over_time({job="api"}[10m])) > 5
        for: 2m
        labels:
          severity: warning
`;
    const test = `tests:
  - interval: 1m
    input_streams:
      - stream:
          job: api
        logs:
          - "0s one"
          - "0s two"
          - "0s three"
          - "0s four"
          - "0s five"
          - "0s six"
    alert_rule_test:
      - eval_time: 5m
        alertname: SlowBurn
        exp_alerts:
          - exp_labels:
              severity: warning
`;
    const r = only(run(rules, test));
    expect(r.status).toBe('pass');
    expect(r.message).not.toMatch(/Pending/);
  });

  it('does not fire when the comparison lapses inside the for: window', () => {
    const rules = `groups:
  - name: bug2
    rules:
      - alert: Flapping
        expr: sum(count_over_time({job="api"}[1m])) > 1
        for: 3m
        labels:
          severity: warning
`;
    const test = `tests:
  - interval: 1m
    input_streams:
      - stream:
          job: api
        logs:
          - "3m a"
          - "3m b"
          - "5m c"
          - "5m d"
    alert_rule_test:
      - eval_time: 5m
        alertname: Flapping
        exp_alerts: []
`;
    const r = only(run(rules, test));
    expect(r.status).toBe('pass');
  });
});

/* ══════════════════════════════════════════════════════════════════════════ *
 *  BUG 3 — {{ $value }} is the firing series' own value.
 * ══════════════════════════════════════════════════════════════════════════ */

describe('{{ $value }} renders each firing series own value', () => {
  const rules = `groups:
  - name: bug3
    rules:
      - alert: PerHostHits
        expr: sum by (host) (count_over_time({job="api"}[5m])) > 1
        for: 0m
        annotations:
          summary: "{{ $labels.host }} had {{ $value }} hits"
`;
  const streams = `    input_streams:
      - stream:
          job: api
          host: h1
        logs:
          - "1m a"
          - "2m b"
      - stream:
          job: api
          host: h2
        logs:
          - "1m c"
          - "2m d"
          - "3m e"
          - "4m f"
          - "5m g"
`;

  it('gives each sum-by group its own number', () => {
    const test = `tests:
  - interval: 1m
${streams}    alert_rule_test:
      - eval_time: 5m
        alertname: PerHostHits
        exp_alerts:
          - exp_labels:
              host: h1
            exp_annotations:
              summary: "h1 had 2 hits"
          - exp_labels:
              host: h2
            exp_annotations:
              summary: "h2 had 5 hits"
`;
    const r = only(run(rules, test));
    expect(r.status).toBe('pass');
  });

  it('fails when an annotation claims another series value', () => {
    const test = `tests:
  - interval: 1m
${streams}    alert_rule_test:
      - eval_time: 5m
        alertname: PerHostHits
        exp_alerts:
          - exp_labels:
              host: h1
            exp_annotations:
              summary: "h1 had 5 hits"
          - exp_labels:
              host: h2
            exp_annotations:
              summary: "h2 had 5 hits"
`;
    const r = only(run(rules, test));
    expect(r.status).toBe('fail');
  });

  it('still renders the single unlabelled series value', () => {
    const single = `groups:
  - name: bug3
    rules:
      - alert: TotalHits
        expr: sum(count_over_time({job="api"}[5m])) > 1
        for: 0m
        annotations:
          summary: "{{ $value }} hits"
`;
    const test = `tests:
  - interval: 1m
${streams}    alert_rule_test:
      - eval_time: 5m
        alertname: TotalHits
        exp_alerts:
          - exp_labels: {}
            exp_annotations:
              summary: "7 hits"
`;
    const r = only(run(single, test));
    expect(r.status).toBe('pass');
  });
});

/* ══════════════════════════════════════════════════════════════════════════ *
 *  Duration grammar.
 * ══════════════════════════════════════════════════════════════════════════ */

describe('duration parsing', () => {
  it('reads 500ms as half a second, not 500 minutes', () => {
    const rules = `groups:
  - name: durations
    rules:
      - record: ms:count5m
        expr: sum(count_over_time({job="api"}[5m]))
`;
    const test = `tests:
  - interval: 1m
    input_streams:
      - stream:
          job: api
        logs:
          - "500ms early line"
    recording_rule_test:
      - eval_time: 5m
        record: ms:count5m
        exp_samples:
          - value: 1
            labels: 'ms:count5m'
`;
    const r = only(run(rules, test));
    expect(r.status).toBe('pass');
  });

  it('rejects a fractional duration instead of silently reading 1.5h as 5h', () => {
    const rules = `groups:
  - name: durations
    rules:
      - alert: Anything
        expr: sum(count_over_time({job="api"}[5m])) > 0
        for: 0m
`;
    const test = `tests:
  - interval: 1m
    input_streams:
      - stream:
          job: api
        logs:
          - "1m a"
    alert_rule_test:
      - eval_time: 1.5h
        alertname: Anything
        exp_alerts: []
`;
    const res = run(rules, test);
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/duration/i);
  });

  it('keeps the sign of a negative offset', () => {
    const rules = `groups:
  - name: durations
    rules:
      - record: neg:count5m
        expr: sum(count_over_time({job="api"}[5m]))
`;
    const test = `tests:
  - interval: 1m
    input_streams:
      - stream:
          job: api
        logs:
          - "-2m before zero"
    recording_rule_test:
      - eval_time: 0s
        record: neg:count5m
        exp_samples:
          - value: 1
            labels: 'neg:count5m'
`;
    const r = only(run(rules, test));
    expect(r.status).toBe('pass');
  });

  it('accepts a millisecond range selector', () => {
    const rules = `groups:
  - name: durations
    rules:
      - record: msrange:count
        expr: sum(count_over_time({job="api"}[1500ms]))
`;
    const test = `tests:
  - interval: 1m
    input_streams:
      - stream:
          job: api
        logs:
          - "1s a"
          - "2s b"
    recording_rule_test:
      - eval_time: 2s
        record: msrange:count
        exp_samples:
          - value: 2
            labels: 'msrange:count'
`;
    const r = only(run(rules, test));
    expect(r.status).toBe('pass');
  });

  it('still sums compound durations like 1h30m', () => {
    const rules = `groups:
  - name: durations
    rules:
      - record: compound:count
        expr: sum(count_over_time({job="api"}[1h30m]))
`;
    const test = `tests:
  - interval: 1m
    input_streams:
      - stream:
          job: api
        logs:
          - "1m a"
          - "50m b"
    recording_rule_test:
      - eval_time: 1h30m
        record: compound:count
        exp_samples:
          - value: 2
            labels: 'compound:count'
`;
    const r = only(run(rules, test));
    expect(r.status).toBe('pass');
  });
});

/* ══════════════════════════════════════════════════════════════════════════ *
 *  Happy paths, assertions and error handling.
 * ══════════════════════════════════════════════════════════════════════════ */

describe('bundled examples', () => {
  for (const ex of examples) {
    it(`"${ex.label}" runs green`, () => {
      const res = run(ex.rulesYaml, ex.testYaml);
      expect(res.ok, res.error ?? '').toBe(true);
      expect(res.summary.failed).toBe(0);
      expect(res.summary.passed).toBe(res.summary.total);
      expect(res.summary.total).toBeGreaterThan(0);
    });
  }
});

describe('assertion semantics', () => {
  const rules = `groups:
  - name: ssh
    rules:
      - alert: HighAuthFailureRate
        expr: sum(count_over_time({job="sshd"} |= "Failed password" [5m])) > 5
        for: 0m
        labels:
          severity: warning
        annotations:
          summary: "High rate of failed SSH logins"
          description: "{{ $value }} failed SSH logins in the last 5 minutes."
`;
  const firingStreams = `    input_streams:
      - stream:
          job: sshd
        logs:
          - "1m Failed password for root"
          - "2m Failed password for root"
          - "3m Failed password for root"
          - "4m Failed password for root"
          - "5m Failed password for root"
          - "5m Failed password for root"
`;

  it('passes when labels and annotations both match', () => {
    const test = `tests:
  - interval: 1m
${firingStreams}    alert_rule_test:
      - eval_time: 5m
        alertname: HighAuthFailureRate
        exp_alerts:
          - exp_labels:
              severity: warning
            exp_annotations:
              summary: "High rate of failed SSH logins"
              description: "6 failed SSH logins in the last 5 minutes."
`;
    const r = only(run(rules, test));
    expect(r.status).toBe('pass');
    expect(r.kind).toBe('alert');
    expect(r.evalTime).toBe('5m');
  });

  it('fails on a wrong expected annotation', () => {
    const test = `tests:
  - interval: 1m
${firingStreams}    alert_rule_test:
      - eval_time: 5m
        alertname: HighAuthFailureRate
        exp_alerts:
          - exp_labels:
              severity: warning
            exp_annotations:
              description: "99 failed SSH logins in the last 5 minutes."
`;
    const r = only(run(rules, test));
    expect(r.status).toBe('fail');
    expect(r.message).toMatch(/did not match/i);
  });

  it('fails on a wrong expected label', () => {
    const test = `tests:
  - interval: 1m
${firingStreams}    alert_rule_test:
      - eval_time: 5m
        alertname: HighAuthFailureRate
        exp_alerts:
          - exp_labels:
              severity: critical
`;
    const r = only(run(rules, test));
    expect(r.status).toBe('fail');
  });

  it('fails a negative assertion when an alert does fire', () => {
    const test = `tests:
  - interval: 1m
${firingStreams}    alert_rule_test:
      - eval_time: 5m
        alertname: HighAuthFailureRate
        exp_alerts: []
`;
    const r = only(run(rules, test));
    expect(r.status).toBe('fail');
    expect(r.message).toMatch(/Expected no alert to fire/i);
  });

  it('passes a negative assertion below the threshold', () => {
    const test = `tests:
  - interval: 1m
    input_streams:
      - stream:
          job: sshd
        logs:
          - "1m Failed password for root"
          - "2m Failed password for root"
    alert_rule_test:
      - eval_time: 5m
        alertname: HighAuthFailureRate
        exp_alerts: []
`;
    const r = only(run(rules, test));
    expect(r.status).toBe('pass');
  });

  it('reports an unknown alertname as a failing assertion', () => {
    const test = `tests:
  - interval: 1m
${firingStreams}    alert_rule_test:
      - eval_time: 5m
        alertname: NoSuchAlert
        exp_alerts: []
`;
    const r = only(run(rules, test));
    expect(r.status).toBe('fail');
    expect(r.message).toMatch(/No alerting rule named/i);
  });
});

describe('error handling', () => {
  it('returns ok:false on malformed rules YAML', () => {
    const res = run('groups: [ unclosed', 'tests: []');
    expect(res.ok).toBe(false);
    expect(res.error).toBeTruthy();
  });

  it('returns ok:false on an expression outside the supported subset', () => {
    const rules = `groups:
  - name: unsupported
    rules:
      - alert: Topk
        expr: topk(5, count_over_time({job="api"}[5m])) > 1
        for: 0m
`;
    const test = `tests:
  - interval: 1m
    input_streams:
      - stream:
          job: api
        logs:
          - "1m a"
    alert_rule_test:
      - eval_time: 5m
        alertname: Topk
        exp_alerts: []
`;
    const res = run(rules, test);
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/Unsupported metric expression/i);
  });

  it('rejects a catastrophic-backtracking label-matcher regex', () => {
    const rules = `groups:
  - name: unsafe
    rules:
      - record: unsafe:count
        expr: sum(count_over_time({app=~"(a+)+"}[5m]))
`;
    const test = `tests:
  - interval: 1m
    input_streams:
      - stream:
          app: aaaa
        logs:
          - "1m a"
    recording_rule_test:
      - eval_time: 5m
        record: unsafe:count
        exp_samples: []
`;
    const res = run(rules, test);
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/Unsafe regular expression/i);
  });
});

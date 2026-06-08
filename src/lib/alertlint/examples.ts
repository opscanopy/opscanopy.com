/**
 * AlertLint — bundled, runnable examples for the playground.
 *
 * Every example below is crafted to PASS with the preview engine in
 * `engine.ts`. They stay strictly within the implemented LogQL subset
 * (stream selectors, line filters, count_over_time / rate, sum [by], and a
 * comparison threshold) so users get a green run out of the box and can edit
 * from a known-good baseline.
 *
 * The YAML follows the standard Grafana Loki ruler format (groups[].rules[])
 * for rules, and a promtool-modeled test format for the assertions.
 *
 * Reminder: this is a PREVIEW subset of LogQL, not the production Loki engine.
 */

export interface AlertLintExample {
  /** Stable id used by the playground selector. */
  id: string;
  /** Short human label for the example tab. */
  label: string;
  /** Loki ruler YAML (groups[].rules[]). */
  rulesYaml: string;
  /** promtool-style test YAML. */
  testYaml: string;
}

/* (a) Positive test — a real alert that should fire. */
const highAuthFailureRate: AlertLintExample = {
  id: 'high-auth-failure-rate',
  label: 'High auth failure rate',
  rulesYaml: `groups:
  - name: ssh-security
    rules:
      # Fire when more than 5 failed SSH logins occur within 5 minutes.
      - alert: HighAuthFailureRate
        expr: sum(count_over_time({job="sshd"} |= "Failed password" [5m])) > 5
        for: 0m
        labels:
          severity: warning
          team: platform
        annotations:
          summary: "High rate of failed SSH logins"
          description: "{{ $value }} failed SSH logins in the last 5 minutes."
`,
  testYaml: `rule_files:
  - ssh-security.yml

evaluation_interval: 1m

tests:
  - interval: 1m
    input_streams:
      - stream:
          job: sshd
          host: bastion-1
        logs:
          - "1m  Failed password for root from 10.0.0.9 port 52344 ssh2"
          - "2m  Failed password for root from 10.0.0.9 port 52345 ssh2"
          - "3m  Failed password for admin from 10.0.0.9 port 52346 ssh2"
          - "4m  Failed password for admin from 10.0.0.9 port 52347 ssh2"
          - "4m  Failed password for git from 10.0.0.9 port 52348 ssh2"
          - "5m  Failed password for git from 10.0.0.9 port 52349 ssh2"
          - "5m  Accepted password for deploy from 10.0.0.2 port 60001 ssh2"
    alert_rule_test:
      - eval_time: 5m
        alertname: HighAuthFailureRate
        exp_alerts:
          - exp_labels:
              severity: warning
              team: platform
            exp_annotations:
              summary: "High rate of failed SSH logins"
              description: "6 failed SSH logins in the last 5 minutes."
`,
};

/* (b) Negative test — empty exp_alerts asserts NO alert fires. */
const noAlertBelowThreshold: AlertLintExample = {
  id: 'no-alert-below-threshold',
  label: 'No alert below threshold',
  rulesYaml: `groups:
  - name: ssh-security
    rules:
      # Same rule as the positive example — here we prove it stays silent.
      - alert: HighAuthFailureRate
        expr: sum(count_over_time({job="sshd"} |= "Failed password" [5m])) > 5
        for: 0m
        labels:
          severity: warning
          team: platform
        annotations:
          summary: "High rate of failed SSH logins"
`,
  testYaml: `rule_files:
  - ssh-security.yml

evaluation_interval: 1m

tests:
  - interval: 1m
    input_streams:
      - stream:
          job: sshd
          host: bastion-1
        logs:
          # Only 3 failures in the window — comfortably under the threshold of 5.
          - "1m  Failed password for root from 10.0.0.9 port 52344 ssh2"
          - "3m  Failed password for admin from 10.0.0.9 port 52345 ssh2"
          - "4m  Failed password for git from 10.0.0.9 port 52346 ssh2"
          - "2m  Accepted password for deploy from 10.0.0.2 port 60001 ssh2"
    alert_rule_test:
      # An empty exp_alerts list asserts the alert must NOT fire.
      - eval_time: 5m
        alertname: HighAuthFailureRate
        exp_alerts: []
`,
};

/* (c) Recording rule — compute a sample and assert its value. */
const recordingRuleErrorCount: AlertLintExample = {
  id: 'recording-rule-error-count',
  label: 'Recording rule',
  rulesYaml: `groups:
  - name: app-aggregations
    rules:
      # Pre-aggregate the 5-minute error count so dashboards/alerts are cheap.
      - record: job:app_errors:count5m
        expr: sum(count_over_time({app="checkout", level="error"} |= "ERROR" [5m]))
        labels:
          aggregation: count5m
`,
  testYaml: `rule_files:
  - app-aggregations.yml

evaluation_interval: 1m

tests:
  - interval: 1m
    input_streams:
      - stream:
          app: checkout
          level: error
        logs:
          - "1m  ERROR failed to authorize payment intent pi_abc"
          - "2m  ERROR gateway timeout talking to acquirer"
          - "3m  ERROR failed to authorize payment intent pi_def"
          - "4m  ERROR inventory service unavailable"
      - stream:
          app: checkout
          level: info
        logs:
          # Different stream / level — must NOT be counted by the selector.
          - "2m  INFO checkout completed for order 1001"
          - "3m  INFO checkout completed for order 1002"
    recording_rule_test:
      - eval_time: 5m
        record: job:app_errors:count5m
        exp_samples:
          - value: 4
            labels: 'job:app_errors:count5m'
`,
};

export const examples: AlertLintExample[] = [
  highAuthFailureRate,
  noAlertBelowThreshold,
  recordingRuleErrorCount,
];

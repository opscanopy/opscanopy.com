/**
 * Alertmanager Route Tester — bundled, runnable examples for the playground.
 *
 * Each example pairs a real Alertmanager `route` tree with a sample alert's
 * labels so the engine can be exercised end-to-end. The trees are adapted from
 * the canonical routing example in the Alertmanager configuration docs
 * (https://prometheus.io/docs/alerting/latest/configuration/#route), which
 * routes by `service`, `team`, and `severity` and demonstrates `continue`.
 *
 * Every example is valid YAML so users can copy, edit, and re-run from a known
 * baseline.
 */

export interface AlertmanagerRouteExample {
  /** Stable id used by the playground selector. */
  id: string;
  /** Short human label for the example tab. */
  label: string;
  /** The Alertmanager route tree (or full config) YAML. */
  config: string;
  /** The sample alert's labels, one `key=value` per line. */
  labels: string;
}

/* (a) ─ DOCS TREE → database team ─────────────────────────────────────────────
 *
 * The canonical docs example. A `service=database` alert routes to the
 * `team-DB-pages` child via `match` on `service`. group_by is inherited from
 * the root.
 */
const docsDatabase: AlertmanagerRouteExample = {
  id: 'docs-database',
  label: 'Docs tree → database team',
  config: `# Adapted from the Alertmanager routing example.
route:
  receiver: 'default-receiver'
  group_by: ['alertname', 'cluster', 'service']
  group_wait: 30s
  group_interval: 5m
  repeat_interval: 4h
  routes:
    - receiver: 'team-X-mails'
      match:
        team: frontend
    - receiver: 'team-DB-pages'
      match:
        service: database
      group_by: ['alertname', 'cluster', 'database']
    - receiver: 'team-Y-mails'
      match:
        team: backend
`,
  labels: `alertname=HighLatency
service=database
cluster=eu-west-1
severity=critical`,
};

/* (b) ─ CONTINUE → two receivers ──────────────────────────────────────────────
 *
 * The first matching child sets `continue: true`, so the alert ALSO falls
 * through to a later sibling that matches. Result: two receivers fire.
 */
const continueCase: AlertmanagerRouteExample = {
  id: 'continue',
  label: 'continue → two receivers',
  config: `route:
  receiver: 'default-receiver'
  group_by: ['alertname']
  routes:
    # Mirror every critical alert to a catch-all audit receiver,
    # then KEEP routing (continue: true) so the team-specific rule below
    # also matches.
    - receiver: 'all-critical-audit'
      matchers:
        - severity="critical"
      continue: true
    - receiver: 'team-Y-pages'
      match:
        team: backend
`,
  labels: `alertname=DiskWillFillSoon
team=backend
severity=critical`,
};

/* (c) ─ matchers + regex (match_re) ───────────────────────────────────────────
 *
 * Uses the modern `matchers:` syntax with a regex (`=~`) plus an inequality
 * (`!=`). The regex is anchored, so `env=staging-eu` matches `env=~"staging-.*"`.
 */
const matchersRegex: AlertmanagerRouteExample = {
  id: 'matchers-regex',
  label: 'matchers + regex',
  config: `route:
  receiver: 'default-receiver'
  group_by: ['alertname', 'env']
  routes:
    - receiver: 'staging-slack'
      matchers:
        - env=~"staging-.*"
        - severity!="info"
    - receiver: 'prod-pager'
      match_re:
        env: 'prod-.*'
`,
  labels: `alertname=CPUThrottling
env=staging-eu
severity=warning`,
};

/* (d) ─ falls through to default ──────────────────────────────────────────────
 *
 * No child matches the alert's labels, so the root's own `default-receiver`
 * fires — the catch-all. A common "why didn't my alert route?" scenario.
 */
const fallthrough: AlertmanagerRouteExample = {
  id: 'fallthrough',
  label: 'Falls through to default',
  config: `route:
  receiver: 'default-receiver'
  group_by: ['alertname']
  routes:
    - receiver: 'team-X-mails'
      match:
        team: frontend
    - receiver: 'team-Y-mails'
      match:
        team: backend
`,
  labels: `alertname=CertExpiry
team=platform
severity=warning`,
};

/* (e) ─ nested subtree ────────────────────────────────────────────────────────
 *
 * A parent route matches on `service`, then a NESTED child narrows by
 * `severity`. The breadcrumb shows the full descent root → service → severity.
 */
const nested: AlertmanagerRouteExample = {
  id: 'nested',
  label: 'Nested subtree',
  config: `route:
  receiver: 'default-receiver'
  group_by: ['alertname']
  routes:
    - receiver: 'web-team'
      match:
        service: web
      group_by: ['alertname', 'instance']
      routes:
        - receiver: 'web-team-pager'
          matchers:
            - severity="critical"
        - receiver: 'web-team-slack'
          matchers:
            - severity=~"warning|info"
`,
  labels: `alertname=Latency
service=web
severity=critical
instance=web-3`,
};

/* (f) ─ full config (uses .route) ─────────────────────────────────────────────
 *
 * A full Alertmanager config with `global`, `receivers`, and `route`. The engine
 * reads only `.route`, proving it ignores the surrounding config blocks.
 */
const fullConfig: AlertmanagerRouteExample = {
  id: 'full-config',
  label: 'Full config (.route)',
  config: `global:
  resolve_timeout: 5m
route:
  receiver: 'default-receiver'
  group_by: ['alertname']
  routes:
    - receiver: 'oncall-pager'
      matchers:
        - severity="critical"
        - team=~"sre|platform"
receivers:
  - name: 'default-receiver'
  - name: 'oncall-pager'
`,
  labels: `alertname=NodeDown
team=sre
severity=critical`,
};

export const examples: AlertmanagerRouteExample[] = [
  docsDatabase,
  continueCase,
  matchersRegex,
  fallthrough,
  nested,
  fullConfig,
];

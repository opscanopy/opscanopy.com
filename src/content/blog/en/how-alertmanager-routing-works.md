---
title: "How Alertmanager Routing Works: Matchers, continue, and the Route Tree"
description: "A clear mental model for Alertmanager routing — the route tree, matchers, the continue flag, grouping and receiver inheritance — so you know exactly where an alert goes."
pubDate: 2026-06-17
tags: ["alertmanager","observability","alerting"]
relatedTool:
  name: "Alertmanager Route Tester"
  href: "/alertmanager-route-tester"
---

![Diagram of Alertmanager routing: an alert's labels enter the route tree at the root and flow down matched child routes to a receiver](/blog/how-alertmanager-routing-works-hero.svg)

A `severity=critical` alert fired last night and the on-call team never got paged. The alert was real, the receiver existed, the Slack webhook worked. The problem was three lines higher in the config: a broad catch-all route sat above the team route and quietly swallowed everything that reached it. Nobody touched the receiver — they touched the order.

That is what makes Alertmanager routing easy to get wrong. The receivers are usually fine. The route tree is where the surprises live. Once you have a precise model of how the route tree is walked — how matchers are evaluated, when `continue` keeps an alert moving, and what each child inherits from its parent — "why did this alert go there?" stops being a guessing game. This post builds that model, and every rule here matches what the [Alertmanager Route Tester](/alertmanager-route-tester) actually does when it walks a tree against a sample alert.

## Routing is a tree, not a list

The most common misread of an Alertmanager config is treating `routes:` as a flat list of rules that each alert is checked against. It is not a list. It is a tree, and every alert enters at the same place: the root route.

```yaml
route:
  receiver: 'default-receiver'        # the root — the catch-all
  group_by: ['alertname', 'cluster', 'service']
  group_wait: 30s
  group_interval: 5m
  repeat_interval: 4h
  routes:                              # child routes
    - receiver: 'team-X-mails'
      match:
        team: frontend
    - receiver: 'team-DB-pages'
      match:
        service: database
    - receiver: 'team-Y-mails'
      match:
        team: backend
```

The root route is special: it is entered for **every** alert, regardless of its own matchers. It is the catch-all. Its `receiver` is the default an alert lands on when nothing more specific matches, and its grouping fields are the baseline that everything below inherits. Inside the root sits a `routes:` list — its children. Each child can have its own `routes:`, and so on down. An alert descends from the root through whichever children match, and the receiver it ends up on is the one at the node where the descent stops.

So when you read an `alertmanager.yml`, do not scan the route list looking for the rule that matches. Start at the root and walk down. The Alertmanager route tree is a decision tree you trace top-to-bottom, depth-first.

## How a route matches: matchers syntax (and the older match/match_re)

A route node matches an alert when **all** of its own matchers hold against the alert's labels. Logical AND, no exceptions. A node with no matchers always matches. There are three ways to declare those Alertmanager matchers, and you will see all three in real configs.

```yaml
routes:
  # Modern matchers: syntax — preferred. One operator per line.
  - receiver: 'staging-slack'
    matchers:
      - env=~"staging-.*"      # =~ regex
      - severity!="info"       # != inequality

  # Older match: exact string equality on each key.
  - receiver: 'team-X-mails'
    match:
      team: frontend

  # Older match_re: each value is a regex.
  - receiver: 'prod-pager'
    match_re:
      env: 'prod-.*'
```

The modern `matchers:` form carries its operator inline. There are four: `=` (equals), `!=` (not equals), `=~` (regex match), and `!~` (regex no-match). Values may be quoted or bare. The two older forms are sugar over the same engine — `match:` is a set of `=` matchers, and `match_re:` is a set of `=~` matchers.

Two details trip people up constantly:

- **Regexes are fully anchored.** Alertmanager wraps every `=~`, `!~`, and `match_re` pattern as `^(?:…)$`. So `env=~"staging"` matches the value `staging` and nothing else — `env=staging-eu` does **not** match. You have to write `env=~"staging-.*"` to cover the rest of the value. This is the single most frequent cause of "my route matches nothing."
- **A missing label is the empty string.** Alertmanager compares an absent label as `""`. So `foo=""` matches an alert that has no `foo` label at all, and `foo!=""` requires `foo` to be present and non-empty. Useful, and occasionally surprising.

Getting those labels onto the alert in the first place is a separate job that happens at scrape time — if the label your matcher checks was never set, walk it back to your scrape config with the [Prometheus Relabel Tester](/prometheus-relabel-tester) before you blame the route tree.

![Illustration: an incoming alert descends the Alertmanager route tree from the root route into child routes with matchers and continue: true, ending on the matched route](/blog/in-content/how-alertmanager-routing-works.webp)

## Depth-first matching and continue: first matching sibling wins unless continue is true

Here is the rule that the late-night example broke. Within a matched route, child routes are evaluated **in order, top to bottom**. The alert descends into the **first** child whose matchers all hold — and then, by default, the sibling scan **stops**. Later siblings are never even checked.

```yaml
# TRAP: the broad rule above shadows the specific one
routes:
  - receiver: catch-all
    matchers: ['severity=~".*"']   # matches everything
  - receiver: db-pager             # NEVER reached
    match: { service: database }
```

A `service=database, severity=critical` alert hits `catch-all` first, that match stops the scan, and `db-pager` is dead code. The fix is either to order specific-before-broad, or to set `continue: true`.

`continue: true` on a matched route tells Alertmanager **not** to stop the sibling scan after that route matches. Evaluation keeps going to the later siblings, each of which may also match. That is the only way a single alert can land on more than one receiver.

```yaml
# Mirror every critical alert to an audit receiver,
# THEN keep routing so the owning team is still paged.
routes:
  - receiver: all-critical-audit
    matchers: ['severity="critical"']
    continue: true               # <- do not stop here
  - receiver: team-backend
    match: { team: backend }
```

For a `team=backend, severity=critical` alert, the first route matches and would normally stop the scan — but `continue: true` keeps it alive, the second route also matches, and **both** receivers fire. Drop the `continue` and only `all-critical-audit` fires; the team never hears about it.

The walk is depth-first: when a child matches, the alert descends into *that child's* subtree and resolves there before any `continue` carries it to the next sibling. The Alertmanager Route Tester tags each receiver that was reached only because an earlier sibling set `continue: true`, so you can see at a glance which matches are the primary path and which are fan-out.

## Grouping: group_by, group_wait, group_interval, repeat_interval

Routing decides *where* an alert goes. Grouping decides *how* its notifications are batched and paced once it gets there. Four fields control it, and they live on route nodes right alongside the matchers.

```yaml
route:
  receiver: 'default-receiver'
  group_by: ['alertname', 'cluster', 'service']
  group_wait: 30s          # wait this long to collect more alerts for a new group
  group_interval: 5m       # then wait this long before sending updates to that group
  repeat_interval: 4h      # re-send an unresolved group no more often than this
```

- **`group_by`** is the list of labels that defines a group. Alerts that share the same values for those labels are bundled into one notification. A common special case is `group_by: ['...']`, which groups by *all* labels (every distinct alert is its own group), and the absence of grouping aggregates everything into a single group.
- **`group_wait`** is how long Alertmanager holds a brand-new group before sending the first notification, so a burst of related alerts arrives as one page instead of twenty.
- **`group_interval`** is the minimum gap before it sends an *updated* notification for a group that already fired (e.g. when a new alert joins the group).
- **`repeat_interval`** is how often it re-notifies about a group that is still firing and unresolved.

These are the difference between one useful page and an alert storm. And critically — they are inherited.

## Inheritance: child routes inherit receiver and group_by from the parent

A child route does not have to repeat the receiver and grouping it wants. Anything it does **not** set is inherited from the nearest ancestor that did. This is per-field: a child can override `group_by` while still inheriting `group_wait`, `group_interval`, `repeat_interval`, and even `receiver`.

```yaml
route:
  receiver: 'default-receiver'
  group_by: ['alertname', 'cluster']
  group_wait: 30s
  repeat_interval: 4h
  routes:
    - receiver: 'team-DB-pages'
      match:
        service: database
      group_by: ['alertname', 'cluster', 'database']
      # group_wait and repeat_interval are INHERITED from the root:
      #   group_wait: 30s, repeat_interval: 4h
      routes:
        - match:
            severity: critical
          # No receiver set here, so it INHERITS 'team-DB-pages'.
          # No group_by set, so it INHERITS [alertname, cluster, database].
```

![An Alertmanager route tree with a root route branching into child routes labelled by matchers, leaves are receivers, and a sample alert flows down the matched path which is highlighted, with one branch marked continue true](/blog/how-alertmanager-routing-works-diagram.svg)

The deepest node in that tree sets neither a receiver nor `group_by`, yet a `service=database, severity=critical` alert that reaches it pages `team-DB-pages` and groups by `[alertname, cluster, database]` — both pulled down the chain. This is why the leaf you are staring at may not tell the whole story: the effective receiver and grouping are assembled by walking *up* from the matched node to the first ancestor that set each field. When you debug a misrouted or mis-grouped alert, resolve the inheritance, not just the leaf.

## Reading a real route tree: where a given alert lands

Put it together. Here is a complete tree with three children at the top level and a nested subtree under one of them.

```yaml
route:
  receiver: 'default-receiver'
  group_by: ['alertname']
  group_wait: 30s
  repeat_interval: 4h
  routes:
    - receiver: 'all-critical-audit'
      matchers:
        - severity="critical"
      continue: true                 # mirror, then keep going
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
    - receiver: 'team-Y-mails'
      match:
        team: backend
```

Now trace an alert with these labels:

```bash
alertname=Latency
service=web
severity=critical
instance=web-3
```

Walking the tree, depth-first, in order:

1. **Root** is entered (always). It does not stop here; it has children to evaluate.
2. First child, `all-critical-audit`: `severity="critical"` holds. It matches → `all-critical-audit` fires. It has `continue: true`, so the scan does **not** stop.
3. Second child, `web-team`: `service: web` holds. The alert descends into its subtree.
   - First grandchild, `web-team-pager`: `severity="critical"` holds → `web-team-pager` fires. No `continue`, so this branch stops here. Effective `group_by` is `[alertname, instance]`, inherited from `web-team`.
4. The `web-team` match (a non-`continue` match) stops the top-level scan, so `team-Y-mails` is never evaluated.

Final result: the alert reaches **two** receivers — `all-critical-audit` (via `continue`) and `web-team-pager` (the primary path). Flip `severity` to `warning` and the picture changes: `all-critical-audit` drops out, and inside `web-team` the alert falls to `web-team-slack` instead. Remove `service=web` and it never enters that subtree at all, falling through to `team-Y-mails` if `team=backend`, or to the root's `default-receiver` if nothing matches.

If your alert rules themselves aren't firing the way you expect — wrong labels, wrong severity, wrong timing — that is upstream of routing entirely; prove the rule first with [AlertLint](/loki-alert-rule-tester), then trace where its output lands here.

## Test your tree

You can do this walk by hand, and for a three-node tree it is worth doing once to internalize the model. But real trees nest five levels deep, mix `match`, `match_re`, and `matchers`, and sprinkle `continue` across siblings — and the cost of getting it wrong is a SEV-1 that pages nobody, or a routine warning that wakes the whole team.

So make it cheap to check. Paste your route tree and a sample alert's labels into the [Alertmanager Route Tester](/alertmanager-route-tester) and it does exactly the walk above — entirely in your browser, nothing uploaded. It reports every receiver the alert reaches in evaluation order, the route-path breadcrumb from root to each matched node, a tag on any receiver reached only via `continue: true`, and the effective `group_by` after inheritance. It reproduces the semantics this post describes: anchored regexes, missing-label-as-empty-string, first-match-then-`continue`, and per-field inheritance.

The next time an alert lands somewhere unexpected, you do not have to fire a real one and watch. Paste the tree, paste the labels, and read off the path it actually took.

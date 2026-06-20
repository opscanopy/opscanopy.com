---
title: "Why Isnt My Alert Reaching the Right Receiver? Debugging Alertmanager Routing"
description: "Alerts going to the wrong receiver, or no receiver at all? Debug Alertmanager routing — first-match-wins, missing continue, matcher regex and catch-all defaults."
pubDate: 2026-06-18
tags: ["alertmanager","observability","alerting"]
relatedTool:
  name: "Alertmanager Route Tester"
  href: "/alertmanager-route-tester"
---

![Debugging Alertmanager routing: an alert with labels walking a route tree to find the correct receiver instead of the wrong one](/blog/debug-alertmanager-routing-hero.svg)

You shipped a new alerting rule, it fired in production, and the page went to the wrong team — or nobody got paged at all. The rule is correct and the alert is firing, yet your Alertmanager wrong-receiver problem is real: the notification landed somewhere you did not expect. When Alertmanager is not routing the way you intended, the bug is almost never in the alert. It is in the `route` tree, and routing trees are code you cannot easily step through.

Alertmanager dispatches every alert by walking a tree of routes. The root is the catch-all every alert enters; from there it descends into child routes whose matchers hold against the alert's labels. Get the walk wrong and the alert silently lands on the wrong leaf. This post covers the five bugs that cause it, and how to walk the tree yourself — no `amtool`, no reload, no live instance.

## The symptom: silent pages, or the wrong team gets paged

Two shapes of the same problem. Either an alert you expected to page the database team went to a catch-all Slack channel nobody watches, or a `severity=critical` alert produced no page at all. Both come from the same root cause: the route the alert *actually* matched is not the route you *think* it matched.

Here is the tree most people start from — the canonical routing example:

```yaml
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
    - receiver: 'team-Y-mails'
      match:
        team: backend
```

An alert with `service=database` reaches `team-DB-pages`. Simple enough — until the tree grows, siblings get reordered, someone adds a regex, and the walk stops doing what you read off the page. The fix is always the same: stop reasoning in your head and walk the tree against the exact labels the alert carries. Every bug below is a different way the walk surprises you.

## Bug 1: first match wins and you forgot continue: true

This is the most common Alertmanager-not-routing bug. Within a matched route, child routes are evaluated **top to bottom**, and the alert descends into the **first** matching child — then the sibling scan stops. Later siblings never run.

That bites hardest when you want an alert to reach two receivers — say, every critical alert mirrored to an audit receiver *and* routed to the owning team:

```yaml
route:
  receiver: 'default-receiver'
  group_by: ['alertname']
  routes:
    - receiver: 'all-critical-audit'
      matchers:
        - severity="critical"
    - receiver: 'team-Y-pages'
      match:
        team: backend
```

Fire an alert with `team=backend` and `severity=critical`. It matches the first sibling, `all-critical-audit`, and the scan stops there. `team-Y-pages` is never reached, so the backend team is never paged. The audit channel logged it, so it *looks* like routing worked — which is exactly why this one is hard to spot.

The fix is one line. A matched route with `continue: true` does not stop the sibling scan, so the alert keeps falling through to later matching siblings:

```yaml
    routes:
      - receiver: 'all-critical-audit'
        matchers:
          - severity="critical"
        continue: true        # keep going to later siblings
      - receiver: 'team-Y-pages'
        match:
          team: backend
```

Now both fire. An alert can only reach more than one receiver when `continue: true` is set on a matched route; without it, the first matching sibling always wins.

## Bug 2: the matcher does not match (regex, quoting, a missing label)

If the alert silently skips a route you were sure it would hit, the matcher probably is not matching. Three traps account for almost all of these.

**Regexes are fully anchored.** Both `match_re` and the `=~` / `!~` operators wrap your pattern as `^(?:…)$`. A partial pattern never matches a longer value:

```yaml
matchers:
  - env=~"staging"      # env=staging-eu does NOT match — anchored to exactly "staging"
```

```yaml
matchers:
  - env=~"staging-.*"   # env=staging-eu matches now
```

**A missing label is the empty string.** Alertmanager treats a label absent on the alert as `""`, so `team=""` matches an alert with *no* `team` label and `team!=""` requires it to be present and non-empty. If you write `match: { team: frontend }` but the alert never sets a `team` label, the matcher compares `frontend` against `""`, fails, and the route is skipped — you fall through.

**Operators and quoting in `matchers:` strings.** The modern `matchers:` form takes strings like `foo="bar"`, `foo=~"re"`, `foo!="x"`, and `foo!~"re"`; the value can be quoted or bare. The two-character operators (`=~`, `!~`, `!=`) are matched before the single `=`, so `severity!="info"` parses as a not-equal. Get the quoting wrong — leave a quote open, say — and the matcher is invalid; an invalid matcher cannot hold, so the route is skipped.

Here is a matcher route that combines a regex with an inequality:

```yaml
route:
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
```

All matchers on a route must hold for it to match — it is a logical AND. An alert with `env=staging-eu` and `severity=warning` reaches `staging-slack`: the anchored `staging-.*` matches and `severity` is not `info`. Change `severity` to `info` and the second matcher fails, so the whole route is skipped.

If your alert rules carry the wrong labels in the first place — or are missing the ones your routes match on — fix that upstream. The [Prometheus Relabel Tester](/prometheus-relabel-tester) previews exactly what labels survive your relabel rules before they ever reach the route tree.

## Bug 3: a catch-all default route swallows everything before your route is reached

An Alertmanager catch-all route is supposed to be a safety net — the receiver that fires when nothing more specific matches. But a catch-all placed *above* a specific sibling, instead of below it, turns into a trap. Combined with first-match-wins, a broad rule at the top shadows every specific rule beneath it:

```yaml
# Trap: the broad rule above shadows the specific one
routes:
  - receiver: catch-all
    matchers: ['severity=~".*"']   # matches everything
  - receiver: db-pager             # NEVER reached
    match: { service: database }
```

`severity=~".*"` matches any alert that has a `severity` label (anchored, but `.*` covers the whole value). It is the first sibling, so the scan stops there — `db-pager` is dead code. The database team never pages.

There are two correct ways to think about a catch-all. Either put your specific routes first and the broad one last:

```yaml
# Fix: specific first, broad last
routes:
  - receiver: db-pager
    match: { service: database }
  - receiver: catch-all
    matchers: ['severity=~".*"']
```

Or rely on the real catch-all you already have — the root route's own `receiver`. When no child route matches, the route the alert is sitting in becomes the terminal match and *its* receiver fires. The root always sets a default `receiver`, so an alert that matches no child still lands somewhere:

```yaml
route:
  receiver: 'default-receiver'     # the true catch-all
  group_by: ['alertname']
  routes:
    - receiver: 'team-X-mails'
      match: { team: frontend }
    - receiver: 'team-Y-mails'
      match: { team: backend }
```

An alert with `team=platform` matches neither child. It does not error and it does not vanish — it falls through to `default-receiver`, the catch-all working as intended. The "why didn't my alert route?" cases are usually this: it *did* route, straight to the default, because no child matched. If a route resolves to no receiver at all, that is a genuine misconfiguration — Alertmanager requires the root to set a default `receiver`.

## Bug 4: route ordering among siblings

Bug 3 is a catch-all swallowing everything. Bug 4 is the subtler, more general version: among siblings, order *always* decides which single route wins, even when both are specific. Because only the first matching sibling is taken (absent `continue`), two overlapping matchers in the wrong order route the alert to the wrong team.

![A misrouted alert: on the left the alert hits the route tree and lands on the wrong receiver in red because continue is missing, on the right the corrected tree routes it to the right receiver in green](/blog/debug-alertmanager-routing-diagram.svg)

Consider an alert that is both a database alert and a backend-team alert:

```yaml
# labels: service=database, team=backend, severity=critical
routes:
  - receiver: 'team-Y-pages'      # matches team=backend
    match: { team: backend }
  - receiver: 'team-DB-pages'     # matches service=database
    match: { service: database }
```

Both routes' matchers hold against this alert. Order breaks the tie: `team-Y-pages` is first, so it wins, and the database on-call (`team-DB-pages`) is never reached. Swap the two and the database route wins instead. Neither matcher is wrong — the *order* is the bug.

When two siblings can legitimately both match, you have three choices: put the one you want to win first, make the matchers mutually exclusive (add `service!=database` to the backend route, say), or set `continue: true` on the first so the alert reaches both. Nesting helps too — a parent matches the broad case and narrows it with children:

```yaml
route:
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
```

An alert with `service=web` first descends into `web-team`, then the nested children pick the receiver by `severity`. A `severity=critical` web alert walks `root → web-team → web-team-pager`. The descent is explicit, so order surprises stay local to one small sibling list instead of hiding across the whole tree.

## Bug 5: grouping makes an alert look missing when it is just batched

Sometimes the alert routed perfectly and you still think it is missing — because grouping batched it with others and the notification has not been sent *yet*. Grouping is controlled by `group_by`, `group_wait`, `group_interval`, and `repeat_interval`, and all four are **inherited** down the tree. A child that does not set its own carries the parent's:

```yaml
route:
  group_by: ['alertname', 'cluster']
  group_wait: 30s
  routes:
    - receiver: db-pager
      match: { service: database }
      # no group_by here → INHERITS ['alertname', 'cluster']
```

The `db-pager` leaf has no `group_by` of its own, so it inherits `['alertname', 'cluster']` and a 30s `group_wait` from the root. Two consequences trip people up. First, a new group is held for `group_wait` before its first notification — so a freshly fired alert that "isn't paging" may just be inside its wait window. Second, if `group_by` is too coarse, your alert gets folded into an existing group's notification and looks like it never fired separately.

Override only where a subtree actually needs different grouping:

```yaml
route:
  group_by: ['alertname', 'cluster']
  routes:
    - receiver: db-pager
      match: { service: database }
      group_by: ['alertname', 'cluster', 'database']
```

The leaf you are reading is not necessarily the grouping that applies. Always resolve the *effective* `group_by` — the value inherited from the nearest ancestor that set it — before you conclude an alert is missing.

## Test Alertmanager routing without amtool: walk the tree against the alerts labels

You do not need `amtool config routes test`, and you do not need to reload a live Alertmanager to do route debugging. The routing walk is deterministic, so you can do it by hand. Take the exact labels off the firing alert and walk the tree top-down:

```bash
# The labels the alert actually carries (from the Alertmanager UI or API):
alertname=HighLatency
service=database
team=backend
severity=critical
```

Then, starting at the root:

1. **Enter the root.** Every alert does — it is the catch-all. Note its `receiver` and `group_by` as the inheritance baseline.
2. **Scan children top to bottom.** For each child, check whether *all* its matchers hold against the labels. Remember: regexes are anchored, and a missing label is `""`.
3. **Descend into the first match.** That child's subtree is now where you are. If it set `continue: true`, keep scanning its later siblings too — those become additional matches.
4. **If no child matches, you are done.** The current route is the terminal match; its inherited `receiver` fires.
5. **Resolve inheritance at the leaf.** The effective `receiver` and `group_by` come from the nearest ancestor that set them, not necessarily the leaf.

Do that for the labels above against the docs tree and you land on `team-DB-pages` via `service=database`, inheriting `group_by` from the root. Doing this walk on paper for a 40-node tree is exactly the error-prone reasoning that produced the bug in the first place — which is the whole reason a tester exists.

## Find the matching receiver now: an Alertmanager route debugger in the browser

When the tree is more than a few nodes, walk it with the [Alertmanager Route Tester](/alertmanager-route-tester) instead of in your head. Paste your route tree — a bare `route:` block or a full `alertmanager.yml`, of which only the `route` block is read — and the sample alert's labels, one `key=value` per line. It reproduces the semantics exactly: first-match-wins, `continue: true` fan-out, anchored regexes, missing-label-as-empty-string, and grouping inheritance.

What you get back is every receiver the alert reaches, in evaluation order, each with its route-path breadcrumb from the root down to the matched node, a tag on any match reached only via `continue`, and the effective `group_by` after inheritance. It is a dry run of dispatch — no notification is sent, nothing is uploaded, and it all runs in your browser, so you can safely paste internal receiver names and private team labels.

Once the labels are confirmed correct at the source with the [Prometheus Relabel Tester](/prometheus-relabel-tester) and your rules are proven to fire with [AlertLint](/loki-alert-rule-tester), the route tree is the last hop to get right. Walk it before it pages anyone — and the next time an alert reaches the wrong receiver, you will know which node sent it there.

[Open the Alertmanager Route Tester →](/alertmanager-route-tester)

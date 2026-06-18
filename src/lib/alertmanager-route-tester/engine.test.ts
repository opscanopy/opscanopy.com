/**
 * Alertmanager Route Tester — engine tests.
 *
 * The fixtures use the canonical routing example from the Alertmanager
 * configuration docs (https://prometheus.io/docs/alerting/latest/configuration/#route)
 * — a root `default-receiver` with `team-X-mails` / `team-DB-pages` / `team-Y-pages`
 * children matching on `service`/`team`/`severity`, plus a `continue` case — and
 * verify the walk reproduces Alertmanager's first-match-then-continue semantics,
 * matcher operators (`=`, `!=`, `=~`, `!~`, `match`, `match_re`), receiver and
 * group_by inheritance, full-config `.route` extraction, and that malformed or
 * empty input never throws.
 */
import { describe, it, expect } from 'vitest';
import { matchRoute } from './engine';

/* The docs routing tree, condensed to the routing-relevant fields. */
const DOCS_TREE = `
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
    - receiver: 'team-Y-pages'
      match:
        team: backend
      match_re:
        severity: 'critical|page'
`;

describe('matchRoute — docs routing tree', () => {
  it('routes a frontend alert to team-X-mails (first matching child)', () => {
    const r = matchRoute(DOCS_TREE, 'alertname=Foo\nteam=frontend');
    expect(r.ok).toBe(true);
    expect(r.matches).toHaveLength(1);
    expect(r.matches![0].receiver).toBe('team-X-mails');
    expect(r.matches![0].path).toEqual(['root', 'team-X-mails']);
  });

  it('routes a database alert to team-DB-pages via match on service', () => {
    const r = matchRoute(DOCS_TREE, 'alertname=HighLatency\nservice=database\ncluster=eu');
    expect(r.ok).toBe(true);
    expect(r.matches).toHaveLength(1);
    expect(r.matches![0].receiver).toBe('team-DB-pages');
    // group_by is OVERRIDDEN on this child (alertname, cluster, database).
    expect(r.matches![0].grouping.group_by).toEqual([
      'alertname',
      'cluster',
      'database',
    ]);
  });

  it('inherits group_by + timers from the root when the child does not set them', () => {
    const r = matchRoute(DOCS_TREE, 'team=frontend');
    expect(r.ok).toBe(true);
    const m = r.matches![0];
    expect(m.grouping.group_by).toEqual(['alertname', 'cluster', 'service']);
    expect(m.grouping.group_wait).toBe('30s');
    expect(m.grouping.group_interval).toBe('5m');
    expect(m.grouping.repeat_interval).toBe('4h');
  });

  it('requires BOTH match and match_re on team-Y-pages (logical AND)', () => {
    // team=backend but severity does not satisfy the anchored critical|page re.
    const noMatch = matchRoute(DOCS_TREE, 'team=backend\nseverity=warning');
    expect(noMatch.ok).toBe(true);
    // Falls through to the root default receiver.
    expect(noMatch.matches![0].receiver).toBe('default-receiver');
    expect(noMatch.matches![0].path).toEqual(['root']);

    // Both clauses satisfied → team-Y-pages.
    const hit = matchRoute(DOCS_TREE, 'team=backend\nseverity=critical');
    expect(hit.matches![0].receiver).toBe('team-Y-pages');
  });

  it('match_re is FULLY ANCHORED — a partial value does not match', () => {
    // severity=critical-but-not matches ^(?:critical|page)$? No: it is not exactly
    // "critical", so the anchored regex rejects it.
    const r = matchRoute(DOCS_TREE, 'team=backend\nseverity=criticalish');
    expect(r.matches![0].receiver).toBe('default-receiver');
  });

  it('falls through to the root default-receiver when no child matches', () => {
    const r = matchRoute(DOCS_TREE, 'team=platform\nseverity=info');
    expect(r.ok).toBe(true);
    expect(r.matches).toHaveLength(1);
    expect(r.matches![0].receiver).toBe('default-receiver');
    expect(r.matches![0].path).toEqual(['root']);
  });
});

describe('matchRoute — continue semantics', () => {
  const CONTINUE_TREE = `
route:
  receiver: 'default-receiver'
  routes:
    - receiver: 'all-critical-audit'
      matchers:
        - severity="critical"
      continue: true
    - receiver: 'team-Y-pages'
      match:
        team: backend
`;

  it('a matching child with continue:true ALSO routes to a later sibling', () => {
    const r = matchRoute(CONTINUE_TREE, 'team=backend\nseverity=critical');
    expect(r.ok).toBe(true);
    expect(r.matches).toHaveLength(2);
    const receivers = r.matches!.map((m) => m.receiver);
    expect(receivers).toEqual(['all-critical-audit', 'team-Y-pages']);
    // The FIRST match is the primary path; the SECOND was only reached because
    // the first set continue:true, so it is flagged viaContinue.
    expect(r.matches![0].viaContinue).toBe(false); // primary (first) sibling
    expect(r.matches![1].viaContinue).toBe(true); // reached only via continue
  });

  it('without continue, only the FIRST matching sibling fires', () => {
    const NO_CONTINUE = `
route:
  receiver: 'default'
  routes:
    - receiver: 'first'
      matchers: ['severity="critical"']
    - receiver: 'second'
      matchers: ['team="backend"']
`;
    const r = matchRoute(NO_CONTINUE, 'severity=critical\nteam=backend');
    expect(r.matches).toHaveLength(1);
    expect(r.matches![0].receiver).toBe('first');
  });

  it('continue:true that matches but no later sibling matches yields one match', () => {
    const r = matchRoute(CONTINUE_TREE, 'team=frontend\nseverity=critical');
    expect(r.matches).toHaveLength(1);
    expect(r.matches![0].receiver).toBe('all-critical-audit');
  });
});

describe('matchRoute — matcher operators', () => {
  const TREE = `
route:
  receiver: 'default'
  routes:
    - receiver: 'eq'
      matchers: ['env="prod"']
    - receiver: 'neq'
      matchers: ['env!="prod"', 'team="sre"']
    - receiver: 're'
      matchers: ['service=~"web|api"']
    - receiver: 'nre'
      matchers: ['region!~"us-.*"']
`;

  it('= exact equality', () => {
    expect(matchRoute(TREE, 'env=prod').matches![0].receiver).toBe('eq');
  });

  it('!= inequality (and AND with a second matcher)', () => {
    expect(matchRoute(TREE, 'env=dev\nteam=sre').matches![0].receiver).toBe('neq');
  });

  it('=~ anchored regex alternation', () => {
    expect(matchRoute(TREE, 'env=dev\nservice=api').matches![0].receiver).toBe('re');
  });

  it('!~ negative anchored regex', () => {
    // region=eu-west does NOT match us-.*, so the !~ holds.
    expect(matchRoute(TREE, 'env=dev\nregion=eu-west').matches![0].receiver).toBe('nre');
  });

  it('a missing label is treated as the empty string', () => {
    // env is absent → treated as "" → env!="prod" holds, but team!=sre so the
    // `neq` route needs team=sre; here team is absent so it falls through.
    const r = matchRoute(TREE, 'unrelated=1');
    // env="" so `eq` (env="prod") fails; `neq` needs team="sre" (absent) → fail;
    // service absent → service=~"web|api" fails; region absent → "" !~ us-.* holds.
    expect(r.matches![0].receiver).toBe('nre');
  });
});

describe('matchRoute — match_re anchoring on standalone match_re block', () => {
  const TREE = `
route:
  receiver: 'default'
  routes:
    - receiver: 'staging'
      match_re:
        env: 'staging-.*'
`;
  it('matches an env that the anchored pattern fully covers', () => {
    expect(matchRoute(TREE, 'env=staging-eu').matches![0].receiver).toBe('staging');
  });
  it('rejects an env with a prefix the anchor disallows', () => {
    expect(matchRoute(TREE, 'env=pre-staging-eu').matches![0].receiver).toBe('default');
  });
});

describe('matchRoute — nested subtree + breadcrumb', () => {
  const TREE = `
route:
  receiver: 'default'
  routes:
    - receiver: 'web-team'
      match:
        service: web
      routes:
        - receiver: 'web-pager'
          matchers: ['severity="critical"']
        - receiver: 'web-slack'
          matchers: ['severity=~"warning|info"']
`;

  it('descends into a nested child and records the full path', () => {
    const r = matchRoute(TREE, 'service=web\nseverity=critical');
    expect(r.matches).toHaveLength(1);
    expect(r.matches![0].receiver).toBe('web-pager');
    expect(r.matches![0].path).toEqual(['root', 'web-team', 'web-pager']);
  });

  it('a matched parent whose children all miss terminates at the parent', () => {
    const r = matchRoute(TREE, 'service=web\nseverity=info');
    // severity=info matches the warning|info child.
    expect(r.matches![0].receiver).toBe('web-slack');
    const r2 = matchRoute(TREE, 'service=web\nseverity=debug');
    // No child matches → the matched parent web-team is terminal.
    expect(r2.matches![0].receiver).toBe('web-team');
    expect(r2.matches![0].path).toEqual(['root', 'web-team']);
  });
});

describe('matchRoute — full config and bare route inputs', () => {
  it('extracts .route from a full Alertmanager config', () => {
    const FULL = `
global:
  resolve_timeout: 5m
route:
  receiver: 'default-receiver'
  routes:
    - receiver: 'oncall'
      matchers: ['severity="critical"']
receivers:
  - name: 'default-receiver'
  - name: 'oncall'
`;
    const r = matchRoute(FULL, 'severity=critical');
    expect(r.ok).toBe(true);
    expect(r.matches![0].receiver).toBe('oncall');
  });

  it('accepts a bare route object (no top-level route: key)', () => {
    const BARE = `
receiver: 'root-rx'
routes:
  - receiver: 'child-rx'
    match:
      team: a
`;
    const r = matchRoute(BARE, 'team=a');
    expect(r.ok).toBe(true);
    expect(r.matches![0].receiver).toBe('child-rx');
  });
});

describe('matchRoute — robustness (never throws)', () => {
  it('empty config → ok:false, no throw', () => {
    const r = matchRoute('', 'team=a');
    expect(r.ok).toBe(false);
    expect(r.error).toBeTruthy();
    expect(r.matches).toBeUndefined();
  });

  it('whitespace-only config → ok:false', () => {
    expect(matchRoute('   \n  ', 'team=a').ok).toBe(false);
  });

  it('garbage / unbalanced YAML → ok:false with a parse error', () => {
    const r = matchRoute('route: [unclosed', 'team=a');
    expect(r.ok).toBe(false);
    expect(r.error).toContain('Could not parse YAML');
  });

  it('a YAML scalar (not a mapping) → ok:false', () => {
    const r = matchRoute('just a string', 'team=a');
    expect(r.ok).toBe(false);
  });

  it('a mapping with no route: and no route-like keys → ok:false', () => {
    const r = matchRoute('global:\n  resolve_timeout: 5m', 'team=a');
    expect(r.ok).toBe(false);
  });

  it('empty labels → still ok, matches against empty strings, with a warning', () => {
    const r = matchRoute(DOCS_TREE, '');
    expect(r.ok).toBe(true);
    expect(r.matches![0].receiver).toBe('default-receiver');
    expect(r.warnings.some((w) => /No alert labels/i.test(w))).toBe(true);
  });

  it('non-string args do not throw', () => {
    // @ts-expect-error — exercising the runtime guard with a bad type.
    const r = matchRoute(null, undefined);
    expect(r.ok).toBe(false);
  });

  it('malformed matcher strings are skipped with a warning, not a throw', () => {
    const TREE = `
route:
  receiver: 'default'
  routes:
    - receiver: 'child'
      matchers:
        - 'this is not a matcher'
        - team="a"
`;
    const r = matchRoute(TREE, 'team=a');
    expect(r.ok).toBe(true);
    // The unparseable matcher is dropped; the valid team="a" still applies and
    // (since it is the only surviving matcher) the child matches.
    expect(r.matches![0].receiver).toBe('child');
    expect(r.warnings.some((w) => /Could not parse matcher/i.test(w))).toBe(true);
  });

  it('label lines without = are reported and skipped', () => {
    const r = matchRoute(DOCS_TREE, 'team frontend\nteam=frontend');
    expect(r.ok).toBe(true);
    expect(r.matches![0].receiver).toBe('team-X-mails');
    expect(r.warnings.some((w) => /without "key=value"/i.test(w))).toBe(true);
  });

  it('an invalid regex in match_re cannot match (no throw)', () => {
    const TREE = `
route:
  receiver: 'default'
  routes:
    - receiver: 'bad-re'
      match_re:
        env: '([unclosed'
`;
    const r = matchRoute(TREE, 'env=anything');
    expect(r.ok).toBe(true);
    expect(r.matches![0].receiver).toBe('default');
  });

  it('warns when a resolved path has no receiver anywhere up the chain', () => {
    const TREE = `
route:
  routes:
    - match:
        team: a
`;
    const r = matchRoute(TREE, 'team=a');
    expect(r.ok).toBe(true);
    expect(r.matches![0].receiver).toBe('');
    expect(r.warnings.some((w) => /NO receiver/i.test(w))).toBe(true);
  });

  it('quoted label values are unquoted and unescaped', () => {
    const TREE = `
route:
  receiver: 'default'
  routes:
    - receiver: 'child'
      matchers: ['msg="a b"']
`;
    const r = matchRoute(TREE, 'msg="a b"');
    expect(r.matches![0].receiver).toBe('child');
  });

  it('a malformed matcher on a terminal node warns exactly once (no duplicate)', () => {
    // The child both fails to match (so the parent terminates) AND is the node
    // recorded as terminal here. Its single bad matcher must warn ONCE, not
    // twice (the matcher array is computed once and reused).
    const TREE = `
route:
  receiver: 'default'
  matchers:
    - 'this is not a matcher'
`;
    const r = matchRoute(TREE, 'team=a');
    expect(r.ok).toBe(true);
    const parseWarnings = r.warnings.filter((w) => /Could not parse matcher/i.test(w));
    expect(parseWarnings).toHaveLength(1);
  });
});

describe('matchRoute — regex safety, brace matchers, non-scalar values', () => {
  it('a catastrophic-backtracking match_re is rejected and never matches (returns fast)', () => {
    // (a+)+$ is the classic ReDoS shape. The regex-safety guard rejects it, so
    // the matcher can never hold — and crucially the call returns promptly even
    // for an adversarial all-`a` input rather than hanging the thread.
    const TREE = `
route:
  receiver: 'default'
  routes:
    - receiver: 'redos'
      match_re:
        host: '(a+)+$'
`;
    const evil = 'a'.repeat(40);
    const start = Date.now();
    const r = matchRoute(TREE, `host=${evil}`);
    const elapsed = Date.now() - start;
    expect(r.ok).toBe(true);
    // The unsafe pattern cannot match → falls through to the root default.
    expect(r.matches![0].receiver).toBe('default');
    // Tight budget: with the guard this is sub-millisecond; without it the raw
    // backtracking RegExp on 40 'a's would take many seconds.
    expect(elapsed).toBeLessThan(500);
  });

  it('a brace-wrapped comma-separated matcher splits into every matcher (AND)', () => {
    const TREE = `
route:
  receiver: 'default'
  routes:
    - receiver: 'child'
      matchers:
        - '{a="1",b="2"}'
`;
    // Both a=1 AND b=2 present → the child matches.
    const hit = matchRoute(TREE, 'a=1\nb=2');
    expect(hit.matches![0].receiver).toBe('child');
    // Only a=1 → the b="2" matcher (previously silently dropped) now fails.
    const miss = matchRoute(TREE, 'a=1');
    expect(miss.matches![0].receiver).toBe('default');
  });

  it('a non-scalar match value emits a warning rather than silently failing', () => {
    const TREE = `
route:
  receiver: 'default'
  routes:
    - receiver: 'child'
      match:
        team: [a, b]
`;
    const r = matchRoute(TREE, 'team=a');
    expect(r.ok).toBe(true);
    // It still degrades gracefully (does not match the corrupted "a,b" value)…
    expect(r.matches![0].receiver).toBe('default');
    // …but the problem is now surfaced.
    expect(r.warnings.some((w) => /not a scalar/i.test(w))).toBe(true);
  });
});

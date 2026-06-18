/**
 * Alertmanager Route Tester — shared types for the client-side routing engine.
 *
 * The tester runs ENTIRELY in the browser: paste an Alertmanager route tree
 * (or a full config with a `.route` block) plus a sample alert's labels, and
 * get back the receiver(s) the alert would reach, the route-path breadcrumb
 * each match descends through, and the effective grouping inherited along the
 * way. The shapes below model just that result surface — they intentionally do
 * NOT model the entire Alertmanager config schema, only what routing needs.
 *
 * Reference: Alertmanager routing docs and the `route` block —
 * https://prometheus.io/docs/alerting/latest/configuration/#route
 */

/** A single label match operator parsed from a `matchers:` string. */
export type MatcherOp = '=' | '!=' | '=~' | '!~';

/**
 * One normalised matcher. `match`/`match_re` map onto `=`/`=~`; the modern
 * `matchers:` strings carry their operator directly. `value` is the literal
 * (for `=`/`!=`) or the raw RE2 source (for `=~`/`!~`).
 */
export interface Matcher {
  name: string;
  op: MatcherOp;
  value: string;
  /** Where this matcher came from, surfaced for explanation. */
  source: 'match' | 'match_re' | 'matchers';
}

/**
 * The grouping / timing fields that are INHERITED down the tree when a child
 * does not set them. `group_by` is the only field the UI prominently shows, but
 * the timers are carried too so a future surface can render them.
 */
export interface Grouping {
  group_by?: string[];
  group_wait?: string;
  group_interval?: string;
  repeat_interval?: string;
}

/**
 * One terminal match: a leaf the alert reaches after walking the tree. Carries
 * the resolved receiver, the human-readable path breadcrumb, and the effective
 * (inherited) grouping at that node.
 */
export interface RouteMatch {
  /** Resolved receiver name (inherited from the nearest ancestor that set one). */
  receiver: string;
  /** Breadcrumb of node labels from root to the terminal node, e.g. ["root", "team-X-mails"]. */
  path: string[];
  /** Effective grouping at the terminal node (inherited + own). */
  grouping: Grouping;
  /** True when this match was reached only because an ancestor set `continue: true`. */
  viaContinue: boolean;
  /** The matchers evaluated on the terminal node itself (for explanation). */
  matchers: Matcher[];
}

/**
 * The complete result of a `matchRoute` call. Never thrown — a parse failure or
 * a structurally invalid route is surfaced via `ok: false` + `error`, and any
 * non-fatal observations (e.g. a route with no receiver anywhere up the chain)
 * via `warnings`.
 */
export interface MatchRouteResult {
  /** True when the config + labels parsed and at least the tree was walkable. */
  ok: boolean;
  /** Present only when `ok` is false — a human-readable reason. */
  error?: string;
  /** Every terminal receiver the alert reaches, in route-evaluation order. */
  matches?: RouteMatch[];
  /** Non-fatal observations (missing receiver, empty labels, …). */
  warnings: string[];
}

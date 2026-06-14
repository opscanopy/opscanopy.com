/**
 * GitHub Actions Expression & Trigger Tester — public IO / result shapes.
 *
 * This module is types only — no logic, no DOM. It is the shared contract
 * between the engine (src/lib/github-actions-expression-tester/*) and the
 * island (src/components/GithubActionsExpressionPlayground.astro).
 *
 * Two engines live behind one façade:
 *   • Tab 1 — expression evaluator: evaluate a ${{ }} body (or a full `if:`
 *     value) against an editable mock context, replicating GitHub's exact
 *     coercion/operator semantics.
 *   • Tab 2 — trigger simulator: decide, per job, RUNS / SKIPPED for a given
 *     push / pull_request / tag event.
 */

/* ── Tab 1: expression evaluator ─────────────────────────────────────────── */

/** The runtime value domain GitHub expressions operate over. `null` is a
 *  first-class falsy value (missing context access also yields null). Objects
 *  and arrays enter via fromJSON / the mock context / toJSON. */
export type GhaValue = null | boolean | number | string | GhaObject | GhaArray;
export interface GhaObject {
  [k: string]: GhaValue;
}
export type GhaArray = GhaValue[];

/** The mock evaluation context — the editable "what GitHub would inject" tree.
 *  Every top-level context is optional; accessing a missing one yields null. */
export interface EvalContext {
  github?: GhaObject;
  env?: GhaObject;
  job?: GhaObject;
  steps?: GhaObject;
  runner?: GhaObject;
  needs?: GhaObject;
  matrix?: GhaObject;
  strategy?: GhaObject;
  inputs?: GhaObject;
  vars?: GhaObject;
  secrets?: GhaObject;
  /** Status the status-functions resolve against (success()/failure()/…). */
  jobStatus?: 'success' | 'failure' | 'cancelled';
  /** Step conclusions used to compute success()/failure() when no explicit
   *  jobStatus override is given. */
  stepConclusions?: Array<'success' | 'failure' | 'cancelled' | 'skipped'>;
}

/** One token → meaning row for the breakdown panel (mirrors PromQL ExplainPart). */
export interface ExprPart {
  token: string;
  meaning: string;
}

/** A non-fatal advisory raised during parse/eval (the footgun lives here). */
export interface ExprWarning {
  id:
    | 'literal-if-always-true'
    | 'unknown-function'
    | 'unknown-context'
    | 'undefined-property'
    | 'fromjson-parse'
    | 'hashfiles-stub'
    | 'event-payload-stub'
    | 'format-index'
    | 'star-misuse';
  severity: 'warning' | 'info';
  message: string;
  /** 0-based char offsets into the raw input when locatable. */
  from?: number;
  to?: number;
}

export interface EvaluateResult {
  /** Best-effort even on error so the UI always renders something. */
  value: GhaValue;
  /** Deterministic string rendering of `value` exactly as GitHub substitutes it
   *  into a string context (true→"true", null→"", object→JSON, …). */
  rendered: string;
  /** Truthiness under GitHub's rules — what an `if:` would decide. */
  truthy: boolean;
  /** Inside-out reading of the expression (period-terminated, OpsCanopy voice). */
  explanation: string;
  /** Token-by-token glosses. */
  breakdown: ExprPart[];
  /** Footgun + advisory diagnostics. NEVER throws — fatal parse problems land here too. */
  warnings: ExprWarning[];
  /** Present only on an unrecoverable parse problem; `value` still holds a safe fallback (null). */
  error?: string;
  /** Echo of the GHA semantics version the result conforms to. */
  semanticsVersion: string;
}

/* ── Tab 2: trigger simulator ────────────────────────────────────────────── */

export type EventName =
  | 'push'
  | 'pull_request'
  | 'pull_request_target'
  | 'workflow_dispatch'
  | 'schedule'
  | 'release'
  | 'tag'
  | (string & {});

export interface SimEvent {
  event: EventName;
  /** Branch name for push / PR base, e.g. "main", "feature/x". Undefined for tag events. */
  branch?: string;
  /** Tag name for a tag push, e.g. "v1.2.3". */
  tag?: string;
  /** Files added / modified / removed in the push or PR diff (repo-relative paths). */
  changedFiles?: string[];
}

export type Decision = 'runs' | 'skipped' | 'not-evaluated';

export interface FilterTrace {
  /** Which filter decided: 'event' | 'branches' | 'branches-ignore' | 'tags' |
   *  'tags-ignore' | 'paths' | 'paths-ignore' | 'if'. */
  filter: string;
  outcome: 'match' | 'no-match' | 'excluded' | 'n/a';
  /** The concrete pattern that decided (or a human reason). */
  reason: string;
}

export interface JobDecision {
  jobId: string;
  decision: Decision;
  /** The single human-readable deciding reason for the table cell. */
  reason: string;
  /** Ordered trace of every filter consulted (for the expandable detail). */
  trace: FilterTrace[];
}

export interface SimulateResult {
  /** Workflow-level: did `on:` accept this event at all? */
  workflowTriggered: boolean;
  workflowReason: string;
  jobs: JobDecision[];
  /** Parse / input advisories. */
  warnings: ExprWarning[];
  error?: string;
  semanticsVersion: string;
}

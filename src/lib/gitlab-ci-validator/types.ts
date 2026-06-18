/**
 * GitLab CI Validator — shared types for the client-side validator engine.
 *
 * The validator runs ENTIRELY in the browser: paste a `.gitlab-ci.yml` and get
 * back YAML parse errors plus structural and pipeline-misconfiguration findings.
 * Its job is to catch the mistakes that make a GitLab pipeline fail to start (or
 * silently mis-route a job) BEFORE you push: jobs with no script, a `stage` that
 * is not in `stages:`, `needs`/`extends` pointing at jobs that do not exist, an
 * invalid `when:` value, legacy `only/except`, and so on.
 *
 * The shapes mirror the GitHub Actions Validator so both tools share one result
 * surface, one playground renderer, and one mental model.
 */

/** How serious a finding is. `error` blocks the pipeline; `warning`/`info` advise. */
export type Severity = 'error' | 'warning' | 'info';

/** A single structural or misconfiguration finding about the pipeline. */
export interface Finding {
  /** Stable, machine-readable rule id, e.g. "stage-not-declared". */
  id: string;
  /** Severity bucket used for sorting and the summary roll-up. */
  severity: Severity;
  /** Short, human-readable headline. */
  title: string;
  /** A fuller explanation of what was found and why it matters. */
  detail: string;
  /** 1-based source line the finding refers to, when one can be located. */
  line?: number;
  /** Concrete, actionable advice on how to fix it. */
  remediation?: string;
}

/**
 * The complete result of a `validate` call. Never thrown — parse failures are
 * surfaced via `ok: false` + `error`, everything else via `findings`.
 */
export interface ValidateResult {
  /** True when the YAML parsed; individual findings may still be present. */
  ok: boolean;
  /** Present only when `ok` is false — a line-referenced parse error. */
  error?: string;
  /** Every structural + misconfiguration finding, sorted error → warning → info. */
  findings: Finding[];
  /** Roll-up counts by severity, for the results header. */
  summary: { errors: number; warnings: number; infos: number };
}

/**
 * GitHub Actions Validator — shared types for the client-side validator engine.
 *
 * The validator runs ENTIRELY in the browser: paste a GitHub Actions workflow
 * YAML and get back structural errors plus security-misconfiguration findings.
 * Its differentiator versus actionlint is the security focus (untrusted PR code
 * execution, script injection, unpinned actions, over-broad permissions, …) and
 * zero install. The shapes below model just that result surface.
 */

/** How serious a finding is. `error` blocks confidence; `warning`/`info` advise. */
export type Severity = 'error' | 'warning' | 'info';

/** A single structural or security finding about the workflow. */
export interface Finding {
  /** Stable, machine-readable rule id, e.g. "pull-request-target-checkout". */
  id: string;
  /** Severity bucket used for sorting and the summary roll-up. */
  severity: Severity;
  /** Short, human-readable headline. */
  title: string;
  /** A fuller explanation of what was found and why it is risky. */
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
  /** Every structural + security finding, sorted error → warning → info. */
  findings: Finding[];
  /** Roll-up counts by severity, for the results header. */
  summary: { errors: number; warnings: number; infos: number };
}

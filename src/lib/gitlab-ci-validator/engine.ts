/**
 * GitLab CI Validator — a CLIENT-SIDE, dependency-free checker that parses a
 * `.gitlab-ci.yml` and reports YAML errors plus the structural and
 * pipeline-misconfiguration mistakes that GitLab itself would reject (or that
 * silently mis-route a job).
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │  WHAT THIS IS                                                              │
 * │                                                                            │
 * │  A pragmatic, in-browser linter for GitLab CI/CD configuration. It models  │
 * │  the rules from GitLab's `.gitlab-ci.yml` keyword reference and flags:      │
 * │                                                                            │
 * │    • the document is not a YAML mapping.                                   │
 * │    • a job (any top-level key that is NOT a global keyword and does NOT     │
 * │      start with a dot) that defines none of script / run / trigger /        │
 * │      extends — GitLab errors with "jobs config should contain at least one  │
 * │      visible job" / "script should be a … not nil".                         │
 * │    • a job whose `stage` is not present in `stages:` (or the five default   │
 * │      stages .pre, build, test, deploy, .post).                              │
 * │    • `needs` / `dependencies` that reference a job that does not exist.     │
 * │    • `extends` that references a job or hidden `.template` that does not     │
 * │      exist.                                                                  │
 * │    • a `when:` value outside the allowed set                                │
 * │      (on_success/on_failure/always/manual/delayed/never).                   │
 * │    • `rules:` that is not a list; legacy `only` / `except` (recommend rules).│
 * │    • `image:` / `services:` shapes that GitLab does not accept.             │
 * │    • a top-level key that looks like a misspelled global keyword.           │
 * │                                                                            │
 * │  It parses YAML for structure, then attaches honest line numbers via a raw  │
 * │  line scan where the parsed tree cannot. It NEVER throws: a YAML parse       │
 * │  failure returns { ok:false, error } with zero findings.                    │
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

interface PipelineJob {
  stage?: unknown;
  script?: unknown;
  run?: unknown;
  trigger?: unknown;
  extends?: unknown;
  needs?: unknown;
  dependencies?: unknown;
  when?: unknown;
  rules?: unknown;
  only?: unknown;
  except?: unknown;
  image?: unknown;
  services?: unknown;
  'before_script'?: unknown;
  'after_script'?: unknown;
}

/* ────────────────────────────────────────────────────────────────────────── *
 *  Vocabulary — the keywords GitLab reserves at the top level and the values
 *  GitLab accepts for `when:` and the default stage list.
 * ────────────────────────────────────────────────────────────────────────── */

/**
 * Top-level keywords that configure the whole pipeline rather than a job.
 * Anything else (that does not start with `.`) is treated as a JOB. `pages` is
 * NOT here on purpose — it is a regular job in modern GitLab, so it must obey
 * the job rules (define a script, etc.).
 *
 * Source: GitLab `.gitlab-ci.yml` keyword reference (global keywords section).
 */
const GLOBAL_KEYWORDS = new Set<string>([
  'stages',
  'default',
  'include',
  'variables',
  'workflow',
  'image',
  'services',
  'before_script',
  'after_script',
  'cache',
]);

/** The five implicit stages GitLab always provides, in pipeline order. */
const DEFAULT_STAGES = ['.pre', 'build', 'test', 'deploy', '.post'];

/** Allowed values for a job/rule `when:` (GitLab `when` keyword reference). */
const WHEN_VALUES = new Set<string>([
  'on_success',
  'on_failure',
  'always',
  'manual',
  'delayed',
  'never',
]);

/* ────────────────────────────────────────────────────────────────────────── *
 *  Small helpers.
 * ────────────────────────────────────────────────────────────────────────── */

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** A job id is "hidden" (a reusable template) when it starts with a dot. */
function isHidden(jobId: string): boolean {
  return jobId.startsWith('.');
}

/**
 * True when a `script:`/`run:` value is an executable surface: a non-empty
 * string, or an array containing at least one non-empty string. An empty string
 * or empty/all-empty array is rejected by GitLab (the job does nothing), so it
 * must not count as present.
 */
function isNonEmptyCommand(v: unknown): boolean {
  if (typeof v === 'string') return v.trim() !== '';
  if (Array.isArray(v)) return v.some((item) => typeof item === 'string' && item.trim() !== '');
  // A non-string, non-array truthy value (e.g. a mapping for `run:`) is treated
  // as present — we only special-case the empty string/array surfaces.
  return v !== undefined && v !== null;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Best-effort line-referenced description of a js-yaml parse error. Mirrors the
 * gha-validator engine so error messaging is consistent across tools.
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
 * starting at `fromLine` (1-based) and stopping BEFORE `toLine` (1-based,
 * exclusive). Returns undefined if not found. Used to attach honest line numbers
 * to findings located by text scan; passing `toLine` keeps a per-job scan bound
 * to the job's own block instead of running to EOF.
 */
function findLine(
  lines: string[],
  test: (line: string) => boolean,
  fromLine = 1,
  toLine?: number,
): number | undefined {
  const end = toLine === undefined ? lines.length : Math.min(lines.length, toLine - 1);
  for (let i = Math.max(0, fromLine - 1); i < end; i++) {
    if (test(lines[i])) return i + 1;
  }
  return undefined;
}

/**
 * Build a single-pass index of every top-level key → its 1-based line number,
 * plus a sorted list of those line numbers. Scanning `lines` once here lets
 * `findTopLevelKeyLine` answer in O(1) and lets per-job inner scans be bounded
 * to the job's own block (avoiding an O(n²) re-scan of the whole file per job).
 *
 * A top-level key sits at column 0 (no leading whitespace) followed by `:`.
 * The first occurrence wins (a key declared twice keeps its first line).
 */
interface TopLevelLineIndex {
  /** key → 1-based line number of its column-0 declaration. */
  byKey: Map<string, number>;
  /** All top-level declaration lines, ascending (1-based). */
  sortedLines: number[];
}

function buildTopLevelLineIndex(lines: string[]): TopLevelLineIndex {
  const byKey = new Map<string, number>();
  const sortedLines: number[] = [];
  const re = /^(\S[^:]*?)\s*:/;
  for (let i = 0; i < lines.length; i++) {
    const m = re.exec(lines[i]);
    if (!m) continue;
    const key = m[1];
    const lineNo = i + 1;
    sortedLines.push(lineNo);
    if (!byKey.has(key)) byKey.set(key, lineNo);
  }
  return { byKey, sortedLines };
}

/** The 1-based line a top-level key (e.g. a job id) is declared on (O(1)). */
function findTopLevelKeyLine(index: TopLevelLineIndex, key: string): number | undefined {
  return index.byKey.get(key);
}

/**
 * The 1-based line of the NEXT top-level key after `fromLine`, used as an
 * exclusive upper bound so a job's inner field scan stays within its own block
 * rather than running to EOF. Returns undefined when `fromLine` is the last
 * top-level block (scan to EOF).
 */
function nextTopLevelLine(index: TopLevelLineIndex, fromLine: number | undefined): number | undefined {
  if (fromLine === undefined) return undefined;
  for (const ln of index.sortedLines) {
    if (ln > fromLine) return ln;
  }
  return undefined;
}

/**
 * Collect the declared stage names from `stages:`. Returns null when `stages:`
 * is absent (caller then uses the default stages); returns [] when present but
 * not a usable list (a separate finding is raised for the bad shape).
 */
function collectStages(stages: unknown): string[] | null {
  if (stages === undefined || stages === null) return null;
  if (!Array.isArray(stages)) return [];
  return stages.filter((s): s is string => typeof s === 'string');
}

/* ────────────────────────────────────────────────────────────────────────── *
 *  Public API.
 * ────────────────────────────────────────────────────────────────────────── */

/**
 * Validate a `.gitlab-ci.yml`. NEVER throws: a parse failure returns
 * { ok:false, error }, an empty document returns a single structural error, and
 * any unexpected internal error is caught and surfaced as a generic info note.
 */
export function validate(yamlText: string): ValidateResult {
  const empty = { errors: 0, warnings: 0, infos: 0 };

  // 0. Defensive: the contract is `string`, but never throw even if a caller
  // passes null/undefined/non-string at runtime.
  if (typeof yamlText !== 'string' || yamlText.trim() === '') {
    return {
      ok: false,
      error: 'Paste a .gitlab-ci.yml pipeline to validate.',
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
        'The document is not a YAML mapping. A .gitlab-ci.yml must be a top-level object of global keywords and job definitions.',
      findings: [],
      summary: { ...empty },
    };
  }

  const lines = yamlText.split(/\r?\n/);
  const lineIndex = buildTopLevelLineIndex(lines);
  const findings: Finding[] = [];
  const add = (f: Finding) => findings.push(f);

  try {
    const root = doc as Record<string, unknown>;
    const { jobIds, templateIds } = partitionKeys(root);
    checkTopLevelKeywords(root, lines, lineIndex, add);
    checkStages(root, lines, lineIndex, add);
    const stageNames = resolveStageNames(root);
    const declaredStages = collectStages(root.stages);
    for (const jobId of [...jobIds, ...templateIds]) {
      checkJob(jobId, root[jobId], jobIds, templateIds, stageNames, declaredStages, lines, lineIndex, add);
    }
    if (jobIds.length === 0) {
      add({
        id: 'no-jobs',
        severity: 'error',
        title: 'No visible jobs are defined.',
        detail:
          'A .gitlab-ci.yml must contain at least one visible job (a top-level key that is not a global keyword and does not start with a dot). Hidden templates and global keywords alone do not produce a pipeline.',
        line: 1,
        remediation: 'Add at least one job, e.g. `build:` with a `script:` list.',
      });
    }
  } catch (e) {
    // The contract says never throw. If a heuristic trips on unexpected input,
    // degrade gracefully to an info note rather than losing the whole run.
    add({
      id: 'internal-analysis-incomplete',
      severity: 'info',
      title: 'Some checks could not complete.',
      detail: `An internal check stopped early on this input (${String(e)}). Results above are still valid.`,
    });
  }

  return finalize(findings);
}

/* ────────────────────────────────────────────────────────────────────────── *
 *  Key partitioning — split the top level into global keywords, visible jobs,
 *  and hidden `.templates`.
 * ────────────────────────────────────────────────────────────────────────── */

function partitionKeys(root: Record<string, unknown>): {
  jobIds: string[];
  templateIds: string[];
} {
  const jobIds: string[] = [];
  const templateIds: string[] = [];
  for (const key of Object.keys(root)) {
    if (GLOBAL_KEYWORDS.has(key)) continue;
    if (isHidden(key)) templateIds.push(key);
    else jobIds.push(key);
  }
  return { jobIds, templateIds };
}

/** The full set of valid stage names: declared `stages:` or the defaults. */
function resolveStageNames(root: Record<string, unknown>): Set<string> {
  const declared = collectStages(root.stages);
  const names = declared && declared.length > 0 ? declared : DEFAULT_STAGES;
  // `.pre` and `.post` are always valid, even alongside a custom `stages:` list.
  return new Set<string>([...names, '.pre', '.post']);
}

/* ────────────────────────────────────────────────────────────────────────── *
 *  Top-level keyword checks — typos and bad shapes on global keywords.
 * ────────────────────────────────────────────────────────────────────────── */

function checkTopLevelKeywords(
  root: Record<string, unknown>,
  lines: string[],
  lineIndex: TopLevelLineIndex,
  add: (f: Finding) => void,
): void {
  for (const key of Object.keys(root)) {
    if (GLOBAL_KEYWORDS.has(key) || isHidden(key)) continue;
    // A visible job whose name is one edit away from a reserved global keyword
    // is almost always a typo of that keyword (e.g. `stage:` at the top level,
    // `varables:`, `beforescript:`). Warn — it will be treated as a JOB instead.
    const suspect = nearestKeyword(key);
    if (suspect) {
      add({
        id: 'misspelled-keyword',
        severity: 'warning',
        title: `Top-level key “${key}” looks like a misspelling of “${suspect}”.`,
        detail: `“${key}” is not a recognised global keyword, so GitLab treats it as a job. It closely resembles the reserved keyword “${suspect}” — if you meant the keyword, the typo will silently change the pipeline.`,
        line: findTopLevelKeyLine(lineIndex, key),
        remediation: `Rename it to “${suspect}” if you meant the global keyword, or give the job a clearer name.`,
      });
    }
  }

  // `image:` / `services:` shape at the GLOBAL level (also reused per-job below).
  if ('image' in root) checkImageShape('image (global)', root.image, lines, add);
  if ('services' in root) checkServicesShape('services (global)', root.services, lines, add);
}

/**
 * Levenshtein distance exactly 1 to a reserved keyword → return that keyword.
 * Distance 2 is too loose: it flags legitimate job names that are plausible
 * plurals/derivatives of a keyword (e.g. `images`, `caches`, `variable`,
 * `stage`). We only treat a true single-edit typo as suspicious, and we further
 * skip plain plural/singular pairs (`image`↔`images`, `stages`↔`stage`).
 */
function nearestKeyword(key: string): string | undefined {
  let best: string | undefined;
  let bestDist = 2; // only a distance of exactly 1 qualifies
  for (const kw of GLOBAL_KEYWORDS) {
    if (kw === key) continue;
    // A plain plural/singular relationship is a deliberate, valid job name, not
    // a typo of the keyword (e.g. `images`→`image`, `variable`→`variables`).
    if (key === `${kw}s` || kw === `${key}s`) continue;
    const d = levenshtein(key, kw);
    if (d > 0 && d < bestDist) {
      bestDist = d;
      best = kw;
    }
  }
  return best;
}

/** Classic iterative Levenshtein edit distance (O(n·m), tiny inputs). */
function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  let curr = new Array<number>(n + 1);
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

/* ────────────────────────────────────────────────────────────────────────── *
 *  Stages checks — `stages:` must be a list of strings.
 * ────────────────────────────────────────────────────────────────────────── */

function checkStages(
  root: Record<string, unknown>,
  lines: string[],
  lineIndex: TopLevelLineIndex,
  add: (f: Finding) => void,
): void {
  if (!('stages' in root)) return; // defaults apply; nothing to validate
  const stages = root.stages;
  if (stages === null) return; // empty stages → defaults apply
  if (!Array.isArray(stages)) {
    add({
      id: 'stages-not-list',
      severity: 'error',
      title: '`stages:` must be a list of stage names.',
      detail: 'GitLab expects `stages:` to be a YAML sequence, e.g. `stages: [build, test, deploy]`.',
      line: findTopLevelKeyLine(lineIndex, 'stages'),
      remediation: 'Write each stage as a list item under `stages:`.',
    });
    return;
  }
  stages.forEach((s) => {
    if (typeof s !== 'string') {
      add({
        id: 'stage-name-not-string',
        severity: 'error',
        title: 'Every entry in `stages:` must be a string.',
        detail: `Found a non-string stage entry (${JSON.stringify(s)}). Stage names are plain strings.`,
        line: findTopLevelKeyLine(lineIndex, 'stages'),
        remediation: 'Use simple string stage names, e.g. `- build`.',
      });
    }
  });
}

/* ────────────────────────────────────────────────────────────────────────── *
 *  Per-job checks — the heart of the validator.
 * ────────────────────────────────────────────────────────────────────────── */

function checkJob(
  jobId: string,
  rawJob: unknown,
  jobIds: string[],
  templateIds: string[],
  stageNames: Set<string>,
  declaredStages: string[] | null,
  lines: string[],
  lineIndex: TopLevelLineIndex,
  add: (f: Finding) => void,
): void {
  const jobLine = findTopLevelKeyLine(lineIndex, jobId);
  // Upper bound (exclusive) for this job's inner field scans: the next
  // top-level key line. Keeps each scan inside the job's own block.
  const toLine = nextTopLevelLine(lineIndex, jobLine);

  if (!isRecord(rawJob)) {
    add({
      id: 'job-not-mapping',
      severity: 'error',
      title: `Job “${jobId}” is not a mapping.`,
      detail: 'Each job must be an object with at least a `script:` (or `trigger`, `run`, or `extends`).',
      line: jobLine,
      remediation: 'Define the job as `<job-name>:` with a `script:` list of commands.',
    });
    return;
  }

  const job = rawJob as PipelineJob;
  const hidden = isHidden(jobId);

  // (1) Executable surface: a VISIBLE job must define one of script/run/trigger
  // /extends; otherwise GitLab fails with "job config should implement a
  // script: or a trigger: keyword". Hidden templates may legitimately be
  // partial fragments meant to be merged via extends, so we don't require it.
  // An empty `script:` (`[]` or `''`) is NOT an executable surface — GitLab
  // rejects it — so it must not count as present.
  const hasScript = isNonEmptyCommand(job.script);
  const hasRun = isNonEmptyCommand(job.run);
  const hasTrigger = job.trigger !== undefined && job.trigger !== null;
  const hasExtends = job.extends !== undefined && job.extends !== null;
  if (!hidden && !hasScript && !hasRun && !hasTrigger && !hasExtends) {
    add({
      id: 'job-missing-script',
      severity: 'error',
      title: `Job “${jobId}” has no \`script\`, \`run\`, \`trigger\`, or \`extends\`.`,
      detail:
        'A GitLab job must do something: run commands (`script:`/`run:`), start a downstream pipeline (`trigger:`), or inherit a config that provides them (`extends:`). GitLab rejects a job with none of these.',
      line: jobLine,
      remediation: 'Add a `script:` list, a `trigger:`, a `run:`, or `extends:` an existing job/template.',
    });
  }

  // (2) `stage` must be one of the declared (or default) stages.
  if (job.stage !== undefined && job.stage !== null) {
    if (typeof job.stage !== 'string') {
      add({
        id: 'stage-not-string',
        severity: 'error',
        title: `Job “${jobId}” has a non-string \`stage\`.`,
        detail: 'A job `stage:` must be a single stage name (a string).',
        line: findLine(lines, (l) => /^\s+stage\s*:/.test(l), jobLine, toLine),
        remediation: 'Set `stage:` to one of the names in your `stages:` list.',
      });
    } else if (!stageNames.has(job.stage)) {
      add({
        id: 'stage-not-declared',
        severity: 'error',
        title: `Job “${jobId}” uses stage “${job.stage}” which is not in \`stages:\`.`,
        detail: `GitLab rejects a job whose stage is not declared. Available stages: ${[...stageNames].join(', ')}.`,
        line: findLine(lines, (l) => new RegExp(`^\\s+stage\\s*:\\s*['"]?${escapeRegExp(job.stage as string)}`).test(l), jobLine, toLine),
        remediation: `Add “${job.stage}” to the top-level \`stages:\` list, or change the job's stage to a declared one.`,
      });
    }
  } else if (!hidden) {
    // A job that omits `stage:` runs in the implicit `test` stage. If a custom
    // `stages:` list was declared and does not include `test`, GitLab errors
    // "chosen stage test does not exist". The default stage list always
    // contains `test`, so this only fires for an explicit custom list.
    if (declaredStages && declaredStages.length > 0 && !stageNames.has('test')) {
      add({
        id: 'stage-not-declared',
        severity: 'error',
        title: `Job “${jobId}” omits \`stage:\` so it defaults to “test”, which is not in \`stages:\`.`,
        detail: `A job with no \`stage:\` runs in the implicit “test” stage, but your \`stages:\` list does not declare it. Available stages: ${[...stageNames].join(', ')}.`,
        line: jobLine,
        remediation: 'Add “test” to the top-level `stages:` list, or set this job\'s `stage:` to a declared one.',
      });
    }
  }

  // (3) `needs` must reference jobs that exist.
  checkNeeds(jobId, job, jobIds, lines, jobLine, toLine, add);

  // (4) `dependencies` must reference jobs that exist.
  checkDependencies(jobId, job, jobIds, lines, jobLine, toLine, add);

  // (5) `extends` must reference an existing job or hidden `.template`.
  checkExtends(jobId, job, jobIds, templateIds, lines, jobLine, toLine, add);

  // (6) `when` must be one of the allowed values.
  if (job.when !== undefined && job.when !== null) {
    const when = String(job.when);
    if (!WHEN_VALUES.has(when)) {
      add({
        id: 'invalid-when',
        severity: 'error',
        title: `Job “${jobId}” has an invalid \`when: ${when}\`.`,
        detail: `GitLab only accepts: ${[...WHEN_VALUES].join(', ')}.`,
        line: findLine(lines, (l) => /^\s+when\s*:/.test(l), jobLine, toLine),
        remediation: 'Use one of on_success, on_failure, always, manual, delayed, or never.',
      });
    }
  }

  // (7) `rules` must be a list; legacy `only`/`except` → info recommending rules.
  if (job.rules !== undefined && job.rules !== null && !Array.isArray(job.rules)) {
    add({
      id: 'rules-not-list',
      severity: 'error',
      title: `Job “${jobId}” has a \`rules:\` that is not a list.`,
      detail: '`rules:` must be a YAML sequence of rule objects, each with `if:`, `changes:`, `exists:`, and/or `when:`.',
      line: findLine(lines, (l) => /^\s+rules\s*:/.test(l), jobLine, toLine),
      remediation: 'Make `rules:` a list, e.g. `- if: \'$CI_COMMIT_BRANCH == "main"\'`.',
    });
  }
  if (job.only !== undefined || job.except !== undefined) {
    add({
      id: 'legacy-only-except',
      severity: 'info',
      title: `Job “${jobId}” uses legacy \`only\`/\`except\`.`,
      detail:
        '`only`/`except` still work but are no longer actively developed. GitLab recommends `rules:` for new pipelines, and `only`/`except` cannot be combined with `rules:` in the same job.',
      line: findLine(lines, (l) => /^\s+(only|except)\s*:/.test(l), jobLine, toLine),
      remediation: 'Migrate to `rules:` for more flexible, future-proof job control.',
    });
  }

  // (8) image / services shapes at the job level.
  if ('image' in job) checkImageShape(`${jobId}.image`, job.image, lines, add, jobLine, toLine);
  if ('services' in job) checkServicesShape(`${jobId}.services`, job.services, lines, add, jobLine, toLine);
}

function checkNeeds(
  jobId: string,
  job: PipelineJob,
  jobIds: string[],
  lines: string[],
  jobLine: number | undefined,
  toLine: number | undefined,
  add: (f: Finding) => void,
): void {
  if (!Array.isArray(job.needs)) return; // `needs:` may also be a map form; only validate the simple list
  const known = new Set(jobIds);
  for (const need of job.needs) {
    // A need is either a bare job name (string) or an object with `job:`.
    const target =
      typeof need === 'string'
        ? need
        : isRecord(need) && typeof need.job === 'string'
          ? need.job
          : undefined;
    if (target === undefined) continue; // cross-project needs (pipeline/project) — out of scope
    if (!known.has(target)) {
      add({
        id: 'needs-unknown-job',
        severity: 'error',
        title: `Job “${jobId}” needs “${target}”, which is not defined.`,
        detail: 'Every entry in `needs:` must name a job that exists in the same pipeline. GitLab errors if a needed job is missing.',
        line: findLine(lines, (l) => /^\s+needs\s*:/.test(l), jobLine, toLine),
        remediation: `Define a “${target}” job, or remove it from this job's \`needs:\`.`,
      });
    }
  }
}

function checkDependencies(
  jobId: string,
  job: PipelineJob,
  jobIds: string[],
  lines: string[],
  jobLine: number | undefined,
  toLine: number | undefined,
  add: (f: Finding) => void,
): void {
  if (!Array.isArray(job.dependencies)) return;
  const known = new Set(jobIds);
  for (const dep of job.dependencies) {
    if (typeof dep !== 'string') continue;
    if (!known.has(dep)) {
      add({
        id: 'dependencies-unknown-job',
        severity: 'error',
        title: `Job “${jobId}” depends on “${dep}”, which is not defined.`,
        detail: 'Every entry in `dependencies:` must name a job that exists in the same pipeline.',
        line: findLine(lines, (l) => /^\s+dependencies\s*:/.test(l), jobLine, toLine),
        remediation: `Define a “${dep}” job, or remove it from this job's \`dependencies:\`.`,
      });
    }
  }
}

function checkExtends(
  jobId: string,
  job: PipelineJob,
  jobIds: string[],
  templateIds: string[],
  lines: string[],
  jobLine: number | undefined,
  toLine: number | undefined,
  add: (f: Finding) => void,
): void {
  if (job.extends === undefined || job.extends === null) return;
  const targets =
    typeof job.extends === 'string'
      ? [job.extends]
      : Array.isArray(job.extends)
        ? job.extends.filter((t): t is string => typeof t === 'string')
        : [];
  if (targets.length === 0) {
    add({
      id: 'extends-bad-shape',
      severity: 'error',
      title: `Job “${jobId}” has an \`extends\` that is not a string or list of strings.`,
      detail: '`extends:` takes a job/template name or a list of names.',
      line: findLine(lines, (l) => /^\s+extends\s*:/.test(l), jobLine, toLine),
      remediation: 'Set `extends:` to the name of an existing job or hidden `.template`.',
    });
    return;
  }
  const known = new Set([...jobIds, ...templateIds]);
  for (const target of targets) {
    if (!known.has(target)) {
      add({
        id: 'extends-unknown-target',
        severity: 'error',
        title: `Job “${jobId}” extends “${target}”, which is not defined.`,
        detail: '`extends:` must reference a job or a hidden `.template` (a key starting with a dot) defined in this file.',
        line: findLine(lines, (l) => new RegExp(`^\\s+extends\\s*:\\s*\\[?\\s*['"]?${escapeRegExp(target)}`).test(l), jobLine, toLine) ?? findLine(lines, (l) => /^\s+extends\s*:/.test(l), jobLine, toLine),
        remediation: `Define “${target}” (use a leading dot for a reusable template), or fix the name in \`extends:\`.`,
      });
    }
  }
}

/* ────────────────────────────────────────────────────────────────────────── *
 *  image / services shape checks.
 * ────────────────────────────────────────────────────────────────────────── */

/**
 * `image:` is a string (the image name) OR a mapping with a `name:` key. Anything
 * else (a number, a list, a mapping with no `name`) is rejected by GitLab.
 */
function checkImageShape(
  where: string,
  image: unknown,
  lines: string[],
  add: (f: Finding) => void,
  fromLine?: number,
  toLine?: number,
): void {
  if (typeof image === 'string') return;
  if (isRecord(image) && typeof image.name === 'string' && image.name.trim() !== '') return;
  // At the global level (fromLine undefined) the declaration is at column 0, so
  // match `^image:` — an indented `^\s*image:` would wrongly latch onto the
  // FIRST job-level `image:` instead of the global one. At the job level, scan
  // the indented form within the job's own block.
  const test =
    fromLine === undefined
      ? (l: string) => /^image\s*:/.test(l)
      : (l: string) => /^\s*image\s*:/.test(l);
  add({
    id: 'invalid-image-shape',
    severity: 'error',
    title: `\`${where}\` must be an image name or a mapping with \`name:\`.`,
    detail: 'GitLab expects `image:` to be a string (e.g. `node:20`) or an object with a `name:` key (and optional `entrypoint:`, `pull_policy:`).',
    line: findLine(lines, test, fromLine ?? 1, toLine),
    remediation: 'Use `image: node:20` or `image: { name: node:20 }`.',
  });
}

/**
 * `services:` is a LIST. Each entry is a string image name or a mapping with a
 * `name:` key. A non-list `services:` is rejected by GitLab.
 */
function checkServicesShape(
  where: string,
  services: unknown,
  lines: string[],
  add: (f: Finding) => void,
  fromLine?: number,
  toLine?: number,
): void {
  // At the global level (fromLine undefined) the declaration is at column 0;
  // match `^services:` so we don't latch onto an indented job-level `services:`.
  const test =
    fromLine === undefined
      ? (l: string) => /^services\s*:/.test(l)
      : (l: string) => /^\s*services\s*:/.test(l);
  if (!Array.isArray(services)) {
    add({
      id: 'invalid-services-shape',
      severity: 'error',
      title: `\`${where}\` must be a list of services.`,
      detail: 'GitLab expects `services:` to be a YAML sequence of image names or `{ name: … }` mappings.',
      line: findLine(lines, test, fromLine ?? 1, toLine),
      remediation: 'Write each service as a list item, e.g. `- postgres:16` or `- name: redis:7`.',
    });
    return;
  }
  services.forEach((svc) => {
    const okString = typeof svc === 'string' && svc.trim() !== '';
    const okMapping = isRecord(svc) && typeof svc.name === 'string' && svc.name.trim() !== '';
    if (!okString && !okMapping) {
      add({
        id: 'invalid-service-entry',
        severity: 'error',
        title: `\`${where}\` has an entry that is not an image name or \`{ name: … }\`.`,
        detail: `Found a service entry (${JSON.stringify(svc)}) that GitLab cannot use. Each service is an image string or a mapping with a \`name:\`.`,
        line: findLine(lines, test, fromLine ?? 1, toLine),
        remediation: 'Use `- postgres:16` or `- name: postgres:16`.',
      });
    }
  });
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

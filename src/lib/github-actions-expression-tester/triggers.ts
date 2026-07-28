/**
 * Trigger simulator — Tab 2.
 *
 * Parses a workflow YAML and decides, for a described event (push / pull_request
 * / tag), whether the workflow triggers and which jobs RUN or are SKIPPED, with
 * the deciding filter recorded in a trace. Models the subtle rules people get
 * wrong: branch-vs-tag filter matrix, the AND-semantics when branch + path
 * filters coexist, and `!` ordering inside a filter list.
 *
 * Where it cannot know — an `if:` reading vars/inputs/secrets, or a needs
 * output — the job decision is `unknown`, never a confident false. See
 * unmodelledRefs().
 *
 * Never throws — a YAML parse failure comes back via SimulateResult.error.
 */

// js-yaml v4 ships ESM but no bundled type declarations, and @types/js-yaml is
// not a project dependency. Declare the tiny surface we use (mirrors gha-validator).
declare module 'js-yaml' {
  export function load(input: string, options?: unknown): unknown;
  const _default: { load: typeof load };
  export default _default;
}

import yaml from 'js-yaml';
import type {
  EvalContext,
  ExprWarning,
  FilterTrace,
  GhaObject,
  JobDecision,
  SimEvent,
  SimulateResult,
} from './types';
import { parse, type Expr } from './expr-parser';
import { evaluateAst } from './expr-eval';
import { analyzeIfCondition, extractExpressionBody } from './if-footgun';
import { matchList } from './glob';
import { truthy } from './values';
import { GHA_SEMANTICS_VERSION } from './conformance';

function isObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function toStringArray(v: unknown): string[] | undefined {
  if (typeof v === 'string') return [v];
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === 'string');
  return undefined;
}

/** Read the `on:` value, tolerating js-yaml parsing the bare key `on` as the
 *  boolean `true` (a YAML 1.1 gotcha) — a boolean key becomes the string 'true'. */
function readOn(doc: Record<string, unknown>): unknown {
  if (doc.on !== undefined) return doc.on;
  if (doc['true'] !== undefined) return doc['true'];
  return undefined;
}

/** Normalise `on:` into a map of event → filter object. */
function normalizeOn(on: unknown): Record<string, Record<string, unknown>> {
  const out: Record<string, Record<string, unknown>> = {};
  if (typeof on === 'string') {
    out[on] = {};
  } else if (Array.isArray(on)) {
    for (const e of on) if (typeof e === 'string') out[e] = {};
  } else if (isObject(on)) {
    for (const [k, v] of Object.entries(on)) {
      out[k] = isObject(v) ? v : {};
    }
  }
  return out;
}

export function simulateTriggers(workflowYaml: string, event: SimEvent): SimulateResult {
  const warnings: ExprWarning[] = [];
  let doc: unknown;
  try {
    doc = yaml.load(workflowYaml);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Invalid YAML.';
    return {
      workflowTriggered: false,
      workflowReason: 'The workflow YAML could not be parsed.',
      jobs: [],
      warnings,
      error: msg,
      semanticsVersion: GHA_SEMANTICS_VERSION,
    };
  }

  if (!isObject(doc)) {
    return {
      workflowTriggered: false,
      workflowReason: 'The workflow is empty or not a YAML mapping.',
      jobs: [],
      warnings,
      error: 'Expected a workflow object with on: and jobs:.',
      semanticsVersion: GHA_SEMANTICS_VERSION,
    };
  }

  const onMap = normalizeOn(readOn(doc));
  const isTag = !!event.tag || event.event === 'tag';
  const eventKey = event.event === 'tag' ? 'push' : event.event;

  // ── workflow-level on: evaluation ──────────────────────────────────────────
  const wf = evaluateWorkflowTrigger(onMap, eventKey, isTag, event);

  // ── per-job decisions ──────────────────────────────────────────────────────
  const jobsObj = isObject(doc.jobs) ? (doc.jobs as Record<string, unknown>) : {};
  const autoCtx = buildEventContext(eventKey, isTag, event);
  // Evaluated in DEPENDENCY order (so a job's if: can read needs.<dep>.result),
  // emitted in DECLARATION order (so the results table matches the YAML).
  const order = dependencyOrder(jobsObj);
  const byId = new Map<string, JobDecision>();

  for (const jobId of order) {
    if (!wf.triggered) {
      byId.set(jobId, {
        jobId,
        decision: 'not-evaluated',
        reason: 'Workflow not triggered by this event.',
        trace: wf.trace,
      });
      continue;
    }
    const job = isObject(jobsObj[jobId]) ? (jobsObj[jobId] as Record<string, unknown>) : {};
    const ifVal = job.if;
    const trace: FilterTrace[] = [];

    if (ifVal === undefined || ifVal === null) {
      byId.set(jobId, { jobId, decision: 'runs', reason: 'No job if: — runs whenever the workflow triggers.', trace });
      continue;
    }
    if (typeof ifVal === 'boolean') {
      byId.set(jobId, {
        jobId,
        decision: ifVal ? 'runs' : 'skipped',
        reason: `Job if: is the literal boolean ${ifVal}.`,
        trace,
      });
      continue;
    }
    const raw = String(ifVal);
    const footgun = analyzeIfCondition(raw);
    if (footgun) warnings.push(footgun);
    const body = extractExpressionBody(raw);
    const { ast } = parse(body);

    // `needs` is the one context we CAN fill in: every dependency already has a
    // decision by construction (dependency order), so needs.<dep>.result is real.
    const needsCtx = resolvedNeeds(toStringArray(job.needs) ?? [], byId);

    // Everything else the simulator has no data for must come back as UNKNOWN.
    // Rendering `vars.ENVIRONMENT == 'prod'` as a confident "will not run" is a
    // wrong answer stated with certainty, which is worse than admitting the gap.
    // The footgun case is exempt: literal text outside ${{ }} is true no matter
    // what any context holds.
    const unmodelled = footgun ? [] : unmodelledRefs(ast, needsCtx);
    if (unmodelled.length > 0) {
      const list = unmodelled.join(', ');
      warnings.push({
        id: 'unmodelled-context',
        severity: 'info',
        message:
          `Job "${jobId}" has an if: that reads ${list}. The trigger simulator has no data for ` +
          'that, so its decision is reported as unknown rather than guessed. Use the Expression ' +
          'tab with an edited context to test it.',
      });
      trace.push({ filter: 'if', outcome: 'n/a', reason: `unknown — context not modelled (${list}).` });
      byId.set(jobId, {
        jobId,
        decision: 'unknown',
        reason: `Unknown — context not modelled: the if: reads ${list}.`,
        trace,
      });
      continue;
    }

    const { value } = evaluateAst(ast, { ...autoCtx, needs: needsCtx });
    const runs = footgun ? true : truthy(value); // footgun → always true (the bug it warns about)
    trace.push({
      filter: 'if',
      outcome: runs ? 'match' : 'no-match',
      reason: footgun
        ? 'Literal text outside ${{ }} → always true (see warning).'
        : `if: evaluated to ${runs ? 'true' : 'false'}.`,
    });
    byId.set(jobId, {
      jobId,
      decision: runs ? 'runs' : 'skipped',
      reason: footgun
        ? 'Job if: is always true (literal-text footgun).'
        : `Job if: evaluated to ${runs ? 'true' : 'false'}.`,
      trace,
    });
  }

  // needs: a job needing a skipped/not-run job is itself skipped.
  applyNeeds(jobsObj, order, byId);

  const decisions: JobDecision[] = Object.keys(jobsObj)
    .map((id) => byId.get(id))
    .filter((d): d is JobDecision => d !== undefined);

  return {
    workflowTriggered: wf.triggered,
    workflowReason: wf.reason,
    jobs: decisions,
    warnings,
    semanticsVersion: GHA_SEMANTICS_VERSION,
  };
}

/* ── workflow-level evaluation ─────────────────────────────────────────────── */

interface WfResult {
  triggered: boolean;
  reason: string;
  trace: FilterTrace[];
}

function evaluateWorkflowTrigger(
  onMap: Record<string, Record<string, unknown>>,
  eventKey: string,
  isTag: boolean,
  event: SimEvent,
): WfResult {
  const trace: FilterTrace[] = [];

  if (!(eventKey in onMap)) {
    return {
      triggered: false,
      reason: `Workflow does not list "${eventKey}" in on:.`,
      trace: [{ filter: 'event', outcome: 'no-match', reason: `on: has no "${eventKey}" trigger.` }],
    };
  }
  trace.push({ filter: 'event', outcome: 'match', reason: `on: includes "${eventKey}".` });

  const block = onMap[eventKey];
  const branches = toStringArray(block.branches);
  const branchesIgnore = toStringArray(block['branches-ignore']);
  const tags = toStringArray(block.tags);
  const tagsIgnore = toStringArray(block['tags-ignore']);
  const paths = toStringArray(block.paths);
  const pathsIgnore = toStringArray(block['paths-ignore']);

  // A tags: filter is just as much a "ref filter" for a BRANCH push as a
  // branches: filter is for a tag push — it is the thing that blocks it. Leaving
  // tags out of this on the branch side made the summary claim "no filters".
  const hasRefFilter = !!(branches || branchesIgnore || tags || tagsIgnore);
  const hasPathFilter = !!(paths || pathsIgnore);

  // ── ref (branch/tag) gate ──
  //
  // GitHub: "If you define only tags/tags-ignore or only branches/branches-ignore,
  // the workflow won't run for events affecting the undefined Git ref." Both
  // halves of that rule are modelled below, and they must stay symmetric.
  let refPass = true;
  /** Overrides the generic "Blocked by the … filter." summary when the block is
   *  really "you never defined a filter for this KIND of ref". */
  let refBlockReason: string | undefined;
  if (isTag) {
    const tag = event.tag ?? '';
    if (tags) {
      const { included, decidedBy } = matchList(tag, tags);
      refPass = included;
      trace.push({
        filter: 'tags',
        outcome: included ? 'match' : 'no-match',
        reason: included ? `tag "${tag}" matches ${decidedBy}.` : `tag "${tag}" matches no tags: pattern.`,
      });
    } else if (tagsIgnore) {
      const { included } = matchList(tag, tagsIgnore);
      refPass = !included;
      trace.push({
        filter: 'tags-ignore',
        outcome: included ? 'excluded' : 'match',
        reason: included ? `tag "${tag}" is excluded by tags-ignore.` : `tag "${tag}" is not in tags-ignore.`,
      });
    } else if (branches || branchesIgnore) {
      // Push specifies branches but NOT tags → tag pushes are excluded.
      refPass = false;
      refBlockReason = 'on.push sets branches but not tags, so tag pushes do not trigger.';
      trace.push({
        filter: 'tags',
        outcome: 'excluded',
        reason: refBlockReason,
      });
    } else {
      trace.push({ filter: 'tags', outcome: 'n/a', reason: 'No tag filter — all tags trigger.' });
    }
  } else {
    const branch = event.branch ?? '';
    if (branches) {
      const { included, decidedBy } = matchList(branch, branches);
      refPass = included;
      trace.push({
        filter: 'branches',
        outcome: included ? 'match' : 'no-match',
        reason: included ? `branch "${branch}" matches ${decidedBy}.` : `branch "${branch}" matches no branches: pattern.`,
      });
    } else if (branchesIgnore) {
      const { included } = matchList(branch, branchesIgnore);
      refPass = !included;
      trace.push({
        filter: 'branches-ignore',
        outcome: included ? 'excluded' : 'match',
        reason: included
          ? `branch "${branch}" is excluded by branches-ignore.`
          : `branch "${branch}" is not in branches-ignore.`,
      });
    } else if (tags || tagsIgnore) {
      // Mirror of the tag case above: the push defines tags but NOT branches, so
      // the branch ref is undefined for this workflow and a branch push is out.
      refPass = false;
      refBlockReason = 'on.push sets tags but not branches, so branch pushes do not trigger.';
      trace.push({
        filter: 'branches',
        outcome: 'excluded',
        reason: refBlockReason,
      });
    } else {
      trace.push({ filter: 'branches', outcome: 'n/a', reason: 'No branch filter — all branches trigger.' });
    }
  }

  // ── path gate ──
  let pathPass = true;
  if (hasPathFilter) {
    const files = event.changedFiles ?? [];
    if (files.length === 0) {
      // Without changed-file data the path filter can't be evaluated — stay
      // optimistic and let the ref decision stand, rather than silently blocking.
      trace.push({
        filter: paths ? 'paths' : 'paths-ignore',
        outcome: 'n/a',
        reason: 'No changed files provided — the path filter was not evaluated.',
      });
    } else if (paths) {
      // matchList, not some(matchOne): a `!pattern` entry EXCLUDES, and later
      // entries win — the same ordering the branch and tag gates already use.
      // some(matchOne) treated the leading `!` as a literal character, so a
      // negation silently did nothing.
      const matched = files.find((file) => matchList(file, paths).included);
      pathPass = matched !== undefined;
      trace.push({
        filter: 'paths',
        outcome: pathPass ? 'match' : 'no-match',
        reason: pathPass
          ? `changed file "${matched}" matches a paths: pattern.`
          : 'no changed file matches any paths: pattern.',
      });
    } else if (pathsIgnore) {
      const outside = files.find((file) => !matchList(file, pathsIgnore).included);
      pathPass = outside !== undefined;
      trace.push({
        filter: 'paths-ignore',
        outcome: pathPass ? 'match' : 'excluded',
        reason: pathPass
          ? `changed file "${outside}" is outside paths-ignore.`
          : 'every changed file is covered by paths-ignore.',
      });
    }
  }

  const triggered = refPass && pathPass;
  let reason: string;
  if (triggered) {
    reason =
      hasRefFilter || hasPathFilter
        ? `Event "${eventKey}" matches the configured filters.`
        : `Event "${eventKey}" has no filters, so it always triggers.`;
  } else if (refPass && !pathPass) {
    reason = 'Blocked by the path filter (branch matched, but no path did — both must pass).';
  } else if (!refPass) {
    // refBlockReason is set only for the "ref kind never defined" cases, where
    // "Blocked by the branch filter." would name a filter that isn't there.
    reason = refBlockReason ?? `Blocked by the ${isTag ? 'tag' : 'branch'} filter.`;
  } else {
    reason = 'Blocked by the path filter.';
  }

  return { triggered, reason, trace };
}

/* ── per-job helpers ───────────────────────────────────────────────────────── */

/** Default PR number, matching the Tab-1 `pull_request` context preset. */
const DEFAULT_PR_NUMBER = 42;

function buildEventContext(eventKey: string, isTag: boolean, event: SimEvent): EvalContext {
  const isPr = event.event.startsWith('pull_request');
  // A `pull_request` run checks out the MERGE ref, not the base branch — that is
  // why `startsWith(github.ref, 'refs/pull/')` is the idiom and why comparing
  // github.ref to refs/heads/<base> never matches. `pull_request_target` is the
  // documented exception: it genuinely runs against the base branch ref (which
  // is the whole reason it is the dangerous one).
  const isMergeRef = event.event === 'pull_request';
  const prNumber = event.prNumber ?? DEFAULT_PR_NUMBER;

  let ref: string;
  let refName: string;
  if (isTag) {
    ref = `refs/tags/${event.tag ?? ''}`;
    refName = event.tag ?? '';
  } else if (isMergeRef) {
    ref = `refs/pull/${prNumber}/merge`;
    refName = `${prNumber}/merge`;
  } else {
    ref = `refs/heads/${event.branch ?? ''}`;
    refName = event.branch ?? '';
  }

  const github: GhaObject = {
    event_name: eventKey,
    ref,
    ref_name: refName,
    ref_type: isTag ? 'tag' : 'branch',
    // base_ref stays the branch the user typed — for a PR that IS the base.
    base_ref: isPr ? (event.branch ?? '') : '',
    head_ref: isPr ? 'feature-branch' : '',
    sha: 'd6cd1e2bd19e03a81132a23b2025920577f84e37',
  };
  return { github, env: {}, jobStatus: 'success', stepConclusions: ['success'] };
}

/**
 * Order job ids so every job comes after the jobs it `needs:`. Jobs in a cycle
 * (or needing a job that isn't in this workflow) fall back to declaration order —
 * this is a simulator, not a validator, so it must always produce an order.
 */
function dependencyOrder(jobsObj: Record<string, unknown>): string[] {
  const ids = Object.keys(jobsObj);
  const known = new Set(ids);
  const deps = new Map<string, string[]>();
  for (const id of ids) {
    const job = isObject(jobsObj[id]) ? (jobsObj[id] as Record<string, unknown>) : {};
    deps.set(id, (toStringArray(job.needs) ?? []).filter((d) => known.has(d) && d !== id));
  }
  const done = new Set<string>();
  const order: string[] = [];
  for (let progress = true; progress && order.length < ids.length; ) {
    progress = false;
    for (const id of ids) {
      if (done.has(id)) continue;
      if (!(deps.get(id) ?? []).every((d) => done.has(d))) continue;
      order.push(id);
      done.add(id);
      progress = true;
    }
  }
  for (const id of ids) if (!done.has(id)) order.push(id); // cycle — keep as written
  return order;
}

/**
 * Build the `needs` context from decisions already taken in this run. Only jobs
 * with a settled decision are included; an `unknown` upstream stays out so the
 * dependent is reported unknown too rather than inheriting a guess.
 *
 * `outputs` is deliberately absent: a job's outputs come from steps the
 * simulator never runs, so `needs.<id>.outputs.*` is genuinely unmodellable.
 */
function resolvedNeeds(needs: string[], byId: Map<string, JobDecision>): GhaObject {
  const out: GhaObject = {};
  for (const dep of needs) {
    const d = byId.get(dep);
    if (!d || d.decision === 'unknown') continue;
    out[dep] = { result: d.decision === 'runs' ? 'success' : 'skipped' };
  }
  return out;
}

/** Contexts the trigger simulator has no data for at all. */
const UNMODELLED_CONTEXTS = new Set(['vars', 'inputs', 'secrets']);
/** The only `needs.<id>.…` properties this simulator can honestly answer. */
const MODELLED_NEEDS_PROPS = new Set(['result']);

/**
 * Dotted path of a pure context chain (`needs.build.result`), or null when the
 * node is not one. Case is preserved for the message; callers lower-case to
 * classify, matching GitHub's case-insensitive property access.
 */
function chainPath(node: Expr): string | null {
  switch (node.t) {
    case 'ctx':
      return node.name;
    case 'prop': {
      const base = chainPath(node.obj);
      return base === null ? null : `${base}.${node.name}`;
    }
    case 'filter': {
      const base = chainPath(node.obj);
      return base === null ? null : `${base}.*`;
    }
    case 'index': {
      const base = chainPath(node.obj);
      return base === null ? null : `${base}[…]`;
    }
    default:
      return null;
  }
}

/** Collect every context chain an expression reads, longest form first. */
function collectRefs(node: Expr, out: Set<string>): void {
  const path = chainPath(node);
  if (path !== null) {
    out.add(path);
    if (node.t === 'index') collectRefs(node.index, out);
    return;
  }
  switch (node.t) {
    case 'call':
      node.args.forEach((a) => collectRefs(a, out));
      break;
    case 'not':
      collectRefs(node.arg, out);
      break;
    case 'logic':
    case 'eq':
    case 'cmp':
      collectRefs(node.left, out);
      collectRefs(node.right, out);
      break;
    default:
      break;
  }
}

/**
 * Which context reads in this `if:` the simulator cannot answer. Returns the
 * paths verbatim so the UI can name them; an empty array means the verdict is
 * trustworthy.
 */
function unmodelledRefs(ast: Expr, needsCtx: GhaObject): string[] {
  const refs = new Set<string>();
  collectRefs(ast, refs);
  const resolvable = new Set(Object.keys(needsCtx).map((k) => k.toLowerCase()));
  const bad: string[] = [];
  for (const ref of refs) {
    const [root, second, third] = ref.toLowerCase().split('.');
    if (UNMODELLED_CONTEXTS.has(root)) {
      bad.push(ref);
      continue;
    }
    // needs.<dep>.result IS modelled — but only for a dependency this run decided.
    if (root === 'needs' && !(resolvable.has(second ?? '') && MODELLED_NEEDS_PROPS.has(third ?? ''))) {
      bad.push(ref);
    }
  }
  return bad;
}

function applyNeeds(jobsObj: Record<string, unknown>, order: string[], byId: Map<string, JobDecision>): void {
  // Dependency order, so a skip/unknown propagates down a chain in one pass.
  for (const jobId of order) {
    const job = isObject(jobsObj[jobId]) ? (jobsObj[jobId] as Record<string, unknown>) : {};
    const needs = toStringArray(job.needs);
    if (!needs) continue;
    const dec = byId.get(jobId);
    if (!dec || dec.decision !== 'runs') continue;
    const blocker = needs.find((dep) => {
      const d = byId.get(dep);
      return d && (d.decision === 'skipped' || d.decision === 'not-evaluated');
    });
    if (blocker) {
      dec.decision = 'skipped';
      dec.reason = `Needs "${blocker}", which is skipped.`;
      dec.trace.push({ filter: 'needs', outcome: 'no-match', reason: `Upstream job "${blocker}" is skipped.` });
      continue;
    }
    // An upstream job we could not decide makes this one undecidable as well.
    const unsure = needs.find((dep) => byId.get(dep)?.decision === 'unknown');
    if (unsure) {
      dec.decision = 'unknown';
      dec.reason = `Unknown — context not modelled: needs "${unsure}", which is itself unknown.`;
      dec.trace.push({ filter: 'needs', outcome: 'n/a', reason: `Upstream job "${unsure}" is unknown.` });
    }
  }
}

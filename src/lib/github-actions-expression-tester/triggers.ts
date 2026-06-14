/**
 * Trigger simulator — Tab 2.
 *
 * Parses a workflow YAML and decides, for a described event (push / pull_request
 * / tag), whether the workflow triggers and which jobs RUN or are SKIPPED, with
 * the deciding filter recorded in a trace. Models the subtle rules people get
 * wrong: branch-vs-tag filter matrix, the AND-semantics when branch + path
 * filters coexist, and `!` ordering inside a filter list.
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
import { parse } from './expr-parser';
import { evaluateAst } from './expr-eval';
import { analyzeIfCondition, extractExpressionBody } from './if-footgun';
import { matchList, matchOne } from './glob';
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
  const decisions: JobDecision[] = [];

  for (const [jobId, jobRaw] of Object.entries(jobsObj)) {
    if (!wf.triggered) {
      decisions.push({
        jobId,
        decision: 'not-evaluated',
        reason: 'Workflow not triggered by this event.',
        trace: wf.trace,
      });
      continue;
    }
    const job = isObject(jobRaw) ? jobRaw : {};
    const ifVal = job.if;
    const trace: FilterTrace[] = [];

    if (ifVal === undefined || ifVal === null) {
      decisions.push({ jobId, decision: 'runs', reason: 'No job if: — runs whenever the workflow triggers.', trace });
      continue;
    }
    if (typeof ifVal === 'boolean') {
      decisions.push({
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
    const { value } = evaluateAst(ast, autoCtx);
    const runs = footgun ? true : truthy(value); // footgun → always true (the bug it warns about)
    trace.push({
      filter: 'if',
      outcome: runs ? 'match' : 'no-match',
      reason: footgun
        ? 'Literal text outside ${{ }} → always true (see warning).'
        : `if: evaluated to ${runs ? 'true' : 'false'}.`,
    });
    decisions.push({
      jobId,
      decision: runs ? 'runs' : 'skipped',
      reason: footgun
        ? 'Job if: is always true (literal-text footgun).'
        : `Job if: evaluated to ${runs ? 'true' : 'false'}.`,
      trace,
    });
  }

  // needs: a job needing a skipped/not-run job is itself skipped.
  applyNeeds(jobsObj, decisions);

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

  const hasRefFilter = isTag
    ? !!(tags || tagsIgnore || branches || branchesIgnore)
    : !!(branches || branchesIgnore);
  const hasPathFilter = !!(paths || pathsIgnore);

  // ── ref (branch/tag) gate ──
  let refPass = true;
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
      trace.push({
        filter: 'tags',
        outcome: 'excluded',
        reason: 'on.push sets branches but not tags, so tag pushes do not trigger.',
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
      const matched = files.find((file) => paths.some((p) => matchOne(file, p)));
      pathPass = matched !== undefined;
      trace.push({
        filter: 'paths',
        outcome: pathPass ? 'match' : 'no-match',
        reason: pathPass
          ? `changed file "${matched}" matches a paths: pattern.`
          : 'no changed file matches any paths: pattern.',
      });
    } else if (pathsIgnore) {
      const outside = files.find((file) => !pathsIgnore.some((p) => matchOne(file, p)));
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
  } else if (!refPass && hasPathFilter && pathPass) {
    reason = `Blocked by the ${isTag ? 'tag' : 'branch'} filter.`;
  } else if (refPass && !pathPass) {
    reason = 'Blocked by the path filter (branch matched, but no path did — both must pass).';
  } else if (!refPass) {
    reason = `Blocked by the ${isTag ? 'tag' : 'branch'} filter.`;
  } else {
    reason = 'Blocked by the path filter.';
  }

  return { triggered, reason, trace };
}

/* ── per-job helpers ───────────────────────────────────────────────────────── */

function buildEventContext(eventKey: string, isTag: boolean, event: SimEvent): EvalContext {
  const refName = isTag ? (event.tag ?? '') : (event.branch ?? '');
  const ref = isTag ? `refs/tags/${event.tag ?? ''}` : `refs/heads/${event.branch ?? ''}`;
  const github: GhaObject = {
    event_name: eventKey,
    ref,
    ref_name: refName,
    ref_type: isTag ? 'tag' : 'branch',
    base_ref: event.event.startsWith('pull_request') ? (event.branch ?? '') : '',
    head_ref: event.event.startsWith('pull_request') ? 'feature-branch' : '',
    sha: 'd6cd1e2bd19e03a81132a23b2025920577f84e37',
  };
  return { github, env: {}, jobStatus: 'success', stepConclusions: ['success'] };
}

function applyNeeds(jobsObj: Record<string, unknown>, decisions: JobDecision[]): void {
  const byId = new Map(decisions.map((d) => [d.jobId, d]));
  for (const [jobId, jobRaw] of Object.entries(jobsObj)) {
    const job = isObject(jobRaw) ? jobRaw : {};
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
    }
  }
}

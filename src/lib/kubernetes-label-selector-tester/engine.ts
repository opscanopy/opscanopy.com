/**
 * Kubernetes Label Selector Tester — the public façade.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │  testSelector(resources, selector, mode)                                 │
 * │    1. PARSE THE SELECTOR   kubectl -l grammar, or matchLabels /          │
 * │                            matchExpressions (or a whole manifest)        │
 * │    2. PARSE THE RESOURCES  js-yaml loadAll: multi-doc, kind: List,       │
 * │                            bare list, pod templates as their own rows    │
 * │    3. EVALUATE             Requirement.Matches, per resource, per clause │
 * │    4. EXPLAIN              one reason sentence per clause, ALWAYS        │
 * │    5. WARN                 unsatisfiable clauses, zero matches,          │
 * │                            unlabelled resources                          │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Three promises, all enforced by `engine.test.ts`:
 *
 *   - IT NEVER THROWS. Not on garbage, not on a 500 KB paste, not on a
 *     recursive YAML alias, not on a non-string argument. Every failure is a
 *     `Diagnostic` with `ok: false`.
 *   - IT NEVER GUESSES. `ok: false` produces NO verdicts. A per-resource verdict
 *     derived from a selector the API server would reject is exactly the
 *     confidently-wrong answer this site exists to replace.
 *   - EVERY CLAUSE CARRIES A REASON. There is no branch in `evaluateClause` that
 *     returns without one, and a sweep test asserts it across every operator.
 *
 * `Gt`/`Lt`, field selectors, `namespaceSelector` and cluster access are all out
 * of scope — see the non-goals on the tool page. The one that is easy to get
 * wrong is `Gt`/`Lt`: they exist on `NodeSelectorRequirement`, not on
 * `LabelSelector`, so they are refused with that explanation rather than
 * evaluated as if a label selector had them.
 */
import { base64UrlDecode, base64UrlEncode } from '../codec';
import { MAX_RESOURCES, MAX_RESOURCE_CHARS, parseResources } from './resources';
import { MAX_REQUIREMENTS, MAX_SELECTOR_CHARS, parseSelector } from './selector-parse';
import type {
  ClauseTrace,
  Diagnostic,
  Requirement,
  ResourceVerdict,
  SelectorMode,
  SelectorTestResult,
  ShareState,
} from './types';

export { MAX_RESOURCES, MAX_RESOURCE_CHARS, MAX_REQUIREMENTS, MAX_SELECTOR_CHARS };
export type {
  ClauseTrace,
  Diagnostic,
  Requirement,
  ResourceVerdict,
  SelectorMode,
  SelectorTestResult,
  ShareState,
};

/** Diagnostics carried out of one run. Past this the panel stops being readable. */
const MAX_DIAGNOSTICS = 50;
/** Unsatisfiable-clause warnings. One per conflicting key, then it is noise. */
const MAX_CONFLICT_WARNINGS = 8;

const SEVERITY_RANK: Record<Diagnostic['severity'], number> = { error: 0, warning: 1, note: 2 };

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function normalizeMode(mode: unknown): SelectorMode {
  return mode === 'yaml' ? 'yaml' : 'expr';
}

/* ══════════════════════════════════════════════════════════════════════════
   Evaluation — apimachinery's Requirement.Matches, with its reasoning shown
   ═════════════════════════════════════════════════════════════════════════ */

function quoted(value: string): string {
  return `"${value}"`;
}

/**
 * One clause against one label set. Mirrors `Requirement.Matches`:
 *
 *   In            key must be present AND its value in the set
 *   NotIn         key ABSENT ⇒ match; present ⇒ value must not be in the set
 *   Exists        key present (any value, including "")
 *   DoesNotExist  key absent
 *
 * `reason` is assigned on every branch — there is no fall-through.
 */
export function evaluateClause(
  requirement: Requirement,
  labels: Record<string, string>,
  /**
   * Keys the document carries but whose value YAML did not read as a scalar,
   * mapped to what YAML made of them (`'date'`, `'map'`, `'list'`). Such a key
   * is PRESENT — reporting it as absent, and firing the amber absent-key
   * annotation on it, was a confidently-wrong answer about a manifest that
   * plainly has the label.
   */
  unreadable: Record<string, string> = {},
): ClauseTrace {
  const { key, op, values } = requirement;
  const unreadableKind = Object.prototype.hasOwnProperty.call(unreadable, key)
    ? unreadable[key]
    : null;
  if (unreadableKind !== null) {
    // Exists / DoesNotExist only ask whether the key is there, so they ARE
    // decidable. In / NotIn need the value, and there is no string to compare.
    if (op === 'Exists' || op === 'DoesNotExist') {
      const holdsExistence = op === 'Exists';
      return {
        requirement,
        holds: holdsExistence,
        reason: holdsExistence
          ? `label ${key} is set — YAML read its value as a ${unreadableKind}, which Exists does not look at`
          : `label ${key} is set (YAML read its value as a ${unreadableKind}), so DoesNotExist fails`,
        keyAbsent: false,
        absentKeyMatch: false,
        undecided: false,
      };
    }
    return {
      requirement,
      holds: false,
      reason: `label ${key} is set, but YAML read its value as a ${unreadableKind}, not a string — quote it in the manifest and this clause can be decided`,
      keyAbsent: false,
      absentKeyMatch: false,
      undecided: true,
    };
  }
  const present = Object.prototype.hasOwnProperty.call(labels, key);
  const actual = present ? labels[key] : '';
  const list = values.join(',');
  const single = values.length === 1;

  let holds: boolean;
  let reason: string;

  switch (op) {
    case 'In':
      if (!present) {
        holds = false;
        reason = `no ${key} label — In only matches when the key is present`;
      } else if (values.includes(actual)) {
        holds = true;
        reason = single
          ? `label ${key}=${quoted(actual)} = ${quoted(values[0])}`
          : `label ${key}=${quoted(actual)} is one of (${list})`;
      } else {
        holds = false;
        reason = single
          ? `label ${key}=${quoted(actual)} ≠ ${quoted(values[0])}`
          : `label ${key}=${quoted(actual)} is not one of (${list})`;
      }
      break;
    case 'NotIn':
      if (!present) {
        holds = true;
        reason = `no ${key} label at all — NotIn matches when the key is absent`;
      } else if (values.includes(actual)) {
        holds = false;
        reason = `label ${key}=${quoted(actual)} is one of (${list}), which NotIn excludes`;
      } else {
        holds = true;
        reason = single
          ? `label ${key}=${quoted(actual)} ≠ ${quoted(values[0])}`
          : `label ${key}=${quoted(actual)} is not one of (${list})`;
      }
      break;
    case 'Exists':
      if (!present) {
        holds = false;
        reason = `no ${key} label — Exists needs the key to be present`;
      } else if (actual === '') {
        holds = true;
        reason = `label ${key} is set with an empty value, which Exists accepts`;
      } else {
        holds = true;
        reason = `label ${key} is set (value ${quoted(actual)})`;
      }
      break;
    default:
      // DoesNotExist
      if (!present) {
        holds = true;
        reason = `no ${key} label, which is what DoesNotExist requires`;
      } else if (actual === '') {
        holds = false;
        reason = `label ${key} is set with an empty value, so DoesNotExist fails`;
      } else {
        holds = false;
        reason = `label ${key} is set (value ${quoted(actual)}), so DoesNotExist fails`;
      }
      break;
  }

  return {
    requirement,
    holds,
    reason,
    keyAbsent: !present,
    // Only NotIn surprises people here. DoesNotExist matching an absent key is
    // what it says on the tin, so it is not annotated.
    absentKeyMatch: !present && holds && op === 'NotIn',
    undecided: false,
  };
}

/* ══════════════════════════════════════════════════════════════════════════
   Unsatisfiable clause detection
   ═════════════════════════════════════════════════════════════════════════ */

function intersect(a: string[], b: string[]): string[] {
  const set = new Set(b);
  return a.filter((value) => set.has(value));
}

/**
 * Clauses on the same key that cannot all hold at once. Comma means AND, so
 * `env=prod,env=dev` is a perfectly legal selector that matches nothing —
 * kubectl accepts it, the API accepts it, and nothing anywhere says a word.
 */
function conflictWarnings(requirements: Requirement[]): Diagnostic[] {
  const byKey = new Map<string, Requirement[]>();
  for (const requirement of requirements) {
    const bucket = byKey.get(requirement.key);
    if (bucket) bucket.push(requirement);
    else byKey.set(requirement.key, [requirement]);
  }

  const warnings: Diagnostic[] = [];
  for (const [key, group] of byKey) {
    if (group.length < 2) continue;
    if (warnings.length >= MAX_CONFLICT_WARNINGS) break;

    const ins = group.filter((r) => r.op === 'In');
    const notIns = group.filter((r) => r.op === 'NotIn');
    const exists = group.filter((r) => r.op === 'Exists');
    const doesNotExist = group.filter((r) => r.op === 'DoesNotExist');

    const general = (a: Requirement, b: Requirement): Diagnostic => ({
      severity: 'warning',
      where: 'result',
      message: `The clauses on "${key}" contradict each other (${a.display} and ${b.display}), so this selector can never match anything.`,
    });

    // 1. "the key must be there" AND "the key must not be there".
    const needsKey = ins[0] ?? exists[0];
    if (needsKey && doesNotExist[0]) {
      warnings.push(general(needsKey, doesNotExist[0]));
      continue;
    }

    // 2. Two In clauses with no value in common.
    if (ins.length > 1) {
      let allowed = ins[0].values;
      for (let i = 1; i < ins.length; i += 1) allowed = intersect(allowed, ins[i].values);
      if (allowed.length === 0) {
        const [a, b] = ins;
        if (a.values.length === 1 && b.values.length === 1) {
          warnings.push({
            severity: 'warning',
            where: 'result',
            message: `Two clauses require different values for "${key}" (${a.display} and ${b.display}). Comma means AND, so nothing can satisfy both — kubectl accepts this selector and it matches nothing.`,
          });
        } else {
          warnings.push(general(a, b));
        }
        continue;
      }
      // 3. Everything the In clauses still allow is excluded by a NotIn clause.
      if (notIns.length > 0) {
        const forbidden = new Set(notIns.flatMap((r) => r.values));
        if (allowed.every((value) => forbidden.has(value))) {
          warnings.push(general(ins[0], notIns[0]));
        }
      }
      continue;
    }

    if (ins.length === 1 && notIns.length > 0) {
      const forbidden = new Set(notIns.flatMap((r) => r.values));
      if (ins[0].values.every((value) => forbidden.has(value))) {
        warnings.push(general(ins[0], notIns[0]));
      }
    }
  }
  return warnings;
}

/* ══════════════════════════════════════════════════════════════════════════
   The façade
   ═════════════════════════════════════════════════════════════════════════ */

function summaryFor(ok: boolean, errorCount: number, matchCount: number, resourceCount: number): string {
  if (!ok) return `Not evaluated — ${errorCount} error${errorCount === 1 ? '' : 's'}`;
  if (resourceCount === 0) return 'No resources to check';
  return `${matchCount} of ${resourceCount} ${resourceCount === 1 ? 'resource' : 'resources'} ${
    matchCount === 1 ? 'matches' : 'match'
  }`;
}

/** Sort by severity, stably, and cap. The UI groups on severity anyway. */
function orderDiagnostics(diagnostics: Diagnostic[]): Diagnostic[] {
  const ordered = diagnostics
    .map((diagnostic, index) => ({ diagnostic, index }))
    .sort(
      (a, b) =>
        SEVERITY_RANK[a.diagnostic.severity] - SEVERITY_RANK[b.diagnostic.severity] ||
        a.index - b.index,
    )
    .map((entry) => entry.diagnostic);
  if (ordered.length <= MAX_DIAGNOSTICS) return ordered;
  const hidden = ordered.length - MAX_DIAGNOSTICS;
  const kept = ordered.slice(0, MAX_DIAGNOSTICS);
  kept.push({
    severity: 'note',
    where: 'result',
    message: `…and ${hidden} more diagnostic${hidden === 1 ? '' : 's'}.`,
  });
  return kept;
}

/**
 * Test one selector against a set of resources.
 *
 * @param resourcesInput  YAML: one manifest, a `---` stream, a `kind: List`, or a bare list.
 * @param selectorInput   a `kubectl -l` string, or structured selector YAML.
 * @param mode            which grammar `selectorInput` is written in.
 */
export function testSelector(
  resourcesInput: string,
  selectorInput: string,
  mode: SelectorMode,
): SelectorTestResult {
  const resolvedMode = normalizeMode(mode);
  const selectorText = asString(selectorInput);
  const resourcesText = asString(resourcesInput);

  const selector = parseSelector(selectorText, resolvedMode);
  const resources = parseResources(resourcesText);
  const diagnostics: Diagnostic[] = [...selector.diagnostics, ...resources.diagnostics];

  const hasError = diagnostics.some((d) => d.severity === 'error');
  if (hasError) {
    const errorCount = diagnostics.filter((d) => d.severity === 'error').length;
    return {
      ok: false,
      mode: resolvedMode,
      requirements: selector.requirements,
      canonical: selector.canonical,
      empty: selector.empty,
      verdicts: [],
      matchCount: 0,
      resourceCount: 0,
      totalResources: resources.totalResources,
      truncated: resources.truncated,
      diagnostics: orderDiagnostics(diagnostics),
      summary: summaryFor(false, errorCount, 0, 0),
    };
  }

  const verdicts: ResourceVerdict[] = resources.resources.map((resource) => {
    const clauses = selector.requirements.map((requirement) =>
      evaluateClause(requirement, resource.labels, resource.unreadableLabels),
    );
    return {
      kind: resource.kind,
      name: resource.name,
      namespace: resource.namespace,
      labels: resource.labels,
      labelsPath: resource.labelsPath,
      matches: clauses.every((clause) => clause.holds),
      clauses,
      labelIssues: resource.labelIssues,
      unreadableLabels: resource.unreadableLabels,
    };
  });

  const matchCount = verdicts.filter((verdict) => verdict.matches).length;
  const resourceCount = verdicts.length;

  diagnostics.push(...conflictWarnings(selector.requirements));

  if (resourceCount > 0 && matchCount === 0 && !selector.empty) {
    diagnostics.push({
      severity: 'warning',
      where: 'result',
      message: `This selector is valid and matches none of the ${resourceCount} resources. Kubernetes never reports that as an error — a Service with a selector that matches nothing just has zero endpoints.`,
    });
  }

  // A resource whose only label was unreadable (`released: 2024-06-01`) is NOT
  // unlabelled — the note would be a false statement about the manifest.
  const unlabelled = verdicts.filter(
    (verdict) =>
      Object.keys(verdict.labels).length === 0 &&
      Object.keys(verdict.unreadableLabels).length === 0,
  ).length;
  if (unlabelled > 0) {
    diagnostics.push({
      severity: 'note',
      where: 'result',
      message: `${unlabelled} resource${unlabelled === 1 ? '' : 's'} ${
        unlabelled === 1 ? 'has' : 'have'
      } no labels at all. NotIn and != clauses still match ${
        unlabelled === 1 ? 'it' : 'them'
      } — that is apimachinery’s rule, not a quirk of this tester.`,
    });
  }

  return {
    ok: true,
    mode: resolvedMode,
    requirements: selector.requirements,
    canonical: selector.canonical,
    empty: selector.empty,
    verdicts,
    matchCount,
    resourceCount,
    totalResources: resources.totalResources,
    truncated: resources.truncated,
    diagnostics: orderDiagnostics(diagnostics),
    summary: summaryFor(true, 0, matchCount, resourceCount),
  };
}

/* ══════════════════════════════════════════════════════════════════════════
   #s= share state
   ═════════════════════════════════════════════════════════════════════════ */

interface WireState {
  /** resources */
  r: string;
  /** selector */
  sel: string;
  /** mode: 'y' = structured YAML, 'e' = kubectl -l */
  m: 'y' | 'e';
}

/** `#s=<base64url JSON>` carrying both inputs and the mode. */
export function encodeState(state: ShareState): string {
  const wire: WireState = {
    r: asString(state.resources),
    sel: asString(state.selector),
    m: state.mode === 'yaml' ? 'y' : 'e',
  };
  return `#s=${base64UrlEncode(JSON.stringify(wire))}`;
}

/**
 * Decode a `#s=` fragment. Two accepted forms, in order:
 *
 *   1. the base64url JSON payload `encodeState` writes;
 *   2. RAW TEXT — `#s=kind%3A%20Pod`, i.e. a hand-written or truncated
 *      fragment. It becomes the RESOURCES input with an empty selector.
 *
 * Form 2 is deliberate. A fragment is typo- and attacker-controlled input, and
 * the honest degradation for "this is not my payload" is to show it as pasted
 * text and let the engine produce a real diagnostic — not to drop it silently
 * and display an example the visitor never asked for.
 *
 * SSR-safe: with no argument and no `window`, returns null. Never throws.
 */
export function decodeState(hash?: string): ShareState | null {
  const source =
    typeof hash === 'string'
      ? hash
      : typeof window !== 'undefined' && window.location
        ? window.location.hash
        : '';
  const match = /[#&]s=([^&]*)/.exec(source);
  if (!match) return null;
  const encoded = match[1];
  if (encoded.length === 0) return null;

  try {
    const wire = JSON.parse(base64UrlDecode(encoded)) as Partial<WireState> | null;
    if (wire && typeof wire === 'object' && !Array.isArray(wire) && typeof wire.r === 'string') {
      return {
        resources: wire.r,
        selector: typeof wire.sel === 'string' ? wire.sel : '',
        mode: wire.m === 'y' ? 'yaml' : 'expr',
      };
    }
  } catch {
    /* not our payload — fall through to the raw-text form */
  }

  let text = encoded;
  try {
    text = decodeURIComponent(encoded);
  } catch {
    /* a malformed percent escape: keep the fragment verbatim */
  }
  if (text.trim().length === 0) return null;
  return { resources: text, selector: '', mode: 'expr' };
}

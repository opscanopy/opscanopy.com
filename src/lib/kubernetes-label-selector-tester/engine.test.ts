/**
 * Kubernetes Label Selector Tester — pinned semantics.
 *
 * Every assertion in this file pins a fact about `k8s.io/apimachinery`, not a
 * preference: `pkg/labels/selector.go` (the `kubectl -l` grammar, `Requirement`
 * validation, `Requirement.Matches`, `Requirement.String`),
 * `pkg/apis/meta/v1/helpers.go` (`LabelSelectorAsSelector`) and
 * `pkg/util/validation` (`IsQualifiedName`, `IsValidLabelValue`).
 *
 * The three that matter most, because they are the ones answered backwards:
 *
 *   1. `NotIn` MATCHES a resource that has no such label at all.
 *   2. `!=` is `NotIn` with one value, so it matches an absent key too.
 *   3. An empty selector matches EVERYTHING (`labels.Everything()`), while
 *      `LabelSelectorAsSelector(nil)` — no selector at all — matches nothing.
 *
 * Diagnostic wordings are pinned BYTE-FOR-BYTE on purpose: they are the product
 * (this tool exists to explain *why*), the E2E fixture table quotes one of them,
 * and a reworded diagnostic is a silently different answer.
 */
import { describe, expect, it } from 'vitest';
import {
  MAX_REQUIREMENTS,
  MAX_RESOURCES,
  MAX_RESOURCE_CHARS,
  MAX_SELECTOR_CHARS,
  decodeState,
  encodeState,
  testSelector,
} from './engine';
import { examples } from './examples';
import type { ClauseTrace, Diagnostic, ResourceVerdict, SelectorTestResult } from './types';

/* ── fixtures ──────────────────────────────────────────────────────────── */

/** Five pods; `web-d` carries the classic label typo, `api-a` is a different app. */
const FIVE_PODS = `apiVersion: v1
kind: Pod
metadata:
  name: web-a
  labels:
    app: web
    tier: frontend
---
apiVersion: v1
kind: Pod
metadata:
  name: web-b
  labels:
    app: web
    tier: frontend
---
apiVersion: v1
kind: Pod
metadata:
  name: web-c
  labels:
    app: web
    tier: frontend
---
apiVersion: v1
kind: Pod
metadata:
  name: web-d
  labels:
    app: web
    tier: frontnd
---
apiVersion: v1
kind: Pod
metadata:
  name: api-a
  labels:
    app: api
    tier: backend
`;

/** `prod-pod` has env=prod, `dev-pod` has env=dev, `no-env-pod` has no env key. */
const ENV_PODS = `apiVersion: v1
kind: Pod
metadata:
  name: prod-pod
  labels: { app: web, env: prod }
---
apiVersion: v1
kind: Pod
metadata:
  name: dev-pod
  labels: { app: web, env: dev }
---
apiVersion: v1
kind: Pod
metadata:
  name: no-env-pod
  labels: { app: web }
`;

/* ── helpers ───────────────────────────────────────────────────────────── */

function messages(result: SelectorTestResult, severity: Diagnostic['severity']): string[] {
  return result.diagnostics.filter((d) => d.severity === severity).map((d) => d.message);
}
function errors(result: SelectorTestResult): string[] {
  return messages(result, 'error');
}
function warnings(result: SelectorTestResult): string[] {
  return messages(result, 'warning');
}
function notes(result: SelectorTestResult): string[] {
  return messages(result, 'note');
}
function pod(result: SelectorTestResult, name: string): ResourceVerdict {
  const found = result.verdicts.find((v) => v.name === name);
  if (!found) throw new Error(`no verdict for ${name} in ${result.verdicts.map((v) => v.name)}`);
  return found;
}
function clause(result: SelectorTestResult, name: string, key: string): ClauseTrace {
  const found = pod(result, name).clauses.find((c) => c.requirement.key === key);
  if (!found) throw new Error(`no clause for ${key} on ${name}`);
  return found;
}
/** Every clause of every verdict, for the sweeps. */
function allClauses(result: SelectorTestResult): ClauseTrace[] {
  return result.verdicts.flatMap((v) => v.clauses);
}

/* ══════════════════════════════════════════════════════════════════════════
   1. The absent-key semantics — the reason this tool exists
   ═════════════════════════════════════════════════════════════════════════ */

describe('absent-key semantics (apimachinery Requirement.Matches)', () => {
  it('NotIn MATCHES a resource that has no such label at all', () => {
    const result = testSelector(ENV_PODS, 'env notin (prod)', 'expr');
    expect(result.ok).toBe(true);
    expect(pod(result, 'no-env-pod').matches).toBe(true);
    const trace = clause(result, 'no-env-pod', 'env');
    expect(trace.holds).toBe(true);
    expect(trace.keyAbsent).toBe(true);
    expect(trace.absentKeyMatch).toBe(true);
    expect(trace.reason).toBe('no env label at all — NotIn matches when the key is absent');
  });

  it('!= MATCHES a resource that has no such label at all', () => {
    const result = testSelector(ENV_PODS, 'env!=prod', 'expr');
    const trace = clause(result, 'no-env-pod', 'env');
    expect(trace.requirement.op).toBe('NotIn');
    expect(trace.requirement.written).toBe('!=');
    expect(trace.holds).toBe(true);
    expect(trace.absentKeyMatch).toBe(true);
    expect(trace.reason).toBe('no env label at all — NotIn matches when the key is absent');
  });

  it('structured NotIn matches the absent key too, and says so', () => {
    const result = testSelector(
      ENV_PODS,
      'matchExpressions:\n  - key: env\n    operator: NotIn\n    values: [prod]\n',
      'yaml',
    );
    expect(pod(result, 'no-env-pod').matches).toBe(true);
    expect(clause(result, 'no-env-pod', 'env').absentKeyMatch).toBe(true);
  });

  it('In does NOT match an absent key, and names the rule', () => {
    const result = testSelector(ENV_PODS, 'env in (prod,dev)', 'expr');
    const trace = clause(result, 'no-env-pod', 'env');
    expect(trace.holds).toBe(false);
    expect(trace.keyAbsent).toBe(true);
    expect(trace.absentKeyMatch).toBe(false);
    expect(trace.reason).toBe('no env label — In only matches when the key is present');
  });

  it('DoesNotExist matches the absent key, but is not flagged as surprising', () => {
    const result = testSelector(ENV_PODS, '!env', 'expr');
    const trace = clause(result, 'no-env-pod', 'env');
    expect(trace.requirement.op).toBe('DoesNotExist');
    expect(trace.holds).toBe(true);
    expect(trace.keyAbsent).toBe(true);
    expect(trace.absentKeyMatch).toBe(false);
    expect(trace.reason).toBe('no env label, which is what DoesNotExist requires');
  });

  it('NotIn still EXCLUDES a resource whose label is in the set', () => {
    const result = testSelector(ENV_PODS, 'env notin (prod)', 'expr');
    const trace = clause(result, 'prod-pod', 'env');
    expect(trace.holds).toBe(false);
    expect(trace.reason).toBe('label env="prod" is one of (prod), which NotIn excludes');
  });

  it('a resource with NO labels at all is matched by NotIn and noted', () => {
    const result = testSelector(
      'kind: Pod\nmetadata:\n  name: bare\n',
      'env notin (prod)',
      'expr',
    );
    expect(pod(result, 'bare').matches).toBe(true);
    expect(pod(result, 'bare').labels).toEqual({});
    expect(notes(result)).toContain(
      '1 resource has no labels at all. NotIn and != clauses still match it — that is apimachinery’s rule, not a quirk of this tester.',
    );
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   2. Exists, empty values, and the empty selector
   ═════════════════════════════════════════════════════════════════════════ */

describe('Exists and empty values', () => {
  it('Exists holds for a key whose value is the empty string', () => {
    const result = testSelector('kind: Pod\nmetadata:\n  name: p\n  labels: { env: "" }\n', 'env', 'expr');
    const trace = clause(result, 'p', 'env');
    expect(trace.requirement.op).toBe('Exists');
    expect(trace.requirement.written).toBe('key');
    expect(trace.holds).toBe(true);
    expect(trace.reason).toBe('label env is set with an empty value, which Exists accepts');
  });

  it('DoesNotExist FAILS for a key whose value is the empty string', () => {
    const result = testSelector('kind: Pod\nmetadata:\n  name: p\n  labels: { env: "" }\n', '!env', 'expr');
    const trace = clause(result, 'p', 'env');
    expect(trace.holds).toBe(false);
    expect(trace.reason).toBe('label env is set with an empty value, so DoesNotExist fails');
  });

  it('`env=` parses as "env equals the empty string" (apimachinery parseExactValue)', () => {
    const result = testSelector('kind: Pod\nmetadata:\n  name: p\n  labels: { env: "" }\n', 'env=', 'expr');
    expect(errors(result)).toEqual([]);
    expect(result.requirements[0]).toMatchObject({ key: 'env', op: 'In', values: [''] });
    expect(pod(result, 'p').matches).toBe(true);
  });

  it('`env in ()` is the one-element set containing the empty string, not an error', () => {
    const result = testSelector('kind: Pod\nmetadata:\n  name: p\n  labels: { env: "" }\n', 'env in ()', 'expr');
    expect(errors(result)).toEqual([]);
    expect(result.requirements[0].values).toEqual(['']);
    expect(pod(result, 'p').matches).toBe(true);
  });
});

describe('the empty selector', () => {
  it('an empty `{}` selector matches everything and is flagged empty', () => {
    const result = testSelector(FIVE_PODS, '{}', 'yaml');
    expect(result.ok).toBe(true);
    expect(result.empty).toBe(true);
    expect(result.requirements).toEqual([]);
    expect(result.canonical).toBe('');
    expect(result.matchCount).toBe(5);
    expect(result.verdicts.every((v) => v.matches)).toBe(true);
    expect(notes(result)).toContain(
      'An empty selector matches every resource — that is what a NetworkPolicy podSelector: {} means. A Service is different: an empty spec.selector is omitted by the API, so the Service gets no automatically managed endpoints at all.',
    );
  });

  it('an empty `-l` string is the empty selector too', () => {
    const result = testSelector(FIVE_PODS, '   ', 'expr');
    expect(result.empty).toBe(true);
    expect(result.matchCount).toBe(5);
  });

  it('empty matchLabels + empty matchExpressions is still the empty selector', () => {
    const result = testSelector(FIVE_PODS, 'matchLabels: {}\nmatchExpressions: []\n', 'yaml');
    expect(result.empty).toBe(true);
    expect(result.matchCount).toBe(5);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   3. The kubectl -l grammar
   ═════════════════════════════════════════════════════════════════════════ */

describe('kubectl -l grammar', () => {
  it('`==` is exactly `=`', () => {
    const a = testSelector(FIVE_PODS, 'app=web', 'expr');
    const b = testSelector(FIVE_PODS, 'app==web', 'expr');
    expect(a.matchCount).toBe(b.matchCount);
    expect(a.requirements[0].op).toBe(b.requirements[0].op);
    expect(a.requirements[0].values).toEqual(b.requirements[0].values);
    // The written form is preserved, so the trace shows what the user typed.
    expect(a.requirements[0].display).toBe('app=web');
    expect(b.requirements[0].display).toBe('app==web');
  });

  it('tolerates whitespace inside a set-based clause', () => {
    const result = testSelector(ENV_PODS, 'env in ( prod , dev )', 'expr');
    expect(errors(result)).toEqual([]);
    expect(result.requirements[0].values).toEqual(['dev', 'prod']);
    expect(result.canonical).toBe('env in (dev,prod)');
  });

  it('sorts and de-duplicates a value set, like sets.String.List()', () => {
    const result = testSelector(ENV_PODS, 'env in (staging,prod,staging)', 'expr');
    expect(result.requirements[0].values).toEqual(['prod', 'staging']);
    expect(result.canonical).toBe('env in (prod,staging)');
  });

  it('sorts clauses by key in the canonical form (apimachinery ByKey)', () => {
    const result = testSelector(FIVE_PODS, 'tier=frontend,app=web,!debug', 'expr');
    expect(result.canonical).toBe('app=web,!debug,tier=frontend');
  });

  it('accepts `in` and `notin` as VALUES (the parser is context-sensitive)', () => {
    const result = testSelector('kind: Pod\nmetadata:\n  name: p\n  labels: { op: in }\n', 'op in (in,notin)', 'expr');
    expect(errors(result)).toEqual([]);
    expect(result.requirements[0].values).toEqual(['in', 'notin']);
    expect(pod(result, 'p').matches).toBe(true);
  });

  it('a bare key is Exists and `!key` is DoesNotExist', () => {
    const result = testSelector(ENV_PODS, 'app,!debug', 'expr');
    expect(result.requirements.map((r) => [r.key, r.op, r.display])).toEqual([
      ['app', 'Exists', 'app'],
      ['debug', 'DoesNotExist', '!debug'],
    ]);
  });

  it('operators are case-sensitive — `IN` is a parse error that says so', () => {
    const result = testSelector(FIVE_PODS, 'env IN (prod)', 'expr');
    expect(result.ok).toBe(false);
    expect(errors(result)).toEqual([
      'Selector: found "IN", expected one of: in, notin, =, ==, != — selector operators are case-sensitive, so write "in", not "IN".',
    ]);
    expect(result.verdicts).toEqual([]);
  });

  it('`NOTIN` is the same case-sensitivity error', () => {
    const result = testSelector(FIVE_PODS, 'env NOTIN (prod)', 'expr');
    expect(errors(result)[0]).toContain('selector operators are case-sensitive');
  });

  it('names the token when a clause is followed by junk', () => {
    const result = testSelector(FIVE_PODS, 'app=web extra', 'expr');
    expect(errors(result)).toEqual([
      'Selector: found "extra", expected "," or the end of the selector.',
    ]);
  });

  it('rejects a dangling comma with a specific message', () => {
    const result = testSelector(FIVE_PODS, 'app=web,', 'expr');
    expect(errors(result)).toEqual(['Selector: found the end of the selector, expected a key after ",".']);
  });

  it('rejects a missing "(" after in', () => {
    const result = testSelector(FIVE_PODS, 'env in prod', 'expr');
    expect(errors(result)).toEqual(['Selector: found "prod", expected "(" after in.']);
  });

  it('rejects an unclosed value list', () => {
    const result = testSelector(FIVE_PODS, 'env in (prod', 'expr');
    expect(errors(result)).toEqual(['Selector: found the end of the selector, expected "," or ")".']);
  });

  it('refuses Gt/Lt and explains that they are a different API surface', () => {
    const result = testSelector(FIVE_PODS, 'replicas>2', 'expr');
    expect(result.ok).toBe(false);
    expect(errors(result)).toEqual([
      'Selector: ">" and "<" are not label-selector operators. Gt and Lt exist only on a NodeSelectorRequirement (node affinity), which is a different API type — a labelSelector has In, NotIn, Exists and DoesNotExist.',
    ]);
  });

  it('`!key=value` is a parse error, exactly as apimachinery treats it', () => {
    const result = testSelector(FIVE_PODS, '!app=web', 'expr');
    expect(errors(result)).toEqual([
      'Selector: found "=", expected "," or the end of the selector.',
    ]);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   4. Structured matchLabels / matchExpressions
   ═════════════════════════════════════════════════════════════════════════ */

describe('structured selectors', () => {
  it('a plain YAML map is treated as matchLabels, so a Service spec.selector pastes in', () => {
    const result = testSelector(FIVE_PODS, 'app: web\ntier: frontend\n', 'yaml');
    expect(result.ok).toBe(true);
    expect(result.requirements.map((r) => r.display)).toEqual(['app=web', 'tier=frontend']);
    expect(result.requirements.every((r) => r.source === 'matchLabels')).toBe(true);
    expect(notes(result)).toContain(
      'Read as matchLabels: a plain YAML map is equality-only, which is exactly what a Service spec.selector is.',
    );
    expect(result.matchCount).toBe(3);
  });

  it('matchLabels + matchExpressions are ANDed together', () => {
    const result = testSelector(
      ENV_PODS,
      'matchLabels:\n  app: web\nmatchExpressions:\n  - key: env\n    operator: NotIn\n    values: [dev]\n',
      'yaml',
    );
    expect(result.ok).toBe(true);
    expect(result.canonical).toBe('app=web,env notin (dev)');
    expect(result.matchCount).toBe(2);
    expect(pod(result, 'dev-pod').matches).toBe(false);
  });

  it('rejects a lowercase structured operator and names the four valid ones', () => {
    const result = testSelector(
      FIVE_PODS,
      'matchExpressions:\n  - key: env\n    operator: in\n    values: [prod]\n',
      'yaml',
    );
    expect(result.ok).toBe(false);
    expect(errors(result)).toEqual([
      'Selector: matchExpressions[0].operator is "in", which is not a label-selector operator — use In, NotIn, Exists or DoesNotExist. They are case-sensitive.',
    ]);
  });

  it('In with no values is an error (apimachinery: values set can’t be empty)', () => {
    const result = testSelector(
      FIVE_PODS,
      'matchExpressions:\n  - key: env\n    operator: In\n    values: []\n',
      'yaml',
    );
    expect(errors(result)).toEqual([
      'Selector: matchExpressions[0] uses In with no values — In and NotIn require at least one value.',
    ]);
  });

  it('NotIn with a missing values field is the same error', () => {
    const result = testSelector(
      FIVE_PODS,
      'matchExpressions:\n  - key: env\n    operator: NotIn\n',
      'yaml',
    );
    expect(errors(result)[0]).toContain('uses NotIn with no values');
  });

  it('Exists with values is an error (apimachinery: values set must be empty)', () => {
    const result = testSelector(
      FIVE_PODS,
      'matchExpressions:\n  - key: env\n    operator: Exists\n    values: [prod, dev]\n',
      'yaml',
    );
    expect(errors(result)).toEqual([
      'Selector: matchExpressions[0] uses Exists with 2 values — Exists and DoesNotExist must have no values.',
    ]);
  });

  it('a matchExpressions entry with no key is an error', () => {
    const result = testSelector(FIVE_PODS, 'matchExpressions:\n  - operator: Exists\n', 'yaml');
    expect(errors(result)).toEqual(['Selector: matchExpressions[0] has no key.']);
  });

  it('matchExpressions must be a list', () => {
    const result = testSelector(FIVE_PODS, 'matchExpressions:\n  key: env\n', 'yaml');
    expect(errors(result)).toEqual([
      'Selector: matchExpressions must be a list of {key, operator, values} entries, not a map.',
    ]);
  });

  it('quotes an unquoted numeric matchLabels value and says YAML read it as a number', () => {
    const result = testSelector(
      'kind: Pod\nmetadata:\n  name: p\n  labels: { version: "2" }\n',
      'matchLabels:\n  version: 2\n',
      'yaml',
    );
    expect(result.ok).toBe(true);
    expect(result.requirements[0].values).toEqual(['2']);
    expect(notes(result)).toContain(
      'matchLabels.version is not quoted, so YAML read it as the number 2. Kubernetes label values are strings — quote the value exactly as you wrote it.',
    );
    expect(pod(result, 'p').matches).toBe(true);
  });

  it('a duplicate matchLabels key is reported with its line number', () => {
    const result = testSelector(FIVE_PODS, 'matchLabels:\n  app: web\n  app: api\n', 'yaml');
    expect(result.ok).toBe(false);
    const diag = result.diagnostics.find((d) => d.message.includes('duplicate key'));
    expect(diag?.severity).toBe('error');
    expect(diag?.line).toBe(3);
    expect(diag?.message).toBe(
      'Selector: duplicate key on line 3 — YAML keeps only the last value, so this selector does not mean what it looks like.',
    );
  });

  it('a selector that is not a map is refused by type', () => {
    const result = testSelector(FIVE_PODS, '- app: web\n', 'yaml');
    expect(errors(result)).toEqual([
      'Selector: expected a YAML map — matchLabels/matchExpressions, or a plain label map — but this is a list.',
    ]);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   5. Selector extracted from a whole manifest
   ═════════════════════════════════════════════════════════════════════════ */

describe('selector extraction from a manifest', () => {
  it('reads spec.selector from a Service and says it is equality-only', () => {
    const result = testSelector(
      FIVE_PODS,
      'apiVersion: v1\nkind: Service\nmetadata:\n  name: web\nspec:\n  selector:\n    app: web\n    tier: frontend\n',
      'yaml',
    );
    expect(result.ok).toBe(true);
    expect(result.canonical).toBe('app=web,tier=frontend');
    expect(notes(result)).toContain(
      'Read spec.selector from the Service manifest. A Service selector is equality-only: every key/value pair is ANDed.',
    );
  });

  it('reads spec.selector.matchLabels from a Deployment', () => {
    const result = testSelector(
      FIVE_PODS,
      'apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: web\nspec:\n  selector:\n    matchLabels:\n      app: web\n',
      'yaml',
    );
    expect(result.canonical).toBe('app=web');
    expect(notes(result)).toContain('Read spec.selector from the Deployment manifest.');
  });

  it('reads spec.podSelector from a NetworkPolicy', () => {
    const result = testSelector(
      ENV_PODS,
      'apiVersion: networking.k8s.io/v1\nkind: NetworkPolicy\nmetadata:\n  name: p\nspec:\n  podSelector:\n    matchExpressions:\n      - key: env\n        operator: NotIn\n        values: [dev]\n',
      'yaml',
    );
    expect(result.ok).toBe(true);
    expect(result.canonical).toBe('env notin (dev)');
    expect(notes(result)).toContain('Read spec.podSelector from the NetworkPolicy manifest.');
    expect(result.matchCount).toBe(2);
  });

  it('warns that a Service cannot carry matchExpressions — the answer LLMs get wrong', () => {
    const result = testSelector(
      ENV_PODS,
      'apiVersion: v1\nkind: Service\nmetadata:\n  name: web\nspec:\n  selector:\n    matchExpressions:\n      - key: env\n        operator: In\n        values: [prod]\n',
      'yaml',
    );
    expect(warnings(result)).toContain(
      'A Service spec.selector is a plain label map: it supports neither matchLabels nor matchExpressions, and the API server rejects those fields there. The set-based result below is what a Deployment or NetworkPolicy would do with it, not what this Service will do.',
    );
    // Still evaluated, because "what would this match" is the question asked.
    expect(result.ok).toBe(true);
    expect(result.matchCount).toBe(1);
  });

  it('a manifest with no selector field is an error that names the kind', () => {
    const result = testSelector(
      FIVE_PODS,
      'apiVersion: v1\nkind: ConfigMap\nmetadata:\n  name: c\ndata:\n  a: b\n',
      'yaml',
    );
    expect(errors(result)).toEqual([
      'Selector: this looks like a ConfigMap manifest, but it has no spec.selector or spec.podSelector — paste the selector itself, or a manifest that has one.',
    ]);
  });

  it('an empty podSelector is the empty selector', () => {
    const result = testSelector(
      ENV_PODS,
      'kind: NetworkPolicy\nmetadata:\n  name: p\nspec:\n  podSelector: {}\n',
      'yaml',
    );
    expect(result.empty).toBe(true);
    expect(result.matchCount).toBe(3);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   6. Validation — selector keys are errors, resource labels are advisory
   ═════════════════════════════════════════════════════════════════════════ */

describe('label key and value validation', () => {
  it('names the 63-character name limit for a selector key', () => {
    const key = 'a'.repeat(64);
    const result = testSelector(FIVE_PODS, `${key}=web`, 'expr');
    expect(result.ok).toBe(false);
    expect(errors(result)[0]).toContain('is 64 characters; the limit is 63');
  });

  it('names the 253-character prefix limit', () => {
    const key = `${'a'.repeat(254)}/name`;
    const result = testSelector(FIVE_PODS, `${key}=web`, 'expr');
    expect(errors(result)[0]).toContain('is 254 characters; the limit is 253');
  });

  it('names the 63-character value limit', () => {
    const value = 'v'.repeat(64);
    const result = testSelector(FIVE_PODS, `app=${value}`, 'expr');
    expect(errors(result)[0]).toContain('is 64 characters; the limit is 63');
  });

  it('rejects more than one slash in a key', () => {
    const result = testSelector(FIVE_PODS, 'matchLabels:\n  a/b/c: web\n', 'yaml');
    expect(errors(result)).toEqual([
      'Selector: label key "a/b/c" has more than one "/" — a key is at most one DNS-subdomain prefix, a "/", then the name.',
    ]);
  });

  it('rejects an empty prefix and an empty name', () => {
    expect(errors(testSelector(FIVE_PODS, 'matchLabels:\n  /app: web\n', 'yaml'))).toEqual([
      'Selector: label key "/app" has an empty prefix before the "/".',
    ]);
    expect(errors(testSelector(FIVE_PODS, 'matchLabels:\n  app/: web\n', 'yaml'))).toEqual([
      'Selector: label key "app/" has an empty name after the "/".',
    ]);
  });

  it('rejects an uppercase prefix — a prefix is a DNS subdomain', () => {
    const result = testSelector(FIVE_PODS, 'matchLabels:\n  Example.com/app: web\n', 'yaml');
    expect(errors(result)).toEqual([
      'Selector: the prefix "Example.com" of label key "Example.com/app" is not a DNS subdomain — lowercase letters, digits, "-" and "." only, starting and ending with a letter or digit.',
    ]);
  });

  it('rejects a key name with a space', () => {
    const result = testSelector(FIVE_PODS, 'matchLabels:\n  "app name": web\n', 'yaml');
    expect(errors(result)).toEqual([
      'Selector: label key name "app name" must be alphanumeric, "-", "_" or "." and must start and end with a letter or digit.',
    ]);
  });

  it('a comma inside a matchLabels VALUE is a validation error, not two clauses', () => {
    const result = testSelector(FIVE_PODS, 'matchLabels:\n  env: "prod,staging"\n', 'yaml');
    expect(result.ok).toBe(false);
    expect(errors(result)).toEqual([
      'Selector: label value "prod,staging" for key "env" must be alphanumeric, "-", "_" or "." and must start and end with a letter or digit (an empty value is allowed).',
    ]);
  });

  it('an invalid RESOURCE label is advisory only — the verdict still renders', () => {
    const result = testSelector(
      'kind: Pod\nmetadata:\n  name: p\n  labels: { app: "not valid!" }\n',
      'app',
      'expr',
    );
    expect(result.ok).toBe(true);
    expect(errors(result)).toEqual([]);
    expect(pod(result, 'p').matches).toBe(true);
    expect(pod(result, 'p').labelIssues).toEqual([
      {
        key: 'app',
        message:
          'Label value "not valid!" for key "app" must be alphanumeric, "-", "_" or "." and must start and end with a letter or digit (an empty value is allowed).',
      },
    ]);
  });

  it('flags an unquoted boolean resource label — the YAML 1.1 trap', () => {
    const result = testSelector(
      'kind: Pod\nmetadata:\n  name: p\n  labels: { debug: true }\n',
      'debug=true',
      'expr',
    );
    expect(pod(result, 'p').labels).toEqual({ debug: 'true' });
    expect(pod(result, 'p').labelIssues[0].message).toBe(
      'Label debug is not quoted, so YAML read it as the boolean true. Kubernetes label values are strings — quote the value exactly as you wrote it.',
    );
    expect(pod(result, 'p').matches).toBe(true);
  });

  /*
   * REGRESSION: the note used to read "Label version was written as 1, so YAML
   * read it as a number … quote it as "1"" for a manifest that said `1.0`. It
   * stated as fact something the user never typed, and its remediation silently
   * changed the value. js-yaml hands back a `number`; the source token is gone,
   * so the sentence may never claim to quote it.
   */
  it('never claims what the user typed, and never tells them to quote the coerced value', () => {
    for (const [written, coerced] of [
      ['1.0', '1'],
      ['010', '10'],
      ['0755', '755'],
      ['0x1f', '31'],
      ['1e3', '1000'],
    ]) {
      const result = testSelector(
        `kind: Pod\nmetadata:\n  name: p\n  labels: { version: ${written} }\n`,
        'app',
        'expr',
      );
      const message = pod(result, 'p').labelIssues[0].message;
      expect(message).toBe(
        `Label version is not quoted, so YAML read it as the number ${coerced}. Kubernetes label values are strings — quote the value exactly as you wrote it.`,
      );
      expect(message).not.toContain(`quote it as "${coerced}"`);
      expect(message).not.toContain('was written as');
    }
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   6b. A label whose YAML value is not a scalar — present, not absent
   ═════════════════════════════════════════════════════════════════════════

   REGRESSION (the worst bug this tool could ship): an unquoted date, a list or a
   nested map as a label value used to be DROPPED from the label set, after which
   every clause on that key reported the key as ABSENT — including the amber
   "matches *because* the key is absent" annotation, on a document that plainly
   carries the key, in an ok:true run. `kubectl apply` rejects such a manifest
   outright ("cannot unmarshal !!timestamp into string"), so "absent" is not the
   ground truth under any reading.
*/

describe('labels whose YAML value is not a scalar', () => {
  const DATE_POD = `kind: Pod
metadata:
  name: web-1
  labels:
    app: web
    released: 2024-06-01
`;
  const LIST_POD = 'kind: Pod\nmetadata:\n  name: p\n  labels:\n    tags: [a, b]\n';
  const MAP_POD = 'kind: Pod\nmetadata:\n  name: p\n  labels:\n    nested: { x: y }\n';

  it('an unquoted date is reported as a date, not as a map', () => {
    const result = testSelector(DATE_POD, 'app=web', 'expr');
    expect(result.ok).toBe(true);
    expect(pod(result, 'web-1').labelIssues).toEqual([
      {
        key: 'released',
        message:
          'Label released is a date, not a label value — Kubernetes labels are strings. Quote it to make it one.',
      },
    ]);
    expect(pod(result, 'web-1').unreadableLabels).toEqual({ released: 'date' });
  });

  it('!= and notin do NOT match on it and do NOT claim the key is absent', () => {
    for (const selector of ['released!=2024-06-01', 'released notin (2024-06-01)']) {
      const result = testSelector(DATE_POD, selector, 'expr');
      const trace = clause(result, 'web-1', 'released');
      expect(trace.holds, selector).toBe(false);
      expect(trace.keyAbsent, selector).toBe(false);
      expect(trace.absentKeyMatch, selector).toBe(false);
      expect(trace.undecided, selector).toBe(true);
      expect(trace.reason, selector).toBe(
        'label released is set, but YAML read its value as a date, not a string — quote it in the manifest and this clause can be decided',
      );
      expect(pod(result, 'web-1').matches, selector).toBe(false);
    }
  });

  it('= and in do not match it either, and say why instead of saying "absent"', () => {
    const result = testSelector(DATE_POD, 'released=2024-06-01', 'expr');
    const trace = clause(result, 'web-1', 'released');
    expect(trace.holds).toBe(false);
    expect(trace.keyAbsent).toBe(false);
    expect(trace.undecided).toBe(true);
    expect(trace.reason).not.toContain('no released label');
  });

  it('Exists holds and DoesNotExist fails — the key IS present', () => {
    const exists = clause(testSelector(DATE_POD, 'released', 'expr'), 'web-1', 'released');
    expect(exists.holds).toBe(true);
    expect(exists.keyAbsent).toBe(false);
    expect(exists.undecided).toBe(false);
    expect(exists.reason).toBe(
      'label released is set — YAML read its value as a date, which Exists does not look at',
    );

    const missing = clause(testSelector(DATE_POD, '!released', 'expr'), 'web-1', 'released');
    expect(missing.holds).toBe(false);
    expect(missing.keyAbsent).toBe(false);
    expect(missing.reason).toBe(
      'label released is set (YAML read its value as a date), so DoesNotExist fails',
    );
  });

  it('list- and map-valued labels behave the same way', () => {
    for (const [source, kind, key] of [
      [LIST_POD, 'list', 'tags'],
      [MAP_POD, 'map', 'nested'],
    ]) {
      const result = testSelector(source, `${key}!=a`, 'expr');
      const trace = clause(result, 'p', key);
      expect(trace.keyAbsent, kind).toBe(false);
      expect(trace.absentKeyMatch, kind).toBe(false);
      expect(trace.reason, kind).toContain(`YAML read its value as a ${kind}`);
    }
  });

  it('a resource whose only label is unreadable is NOT reported as having no labels', () => {
    const result = testSelector(
      'kind: Pod\nmetadata:\n  name: only\n  labels:\n    released: 2024-06-01\n',
      'released!=2024-06-01',
      'expr',
    );
    expect(result.ok).toBe(true);
    expect(notes(result).join(' | ')).not.toContain('no labels at all');
  });

  it('still reports a genuinely unlabelled resource as having no labels', () => {
    const result = testSelector(
      'kind: Pod\nmetadata:\n  name: bare\n',
      'env notin (prod)',
      'expr',
    );
    expect(notes(result)).toContain(
      '1 resource has no labels at all. NotIn and != clauses still match it — that is apimachinery’s rule, not a quirk of this tester.',
    );
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   6c. Field paths named in selector errors must be paths that can exist
   ═════════════════════════════════════════════════════════════════════════ */

describe('selector error field paths', () => {
  /*
   * REGRESSION: a Service's plain `spec.selector` was reported as
   * `spec.selector.matchLabels.app`, a field the API server rejects outright —
   * the same page's FAQ says so. `.matchLabels` may only be named when the
   * target actually uses the structured fields.
   */
  it('a plain spec.selector is named without an impossible .matchLabels segment', () => {
    const result = testSelector(
      FIVE_PODS,
      'kind: Service\nspec:\n  selector:\n    app: { a: b }\n',
      'yaml',
    );
    expect(result.ok).toBe(false);
    expect(errors(result)).toEqual([
      'Selector: spec.selector.app is a map, not a label value.',
    ]);
  });

  it('a structured spec.selector still names .matchLabels', () => {
    const result = testSelector(
      FIVE_PODS,
      'kind: Deployment\nspec:\n  selector:\n    matchLabels:\n      app: { a: b }\n',
      'yaml',
    );
    expect(result.ok).toBe(false);
    expect(errors(result)).toEqual([
      'Selector: spec.selector.matchLabels.app is a map, not a label value.',
    ]);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   7. Resource parsing — multi-doc, List, manifests, verdicts
   ═════════════════════════════════════════════════════════════════════════ */

describe('resource parsing', () => {
  it('names every verdict from metadata.name across a multi-doc paste', () => {
    const result = testSelector(FIVE_PODS, 'app=web,tier=frontend', 'expr');
    expect(result.verdicts.map((v) => v.name)).toEqual(['web-a', 'web-b', 'web-c', 'web-d', 'api-a']);
    expect(result.verdicts.map((v) => v.kind)).toEqual(['Pod', 'Pod', 'Pod', 'Pod', 'Pod']);
    expect(result.resourceCount).toBe(5);
    expect(result.matchCount).toBe(3);
    expect(result.summary).toBe('3 of 5 resources match');
  });

  it('pins the typo reason string that makes this tool worth using', () => {
    const result = testSelector(FIVE_PODS, 'app=web,tier=frontend', 'expr');
    expect(pod(result, 'web-d').matches).toBe(false);
    expect(clause(result, 'web-d', 'tier').reason).toBe('label tier="frontnd" ≠ "frontend"');
    expect(clause(result, 'web-d', 'app').reason).toBe('label app="web" = "web"');
  });

  it('flattens a kind: List', () => {
    const list = `apiVersion: v1
kind: List
items:
  - kind: Pod
    metadata: { name: a, labels: { app: web } }
  - kind: Pod
    metadata: { name: b, labels: { app: api } }
`;
    const result = testSelector(list, 'app=web', 'expr');
    expect(result.verdicts.map((v) => v.name)).toEqual(['a', 'b']);
    expect(result.matchCount).toBe(1);
  });

  it('accepts a bare YAML list of objects', () => {
    const result = testSelector(
      '- kind: Pod\n  metadata: { name: a, labels: { app: web } }\n- kind: Pod\n  metadata: { name: b, labels: { app: web } }\n',
      'app=web',
      'expr',
    );
    expect(result.matchCount).toBe(2);
  });

  it('lists a workload’s pod template as its own row, and explains why', () => {
    const deploy = `apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
  labels: { app: web-deployment }
spec:
  selector:
    matchLabels: { app: web }
  template:
    metadata:
      labels: { app: web, tier: frontend }
`;
    const result = testSelector(deploy, 'app=web', 'expr');
    expect(result.verdicts.map((v) => [v.kind, v.name, v.labelsPath])).toEqual([
      ['Deployment', 'web', 'metadata.labels'],
      ['Pod template', 'web', 'spec.template.metadata.labels'],
    ]);
    expect(result.matchCount).toBe(1);
    expect(pod(result, 'web').matches).toBe(false);
    expect(notes(result)).toContain(
      'A workload’s own labels and its pod-template labels are different sets, and a Service or NetworkPolicy selects the POD labels. Each pod template found here is listed as its own "Pod template" row.',
    );
  });

  it('falls back to top-level name/labels for a bare shorthand object', () => {
    const result = testSelector('name: p\nlabels: { app: web }\n', 'app=web', 'expr');
    expect(result.verdicts[0]).toMatchObject({ name: 'p', kind: 'Object', labelsPath: 'labels' });
    expect(result.matchCount).toBe(1);
  });

  it('keeps a nameless document and says so', () => {
    const result = testSelector('kind: Pod\nmetadata:\n  labels: { app: web }\n', 'app=web', 'expr');
    expect(result.verdicts[0].name).toBe('(unnamed)');
    expect(result.matchCount).toBe(1);
  });

  it('carries the namespace when there is one', () => {
    const result = testSelector(
      'kind: Pod\nmetadata: { name: p, namespace: prod, labels: { app: web } }\n',
      'app=web',
      'expr',
    );
    expect(result.verdicts[0].namespace).toBe('prod');
  });

  it('reports a duplicate resource label key with its line number', () => {
    const result = testSelector(
      'kind: Pod\nmetadata:\n  name: p\n  labels:\n    app: web\n    app: api\n',
      'app=web',
      'expr',
    );
    expect(result.ok).toBe(false);
    const diag = result.diagnostics.find((d) => d.severity === 'error');
    expect(diag?.line).toBe(6);
    expect(diag?.message).toBe(
      'Resources: duplicate key on line 6 — YAML keeps only the last value, so this manifest does not mean what it looks like.',
    );
  });

  it('refuses a plain scalar document with the diagnostic the E2E suite pins', () => {
    const result = testSelector('app=web', 'app=web', 'expr');
    expect(result.ok).toBe(false);
    expect(errors(result)).toEqual([
      'Resources: document 1 is a plain string, not a Kubernetes object — paste manifests, a kind: List, or a YAML list of objects.',
    ]);
  });

  it('names the type for other scalar documents', () => {
    expect(errors(testSelector('42', 'app', 'expr'))[0]).toContain('document 1 is a plain number');
    expect(errors(testSelector('true', 'app', 'expr'))[0]).toContain('document 1 is a plain boolean');
  });

  it('translates a YAML syntax error into a line-referenced sentence', () => {
    const result = testSelector('{app: web', 'app=web', 'expr');
    expect(result.ok).toBe(false);
    expect(errors(result)[0]).toContain('Resources: could not read this as YAML — line 1:');
  });

  it('warns when metadata.labels is not a map', () => {
    const result = testSelector(
      'kind: Pod\nmetadata:\n  name: p\n  labels: [app, web]\n',
      'app=web',
      'expr',
    );
    expect(warnings(result)).toContain(
      'Resources: document 1 has metadata.labels written as a list, not a key/value map — it was read as having no labels.',
    );
    expect(result.verdicts[0].labels).toEqual({});
  });

  it('an empty resources input is not an error', () => {
    const result = testSelector('', 'app=web', 'expr');
    expect(result.ok).toBe(true);
    expect(result.resourceCount).toBe(0);
    expect(result.verdicts).toEqual([]);
    expect(result.summary).toBe('No resources to check');
  });

  it('skips empty documents in a multi-doc paste', () => {
    const result = testSelector(
      '---\n---\nkind: Pod\nmetadata: { name: p, labels: { app: web } }\n---\n',
      'app=web',
      'expr',
    );
    expect(result.resourceCount).toBe(1);
    expect(result.matchCount).toBe(1);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   8. Result-level warnings
   ═════════════════════════════════════════════════════════════════════════ */

describe('result warnings', () => {
  it('`env=prod,env=dev` is legal AND, and is warned about as unsatisfiable', () => {
    const result = testSelector(ENV_PODS, 'env=prod,env=dev', 'expr');
    expect(result.ok).toBe(true);
    expect(result.requirements).toHaveLength(2);
    expect(result.matchCount).toBe(0);
    expect(warnings(result)).toContain(
      'Two clauses require different values for "env" (env=prod and env=dev). Comma means AND, so nothing can satisfy both — kubectl accepts this selector and it matches nothing.',
    );
  });

  it('spots an In clause contradicted by a NotIn clause on the same key', () => {
    const result = testSelector(ENV_PODS, 'env in (prod),env notin (prod)', 'expr');
    expect(warnings(result)).toContain(
      'The clauses on "env" contradict each other (env in (prod) and env notin (prod)), so this selector can never match anything.',
    );
  });

  it('spots Exists contradicted by DoesNotExist on the same key', () => {
    const result = testSelector(ENV_PODS, 'env,!env', 'expr');
    expect(warnings(result)).toContain(
      'The clauses on "env" contradict each other (env and !env), so this selector can never match anything.',
    );
  });

  it('warns when a valid selector matches nothing', () => {
    const result = testSelector(FIVE_PODS, 'app=nope', 'expr');
    expect(result.ok).toBe(true);
    expect(result.matchCount).toBe(0);
    expect(warnings(result)).toContain(
      'This selector is valid and matches none of the 5 resources. Kubernetes never reports that as an error — a Service with a selector that matches nothing just has zero endpoints.',
    );
    expect(result.summary).toBe('0 of 5 resources match');
  });

  it('does not raise the zero-match warning when there are no resources', () => {
    const result = testSelector('', 'app=nope', 'expr');
    expect(warnings(result)).toEqual([]);
  });

  it('uses singular wording for one resource', () => {
    const result = testSelector('kind: Pod\nmetadata: { name: p, labels: { app: web } }\n', 'app=web', 'expr');
    expect(result.summary).toBe('1 of 1 resource matches');
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   9. Caps — the arrays and the DOM are what freeze a tab, not the engine
   ═════════════════════════════════════════════════════════════════════════ */

describe('caps', () => {
  it('evaluates at most MAX_RESOURCES documents and says how many it skipped', () => {
    const docs: string[] = [];
    for (let i = 0; i < MAX_RESOURCES + 100; i += 1) {
      docs.push(`kind: Pod\nmetadata: { name: p${i}, labels: { app: web } }`);
    }
    const result = testSelector(docs.join('\n---\n'), 'app=web', 'expr');
    expect(result.ok).toBe(true);
    expect(result.totalResources).toBe(MAX_RESOURCES + 100);
    expect(result.resourceCount).toBe(MAX_RESOURCES);
    expect(result.truncated).toBe(true);
    expect(warnings(result)).toContain(
      `Only the first ${MAX_RESOURCES} resources were evaluated; ${MAX_RESOURCES + 100} were found. Trim the paste to check the rest.`,
    );
  });

  it('refuses a resources paste past MAX_RESOURCE_CHARS instead of freezing', () => {
    const result = testSelector('a'.repeat(MAX_RESOURCE_CHARS + 1), 'app=web', 'expr');
    expect(result.ok).toBe(false);
    expect(errors(result)[0]).toContain('and this tester reads up to 500,000 characters');
  });

  it('refuses a selector past MAX_SELECTOR_CHARS', () => {
    const result = testSelector(FIVE_PODS, 'a'.repeat(MAX_SELECTOR_CHARS + 1), 'expr');
    expect(result.ok).toBe(false);
    expect(errors(result)[0]).toContain('and this tester reads up to 20,000 characters');
  });

  it('refuses a selector with more than MAX_REQUIREMENTS clauses', () => {
    const clauses: string[] = [];
    for (let i = 0; i < MAX_REQUIREMENTS + 1; i += 1) clauses.push(`k${i}=v`);
    const result = testSelector(FIVE_PODS, clauses.join(','), 'expr');
    expect(result.ok).toBe(false);
    expect(errors(result)[0]).toContain(
      `has ${MAX_REQUIREMENTS + 1} clauses and this tester reads up to ${MAX_REQUIREMENTS}`,
    );
  });

  it('caps the advisory label issues on one resource', () => {
    const labels: string[] = [];
    for (let i = 0; i < 20; i += 1) labels.push(`k${i}: "bad value!"`);
    const result = testSelector(
      `kind: Pod\nmetadata:\n  name: p\n  labels: { ${labels.join(', ')} }\n`,
      'app',
      'expr',
    );
    const issues = result.verdicts[0].labelIssues;
    expect(issues.length).toBeLessThanOrEqual(11);
    expect(issues[issues.length - 1].message).toBe('…and 10 more label problems on this resource.');
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   10. Never throws
   ═════════════════════════════════════════════════════════════════════════ */

describe('never throws', () => {
  const hostile: string[] = [
    '',
    ' ',
    '\n\n\n',
    '\t\t',
    ' ',
    '---',
    '--- ---',
    '{',
    '}',
    '[',
    ']',
    '[[[[[[[[[[',
    '{{{{{{{{{{',
    'null',
    'true',
    '0',
    '-1',
    '0x1F',
    '!!binary |\n  aGVsbG8=',
    '!Ref Thing',
    '&a *a',
    'a: &x\n  self: *x',
    '<<: *base',
    '%%%',
    '%ZZ',
    '﻿kind: Pod',
    '👋: 🙂',
    'kind: Pod\nmetadata: null',
    'kind: Pod\nmetadata: 5',
    'metadata:\n  labels: null',
    'metadata:\n  labels:\n    a: null',
    'kind: List',
    'kind: List\nitems: null',
    'kind: List\nitems: 5',
    'kind: List\nitems: [null, 5, "x"]',
    'a'.repeat(5000),
    `${'  '.repeat(200)}a: b`,
    'app=web',
    'app in (a,b)',
    'app: [1, 2]',
    'app: {a: {b: {c: {d: 1}}}}',
  ];

  const selectors: string[] = [
    '',
    ' ',
    ',',
    ',,,',
    '=',
    '==',
    '!=',
    '!',
    '!!',
    '()',
    '(',
    ')',
    'a=',
    '=a',
    'a==',
    'a!=',
    'a in',
    'a in (',
    'a in )',
    'a notin',
    'in',
    'notin',
    '!in',
    'a=b=c',
    'a>1',
    'a<1',
    'a=b,,c=d',
    'a b c',
    ' ',
    '👋=🙂',
    'matchLabels: null',
    'matchLabels: 5',
    'matchLabels: [a, b]',
    'matchExpressions: null',
    'matchExpressions: [null]',
    'matchExpressions: [5]',
    'matchExpressions:\n  - key: a\n    operator: In\n    values: null',
    'matchExpressions:\n  - key: a\n    operator: In\n    values: [null]',
    'matchExpressions:\n  - key: 5\n    operator: Exists',
    'spec: null',
    'spec: {selector: null}',
    'spec: {selector: 5}',
    'spec: {podSelector: []}',
    '{',
    'a: &x\n  self: *x',
    '- 1\n- 2',
    'a'.repeat(3000),
    `${'a=b,'.repeat(500)}c=d`,
  ];

  it('survives every hostile resources input in both modes', () => {
    for (const resources of hostile) {
      for (const mode of ['expr', 'yaml'] as const) {
        const selector = mode === 'expr' ? 'app=web' : 'app: web';
        expect(() => testSelector(resources, selector, mode), `resources=${JSON.stringify(resources)}`).not.toThrow();
        const result = testSelector(resources, selector, mode);
        expect(typeof result.ok).toBe('boolean');
        expect(typeof result.summary).toBe('string');
        expect(Array.isArray(result.verdicts)).toBe(true);
      }
    }
  });

  it('survives every hostile selector in both modes', () => {
    for (const selector of selectors) {
      for (const mode of ['expr', 'yaml'] as const) {
        expect(() => testSelector(FIVE_PODS, selector, mode), `selector=${JSON.stringify(selector)}`).not.toThrow();
        const result = testSelector(FIVE_PODS, selector, mode);
        expect(typeof result.ok).toBe('boolean');
        // A failed selector never produces verdicts — that would be a guess.
        if (!result.ok) expect(result.verdicts).toEqual([]);
      }
    }
  });

  it('survives a garbage mode argument by falling back to the -l grammar', () => {
    const result = testSelector(FIVE_PODS, 'app=web', 'nonsense' as unknown as 'expr');
    expect(result.ok).toBe(true);
    expect(result.mode).toBe('expr');
    expect(result.matchCount).toBe(4);
  });

  it('survives non-string arguments', () => {
    const bad = [undefined, null, 5, {}, [], () => 1] as unknown as string[];
    for (const value of bad) {
      expect(() => testSelector(value, 'app=web', 'expr')).not.toThrow();
      expect(() => testSelector(FIVE_PODS, value, 'expr')).not.toThrow();
    }
  });

  it('never returns a clause without a reason', () => {
    const runs = [
      testSelector(FIVE_PODS, 'app=web,tier=frontend,!debug,env notin (dev)', 'expr'),
      testSelector(ENV_PODS, 'env in (prod,dev),app', 'expr'),
      testSelector(
        ENV_PODS,
        'matchLabels:\n  app: web\nmatchExpressions:\n  - key: env\n    operator: Exists\n  - key: debug\n    operator: DoesNotExist\n',
        'yaml',
      ),
    ];
    for (const result of runs) {
      const clauses = allClauses(result);
      expect(clauses.length).toBeGreaterThan(0);
      for (const trace of clauses) {
        expect(trace.reason.length, JSON.stringify(trace.requirement)).toBeGreaterThan(0);
        expect(trace.requirement.display.length).toBeGreaterThan(0);
      }
    }
  });

  it('matches is exactly "every clause holds"', () => {
    const result = testSelector(FIVE_PODS, 'app=web,tier=frontend', 'expr');
    for (const verdict of result.verdicts) {
      expect(verdict.matches).toBe(verdict.clauses.every((c) => c.holds));
    }
  });

  it('reports "Not evaluated" in the summary when the selector is broken', () => {
    const result = testSelector(FIVE_PODS, 'env IN (prod)', 'expr');
    expect(result.summary).toBe('Not evaluated — 1 error');
    const two = testSelector(FIVE_PODS, 'matchLabels:\n  /a: b\n  c/d/e: f\n', 'yaml');
    expect(two.summary).toBe('Not evaluated — 2 errors');
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   11. Share state
   ═════════════════════════════════════════════════════════════════════════ */

describe('#s= share state', () => {
  it('round-trips both inputs and the mode', () => {
    for (const mode of ['expr', 'yaml'] as const) {
      const state = { resources: FIVE_PODS, selector: 'app=web,tier=frontend', mode };
      const fragment = encodeState(state);
      expect(fragment.startsWith('#s=')).toBe(true);
      expect(decodeState(fragment)).toEqual(state);
    }
  });

  it('round-trips unicode', () => {
    const state = { resources: 'kind: Pöd 👋\n', selector: 'app=wéb', mode: 'expr' as const };
    expect(decodeState(encodeState(state))).toEqual(state);
  });

  it('accepts raw text as the resources payload — the honest degradation', () => {
    const state = decodeState('#s=app%3Dweb');
    expect(state).toEqual({ resources: 'app=web', selector: '', mode: 'expr' });
  });

  it('returns null for a missing or empty fragment', () => {
    expect(decodeState('')).toBeNull();
    expect(decodeState('#other=1')).toBeNull();
    expect(decodeState('#s=')).toBeNull();
  });

  it('never throws on a hostile fragment', () => {
    for (const hash of ['#s=%%%', '#s=!!!', '#s=' + '='.repeat(50), '#s=eyJ9', '#s=null', '#s=W10']) {
      expect(() => decodeState(hash)).not.toThrow();
    }
  });

  it('every bundled example fits the 2000-character fragment cap', () => {
    for (const example of examples) {
      const fragment = encodeState({
        resources: example.resources,
        selector: example.selector,
        mode: example.mode,
      });
      expect(fragment.length, `${example.id} fragment is ${fragment.length} chars`).toBeLessThanOrEqual(2000);
    }
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   12. The bundled examples must all be honest
   ═════════════════════════════════════════════════════════════════════════ */

describe('examples', () => {
  it('ships five chips with unique ids and labels', () => {
    expect(examples).toHaveLength(5);
    expect(new Set(examples.map((e) => e.id)).size).toBe(5);
    expect(new Set(examples.map((e) => e.label)).size).toBe(5);
  });

  it('every example evaluates cleanly', () => {
    for (const example of examples) {
      const result = testSelector(example.resources, example.selector, example.mode);
      expect(errors(result), `${example.id}: ${errors(result).join(' | ')}`).toEqual([]);
      expect(result.ok).toBe(true);
      expect(result.resourceCount).toBeGreaterThan(0);
    }
  });

  it('the boot-seeded first example is the label-typo story the E2E suite pins', () => {
    const first = examples[0];
    const result = testSelector(first.resources, first.selector, first.mode);
    expect(result.summary).toBe('3 of 5 resources match');
    expect(allClauses(result).map((c) => c.reason)).toContain('label tier="frontnd" ≠ "frontend"');
  });

  it('the second example shows an absent-key NotIn match (chip 2 is the E2E deep-link chip)', () => {
    const second = examples[1];
    const result = testSelector(second.resources, second.selector, second.mode);
    expect(allClauses(result).some((c) => c.absentKeyMatch)).toBe(true);
  });
});

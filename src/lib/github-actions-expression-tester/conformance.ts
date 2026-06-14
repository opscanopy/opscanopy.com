/**
 * Versioned conformance corpus — the fidelity moat.
 *
 * Every fixture mirrors documented or observed GitHub behaviour and is asserted
 * by engine.test.ts. Changing engine behaviour means adding a fixture here and
 * bumping GHA_SEMANTICS_VERSION; the test IS the spec. The engine echoes this
 * version in every result and the UI shows "Conforms to GitHub Actions
 * semantics: <version>".
 */
import type { Decision, EvalContext, ExprWarning, GhaValue, SimEvent } from './types';

export const GHA_SEMANTICS_VERSION = 'gha-2024.11';

/* ── expression vectors (bare ${{ }} bodies) ───────────────────────────────── */

export interface ExprVector {
  id: string;
  input: string;
  ctx?: EvalContext;
  /** Expected truthiness (the if: decision). */
  truthy?: boolean;
  /** Expected string-substitution rendering. */
  rendered?: string;
  /** Expected exact value (deep-equal) when given. */
  value?: GhaValue;
  /** A warning id that MUST be present. */
  warns?: ExprWarning['id'];
}

export const exprCorpus: ExprVector[] = [
  // Coercion / equality
  { id: 'eq-num-num', input: '1 == 1', truthy: true },
  { id: 'eq-num-strnum', input: "1 == '1'", truthy: true },
  { id: 'eq-str-ci', input: "'TRUE' == 'true'", truthy: true },
  { id: 'eq-str-bool-coerce', input: "'true' == true", truthy: false },
  { id: 'eq-null-zero', input: 'null == 0', truthy: true },
  { id: 'eq-null-empty', input: "null == ''", truthy: true },
  { id: 'eq-empty-zero', input: "'' == 0", truthy: true },
  { id: 'eq-zero-false', input: '0 == false', truthy: true },
  { id: 'eq-abc-ABC', input: "'abc' == 'ABC'", truthy: true },
  { id: 'cmp-nan', input: "'abc' < 1", truthy: false },
  { id: 'eq-nan', input: 'NaN == NaN', truthy: false },

  // Logical operators return operands
  { id: 'or-default', input: "'' || 'def'", rendered: 'def', truthy: true },
  { id: 'and-right', input: "'a' && 'b'", rendered: 'b', truthy: true },
  { id: 'or-both-falsy', input: '0 || false', value: false, truthy: false },
  { id: 'and-empty', input: "'x' && ''", value: '', truthy: false },
  { id: 'not-empty', input: "!''", value: true, truthy: true },
  { id: 'not-false-str', input: "!'false'", value: false, truthy: false },

  // Truthiness
  { id: 'truthy-str-zero', input: "'0'", truthy: true },
  { id: 'falsy-zero', input: '0', truthy: false },
  { id: 'truthy-str-brackets', input: "'[]'", truthy: true },
  { id: 'truthy-empty-array', input: "fromJSON('[]')", truthy: true },

  // Functions
  { id: 'contains-str', input: "contains('Hello world','WORLD')", truthy: true },
  { id: 'contains-arr', input: 'contains(fromJSON(\'["a","b"]\'),\'B\')', truthy: true },
  { id: 'startswith', input: "startsWith('refs/heads/main','refs/heads/')", truthy: true },
  { id: 'endswith', input: "endsWith('main.yml','.yml')", truthy: true },
  { id: 'format', input: "format('{0}-{1}','a','b')", rendered: 'a-b' },
  { id: 'format-escape', input: "format('{{literal}} {0}','x')", rendered: '{literal} x' },
  { id: 'join', input: "join(fromJSON('[1,2,3]'),';')", rendered: '1;2;3' },
  { id: 'tojson', input: 'toJSON(fromJSON(\'{"a":1}\'))', value: '{\n  "a": 1\n}' },
  { id: 'fromjson-bad', input: "fromJSON('nope')", value: null, warns: 'fromjson-parse' },
  { id: 'hashfiles', input: "hashFiles('**/*.lock')", warns: 'hashfiles-stub' },
  { id: 'always', input: 'always()', truthy: true },
  {
    id: 'cancelled',
    input: 'cancelled()',
    ctx: { jobStatus: 'cancelled' },
    truthy: true,
  },

  // Context access
  {
    id: 'ctx-prop',
    input: 'github.event_name',
    ctx: { github: { event_name: 'push' } },
    rendered: 'push',
  },
  {
    id: 'ctx-filter',
    input: 'steps.*.outputs.foo',
    ctx: { steps: { a: { outputs: { foo: '1' } }, b: { outputs: { foo: '2' } } } },
    value: ['1', '2'],
  },
];

/* ── if-condition footgun vectors ──────────────────────────────────────────── */

export interface IfVector {
  id: string;
  input: string;
  footgun: boolean;
}

export const ifCorpus: IfVector[] = [
  { id: 'footgun-outside-op', input: "${{ github.event_name }} == 'push'", footgun: true },
  { id: 'ok-wrapped', input: "${{ github.event_name == 'push' }}", footgun: false },
  { id: 'footgun-bare-literal', input: 'merge me', footgun: true },
  { id: 'ok-bare-true', input: 'true', footgun: false },
  { id: 'ok-success', input: '${{ success() }}', footgun: false },
  // Bare expressions (no ${{ }}) are valid in an if: and must NOT be flagged.
  { id: 'ok-bare-success-fn', input: 'success()', footgun: false },
  { id: 'ok-bare-comparison', input: "github.ref == 'refs/heads/main'", footgun: false },
  // Non-operator literal text outside ${{ }} is still a footgun.
  { id: 'footgun-outside-word', input: '${{ github.actor }} is me', footgun: true },
];

/* ── glob vectors ──────────────────────────────────────────────────────────── */

export interface GlobVector {
  id: string;
  name: string;
  pattern: string;
  match: boolean;
}

export const globCorpus: GlobVector[] = [
  { id: 'star-no-cross', name: 'feature/x', pattern: 'feature/*', match: true },
  { id: 'star-no-cross-2', name: 'feature/x/y', pattern: 'feature/*', match: false },
  { id: 'doublestar-cross', name: 'feature/x/y', pattern: 'feature/**', match: true },
  { id: 'releases', name: 'releases/v1/a', pattern: 'releases/**', match: true },
  { id: 'paths-anything', name: 'src/app/index.ts', pattern: '**', match: true },
  { id: 'branch-plain', name: 'main', pattern: '*', match: true },
  { id: 'tag-glob', name: 'v1.2', pattern: 'v1.*', match: true },
  { id: 'globstar-file-top', name: 'c.js', pattern: '**/*.js', match: true },
  { id: 'globstar-file-nested', name: 'a/b/c.js', pattern: '**/*.js', match: true },
  { id: 'literal-escape', name: 'a*b', pattern: 'a\\*b', match: true },
  // `+` quantifier on a character range, and after a `*` (must not throw).
  { id: 'plus-range', name: 'v12', pattern: 'v[0-9]+', match: true },
  { id: 'plus-range-none', name: 'vx', pattern: 'v[0-9]+', match: false },
  { id: 'plus-after-star', name: 'feature-v1', pattern: 'feature-*+', match: true },
];

/* ── trigger-simulation vectors ────────────────────────────────────────────── */

export interface TriggerVector {
  id: string;
  yaml: string;
  event: SimEvent;
  triggered: boolean;
  /** Optional per-job expected decisions. */
  jobs?: Record<string, Decision>;
}

const Y_PUSH_MAIN = `
on:
  push:
    branches: [main]
jobs:
  build:
    runs-on: ubuntu-latest
    steps: [{ run: make }]
`;

const Y_BRANCH_PATH = `
on:
  push:
    branches: [main]
    paths: ['src/**']
jobs:
  build:
    runs-on: ubuntu-latest
    steps: [{ run: make }]
`;

const Y_PATHS_IGNORE = `
on:
  push:
    paths-ignore: ['docs/**']
jobs:
  build:
    runs-on: ubuntu-latest
    steps: [{ run: make }]
`;

const Y_PR_PATHS = `
on:
  pull_request:
    paths: ['api/**']
jobs:
  test:
    runs-on: ubuntu-latest
    steps: [{ run: test }]
`;

const Y_JOB_IF = `
on: push
jobs:
  deploy:
    runs-on: ubuntu-latest
    if: \${{ github.ref == 'refs/heads/main' }}
    steps: [{ run: deploy }]
`;

export const triggerCorpus: TriggerVector[] = [
  {
    id: 'push-main-match',
    yaml: Y_PUSH_MAIN,
    event: { event: 'push', branch: 'main' },
    triggered: true,
    jobs: { build: 'runs' },
  },
  {
    id: 'push-dev-nomatch',
    yaml: Y_PUSH_MAIN,
    event: { event: 'push', branch: 'dev' },
    triggered: false,
    jobs: { build: 'not-evaluated' },
  },
  {
    id: 'tag-with-branches-only',
    yaml: Y_PUSH_MAIN,
    event: { event: 'push', tag: 'v1.0.0' },
    triggered: false,
  },
  {
    id: 'branch-path-and-fail',
    yaml: Y_BRANCH_PATH,
    event: { event: 'push', branch: 'main', changedFiles: ['docs/x.md'] },
    triggered: false,
  },
  {
    id: 'branch-path-and-pass',
    yaml: Y_BRANCH_PATH,
    event: { event: 'push', branch: 'main', changedFiles: ['src/a.ts'] },
    triggered: true,
    jobs: { build: 'runs' },
  },
  {
    id: 'paths-ignore-only-docs',
    yaml: Y_PATHS_IGNORE,
    event: { event: 'push', branch: 'main', changedFiles: ['docs/a.md', 'docs/b.md'] },
    triggered: false,
  },
  {
    id: 'pr-paths-match',
    yaml: Y_PR_PATHS,
    event: { event: 'pull_request', branch: 'main', changedFiles: ['api/server.ts'] },
    triggered: true,
    jobs: { test: 'runs' },
  },
  {
    id: 'job-if-main-runs',
    yaml: Y_JOB_IF,
    event: { event: 'push', branch: 'main' },
    triggered: true,
    jobs: { deploy: 'runs' },
  },
  {
    id: 'job-if-dev-skips',
    yaml: Y_JOB_IF,
    event: { event: 'push', branch: 'dev' },
    triggered: true,
    jobs: { deploy: 'skipped' },
  },
];

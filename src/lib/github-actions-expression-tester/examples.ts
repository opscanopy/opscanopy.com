/**
 * Bundled, runnable examples for both tabs of the playground.
 *
 * `expressionExamples` feed Tab 1 (the `if:` / expression evaluator);
 * `triggerExamples` feed Tab 2 (the trigger simulator). Each is hand-written to
 * demonstrate a real idiom or footgun and to evaluate cleanly with engine.ts.
 */
import type { SimEvent } from './types';

export interface ExpressionExample {
  id: string;
  label: string;
  /** A full `if:` value (may include ${{ }} and is run through evaluateIfCondition). */
  expression: string;
}

export interface TriggerExample {
  id: string;
  label: string;
  /** A workflow YAML (on: + jobs:). */
  workflow: string;
  /** The event to simulate against it. */
  event: SimEvent;
}

export const expressionExamples: ExpressionExample[] = [
  {
    id: 'footgun',
    label: '⚠ The always-true footgun (runner#1173)',
    expression: "${{ github.event_name }} == 'push'",
  },
  {
    id: 'wrapped',
    label: 'The correct, wrapped form',
    expression: "${{ github.event_name == 'push' }}",
  },
  {
    id: 'branch-guard',
    label: 'Run only on main',
    expression: "${{ github.ref == 'refs/heads/main' }}",
  },
  {
    id: 'default-value',
    label: 'Default value with || ',
    expression: "${{ github.head_ref || github.ref_name }}",
  },
  {
    id: 'contains',
    label: 'Skip when the PR title has [skip ci]',
    expression: "${{ !contains(github.event.pull_request.title, '[skip ci]') }}",
  },
  {
    id: 'always',
    label: 'always() vs success()',
    expression: '${{ always() }}',
  },
];

export const triggerExamples: TriggerExample[] = [
  {
    id: 'push-main',
    label: 'Push to main (branch filter)',
    workflow: `on:
  push:
    branches: [main]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - run: make build
`,
    event: { event: 'push', branch: 'main' },
  },
  {
    id: 'branch-and-path',
    label: 'branches + paths (AND-semantics)',
    workflow: `on:
  push:
    branches: [main]
    paths:
      - 'src/**'
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - run: npm test
`,
    event: { event: 'push', branch: 'main', changedFiles: ['docs/readme.md'] },
  },
  {
    id: 'tag-push',
    label: 'Tag push with only branches set (NOT triggered)',
    workflow: `on:
  push:
    branches: [main]
jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - run: ./release.sh
`,
    event: { event: 'push', tag: 'v1.2.3' },
  },
  {
    id: 'pr-paths',
    label: 'Pull request with paths filter',
    workflow: `on:
  pull_request:
    paths:
      - 'api/**'
jobs:
  api-test:
    runs-on: ubuntu-latest
    steps:
      - run: npm run test:api
`,
    event: { event: 'pull_request', branch: 'main', changedFiles: ['api/server.ts'] },
  },
  {
    id: 'job-if',
    label: 'Per-job if: gate on main',
    workflow: `on: push
jobs:
  deploy:
    runs-on: ubuntu-latest
    if: \${{ github.ref == 'refs/heads/main' }}
    steps:
      - run: ./deploy.sh
`,
    event: { event: 'push', branch: 'feature/x' },
  },
];

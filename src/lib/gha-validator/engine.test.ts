/**
 * GitHub Actions Validator — engine tests.
 *
 * Covers the four confirmed bugs (comment-triggered pwn-request false alarm,
 * collapsed per-step findings, the three structural checks the tool page
 * promises but the engine never implemented) plus happy-path regression cover
 * for the YAML/structural layer and every existing security rule.
 *
 * Workflows are written as line arrays rather than template literals so each
 * assertion about a *line number* is unambiguous — the array index IS the line.
 */

import { describe, expect, it } from 'vitest';
import { validate } from './engine';
import { examples } from './examples';
import type { Finding, ValidateResult } from './types';

/* ── helpers ─────────────────────────────────────────────────────────────── */

const wf = (lines: string[]): string => lines.join('\n') + '\n';

const ids = (r: ValidateResult): string[] => r.findings.map((f) => f.id);

const byId = (r: ValidateResult, id: string): Finding[] =>
  r.findings.filter((f) => f.id === id);

const example = (id: string): string => {
  const ex = examples.find((e) => e.id === id);
  if (!ex) throw new Error(`example "${id}" not found`);
  return ex.yaml;
};

/** A least-privilege header so unrelated permission rules stay quiet. */
const HEAD_READ = ['permissions:', '  contents: read'];

/* ────────────────────────────────────────────────────────────────────────── *
 *  BUG 1 — the pwn-request rule must read the PARSED tree, not raw text.
 * ────────────────────────────────────────────────────────────────────────── */

describe('pull_request_target / pwn request', () => {
  it('does NOT fire when the only PR-head ref is inside a YAML comment', () => {
    const yaml = wf([
      'name: Label PRs', //                                                  1
      'on:', //                                                              2
      '  pull_request_target:', //                                           3
      '    types: [opened]', //                                              4
      ...HEAD_READ, //                                                     5-6
      'jobs:', //                                                            7
      '  label:', //                                                         8
      '    runs-on: ubuntu-latest', //                                       9
      '    steps:', //                                                      10
      '      # NEVER add: ref: ${{ github.event.pull_request.head.sha }}', //11
      '      # that would check out untrusted PR code.', //                 12
      '      - uses: actions/checkout@692973e3d937129bcbf40652eb9f2f61becf3332', // 13
      '      - run: echo "base checkout only"', //                          14
    ]);

    const r = validate(yaml);
    expect(r.ok).toBe(true);
    expect(ids(r)).not.toContain('pull-request-target-checkout');
    // A checkout under pull_request_target is still worth a review warning.
    expect(ids(r)).toContain('pull-request-target-checkout-review');
    expect(r.summary.errors).toBe(0);
  });

  it('fires on a real checkout of the PR head, at the checkout step line', () => {
    const yaml = wf([
      'on:', //                                                              1
      '  pull_request_target:', //                                           2
      ...HEAD_READ, //                                                     3-4
      'jobs:', //                                                            5
      '  build:', //                                                         6
      '    runs-on: ubuntu-latest', //                                       7
      '    steps:', //                                                       8
      '      - uses: actions/checkout@692973e3d937129bcbf40652eb9f2f61becf3332', // 9
      '        with:', //                                                   10
      '          ref: ${{ github.event.pull_request.head.sha }}', //         11
    ]);

    const r = validate(yaml);
    const hits = byId(r, 'pull-request-target-checkout');
    expect(hits).toHaveLength(1);
    expect(hits[0].severity).toBe('error');
    expect(hits[0].line).toBe(9);
    expect(ids(r)).not.toContain('pull-request-target-checkout-review');
  });

  it('fires on `ref: refs/pull/<n>/merge` too', () => {
    const yaml = wf([
      'on: pull_request_target',
      ...HEAD_READ,
      'jobs:',
      '  build:',
      '    runs-on: ubuntu-latest',
      '    steps:',
      '      - uses: actions/checkout@692973e3d937129bcbf40652eb9f2f61becf3332',
      '        with:',
      '          ref: refs/pull/${{ github.event.number }}/merge',
    ]);
    expect(ids(validate(yaml))).toContain('pull-request-target-checkout');
  });

  it('ignores a PR-head `ref:` passed to a NON-checkout action', () => {
    const yaml = wf([
      'on: pull_request_target',
      ...HEAD_READ,
      'jobs:',
      '  build:',
      '    runs-on: ubuntu-latest',
      '    steps:',
      '      - uses: some-vendor/notify@0123456789abcdef0123456789abcdef01234567',
      '        with:',
      '          ref: ${{ github.event.pull_request.head.sha }}',
    ]);
    const r = validate(yaml);
    expect(ids(r)).not.toContain('pull-request-target-checkout');
    // No actions/checkout at all → not even the review warning.
    expect(ids(r)).not.toContain('pull-request-target-checkout-review');
  });

  it('stays silent when the workflow is not pull_request_target', () => {
    const yaml = wf([
      'on: push',
      ...HEAD_READ,
      'jobs:',
      '  build:',
      '    runs-on: ubuntu-latest',
      '    steps:',
      '      - uses: actions/checkout@692973e3d937129bcbf40652eb9f2f61becf3332',
      '        with:',
      '          ref: ${{ github.event.pull_request.head.sha }}',
    ]);
    const r = validate(yaml);
    expect(ids(r)).not.toContain('pull-request-target-checkout');
    expect(ids(r)).not.toContain('pull-request-target-checkout-review');
  });
});

/* ────────────────────────────────────────────────────────────────────────── *
 *  BUG 2 — one finding PER broken step, at that step's own source line.
 * ────────────────────────────────────────────────────────────────────────── */

describe('per-step findings', () => {
  it('reports every action-less step separately, at its own line', () => {
    const yaml = wf([
      'on: push', //                     1
      'permissions:', //                 2
      '  contents: read', //             3
      'jobs:', //                        4
      '  build:', //                     5
      '    runs-on: ubuntu-latest', //   6
      '    steps:', //                   7
      '      - name: alpha', //          8
      '      - name: beta', //           9
      '      - name: gamma', //         10
    ]);

    const r = validate(yaml);
    const hits = byId(r, 'step-missing-action');
    expect(hits).toHaveLength(3);
    expect(hits.map((f) => f.line)).toEqual([8, 9, 10]);
    expect(hits.map((f) => f.severity)).toEqual(['error', 'error', 'error']);
    expect(r.summary.errors).toBe(3);
  });

  it('resolves step lines across two jobs independently', () => {
    const yaml = wf([
      'on: push', //                     1
      'permissions:', //                 2
      '  contents: read', //             3
      'jobs:', //                        4
      '  one:', //                       5
      '    runs-on: ubuntu-latest', //   6
      '    steps:', //                   7
      '      - name: a', //              8
      '  two:', //                       9
      '    runs-on: ubuntu-latest', //  10
      '    steps:', //                  11
      '      - name: b', //             12
      '      - name: c', //             13
    ]);

    const hits = byId(validate(yaml), 'step-missing-action');
    expect(hits.map((f) => f.line)).toEqual([8, 12, 13]);
  });

  it('handles sequence items indented level with `steps:`', () => {
    const yaml = wf([
      'on: push', //                     1
      'permissions:', //                 2
      '  contents: read', //             3
      'jobs:', //                        4
      '  build:', //                     5
      '    runs-on: ubuntu-latest', //   6
      '    steps:', //                   7
      '    - name: alpha', //            8
      '    - name: beta', //             9
      '    timeout-minutes: 5', //      10  (sibling key — NOT a step)
    ]);

    const hits = byId(validate(yaml), 'step-missing-action');
    expect(hits.map((f) => f.line)).toEqual([8, 9]);
  });
});

/* ────────────────────────────────────────────────────────────────────────── *
 *  BUG 3 — structural checks the tool page already promises.
 * ────────────────────────────────────────────────────────────────────────── */

describe('structural checks promised by the page FAQ', () => {
  it('(a) flags a step declaring BOTH `uses:` and `run:`', () => {
    const yaml = wf([
      'on: push', //                                                          1
      'permissions:', //                                                      2
      '  contents: read', //                                                  3
      'jobs:', //                                                             4
      '  build:', //                                                          5
      '    runs-on: ubuntu-latest', //                                        6
      '    steps:', //                                                        7
      '      - name: both', //                                                8
      '        uses: actions/checkout@692973e3d937129bcbf40652eb9f2f61becf3332', // 9
      '        run: echo hi', //                                             10
    ]);

    const r = validate(yaml);
    const hits = byId(r, 'step-uses-and-run');
    expect(hits).toHaveLength(1);
    expect(hits[0].severity).toBe('error');
    expect(hits[0].line).toBe(8);
    expect(r.summary.errors).toBe(1);
  });

  it('(b) flags `needs:` pointing at a job that does not exist', () => {
    const yaml = wf([
      'on: push', //                     1
      'permissions:', //                 2
      '  contents: read', //             3
      'jobs:', //                        4
      '  build:', //                     5
      '    runs-on: ubuntu-latest', //   6
      '    needs: [does-not-exist]', //  7
      '    steps:', //                   8
      '      - run: echo hi', //         9
    ]);

    const r = validate(yaml);
    const hits = byId(r, 'job-needs-unknown');
    expect(hits).toHaveLength(1);
    expect(hits[0].severity).toBe('error');
    expect(hits[0].line).toBe(7);
    expect(hits[0].title).toContain('does-not-exist');
    expect(r.summary.errors).toBe(1);
  });

  it('(b) accepts a `needs:` string or list that resolves', () => {
    const yaml = wf([
      'on: push',
      ...HEAD_READ,
      'jobs:',
      '  lint:',
      '    runs-on: ubuntu-latest',
      '    steps:',
      '      - run: echo lint',
      '  test:',
      '    runs-on: ubuntu-latest',
      '    needs: lint',
      '    steps:',
      '      - run: echo test',
      '  ship:',
      '    runs-on: ubuntu-latest',
      '    needs: [lint, test]',
      '    steps:',
      '      - run: echo ship',
    ]);
    expect(validate(yaml).findings).toHaveLength(0);
  });

  it('(c) flags a misspelled trigger name', () => {
    const yaml = wf([
      'on: pusssh', //                   1
      'permissions:', //                 2
      '  contents: read', //             3
      'jobs:', //                        4
      '  build:', //                     5
      '    runs-on: ubuntu-latest', //   6
      '    steps:', //                   7
      '      - run: echo hi', //         8
    ]);

    const r = validate(yaml);
    const hits = byId(r, 'unknown-trigger');
    expect(hits).toHaveLength(1);
    expect(hits[0].severity).toBe('error');
    expect(hits[0].line).toBe(1);
    expect(hits[0].title).toContain('pusssh');
    expect(r.summary.errors).toBe(1);
  });

  it('(c) accepts every documented trigger form (string, list, mapping)', () => {
    expect(byId(validate(wf(['on: push', ...HEAD_READ, 'jobs:', '  b:', '    runs-on: x', '    steps:', '      - run: y'])), 'unknown-trigger')).toHaveLength(0);
    expect(byId(validate(wf(['on: [push, workflow_dispatch, merge_group]', ...HEAD_READ, 'jobs:', '  b:', '    runs-on: x', '    steps:', '      - run: y'])), 'unknown-trigger')).toHaveLength(0);
    expect(byId(validate(wf(['on:', '  schedule:', "    - cron: '0 0 * * *'", '  workflow_call:', ...HEAD_READ, 'jobs:', '  b:', '    runs-on: x', '    steps:', '      - run: y'])), 'unknown-trigger')).toHaveLength(0);
  });

  it('(d) flags a `uses:` step with an empty value', () => {
    const yaml = wf([
      'on: push', //                     1
      'permissions:', //                 2
      '  contents: read', //             3
      'jobs:', //                        4
      '  build:', //                     5
      '    runs-on: ubuntu-latest', //   6
      '    steps:', //                   7
      '      - name: nothing', //        8
      '        uses:', //                9
    ]);

    const r = validate(yaml);
    const hits = byId(r, 'step-empty-uses');
    expect(hits).toHaveLength(1);
    expect(hits[0].severity).toBe('error');
    expect(hits[0].line).toBe(8);
    // Must NOT double-report as a generic "no uses and no run".
    expect(ids(r)).not.toContain('step-missing-action');
    expect(r.summary.errors).toBe(1);
  });
});

/* ────────────────────────────────────────────────────────────────────────── *
 *  Happy path + parse failures.
 * ────────────────────────────────────────────────────────────────────────── */

describe('parse + input handling', () => {
  it('refuses empty input without throwing', () => {
    const r = validate('   \n  ');
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/Paste a GitHub Actions workflow/i);
    expect(r.findings).toHaveLength(0);
    expect(r.summary).toEqual({ errors: 0, warnings: 0, infos: 0 });
  });

  it('reports a YAML syntax error with a line reference', () => {
    const r = validate(wf(['on: push', 'jobs:', '  build:', '   bad: [1, 2', '  other: }']));
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/Could not parse YAML/i);
    expect(r.findings).toHaveLength(0);
  });

  it('rejects a document that is not a mapping', () => {
    const r = validate('- just\n- a\n- list\n');
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/not a YAML mapping/i);
  });

  it('never throws on hostile input', () => {
    for (const bad of ['%YAML 1.2\n---\n@', '\t\t\t', '{}', 'on:\njobs:', 'null']) {
      expect(() => validate(bad)).not.toThrow();
    }
    // Contract is `string`, but a runtime non-string must not blow up either.
    expect(() => validate(undefined as unknown as string)).not.toThrow();
  });

  it('flags a workflow with no `on:` and no `jobs:`', () => {
    const r = validate('name: nothing\n');
    expect(ids(r)).toContain('missing-on');
    expect(ids(r)).toContain('missing-jobs');
  });

  it('flags a job with neither `runs-on` nor `uses`', () => {
    const yaml = wf(['on: push', ...HEAD_READ, 'jobs:', '  build:', '    steps:', '      - run: echo hi']);
    expect(ids(validate(yaml))).toContain('job-missing-runs-on');
  });

  it('accepts a reusable-workflow job with `uses:` and no steps', () => {
    const yaml = wf([
      'on: push',
      ...HEAD_READ,
      'jobs:',
      '  call:',
      '    uses: ./.github/workflows/reusable.yml',
    ]);
    expect(validate(yaml).findings).toHaveLength(0);
  });
});

/* ────────────────────────────────────────────────────────────────────────── *
 *  Existing security rules must keep firing.
 * ────────────────────────────────────────────────────────────────────────── */

describe('security rules', () => {
  it('finds nothing in the bundled secure example', () => {
    const r = validate(example('secure'));
    expect(r.ok).toBe(true);
    expect(r.findings).toEqual([]);
    expect(r.summary).toEqual({ errors: 0, warnings: 0, infos: 0 });
  });

  it('catches every rule the bundled vulnerable example is built to trip', () => {
    const r = validate(example('vulnerable'));
    expect(r.ok).toBe(true);
    expect(ids(r)).toEqual(
      expect.arrayContaining([
        'pull-request-target-checkout',
        'script-injection',
        'unpinned-action',
        'permissions-write-all',
        'secrets-in-pull-request',
      ]),
    );
  });

  it('catches the subtle example’s warnings', () => {
    const r = validate(example('subtle'));
    expect(ids(r)).toEqual(
      expect.arrayContaining(['unpinned-action', 'pipe-to-shell', 'permissions-missing']),
    );
  });

  it('flags untrusted context inside a `run:` block scalar only', () => {
    const yaml = wf([
      'on: pull_request', //                                                 1
      ...HEAD_READ, //                                                     2-3
      'jobs:', //                                                            4
      '  greet:', //                                                         5
      '    runs-on: ubuntu-latest', //                                       6
      '    steps:', //                                                       7
      '      - run: |', //                                                   8
      '          echo "${{ github.event.pull_request.title }}"', //          9
    ]);
    const hits = byId(validate(yaml), 'script-injection');
    expect(hits).toHaveLength(1);
    expect(hits[0].line).toBe(9);
    expect(hits[0].severity).toBe('warning');
  });

  it('does not treat an untrusted context in `with:` as shell injection', () => {
    const yaml = wf([
      'on: pull_request',
      ...HEAD_READ,
      'jobs:',
      '  b:',
      '    runs-on: ubuntu-latest',
      '    steps:',
      '      - uses: some/act@0123456789abcdef0123456789abcdef01234567',
      '        with:',
      '          title: ${{ github.event.pull_request.title }}',
    ]);
    expect(ids(validate(yaml))).not.toContain('script-injection');
  });

  it('grades first-party unpinned actions as info and third-party as warning', () => {
    const yaml = wf([
      'on: push',
      ...HEAD_READ,
      'jobs:',
      '  b:',
      '    runs-on: ubuntu-latest',
      '    steps:',
      '      - uses: actions/checkout@v4',
      '      - uses: some-vendor/deploy@main',
    ]);
    const r = validate(yaml);
    expect(byId(r, 'unpinned-first-party-action')[0]?.severity).toBe('info');
    expect(byId(r, 'unpinned-action')[0]?.severity).toBe('warning');
  });

  it('flags a job-level `permissions: write-all`', () => {
    const yaml = wf([
      'on: push',
      ...HEAD_READ,
      'jobs:',
      '  b:',
      '    runs-on: ubuntu-latest',
      '    permissions: write-all',
      '    steps:',
      '      - run: echo hi',
    ]);
    expect(ids(validate(yaml))).toContain('job-permissions-write-all');
  });

  it('flags `curl … | bash`', () => {
    const yaml = wf([
      'on: push',
      ...HEAD_READ,
      'jobs:',
      '  b:',
      '    runs-on: ubuntu-latest',
      '    steps:',
      '      - run: curl -sSfL https://example.com/i.sh | sudo bash',
    ]);
    expect(ids(validate(yaml))).toContain('pipe-to-shell');
  });
});

/* ────────────────────────────────────────────────────────────────────────── *
 *  needs: cycles — GitHub rejects the whole file, so nothing runs at all.
 * ────────────────────────────────────────────────────────────────────────── */

describe('job-needs-cycle', () => {
  it('flags a two-job cycle as an error naming the path', () => {
    const r = validate(
      wf([
        ...HEAD_READ,
        'on: push',
        'jobs:',
        '  a:',
        '    needs: b',
        '    runs-on: ubuntu-latest',
        '    steps:',
        '      - run: echo a',
        '  b:',
        '    needs: a',
        '    runs-on: ubuntu-latest',
        '    steps:',
        '      - run: echo b',
      ]),
    );
    const f = byId(r, 'job-needs-cycle');
    expect(f).toHaveLength(1);
    expect(f[0].severity).toBe('error');
    expect(f[0].title).toMatch(/a → b → a|b → a → b/);
  });

  it('flags a self-loop', () => {
    const r = validate(
      wf([
        ...HEAD_READ,
        'on: push',
        'jobs:',
        '  a:',
        '    needs: a',
        '    runs-on: ubuntu-latest',
        '    steps:',
        '      - run: echo a',
      ]),
    );
    expect(ids(r)).toContain('job-needs-cycle');
  });

  it('flags a three-job cycle exactly once, not once per member', () => {
    const r = validate(
      wf([
        ...HEAD_READ,
        'on: push',
        'jobs:',
        '  a:',
        '    needs: c',
        '    runs-on: ubuntu-latest',
        '    steps: [{run: echo a}]',
        '  b:',
        '    needs: a',
        '    runs-on: ubuntu-latest',
        '    steps: [{run: echo b}]',
        '  c:',
        '    needs: b',
        '    runs-on: ubuntu-latest',
        '    steps: [{run: echo c}]',
      ]),
    );
    expect(byId(r, 'job-needs-cycle')).toHaveLength(1);
  });

  it('does NOT flag a diamond — shared dependencies are not a cycle', () => {
    const r = validate(
      wf([
        ...HEAD_READ,
        'on: push',
        'jobs:',
        '  a:',
        '    runs-on: ubuntu-latest',
        '    steps: [{run: echo a}]',
        '  b:',
        '    needs: a',
        '    runs-on: ubuntu-latest',
        '    steps: [{run: echo b}]',
        '  c:',
        '    needs: a',
        '    runs-on: ubuntu-latest',
        '    steps: [{run: echo c}]',
        '  d:',
        '    needs: [b, c]',
        '    runs-on: ubuntu-latest',
        '    steps: [{run: echo d}]',
      ]),
    );
    expect(ids(r)).not.toContain('job-needs-cycle');
  });

  it('does not double-report when a dep is also unknown', () => {
    // job-needs-unknown already covers the missing id; the cycle walk must
    // ignore edges to jobs that do not exist rather than inventing a second
    // finding about the same typo.
    const r = validate(
      wf([
        ...HEAD_READ,
        'on: push',
        'jobs:',
        '  a:',
        '    needs: nope',
        '    runs-on: ubuntu-latest',
        '    steps: [{run: echo a}]',
      ]),
    );
    expect(ids(r)).toContain('job-needs-unknown');
    expect(ids(r)).not.toContain('job-needs-cycle');
  });
});

/* ────────────────────────────────────────────────────────────────────────── *
 *  Reusable-workflow jobs — previously skipped entirely (`if (isReusable)
 *  return;`), including the secrets: inherit × pull_request_target exfil path.
 * ────────────────────────────────────────────────────────────────────────── */

describe('reusable-workflow jobs', () => {
  const SHA = '8f4b7f84864484a7bf31766abe9204da3cbe65b3';

  it('flags a mutable ref on the called workflow', () => {
    const r = validate(
      wf([...HEAD_READ, 'on: push', 'jobs:', '  deploy:', '    uses: org/repo/.github/workflows/deploy.yml@main']),
    );
    const f = byId(r, 'reusable-unpinned-ref');
    expect(f).toHaveLength(1);
    expect(f[0].severity).toBe('warning');
    expect(f[0].title).toContain('@main');
  });

  it('accepts a SHA-pinned ref and a same-repo local path', () => {
    for (const uses of [`org/repo/.github/workflows/deploy.yml@${SHA}`, './.github/workflows/deploy.yml']) {
      const r = validate(wf([...HEAD_READ, 'on: push', 'jobs:', '  deploy:', `    uses: ${uses}`]));
      expect(ids(r), uses).not.toContain('reusable-unpinned-ref');
    }
  });

  it('treats secrets: inherit under pull_request_target as an error', () => {
    const r = validate(
      wf([
        ...HEAD_READ,
        'on: pull_request_target',
        'jobs:',
        '  ci:',
        `    uses: org/repo/.github/workflows/ci.yml@${SHA}`,
        '    secrets: inherit',
      ]),
    );
    const f = byId(r, 'reusable-secrets-inherit-prt');
    expect(f).toHaveLength(1);
    expect(f[0].severity).toBe('error');
  });

  it('treats secrets: inherit under a normal trigger as a milder nudge', () => {
    const r = validate(
      wf([
        ...HEAD_READ,
        'on: push',
        'jobs:',
        '  ci:',
        `    uses: org/repo/.github/workflows/ci.yml@${SHA}`,
        '    secrets: inherit',
      ]),
    );
    expect(ids(r)).not.toContain('reusable-secrets-inherit-prt');
    const f = byId(r, 'reusable-secrets-inherit');
    expect(f).toHaveLength(1);
    expect(f[0].severity).toBe('info');
  });

  it('rejects a malformed with:/secrets: shape', () => {
    const r = validate(
      wf([...HEAD_READ, 'on: push', 'jobs:', '  ci:', `    uses: org/repo/.github/workflows/ci.yml@${SHA}`, '    with: [not, a, map]']),
    );
    expect(ids(r)).toContain('reusable-with-shape');
  });

  it('rejects keys GitHub forbids on a reusable-call job', () => {
    const r = validate(
      wf([
        ...HEAD_READ,
        'on: push',
        'jobs:',
        '  ci:',
        `    uses: org/repo/.github/workflows/ci.yml@${SHA}`,
        '    steps:',
        '      - run: echo nope',
      ]),
    );
    const f = byId(r, 'reusable-forbidden-keys');
    expect(f).toHaveLength(1);
    expect(f[0].title).toContain('steps');
  });

  it('allows the keys GitHub does permit alongside uses:', () => {
    const r = validate(
      wf([
        ...HEAD_READ,
        'on: push',
        'jobs:',
        '  first:',
        '    runs-on: ubuntu-latest',
        '    steps: [{run: echo hi}]',
        '  ci:',
        `    uses: org/repo/.github/workflows/ci.yml@${SHA}`,
        '    needs: first',
        '    if: success()',
        '    permissions:',
        '      contents: read',
      ]),
    );
    expect(ids(r)).not.toContain('reusable-forbidden-keys');
  });

  it('still applies the cycle check to reusable-call jobs', () => {
    const r = validate(
      wf([
        ...HEAD_READ,
        'on: push',
        'jobs:',
        '  a:',
        `    uses: org/repo/.github/workflows/a.yml@${SHA}`,
        '    needs: b',
        '  b:',
        `    uses: org/repo/.github/workflows/b.yml@${SHA}`,
        '    needs: a',
      ]),
    );
    expect(ids(r)).toContain('job-needs-cycle');
  });
});

/* ────────────────────────────────────────────────────────────────────────── *
 *  strategy.matrix — the most common workflow shape on a real CI fleet, and
 *  the engine had no opinion about it whatsoever.
 * ────────────────────────────────────────────────────────────────────────── */

describe('strategy.matrix', () => {
  const job = (body: string[]): string =>
    wf([...HEAD_READ, 'on: push', 'jobs:', '  test:', '    runs-on: ubuntu-latest', ...body]);

  it('flags a matrix var referenced but never declared', () => {
    const r = validate(
      job([
        '    strategy:',
        '      matrix:',
        '        node: [20, 22]',
        '    steps:',
        '      - run: echo "${{ matrix.node }} on ${{ matrix.os }}"',
      ]),
    );
    const f = byId(r, 'matrix-var-undeclared');
    expect(f).toHaveLength(1);
    expect(f[0].severity).toBe('warning');
    expect(f[0].title).toContain('matrix.os');
  });

  it('counts vars contributed by include:', () => {
    const r = validate(
      job([
        '    strategy:',
        '      matrix:',
        '        node: [20]',
        '        include:',
        '          - node: 20',
        '            experimental: true',
        '    steps:',
        '      - run: echo "${{ matrix.experimental }}"',
      ]),
    );
    expect(ids(r)).not.toContain('matrix-var-undeclared');
  });

  it('does not flag runs-on referencing a declared var', () => {
    const r = wf([
      ...HEAD_READ,
      'on: push',
      'jobs:',
      '  test:',
      '    runs-on: ${{ matrix.os }}',
      '    strategy:',
      '      matrix:',
      '        os: [ubuntu-latest, macos-latest]',
      '    steps:',
      '      - run: echo hi',
    ]);
    expect(ids(validate(r))).not.toContain('matrix-var-undeclared');
  });

  it('rejects include/exclude that are not lists of maps', () => {
    const r = validate(
      job(['    strategy:', '      matrix:', '        node: [20]', '        exclude:', '          node: 20', '    steps: [{run: echo hi}]']),
    );
    expect(ids(r)).toContain('matrix-include-exclude-shape');
  });

  it('rejects a non-boolean fail-fast and a non-integer max-parallel', () => {
    const r = validate(
      job([
        '    strategy:',
        '      fail-fast: "yes"',
        '      max-parallel: two',
        '      matrix:',
        '        node: [20]',
        '    steps: [{run: echo hi}]',
      ]),
    );
    expect(ids(r)).toContain('strategy-fail-fast-type');
    expect(ids(r)).toContain('strategy-max-parallel-type');
  });

  it('accepts a real boolean fail-fast and integer max-parallel', () => {
    const r = validate(
      job([
        '    strategy:',
        '      fail-fast: false',
        '      max-parallel: 2',
        '      matrix:',
        '        node: [20]',
        '    steps: [{run: echo hi}]',
      ]),
    );
    expect(ids(r)).not.toContain('strategy-fail-fast-type');
    expect(ids(r)).not.toContain('strategy-max-parallel-type');
  });

  it('flags an empty matrix', () => {
    const r = validate(job(['    strategy:', '      matrix: {}', '    steps: [{run: echo hi}]']));
    expect(ids(r)).toContain('matrix-empty');
  });

  it('reports a fromJSON matrix as unverifiable rather than guessing', () => {
    const r = validate(
      wf([
        ...HEAD_READ,
        'on: push',
        'jobs:',
        '  plan:',
        '    runs-on: ubuntu-latest',
        '    steps: [{run: echo plan}]',
        '  test:',
        '    needs: plan',
        '    runs-on: ubuntu-latest',
        '    strategy:',
        '      matrix: ${{ fromJSON(needs.plan.outputs.matrix) }}',
        '    steps:',
        '      - run: echo "${{ matrix.anything }}"',
      ]),
    );
    expect(ids(r)).toContain('matrix-dynamic-unchecked');
    expect(ids(r)).not.toContain('matrix-var-undeclared');
  });

  it('says nothing about a job with no strategy at all', () => {
    const r = validate(job(['    steps: [{run: echo hi}]']));
    expect(ids(r).filter((i) => i.startsWith('matrix-') || i.startsWith('strategy-'))).toEqual([]);
  });
});

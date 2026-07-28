/**
 * GitHub Actions Expression & Trigger Tester — engine tests.
 *
 * Runs the versioned conformance corpus (conformance.ts) plus targeted unit
 * vectors. The corpus IS the spec: a behaviour change means a corpus change.
 */
import { describe, it, expect } from 'vitest';
import {
  evaluateExpression,
  evaluateIfCondition,
  simulateTriggers,
  testGlob,
  defaultContext,
  GHA_SEMANTICS_VERSION,
} from './engine';
import { exprCorpus, ifCorpus, globCorpus, triggerCorpus } from './conformance';

describe('expression corpus', () => {
  for (const v of exprCorpus) {
    it(`${v.id}: ${v.input}`, () => {
      const res = evaluateExpression(v.input, v.ctx ?? defaultContext());
      if (v.truthy !== undefined) expect(res.truthy).toBe(v.truthy);
      if (v.rendered !== undefined) expect(res.rendered).toBe(v.rendered);
      if (v.value !== undefined) expect(res.value).toEqual(v.value);
      if (v.warns) expect(res.warnings.some((w) => w.id === v.warns)).toBe(true);
      expect(res.semanticsVersion).toBe(GHA_SEMANTICS_VERSION);
    });
  }
});

describe('if-condition footgun corpus (runner#1173)', () => {
  for (const v of ifCorpus) {
    it(`${v.id}: ${v.input}`, () => {
      const res = evaluateIfCondition(v.input);
      const hasFootgun = res.warnings.some((w) => w.id === 'literal-if-always-true');
      expect(hasFootgun).toBe(v.footgun);
      // The verdict must agree with the warning — see IfVector.truthy.
      if (v.truthy !== undefined) expect(res.truthy).toBe(v.truthy);
      if (v.rendered !== undefined) expect(res.rendered).toBe(v.rendered);

      // Shape contract. The playground reads result.breakdown.length and
      // result.warnings.map OUTSIDE its try/catch, so a missing field is not a
      // wrong value — it is an uncaught TypeError and a blank results panel.
      // A footgun branch that returned `parts` instead of `breakdown` shipped
      // green because every assertion above only read fields that existed.
      expect(Array.isArray(res.breakdown)).toBe(true);
      expect(Array.isArray(res.warnings)).toBe(true);
      expect(typeof res.rendered).toBe('string');
      expect(typeof res.truthy).toBe('boolean');
      expect(typeof res.explanation).toBe('string');
      expect(res.semanticsVersion).toBe(GHA_SEMANTICS_VERSION);
    });
  }
});

describe('glob corpus', () => {
  for (const v of globCorpus) {
    it(`${v.id}: "${v.name}" ~ "${v.pattern}"`, () => {
      expect(testGlob(v.name, v.pattern).matched).toBe(v.match);
    });
  }
});

describe('trigger corpus', () => {
  for (const v of triggerCorpus) {
    it(`${v.id}`, () => {
      const res = simulateTriggers(v.yaml, v.event);
      expect(res.workflowTriggered).toBe(v.triggered);
      if (v.jobs) {
        for (const [jobId, decision] of Object.entries(v.jobs)) {
          const job = res.jobs.find((j) => j.jobId === jobId);
          expect(job, `job ${jobId} present`).toBeDefined();
          expect(job?.decision).toBe(decision);
        }
      }
    });
  }
});

describe('trigger simulator regressions', () => {
  const TAGS_ONLY = "on:\n  push:\n    tags:\n      - 'v*'\njobs:\n  build:\n    runs-on: ubuntu-latest\n";
  const BRANCHES_ONLY = 'on:\n  push:\n    branches: [main]\njobs:\n  build:\n    runs-on: ubuntu-latest\n';

  it('a branch push does not trigger a tags-only workflow, and says why', () => {
    const res = simulateTriggers(TAGS_ONLY, { event: 'push', branch: 'main' });
    expect(res.workflowTriggered).toBe(false);
    // The old bug reported "no filters, so it always runs" — the exact opposite.
    expect(res.workflowReason).not.toMatch(/no filters/i);
    expect(res.jobs[0]?.trace.some((t) => /tags but not branches/i.test(t.reason))).toBe(true);
  });

  it('mirror: a tag push does not trigger a branches-only workflow', () => {
    const res = simulateTriggers(BRANCHES_ONLY, { event: 'push', tag: 'v1.0.0' });
    expect(res.workflowTriggered).toBe(false);
    expect(res.jobs[0]?.trace.some((t) => /branches but not tags/i.test(t.reason))).toBe(true);
  });

  it('pull_request puts github.ref on the merge ref and keeps base_ref', () => {
    const yaml =
      'on: pull_request\njobs:\n' +
      "  a:\n    if: github.ref == 'refs/pull/42/merge'\n    runs-on: ubuntu-latest\n" +
      "  b:\n    if: github.ref_name == '42/merge'\n    runs-on: ubuntu-latest\n" +
      "  c:\n    if: github.base_ref == 'release'\n    runs-on: ubuntu-latest\n";
    const res = simulateTriggers(yaml, { event: 'pull_request', branch: 'release' });
    expect(res.jobs.find((j) => j.jobId === 'a')?.decision).toBe('runs');
    expect(res.jobs.find((j) => j.jobId === 'b')?.decision).toBe('runs');
    expect(res.jobs.find((j) => j.jobId === 'c')?.decision).toBe('runs');
  });

  it('the PR number is configurable and defaults to 42', () => {
    const yaml =
      "on: pull_request\njobs:\n  a:\n    if: github.ref == 'refs/pull/7/merge'\n    runs-on: ubuntu-latest\n";
    expect(
      simulateTriggers(yaml, { event: 'pull_request', branch: 'main', prNumber: 7 }).jobs[0]?.decision,
    ).toBe('runs');
    expect(simulateTriggers(yaml, { event: 'pull_request', branch: 'main' }).jobs[0]?.decision).toBe('skipped');
  });

  it('an if: reading an unmodelled context is unknown, not a confident false', () => {
    const yaml =
      "on: push\njobs:\n  gate:\n    if: vars.ENVIRONMENT == 'prod'\n    runs-on: ubuntu-latest\n" +
      "  s:\n    if: secrets.TOKEN != ''\n    runs-on: ubuntu-latest\n" +
      "  i:\n    if: inputs.mode == 'x'\n    runs-on: ubuntu-latest\n";
    const res = simulateTriggers(yaml, { event: 'push', branch: 'main' });
    for (const id of ['gate', 's', 'i']) {
      const job = res.jobs.find((j) => j.jobId === id);
      expect(job?.decision, id).toBe('unknown');
      expect(job?.reason, id).toMatch(/not modelled/i);
    }
    expect(res.warnings.some((w) => w.id === 'unmodelled-context')).toBe(true);
  });

  it('needs.<id>.result is derived from the decision computed for that job', () => {
    const yaml =
      'on: push\njobs:\n  build:\n    if: false\n    runs-on: ubuntu-latest\n' +
      "  deploy:\n    needs: [build]\n    if: \"${{ needs.build.result == 'success' }}\"\n    runs-on: ubuntu-latest\n";
    const res = simulateTriggers(yaml, { event: 'push', branch: 'main' });
    expect(res.jobs.find((j) => j.jobId === 'build')?.decision).toBe('skipped');
    expect(res.jobs.find((j) => j.jobId === 'deploy')?.decision).toBe('skipped');
  });

  it('needs.<id>.outputs is not modelled, so it stays unknown', () => {
    const yaml =
      'on: push\njobs:\n  build:\n    runs-on: ubuntu-latest\n' +
      "  deploy:\n    needs: [build]\n    if: needs.build.outputs.ready == 'yes'\n    runs-on: ubuntu-latest\n";
    const res = simulateTriggers(yaml, { event: 'push', branch: 'main' });
    expect(res.jobs.find((j) => j.jobId === 'deploy')?.decision).toBe('unknown');
  });

  it('a job needing an unknown job is itself unknown', () => {
    const yaml =
      "on: push\njobs:\n  gate:\n    if: vars.X == 'y'\n    runs-on: ubuntu-latest\n" +
      '  after:\n    needs: [gate]\n    runs-on: ubuntu-latest\n';
    const res = simulateTriggers(yaml, { event: 'push', branch: 'main' });
    expect(res.jobs.find((j) => j.jobId === 'after')?.decision).toBe('unknown');
  });

  it('jobs come back in declaration order even when needs reorder evaluation', () => {
    const yaml =
      'on: push\njobs:\n  z:\n    needs: [a]\n    runs-on: ubuntu-latest\n  a:\n    runs-on: ubuntu-latest\n';
    const res = simulateTriggers(yaml, { event: 'push', branch: 'main' });
    expect(res.jobs.map((j) => j.jobId)).toEqual(['z', 'a']);
  });
});

describe('targeted units', () => {
  it('&& returns the right operand (not a boolean)', () => {
    expect(evaluateExpression("'a' && 'b'").value).toBe('b');
  });
  it('|| returns the default value', () => {
    expect(evaluateExpression("'' || 'fallback'").value).toBe('fallback');
  });
  it('null renders to an empty string', () => {
    expect(evaluateExpression('github.nope', { github: {} }).rendered).toBe('');
  });
  it('object filter maps over array of step outputs', () => {
    const ctx = { steps: { a: { outputs: { id: '1' } }, b: { outputs: { id: '2' } } } };
    expect(evaluateExpression('steps.*.outputs.id', ctx).value).toEqual(['1', '2']);
  });
  it('matchList honours ! ordering (later exclusion wins)', () => {
    expect(testGlob('main', '!main').matched).toBe(false);
  });
  it('never throws on garbage input', () => {
    expect(() => evaluateExpression('=== &&& ((( ')).not.toThrow();
    expect(() => simulateTriggers(': : not yaml : :', { event: 'push', branch: 'x' })).not.toThrow();
  });
  it('a workflow that does not list the event does not trigger', () => {
    const res = simulateTriggers('on: pull_request\njobs:\n  a:\n    steps: []\n', {
      event: 'push',
      branch: 'main',
    });
    expect(res.workflowTriggered).toBe(false);
  });
});

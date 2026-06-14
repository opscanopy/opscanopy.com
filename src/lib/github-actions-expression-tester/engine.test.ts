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

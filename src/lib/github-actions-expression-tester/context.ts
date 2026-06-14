/**
 * Default mock evaluation context + user-context parsing.
 *
 * The full `github.event` payload and live secrets/vars cannot be fetched in the
 * browser, so the playground ships an EDITABLE mock tree that mirrors the shape
 * GitHub injects. Users populate the fields their expression reads; nothing is
 * fetched from any server.
 */
import type { EvalContext, GhaObject } from './types';
import { isGhaObject } from './values';

/** A realistic, editable default context for a push to `main`. */
export function defaultContext(): EvalContext {
  return {
    github: {
      event_name: 'push',
      ref: 'refs/heads/main',
      ref_name: 'main',
      ref_type: 'branch',
      base_ref: '',
      head_ref: '',
      sha: 'd6cd1e2bd19e03a81132a23b2025920577f84e37',
      actor: 'octocat',
      repository: 'octo-org/octo-repo',
      repository_owner: 'octo-org',
      run_id: '1658821493',
      run_number: '3',
      workflow: 'CI',
      event: {
        ref: 'refs/heads/main',
        head_commit: { message: 'Update README' },
        pull_request: { title: 'Add feature', draft: false, labels: [] },
      },
    },
    env: {
      NODE_ENV: 'production',
    },
    job: {
      status: 'success',
    },
    runner: {
      os: 'Linux',
      arch: 'X64',
    },
    steps: {
      build: { outputs: { artifact: 'app.tar.gz' }, outcome: 'success', conclusion: 'success' },
    },
    needs: {},
    matrix: { node: '20' },
    strategy: { 'job-index': 0, 'job-total': 1 },
    inputs: {},
    vars: { ENVIRONMENT: 'prod' },
    secrets: { GITHUB_TOKEN: '***' },
    jobStatus: 'success',
    stepConclusions: ['success'],
  };
}

/** Parse a user-edited JSON context string into an EvalContext. Never throws. */
export function parseContext(json: string): { ctx: EvalContext; error?: string } {
  const trimmed = json.trim();
  if (trimmed === '') return { ctx: defaultContext() };
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (!isGhaObject(parsed as never)) {
      return { ctx: defaultContext(), error: 'The context must be a JSON object.' };
    }
    return { ctx: normalizeContext(parsed as GhaObject) };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Invalid JSON.';
    return { ctx: defaultContext(), error: `Could not parse the context JSON: ${msg}` };
  }
}

/** Lift recognised top-level keys from a plain object into an EvalContext. */
function normalizeContext(obj: GhaObject): EvalContext {
  const ctx: EvalContext = {};
  const assign = (key: keyof EvalContext) => {
    const v = obj[key as string];
    if (isGhaObject(v)) (ctx as Record<string, unknown>)[key] = v;
  };
  (
    ['github', 'env', 'job', 'steps', 'runner', 'needs', 'matrix', 'strategy', 'inputs', 'vars', 'secrets'] as const
  ).forEach(assign);

  const status = obj.jobStatus;
  if (status === 'success' || status === 'failure' || status === 'cancelled') ctx.jobStatus = status;

  const sc = obj.stepConclusions;
  if (Array.isArray(sc)) {
    ctx.stepConclusions = sc.filter(
      (c): c is 'success' | 'failure' | 'cancelled' | 'skipped' =>
        c === 'success' || c === 'failure' || c === 'cancelled' || c === 'skipped',
    );
  }
  return ctx;
}

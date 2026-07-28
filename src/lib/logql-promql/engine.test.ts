import { describe, it, expect } from 'vitest';
import { convert, encodeState } from './engine';
import { base64UrlDecode } from '../codec';

// `decodeState()` reads `window.location.hash` and is intentionally left
// untested here — it's DOM-touching and untestable under this project's
// node-environment vitest config (same precedent as `ip-hash.ts` and the
// AlertLint share-link codec; verified instead via the manual/browser check).

describe('encodeState()', () => {
  it('produces a "#s=" fragment', () => {
    const hash = encodeState('logql-to-promql', 'rate({app="api"}[5m])');
    expect(hash.startsWith('#s=')).toBe(true);
  });

  it('base64url-decodes + JSON-parses back to the original direction and query', () => {
    const hash = encodeState('promql-to-logql', 'rate(http_requests_total{job="api"}[5m])');
    const payload = JSON.parse(base64UrlDecode(hash.slice('#s='.length)));
    expect(payload).toEqual({
      direction: 'promql-to-logql',
      query: 'rate(http_requests_total{job="api"}[5m])',
    });
  });

  it('round-trips a query containing quotes, unicode and newline-free special characters', () => {
    const query = 'sum by(level) (count_over_time({job="ingress", msg=~"café.*"} | logfmt [1m]))';
    const hash = encodeState('logql-to-promql', query);
    const payload = JSON.parse(base64UrlDecode(hash.slice('#s='.length))) as {
      direction: string;
      query: string;
    };
    expect(payload.direction).toBe('logql-to-promql');
    expect(payload.query).toBe(query);
  });

  it('produces no "+", "/" or "=" characters (URL-safe)', () => {
    const hash = encodeState('logql-to-promql', 'x'.repeat(200));
    expect(hash.slice('#s='.length)).not.toMatch(/[+/=]/);
  });
});

/**
 * The engine's contract (types.ts): it "emits the closest equivalent it can AND
 * a clear notes[] entry explaining every gap … rather than silently losing
 * meaning". Silent truncation is therefore a bug, not a documented limitation.
 */
describe('convert() — nothing is dropped silently', () => {
  it('keeps a threshold comparison after the outer aggregation', () => {
    const r = convert(
      'logql-to-promql',
      'sum by (app) (rate({app="checkout", env="prod"} |= "error" [5m])) > 0.2',
    );
    expect(r.error).toBeUndefined();
    expect(r.output).toContain('> 0.2');
  });

  it('keeps a binary operator tail in the promql-to-logql direction too', () => {
    const r = convert(
      'promql-to-logql',
      'sum by (job) (rate(http_requests_total[5m])) > 100',
    );
    expect(r.error).toBeUndefined();
    expect(r.output).toContain('> 100');
  });

  it('never returns an output that silently omits a trailing comparison', () => {
    for (const [dir, q] of [
      ['logql-to-promql', 'sum(rate({app="a"}[5m])) >= 1'],
      ['logql-to-promql', 'sum(rate({app="a"}[5m])) != 0'],
      ['promql-to-logql', 'sum(rate(m[5m])) < 5'],
    ] as const) {
      const r = convert(dir, q);
      const tail = q.slice(q.lastIndexOf(')') + 1).trim();
      expect(r.error ? '' : r.output, `${dir}: ${q}`).toContain(tail);
    }
  });

  it('warns when a PromQL modifier after the selector cannot be carried over', () => {
    const r = convert('promql-to-logql', 'rate(http_requests_total{job="api"} offset 1h [5m])');
    expect(r.error).toBeUndefined();
    // Mirrors the LogQL->PromQL direction, which already notes a dropped pipeline.
    expect(r.notes.join(' ')).toMatch(/offset/i);
  });

  it('does not claim a clean mapping while discarding an offset', () => {
    const r = convert('promql-to-logql', 'rate(http_requests_total{job="api"} offset 1h [5m])');
    expect(r.notes.length).toBeGreaterThan(0);
  });
});

describe('convert() — quantile_over_time keeps its quantile argument', () => {
  it('preserves the quantile going LogQL -> PromQL', () => {
    const r = convert(
      'logql-to-promql',
      'quantile_over_time(0.99, {app="api"} | unwrap latency [5m])',
    );
    expect(r.error).toBeUndefined();
    expect(r.output).toMatch(/quantile_over_time\(\s*0\.99\s*,/);
  });

  it('preserves the quantile going PromQL -> LogQL', () => {
    const r = convert(
      'promql-to-logql',
      'quantile_over_time(0.95, http_request_duration_seconds{job="api"}[5m])',
    );
    expect(r.error).toBeUndefined();
    expect(r.output).toMatch(/quantile_over_time\(\s*0\.95\s*,/);
  });

  it('never emits a one-argument quantile_over_time', () => {
    for (const [dir, q] of [
      ['logql-to-promql', 'quantile_over_time(0.99, {app="api"} | unwrap latency [5m])'],
      ['promql-to-logql', 'quantile_over_time(0.5, m{a="b"}[1m])'],
    ] as const) {
      const r = convert(dir, q);
      if (r.error) continue;
      // A valid call has a comma before the selector.
      const call = r.output.slice(r.output.indexOf('quantile_over_time('));
      expect(call, `${dir}: ${q}`).toMatch(/quantile_over_time\([^)]*,/);
    }
  });
});

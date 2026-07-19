import { describe, it, expect } from 'vitest';
import { encodeState } from './engine';
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

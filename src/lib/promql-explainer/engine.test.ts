import { describe, expect, it } from 'vitest';
import { explain } from './engine';
import { examples } from './examples';

const prose = (q: string) => explain(q).explanation;
const row = (q: string, token: string) =>
  explain(q).breakdown.find((b) => b.token === token)?.meaning ?? '';

/**
 * The product promise is "read what the query actually does", so an
 * explanation that is byte-identical for two queries with different meanings
 * is the worst possible failure: confidently wrong, with nothing to signal it.
 */
describe('explain() — grouping is visible in the prose', () => {
  it('distinguishes 1 - a / b from (1 - a) / b', () => {
    expect(prose('1 - a / b')).not.toBe(prose('(1 - a) / b'));
  });

  it('distinguishes a + b * c from (a + b) * c', () => {
    expect(prose('a + b * c')).not.toBe(prose('(a + b) * c'));
  });

  it('distinguishes x - (y - z) from (x - y) - z', () => {
    expect(prose('x - (y - z)')).not.toBe(prose('(x - y) - z'));
  });

  it('explains the shipped "Memory used (%)" example as 1 minus a ratio', () => {
    // (1 - Avail / Total) * 100 — the subtraction wraps the ratio, and the
    // multiply applies to the whole bracket. Previously rendered as if it were
    // ((1 - Avail) / Total) * 100.
    const q =
      '(1 - node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes) * 100';
    expect(prose(q)).toMatch(/result of/i);
  });

  it('does not bracket a same-precedence left-associative chain', () => {
    // a + b + c is (a+b)+c by default; no grouping information is lost, so the
    // prose should stay flat and readable.
    expect(prose('a + b + c')).not.toMatch(/result of/i);
  });

  it('distinguishes a + b + c from a + (b + c)', () => {
    expect(prose('a + b + c')).not.toBe(prose('a + (b + c)'));
  });
});

describe('explain() — aggregation modifiers are described correctly', () => {
  it('says without(pod) REMOVES pod rather than keeping only pod', () => {
    const meaning = row('sum without(pod) (container_memory_usage_bytes)', 'without(pod)');
    expect(meaning).not.toMatch(/except\s+`?pod/i);
    expect(meaning).toMatch(/removes|drops|aggregates away the/i);
  });

  it('keeps the without() breakdown row consistent with its own prose', () => {
    const q = 'sum without(pod) (container_memory_usage_bytes)';
    expect(prose(q)).toMatch(/except/i); // "grouped by everything except `pod`"
    expect(row(q, 'without(pod)')).not.toMatch(/all labels except/i);
  });

  it('does not claim topk collapses every series into a single result', () => {
    expect(prose('topk(3, node_memory_MemFree_bytes)')).not.toMatch(
      /collapsing every series into a single result/,
    );
  });

  it('does not claim count_values collapses to a single result', () => {
    expect(prose('count_values("version", build_info)')).not.toMatch(
      /collapsing every series into a single result/,
    );
  });

  it('still says sum collapses to a single result when ungrouped', () => {
    expect(prose('sum(up)')).toMatch(/collapsing every series into a single result/);
  });
});

describe('explain() — comments do not fabricate errors', () => {
  it('accepts a trailing comment containing an apostrophe', () => {
    const r = explain("sum(rate(http_requests_total[5m])) # the api team's dashboard");
    expect(r.error).toBeUndefined();
    expect(r.explanation).not.toBe('');
  });

  it('accepts a comment containing an unbalanced paren', () => {
    expect(explain('up # a comment with a ) paren').error).toBeUndefined();
  });

  it('accepts a comment containing an unbalanced brace', () => {
    expect(explain('up{job="a"} # {').error).toBeUndefined();
  });

  it('still reports a genuinely unbalanced expression', () => {
    expect(explain('sum(rate(x[5m])').error).toBeTruthy();
  });

  it('still reports a genuinely unterminated string', () => {
    expect(explain('up{job="a}').error).toBeTruthy();
  });
});

describe('explain() — subqueries are not silently dropped', () => {
  // Durations are humanised in the prose ("1 hour", not "1h").
  it('mentions the subquery window on a function call', () => {
    const p = prose('max_over_time(rate(http_requests_total[5m])[1h:1m])');
    expect(p).toMatch(/subquery over the last 1 hour/);
    expect(p).toMatch(/1 minute step/);
    // The inner range must still be reported too.
    expect(p).toMatch(/5 minutes/);
  });

  it('mentions the subquery window on a parenthesised expression', () => {
    expect(prose('sum_over_time((a + b)[10m:1m])')).toMatch(
      /subquery over the last 10 minutes/,
    );
  });
});

describe('explain() — bundled examples stay explainable', () => {
  it('every shipped example parses without an error', () => {
    for (const ex of examples) {
      const r = explain((ex as { query: string }).query);
      expect(r.error, (ex as { query: string }).query).toBeUndefined();
      expect(r.explanation.length, (ex as { query: string }).query).toBeGreaterThan(0);
    }
  });
});

describe('explain() — rejects what Prometheus rejects', () => {
  it('rejects rate() on an instant vector', () => {
    expect(explain('rate(http_requests_total)').error).toBe(
      'expected type range vector in call to function "rate", got instant vector',
    );
  });

  it('still accepts range-vector arguments, subqueries and parens', () => {
    for (const q of [
      'rate(x_total[5m])',
      'rate((x_total[5m]))',
      'max_over_time(rate(x[5m])[1h:1m])',
      'quantile_over_time(0.9, x[5m])',
      'absent_over_time(up[10m])',
      'sin(x)',
    ]) {
      expect(explain(q).error, q).toBeUndefined();
    }
  });

  it('rejects an unknown function and suggests the closest one', () => {
    const err = explain('rates(x_total[5m])').error ?? '';
    expect(err).toMatch(/unknown function with name "rates"/);
    expect(err).toMatch(/rate\(\)/);
  });

  it('reports an invalid duration as a duration error', () => {
    expect(explain('rate(x_total[5x])').error).toMatch(/“5x” is not a valid duration/);
  });
});

describe('explain() — offsets read in the right direction', () => {
  it('reads a negative offset as forward in time', () => {
    const p = prose('x_total offset -5m');
    expect(p).toMatch(/shifted forward in time by 5 minutes/);
    expect(p).not.toMatch(/back in time|in the future/);
    expect(row('x_total offset -5m', 'offset -5m')).toMatch(/forward in time by 5 minutes/);
  });

  it('still reads a positive offset as back in time', () => {
    expect(prose('x_total offset 5m')).toMatch(/shifted back in time by 5 minutes/);
  });
});

describe('explain() — nested clauses read as noun phrases', () => {
  // A verb phrase spliced after "where", "over", "applied to" or "taken from"
  // made the default example read "where adds … over computes …".
  const broken =
    /(where|over|applied to|taken from|by|of) (adds|computes|takes|keeps|counts|averages|estimates)\b/;

  it.each([
    'histogram_quantile(0.95, sum by(le) (rate(http_request_duration_seconds_bucket[5m])))',
    'max_over_time(rate(x[5m])[1h:1m])',
    'topk by (job) (3, rate(x_total[5m]))',
    'rate(a[5m]) / rate(b[5m])',
  ])('%s', (q) => {
    expect(prose(q)).not.toMatch(broken);
  });

  it('reads the default example as a sum of rates', () => {
    expect(
      prose('histogram_quantile(0.95, sum by(le) (rate(http_request_duration_seconds_bucket[5m])))'),
    ).toMatch(/the sum, grouped by `le`.*, of the per-second average rate of increase of/);
  });
});

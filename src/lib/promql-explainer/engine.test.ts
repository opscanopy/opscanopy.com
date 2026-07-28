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

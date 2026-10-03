import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { advisoryId, evaluate, fixtureAudit } from '../../scripts/audit-gate-core.mjs';

const T = '2026-10-03';
const entry = { id: 'GHSA-aaaa-bbbb-cccc', package: 'lib-a', reason: 'build-time only', expires: '2026-11-03' };

describe('audit gate core', () => {
  it('reads the GHSA id from an advisory URL', () => {
    expect(advisoryId('https://github.com/advisories/GHSA-ch52-4w7c-c8xp')).toBe('GHSA-ch52-4w7c-c8xp');
    expect(advisoryId('https://example.com/x')).toBeNull();
  });
  it('passes a clean tree', () => {
    expect(evaluate(fixtureAudit({}), [], T).ok).toBe(true);
  });
  it('fails an unallowlisted high', () => {
    expect(evaluate(fixtureAudit({ 'lib-a': [['GHSA-aaaa-bbbb-cccc', 'high']] }), [], T).ok).toBe(false);
  });
  it('passes an allowlisted high, including its transitive marker on the framework', () => {
    const r = evaluate(fixtureAudit({ 'lib-a': [['GHSA-aaaa-bbbb-cccc', 'high']] }, { framework: 'lib-a' }), [entry], T);
    expect(r.ok).toBe(true);
    expect(r.allowed).toHaveLength(1);
  });
  it('does not excuse the same id on another package', () => {
    expect(evaluate(fixtureAudit({ 'lib-b': [['GHSA-aaaa-bbbb-cccc', 'high']] }), [entry], T).ok).toBe(false);
  });
  it('still fails a second blocking advisory on an allowlisted package', () => {
    const audit = fixtureAudit({ 'lib-a': [['GHSA-aaaa-bbbb-cccc', 'high'], ['GHSA-dddd-eeee-ffff', 'critical']] });
    const r = evaluate(audit, [entry], T);
    expect(r.ok).toBe(false);
    expect(r.blocking.map((b) => (b as { id: string }).id)).toEqual(['GHSA-dddd-eeee-ffff']);
  });
  it('fails an expired entry', () => {
    expect(evaluate(fixtureAudit({ 'lib-a': [['GHSA-aaaa-bbbb-cccc', 'high']] }), [{ ...entry, expires: '2026-10-02' }], T).ok).toBe(false);
  });
  it('fails a stale entry once the advisory is gone', () => {
    const r = evaluate(fixtureAudit({}), [entry], T);
    expect(r.ok).toBe(false);
    expect(r.problems[0]).toMatch(/matches no current advisory/);
  });
  it('ignores moderate advisories', () => {
    expect(evaluate(fixtureAudit({ 'lib-c': [['GHSA-gggg-hhhh-iiii', 'moderate']] }), [], T).ok).toBe(true);
  });
  it('rejects an incomplete entry', () => {
    // Deliberately incomplete (no reason, no expiry): the gate must reject it.
    const incomplete = { id: entry.id, package: 'lib-a' } as unknown as typeof entry;
    expect(evaluate(fixtureAudit({ 'lib-a': [['GHSA-aaaa-bbbb-cccc', 'high']] }), [incomplete], T).ok).toBe(false);
  });
});

describe('audit allowlist file', () => {
  const list = JSON.parse(readFileSync(new URL('../../scripts/audit-allowlist.json', import.meta.url), 'utf8'));
  it('every entry has id, package, a real reason and an expiry at most 45 days out', () => {
    for (const e of list) {
      expect(e.id).toMatch(/^GHSA-/);
      expect(e.package).toBeTruthy();
      expect(e.reason.length).toBeGreaterThan(80);
      expect(e.expires).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      const days = (Date.parse(e.expires) - Date.now()) / 86400000;
      expect(days).toBeLessThanOrEqual(45);
    }
  });
});

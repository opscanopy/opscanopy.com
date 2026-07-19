import { describe, it, expect } from 'vitest';
import { HANDOFF_KEY, buildHandoff, parseHandoff } from './handoff';

describe('parseHandoff', () => {
  it('returns null for null, empty, and garbage input', () => {
    expect(parseHandoff(null)).toBeNull();
    expect(parseHandoff('')).toBeNull();
    expect(parseHandoff('not json')).toBeNull();
    expect(parseHandoff('[1,2,3]')).toBeNull();
    expect(parseHandoff('"just a string"')).toBeNull();
  });

  it('returns null for an empty value', () => {
    expect(parseHandoff(JSON.stringify({ value: '' }))).toBeNull();
  });

  it('extracts a well-formed value', () => {
    expect(parseHandoff(JSON.stringify({ value: 'eyJhbGciOiJIUzI1NiJ9' }))).toBe('eyJhbGciOiJIUzI1NiJ9');
  });

  it('round-trips through buildHandoff', () => {
    expect(parseHandoff(buildHandoff('some secret-looking value'))).toBe('some secret-looking value');
  });

  it('exports the storage key page scripts write under', () => {
    expect(HANDOFF_KEY).toBe('oc-handoff-v1');
  });
});

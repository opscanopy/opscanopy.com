import { describe, it, expect } from 'vitest';
import { parseHashValue, buildHashValue } from './hash-state';

describe('parseHashValue', () => {
  it('reads a value for the matching key', () => {
    expect(parseHashValue('cron', '#cron=0%200%20%2A%20%2A%20%2A')).toBe('0 0 * * *');
  });

  it('returns null for a non-matching key', () => {
    expect(parseHashValue('cron', '#t=1700000000')).toBeNull();
    expect(parseHashValue('cron', '#croned=0 0 * * *')).toBeNull();
  });

  it('returns null for an empty hash or an empty value', () => {
    expect(parseHashValue('cron', '')).toBeNull();
    expect(parseHashValue('cron', '#cron=')).toBeNull();
    expect(parseHashValue('cron', '#cron=%20%20')).toBeNull();
  });

  it('trims whitespace around the decoded value', () => {
    expect(parseHashValue('t', '#t=%20%201700000000%20')).toBe('1700000000');
  });

  it('never throws on a malformed percent-escape, returning null instead', () => {
    expect(parseHashValue('mac', '#mac=%')).toBeNull();
    expect(parseHashValue('mac', '#mac=%zz')).toBeNull();
  });

  it('different keys do not collide on a shared-prefix name', () => {
    expect(parseHashValue('q', '#q=up%7Bjob%3D%22x%22%7D')).toBe('up{job="x"}');
    expect(parseHashValue('quiz', '#q=up')).toBeNull();
  });
});

describe('buildHashValue', () => {
  it('percent-encodes the value under the given key', () => {
    expect(buildHashValue('cron', '0 0 * * *')).toBe('#cron=0%200%20*%20*%20*');
  });

  it('encodes characters that would otherwise break the fragment', () => {
    expect(buildHashValue('q', 'up{job="x"}')).toBe('#q=up%7Bjob%3D%22x%22%7D');
  });
});

describe('round-trip', () => {
  const cases = ['0 0 * * *', 'up{job="api", env="prod"}', '1752345600', '00:1a:2b:3c:4d:5e', '  spaced  '];

  it.each(cases)('parseHashValue(buildHashValue(x)) === x.trim() for %j', (value) => {
    expect(parseHashValue('k', buildHashValue('k', value))).toBe(value.trim());
  });
});

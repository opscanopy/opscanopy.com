import { describe, it, expect } from 'vitest';
import { decode } from './engine';
import { examples } from './examples';
import { resultHtml, verifyBlock, trustBanner } from './render';

/** Pinned so the relative "(N years ago)" suffix on iat cannot drift per build. */
const FIXED_NOW = Date.UTC(2026, 0, 1);
const seed = decode(examples[0].token, FIXED_NOW); // canonical HS256 sample

describe('resultHtml', () => {
  it('renders the decoded header and payload as static HTML', () => {
    const html = resultHtml(seed, verifyBlock('no-key', 'Add a key to verify.'), 'no-key');
    expect(html).toContain('HS256');
    expect(html).toContain('John Doe');
    expect(html).toContain('1234567890');
  });

  it('renders the claims table', () => {
    const html = resultHtml(seed, verifyBlock('no-key', 'x'), 'no-key');
    expect(html).toContain('sub');
    expect(html).toContain('iat');
  });

  it('escapes hostile payload strings', () => {
    const evil = decode(examples[0].token, FIXED_NOW);
    if (evil.payload) evil.payload = '{"x":"<img src=x onerror=alert(1)>"}';
    const html = resultHtml(evil, verifyBlock('no-key', 'x'), 'no-key');
    expect(html).not.toContain('<img src=x');
  });
});

describe('trustBanner', () => {
  it('has a no-key state that needs neither a key nor a clock', () => {
    expect(trustBanner('no-key')).toBeTruthy();
    expect(trustBanner('no-key')).not.toContain('undefined');
  });
});

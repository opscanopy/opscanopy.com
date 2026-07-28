import { describe, expect, it } from 'vitest';
import { split } from './engine';

/**
 * Regression suite for the subnet splitter.
 *
 * The "next free" search used to rescan every candidate subnet one at a time
 * once the rendered list was capped, which is 2^(newPrefix - parentPrefix)
 * iterations — 2^96 for a /32 split into /128. That is a synchronous loop on
 * the main thread, so the browser tab froze with no result, no error and no
 * way to cancel. Every timing assertion below exists to keep that from coming
 * back; they are generous enough not to be flaky on a loaded machine.
 */
describe('split — next-free search is bounded', () => {
  it('returns promptly for a /32 IPv6 parent split into /128', () => {
    const t0 = Date.now();
    const r = split('2001:db8::/32', '2001:db8::/33', 128);
    expect(Date.now() - t0).toBeLessThan(1000);
    expect(r.valid).toBe(true);
  });

  it('finds the correct next free /128 above a /33 allocation', () => {
    const r = split('2001:db8::/32', '2001:db8::/33', 128);
    // The /33 covers the lower half, so the first free /128 is at the midpoint.
    expect(r.nextFree).toBe('2001:db8:8000::/128');
  });

  it('stays bounded across a range of hostile IPv6 prefixes', () => {
    for (const p of [64, 96, 112, 127, 128]) {
      const t0 = Date.now();
      const r = split('2001:db8::/32', '2001:db8::/33', p);
      expect(Date.now() - t0, `newPrefix /${p}`).toBeLessThan(1000);
      expect(r.valid, `newPrefix /${p}`).toBe(true);
    }
  });

  it('reports no next free subnet when the parent is fully allocated', () => {
    const r = split('2001:db8::/32', '2001:db8::/32', 128);
    expect(r.nextFree).toBeNull();
  });

  it('still finds the next free subnet inside the un-capped range', () => {
    // 10.0.0.0/24 -> /26 is only 4 subnets, so the first loop handles it.
    const r = split('10.0.0.0/24', '10.0.0.0/26', 26);
    expect(r.nextFree).toBe('10.0.0.64/26');
  });

  it('finds a next free IPv4 subnet beyond the 256-subnet render cap', () => {
    // /16 -> /25 is 512 subnets; everything below 10.0.128.0 is allocated, so
    // the answer lies past the cap and must still be found.
    const r = split('10.0.0.0/16', '10.0.0.0/17', 25);
    expect(r.nextFree).toBe('10.0.128.0/25');
  });
});

describe('split — the subnet total is the real total, not the capped list length', () => {
  it('reports 512 when a /16 is split into /25 and only 256 rows are rendered', () => {
    const r = split('10.0.0.0/16', '', 25);
    expect(r.split!.truncated).toBe(true);
    expect(r.split!.subnets.length).toBe(256);
    // The rendered list is capped, but the count shown to the user must not be.
    expect(r.split!.total).toBe('512');
  });

  it('reports an untruncated split at its exact size', () => {
    const r = split('10.0.0.0/24', '', 26);
    expect(r.split!.truncated).toBe(false);
    expect(r.split!.total).toBe('4');
  });

  it('collapses an enormous IPv6 split count rather than printing 29 digits', () => {
    const r = split('2001:db8::/32', '', 128);
    expect(r.split!.total).toBe('2^96');
  });
});

describe('split — address counts are not understated', () => {
  it('does not report 2^96 minus one as half its size', () => {
    const r = split('2001:db8::/32', '2001:db8::1/128', null);
    // floorLog2 used to render this as "≈2^95" — a systematic 2x understatement
    // for every count that is not an exact power of two.
    expect(r.stats.free).not.toBe('≈2^95');
    expect(r.stats.free).toBe('≈2^96');
  });

  it('renders an exact power of two without the approximation marker', () => {
    const r = split('2001:db8::/32', '', null);
    expect(r.stats.total).toBe('2^96');
  });

  it('keeps small counts as exact decimals', () => {
    const r = split('10.0.0.0/24', '', null);
    expect(r.stats.total).toBe('256');
  });
});

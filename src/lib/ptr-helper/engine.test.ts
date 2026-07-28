import { describe, expect, it } from 'vitest';
import { generate } from './engine';
import type { PtrResult } from './types';

/**
 * Reverse DNS / PTR helper suite.
 *
 * Two classes of test live here:
 *
 *  1. Regressions for the two shipped bugs —
 *     (a) every IPv4 prefix /1–/23 that was not a multiple of 8 reported the
 *         enclosing /24 as its reverse zone (one 4096th of a /12) and
 *         claimed RFC 2317 applied, which is only ever true for sub-/24
 *         classless delegation;
 *     (b) a prefix shorter than one label (IPv4 /0, IPv6 /0–/3) produced a
 *         malformed zone with a leading dot, or silently fell into the
 *         enclosing-/24 branch.
 *  2. Plain coverage of the cases that already worked, so the file is a real
 *     suite and not just two bug pins.
 */

function row(r: PtrResult, label: string): string | undefined {
  return r.rows.find((x) => x.label === label)?.value;
}
const zone = (input: string) => row(generate(input), 'Reverse zone');
const note = (input: string) => row(generate(input), 'Note');

/* ── Bug 1: IPv4 prefixes shorter than /24 that miss an octet boundary ────── */

describe('IPv4 reverse zone for a non-octet prefix shorter than /24', () => {
  it('reports the enclosing /8-level zone for 172.16.0.0/12, not a /24', () => {
    expect(zone('172.16.0.0/12')).toBe('172.in-addr.arpa');
  });

  it('names the 16 sibling zones a /12 spans instead of citing RFC 2317', () => {
    const n = note('172.16.0.0/12');
    expect(n).toBeDefined();
    expect(n).not.toMatch(/2317/);
    expect(n).toMatch(/16 sibling/);
    // 172.16.0.0/12 covers 172.16.x through 172.31.x.
    expect(n).toContain('16.172.in-addr.arpa');
    expect(n).toContain('31.172.in-addr.arpa');
  });

  it('rounds a /23 down to its /16-level zone and names both /24 siblings', () => {
    expect(zone('192.0.0.0/23')).toBe('0.192.in-addr.arpa');
    const n = note('192.0.0.0/23');
    expect(n).toMatch(/2 sibling/);
    expect(n).toContain('0.0.192.in-addr.arpa');
    expect(n).toContain('1.0.192.in-addr.arpa');
  });

  it('rounds a /7 down to the in-addr.arpa apex and names both /8 siblings', () => {
    expect(zone('10.0.0.0/7')).toBe('in-addr.arpa');
    const n = note('10.0.0.0/7');
    expect(n).toMatch(/2 sibling/);
    expect(n).toContain('10.in-addr.arpa');
    expect(n).toContain('11.in-addr.arpa');
  });

  it('never claims RFC 2317 for any prefix shorter than /24', () => {
    for (let p = 0; p < 24; p++) {
      expect(note(`10.0.0.0/${p}`) ?? '', `/${p}`).not.toMatch(/2317/);
    }
  });

  it('keeps every /1–/23 zone strictly above the enclosing /24', () => {
    for (let p = 1; p < 24; p++) {
      const z = zone(`172.16.0.0/${p}`) ?? '';
      expect(z, `/${p}`).not.toBe('0.16.172.in-addr.arpa');
      expect(z.split('.').length - 2, `/${p}`).toBeLessThanOrEqual(3);
    }
  });
});

/* ── Bug 2: prefixes shorter than one label ───────────────────────────────── */

describe('prefixes shorter than a single zone label', () => {
  it('returns the bare ip6.arpa apex for a sub-nibble IPv6 prefix', () => {
    expect(zone('2001:db8::/2')).toBe('ip6.arpa');
    expect(note('2001:db8::/2')).toMatch(/entire/i);
  });

  it('returns the bare ip6.arpa apex for ::/0', () => {
    expect(zone('::/0')).toBe('ip6.arpa');
    expect(note('::/0')).toMatch(/entire/i);
  });

  it('returns the bare in-addr.arpa apex for 0.0.0.0/0', () => {
    expect(zone('0.0.0.0/0')).toBe('in-addr.arpa');
    expect(note('0.0.0.0/0')).toMatch(/entire/i);
  });

  it('never emits a zone with a leading or doubled dot', () => {
    const inputs: string[] = [];
    for (let p = 0; p <= 32; p++) inputs.push(`192.0.2.0/${p}`);
    for (let p = 0; p <= 128; p++) inputs.push(`2001:db8::/${p}`);
    for (const input of inputs) {
      const z = zone(input) ?? '';
      expect(z, input).not.toMatch(/^\./);
      expect(z, input).not.toMatch(/\.\./);
      expect(z, input).toMatch(/(in-addr|ip6)\.arpa$/);
    }
  });
});

/* ── Cases that already worked ────────────────────────────────────────────── */

describe('IPv4 host and octet-boundary zones', () => {
  it('builds the PTR name, /24 zone and dig command for a bare host', () => {
    const r = generate('192.0.2.1');
    expect(r.valid).toBe(true);
    expect(r.version).toBe(4);
    expect(row(r, 'PTR record name')).toBe('1.2.0.192.in-addr.arpa');
    expect(row(r, 'Reverse zone')).toBe('2.0.192.in-addr.arpa');
    expect(row(r, 'dig command')).toBe('dig -x 192.0.2.1');
    expect(row(r, 'Note')).toBeUndefined();
  });

  it('delegates a /24 on its octet boundary with no note', () => {
    const r = generate('192.0.2.0/24');
    expect(row(r, 'Reverse zone')).toBe('2.0.192.in-addr.arpa');
    expect(row(r, 'Note')).toBeUndefined();
  });

  it('delegates a /16 and a /8 on their octet boundaries', () => {
    expect(zone('192.0.0.0/16')).toBe('0.192.in-addr.arpa');
    expect(zone('10.0.0.0/8')).toBe('10.in-addr.arpa');
  });

  it('applies RFC 2317 to a genuine sub-/24 block', () => {
    const r = generate('192.0.2.0/25');
    expect(row(r, 'Reverse zone')).toBe('2.0.192.in-addr.arpa');
    expect(row(r, 'Note')).toMatch(/2317/);
  });
});

describe('IPv6', () => {
  it('expands a /128 host to all 32 nibbles and uses its /64 zone', () => {
    const r = generate('2001:db8::1');
    expect(r.valid).toBe(true);
    expect(r.version).toBe(6);
    expect(row(r, 'PTR record name')).toBe(
      '1.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.8.b.d.0.1.0.0.2.ip6.arpa',
    );
    expect(row(r, 'Reverse zone')).toBe('0.0.0.0.0.0.0.0.8.b.d.0.1.0.0.2.ip6.arpa');
    expect(row(r, 'dig command')).toBe('dig -x 2001:db8::1');
    expect(row(r, 'Note')).toBeUndefined();
  });

  it('delegates a /48 on its nibble boundary with no note', () => {
    const r = generate('2001:db8::/48');
    expect(row(r, 'Reverse zone')).toBe('0.0.0.0.8.b.d.0.1.0.0.2.ip6.arpa');
    expect(row(r, 'Note')).toBeUndefined();
  });

  it('rounds a non-nibble prefix down to the nibble below', () => {
    const r = generate('2001:db8::/49');
    expect(row(r, 'Reverse zone')).toBe('0.0.0.0.8.b.d.0.1.0.0.2.ip6.arpa');
    expect(row(r, 'Note')).toMatch(/\/48/);
  });
});

describe('invalid input', () => {
  it('returns an error result instead of throwing', () => {
    for (const bad of ['', '   ', 'not an ip', '999.1.1.1', '192.0.2.0/33', '2001:db8::/129']) {
      const r = generate(bad);
      expect(r.valid, JSON.stringify(bad)).toBe(false);
      expect(r.error, JSON.stringify(bad)).toBeTruthy();
      expect(r.rows, JSON.stringify(bad)).toEqual([]);
    }
  });
});

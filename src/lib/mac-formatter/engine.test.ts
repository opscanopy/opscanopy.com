/**
 * MAC Address Formatter — engine tests.
 *
 * Covers: the four separator forms, every accepted input notation, the OUI row,
 * the I/G (unicast vs multicast vs broadcast) and U/L (universal vs local)
 * readings, invalid input returning an error rather than throwing, and the
 * EUI-64 link-local derivation — pinned to the RFC 4291 Appendix A vector and
 * guarded so group/broadcast addresses are never given a fabricated fe80::
 * address (EUI-64 link-local is only meaningful for unicast).
 */
import { describe, it, expect } from 'vitest';
import { format } from './engine';
import { examples } from './examples';
import type { MacResult } from './types';

const LINK_LOCAL_LABEL = 'IPv6 link-local (EUI-64)';
const GROUP_NOTE = '(group address: no EUI-64 link-local)';

/** Read one row's value by label, or undefined when the row is absent. */
function row(res: MacResult, label: string): string | undefined {
  return res.rows.find((r) => r.label === label)?.value;
}

/** Assert a result carries no derived link-local at all. */
function expectNoLinkLocal(res: MacResult): void {
  expect(row(res, LINK_LOCAL_LABEL)).toBeUndefined();
  expect(res.rows.some((r) => /link-local/i.test(r.label))).toBe(false);
  // Nothing anywhere in the result may claim an fe80:: address.
  for (const cell of res.rows) expect(cell.value).not.toMatch(/fe80/i);
}

describe('format — output notations', () => {
  const res = format('00:1a:2b:3c:4d:5e');

  it('is valid and carries no error', () => {
    expect(res.valid).toBe(true);
    expect(res.error).toBeUndefined();
  });

  it('renders all four separator forms', () => {
    expect(row(res, 'Colon (lowercase)')).toBe('00:1a:2b:3c:4d:5e');
    expect(row(res, 'Hyphen (uppercase)')).toBe('00-1A-2B-3C-4D-5E');
    expect(row(res, 'Dotted (Cisco)')).toBe('001a.2b3c.4d5e');
    expect(row(res, 'No separators')).toBe('001a2b3c4d5e');
  });

  it('reports the OUI as the first three bytes, uppercase', () => {
    expect(row(res, 'OUI (first 3 bytes)')).toBe('00:1A:2B');
  });
});

describe('format — accepted input notations all normalise identically', () => {
  const canonical = '00:1a:2b:3c:4d:5e';
  const inputs = [
    '00:1a:2b:3c:4d:5e',
    '00-1A-2B-3C-4D-5E',
    '001a.2b3c.4d5e',
    '001A2B3C4D5E',
    '0x001a2b3c4d5e',
    '  00:1A:2b:3C:4d:5E  ',
    '00 1a 2b 3c 4d 5e',
  ];

  for (const input of inputs) {
    it(`parses ${JSON.stringify(input)}`, () => {
      const r = format(input);
      expect(r.valid).toBe(true);
      expect(row(r, 'Colon (lowercase)')).toBe(canonical);
    });
  }
});

describe('format — I/G and U/L bit reporting', () => {
  it('reports a universal unicast address', () => {
    const r = format('00:1a:2b:3c:4d:5e');
    expect(row(r, 'Transmission')).toBe('Unicast');
    expect(row(r, 'Administration')).toBe('Universal / OUI-assigned');
  });

  it('reports a locally administered unicast address (U/L bit set)', () => {
    const r = format('02:00:00:00:00:01');
    expect(row(r, 'Transmission')).toBe('Unicast');
    expect(row(r, 'Administration')).toBe('Locally administered');
  });

  it('reports multicast when the I/G bit is set', () => {
    const r = format('01:00:5e:00:00:fb');
    expect(row(r, 'Transmission')).toBe(`Multicast ${GROUP_NOTE}`);
  });

  it('flags the all-ones address as broadcast', () => {
    const r = format('ff:ff:ff:ff:ff:ff');
    expect(row(r, 'Transmission')).toBe(`Multicast — broadcast ${GROUP_NOTE}`);
    expect(row(r, 'Administration')).toBe('Locally administered');
  });
});

describe('format — EUI-64 link-local derivation', () => {
  it('matches the RFC 4291 Appendix A vector', () => {
    // 34-56-78-9A-BC-DE → interface id 3656:78FF:FE9A:BCDE (U/L bit flipped,
    // FF:FE inserted) → fe80::3656:78ff:fe9a:bcde.
    const r = format('34-56-78-9A-BC-DE');
    expect(r.valid).toBe(true);
    expect(row(r, LINK_LOCAL_LABEL)).toBe('fe80::3656:78ff:fe9a:bcde');
  });

  it('derives a link-local for other unicast addresses', () => {
    expect(row(format('00:1a:2b:3c:4d:5e'), LINK_LOCAL_LABEL)).toBe(
      'fe80::21a:2bff:fe3c:4d5e',
    );
    expect(row(format('02:00:00:00:00:01'), LINK_LOCAL_LABEL)).toBe(
      'fe80::ff:fe00:1',
    );
  });

  it('never fabricates a link-local for the broadcast address', () => {
    // 'broadcast' is one of the five bundled examples, so this shipped as a
    // visible fe80::fdff:ffff:feff:ffff row on the tool page.
    const r = format('ff:ff:ff:ff:ff:ff');
    expect(r.valid).toBe(true);
    expectNoLinkLocal(r);
    // …and the reason is stated where the I/G bit is reported.
    expect(row(r, 'Transmission')).toContain(GROUP_NOTE);
  });

  it('never fabricates a link-local for a multicast address', () => {
    const r = format('01:00:5e:00:00:fb');
    expect(r.valid).toBe(true);
    expectNoLinkLocal(r);
    expect(row(r, 'Transmission')).toContain(GROUP_NOTE);
  });

  it('holds for every bundled example: unicast gets fe80::, group gets none', () => {
    for (const ex of examples) {
      const r = format(ex.input);
      expect(r.valid).toBe(true);
      const hex = ex.input.replace(/^0x/i, '').replace(/[\s:.\-]/g, '');
      const firstOctet = parseInt(hex.slice(0, 2), 16);
      if ((firstOctet & 0x01) === 0) {
        expect(row(r, LINK_LOCAL_LABEL)).toMatch(/^fe80::/);
      } else {
        expectNoLinkLocal(r);
      }
    }
  });
});

describe('format — invalid input returns an error instead of throwing', () => {
  const bad = [
    '',
    '   ',
    '00:1a:2b:3c:4d',
    '00:1a:2b:3c:4d:5e:6f',
    '00:1a:2b:3c:4d:5g',
    'not a mac',
    '001a2b3c4d5',
    '::::::',
    '0x',
  ];

  for (const input of bad) {
    it(`rejects ${JSON.stringify(input)}`, () => {
      const r = format(input);
      expect(r.valid).toBe(false);
      expect(typeof r.error).toBe('string');
      expect(r.error!.length).toBeGreaterThan(0);
      expect(r.rows).toEqual([]);
    });
  }

  it('does not throw on non-string input', () => {
    // @ts-expect-error — intentionally passing a non-string to prove no throw
    expect(() => format(undefined)).not.toThrow();
    // @ts-expect-error — intentionally passing a non-string to prove no throw
    expect(format(null).valid).toBe(false);
  });
});

import { describe, it, expect } from 'vitest';
import { calculate } from './engine';
import { examples } from './examples';
import type { SubnetResult, SubnetStat, SubnetRow } from './types';

/** Thin space (U+2009) used for display-only digit grouping. */
const THIN = ' ';

/** Look up an answer tile by its label. */
function stat(result: SubnetResult, label: string): SubnetStat {
  const found = result.stats.find((s) => s.label === label);
  if (!found) throw new Error(`no stat labelled "${label}"`);
  return found;
}

/** Look up a row by its group heading and label. */
function row(result: SubnetResult, group: string, label: string): SubnetRow {
  const g = result.groups.find((x) => x.heading === group);
  if (!g) throw new Error(`no group headed "${group}"`);
  const found = g.rows.find((r) => r.label === label);
  if (!found) throw new Error(`no row labelled "${label}" in group "${group}"`);
  return found;
}

/** Every label that appears anywhere in the grouped rows. */
function allRowLabels(result: SubnetResult): string[] {
  return result.groups.flatMap((g) => g.rows.map((r) => r.label));
}

describe('subnet-calculator calculate()', () => {
  describe('IPv4 /24 — full fact-check of 192.168.1.0/24', () => {
    const r = calculate('192.168.1.0/24');

    it('is valid IPv4 with the canonical title and normalized input', () => {
      expect(r.valid).toBe(true);
      expect(r.version).toBe(4);
      expect(r.title).toBe('192.168.1.0/24');
      expect(r.normalized).toBe('192.168.1.0/24');
      expect(r.note).toBeUndefined();
    });

    it('puts Usable hosts first as the hero tile', () => {
      expect(r.stats[0].label).toBe('Usable hosts');
      expect(r.stats[0].value).toBe('254');
    });

    it('renders the usable range tile with an ASCII-hyphen value and en-dash display', () => {
      const range = stat(r, 'Usable range');
      expect(range.value).toBe('192.168.1.1-192.168.1.254');
      expect(range.display).toBe('192.168.1.1 – 192.168.1.254');
      expect(range.mono).toBe(true);
    });

    it('counts 256 total addresses', () => {
      expect(stat(r, 'Total addresses').value).toBe('256');
    });

    it('renders the Addressing group', () => {
      expect(row(r, 'Addressing', 'Network address').value).toBe('192.168.1.0');
      expect(row(r, 'Addressing', 'Broadcast address').value).toBe('192.168.1.255');
      expect(row(r, 'Addressing', 'Usable host range').value).toBe(
        '192.168.1.1-192.168.1.254',
      );
    });

    it('renders the Masks group with glosses', () => {
      expect(row(r, 'Masks', 'Netmask').value).toBe('255.255.255.0');
      const wildcard = row(r, 'Masks', 'Wildcard mask');
      expect(wildcard.value).toBe('0.0.0.255');
      expect(wildcard.gloss).toBe(
        'Inverse of the netmask — the match form Cisco ACLs and OSPF expect.',
      );
      const binary = row(r, 'Masks', 'Netmask (binary)');
      expect(binary.value).toBe('11111111.11111111.11111111.00000000');
      expect(binary.gloss).toBe('The mask bit by bit — the 1s are the network part.');
    });

    it('renders the Details group', () => {
      expect(row(r, 'Details', 'Address type').value).toBe('Private (RFC 1918)');
      const integer = row(r, 'Details', 'Network (integer)');
      expect(integer.value).toBe('3232235776');
      expect(integer.gloss).toBe(
        'The network address as a single 32-bit number, as scripts and databases store it.',
      );
    });

    it('summarises as "/24 — 254 usable hosts"', () => {
      expect(r.summary).toBe('/24 — 254 usable hosts');
    });

    it('does not echo the input as an Address row', () => {
      expect(allRowLabels(r)).not.toContain('Address');
    });
  });

  describe('host inside a block', () => {
    it('masks 192.168.1.73/24 to the network but keeps the host in normalized', () => {
      const r = calculate('192.168.1.73/24');
      expect(r.valid).toBe(true);
      expect(r.title).toBe('192.168.1.0/24');
      expect(r.normalized).toBe('192.168.1.73/24');
      expect(r.note).toBe(
        '192.168.1.73 is a host inside 192.168.1.0/24 — results are for the whole block.',
      );
    });

    it('omits the note when the input is the network address', () => {
      expect(calculate('10.0.0.0/8').note).toBeUndefined();
    });
  });

  describe('IPv4 /31 — RFC 3021 point-to-point', () => {
    const r = calculate('203.0.113.4/31');

    it('reports 2 usable hosts with the RFC 3021 caption', () => {
      const hosts = stat(r, 'Usable hosts');
      expect(hosts.value).toBe('2');
      expect(hosts.caption).toBe('Point-to-point — RFC 3021');
      expect(stat(r, 'Total addresses').value).toBe('2');
    });

    it('spans both addresses in the range tile', () => {
      expect(stat(r, 'Usable range').value).toBe('203.0.113.4-203.0.113.5');
    });

    it('labels the last address "Last address", not "Broadcast address"', () => {
      expect(row(r, 'Addressing', 'Last address').value).toBe('203.0.113.5');
      expect(allRowLabels(r)).not.toContain('Broadcast address');
    });

    it('summarises with the RFC reference', () => {
      expect(r.summary).toBe('/31 — 2 usable hosts (RFC 3021)');
    });
  });

  describe('IPv4 /32 — single host route', () => {
    const r = calculate('192.0.2.7/32');

    it('reports 1 usable host with the single-host caption', () => {
      const hosts = stat(r, 'Usable hosts');
      expect(hosts.value).toBe('1');
      expect(hosts.caption).toBe('Single host route');
      expect(stat(r, 'Total addresses').value).toBe('1');
    });

    it('shows a Host address tile instead of a range', () => {
      expect(stat(r, 'Host address').value).toBe('192.0.2.7');
      expect(r.stats.find((s) => s.label === 'Usable range')).toBeUndefined();
    });

    it('labels the last address "Last address" and summarises as 1 host', () => {
      expect(row(r, 'Addressing', 'Last address').value).toBe('192.0.2.7');
      expect(allRowLabels(r)).not.toContain('Broadcast address');
      expect(r.summary).toBe('/32 — 1 host');
    });

    it('treats a bare IPv4 address as /32', () => {
      const bare = calculate('192.0.2.7');
      expect(bare.valid).toBe(true);
      expect(bare.title).toBe('192.0.2.7/32');
      expect(bare.normalized).toBe('192.0.2.7/32');
    });
  });

  describe('IPv4 10.0.0.0/8', () => {
    const r = calculate('10.0.0.0/8');

    it('computes the large-block counts with grouped displays', () => {
      const hosts = stat(r, 'Usable hosts');
      expect(hosts.value).toBe('16777214');
      expect(hosts.display).toBe(`16${THIN}777${THIN}214`);
      const total = stat(r, 'Total addresses');
      expect(total.value).toBe('16777216');
      expect(total.display).toBe(`16${THIN}777${THIN}216`);
    });

    it('reports the bounds, mask and type', () => {
      expect(row(r, 'Addressing', 'Network address').value).toBe('10.0.0.0');
      expect(row(r, 'Addressing', 'Broadcast address').value).toBe('10.255.255.255');
      expect(row(r, 'Masks', 'Netmask').value).toBe('255.0.0.0');
      expect(row(r, 'Masks', 'Wildcard mask').value).toBe('0.255.255.255');
      expect(row(r, 'Details', 'Address type').value).toBe('Private (RFC 1918)');
    });
  });

  describe('IPv4 0.0.0.0/0 — the whole space', () => {
    const r = calculate('0.0.0.0/0');

    it('is valid and spans everything', () => {
      expect(r.valid).toBe(true);
      expect(r.title).toBe('0.0.0.0/0');
      expect(row(r, 'Addressing', 'Network address').value).toBe('0.0.0.0');
      expect(row(r, 'Addressing', 'Broadcast address').value).toBe('255.255.255.255');
      expect(row(r, 'Masks', 'Netmask').value).toBe('0.0.0.0');
      expect(row(r, 'Masks', 'Wildcard mask').value).toBe('255.255.255.255');
      expect(stat(r, 'Usable hosts').value).toBe('4294967294');
      expect(stat(r, 'Total addresses').value).toBe('4294967296');
    });
  });

  describe('IPv6 2001:db8::/48', () => {
    const r = calculate('2001:db8::/48');

    it('is valid IPv6 with the compressed title', () => {
      expect(r.valid).toBe(true);
      expect(r.version).toBe(6);
      expect(r.title).toBe('2001:db8::/48');
      expect(r.normalized).toBe('2001:db8::/48');
    });

    it('shows the total as a power of two when host bits exceed 32', () => {
      const total = r.stats[0];
      expect(total.label).toBe('Total addresses');
      expect(total.value).toBe('2^80');
    });

    it('shows the address range as compressed first-last', () => {
      const range = stat(r, 'Address range');
      expect(range.value).toBe('2001:db8::-2001:db8:0:ffff:ffff:ffff:ffff:ffff');
      expect(range.display).toBe('2001:db8:: – 2001:db8:0:ffff:ffff:ffff:ffff:ffff');
      expect(range.mono).toBe(true);
    });

    it('adds a /64 subnets tile with a thousands-grouped display', () => {
      const subnets = stat(r, '/64 subnets');
      expect(subnets.value).toBe('65536');
      expect(subnets.display).toBe(`65${THIN}536`);
    });

    it('renders the Addressing group with an expanded row and Last address', () => {
      expect(row(r, 'Addressing', 'Network address').value).toBe('2001:db8::');
      const expanded = row(r, 'Addressing', 'Network (expanded)');
      expect(expanded.value).toBe('2001:0db8:0000:0000:0000:0000:0000:0000');
      expect(expanded.gloss).toBe('All eight groups written out in full.');
      expect(row(r, 'Addressing', 'Last address').value).toBe(
        '2001:db8:0:ffff:ffff:ffff:ffff:ffff',
      );
    });

    it('drops the old First address and Prefix length rows', () => {
      const labels = allRowLabels(r);
      expect(labels).not.toContain('First address');
      expect(labels).not.toContain('Prefix length');
      expect(labels).not.toContain('Network (compressed)');
    });

    it('classifies the documentation prefix', () => {
      expect(row(r, 'Details', 'Address type').value).toBe('Documentation (2001:db8::/32)');
    });

    it('summarises as a power of two', () => {
      expect(r.summary).toBe('/48 — 2^80 addresses');
    });
  });

  describe('IPv6 /64, /127 and /128', () => {
    it('omits the /64 subnets tile at exactly /64', () => {
      const r = calculate('fd00:abcd::/64');
      expect(r.valid).toBe(true);
      expect(r.stats.find((s) => s.label === '/64 subnets')).toBeUndefined();
      expect(stat(r, 'Total addresses').value).toBe('2^64');
      expect(row(r, 'Details', 'Address type').value).toBe('Unique local — ULA (fc00::/7)');
    });

    it('reports exact counts for /127', () => {
      const r = calculate('2001:db8::/127');
      const total = stat(r, 'Total addresses');
      expect(total.value).toBe('2');
      expect(total.caption).toBe('2^1');
      expect(stat(r, 'Address range').value).toBe('2001:db8::-2001:db8::1');
    });

    it('treats /128 as a single host', () => {
      const r = calculate('2001:db8::1/128');
      expect(stat(r, 'Total addresses').value).toBe('1');
      const host = stat(r, 'Host address');
      expect(host.value).toBe('2001:db8::1');
      expect(host.caption).toBe('Single host — /128');
      expect(r.stats.find((s) => s.label === 'Address range')).toBeUndefined();
      expect(r.summary).toBe('/128 — 1 host');
    });

    it('treats a bare IPv6 address as /128', () => {
      const r = calculate('2001:db8::1');
      expect(r.valid).toBe(true);
      expect(r.title).toBe('2001:db8::1/128');
      expect(r.summary).toBe('/128 — 1 host');
    });
  });

  describe('netmask input forms', () => {
    it('"addr mask" equals the /24 CIDR result', () => {
      expect(calculate('192.168.1.0 255.255.255.0')).toEqual(calculate('192.168.1.0/24'));
    });

    it('"addr/mask" equals the /24 CIDR result', () => {
      expect(calculate('192.168.1.0/255.255.255.0')).toEqual(calculate('192.168.1.0/24'));
    });

    it('round-trips a host + mask through normalized', () => {
      const r = calculate('192.168.1.73 255.255.255.0');
      expect(r.valid).toBe(true);
      expect(r.normalized).toBe('192.168.1.73/24');
      expect(r.title).toBe('192.168.1.0/24');
    });

    it('reads 255.255.255.255 as /32', () => {
      const r = calculate('192.168.1.10 255.255.255.255');
      expect(r.valid).toBe(true);
      expect(r.title).toBe('192.168.1.10/32');
      expect(r.normalized).toBe('192.168.1.10/32');
    });

    it('reads 0.0.0.0 as a valid /0 mask', () => {
      const r = calculate('192.168.1.10 0.0.0.0');
      expect(r.valid).toBe(true);
      expect(r.title).toBe('0.0.0.0/0');
      expect(r.normalized).toBe('192.168.1.10/0');
    });

    it('collapses extra whitespace around and between tokens', () => {
      expect(calculate('  192.168.1.0    255.255.255.0  ')).toEqual(
        calculate('192.168.1.0/24'),
      );
    });
  });

  describe('netmask rejections (exact strings)', () => {
    it('rejects a non-contiguous mask', () => {
      const r = calculate('192.168.1.0 255.0.255.0');
      expect(r.valid).toBe(false);
      expect(r.error).toBe(
        '255.0.255.0 is not a contiguous netmask — the 1-bits must run unbroken from the left, like 255.255.240.0.',
      );
    });

    it('recognises a wildcard mask and suggests the fix', () => {
      const r = calculate('192.168.1.0 0.0.0.255');
      expect(r.valid).toBe(false);
      expect(r.error).toBe(
        '0.0.0.255 looks like a wildcard mask. As a prefix that is /24 — try 192.168.1.0/24 or 192.168.1.0 255.255.255.0.',
      );
    });

    it('rejects a dotted mask on an IPv6 address', () => {
      const r = calculate('2001:db8:: 255.255.255.0');
      expect(r.valid).toBe(false);
      expect(r.error).toBe(
        'Dotted netmasks are IPv4-only — write IPv6 with a prefix, like 2001:db8::/48.',
      );
    });

    it('suggests joining a bare prefix number with a slash', () => {
      const r = calculate('192.168.1.0 24');
      expect(r.valid).toBe(false);
      expect(r.error).toBe('To set the prefix length, join it with a slash: 192.168.1.0/24.');
    });

    it('rejects an unreadable second token', () => {
      const r = calculate('192.168.1.0 banana');
      expect(r.valid).toBe(false);
      expect(r.error).toBe(
        'Couldn\'t read "banana" as a netmask — use a prefix (/24) or a dotted netmask (255.255.255.0).',
      );
    });

    it('rejects three or more tokens', () => {
      const r = calculate('192.168.1.0 255.255.255.0 extra');
      expect(r.valid).toBe(false);
      expect(r.error).toBe('Enter one address with an optional prefix or netmask — got 3 parts.');
    });
  });

  describe('targeted diagnostics (exact strings)', () => {
    const cases: Array<[string, string]> = [
      ['192.168.300.1/24', 'Octet 300 is greater than 255 — each octet runs 0–255.'],
      ['192.168.1/24', 'Expected 4 dot-separated octets but found 3.'],
      ['192.168.1.0./24', 'Remove the trailing dot — an IPv4 address has 4 octets, like 192.168.1.0.'],
      ['192..1.0/24', 'Empty octet — two dots in a row?'],
      ['192.168.1.abc/24', '"abc" is not a decimal octet (0–255).'],
      ['192.168.1.0/33', '/33 is too long for IPv4 — the prefix can be 0–32.'],
      ['2001:db8::/129', '/129 is too long for IPv6 — the prefix can be 0–128.'],
      [
        '192.168.1.0/abc',
        'The part after "/" should be a prefix length or a dotted netmask like 255.255.255.0.',
      ],
      ['2001:db8::zz/48', 'Group "zz" is not valid hexadecimal.'],
      ['12345::1/64', 'Group "12345" has more than 4 hex digits.'],
      ['1::2::3', 'An IPv6 address can contain "::" at most once.'],
      ['1:2:3:4:5:6:7/64', 'Expected 8 colon-separated groups (or use "::") but found 7.'],
      ['hello', 'Not a valid IPv4/IPv6 address or CIDR. Try 10.0.0.0/8 or 2001:db8::/48.'],
    ];
    for (const [input, error] of cases) {
      it(`"${input}" → ${error}`, () => {
        const r = calculate(input);
        expect(r.valid).toBe(false);
        expect(r.error).toBe(error);
        expect(r.stats).toEqual([]);
        expect(r.groups).toEqual([]);
      });
    }
  });

  describe('empty input', () => {
    const EMPTY = 'Enter an IP address with a prefix, like 192.168.1.0/24.';

    it('flags an empty string with the empty-input message', () => {
      const r = calculate('');
      expect(r.valid).toBe(false);
      expect(r.error).toBe(EMPTY);
    });

    it('flags whitespace-only input with the same message', () => {
      const r = calculate('   ');
      expect(r.valid).toBe(false);
      expect(r.error).toBe(EMPTY);
    });
  });

  describe('robustness', () => {
    it('never throws on hostile input', () => {
      const hostile = [
        '',
        '   ',
        '/24',
        '/',
        '//',
        '1.2.3.4//24',
        '.',
        '..',
        '........',
        ':',
        ':::',
        '::/',
        '::%',
        '🙂',
        'NaN',
        '0x1/24',
        '192.168.1.0/',
        '192.168.1.0 /24',
        '192.168.1.0/ 24',
        '255.255.255.0 192.168.1.0',
        '192.168.1.0/24/24',
        '1'.repeat(5000),
        '1.2.3.4 5.6.7.8 9.10.11.12 13.14.15.16',
        'fe80::1%eth0/64',
        `10.0.0.0/${'9'.repeat(400)}`,
      ];
      for (const bad of hostile) expect(() => calculate(bad), bad).not.toThrow();
    });

    it('keeps every value free of thin spaces (grouping is display-only)', () => {
      const inputs = [
        ...examples.map((e) => e.input),
        '0.0.0.0/0',
        '10.0.0.0/8',
        '2001:db8::/48',
        '2001:db8::/100',
        '2001:db8::1/128',
      ];
      for (const input of inputs) {
        const r = calculate(input);
        expect(r.valid, input).toBe(true);
        for (const s of r.stats) expect(s.value, `${input} / ${s.label}`).not.toContain(THIN);
        for (const g of r.groups)
          for (const rw of g.rows) expect(rw.value, `${input} / ${rw.label}`).not.toContain(THIN);
      }
    });
  });

  describe('the bundled examples', () => {
    it('keeps 192.168.1.0/24 as the first (seed) example', () => {
      expect(examples[0].input).toBe('192.168.1.0/24');
    });

    it('every example calculates to a valid result', () => {
      for (const ex of examples) {
        const r = calculate(ex.input);
        expect(r.valid, `${ex.label} should be valid`).toBe(true);
        expect(r.error).toBeUndefined();
        expect(r.stats.length).toBeGreaterThan(0);
        expect(r.groups.length).toBeGreaterThan(0);
        expect(r.summary).toBeTruthy();
        expect(r.normalized).toBeTruthy();
      }
    });

    it('covers the netmask input form', () => {
      expect(examples.map((e) => e.input)).toContain('192.168.1.0 255.255.255.0');
    });
  });
});

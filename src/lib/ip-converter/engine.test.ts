import { describe, it, expect } from 'vitest';
import { convert } from './engine';
import { examples } from './examples';
import type { ConvertResult, ConvertRow } from './types';

/** Thin space (U+2009) used for display grouping. */
const THIN = '\u2009';

/** Look up a single rendered row's value by its label. */
function row(result: ConvertResult, label: string): string {
  const found = result.rows.find((r) => r.label === label);
  if (!found) throw new Error(`no row labelled "${label}"`);
  return found.value;
}

/** Look up the full row object by its label. */
function rowObj(result: ConvertResult, label: string): ConvertRow {
  const found = result.rows.find((r) => r.label === label);
  if (!found) throw new Error(`no row labelled "${label}"`);
  return found;
}

describe('ip-converter convert()', () => {
  describe('IPv4 — every representation of 192.168.1.10', () => {
    it('renders the full 7-row table from dotted decimal', () => {
      const r = convert('192.168.1.10');
      expect(r.valid).toBe(true);
      expect(r.version).toBe(4);
      expect(r.detected).toBe('dotted decimal');
      expect(r.rows.map((x) => x.label)).toEqual([
        'Dotted decimal',
        'Integer (decimal)',
        'Hexadecimal',
        'Binary',
        'Hex (byte-swapped)',
        'PTR name',
        'Address type',
      ]);
      expect(row(r, 'Dotted decimal')).toBe('192.168.1.10');
      expect(row(r, 'Integer (decimal)')).toBe('3232235786');
      expect(row(r, 'Hexadecimal')).toBe('0xC0A8010A');
      expect(row(r, 'Binary')).toBe('11000000.10101000.00000001.00001010');
      expect(row(r, 'Hex (byte-swapped)')).toBe('0x0A01A8C0');
      expect(row(r, 'PTR name')).toBe('10.1.168.192.in-addr.arpa');
      expect(row(r, 'Address type')).toBe('Private (RFC 1918)');
    });

    it('converts integer, 0x hex, and bare binary to the same dotted decimal', () => {
      for (const input of ['3232235786', '0xC0A8010A', '11000000101010000000000100001010']) {
        expect(row(convert(input), 'Dotted decimal'), input).toBe('192.168.1.10');
      }
    });

    it('round-trips the dotted Binary row back through convert()', () => {
      const binary = row(convert('192.168.1.10'), 'Binary');
      const back = convert(binary);
      expect(back.valid).toBe(true);
      expect(back.detected).toBe('binary (32-bit)');
      expect(row(back, 'Dotted decimal')).toBe('192.168.1.10');
    });

    it('never tags Hex (byte-swapped) as the input row', () => {
      const r = convert('0x0A01A8C0'); // itself a valid address (10.1.168.192)
      expect(row(r, 'Dotted decimal')).toBe('10.1.168.192');
      expect(rowObj(r, 'Hexadecimal').isInput).toBe(true);
      expect(rowObj(r, 'Hex (byte-swapped)').isInput).toBeUndefined();
      expect(row(r, 'Hex (byte-swapped)')).toBe('0xC0A8010A');
    });
  });

  describe('display grouping (thin space U+2009)', () => {
    it('groups the integer row in 3s when it has 5+ digits', () => {
      const r = convert('192.168.1.10');
      expect(rowObj(r, 'Integer (decimal)').display).toBe(`3${THIN}232${THIN}235${THIN}786`);
    });

    it('omits the integer display under 5 digits', () => {
      expect(rowObj(convert('0.0.0.1'), 'Integer (decimal)').display).toBeUndefined();
    });

    it('groups hex rows in 4s after the 0x', () => {
      const r = convert('192.168.1.10');
      expect(rowObj(r, 'Hexadecimal').display).toBe(`0xC0A8${THIN}010A`);
      expect(rowObj(r, 'Hex (byte-swapped)').display).toBe(`0x0A01${THIN}A8C0`);
    });

    it('keeps raw copyable values free of thin spaces', () => {
      for (const ex of examples) {
        for (const r of convert(ex.input).rows) {
          expect(r.value, `${ex.label} / ${r.label}`).not.toContain(THIN);
        }
      }
    });
  });

  describe('IPv6', () => {
    it('renders compressed, expanded, binary, and PTR rows for 2001:db8::1', () => {
      const r = convert('2001:db8::1');
      expect(r.valid).toBe(true);
      expect(r.version).toBe(6);
      expect(r.detected).toBe('IPv6 literal');
      expect(row(r, 'Compressed')).toBe('2001:db8::1');
      expect(row(r, 'Expanded')).toBe('2001:0db8:0000:0000:0000:0000:0000:0001');
      expect(row(r, 'PTR name')).toBe(
        '1.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.8.b.d.0.1.0.0.2.ip6.arpa',
      );
      expect(row(r, 'Address type')).toBe('Documentation (2001:db8::/32)');
      expect(rowObj(r, 'Compressed').isInput).toBe(true);
      // Conditional rows absent for a plain literal:
      expect(r.rows.find((x) => x.label === 'Embedded IPv4')).toBeUndefined();
      expect(r.rows.find((x) => x.label === 'Zone ID')).toBeUndefined();
    });

    it('round-trips the colon-grouped Binary row back through convert()', () => {
      const binary = row(convert('2001:db8::1'), 'Binary');
      const back = convert(binary);
      expect(back.valid).toBe(true);
      expect(back.detected).toBe('binary (128-bit)');
      expect(row(back, 'Compressed')).toBe('2001:db8::1');
    });

    it('tags Expanded as the input row when the input is fully expanded', () => {
      const r = convert('2001:0DB8:0000:0000:0000:0000:0000:0001');
      expect(rowObj(r, 'Expanded').isInput).toBe(true);
      expect(rowObj(r, 'Compressed').isInput).toBeUndefined();
    });

    it('keeps all-ones-looking hextets as IPv6, never binary', () => {
      const r = convert('1111:1111:1111:1111:1111:1111:1111:1111');
      expect(r.valid).toBe(true);
      expect(r.detected).toBe('IPv6 literal');
      expect(row(r, 'Compressed')).toBe('1111:1111:1111:1111:1111:1111:1111:1111');
    });

    it('adds an Embedded IPv4 row for IPv4-mapped addresses', () => {
      const r = convert('::ffff:192.168.1.10');
      expect(r.valid).toBe(true);
      expect(row(r, 'Embedded IPv4')).toBe('192.168.1.10');
      expect(row(r, 'Address type')).toBe('IPv4-mapped (::ffff:0:0/96)');
    });

    it('reads wide 0x hex as IPv6 even when the value fits 32 bits', () => {
      const r = convert('0x00000000C0A8010A');
      expect(r.valid).toBe(true);
      expect(r.version).toBe(6);
      expect(r.detected).toBe('hexadecimal');
      expect(row(r, 'Compressed')).toBe('::c0a8:10a');
    });
  });

  describe('prefix and zone stripping', () => {
    it('ignores a trailing /prefix with warning W1', () => {
      const r = convert('192.168.1.10/24');
      expect(r.valid).toBe(true);
      expect(row(r, 'Dotted decimal')).toBe('192.168.1.10');
      expect(r.warnings).toEqual([
        'Prefix /24 was ignored — this tool converts the single address only. For network math, use the Subnet Calculator.',
      ]);
    });

    it('errors on a /prefix with no address (E15)', () => {
      const r = convert('/24');
      expect(r.valid).toBe(false);
      expect(r.error).toBe('Enter an address before the /prefix.');
    });

    it('splits a %zone into its own row and converts the bare address', () => {
      const r = convert('fe80::1%eth0');
      expect(r.valid).toBe(true);
      expect(row(r, 'Compressed')).toBe('fe80::1');
      expect(row(r, 'Zone ID')).toBe('eth0');
      expect(row(r, 'Address type')).toBe('Link-local (fe80::/10)');
      expect(rowObj(r, 'Zone ID').isInput).toBeUndefined();
    });

    it('handles zone and prefix together (fe80::1%eth0/64)', () => {
      const r = convert('fe80::1%eth0/64');
      expect(r.valid).toBe(true);
      expect(row(r, 'Zone ID')).toBe('eth0');
      expect(r.warnings).toEqual([
        'Prefix /64 was ignored — this tool converts the single address only. For network math, use the Subnet Calculator.',
      ]);
    });

    it('warns on an empty zone ID (fe80::1%) instead of stripping it silently', () => {
      const r = convert('fe80::1%');
      expect(r.valid).toBe(true);
      expect(row(r, 'Compressed')).toBe('fe80::1');
      expect(r.rows.find((x) => x.label === 'Zone ID')).toBeUndefined();
      expect(r.warnings).toEqual(['Empty zone ID after "%" was ignored.']);
    });

    it('omits warnings entirely when there are none (never [])', () => {
      expect(convert('192.168.1.10').warnings).toBeUndefined();
    });

    it('never attaches warnings to invalid results', () => {
      const r = convert('999.1.1.1/24');
      expect(r.valid).toBe(false);
      expect(r.error).toBe('Octet 999 is greater than 255.');
      expect(r.warnings).toBeUndefined();
    });
  });

  describe('bare hexadecimal (no 0x)', () => {
    it('reads 8 hex digits as an IPv4 value', () => {
      const r = convert('0A01A8C0');
      expect(r.valid).toBe(true);
      expect(r.detected).toBe('hexadecimal (no 0x prefix)');
      expect(row(r, 'Dotted decimal')).toBe('10.1.168.192');
      expect(rowObj(r, 'Hexadecimal').isInput).toBe(true);
    });

    it('reads 32 hex digits as an IPv6 value', () => {
      const r = convert('20010db8000000000000000000000001');
      expect(r.valid).toBe(true);
      expect(r.version).toBe(6);
      expect(row(r, 'Compressed')).toBe('2001:db8::1');
    });

    it('rejects other widths with E9', () => {
      const r = convert('ABCDEF');
      expect(r.valid).toBe(false);
      expect(r.error).toBe(
        'Bare hexadecimal must be exactly 8 digits (IPv4) or 32 digits (IPv6) — got 6. Add a 0x prefix to convert by value instead.',
      );
    });
  });

  describe('leading-zero octets (W2)', () => {
    it('parses 010.0.0.1 as decimal with the octal warning', () => {
      const r = convert('010.0.0.1');
      expect(r.valid).toBe(true);
      expect(row(r, 'Dotted decimal')).toBe('10.0.0.1');
      expect(r.warnings).toEqual([
        'Octet "010" has a leading zero — read as decimal 10 here, but inet_aton-style parsers would read it as octal.',
      ]);
    });
  });

  describe('targeted errors (exact strings)', () => {
    const cases: Array<[string, string]> = [
      ['192.168.1', 'Expected 4 dot-separated octets but found 3.'],
      ['192.168.1.10.', 'Remove the trailing dot — an IPv4 address is 4 octets like 192.168.1.10.'],
      ['192..1.10', 'Empty octet — two dots in a row?'],
      ['192.168.1.999', 'Octet 999 is greater than 255.'],
      ['192.168.1.abc', '"abc" is not a decimal octet (0–255).'],
      ['0x' + '0'.repeat(33), 'That hexadecimal value is wider than 128 bits (33 hex digits).'],
      ['9'.repeat(40), 'That integer is larger than a 128-bit address.'],
      ['1::2::3', 'An IPv6 address can contain "::" at most once.'],
      ['12345::1', 'Group "12345" has more than 4 hex digits.'],
      ['xyz::1', 'Group "xyz" is not valid hexadecimal.'],
      ['1:2:3:4:5:6:7', 'Expected 8 colon-separated groups (or use "::") but found 7.'],
      [':::', 'Could not read that as an IPv6 address.'],
      ['hello world', 'Could not read that as an IPv4 or IPv6 address in any supported form.'],
    ];
    for (const [input, error] of cases) {
      it(`"${input.length > 40 ? input.slice(0, 40) + '…' : input}" → ${error}`, () => {
        const r = convert(input);
        expect(r.valid).toBe(false);
        expect(r.error).toBe(error);
        expect(r.rows).toEqual([]);
      });
    }

    it('rejects 31-bit dotted binary with the binary-length error, not an octet error', () => {
      const r = convert('1100000.10101000.00000001.00001010');
      expect(r.valid).toBe(false);
      expect(r.error).toBe('Binary input must be 32 bits (IPv4) or 128 bits (IPv6) — got 31.');
    });

    it('rejects truncated colon-grouped binary with the binary-length error', () => {
      const truncated = row(convert('2001:db8::1'), 'Binary').slice(0, -1);
      const r = convert(truncated);
      expect(r.valid).toBe(false);
      expect(r.error).toBe('Binary input must be 32 bits (IPv4) or 128 bits (IPv6) — got 127.');
    });
  });

  describe('isInput tagging', () => {
    it('tags exactly one row on every valid conversion', () => {
      const inputs = [
        ...examples.map((e) => e.input),
        '3232235786',
        '0x00000000C0A8010A',
        'fe80::1%eth0',
        '192.168.1.10/24',
      ];
      for (const input of inputs) {
        const r = convert(input);
        expect(r.valid, input).toBe(true);
        expect(r.rows.filter((x) => x.isInput).length, input).toBe(1);
      }
    });

    it('maps each detected format to its fixed row', () => {
      expect(rowObj(convert('192.168.1.10'), 'Dotted decimal').isInput).toBe(true);
      expect(rowObj(convert('3232235786'), 'Integer (decimal)').isInput).toBe(true);
      expect(rowObj(convert('0xC0A8010A'), 'Hexadecimal').isInput).toBe(true);
      expect(rowObj(convert('11000000.10101000.00000001.00001010'), 'Binary').isInput).toBe(true);
    });
  });

  describe('the documented examples', () => {
    it('keeps 192.168.1.10 as the first (seed) example', () => {
      expect(examples[0].input).toBe('192.168.1.10');
    });

    it('every bundled example parses to a valid result', () => {
      for (const ex of examples) {
        const r = convert(ex.input);
        expect(r.valid, `${ex.label} should be valid`).toBe(true);
        expect(r.error).toBeUndefined();
        expect(r.rows.length).toBeGreaterThan(0);
      }
    });

    it('covers binary, bare hex, and IPv4-mapped inputs', () => {
      const inputs = examples.map((e) => e.input);
      expect(inputs).toContain('11000000.10101000.00000001.00001010');
      expect(inputs).toContain('0A01A8C0');
      expect(inputs).toContain('::ffff:192.168.1.10');
    });
  });

  describe('invalid input', () => {
    it('flags an empty string without throwing', () => {
      const r = convert('');
      expect(r.valid).toBe(false);
      expect(r.error).toBe(
        'Enter an IP in any form: 192.168.1.10, 3232235786, 0xC0A8010A, or 2001:db8::1.',
      );
      expect(r.rows).toEqual([]);
    });

    it('flags whitespace-only input', () => {
      const r = convert('   ');
      expect(r.valid).toBe(false);
      expect(r.rows).toEqual([]);
    });

    it('never throws on hostile input', () => {
      const hostile = [
        '',
        '   ',
        '/24',
        '%eth0',
        '0x',
        ':::',
        '..',
        '.',
        '/',
        '%',
        '🙂',
        'NaN',
        '0x/24',
        '::%',
        '%::',
        'fe80::1%',
        '1.2.3.4%5',
        '1'.repeat(5000),
        '0'.repeat(129),
        '........',
        ':',
        '::/0',
        'g::1',
        '1:2:3:4:5:6:7:8:9',
        '0b101',
        ' 192 . 168 . 1 . 10 ',
      ];
      for (const bad of hostile) expect(() => convert(bad)).not.toThrow();
    });
  });
});

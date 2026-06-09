/**
 * Reverse DNS / PTR Helper — engine. Turns an IP (or IP/prefix) into its PTR
 * record name, the reverse-delegation zone for the prefix, and a ready-to-run
 * `dig -x` command. Pure + browser-safe; never throws on user input.
 *
 * IPv4 uses the `in-addr.arpa` tree (one label per octet, reversed); IPv6 uses
 * the `ip6.arpa` tree (one label per nibble, reversed). Reverse zones delegate
 * on octet (IPv4) / nibble (IPv6) boundaries — prefixes that fall between those
 * boundaries get a note about RFC 2317 classless delegation (IPv4) or nibble
 * delegation (IPv6).
 */
import {
  parseCidr,
  networkAddr,
  ipv4ToString,
  ipv6Compress,
  ipv6Expand,
} from '../ip-core';
import type { PtrResult, PtrRow } from './types';

const ERR_PARSE =
  'Enter an IP or IP/prefix, e.g. 192.0.2.1, 192.0.2.0/24, or 2001:db8::1.';

function bad(error: string): PtrResult {
  return { valid: false, error, rows: [] };
}

/** Dotted octets of a 32-bit value, most-significant first. */
function v4Octets(v: bigint): number[] {
  return [
    Number((v >> 24n) & 0xffn),
    Number((v >> 16n) & 0xffn),
    Number((v >> 8n) & 0xffn),
    Number(v & 0xffn),
  ];
}

export function generate(input: string): PtrResult {
  const s = (input ?? '').trim();
  if (s.length === 0) return bad(ERR_PARSE);

  const c = parseCidr(s);
  if (!c) return bad(ERR_PARSE);

  const net = networkAddr(c);
  const rows: PtrRow[] = [];

  if (c.version === 4) {
    // PTR name is built from the ADDRESS exactly as supplied, octets reversed.
    const octets = v4Octets(c.addr);
    rows.push({
      label: 'PTR record name',
      value: [...octets].reverse().join('.') + '.in-addr.arpa',
      mono: true,
    });

    // Reverse zone delegates on octet boundaries.
    const netOctets = v4Octets(net);
    if (c.prefix % 8 === 0 && c.prefix > 0 && c.prefix < 32) {
      const netLabels = c.prefix / 8; // number of network octets
      rows.push({
        label: 'Reverse zone',
        value: netOctets.slice(0, netLabels).reverse().join('.') + '.in-addr.arpa',
        mono: true,
      });
    } else {
      // A bare host (/32) or a non-octet prefix uses its enclosing /24 zone.
      rows.push({
        label: 'Reverse zone',
        value: netOctets.slice(0, 3).reverse().join('.') + '.in-addr.arpa',
        mono: true,
      });
      if (c.prefix % 8 !== 0) {
        rows.push({
          label: 'Note',
          value:
            'Prefix is not on an octet boundary — RFC 2317 classless delegation ' +
            'applies; the parent delegates the enclosing /24 zone above.',
        });
      }
    }

    // dig the ADDRESS as supplied, so the command matches the PTR record name above
    // (for a bare host the address is the network, so this is unchanged there).
    rows.push({ label: 'dig command', value: 'dig -x ' + ipv4ToString(c.addr), mono: true });

    return { valid: true, version: 4, rows };
  }

  // IPv6: 32 nibbles from the expanded address, reversed, dot-separated.
  const nibblesOf = (v: bigint): string => ipv6Expand(v).replace(/:/g, '');

  rows.push({
    label: 'PTR record name',
    value: nibblesOf(c.addr).split('').reverse().join('.') + '.ip6.arpa',
    mono: true,
  });

  // Reverse zone delegates on nibble (4-bit) boundaries. A bare host uses /64.
  const bareHost = c.prefix === 128;
  const effPrefix = bareHost ? 64 : c.prefix;
  const nibbleCount = Math.floor(effPrefix / 4);
  const netNibbles = nibblesOf(net);
  rows.push({
    label: 'Reverse zone',
    value:
      netNibbles.slice(0, nibbleCount).split('').reverse().join('.') + '.ip6.arpa',
    mono: true,
  });
  if (!bareHost && c.prefix % 4 !== 0) {
    rows.push({
      label: 'Note',
      value:
        'Prefix is not on a nibble boundary — IPv6 reverse delegation happens on ' +
        '4-bit (nibble) boundaries, so the zone is rounded down to /' +
        nibbleCount * 4 + '.',
    });
  }

  // dig the ADDRESS as supplied so it matches the PTR record name above.
  rows.push({ label: 'dig command', value: 'dig -x ' + ipv6Compress(c.addr), mono: true });

  return { valid: true, version: 6, rows };
}

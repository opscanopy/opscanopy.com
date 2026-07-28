/**
 * Reverse DNS / PTR Helper — engine. Turns an IP (or IP/prefix) into its PTR
 * record name, the reverse-delegation zone for the prefix, and a ready-to-run
 * `dig -x` command. Pure + browser-safe; never throws on user input.
 *
 * IPv4 uses the `in-addr.arpa` tree (one label per octet, reversed); IPv6 uses
 * the `ip6.arpa` tree (one label per nibble, reversed). Reverse zones delegate
 * on octet (IPv4) / nibble (IPv6) boundaries. Prefixes that fall between those
 * boundaries are reported at the nearest zone *above* the block (round down)
 * plus a note explaining what that means:
 *
 *   - IPv4 longer than /24 → the block sits inside a single /24, so RFC 2317
 *     classless delegation applies. This is the ONLY case where RFC 2317 is
 *     relevant; it is about delegating sub-/24 blocks.
 *   - IPv4 shorter than /24 → the block SPANS several sibling zones one level
 *     down (a /12 spans 16 /16-level zones), so the note counts them and names
 *     the first and last.
 *   - IPv6 off a nibble boundary → the zone rounds down to the nibble below.
 *   - Anything shorter than a single label (IPv4 /0, IPv6 /0–/3) → the bare
 *     apex, which is the root of the entire reverse tree.
 */
import {
  parseCidr,
  networkAddr,
  lastAddr,
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

    // Reverse zone delegates on octet boundaries, one label per network octet.
    const netOctets = v4Octets(net);
    const v4Zone = (labels: number, octets: number[]): string =>
      labels === 0
        ? 'in-addr.arpa'
        : octets.slice(0, labels).reverse().join('.') + '.in-addr.arpa';

    if (c.prefix === 0) {
      // Shorter than a single label: the apex is the only zone that contains it.
      rows.push({ label: 'Reverse zone', value: 'in-addr.arpa', mono: true });
      rows.push({
        label: 'Note',
        value:
          'A /0 covers the whole IPv4 address space, so the zone is the bare ' +
          'in-addr.arpa apex — the root of the entire IPv4 reverse tree.',
      });
    } else if (c.prefix % 8 === 0 && c.prefix < 32) {
      rows.push({
        label: 'Reverse zone',
        value: v4Zone(c.prefix / 8, netOctets), // one label per network octet
        mono: true,
      });
    } else if (c.prefix > 24) {
      // /25–/32 sits inside one /24, which is the zone the parent delegates.
      rows.push({ label: 'Reverse zone', value: v4Zone(3, netOctets), mono: true });
      if (c.prefix % 8 !== 0) {
        rows.push({
          label: 'Note',
          value:
            'Prefix is longer than /24 but not on an octet boundary — RFC 2317 ' +
            'classless delegation applies; the parent delegates the enclosing ' +
            '/24 zone above.',
        });
      }
    } else {
      // /1–/23 off an octet boundary: the block is BIGGER than one zone at the
      // next level down, so it spans a run of sibling zones. Round the zone
      // down to the enclosing one and count the siblings.
      const downLabels = Math.floor(c.prefix / 8);
      const upLabels = Math.ceil(c.prefix / 8);
      const siblings = 2 ** (upLabels * 8 - c.prefix);
      const lastOctets = v4Octets(lastAddr(c));
      rows.push({ label: 'Reverse zone', value: v4Zone(downLabels, netOctets), mono: true });
      rows.push({
        label: 'Note',
        value:
          'Prefix is not on an octet boundary — reverse DNS delegates one label ' +
          `per octet, so this block spans ${siblings} sibling zones, ` +
          `${v4Zone(upLabels, netOctets)} through ${v4Zone(upLabels, lastOctets)}. ` +
          'The zone above is the closest single zone that contains all of them.',
      });
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
  if (nibbleCount === 0) {
    // Shorter than a single nibble label (/0–/3): the apex is the only zone.
    rows.push({ label: 'Reverse zone', value: 'ip6.arpa', mono: true });
    rows.push({
      label: 'Note',
      value:
        c.prefix === 0
          ? 'A /0 covers the whole IPv6 address space, so the zone is the bare ' +
            'ip6.arpa apex — the root of the entire IPv6 reverse tree.'
          : 'Prefix is shorter than one nibble (4 bits), so the nearest ' +
            'delegation point is the bare ip6.arpa apex — the root of the ' +
            'entire IPv6 reverse tree.',
    });
  } else {
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
  }

  // dig the ADDRESS as supplied so it matches the PTR record name above.
  rows.push({ label: 'dig command', value: 'dig -x ' + ipv6Compress(c.addr), mono: true });

  return { valid: true, version: 6, rows };
}

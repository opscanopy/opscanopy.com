/**
 * Subnet / CIDR Calculator — engine. Parses an IPv4/IPv6 address with a prefix
 * (or a bare address) and returns the network, broadcast/last, masks, host range
 * and counts. Pure + browser-safe; never throws on user input.
 */
import {
  BITS,
  fullMask,
  maskForPrefix,
  networkAddr,
  lastAddr,
  addrCount,
  ipv4ToString,
  ipv4ToBinary,
  ipv6Compress,
  ipv6Expand,
  parseCidr,
  classify,
} from '../ip-core';
import type { SubnetResult, SubnetRow } from './types';

const ERR_EMPTY = 'Enter an address with a prefix, e.g. 192.168.1.0/24 or 2001:db8::/48.';
const ERR_PARSE = 'Not a valid IPv4/IPv6 address or CIDR. Try 10.0.0.0/8 or 2001:db8::/48.';

export function calculate(input: string): SubnetResult {
  const trimmed = (input ?? '').trim();
  if (trimmed.length === 0) return { valid: false, error: ERR_EMPTY, rows: [] };

  const c = parseCidr(trimmed);
  if (!c) return { valid: false, error: ERR_PARSE, rows: [] };

  const { version, prefix } = c;
  const net = networkAddr(c);
  const last = lastAddr(c);
  const mask = maskForPrefix(version, prefix);
  const wildcard = fullMask(version) ^ mask;
  const total = addrCount(c);
  const rows: SubnetRow[] = [];

  if (version === 4) {
    rows.push({ label: 'Address', value: `${ipv4ToString(c.addr)} / ${prefix}`, mono: true });
    rows.push({ label: 'Network address', value: ipv4ToString(net), mono: true });
    rows.push({ label: 'Broadcast address', value: ipv4ToString(last), mono: true });
    rows.push({ label: 'Netmask', value: ipv4ToString(mask), mono: true });
    rows.push({ label: 'Wildcard mask', value: ipv4ToString(wildcard), mono: true });

    let hostRange = '—';
    let usable = '0';
    if (prefix <= 30) {
      hostRange = `${ipv4ToString(net + 1n)} – ${ipv4ToString(last - 1n)}`;
      usable = (total - 2n).toString();
    } else if (prefix === 31) {
      hostRange = `${ipv4ToString(net)} – ${ipv4ToString(last)}`;
      usable = '2  (point-to-point, RFC 3021)';
    } else {
      hostRange = ipv4ToString(net);
      usable = '1  (single host /32)';
    }
    rows.push({ label: 'Usable host range', value: hostRange, mono: true });
    rows.push({ label: 'Usable hosts', value: usable });
    rows.push({ label: 'Total addresses', value: total.toString() });
    rows.push({ label: 'Address type', value: classify(4, net) });
    rows.push({ label: 'Network (integer)', value: net.toString(), mono: true });
    rows.push({ label: 'Netmask (binary)', value: ipv4ToBinary(mask), mono: true });
  } else {
    const hostBits = BITS[6] - prefix;
    const totalLabel =
      total === 1n
        ? '1'
        : hostBits <= 32
          ? `2^${hostBits}  (${total.toString()})`
          : `2^${hostBits}`;
    rows.push({ label: 'Address', value: `${ipv6Compress(c.addr)} / ${prefix}`, mono: true });
    rows.push({ label: 'Network (compressed)', value: ipv6Compress(net), mono: true });
    rows.push({ label: 'Network (expanded)', value: ipv6Expand(net), mono: true });
    rows.push({ label: 'First address', value: ipv6Compress(net), mono: true });
    rows.push({ label: 'Last address', value: ipv6Compress(last), mono: true });
    rows.push({ label: 'Prefix length', value: `/${prefix}` });
    rows.push({ label: 'Total addresses', value: totalLabel });
    rows.push({ label: 'Address type', value: classify(6, net) });
  }

  const title = version === 4 ? `${ipv4ToString(net)}/${prefix}` : `${ipv6Compress(net)}/${prefix}`;
  return { valid: true, version, title, rows };
}

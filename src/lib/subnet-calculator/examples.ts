/**
 * Subnet / CIDR Calculator — bundled examples for the picker. Each `input`
 * calculates cleanly and spans the interesting cases: a home LAN, a big private
 * block, a /30 point-to-point link, and IPv6 site + ULA prefixes.
 */
import type { SubnetExample } from './types';

export const examples: SubnetExample[] = [
  { id: 'v4-home', label: '192.168.1.0/24 — home LAN', input: '192.168.1.0/24' },
  { id: 'v4-ten', label: '10.0.0.0/8 — private /8', input: '10.0.0.0/8' },
  { id: 'v4-p2p', label: '203.0.113.4/30 — point-to-point', input: '203.0.113.4/30' },
  { id: 'v6-site', label: '2001:db8::/48 — IPv6 site', input: '2001:db8::/48' },
  { id: 'v6-ula', label: 'fd00:abcd::/64 — ULA subnet', input: 'fd00:abcd::/64' },
];

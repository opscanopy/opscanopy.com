/**
 * Subnet / CIDR Calculator — bundled example chips. Each `input` calculates
 * cleanly and spans the interesting cases: a home LAN, the netmask input form,
 * a big private block, a /31 point-to-point link, and IPv6 site + ULA prefixes.
 * examples[0] seeds the playground on first load.
 */
import type { SubnetExample } from './types';

export const examples: SubnetExample[] = [
  { id: 'v4-home', label: 'Home LAN /24', input: '192.168.1.0/24' },
  { id: 'v4-mask', label: 'IP + netmask', input: '192.168.1.0 255.255.255.0' },
  { id: 'v4-ten', label: 'Private /8', input: '10.0.0.0/8' },
  { id: 'v4-p2p', label: 'Point-to-point /31', input: '203.0.113.4/31' },
  { id: 'v6-site', label: 'IPv6 site /48', input: '2001:db8::/48' },
  { id: 'v6-ula', label: 'IPv6 ULA /64', input: 'fd00:abcd::/64' },
];

/**
 * Reverse DNS / PTR Helper — bundled examples: a single IPv4 host, an IPv4 /24
 * delegation zone, a single IPv6 host, and an IPv6 /48 nibble-boundary zone.
 */
import type { PtrExample } from './types';

export const examples: PtrExample[] = [
  { id: 'v4-host', label: '192.0.2.1 — IPv4 host', input: '192.0.2.1' },
  { id: 'v4-zone', label: '192.0.2.0/24 — IPv4 /24 zone', input: '192.0.2.0/24' },
  { id: 'v6-host', label: '2001:db8::1 — IPv6 host', input: '2001:db8::1' },
  { id: 'v6-zone', label: '2001:db8::/48 — IPv6 /48 zone', input: '2001:db8::/48' },
];

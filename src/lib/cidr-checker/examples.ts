/**
 * CIDR / Subnet Checker — bundled examples. Each is a multi-line list that
 * demonstrates a useful case: contiguous blocks that aggregate, an overlap /
 * containment pair, and a mixed IPv4 + IPv6 list.
 */
import type { CheckExample } from './types';

export const examples: CheckExample[] = [
  {
    id: 'aggregate',
    label: 'Adjacent blocks that merge',
    input: '192.168.0.0/24\n192.168.1.0/24\n192.168.2.0/24\n192.168.3.0/24',
  },
  {
    id: 'overlap',
    label: 'Overlap + containment',
    input: '10.0.0.0/16\n10.0.5.0/24\n10.0.5.0/24\n172.16.0.0/12',
  },
  {
    id: 'mixed',
    label: 'Mixed IPv4 + IPv6',
    input: '10.1.0.0/24\n10.1.1.0/24\n2001:db8::/33\n2001:db8:8000::/33',
  },
];

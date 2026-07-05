/**
 * CIDR / Subnet Checker — bundled examples. Each is a multi-line list that
 * demonstrates a useful case: an in-range membership check, contiguous blocks
 * that aggregate, an overlap / containment pair, and a mixed IPv4 + IPv6 list.
 */
import type { CheckExample } from './types';

export const examples: CheckExample[] = [
  {
    id: 'membership',
    label: 'Is this IP in range?',
    input: '# is this IP inside any of these ranges?\n10.0.0.5\n10.0.0.0/24\n172.16.0.0/12',
  },
  {
    id: 'aggregate',
    label: 'Merge adjacent blocks',
    input: '192.168.0.0/24\n192.168.1.0/24\n192.168.2.0/24\n192.168.3.0/24',
  },
  {
    id: 'overlap',
    label: 'Find overlaps',
    input: '10.0.0.0/16\n10.0.5.0/24\n10.0.5.0/24\n172.16.0.0/12',
  },
  {
    id: 'mixed',
    label: 'IPv4 + IPv6',
    input: '10.1.0.0/24\n10.1.1.0/24\n2001:db8::/33\n2001:db8:8000::/33',
  },
];

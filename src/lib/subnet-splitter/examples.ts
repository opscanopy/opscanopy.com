/**
 * Subnet Splitter — bundled examples for the picker. Each spans a useful case:
 * a /24 with two /26 allocations split into /26 (shows the free gaps), a clean
 * /16 carved into /24s, and a /22 with a couple of allocations.
 */
import type { SplitExample } from './types';

export const examples: SplitExample[] = [
  {
    id: 'v4-24-into-26',
    label: '10.0.0.0/24 — two /26 allocations, split into /26',
    parent: '10.0.0.0/24',
    allocated: '10.0.0.0/26\n10.0.0.128/26',
    newPrefix: 26,
  },
  {
    id: 'v4-16-into-24',
    label: '10.0.0.0/16 — clean split into /24',
    parent: '10.0.0.0/16',
    allocated: '',
    newPrefix: 24,
  },
  {
    id: 'v4-22-allocations',
    label: '172.16.0.0/22 — a couple of allocations',
    parent: '172.16.0.0/22',
    allocated: '172.16.0.0/24\n172.16.2.0/25',
    newPrefix: 24,
  },
];

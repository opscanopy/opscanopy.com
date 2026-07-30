/**
 * Data Size & Transfer-Rate Converter — the five example chips.
 *
 * Each one exists to answer a question people actually arrive with:
 *   1. `1.5 GiB`   — the boot seed: the exact byte count of an IEC size.
 *   2. `1 TB`      — "is 1 TB 1000 or 1024 GB?", the tool's headline question.
 *   3. `500 GB` over `1 Gbps` — the migration-window case; the only chip that
 *                    fills BOTH bands.
 *   4. `128 Mb`    — bits, not bytes: the Mb/MB trap in one tap.
 *   5. `9.1e5 kB`  — scientific notation and a lowercase-k SI prefix.
 */
import type { DataSizeExample } from './types';

export const examples: DataSizeExample[] = [
  { id: 'gib', label: '1.5 GiB', size: '1.5 GiB', rate: '' },
  { id: 'tb', label: '1 TB — SI vs IEC', size: '1 TB', rate: '' },
  { id: 'transfer', label: '500 GB over 1 Gbps', size: '500 GB', rate: '1 Gbps' },
  { id: 'bits', label: '128 Mb — bits, not bytes', size: '128 Mb', rate: '' },
  { id: 'sci', label: '9.1e5 kB', size: '9.1e5 kB', rate: '' },
];

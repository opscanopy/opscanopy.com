/**
 * MAC Address Formatter — bundled examples for the picker. Each `input`
 * formats cleanly and spans the interesting cases: the canonical colon form,
 * an uppercase hyphen form, Cisco dotted notation, a locally-administered
 * address (U/L bit set), and the all-ones broadcast address.
 */
import type { MacExample } from './types';

export const examples: MacExample[] = [
  { id: 'colon', label: '00:1a:2b:3c:4d:5e — colon (lowercase)', input: '00:1a:2b:3c:4d:5e' },
  { id: 'hyphen', label: '00-1A-2B-3C-4D-5E — hyphen (uppercase)', input: '00-1A-2B-3C-4D-5E' },
  { id: 'dotted', label: '001a.2b3c.4d5e — dotted (Cisco)', input: '001a.2b3c.4d5e' },
  { id: 'local', label: '02:00:00:00:00:01 — locally administered', input: '02:00:00:00:00:01' },
  { id: 'broadcast', label: 'ff:ff:ff:ff:ff:ff — broadcast', input: 'ff:ff:ff:ff:ff:ff' },
];

/**
 * chmod Calculator — bundled example chips. Each entry seeds the octal field of
 * the playground; examples[0] seeds the playground on first load. Shape is
 * `{ id, label, ...inputs }` (mirrors src/lib/subnet-calculator/examples.ts).
 */
import type { ChmodExample } from './types';

export const examples: ChmodExample[] = [
  { id: 'rwxr-xr-x', label: '755 (rwxr-xr-x)', octal: '755' },
  { id: 'rw-r--r--', label: '644 (rw-r--r--)', octal: '644' },
  { id: 'setuid', label: '4755 (setuid)', octal: '4755' },
  { id: 'setgid', label: '2755 (setgid)', octal: '2755' },
  { id: 'sticky', label: '1777 (sticky /tmp)', octal: '1777' },
  { id: 'private', label: '700 (private)', octal: '700' },
];

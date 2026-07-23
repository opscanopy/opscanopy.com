/**
 * UUID / ULID Generator — bundled example chips. Each chip carries the control
 * state it should apply: the generation `mode`/`count`/`uppercase`, and — for
 * the "Inspect a UUID" chip — an `inspect` value that seeds the inspect field
 * with a known identifier. Shape mirrors src/lib/subnet-calculator/examples.ts
 * ({ id, label, ...inputs }) so the chips render server-side.
 */
import type { GenerateMode } from './types';

export interface UuidExample {
  id: string;
  label: string;
  /** Generation mode this chip selects. */
  mode: GenerateMode;
  /** Count to generate. */
  count: number;
  /** Uppercase toggle state. */
  uppercase: boolean;
  /** When present, seeds the inspect field instead of generating. */
  inspect?: string;
}

export const examples: UuidExample[] = [
  { id: 'v4', label: 'v4 UUID', mode: 'v4', count: 5, uppercase: false },
  { id: 'nil', label: 'Nil UUID', mode: 'nil', count: 1, uppercase: false },
  { id: 'ulid', label: 'ULID', mode: 'ulid', count: 5, uppercase: false },
  {
    id: 'inspect',
    label: 'Inspect a UUID',
    mode: 'v4',
    count: 5,
    uppercase: false,
    inspect: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  },
];

/**
 * Reverse DNS / PTR Helper — shared types. `generate()` never throws on user
 * input: it returns `{ valid: false, error }` for anything it can't parse.
 */
import type { IpVersion } from '../ip-core';

export interface PtrRow {
  label: string;
  value: string;
  mono?: boolean;
}

export interface PtrResult {
  valid: boolean;
  error?: string;
  version?: IpVersion;
  rows: PtrRow[];
}

export interface PtrExample {
  id: string;
  label: string;
  input: string;
}

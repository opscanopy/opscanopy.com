/**
 * IP Address Converter — shared types. `convert()` never throws on user input.
 */
import type { IpVersion } from '../ip-core';

export interface ConvertRow {
  label: string;
  value: string;
  mono?: boolean;
}

export interface ConvertResult {
  valid: boolean;
  error?: string;
  version?: IpVersion;
  /** The detected input format, surfaced to the user (e.g. "dotted decimal"). */
  detected?: string;
  rows: ConvertRow[];
}

export interface ConvertExample {
  id: string;
  label: string;
  input: string;
}

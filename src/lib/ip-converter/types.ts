/**
 * IP Address Converter — shared types. `convert()` never throws on user input.
 */
import type { IpVersion } from '../ip-core';

export interface ConvertRow {
  label: string;
  /** RAW copyable value — copy buttons always use this. */
  value: string;
  mono?: boolean;
  /** Optional pretty form (thin-space U+2009 grouping); render `display ?? value`. */
  display?: string;
  /** True on the ONE row echoing the detected input format. */
  isInput?: boolean;
}

export interface ConvertResult {
  valid: boolean;
  error?: string;
  version?: IpVersion;
  /** The detected input format, surfaced to the user (e.g. "dotted decimal"). */
  detected?: string;
  rows: ConvertRow[];
  /** Only ever present on valid results, and only when non-empty (never []). */
  warnings?: string[];
}

export interface ConvertExample {
  id: string;
  label: string;
  input: string;
}

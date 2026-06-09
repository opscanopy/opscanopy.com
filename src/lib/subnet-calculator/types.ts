/**
 * Subnet / CIDR Calculator — shared types for the client-side engine.
 * `calculate()` never throws on user input; bad input yields { valid:false, error }.
 */
import type { IpVersion } from '../ip-core';

/** One labeled output row in the results table. */
export interface SubnetRow {
  label: string;
  value: string;
  /** Render the value in the mono/code face (addresses, masks, integers). */
  mono?: boolean;
}

/** The result of calculating a subnet. */
export interface SubnetResult {
  valid: boolean;
  error?: string;
  version?: IpVersion;
  /** Canonical "network/prefix" title, e.g. "192.168.1.0/24". */
  title?: string;
  rows: SubnetRow[];
}

/** A runnable example for the picker. */
export interface SubnetExample {
  id: string;
  label: string;
  /** An address + prefix that calculates cleanly, e.g. "10.0.0.0/8". */
  input: string;
}

/**
 * CIDR / Subnet Checker — shared types. `check()` parses a list of IPs/CIDRs,
 * finds overlaps + containment between them, and aggregates them into the
 * minimal covering CIDR set. Never throws on user input.
 */
import type { IpVersion } from '../ip-core';

/** One parsed input line. */
export interface CheckEntry {
  line: string;
  ok: boolean;
  version?: IpVersion;
  /** Normalised network/prefix, e.g. "10.0.0.0/24". */
  cidr?: string;
  type?: string;
  error?: string;
}

/** A non-disjoint relationship found between two inputs. */
export interface OverlapPair {
  relation: string;
  kind: 'equal' | 'contains' | 'within' | 'overlaps';
}

/** The minimal covering set for one address family. */
export interface AggGroup {
  version: IpVersion;
  label: string;
  cidrs: string[];
}

export interface CheckResult {
  valid: boolean;
  error?: string;
  entries: CheckEntry[];
  overlaps: OverlapPair[];
  aggregated: AggGroup[];
  stats: { ok: number; invalid: number };
}

export interface CheckExample {
  id: string;
  label: string;
  /** Newline-separated IPs/CIDRs. */
  input: string;
}

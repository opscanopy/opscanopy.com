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
  /**
   * Present when the user supplied a host address (host bits were set) and the
   * engine silently normalised it to the network address, e.g. "10.0.0.5/24"
   * → "10.0.0.0/24". Holds the original raw input string so the UI can warn.
   */
  normalizedFrom?: string;
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

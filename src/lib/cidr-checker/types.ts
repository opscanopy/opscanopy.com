/**
 * CIDR / Subnet Checker — shared types. `check()` parses a list of IPs/CIDRs,
 * answers whether each bare IP is inside any listed range (membership), finds
 * overlaps + containment between range entries, and aggregates everything into
 * the minimal covering CIDR set. Never throws on user input.
 */
import type { IpVersion } from '../ip-core';

/** One parsed input line. */
export interface CheckEntry {
  line: string;
  ok: boolean;
  version?: IpVersion;
  /** Normalised network/prefix, e.g. "10.0.0.0/24". Bare IPs stay /32-suffixed. */
  cidr?: string;
  /** 'ip' when the raw line has no "/" (a bare address to check), 'range' otherwise. */
  role?: 'ip' | 'range';
  /** What the UI prints: the bare IP for hosts, the normalised CIDR for ranges. */
  display?: string;
  type?: string;
  error?: string;
  /**
   * Present when the user supplied a host address (host bits were set) and the
   * engine silently normalised it to the network address, e.g. "10.0.0.5/24"
   * → "10.0.0.0/24". Holds the original raw input string so the UI can warn.
   */
  normalizedFrom?: string;
}

/** The in-range verdict for one bare IP, checked against every listed range. */
export interface MembershipEntry {
  /** The bare IP as displayed (normalised, no /prefix). */
  ip: string;
  version: IpVersion;
  /** 'no-ranges' = there were zero same-family range entries to check against. */
  status: 'in' | 'not-in' | 'no-ranges';
  /** Containing CIDRs, most specific (longest prefix) first. */
  matches: string[];
  /** How many same-family range entries the IP was checked against. */
  rangeCount: number;
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
  /** One verdict per bare-IP line, in input order. */
  membership: MembershipEntry[];
  overlaps: OverlapPair[];
  aggregated: AggGroup[];
  stats: {
    ok: number;
    invalid: number;
    /** Number of overlapping / duplicated / contained pairs found. */
    overlaps: number;
    /** Total aggregated CIDR blocks across both families. */
    blocks: number;
  };
}

export interface CheckExample {
  id: string;
  label: string;
  /** Newline-separated IPs/CIDRs. */
  input: string;
}

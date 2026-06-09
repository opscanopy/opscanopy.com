/**
 * Subnet Splitter — shared types for the client-side engine. `split()` carves a
 * parent prefix into equal-size subnets and/or computes the FREE space left over
 * after a set of allocations. Never throws on user input; bad input yields
 * { valid:false, error }.
 */
import type { IpVersion } from '../ip-core';

/** One parsed allocation line, flagged if it falls outside the parent / wrong family. */
export interface SplitAllocation {
  /** Normalised "network/prefix", e.g. "10.0.0.0/26". */
  cidr: string;
  ok: boolean;
  /** Why it was rejected, e.g. 'outside parent' or 'wrong family'. */
  note?: string;
}

/** One enumerated subnet of the requested new prefix and its occupancy status. */
export interface SplitSubnet {
  /** "network/prefix", e.g. "10.0.0.0/26". */
  cidr: string;
  /** 'free' = no overlap with allocations, 'used' = fully covered, 'partial' = some. */
  status: 'free' | 'used' | 'partial';
}

/** The "split into /n" section, present only when a valid newPrefix is given. */
export interface SplitSection {
  prefix: number;
  /** True when the full subnet list was capped at the 256-row display limit. */
  truncated: boolean;
  subnets: SplitSubnet[];
}

/** Total / used / free address accounting for the parent block. */
export interface SplitStats {
  /** Total addresses in the parent (string; huge v6 uses '2^N'). */
  total: string;
  /** Sum of merged allocation lengths. */
  used: string;
  /** total − used. */
  free: string;
  /** round(used / total * 100), clamped 0..100. */
  usedPct: number;
}

/** The result of splitting a parent prefix. */
export interface SplitResult {
  valid: boolean;
  error?: string;
  version?: IpVersion;
  /** Canonical "network/prefix" of the parent, e.g. "10.0.0.0/24". */
  parentCidr?: string;
  stats?: SplitStats;
  /** Parsed allocation lines (in input order). */
  allocated: SplitAllocation[];
  /** Minimal free blocks remaining inside the parent, as "network/prefix". */
  freeCidrs: string[];
  /** Equal-size split into newPrefix, or null when no valid newPrefix given. */
  split?: SplitSection | null;
  /** First fully-free block of size newPrefix, or null. */
  nextFree?: string | null;
}

/** A runnable example for the picker. */
export interface SplitExample {
  id: string;
  label: string;
  /** Parent CIDR, e.g. "10.0.0.0/24". */
  parent: string;
  /** Newline-separated allocation CIDRs (may be empty). */
  allocated: string;
  /** Requested split prefix, or null for free-space-only. */
  newPrefix: number | null;
}

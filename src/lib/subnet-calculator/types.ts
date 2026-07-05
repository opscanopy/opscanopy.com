/**
 * Subnet / CIDR Calculator — shared types for the client-side engine.
 * `calculate()` never throws on user input; bad input yields { valid:false, error }.
 */
import type { IpVersion } from '../ip-core';

/**
 * One answer tile above the detail groups. `stats[0]` is rendered as the hero.
 * `value` is the raw copy/machine string (never contains display-only
 * grouping); `display` is an optional prettier form for rendering.
 */
export interface SubnetStat {
  label: string;
  value: string;
  display?: string;
  caption?: string;
  /** Render the value in the mono/code face (addresses, ranges). */
  mono?: boolean;
}

/** One labeled output row inside a group. */
export interface SubnetRow {
  label: string;
  value: string;
  display?: string;
  /** Short plain-language caption rendered under the label. */
  gloss?: string;
  /** Render the value in the mono/code face (addresses, masks, integers). */
  mono?: boolean;
}

/** A titled group of rows (Addressing / Masks / Details). */
export interface SubnetGroup {
  heading: string;
  rows: SubnetRow[];
}

/** The result of calculating a subnet. */
export interface SubnetResult {
  valid: boolean;
  error?: string;
  version?: IpVersion;
  /** Canonical "network/prefix" title, e.g. "192.168.1.0/24" — the card header. */
  title?: string;
  /** The user's address + computed prefix, e.g. "192.168.1.73/24" — share payload. */
  normalized?: string;
  /** One-liner for the live region, e.g. "/24 — 254 usable hosts". */
  summary?: string;
  /** Present when the input address is a host inside the block, not the network. */
  note?: string;
  /** Answer tiles; stats[0] is the hero. */
  stats: SubnetStat[];
  /** Grouped detail rows. */
  groups: SubnetGroup[];
}

/** A runnable example chip. */
export interface SubnetExample {
  id: string;
  label: string;
  /** An input that calculates cleanly, e.g. "10.0.0.0/8". */
  input: string;
}

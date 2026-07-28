/**
 * Subnet Splitter — engine. Given a parent CIDR, a list of allocation lines, and
 * an optional new prefix length, it computes the minimal FREE blocks left after
 * the allocations and (when a valid newPrefix is given) enumerates the parent's
 * equal-size subnets, flagging each as free / used / partial.
 *
 * Pure + browser-safe; never throws on user input — bad input returns
 * { valid:false, error, ... } so callers can render a friendly message.
 */
import {
  BITS,
  parseCidr,
  networkAddr,
  cidrRange,
  rangeToCidrs,
  formatAddr,
  type Cidr,
  type IpVersion,
} from '../ip-core';
import type { SplitAllocation, SplitResult, SplitSubnet } from './types';

const ERR_PARENT = 'Enter a valid parent CIDR, e.g. 10.0.0.0/24 or 2001:db8::/48.';

/** Empty shell returned for a fatal (parent) error so the shape stays stable. */
function fail(error: string): SplitResult {
  return { valid: false, error, allocated: [], freeCidrs: [], split: null, nextFree: null };
}

/** Format a [start,end] interval as one or more "network/prefix" strings. */
function intervalToCidrStrings(start: bigint, end: bigint, version: IpVersion): string[] {
  return rangeToCidrs(start, end, version).map((c) => `${formatAddr(version, c.addr)}/${c.prefix}`);
}

export function split(parent: string, allocated: string, newPrefix: number | null): SplitResult {
  const parentCidr = parseCidr((parent ?? '').trim());
  if (!parentCidr) return fail(ERR_PARENT);

  const version = parentCidr.version;
  const parentNet: Cidr = { version, addr: networkAddr(parentCidr), prefix: parentCidr.prefix };
  const [parentStart, parentEnd] = cidrRange(parentNet);
  const parentTitle = `${formatAddr(version, parentNet.addr)}/${parentNet.prefix}`;

  // ── Parse allocation lines ────────────────────────────────────────────────
  const lines = (allocated ?? '')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('#'));

  const allocations: SplitAllocation[] = [];
  const clamped: [bigint, bigint][] = []; // in-parent ranges, clamped to the parent

  for (const line of lines) {
    const c = parseCidr(line);
    if (!c) {
      allocations.push({ cidr: line, ok: false, note: 'not a valid IP or CIDR' });
      continue;
    }
    const net = networkAddr(c);
    const norm = `${formatAddr(c.version, net)}/${c.prefix}`;

    if (c.version !== version) {
      allocations.push({ cidr: norm, ok: false, note: 'wrong family' });
      continue;
    }
    const [as, ae] = cidrRange({ version: c.version, addr: net, prefix: c.prefix });
    // Fully outside the parent range?
    if (ae < parentStart || as > parentEnd) {
      allocations.push({ cidr: norm, ok: false, note: 'outside parent' });
      continue;
    }
    allocations.push({ cidr: norm, ok: true });
    // Clamp to the parent so a straddling block still counts only its in-parent part.
    const cs = as < parentStart ? parentStart : as;
    const ce = ae > parentEnd ? parentEnd : ae;
    clamped.push([cs, ce]);
  }

  // ── Merge used intervals ──────────────────────────────────────────────────
  clamped.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0));
  const used: [bigint, bigint][] = [];
  for (const [s, e] of clamped) {
    const tail = used[used.length - 1];
    if (tail && s <= tail[1] + 1n) {
      if (e > tail[1]) tail[1] = e;
    } else {
      used.push([s, e]);
    }
  }

  // ── Free = parent MINUS used (interval subtraction) ───────────────────────
  const free: [bigint, bigint][] = [];
  let cur = parentStart;
  for (const [us, ue] of used) {
    if (us > cur) free.push([cur, us - 1n]);
    const next = ue + 1n;
    if (next > cur) cur = next;
  }
  if (cur <= parentEnd) free.push([cur, parentEnd]);

  const freeCidrs: string[] = [];
  for (const [s, e] of free) freeCidrs.push(...intervalToCidrStrings(s, e, version));

  // ── Stats ─────────────────────────────────────────────────────────────────
  const hostBits = BITS[version] - parentNet.prefix;
  const totalBig = 1n << BigInt(hostBits);
  let usedSum = 0n;
  for (const [s, e] of used) usedSum += e - s + 1n;
  const freeSum = totalBig - usedSum;

  // Render all three counts the same way: small values stay exact decimals, but
  // huge IPv6 counts collapse to 2^N / ≈2^N instead of 39-digit strings, so
  // total, used and free always read consistently.
  let usedPct = totalBig === 0n ? 0 : Math.round((Number(usedSum) / Number(totalBig)) * 100);
  if (usedPct < 0) usedPct = 0;
  if (usedPct > 100) usedPct = 100;

  const stats = {
    total: fmtCount(totalBig),
    used: fmtCount(usedSum),
    free: fmtCount(freeSum),
    usedPct,
  };

  // ── Equal-size split into newPrefix ───────────────────────────────────────
  let splitSection: SplitResult['split'] = null;
  let nextFree: string | null = null;

  if (
    typeof newPrefix === 'number' &&
    Number.isInteger(newPrefix) &&
    newPrefix >= parentNet.prefix &&
    newPrefix <= BITS[version]
  ) {
    const step = 1n << BigInt(BITS[version] - newPrefix);
    const totalCount = 1n << BigInt(newPrefix - parentNet.prefix);
    const CAP = 256n;
    const truncated = totalCount > CAP;
    const limit = truncated ? CAP : totalCount;

    const subnets: SplitSubnet[] = [];
    let addr = parentStart;
    for (let i = 0n; i < limit; i++) {
      const sStart = addr;
      const sEnd = addr + step - 1n;
      const status = statusOf(sStart, sEnd, used, free);
      const cidr = `${formatAddr(version, sStart)}/${newPrefix}`;
      subnets.push({ cidr, status });
      if (nextFree === null && status === 'free') nextFree = cidr;
      addr += step;
    }

    // If the list was capped, nextFree may still lie beyond the cap. Walk the
    // merged free intervals instead of stepping candidate-by-candidate: the old
    // loop ran 2^(newPrefix - parentPrefix) times — 2^96 for a /32 split into
    // /128 — which froze the tab synchronously with no result and no cancel.
    // `free` is built forward from parentStart over sorted `used`, so it is
    // sorted ascending and the first interval that can host an aligned block
    // yields the lowest free subnet. O(free.length).
    if (nextFree === null && truncated) {
      for (const [s, e] of free) {
        // Align the interval start up to the next newPrefix boundary. Subnet
        // boundaries are multiples of `step` measured from parentStart (which
        // is itself step-aligned, since parentPrefix <= newPrefix).
        let cand = s < parentStart ? parentStart : s;
        const rem = (cand - parentStart) % step;
        if (rem !== 0n) cand += step - rem;
        const candEnd = cand + step - 1n;
        if (candEnd <= e && candEnd <= parentEnd) {
          nextFree = `${formatAddr(version, cand)}/${newPrefix}`;
          break;
        }
      }
    }

    splitSection = { prefix: newPrefix, truncated, total: fmtCount(totalCount), subnets };
  }

  return {
    valid: true,
    version,
    parentCidr: parentTitle,
    stats,
    allocated: allocations,
    freeCidrs,
    split: splitSection,
    nextFree,
  };
}

/**
 * Occupancy of a [start,end] subnet against the merged used/free interval sets:
 * 'free' if fully inside free space, 'used' if fully covered by an allocation,
 * else 'partial'.
 */
function statusOf(
  start: bigint,
  end: bigint,
  used: [bigint, bigint][],
  free: [bigint, bigint][],
): 'free' | 'used' | 'partial' {
  if (intervalWithin(start, end, free)) return 'free';
  if (intervalWithin(start, end, used)) return 'used';
  return 'partial';
}

/** True when [start,end] is fully contained within a single interval of the set. */
function intervalWithin(start: bigint, end: bigint, set: [bigint, bigint][]): boolean {
  for (const [s, e] of set) {
    if (start >= s && end <= e) return true;
  }
  return false;
}

/** Readable address count: exact decimal when small, else 2^N (exact power) or ≈2^N. */
function fmtCount(n: bigint): string {
  if (n <= 0n) return '0';
  if (n < 1n << 53n) return n.toString();
  if (isPow2(n)) return '2^' + floorLog2(n);
  // Round to the NEAREST power of two, not down. Flooring understated every
  // non-power-of-two count by up to 2x — "2^96 minus one address" rendered as
  // "≈2^95", i.e. half the real free space.
  const k = BigInt(floorLog2(n));
  const lo = 1n << k;
  const hi = 1n << (k + 1n);
  return '≈2^' + (n - lo > hi - n ? Number(k) + 1 : Number(k));
}

function isPow2(n: bigint): boolean {
  return n > 0n && (n & (n - 1n)) === 0n;
}

function floorLog2(n: bigint): number {
  let k = -1;
  for (let x = n; x > 0n; x >>= 1n) k++;
  return k;
}

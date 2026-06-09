/**
 * ip-core — shared, dependency-free IP address maths for the networking tools.
 *
 * Everything is computed with BigInt so IPv4 (32-bit) and IPv6 (128-bit) share
 * one code path with exact, sign-safe arithmetic. Pure functions, no I/O, no
 * throwing on user input — parsers return `null` on anything invalid so callers
 * can render a friendly error instead of crashing.
 */

export type IpVersion = 4 | 6;

/** Bit width per version. */
export const BITS: Record<IpVersion, number> = { 4: 32, 6: 128 };

/** All-ones value for a version (2^bits - 1). */
export function fullMask(version: IpVersion): bigint {
  return (1n << BigInt(BITS[version])) - 1n;
}

/* ── IPv4 ─────────────────────────────────────────────────────────────────── */

/** Parse dotted-decimal IPv4 → 32-bit BigInt, or null. Rejects octets > 255. */
export function parseIPv4(input: string): bigint | null {
  const parts = input.trim().split('.');
  if (parts.length !== 4) return null;
  let v = 0n;
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return null;
    const n = Number(p);
    if (n > 255) return null;
    v = (v << 8n) | BigInt(n);
  }
  return v;
}

/** 32-bit value → dotted-decimal string. */
export function ipv4ToString(v: bigint): string {
  return [(v >> 24n) & 0xffn, (v >> 16n) & 0xffn, (v >> 8n) & 0xffn, v & 0xffn]
    .map((x) => x.toString())
    .join('.');
}

/** 32-bit value → dotted binary, e.g. 11000000.10101000.00000001.00000000 */
export function ipv4ToBinary(v: bigint): string {
  return [(v >> 24n) & 0xffn, (v >> 16n) & 0xffn, (v >> 8n) & 0xffn, v & 0xffn]
    .map((x) => x.toString(2).padStart(8, '0'))
    .join('.');
}

/* ── IPv6 ─────────────────────────────────────────────────────────────────── */

/** Parse an IPv6 string (compressed, expanded, or with embedded IPv4) → 128-bit BigInt, or null. */
export function parseIPv6(input: string): bigint | null {
  const s = input.trim();
  if (s.length === 0) return null;

  const halves = s.split('::');
  if (halves.length > 2) return null;

  // Expand a colon-separated half into 16-bit hextet strings; supports a
  // trailing embedded IPv4 (e.g. ::ffff:192.168.1.1) only in the final segment.
  const groupsOf = (str: string): string[] | null => {
    if (str === '') return [];
    const segs = str.split(':');
    const out: string[] = [];
    for (let i = 0; i < segs.length; i++) {
      const seg = segs[i];
      if (seg.includes('.')) {
        if (i !== segs.length - 1) return null; // embedded IPv4 must be last
        const v4 = parseIPv4(seg);
        if (v4 === null) return null;
        out.push(((v4 >> 16n) & 0xffffn).toString(16));
        out.push((v4 & 0xffffn).toString(16));
      } else {
        if (!/^[0-9a-fA-F]{1,4}$/.test(seg)) return null;
        out.push(seg);
      }
    }
    return out;
  };

  let groups: string[];
  if (halves.length === 1) {
    const g = groupsOf(halves[0]);
    if (g === null || g.length !== 8) return null;
    groups = g;
  } else {
    const head = groupsOf(halves[0]);
    const tail = groupsOf(halves[1]);
    if (head === null || tail === null) return null;
    const missing = 8 - head.length - tail.length;
    if (missing < 1) return null; // '::' must stand for at least one zero group
    groups = [...head, ...Array<string>(missing).fill('0'), ...tail];
  }

  let v = 0n;
  for (const g of groups) v = (v << 16n) | BigInt(parseInt(g || '0', 16));
  return v;
}

/** 128-bit value → the eight 16-bit groups as numbers. */
export function ipv6Groups(v: bigint): number[] {
  const g: number[] = [];
  for (let i = 7; i >= 0; i--) g.push(Number((v >> BigInt(i * 16)) & 0xffffn));
  return g;
}

/** 128-bit value → fully expanded IPv6, e.g. 2001:0db8:0000:...:0000 */
export function ipv6Expand(v: bigint): string {
  return ipv6Groups(v)
    .map((x) => x.toString(16).padStart(4, '0'))
    .join(':');
}

/** 128-bit value → RFC 5952 compressed IPv6 (longest zero run → "::"). */
export function ipv6Compress(v: bigint): string {
  const g = ipv6Groups(v).map((x) => x.toString(16));
  let bestStart = -1;
  let bestLen = 0;
  let curStart = -1;
  let curLen = 0;
  for (let i = 0; i < 8; i++) {
    if (g[i] === '0') {
      if (curStart === -1) curStart = i;
      curLen++;
      if (curLen > bestLen) {
        bestLen = curLen;
        bestStart = curStart;
      }
    } else {
      curStart = -1;
      curLen = 0;
    }
  }
  if (bestLen < 2) return g.join(':');
  const before = g.slice(0, bestStart).join(':');
  const after = g.slice(bestStart + bestLen).join(':');
  return `${before}::${after}`;
}

/* ── Version detection + generic parse/format ───────────────────────────────── */

/** Detect the IP version of a bare address string (no prefix), or null. */
export function detectVersion(input: string): IpVersion | null {
  const s = input.trim();
  if (s.includes(':')) return parseIPv6(s) !== null ? 6 : null;
  if (parseIPv4(s) !== null) return 4;
  return null;
}

/** Parse a bare address of the given version → BigInt, or null. */
export function parseAddr(version: IpVersion, input: string): bigint | null {
  return version === 4 ? parseIPv4(input) : parseIPv6(input);
}

/** Format a BigInt as an address of the given version (IPv6 compressed). */
export function formatAddr(version: IpVersion, v: bigint): string {
  return version === 4 ? ipv4ToString(v) : ipv6Compress(v);
}

/* ── CIDR ─────────────────────────────────────────────────────────────────── */

export interface Cidr {
  version: IpVersion;
  /** The address exactly as supplied (NOT masked to the network). */
  addr: bigint;
  /** Prefix length in bits. A bare address defaults to the full width. */
  prefix: number;
}

/** Parse "addr/prefix" (or a bare address) → Cidr, or null. */
export function parseCidr(input: string): Cidr | null {
  const s = input.trim();
  if (s.length === 0) return null;
  const slash = s.lastIndexOf('/');
  const addrStr = slash === -1 ? s : s.slice(0, slash);
  const prefixStr = slash === -1 ? null : s.slice(slash + 1);

  const version = detectVersion(addrStr);
  if (version === null) return null;
  const addr = parseAddr(version, addrStr);
  if (addr === null) return null;

  const max = BITS[version];
  let prefix: number;
  if (prefixStr === null) {
    prefix = max;
  } else {
    if (!/^\d{1,3}$/.test(prefixStr)) return null;
    prefix = Number(prefixStr);
    if (prefix > max) return null;
  }
  return { version, addr, prefix };
}

/** The contiguous network mask for a prefix length. */
export function maskForPrefix(version: IpVersion, prefix: number): bigint {
  const bits = BITS[version];
  if (prefix <= 0) return 0n;
  if (prefix >= bits) return fullMask(version);
  return (fullMask(version) >> BigInt(bits - prefix)) << BigInt(bits - prefix);
}

/** Network (first) address of a CIDR. */
export function networkAddr(c: Cidr): bigint {
  return c.addr & maskForPrefix(c.version, c.prefix);
}

/** Broadcast / last address of a CIDR. */
export function lastAddr(c: Cidr): bigint {
  const mask = maskForPrefix(c.version, c.prefix);
  return (c.addr & mask) | (fullMask(c.version) ^ mask);
}

/** Inclusive [start, end] numeric range a CIDR covers. */
export function cidrRange(c: Cidr): [bigint, bigint] {
  return [networkAddr(c), lastAddr(c)];
}

/** Count of addresses a CIDR covers (2^hostBits). */
export function addrCount(c: Cidr): bigint {
  return 1n << BigInt(BITS[c.version] - c.prefix);
}

/** Classify an IPv4 address into a human label (private, loopback, etc.). */
export function classifyIPv4(v: bigint): string {
  const o1 = Number((v >> 24n) & 0xffn);
  const o2 = Number((v >> 16n) & 0xffn);
  if (o1 === 0) return 'This network (0.0.0.0/8)';
  if (o1 === 10) return 'Private (RFC 1918)';
  if (o1 === 172 && o2 >= 16 && o2 <= 31) return 'Private (RFC 1918)';
  if (o1 === 192 && o2 === 168) return 'Private (RFC 1918)';
  if (o1 === 100 && o2 >= 64 && o2 <= 127) return 'Carrier-grade NAT (RFC 6598)';
  if (o1 === 127) return 'Loopback (127.0.0.0/8)';
  if (o1 === 169 && o2 === 254) return 'Link-local / APIPA (169.254.0.0/16)';
  if (o1 >= 224 && o1 <= 239) return 'Multicast (224.0.0.0/4)';
  if (o1 >= 240) return 'Reserved (240.0.0.0/4)';
  return 'Public / global unicast';
}

/** Classify an IPv6 address into a human label. */
export function classifyIPv6(v: bigint): string {
  if (v === 0n) return 'Unspecified (::)';
  if (v === 1n) return 'Loopback (::1)';
  if ((v >> 120n) === 0xffn) return 'Multicast (ff00::/8)';
  if ((v >> 118n) === 0x3fan) return 'Link-local (fe80::/10)';
  if ((v >> 121n) === 0x7en) return 'Unique local — ULA (fc00::/7)';
  if ((v >> 96n) === 0x20010db8n) return 'Documentation (2001:db8::/32)';
  if ((v >> 32n) === 0xffffn) return 'IPv4-mapped (::ffff:0:0/96)';
  if ((v >> 125n) === 0x1n) return 'Global unicast (2000::/3)';
  return 'Reserved / special-purpose';
}

/** Classify any address. */
export function classify(version: IpVersion, v: bigint): string {
  return version === 4 ? classifyIPv4(v) : classifyIPv6(v);
}

/**
 * Decompose an inclusive [start, end] numeric range into the minimal list of
 * aligned CIDR blocks that exactly covers it. Works for both versions via bits.
 */
export function rangeToCidrs(start: bigint, end: bigint, version: IpVersion): Cidr[] {
  const bits = BITS[version];
  const out: Cidr[] = [];
  let cur = start;
  while (cur <= end) {
    // Largest block (smallest prefix) allowed by `cur`'s alignment.
    let maxByAlign = bits;
    if (cur !== 0n) {
      let tz = 0;
      let c = cur;
      while ((c & 1n) === 0n && tz < bits) {
        c >>= 1n;
        tz++;
      }
      maxByAlign = bits - tz;
    } else {
      maxByAlign = 0;
    }
    // Largest block that still fits within the remaining count.
    const remaining = end - cur + 1n;
    let sizeLog = 0;
    while (1n << BigInt(sizeLog + 1) <= remaining) sizeLog++;
    const maxByCount = bits - sizeLog;

    const prefix = Math.max(maxByAlign, maxByCount);
    out.push({ version, addr: cur, prefix });
    cur += 1n << BigInt(bits - prefix);
  }
  return out;
}

/** Relationship between two CIDRs of the same version. */
export type CidrRelation = 'equal' | 'contains' | 'within' | 'overlaps' | 'disjoint';

export function relate(a: Cidr, b: Cidr): CidrRelation {
  const [as, ae] = cidrRange(a);
  const [bs, be] = cidrRange(b);
  if (as === bs && ae === be) return 'equal';
  if (as <= bs && ae >= be) return 'contains';
  if (bs <= as && be >= ae) return 'within';
  if (as <= be && bs <= ae) return 'overlaps';
  return 'disjoint';
}

/**
 * CIDR / Subnet Checker — engine. Parses one IP/CIDR per line (blank lines and
 * `#` comments ignored). A line with no "/" is a bare IP to check: every bare
 * IP gets an in-range verdict against every same-family range in the list.
 * Range entries are compared pairwise for overlap / containment, and all valid
 * entries are aggregated into the minimal covering CIDR set per address
 * family. Pure + browser-safe; never throws on user input.
 */
import {
  parseCidr,
  networkAddr,
  cidrRange,
  rangeToCidrs,
  relate,
  classify,
  formatAddr,
  type Cidr,
  type IpVersion,
} from '../ip-core';
import type { CheckResult, CheckEntry, MembershipEntry, OverlapPair, AggGroup } from './types';

const ERR_EMPTY = 'Enter one IP or CIDR per line, e.g. 10.0.0.0/24.';
const ERR_ALL_INVALID = 'None of the lines parsed as an IP or CIDR — details on each line below.';
const ERR_FALLBACK = 'Not an IP address or CIDR — expected e.g. 10.0.0.5 or 10.0.0.0/24.';

/**
 * Targeted diagnosis for a colon-containing address parseIPv6 rejected.
 * Local adaptation of the IP Address Converter's diagnoseIPv6 — kept private
 * here so the two tools stay independent.
 */
function diagnoseIPv6(s: string): string {
  const halves = s.split('::');
  if (halves.length > 2) return 'An IPv6 address can contain "::" at most once.';

  const segLists = halves.map((h) => (h === '' ? [] : h.split(':')));
  for (const segs of segLists) {
    for (const seg of segs) {
      if (seg === '' || seg.includes('.')) continue; // ':::'-style / embedded IPv4 → fallback
      if (!/^[0-9a-fA-F]+$/.test(seg)) return `Group "${seg}" is not valid hexadecimal.`;
      if (seg.length > 4) return `Group "${seg}" has more than 4 hex digits.`;
    }
  }

  if (halves.length === 1) {
    const segs = segLists[0];
    if (segs.some((seg) => seg === '')) return ERR_FALLBACK;
    // An embedded trailing IPv4 stands for two groups.
    const n = segs.length + (segs[segs.length - 1].includes('.') ? 1 : 0);
    if (n !== 8) return `Expected 8 colon-separated groups (or use "::") but found ${n}.`;
  }
  return ERR_FALLBACK;
}

/**
 * Targeted per-octet diagnosis for a dotted string parseIPv4 rejected.
 * Local adaptation of the IP Address Converter's diagnoseIPv4.
 */
function diagnoseIPv4(s: string): string {
  const parts = s.split('.');
  for (const part of parts) {
    if (/^\d+$/.test(part) && Number(part) > 255) {
      return `Octet ${part} is greater than 255.`;
    }
  }
  if (s.endsWith('.')) {
    return 'Remove the trailing dot — an IPv4 address is 4 octets like 192.168.1.10.';
  }
  if (parts.some((part) => part === '')) {
    return 'Empty octet — two dots in a row?';
  }
  if (parts.length !== 4) {
    return `Expected 4 dot-separated octets but found ${parts.length}.`;
  }
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) {
      return `"${part}" is not a decimal octet (0–255).`;
    }
  }
  return ERR_FALLBACK;
}

/**
 * Explain why a line failed to parse. Decision order: split at the last "/"
 * (IPv6 colons stay intact) → prefix checks → %zone → IPv6 diagnosis (has ":")
 * → IPv4 diagnosis (has ".") → generic fallback.
 */
function diagnoseLine(line: string): string {
  const slash = line.lastIndexOf('/');
  const addrStr = slash === -1 ? line : line.slice(0, slash);
  const prefixStr = slash === -1 ? null : line.slice(slash + 1);

  if (prefixStr !== null) {
    if (addrStr === '') return `Missing the address before "/${prefixStr}".`;
    if (!/^\d+$/.test(prefixStr)) return 'The prefix after "/" must be a number, e.g. /24.';
    const p = Number(prefixStr);
    if (addrStr.includes(':')) {
      if (p > 128) return `Prefix /${p} is too long — the maximum for IPv6 is /128.`;
    } else if (p > 32) {
      return `Prefix /${p} is too long for an IPv4 address — the maximum is /32.`;
    }
  }

  // %zone is valid on an interface literal, but meaningless in a range list.
  const pct = addrStr.indexOf('%');
  if (pct !== -1 && addrStr.slice(0, pct).includes(':')) {
    return "Remove the %zone — zone IDs don't apply to range checks.";
  }

  if (addrStr.includes(':')) return diagnoseIPv6(addrStr);
  if (addrStr.includes('.')) return diagnoseIPv4(addrStr);
  return ERR_FALLBACK;
}

export function check(input: string): CheckResult {
  const lines = (input ?? '')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('#'));

  if (lines.length === 0) {
    return {
      valid: false,
      error: ERR_EMPTY,
      entries: [],
      membership: [],
      overlaps: [],
      aggregated: [],
      stats: { ok: 0, invalid: 0, overlaps: 0, blocks: 0 },
    };
  }

  interface Parsed {
    cidr: Cidr;
    norm: string;
    role: 'ip' | 'range';
    display: string;
  }

  const entries: CheckEntry[] = [];
  const parsed: Parsed[] = [];

  for (const line of lines) {
    // A bare IP (no "/") is something to check; an explicit prefix is a range.
    const role: 'ip' | 'range' = line.includes('/') ? 'range' : 'ip';
    const c = parseCidr(line);
    if (!c) {
      entries.push({ line, ok: false, role, error: diagnoseLine(line) });
      continue;
    }
    const net = networkAddr(c);
    const norm = `${formatAddr(c.version, net)}/${c.prefix}`;
    const display = role === 'ip' ? formatAddr(c.version, net) : norm;
    // Detect whether the user supplied host bits (addr differs from network addr).
    const hostBitsStripped = c.addr !== net;
    const entry: CheckEntry = {
      line,
      ok: true,
      version: c.version,
      cidr: norm,
      role,
      display,
      type: classify(c.version, net),
    };
    if (hostBitsStripped) entry.normalizedFrom = line;
    entries.push(entry);
    parsed.push({ cidr: { version: c.version, addr: net, prefix: c.prefix }, norm, role, display });
  }

  // Membership: every bare IP × every same-family range. A bare IP parses as
  // /32 (or /128), so it is inside a range iff relate() is within or equal.
  const membership: MembershipEntry[] = [];
  const ranges = parsed.filter((p) => p.role === 'range');
  for (const host of parsed) {
    if (host.role !== 'ip') continue;
    const sameFamily = ranges.filter((r) => r.cidr.version === host.cidr.version);
    const matches: string[] = [];
    for (const r of sameFamily) {
      const rel = relate(host.cidr, r.cidr);
      if ((rel === 'within' || rel === 'equal') && !matches.includes(r.norm)) matches.push(r.norm);
    }
    // Most specific (longest prefix) first; sort() is stable so ties keep input order.
    matches.sort(
      (a, b) => Number(b.slice(b.lastIndexOf('/') + 1)) - Number(a.slice(a.lastIndexOf('/') + 1)),
    );
    membership.push({
      ip: host.display,
      version: host.cidr.version,
      status: sameFamily.length === 0 ? 'no-ranges' : matches.length > 0 ? 'in' : 'not-in',
      matches,
      rangeCount: sameFamily.length,
    });
  }

  // Pairwise overlap / containment (same family only). Pairs where exactly one
  // side is a bare IP are excluded — those are the membership verdict above,
  // not a list conflict.
  const overlaps: OverlapPair[] = [];
  for (let i = 0; i < parsed.length; i++) {
    for (let j = i + 1; j < parsed.length; j++) {
      const a = parsed[i];
      const b = parsed[j];
      if (a.cidr.version !== b.cidr.version) continue;
      if ((a.role === 'ip') !== (b.role === 'ip')) continue;
      const rel = relate(a.cidr, b.cidr);
      if (rel === 'disjoint') continue;
      if (a.role === 'ip' && b.role === 'ip') {
        // Two bare IPs can only collide by being identical.
        overlaps.push({ kind: 'equal', relation: `${a.display} is listed twice` });
        continue;
      }
      if (rel === 'equal') overlaps.push({ kind: 'equal', relation: `${a.norm} is the same block as ${b.norm}` });
      else if (rel === 'contains') overlaps.push({ kind: 'contains', relation: `${a.norm} contains ${b.norm}` });
      else if (rel === 'within') overlaps.push({ kind: 'within', relation: `${a.norm} is inside ${b.norm}` });
      else overlaps.push({ kind: 'overlaps', relation: `${a.norm} overlaps ${b.norm}` });
    }
  }

  // Aggregate to the minimal covering set, per family (bare IPs participate as /32 // /128).
  const aggregated: AggGroup[] = [];
  for (const version of [4, 6] as IpVersion[]) {
    const rangeList = parsed.filter((p) => p.cidr.version === version).map((p) => cidrRange(p.cidr));
    if (rangeList.length === 0) continue;
    rangeList.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0));
    const merged: [bigint, bigint][] = [];
    for (const [s, e] of rangeList) {
      const tail = merged[merged.length - 1];
      if (tail && s <= tail[1] + 1n) {
        if (e > tail[1]) tail[1] = e;
      } else {
        merged.push([s, e]);
      }
    }
    const cidrs: string[] = [];
    for (const [s, e] of merged) {
      for (const c of rangeToCidrs(s, e, version)) {
        cidrs.push(`${formatAddr(version, c.addr)}/${c.prefix}`);
      }
    }
    aggregated.push({ version, label: version === 4 ? 'IPv4' : 'IPv6', cidrs });
  }

  const ok = entries.filter((e) => e.ok).length;
  const blocks = aggregated.reduce((n, g) => n + g.cidrs.length, 0);
  return {
    valid: ok > 0,
    error: ok === 0 ? ERR_ALL_INVALID : undefined,
    entries,
    membership,
    overlaps,
    aggregated,
    stats: { ok, invalid: entries.length - ok, overlaps: overlaps.length, blocks },
  };
}

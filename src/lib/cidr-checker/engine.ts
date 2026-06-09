/**
 * CIDR / Subnet Checker — engine. Parses one IP/CIDR per line (blank lines and
 * `#` comments ignored), reports every overlap / containment between the inputs,
 * and aggregates them into the minimal covering CIDR set per address family.
 * Pure + browser-safe; never throws on user input.
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
import type { CheckResult, CheckEntry, OverlapPair, AggGroup } from './types';

export function check(input: string): CheckResult {
  const lines = (input ?? '')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('#'));

  if (lines.length === 0) {
    return {
      valid: false,
      error: 'Enter one IP or CIDR per line, e.g. 10.0.0.0/24.',
      entries: [],
      overlaps: [],
      aggregated: [],
      stats: { ok: 0, invalid: 0 },
    };
  }

  const entries: CheckEntry[] = [];
  const parsed: { cidr: Cidr; norm: string }[] = [];

  for (const line of lines) {
    const c = parseCidr(line);
    if (!c) {
      entries.push({ line, ok: false, error: 'not a valid IP or CIDR' });
      continue;
    }
    const net = networkAddr(c);
    const norm = `${formatAddr(c.version, net)}/${c.prefix}`;
    entries.push({ line, ok: true, version: c.version, cidr: norm, type: classify(c.version, net) });
    parsed.push({ cidr: { version: c.version, addr: net, prefix: c.prefix }, norm });
  }

  // Pairwise overlap / containment (same family only).
  const overlaps: OverlapPair[] = [];
  for (let i = 0; i < parsed.length; i++) {
    for (let j = i + 1; j < parsed.length; j++) {
      const a = parsed[i];
      const b = parsed[j];
      if (a.cidr.version !== b.cidr.version) continue;
      const rel = relate(a.cidr, b.cidr);
      if (rel === 'disjoint') continue;
      if (rel === 'equal') overlaps.push({ kind: 'equal', relation: `${a.norm} is the same block as ${b.norm}` });
      else if (rel === 'contains') overlaps.push({ kind: 'contains', relation: `${a.norm} contains ${b.norm}` });
      else if (rel === 'within') overlaps.push({ kind: 'within', relation: `${a.norm} is inside ${b.norm}` });
      else overlaps.push({ kind: 'overlaps', relation: `${a.norm} overlaps ${b.norm}` });
    }
  }

  // Aggregate to the minimal covering set, per family.
  const aggregated: AggGroup[] = [];
  for (const version of [4, 6] as IpVersion[]) {
    const ranges = parsed.filter((p) => p.cidr.version === version).map((p) => cidrRange(p.cidr));
    if (ranges.length === 0) continue;
    ranges.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0));
    const merged: [bigint, bigint][] = [];
    for (const [s, e] of ranges) {
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
  return {
    valid: ok > 0,
    error: ok === 0 ? 'No valid IPs or CIDRs found — check the lines above.' : undefined,
    entries,
    overlaps,
    aggregated,
    stats: { ok, invalid: entries.length - ok },
  };
}

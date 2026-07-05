/**
 * Subnet / CIDR Calculator — engine. Accepts an IPv4/IPv6 address with a
 * /prefix, an address plus a dotted netmask ("192.168.1.0 255.255.255.0" or
 * "192.168.1.0/255.255.255.0"), or a bare address (one host: /32 or /128),
 * and returns answer tiles (usable hosts, range, totals) plus grouped detail
 * rows. Invalid input yields a targeted, human diagnostic instead of a generic
 * parse error. Pure + browser-safe; never throws on user input.
 */
import {
  BITS,
  fullMask,
  maskForPrefix,
  networkAddr,
  lastAddr,
  addrCount,
  classify,
  formatAddr,
  parseIPv4,
  parseIPv6,
  ipv4ToString,
  ipv4ToBinary,
  ipv6Compress,
  ipv6Expand,
  type IpVersion,
} from '../ip-core';
import type { SubnetResult, SubnetStat, SubnetGroup } from './types';

/** Thin space (U+2009) used for display-only digit grouping. */
const THIN = ' ';

const ERR_EMPTY = 'Enter an IP address with a prefix, like 192.168.1.0/24.';
const ERR_FALLBACK = 'Not a valid IPv4/IPv6 address or CIDR. Try 10.0.0.0/8 or 2001:db8::/48.';

function bad(error: string): SubnetResult {
  return { valid: false, error, stats: [], groups: [] };
}

/** Group a decimal digit string in 3s; undefined when too short to bother. */
function groupThousands(digits: string): string | undefined {
  if (digits.length < 5) return undefined;
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, THIN);
}

/* ── Targeted diagnostics ─────────────────────────────────────────────────── */

/** Targeted per-octet diagnosis for a dotted string parseIPv4 rejected. */
function diagnoseIPv4(s: string): string {
  const parts = s.split('.');
  for (const part of parts) {
    if (/^\d+$/.test(part) && Number(part) > 255) {
      return `Octet ${part} is greater than 255 — each octet runs 0–255.`;
    }
  }
  if (s.endsWith('.')) {
    return 'Remove the trailing dot — an IPv4 address has 4 octets, like 192.168.1.0.';
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

/** Targeted diagnosis for a colon-containing string parseIPv6 rejected. */
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
    if (!segs.some((seg) => seg === '')) {
      // An embedded trailing IPv4 stands for two groups.
      const n = segs.length + (segs[segs.length - 1]?.includes('.') ? 1 : 0);
      if (n !== 8) return `Expected 8 colon-separated groups (or use "::") but found ${n}.`;
    }
  }
  return ERR_FALLBACK;
}

/* ── Input grammar ────────────────────────────────────────────────────────── */

type ParsedAddr = { version: IpVersion; addr: bigint } | { error: string };
type Parsed = { version: IpVersion; addr: bigint; prefix: number } | { error: string };

/** Parse a bare address token, diagnosing the failure by its shape. */
function parseAddress(tok: string): ParsedAddr {
  if (tok.includes(':')) {
    const v6 = parseIPv6(tok);
    if (v6 !== null) return { version: 6, addr: v6 };
    return { error: diagnoseIPv6(tok) };
  }
  const v4 = parseIPv4(tok);
  if (v4 !== null) return { version: 4, addr: v4 };
  if (tok.includes('.')) return { error: diagnoseIPv4(tok) };
  return { error: ERR_FALLBACK };
}

/**
 * Dotted mask → prefix length: count the leading ones, then confirm
 * contiguity by round-tripping through maskForPrefix. 0.0.0.0 is a valid /0
 * and 255.255.255.255 a valid /32.
 */
function maskToPrefix(mask: bigint): number | null {
  let p = 0;
  while (p < 32 && ((mask >> BigInt(31 - p)) & 1n) === 1n) p++;
  return maskForPrefix(4, p) === mask ? p : null;
}

/** Resolve a netmask token (from "addr mask" or "addr/mask") against a parsed address. */
function resolveMask(version: IpVersion, addr: bigint, maskTok: string): Parsed {
  if (version === 6) {
    if (maskTok.includes('.')) {
      return { error: 'Dotted netmasks are IPv4-only — write IPv6 with a prefix, like 2001:db8::/48.' };
    }
    return {
      error: `Couldn't read "${maskTok}" as a netmask — use a prefix (/24) or a dotted netmask (255.255.255.0).`,
    };
  }
  const maskVal = parseIPv4(maskTok);
  if (maskVal === null) {
    return {
      error: `Couldn't read "${maskTok}" as a netmask — use a prefix (/24) or a dotted netmask (255.255.255.0).`,
    };
  }
  const prefix = maskToPrefix(maskVal);
  if (prefix !== null) return { version, addr, prefix };

  // Not contiguous — but if its complement is, the user pasted a wildcard mask.
  const complement = fullMask(4) ^ maskVal;
  const wildcardPrefix = maskToPrefix(complement);
  if (wildcardPrefix !== null) {
    const addrStr = ipv4ToString(addr);
    return {
      error:
        `${ipv4ToString(maskVal)} looks like a wildcard mask. As a prefix that is ` +
        `/${wildcardPrefix} — try ${addrStr}/${wildcardPrefix} or ${addrStr} ${ipv4ToString(complement)}.`,
    };
  }
  return {
    error: `${ipv4ToString(maskVal)} is not a contiguous netmask — the 1-bits must run unbroken from the left, like 255.255.240.0.`,
  };
}

/**
 * The input grammar: "addr/prefix", "addr netmask", "addr/netmask", or a bare
 * address (one host). Whitespace is collapsed first.
 */
function parseInput(raw: string): Parsed {
  const s = raw.replace(/\s+/g, ' ').trim();
  if (s.length === 0) return { error: ERR_EMPTY };

  const tokens = s.split(' ');
  if (tokens.length > 2) {
    return { error: `Enter one address with an optional prefix or netmask — got ${tokens.length} parts.` };
  }

  if (tokens.length === 2) {
    const [addrTok, maskTok] = tokens;
    const a = parseAddress(addrTok);
    if ('error' in a) return a;
    if (/^\d+$/.test(maskTok)) {
      return {
        error: `To set the prefix length, join it with a slash: ${formatAddr(a.version, a.addr)}/${maskTok}.`,
      };
    }
    return resolveMask(a.version, a.addr, maskTok);
  }

  const tok = tokens[0];
  const slash = tok.lastIndexOf('/');
  if (slash === -1) {
    const a = parseAddress(tok);
    if ('error' in a) return a;
    return { version: a.version, addr: a.addr, prefix: BITS[a.version] }; // bare address = one host
  }

  const base = tok.slice(0, slash);
  const suffix = tok.slice(slash + 1);
  const a = parseAddress(base);
  if ('error' in a) return a;

  if (suffix.includes('.')) return resolveMask(a.version, a.addr, suffix);

  if (/^\d+$/.test(suffix)) {
    const prefix = Number(suffix);
    const max = BITS[a.version];
    if (prefix > max) {
      return {
        error:
          a.version === 4
            ? `/${suffix} is too long for IPv4 — the prefix can be 0–32.`
            : `/${suffix} is too long for IPv6 — the prefix can be 0–128.`,
      };
    }
    return { version: a.version, addr: a.addr, prefix };
  }

  return { error: 'The part after "/" should be a prefix length or a dotted netmask like 255.255.255.0.' };
}

/* ── Result assembly ──────────────────────────────────────────────────────── */

function withDisplay(label: string, value: string, caption?: string): SubnetStat {
  const display = groupThousands(value);
  return {
    label,
    value,
    ...(display ? { display } : {}),
    ...(caption ? { caption } : {}),
  };
}

export function calculate(input: string): SubnetResult {
  const parsed = parseInput(input ?? '');
  if ('error' in parsed) return bad(parsed.error);

  const { version, addr, prefix } = parsed;
  const cidr = { version, addr, prefix };
  const net = networkAddr(cidr);
  const last = lastAddr(cidr);
  const mask = maskForPrefix(version, prefix);
  const total = addrCount(cidr);

  const stats: SubnetStat[] = [];
  const groups: SubnetGroup[] = [];
  let summary: string;

  if (version === 4) {
    const netStr = ipv4ToString(net);
    const lastStr = ipv4ToString(last);

    let rangeValue: string;
    let rangeDisplay: string | undefined;
    if (prefix <= 30) {
      const first = ipv4ToString(net + 1n);
      const lastUsable = ipv4ToString(last - 1n);
      const usable = (total - 2n).toString();
      rangeValue = `${first}-${lastUsable}`;
      rangeDisplay = `${first} – ${lastUsable}`;
      stats.push(withDisplay('Usable hosts', usable));
      stats.push({ label: 'Usable range', value: rangeValue, display: rangeDisplay, mono: true });
      stats.push(withDisplay('Total addresses', total.toString()));
      summary = `/${prefix} — ${usable} usable hosts`;
    } else if (prefix === 31) {
      rangeValue = `${netStr}-${lastStr}`;
      rangeDisplay = `${netStr} – ${lastStr}`;
      stats.push({ label: 'Usable hosts', value: '2', caption: 'Point-to-point — RFC 3021' });
      stats.push({ label: 'Usable range', value: rangeValue, display: rangeDisplay, mono: true });
      stats.push({ label: 'Total addresses', value: '2' });
      summary = '/31 — 2 usable hosts (RFC 3021)';
    } else {
      rangeValue = netStr;
      stats.push({ label: 'Usable hosts', value: '1', caption: 'Single host route' });
      stats.push({ label: 'Host address', value: netStr, mono: true });
      stats.push({ label: 'Total addresses', value: '1' });
      summary = '/32 — 1 host';
    }

    groups.push({
      heading: 'Addressing',
      rows: [
        { label: 'Network address', value: netStr, mono: true },
        // A /31 has no broadcast (RFC 3021) and a /32 is a single host.
        { label: prefix >= 31 ? 'Last address' : 'Broadcast address', value: lastStr, mono: true },
        {
          label: 'Usable host range',
          value: rangeValue,
          ...(rangeDisplay ? { display: rangeDisplay } : {}),
          mono: true,
        },
      ],
    });

    const wildcard = fullMask(4) ^ mask;
    groups.push({
      heading: 'Masks',
      rows: [
        { label: 'Netmask', value: ipv4ToString(mask), mono: true },
        {
          label: 'Wildcard mask',
          value: ipv4ToString(wildcard),
          gloss: 'Inverse of the netmask — the match form Cisco ACLs and OSPF expect.',
          mono: true,
        },
        {
          label: 'Netmask (binary)',
          value: ipv4ToBinary(mask),
          gloss: 'The mask bit by bit — the 1s are the network part.',
          mono: true,
        },
      ],
    });

    const integer = net.toString();
    const integerDisplay = groupThousands(integer);
    groups.push({
      heading: 'Details',
      rows: [
        { label: 'Address type', value: classify(4, net) },
        {
          label: 'Network (integer)',
          value: integer,
          ...(integerDisplay ? { display: integerDisplay } : {}),
          gloss: 'The network address as a single 32-bit number, as scripts and databases store it.',
          mono: true,
        },
      ],
    });
  } else {
    const hostBits = BITS[6] - prefix;
    const netStr = ipv6Compress(net);
    const lastStr = ipv6Compress(last);

    if (hostBits <= 32) {
      stats.push(withDisplay('Total addresses', total.toString(), `2^${hostBits}`));
    } else {
      stats.push({ label: 'Total addresses', value: `2^${hostBits}` });
    }

    if (prefix === 128) {
      stats.push({ label: 'Host address', value: netStr, caption: 'Single host — /128', mono: true });
    } else {
      stats.push({
        label: 'Address range',
        value: `${netStr}-${lastStr}`,
        display: `${netStr} – ${lastStr}`,
        mono: true,
      });
    }

    if (prefix < 64) {
      const subnets = (1n << BigInt(64 - prefix)).toString();
      stats.push(withDisplay('/64 subnets', subnets));
    }

    summary =
      prefix === 128
        ? '/128 — 1 host'
        : hostBits > 32
          ? `/${prefix} — 2^${hostBits} addresses`
          : `/${prefix} — ${total.toString()} addresses`;

    groups.push({
      heading: 'Addressing',
      rows: [
        { label: 'Network address', value: netStr, mono: true },
        {
          label: 'Network (expanded)',
          value: ipv6Expand(net),
          gloss: 'All eight groups written out in full.',
          mono: true,
        },
        { label: 'Last address', value: lastStr, mono: true },
      ],
    });

    groups.push({
      heading: 'Details',
      rows: [{ label: 'Address type', value: classify(6, net) }],
    });
  }

  const title = `${formatAddr(version, net)}/${prefix}`;
  const normalized = `${formatAddr(version, addr)}/${prefix}`;
  const result: SubnetResult = { valid: true, version, title, normalized, summary, stats, groups };
  if (addr !== net) {
    result.note = `${formatAddr(version, addr)} is a host inside ${title} — results are for the whole block.`;
  }
  return result;
}

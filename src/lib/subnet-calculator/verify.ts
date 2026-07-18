/**
 * Subnet Calculator — Verify-the-AI engine. Recomputes network/broadcast/
 * netmask/wildcard/first/last/usableHosts/totalAddresses for a CIDR from
 * `ip-core` directly (not by parsing `calculate()`'s display strings) and
 * checks them against structured claims — what an AI assistant said the
 * answer was. Never parses free text; each claim is one field. Never throws.
 */
import {
  parseCidr,
  networkAddr,
  lastAddr,
  maskForPrefix,
  fullMask,
  addrCount,
  parseAddr,
  formatAddr,
  ipv4ToString,
  BITS,
  type IpVersion,
} from '../ip-core';
import { calculate } from './engine';
import { invalidBase, stripDigitSeparators, summarize, type ClaimCheck, type VerifyResult } from '../verify-shared';

export interface SubnetClaims {
  network?: string;
  broadcast?: string;
  netmask?: string;
  wildcard?: string;
  first?: string;
  last?: string;
  usableHosts?: string;
  totalAddresses?: string;
}

const LABELS: Record<keyof SubnetClaims, string> = {
  network: 'Network address',
  broadcast: 'Broadcast address',
  netmask: 'Netmask',
  wildcard: 'Wildcard mask',
  first: 'First usable address',
  last: 'Last usable address',
  usableHosts: 'Usable hosts',
  totalAddresses: 'Total addresses',
};

const ERR_EMPTY = 'Enter a CIDR to check claims against, like 192.168.1.0/24.';
const ERR_BAD = 'Not a valid IPv4/IPv6 address or CIDR.';

/** Parse a numeric claim (usableHosts/totalAddresses): plain digits, thousands
 *  separators, or a "2^N" exponent form for very large IPv6 counts. */
function parseCount(claimed: string): bigint | null {
  const s = stripDigitSeparators(claimed.trim());
  if (/^\d+$/.test(s)) return BigInt(s);
  const pow = /^2\^(\d{1,4})$/.exec(s);
  if (pow) return 1n << BigInt(pow[1]);
  return null;
}

/** Parse an address-ish claim of the given version, or null if unreadable. */
function parseAddrClaim(version: IpVersion, claimed: string): bigint | null {
  return parseAddr(version, claimed.trim());
}

interface Bounds {
  version: IpVersion;
  prefix: number;
  addr: bigint;
  net: bigint;
  last: bigint;
  blockSize: bigint;
  /** Usable range bounds — equal to net/last for /31 and /32 (or IPv6). */
  firstUsable: bigint;
  lastUsable: bigint;
  usableHosts: bigint;
  total: bigint;
}

function computeBounds(cidrStr: string): Bounds | { error: string } {
  const s = (cidrStr ?? '').trim();
  if (s.length === 0) return { error: ERR_EMPTY };
  // Reuse the tool's own full input grammar — "addr/prefix", "addr netmask",
  // and "addr/netmask" — via calculate(), rather than the bare-CIDR-only
  // parseCidr(), so a user pasting exactly what's already in the calculator
  // above (e.g. a dotted-netmask form) is never rejected here. `normalized`
  // is calculate()'s own "addr/prefix" echo of the ORIGINAL (unmasked)
  // address, which parseCidr can then read losslessly.
  const calcResult = calculate(s);
  if (!calcResult.valid || !calcResult.normalized) {
    return { error: calcResult.error ?? ERR_BAD };
  }
  const cidr = parseCidr(calcResult.normalized);
  if (!cidr) return { error: ERR_BAD };

  const { version, addr, prefix } = cidr;
  const net = networkAddr(cidr);
  const last = lastAddr(cidr);
  const total = addrCount(cidr);
  const blockSize = total;

  let firstUsable: bigint;
  let lastUsable: bigint;
  let usableHosts: bigint;

  if (version === 4 && prefix <= 30) {
    firstUsable = net + 1n;
    lastUsable = last - 1n;
    usableHosts = total - 2n;
  } else if (version === 4 && prefix === 31) {
    // RFC 3021 point-to-point: both addresses usable, no broadcast.
    firstUsable = net;
    lastUsable = last;
    usableHosts = 2n;
  } else if (version === 4 && prefix === 32) {
    firstUsable = net;
    lastUsable = last;
    usableHosts = 1n;
  } else {
    // IPv6 has no reserved network/broadcast addresses.
    firstUsable = net;
    lastUsable = last;
    usableHosts = total;
  }

  return { version, prefix, addr, net, last, blockSize, firstUsable, lastUsable, usableHosts, total };
}

function fmtAddr(version: IpVersion, v: bigint): string {
  return formatAddr(version, v);
}

function fmtCount(v: bigint): string {
  return v.toString();
}

/** Compare two address BigInts, producing a match/mismatch check with a
 *  targeted note for the documented off-by-one failure classes. */
function checkAddrField(
  field: keyof SubnetClaims,
  claimedRaw: string,
  actual: bigint,
  version: IpVersion,
  diagnose: (claimedInt: bigint) => string | undefined,
): ClaimCheck {
  const claimed = claimedRaw.trim();
  const parsed = parseAddrClaim(version, claimed);
  const actualStr = fmtAddr(version, actual);
  if (parsed === null) {
    return {
      field,
      label: LABELS[field],
      claimed,
      actual: actualStr,
      verdict: 'unreadable',
      note: `Couldn't read "${claimed}" as an address.`,
    };
  }
  if (parsed === actual) {
    return { field, label: LABELS[field], claimed, actual: actualStr, verdict: 'match' };
  }
  return {
    field,
    label: LABELS[field],
    claimed,
    actual: actualStr,
    verdict: 'mismatch',
    note: diagnose(parsed),
  };
}

function checkCountField(field: keyof SubnetClaims, claimedRaw: string, actual: bigint, note?: (claimed: bigint) => string | undefined): ClaimCheck {
  const claimed = claimedRaw.trim();
  const parsed = parseCount(claimed);
  const actualStr = fmtCount(actual);
  if (parsed === null) {
    return {
      field,
      label: LABELS[field],
      claimed,
      actual: actualStr,
      verdict: 'unreadable',
      note: `Couldn't read "${claimed}" as a number — try plain digits or 2^N.`,
    };
  }
  if (parsed === actual) {
    return { field, label: LABELS[field], claimed, actual: actualStr, verdict: 'match' };
  }
  return { field, label: LABELS[field], claimed, actual: actualStr, verdict: 'mismatch', note: note?.(parsed) };
}

export function verifyClaims(cidrInput: string, claims: SubnetClaims): VerifyResult {
  const bounds = computeBounds(cidrInput);
  if ('error' in bounds) return invalidBase(bounds.error);

  const { version, addr, net, last, blockSize, firstUsable, lastUsable, usableHosts, total, prefix } = bounds;
  const checks: ClaimCheck[] = [];

  if (claims.network?.trim()) {
    checks.push(
      checkAddrField('network', claims.network, net, version, (claimedInt) => {
        if (claimedInt === addr && addr !== net) {
          return 'Input echoed back, not masked down to the network address.';
        }
        if (claimedInt === net + blockSize) {
          return "That's the next block's network address — off by one block.";
        }
        return undefined;
      }),
    );
  }

  if (claims.broadcast?.trim()) {
    checks.push(
      checkAddrField('broadcast', claims.broadcast, last, version, (claimedInt) => {
        if (claimedInt === net + blockSize) {
          return "Off by one — that's the next block's network address, not this block's broadcast.";
        }
        if (claimedInt === last - 1n) {
          return 'Off by one — one address short of the actual broadcast.';
        }
        return undefined;
      }),
    );
  }

  if (claims.first?.trim()) {
    checks.push(
      checkAddrField('first', claims.first, firstUsable, version, (claimedInt) => {
        if (claimedInt === net) {
          return "That's the network address, not the first usable host.";
        }
        return undefined;
      }),
    );
  }

  if (claims.last?.trim()) {
    checks.push(
      checkAddrField('last', claims.last, lastUsable, version, (claimedInt) => {
        if (claimedInt === last) {
          return "That's the broadcast address, not the last usable host.";
        }
        return undefined;
      }),
    );
  }

  if (claims.netmask?.trim()) {
    checks.push(checkNetmaskOrWildcard('netmask', claims.netmask, version, prefix));
  }

  if (claims.wildcard?.trim()) {
    checks.push(checkNetmaskOrWildcard('wildcard', claims.wildcard, version, prefix));
  }

  if (claims.usableHosts?.trim()) {
    checks.push(
      checkCountField('usableHosts', claims.usableHosts, usableHosts, (claimedInt) => {
        if (claimedInt === total) {
          return 'Forgot to reserve the network and broadcast addresses.';
        }
        return undefined;
      }),
    );
  }

  if (claims.totalAddresses?.trim()) {
    checks.push(checkCountField('totalAddresses', claims.totalAddresses, total));
  }

  return {
    valid: true,
    summary: summarize(checks),
    checks,
    mismatchCount: checks.filter((c) => c.verdict === 'mismatch').length,
  };
}

/** Netmask/wildcard have no BigInt-address shape — handled separately: IPv6
 *  has neither concept surfaced by this tool, and IPv4 accepts a prefix
 *  ("/24") or a dotted mask, with a swap between the two flagged by note. */
function checkNetmaskOrWildcard(
  field: 'netmask' | 'wildcard',
  claimedRaw: string,
  version: IpVersion,
  prefix: number,
): ClaimCheck {
  const claimed = claimedRaw.trim();
  const label = LABELS[field];

  if (version === 6) {
    return {
      field,
      label,
      claimed,
      actual: 'N/A (IPv6)',
      verdict: 'unreadable',
      note: "IPv6 doesn't use a dotted netmask — check the prefix length instead.",
    };
  }

  const mask = maskForPrefix(4, prefix);
  const wildcard = fullMask(4) ^ mask;
  const actualInt = field === 'netmask' ? mask : wildcard;
  const actualStr = ipv4ToString(actualInt);

  const parsed = parseClaimedMask(claimed);
  if (parsed === null) {
    return {
      field,
      label,
      claimed,
      actual: actualStr,
      verdict: 'unreadable',
      note: `Couldn't read "${claimed}" as a prefix or dotted mask.`,
    };
  }
  if (parsed === actualInt) {
    return { field, label, claimed, actual: actualStr, verdict: 'match' };
  }
  const swappedWith = field === 'netmask' ? wildcard : mask;
  if (parsed === swappedWith) {
    return {
      field,
      label,
      claimed,
      actual: actualStr,
      verdict: 'mismatch',
      note:
        field === 'netmask'
          ? "That's the wildcard mask, not the netmask — its bits are inverted."
          : "That's the netmask, not the wildcard mask — swap 0s and 1s.",
    };
  }
  return { field, label, claimed, actual: actualStr, verdict: 'mismatch' };
}

/** Accept "/24" or a dotted mask ("255.255.255.0") for a netmask/wildcard claim. */
function parseClaimedMask(claimed: string): bigint | null {
  const s = claimed.trim();
  if (s.startsWith('/')) {
    const n = s.slice(1);
    if (!/^\d{1,2}$/.test(n)) return null;
    const prefix = Number(n);
    if (prefix > BITS[4]) return null;
    return maskForPrefix(4, prefix);
  }
  return parseAddr(4, s);
}

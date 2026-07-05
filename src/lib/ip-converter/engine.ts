/**
 * IP Address Converter — engine. Detects the input format (dotted decimal,
 * integer, 0x or bare hexadecimal, binary with optional separators, or an
 * IPv6 literal with optional %zone / /prefix) and renders every
 * representation of that address. Pure + browser-safe; never throws on user
 * input. All pre-processing lives here — ip-core stays untouched.
 */
import {
  fullMask,
  parseIPv4,
  parseIPv6,
  ipv4ToString,
  ipv4ToBinary,
  ipv6Groups,
  ipv6Compress,
  ipv6Expand,
  classify,
  type IpVersion,
} from '../ip-core';
import type { ConvertResult, ConvertRow } from './types';

/** Thin space (U+2009) used for display-only digit grouping. */
const THIN = ' ';

const ERR_EMPTY =
  'Enter an IP in any form: 192.168.1.10, 3232235786, 0xC0A8010A, or 2001:db8::1.';
const ERR_UNRECOGNISED =
  'Could not read that as an IPv4 or IPv6 address in any supported form.';
const ERR_IPV6_FALLBACK = 'Could not read that as an IPv6 address.';

function bad(error: string): ConvertResult {
  return { valid: false, error, rows: [] };
}

function binaryLengthError(bits: number): string {
  return `Binary input must be 32 bits (IPv4) or 128 bits (IPv6) — got ${bits}.`;
}

/** Accept a separator-stripped bit string of exactly 32 or 128 bits. */
function tryBinary(
  bits: string,
): { version: IpVersion; value: bigint; detected: string } | { error: string } {
  if (bits.length !== 32 && bits.length !== 128) return { error: binaryLengthError(bits.length) };
  return {
    version: bits.length === 32 ? 4 : 6,
    value: BigInt('0b' + bits),
    detected: `binary (${bits.length}-bit)`,
  };
}

/** Group a decimal digit string in 3s; undefined when too short to bother. */
function groupThousands(digits: string): string | undefined {
  if (digits.length < 5) return undefined;
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, THIN);
}

/** "C0A8010A" → "0xC0A8␉010A" (length is always a multiple of 4). */
function groupHex(hex: string): string {
  return '0x' + (hex.match(/.{4}/g) ?? [hex]).join(THIN);
}

/** Strip the separators accepted inside binary input. */
function stripSeparators(s: string): string {
  return s.replace(/[.:_ ]/g, '');
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
    if (segs.some((seg) => seg === '')) return ERR_IPV6_FALLBACK;
    // An embedded trailing IPv4 stands for two groups.
    const n = segs.length + (segs[segs.length - 1].includes('.') ? 1 : 0);
    if (n !== 8) return `Expected 8 colon-separated groups (or use "::") but found ${n}.`;
  }
  return ERR_IPV6_FALLBACK;
}

/** Targeted per-octet diagnosis for a dotted string parseIPv4 rejected. */
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
  return ERR_UNRECOGNISED;
}

/** W2 — leading-zero octets read as decimal here, octal in inet_aton parsers. */
function leadingZeroWarnings(s: string): string[] {
  return s
    .split('.')
    .filter((part) => /^0\d+$/.test(part))
    .map(
      (part) =>
        `Octet "${part}" has a leading zero — read as decimal ${Number(part)} here, but inet_aton-style parsers would read it as octal.`,
    );
}

export function convert(input: string): ConvertResult {
  let s = (input ?? '').trim();
  if (s.length === 0) return bad(ERR_EMPTY);

  const warnings: string[] = [];

  // 0a — strip a trailing /prefix (before the zone so fe80::1%eth0/64 works).
  const slash = s.lastIndexOf('/');
  if (slash !== -1 && /^\d{1,3}$/.test(s.slice(slash + 1))) {
    const base = s.slice(0, slash);
    if (base === '') return bad('Enter an address before the /prefix.');
    warnings.push(
      `Prefix /${s.slice(slash + 1)} was ignored — this tool converts the single address only. For network math, use the Subnet Calculator.`,
    );
    s = base;
  }

  // 0b — strip a %zone when what precedes it looks like an IPv6 base.
  let zone: string | undefined;
  const pct = s.indexOf('%');
  if (pct !== -1 && s.slice(0, pct).includes(':')) {
    zone = s.slice(pct + 1);
    s = s.slice(0, pct);
    if (zone === '') warnings.push('Empty zone ID after "%" was ignored.');
  }

  const isBinaryCandidate = /^[01.:_ ]+$/.test(s) && /[01]/.test(s);
  const strippedBits = isBinaryCandidate ? stripSeparators(s) : '';

  let version: IpVersion;
  let value: bigint;
  let detected: string;
  // The row that echoes the input; a v6 literal is resolved to Expanded vs
  // Compressed later, once the expanded form is computed.
  let inputLabel: string | null = null;
  let v6Literal = false;

  if (s.includes(':')) {
    // A — IPv6 literal first; 1111:…:1111 must never be read as binary.
    const v = parseIPv6(s);
    if (v !== null) {
      version = 6;
      value = v;
      detected = 'IPv6 literal';
      v6Literal = true;
    } else if (isBinaryCandidate) {
      const bin = tryBinary(strippedBits);
      if ('error' in bin) return bad(bin.error);
      ({ version, value, detected } = bin);
      inputLabel = 'Binary';
    } else {
      return bad(diagnoseIPv6(s));
    }
  } else if (/^0[xX][0-9a-fA-F]+$/.test(s)) {
    // B — 0x hex; width wins over magnitude (>8 digits ⇒ IPv6).
    const digits = s.length - 2;
    if (digits > 32) return bad(`That hexadecimal value is wider than 128 bits (${digits} hex digits).`);
    version = digits > 8 ? 6 : 4;
    value = BigInt(s);
    detected = 'hexadecimal';
    inputLabel = 'Hexadecimal';
  } else if (isBinaryCandidate && (strippedBits.length === 32 || strippedBits.length === 128)) {
    // C — binary with optional . : _ or space separators.
    const bin = tryBinary(strippedBits);
    if ('error' in bin) return bad(bin.error);
    ({ version, value, detected } = bin);
    inputLabel = 'Binary';
  } else if (/^[0-9a-fA-F]+$/.test(s) && /[a-fA-F]/.test(s)) {
    // D — bare hex (no 0x): only the two exact address widths are unambiguous.
    if (s.length !== 8 && s.length !== 32) {
      return bad(
        `Bare hexadecimal must be exactly 8 digits (IPv4) or 32 digits (IPv6) — got ${s.length}. Add a 0x prefix to convert by value instead.`,
      );
    }
    version = s.length === 8 ? 4 : 6;
    value = BigInt('0x' + s);
    detected = 'hexadecimal (no 0x prefix)';
    inputLabel = 'Hexadecimal';
  } else if (/^\d+$/.test(s)) {
    // E — integer; decimals have no canonical width, so magnitude decides.
    const v = BigInt(s);
    if (v <= fullMask(4)) version = 4;
    else if (v <= fullMask(6)) version = 6;
    else return bad('That integer is larger than a 128-bit address.');
    value = v;
    detected = 'integer';
    inputLabel = 'Integer (decimal)';
  } else if (s.includes('.')) {
    // F — dotted decimal; parseIPv4 is authoritative, diagnosis only shapes
    // the error message. Binary-looking octets get the binary-length error,
    // never "Octet 11000000 > 255".
    const parts = s.split('.');
    if (parts.every((part) => /^[01]{4,}$/.test(part))) {
      return bad(binaryLengthError(stripSeparators(s).length));
    }
    const v = parseIPv4(s);
    if (v === null) return bad(diagnoseIPv4(s));
    version = 4;
    value = v;
    detected = 'dotted decimal';
    inputLabel = 'Dotted decimal';
    warnings.push(...leadingZeroWarnings(s));
  } else if (isBinaryCandidate) {
    // G — binary-looking leftovers of the wrong length.
    return bad(binaryLengthError(strippedBits.length));
  } else {
    return bad(ERR_UNRECOGNISED);
  }

  const rows: ConvertRow[] = [];
  const integer = value.toString();
  const integerDisplay = groupThousands(integer);

  if (version === 4) {
    const dotted = ipv4ToString(value);
    const hex = value.toString(16).toUpperCase().padStart(8, '0');
    const swapped = [value & 0xffn, (value >> 8n) & 0xffn, (value >> 16n) & 0xffn, (value >> 24n) & 0xffn]
      .map((b) => b.toString(16).toUpperCase().padStart(2, '0'))
      .join('');
    rows.push({ label: 'Dotted decimal', value: dotted, mono: true });
    rows.push({
      label: 'Integer (decimal)',
      value: integer,
      mono: true,
      ...(integerDisplay ? { display: integerDisplay } : {}),
    });
    rows.push({ label: 'Hexadecimal', value: '0x' + hex, mono: true, display: groupHex(hex) });
    rows.push({ label: 'Binary', value: ipv4ToBinary(value), mono: true });
    rows.push({
      label: 'Hex (byte-swapped)',
      value: '0x' + swapped,
      mono: true,
      display: groupHex(swapped),
    });
    rows.push({
      label: 'PTR name',
      value: dotted.split('.').reverse().join('.') + '.in-addr.arpa',
      mono: true,
    });
    rows.push({ label: 'Address type', value: classify(4, value) });
  } else {
    const expanded = ipv6Expand(value);
    if (v6Literal) inputLabel = s.toLowerCase() === expanded ? 'Expanded' : 'Compressed';
    const hex = value.toString(16).padStart(32, '0');
    rows.push({ label: 'Compressed', value: ipv6Compress(value), mono: true });
    rows.push({ label: 'Expanded', value: expanded, mono: true });
    if (value >> 32n === 0xffffn) {
      rows.push({ label: 'Embedded IPv4', value: ipv4ToString(value & 0xffffffffn), mono: true });
    }
    rows.push({
      label: 'Integer (decimal)',
      value: integer,
      mono: true,
      ...(integerDisplay ? { display: integerDisplay } : {}),
    });
    rows.push({ label: 'Hexadecimal', value: '0x' + hex, mono: true, display: groupHex(hex) });
    rows.push({
      label: 'Binary',
      value: ipv6Groups(value)
        .map((g) => g.toString(2).padStart(16, '0'))
        .join(':'),
      mono: true,
    });
    rows.push({
      label: 'PTR name',
      value: expanded.replace(/:/g, '').split('').reverse().join('.') + '.ip6.arpa',
      mono: true,
    });
    rows.push({ label: 'Address type', value: classify(6, value) });
    if (zone) rows.push({ label: 'Zone ID', value: zone, mono: true });
  }

  // Exactly one row echoes the detected input format.
  const inputRow = rows.find((r) => r.label === inputLabel);
  if (inputRow) inputRow.isInput = true;

  const result: ConvertResult = { valid: true, version, detected, rows };
  if (warnings.length > 0) result.warnings = warnings;
  return result;
}

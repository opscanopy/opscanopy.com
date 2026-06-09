/**
 * IP Address Converter — engine. Detects the input format (dotted decimal,
 * integer, hexadecimal, binary, or IPv6) and renders every representation of
 * that address. Pure + browser-safe; never throws on user input.
 */
import {
  fullMask,
  parseIPv4,
  parseIPv6,
  ipv4ToString,
  ipv4ToBinary,
  ipv6Compress,
  ipv6Expand,
  classify,
  type IpVersion,
} from '../ip-core';
import type { ConvertResult, ConvertRow } from './types';

const ERR_EMPTY =
  'Enter an IP in any form: 192.168.1.10, 3232235786, 0xC0A8010A, or 2001:db8::1.';
const ERR_PARSE = 'Could not read that as an IPv4 or IPv6 address in any supported form.';

function bad(error: string): ConvertResult {
  return { valid: false, error, rows: [] };
}

export function convert(input: string): ConvertResult {
  const s = (input ?? '').trim();
  if (s.length === 0) return bad(ERR_EMPTY);

  let version: IpVersion;
  let value: bigint;
  let detected: string;

  if (s.includes(':')) {
    const v = parseIPv6(s);
    if (v === null) return bad(ERR_PARSE);
    version = 6;
    value = v;
    detected = 'IPv6 literal';
  } else if (/^0x[0-9a-fA-F]+$/.test(s)) {
    const v = BigInt(s);
    if (v <= fullMask(4)) version = 4;
    else if (v <= fullMask(6)) version = 6;
    else return bad('That hexadecimal value is larger than a 128-bit address.');
    value = v;
    detected = 'hexadecimal';
  } else if (/^[01]{32}$/.test(s)) {
    version = 4;
    value = BigInt('0b' + s);
    detected = 'binary (32-bit)';
  } else if (/^[01]{128}$/.test(s)) {
    version = 6;
    value = BigInt('0b' + s);
    detected = 'binary (128-bit)';
  } else if (/^\d+$/.test(s)) {
    const v = BigInt(s);
    if (v <= fullMask(4)) version = 4;
    else if (v <= fullMask(6)) version = 6;
    else return bad('That integer is larger than a 128-bit address.');
    value = v;
    detected = 'integer';
  } else if (s.includes('.')) {
    const v = parseIPv4(s);
    if (v === null) return bad(ERR_PARSE);
    version = 4;
    value = v;
    detected = 'dotted decimal';
  } else {
    return bad(ERR_PARSE);
  }

  const rows: ConvertRow[] = [];
  if (version === 4) {
    rows.push({ label: 'Dotted decimal', value: ipv4ToString(value), mono: true });
    rows.push({ label: 'Integer (decimal)', value: value.toString(), mono: true });
    rows.push({
      label: 'Hexadecimal',
      value: '0x' + value.toString(16).toUpperCase().padStart(8, '0'),
      mono: true,
    });
    rows.push({ label: 'Binary', value: ipv4ToBinary(value), mono: true });
    rows.push({ label: 'Address type', value: classify(4, value) });
  } else {
    rows.push({ label: 'Compressed', value: ipv6Compress(value), mono: true });
    rows.push({ label: 'Expanded', value: ipv6Expand(value), mono: true });
    rows.push({ label: 'Integer (decimal)', value: value.toString(), mono: true });
    rows.push({
      label: 'Hexadecimal',
      value: '0x' + value.toString(16).padStart(32, '0'),
      mono: true,
    });
    rows.push({ label: 'Address type', value: classify(6, value) });
  }

  return { valid: true, version, detected, rows };
}

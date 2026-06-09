/**
 * MAC Address Formatter — engine. Accepts an EUI-48 MAC in any common
 * notation (colon, hyphen, Cisco dotted, or bare hex, with an optional leading
 * "0x"), then renders every separator form plus the OUI, the I/G and U/L bit
 * interpretations, and the derived IPv6 link-local (modified EUI-64) address.
 * Pure + browser-safe; never throws on user input.
 */
import { ipv6Compress } from '../ip-core';
import type { MacResult, MacRow } from './types';

const ERR_EMPTY = 'Enter a MAC address, e.g. 00:1a:2b:3c:4d:5e or 001a.2b3c.4d5e.';
const ERR_PARSE =
  'Not a valid 48-bit MAC address. Expected 12 hex digits, e.g. 00:1a:2b:3c:4d:5e.';

/** Render six bytes joined by `sep`, in the requested case. */
function join(bytes: number[], sep: string, upper: boolean): string {
  return bytes
    .map((b) => {
      const h = b.toString(16).padStart(2, '0');
      return upper ? h.toUpperCase() : h;
    })
    .join(sep);
}

export function format(input: string): MacResult {
  const trimmed = (input ?? '').trim();
  if (trimmed.length === 0) return { valid: false, error: ERR_EMPTY, rows: [] };

  // Strip an optional leading "0x", then remove every separator character.
  const withoutPrefix = trimmed.replace(/^0x/i, '');
  const hex = withoutPrefix.replace(/[\s:.\-]/g, '');

  if (!/^[0-9a-fA-F]{12}$/.test(hex)) {
    return { valid: false, error: ERR_PARSE, rows: [] };
  }

  // Parse to 6 bytes.
  const bytes: number[] = [];
  for (let i = 0; i < 12; i += 2) bytes.push(parseInt(hex.slice(i, i + 2), 16));

  const lower = hex.toLowerCase();
  const rows: MacRow[] = [];

  rows.push({ label: 'Colon (lowercase)', value: join(bytes, ':', false), mono: true });
  rows.push({ label: 'Hyphen (uppercase)', value: join(bytes, '-', true), mono: true });
  rows.push({
    label: 'Dotted (Cisco)',
    value: `${lower.slice(0, 4)}.${lower.slice(4, 8)}.${lower.slice(8, 12)}`,
    mono: true,
  });
  rows.push({ label: 'No separators', value: lower, mono: true });
  rows.push({ label: 'OUI (first 3 bytes)', value: join(bytes.slice(0, 3), ':', true), mono: true });

  // I/G bit — bit 0 of the first octet: 0 = unicast, 1 = multicast.
  const isBroadcast = bytes.every((b) => b === 0xff);
  let transmission = (bytes[0] & 0x01) === 0 ? 'Unicast' : 'Multicast';
  if (isBroadcast) transmission += ' — broadcast';
  rows.push({ label: 'Transmission', value: transmission });

  // U/L bit — bit 1 of the first octet: 0 = universal/OUI, 1 = local.
  const administration =
    (bytes[0] & 0x02) === 0 ? 'Universal / OUI-assigned' : 'Locally administered';
  rows.push({ label: 'Administration', value: administration });

  // Modified EUI-64: flip the U/L bit of the first octet, then insert
  // 0xff 0xfe between bytes 3 and 4. Prepend fe80::/64 for the link-local.
  const eui64 = [
    bytes[0] ^ 0x02,
    bytes[1],
    bytes[2],
    0xff,
    0xfe,
    bytes[3],
    bytes[4],
    bytes[5],
  ];
  let interfaceId = 0n;
  for (const b of eui64) interfaceId = (interfaceId << 8n) | BigInt(b);
  const linkLocal = (0xfe80n << 112n) | interfaceId;
  rows.push({ label: 'IPv6 link-local (EUI-64)', value: ipv6Compress(linkLocal), mono: true });

  return { valid: true, rows };
}

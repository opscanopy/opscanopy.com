/**
 * IP Address Converter — bundled examples spanning every accepted input form:
 * dotted decimal, a 32-bit integer, hexadecimal (0x and bare), binary,
 * a compressed IPv6 literal, and an IPv4-mapped IPv6 address.
 * The first entry is the playground seed — keep it 192.168.1.10.
 */
import type { ConvertExample } from './types';

export const examples: ConvertExample[] = [
  { id: 'v4-dotted', label: '192.168.1.10 — dotted decimal', input: '192.168.1.10' },
  { id: 'v4-int', label: '3232235786 — integer', input: '3232235786' },
  { id: 'v4-hex', label: '0xC0A8010A — hexadecimal', input: '0xC0A8010A' },
  { id: 'v6', label: '2001:db8::1 — IPv6', input: '2001:db8::1' },
  {
    id: 'v4-binary',
    label: '11000000.10101000.00000001.00001010 — binary',
    input: '11000000.10101000.00000001.00001010',
  },
  { id: 'v4-bare-hex', label: '0A01A8C0 — bare hex', input: '0A01A8C0' },
  { id: 'v6-mapped', label: '::ffff:192.168.1.10 — IPv4-mapped', input: '::ffff:192.168.1.10' },
];

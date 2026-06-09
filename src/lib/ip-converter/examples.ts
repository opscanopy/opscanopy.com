/**
 * IP Address Converter — bundled examples spanning every accepted input form:
 * dotted decimal, a 32-bit integer, hexadecimal, and a compressed IPv6 literal.
 */
import type { ConvertExample } from './types';

export const examples: ConvertExample[] = [
  { id: 'v4-dotted', label: '192.168.1.10 — dotted decimal', input: '192.168.1.10' },
  { id: 'v4-int', label: '3232235786 — integer', input: '3232235786' },
  { id: 'v4-hex', label: '0xC0A8010A — hexadecimal', input: '0xC0A8010A' },
  { id: 'v6', label: '2001:db8::1 — IPv6', input: '2001:db8::1' },
];

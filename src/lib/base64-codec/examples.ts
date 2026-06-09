/**
 * Base64 Encoder / Decoder — bundled examples spanning the useful cases:
 * a plain encode, a plain decode, a url-safe token (no padding, -/_ alphabet),
 * and a JSON string that exercises multibyte-safe UTF-8 round-tripping.
 */
import type { Base64Example } from './types';

export const examples: Base64Example[] = [
  {
    id: 'encode-hello',
    label: 'Encode — "hello world"',
    input: 'hello world',
    mode: 'encode',
    urlSafe: false,
  },
  {
    id: 'decode-hello',
    label: 'Decode — aGVsbG8gd29ybGQ=',
    input: 'aGVsbG8gd29ybGQ=',
    mode: 'decode',
    urlSafe: false,
  },
  {
    id: 'decode-urlsafe',
    label: 'Decode — url-safe token (no padding)',
    input: 'SGVsbG8sIPCfjI4',
    mode: 'decode',
    urlSafe: true,
  },
  {
    id: 'encode-json',
    label: 'Encode — a JSON string',
    input: '{"name":"Café","ok":true}',
    mode: 'encode',
    urlSafe: false,
  },
];

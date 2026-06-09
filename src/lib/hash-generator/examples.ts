/**
 * Hash Generator — bundled examples for the picker. Each spans a useful case:
 * the canonical "abc" test vector, a short phrase with a space, a password-like
 * string, and the empty string (whose well-known digests are handy fixtures).
 */
import type { HashExample } from './types';

export const examples: HashExample[] = [
  { id: 'abc', label: '"abc" — classic test vector', input: 'abc' },
  { id: 'hello-world', label: '"hello world" — short phrase', input: 'hello world' },
  { id: 'password', label: 'Correct-Horse-Battery-Staple-42 — password-like', input: 'Correct-Horse-Battery-Staple-42' },
  { id: 'empty', label: '(empty string) — known-empty digests', input: '' },
];

/**
 * Case Converter — bundled example chips spanning the interesting tokenizer
 * cases: a camelCase identifier with a trailing acronym, a plain spaced phrase,
 * a hyphenated name mixing an acronym with words, and an embedded acronym.
 * examples[0] seeds the playground on first load.
 */
import type { CaseExample } from './types';

export const examples: CaseExample[] = [
  { id: 'user-profile-id', label: 'userProfileID', input: 'userProfileID' },
  { id: 'hello-world', label: 'hello world example', input: 'hello world example' },
  { id: 'http-server-name', label: 'HTTP-Server-Name', input: 'HTTP-Server-Name' },
  { id: 'get-url-from-string', label: 'getURLFromString', input: 'getURLFromString' },
];

/**
 * Case Converter — pure, dependency-free case-conversion engine.
 *
 * Given any identifier or phrase, `convertCases()` tokenizes it into words and
 * recombines those words into eleven case styles (camelCase, PascalCase,
 * snake_case, SCREAMING_SNAKE_CASE, CONSTANT_CASE, kebab-case, Train-Case,
 * Title Case, sentence case, dot.case, path/case). Runs entirely client-side;
 * `tokenize()` and `convertCases()` never throw.
 *
 * ── ACRONYM POLICY: NORMALIZE acronyms ───────────────────────────────────────
 * Acronym runs are treated as ordinary words, not preserved as all-caps. So
 * `userProfileID` tokenizes to [user, profile, id] and `getURLFromString`
 * tokenizes to [get, url, from, string]. Their camelCase output is therefore
 * `userProfileId` / `getUrlFromString` — simpler and, crucially, round-trip
 * stable: feeding the camelCase output back in yields the same tokens. There is
 * no special "keep HTTP uppercase" mode.
 *
 * ── TOKENIZE (Unicode-aware, uses \p{L}/\p{N} with the `u` flag) ─────────────
 *   1. Split on any run of non-[\p{L}\p{N}] (spaces, _, -, ., /, symbols).
 *   2. Within a chunk, insert word boundaries at:
 *      - acronym-run → word:  (\p{Lu})(\p{Lu}\p{Ll})   e.g. HTTPResponse → HTTP·Response
 *      - lower → Upper:       (\p{Ll})(\p{Lu})          e.g. userProfile  → user·Profile
 *      - letter ↔ number (both directions): (\p{L})(\p{N}) / (\p{N})(\p{L})
 *        e.g. v2Release → v·2·Release ; Release2 → Release·2
 *   3. Lowercase every token for recombination.
 */
import type { CaseKind, CaseResult, CaseRow } from './types';

/** Zero-width sentinel inserted at detected word boundaries, then split on. */
const SEP = '\u0000';

/**
 * Split an arbitrary string into lowercased word tokens. Never throws; returns
 * an empty array for empty / token-less input.
 */
export function tokenize(input: string): string[] {
  if (typeof input !== 'string' || input.length === 0) return [];

  const bounded = input
    // acronym-run → word: HTTPResponse → HTTP·Response (before lower→Upper).
    .replace(/(\p{Lu})(\p{Lu}\p{Ll})/gu, `$1${SEP}$2`)
    // lower → Upper: userProfile → user·Profile.
    .replace(/(\p{Ll})(\p{Lu})/gu, `$1${SEP}$2`)
    // letter → number: v2 → v·2.
    .replace(/(\p{L})(\p{N})/gu, `$1${SEP}$2`)
    // number → letter: 2Release → 2·Release.
    .replace(/(\p{N})(\p{L})/gu, `$1${SEP}$2`);

  // Split on the sentinel plus any run of non-alphanumeric characters, then
  // lowercase and drop empties.
  return bounded
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length > 0)
    .map((t) => t.toLowerCase());
}

/** Uppercase the first character of a token (rest already lowercased). */
function capitalize(token: string): string {
  if (token.length === 0) return token;
  return token.charAt(0).toUpperCase() + token.slice(1);
}

/**
 * Convert `input` into every supported case style. Empty / token-less input
 * returns { valid:false, error, rows:[] }.
 */
export function convertCases(input: string): CaseResult {
  const tokens = tokenize(input);

  if (tokens.length === 0) {
    return {
      valid: false,
      error: 'Enter some text to convert, e.g. "userProfileID".',
      rows: [],
    };
  }

  const camel =
    tokens[0] + tokens.slice(1).map(capitalize).join('');
  const pascal = tokens.map(capitalize).join('');
  const snake = tokens.join('_');
  const screaming = snake.toUpperCase();
  const kebab = tokens.join('-');
  const train = tokens.map(capitalize).join('-');
  const title = tokens.map(capitalize).join(' ');
  const sentence = capitalize(tokens[0]) + (tokens.length > 1 ? ' ' + tokens.slice(1).join(' ') : '');
  const dot = tokens.join('.');
  const path = tokens.join('/');

  const rows: CaseRow[] = [
    { kind: 'camel', label: 'camelCase', value: camel },
    { kind: 'pascal', label: 'PascalCase', value: pascal },
    { kind: 'snake', label: 'snake_case', value: snake },
    { kind: 'screamingSnake', label: 'SCREAMING_SNAKE_CASE', value: screaming },
    { kind: 'constant', label: 'CONSTANT_CASE', value: screaming },
    { kind: 'kebab', label: 'kebab-case', value: kebab },
    { kind: 'train', label: 'Train-Case', value: train },
    { kind: 'title', label: 'Title Case', value: title },
    { kind: 'sentence', label: 'sentence case', value: sentence },
    { kind: 'dot', label: 'dot.case', value: dot },
    { kind: 'path', label: 'path/case', value: path },
  ];

  return { valid: true, rows };
}

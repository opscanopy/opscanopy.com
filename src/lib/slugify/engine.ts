/**
 * Slugify engine — turn an arbitrary title into a clean, URL-safe slug.
 *
 * Pure and dependency-free (no DOM). Never throws on user input: bad options or
 * empty input yield `{ valid:false, error }`.
 *
 * Pipeline:
 *   1. NFKD-normalize, then strip ALL combining marks (`/\p{M}+/gu`) so every
 *      diacritic class is removed — `café` → `cafe`, the ligature `ﬁ` → `fi`,
 *      and a decomposed `é` (`e` + U+0301) → `e`.
 *   2. Optionally lowercase.
 *   3. Replace any run of characters outside the allowed set (`[a-z0-9]`, or
 *      `[a-zA-Z0-9]` when not lowercasing) with the configured separator, then
 *      collapse repeats and trim leading/trailing separators.
 *   4. Enforce `maxLength`: prefer truncating at the last separator boundary at
 *      or before the limit; if there is NO separator before the limit, hard-cut
 *      at `maxLength` (stripping a trailing separator left by the cut).
 */
import type { SlugifyOptions, SlugifyResult } from './types';

/** The only characters permitted as a word separator. */
const ALLOWED_SEPARATORS = new Set(['-', '_', '.']);

/** Escape a single character for safe use inside a RegExp. */
function escapeForRegex(ch: string): string {
  return ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function slugify(input: string, opts: SlugifyOptions): SlugifyResult {
  const separator = opts?.separator;
  if (
    typeof separator !== 'string' ||
    separator.length !== 1 ||
    !ALLOWED_SEPARATORS.has(separator)
  ) {
    return { valid: false, slug: '', error: 'Separator must be one of "-", "_" or ".".' };
  }

  if (typeof input !== 'string' || input.trim().length === 0) {
    return { valid: false, slug: '', error: 'Enter a title to slugify, e.g. "Hello World!".' };
  }

  const sepEsc = escapeForRegex(separator);
  const notes: string[] = [];

  // 1. Decompose to NFKD and strip every combining mark (all diacritic classes).
  let s = input.normalize('NFKD').replace(/\p{M}+/gu, '');

  // 2. Optional lowercasing.
  if (opts.lowercase) s = s.toLowerCase();

  // 3. Any run of disallowed characters becomes a single separator …
  const disallowed = opts.lowercase ? /[^a-z0-9]+/g : /[^a-zA-Z0-9]+/g;
  s = s.replace(disallowed, separator);
  // … collapse any repeats that survived, then trim the edges.
  s = s.replace(new RegExp(`${sepEsc}{2,}`, 'g'), separator);
  s = s.replace(new RegExp(`^${sepEsc}+|${sepEsc}+$`, 'g'), '');

  const collapsed = s;

  // 4. Enforce the max-length budget.
  const max = opts.maxLength;
  if (typeof max === 'number' && Number.isFinite(max) && max > 0 && s.length > max) {
    const head = s.slice(0, max);
    const lastSep = head.lastIndexOf(separator);
    // Prefer a clean word boundary; otherwise hard-cut at the limit.
    s = lastSep > 0 ? head.slice(0, lastSep) : head;
    // Drop any trailing separator the cut left behind.
    s = s.replace(new RegExp(`${sepEsc}+$`, 'g'), '');
  }

  const truncated = s !== collapsed;
  if (truncated) notes.push(`Truncated to fit the ${max}-character limit.`);
  if (collapsed.length === 0) {
    notes.push('No slug characters — the title has no letters or digits.');
  }

  return {
    valid: true,
    slug: s,
    truncated: truncated || undefined,
    notes: notes.length ? notes : undefined,
  };
}

/**
 * Tool-local deep-link fragment for the URL Encoder / Decoder: the
 * hash-in-hash problem.
 *
 * Every other tool on the site shares a plain value (`#ip=10.0.0.0/8`). This
 * one shares URLs, which may themselves contain `#`, `%` and `&` — so the
 * payload is `encodeURIComponent`-wrapped, which escapes exactly those three
 * (`%23`, `%25`, `%26`) and makes the mode suffix unambiguous:
 *
 *     #in=<encodeURIComponent(input)>&mode=<parse|decode|encode>
 *
 * `readUrlCodecHash()` reads through `new URL(location.href).hash` rather than
 * `location.hash`, because Firefox returns `location.hash` already
 * percent-decoded — a shared URL containing `%25` would then make
 * `decodeURIComponent` throw (the same guard `src/lib/ip-hash.ts` documents).
 *
 * The parse half is pure and unit-tested; only the one-line window read is not.
 * A fragment whose payload cannot be decoded is NOT discarded: the raw text is
 * handed to the engine so the user gets a positioned diagnostic instead of a
 * silently blank playground.
 *
 * Deliberately NOT carried in the fragment: the per-mode checkboxes. Every
 * bundled example works on the defaults (`+ is a space` resolves itself from the
 * input), so a restored link reproduces any chip exactly; a link shared after a
 * manual toggle restores the input and mode, then re-derives the rest.
 */
import type { UrlCodecMode } from './types';

/** Fragments beyond this length stop being dependable URLs (proxies, chat clients). */
export const MAX_HASH_LEN = 2000;

export interface UrlCodecHash {
  input: string;
  mode: UrlCodecMode;
}

function toMode(value: string | undefined): UrlCodecMode {
  return value === 'encode' || value === 'decode' ? value : 'parse';
}

export function buildUrlCodecHash(input: string, mode: UrlCodecMode): string {
  return `#in=${encodeURIComponent(input)}&mode=${mode}`;
}

/**
 * Parse a raw fragment (leading `#` included) into input + mode, or null when it
 * is not this tool's fragment. Pure — pass `window.location.hash` in from the
 * caller so this stays testable.
 */
export function parseUrlCodecHash(rawHash: string): UrlCodecHash | null {
  if (!rawHash.startsWith('#in=')) return null;
  const body = rawHash.slice(1);
  let encoded = '';
  let mode: string | undefined;
  for (const pair of body.split('&')) {
    const eq = pair.indexOf('=');
    if (eq === -1) continue;
    const key = pair.slice(0, eq);
    const value = pair.slice(eq + 1);
    if (key === 'in') encoded = value;
    else if (key === 'mode') mode = value;
  }
  let input: string;
  try {
    input = decodeURIComponent(encoded);
  } catch {
    // Malformed payload (`#in=%%%`): keep the raw text so the engine can name
    // the problem, rather than dropping the link on the floor.
    input = encoded;
  }
  if (input.length === 0) return null;
  return { input, mode: toMode(mode) };
}

/** Browser read of the current fragment. */
export function readUrlCodecHash(): UrlCodecHash | null {
  try {
    return parseUrlCodecHash(new URL(window.location.href).hash);
  } catch {
    return null;
  }
}

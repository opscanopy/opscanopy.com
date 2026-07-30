/**
 * jq Playground — the `#q=` deep link.
 *
 * A jq session is three things (program, input, flags) and a shared link is
 * worthless if it restores only one of them, so all three ride the fragment as
 * one base64url JSON payload — the `#s=`/`#q=` pattern the other tools use
 * (`src/lib/codec.ts`, `docker-run-to-compose`, `data-size`).
 *
 * The second accepted form matters more here than anywhere else on the site:
 * `#q=` reads as "query", so people WILL hand-write and hand-edit it. A
 * fragment that is not our payload is therefore treated as a bare jq PROGRAM
 * with no input (`input: null`), and the caller seeds the input itself. The
 * alternative — silently ignoring the fragment and showing the default example
 * — would answer a question nobody asked.
 *
 * Pure and SSR-safe: `decodeState()` with no argument and no `window` returns
 * null, and nothing here throws on any input.
 */
import { base64UrlDecode, base64UrlEncode } from '../codec';
import type { JqFlags, JqShareState } from './types';

/** Wire form — one letter per flag, because it rides in a URL. */
interface WireState {
  /** program */
  p: string;
  /** input */
  i: string;
  /** flags, as a subset of `rsnc` in that order */
  f: string;
}

const FLAG_LETTERS = 'rsnc';

function flagsToLetters(flags: JqFlags | undefined): string {
  const f = flags ?? ({} as JqFlags);
  let out = '';
  if (f.rawOutput) out += 'r';
  if (f.slurp) out += 's';
  if (f.nullInput) out += 'n';
  if (f.compact) out += 'c';
  return out;
}

function lettersToFlags(letters: unknown): JqFlags {
  const text = typeof letters === 'string' ? letters : '';
  return {
    rawOutput: text.includes('r'),
    slurp: text.includes('s'),
    nullInput: text.includes('n'),
    compact: text.includes('c'),
  };
}

/** Encode program + input + flags as a `#q=` fragment. */
export function encodeState(state: JqShareState): string {
  const wire: WireState = {
    p: typeof state?.program === 'string' ? state.program : '',
    i: typeof state?.input === 'string' ? state.input : '',
    f: flagsToLetters(state?.flags),
  };
  return '#q=' + base64UrlEncode(JSON.stringify(wire));
}

/**
 * Decode a `#q=` fragment. Two accepted forms, in order:
 *
 *   1. the base64url JSON payload `encodeState` writes (program + input +
 *      flags);
 *   2. RAW TEXT — a hand-written `#q=.items%5B%5D.name`, read as a program with
 *      `input: null`.
 *
 * Returns null when there is no `q=` fragment, when it is empty, or when it
 * decodes to nothing but whitespace.
 */
export function decodeState(hash?: string): JqShareState | null {
  const source =
    typeof hash === 'string'
      ? hash
      : typeof window !== 'undefined' && window.location
        ? window.location.hash
        : '';
  const match = /[#&]q=([^&]*)/.exec(source);
  if (!match) return null;
  const encoded = match[1];
  if (encoded.length === 0) return null;

  try {
    const wire = JSON.parse(base64UrlDecode(encoded)) as Partial<WireState> | null;
    if (
      wire &&
      typeof wire === 'object' &&
      typeof wire.p === 'string' &&
      wire.p.trim().length > 0 &&
      typeof wire.i === 'string'
    ) {
      return {
        program: wire.p,
        input: wire.i,
        flags: lettersToFlags(typeof wire.f === 'string' ? wire.f : ''),
      };
    }
  } catch {
    /* not our payload — fall through to the raw-program reading */
  }

  let program = encoded;
  try {
    program = decodeURIComponent(encoded);
  } catch {
    /* a malformed percent escape: keep the fragment verbatim */
  }
  if (program.trim().length === 0) return null;
  return { program, input: null, flags: lettersToFlags('') };
}

/** The flag letters, exported so a caller can document the wire format. */
export const WIRE_FLAG_LETTERS = FLAG_LETTERS;

/**
 * JWT Decoder & Encoder — lossless JSON *source* handling.
 *
 * WHY THIS EXISTS. The rest of this tool used `JSON.parse` → `JSON.stringify`
 * to build both the rendered header/payload and the signed token segments.
 * That round-trip is not information-preserving, and for a tool whose whole
 * job is "show me exactly what is inside this token" (and "sign exactly what I
 * typed") every one of these losses is a real defect:
 *
 *   - Numbers outside the double's precision are silently rewritten:
 *     1234567890123456789 → 1234567890123456800. A user "signs" a `uid` they
 *     never wrote, and because the signature is computed over the *rewritten*
 *     bytes it verifies cleanly — nothing flags it.
 *   - Numbers outside the double's range become `Infinity` and then serialize
 *     as `null` (1e400 → null), i.e. a claim vanishes.
 *   - Duplicate members collapse: `{"sub":"admin","sub":"guest"}` renders as
 *     just `guest`, hiding the exact ambiguity an attacker relies on when the
 *     issuer's parser and the verifier's parser disagree about which wins.
 *   - Integer-like keys are reordered by JS object semantics:
 *     `{"sub":"a","2":"two","1":"one"}` renders as `1, 2, sub`.
 *
 * So: parse with `JSON.parse` to *validate* and to feed the claim-inspection
 * features (exp/nbf/iat arithmetic legitimately needs JS values), but derive
 * every byte that is displayed or signed from the user's own source text.
 *
 * The tokenizer below is deliberately small and bounded: one linear left-to-
 * right pass, no backtracking, no regex over slices, an explicit frame stack
 * instead of recursion (so a deeply nested hostile token cannot overflow), and
 * caps on how many notes are collected. It does NOT validate grammar — both
 * call sites run `JSON.parse` first, so structure is already known-good; the
 * tokenizer only needs to find literal boundaries, and it returns null rather
 * than guessing if it meets anything it does not recognise.
 */

/** A number literal whose JS value is not the value written in the token. */
export interface LossyNumber {
  /** The literal exactly as written, e.g. "1234567890123456789". */
  literal: string;
  /** What a JS consumer actually sees, e.g. "1234567890123456768". */
  asJs: string;
  /** 'range' = overflowed to ±Infinity or underflowed to 0; 'precision' = rounded. */
  why: 'range' | 'precision';
}

/** The lossless render of one segment plus the security-relevant oddities in it. */
export interface JsonSourceInfo {
  /** 2-space pretty print, byte-identical to `JSON.stringify(x, null, 2)` for
   *  ordinary JSON, but preserving literals, member order and duplicates. */
  pretty: string;
  /** Member names that appear more than once inside the same object. */
  duplicateKeys: string[];
  /** Number literals JS cannot represent (deduped, capped). */
  lossyNumbers: LossyNumber[];
}

/** Stop collecting notes past this many — a hostile token must not spam the UI. */
const MAX_NOTES = 5;

type TokKind = '{' | '}' | '[' | ']' | ':' | ',' | 'string' | 'number' | 'word';

interface Tok {
  kind: TokKind;
  /** The exact source slice (punctuation is its own character). */
  text: string;
}

/** RFC 8259 insignificant whitespace — the same four bytes `JSON.parse` skips. */
function isWs(c: string): boolean {
  return c === ' ' || c === '\t' || c === '\n' || c === '\r';
}

/** Sticky so number scanning never slices the input (keeps the pass linear). */
const NUMBER_RE = /-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/y;
const HEX4_RE = /[0-9a-fA-F]{4}/y;

/** Index just past the closing quote of the string starting at `start`, or -1. */
function scanString(src: string, start: number): number {
  let i = start + 1;
  while (i < src.length) {
    const c = src[i];
    if (c === '"') return i + 1;
    if (c === '\\') {
      const esc = src[i + 1];
      if (esc === undefined) return -1;
      if (esc === 'u') {
        HEX4_RE.lastIndex = i + 2;
        if (!HEX4_RE.test(src)) return -1;
        i += 6;
        continue;
      }
      if (!'"\\/bfnrt'.includes(esc)) return -1;
      i += 2;
      continue;
    }
    if (c < ' ') return -1; // raw control characters are not legal in JSON strings
    i++;
  }
  return -1;
}

/** Split JSON source into literal-preserving tokens, or null if unrecognisable. */
function tokenize(src: string): Tok[] | null {
  const toks: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (isWs(c)) {
      i++;
      continue;
    }
    if (c === '{' || c === '}' || c === '[' || c === ']' || c === ':' || c === ',') {
      toks.push({ kind: c, text: c });
      i++;
      continue;
    }
    if (c === '"') {
      const end = scanString(src, i);
      if (end < 0) return null;
      toks.push({ kind: 'string', text: src.slice(i, end) });
      i = end;
      continue;
    }
    if (c === '-' || (c >= '0' && c <= '9')) {
      NUMBER_RE.lastIndex = i;
      const m = NUMBER_RE.exec(src);
      if (m === null) return null;
      toks.push({ kind: 'number', text: m[0] });
      i += m[0].length;
      continue;
    }
    let word: string | null = null;
    if (src.startsWith('true', i)) word = 'true';
    else if (src.startsWith('false', i)) word = 'false';
    else if (src.startsWith('null', i)) word = 'null';
    if (word === null) return null;
    toks.push({ kind: 'word', text: word });
    i += word.length;
  }
  return toks;
}

/** The member name a key token denotes (`"a"` and `"a"` are the same key). */
function keyName(raw: string): string | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === 'string' ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Classify a number literal against what a double can hold. Overflow /
 * underflow / integer rounding are detected exactly (BigInt comparison for
 * integers). Fractional literals that lose low-order digits are deliberately
 * NOT flagged — proving that needs arbitrary-precision decimal arithmetic, and
 * the displayed text is lossless regardless; the cases that actually cause
 * security incidents (large integer IDs, out-of-range values) are covered.
 */
function lossyNumber(literal: string): LossyNumber | null {
  const n = Number(literal);
  if (!Number.isFinite(n)) {
    return { literal, asJs: n > 0 ? 'Infinity' : '-Infinity', why: 'range' };
  }
  if (n === 0 && /[1-9]/.test(literal)) {
    return { literal, asJs: '0', why: 'range' };
  }
  if (/^-?[0-9]+$/.test(literal) && Number.isInteger(n) && BigInt(literal) !== BigInt(n)) {
    return { literal, asJs: n.toFixed(0), why: 'precision' };
  }
  return null;
}

/** One open object/array while walking the token stream. */
interface Frame {
  obj: boolean;
  /** True when the next string token in this object frame is a member name. */
  atKey: boolean;
  /** Member names seen so far (objects only) — for duplicate detection. */
  seen: Set<string> | null;
}

/**
 * Pretty-print JSON source losslessly and report its hostile properties.
 * Layout matches `JSON.stringify(value, null, 2)` exactly (including `{}` /
 * `[]` for empty containers) so ordinary tokens render as they always did.
 * Returns null only if the text is not recognisable JSON.
 */
export function inspectJsonSource(text: string): JsonSourceInfo | null {
  const toks = tokenize(text);
  if (toks === null) return null;

  const out: string[] = [];
  const stack: Frame[] = [];
  const duplicateKeys: string[] = [];
  const lossyNumbers: LossyNumber[] = [];
  const indent = (depth: number) => `\n${'  '.repeat(depth)}`;

  for (let k = 0; k < toks.length; k++) {
    const t = toks[k];
    const top = stack[stack.length - 1];

    if (t.kind === '{' || t.kind === '[') {
      const close = t.kind === '{' ? '}' : ']';
      if (toks[k + 1]?.kind === close) {
        out.push(t.kind, close); // JSON.stringify renders empty containers inline
        k++;
        continue;
      }
      out.push(t.kind);
      stack.push({
        obj: t.kind === '{',
        atKey: t.kind === '{',
        seen: t.kind === '{' ? new Set<string>() : null,
      });
      out.push(indent(stack.length));
      continue;
    }
    if (t.kind === '}' || t.kind === ']') {
      stack.pop();
      out.push(indent(stack.length), t.kind);
      continue;
    }
    if (t.kind === ',') {
      out.push(',', indent(stack.length));
      if (top?.obj) top.atKey = true;
      continue;
    }
    if (t.kind === ':') {
      out.push(': ');
      continue;
    }

    if (t.kind === 'number' && lossyNumbers.length < MAX_NOTES) {
      const note = lossyNumber(t.text);
      if (note !== null && !lossyNumbers.some((p) => p.literal === note.literal)) {
        lossyNumbers.push(note);
      }
    }
    if (t.kind === 'string' && top?.obj === true && top.atKey) {
      const name = keyName(t.text);
      if (name !== null && top.seen !== null) {
        if (top.seen.has(name)) {
          if (!duplicateKeys.includes(name) && duplicateKeys.length < MAX_NOTES) {
            duplicateKeys.push(name);
          }
        } else {
          top.seen.add(name);
        }
      }
      top.atKey = false;
    }
    out.push(t.text);
  }

  return { pretty: out.join(''), duplicateKeys, lossyNumbers };
}

/** Index just past the complete value starting at `k` (skips whole subtrees). */
function endOfValue(toks: Tok[], k: number): number {
  const t = toks[k];
  if (t === undefined) return k;
  if (t.kind !== '{' && t.kind !== '[') return k + 1;
  let depth = 0;
  for (let i = k; i < toks.length; i++) {
    const kind = toks[i].kind;
    if (kind === '{' || kind === '[') depth++;
    else if (kind === '}' || kind === ']') {
      depth--;
      if (depth === 0) return i + 1;
    }
  }
  return toks.length;
}

/**
 * Minify JSON source losslessly — strip insignificant whitespace and nothing
 * else. Every string and number literal is copied through byte-for-byte, so
 * the bytes that get signed are the bytes the user typed.
 *
 * `pin` overwrites the value of every top-level member with that name (this is
 * how `sign()` forces `alg`), appending the member last when the source has no
 * such member — which is what the old `{ ...obj, alg }` spread did. Every
 * top-level occurrence is pinned, not just the last: a header with a duplicate
 * `alg` must not be able to mean two different algorithms to two parsers.
 *
 * Returns null if the text is not recognisable JSON.
 */
export function minifyJsonSource(
  text: string,
  pin?: { name: string; json: string },
): string | null {
  const toks = tokenize(text);
  if (toks === null) return null;

  const out: string[] = [];
  const stack: Frame[] = [];
  let pinned = false;

  for (let k = 0; k < toks.length; k++) {
    const t = toks[k];
    const top = stack[stack.length - 1];

    if (t.kind === '{' || t.kind === '[') {
      out.push(t.kind);
      stack.push({ obj: t.kind === '{', atKey: t.kind === '{', seen: null });
      continue;
    }
    if (t.kind === '}' || t.kind === ']') {
      if (pin !== undefined && !pinned && t.kind === '}' && stack.length === 1) {
        const sep = out[out.length - 1] === '{' ? '' : ',';
        out.push(`${sep}${JSON.stringify(pin.name)}:${pin.json}`);
        pinned = true;
      }
      stack.pop();
      out.push(t.kind);
      continue;
    }
    if (t.kind === ',' || t.kind === ':') {
      out.push(t.kind);
      if (t.kind === ',' && top?.obj) top.atKey = true;
      continue;
    }

    if (t.kind === 'string' && top?.obj === true && top.atKey) {
      top.atKey = false;
      out.push(t.text);
      if (pin !== undefined && stack.length === 1 && keyName(t.text) === pin.name) {
        if (toks[k + 1]?.kind !== ':') return null;
        out.push(':', pin.json);
        pinned = true;
        k = endOfValue(toks, k + 2) - 1;
      }
      continue;
    }
    out.push(t.text);
  }

  return out.join('');
}

/**
 * Turn a segment's hostile properties into user-facing advisories. These are
 * security-relevant facts about the token — a duplicate claim means two
 * libraries can disagree about its value — so they belong in the warnings
 * block, not swallowed.
 */
export function jsonSourceWarnings(
  where: 'header' | 'payload',
  info: JsonSourceInfo | null,
): string[] {
  if (info === null) return [];
  const out: string[] = [];
  for (const name of info.duplicateKeys) {
    out.push(
      `Duplicate "${name}" member in the ${where}: JSON parsers keep only the last value while other ` +
        `implementations read the first, so this token can mean different things to the issuer and the verifier.`,
    );
  }
  for (const num of info.lossyNumbers) {
    out.push(
      num.why === 'range'
        ? `The ${where} number ${num.literal} is outside JavaScript's double range: a JS consumer reads it as ` +
            `${num.asJs} and re-serialises it as null, so the claim it compares is not the claim in the token.`
        : `The ${where} number ${num.literal} exceeds JavaScript's safe integer range: a JS consumer reads it as ` +
            `${num.asJs}, so the value it compares is not the value in the token.`,
    );
  }
  return out;
}

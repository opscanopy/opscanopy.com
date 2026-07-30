/**
 * Data Size & Transfer-Rate Converter — exact arithmetic, the frozen unit
 * tables, and the input grammar. Pure; nothing here touches the DOM.
 *
 * WHY RATIONALS OVER BIGINT: a data-size converter is only useful if it is
 * exact. `5 YiB` is a 25-digit byte count and `1 Gbps` is exactly `125 MB/s`;
 * both are unrepresentable in a double, and a tool that quietly prints
 * `6.044629098073146e24` is worse than no tool. So every quantity is carried as
 * `n / d` over BigInt — the input's decimal digits become the numerator, every
 * unit factor is an integer power of 1000 or 1024, and dividing by 8 (bits →
 * bytes) or by 1024^n only ever multiplies the denominator. Because those
 * denominators factor into 2s and 5s, every conversion has an EXACT finite
 * decimal expansion, which `exactDecimal()` returns verbatim. `number` appears
 * exactly nowhere in the value path.
 *
 * THE GRAMMAR IS FROZEN HERE (plan: "Grammar frozen in units.ts tables"):
 *   sign? number unit?
 *   number : digits, `,` `_` or space thousands groups, `.` or `,` decimal,
 *            optional e±N exponent
 *   unit   : final letter decides the measure — `b` is ALWAYS bits, `B` is
 *            ALWAYS bytes; an `i` before it means 1024-based (IEC); a bare
 *            prefix (`K`, `Gi`) means bytes; no unit at all means bytes.
 *            Word forms (kilobyte, gibibytes, Mbit) are case-insensitive.
 *   rate   : the same, plus a `/s`, `ps` or `per second` suffix.
 */
import type { Measures, UnitFamily, ValueCell } from './types';

/* ────────────────────────────────────────────────────────────────────────── */
/* Exact rational arithmetic                                                  */
/* ────────────────────────────────────────────────────────────────────────── */

/** An exact non-negative rational `n / d`. `d` is always > 0. */
export interface Rational {
  n: bigint;
  d: bigint;
}

export function rat(n: bigint, d: bigint = 1n): Rational {
  return d < 0n ? { n: -n, d: -d } : { n, d };
}

export function pow(base: bigint, exp: number): bigint {
  return base ** BigInt(exp);
}

function gcd(a: bigint, b: bigint): bigint {
  let x = a < 0n ? -a : a;
  let y = b < 0n ? -b : b;
  while (y !== 0n) {
    const t = x % y;
    x = y;
    y = t;
  }
  return x;
}

export function reduce(r: Rational): Rational {
  if (r.n === 0n) return { n: 0n, d: 1n };
  const g = gcd(r.n, r.d);
  return { n: r.n / g, d: r.d / g };
}

export function mulBig(r: Rational, k: bigint): Rational {
  return { n: r.n * k, d: r.d };
}

export function divBig(r: Rational, k: bigint): Rational {
  return rat(r.n, r.d * k);
}

export function mulRat(a: Rational, b: Rational): Rational {
  return { n: a.n * b.n, d: a.d * b.d };
}

export function divRat(a: Rational, b: Rational): Rational {
  return rat(a.n * b.d, a.d * b.n);
}

export function isZero(r: Rational): boolean {
  return r.n === 0n;
}

/** `a >= b` for non-negative rationals. */
export function gte(a: Rational, b: Rational): boolean {
  return a.n * b.d >= b.n * a.d;
}

/** `a < b` for non-negative rationals. */
export function lt(a: Rational, b: Rational): boolean {
  return a.n * b.d < b.n * a.d;
}

/** Render `scaled / 10^frac` as a plain decimal string, trailing zeros trimmed. */
function formatScaled(scaled: bigint, frac: number): string {
  const negative = scaled < 0n;
  let digits = (negative ? -scaled : scaled).toString();
  if (frac === 0) return (negative ? '-' : '') + digits;
  if (digits.length <= frac) digits = digits.padStart(frac + 1, '0');
  const int = digits.slice(0, digits.length - frac);
  const rest = digits.slice(digits.length - frac).replace(/0+$/, '');
  return (negative ? '-' : '') + (rest.length > 0 ? `${int}.${rest}` : int);
}

/**
 * The exact decimal expansion, or null when there isn't one (a denominator with
 * a prime factor other than 2 or 5, e.g. seconds at a rate of 3 bit/s).
 */
export function exactDecimal(r: Rational): string | null {
  const { n, d } = reduce(r);
  if (d === 1n) return n.toString();
  let rest = d;
  let twos = 0;
  let fives = 0;
  while (rest % 2n === 0n) {
    rest /= 2n;
    twos += 1;
  }
  while (rest % 5n === 0n) {
    rest /= 5n;
    fives += 1;
  }
  if (rest !== 1n) return null;
  const frac = Math.max(twos, fives);
  return formatScaled((n * pow(10n, frac)) / d, frac);
}

/** Round half-up to `maxFrac` decimals, reporting whether that was lossless. */
export function roundDecimal(r: Rational, maxFrac: number): { text: string; exact: boolean } {
  const scale = pow(10n, maxFrac);
  const scaled = r.n * scale;
  const q = scaled / r.d;
  const rem = scaled % r.d;
  const negative = r.n < 0n;
  const absRem = rem < 0n ? -rem : rem;
  const rounded = absRem * 2n >= r.d ? (negative ? q - 1n : q + 1n) : q;
  return { text: formatScaled(rounded, maxFrac), exact: rem === 0n };
}

/** Exactly `digits` decimals, zeros kept — for percentages like `2.40`. */
export function fixed(r: Rational, digits: number): string {
  const scale = pow(10n, digits);
  const scaled = r.n * scale;
  const q = scaled / r.d;
  const rem = scaled % r.d;
  const rounded = rem * 2n >= r.d ? q + 1n : q;
  const s = rounded.toString().padStart(digits + 1, '0');
  return digits === 0 ? s : `${s.slice(0, s.length - digits)}.${s.slice(s.length - digits)}`;
}

/**
 * Space-group the integer part, but only above four digits — so `1024` reads as
 * `1024` (and the notes that quote small unit factors stay readable) while
 * `1610612736` reads as `1 610 612 736`. ISO 31-0's own recommendation.
 */
export function groupDigits(text: string): string {
  const [int, frac] = text.split('.');
  const sign = int.startsWith('-') ? '-' : '';
  const bare = sign ? int.slice(1) : int;
  const grouped =
    bare.length > 4 ? bare.replace(/\B(?=(\d{3})+(?!\d))/g, ' ') : bare;
  return sign + grouped + (frac ? `.${frac}` : '');
}

/** Value + grouped display + the ≈ flag, capped at `maxFrac` decimals. */
export function cell(r: Rational, maxFrac = 6): ValueCell {
  const exact = exactDecimal(r);
  if (exact !== null) {
    const frac = exact.split('.')[1] ?? '';
    if (frac.length <= maxFrac) {
      return { value: exact, display: groupDigits(exact), approx: false };
    }
  }
  const { text } = roundDecimal(r, maxFrac);
  return { value: text, display: groupDigits(text), approx: true };
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Unit tables (frozen)                                                       */
/* ────────────────────────────────────────────────────────────────────────── */

/** Index = prefix power. Index 0 is the unprefixed unit. */
export const SI_SYMBOL = ['', 'k', 'M', 'G', 'T', 'P', 'E', 'Z', 'Y'] as const;
export const IEC_SYMBOL = ['', 'Ki', 'Mi', 'Gi', 'Ti', 'Pi', 'Ei', 'Zi', 'Yi'] as const;
export const SI_PREFIX_NAME = [
  '',
  'kilo',
  'mega',
  'giga',
  'tera',
  'peta',
  'exa',
  'zetta',
  'yotta',
] as const;
export const IEC_PREFIX_NAME = [
  '',
  'kibi',
  'mebi',
  'gibi',
  'tebi',
  'pebi',
  'exbi',
  'zebi',
  'yobi',
] as const;

/** The highest prefix power the ladder goes to (yotta / yobi). */
export const MAX_EXPONENT = 8;

/** Lowercased prefix letter → power. `k` and `K` are both kilo here. */
const PREFIX_LETTER_EXPONENT: Record<string, number> = {
  k: 1,
  m: 2,
  g: 3,
  t: 4,
  p: 5,
  e: 6,
  z: 7,
  y: 8,
};

/** Spelled-out prefix (either convention) → power. */
const PREFIX_WORD_EXPONENT: Record<string, { exponent: number; family: UnitFamily }> = (() => {
  const map: Record<string, { exponent: number; family: UnitFamily }> = {};
  SI_PREFIX_NAME.forEach((name, exponent) => {
    if (name) map[name] = { exponent, family: 'si' };
  });
  IEC_PREFIX_NAME.forEach((name, exponent) => {
    if (name) map[name] = { exponent, family: 'iec' };
  });
  return map;
})();

export interface UnitDef {
  /** Canonical symbol, e.g. `kB`, `GiB`, `Mb`. */
  symbol: string;
  /** Spelled-out singular name, e.g. `gibibyte`. */
  name: string;
  family: UnitFamily;
  base: 1000 | 1024;
  exponent: number;
  measures: Measures;
  /** Exact number of bits in one of this unit. */
  bitsPer: bigint;
}

export function makeUnit(family: UnitFamily, exponent: number, measures: Measures): UnitDef {
  const base: 1000 | 1024 = family === 'iec' ? 1024 : 1000;
  const prefixSymbol = family === 'iec' ? IEC_SYMBOL[exponent] : SI_SYMBOL[exponent];
  const prefixName = family === 'iec' ? IEC_PREFIX_NAME[exponent] : SI_PREFIX_NAME[exponent];
  return {
    symbol: prefixSymbol + (measures === 'bits' ? 'b' : 'B'),
    name: prefixName + (measures === 'bits' ? 'bit' : 'byte'),
    family,
    base,
    exponent,
    measures,
    bitsPer: pow(BigInt(base), exponent) * (measures === 'bits' ? 1n : 8n),
  };
}

/** The byte unit at one rung of one convention — the ladder's building block. */
export function byteUnit(family: UnitFamily, exponent: number): UnitDef {
  return makeUnit(family, exponent, 'bytes');
}

/**
 * How much bigger the IEC unit is than the SI unit at the same rung, as an
 * exact rational percentage: 2.4% at kilo, 20.89% at yotta.
 */
export function divergenceMore(exponent: number): Rational {
  const iec = pow(1024n, exponent);
  const si = pow(1000n, exponent);
  return rat((iec - si) * 100n, si);
}

/** The mirror figure: how much smaller the SI unit is than the IEC one. */
export function divergenceLess(exponent: number): Rational {
  const iec = pow(1024n, exponent);
  const si = pow(1000n, exponent);
  return rat((iec - si) * 100n, iec);
}

/** The largest rung at which `value` (in `base`-scaled units) is still ≥ 1. */
export function bestExponent(value: Rational, base: 1000n | 1024n): number {
  let best = 0;
  for (let exponent = 1; exponent <= MAX_EXPONENT; exponent += 1) {
    if (gte(value, rat(pow(base, exponent)))) best = exponent;
    else break;
  }
  return best;
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Unit resolution                                                            */
/* ────────────────────────────────────────────────────────────────────────── */

export type UnitForm = 'symbol' | 'word' | 'bare-prefix' | 'none';

export interface ResolvedUnit {
  def: UnitDef;
  form: UnitForm;
  /** The token as the user wrote it (rate suffix and plural stripped). */
  written: string;
}

// The prefix letter is case-insensitive (nobody means millibytes by `mb`), but
// the FINAL letter never is: `b` is bits and `B` is bytes, always.
const SYMBOL_RE = /^([kKmMgGtTpPeEzZyY])?([iI])?([bB])$/;
const BARE_PREFIX_RE = /^([kKmMgGtTpPeEzZyY])([iI])?$/;
const WORD_RE =
  /^(kilo|kibi|mega|mebi|giga|gibi|tera|tebi|peta|pebi|exa|exbi|zetta|zebi|yotta|yobi|[kmgtpezy]i?)?(bytes?|bits?|octets?)$/i;

/** Resolve one unit token, or null when it is not a unit at all. */
export function resolveUnit(token: string, allowPlural = true): ResolvedUnit | null {
  const raw = token.trim();
  if (raw.length === 0) return null;

  // Word forms first: they legitimately end in `s` (bytes, gibibytes, Mbit).
  const word = WORD_RE.exec(raw);
  if (word) {
    const measures: Measures = /^bit/i.test(word[2]) ? 'bits' : 'bytes';
    const prefix = (word[1] ?? '').toLowerCase();
    let exponent = 0;
    let family: UnitFamily = 'si';
    if (prefix.length > 0) {
      const spelled = PREFIX_WORD_EXPONENT[prefix];
      if (spelled) {
        exponent = spelled.exponent;
        family = spelled.family;
      } else {
        const letter = prefix[0];
        const found = PREFIX_LETTER_EXPONENT[letter];
        if (found === undefined) return null;
        exponent = found;
        family = prefix.endsWith('i') ? 'iec' : 'si';
      }
    }
    return { def: makeUnit(family, exponent, measures), form: 'word', written: raw };
  }

  const symbol = SYMBOL_RE.exec(raw);
  if (symbol) {
    const iec = symbol[2] !== undefined;
    if (iec && symbol[1] === undefined) return null; // `iB` is not a unit
    const exponent = symbol[1] ? PREFIX_LETTER_EXPONENT[symbol[1].toLowerCase()] : 0;
    const measures: Measures = symbol[3] === 'b' ? 'bits' : 'bytes';
    return {
      def: makeUnit(iec ? 'iec' : 'si', exponent, measures),
      form: 'symbol',
      written: raw,
    };
  }

  const bare = BARE_PREFIX_RE.exec(raw);
  if (bare) {
    const iec = bare[2] !== undefined;
    const exponent = PREFIX_LETTER_EXPONENT[bare[1].toLowerCase()];
    return {
      def: makeUnit(iec ? 'iec' : 'si', exponent, 'bytes'),
      form: 'bare-prefix',
      written: raw,
    };
  }

  // `5GBs`, `2 MiBs` — a plural symbol, once.
  if (allowPlural && raw.length > 1 && (raw.endsWith('s') || raw.endsWith('S'))) {
    const inner = resolveUnit(raw.slice(0, -1), false);
    if (inner && inner.form !== 'word') return { ...inner, written: inner.written };
  }
  return null;
}

/** Up to four plausible units for an unrecognised token, best first. */
export function suggestUnits(token: string): string[] {
  const letter = token.trim().charAt(0).toLowerCase();
  const exponent = PREFIX_LETTER_EXPONENT[letter];
  if (exponent === undefined) return ['B', 'b', 'kB', 'KiB'];
  return [
    makeUnit('si', exponent, 'bytes').symbol,
    makeUnit('si', exponent, 'bits').symbol,
    makeUnit('iec', exponent, 'bytes').symbol,
    makeUnit('iec', exponent, 'bits').symbol,
  ];
}

/** `GB, Gb, GiB or Gib` */
export function listSuggestions(units: string[]): string {
  if (units.length <= 1) return units.join('');
  return `${units.slice(0, -1).join(', ')} or ${units[units.length - 1]}`;
}

/* ────────────────────────────────────────────────────────────────────────── */
/* The parser                                                                 */
/* ────────────────────────────────────────────────────────────────────────── */

/** Refuse pathological input before it becomes a million-digit string. */
export const MAX_INPUT_LEN = 400;
const MAX_INT_DIGITS = 301;
const MAX_FRAC_DIGITS = 100;

export type ParseField = 'size' | 'rate';

export interface ParsedQuantity {
  ok: true;
  /** Exact bits (bits per second, for a rate). */
  bits: Rational;
  /** The numeric value in its own unit, e.g. 1.5 for `1.5 GiB`. */
  amount: Rational;
  /** Canonical plain-decimal number, e.g. `1500` for `1.5e3`. */
  numberText: string;
  /** The number exactly as typed, e.g. `1,234`. */
  writtenNumber: string;
  unit: UnitDef;
  /** The unit token as typed (`''` when omitted). */
  writtenUnit: string;
  unitForm: UnitForm;
  /** True when the token carried a `/s`, `ps` or `per second` suffix. */
  isRate: boolean;
  /** Notes about how the NUMBER was read (separator judgement calls). */
  notes: string[];
}

export interface ParseFailure {
  ok: false;
  error: string;
  suggestions?: string[];
}

export type ParseOutcome = ParsedQuantity | ParseFailure;

const RATE_SUFFIXES: RegExp[] = [
  /\s*\/\s*sec(ond)?s?$/i,
  /\s*\/\s*s$/i,
  /\s+per\s+sec(ond)?s?$/i,
  /ps$/,
];

function isDigit(ch: string | undefined): boolean {
  return ch !== undefined && ch >= '0' && ch <= '9';
}

/** Resolve thousands/decimal separators into one plain decimal string. */
function resolveNumber(raw: string): { text: string; notes: string[] } | { error: string } {
  const fail = { error: `Could not read "${raw}" as a number.` };
  const commas = (raw.match(/,/g) ?? []).length;
  const dots = (raw.match(/\./g) ?? []).length;
  const notes: string[] = [];

  let decimalChar: ',' | '.' | null = null;
  if (commas > 0 && dots > 0) {
    decimalChar = raw.lastIndexOf(',') > raw.lastIndexOf('.') ? ',' : '.';
  } else if (commas > 0) {
    const after = raw.slice(raw.lastIndexOf(',') + 1);
    // Two or more commas can only be thousands grouping ("12,345,678") — mirroring the dot
    // branch below. Only a lone comma is ambiguous, and then a 3-digit tail reads as grouping
    // while anything else reads as a decimal comma ("1,5").
    decimalChar = commas === 1 && after.length !== 3 ? ',' : null;
  } else if (dots > 0) {
    decimalChar = dots === 1 ? '.' : null;
  }

  let intRaw = raw;
  let fracRaw = '';
  if (decimalChar) {
    const at = raw.lastIndexOf(decimalChar);
    if (raw.indexOf(decimalChar) !== at) return fail; // two decimal points
    intRaw = raw.slice(0, at);
    fracRaw = raw.slice(at + 1);
  }
  if (/[^0-9]/.test(fracRaw)) return fail;

  // Underscores group freely (JS numeric-literal style); the others must form
  // real 3-digit groups, so `1,23,456` is a typo rather than a silent 123456.
  const intNoUnderscore = intRaw.replace(/_/g, '');
  const groupChars = [',', '.', ' '].filter((c) => c !== decimalChar);
  const groupRe = new RegExp(`[${groupChars.map((c) => (c === '.' ? '\\.' : c)).join('')}]`);
  if (groupRe.test(intNoUnderscore)) {
    const parts = intNoUnderscore.split(groupRe);
    if (parts.some((p) => p.length === 0)) return fail;
    if (parts[0].length > 3) return fail;
    if (parts.slice(1).some((p) => p.length !== 3)) return fail;
  }
  const int = intNoUnderscore.replace(new RegExp(groupRe.source, 'g'), '');
  if (int.length > 0 && /[^0-9]/.test(int)) return fail;

  const cleanedInt = int.replace(/^0+(?=\d)/, '') || '0';
  const cleaned = fracRaw.length > 0 ? `${cleanedInt}.${fracRaw}` : cleanedInt;

  if (decimalChar === ',') {
    notes.push(
      `Read "${raw}" as ${cleaned} — the comma is a decimal separator, not a thousands separator.`,
    );
  } else if (commas > 0) {
    const advice =
      commas === 1 && fracRaw.length === 0
        ? ` Write ${raw.replace(',', '.')} if you meant a decimal fraction.`
        : '';
    notes.push(`Read "${raw}" as ${cleaned} — the comma groups thousands.${advice}`);
  }
  if (dots > 1 || (dots > 0 && decimalChar === ',')) {
    notes.push(`Read "${raw}" as ${cleaned} — the dots group thousands.`);
  }
  return { text: cleaned, notes };
}

/** `1.5` → 15/10 */
function decimalToRational(text: string): Rational {
  const [int, frac = ''] = text.split('.');
  return rat(BigInt(`${int}${frac}` || '0'), pow(10n, frac.length));
}

/**
 * Parse one size or rate token. Never throws: every rejection is a sentence
 * naming the actual problem, because "invalid" is not a diagnostic.
 */
export function parseQuantity(input: string, field: ParseField): ParseOutcome {
  const normalizedWhitespace = (input ?? '')
    .replace(/[    ]/g, ' ')
    .replace(/\s+/g, ' ');
  const raw = normalizedWhitespace.trim();
  if (raw.length === 0) {
    return {
      ok: false,
      error:
        field === 'rate'
          ? 'Enter a link speed like 1 Gbps, 100 Mbps or 50 MB/s.'
          : 'Enter a size like 1.5 GiB, 500 GB or 128 Mb.',
    };
  }
  if (raw.length > MAX_INPUT_LEN) {
    return {
      ok: false,
      error: `That input is too long to be a single ${
        field === 'rate' ? 'rate' : 'size'
      } — ${MAX_INPUT_LEN} characters is the limit.`,
    };
  }

  let rest = raw;
  let negative = false;
  const sign = /^[+-]/.exec(rest);
  if (sign) {
    negative = sign[0] === '-';
    rest = rest.slice(1).trimStart();
  }

  // Scan the number: digits, in-number separators, then an optional exponent.
  let written = '';
  let exponentText = '';
  let i = 0;
  while (i < rest.length) {
    const ch = rest[i];
    if (isDigit(ch)) {
      written += ch;
      i += 1;
      continue;
    }
    if ((ch === '.' || ch === ',' || ch === '_' || ch === ' ') && isDigit(rest[i + 1])) {
      written += ch;
      i += 1;
      continue;
    }
    if ((ch === 'e' || ch === 'E') && written.length > 0) {
      const exp = /^[+-]?\d+/.exec(rest.slice(i + 1));
      if (exp) {
        exponentText = exp[0];
        i += 1 + exp[0].length;
      }
    }
    break;
  }
  if (written.replace(/[^0-9]/g, '').length === 0) {
    return {
      ok: false,
      error:
        field === 'rate'
          ? 'Start with a number, like 1 Gbps or 50 MB/s.'
          : 'Start with a number, like 1.5 GiB or 500 GB.',
    };
  }
  if (negative) {
    return {
      ok: false,
      error:
        field === 'rate'
          ? 'A transfer rate cannot be negative — drop the minus sign.'
          : 'A size cannot be negative — drop the minus sign.',
    };
  }

  const resolved = resolveNumber(written.startsWith('.') ? `0${written}` : written);
  if ('error' in resolved) return { ok: false, error: resolved.error };

  const exponent = exponentText.length > 0 ? Number(exponentText) : 0;
  const [intPart, fracPart = ''] = resolved.text.split('.');
  const intDigits = (intPart === '0' ? 0 : intPart.length) + Math.max(0, exponent);
  const fracDigits = Math.max(0, fracPart.length - exponent);
  if (intDigits > MAX_INT_DIGITS) {
    return { ok: false, error: 'That number is too big to convert — keep it under 1e300.' };
  }
  if (fracDigits > MAX_FRAC_DIGITS) {
    return {
      ok: false,
      error: `That number has too many decimal places — ${MAX_FRAC_DIGITS} is the limit.`,
    };
  }

  let amount = decimalToRational(resolved.text);
  if (exponent > 0) amount = mulBig(amount, pow(10n, exponent));
  else if (exponent < 0) amount = divBig(amount, pow(10n, -exponent));

  // Unit token: strip the rate suffix, then resolve.
  let unitToken = rest.slice(i).trim();
  let isRate = false;
  for (const suffix of RATE_SUFFIXES) {
    if (suffix.test(unitToken)) {
      unitToken = unitToken.replace(suffix, '').trim();
      isRate = true;
      break;
    }
  }
  // A trailing separator is someone still typing ("1." / "1,"), not a unit.
  if (/^[.,_\s]*$/.test(unitToken)) unitToken = '';

  if (unitToken.length === 0) {
    const def = makeUnit('si', 0, 'bytes');
    return {
      ok: true,
      bits: mulBig(amount, def.bitsPer),
      amount,
      numberText: exactDecimal(amount) ?? roundDecimal(amount, 6).text,
      writtenNumber: written,
      unit: def,
      writtenUnit: '',
      unitForm: 'none',
      isRate,
      notes: resolved.notes,
    };
  }

  const unit = resolveUnit(unitToken);
  if (!unit) {
    const suggestions = suggestUnits(unitToken);
    const shown = unitToken.length > 80 ? `${unitToken.slice(0, 80)}…` : unitToken;
    return {
      ok: false,
      error: `Unknown unit "${shown}". Did you mean ${listSuggestions(suggestions)}?`,
      suggestions,
    };
  }

  return {
    ok: true,
    bits: mulBig(amount, unit.def.bitsPer),
    amount,
    numberText: exactDecimal(amount) ?? roundDecimal(amount, 6).text,
    writtenNumber: written,
    unit: unit.def,
    writtenUnit: unit.written,
    unitForm: unit.form,
    isRate,
    notes: resolved.notes,
  };
}

/**
 * Data Size & Transfer-Rate Converter — the public engine façade.
 *
 *   convert(input)            → detection + exact bit/byte counts + the paired
 *                               SI|IEC ladder + notes
 *   transferTime(size, rate)  → humanised duration, exact seconds, both rate
 *                               forms, and the always-present 90% row
 *   encodeState / parseState / decodeState  → the `#q=` deep link
 *
 * Contract, inherited by every caller: these functions NEVER throw. Bad input
 * comes back as `valid: false` with a sentence that names the actual problem
 * ("Octet 256 is greater than 255." energy — never "invalid"), and anything the
 * parser had to interpret comes back as a `notes` entry while the result stays
 * valid. All arithmetic is exact — see `units.ts` for why and how.
 */
import { base64UrlDecode, base64UrlEncode } from '../codec';
import type {
  ConvertResult,
  DataSizeState,
  Detection,
  DurationCell,
  LadderPair,
  RateDetection,
  SizeRow,
  TransferResult,
  ValueCell,
} from './types';
import {
  IEC_PREFIX_NAME,
  IEC_SYMBOL,
  MAX_EXPONENT,
  SI_PREFIX_NAME,
  bestExponent,
  byteUnit,
  cell,
  divBig,
  divRat,
  divergenceLess,
  divergenceMore,
  fixed,
  groupDigits,
  isZero,
  lt,
  makeUnit,
  mulBig,
  mulRat,
  parseQuantity,
  pow,
  rat,
  roundDecimal,
  type ParsedQuantity,
  type Rational,
} from './units';

/** Ladder cells and duration seconds never print more than six decimals. */
const MAX_FRACTION_DIGITS = 6;
/** The realistic-throughput row the plan requires on every transfer result. */
const EFFICIENCY_PERCENT = 90;
/** Longest `size`/`rate` string accepted out of a shared link. */
const MAX_STATE_FIELD_LEN = 200;

/* ────────────────────────────────────────────────────────────────────────── */
/* convert()                                                                  */
/* ────────────────────────────────────────────────────────────────────────── */

function ladderRow(bytes: Rational, family: 'si' | 'iec', exponent: number): SizeRow {
  const unit = byteUnit(family, exponent);
  const base = family === 'iec' ? 1024n : 1000n;
  const value = cell(divBig(bytes, pow(base, exponent)), MAX_FRACTION_DIGITS);
  return {
    unit: unit.symbol,
    unitName: unit.name,
    family,
    base: unit.base,
    exponent,
    cell: value,
    copy: `${value.value} ${unit.symbol}`,
  };
}

function buildLadder(bytes: Rational): LadderPair[] {
  const rungs: LadderPair[] = [];
  for (let exponent = 1; exponent <= MAX_EXPONENT; exponent += 1) {
    rungs.push({
      exponent,
      label: `${SI_PREFIX_NAME[exponent]} / ${IEC_PREFIX_NAME[exponent]}`,
      si: ladderRow(bytes, 'si', exponent),
      iec: ladderRow(bytes, 'iec', exponent),
      divergencePercent: fixed(divergenceMore(exponent), 2),
    });
  }
  return rungs;
}

/**
 * The rungs worth putting on screen. A 1.5 GiB input has an exact yottabyte
 * value, but rendering it as `≈ 0 YB` teaches nothing and buries the four rungs
 * that matter — so rungs where BOTH sides round away to under 0.001 are
 * dropped, with a floor of three rungs so a tiny input still gets a ladder.
 * (`Number()` here only decides visibility; every value stays exact.)
 */
export function significantLadder(ladder: LadderPair[], minimum = 3): LadderPair[] {
  const shown = ladder.filter(
    (rung) => Number(rung.si.cell.value) >= 0.001 || Number(rung.iec.cell.value) >= 0.001,
  );
  return shown.length >= minimum ? shown : ladder.slice(0, minimum);
}

/** The byte symbol to suggest when someone wrote a bit symbol (`Kb` → `KB`). */
function byteSuggestionFor(quantity: ParsedQuantity): string {
  const written = quantity.writtenUnit;
  const letter = written.charAt(0);
  const prefix = letter === 'k' ? 'k' : letter.toUpperCase();
  return `${prefix}${quantity.unit.family === 'iec' ? 'i' : ''}B`;
}

/** Notes about the UNIT the user chose — the bits/bytes and k8s traps. */
function unitNotes(quantity: ParsedQuantity): string[] {
  const notes: string[] = [];
  const { unit, unitForm, writtenUnit } = quantity;

  if (unitForm === 'none') {
    notes.push(
      'No unit given — read as plain bytes. Add a unit like KB, KiB, Mb or GB to convert something else.',
    );
  }

  if (unitForm === 'bare-prefix') {
    const bytesPer = groupDigits((unit.bitsPer / 8n).toString());
    if (unit.family === 'iec') {
      notes.push(
        `A bare ${writtenUnit} is Kubernetes quantity notation for ${unit.symbol} — ${bytesPer} bytes per unit, 1024-based.`,
      );
    } else {
      notes.push(
        `A bare ${writtenUnit} means ${bytesPer} bytes — the SI ${
          SI_PREFIX_NAME[unit.exponent]
        } prefix with no B. Kubernetes writes 1000-based quantities with a lowercase k (never K) ` +
          `and 1024-based ones as ${IEC_SYMBOL[unit.exponent]}.`,
      );
    }
  }

  // The bits-vs-bytes trap, but only for a SIZE written with a symbol: "Mbps"
  // is exactly how link speeds are written, so nagging there would be wrong.
  if (unitForm === 'symbol' && unit.measures === 'bits') {
    if (unit.exponent === 0) {
      notes.push(`${writtenUnit} is bits. 8 bits make 1 byte — write B for bytes.`);
    } else {
      const byteEquivalent = makeUnit(unit.family, unit.exponent, 'bytes');
      notes.push(
        `${writtenUnit} is ${unit.name}s (${groupDigits(unit.bitsPer.toString())} bits = ${groupDigits(
          (unit.bitsPer / 8n).toString(),
        )} bytes). Did you mean ${byteSuggestionFor(quantity)} — ${
          byteEquivalent.name
        }s? Lowercase b is bits, uppercase B is bytes.`,
      );
    }
  }
  return notes;
}

/** The 1000-vs-1024 note — the whole reason this tool exists. */
function conventionNote(quantity: ParsedQuantity): string | null {
  const { unit, numberText, amount } = quantity;
  if (unit.measures !== 'bytes' || unit.exponent === 0) return null;
  const siBytes = cell(mulBig(amount, pow(1000n, unit.exponent)), MAX_FRACTION_DIGITS);
  const iecBytes = cell(mulBig(amount, pow(1024n, unit.exponent)), MAX_FRACTION_DIGITS);
  const siSymbol = byteUnit('si', unit.exponent).symbol;
  const iecSymbol = byteUnit('iec', unit.exponent).symbol;
  if (unit.family === 'si') {
    return (
      `${numberText} ${siSymbol} is 1000-based (SI) — ${siBytes.display} bytes. ` +
      `Write ${numberText} ${iecSymbol} for the 1024-based value: ${iecBytes.display} bytes, ` +
      `${fixed(divergenceMore(unit.exponent), 2)}% more.`
    );
  }
  return (
    `${numberText} ${iecSymbol} is 1024-based (IEC) — ${iecBytes.display} bytes. ` +
    `${numberText} ${siSymbol} (1000-based) would be ${siBytes.display} bytes, ` +
    `${fixed(divergenceLess(unit.exponent), 2)}% less.`
  );
}

function buildDetection(quantity: ParsedQuantity, wholeBytes: boolean, raw: string): Detection {
  const { unit, numberText } = quantity;
  const normalized = `${numberText} ${unit.symbol}`;
  const parts: string[] = [];
  if (unit.exponent > 0) {
    parts.push(unit.family === 'iec' ? 'IEC' : 'SI', `${unit.base}-based`);
  }
  if (unit.measures === 'bits') parts.push('bits');
  parts.push(wholeBytes ? 'exact' : 'fractional bytes');
  return {
    raw,
    normalized,
    unit: unit.symbol,
    unitName: unit.name,
    family: unit.family,
    base: unit.base,
    exponent: unit.exponent,
    measures: unit.measures,
    wholeBytes,
    caption: `${normalized} — ${parts.join(', ')}`,
  };
}

/**
 * Convert one size token into exact bit/byte counts and both unit ladders.
 * Never throws; never rounds silently (every rounded cell carries `approx`).
 */
export function convert(input: string): ConvertResult {
  const parsed = parseQuantity(input, 'size');
  if (!parsed.ok) {
    return { valid: false, error: parsed.error, suggestions: parsed.suggestions, notes: [] };
  }
  if (parsed.isRate) {
    return {
      valid: false,
      error: 'A per-second rate is not a size — enter 500 GB, not 500 GB/s.',
      notes: [],
    };
  }

  const bits = parsed.bits;
  const bytes = divBig(bits, 8n);
  const bytesCell = cell(bytes, MAX_FRACTION_DIGITS);
  const bitsCell = cell(bits, MAX_FRACTION_DIGITS);
  const wholeBytes = bytes.n % bytes.d === 0n;
  const detection = buildDetection(parsed, wholeBytes, input.trim());

  const notes = [...parsed.notes, ...unitNotes(parsed)];
  if (!wholeBytes) {
    notes.push(
      `${detection.normalized} is ${bytesCell.display} bytes — not a whole number of bytes. ` +
        'Nothing on disk is a fraction of a byte; the exact value is kept here so the conversion stays reversible.',
    );
  }
  const convention = conventionNote(parsed);
  if (convention) notes.push(convention);

  return {
    valid: true,
    detection,
    bits: bitsCell,
    bytes: bytesCell,
    ladder: buildLadder(bytes),
    notes,
    summary: `${detection.normalized} = ${bytesCell.display} bytes`,
  };
}

/* ────────────────────────────────────────────────────────────────────────── */
/* transferTime()                                                             */
/* ────────────────────────────────────────────────────────────────────────── */

const SECONDS_PER_MINUTE = 60n;
const SECONDS_PER_HOUR = 3600n;
const SECONDS_PER_DAY = 86400n;

/** `1 h 6 min 40 s`, `21.5 s`, `8 ms`, `< 1 ms`. */
export function humanizeSeconds(seconds: Rational): string {
  if (isZero(seconds)) return '0 s';
  if (lt(seconds, rat(1n))) {
    const ms = mulBig(seconds, 1000n);
    if (lt(ms, rat(1n))) return '< 1 ms';
    return `${roundDecimal(ms, 1).text} ms`;
  }
  if (lt(seconds, rat(SECONDS_PER_MINUTE))) return `${roundDecimal(seconds, 1).text} s`;

  let rest = BigInt(roundDecimal(seconds, 0).text);
  const days = rest / SECONDS_PER_DAY;
  rest %= SECONDS_PER_DAY;
  const hours = rest / SECONDS_PER_HOUR;
  rest %= SECONDS_PER_HOUR;
  const minutes = rest / SECONDS_PER_MINUTE;
  rest %= SECONDS_PER_MINUTE;
  const parts: string[] = [];
  if (days > 0n) parts.push(`${groupDigits(days.toString())} d`);
  if (hours > 0n) parts.push(`${hours} h`);
  if (minutes > 0n) parts.push(`${minutes} min`);
  if (rest > 0n) parts.push(`${rest} s`);
  return parts.length > 0 ? parts.join(' ') : '0 s';
}

function duration(seconds: Rational): DurationCell {
  return {
    seconds: cell(seconds, MAX_FRACTION_DIGITS),
    humanized: humanizeSeconds(seconds),
  };
}

/** `1 Gbps` / `125 MB/s` — the same rate in the two conventions people quote. */
function rateForms(bitsPerSecond: Rational): { bitForm: string; byteForm: string } {
  const bytesPerSecond = divBig(bitsPerSecond, 8n);
  const bitExponent = bestExponent(bitsPerSecond, 1000n);
  const byteExponent = bestExponent(bytesPerSecond, 1000n);
  const bitValue = cell(divBig(bitsPerSecond, pow(1000n, bitExponent)), MAX_FRACTION_DIGITS);
  const byteValue = cell(divBig(bytesPerSecond, pow(1000n, byteExponent)), MAX_FRACTION_DIGITS);
  // Carry the rounding flag through. Dropping it printed a rounded rate as though it were
  // exact — in the header caption, the role=status summary and the copy payload alike.
  return {
    bitForm: `${bitValue.approx ? '≈ ' : ''}${bitValue.value} ${makeUnit('si', bitExponent, 'bits').symbol}ps`,
    byteForm: `${byteValue.approx ? '≈ ' : ''}${byteValue.value} ${makeUnit('si', byteExponent, 'bytes').symbol}/s`,
  };
}

function buildRateDetection(quantity: ParsedQuantity, raw: string): RateDetection {
  const bitsPerSecond = quantity.bits;
  const { bitForm, byteForm } = rateForms(bitsPerSecond);
  return {
    raw,
    bitForm,
    byteForm,
    bitsPerSecond: cell(bitsPerSecond, MAX_FRACTION_DIGITS),
    bytesPerSecond: cell(divBig(bitsPerSecond, 8n), MAX_FRACTION_DIGITS),
    caption: `${bitForm} = ${byteForm} (${quantity.unit.base}-based)`,
  };
}

/**
 * How long `size` takes over `rate`. Reports the line-rate best case AND a 90%
 * row, because line rate is not throughput and quoting it starts arguments.
 */
export function transferTime(sizeInput: string, rateInput: string): TransferResult {
  const size = parseQuantity(sizeInput, 'size');
  if (!size.ok) {
    return {
      valid: false,
      error: size.error,
      suggestions: size.suggestions,
      errorField: 'size',
      notes: [],
    };
  }
  if (size.isRate) {
    return {
      valid: false,
      error: 'A per-second rate is not a size — enter 500 GB, not 500 GB/s.',
      errorField: 'size',
      notes: [],
    };
  }

  const rate = parseQuantity(rateInput, 'rate');
  if (!rate.ok) {
    return {
      valid: false,
      error: rate.error,
      suggestions: rate.suggestions,
      errorField: 'rate',
      notes: [],
    };
  }
  if (isZero(rate.bits)) {
    return {
      valid: false,
      error: 'A transfer rate of zero never finishes — enter a rate above zero.',
      errorField: 'rate',
      notes: [],
    };
  }

  const bytes = divBig(size.bits, 8n);
  const seconds = divRat(size.bits, rate.bits);
  const ideal = duration(seconds);
  const realistic = duration(mulRat(seconds, rat(100n, BigInt(EFFICIENCY_PERCENT))));
  const rateDetection = buildRateDetection(rate, rateInput.trim());
  const detection = buildDetection(size, bytes.n % bytes.d === 0n, sizeInput.trim());

  const notes = [...rate.notes];
  if (!rate.isRate) {
    const written = `${rate.numberText}${rate.writtenUnit ? ` ${rate.writtenUnit}` : ''}`;
    notes.push(`Read ${written} as ${written}/s — a link speed is per second.`);
  }
  notes.push(
    'This is the line-rate best case. Protocol overhead (TCP/IP headers, TLS, filesystem) ' +
      'typically costs 5–15%, so the 90% row is the number to quote.',
  );

  return {
    valid: true,
    size: detection,
    sizeBits: cell(size.bits, MAX_FRACTION_DIGITS),
    sizeBytes: cell(bytes, MAX_FRACTION_DIGITS),
    rate: rateDetection,
    ideal,
    realistic: { percent: EFFICIENCY_PERCENT, duration: realistic },
    notes,
    summary: `${detection.normalized} at ${rateDetection.bitForm} takes ${ideal.humanized}`,
  };
}

/* ────────────────────────────────────────────────────────────────────────── */
/* `#q=` deep-link state                                                      */
/* ────────────────────────────────────────────────────────────────────────── */

/**
 * Serialize both bands into a `#q=` fragment, mirroring k8s-resources'
 * base64url-JSON state shape (under the `q` key this tool owns).
 */
export function encodeState(state: DataSizeState): string {
  const payload: DataSizeState = {};
  if (typeof state.size === 'string') payload.size = state.size;
  if (typeof state.rate === 'string') payload.rate = state.rate;
  return `#q=${base64UrlEncode(JSON.stringify(payload))}`;
}

/** Keep only string fields of a sane length; a state with nothing in it is null. */
function sanitizeState(raw: unknown): DataSizeState | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const source = raw as Record<string, unknown>;
  const out: DataSizeState = {};
  let hasContent = false;
  for (const field of ['size', 'rate'] as const) {
    const value = source[field];
    if (typeof value !== 'string' || value.length > MAX_STATE_FIELD_LEN) continue;
    out[field] = value;
    if (value.trim().length > 0) hasContent = true;
  }
  return hasContent ? out : null;
}

/**
 * Decode a `#q=` fragment. Pure, so it is unit-tested directly (unlike
 * `decodeState()`, which reads `window.location`).
 *
 * A fragment that is not valid base64url JSON DEGRADES into a plain size
 * string instead of being dropped: `#q=1%20gigglebyte` is a hand-edited or
 * chat-truncated link, and answering it with the engine's own diagnostic is
 * far better than silently ignoring the link and seeding the default example.
 */
export function parseState(fragment: string): DataSizeState | null {
  if (typeof fragment !== 'string' || fragment.length === 0) return null;
  const match = /[#&]q=([^&]*)/.exec(fragment);
  const encoded = match?.[1] ?? '';
  if (encoded.length === 0) return null;

  try {
    const parsed: unknown = JSON.parse(base64UrlDecode(encoded));
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      return sanitizeState(parsed);
    }
  } catch {
    /* not a state payload — fall through to the plain-text degradation */
  }

  try {
    const plain = decodeURIComponent(encoded).trim();
    if (plain.length === 0 || plain.length > MAX_STATE_FIELD_LEN) return null;
    return { size: plain };
  } catch {
    return null;
  }
}

/** Read the live `#q=` fragment. SSR-safe, never throws. */
export function decodeState(): DataSizeState | null {
  if (typeof window === 'undefined') return null;
  try {
    return parseState(new URL(window.location.href).hash);
  } catch {
    return null;
  }
}

/** Re-exported so the playground can group a number it composes itself. */
export { groupDigits };

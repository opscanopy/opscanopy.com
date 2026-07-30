/**
 * Data Size & Transfer-Rate Converter — shared types.
 *
 * `convert()` reads one size token (`1.5 GiB`, `500 GB`, `128 Mb`, `1,234 kB`),
 * detects which convention it belongs to, and returns the exact bit/byte counts
 * plus a paired SI|IEC ladder. `transferTime()` divides a size by a link speed.
 * Both are pure and never throw: every rejection comes back as a specific
 * `error` sentence, and every judgement call the parser had to make comes back
 * as a `notes` entry (a note is never an error — the result is still valid).
 *
 * All arithmetic is exact: sizes are carried as a rational number of BITS over
 * a BigInt numerator/denominator (see `units.ts`), so `5 YiB` prints all 25
 * digits and `1 Gbps` is exactly `125 MB/s`. `number` is only ever used for
 * display columns that are explicitly flagged `approx`.
 */

export type UnitFamily = 'si' | 'iec';
export type Measures = 'bits' | 'bytes';

/** One rendered number: the copy payload, its grouped display twin, and rounding. */
export interface ValueCell {
  /** Ungrouped decimal string — the clipboard payload ("1610612736"). */
  value: string;
  /** The same number grouped for reading ("1 610 612 736"). */
  display: string;
  /** True when `value` is rounded (the UI prefixes it with "≈"). */
  approx: boolean;
}

/** One cell of the conversion ladder: this size expressed in one byte unit. */
export interface SizeRow {
  /** Canonical unit symbol, e.g. `kB`, `GiB`. */
  unit: string;
  /** Spelled-out unit name, e.g. `gibibyte`. */
  unitName: string;
  family: UnitFamily;
  base: 1000 | 1024;
  /** Prefix power: 1 = kilo/kibi … 8 = yotta/yobi. */
  exponent: number;
  cell: ValueCell;
  /** Clipboard payload for the row, e.g. `1.5 GiB`. */
  copy: string;
}

/** One rung of the ladder — the SI unit and its IEC counterpart, side by side. */
export interface LadderPair {
  exponent: number;
  /** Human label for the rung, e.g. `kilo / kibi`. */
  label: string;
  si: SizeRow;
  iec: SizeRow;
  /** How much bigger the IEC unit is, e.g. `2.4` (percent, 2 dp, no sign). */
  divergencePercent: string;
}

/** What the parser decided the input was. */
export interface Detection {
  /** The trimmed input, exactly as typed. */
  raw: string;
  /** Canonical rewrite: number in plain decimal + canonical unit symbol. */
  normalized: string;
  /** Canonical unit symbol, e.g. `GiB`. */
  unit: string;
  unitName: string;
  family: UnitFamily;
  base: 1000 | 1024;
  exponent: number;
  measures: Measures;
  /** True when the size is a whole number of bytes. */
  wholeBytes: boolean;
  /** The one-line caption under the input, e.g. `1.5 GiB — IEC, 1024-based, exact`. */
  caption: string;
}

export interface ConvertResult {
  valid: boolean;
  /** Specific diagnostic — never a generic "invalid". Absent when `valid`. */
  error?: string;
  /** Candidate units, when the failure was an unrecognised unit token. */
  suggestions?: string[];
  detection?: Detection;
  /** Exact bit count. */
  bits?: ValueCell;
  /** Exact byte count (fractional when the input was, e.g. `0.3 KiB`). */
  bytes?: ValueCell;
  /** Eight rungs, kilo/kibi → yotta/yobi. */
  ladder?: LadderPair[];
  /** Judgement calls and teaching notes. Always an array, never undefined. */
  notes: string[];
  /** One-line live-region summary, e.g. `1.5 GiB = 1 610 612 736 bytes`. */
  summary?: string;
}

/** A parsed link speed, in both conventions. */
export interface RateDetection {
  raw: string;
  /** Canonical bit-rate form, e.g. `1 Gbps`. */
  bitForm: string;
  /** Canonical byte-rate form, e.g. `125 MB/s`. */
  byteForm: string;
  bitsPerSecond: ValueCell;
  bytesPerSecond: ValueCell;
  /** e.g. `1 Gbps = 125 MB/s (1000-based)`. */
  caption: string;
}

export interface DurationCell {
  /** Exact seconds. */
  seconds: ValueCell;
  /** Humanised, e.g. `1 h 6 min 40 s`. */
  humanized: string;
}

export interface TransferResult {
  valid: boolean;
  error?: string;
  suggestions?: string[];
  /** Which field the error belongs to, so the UI flags the right input. */
  errorField?: 'size' | 'rate';
  size?: Detection;
  sizeBits?: ValueCell;
  sizeBytes?: ValueCell;
  rate?: RateDetection;
  /** Line-rate best case. */
  ideal?: DurationCell;
  /** The always-present realistic row (90% of line rate). */
  realistic?: { percent: number; duration: DurationCell };
  notes: string[];
  /** e.g. `500 GB at 1 Gbps takes 1 h 6 min 40 s`. */
  summary?: string;
}

/** The shareable state of both bands. Serialized into `#q=`. */
export interface DataSizeState {
  size?: string;
  rate?: string;
}

export interface DataSizeExample {
  id: string;
  label: string;
  size: string;
  /** Empty string when the example only fills the Convert band. */
  rate: string;
}

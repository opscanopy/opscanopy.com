/**
 * Cron Expression Tester — the client-side parsing & scheduling engine.
 *
 * Pure TypeScript, deterministic, browser-safe. The two public entry points —
 * `explain()` and `nextRuns()` — NEVER throw on user input; malformed input is
 * reported via `{ valid: false, error }` (explain) or an empty array
 * (nextRuns). All times are computed in the host's LOCAL timezone, which is the
 * intuitive reading for an interactive "when does this next fire?" tool.
 *
 * Supported syntax:
 *   - Standard 5-field cron:  minute hour day-of-month month day-of-week
 *   - 6-field form with a leading SECONDS field (tolerated; the seconds field
 *     is parsed and validated but does not change next-run granularity, which
 *     stays at whole minutes — it is mentioned in the description instead)
 *   - Named macros: @yearly @annually @monthly @weekly @daily @midnight
 *     @hourly @reboot
 *   - Wildcards (*), ranges (1-5), steps (* /15 and 1-30/5), lists (1,3,5),
 *     and combinations thereof (e.g. "1,5-10,*\/2")
 *   - 3-letter month names (JAN-DEC) and day names (SUN-SAT), case-insensitive
 *
 * Cron semantics honored:
 *   - Day-of-week accepts both 0 and 7 for Sunday.
 *   - When BOTH day-of-month and day-of-week are restricted (neither is "*"),
 *     a date matches if EITHER field matches (the Vixie-cron OR rule).
 */

import type { CronResult, CronFields } from './types';

/* ------------------------------------------------------------------------- *
 * Field model
 * ------------------------------------------------------------------------- */

/** One cron field, fully resolved to the concrete integers it allows. */
interface FieldSpec {
  /** The integer values this field matches (sorted, de-duplicated). */
  values: number[];
  /** Fast membership lookup over `values`. */
  set: Set<number>;
  /** True when the field was a bare wildcard ("*") with no step. */
  isWildcard: boolean;
}

/** Per-field bounds and the named-token alias maps used during parsing. */
interface FieldDef {
  /** Human field name, for error messages. */
  name: string;
  /** Inclusive lower bound of legal values. */
  min: number;
  /** Inclusive upper bound of legal values. */
  max: number;
  /** Optional 3-letter name → number map (months, days of week). */
  names?: Record<string, number>;
  /**
   * Optional value normalizer applied AFTER parsing, before storing.
   * Used for day-of-week to fold 7 → 0 (both are Sunday).
   */
  normalize?: (n: number) => number;
}

const MONTH_NAMES: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

const DOW_NAMES: Record<string, number> = {
  sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6,
};

/**
 * The five standard cron fields, in canonical order. Day-of-week uses 0-7 so
 * the parser accepts 7 as Sunday; `normalize` folds it to 0 for matching.
 */
const FIELD_DEFS: FieldDef[] = [
  { name: 'minute', min: 0, max: 59 },
  { name: 'hour', min: 0, max: 23 },
  { name: 'day of month', min: 1, max: 31 },
  { name: 'month', min: 1, max: 12, names: MONTH_NAMES },
  {
    name: 'day of week',
    min: 0,
    max: 7,
    names: DOW_NAMES,
    normalize: (n) => (n === 7 ? 0 : n),
  },
];

/** The optional leading seconds field (6-field form). */
const SECONDS_DEF: FieldDef = { name: 'second', min: 0, max: 59 };

/** Macro → equivalent 5-field expression. `@reboot` is handled specially. */
const MACROS: Record<string, string> = {
  '@yearly': '0 0 1 1 *',
  '@annually': '0 0 1 1 *',
  '@monthly': '0 0 1 * *',
  '@weekly': '0 0 * * 0',
  '@daily': '0 0 * * *',
  '@midnight': '0 0 * * *',
  '@hourly': '0 * * * *',
};

/* ------------------------------------------------------------------------- *
 * Display helpers
 * ------------------------------------------------------------------------- */

const MONTH_LABELS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const DOW_LABELS = [
  'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday',
];

/** A fully-parsed expression: the five resolved fields plus optional seconds. */
interface ParsedCron {
  minute: FieldSpec;
  hour: FieldSpec;
  dayOfMonth: FieldSpec;
  month: FieldSpec;
  dayOfWeek: FieldSpec;
  /** The resolved seconds field when a 6-field form was given, else null. */
  seconds: FieldSpec | null;
}

/* ------------------------------------------------------------------------- *
 * Parsing (never throws — returns either a ParsedCron or an error string)
 * ------------------------------------------------------------------------- */

/** Outcome of a parse attempt. Exactly one of `parsed` / `error` is set. */
interface ParseOutcome {
  parsed?: ParsedCron;
  /** True when the input is the `@reboot` macro (no schedulable times). */
  isReboot?: boolean;
  error?: string;
}

/**
 * Resolve a single cron field token into the integers it allows.
 * Returns a FieldSpec on success, or a human-readable error string.
 */
function parseField(raw: string, def: FieldDef): FieldSpec | string {
  const token = raw.trim();
  if (token === '') return `The ${def.name} field is empty.`;

  const isWildcard = token === '*';
  const values = new Set<number>();

  // A field is a comma-separated list of "items"; each item may carry a step.
  for (const part of token.split(',')) {
    const item = part.trim();
    if (item === '') return `The ${def.name} field has an empty list entry.`;

    // Split off an optional "/step" suffix.
    let rangePart = item;
    let step = 1;
    const slash = item.indexOf('/');
    if (slash !== -1) {
      rangePart = item.slice(0, slash).trim();
      const stepStr = item.slice(slash + 1).trim();
      const stepNum = Number(stepStr);
      if (!/^\d+$/.test(stepStr) || !Number.isInteger(stepNum) || stepNum < 1) {
        return `“${item}” has an invalid step in the ${def.name} field (step must be a positive whole number).`;
      }
      step = stepNum;
    }

    // Resolve the base range the step walks over.
    let lo: number;
    let hi: number;

    if (rangePart === '*') {
      lo = def.min;
      hi = def.max;
    } else {
      const dash = rangePart.indexOf('-');
      if (dash !== -1) {
        // Explicit range "a-b".
        const aStr = rangePart.slice(0, dash).trim();
        const bStr = rangePart.slice(dash + 1).trim();
        const a = resolveToken(aStr, def);
        const b = resolveToken(bStr, def);
        if (a === null) return invalidToken(aStr, def);
        if (b === null) return invalidToken(bStr, def);
        if (a > b) {
          return `Range “${rangePart}” is backwards in the ${def.name} field (start is greater than end).`;
        }
        lo = a;
        hi = b;
      } else {
        // A single value. With a step, a bare value means "from value to max".
        const v = resolveToken(rangePart, def);
        if (v === null) return invalidToken(rangePart, def);
        lo = v;
        hi = slash !== -1 ? def.max : v;
      }
    }

    if (lo < def.min || hi > def.max) {
      return `Value out of range in the ${def.name} field: allowed ${def.min}–${def.max}.`;
    }

    for (let n = lo; n <= hi; n += step) {
      values.add(def.normalize ? def.normalize(n) : n);
    }
  }

  if (values.size === 0) {
    return `The ${def.name} field did not resolve to any values.`;
  }

  const sorted = Array.from(values).sort((x, y) => x - y);
  return { values: sorted, set: new Set(sorted), isWildcard };
}

/** Resolve a numeric or 3-letter named token to an integer, or null if bad. */
function resolveToken(token: string, def: FieldDef): number | null {
  if (token === '') return null;
  if (/^\d+$/.test(token)) {
    const n = Number(token);
    return Number.isInteger(n) ? n : null;
  }
  if (def.names) {
    const key = token.toLowerCase();
    if (key in def.names) return def.names[key];
  }
  return null;
}

/** Build a consistent "unrecognized token" error message for a field. */
function invalidToken(token: string, def: FieldDef): string {
  const named = def.names ? ' or a 3-letter name' : '';
  return `“${token}” is not a valid ${def.name} value (expected a number${named}).`;
}

/**
 * Parse a whole cron expression (macro, 5-field, or 6-field) into resolved
 * fields. Never throws — returns a ParseOutcome describing success or failure.
 */
function parse(expr: string): ParseOutcome {
  if (typeof expr !== 'string') {
    return { error: 'Enter a cron expression to test.' };
  }

  let text = expr.trim();
  if (text === '') {
    return { error: 'Enter a cron expression to test.' };
  }

  // Macros first.
  if (text.startsWith('@')) {
    const macro = text.toLowerCase();
    if (macro === '@reboot') {
      return { isReboot: true };
    }
    const expanded = MACROS[macro];
    if (!expanded) {
      const known = ['@yearly', '@monthly', '@weekly', '@daily', '@hourly', '@reboot'];
      return {
        error: `Unknown macro “${text}”. Supported macros: ${known.join(', ')}.`,
      };
    }
    text = expanded;
  }

  // Split on any run of whitespace.
  const tokens = text.split(/\s+/).filter((t) => t.length > 0);

  let hasSeconds = false;
  let secondsToken = '';
  let fieldTokens: string[];

  if (tokens.length === 5) {
    fieldTokens = tokens;
  } else if (tokens.length === 6) {
    // Tolerate the leading-seconds form: <sec> <min> <hour> <dom> <mon> <dow>.
    hasSeconds = true;
    secondsToken = tokens[0];
    fieldTokens = tokens.slice(1);
  } else {
    return {
      error: `Expected 5 fields (minute hour day-of-month month day-of-week), or 6 with a leading seconds field — found ${tokens.length}.`,
    };
  }

  // Resolve the five standard fields.
  const specs: FieldSpec[] = [];
  for (let i = 0; i < FIELD_DEFS.length; i++) {
    const result = parseField(fieldTokens[i], FIELD_DEFS[i]);
    if (typeof result === 'string') return { error: result };
    specs.push(result);
  }

  // Resolve the optional seconds field.
  let seconds: FieldSpec | null = null;
  if (hasSeconds) {
    const secResult = parseField(secondsToken, SECONDS_DEF);
    if (typeof secResult === 'string') return { error: secResult };
    seconds = secResult;
  }

  return {
    parsed: {
      minute: specs[0],
      hour: specs[1],
      dayOfMonth: specs[2],
      month: specs[3],
      dayOfWeek: specs[4],
      seconds,
    },
  };
}

/* ------------------------------------------------------------------------- *
 * Description (plain English)
 * ------------------------------------------------------------------------- */

/** Zero-pad a number to two digits (for HH:MM rendering). */
function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** Join a list of words with commas and a trailing "and". */
function joinList(items: string[]): string {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
}

/**
 * Detect whether a spec's values form a single arithmetic progression that
 * starts at `min` and steps by `step` across the whole field (i.e. it came
 * from a "* /step"-style expression). Returns the step or null.
 */
function detectFullStep(spec: FieldSpec, min: number, max: number): number | null {
  const v = spec.values;
  if (v.length < 2 || v[0] !== min) return null;
  const step = v[1] - v[0];
  if (step < 1) return null;
  let expected = min;
  for (const n of v) {
    if (n !== expected) return null;
    expected += step;
  }
  // After the loop, `expected` is (last value + step). For a FULL stepped
  // pattern there must be no further value within [min, max] that the step
  // skipped — i.e. the next step lands past `max`. If it would still fit, the
  // values were a partial range, not a "* /step" across the whole field.
  if (expected <= max) return null;
  return step;
}

/** Describe the minute+hour portion of the schedule as an English clause. */
function describeTime(p: ParsedCron): string {
  const { minute, hour } = p;

  // Both fixed to a single value → an exact clock time.
  if (minute.values.length === 1 && hour.values.length === 1) {
    return `at ${pad2(hour.values[0])}:${pad2(minute.values[0])}`;
  }

  // "Every minute" cases.
  if (minute.isWildcard && hour.isWildcard) {
    return 'every minute';
  }

  // Stepped minutes across the whole field → "every N minutes".
  const minStep = detectFullStep(minute, 0, 59);
  if (minStep && hour.isWildcard) {
    return minStep === 1 ? 'every minute' : `every ${minStep} minutes`;
  }

  // Stepped hours, minute fixed → "every N hours at :MM".
  const hourStep = detectFullStep(hour, 0, 23);
  if (hourStep && minute.values.length === 1) {
    const at = `:${pad2(minute.values[0])}`;
    return hourStep === 1
      ? `every hour at ${at}`
      : `every ${hourStep} hours at ${at}`;
  }

  // Minute fixed, hour wildcard → "at :MM past every hour".
  if (minute.values.length === 1 && hour.isWildcard) {
    return `at ${pad2(minute.values[0])} minutes past every hour`;
  }

  // Fall back to listing the discrete times when both are small enumerations.
  if (minute.values.length === 1 && hour.values.length <= 6) {
    const times = hour.values.map((h) => `${pad2(h)}:${pad2(minute.values[0])}`);
    return `at ${joinList(times)}`;
  }

  // Generic fallback.
  const minPart = minute.isWildcard
    ? 'every minute'
    : `minute ${joinList(minute.values.map(String))}`;
  const hourPart = hour.isWildcard
    ? 'of every hour'
    : `of hour ${joinList(hour.values.map(String))}`;
  return `${minPart} ${hourPart}`;
}

/** Describe a numeric field as a compact range/list clause, e.g. "1 through 5". */
function describeNumericRange(spec: FieldSpec, labelFor: (n: number) => string): string {
  const v = spec.values;
  // Contiguous run → "X through Y".
  if (v.length >= 3 && v[v.length - 1] - v[0] === v.length - 1) {
    return `${labelFor(v[0])} through ${labelFor(v[v.length - 1])}`;
  }
  return joinList(v.map(labelFor));
}

/** Build the day-of-week clause, honoring the OR semantics where relevant. */
function describeDayOfWeek(spec: FieldSpec): string {
  return describeNumericRange(spec, (n) => DOW_LABELS[n] ?? String(n));
}

/** Build the day-of-month clause. */
function describeDayOfMonth(spec: FieldSpec): string {
  return describeNumericRange(spec, (n) => ordinal(n));
}

/** English ordinal for a day-of-month number (1 → "the 1st"). */
function ordinal(n: number): string {
  const mod100 = n % 100;
  const mod10 = n % 10;
  let suffix = 'th';
  if (mod100 < 11 || mod100 > 13) {
    if (mod10 === 1) suffix = 'st';
    else if (mod10 === 2) suffix = 'nd';
    else if (mod10 === 3) suffix = 'rd';
  }
  return `the ${n}${suffix}`;
}

/** Build the month clause. */
function describeMonth(spec: FieldSpec): string {
  return describeNumericRange(spec, (n) => MONTH_LABELS[n - 1] ?? String(n));
}

/**
 * Compose the full plain-English description from a parsed expression.
 * Sentence-cased and period-terminated, matching the design voice.
 */
function describe(p: ParsedCron): string {
  const parts: string[] = [];

  // Lead with the time-of-day clause.
  parts.push(describeTime(p));

  // Day-of-month / day-of-week. Per cron's OR rule, when both are restricted
  // we say "on" both joined by "or"; otherwise we describe whichever is set.
  const domRestricted = !p.dayOfMonth.isWildcard;
  const dowRestricted = !p.dayOfWeek.isWildcard;

  if (domRestricted && dowRestricted) {
    parts.push(
      `on ${describeDayOfMonth(p.dayOfMonth)} of the month, or on ${describeDayOfWeek(p.dayOfWeek)}`,
    );
  } else if (dowRestricted) {
    parts.push(`on ${describeDayOfWeek(p.dayOfWeek)}`);
  } else if (domRestricted) {
    parts.push(`on ${describeDayOfMonth(p.dayOfMonth)} of the month`);
  }

  // Month restriction.
  if (!p.month.isWildcard) {
    parts.push(`in ${describeMonth(p.month)}`);
  }

  let sentence = parts.join(', ');

  // Mention the seconds field honestly when present (6-field form).
  if (p.seconds) {
    if (p.seconds.values.length === 1) {
      sentence += ` (at ${p.seconds.values[0]} seconds)`;
    } else {
      const secStep = detectFullStep(p.seconds, 0, 59);
      if (secStep && secStep > 1) {
        sentence += ` (every ${secStep} seconds within the minute)`;
      } else {
        sentence += ' (with a seconds field)';
      }
    }
  }

  // Capitalize the first letter and terminate with a period.
  const trimmed = sentence.trim();
  const capitalized = trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
  return capitalized.endsWith('.') ? capitalized : `${capitalized}.`;
}

/* ------------------------------------------------------------------------- *
 * Next-run computation (local time, deterministic given `from`)
 * ------------------------------------------------------------------------- */

/**
 * Does a given local Date satisfy the parsed schedule (at minute resolution)?
 * Honors the Vixie-cron OR rule between day-of-month and day-of-week.
 */
function matches(p: ParsedCron, d: Date): boolean {
  if (!p.minute.set.has(d.getMinutes())) return false;
  if (!p.hour.set.has(d.getHours())) return false;
  if (!p.month.set.has(d.getMonth() + 1)) return false;

  const domRestricted = !p.dayOfMonth.isWildcard;
  const dowRestricted = !p.dayOfWeek.isWildcard;
  const domHit = p.dayOfMonth.set.has(d.getDate());
  const dowHit = p.dayOfWeek.set.has(d.getDay());

  if (domRestricted && dowRestricted) {
    // OR semantics: either field matching is enough.
    return domHit || dowHit;
  }
  if (domRestricted) return domHit;
  if (dowRestricted) return dowHit;
  return true; // both wildcards
}

/**
 * Compute the next `count` fire times at or after `from` (exclusive of the
 * starting minute). Returns Date objects in local time. Capped at a generous
 * search horizon so a never-firing expression terminates cleanly rather than
 * looping forever.
 */
function computeNextDates(p: ParsedCron, count: number, from: Date): Date[] {
  const out: Date[] = [];

  // Start at the next whole minute strictly after `from`.
  const cursor = new Date(from.getTime());
  cursor.setSeconds(0, 0);
  cursor.setMinutes(cursor.getMinutes() + 1);

  // Search up to ~5 years of minutes — comfortably covers Feb-29-only rules.
  const MAX_ITERATIONS = 5 * 366 * 24 * 60;
  let iterations = 0;

  while (out.length < count && iterations < MAX_ITERATIONS) {
    iterations++;
    if (matches(p, cursor)) {
      out.push(new Date(cursor.getTime()));
    }
    cursor.setMinutes(cursor.getMinutes() + 1);
  }

  return out;
}

/* ------------------------------------------------------------------------- *
 * Formatting fire times as readable strings
 * ------------------------------------------------------------------------- */

const ABS_FORMAT_OPTS: Intl.DateTimeFormatOptions = {
  weekday: 'short',
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
};

/** Format an absolute local timestamp like "Mon, Jun 8 2026, 09:00". */
function formatAbsolute(d: Date): string {
  try {
    return new Intl.DateTimeFormat(undefined, ABS_FORMAT_OPTS).format(d);
  } catch {
    // Defensive fallback if Intl is unavailable for any reason.
    return d.toString();
  }
}

/**
 * A short relative hint like "in 5 minutes", "in about 3 hours", "tomorrow",
 * or "in 12 days", measured from `from`.
 */
function formatRelative(d: Date, from: Date): string {
  const deltaMs = d.getTime() - from.getTime();
  const mins = Math.round(deltaMs / 60000);

  if (mins <= 0) return 'now';
  if (mins < 60) return mins === 1 ? 'in 1 minute' : `in ${mins} minutes`;

  const hours = Math.round(mins / 60);
  if (mins < 60 * 24) {
    if (hours === 1) return 'in about 1 hour';
    return `in about ${hours} hours`;
  }

  const days = Math.round(mins / (60 * 24));
  if (days === 1) return 'tomorrow';
  if (days < 30) return `in ${days} days`;

  const months = Math.round(days / 30);
  if (months === 1) return 'in about 1 month';
  if (months < 12) return `in about ${months} months`;

  const years = Math.round(days / 365);
  return years === 1 ? 'in about 1 year' : `in about ${years} years`;
}

/** Render one fire time as "absolute · relative". */
function formatRun(d: Date, from: Date): string {
  return `${formatAbsolute(d)} · ${formatRelative(d, from)}`;
}

/* ------------------------------------------------------------------------- *
 * Reference-time resolution
 * ------------------------------------------------------------------------- */

/**
 * Resolve the reference instant for "next run" math. Falls back to the current
 * system time when `fromIso` is missing or unparseable — never throws.
 */
function resolveFrom(fromIso?: string): Date {
  if (typeof fromIso === 'string' && fromIso.trim() !== '') {
    const t = Date.parse(fromIso);
    if (!Number.isNaN(t)) return new Date(t);
  }
  return new Date();
}

/** Clamp a requested run count to a sane range (1–25, default 5). */
function clampCount(count?: number): number {
  if (typeof count !== 'number' || !Number.isFinite(count)) return 5;
  const n = Math.floor(count);
  if (n < 1) return 1;
  if (n > 25) return 25;
  return n;
}

/* ------------------------------------------------------------------------- *
 * Public API
 * ------------------------------------------------------------------------- */

/**
 * Explain a cron expression: validity, a plain-English description, the raw
 * per-field sub-expressions, and the next few fire times. Never throws — bad
 * input returns `{ valid: false, error, … }` with safe placeholder fields.
 */
export function explain(expr: string): CronResult {
  const raw = typeof expr === 'string' ? expr : '';
  const outcome = parse(raw);

  // Echo the raw fields for display. For macros / errors we surface the
  // original tokens where sensible, falling back to placeholders.
  const fields = rawFieldsOf(raw, outcome);

  if (outcome.error) {
    return {
      valid: false,
      error: outcome.error,
      description: '',
      fields,
      nextRuns: [],
    };
  }

  if (outcome.isReboot) {
    return {
      valid: true,
      description:
        'At system startup (@reboot). This runs once when the scheduler boots, so it has no recurring fire times.',
      fields,
      nextRuns: [],
    };
  }

  const parsed = outcome.parsed!;
  const from = new Date();
  const dates = computeNextDates(parsed, 5, from);
  const nextRuns = dates.map((d) => formatRun(d, from));

  return {
    valid: true,
    description: describe(parsed),
    fields,
    nextRuns:
      nextRuns.length > 0
        ? nextRuns
        : ['This expression has no upcoming fire times within the next 5 years.'],
  };
}

/**
 * Compute the next `count` fire times for an expression, optionally relative to
 * a reference ISO timestamp instead of "now". Returns readable strings; an
 * empty array on invalid input or for `@reboot`. Never throws.
 */
export function nextRuns(expr: string, count = 5, fromIso?: string): string[] {
  const outcome = parse(typeof expr === 'string' ? expr : '');
  if (outcome.error || outcome.isReboot || !outcome.parsed) return [];

  const from = resolveFrom(fromIso);
  const n = clampCount(count);
  const dates = computeNextDates(outcome.parsed, n, from);
  return dates.map((d) => formatRun(d, from));
}

/* ------------------------------------------------------------------------- *
 * Raw-field echo (best-effort, for display)
 * ------------------------------------------------------------------------- */

const PLACEHOLDER_FIELDS: CronFields = {
  minute: '*',
  hour: '*',
  dayOfMonth: '*',
  month: '*',
  dayOfWeek: '*',
};

/**
 * Produce the `fields` echo for the result. Splits the (possibly
 * macro-expanded) expression into its five canonical sub-expressions for
 * display. Always returns a complete CronFields object.
 */
function rawFieldsOf(raw: string, outcome: ParseOutcome): CronFields {
  const text = raw.trim();

  // For @reboot there are no fields to show.
  if (outcome.isReboot) {
    return { ...PLACEHOLDER_FIELDS };
  }

  // Expand a known macro so the echoed fields reflect what actually runs.
  let source = text;
  if (text.startsWith('@')) {
    const expanded = MACROS[text.toLowerCase()];
    if (expanded) source = expanded;
  }

  const tokens = source.split(/\s+/).filter((t) => t.length > 0);

  // 6-field form: drop the leading seconds token for the standard 5 echoes.
  const five = tokens.length === 6 ? tokens.slice(1) : tokens;

  if (five.length !== 5) {
    return { ...PLACEHOLDER_FIELDS };
  }

  return {
    minute: five[0],
    hour: five[1],
    dayOfMonth: five[2],
    month: five[3],
    dayOfWeek: five[4],
  };
}

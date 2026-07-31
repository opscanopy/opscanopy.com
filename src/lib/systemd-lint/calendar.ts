/**
 * systemd calendar expressions — the shared grammar module.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │  WHY THIS FILE IS SHARED                                                 │
 * │                                                                          │
 * │  Two tools on this site reason about `OnCalendar=`: the Cron to systemd   │
 * │  Converter WRITES one, and the Systemd Unit Validator CHECKS one. If they │
 * │  disagree about the same expression, one of them is confidently wrong and │
 * │  the visitor has no way to tell which — the exact failure this site is    │
 * │  meant to protect against. So the weekday table lives here once, and      │
 * │  `cron-systemd/engine.ts` imports it (constants only; no logic moved).    │
 * │  `cron-systemd/engine.test.ts` then feeds every conversion back through   │
 * │  `validateOnCalendar` as a round-trip gate.                              │
 * │                                                                          │
 * │  THE CONTRACT                                                            │
 * │                                                                          │
 * │    validateOnCalendar(expr) NEVER THROWS. Garbage, empty, enormous or     │
 * │    non-string input all return `{ valid: false, error }` with ONE          │
 * │    specific sentence — never a generic "invalid".                         │
 * │                                                                          │
 * │  Grammar per systemd.time(7) "CALENDAR EVENTS":                          │
 * │                                                                          │
 * │      [DOW] [[[YYYY-]MM-DD] HH:MM[:SS]] [TIMEZONE]                        │
 * │                                                                          │
 * │  where each numeric component may be `*`, a value, a `a..b` range, a      │
 * │  `a/step` repeat, a `a..b/step` repeat, or a comma-separated list of      │
 * │  those; the day may carry a `~` prefix (counted from the end of the       │
 * │  month); and a handful of one-word shorthands stand in for the whole      │
 * │  expression.                                                             │
 * │                                                                          │
 * │  What it deliberately does NOT do: resolve a timezone name (that needs    │
 * │  the host's tzdata) or compute the next elapse (that needs a clock, and   │
 * │  a wrong "next run" printed as fact is worse than no answer).             │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

/**
 * systemd `OnCalendar=` weekday tokens, indexed by CRON day number (0 = Sunday).
 *
 * The cron indexing is what makes this shareable: `cron-systemd` indexes
 * straight into it with a cron field value. systemd itself ORDERS weekdays
 * Mon..Sun and rejects a range whose start falls after its end, which is why the
 * converter re-sorts a Sunday-first cron range instead of passing it through.
 */
export const SYSTEMD_DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

/**
 * The one-word shorthands, with the expansion systemd.time(7) documents for
 * each. Kept as data (not prose) so the validator can show the expansion instead
 * of asserting one in five locale pages.
 */
export const CALENDAR_SHORTHANDS: Record<string, string> = {
  minutely: '*-*-* *:*:00',
  hourly: '*-*-* *:00:00',
  daily: '*-*-* 00:00:00',
  monthly: '*-*-01 00:00:00',
  weekly: 'Mon *-*-* 00:00:00',
  yearly: '*-01-01 00:00:00',
  annually: '*-01-01 00:00:00',
  quarterly: '*-01,04,07,10-01 00:00:00',
  semiannually: '*-01,07-01 00:00:00',
};

/** Weekday name → systemd's own index, Mon = 1 … Sun = 7. */
const WEEKDAY_INDEX: Record<string, number> = {
  monday: 1,
  mon: 1,
  tuesday: 2,
  tue: 2,
  wednesday: 3,
  wed: 3,
  thursday: 4,
  thu: 4,
  friday: 5,
  fri: 5,
  saturday: 6,
  sat: 6,
  sunday: 7,
  sun: 7,
};

/** Index → full name, for diagnostics that read like sentences. */
const WEEKDAY_FULL: Record<number, string> = {
  1: 'Monday',
  2: 'Tuesday',
  3: 'Wednesday',
  4: 'Thursday',
  5: 'Friday',
  6: 'Saturday',
  7: 'Sunday',
};

/** One numeric component's domain, and the name diagnostics use for it. */
interface FieldSpec {
  name: string;
  min: number;
  max: number;
  /** Seconds may carry a fractional part (`00.5`). */
  fractional?: boolean;
}

const YEAR: FieldSpec = { name: 'Year', min: 1970, max: 2199 };
const MONTH: FieldSpec = { name: 'Month', min: 1, max: 12 };
const DAY: FieldSpec = { name: 'Day', min: 1, max: 31 };
const HOUR: FieldSpec = { name: 'Hour', min: 0, max: 23 };
const MINUTE: FieldSpec = { name: 'Minute', min: 0, max: 59 };
// 60 is deliberate: systemd's own range check for the seconds component is
// 0..60, leaving room for a leap second.
const SECOND: FieldSpec = { name: 'Second', min: 0, max: 60, fractional: true };

/** The result of checking one `OnCalendar=` value. */
export interface CalendarValidation {
  valid: boolean;
  /** One specific sentence. Present if and only if `valid` is false. */
  error?: string;
  /** Non-fatal observations — a shorthand's expansion, a timezone caveat. */
  notes: string[];
  /** For a shorthand, the expansion systemd.time(7) documents. */
  expansion?: string;
  /** The trailing timezone token, exactly as written. */
  timezone?: string;
}

function fail(error: string, notes: string[] = []): CalendarValidation {
  return { valid: false, error, notes };
}

/**
 * A trailing timezone: `UTC`, or something shaped like an IANA name
 * (`Asia/Kolkata`, `America/Argentina/Buenos_Aires`). A bare word with no slash
 * is NOT accepted — otherwise "tomorrow" would sail through as a timezone.
 */
const TZ_RE = /^[A-Za-z][A-Za-z0-9_+-]*(?:\/[A-Za-z0-9_.+-]+)+$/;

function isTimezoneToken(token: string): boolean {
  return /^utc$/i.test(token) || TZ_RE.test(token);
}

/** Digits, with an optional fractional part where the field allows one. */
function parseValue(token: string, spec: FieldSpec): number | null {
  const pattern = spec.fractional ? /^\d+(?:\.\d+)?$/ : /^\d+$/;
  if (!pattern.test(token)) return null;
  const n = Number(token);
  return Number.isFinite(n) ? n : null;
}

/**
 * One numeric component: a comma-separated list of `*`, `N`, `N..M`, `N/step` or
 * `N..M/step`. Returns an error sentence, or `null` when the component is fine.
 *
 * A bare `* /step` never reaches here — `validateOnCalendar` rejects it up front
 * with a dedicated message, because it is the single most common mistake and
 * deserves the specific fix rather than a generic parse error.
 */
function checkComponent(raw: string, spec: FieldSpec): string | null {
  if (raw === '') {
    return `A ${spec.name.toLowerCase()} is missing from this calendar expression.`;
  }
  for (const item of raw.split(',')) {
    if (item === '') {
      return `“${raw}” has an empty item in its list.`;
    }
    // Split off an optional "/step".
    const slash = item.indexOf('/');
    const base = slash === -1 ? item : item.slice(0, slash);
    const stepText = slash === -1 ? null : item.slice(slash + 1);

    if (stepText !== null) {
      if (!/^\d+$/.test(stepText)) {
        return `“${stepText}” is not a repeat step systemd can use in “${item}”.`;
      }
      if (Number(stepText) === 0) {
        return `A repeat step of 0 never advances, so systemd rejects “${item}”.`;
      }
    }

    if (base === '*') continue;

    const dots = base.indexOf('..');
    if (dots !== -1) {
      const fromText = base.slice(0, dots);
      const toText = base.slice(dots + 2);
      const from = parseValue(fromText, spec);
      const to = parseValue(toText, spec);
      if (from === null) {
        return `“${fromText}” is not a number systemd can use in a calendar expression.`;
      }
      if (to === null) {
        return `“${toText}” is not a number systemd can use in a calendar expression.`;
      }
      if (from < spec.min || from > spec.max) {
        return `${spec.name} ${fromText} is out of range — systemd allows ${spec.min}..${spec.max}.`;
      }
      if (to < spec.min || to > spec.max) {
        return `${spec.name} ${toText} is out of range — systemd allows ${spec.min}..${spec.max}.`;
      }
      if (from > to) {
        return `Range “${base}” runs backwards — systemd needs the smaller value first.`;
      }
      continue;
    }

    const value = parseValue(base, spec);
    if (value === null) {
      return `“${base}” is not a number systemd can use in a calendar expression.`;
    }
    if (value < spec.min || value > spec.max) {
      return `${spec.name} ${base} is out of range — systemd allows ${spec.min}..${spec.max}.`;
    }
  }
  return null;
}

/** The weekday part: `Mon`, `Mon..Fri`, `Mon,Wed,Fri`, `Mon..Thu,Sun`. */
function checkWeekdays(raw: string): string | null {
  for (const item of raw.split(',')) {
    if (item === '') {
      return `“${raw}” has an empty item in its weekday list.`;
    }
    const dots = item.indexOf('..');
    if (dots === -1) {
      const index = WEEKDAY_INDEX[item.toLowerCase()];
      if (!index) {
        return `“${item}” is not a weekday systemd recognises. Use Mon..Sun (or Monday..Sunday).`;
      }
      continue;
    }
    const fromText = item.slice(0, dots);
    const toText = item.slice(dots + 2);
    const from = WEEKDAY_INDEX[fromText.toLowerCase()];
    const to = WEEKDAY_INDEX[toText.toLowerCase()];
    if (!from) {
      return `“${fromText}” is not a weekday systemd recognises. Use Mon..Sun (or Monday..Sunday).`;
    }
    if (!to) {
      return `“${toText}” is not a weekday systemd recognises. Use Mon..Sun (or Monday..Sunday).`;
    }
    if (from > to) {
      // Sunday is LAST in systemd's ordering, so it can never open a range —
      // which is exactly why cron's Sunday-first `0-4` cannot be passed through
      // as `Sun..Thu`. Any other backwards range gets the general wording.
      return from === 7
        ? `Weekday range “${item}” runs backwards — systemd orders weekdays Mon..Sun, so Sunday cannot start a range.`
        : `Weekday range “${item}” runs backwards — systemd orders weekdays Mon..Sun, so “${toText}” must come after “${fromText}”.`;
    }
  }
  return null;
}

/** The date part: `YYYY-MM-DD`, `MM-DD`, with an optional `~` day-from-end. */
function checkDate(raw: string): string | null {
  // `*-02~03` means "third-from-last day of February": the `~` stands in for the
  // separator before the day. Normalise it so the split below sees three fields.
  const tilde = raw.lastIndexOf('~');
  const normalised = tilde === -1 ? raw : `${raw.slice(0, tilde)}-${raw.slice(tilde + 1)}`;

  const parts = normalised.split('-');
  if (parts.length === 3) {
    return (
      checkComponent(parts[0], YEAR) ?? checkComponent(parts[1], MONTH) ?? checkComponent(parts[2], DAY)
    );
  }
  if (parts.length === 2) {
    return checkComponent(parts[0], MONTH) ?? checkComponent(parts[1], DAY);
  }
  return `A date has two or three parts (MM-DD or YYYY-MM-DD); “${raw}” has ${parts.length}.`;
}

/** The time part: `HH:MM` or `HH:MM:SS`. */
function checkTime(raw: string): string | null {
  const parts = raw.split(':');
  if (parts.length === 2) {
    return checkComponent(parts[0], HOUR) ?? checkComponent(parts[1], MINUTE);
  }
  if (parts.length === 3) {
    return (
      checkComponent(parts[0], HOUR) ??
      checkComponent(parts[1], MINUTE) ??
      checkComponent(parts[2], SECOND)
    );
  }
  return `A time has two or three parts (HH:MM or HH:MM:SS); “${raw}” has ${parts.length}.`;
}

/**
 * Validate one `OnCalendar=` value against systemd.time(7).
 *
 * Never throws. `valid: false` always carries one specific `error` sentence.
 */
export function validateOnCalendar(expr: string): CalendarValidation {
  if (typeof expr !== 'string') {
    return fail('OnCalendar= has no value, so this timer never fires.');
  }
  const text = expr.trim();
  if (text === '') {
    return fail('OnCalendar= has no value, so this timer never fires.');
  }

  // The `*/step` trap, checked before anything else so it always wins: systemd
  // consumes the `*`, then fails on the leftover `/15`, and rejects the whole
  // expression. Cron's most-used idiom is the most likely thing to be pasted
  // here, so it gets the fix rather than a parser message.
  if (text.includes('*/')) {
    return fail(
      'A systemd calendar repeat needs an explicit start value before the “/”: write “00/15”, not “*/15”.',
    );
  }

  const parts = text.split(/\s+/);

  // A shorthand stands for the WHOLE expression.
  const shorthand = CALENDAR_SHORTHANDS[text.toLowerCase()];
  if (shorthand) {
    return {
      valid: true,
      notes: [`“${text}” is systemd shorthand for “${shorthand}”.`],
      expansion: shorthand,
    };
  }
  const firstAsShorthand = CALENDAR_SHORTHANDS[parts[0].toLowerCase()];
  if (firstAsShorthand && parts.length > 1) {
    return fail(
      `“${parts[0]}” is a complete calendar shorthand on its own — it cannot be combined with “${parts
        .slice(1)
        .join(' ')}”.`,
    );
  }

  if (parts.length > 4) {
    return fail(
      'A calendar expression has at most four space-separated parts (weekday, date, time, timezone); ' +
        `this one has ${parts.length}.`,
    );
  }

  let i = 0;
  let weekdays: string | null = null;
  let date: string | null = null;
  let time: string | null = null;
  let timezone: string | null = null;

  if (i < parts.length && /^[A-Za-z]/.test(parts[i]) && !isTimezoneToken(parts[i])) {
    weekdays = parts[i];
    i += 1;
  }
  if (i < parts.length && /[-~]/.test(parts[i]) && !parts[i].includes(':')) {
    date = parts[i];
    i += 1;
  }
  if (i < parts.length && parts[i].includes(':')) {
    time = parts[i];
    i += 1;
  }
  if (i < parts.length && isTimezoneToken(parts[i])) {
    timezone = parts[i];
    i += 1;
  }

  if (i < parts.length) {
    const leftover = parts[i];
    // Nothing at all was recognised: say that, rather than blaming the timezone.
    if (i === 0) {
      return fail(
        `“${leftover}” is not a date, a time or a weekday systemd recognises in a calendar expression.`,
      );
    }
    return fail(
      `“${leftover}” is not a timezone systemd would accept at the end of a calendar expression.`,
    );
  }

  if (weekdays !== null) {
    const error = checkWeekdays(weekdays);
    if (error) return fail(error);
  }
  if (date !== null) {
    const error = checkDate(date);
    if (error) return fail(error);
  }
  if (time !== null) {
    const error = checkTime(time);
    if (error) return fail(error);
  }

  const notes: string[] = [];
  if (timezone !== null && !/^utc$/i.test(timezone)) {
    notes.push(
      `Timezone “${timezone}” is passed through unchecked: systemd resolves it against the host’s own ` +
        'tzdata, which this page cannot read. Note that a timezone on OnCalendar= needs systemd 242 or newer.',
    );
  }

  return { valid: true, notes, ...(timezone !== null ? { timezone } : {}) };
}

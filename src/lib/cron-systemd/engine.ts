/**
 * Cron to systemd Converter — the pure, client-side conversion engine.
 *
 * `convert(cronLine, opts?)` takes a single crontab line and returns a
 * {@link SystemdResult}: an `OnCalendar=` expression and complete `.timer` /
 * oneshot `.service` units, plus `notes` for any caveats.
 *
 * Design rules (load-bearing — the playground relies on them):
 *   • NEVER throws. Every failure path returns `{ valid: false, error, … }`.
 *   • Deterministic: same input → same output, no clocks, no randomness.
 *   • Accepts three input shapes:
 *       1. "MIN HOUR DOM MON DOW command…"   (5 fields + command)
 *       2. "MIN HOUR DOM MON DOW"            (just the 5 schedule fields)
 *       3. "@macro [command…]"               (@reboot/@daily/@weekly/…)
 *
 * OnCalendar mapping reference (systemd.time(7)):
 *   OnCalendar = DOW YYYY-MM-DD HH:MM:SS
 *   where DOW is a Mon..Sun list/range, the date is Year-Month-Day, and the
 *   time is Hour:Minute:Second. We always pin seconds to :00 (cron is minutely)
 *   and translate cron lists (a,b), ranges (a-b), steps (* /n, a-b/n) and "*".
 */

import type { SystemdResult } from './types';

/* ────────────────────────────────────────────────────────────────────────
 * Field metadata
 * ──────────────────────────────────────────────────────────────────────── */

/** A schedule field's numeric domain and (for MON/DOW) its name aliases. */
interface FieldSpec {
  /** Inclusive minimum legal value in cron. */
  min: number;
  /** Inclusive maximum legal value in cron. */
  max: number;
  /** Human field name for error messages. */
  name: string;
  /** Lower-cased 3-letter (or longer) name → number, for MON/DOW. */
  names?: Record<string, number>;
}

/** Month name aliases (cron accepts JAN..DEC, case-insensitive). */
const MONTH_NAMES: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

/** Day-of-week name aliases (cron accepts SUN..SAT; SUN is 0 *and* 7). */
const DOW_NAMES: Record<string, number> = {
  sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6,
};

/** The five cron schedule fields, in order. */
const FIELD_SPECS: FieldSpec[] = [
  { min: 0, max: 59, name: 'minute' },
  { min: 0, max: 23, name: 'hour' },
  { min: 1, max: 31, name: 'day-of-month' },
  { min: 1, max: 12, name: 'month', names: MONTH_NAMES },
  { min: 0, max: 7, name: 'day-of-week', names: DOW_NAMES },
];

/** systemd OnCalendar day-of-week tokens, indexed by cron DOW number (0 = Sun). */
const SYSTEMD_DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

/* ────────────────────────────────────────────────────────────────────────
 * @macro table
 * ──────────────────────────────────────────────────────────────────────── */

/**
 * Nickname → equivalent 5-field cron string (per crontab(5)). `@reboot` has no
 * schedule equivalent — it is handled specially and maps to `OnBootSec=`.
 */
const MACROS: Record<string, string | null> = {
  '@yearly': '0 0 1 1 *',
  '@annually': '0 0 1 1 *',
  '@monthly': '0 0 1 * *',
  '@weekly': '0 0 * * 0',
  '@daily': '0 0 * * *',
  '@midnight': '0 0 * * *',
  '@hourly': '0 * * * *',
  '@reboot': null,
};

/* ────────────────────────────────────────────────────────────────────────
 * Per-field parsing → a structured representation
 * ──────────────────────────────────────────────────────────────────────── */

/** One parsed component of a field (a single value, a range, or a step). */
type Part =
  | { kind: 'all' } // "*"
  | { kind: 'single'; value: number } // "5"
  | { kind: 'range'; from: number; to: number } // "1-5"
  | { kind: 'step'; from: number; to: number | null; step: number }; // "* /n", "1-9/2", "5/n"

/** A fully-parsed field: its raw text plus its decomposed parts. */
interface ParsedField {
  raw: string;
  parts: Part[];
  /** True when the field is exactly "*". */
  isWildcard: boolean;
}

/** Resolve a token to a number, honouring month/day-of-week name aliases. */
function resolveToken(token: string, spec: FieldSpec): number | null {
  const t = token.trim().toLowerCase();
  if (t === '') return null;
  if (spec.names && Object.prototype.hasOwnProperty.call(spec.names, t)) {
    return spec.names[t];
  }
  if (!/^\d+$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** Range-check a resolved value against the field domain. */
function inRange(n: number, spec: FieldSpec): boolean {
  return Number.isInteger(n) && n >= spec.min && n <= spec.max;
}

/**
 * Parse a single cron field (e.g. "* /15", "1-5", "MON,WED,FRI") into parts.
 * Returns `{ error }` on the first illegal token. Never throws.
 */
function parseField(raw: string, spec: FieldSpec): ParsedField | { error: string } {
  const field = raw.trim();
  if (field === '') return { error: `The ${spec.name} field is empty.` };

  const isWildcard = field === '*';
  const parts: Part[] = [];

  for (const component of field.split(',')) {
    const piece = component.trim();
    if (piece === '') {
      return { error: `The ${spec.name} field has an empty list item in “${field}”.` };
    }

    // Split off an optional "/step" suffix.
    const slash = piece.indexOf('/');
    const base = slash === -1 ? piece : piece.slice(0, slash);
    const stepText = slash === -1 ? null : piece.slice(slash + 1);

    let step: number | null = null;
    if (stepText !== null) {
      if (!/^\d+$/.test(stepText)) {
        return { error: `Invalid step “/${stepText}” in the ${spec.name} field.` };
      }
      step = Number(stepText);
      if (step <= 0) {
        return { error: `Step must be a positive number in the ${spec.name} field.` };
      }
    }

    if (base === '*') {
      if (step !== null) {
        parts.push({ kind: 'step', from: spec.min, to: null, step });
      } else {
        parts.push({ kind: 'all' });
      }
      continue;
    }

    // A range "a-b" or a single value "a".
    const dash = base.indexOf('-');
    if (dash !== -1) {
      const fromTok = base.slice(0, dash);
      const toTok = base.slice(dash + 1);
      const from = resolveToken(fromTok, spec);
      const to = resolveToken(toTok, spec);
      if (from === null || !inRange(from, spec)) {
        return { error: `“${fromTok}” is not a valid ${spec.name} value.` };
      }
      if (to === null || !inRange(to, spec)) {
        return { error: `“${toTok}” is not a valid ${spec.name} value.` };
      }
      if (from > to) {
        return { error: `Range “${base}” is reversed in the ${spec.name} field.` };
      }
      if (step !== null) {
        parts.push({ kind: 'step', from, to, step });
      } else {
        parts.push(from === to ? { kind: 'single', value: from } : { kind: 'range', from, to });
      }
      continue;
    }

    // A single value, possibly with a step (cron's "5/2" == "5-max/2").
    const value = resolveToken(base, spec);
    if (value === null || !inRange(value, spec)) {
      return { error: `“${base}” is not a valid ${spec.name} value.` };
    }
    if (step !== null) {
      parts.push({ kind: 'step', from: value, to: spec.max, step });
    } else {
      parts.push({ kind: 'single', value });
    }
  }

  return { raw: field, parts, isWildcard };
}

/* ────────────────────────────────────────────────────────────────────────
 * Field → OnCalendar fragment rendering
 * ──────────────────────────────────────────────────────────────────────── */

/** Zero-pad a number to two digits (systemd time fields are 2-wide). */
function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/**
 * Render the numeric (non-DOW) fields — minute, hour, day-of-month, month — to
 * an OnCalendar fragment. `pad` two-pads values where systemd expects it
 * (minute/hour/day/month all read cleanly two-padded).
 *
 * Returns `{ text, approximate }`. A step whose interval does not evenly tile
 * the field domain is flagged `approximate` so the caller can add a note.
 */
function renderNumeric(
  field: ParsedField,
  spec: FieldSpec,
): { text: string; approximate: boolean } {
  if (field.isWildcard) return { text: '*', approximate: false };

  let approximate = false;
  const tokens = field.parts.map((part) => {
    switch (part.kind) {
      case 'all':
        return '*';
      case 'single':
        return pad2(part.value);
      case 'range':
        return `${pad2(part.from)}..${pad2(part.to)}`;
      case 'step': {
        const to = part.to ?? spec.max;
        // systemd supports "from..to/step" and "*/step". When the cron step
        // started at a bare value (e.g. "5/10") we render the explicit range.
        const span = to - part.from;
        // Flag as approximate when the step doesn't evenly divide the span and
        // doesn't start at the domain minimum — systemd's stepping anchors at
        // `from`, which usually matches cron, but odd starts are worth noting.
        if (part.step > spec.max) approximate = true;
        if (span % part.step !== 0 && part.from !== spec.min) approximate = true;
        if (part.from === spec.min && to === spec.max) {
          return `*/${part.step}`;
        }
        return `${pad2(part.from)}..${pad2(to)}/${part.step}`;
      }
    }
  });

  return { text: tokens.join(','), approximate };
}

/**
 * Render the day-of-week field to systemd weekday tokens (Mon..Sun). Returns
 * `null` text when the field is "*" (no weekday constraint). Normalises cron's
 * dual Sunday (0 and 7) onto a single "Sun".
 */
function renderDow(field: ParsedField): { text: string | null; approximate: boolean } {
  if (field.isWildcard) return { text: null, approximate: false };

  let approximate = false;
  const names = (n: number) => SYSTEMD_DOW[n === 7 ? 0 : n];

  const tokens = field.parts.map((part) => {
    switch (part.kind) {
      case 'all':
        return null; // a lone "*" inside a list is meaningless; treat as no-op
      case 'single':
        return names(part.value);
      case 'range': {
        // systemd accepts weekday ranges like "Mon..Fri".
        const from = names(part.from);
        const to = names(part.to);
        return `${from}..${to}`;
      }
      case 'step': {
        // systemd has no weekday step syntax; expand to an explicit list.
        approximate = true;
        const to = part.to ?? 6;
        const out: string[] = [];
        for (let v = part.from; v <= to; v += part.step) out.push(names(v));
        return out.join(',');
      }
    }
  });

  const text = tokens.filter((t): t is string => t !== null).join(',');
  return { text: text === '' ? null : text, approximate };
}

/* ────────────────────────────────────────────────────────────────────────
 * Command extraction
 * ──────────────────────────────────────────────────────────────────────── */

/** Default ExecStart placeholder when the cron line carried no command. */
const COMMAND_PLACEHOLDER = '/usr/bin/true';

/** A safe systemd unit-name token (letters, digits, dash, underscore, dot). */
function sanitizeUnitName(name: string): string {
  const cleaned = name
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
  return cleaned || 'cron-job';
}

/* ────────────────────────────────────────────────────────────────────────
 * Unit rendering
 * ──────────────────────────────────────────────────────────────────────── */

/** Render the `.timer` unit body. */
function renderTimer(
  unitName: string,
  description: string,
  timerLine: string,
): string {
  return [
    '[Unit]',
    `Description=${description}`,
    '',
    '[Timer]',
    timerLine,
    'Persistent=true',
    `Unit=${unitName}.service`,
    '',
    '[Install]',
    'WantedBy=timers.target',
    '',
  ].join('\n');
}

/** Render the oneshot `.service` unit body. */
function renderService(description: string, command: string): string {
  return [
    '[Unit]',
    `Description=${description}`,
    '',
    '[Service]',
    'Type=oneshot',
    `ExecStart=${command}`,
    '',
  ].join('\n');
}

/* ────────────────────────────────────────────────────────────────────────
 * Top-level convert()
 * ──────────────────────────────────────────────────────────────────────── */

/** Build a failed result with empty units and the supplied message. */
function fail(error: string, notes: string[] = []): SystemdResult {
  return { valid: false, error, onCalendar: '', timerUnit: '', serviceUnit: '', notes };
}

/**
 * Convert a single crontab line to systemd timer + service units.
 *
 * @param cronLine The crontab entry. One of:
 *                 "MIN HOUR DOM MON DOW command", just the five fields, or an
 *                 "@macro [command]".
 * @param opts.unitName Base name for the generated units (sanitised). Defaults
 *                      to "cron-job".
 * @returns A {@link SystemdResult}. Never throws.
 */
export function convert(
  cronLine: string,
  opts?: { unitName?: string },
): SystemdResult {
  const notes: string[] = [];
  const unitName = sanitizeUnitName(opts?.unitName ?? 'cron-job');

  // ── Normalise input ──────────────────────────────────────────────────
  if (typeof cronLine !== 'string') {
    return fail('No cron line was provided.');
  }
  // Strip a leading "comment" marker users sometimes paste, and trim.
  let line = cronLine.replace(/\r/g, '').trim();
  if (line === '') {
    return fail('The cron line is empty. Paste a crontab entry to convert.');
  }
  if (line.startsWith('#')) {
    return fail('That looks like a comment line. Paste the cron schedule itself.');
  }

  // ── @macro handling ──────────────────────────────────────────────────
  let command = '';
  let commandWasGiven = false;

  if (line.startsWith('@')) {
    const wsIndex = line.search(/\s/);
    const macro = (wsIndex === -1 ? line : line.slice(0, wsIndex)).toLowerCase();
    const rest = wsIndex === -1 ? '' : line.slice(wsIndex + 1).trim();

    if (!Object.prototype.hasOwnProperty.call(MACROS, macro)) {
      return fail(
        `Unknown schedule macro “${macro}”. Supported: ` +
          '@reboot, @yearly, @annually, @monthly, @weekly, @daily, @midnight, @hourly.',
      );
    }

    if (rest) {
      command = rest;
      commandWasGiven = true;
    }

    // @reboot is a special case: no OnCalendar, runs once after boot.
    if (macro === '@reboot') {
      const onCalendar = 'OnBootSec=1min';
      notes.push(
        '@reboot has no calendar equivalent — it maps to OnBootSec (run once shortly after boot). ' +
          'Adjust the 1min delay as needed.',
      );
      return finalize({
        unitName,
        timerLine: 'OnBootSec=1min',
        onCalendarDisplay: onCalendar,
        command,
        commandWasGiven,
        notes,
      });
    }

    // Expand the macro to its 5-field cron and fall through to normal parsing.
    const expanded = MACROS[macro];
    if (expanded == null) {
      // Defensive — only @reboot is null and it's handled above.
      return fail(`The macro “${macro}” cannot be converted to a calendar schedule.`);
    }
    notes.push(`Expanded ${macro} to the cron schedule “${expanded}”.`);
    // Re-join expanded schedule with any command the user supplied.
    line = command ? `${expanded} ${command}` : expanded;
    // The command is already captured; reset so the splitter below re-derives.
    command = '';
    commandWasGiven = false;
  }

  // ── Split into 5 schedule fields (+ optional command) ────────────────
  const tokens = line.split(/\s+/);
  if (tokens.length < 5) {
    return fail(
      `Expected 5 schedule fields (minute hour day-of-month month day-of-week), ` +
        `but found ${tokens.length}. Example: “0 3 * * * /usr/bin/backup.sh”.`,
    );
  }

  const scheduleTokens = tokens.slice(0, 5);
  if (tokens.length > 5) {
    command = tokens.slice(5).join(' ');
    commandWasGiven = true;
  }

  // ── Parse each schedule field ────────────────────────────────────────
  const parsed: ParsedField[] = [];
  for (let i = 0; i < 5; i += 1) {
    const result = parseField(scheduleTokens[i], FIELD_SPECS[i]);
    if ('error' in result) {
      return fail(result.error, notes);
    }
    parsed.push(result);
  }

  const [minF, hourF, domF, monF, dowF] = parsed;

  // ── Render OnCalendar fragments ──────────────────────────────────────
  const minute = renderNumeric(minF, FIELD_SPECS[0]);
  const hour = renderNumeric(hourF, FIELD_SPECS[1]);
  const dom = renderNumeric(domF, FIELD_SPECS[2]);
  const month = renderNumeric(monF, FIELD_SPECS[3]);
  const dow = renderDow(dowF);

  if (minute.approximate || hour.approximate || dom.approximate || month.approximate) {
    notes.push(
      'One or more step expressions don’t tile their range evenly; the OnCalendar ' +
        'value is a close approximation — verify with “systemd-analyze calendar”.',
    );
  }
  if (dow.approximate) {
    notes.push(
      'systemd has no day-of-week step syntax, so the weekday step was expanded to an explicit list.',
    );
  }

  // cron quirk: when BOTH day-of-month and day-of-week are restricted, cron runs
  // on the UNION (either matches). systemd OnCalendar treats them as an AND
  // (both must match). Warn so the user knows the semantics differ.
  if (!domF.isWildcard && !dowF.isWildcard) {
    notes.push(
      'Cron runs when day-of-month OR day-of-week matches, but systemd requires BOTH to match. ' +
        'If you need the OR behaviour, split this into two timers.',
    );
  }

  // ── Assemble the "DOW DATE TIME" OnCalendar expression ───────────────
  // Date part: *-Month-Day  (year is always "*").
  const datePart = `*-${month.text}-${dom.text}`;
  // Time part: Hour:Minute:Second (seconds pinned to 00 — cron is minutely).
  const timePart = `${hour.text}:${minute.text}:00`;
  const calendar = dow.text
    ? `${dow.text} ${datePart} ${timePart}`
    : `${datePart} ${timePart}`;

  const timerLine = `OnCalendar=${calendar}`;

  return finalize({
    unitName,
    timerLine,
    onCalendarDisplay: calendar,
    command,
    commandWasGiven,
    notes,
  });
}

/* ────────────────────────────────────────────────────────────────────────
 * Shared finalisation: attach command notes and render both unit files.
 * ──────────────────────────────────────────────────────────────────────── */

interface FinalizeArgs {
  unitName: string;
  /** The full `[Timer]` schedule line ("OnCalendar=…" or "OnBootSec=…"). */
  timerLine: string;
  /** Human-readable schedule for the `onCalendar` result field. */
  onCalendarDisplay: string;
  command: string;
  commandWasGiven: boolean;
  notes: string[];
}

function finalize(args: FinalizeArgs): SystemdResult {
  const { unitName, timerLine, onCalendarDisplay, commandWasGiven, notes } = args;
  let command = args.command.trim();

  if (commandWasGiven && command) {
    // Note how the command was interpreted: cron runs commands via /bin/sh, so
    // shell features (pipes, redirects, env, &&) need wrapping for systemd.
    if (/[|&;<>$`(){}*?]/.test(command)) {
      notes.push(
        'The command uses shell syntax (pipes, redirects, variables, etc.). ' +
          'cron runs through /bin/sh, so wrap it: ExecStart=/bin/sh -lc \'…\'.',
      );
    } else {
      notes.push('Command parsed from the cron line and placed in ExecStart.');
    }
    // systemd requires an absolute path or a shell wrapper for ExecStart.
    if (!command.startsWith('/') && !/^\S+=/.test(command)) {
      notes.push(
        'ExecStart should be an absolute path (e.g. /usr/bin/…). Adjust if the command isn’t absolute.',
      );
    }
  } else {
    command = COMMAND_PLACEHOLDER;
    notes.push(
      `No command was found on the cron line — ExecStart is set to ${COMMAND_PLACEHOLDER} as a placeholder. ` +
        'Replace it with the program your timer should run.',
    );
  }

  const description = `${unitName} (converted from crontab)`;
  const timerUnit = renderTimer(unitName, description, timerLine);
  const serviceUnit = renderService(description, command);

  return {
    valid: true,
    onCalendar: onCalendarDisplay,
    timerUnit,
    serviceUnit,
    notes,
  };
}

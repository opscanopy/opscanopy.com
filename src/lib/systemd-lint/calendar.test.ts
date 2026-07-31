import { describe, expect, it } from 'vitest';
import { CALENDAR_SHORTHANDS, SYSTEMD_DOW, validateOnCalendar } from './calendar';

/**
 * `OnCalendar=` grammar, per systemd.time(7) "CALENDAR EVENTS".
 *
 * Every expression asserted VALID here is a form `systemd-analyze calendar`
 * accepts on systemd 255; every expression asserted INVALID is one it rejects.
 * The two properties that make this module worth extracting are pinned below and
 * relied on by `cron-systemd`'s round-trip suite:
 *
 *   - a repeat needs an explicit start value (`00/15`, never a bare `* /15`);
 *   - weekday ranges run in systemd's Mon..Sun order, so cron's Sunday-first
 *     `Sun..Thu` is not a legal pass-through.
 */
describe('SYSTEMD_DOW', () => {
  // Indexed by CRON day number (0 = Sunday), which is what makes it shareable
  // with the converter: cron-systemd indexes straight into it.
  it('is indexed by cron day number, Sunday first', () => {
    expect(SYSTEMD_DOW).toEqual(['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']);
    expect(SYSTEMD_DOW[0]).toBe('Sun');
    expect(SYSTEMD_DOW[6]).toBe('Sat');
  });
});

describe('validateOnCalendar — accepted forms', () => {
  const valid = [
    '*-*-* 03:00:00',
    '*-*-* 03:00',
    '03:00:00',
    '12:00',
    'Mon..Fri *-*-* 09:00:00',
    'Mon,Wed,Fri *-*-* 18:00:00',
    'Mon..Thu,Sun *-*-* 03:00:00',
    'Sat *-*-1..7 18:00:00',
    '*-*-* *:00/15:00',
    '*-*-* 00/6:00:00',
    '*-*-01/2 00:00:00',
    '*-01/3-* 03:00:00',
    '*-*-* *:10..50/10:00',
    '2026-01-01 00:00:00',
    '*-12-* 04:00:00',
    '*-*~01 12:00:00',
    '*-*-* 00:00:00 UTC',
    'monday *-*-* 00:00:00',
    'Sunday *-*-* 00:00:00',
    '*-*-* 23:59:60',
  ];
  for (const expr of valid) {
    it(`accepts ${expr}`, () => {
      const r = validateOnCalendar(expr);
      expect(r.error, `expected ${expr} to be valid`).toBeUndefined();
      expect(r.valid).toBe(true);
    });
  }

  it('trims surrounding whitespace', () => {
    expect(validateOnCalendar('   *-*-* 03:00:00  ').valid).toBe(true);
  });
});

describe('validateOnCalendar — shorthands', () => {
  it('accepts every documented shorthand and reports its expansion', () => {
    for (const [name, expansion] of Object.entries(CALENDAR_SHORTHANDS)) {
      const r = validateOnCalendar(name);
      expect(r.valid, `${name} should be valid`).toBe(true);
      expect(r.expansion).toBe(expansion);
      expect(r.notes.join(' ')).toContain(expansion);
    }
  });

  it('pins the documented expansions rather than guessing them', () => {
    expect(CALENDAR_SHORTHANDS.weekly).toBe('Mon *-*-* 00:00:00');
    expect(CALENDAR_SHORTHANDS.daily).toBe('*-*-* 00:00:00');
    expect(CALENDAR_SHORTHANDS.hourly).toBe('*-*-* *:00:00');
    expect(CALENDAR_SHORTHANDS.minutely).toBe('*-*-* *:*:00');
    expect(CALENDAR_SHORTHANDS.monthly).toBe('*-*-01 00:00:00');
    expect(CALENDAR_SHORTHANDS.quarterly).toBe('*-01,04,07,10-01 00:00:00');
    expect(CALENDAR_SHORTHANDS.semiannually).toBe('*-01,07-01 00:00:00');
    expect(CALENDAR_SHORTHANDS.yearly).toBe('*-01-01 00:00:00');
    expect(CALENDAR_SHORTHANDS.annually).toBe('*-01-01 00:00:00');
  });

  it('is case-insensitive about a shorthand', () => {
    expect(validateOnCalendar('WEEKLY').valid).toBe(true);
  });

  it('refuses to combine a shorthand with anything else', () => {
    const r = validateOnCalendar('daily UTC');
    expect(r.valid).toBe(false);
    expect(r.error).toBe(
      '“daily” is a complete calendar shorthand on its own — it cannot be combined with “UTC”.',
    );
  });
});

describe('validateOnCalendar — the */step trap', () => {
  // The single most common mistake: cron's `*/15` is not systemd calendar
  // syntax. systemd consumes the `*` and then fails on the leftover `/15`, so
  // the whole expression is rejected and the timer never fires.
  const stepMessage =
    'A systemd calendar repeat needs an explicit start value before the “/”: write “00/15”, not “*/15”.';

  it('rejects a bare */15', () => {
    const r = validateOnCalendar('*/15');
    expect(r.valid).toBe(false);
    expect(r.error).toBe(stepMessage);
  });

  it('rejects */15 inside a full expression', () => {
    expect(validateOnCalendar('*-*-* */15:00').error).toBe(stepMessage);
  });

  it('rejects */2 in the day field', () => {
    expect(validateOnCalendar('*-*-*/2 00:00:00').error).toBe(stepMessage);
  });

  it('accepts the anchored equivalents the converter emits', () => {
    expect(validateOnCalendar('*-*-* *:00/15:00').valid).toBe(true);
    expect(validateOnCalendar('*-*-* 00/6:00:00').valid).toBe(true);
    expect(validateOnCalendar('*-*-01/2 00:00:00').valid).toBe(true);
  });
});

describe('validateOnCalendar — component ranges', () => {
  const cases: [string, string][] = [
    ['*-*-* 25:00:00', 'Hour 25 is out of range — systemd allows 0..23.'],
    ['*-*-* 00:60:00', 'Minute 60 is out of range — systemd allows 0..59.'],
    ['*-*-* 00:00:61', 'Second 61 is out of range — systemd allows 0..60.'],
    ['*-13-01 00:00:00', 'Month 13 is out of range — systemd allows 1..12.'],
    ['*-*-32 00:00:00', 'Day 32 is out of range — systemd allows 1..31.'],
    ['1969-01-01 00:00:00', 'Year 1969 is out of range — systemd allows 1970..2199.'],
  ];
  for (const [expr, message] of cases) {
    it(`rejects ${expr}`, () => {
      const r = validateOnCalendar(expr);
      expect(r.valid).toBe(false);
      expect(r.error).toBe(message);
    });
  }

  it('rejects a reversed numeric range', () => {
    expect(validateOnCalendar('*-*-* 10..08:00:00').error).toBe(
      'Range “10..08” runs backwards — systemd needs the smaller value first.',
    );
  });

  it('rejects a zero repeat step', () => {
    expect(validateOnCalendar('*-*-* 00/0:00:00').error).toBe(
      'A repeat step of 0 never advances, so systemd rejects “00/0”.',
    );
  });
});

describe('validateOnCalendar — weekdays', () => {
  it('rejects a weekday systemd does not know, and names the alternatives', () => {
    expect(validateOnCalendar('Mnday *-*-* 00:00:00').error).toBe(
      '“Mnday” is not a weekday systemd recognises. Use Mon..Sun (or Monday..Sunday).',
    );
  });

  // cron counts weekdays Sunday-first, systemd counts them Monday-first and
  // rejects a range whose start index is past its end. This is why the converter
  // re-sorts a cron `0-4` into `Mon..Thu,Sun` instead of emitting `Sun..Thu`.
  it('rejects a Sunday-first weekday range', () => {
    expect(validateOnCalendar('Sun..Thu *-*-* 00:00:00').error).toBe(
      'Weekday range “Sun..Thu” runs backwards — systemd orders weekdays Mon..Sun, so Sunday cannot start a range.',
    );
  });

  it('accepts the systemd-ordered equivalent', () => {
    expect(validateOnCalendar('Mon..Thu,Sun *-*-* 00:00:00').valid).toBe(true);
  });
});

describe('validateOnCalendar — timezones', () => {
  it('accepts UTC without a caveat', () => {
    const r = validateOnCalendar('*-*-* 06:00:00 UTC');
    expect(r.valid).toBe(true);
    expect(r.timezone).toBe('UTC');
    expect(r.notes).toEqual([]);
  });

  it('accepts an IANA name but says it cannot check it', () => {
    const r = validateOnCalendar('*-*-* 06:00:00 Asia/Kolkata');
    expect(r.valid).toBe(true);
    expect(r.timezone).toBe('Asia/Kolkata');
    expect(r.notes.join(' ')).toBe(
      'Timezone “Asia/Kolkata” is passed through unchecked: systemd resolves it against the host’s ' +
        'own tzdata, which this page cannot read. Note that a timezone on OnCalendar= needs systemd 242 or newer.',
    );
  });

  it('rejects trailing junk that is not a timezone', () => {
    expect(validateOnCalendar('*-*-* 06:00:00 tomorrow').error).toBe(
      '“tomorrow” is not a timezone systemd would accept at the end of a calendar expression.',
    );
  });
});

describe('validateOnCalendar — never throws, always specific', () => {
  it('rejects an empty expression', () => {
    expect(validateOnCalendar('').error).toBe('OnCalendar= has no value, so this timer never fires.');
    expect(validateOnCalendar('   ').valid).toBe(false);
  });

  it('rejects too many space-separated parts', () => {
    expect(validateOnCalendar('0 3 * * *').error).toBe(
      'A calendar expression has at most four space-separated parts (weekday, date, time, timezone); this one has 5.',
    );
  });

  it('names the missing time when a date has no time', () => {
    // A date-only expression IS legal (systemd fills in 00:00:00), so this is a
    // guard against over-rejecting rather than a rejection.
    expect(validateOnCalendar('2026-01-01').valid).toBe(true);
  });

  it('never throws on hostile input', () => {
    const hostile = [
      '',
      '   ',
      ' ',
      '-'.repeat(5000),
      ':'.repeat(5000),
      '*'.repeat(5000),
      '..',
      '/',
      '1..',
      '..1',
      '1/',
      '/1',
      '-1:-1:-1',
      'NaN-NaN-NaN NaN:NaN:NaN',
      '99999999999999999999-01-01 00:00:00',
      '\u{1F600} *-*-* 00:00:00',
      'Mon..',
      '..Mon',
      'Mon,,Tue *-*-* 00:00:00',
      '*-*-* ::',
      '*-*-* 1:2:3:4',
    ];
    for (const expr of hostile) {
      expect(() => validateOnCalendar(expr), `threw on ${JSON.stringify(expr)}`).not.toThrow();
      const r = validateOnCalendar(expr);
      if (!r.valid) expect(typeof r.error).toBe('string');
    }
  });

  it('never throws on non-string input', () => {
    for (const bad of [undefined, null, 42, {}, [], () => {}]) {
      // Deliberately bypassing the type — a playground can hand over anything.
      expect(() => validateOnCalendar(bad as unknown as string)).not.toThrow();
      expect(validateOnCalendar(bad as unknown as string).valid).toBe(false);
    }
  });
});

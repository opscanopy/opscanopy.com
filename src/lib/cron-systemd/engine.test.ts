import { describe, expect, it } from 'vitest';
import { convert } from './engine';
import { validateOnCalendar } from '../systemd-lint/calendar';
import { lint } from '../systemd-lint/engine';

/**
 * Regression suite for the crontab → systemd timer converter.
 *
 * Every OnCalendar expectation here was validated against `systemd-analyze
 * calendar` on systemd 255 — a form this engine emits that systemd refuses to
 * parse is a bug, however reasonable it looks next to cron syntax.
 */
describe('convert — OnCalendar step syntax', () => {
  // systemd calendar syntax has no bare "*/n": the repeat needs an explicit
  // start value. `*/15` is the single most common cron idiom, so this is the
  // highest-traffic path through the engine.
  it('renders a minute step from an explicit start, not "*/n"', () => {
    const r = convert('*/15 * * * * /opt/poll.sh');
    expect(r.valid).toBe(true);
    expect(r.onCalendar).toBe('*-*-* *:00/15:00');
  });

  it('renders an hour step from an explicit start', () => {
    expect(convert('0 */6 * * * /x').onCalendar).toBe('*-*-* 00/6:00:00');
  });

  it('renders a day-of-month step from day 01', () => {
    expect(convert('0 0 */2 * * /x').onCalendar).toBe('*-*-01/2 00:00:00');
  });

  it('renders a month step from month 01', () => {
    expect(convert('0 3 * */3 * /x').onCalendar).toBe('*-01/3-* 03:00:00');
  });

  it('never emits a bare "*/" in any step position', () => {
    for (const line of [
      '*/15 * * * * /x',
      '0 */6 * * * /x',
      '0 0 */2 * * /x',
      '0 3 * */3 * /x',
      '0 */2 1 * * /x',
    ]) {
      expect(convert(line).onCalendar).not.toMatch(/\*\//);
    }
  });

  it('still renders an explicit from..to/step range unchanged', () => {
    expect(convert('10-50/10 * * * * /x').onCalendar).toBe('*-*-* *:10..50/10:00');
  });
});

describe('convert — day-of-week ordering', () => {
  // systemd orders weekdays Mon..Sun and rejects a range whose start index is
  // greater than its end, so cron's Sunday-first "0-4" cannot pass through as
  // "Sun..Thu".
  it('does not emit a Sunday-first weekday range', () => {
    expect(convert('0 3 * * 0-4 /x').onCalendar).not.toMatch(/Sun\.\./);
  });

  // Re-sorted into systemd's Mon..Sun order and compacted the way
  // `systemd-analyze calendar` itself normalizes the list.
  it('expands a Sunday-first range to a systemd-ordered weekday set', () => {
    expect(convert('0 3 * * 0-4 /x').onCalendar).toBe('Mon..Thu,Sun *-*-* 03:00:00');
  });

  it('expands the named Sunday-first form the same way', () => {
    expect(convert('0 3 * * SUN-THU /x').onCalendar).toBe('Mon..Thu,Sun *-*-* 03:00:00');
  });

  it('omits the weekday component when the range covers all seven days', () => {
    expect(convert('0 3 * * 0-6 /x').onCalendar).toBe('*-*-* 03:00:00');
  });

  it('still emits a plain Mon..Fri range unchanged', () => {
    expect(convert('0 3 * * 1-5 /x').onCalendar).toBe('Mon..Fri *-*-* 03:00:00');
  });
});

describe('convert — ExecStart specifier escaping', () => {
  // In a systemd unit "%" introduces a specifier: %Y is the unit-file
  // directory, %m the machine ID, %H the hostname. Date-stamped filenames are
  // ubiquitous in crontabs, so an unescaped "%" silently rewrites the command.
  it('doubles "%" so systemd does not expand it as a specifier', () => {
    const r = convert('0 3 * * * /usr/bin/foo --out /var/log/b-%Y%m%d.log');
    expect(r.valid).toBe(true);
    expect(r.serviceUnit).toContain('ExecStart=/usr/bin/foo --out /var/log/b-%%Y%%m%%d.log');
  });

  it('unescapes crontab\'s backslash-% before doubling it for systemd', () => {
    const r = convert(String.raw`0 3 * * * /usr/bin/foo --out /var/log/b-\%Y.log`);
    expect(r.serviceUnit).toContain('ExecStart=/usr/bin/foo --out /var/log/b-%%Y.log');
  });

  it('warns that the command contained a % specifier', () => {
    const r = convert('0 3 * * * /usr/bin/foo --out /var/log/b-%Y%m%d.log');
    expect(r.notes.join(' ')).toMatch(/%/);
  });

  it('leaves a command with no "%" untouched', () => {
    const r = convert('0 3 * * * /usr/bin/foo --out /var/log/b.log');
    expect(r.serviceUnit).toContain('ExecStart=/usr/bin/foo --out /var/log/b.log');
    expect(r.serviceUnit).not.toContain('%%');
  });
});

/* ════════════════════════════════════════════════════════════════════════
 * ROUND TRIP — this converter's output must satisfy the Systemd Unit
 * Validator, which is the tool a user reaches for next.
 *
 * Two tools disagreeing about the same OnCalendar= expression is the worst
 * outcome the site can ship: one of them is confidently wrong and the visitor
 * cannot tell which. So every conversion below is fed straight back into
 * `validateOnCalendar` AND into the unit linter, and both must be clean. The
 * shared `SYSTEMD_DOW` table (systemd-lint/calendar.ts) is the only code the two
 * engines have in common — this suite is what keeps their SEMANTICS in step.
 * ════════════════════════════════════════════════════════════════════════ */

/** Cron lines that cover every rendering path in `convert()`. */
const ROUND_TRIP_LINES = [
  '*/15 * * * * /opt/poll.sh',
  '0 */6 * * * /x',
  '0 0 */2 * * /x',
  '0 3 * */3 * /x',
  '0 */2 1 * * /x',
  '10-50/10 * * * * /x',
  '0 3 * * 0-4 /x',
  '0 3 * * SUN-THU /x',
  '0 3 * * 0-6 /x',
  '0 3 * * 1-5 /x',
  '0 3 * * 0 /x',
  '0 3 * * 7 /x',
  '30 4 1 * * /x',
  '0 0 1 1 * /x',
  '5,20,35,50 * * * * /x',
  '0 9-17 * * MON-FRI /x',
  '*/5 9-17 * * 1-5 /usr/bin/check',
  '0 0 * * 1,3,5 /x',
  '15 2 * JAN,JUL * /x',
  '0 0 29 2 * /x',
  '59 23 31 12 * /x',
  '@daily /usr/bin/backup',
  '@hourly /usr/bin/rotate',
  '@weekly /usr/bin/report',
  '@monthly /usr/bin/invoice',
  '@yearly /usr/bin/archive',
  '@annually /usr/bin/archive',
  '@midnight /usr/bin/nightly',
  '0 3 * * *',
  '*/30 * * * * /usr/bin/tool --flag',
];

describe('round trip — every OnCalendar this converter emits is valid systemd', () => {
  for (const line of ROUND_TRIP_LINES) {
    it(`validateOnCalendar accepts the output of “${line}”`, () => {
      const r = convert(line);
      expect(r.valid, `convert failed: ${r.error}`).toBe(true);
      const check = validateOnCalendar(r.onCalendar);
      expect(check.error, `“${r.onCalendar}” was rejected: ${check.error}`).toBeUndefined();
      expect(check.valid).toBe(true);
    });
  }

  it('never emits a bare */step, which the validator rejects outright', () => {
    for (const line of ROUND_TRIP_LINES) {
      const { onCalendar } = convert(line);
      expect(onCalendar, line).not.toMatch(/\*\//);
    }
  });

  // @reboot maps to OnBootSec=, not OnCalendar=, so it is deliberately outside
  // the calendar round trip — but its UNITS still have to lint clean.
  it('the @reboot path produces a monotonic timer, not a calendar one', () => {
    const r = convert('@reboot /usr/bin/warm-cache');
    expect(r.valid).toBe(true);
    expect(r.timerUnit).toContain('OnBootSec=1min');
    expect(r.timerUnit).not.toContain('OnCalendar=');
  });
});

describe('round trip — the generated units lint with zero errors', () => {
  for (const line of [...ROUND_TRIP_LINES, '@reboot /usr/bin/warm-cache']) {
    it(`both units from “${line}” are error-free`, () => {
      const r = convert(line, { unitName: 'round-trip' });
      expect(r.valid).toBe(true);

      const timer = lint(r.timerUnit);
      expect(timer.ok, `timer unit was unparseable: ${timer.error}`).toBe(true);
      expect(
        timer.findings.filter((f) => f.severity === 'error'),
        `timer errors: ${timer.findings
          .filter((f) => f.severity === 'error')
          .map((f) => f.title)
          .join(' | ')}`,
      ).toEqual([]);

      const service = lint(r.serviceUnit);
      expect(service.ok, `service unit was unparseable: ${service.error}`).toBe(true);
      expect(
        service.findings.filter((f) => f.severity === 'error'),
        `service errors: ${service.findings
          .filter((f) => f.severity === 'error')
          .map((f) => f.title)
          .join(' | ')}`,
      ).toEqual([]);
    });
  }

  // The generated .service has no [Install] on purpose (the .timer enables it),
  // and the generated .timer sets Persistent=true with an OnCalendar — so the
  // only findings either unit should carry are the ones the converter intends.
  it('the generated .timer carries no warnings at all', () => {
    const r = convert('0 3 * * * /usr/bin/backup.sh', { unitName: 'nightly-backup' });
    const timer = lint(r.timerUnit);
    expect(timer.findings.filter((f) => f.severity !== 'info')).toEqual([]);
  });

  it('a specifier-escaped ExecStart survives the linter’s specifier rule', () => {
    // convert() doubles "%" to "%%"; the linter must read "%%" as a literal
    // percent and NOT report an unknown specifier for it.
    const r = convert('0 3 * * * /usr/bin/foo --out /var/log/b-%Y%m%d.log');
    const service = lint(r.serviceUnit);
    expect(service.findings.filter((f) => f.id === 'unknown-specifier')).toEqual([]);
  });
});

import { describe, expect, it } from 'vitest';
import { convert } from './engine';

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

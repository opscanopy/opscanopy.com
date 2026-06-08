/**
 * Cron to systemd Converter — bundled, runnable examples for the playground.
 *
 * Each example's `cron` is a real crontab line that `convert(cron)` turns into a
 * valid `.timer` + `.service` pair. Together they exercise the interesting
 * mappings the engine handles:
 *
 *   • a fixed daily time           → OnCalendar=*-*-* HH:MM:SS
 *   • a minutely step (* /n)        → OnCalendar=*-*-* *:00/n:00 (Persistent timer)
 *   • an @macro                    → expanded schedule + a note
 *   • named weekdays / ranges      → Mon..Fri day-of-week tokens
 *   • @reboot                      → OnBootSec= (a special, note-bearing case)
 *
 * They double as the empty-state seed and as quick "show me" buttons.
 */

export interface CronExample {
  /** Stable id used by the playground selector. */
  id: string;
  /** Short human label for the example option. */
  label: string;
  /** The crontab line that the engine converts. */
  cron: string;
}

export const examples: CronExample[] = [
  {
    id: 'nightly-backup',
    label: 'Nightly backup (3:00 AM)',
    cron: '0 3 * * * /usr/bin/backup.sh',
  },
  {
    id: 'poll-every-15',
    label: 'Every 15 minutes',
    cron: '*/15 * * * * /opt/poll.sh',
  },
  {
    id: 'daily-cleanup',
    label: '@daily cleanup macro',
    cron: '@daily /opt/cleanup.sh',
  },
  {
    id: 'weekday-report',
    label: 'Weekday mornings (Mon–Fri 9:30)',
    cron: '30 9 * * 1-5 /usr/local/bin/report.sh',
  },
  {
    id: 'monthly-invoice',
    label: '1st of month, hourly window',
    cron: '0 */2 1 * * /usr/bin/invoice --run',
  },
  {
    id: 'reboot-warmup',
    label: '@reboot warm-up (OnBootSec)',
    cron: '@reboot /usr/local/bin/warm-cache.sh',
  },
];

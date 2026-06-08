/**
 * Cron Expression Tester — bundled, runnable examples for the playground.
 *
 * Every `expr` parses cleanly with `explain()` in `engine.ts` and yields a
 * sensible plain-English description plus a list of next fire times. They span
 * the interesting syntax shapes so the playground demonstrates the engine's
 * range:
 *
 *   (a) every 5 minutes            — step on the wildcard minute field
 *   (b) weekday business hours     — a fixed time with a day-of-week range
 *   (c) the @daily macro           — named-macro expansion
 *   (d) the 1st of every month     — a fixed day-of-month at a fixed time
 */

import type { CronExample } from './types';

export const examples: CronExample[] = [
  {
    id: 'every-5-min',
    label: 'Every 5 minutes',
    expr: '*/5 * * * *',
  },
  {
    id: 'weekday-9am',
    label: 'Weekdays at 9:00 AM',
    expr: '0 9 * * 1-5',
  },
  {
    id: 'daily-macro',
    label: 'Once a day (@daily)',
    expr: '@daily',
  },
  {
    id: 'monthly-1st-1415',
    label: '1st of the month at 2:15 PM',
    expr: '15 14 1 * *',
  },
];

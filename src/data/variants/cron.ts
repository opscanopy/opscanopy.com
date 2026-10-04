/**
 * Cron variant pages — one entry per common schedule.
 *
 * The plain-English reading of every expression comes from the engine at
 * module scope (`explain(expr, { timeZone: 'UTC' }).description`), so the prose
 * quotes exactly what the calculator on the page shows. Next-run times are
 * deliberately absent: they depend on the reader's clock and zone, so the
 * playground computes them client-side.
 */
import { explain } from '../../lib/cron-tester/engine';
import type { ToolVariant } from './index';

function said(expr: string): string {
  const r = explain(expr, { timeZone: 'UTC' });
  if (!r.valid) throw new Error(`cron variant ${expr}: engine rejected it (${r.error ?? 'no result'})`);
  return r.description;
}

const dMinute = said('* * * * *');
const d5 = said('*/5 * * * *');
const d15 = said('*/15 * * * *');
const d30 = said('*/30 * * * *');
const dHour = said('0 * * * *');
const dMidnight = said('0 0 * * *');
const dNoon = said('0 12 * * *');
const dWeekday = said('0 9 * * 1-5');
const dMonday = said('0 9 * * 1');
const dSunday = said('0 9 * * 0');
const dWeekly = said('@weekly');
const dMonthly = said('@monthly');
const dYearly = said('@yearly');

/** The one shared sentence: where next runs come from. */
const RUNS =
  "The next run times in the panel above are computed in your browser, in your own timezone, so they are not printed in this text.";

export const cronVariants: ToolVariant[] = [
  {
    slug: 'every-minute',
    input: '* * * * *',
    h1Name: 'Every minute cron',
    headline: 'what * * * * * means and when it is too often',
    title: 'Cron Every Minute (* * * * *) — Explained',
    description:
      'What * * * * * means in cron field by field, a crontab example, overlap locking with flock, and the systemd, Kubernetes and GitHub Actions forms.',
    lede: `\`* * * * *\` fires once at the start of every minute, all day, every day. The engine reads it as: ${dMinute}`,
    sections: [
      {
        heading: 'Reading * * * * * field by field',
        paragraphs: [
          "A standard cron line has five fields in a fixed order: minute, hour, day of month, month and day of week. A bare asterisk means every allowed value of that field, so five asterisks match every minute of every hour of every day. There is no seconds field in classic cron, which makes one minute the shortest interval a crontab can express.",
          `The parser on this page agrees: ${dMinute} ${RUNS}`,
        ],
      },
      {
        heading: 'A crontab line and the overlap problem',
        paragraphs: [
          "A typical entry looks like `* * * * * /usr/local/bin/poll-queue.sh >> /var/log/poll-queue.log 2>&1`. Cron starts the command with a minimal environment, usually a short `PATH` and no shell profile, so use absolute paths and redirect output, otherwise cron tries to mail it to the owner.",
          "The real risk at this frequency is overlap. Cron does not wait for the previous run to finish; if one run takes 70 seconds, two copies are alive at the same time, and a slow day can pile up dozens. Wrap the command in a lock: `* * * * * flock -n /run/lock/poll-queue.lock /usr/local/bin/poll-queue.sh` makes a second copy exit immediately instead of queueing behind the first.",
        ],
      },
      {
        heading: 'systemd, Kubernetes and GitHub Actions',
        paragraphs: [
          "The systemd timer equivalent is `OnCalendar=minutely` (the same as `*-*-* *:*:00`). Timers never start a second instance of a running service, which removes the overlap problem without `flock`, and `AccuracySec=1s` stops systemd from coalescing the start time.",
          "In a Kubernetes CronJob, `schedule: \"* * * * *\"` creates a new Job and Pod every minute; set `concurrencyPolicy: Forbid` so a slow run is skipped rather than doubled, and remember that Pod start-up latency eats into a 60-second budget. GitHub Actions accepts the expression but runs scheduled workflows at most every 5 minutes, and only in UTC.",
        ],
      },
      {
        heading: 'When every minute is the wrong answer',
        paragraphs: [
          "Every-minute jobs are usually polling something that could push an event instead: a queue, a webhook, a file watcher. If the job only needs to react within a few minutes, every 5 minutes cuts the load fivefold; if it runs continuously anyway, a long-running service with its own loop is easier to monitor than 1,440 short processes a day.",
        ],
      },
    ],
    faqs: [
      {
        q: 'Can cron run a job every 30 seconds?',
        a: 'Not with one line, because classic cron has no seconds field. The common workaround is two entries, one plain and one prefixed with sleep 30, or a systemd timer with OnCalendar=*:*:0/30, which does support seconds.',
      },
      {
        q: 'Does * * * * * run at exactly :00 seconds?',
        a: 'Cron wakes up once a minute and starts every matching job close to the top of the minute, but there is no guarantee of the exact second. Several jobs scheduled for the same minute all start together.',
      },
    ],
  },
  {
    slug: 'every-5-minutes',
    input: '*/5 * * * *',
    h1Name: 'Every 5 minutes cron',
    headline: 'what */5 * * * * means and how to run it safely',
    title: 'Cron Every 5 Minutes (*/5 * * * *) — Explained',
    description:
      'How the cron step */5 * * * * works, which minutes it hits, a crontab example with flock, and the systemd, Kubernetes and GitHub Actions equivalents.',
    lede: `\`*/5 * * * *\` fires on every minute divisible by five: :00, :05, :10 and so on to :55. The engine reads it as: ${d5}`,
    sections: [
      {
        heading: 'How the */5 step works',
        paragraphs: [
          "The slash is a step: `*/5` in the minute field means start at the lowest allowed value (0) and take every fifth one, giving minutes 0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50 and 55. The other four fields are asterisks, so that set repeats every hour of every day, for 288 runs per day.",
          `Because the step is anchored to minute 0, not to when you saved the crontab, the runs land on the same wall-clock minutes on every server. The parser on this page reads it as: ${d5} ${RUNS}`,
        ],
      },
      {
        heading: 'Example crontab entry',
        paragraphs: [
          "`*/5 * * * * flock -n /run/lock/sync-feeds.lock /opt/app/bin/sync-feeds >> /var/log/sync-feeds.log 2>&1` runs a sync every five minutes and refuses to start a second copy while the first is still working. Without `flock`, a run that takes six minutes overlaps the next one, and two writers on the same data is how duplicates and lock contention start.",
          "If many servers share the same crontab, they all fire on the same minute. Offsetting the start, for example `2-59/5` on half the fleet, spreads load on the database or API they all call.",
        ],
      },
      {
        heading: 'systemd, Kubernetes and GitHub Actions',
        paragraphs: [
          "systemd writes the same schedule as `OnCalendar=*:0/5`. In Kubernetes, `schedule: \"*/5 * * * *\"` with `concurrencyPolicy: Forbid` and a `startingDeadlineSeconds` of a minute or two gives the same no-overlap behaviour as `flock`.",
          "Five minutes is the shortest interval GitHub Actions allows for `on: schedule`, and GitHub documents that scheduled runs can be delayed or dropped during high load, most often at the top of the hour. Treat it as roughly every five minutes, in UTC, not as a precise timer.",
        ],
      },
      {
        heading: 'Related intervals',
        paragraphs: [
          "Steps only divide evenly when they divide 60. Every 15 minutes and every 30 minutes behave the same way as this one; a step such as `*/7` produces 0, 7, 14 … 56 and then restarts at 0, leaving a four-minute gap every hour. If you need sub-minute polling, look at every minute plus a loop, or a systemd timer with a seconds field.",
        ],
      },
    ],
    faqs: [
      {
        q: 'Is */5 * * * * the same as 0,5,10,15,20,25,30,35,40,45,50,55 * * * *?',
        a: 'Yes. The step form is shorthand for that explicit list, and both match the same twelve minutes in every hour.',
      },
      {
        q: 'Why did my GitHub Actions workflow not run every 5 minutes?',
        a: 'GitHub Actions schedules are best-effort. Runs can be delayed under load and are sometimes skipped, and scheduled workflows in a public repository are disabled after 60 days without repository activity.',
      },
    ],
  },
  {
    slug: 'every-15-minutes',
    input: '*/15 * * * *',
    h1Name: 'Every 15 minutes cron',
    headline: 'what */15 * * * * means, with a quarter-hour crontab example',
    title: 'Cron Every 15 Minutes (*/15 * * * *) — Explained',
    description:
      'What */15 * * * * means in cron: the four quarter-hour runs, a crontab line, timezone and overlap pitfalls, and the systemd and Kubernetes forms.',
    lede: `\`*/15 * * * *\` fires four times an hour, on the quarter hours :00, :15, :30 and :45. The engine reads it as: ${d15}`,
    sections: [
      {
        heading: 'Field by field',
        paragraphs: [
          "The minute field `*/15` steps through 0–59 in fifteens, which yields 0, 15, 30 and 45. Hour, day of month, month and day of week are all asterisks, so the four quarter-hour slots repeat around the clock: 96 runs per day. Writing the list out as `0,15,30,45 * * * *` is identical and some teams prefer it because nobody has to remember how steps are anchored.",
          `The parser on this page reads the expression as: ${d15} ${RUNS}`,
        ],
      },
      {
        heading: 'A quarter-hour job in a crontab',
        paragraphs: [
          "A common use is collecting metrics or rotating short-lived caches: `*/15 * * * * /usr/local/bin/export-usage --since 15m >> /var/log/export-usage.log 2>&1`. Notice the job asks for the last 15 minutes of data. If one run fails or the host is down, that window is lost; a job that records the last timestamp it processed recovers by itself.",
          "Remember that `%` is special in a crontab line (it becomes a newline), so a `date +%F` inside the command must be written `date +\\%F`.",
        ],
      },
      {
        heading: 'Timezones and overlap',
        paragraphs: [
          "Interval schedules such as this one are the least affected by daylight saving time: when the clocks jump forward an hour, the four runs of the skipped hour simply never happen, and on the fall-back day the repeated hour usually produces four extra runs. A job that sums usage per run will double-count that hour unless it works from timestamps.",
          "If a run can take longer than 15 minutes, guard it with `flock -n` or, in a Kubernetes CronJob, `concurrencyPolicy: Forbid`. `Replace` is the other option there: it kills the running Job and starts the new one, which suits jobs where only the freshest result matters.",
        ],
      },
      {
        heading: 'systemd and GitHub Actions',
        paragraphs: [
          "The systemd timer form is `OnCalendar=*:0/15`, optionally with `RandomizedDelaySec=60` to stop a fleet hitting a shared service in the same second. In GitHub Actions, `cron: '*/15 * * * *'` is valid and is evaluated in UTC; for a related but lighter schedule, every 30 minutes halves the runs, and every 5 minutes triples them.",
        ],
      },
    ],
    faqs: [
      {
        q: 'Can I run every 15 minutes but only during working hours?',
        a: 'Yes. Restrict the hour and day-of-week fields, for example */15 9-17 * * 1-5 runs on the quarter hours from 09:00 to 17:45, Monday to Friday, in the timezone the cron daemon uses.',
      },
      {
        q: 'How do I start at :05 instead of :00?',
        a: 'Give the step a starting point: 5-59/15 * * * * runs at :05, :20, :35 and :50.',
      },
    ],
  },
  {
    slug: 'every-30-minutes',
    input: '*/30 * * * *',
    h1Name: 'Every 30 minutes cron',
    headline: 'what */30 * * * * means and the half-hour pitfalls',
    title: 'Cron Every 30 Minutes (*/30 * * * *) — Explained',
    description:
      'What */30 * * * * means: runs on the hour and half hour. Crontab example, DST and overlap pitfalls, and systemd, Kubernetes and GitHub Actions forms.',
    lede: `\`*/30 * * * *\` fires twice an hour, at :00 and :30, which is 48 runs a day. The engine reads it as: ${d30}`,
    sections: [
      {
        heading: 'What */30 actually matches',
        paragraphs: [
          "In the minute field, `*/30` starts at 0 and adds 30, so it matches minutes 0 and 30 and nothing else. It is exactly the same as `0,30 * * * *`. The remaining fields are wildcards, so there is no restriction on hour, date, month or weekday.",
          `The parser on this page agrees: ${d30} ${RUNS}`,
          "A frequent mistake is to read `*/30` as thirty minutes after the job last ran. Cron has no memory of previous runs: the schedule is a pattern over wall-clock minutes, and a crontab edited at 10:17 still fires next at 10:30.",
        ],
      },
      {
        heading: 'Example and locking',
        paragraphs: [
          "`*/30 * * * * flock -n /run/lock/reindex.lock nice -n 10 /opt/search/bin/reindex-delta` is a typical half-hourly maintenance job: `flock` stops a slow run overlapping the next, and `nice` keeps it from competing with request-serving processes. Half-hourly jobs often grow slowly until one day they take 31 minutes; the lock turns that from a pile-up into a skipped run you can alert on.",
        ],
      },
      {
        heading: 'Daylight saving and the server clock',
        paragraphs: [
          "Cron evaluates the expression in the cron daemon's timezone, which is normally the server's local zone (`/etc/localtime`) unless the crontab sets `CRON_TZ`. On the spring-forward night one hour disappears and its two runs with it; on the fall-back night the repeated hour can run twice more. Servers set to UTC avoid both, which is why many teams keep infrastructure clocks on UTC and convert only in reports.",
        ],
      },
      {
        heading: 'systemd, Kubernetes and GitHub Actions',
        paragraphs: [
          "systemd: `OnCalendar=*:0/30`, or the explicit `*-*-* *:00,30:00`. Kubernetes accepts `schedule: \"*/30 * * * *\"` and, since version 1.27, a `timeZone` field such as `Europe/Berlin` if the half hours must follow a local clock. GitHub Actions runs it in UTC only. Related schedules: every 15 minutes doubles the frequency, every hour halves it.",
        ],
      },
    ],
    faqs: [
      {
        q: 'How do I run every 30 minutes at :15 and :45?',
        a: 'Use an explicit list, 15,45 * * * *, or a step with a start, 15-59/30 * * * *. Both match the same two minutes.',
      },
      {
        q: 'Can */45 run every 45 minutes?',
        a: 'No. */45 matches minutes 0 and 45, so the gaps alternate between 45 and 15 minutes. A true 45-minute interval needs a systemd timer with OnUnitActiveSec=45min or a scheduler outside cron.',
      },
    ],
  },
  {
    slug: 'every-hour',
    input: '0 * * * *',
    h1Name: 'Every hour cron',
    headline: 'what 0 * * * * means and why the top of the hour is crowded',
    title: 'Cron Every Hour (0 * * * *) — Explained',
    description:
      'What the hourly cron expression 0 * * * * means, how it differs from * */1 * * *, a crontab example, and its systemd, Kubernetes and GitHub Actions forms.',
    lede: `\`0 * * * *\` fires once an hour, at minute zero. The engine reads it as: ${dHour}`,
    sections: [
      {
        heading: 'Reading 0 * * * *',
        paragraphs: [
          "The minute field is a literal `0` and every other field is a wildcard, so the job runs at minute 0 of every hour: 24 times a day. The macro `@hourly` means the same thing in Vixie cron, cronie and Kubernetes.",
          `The parser on this page reads it as: ${dHour} ${RUNS}`,
          "The classic mistake is `* */1 * * *`. That puts the wildcard in the minute field, so it matches every minute of every hour, sixty runs an hour instead of one. The hour step is redundant; the minute field is the one that has to be pinned.",
        ],
      },
      {
        heading: 'A crontab line',
        paragraphs: [
          "`0 * * * * /usr/bin/logrotate /etc/logrotate.d/app-hourly` is a typical hourly job. If the work can take longer than an hour, guard it with `flock -n /run/lock/app-hourly.lock` in front of the command so the next run exits instead of overlapping.",
        ],
      },
      {
        heading: 'The top of the hour is crowded',
        paragraphs: [
          "Minute 0 is the most popular minute in every crontab. Backups, report jobs, certificate checks and cache refreshes all land there, and on shared infrastructure that turns into a load spike every hour. GitHub explicitly warns that scheduled workflows are most likely to be delayed or dropped at the start of an hour. Picking an odd minute, such as `17 * * * *`, keeps the hourly cadence and dodges the queue.",
          "Daylight saving affects hourly jobs mildly: the skipped hour loses one run and the repeated hour may run twice, depending on the cron implementation. If each run processes the previous hour of data, compute the window from UTC timestamps rather than from the local clock.",
        ],
      },
      {
        heading: 'systemd, Kubernetes and GitHub Actions',
        paragraphs: [
          "The systemd timer is `OnCalendar=hourly`, the same as `*-*-* *:00:00`; add `Persistent=true` if a run missed while the machine was off should happen at the next boot. Kubernetes accepts both `0 * * * *` and `@hourly`. GitHub Actions accepts `0 * * * *` in UTC but does not support the `@hourly` macro. Neighbouring schedules: every 30 minutes doubles the runs, every day at midnight reduces them to one.",
        ],
      },
    ],
    faqs: [
      {
        q: 'What is the difference between 0 * * * * and @hourly?',
        a: 'None in cron implementations that support macros: @hourly is defined as 0 * * * *. GitHub Actions does not accept the macro, so use the five-field form there.',
      },
      {
        q: 'How do I run every 2 hours?',
        a: 'Pin the minute and step the hour: 0 */2 * * * runs at 00:00, 02:00, 04:00 and so on.',
      },
    ],
  },
  {
    slug: 'every-day-at-midnight',
    input: '0 0 * * *',
    h1Name: 'Every day at midnight cron',
    headline: 'what 0 0 * * * means and whose midnight it is',
    title: 'Cron Every Day at Midnight (0 0 * * *) — Explained',
    description:
      'What 0 0 * * * means: a daily run at 00:00 in the server timezone. Crontab example, UTC vs local time, and systemd, Kubernetes and GitHub Actions forms.',
    lede: `\`0 0 * * *\` fires once a day at 00:00. The engine reads it as: ${dMidnight}`,
    sections: [
      {
        heading: 'Field by field',
        paragraphs: [
          "Minute `0` and hour `0` pin the time to 00:00; day of month, month and day of week are wildcards, so it runs every day of the year. The macros `@daily` and `@midnight` are defined as exactly this expression in cron implementations that support them.",
          `The parser on this page reads it as: ${dMidnight} ${RUNS}`,
        ],
      },
      {
        heading: 'Whose midnight?',
        paragraphs: [
          "Cron runs in the timezone of the cron daemon, normally the server's system zone. On a cloud VM or a container image that is very often UTC, so a nightly job written for local midnight in India actually runs at 05:30 IST, and one meant for New York runs at 19:00 or 20:00 the previous evening depending on daylight saving. Check with `timedatectl` or `date`, and set `CRON_TZ=` in the crontab if your cron supports it.",
          "GitHub Actions schedules are always UTC, and Kubernetes CronJobs use the controller's zone unless the `timeZone` field is set (stable since Kubernetes 1.27).",
        ],
      },
      {
        heading: 'Example and pitfalls',
        paragraphs: [
          "`0 0 * * * flock -n /run/lock/nightly-backup.lock /usr/local/bin/backup.sh >> /var/log/backup.log 2>&1` is the textbook nightly backup. Midnight is crowded: log rotation, certificate renewals and every other daily job tend to pile up there, so shifting non-urgent work to an odd minute, such as `23 2 * * *`, spreads the load. If the job builds a report for the previous day, compute that date explicitly rather than assuming the job always starts after midnight; a delayed run that slips can process the wrong day.",
          "Midnight is outside the 01:00–03:00 window where most zones change their clocks, so daylight saving rarely skips or repeats this run, but a few zones do switch at midnight.",
        ],
      },
      {
        heading: 'systemd, Kubernetes and GitHub Actions',
        paragraphs: [
          "systemd: `OnCalendar=daily`, the same as `*-*-* 00:00:00`; `Persistent=true` catches up a run missed while the host was off, which plain cron does not do (anacron exists for that). Kubernetes accepts `0 0 * * *` or `@daily`; GitHub Actions needs the five-field form. For a daytime equivalent see every day at noon.",
        ],
      },
    ],
    faqs: [
      {
        q: 'Is 0 0 * * * the same as @daily and @midnight?',
        a: 'Yes, in cron implementations that support macros both are defined as 0 0 * * *. GitHub Actions does not accept macros.',
      },
      {
        q: 'My midnight job runs at the wrong hour. Why?',
        a: 'The cron daemon uses the server timezone, which is often UTC on cloud hosts and containers. Either convert your local midnight to UTC or set CRON_TZ, or the timeZone field on a Kubernetes CronJob.',
      },
    ],
  },
  {
    slug: 'every-day-at-noon',
    input: '0 12 * * *',
    h1Name: 'Every day at noon cron',
    headline: 'what 0 12 * * * means and how to schedule a midday job',
    title: 'Cron Every Day at Noon (0 12 * * *) — Explained',
    description:
      'What 0 12 * * * means in cron: a daily run at 12:00. Field-by-field reading, a crontab example, timezone conversion and systemd, Kubernetes, GitHub forms.',
    lede: `\`0 12 * * *\` fires once a day at 12:00 in the cron daemon's timezone. The engine reads it as: ${dNoon}`,
    sections: [
      {
        heading: 'Reading 0 12 * * *',
        paragraphs: [
          "Cron hours run 0–23, so `12` is noon and midnight is `0`; there is no AM/PM. Minute `0` pins the start to the top of that hour, and the wildcard date fields make it daily. Writing `0 0 12 * *` by mistake puts the 12 in the day-of-month field and runs once a month, on the 12th, at midnight; field order matters more than anything else in cron.",
          `The parser on this page reads it as: ${dNoon} ${RUNS}`,
        ],
      },
      {
        heading: 'A midday job in practice',
        paragraphs: [
          "Midday schedules usually exist for people rather than machines: a lunchtime digest email, a status report posted to a chat channel, a reminder. `0 12 * * * /opt/bots/standup-digest --channel ops >> /var/log/digest.log 2>&1` is a typical line. Because the audience is human, the timezone matters more than for a backup, and noon on a UTC server is 17:30 in India and 08:00 or 07:00 in New York depending on daylight saving.",
          "Noon is also safely clear of every daylight saving transition, so the run is never skipped or repeated; it just moves by an hour relative to UTC twice a year if the server follows local time.",
        ],
      },
      {
        heading: 'Running the same job twice a day',
        paragraphs: [
          "Hours accept lists, so `0 0,12 * * *` runs at midnight and noon, and `0 */12 * * *` is the same thing. If the job might still be running when the next one starts, the usual guard applies: `flock -n /run/lock/digest.lock` before the command.",
        ],
      },
      {
        heading: 'systemd, Kubernetes and GitHub Actions',
        paragraphs: [
          "systemd: `OnCalendar=*-*-* 12:00:00`, and a timer can name its zone directly, for example `OnCalendar=*-*-* 12:00:00 Europe/London`. Kubernetes uses `schedule: \"0 12 * * *\"` with an optional `timeZone`. GitHub Actions treats `0 12 * * *` as 12:00 UTC. Related: every day at midnight, and every weekday at 09:00 if the job should skip weekends.",
        ],
      },
    ],
    faqs: [
      {
        q: 'How do I write noon on weekdays only?',
        a: 'Restrict the day-of-week field: 0 12 * * 1-5 runs at 12:00 Monday to Friday.',
      },
      {
        q: 'Does cron understand 12pm?',
        a: 'No. Cron uses a 24-hour clock with hours 0 to 23, so noon is 12, 1pm is 13 and midnight is 0.',
      },
    ],
  },
  {
    slug: 'every-weekday',
    input: '0 9 * * 1-5',
    h1Name: 'Every weekday cron',
    headline: 'what 0 9 * * 1-5 means and how to skip weekends',
    title: 'Cron Every Weekday (0 9 * * 1-5) — Explained',
    description:
      'What 0 9 * * 1-5 means: 09:00 Monday to Friday. Day-of-week numbering, the day-of-month OR rule, a crontab example and systemd and Kubernetes forms.',
    lede: `\`0 9 * * 1-5\` fires at 09:00 on Monday, Tuesday, Wednesday, Thursday and Friday, and never at the weekend. The engine reads it as: ${dWeekday}`,
    sections: [
      {
        heading: 'Field by field',
        paragraphs: [
          "Minute `0`, hour `9` and a day-of-week range `1-5`. Cron numbers weekdays from Sunday: 0 is Sunday, 1 is Monday through 6 Saturday, and most implementations also accept 7 for Sunday. Names work too, so `0 9 * * MON-FRI` is the same schedule and easier to read in review.",
          `The parser on this page reads it as: ${dWeekday} ${RUNS}`,
        ],
      },
      {
        heading: 'The day-of-month trap',
        paragraphs: [
          "Leave the day-of-month field as `*` here. When both day of month and day of week are restricted, Vixie-derived crons run the job if either matches, not when both do. So `0 9 1-7 * 1` does not mean the first Monday of the month; it means every day from the 1st to the 7th and every Monday. The first-Monday idiom needs a guard in the command, such as `[ \"$(date +\\%d)\" -le 7 ] &&` before it.",
        ],
      },
      {
        heading: 'Example, holidays and timezones',
        paragraphs: [
          "`0 9 * * 1-5 /opt/reports/bin/daily-kpis --email team@example.com` is a typical business-hours job. Cron knows nothing about public holidays; if the job should skip them, have the script check a holiday list and exit early.",
          "Weekday schedules are where the server timezone bites hardest, because the hour and the day both depend on it. 09:00 UTC on Monday is already 14:30 in India and still 05:00 or 04:00 in New York. If the job is meant for a local morning, set `CRON_TZ`, the Kubernetes `timeZone` field or the zone suffix on a systemd timer rather than doing the conversion in your head; a conversion that crosses midnight also shifts the weekday range.",
        ],
      },
      {
        heading: 'systemd, Kubernetes and GitHub Actions',
        paragraphs: [
          "systemd: `OnCalendar=Mon..Fri *-*-* 09:00:00`. Kubernetes: `schedule: \"0 9 * * 1-5\"`, with `concurrencyPolicy: Forbid` if a run might overlap. GitHub Actions runs `0 9 * * 1-5` at 09:00 UTC, Monday to Friday UTC. For a single day see every Monday; for weekends only, use `0 9 * * 0,6`.",
        ],
      },
    ],
    faqs: [
      {
        q: 'Is 1-5 Monday to Friday in every cron?',
        a: 'Yes for standard 5-field cron, where 0 is Sunday. Quartz-style schedulers used by some Java tools number days 1 to 7 starting at Sunday, so check which syntax your scheduler expects.',
      },
      {
        q: 'How do I run every hour during weekday working hours?',
        a: 'Use a range in the hour field: 0 9-17 * * 1-5 runs on the hour from 09:00 to 17:00, Monday to Friday.',
      },
    ],
  },
  {
    slug: 'every-monday',
    input: '0 9 * * 1',
    h1Name: 'Every Monday cron',
    headline: 'what 0 9 * * 1 means for a start-of-week job',
    title: 'Cron Every Monday (0 9 * * 1) — Explained',
    description:
      'What 0 9 * * 1 means: 09:00 every Monday. Day numbering, the first-Monday trap, a crontab example and the systemd, Kubernetes and GitHub Actions forms.',
    lede: `\`0 9 * * 1\` fires once a week, at 09:00 on Monday. The engine reads it as: ${dMonday}`,
    sections: [
      {
        heading: 'Reading 0 9 * * 1',
        paragraphs: [
          "The first two fields pin the time to 09:00, the date fields are wildcards, and the day-of-week field is `1`, which is Monday in standard cron (0 and 7 are Sunday). `MON` is accepted in place of `1` by the common implementations and by this page's parser.",
          `The parser reads it as: ${dMonday} ${RUNS}`,
        ],
      },
      {
        heading: 'What Monday jobs are for',
        paragraphs: [
          "Start-of-week jobs typically summarise the previous seven days: dependency update reports, cost reports, stale-branch cleanups, on-call handover notes. `0 9 * * 1 /opt/finops/bin/weekly-cost-report --window 7d` is a representative line. Compute the reporting window from explicit dates, not from now minus seven days, so a delayed or retried run still reports the same week.",
          "A weekly job fails silently more easily than a frequent one: if it breaks, nobody notices for a week. Send its exit status somewhere, or use a dead-man's-switch check that alerts when the Monday ping does not arrive.",
        ],
      },
      {
        heading: 'Pitfalls: first Monday and timezones',
        paragraphs: [
          "Adding a day of month does not narrow it down. `0 9 1-7 * 1` runs on the 1st to the 7th of every month and on every Monday, because cron combines a restricted day of month and day of week with OR. For the first Monday only, keep `0 9 * * 1` and let the command exit unless the date is 7 or lower.",
          "The weekday is evaluated in the cron daemon's zone. A job at 09:00 Monday in Sydney is 22:00 or 23:00 on Sunday in UTC, so converting the hour for a UTC server, or for GitHub Actions, can move the job to a different day as well.",
        ],
      },
      {
        heading: 'systemd, Kubernetes and GitHub Actions',
        paragraphs: [
          "systemd: `OnCalendar=Mon *-*-* 09:00:00`; note that systemd's own `weekly` shorthand also means Monday, but at 00:00. Kubernetes accepts `schedule: \"0 9 * * 1\"` with an optional `timeZone`. GitHub Actions runs it at 09:00 UTC on Monday. Related: every weekday for Monday to Friday, every Sunday for the end of the week.",
        ],
      },
    ],
    faqs: [
      {
        q: 'Can I write MON instead of 1?',
        a: 'Yes. Vixie cron, cronie, Kubernetes and GitHub Actions all accept three-letter day names, so 0 9 * * MON is the same schedule.',
      },
      {
        q: 'How do I run every other Monday?',
        a: 'Cron cannot express a two-week interval. Schedule it every Monday and have the command exit on odd ISO week numbers, for example by testing date +%V (written with a backslash before the percent sign inside a crontab).',
      },
    ],
  },
  {
    slug: 'every-sunday',
    input: '0 9 * * 0',
    h1Name: 'Every Sunday cron',
    headline: 'what 0 9 * * 0 means and why Sunday is 0 and 7',
    title: 'Cron Every Sunday (0 9 * * 0) — Explained',
    description:
      'What 0 9 * * 0 means: 09:00 every Sunday. Why Sunday is both 0 and 7, maintenance-window examples, and systemd, Kubernetes and GitHub Actions forms.',
    lede: `\`0 9 * * 0\` fires once a week, at 09:00 on Sunday. The engine reads it as: ${dSunday}`,
    sections: [
      {
        heading: 'Sunday is 0 (and usually 7)',
        paragraphs: [
          "Standard cron numbers the week from Sunday = 0 to Saturday = 6. Most implementations, including Vixie cron and cronie, also accept 7 as Sunday so that ranges like `1-7` read naturally as Monday to Sunday. `0 9 * * 0`, `0 9 * * 7` and `0 9 * * SUN` are therefore the same schedule on those systems; `0` is the most portable choice.",
          `The parser on this page reads the expression as: ${dSunday} ${RUNS}`,
        ],
      },
      {
        heading: 'Sunday maintenance windows',
        paragraphs: [
          "Sunday morning is a traditional low-traffic slot for heavier maintenance: database `VACUUM` or index rebuilds, full backups, OS patching with a reboot. `0 9 * * 0 flock -n /run/lock/weekly-maint.lock /opt/ops/bin/weekly-maintenance >> /var/log/weekly-maint.log 2>&1` is a typical shape. Long jobs are exactly the ones that overlap, so the lock earns its place even on a weekly schedule.",
          "Low traffic for your users depends on where they are. 09:00 Sunday UTC is Sunday afternoon in Asia and Sunday early morning in the Americas, so pick the hour from your traffic graphs, not from the calendar.",
        ],
      },
      {
        heading: 'Timezone and daylight saving',
        paragraphs: [
          "Many zones change their clocks on a Sunday, typically in the early hours. A job at 09:00 is clear of the transition itself, but if the server follows local time the run moves an hour relative to UTC on those weekends. If it has to line up with something scheduled in UTC, such as a provider's maintenance window or a GitHub Actions workflow, keep the server on UTC or pin the zone with `CRON_TZ` or a Kubernetes `timeZone`.",
        ],
      },
      {
        heading: 'systemd, Kubernetes and GitHub Actions',
        paragraphs: [
          "systemd: `OnCalendar=Sun *-*-* 09:00:00`. Kubernetes: `schedule: \"0 9 * * 0\"`. GitHub Actions accepts `0 9 * * 0` and runs it at 09:00 UTC. If you want Sunday at midnight instead, that is what the `@weekly` macro means; every Monday is the start-of-week counterpart.",
        ],
      },
    ],
    faqs: [
      {
        q: 'Should I use 0 or 7 for Sunday?',
        a: 'Use 0. It is defined by POSIX cron and accepted everywhere, while 7 is a common extension that some minimal cron implementations reject.',
      },
      {
        q: 'How do I run on both Saturday and Sunday?',
        a: 'List both days in the day-of-week field: 0 9 * * 0,6, or 0 9 * * SAT,SUN.',
      },
    ],
  },
  {
    slug: 'every-week',
    input: '@weekly',
    h1Name: 'Every week cron',
    headline: 'what @weekly means and where the macro is not supported',
    title: 'Cron Every Week (@weekly) — Explained',
    description:
      'What the cron macro @weekly means: 00:00 every Sunday, the same as 0 0 * * 0. Where macros work, where they fail, and the systemd Monday difference.',
    lede: `\`@weekly\` is shorthand for \`0 0 * * 0\`, a run at midnight at the start of Sunday. The engine expands it and reads it as: ${dWeekly}`,
    sections: [
      {
        heading: 'What the macro expands to',
        paragraphs: [
          "Vixie cron introduced a handful of named schedules that replace the five fields: `@yearly`, `@monthly`, `@weekly`, `@daily`, `@hourly` and `@reboot`. `@weekly` is defined as `0 0 * * 0`: minute 0, hour 0, any day of month, any month, day of week 0, which is Sunday. Writing the five fields out gives exactly the same schedule.",
          `This page's parser expands the macro before describing it, which is why its reading is: ${dWeekly} ${RUNS}`,
        ],
      },
      {
        heading: 'Where @weekly works and where it does not',
        paragraphs: [
          "Cronie and Vixie cron (the cron on most Linux distributions) and Kubernetes CronJobs accept the macro. GitHub Actions does not: its documentation lists the `@` shorthands as unsupported, so a workflow needs `cron: '0 0 * * 0'`. Some minimal crons in embedded systems and small container images do not understand macros either. The five-field form is the portable one; the macro is easier to read.",
          "systemd timers have their own shorthand `OnCalendar=weekly`, and it is not the same schedule: systemd defines it as `Mon *-*-* 00:00:00`, Monday at midnight. Porting a crontab line to a timer by name silently moves the job by a day; write `OnCalendar=Sun *-*-* 00:00:00` to keep cron's meaning.",
        ],
      },
      {
        heading: 'Example and pitfalls',
        paragraphs: [
          "`@weekly /usr/sbin/fstrim -av` is a classic weekly housekeeping line. Midnight on Sunday is when a lot of other weekly jobs also run, and in the server's zone, which on a cloud host is often UTC rather than the team's local time. Long weekly jobs should take a lock (`flock -n /run/lock/fstrim.lock`) and report their exit status, because a weekly failure can go unseen for a long time.",
          "Plain cron does not catch up: if the host is off at midnight on Sunday, that week's run is lost. anacron, or a systemd timer with `Persistent=true`, runs it at the next boot instead.",
        ],
      },
      {
        heading: 'Related schedules',
        paragraphs: [
          "If the job should run in working hours, every Sunday at 09:00 or every Monday at 09:00 are the common alternatives. `@monthly` and `@yearly` are the next macros up; `@daily` (also spelled `@midnight`) is the one below.",
        ],
      },
    ],
    faqs: [
      {
        q: 'Is @weekly Sunday or Monday?',
        a: 'In cron, @weekly is Sunday at 00:00 (0 0 * * 0). In systemd, OnCalendar=weekly is Monday at 00:00, so the two shorthands differ by a day.',
      },
      {
        q: 'Can I use @weekly in a GitHub Actions schedule?',
        a: 'No. GitHub Actions rejects the @ shorthands; use the equivalent five-field expression 0 0 * * 0, which runs at 00:00 UTC on Sunday.',
      },
    ],
  },
  {
    slug: 'every-month',
    input: '@monthly',
    h1Name: 'Every month cron',
    headline: 'what @monthly means and why the 31st is a trap',
    title: 'Cron Every Month (@monthly) — Explained',
    description:
      'What the cron macro @monthly means: 00:00 on the 1st, the same as 0 0 1 * *. Why the 31st skips months, last-day workarounds, and systemd and GitHub forms.',
    lede: `\`@monthly\` is shorthand for \`0 0 1 * *\`, a run at midnight on the first day of every month. The engine expands it and reads it as: ${dMonthly}`,
    sections: [
      {
        heading: 'What @monthly expands to',
        paragraphs: [
          "The macro is defined as `0 0 1 * *`: minute 0, hour 0, day of month 1, every month, any day of week. Twelve runs a year, each at the very start of the month in the cron daemon's timezone.",
          `This page's parser expands the macro and reads it as: ${dMonthly} ${RUNS}`,
        ],
      },
      {
        heading: 'Why the 1st, and the 31st trap',
        paragraphs: [
          "Day 1 exists in every month, which is why the macro uses it. A hand-written `0 0 31 * *` only fires in the seven months that have a 31st, and `0 0 30 * *` never runs in February. Cron does not roll over to the last day of a shorter month.",
          "Standard cron has no last-day-of-month syntax (`L` belongs to Quartz, and this page's parser does not accept it). The usual workaround runs on days 28–31 and lets the command check whether tomorrow is the 1st: `0 0 28-31 * * [ \"$(date -d tomorrow +\\%d)\" = 01 ] && /opt/billing/bin/close-month` with GNU date. Often the simpler fix is to run on the 1st and process the previous month, which is exactly what `@monthly` gives you.",
        ],
      },
      {
        heading: 'Example and operational pitfalls',
        paragraphs: [
          "`@monthly /opt/billing/bin/invoice-run --period previous-month` is the classic use: invoicing, monthly reports, archive rotation. Because the run is rare, a failure is costly; take a lock (`flock -n`), make the job idempotent so it can be re-run by hand for the same period, and alert on its exit status.",
          "Midnight on the 1st is midnight in the server's zone. On a UTC host, a team in the Americas sees the job run on the evening of the last day of the previous month, local time, which matters when the job decides which month it is closing. Name the period explicitly instead of deriving it from the current local date.",
        ],
      },
      {
        heading: 'systemd, Kubernetes and GitHub Actions',
        paragraphs: [
          "systemd's `OnCalendar=monthly` matches cron here: `*-*-01 00:00:00`. Kubernetes CronJobs accept `@monthly` or `0 0 1 * *`. GitHub Actions does not support the macro, so a workflow uses `cron: '0 0 1 * *'`, evaluated in UTC. Related macros: `@weekly` below and `@yearly` above.",
        ],
      },
    ],
    faqs: [
      {
        q: 'How do I run on the last day of every month?',
        a: 'Standard cron cannot express it directly. Schedule 0 0 28-31 * * and have the command exit unless the next day is the 1st, or run on the 1st and process the month that just ended.',
      },
      {
        q: 'Is @monthly the same as 0 0 1 * *?',
        a: 'Yes. In cron implementations that support macros, @monthly is defined as 0 0 1 * *. GitHub Actions only accepts the five-field form.',
      },
    ],
  },
  {
    slug: 'every-year',
    input: '@yearly',
    h1Name: 'Every year cron',
    headline: 'what @yearly means and whether you should rely on it',
    title: 'Cron Every Year (@yearly) — Explained',
    description:
      'What the cron macros @yearly and @annually mean: 00:00 on 1 January, the same as 0 0 1 1 *. Portability, the risks of yearly jobs and systemd equivalents.',
    lede: `\`@yearly\` (also spelled \`@annually\`) is shorthand for \`0 0 1 1 *\`, a single run at midnight on 1 January. The engine expands it and reads it as: ${dYearly}`,
    sections: [
      {
        heading: 'What @yearly expands to',
        paragraphs: [
          "Minute 0, hour 0, day of month 1, month 1, any day of week: `0 0 1 1 *`. The month field can also be written by name, so `0 0 1 JAN *` is the same schedule. `@annually` is an exact synonym.",
          `This page's parser expands the macro and reads it as: ${dYearly} ${RUNS}`,
        ],
      },
      {
        heading: 'Should a job run once a year?',
        paragraphs: [
          "Yearly cron entries exist for things like archiving the previous year's logs, rotating a long-lived key, or resetting annual counters. They are also the entries most likely to fail unnoticed: the server may have been rebuilt, the script's dependencies upgraded or the crontab dropped during a migration since the last run, and nobody will see the result until the next January.",
          "Treat a yearly job like a manual runbook with a reminder attached. Make it idempotent and runnable by hand for a named year (`/opt/ops/bin/archive-year 2025`), log loudly, and have something outside the host, such as a dead-man's-switch check, alert if the run does not report in. For certificates and keys, expiry monitoring is safer than a yearly rotation job.",
        ],
      },
      {
        heading: 'New Year in which timezone?',
        paragraphs: [
          "Midnight on 1 January is midnight in the cron daemon's zone. On a UTC server that is 05:30 on 1 January in India and still the evening of 31 December in the Americas, which matters if the job decides which year it is closing. Pass the year explicitly, or keep the server on UTC and make the job's notion of a year UTC as well.",
          "Plain cron does not catch up: if the machine is off at that minute, the year's only run is lost. A systemd timer with `Persistent=true`, or anacron, runs it at the next boot.",
        ],
      },
      {
        heading: 'systemd, Kubernetes and GitHub Actions',
        paragraphs: [
          "systemd's `OnCalendar=yearly` (or `annually`) is `*-01-01 00:00:00`, the same moment as cron's. Kubernetes accepts `@yearly`, `@annually` or `0 0 1 1 *`. GitHub Actions requires the five-field form, `cron: '0 0 1 1 *'`, in UTC, and a scheduled workflow in a public repository with no activity for 60 days is disabled, which a once-a-year job will certainly hit. Related macros: `@monthly` and `@weekly`.",
        ],
      },
    ],
    faqs: [
      {
        q: 'What is the difference between @yearly and @annually?',
        a: 'None. Both are defined as 0 0 1 1 *, midnight on 1 January, in every cron implementation that supports macros.',
      },
      {
        q: 'Can I schedule a yearly job on a date other than 1 January?',
        a: 'Yes, with the five-field form. For example 0 3 15 4 * runs at 03:00 on 15 April every year.',
      },
    ],
  },
];

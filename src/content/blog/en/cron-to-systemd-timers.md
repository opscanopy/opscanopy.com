---
title: "Migrating from cron to systemd timers"
description: "A practical guide to converting crontab entries into systemd .timer and .service units — OnCalendar syntax, logging, randomized delays, catch-up runs, and the gotchas that bite during migration."
pubDate: 2026-05-20
tags: ["systemd", "cron", "linux"]
relatedTool:
  name: "Cron to systemd Converter"
  href: "/cron-to-systemd"
---

![Migrating from cron to systemd timers: converting crontab entries to .timer and .service units](/blog/cron-to-systemd-timers-hero.svg)

Cron has run the world’s scheduled jobs for forty years, and on most servers it still works fine. But the moment a job needs structured logging, a controlled environment, dependency ordering, or a way to catch up after the machine was off, the cron model starts to creak. That’s where systemd timers come in — and if your distribution already runs systemd (Debian, Ubuntu, RHEL, Fedora, Arch, SUSE all do), you have a more capable scheduler sitting unused.

This post walks through what actually changes when you migrate, with real units you can adapt.

## Why bother moving off cron

Cron is a single line. That brevity is its appeal and its ceiling:

- **Logging.** A cron job’s output goes wherever you redirect it, and if you forget, it’s emailed to a mailbox nobody reads. A systemd service writes to the journal automatically — `journalctl -u myjob.service` shows you every run, with timestamps and exit codes.
- **Environment.** Cron runs with a deliberately minimal `PATH` and almost no environment, which is the classic “works in my shell, fails in cron” trap. A service unit declares its environment explicitly.
- **Missed runs.** If the host is asleep or powered off at the scheduled minute, cron simply skips the job. A timer with `Persistent=true` runs it as soon as the machine is back.
- **Overlap and resources.** systemd won’t start a second copy of a job while the first is still running, and you can attach `CPUQuota=`, `MemoryMax=`, and other resource controls to a unit.

You don’t need to migrate everything. But for jobs where a silent failure costs you, timers are worth the two files they require.

![A crontab line mapped to a systemd .timer unit with OnCalendar and a .service unit with ExecStart](/blog/cron-to-systemd-timers-diagram.svg)

## The two-file model

A cron line does scheduling and execution in one place. systemd splits this into a **service** (what to run) and a **timer** (when to run it). They share a base name.

Take this crontab entry — run a backup script every day at 02:30:

```cron
30 2 * * * /usr/local/bin/backup.sh
```

That becomes two units in `/etc/systemd/system/`.

The service, `backup.service`:

```ini
[Unit]
Description=Nightly backup
Wants=network-online.target
After=network-online.target

[Service]
Type=oneshot
ExecStart=/usr/local/bin/backup.sh
```

The timer, `backup.timer`:

```ini
[Unit]
Description=Run nightly backup at 02:30

[Timer]
OnCalendar=*-*-* 02:30:00
Persistent=true

[Install]
WantedBy=timers.target
```

`Type=oneshot` tells systemd the job is expected to run, finish, and exit — the right type for almost every cron-style task. The timer’s `[Install]` section is what makes `systemctl enable` work; without `WantedBy=timers.target`, the timer won’t arm at boot.

Enable and start it:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now backup.timer
```

Note you enable the **timer**, not the service. The timer pulls in the service when it fires.

## Translating the schedule: OnCalendar

The hardest part of the migration is the schedule field, because systemd uses `OnCalendar=` rather than the five cron fields. The format is `DOW YYYY-MM-DD HH:MM:SS`, and it’s genuinely more readable once you learn it. Some common mappings:

```text
# cron                        # OnCalendar
*/15 * * * *                  *-*-* *:0/15:00      (every 15 minutes)
0 * * * *                     *-*-* *:00:00        (hourly, on the hour)
30 2 * * *                    *-*-* 02:30:00       (daily at 02:30)
0 4 * * 1                     Mon *-*-* 04:00:00   (Mondays at 04:00)
0 0 1 * *                     *-*-01 00:00:00      (1st of the month)
0 9 * * 1-5                   Mon..Fri *-*-* 09:00:00  (weekdays at 09:00)
```

There are also convenient shorthands — `hourly`, `daily`, `weekly`, `monthly` — so `OnCalendar=daily` is equivalent to midnight every day. The single most useful command during migration is `systemd-analyze calendar`, which parses an expression and shows you the next firing times:

```bash
$ systemd-analyze calendar --iterations=3 'Mon..Fri *-*-* 09:00:00'
  Original form: Mon..Fri *-*-* 09:00:00
Normalized form: Mon..Fri *-*-* 09:00:00
    Next elapse: Mon 2026-06-08 09:00:00 UTC
       From now: 4h 12min left
       (next 3)  Tue 2026-06-09 09:00:00 UTC
                 Wed 2026-06-10 09:00:00 UTC
```

If that output matches what your cron line did, the schedule is correct. If it doesn’t, you’ve caught the bug before it shipped.

## The gotchas that actually bite

**Timezone.** Cron uses the system local time. systemd timers do too by default, but `OnCalendar` is evaluated in the timer’s timezone, which can surprise you on servers set to UTC. Pin it explicitly with `OnCalendar=Mon *-*-* 04:00:00 America/New_York` if local time matters, and remember that daylight-saving transitions can skip or double a run.

**Thundering herd.** Cron fires `0 * * * *` jobs at exactly :00 across your whole fleet. Add `RandomizedDelaySec=` to spread the load:

```ini
[Timer]
OnCalendar=hourly
RandomizedDelaySec=300
Persistent=true
```

That jitters each run by up to five minutes — invaluable when a hundred hosts hit the same API.

**Environment and working directory.** Cron’s sparse environment trips people up; so does assuming a working directory. Be explicit in the service:

```ini
[Service]
Type=oneshot
WorkingDirectory=/opt/app
Environment=PATH=/usr/local/bin:/usr/bin:/bin
EnvironmentFile=-/etc/app/env
ExecStart=/opt/app/run.sh
```

The leading `-` on `EnvironmentFile` means “don’t fail if the file is missing,” mirroring cron’s forgiving behavior.

**Per-user jobs.** A user crontab maps to a user unit. Drop the files in `~/.config/systemd/user/`, enable with `systemctl --user enable --now myjob.timer`, and run `loginctl enable-linger $USER` so the timer survives logout.

## Verifying the migration

After enabling, confirm the timer is armed and inspect its history:

```bash
systemctl list-timers --all          # see next/last run for every timer
journalctl -u backup.service --since today   # read the job's output
sudo systemctl start backup.service  # trigger a manual run to test now
```

`systemctl start backup.service` runs the job immediately, independent of the schedule — the cleanest way to confirm the service half works before trusting the timer.

## Don’t hand-translate every field

The mechanical part — turning five cron fields into an `OnCalendar` line and scaffolding the `.timer`/`.service` pair — is exactly the kind of thing that’s easy to get subtly wrong by hand, especially with step values, ranges, and day-of-week edge cases. Our **Cron to systemd Converter** does it in the browser: paste a crontab line, get a ready-to-edit timer and service unit with the correct `OnCalendar` expression and migration notes, with nothing uploaded anywhere.

[Convert your crontab to systemd timers →](/cron-to-systemd)

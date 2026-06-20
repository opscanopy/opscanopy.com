---
title: "Reading cron expressions: a field-by-field guide"
description: "A practical, field-by-field guide to reading cron expressions — the five time fields, ranges, steps, lists and @macros — plus the gotchas that make schedules fire when you least expect."
pubDate: 2026-05-13
tags: ["cron", "scheduling", "devops"]
relatedTool:
  name: "Cron Expression Tester"
  href: "/cron-expression-tester"
---

![Reading cron expressions field by field: a scheduling guide to the five cron time fields, ranges and steps](/blog/cron-expressions-explained-hero.svg)

Almost everyone who runs a backend has stared at a line like `*/15 9-17 * * 1-5` and half-remembered what it does. Cron’s syntax is compact, which is its great virtue and its great trap: five tiny fields encode a recurring schedule, and a single misplaced character can turn “every weekday afternoon” into “every minute, forever.” This guide reads a cron expression the way the daemon does — field by field — so the next time you meet one you can decode it on sight.

## The five fields

A standard cron expression is five whitespace-separated fields, always in this order:

```text
┌───────────── minute        (0–59)
│ ┌─────────── hour          (0–23)
│ │ ┌───────── day of month  (1–31)
│ │ │ ┌─────── month         (1–12 or JAN–DEC)
│ │ │ │ ┌───── day of week   (0–6, Sun=0; 7 also = Sun)
│ │ │ │ │
* * * * *
```

The job runs at every minute where **all** the time fields match the current moment. A field of `*` means “every value,” so the canonical `* * * * *` fires once a minute. Read left to right and the most common schedules fall out quickly:

```text
0 * * * *      at minute 0 of every hour          → hourly, on the hour
30 2 * * *      at 02:30 every day                 → a nightly batch job
0 0 1 * *      at 00:00 on day 1 of every month    → monthly rollover
0 9 * * 1      at 09:00 every Monday               → start-of-week report
```

Note that seconds are **not** part of standard Unix cron. Some implementations (Quartz, many Go and Node libraries, Kubernetes is the notable exception that stays at five) prepend a sixth seconds field. If a six-field expression behaves oddly in plain `crontab`, that extra field is usually why.

![The five fields of a cron expression labelled minute, hour, day of month, month and day of week, with step and range annotations](/blog/cron-expressions-explained-diagram.svg)

## Ranges, steps and lists

Three operators do most of the heavy lifting, and they compose within a single field:

- **Range** `a-b` — an inclusive span. `9-17` in the hour field means hours 9 through 17.
- **Step** `*/n` or `a-b/n` — every nth value. `*/15` in the minute field means 0, 15, 30, 45. `9-17/2` means 9, 11, 13, 15, 17.
- **List** `a,b,c` — an explicit set. `1,15` in the day-of-month field means the 1st and the 15th.

Put together, the expression from the opening paragraph decodes cleanly:

```text
*/15 9-17 * * 1-5
 │    │   │ │  └── Monday through Friday
 │    │   │ └───── every month
 │    │   └─────── every day of the month
 │    └─────────── hours 9 through 17 (9 AM–5 PM)
 └──────────────── every 15th minute (0, 15, 30, 45)
```

So: **every 15 minutes, between 9 AM and 5 PM, Monday through Friday.** A reasonable cadence for a sync job that should rest overnight and on weekends. The danger is how little this differs from `* 9-17 * * 1-5`, which drops the step and fires *every minute* in that window — 60× the load. The character that separates a tidy schedule from an accidental denial-of-service is two characters wide.

## The day-of-month / day-of-week trap

The single most surprising rule in cron is how the two “day” fields combine. Intuition says they’re ANDed like every other pair of fields. They are not. When **both** day-of-month and day-of-week are restricted (neither is `*`), cron treats them as an **OR**: the job runs if *either* matches.

```text
0 0 1,15 * 5    midnight on the 1st, on the 15th, OR on any Friday
```

That expression does not mean “the 1st or 15th, but only if it’s a Friday.” It means three separate triggers. If you genuinely need an AND — say, “the first Monday of the month” — vanilla cron can’t express it directly; you guard it in the job itself (`[ "$(date +\%d)" -le 07 ] || exit 0`) or reach for an extension like Quartz’s `#` operator (`MON#1`). This OR rule is responsible for a large share of “why did this fire twice?” incidents.

## The @macros

Most crons accept a handful of named shortcuts that stand in for an entire five-field expression. They read better and remove a class of typos:

```text
@hourly    →  0 * * * *
@daily     →  0 0 * * *   (alias: @midnight)
@weekly    →  0 0 * * 0
@monthly   →  0 0 1 * *
@yearly    →  0 0 1 1 *   (alias: @annually)
```

There’s also `@reboot`, which is special: it runs once when cron starts up, not on any clock schedule. Useful for warming a cache after a restart, useless for anything time-of-day related — and a frequent source of “my daily job never ran” reports when someone reaches for it by mistake.

## Reading the gotchas

A few more rules separate people who *think* they read cron from people who actually do:

- **Time zones.** Classic cron runs in the system local time zone, so daylight-saving transitions can skip or repeat a job. A 02:30 job runs zero times on the spring-forward night and twice on fall-back. Systems that matter increasingly pin schedules to UTC for exactly this reason.
- **Day-of-week numbering.** Sunday is `0`, and `7` is also accepted as Sunday on most implementations — but not all. Prefer the three-letter names (`SUN`, `MON`, …) when you can; they’re unambiguous.
- **`*/n` doesn’t wrap.** `*/40` in the minute field fires at minute 0 and 40, then jumps to 0 of the next hour. It is **not** “every 40 minutes” — the count restarts each hour, so the real gap between the :40 and the next :00 is only 20 minutes.

None of these are exotic. They’re the everyday edges that make a schedule fire at a time you didn’t intend, and none of them are visible from staring at the five fields alone.

## Verify before you ship

The honest way to read a cron expression is to not trust your reading of it. Decode it into plain English, then look at the actual timestamps it will produce over the next several runs — that’s where the `*/40` wrap, the DST gap, and the day-field OR reveal themselves immediately.

The **Cron Expression Tester** does exactly that in your browser: paste any expression — ranges, steps, lists, `@macros` and all — and get a plain-English description alongside the next run times, with nothing uploaded anywhere. It turns “I think this is every weekday afternoon” into “here are the next ten times it fires,” which is the only reading that counts.

[Try the Cron Expression Tester →](/cron-expression-tester)

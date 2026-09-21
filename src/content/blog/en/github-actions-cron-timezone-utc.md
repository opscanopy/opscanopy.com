---
title: "GitHub Actions cron runs in UTC: convert your schedule and check the real next run time"
description: "GitHub Actions cron timezone UTC explained: why schedule: cron: always fires on UTC, how DST shifts the wall-clock time, and how to check the real next run."
pubDate: 2026-09-21
tags: ["cron", "scheduling", "github-actions", "ci-cd"]
relatedTool:
  name: "Cron Expression Tester"
  href: "/cron-expression-tester"
---

![A clock face labeled UTC next to a workflow schedule, showing the same cron line landing at different local wall-clock times](/blog/github-actions-cron-timezone-utc-hero.svg)
<!-- keywords: github actions cron timezone utc | cron next run time, cron expression tester online, github actions schedule cron timezone utc, node-cron timezone option | source: ahrefs free (2026-09-21) -->

You wrote `schedule: - cron: '0 9 * * 1-5'` expecting your workflow to fire at 9 AM your time, and it fired three hours off. Nothing is broken. **GitHub Actions cron timezone UTC** is the whole story: every `schedule` trigger is evaluated against the UTC clock, full stop, and there is no `timezone:` key in the workflow syntax to change that. This post covers why that's documented behavior, how daylight saving time makes it worse twice a year, and how to get an honest next-run time in the zone you actually care about.

## GitHub Actions schedule cron always runs in UTC

GitHub's own documentation for the [`schedule` event](https://docs.github.com/actions/using-workflows/events-that-trigger-workflows#schedule) states that scheduled workflows use POSIX cron syntax evaluated in UTC — there's no per-workflow timezone override. `cron: '0 9 * * 1-5'` means 09:00 UTC on weekdays, not 09:00 in whatever timezone your team happens to be sitting in. The docs also note two operational quirks worth knowing before you rely on this for anything time-sensitive: the shortest interval is five minutes, and under high load GitHub can delay or, rarely, drop a scheduled run — a `schedule` trigger is a best-effort clock, not a guarantee.

The fix isn't a workflow setting — GitHub doesn't have one — it's arithmetic: convert your desired local time to UTC before you write the cron line, and re-derive it whenever a DST boundary passes.

## DST shifts the wall-clock time twice a year

UTC itself never observes daylight saving time, which is exactly why a UTC-anchored cron expression drifts against every timezone that does. Take `0 9 * * 1-5` — 09:00 UTC, Monday through Friday:

- **Central European Time (CET, UTC+1, winter):** 09:00 UTC lands at **10:00** local.
- **Central European Summer Time (CEST, UTC+2, when DST is in effect):** the same `09:00 UTC` lands at **11:00** local.

The cron line in your workflow file never changes across that boundary — the UTC time it fires at is constant — but the local wall-clock time it corresponds to jumps by an hour on the date your region's DST rule flips. If your team scheduled a 10 AM deploy freeze assuming CET, the same workflow quietly becomes an 11 AM freeze the week DST starts, with no diff in your YAML to explain why.

## Cron next run time: check it in a labeled timezone

The way to stop guessing is to never look at a next-run time without a timezone label attached to it. The [Cron Expression Tester](/cron-expression-tester/) does this by construction: pick any IANA zone — `UTC`, `Europe/Berlin`, `America/New_York`, whatever your team is actually in — and every next-run timestamp is printed with "Times shown in …" next to it, so the number is never ambiguous about which clock produced it. Paste `0 9 * * 1-5`, set the zone to `Europe/Berlin`, and you'll see the next several runs land at 10:00 or 11:00 depending on which side of the DST boundary they fall — the tool walks the schedule forward on the real wall clock of that zone, including DST-aware handling (a wall time that doesn't exist during a spring-forward is skipped; one that occurs twice during a fall-back fires once, on its first occurrence), and it flags you when a transition is close enough to matter. That's the concrete way to answer "what time does this actually fire for me" instead of doing the arithmetic in your head every time a schedule comes up in review.

## node-cron timezone option

If your schedule lives in application code rather than a GitHub Actions workflow — a background job in a Node service, for instance — the popular `node-cron` package takes a different, more forgiving approach: its `schedule()` call accepts an options object with a documented `timezone` field, so you supply an IANA name directly and the library evaluates the schedule in that zone instead of the host's local time or UTC:

```js
const cron = require('node-cron');

cron.schedule('0 9 * * 1-5', () => {
  console.log('Runs at 09:00 in America/New_York, DST-adjusted automatically');
}, {
  timezone: 'America/New_York',
});
```

That's the feature GitHub Actions' `schedule` event simply doesn't have — a per-schedule timezone. The tradeoff is that `node-cron` only runs while your process is alive; GitHub's scheduler runs regardless of any process you control, which is exactly why the UTC-only design exists — it has no long-lived runtime to hold a timezone setting in.

## Why a next-run time without a zone label misleads

crontab.guru is a well-known, widely bookmarked site for turning a cron expression into a plain-English description and a next-run time. If you use it to sanity-check a GitHub Actions `schedule` line, do one specific check first: look for a visible timezone label next to the next-run value it shows you. At the time of writing, we could not find one displayed alongside the result — which means the number on its own doesn't tell you whether it's computed in your browser's local zone or something else. A next-run time is only useful once you know what clock produced it, and that's precisely the ambiguity a UTC-fixed GitHub Actions schedule punishes: if you read a next-run time assuming your local zone when it was actually computed in another one, your mental model of "when this fires" is wrong in exactly the way DST already makes worse. Whatever tool you check a schedule against, confirm the zone before you trust the time.

## github actions schedule cron timezone utc: the practical checklist

1. Decide the local time you actually want the job to run at, and which IANA zone that's in.
2. Convert to UTC for *today's* DST state, and write that as your `cron:` line.
3. Re-check the conversion after any DST boundary in your zone — the UTC line doesn't move, but what it means to your team does.
4. Verify the next few runs with a tool that prints the zone next to the result, not just a bare timestamp.
5. If the schedule needs to track your zone automatically rather than being re-derived twice a year, move it out of the workflow's `schedule:` trigger and into application code with something like `node-cron`'s `timezone` option, which does track DST for you.

## When to use which

- **GitHub Actions `schedule:`** is right when the trigger genuinely is "run this workflow periodically regardless of whether anything else is running" — CI housekeeping, scheduled builds, nightly jobs. Accept that it's UTC-only, do the conversion once, and re-verify around DST changes.
- **`node-cron` (or an equivalent in-process scheduler)** is right when the schedule needs to track a specific timezone automatically and the code doing the scheduling runs continuously anyway — a long-lived service, not a CI runner that spins up and down.
- **[Cron to systemd](/cron-to-systemd/)** is the move if you're migrating the same schedule onto a host you control — it turns a crontab line into a `systemd` `.timer` unit, which, unlike GitHub's `schedule:`, can be pinned to a specific timezone via systemd's calendar syntax.
- Whichever path you're on, run the actual cron line through the [Cron Expression Tester](/cron-expression-tester/) with the zone set explicitly before you commit to a schedule — it's free, runs entirely in your browser, and the next-run times it shows always say which clock they're using.

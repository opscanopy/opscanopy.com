---
title: "The 12 Linux commands I actually run every day as a DevOps engineer"
published: false
description: "Tutorials teach you 100 commands. On-call, you reach for the same dozen. Here's my real list, with examples and the mistakes that taught me."
tags: linux, devops, productivity, beginners
cover_image: ""
canonical_url: ""
---

Every Linux tutorial throws a hundred commands at you. `tar`, `sed`, `cut`, `xargs`, forty flags each, and you nod along and forget all of it by Tuesday.

Then you get paged at 3am. Production's down — now what? And in that moment your brain doesn't reach for the hundred. It reaches for maybe twelve. The same twelve, every single incident. Those are the ones worth burning into muscle memory.

This is that list. Not the comprehensive one — the *honest* one. For each command I'll give you a real situation, a copy-pasteable example, and the flag explanations that actually matter. Plus a mistake or two I've made so you don't have to.

**TL;DR:** Learn to answer four questions fast — *what's broken?* (`ps`, `top`, `ss`, `df`), *what do the logs say?* (`journalctl`, `grep`, `awk`, `tail`), *who can touch this file?* (`find`, `chmod`/`chown`), and *can I reach that box?* (`ssh`, `curl`, `systemctl`). Everything else you can Google mid-incident.

> 🖼️ **[IMAGE PROMPT]:** Clean modern flat-vector illustration, 1200x630, of a calm DevOps engineer at a single dark terminal at night, the screen glowing soft emerald-green (#10b981) with a few lines of monospace command text. Desk lamp warm amber, dark navy room, one small red "alert" notification icon floating. Isometric-ish, minimal, no faces in detail, lots of negative space. Mood: focused, not panicked. Modern tech editorial style, subtle grid background.

## Find out what's wrong fast

The first 90 seconds of an incident are about *triage*, not fixing. You want a fast read on CPU, memory, disk, and ports before you touch anything.

### 1. `top` (and `ps` for the surgical version)

`top` is your live dashboard. Open it, press `M` to sort by memory or `P` for CPU, and you'll usually spot the offender in five seconds.

But `top` is interactive and noisy. When I want a one-shot answer — *which process is eating all the RAM?* — I reach for `ps`:

```bash
ps aux --sort=-%mem | head
```

`aux` shows every process with user and resource columns. `--sort=-%mem` orders by memory descending (the `-` means descending), and `head` keeps the top 10 so your terminal doesn't scroll into oblivion. Swap in `-%cpu` when CPU is the suspect.

Pro tip: the `RSS` column is real memory in KB. That's the number that gets a process OOM-killed, not the scary-looking `VSZ`.

### 2. `df -h` — is the disk full?

You would not believe how many "the app is down" incidents are just a full disk. Logs filled the partition, writes started failing, everything fell over.

```bash
df -h
```

`-h` means human-readable (GB/MB instead of raw blocks). Glance at the `Use%` column. Anything at 100% is your problem. Check `/` and `/var` first — `/var/log` is the usual culprit.

### 3. `du -sh * | sort -h` — *where* did the disk go?

`df` tells you the partition's full. `du` tells you which directory ate it.

```bash
du -sh * | sort -h
```

`-s` summarizes each entry (instead of listing every file inside), `-h` is human-readable again, and `sort -h` sorts those human sizes correctly so `2G` lands above `500M`. Run it, `cd` into the biggest dir, run it again. Two or three hops and you've found the runaway log file.

### 4. `ss -tulpn` — what's listening on which port?

`netstat` is dead, long live `ss`. When a service won't start because "address already in use," or you just want to know what's actually bound:

```bash
ss -tulpn
```

Read it as: `t` TCP, `u` UDP, `l` listening sockets only, `p` show the process, `n` numeric (don't waste time resolving names). You'll see exactly which PID owns port 8080 before you go hunting.

> Once spent forty minutes convinced our API had a code bug because health checks were timing out. It wasn't the code. `df -h` showed `/` at 100% — a debug log left on `DEBUG` over the weekend had quietly written 40GB. The fix was `truncate` and a logrotate config. The lesson: check the boring stuff *first*. The disk, the ports, the memory. The clever explanation is almost never the right one at 3am.

## Wrangle the logs

This is where most of the time actually goes. Logs are the crime scene and these four tools are how you read it.

> 🖼️ **[IMAGE PROMPT]:** Isometric flat-vector illustration, 16:9, of a stylized stream of log lines flowing like a river through a funnel/filter, emerald-green (#10b981) highlighted matching lines being caught while grey noise lines pass through. Dark background, monospace text fragments, a magnifying glass icon over the green lines. Clean, modern, editorial tech style. No people.

### 5. `journalctl` — the systemd logbook

On any modern distro, this is where service logs live. The two flags I use constantly:

```bash
journalctl -u nginx --since "10 min ago"
```

`-u nginx` filters to one unit. `--since "10 min ago"` scopes the time window so you're not scrolling through yesterday. Add `-f` to follow live, or `-e` to jump to the end. When a service just died, `journalctl -u <service> -e` is usually the first command I type.

### 6. `grep` — find the needle

The one you'll run most. Searching a tree of logs for errors:

```bash
grep -rn "ERROR" /var/log/
```

`-r` recurses into subdirectories, `-n` prints line numbers so you can jump straight there. Add `-i` to ignore case (because some apps log `Error`, some `ERROR`, some `error` — consistency is a myth).

The catch with grep is the *pattern*. Simple strings are easy; real log-mining needs regex, and getting a regex right by trial and error inside a live `grep` is miserable. I build and test patterns in a browser first using OpsCanopy's [regex log tester](https://opscanopy.com/regex-log-tester) — paste a few sample log lines, tweak the pattern until it highlights exactly what you want, then drop it into grep. Saves a lot of "why is this matching nothing" frustration.

### 7. `awk` — when you need columns

grep finds lines. `awk` slices them into fields. The classic "who is hammering my server?" one-liner:

```bash
awk '{print $1}' access.log | sort | uniq -c | sort -rn
```

`{print $1}` pulls the first column (the client IP in a standard access log). `sort` groups identical IPs together, `uniq -c` counts each group, and `sort -rn` sorts those counts numerically, highest first. Top of the list is your top talker. (Could be a bot, could be a misconfigured client, could be a DDoS — but now you have a number.)

### 8. `tail -f` — watch it happen live

Reproducing a bug and want to see the log react in real time?

```bash
tail -f /var/log/syslog | grep -i timeout
```

`-f` follows the file as new lines append. Piping into `grep -i timeout` means you only see the lines you care about, case-insensitively, as they arrive. Trigger the action in another window and watch. There's something deeply satisfying about seeing the exact line appear the instant you click the button.

If you want the regex side of grep/awk to stop being guesswork, the [Linux for DevOps guide](https://opscanopy.com/learn/guides/linux-for-devops) walks through log-wrangling patterns properly, not just "here's the flag."

## Files & permissions

Half of "permission denied" tickets are one `chmod` away from solved. The other half are someone who already ran the wrong `chmod`.

### 9. `find` — locate by criteria, not just name

`find` is a search engine for your filesystem. Tracking down logs modified in the last day:

```bash
find / -name "*.log" -mtime -1
```

`-name "*.log"` matches by filename pattern, `-mtime -1` means modified less than 1 day ago (`-mtime +7` would be older than a week — handy for cleanup). Start from a specific directory instead of `/` when you can; searching the whole root is slow and touches everything.

### 10. `chmod` / `chown` — fix who can do what

A private key with loose permissions? SSH will flat-out refuse it. The fix:

```bash
chmod 600 ~/.ssh/id_rsa
```

`600` means owner read+write, nobody else gets anything. That's the canonical permission for secrets and keys. For ownership, `chown user:group file` reassigns who owns it — common after copying files around as root.

Confession time: early on I ran `chmod -R 777` on a directory to "fix a permissions issue." Don't. `777` means *everyone can read, write, and execute everything*, recursively. It doesn't fix permissions, it deletes the concept of permissions. I spent the next hour undoing it and explaining myself. Use the *least* access that works, never the most.

## Reach other machines

Your stuff runs on boxes that aren't yours. These three get you there and tell you if they're alive.

> 🖼️ **[IMAGE PROMPT]:** Flat-vector isometric illustration, 16:9, of three stylized server nodes connected by glowing emerald-green (#10b981) lines to a laptop, with small lock icons on the connections (representing SSH) and a green checkmark / "200" badge floating near one node. Dark navy background, clean minimal, modern tech editorial style, subtle dotted network grid. No people.

### 11. `ssh` — get onto the box

The front door to remote work. Basic form:

```bash
ssh deploy@10.0.4.12
```

You'll live in this command. The real upgrade is your `~/.ssh/config` — define a `Host` alias once and `ssh prod-web` beats typing the full user-and-IP every time. Set up key auth and stop typing passwords entirely. (And see command 10 — if your key permissions are wrong, ssh will refuse before it even tries.)

### 12. `curl` — is the endpoint actually up?

My favorite health-check one-liner. Skip the response body, just tell me the HTTP status:

```bash
curl -sS -o /dev/null -w "%{http_code}\n" https://api.example.com/health
```

Breaking it down: `-s` silences the progress bar, `-S` keeps real errors visible (so a silent failure still shouts), `-o /dev/null` throws away the body, and `-w "%{http_code}\n"` prints just the status code with a newline. You get back a clean `200` (or a `503` that tells you exactly what's wrong). Drop it in a loop and you've got a poor man's uptime monitor.

For the deeper "why can't this box reach that box" rabbit holes — DNS, routing, ports, TLS — the [networking guide](https://opscanopy.com/learn/guides/networking-for-devops) pairs naturally with `ss`, `ssh`, and `curl`.

## The honest takeaway

Nobody memorizes a hundred commands. You memorize the dozen that answer your real questions, and you get fast at *those*. Everything else is `man` pages and search history.

If you're moving into DevOps and want to go from "I can copy-paste these" to "I actually understand what's happening underneath," start here:

- 📘 The full [Linux for DevOps guide](https://opscanopy.com/learn/guides/linux-for-devops) — these commands in real context, with the why.
- 🗺️ The [Linux roadmap](https://opscanopy.com/learn/roadmaps/linux) — a step-by-step path if you don't know what to learn next.
- 🧰 Or browse everything in the [Learn hub](https://opscanopy.com/learn).

Bookmark this, drill the twelve, and the next 3am page will feel a little less like a fire and a little more like a checklist. That's the whole job, honestly.

What's the one command you reach for that I left off the list? I'm always looking to steal a good one.

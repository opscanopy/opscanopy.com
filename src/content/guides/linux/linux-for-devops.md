---
title: "Linux for DevOps Engineers"
description: "A comprehensive guide to Linux fundamentals for DevOps: filesystem, permissions, process management, systemd, networking, SSH, bash scripting, and more."
track: "linux"
order: 1
difficulty: "beginner"
updatedDate: "2026-06-27"
tags: ["linux", "bash", "systemd", "ssh", "devops", "cli"]
relatedTools: ["bash", "systemd", "ssh", "grep", "awk", "sed"]
seoTitle: "Linux for DevOps Engineers — Complete Guide"
metaDescription: "Master Linux for DevOps: filesystem hierarchy, permissions, process management, systemd services, SSH hardening, package managers, networking, and production bash scripting."
faqs:
  - q: "Do I need to memorise every command?"
    a: "No. Focus on understanding the mental models — file permissions as bits, processes as a tree, systemd as a dependency graph. The exact flags come with practice."
  - q: "Which distro should I learn on?"
    a: "Ubuntu 24.04 LTS. It's the most common cloud VM image, Docker base, and CI runner. Everything here applies verbatim to Debian and mostly applies to RHEL/Rocky with minor package-manager differences."
  - q: "How long will this guide take?"
    a: "Working through every section with hands-on practice takes 40–60 hours. If you already know a scripting language and basic CLI, budget 20–30 hours."
---

Linux is the operating system under every Docker container, every Kubernetes node, and the majority of cloud VMs. Before you can deploy, debug, or automate anything in a modern infrastructure stack, you need to be comfortable at the shell. This guide takes you from the absolute fundamentals — how Linux thinks about files and processes — through the tools DevOps engineers reach for daily: permissions, grep/awk/sed, systemd, SSH, package managers, network commands, and production-grade bash scripting.

## Linux Filesystem Hierarchy

Linux organises everything into a single tree rooted at `/`. Unlike Windows with drive letters, there is no `C:\` — everything is a file or a directory beneath `/`. Understanding where things live stops you from wasting time searching for config files.

### Key Directories

| Path | What lives here |
|------|----------------|
| `/bin`, `/usr/bin` | Essential user binaries (`ls`, `cp`, `bash`) |
| `/sbin`, `/usr/sbin` | System administration binaries (`fdisk`, `iptables`) |
| `/etc` | System-wide configuration files — everything in plain text |
| `/home` | User home directories (`/home/pushkar`) |
| `/root` | Root user's home |
| `/var` | Variable data: logs (`/var/log`), mail, caches, spool |
| `/tmp` | Temporary files; cleared on reboot |
| `/proc` | Virtual filesystem exposing kernel and process state |
| `/sys` | Virtual filesystem for kernel subsystems (devices, drivers) |
| `/dev` | Device files (`/dev/sda`, `/dev/null`, `/dev/random`) |
| `/boot` | Kernel image, initrd, GRUB config |
| `/opt` | Optional third-party software |
| `/usr/local` | Locally compiled software (takes precedence over `/usr`) |
| `/run` | Runtime data (PIDs, sockets) — tmpfs, cleared on boot |
| `/mnt`, `/media` | Mount points for temporary / removable filesystems |

### Navigating the Tree

```bash
pwd                    # print working directory
ls -la /etc            # long listing including hidden files
ls -lh /var/log        # human-readable sizes
cd /var/log            # change directory
cd -                   # go back to previous directory
cd ~                   # go home
tree -L 2 /etc         # visual tree, depth 2 (install with apt)
```

### Inodes and Hard Links

Every file is represented by an **inode** — a data structure storing metadata (owner, permissions, timestamps, block pointers) but *not* the filename. Directory entries are simply `(name → inode number)` mappings. This is why:

- Hard links are just extra directory entries pointing to the same inode. Delete one, the data survives until the last link is removed.
- Symbolic links (`ln -s`) store a path string. They can cross filesystem boundaries; hard links cannot.
- `df -i` shows inode usage — a filesystem can run out of inodes before running out of blocks if you create millions of tiny files.

```bash
ls -li /etc/hostname        # shows inode number in first column
stat /etc/hostname          # full inode metadata dump
ln /etc/hostname /tmp/hn    # hard link (same inode)
ln -s /etc/hostname /tmp/hn_sym   # symbolic link
```

> **Tip:** `/proc` and `/sys` contain no data on disk — they are windows into kernel memory. `cat /proc/cpuinfo` reads CPU registers; `cat /proc/$(pgrep nginx)/status` reads a live process's memory map. Learn to explore them freely.

## File Directory Operations

Confident file manipulation — copying, moving, finding, archiving — is the foundation of every shell workflow.

### Essential Commands

```bash
# Create
touch notes.txt              # create empty file / update mtime
mkdir -p projects/web/src    # create directory tree in one shot

# Copy, Move, Delete
cp -r /etc/nginx /tmp/nginx-bak    # recursive copy
cp -p file dest/                   # preserve permissions + timestamps
mv old_name new_name               # rename (or move)
rm -rf /tmp/scratch                # recursive force delete — no undo!

# View
cat /etc/hostname           # dump whole file
less /var/log/syslog        # paged viewer (q to quit, / to search)
head -20 /var/log/auth.log  # first 20 lines
tail -50 /var/log/syslog    # last 50 lines
tail -f /var/log/nginx/access.log  # follow (real-time stream)
```

### Finding Files

```bash
# find — the workhorse
find /var/log -name "*.log" -mtime -1          # modified in last 24 h
find /home -type f -size +100M                 # regular files over 100 MB
find /etc -name "*.conf" -exec grep -l "port" {} \;   # grep inside results
find /tmp -type f -newer /etc/hostname         # newer than reference file
find . -name "*.pyc" -delete                   # find and delete in one pass

# locate — index-based, faster but stale
sudo updatedb            # rebuild index
locate nginx.conf        # instant search

# which / type — find an executable
which python3
type ls                  # shows if alias, function, or binary
```

### Archives and Compression

```bash
# tar — tape archive (most common)
tar -czf backup.tar.gz /etc/nginx      # create gzipped archive
tar -tzf backup.tar.gz                 # list contents without extracting
tar -xzf backup.tar.gz -C /tmp/       # extract to /tmp

# gzip / bzip2 / xz
gzip largefile.log         # compresses in-place → largefile.log.gz
gunzip largefile.log.gz    # decompress
zcat largefile.log.gz      # read without decompressing

# zip (cross-platform)
zip -r archive.zip dir/
unzip archive.zip -d /tmp/out
```

> **Tip:** Remember tar flags as **C**reate/**e**X**t**ract **z**gzip **f**ile: `czf` to create, `xzf` to extract. For bzip2 use `j` instead of `z`. For xz use `J`.

## File Permissions Ownership

Linux permissions control who can read, write, or execute every file. Getting this wrong is a security vulnerability; getting it right is foundational operations knowledge.

See also: [SSH Secure Shell Critical](#ssh-secure-shell-critical) for how permissions protect SSH keys.

### The Permission Bits

Every file has three permission triplets: **owner (u)**, **group (g)**, **others (o)**. Each triplet has three bits: **r** (read=4), **w** (write=2), **x** (execute=1).

```
-rwxr-xr--  1 pushkar devops 4096 Jan 1 12:00 script.sh
│└┬┘└┬┘└┬┘
│ │  │  └── others: r-- = 4 (read only)
│ │  └───── group:  r-x = 5 (read + execute)
│ └──────── owner:  rwx = 7 (full)
└────────── file type: - = regular, d = directory, l = symlink
```

### chmod and chown

```bash
# Symbolic mode
chmod u+x script.sh          # add execute for owner
chmod go-w sensitive.conf    # remove write for group and others
chmod a+r public.html        # add read for everyone
chmod u=rwx,g=rx,o= priv/   # set exactly

# Octal mode (faster once memorised)
chmod 755 script.sh    # rwxr-xr-x
chmod 644 config.yml   # rw-r--r--
chmod 600 ~/.ssh/id_rsa       # rw------- (private key requirement)
chmod 700 ~/.ssh/             # rwx------ (SSH dir requirement)
chmod 777 /tmp/shared  # rwxrwxrwx — almost always wrong

# Ownership
chown pushkar:devops file.txt          # change owner and group
chown -R www-data:www-data /var/www/   # recursive
chgrp docker /var/run/docker.sock      # change group only
```

### Special Bits

| Bit | On files | On directories |
|-----|----------|----------------|
| **setuid (4xxx)** | Run as owner's UID (`-rwsr-xr-x`) | No effect |
| **setgid (2xxx)** | Run as owner's GID | New files inherit directory's group |
| **sticky (1xxx)** | No effect | Only owner/root can delete files (`/tmp`) |

```bash
chmod u+s /usr/bin/passwd    # setuid — passwd needs root to modify /etc/shadow
chmod g+s /var/www/uploads   # setgid — all new files owned by www-data group
chmod +t /tmp                # sticky — standard on /tmp
ls -la /usr/bin/passwd       # -rwsr-xr-x (note the 's')
```

### umask

The **umask** is subtracted from the default permissions when new files are created (default 666 for files, 777 for dirs).

```bash
umask          # 0022 → files get 644, dirs get 755
umask 027      # more restrictive: files 640, dirs 750
```

> **Tip:** ACLs (`setfacl`/`getfacl`) extend beyond the three-owner model. Use them when you need fine-grained per-user access to a shared directory without changing ownership.

## Grep Pattern Searching

`grep` filters lines matching a regular expression. It's your first tool for searching logs, configs, and code at the command line. See also [Piping Redirection](#piping-redirection) for how grep composes with other tools.

### Basic Usage

```bash
grep "error" /var/log/syslog               # case-sensitive match
grep -i "error" /var/log/syslog            # case-insensitive
grep -n "timeout" app.log                  # show line numbers
grep -c "WARN" app.log                     # count matching lines
grep -v "DEBUG" app.log                    # invert — lines NOT matching
grep -r "SECRET_KEY" /etc/                 # recursive directory search
grep -l "nginx" /etc/logrotate.d/*         # only print filenames
grep -w "root" /etc/passwd                 # whole-word match only
```

### Extended Regex (ERE)

```bash
grep -E "error|warn|crit" syslog           # alternation
grep -E "^[0-9]{4}-[0-9]{2}" app.log      # lines starting with ISO date
grep -E "failed (password|publickey)" /var/log/auth.log  # auth failures
grep -E "[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}" access.log  # IPs
```

### Context and Output

```bash
grep -A 3 "FATAL" app.log    # 3 lines after each match
grep -B 2 "FATAL" app.log    # 2 lines before
grep -C 5 "FATAL" app.log    # 5 lines before and after
grep --color=auto "error" syslog    # highlight matches
grep -o "[0-9]\+\.[0-9]\+" file     # print only the matching portion
```

### Real-World Patterns

```bash
# Find all failed SSH logins
grep "Failed password" /var/log/auth.log | awk '{print $11}' | sort | uniq -c | sort -rn

# Count HTTP 5xx errors in nginx log
grep -E '" 5[0-9]{2} ' /var/log/nginx/access.log | wc -l

# Find config files containing a port number
grep -rn "^Listen\|^Port\|^port" /etc/nginx/ /etc/apache2/ 2>/dev/null
```

## Awk Text Processing Powerhouse

`awk` is a field-oriented text processor. Think of it as a per-line program: for each line, split into fields, run your script. It handles 80% of the log-parsing and report-generation tasks you'd otherwise reach for Python for.

### Basic Syntax

```bash
awk '{print $1}' file.txt          # print first field (whitespace-delimited)
awk '{print $1, $3}' file.txt      # fields 1 and 3
awk '{print NR, $0}' file.txt      # NR = record (line) number, $0 = whole line
awk 'NR==5' file.txt               # print only line 5
awk 'NF > 3' file.txt              # lines with more than 3 fields
```

### Field Separators

```bash
awk -F: '{print $1, $3}' /etc/passwd         # colon-delimited
awk -F'\t' '{print $2}' data.tsv             # tab-delimited
awk 'BEGIN{FS=","} {print $1}' data.csv      # set FS in BEGIN block
awk -F'[,;]' '{print $1}' mixed.txt          # regex separator
```

### Built-in Variables

| Variable | Meaning |
|----------|---------|
| `$0` | Entire current line |
| `$1`, `$2`, ... | Fields 1, 2, ... |
| `NR` | Current record (line) number |
| `NF` | Number of fields in current record |
| `FS` | Input field separator (default: whitespace) |
| `OFS` | Output field separator (default: space) |
| `RS` | Record separator (default: newline) |
| `FILENAME` | Current filename |

### BEGIN and END Blocks

```bash
# Sum a column
awk '{sum += $3} END {print "Total:", sum}' sales.csv

# Count occurrences
awk '{count[$1]++} END {for (k in count) print count[k], k}' access.log

# Print header + filtered rows
awk 'BEGIN{print "Name,UID"} -F: $3 >= 1000 {print $1","$3}' /etc/passwd
```

### Real-World Awk

```bash
# Extract top 5 IPs from nginx access log
awk '{print $1}' /var/log/nginx/access.log | sort | uniq -c | sort -rn | head -5

# Calculate average response time (field 7 = response_time in custom log)
awk '{sum+=$7; n++} END {printf "avg: %.2fms\n", sum/n}' app.log

# Report disk usage by filesystem (parse df output)
df -hP | awk 'NR>1 {printf "%-30s %s used\n", $6, $5}'

# Reformat CSV — swap columns 1 and 2
awk -F, 'BEGIN{OFS=","} {print $2,$1,$3}' data.csv
```

## Piping Redirection

The Unix philosophy: small tools that do one thing well, composed via pipes. Mastering redirection turns individual commands into data pipelines.

### Redirection Operators

```bash
# stdout redirection
command > file.txt          # redirect stdout (overwrite)
command >> file.txt         # append stdout
command 2> errors.txt       # redirect stderr
command 2>&1                # merge stderr into stdout
command > file.txt 2>&1     # both stdout and stderr to file
command &> file.txt         # bash shorthand for above

# stdin redirection
command < input.txt         # feed file as stdin
command <<< "string"        # here-string (bash)
command << EOF              # heredoc
line1
line2
EOF

# /dev/null — discard
command > /dev/null 2>&1   # suppress all output
command 2>/dev/null        # suppress errors only
```

### Pipes

```bash
# Basic pipe: stdout of left → stdin of right
ls -la | grep ".log"
cat /etc/passwd | awk -F: '{print $1}'     # inefficient, use awk directly
ps aux | grep nginx | grep -v grep

# xargs — build commands from stdin
find /var/log -name "*.log" | xargs wc -l          # count lines in all logs
find /tmp -mtime +7 | xargs rm -f                  # delete old files
cat servers.txt | xargs -I{} ssh {} "uptime"       # run on each host

# tee — split: stdout goes to both pipe and file
command | tee output.txt | next_command             # log and continue
```

### Process Substitution

```bash
# <(cmd) — treat command's output as a file (bash)
diff <(sort file1.txt) <(sort file2.txt)
comm -23 <(sort list1.txt) <(sort list2.txt)   # lines only in list1

# >(cmd) — feed output to command as if it were a file
tee >(wc -l > line_count.txt) < big_file.txt
```

### Practical Pipelines

```bash
# Top 10 largest files in /var
find /var -type f -printf '%s %p\n' | sort -rn | head -10

# Count unique IPs in nginx log for today
grep "$(date +%d/%b/%Y)" /var/log/nginx/access.log | awk '{print $1}' | sort -u | wc -l

# Show only failed systemd units
systemctl list-units --state=failed --no-legend | awk '{print $1}'

# Monitor a log in real time, highlight errors
tail -f /var/log/syslog | grep --line-buffered -E "error|warn|crit"
```

> **Tip:** `grep --line-buffered` forces grep to flush after every matched line when reading from a pipe — essential for real-time monitoring. Without it, grep buffers output and you get it in chunks.

## Process Commands

Understanding how to inspect and manage processes is essential for debugging hung services, investigating CPU/memory spikes, and safely stopping background work.

See also: [systemd Services](#systemd-services) for managing processes as services.

### Viewing Processes

```bash
ps aux                        # all processes, BSD syntax (a=all, u=user, x=no-tty)
ps -ef                        # all processes, POSIX syntax (-e=all, -f=full)
ps aux | grep nginx           # filter by name
ps -p 1234 -o pid,ppid,comm,etime,rss   # specific PID, custom columns

# pgrep / pkill — search/signal by name
pgrep -l nginx                # list PIDs matching "nginx"
pgrep -u www-data             # PIDs owned by www-data
pkill -HUP nginx              # send SIGHUP to all nginx processes (graceful reload)
```

### top and htop

```bash
top              # interactive process viewer
                 # Keys: k=kill, r=renice, u=filter by user, 1=per-CPU, q=quit
                 # Press 'c' to show full command line

htop             # enhanced viewer (apt install htop)
                 # Mouse clicks work; F5=tree view, F6=sort column
```

### Signals

```bash
kill -l                  # list all signals
kill PID                 # send SIGTERM (15) — polite shutdown request
kill -9 PID              # SIGKILL — immediate termination (no cleanup)
kill -HUP PID            # SIGHUP (1) — reload config (nginx, rsyslog)
kill -STOP PID           # pause a process
kill -CONT PID           # resume a paused process

# Sending to all instances
killall nginx            # by name
pkill -f "python worker" # by full command line regex
```

| Signal | Number | Meaning |
|--------|--------|---------|
| SIGHUP | 1 | Hangup / reload config |
| SIGINT | 2 | Keyboard interrupt (Ctrl-C) |
| SIGQUIT | 3 | Quit with core dump |
| SIGKILL | 9 | Immediate kill (uncatchable) |
| SIGTERM | 15 | Graceful shutdown (default for `kill`) |
| SIGUSR1/2 | 10/12 | User-defined (app-specific) |
| SIGSTOP | 19 | Pause (uncatchable) |
| SIGCONT | 18 | Resume |

### Background Jobs and nice

```bash
# Background/foreground
command &          # start in background
jobs               # list background jobs in current shell
fg %1              # bring job 1 to foreground
bg %2              # resume stopped job 2 in background
nohup ./script.sh &  # immune to SIGHUP (survives shell logout)
disown %1          # detach job from shell (no SIGHUP on exit)

# nice / renice — CPU scheduling priority (-20=highest, 19=lowest)
nice -n 10 ./heavy_script.sh    # start with lower priority
renice 5 -p 1234                # change running process
```

### lsof and fuser

```bash
lsof -i :80                   # what's listening on port 80
lsof -p 1234                  # all files opened by PID
lsof -u www-data              # files opened by a user
lsof +D /var/log              # all processes using files under /var/log

fuser 80/tcp                  # PID using port 80
fuser -k 80/tcp               # kill it
```

> **Tip:** When a deleted file is still consuming disk space, `lsof | grep deleted` shows which process still holds the file descriptor open. Restart that process to reclaim the space.

## systemd Services

systemd is the init system on every modern Linux distro. It manages services, mounts, timers, sockets, and devices as a dependency graph. Everything that was once a shell script in `/etc/init.d` is now a unit file.

### Essential systemctl Commands

```bash
# Service lifecycle
systemctl start nginx
systemctl stop nginx
systemctl restart nginx
systemctl reload nginx            # graceful config reload (if supported)
systemctl status nginx            # status + last 10 log lines

# Enable/disable at boot
systemctl enable nginx            # create symlink in wants/
systemctl disable nginx
systemctl enable --now nginx      # enable + start in one command
systemctl is-enabled nginx        # returns enabled/disabled/static

# Inspection
systemctl list-units --type=service --state=running
systemctl list-units --state=failed
systemctl cat nginx               # print unit file
systemctl show nginx              # all properties
systemctl list-dependencies nginx # tree of dependencies
```

### Unit File Structure

Unit files live in `/etc/systemd/system/` (your files) and `/lib/systemd/system/` (package defaults). Your files take precedence.

```ini
# /etc/systemd/system/myapp.service
[Unit]
Description=My Node Application
Documentation=https://github.com/yourorg/myapp
After=network-online.target postgresql.service
Wants=network-online.target
Requires=postgresql.service

[Service]
Type=simple
User=myapp
Group=myapp
WorkingDirectory=/opt/myapp
EnvironmentFile=/etc/myapp/env
ExecStart=/usr/bin/node /opt/myapp/server.js
ExecReload=/bin/kill -HUP $MAINPID
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal
SyslogIdentifier=myapp

# Security hardening
NoNewPrivileges=yes
ProtectSystem=strict
ReadWritePaths=/var/lib/myapp /var/log/myapp
PrivateTmp=yes

[Install]
WantedBy=multi-user.target
```

```bash
# After creating/editing a unit file
systemctl daemon-reload          # reload all unit files
systemctl enable --now myapp
```

### journalctl — Reading Logs

```bash
journalctl -u nginx                    # all logs for nginx unit
journalctl -u nginx -f                 # follow in real time
journalctl -u nginx --since "1 hour ago"
journalctl -u nginx --since "2024-01-01" --until "2024-01-02"
journalctl -u nginx -n 50             # last 50 lines
journalctl -p err -u nginx            # only priority error and above
journalctl -b                         # since last boot
journalctl -b -1                      # previous boot
journalctl --disk-usage               # how much disk the journal uses
journalctl --vacuum-size=200M         # trim journal to 200 MB
```

### systemd Timers

Timers replace cron with dependency tracking, logging via journal, and precise time expressions.

```ini
# /etc/systemd/system/backup.timer
[Unit]
Description=Daily backup timer

[Timer]
OnCalendar=*-*-* 02:00:00   # every day at 02:00
Persistent=true              # run if missed while system was off
RandomizedDelaySec=10min     # spread load across fleet

[Install]
WantedBy=timers.target
```

```bash
systemctl enable --now backup.timer
systemctl list-timers                 # all timers + next trigger time
```

> **Tip:** Always run `systemctl daemon-reload` after editing any unit file. Without it, systemd uses the cached version from memory and your changes are silently ignored.

## Package Managers

Package managers are your software distribution layer. Each distro family has its own; as a DevOps engineer you'll touch all of them.

### apt (Debian / Ubuntu)

```bash
# Update package lists
sudo apt update

# Install / remove
sudo apt install nginx git curl
sudo apt install -y nginx         # non-interactive (scripts/CI)
sudo apt remove nginx             # remove but keep config
sudo apt purge nginx              # remove + delete config files
sudo apt autoremove               # remove orphaned dependencies

# Upgrade
sudo apt upgrade                  # upgrade installed packages
sudo apt full-upgrade             # upgrade + handle dependency changes
sudo DEBIAN_FRONTEND=noninteractive apt upgrade -y   # in scripts

# Search and inspect
apt search "text editor"
apt show nginx
apt list --installed | grep nginx
dpkg -L nginx                     # list files installed by package
dpkg -S /usr/sbin/nginx           # which package owns a file

# Pinning — hold a package at current version
sudo apt-mark hold nginx
sudo apt-mark showhold
```

### dnf / yum (RHEL / Rocky / Fedora)

```bash
sudo dnf install nginx
sudo dnf remove nginx
sudo dnf update
sudo dnf search nginx
sudo dnf info nginx
sudo rpm -ql nginx                # list files in installed rpm
sudo rpm -qf /usr/sbin/nginx      # which rpm owns a file

# Repos
sudo dnf repolist
sudo dnf config-manager --enable epel
```

### Alpine apk (containers / musl-based)

```bash
apk update
apk add nginx curl bash
apk del nginx
apk search nginx
apk info nginx

# Minimal Dockerfile example
FROM alpine:3.19
RUN apk add --no-cache nginx \
    && rm -rf /var/cache/apk/*
```

> **Tip:** In Dockerfiles always `apt-get update && apt-get install -y pkg` in a single `RUN` layer. Splitting them means the cached `update` layer can have stale package lists when your `install` layer is rebuilt days later — causing "package not found" errors.

## Network Commands

Networking knowledge separates engineers who can debug production incidents from those who can't. These tools let you inspect interfaces, test connectivity, trace traffic, and diagnose service failures.

### ip — Modern Network Configuration

```bash
# Addresses
ip addr show                   # all interfaces and IPs
ip addr show eth0              # specific interface
ip addr add 192.168.1.10/24 dev eth0   # add IP (temporary)
ip addr del 192.168.1.10/24 dev eth0

# Routes
ip route show                  # routing table
ip route add default via 192.168.1.1   # add default gateway
ip route get 8.8.8.8           # which route is used to reach an IP

# Links
ip link show
ip link set eth0 up
ip link set eth0 down
```

### ss — Socket Statistics (replaces netstat)

```bash
ss -tlnp          # TCP (-t) listening (-l) numeric (-n) with process (-p)
ss -ulnp          # UDP listening
ss -tnp           # all established TCP connections
ss -s             # summary statistics

# Common patterns
ss -tlnp | grep :80        # what's on port 80
ss -tnp state ESTABLISHED  # only established connections
ss -tnp dst 10.0.0.5       # connections to a specific host
```

### dig — DNS Diagnostics

```bash
dig example.com              # A record (default)
dig example.com MX           # mail exchange records
dig example.com NS           # nameservers
dig example.com TXT          # TXT records (SPF, DKIM, etc.)
dig @8.8.8.8 example.com    # query specific DNS server
dig +short example.com       # just the IPs
dig -x 93.184.216.34         # reverse DNS lookup
dig +trace example.com       # trace full resolution chain
```

### curl — HTTP Testing

```bash
curl https://api.example.com/health          # GET request
curl -I https://example.com                  # headers only (HEAD)
curl -X POST -H "Content-Type: application/json" \
     -d '{"key":"value"}' https://api.example.com/data
curl -o /tmp/file.tar.gz https://example.com/file.tar.gz  # download
curl -L https://short.url/abc               # follow redirects
curl -w "%{http_code} %{time_total}s\n" -o /dev/null -s https://example.com  # timing
curl --resolve example.com:443:10.0.0.5 https://example.com  # test before DNS propagation
```

### Other Essential Network Tools

```bash
# ping / traceroute / mtr
ping -c 4 8.8.8.8
traceroute 8.8.8.8
mtr 8.8.8.8           # real-time traceroute (apt install mtr)

# nc (netcat) — the network Swiss Army knife
nc -zv host 22             # port scan / test connectivity
nc -l 9000                 # listen on port 9000
echo "PING" | nc -u host 514   # UDP test

# tcpdump — packet capture
sudo tcpdump -i eth0 port 80 -w capture.pcap     # capture to file
sudo tcpdump -i any host 10.0.0.5 and tcp        # filter by host+protocol
sudo tcpdump -r capture.pcap -A                  # read and print ASCII

# watch — repeat a command
watch -n 2 ss -tlnp        # refresh every 2 seconds
```

> **Tip:** `ss -tlnp` is your first command when a service "can't start" — it shows exactly which ports are already in use and by which PID. Then `systemctl status` that PID to find the conflict.

## SSH Secure Shell Critical

SSH is how you access every cloud VM, container host, and remote server. Beyond basic login, it gives you encrypted tunnels, file transfer, and agent forwarding. Misconfiguring it creates security holes; understanding it properly lets you build zero-trust access patterns.

See also: [File Permissions Ownership](#file-permissions-ownership) — SSH enforces strict permission checks on key files.

### Key-Based Authentication

```bash
# Generate a key pair (Ed25519 is faster and more secure than RSA)
ssh-keygen -t ed25519 -C "pushkar@work" -f ~/.ssh/id_ed25519

# Copy public key to server
ssh-copy-id -i ~/.ssh/id_ed25519.pub user@server
# or manually:
cat ~/.ssh/id_ed25519.pub | ssh user@server 'mkdir -p ~/.ssh && cat >> ~/.ssh/authorized_keys'

# Permission requirements (SSH will refuse with wrong perms)
chmod 700 ~/.ssh
chmod 600 ~/.ssh/id_ed25519         # private key
chmod 644 ~/.ssh/id_ed25519.pub     # public key
chmod 600 ~/.ssh/authorized_keys
chmod 644 ~/.ssh/known_hosts

# Start ssh-agent and load key
eval "$(ssh-agent -s)"
ssh-add ~/.ssh/id_ed25519
ssh-add -l                          # list loaded keys
```

### ~/.ssh/config

The client config file eliminates typing long hostnames and options every time:

```sshconfig
# ~/.ssh/config

Host bastion
    HostName 203.0.113.10
    User ec2-user
    IdentityFile ~/.ssh/aws-key.pem
    ServerAliveInterval 60

Host prod-db
    HostName 10.0.1.50             # private IP
    User ubuntu
    ProxyJump bastion              # tunnel through bastion
    IdentityFile ~/.ssh/id_ed25519

Host dev-*
    User developer
    IdentityFile ~/.ssh/dev-key
    StrictHostKeyChecking no       # only for throwaway dev VMs
    UserKnownHostsFile /dev/null
```

```bash
ssh bastion            # uses config above
ssh prod-db            # automatically tunnels via bastion
```

### SSH Tunnels

```bash
# Local port forwarding: access remote service on your local port
ssh -L 5432:db-host:5432 bastion     # connect to postgresql via bastion
# Now: psql -h localhost -p 5432

# Remote port forwarding: expose local port on the remote server
ssh -R 8080:localhost:3000 server    # server:8080 → your localhost:3000

# Dynamic (SOCKS proxy): route browser traffic through the tunnel
ssh -D 1080 bastion                  # configure browser to use SOCKS5 localhost:1080

# Background / non-interactive
ssh -fNL 5432:db:5432 bastion       # -f = background, -N = no command
```

### scp and rsync

```bash
# scp — simple copy
scp file.txt user@server:/tmp/
scp -r user@server:/var/www/ ./backup/
scp -P 2222 file.txt user@server:/tmp/    # custom port

# rsync — incremental sync (preferred for large transfers)
rsync -avz /local/dir/ user@server:/remote/dir/    # sync to remote
rsync -avz --delete /src/ /dst/                     # mirror (delete extra)
rsync -avz --exclude '.git' --exclude 'node_modules' ./ server:/opt/app/
rsync -e "ssh -i ~/.ssh/key.pem" /file user@host:/dest/
```

### sshd — Server Configuration Hardening

```bash
sudo nano /etc/ssh/sshd_config
```

```sshconfig
# /etc/ssh/sshd_config (key hardening settings)
Port 2222                          # non-standard port (minor obscurity)
PermitRootLogin no                 # never allow root login
PasswordAuthentication no          # key-only (most important setting)
PubkeyAuthentication yes
AuthorizedKeysFile .ssh/authorized_keys
AllowUsers pushkar deploy
MaxAuthTries 3
LoginGraceTime 20
ClientAliveInterval 300
ClientAliveCountMax 2
X11Forwarding no
AllowTcpForwarding yes             # needed for tunnels
```

```bash
sudo sshd -t                        # test config syntax
sudo systemctl reload sshd          # apply without dropping connections
```

> **Tip:** Always test your sshd config with `sshd -t` and keep an existing SSH session open while applying changes. If you lock yourself out of a cloud VM, you'll need console access or a rescue snapshot.

## Bash Fundamentals

Bash (**Bourne Again SHell**) is the default interactive shell on Ubuntu, Debian, RHEL derivatives, and most Linux distros. As a DevOps engineer, bash is your daily driver — every CI pipeline, every Dockerfile `RUN`, every cron job, every `systemd` `ExecStart` is some flavour of shell glue.

> **Note:** Ubuntu's `/bin/sh` is actually `dash` (Debian Almquist Shell) — a POSIX-compliant shell with *no* bash extensions. Scripts written assuming bash but invoked as `sh script.sh` will fail on `[[ ]]`, arrays, or `$(())` arithmetic. Always be explicit about your shebang.

### The Shebang and Running Scripts

```bash
#!/bin/bash            # Absolute path — works on virtually every Linux box
#!/usr/bin/env bash    # Looks up bash via PATH — portable to macOS/BSD
```

| Command | Shell | Needs +x? | Variables persist in parent? |
|---------|-------|-----------|------------------------------|
| `./script.sh` | Subshell (from shebang) | Yes | No |
| `bash script.sh` | New bash subshell | No | No |
| `source script.sh` or `. script.sh` | Current shell | No | Yes |

### Variables

The cardinal rule: **no spaces around the `=` sign**. Always quote when expanding to handle spaces and globs safely.

```bash
NAME="Pushkar"
GREETING="Hello, $NAME"
echo "${GREETING}!"                   # braces disambiguate variable name

# Parameter expansion
echo "${UNSET_VAR:-default}"         # use default if unset/empty
echo "${MAYBE:=set_now}"             # assign default if unset (sticky)
echo "${REQUIRED:?must be set}"      # error and exit if unset
echo "${NAME:+exists}"               # expand to 'exists' only if set

FILE="backup.tar.gz"
echo "${#FILE}"                      # 13  (length)
echo "${FILE%.gz}"                   # backup.tar  (strip shortest suffix)
echo "${FILE%%.*}"                   # backup       (strip longest suffix)
echo "${FILE/tar/zip}"               # backup.zip.gz (replace first match)
```

### Positional Parameters

| Variable | Meaning |
|----------|---------|
| `$0` | Script name |
| `$1` ... `$9` | First nine positional arguments |
| `$#` | Number of arguments |
| `"$@"` | All args, each preserved as one quoted word |
| `$$` | PID of current shell |
| `$?` | Exit code of last command (0 = success) |
| `$!` | PID of last background process |

### Bash Strict Mode

Put this at the top of every serious script:

```bash
set -euo pipefail
IFS=$'\n\t'
```

| Flag | What it does |
|------|-------------|
| `-e` (errexit) | Exit immediately when any command returns non-zero |
| `-u` (nounset) | Treat references to unset variables as errors |
| `-o pipefail` | Pipeline exit code is the rightmost non-zero status |
| `IFS=$'\n\t'` | Restrict word-splitting to newlines/tabs |

### Arithmetic and Input

```bash
echo $((2 + 3 * 4))            # 14  — recommended form
x=5
((x++))                         # x is now 6
echo "scale=2; 7/3" | bc       # floating point: 2.33

read -p "Your name: " name
read -s -p "Password: " pass   # silent input
read -t 10 -p "Quick: " ans    # 10-second timeout
```

> **Tip:** Use `source` only for shell *configuration* files (`.bashrc`, env loaders). Use `./script.sh` for everything else — sourcing arbitrary scripts can pollute your interactive shell if they call `exit` or `set -e`.

## Bash Control Flow

Control flow in bash looks unfamiliar at first — `then`, `fi`, `do`, `done`, double brackets. It's because the shell parses commands by whitespace, so keywords need clear separators. Once you internalize the patterns, complex automation becomes muscle memory.

### if / elif / else

```bash
if [[ "$USER" == "root" ]]; then
    echo "Running as root"
elif [[ "$USER" == "pushkar" ]]; then
    echo "Hi Pushkar"
else
    echo "Unknown user: $USER"
fi

# if on any command's exit code
if grep -q "ERROR" /var/log/syslog; then
    echo "Errors found in syslog"
fi

if systemctl is-active --quiet nginx; then
    echo "nginx is running"
fi
```

> **Tip:** Use `[[ ]]` in bash scripts always. Use `[ ]` only when writing a portable `/bin/sh` script. Inside `[[ ]]`, do **not** quote the right side of `=~` — quoting turns the regex into a literal string.

### Comparison Operators

| Integer (`[[ ]]` or `(( ))`) | String (`[[ ]]`) | Meaning |
|------------------------------|------------------|---------|
| `-eq` | `==` | Equal |
| `-ne` | `!=` | Not equal |
| `-lt` | `<` | Less than |
| `-gt` | `>` | Greater than |
| — | `-z STR` | String is empty |
| — | `-n STR` | String is non-empty |
| — | `STR =~ REGEX` | String matches ERE regex |

### File Test Operators

| Operator | True if... |
|----------|-----------|
| `-e FILE` | File exists (any type) |
| `-f FILE` | Regular file |
| `-d DIR` | Directory |
| `-r FILE` | Readable |
| `-w FILE` | Writable |
| `-x FILE` | Executable |
| `-s FILE` | Exists and non-empty |

### case Statement

```bash
case "$action" in
    start)
        echo "Starting..."
        ;;
    stop|halt)
        echo "Stopping..."
        ;;
    *.log)
        echo "That looks like a log file"
        ;;
    *)
        echo "Unknown action: $action"
        exit 1
        ;;
esac
```

### Loops

```bash
# for-in with a list
for env in dev staging prod; do
    echo "Deploying to $env"
done

# Brace expansion range
for i in {1..10}; do echo "loop $i"; done

# Glob iteration — always quote the variable
for f in /var/log/*.log; do
    [[ -f "$f" ]] || continue
    echo "Processing $f"
done

# C-style for
for ((i=0; i<5; i++)); do
    echo "index $i"
done

# while — read line by line (safest pattern)
while IFS= read -r line; do
    echo "> $line"
done < /etc/hosts

# until with retry
attempts=0
until curl -sf https://api.example.com/health > /dev/null; do
    ((attempts++))
    [[ $attempts -ge 5 ]] && { echo "giving up"; exit 1; }
    sleep 2
done
```

> **Warning:** `for f in $(ls *.log)` is a classic anti-pattern. If filenames have spaces, they get split. Use `for f in *.log` (glob directly) instead.

### Ten Practical Examples

**1. Retry with exponential backoff:**

```bash
URL="$1"
MAX_TRIES=5
DELAY=1
for ((try=1; try<=MAX_TRIES; try++)); do
    if curl -sfL "$URL" -o /tmp/out; then
        echo "Success on attempt $try"
        exit 0
    fi
    echo "Attempt $try failed, sleeping ${DELAY}s..."
    sleep "$DELAY"
    DELAY=$((DELAY * 2))
done
echo "All $MAX_TRIES attempts failed" >&2
exit 1
```

**2. Wait for a port to be open (Docker Compose pattern):**

```bash
HOST=db
PORT=5432
until (echo > /dev/tcp/"$HOST"/"$PORT") 2>/dev/null; do
    echo "Waiting for $HOST:$PORT..."
    sleep 1
done
echo "$HOST:$PORT is up"
```

**3. Read a CSV line-by-line:**

```bash
while IFS=, read -r name email role; do
    [[ "$name" == "name" ]] && continue   # skip header
    echo "User: $name <$email> ($role)"
done < users.csv
```

**4. Interactive menu:**

```bash
while true; do
    cat <<MENU
1) Show uptime
2) Show disk
q) Quit
MENU
    read -p "Choice: " ch
    case "$ch" in
        1) uptime ;;
        2) df -h ;;
        q|Q) break ;;
        *) echo "Invalid choice" ;;
    esac
done
```

> **Interview tip:** A common screening question is "write a script to find the 5 largest files in a directory tree." Answer: `find /path -type f -printf '%s %p\n' | sort -rn | head -5`.

## Real DevOps Bash Scripts

Below are complete, working scripts you would actually run in production. Each uses strict mode, functions, error handling, and proper logging. They cover the automation patterns you will encounter repeatedly as a DevOps engineer.

> **Real world:** Every script here is based on patterns used in production: locking, retries, Slack alerts, S3 upload, rollback on health-check fail. Tweak the paths and service names for your environment.

### Script 1: server_health_check.sh

One-shot dashboard of CPU, memory, disk, and top processes. Exits non-zero if any threshold is breached so it can drive alerting from cron.

```bash
#!/usr/bin/env bash
# server_health_check.sh — quick host health snapshot
set -euo pipefail
IFS=$'\n\t'

CPU_WARN=80
MEM_WARN=85
DISK_WARN=80
EXIT_CODE=0

hr() { printf '%s\n' "------------------------------------------------------------"; }

header() {
    hr
    printf '%s @ %s\n' "$(hostname -f)" "$(date +'%F %T %Z')"
    printf 'kernel: %s   uptime:%s\n' "$(uname -r)" "$(uptime -p)"
    hr
}

cpu_section() {
    local idle1 total1 idle2 total2 usage
    read -r _ a b c idle1 _ < /proc/stat
    total1=$((a + b + c + idle1))
    sleep 1
    read -r _ a b c idle2 _ < /proc/stat
    total2=$((a + b + c + idle2))
    usage=$(( 100 * ((total2 - total1) - (idle2 - idle1)) / (total2 - total1) ))
    printf 'CPU usage:  %d%%   load: %s\n' "$usage" "$(cut -d' ' -f1-3 /proc/loadavg)"
    (( usage > CPU_WARN )) && { echo "  WARN: cpu > ${CPU_WARN}%"; EXIT_CODE=1; }
}

mem_section() {
    local total used pct
    read -r _ total used _ < <(free -m | awk '/^Mem:/')
    pct=$(( 100 * used / total ))
    printf 'Memory:     %d / %d MiB  (%d%%)\n' "$used" "$total" "$pct"
    (( pct > MEM_WARN )) && { echo "  WARN: memory > ${MEM_WARN}%"; EXIT_CODE=1; }
}

disk_section() {
    printf 'Disks:\n'
    df -hP -x tmpfs -x devtmpfs | awk 'NR>1 { printf "  %-25s %5s used of %-5s on %s\n", $1, $5, $2, $6 }'
    while read -r usage mount; do
        (( usage > DISK_WARN )) && { echo "  WARN: $mount > ${DISK_WARN}% (${usage}%)"; EXIT_CODE=1; }
    done < <(df -P -x tmpfs -x devtmpfs | awk 'NR>1 { gsub("%","",$5); print $5, $6 }')
}

main() {
    header
    cpu_section
    mem_section
    disk_section
    hr
    exit "$EXIT_CODE"
}

main "$@"
```

### Script 2: deploy_app.sh

Git pull, npm build, systemd restart, health check, and automatic rollback on failure. Uses a lockfile to prevent concurrent deploys.

```bash
#!/usr/bin/env bash
# deploy_app.sh — pull, build, restart, verify, rollback on fail
set -euo pipefail

APP_DIR="/opt/myapp"
SERVICE="myapp"
HEALTH_URL="http://127.0.0.1:3000/health"
LOCK="/var/run/deploy_${SERVICE}.lock"
HEALTH_TRIES=20

log() { printf '[%s] %s\n' "$(date +%FT%T)" "$*"; }
die() { log "FATAL: $*" >&2; exit 1; }

# Single-instance lock
exec 9> "$LOCK"
flock -n 9 || die "another deploy is in progress"

cd "$APP_DIR" || die "$APP_DIR not found"
OLD_SHA=$(git rev-parse HEAD)
log "current SHA: $OLD_SHA"

git fetch --quiet origin
git reset --hard origin/main
NEW_SHA=$(git rev-parse HEAD)
[[ "$OLD_SHA" == "$NEW_SHA" ]] && { log "already at latest, no-op"; exit 0; }
log "new SHA: $NEW_SHA"

rollback() {
    log "ROLLING BACK to $OLD_SHA"
    git reset --hard "$OLD_SHA"
    npm ci --omit=dev && npm run build || true
    systemctl restart "$SERVICE"
    die "deploy failed, rolled back"
}

npm ci --omit=dev || rollback
npm run build || rollback
systemctl restart "$SERVICE" || rollback

for ((i=1; i<=HEALTH_TRIES; i++)); do
    if curl -fsS -m 3 "$HEALTH_URL" > /dev/null; then
        log "healthy after $i probe(s)"
        log "deploy OK: $OLD_SHA -> $NEW_SHA"
        exit 0
    fi
    sleep 2
done

rollback
```

### Script 3: service_monitor.sh

Watchdog for systemd units. Restarts down services and posts to Slack on incident. Designed for a cron-every-minute or systemd timer.

```bash
#!/usr/bin/env bash
# service_monitor.sh — auto-restart services and Slack on failure
set -euo pipefail

SERVICES=(nginx postgresql redis-server docker)
MAX_RESTART=3
SLACK_URL="${SLACK_WEBHOOK_URL:-}"
HOST=$(hostname -f)

log() { printf '[%s] %s\n' "$(date +%FT%T)" "$*"; }

slack() {
    [[ -z "$SLACK_URL" ]] && { log "SLACK_WEBHOOK_URL not set, skipping notify"; return; }
    local msg="$1"
    curl -fsS -m 5 -X POST -H 'Content-Type: application/json' \
        --data "{\"text\":\":rotating_light: [$HOST] $msg\"}" \
        "$SLACK_URL" > /dev/null || log "WARN: slack post failed"
}

check_service() {
    local svc="$1"
    if systemctl is-active --quiet "$svc"; then
        log "$svc: OK"; return 0
    fi
    log "$svc: DOWN — attempting restart"
    local attempt=1
    while ((attempt <= MAX_RESTART)); do
        systemctl restart "$svc" || true
        sleep $((attempt * 2))
        if systemctl is-active --quiet "$svc"; then
            log "$svc: recovered on attempt $attempt"
            slack "$svc was DOWN, restarted successfully on attempt $attempt"
            return 0
        fi
        ((attempt++))
    done
    log "$svc: FAILED after $MAX_RESTART attempts"
    slack "$svc is DOWN and failed to restart after $MAX_RESTART attempts"
    return 1
}

failures=0
for s in "${SERVICES[@]}"; do
    check_service "$s" || ((failures++))
done
exit "$failures"
```

### Script 4: log_rotate.sh

Minimal logrotate alternative for ad-hoc log directories. Gzips logs older than N days, deletes anything older than M days. Safe for cron.

```bash
#!/usr/bin/env bash
# log_rotate.sh — compress old logs, delete very old ones
set -euo pipefail

LOG_DIR="${1:?Usage: $0 <dir> [compress_days] [delete_days]}"
COMPRESS_DAYS="${2:-7}"
DELETE_DAYS="${3:-30}"

log() { printf '[%s] %s\n' "$(date +%FT%T)" "$*"; }
[[ -d "$LOG_DIR" ]] || { log "FATAL: $LOG_DIR not found"; exit 1; }
log "Rotating in $LOG_DIR (gzip >${COMPRESS_DAYS}d, delete >${DELETE_DAYS}d)"

compressed=0
while IFS= read -r -d '' f; do
    gzip -- "$f"
    ((compressed++))
done < <(find "$LOG_DIR" -type f -name '*.log' -mtime +"$COMPRESS_DAYS" -print0)
log "Compressed $compressed file(s)"

deleted=$(find "$LOG_DIR" -type f \( -name '*.log' -o -name '*.log.gz' \) \
            -mtime +"$DELETE_DAYS" -print -delete | wc -l)
log "Deleted $deleted file(s)"
```

### Script 5: log_analysis.sh

Parse nginx access logs for top IPs, top URLs, and 4xx/5xx counts. Drop-in incident-response tool.

```bash
#!/usr/bin/env bash
# log_analysis.sh — top IPs, URLs, status code breakdown from nginx logs
set -euo pipefail

LOG="${1:-/var/log/nginx/access.log}"
TOP_N="${2:-10}"

[[ -r "$LOG" ]] || { echo "cannot read $LOG" >&2; exit 1; }

if [[ "$LOG" == *.gz ]]; then READ="zcat"; else READ="cat"; fi

echo "=== Summary of $LOG ==="
TOTAL=$($READ "$LOG" | wc -l)
echo "Total requests: $TOTAL"
echo

echo "--- Top $TOP_N IPs ---"
$READ "$LOG" | awk '{ print $1 }' | sort | uniq -c | sort -rn | head -n "$TOP_N"

echo
echo "--- Top $TOP_N URLs ---"
$READ "$LOG" | awk '{ print $7 }' | sort | uniq -c | sort -rn | head -n "$TOP_N"

echo
echo "--- Status code breakdown ---"
$READ "$LOG" | awk '{
    code=$9
    counts[code]++
    if (code+0 >= 400 && code+0 < 500) c4xx++
    else if (code+0 >= 500) c5xx++
}
END {
    for (c in counts) printf "%5d %s\n", counts[c], c | "sort -rn"
    close("sort -rn")
    printf "\nTotal 4xx: %d\nTotal 5xx: %d\n", c4xx+0, c5xx+0
}'
```

### Key Patterns to Internalize

**Functions and libraries:** Split helpers into `lib/common.sh` and source it. Define `log()`, `warn()`, and `die()` functions in every serious script.

**trap for cleanup:**

```bash
TMPDIR=$(mktemp -d)
cleanup() { rm -rf "$TMPDIR"; }
trap cleanup EXIT
trap 'echo "Interrupted"; exit 130' INT TERM
```

**getopts for argument parsing:**

```bash
while getopts "e:v:dh" opt; do
    case "$opt" in
        e) ENV="$OPTARG" ;;
        v) VERSION="$OPTARG" ;;
        d) DRY_RUN=1 ;;
        h) usage ;;
        *) usage ;;
    esac
done
```

> **Interview tip:** When asked "design a deploy script," walk through: (1) idempotency, (2) lockfile to prevent concurrent runs, (3) capture old state for rollback, (4) health check after restart, (5) automatic rollback path, (6) logging and notifications. The `deploy_app.sh` above hits all six — internalize the pattern.

> **Warning:** Never write `rm -rf "$VAR/"` without `set -u` and an explicit non-empty check. Empty variable + slash = root-level delete. Always: `[[ -n "${DIR:-}" && -d "$DIR" ]] || die "bad DIR"` before any destructive operation.

---
title: "Linux for DevOps Engineers"
description: "A comprehensive guide to Linux fundamentals for DevOps: filesystem, permissions, process management, systemd, networking, SSH, bash scripting, and more."
track: "linux"
order: 1
difficulty: "beginner"
updatedDate: "2026-06-27"
tags: ["linux", "bash", "systemd", "ssh", "devops", "cli"]
relatedTools: ["regex-log-tester", "cron-expression-tester", "base64-encoder-decoder", "hash-generator", "reverse-dns-ptr"]
seoTitle: "Linux for DevOps Engineers — Complete Guide"
metaDescription: "Master Linux for DevOps: filesystem hierarchy, permissions, process management, systemd services, SSH hardening, package managers, networking, and production bash scripting."
faqs:
  - q: "Do you need to learn Linux for DevOps?"
    a: "Yes — the overwhelming majority of servers, containers, and CI runners are Linux. Comfort with the shell, the filesystem, permissions, processes, and systemd is foundational for any DevOps role."
  - q: "What Linux skills do DevOps engineers need most?"
    a: "Navigating the filesystem, file permissions and ownership, text processing (grep/awk/sed), managing services with systemd, package management, networking and SSH, and bash scripting for automation."
  - q: "How do Linux file permissions work?"
    a: "Each file has read/write/execute bits for owner, group, and others. They can be set symbolically (chmod u+x) or with octal digits (chmod 755), where 4=read, 2=write, 1=execute summed per class."
  - q: "How do I use grep, awk, and sed for log analysis?"
    a: "grep filters lines by pattern, awk extracts and computes over columns, and sed edits streams. Chaining them through pipes is the core log-wrangling workflow on Linux."
  - q: "How do I manage services with systemd?"
    a: "Use systemctl to start, stop, enable, and check the status of units, and journalctl to read their logs. Unit files in /etc/systemd/system define how services run."
  - q: "How do I SSH into a remote Linux server securely?"
    a: "Use key-based authentication instead of passwords, disable root login, change defaults in sshd_config, and use an SSH agent. ssh user@host connects; scp/rsync transfer files."
---

Linux is the operating system under every Docker container, every Kubernetes node, and the majority of cloud VMs. Before you can deploy, debug, or automate anything in a modern infrastructure stack, you need to be comfortable at the shell. This guide takes you from the absolute fundamentals — how Linux thinks about files and processes — through the tools DevOps engineers reach for daily: permissions, grep/awk/sed, systemd, SSH, package managers, network commands, and production-grade bash scripting.

## Introduction to Linux

Imagine you bought a brand new car. You see the dashboard, the steering wheel, the leather seats, the touchscreen infotainment system. But what actually *moves* the car? The engine. You rarely open the hood, you never see it during your daily drive, yet without it, nothing works. **Linux is exactly that engine** for the entire modern internet. Every time you scroll Instagram, order from Zomato, watch Netflix, or pay through UPI — somewhere in a datacenter, a Linux server is doing the heavy lifting. You never see it. You never think about it. But it's powering 96% of the world's digital infrastructure in 2026.

As a React developer for over a decade, you've been writing code that *runs on top of* this engine. You've been the person designing the dashboard. Now you're about to learn what's under the hood — and that's exactly what the highest-paid DevOps engineers in India know cold. The transition from frontend to DevOps is one of the most valuable career moves in tech today, because you already understand how applications behave; now you'll learn how they live, breathe, scale, and recover at the infrastructure level.

> **Real world:** Think of Linux like the Indian Railways network. You don't see the tracks, signals, or control rooms when you travel — but they're the reason 13,000+ trains run every day moving 8 billion passengers a year. Linux is the railway network of the internet. AWS, Azure, GCP, Netflix, Google, Facebook, WhatsApp, Paytm, Flipkart — sab Linux par chalte hain.

### Why Linux Dominates DevOps in 2026

If you walked into any tech company in Bengaluru, Hyderabad, Pune, or Gurgaon today and asked their SRE team what operating system runs production, the answer is almost universally Linux. Here's why this domination is now absolute:

- **~96% of public cloud servers run Linux** — AWS EC2, Azure VMs, Google Compute Engine. Even Microsoft, which makes Windows, runs the majority of Azure on Linux.
- **100% of containers use the Linux kernel** — Docker, Podman, containerd all rely on Linux namespaces and cgroups. Even "Windows containers" running on Docker Desktop spin up a hidden Linux VM underneath.
- **Every single Kubernetes node is Linux** — kubelet, kube-proxy, CNI plugins, the entire control plane is designed for Linux first.
- **All major CI/CD runners are Linux** — GitHub Actions, GitLab Runners, Jenkins agents, ArgoCD, CircleCI default to Linux.
- **Every observability stack runs on Linux** — Prometheus, Grafana, Loki, Elastic, Datadog agents, OpenTelemetry collectors.
- **Edge computing and IoT** — Raspberry Pi, AWS Greengrass, Azure IoT Edge, all Linux.

For a React developer transitioning to DevOps, this means one undeniable truth: **you cannot avoid Linux**. It's not optional anymore. The good news? You already have Ubuntu 24.04 installed, which is the gold standard for DevOps learning in 2026.

### Linux vs Windows vs macOS: The Honest Comparison

| Feature | Linux | Windows | macOS |
|---|---|---|---|
| **Cost** | Free (most distros) | ~₹12,000 per license | Bundled with Apple hardware (₹1L+) |
| **Customization** | Unlimited — change anything | Limited to UI/registry | Restricted — Apple's way only |
| **CLI Power** | Native, world-class (bash, zsh) | Catching up (PowerShell, WSL2) | Strong (Unix-based, zsh default) |
| **Server Use** | ~96% of internet servers | ~3% (legacy enterprise AD) | Negligible (not a server OS) |
| **Security** | Excellent (permissions, SELinux) | Improving but still targeted | Strong (sandboxed by default) |
| **Package Mgmt** | apt, dnf, pacman, snap, flatpak | winget, choco, MSI installers | brew (community), App Store |
| **Source Code** | 100% open source (GPL) | Proprietary (closed) | XNU kernel partially open, OS closed |
| **DevOps Fit** | The de-facto standard | Niche (Windows containers) | Good for local dev only |

### The Linux Distro Universe

One of the most confusing things for beginners is the sheer number of Linux distributions ("distros"). They're all Linux at the core (same kernel), but they package the system differently — different installers, different package managers, different defaults, different philosophies. Here's the map you need:

| Distro | Base | Package Mgr | Best For | DevOps Use |
|---|---|---|---|---|
| **Ubuntu** | Debian | apt | Development, learning, desktops | Dev laptops, CI runners, EC2 default |
| **RHEL** | Fedora | dnf/yum | Enterprise production | Banks, telco, govt, regulated industries |
| **CentOS Stream** | RHEL upstream | dnf | Testing RHEL features early | Rolling preview of RHEL |
| **Debian** | Independent | apt | Stable servers, rock-solid uptime | Long-running production servers |
| **Alpine** | Independent (musl) | apk | Containers — only 5MB base! | 99% of Docker base images |
| **Rocky/AlmaLinux** | RHEL clones | dnf | Free RHEL alternative | Post-CentOS production replacement |
| **Arch Linux** | Independent | pacman | Advanced users, customization | Personal workstations (rarely prod) |
| **Amazon Linux 2023** | Fedora-based | dnf | AWS-optimized workloads | Default EC2/ECS/Lambda runtime |

> **Note:** Which distro do real DevOps engineers actually use?
> - **Dev laptop:** Ubuntu 24.04 LTS or macOS
> - **Production servers:** RHEL, Amazon Linux 2023, Rocky Linux, or Ubuntu Server LTS
> - **Docker base images:** Alpine (tiny, fast), or distroless/Debian-slim
> - **Kubernetes nodes:** Ubuntu, Bottlerocket (AWS), Flatcar, or Talos Linux
>
> Master Ubuntu first because `apt`-based skills transfer 80% to Debian and Kali. Then learn `dnf` for RHEL/Rocky/Amazon Linux. That covers ~95% of real-world DevOps scenarios.

### Kernel vs Operating System

This is the single most common interview blunder. Junior candidates confuse "kernel" and "OS" all the time.

**The Linux Kernel** is the core program — roughly **30+ million lines of C code** — written originally by Linus Torvalds in 1991 when he was a 21-year-old student in Helsinki, Finland. The kernel is just the engine — it talks to the CPU, RAM, disks, network cards, and so on. By itself, the kernel cannot give you a usable computer.

**An Operating System** is the kernel *plus* all the surrounding software needed to make it usable: the GNU utilities (ls, cat, grep, sed, awk), the shell (bash, zsh), system libraries (glibc), package managers (apt, dnf), and applications. So when you say "Linux," what you usually mean is "GNU/Linux."

```bash
$ uname -r
6.8.0-31-generic
$ cat /etc/os-release | head -3
PRETTY_NAME="Ubuntu 24.04 LTS"
NAME="Ubuntu"
VERSION_ID="24.04"
$ uname -a
Linux dev-laptop 6.8.0-31-generic #31-Ubuntu SMP x86_64 GNU/Linux
```

> **Interview tip:** If an interviewer asks "What is Linux?" — never just say "an operating system." Say: "Linux is technically the kernel — a monolithic Unix-like kernel created by Linus Torvalds in 1991. When people say 'Linux,' they usually mean GNU/Linux, which is the kernel plus the GNU userland utilities, a shell, system libraries like glibc, and applications, all packaged by a distribution like Ubuntu or RHEL."

### Open Source and the GPL

Linux is released under the **GNU General Public License version 2 (GPLv2)**. The GPL guarantees four fundamental freedoms (numbered 0 through 3, because programmers count from zero):

- **Freedom 0:** Run the program for any purpose, without restriction.
- **Freedom 1:** Study how the program works and modify it. Source code access is required.
- **Freedom 2:** Redistribute copies to help others.
- **Freedom 3:** Distribute your modified versions so the community benefits.

Why do massive corporations like Google, Meta, Amazon, and Microsoft pour billions into a "free" project? Because open-source Linux gives them zero licensing cost at scale, total customizability, security through transparency, vendor independence, and faster innovation.

### The DevOps Salary Reality in India (2026)

| Level | Experience | Salary Range (INR) | Typical Skills |
|---|---|---|---|
| **Junior DevOps** | 0-2 years | ₹6 - 12 LPA | Linux basics, Git, Docker, basic CI/CD, one cloud |
| **Mid DevOps / SRE** | 2-5 years | ₹15 - 25 LPA | Kubernetes, Terraform, Prometheus, scripting, multi-cloud |
| **Senior DevOps / SRE** | 5-8 years | ₹30 - 50 LPA | Architecture, security, cost optimization, on-call leadership |
| **Lead / Staff / Principal** | 8-12+ years | ₹50 - 80+ LPA | Platform engineering, multi-team coordination, strategy |
| **DevOps Manager / Director** | 10+ years | ₹70 LPA - 1.5 Cr+ | People management, business alignment, P&L |

## Linux Architecture

Now that you know *what* Linux is, let's open the hood and look at *how* it actually works. Linux follows a layered architecture — each layer has a specific job, and they communicate through well-defined interfaces. If you understand this architecture clearly, you'll debug production issues 10x faster than engineers who only know commands by rote.

### The Kernel: The Brain of the System

The Linux kernel is the lowest software layer above the hardware. It has six core responsibilities that you must internalize:

1. **Process Management:** Creating, scheduling, pausing, killing processes. The kernel decides which process gets CPU time. Tools like `ps`, `top`, `htop`, `kill` all interact with this subsystem.
2. **Memory Management:** Allocating RAM to processes, managing virtual memory, paging, swapping. The OOM (Out of Memory) killer lives here.
3. **Device Drivers:** Translating generic OS calls into hardware-specific signals — GPU, NIC, SSD, USB, Bluetooth all speak through drivers loaded as kernel modules.
4. **Filesystem Management:** Reading, writing, organizing data on disk through filesystems like ext4, xfs, btrfs, zfs, overlayfs (used by Docker).
5. **Networking:** The entire TCP/IP stack, sockets, packet routing, iptables/nftables — all kernel code.
6. **Security & Permissions:** User IDs, group IDs, file permissions, capabilities, SELinux/AppArmor, seccomp filters (used by Docker for sandboxing).

### Shells: Your Window to the Kernel

You don't talk to the kernel directly — you talk to a **shell**, and the shell talks to the kernel. A shell is just a program that reads commands, interprets them, and asks the kernel to do work via system calls.

| Shell | Default On | Strengths | Weaknesses | DevOps Verdict |
|---|---|---|---|---|
| **Bash** | Ubuntu, RHEL, Debian, Alpine (ash) | Universal, scripting, POSIX compliance | Plain UX, no autosuggestions | Must master — every server has it |
| **Zsh** | macOS Catalina+ | Themes (oh-my-zsh), autosuggestions, plugins | Slightly heavier, not on servers | Great for daily dev laptop use |
| **Fish** | None default | Friendly UX, autosuggest out of the box | Non-POSIX — scripts don't transfer | Personal use only, never scripts |
| **Dash** | Ubuntu's /bin/sh | Tiny, fast, POSIX-strict | Minimal features | Used by Ubuntu boot scripts |
| **PowerShell** | Windows | Object pipeline, cross-platform now | Heavy, alien to Unix folk | Skip unless Windows-shop |

> **Tip:** Use Zsh + oh-my-zsh on your Ubuntu dev laptop for daily comfort, but always write your shell scripts in **Bash** (with `#!/usr/bin/env bash`) so they run on every server you'll ever touch. Production servers don't have your fancy zsh setup.

### System Libraries and Utilities

Between user programs and the kernel sit two crucial layers. **System Libraries** — the most important is `glibc` (GNU C Library). When your Node.js process needs to open a file, it calls a C function like `fopen()` in glibc, which translates to the kernel's `open()` system call. Alpine Linux uses `musl libc` instead, which is why Alpine images are smaller but sometimes have subtle compatibility quirks.

**System Utilities** — the GNU `coreutils` package gives you `ls`, `cp`, `mv`, `rm`, `cat`, `echo`, `mkdir`, `chmod`, `chown`, and ~100 more. Then there's `util-linux`, `findutils`, `grep`, `sed`, `awk`, `tar`, `gzip` — collectively known as "the Unix toolbox."

### User Space vs Kernel Space

Modern CPUs have two privilege modes: **kernel mode** (ring 0 on x86) where code can do *anything*, and **user mode** (ring 3) where code is sandboxed and must ask the kernel (via system calls) to do anything dangerous. Your React app, Node.js, Python scripts, even databases like PostgreSQL — all run in user space. Only the kernel and its drivers run in kernel space. You can literally see system calls with `strace`:

```bash
$ strace -c ls /tmp
% time     seconds  usecs/call     calls    errors syscall
------ ----------- ----------- --------- --------- ----------------
 24.31    0.000312          26        12           openat
 18.13    0.000233          19        12           read
 11.45    0.000147          12        12           close
```

### The Linux Boot Process

When you press the power button on a Linux machine (or click "Start instance" on an EC2 console), a tightly choreographed sequence brings the system to life. Understanding this is critical because **most production outages happen during boot**.

1. **BIOS / UEFI:** The first code that runs lives in firmware on the motherboard. It initializes the CPU and looks for a bootable device. On EC2, this is the Nitro hypervisor's firmware.
2. **POST (Power-On Self-Test):** Hardware checks — RAM, keyboard, basic devices.
3. **MBR / GPT Boot Sector:** Firmware reads the first sector of the boot disk to find the bootloader.
4. **GRUB (GRand Unified Bootloader):** Displays the boot menu, lets you pick a kernel, and loads the kernel image and initramfs into memory. Config lives in `/boot/grub/grub.cfg`.
5. **Kernel + initramfs:** The kernel unpacks itself, the initramfs provides essential drivers to mount the real root filesystem. Kernel mounts `/` and starts PID 1.
6. **systemd (PID 1):** Modern init system. Reads `/etc/systemd/system/`, starts services in dependency order, mounts filesystems from `/etc/fstab`, brings up the network.
7. **multi-user.target / graphical.target:** systemd's "runlevel" — on servers it stops at multi-user.target (text login).
8. **Login prompt:** getty on TTYs, sshd for remote, GDM for graphical.

> **Interview tip:** "Walk me through what happens when you press the power button on a Linux server until you get a login prompt." This is asked in literally every senior DevOps interview. Memorize the 8-step sequence above. Bonus points if you mention systemd targets, initramfs, and the role of `/etc/fstab`.

### DevOps Tie-Ins: Why Boot Knowledge Pays

- **EC2 boot failures:** When an EC2 instance won't start, AWS shows you the serial console output — you see exactly which boot step failed.
- **GRUB recovery:** Kernel update broke boot? You boot from a rescue ISO, chroot into the broken system, run `grub-install` and `update-grub`.
- **systemd unit debugging:** A service won't start at boot? `systemctl status`, `journalctl -xeu service-name`, check dependencies with `systemctl list-dependencies`.
- **Custom AMI building:** Packer images, custom EKS node AMIs, Bottlerocket — all require understanding what boots and when.
- **Container startup:** Containers skip BIOS/GRUB/kernel — they start at "PID 1 in a namespace." `tini` exists exactly because containers need a proper PID 1.

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

## File Viewing and Editing

As a DevOps engineer, 80% of your day will be spent reading logs, editing config files, and piecing together what went wrong on a server at 2 AM. Coming from React, you've used VS Code — but on a remote production server with no GUI, you have only the terminal. This section makes you fast at viewing files, slicing log data, and editing config files directly on Linux boxes.

> **Real world:** On a production Ubuntu server, when nginx is throwing 502s, you SSH in and immediately run `tail -f /var/log/nginx/error.log`. Then you edit `/etc/nginx/nginx.conf` with vim, run `nginx -t` to validate, and reload. No VS Code, no GUI — just your terminal skills.

### cat — Concatenate and View

`cat` dumps file contents to stdout. Great for small files; avoid on huge logs (use `less` instead).

```bash
$ cat /etc/hostname
$ cat -n /etc/nginx/nginx.conf       # -n prefixes every line with its line number
$ cat -A script.sh                   # -A shows hidden chars: $ for newline, ^I for tab, ^M for CRLF
$ cat file1.txt file2.txt > combined.txt
$ cat ~/.ssh/id_rsa.pub | ssh user@server 'cat >> ~/.ssh/authorized_keys'
```

> **Tip:** If a bash script fails with weird "command not found" errors and you wrote it on Windows, run `cat -A script.sh`. If you see `^M$` at end of lines, that's CRLF. Fix with `tr -d '\r' < script.sh > clean.sh` or `dos2unix script.sh`.

### tac — Reverse cat

`tac` prints lines in reverse order (last line first). Useful for logs when you want the newest entries on top.

```bash
$ tac /var/log/syslog | head -20     # 20 most recent syslog entries, newest first
$ tac access.log | grep "POST /api/login" | head -5
```

### less and more — The Pagers

`less` is the modern, more powerful pager. **Rule:** always use `less`.

```bash
$ less /var/log/nginx/access.log     # file is NOT loaded fully into memory — works on huge logs
$ less +F /var/log/syslog            # open directly in follow mode
$ journalctl -u nginx | less
```

| Key | Action |
|---|---|
| `q` | Quit |
| `/pattern` | Search forward |
| `?pattern` | Search backward |
| `n` / `N` | Next / previous match |
| `g` / `G` | First / last line |
| `Space` / `b` | Next / previous page |
| `F` | Follow mode (like tail -f) — Ctrl+C to exit |
| `&pattern` | Show ONLY lines matching pattern (filter) |

### head — First N Lines

```bash
$ head /etc/passwd                   # first 10 lines (default)
$ head -n 20 access.log
$ head -c 100 /dev/urandom | base64  # grab first 100 BYTES of random data
$ head -n -5 file.txt                # everything EXCEPT last 5 lines
```

### tail — Last N Lines and Follow Mode

If there's ONE command you must master for DevOps, it's `tail -f`.

```bash
$ tail /var/log/syslog               # last 10 lines
$ tail -n 50 /var/log/nginx/error.log
$ tail -f /var/log/nginx/access.log  # FOLLOW: stream new lines live. Ctrl+C to stop.
$ tail -F /var/log/app/app.log       # -F = follow + REOPEN on rotation
$ tail -f /var/log/nginx/access.log | grep "POST"
$ tail -f app.log error.log          # follow multiple files
```

> **Caution:** tail -f vs tail -F: Production logs are rotated daily by logrotate. If you use `tail -f` and the file gets rotated, you'll silently stop seeing new logs. Always use **`tail -F`** for long-running tails on production. Capital F = forever.

### wc — Word/Line/Char Count

```bash
$ wc -l /var/log/syslog              # count lines
$ wc -w README.md                    # count words
$ wc -c image.jpg                    # count bytes
$ grep "ERROR" app.log | wc -l       # how many errors today?
```

### sort — Sort Lines

```bash
$ sort names.txt                     # alphabetical
$ sort -n sizes.txt                  # NUMERIC sort
$ sort -r names.txt                  # reverse
$ sort -h                            # human-readable: handles 1K, 2M, 3G
$ du -h /var/log/* | sort -h         # find which logs eat disk
$ sort -t: -k3 -n /etc/passwd        # sort users by numeric UID
$ sort -u file.txt                   # sort + dedupe
```

### uniq — Remove/Count Duplicates

**Critical:** `uniq` only removes *adjacent* duplicates. You MUST `sort` first.

```bash
$ sort ips.txt | uniq -c             # -c prefixes each unique line with its count
$ sort ips.txt | uniq -d             # -d only shows lines appearing MORE than once
$ awk '{print $1}' access.log | sort | uniq -c | sort -rn | head
# THE classic DevOps one-liner: top 10 IPs hitting your server
```

> **Real world:** Spot a DDoS in 5 seconds: `awk '{print $1}' /var/log/nginx/access.log | sort | uniq -c | sort -rn | head -20`. If one IP has 50,000 requests and the next has 200, you've got a bot. Block it with `iptables` or `ufw`.

### cut, paste, tr

```bash
$ cut -d: -f1 /etc/passwd            # extract usernames (colon delimiter, field 1)
$ cut -d: -f1,3,7 /etc/passwd        # username, UID, shell
$ echo "2026-05-26T14:23:11" | cut -c1-10   # extract just the date

$ paste names.txt ages.txt           # merge line-by-line with TAB separator
$ paste -d, names.txt ages.txt > combined.csv

$ echo "Hello World" | tr A-Z a-z    # lowercase
$ tr -d '\r' < windows_script.sh > linux_script.sh   # fix CRLF line endings
$ echo "a   b     c" | tr -s ' '     # squeeze repeated spaces
```

### tee — Write to File AND stdout

```bash
$ ls -la | tee listing.txt           # see output AND save it
$ echo "new line" | tee -a log.txt   # -a append
$ echo "127.0.0.1 myapp.local" | sudo tee -a /etc/hosts
$ make 2>&1 | tee build.log
```

> **Tip:** sudo tee: Bash redirection (`>`) happens in the calling shell BEFORE sudo runs. So `sudo echo "x" > /etc/protected` fails with "Permission denied." Use `echo "x" | sudo tee /etc/protected` — tee runs under sudo and CAN write.

### Text Editor: nano (beginner-friendly)

All shortcuts are visible at the bottom of the screen. Good for quick edits to `/etc/hosts` or a config file.

| Shortcut | Action |
|---|---|
| `Ctrl+O` | Save (Write Out) |
| `Ctrl+X` | Exit |
| `Ctrl+W` | Where-is — search forward |
| `Ctrl+\` | Search & replace |
| `Ctrl+K` / `Ctrl+U` | Cut line / paste |
| `Alt+/` or `Ctrl+_` | Go to line number |

### Text Editor: vim — Deep Dive

Vim is on every Linux server by default. Mastering it makes you 10x faster than someone fumbling with nano.

**The Four Modes:** Normal (navigate, delete, copy — keys are COMMANDS), Insert (type text — enter via `i`/`a`/`o`, exit via `Esc`), Visual (select text via `v`/`V`/`Ctrl+V`), Command (run commands via `:`).

> **Interview tip:** Most Asked Vim Question: "What are the vim modes and how do you exit vim?" Answer: 4 modes — Normal, Insert, Visual, Command. To exit: press `Esc` to ensure you're in Normal mode, then type `:q` (quit), `:wq` (write and quit), or `:q!` (force quit without saving).

| Command | Action |
|---|---|
| `:w` | Save (write) |
| `:q` | Quit (errors if unsaved) |
| `:q!` | Force quit, discard changes |
| `:wq` or `ZZ` | Save and quit |
| `i` / `a` | Insert before / append after cursor |
| `o` / `O` | Open new line below / above |
| `h j k l` | Left, Down, Up, Right |
| `w` / `b` | Next / previous word |
| `0` / `$` | Start / end of line |
| `gg` / `G` | Top / bottom of file |
| `dd` / `yy` / `p` | Delete line / yank line / paste |
| `u` / `Ctrl+r` | Undo / redo |
| `/pattern` / `n` | Search / next match |
| `:%s/old/new/g` | Replace ALL "old" with "new" in file |
| `:%s/old/new/gc` | Same, but confirm each |

A solid starter `~/.vimrc` for DevOps work:

```bash
syntax on
set number
set relativenumber
set expandtab          " convert tabs to spaces (critical for YAML/Python)
set tabstop=4
set shiftwidth=4
set hlsearch
set incsearch
set ignorecase
set smartcase
filetype plugin indent on
" YAML-specific (2-space indent — important for k8s/Ansible)
autocmd FileType yaml setlocal ts=2 sts=2 sw=2 expandtab
```

> **Tip:** Run `vimtutor` in your terminal right now. It's a 30-minute interactive tutorial that ships with vim. By the end, you'll know enough to edit any file confidently.

### Quick Reference Cheatsheet

| Task | Command |
|---|---|
| View small file | `cat file` |
| View large file | `less file` |
| Stream live log | `tail -F /var/log/app.log` |
| First/last N lines | `head -n 20` / `tail -n 20` |
| Count lines | `wc -l file` |
| Sort numerically | `sort -n` |
| Unique with counts | `sort \| uniq -c \| sort -rn` |
| Extract column N | `cut -d: -f N` or `awk '{print $N}'` |
| Write to protected file | `... \| sudo tee /etc/file` |
| Power edit | `vim file` |
| Exit vim (most asked) | `Esc` then `:wq` (save) or `:q!` (discard) |

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

`grep` filters lines matching a regular expression. It's your first tool for searching logs, configs, and code at the command line. See also [Piping Redirection](#piping-redirection) for how grep composes with other tools. Build and test patterns first with the [Regex Log Tester](/regex-log-tester).

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

## sed — Stream Editor

**sed** is a non-interactive text editor that reads input line-by-line and applies editing commands. While vim/nano are *interactive*, sed runs in a CI/CD pipeline, in a deployment script, in a Dockerfile — anywhere you need to programmatically modify files without a human pressing keys.

> **Note:** Why DevOps engineers can't live without sed:
> - **CI/CD config injection:** swap localhost for prod URL during deploy.
> - **Templating:** render config files from templates with environment-specific values.
> - **Batch find-and-replace:** across hundreds of files in a single command.
> - **Log scrubbing:** remove PII, mask passwords before sharing logs.

### Basic Syntax

```bash
$ sed 's/old/new/' file           # substitute (first occurrence per line)
$ sed 's/old/new/g' file          # substitute ALL occurrences (global)
$ echo "hello world" | sed 's/world/devops/'
hello devops
```

By default sed prints to stdout and does NOT modify the file. Use `-i` to edit in-place.

### Key Operations

| Command | What it does |
|---|---|
| `s/old/new/` | Substitute first match per line |
| `s/old/new/g` | Substitute all matches (global) |
| `s/old/new/gi` | Global, case-insensitive |
| `/pattern/d` | Delete lines matching pattern |
| `3d` | Delete line 3 |
| `1,5d` | Delete lines 1 through 5 |
| `/pattern/p` | Print matching line (usually with `-n`) |
| `/pattern/i\text` | Insert text BEFORE matching line |
| `/pattern/a\text` | Append text AFTER matching line |
| `y/abc/xyz/` | Transliterate: a→x, b→y, c→z |
| `/start/,/end/d` | Delete from /start/ through /end/ |

### In-Place Editing

```bash
$ sed -i 's/DEBUG=true/DEBUG=false/' .env          # DANGEROUS — no undo!
$ sed -i.bak 's/DEBUG=true/DEBUG=false/' .env       # creates .env.bak first — RECOMMENDED
```

> **Caution:** Always use `-i.bak` in production. A bad sed command can corrupt thousands of files instantly. The `.bak` safety net costs nothing.

### Multiple Commands and Regex

```bash
$ sed -e 's/foo/bar/g' -e 's/baz/qux/g' file       # chain with -e
$ sed 's/foo/bar/g; s/baz/qux/g' file              # or semicolons
$ sed -E 's/([0-9]+)/NUMBER/' file                  # -E for Extended Regex
$ sed -E 's/(.+)@(.+)/User: \1, Domain: \2/' email.txt   # backreferences
```

### Real DevOps Examples

```bash
$ sed 's/localhost/prod-server.com/g' config.yml    # swap hostname (preview)
$ sed -i 's/DEBUG=true/DEBUG=false/' .env           # disable debug in prod
$ sed -n '5,10p' logfile                            # print lines 5-10
$ sed '/^#/d' config.conf                           # remove comment lines
$ sed '/^$/d' file                                  # strip blank lines
$ sed -i '1i\#!/bin/bash' script.sh                 # add shebang at top
$ sed 's/^[[:space:]]*//' file                      # trim leading whitespace
$ sed -i 's|/old/path|/new/path|g' config           # use | delimiter for paths
$ sed -i '/^#PermitRootLogin/s/^#//' /etc/ssh/sshd_config   # uncomment a line
$ sed -i 's/\r$//' file.txt                         # convert CRLF to LF
$ sed -E 's/(password=)[^&]+/\1******/g' app.log    # mask passwords
```

### sed vs awk — When to Use Which

| Task | Use | Why |
|---|---|---|
| Find and replace text | `sed` | Built for substitution |
| Delete lines by pattern | `sed` | One-liner with /pattern/d |
| Column-based processing | `awk` | Field-aware out of the box |
| Arithmetic / aggregation | `awk` | Full programming language |
| Edit config files in CI/CD | `sed` | Quick, simple substitutions |
| Parse log columns and count | `awk` | Native associative arrays |

> **Real world:** Kubernetes ConfigMap templating with sed:
>
> ```bash
> $ sed -e "s/__ENV__/production/g" \
>     -e "s/__VERSION__/v2.4.1/g" \
>     -e "s|__DB_URL__|${DATABASE_URL}|g" \
>     configmap.template.yaml > configmap.yaml
> $ kubectl apply -f configmap.yaml
> ```
> Every modern Helm chart and Kustomize patch fundamentally does this — sed is what every templating engine wraps under the hood.

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

## Process Basics

In Linux, **everything is a process**. When you run `ls`, that's a process. When a Docker container starts, that's an (isolated) process. When nginx serves a request, that's a process too. To become a DevOps engineer you must understand processes deeply.

### What is a Process?

A **process** is a running instance of a program. The program (executable file like `/usr/bin/node`) sits on disk — when you execute it, the kernel loads it into memory, gives it a unique **PID** (Process ID), assigns CPU time, memory, and file descriptors.

- **PID** — Process ID. Unique integer. PID 1 is always `init` / `systemd`.
- **PPID** — Parent Process ID. Every process (except PID 1) has a parent.
- **UID / GID** — User and Group ID the process runs as. Determines permissions.
- **TTY** — The terminal it's attached to (or `?` for daemons).
- **NI** — Nice value (priority, -20 highest to 19 lowest).

### Foreground vs Background

A **foreground** process owns the terminal and blocks your shell until it exits. A **background** process detaches (append `&`) so the prompt returns immediately while it keeps running.

```bash
$ sleep 300        # foreground — terminal blocked
$ sleep 300 &      # background — prompt returns immediately
[1] 24817
$ jobs
[1]+  Running                 sleep 300 &
```

### fork() and exec()

Linux creates new processes through two system calls — the famous `fork()` + `exec()` pair.

1. **fork()** — The parent process duplicates itself. The child gets a new PID; parent gets the child's PID, child gets 0.
2. **exec()** — The child replaces its memory image with a new program. Same PID, different code.
3. **wait()** — Parent waits for child to finish and reaps its exit status.

When you type `ls` in bash: bash forks itself, the child execs `/usr/bin/ls`, bash waits for it to exit.

### Process States

| State | Code | Meaning | When you see it |
|---|---|---|---|
| Running | **R** | Currently executing or runnable | Active workloads |
| Sleeping (Interruptible) | **S** | Waiting for an event (I/O, signal, timer) | Most idle daemons |
| Disk Sleep (Uninterruptible) | **D** | Waiting for I/O — cannot be killed even with SIGKILL | NFS hang, broken disk |
| Stopped | **T** | Suspended by signal (SIGSTOP / Ctrl+Z) | After you hit Ctrl+Z |
| Zombie | **Z** | Dead but parent hasn't reaped exit status | Bad parent process |
| Idle | **I** | Idle kernel thread | Kernel worker threads |

> **Caution:** D state is dangerous: Disk Sleep processes ignore *all* signals including SIGKILL. If you see lots of D state processes, your disk / NFS mount is likely broken. `kill -9` won't help.

### Exploring /proc/[pid]/

The kernel exposes every process as a directory under `/proc/`.

```bash
$ pgrep -f nginx | head -1
1842
$ cat /proc/1842/cmdline | tr '\0' ' '
nginx: master process /usr/sbin/nginx -g daemon on; master_process on;
$ cat /proc/1842/status | head -6
Name:   nginx
State:  S (sleeping)
Pid:    1842
PPid:   1
$ readlink /proc/1842/exe       # path to binary
/usr/sbin/nginx
```

### Why Processes Matter in DevOps

**Containers ARE processes.** A Docker container is just a regular Linux process with extra isolation provided by the kernel: **namespaces** (separate views of PIDs, network, mounts), **cgroups** (CPU, memory, I/O limits), **chroot/pivot_root** (restricted filesystem), and **seccomp/capabilities** (restricted syscalls).

> **Interview tip:** "What's the difference between a VM and a container?" — A VM virtualizes hardware and runs a full guest kernel. A container is a regular process on the host kernel with namespaces and cgroups for isolation. Container = process. VM = virtual machine.

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

## User Management

User management is the foundation of Linux security. As a DevOps engineer, you'll create service accounts for CI/CD pipelines, manage developer access, lock down compromised users, and configure sudo policies. Think of this like managing IAM roles in AWS — except it's text files all the way down, and a single typo in `/etc/sudoers` can lock you out of your own server.

### /etc/passwd and /etc/shadow

Every user account is defined in `/etc/passwd`. Despite the name, passwords are NOT stored here — they moved to `/etc/shadow` because `/etc/passwd` must be world-readable.

`/etc/passwd` has 7 colon-separated fields: `username:x:UID:GID:GECOS:home_dir:login_shell`

```bash
$ grep deploy /etc/passwd
deploy:x:1001:1001:Deploy User,,,:/home/deploy:/bin/bash
```

- **deploy** — username
- **x** — placeholder (the `x` means "look in /etc/shadow")
- **1001** — UID. 0 is root. 1-999 system users. 1000+ regular humans
- **1001** — primary GID
- **/home/deploy** — home directory
- **/bin/bash** — login shell (set to `/usr/sbin/nologin` to disable interactive login)

`/etc/shadow` (root-only) stores password hashes plus aging policy: `username:hash:last_change:min:max:warn:inactive:expire:reserved`. The hash prefix `$6$` = SHA-512, `$y$` = yescrypt (Ubuntu 24.04 default), `!` or `*` = locked.

### Creating Users: useradd vs adduser

- `useradd` — low-level, scriptable, doesn't create home dir or set password by default. Everywhere.
- `adduser` — Debian/Ubuntu's friendly wrapper. Interactive, creates home, prompts for password. NOT on RHEL.

```bash
$ sudo useradd -m -s /bin/bash -G sudo,docker deploy
$ sudo passwd deploy
```

The `-m` flag creates the home directory, `-s` sets the shell, `-G` adds supplementary groups. Without `-m`, the user has no home.

### usermod — Modify Existing Users

```bash
$ sudo usermod -aG docker $USER        # APPEND to group
$ sudo usermod -L olduser              # lock password
$ sudo usermod -s /usr/sbin/nologin ci-runner   # change shell
$ sudo usermod -e 2026-12-31 contractor-jay     # set expiry
```

> **Caution:** The `-a` in `-aG` is non-negotiable. Running `sudo usermod -G docker alice` (without `-a`) REPLACES all of Alice's supplementary groups with just `docker`. She loses sudo, adm, dialout — everything. Always: `usermod -aG`. The `-a` stands for "append".

### passwd and chage — Password and Aging

```bash
$ passwd                    # change YOUR own password
$ sudo passwd alice         # change alice's password as root
$ sudo passwd -l olduser    # lock account
$ sudo passwd -e alice      # force password change on next login

$ sudo chage -l deploy      # list aging policy
$ sudo chage -M 90 -W 7 deploy      # expire in 90 days, warn 7 days before
$ sudo chage -d 0 alice     # force password change at next login
```

### su vs su -

- `su username` — switches user, keeps your current environment.
- `su - username` — switches AND runs a login shell, loading `~/.bashrc` and resetting environment as if you logged in fresh.

> **Interview tip:** "Difference between `sudo su` and `su -`?" `su -` requires the target user's password and gives a full login shell. `sudo su` requires YOUR password (sudo authenticates the invoker), then runs `su` as root without a password prompt — but env vars may leak. Best practice: use `sudo -i` for a clean interactive root login shell.

### sudo and /etc/sudoers

When you type `sudo apt update`: the setuid-root `sudo` binary reads `/etc/sudoers`, verifies your user is allowed, prompts for YOUR password (cached ~15 min), logs the action to `/var/log/auth.log`, then executes as the target user.

Sudoers rules: `user_or_%group  host=(runas_user)  commands`

```bash
root    ALL=(ALL:ALL) ALL                        # root can do anything
%sudo   ALL=(ALL:ALL) ALL                         # sudo group (Ubuntu default)
%wheel  ALL=(ALL) ALL                             # wheel group (RHEL)
deploy  ALL=(root) NOPASSWD: /usr/bin/systemctl restart nginx
```

> **Caution:** NEVER edit /etc/sudoers with `vim` or `nano` directly. `visudo` validates syntax BEFORE saving. A single typo renders the file unparseable and breaks sudo for everyone — including root. Recovering requires single-user mode. Use `sudo visudo` or drop-in files in `/etc/sudoers.d/` (chmod 0440).

### Real DevOps Examples

```bash
# Create a developer account with sudo + docker
$ sudo useradd -m -s /bin/bash -G sudo,docker deploy && sudo passwd deploy

# Lock a former employee's account immediately
$ sudo passwd -l olduser && sudo usermod -L olduser && sudo usermod -s /usr/sbin/nologin olduser

# Service account for CI/CD — no shell, no home login
$ sudo useradd --system --shell /usr/sbin/nologin --home-dir /var/lib/jenkins jenkins

# Audit who has sudo right now
$ getent group sudo

# Run a single command as another user
$ sudo -u postgres psql
```

> **Real world:** CI/CD Service Account — you NEVER want interactive login:
>
> ```bash
> $ sudo useradd --system --shell /usr/sbin/nologin --home-dir /var/lib/runner \
>        --create-home --comment "GitLab CI Runner" gitlab-runner
> $ sudo usermod -aG docker gitlab-runner
> $ sudo passwd -l gitlab-runner     # lock password — only SSH key auth
> ```
> `--system` assigns a UID below 1000. `nologin` means even if SSH keys are stolen, no shell is granted. The locked password prevents `su` attacks. Defense-in-depth.

## Group Management

Groups are how Linux scales permissions beyond individual users. Instead of granting access to 20 developers one-by-one, you create a `developers` group, grant the group access, and add people to the group.

### /etc/group Structure

Four colon-separated fields: `groupname:x:GID:member1,member2,member3`

```bash
$ grep -E '^(sudo|docker|developers)' /etc/group
sudo:x:27:pushkar,alice,deploy
docker:x:998:pushkar,deploy,gitlab-runner
developers:x:1100:alice,bob,charlie
```

System groups: 0–999. User groups: 1000+. The member list shows users whose *supplementary* group this is — a user's *primary* group is set by the GID in `/etc/passwd`.

### Primary vs Supplementary Groups

- **Primary group** — exactly ONE per user, defined by GID in `/etc/passwd`. Files the user creates are owned by this group by default.
- **Supplementary groups** — zero or many, listed in `/etc/group`. Grant additional permissions.

```bash
$ id pushkar
uid=1000(pushkar) gid=1000(pushkar) groups=1000(pushkar),27(sudo),998(docker),1100(developers)
```

### Managing Groups

```bash
$ sudo groupadd developers
$ sudo groupadd -g 1500 deploy          # specific GID
$ sudo groupmod -n devops developers     # rename
$ sudo groupdel old-team                 # delete (refuses if it's anyone's primary group)

$ sudo gpasswd -a alice developers       # add member
$ sudo gpasswd -d alice developers       # remove member
$ sudo gpasswd -A bob developers         # make bob a group admin
$ sudo usermod -aG docker pushkar        # the standard "add to group" command
```

> **Caution:** `usermod -G` without `-a` is destructive — it REPLACES all supplementary groups. Always `usermod -aG`. Mnemonic: "a is for ADD, without a it ANNIHILATES."

### newgrp — Switch Active Primary Group

If you were just added to a group, your current shell doesn't know yet. `newgrp` spawns a subshell with the named group as primary:

```bash
$ sudo usermod -aG docker pushkar
$ docker ps        # permission denied — current session predates the change
$ newgrp docker    # spawn subshell with docker group active
$ docker ps        # works!
```

### Common System Groups

| Group | Purpose |
|---|---|
| `sudo` | Debian/Ubuntu: members can use `sudo` |
| `wheel` | RHEL/CentOS equivalent of `sudo` |
| `docker` | Run docker without sudo (effectively root — be careful) |
| `www-data` | Apache/Nginx run as this user |
| `adm` | Read access to log files in `/var/log/` |
| `systemd-journal` | Read journalctl logs without sudo |
| `disk` | Raw disk access — DANGEROUS |

> **Real world:** Shared Deployment Directory with setgid — the setgid bit makes new files inherit the directory's group:
>
> ```bash
> $ sudo chown -R root:deploy /opt/app
> $ sudo chmod -R 2775 /opt/app       # the 2 = setgid bit
> $ sudo chmod g+s /opt/app
> ```
> Now any file created inside `/opt/app` is owned by the `deploy` group, not the creator's primary group — so all team members can read/write each other's files. This is how `/srv/web/`, `/opt/app/`, and shared CI artifact directories should be configured.

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

## Disk Management

Disk management is one of the most frequent on-call problems in DevOps. "Server is down" usually means CPU pegged, OOM killer killing processes, or — most often — **disk full**. You must be fluent with `df`, `du`, partitioning tools, and `/etc/fstab`.

### df — Disk Free

```bash
$ df -h
Filesystem      Size  Used Avail Use% Mounted on
/dev/sda1        50G   25G   23G  53% /
/dev/sda2       100G   89G   11G  90% /var

$ df -hT          # show filesystem TYPE — critical for choosing resize tool
$ df -i           # INODES — the silent killer
Filesystem      Inodes   IUsed   IFree IUse% Mounted on
/dev/sda2     52428800 52428799      1  100% /var   <- INODE EXHAUSTED!
```

### du — Disk Usage (find WHO is eating space)

```bash
$ du -sh /var/log                          # total size of one directory
$ du -h --max-depth=1 /var | sort -h       # top-level breakdown, sorted
$ du -hac --max-depth=2 . | sort -rh | head -20    # "what's eating my disk"
$ sudo du -ah / 2>/dev/null | sort -rh | head -20  # whole system scan (slow)
```

### Partitioning: fdisk and parted

```bash
$ sudo fdisk -l                  # list all disks and partitions
$ sudo fdisk /dev/sdb            # interactive (n=new, p=print, d=delete, w=WRITE)

$ sudo parted -l
$ sudo parted /dev/sdb mklabel gpt
$ sudo parted /dev/sdb mkpart primary ext4 0% 100%
```

`gdisk` is the GPT-only cousin of fdisk. Use it when fdisk complains about a GPT disk.

### lsblk and blkid — Inspection

```bash
$ lsblk            # tree of block devices and mountpoints
$ lsblk -f         # with FS type and UUID — best "what's on this disk?" command
$ sudo blkid       # UUIDs for fstab entries
```

### mount / umount

```bash
$ sudo mount /dev/sdb1 /mnt/data
$ sudo mount -t ext4 /dev/sdb1 /mnt/data        # specify FS type
$ sudo mount -o ro /dev/sdb1 /mnt/data          # read-only
$ sudo mount -o remount,rw /                    # remount root rw (rescue trick)
$ sudo umount /mnt/data
$ sudo umount -l /mnt/data                      # lazy unmount if "device is busy"
$ findmnt                                        # pretty tree view of all mounts
```

### /etc/fstab — Persistent Mounts

Format: `device  mountpoint  fstype  options  dump  pass`

```bash
$ cat /etc/fstab
UUID=a3f2e1b4-...  /        ext4    defaults,noatime                0  1
UUID=b1c2d3e4-...  /data    xfs     defaults,nofail                 0  2
tmpfs              /tmp     tmpfs   defaults,size=2G,noexec         0  0
/swapfile          none     swap    sw                              0  0
nfs.internal:/exports/shared  /mnt/nfs  nfs  defaults,_netdev,soft,timeo=30  0  0

$ sudo mount -a                # mount everything in fstab — TEST before reboot!
$ sudo findmnt --verify         # sanity-check fstab without mounting
```

The `pass` column controls fsck order at boot: 0=skip, 1=root only, 2=other filesystems.

> **Caution:** A typo in `/etc/fstab` (wrong UUID, missing mountpoint, bad option) drops the system into emergency mode on next reboot. Always test with `sudo mount -a` after editing. For non-critical mounts add `nofail`; for network filesystems add `_netdev`. To recover from a boot hang: single-user mode, `mount -o remount,rw /`, fix fstab, reboot.

### Mounting by UUID (Best Practice)

Device names like `/dev/sdb` can change across reboots. UUIDs are baked into the filesystem and never change. **Always use UUIDs in fstab.**

```bash
$ sudo blkid /dev/sdb1
/dev/sdb1: UUID="b1c2d3e4-..." TYPE="xfs"
$ echo 'UUID=b1c2d3e4-... /data xfs defaults,nofail 0 2' | sudo tee -a /etc/fstab
```

### Swap

```bash
$ sudo fallocate -l 2G /swapfile
$ sudo chmod 600 /swapfile          # required — else mkswap refuses
$ sudo mkswap /swapfile
$ sudo swapon /swapfile
$ swapon --show
$ free -h                            # confirm swap appears
$ echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab   # persist
```

### LVM intro

LVM (Logical Volume Manager) adds a flexible layer between partitions and filesystems: **PV** (Physical Volume), **VG** (Volume Group), **LV** (Logical Volume). You can resize LVs without unmounting, take snapshots, and span multiple disks. Ubuntu Server defaults to LVM.

> **Real world:** "No space left on device" but `df` shows free space? You're out of **inodes**, not bytes. Every file/dir consumes one inode regardless of size. Diagnose with `df -i` — if any IUse% is 100%, that's it. Common culprits: session files, mail queues, cache dirs with millions of tiny files. Fix: delete the small files; xfs allocates inodes dynamically and avoids this entirely.

> **Interview tip:** "Disk is full, what do you do?" (1) `df -h` — which FS, how full. (2) `df -i` — rule out inode exhaustion. (3) `du -h --max-depth=1 / | sort -h` — find the heavy directory. (4) Check usual suspects: `/var/log`, `/var/lib/docker` (`docker system prune`), journal (`journalctl --vacuum-size=500M`). (5) Check deleted-but-open files: `sudo lsof | grep deleted`. (6) Extend the volume (cloud: resize EBS → `growpart` → `resize2fs`/`xfs_growfs`).

## Filesystems

A filesystem is the contract between raw blocks on a disk and the files you see. Choosing the right one matters: ext4 for general Linux, xfs for big files and parallel I/O, btrfs/zfs for snapshots, tmpfs for ephemeral RAM-backed storage, overlayfs for Docker layers.

### The Main Linux Filesystems

- **ext4** — Default on Ubuntu/Debian. Mature, journaled, max file 16 TB. Resize online with `resize2fs`.
- **xfs** — Default on RHEL/Rocky/Amazon Linux. Excellent for large files and parallel I/O. Allocates inodes dynamically. Can grow online (`xfs_growfs`) but *cannot shrink*.
- **btrfs** — Copy-on-write, snapshots, subvolumes, built-in RAID, compression. Default on Fedora Workstation.
- **zfs** — Enterprise-grade. Pools, end-to-end checksums, snapshots, send/receive replication. Not in mainline kernel (license clash) — install `zfsutils-linux`.
- **NTFS / FAT32 / exFAT** — Windows/removable media. FAT32 has 4 GB per-file limit; exFAT removes it.
- **tmpfs** — RAM-backed. Files vanish on reboot. Used for `/tmp`, `/run`, `/dev/shm`.
- **overlayfs** — The magic behind Docker. Stacks a writable upper layer over read-only lower layers under `/var/lib/docker/overlay2/`.
- **proc, sysfs, devtmpfs** — Virtual filesystems exposing kernel state.

### Comparison Table

| Feature | ext4 | xfs | btrfs | zfs |
|---|---|---|---|---|
| Max file size | 16 TB | 8 EB | 16 EB | 16 EB |
| Journaling | Yes | Yes | CoW | CoW + ZIL |
| Copy-on-Write | No | Reflinks | Yes | Yes |
| Snapshots | No (need LVM) | No (need LVM) | Native | Native |
| Online grow | Yes (resize2fs) | Yes (xfs_growfs) | Yes | Yes |
| Online shrink | No (offline) | No (never) | Yes | No |
| Built-in RAID | No | No | Yes | Yes (RAID-Z) |
| Compression | No | No | Yes | Yes |
| Checksums | Metadata only | Metadata only | Data + metadata | Data + metadata |
| Inode allocation | Static at mkfs | Dynamic | Dynamic | Dynamic |
| Default on | Ubuntu, Debian | RHEL, Amazon Linux | Fedora WS, SUSE | TrueNAS, Proxmox |

### Creating and Resizing Filesystems

```bash
$ sudo mkfs.ext4 /dev/sdb1
$ sudo mkfs.ext4 -L data -m 1 /dev/sdb1       # label "data", 1% reserved for root
$ sudo mkfs.xfs -L data -f /dev/sdb1
$ sudo mkfs.vfat -F 32 -n USB /dev/sdb1

# ext4 grow (online or offline)
$ sudo resize2fs /dev/sdb1            # grow to fill partition
# ext4 shrink (MUST unmount + fsck first)
$ sudo umount /data && sudo e2fsck -f /dev/sdb1 && sudo resize2fs /dev/sdb1 20G
# xfs grow ONLY (online, pass MOUNTPOINT not device)
$ sudo xfs_growfs /data
```

### fsck — Filesystem Integrity

> **Caution:** NEVER run fsck on a mounted filesystem — it corrupts it. Always unmount first, or boot from rescue media for the root filesystem.

```bash
$ sudo umount /dev/sdb1
$ sudo fsck.ext4 -f /dev/sdb1          # -f forces check even if "clean"
$ sudo fsck -y /dev/sdb1               # auto-answer "yes" to repairs
$ sudo xfs_repair /dev/sdb1            # xfs uses xfs_repair, not fsck
$ sudo xfs_repair -n /dev/sdb1         # dry run — report only
```

### Inodes — Deep Dive

An **inode** is a fixed-size record storing all metadata for a file *except* its name: type, permissions, owner UID/GID, size, timestamps (atime/mtime/ctime), link count, and pointers to data blocks. The filename lives in the **directory entry** — a (name → inode number) mapping. This single design choice explains hard links, symlinks, rename, and "deleted but still open" files.

```bash
$ stat /etc/passwd      # full inode metadata
$ ls -i /etc/passwd     # show inode number
$ df -i /               # inode usage for a filesystem
```

File operations in terms of inodes:

- **Rename / mv (same FS):** directory entry name changes; inode untouched — instant even for huge files.
- **Hard link (`ln`):** a second directory entry pointing to the *same inode*. Link count increments. Cannot cross filesystems. Cannot link directories.
- **Symbolic link (`ln -s`):** a tiny file with its own inode whose content is a path string. Can cross filesystems, can point to directories, can dangle.
- **Delete (`rm`):** removes the directory entry and decrements link count. Inode and data freed only when link count reaches 0 *and* no process has the file open.

> **Interview tip:** Hard link vs Symlink (inode perspective). **Hard link:** a second directory entry pointing to the same inode — both names are first-class, same FS only, can't link directories, survives deletion of one name while link count > 0. **Symlink:** a separate file whose data is a textual path, resolved at access time, can cross filesystems, can link directories, dangles if target removed. In `ls -l`: a hard link looks like a normal file with link count > 1; a symlink shows `l` and `-> target`.

> **Real world:** Resizing an EBS volume on EC2 — three steps, miss one and `df` shows no change. (1) Modify the EBS volume size in the AWS console/CLI. (2) Grow the partition: `sudo growpart /dev/nvme0n1 1`. (3) Grow the filesystem: ext4 `sudo resize2fs /dev/nvme0n1p1`, xfs `sudo xfs_growfs -d /`. Entire process is online — no reboot, no unmount.

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

## Network Configuration

Commands you can run, but understanding the actual configuration files is the next level. This section covers Ubuntu 24.04's real config files — production servers, EC2 instances, on-prem bare metal all apply.

### /etc/hosts — Local Hostname Resolution

Consulted before DNS (per `nsswitch.conf` order). The lifeline for local development and quick overrides.

```bash
$ cat /etc/hosts
127.0.0.1       localhost
127.0.1.1       devops-laptop
10.0.5.20       db.internal    db
10.0.5.30       redis.internal redis
::1             localhost ip6-localhost ip6-loopback
```

> **Tip:** Production cutover testing — add the new server's IP to `/etc/hosts` and test with curl/browser *before* changing DNS. Risk-free validation.

### /etc/resolv.conf — DNS Resolvers

```bash
$ cat /etc/resolv.conf
nameserver 8.8.8.8
nameserver 1.1.1.1
search prod.example.com internal
options timeout:2 attempts:2
```

> **Caution:** On Ubuntu 24.04, `/etc/resolv.conf` is usually a symlink to `/run/systemd/resolve/stub-resolv.conf` managed by `systemd-resolved`. Direct edits get overwritten. Use Netplan or `resolvectl` instead:
>
> ```bash
> $ resolvectl status
> $ sudo resolvectl dns eth0 1.1.1.1 8.8.8.8
> ```

### /etc/nsswitch.conf — Lookup Order

```bash
$ grep ^hosts /etc/nsswitch.conf
hosts: files mdns4_minimal [NOTFOUND=return] dns
# files → /etc/hosts first, mdns4 → .local addresses, dns → /etc/resolv.conf
```

### Netplan — Modern Ubuntu (Primary)

Ubuntu 18.04+ default. YAML-based frontend for NetworkManager or systemd-networkd.

```yaml
# /etc/netplan/01-static.yaml
network:
  version: 2
  renderer: networkd
  ethernets:
    eth0:
      dhcp4: false
      addresses:
        - 192.168.1.50/24
      routes:
        - to: default
          via: 192.168.1.1
      nameservers:
        addresses: [8.8.8.8, 1.1.1.1]
        search: [prod.example.com]
      mtu: 1500
```

```bash
$ sudo netplan try          # test for 120s, auto-rollback if SSH dies
$ sudo netplan apply        # commit changes
```

> **Caution:** YAML is strict — 2-space indentation, NO TABS. Wrong indent = network down. Always use `netplan try` first on remote boxes.

### NetworkManager (nmcli) — Desktop/Laptop

```bash
$ nmcli device status
$ nmcli con show                              # all profiles
$ nmcli dev wifi connect "MySSID" password "secret"
$ nmcli con mod eth0 ipv4.addresses 10.0.1.50/24 ipv4.gateway 10.0.1.1 ipv4.method manual
```

### systemd-networkd and Hostname

Cloud servers usually use `systemd-networkd` (lightweight). Netplan generates its config under `/run/systemd/network/`.

```bash
$ networkctl status
$ hostnamectl
$ sudo hostnamectl set-hostname prod-web-01
```

> **Tip:** After a hostname change, also update `/etc/hosts` (especially the `127.0.1.1` line). Otherwise `sudo` warns "unable to resolve host".

### Bonding and VLANs

```yaml
# Netplan: active-backup bond for HA
network:
  version: 2
  bonds:
    bond0:
      interfaces: [eth0, eth1]
      addresses: [10.0.1.50/24]
      parameters:
        mode: active-backup
        primary: eth0
  ethernets:
    eth0: {}
    eth1: {}
```

Common bonding modes: `active-backup` (failover), `balance-rr` (round robin), `802.3ad` (LACP, needs switch support). VLANs tag one physical NIC into multiple logical networks (802.1Q).

> **Note:** Cloud reality check: 95% of production cloud instances (AWS EC2, GCP, Azure VM) take their IP via DHCP / cloud-init — static IPs are rarely set at the OS level because VPC subnets and ENIs handle assignment, and auto-scaling groups use dynamic IPs. But for on-prem, hybrid, edge devices, bastion hosts, and NFS servers, static IP is a must. Know both perspectives for interviews.

> **Interview tip:** "Netplan vs NetworkManager?" — Netplan is a YAML *frontend*. The real backend is NetworkManager (desktop) or systemd-networkd (server). Ubuntu cloud images default to `renderer: networkd`.

## SSH Secure Shell Critical

SSH is how you access every cloud VM, container host, and remote server. Beyond basic login, it gives you encrypted tunnels, file transfer, and agent forwarding. Misconfiguring it creates security holes; understanding it properly lets you build zero-trust access patterns.

See also: [File Permissions Ownership](#file-permissions-ownership) — SSH enforces strict permission checks on key files. Going deeper on networking? See [Networking for DevOps](/learn/guides/networking-for-devops).

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

> **Note:** The public key body (the long string after `ssh-ed25519`) is base64-encoded binary. If you ever need to inspect or transform an encoded blob like this — or a base64 secret in a Kubernetes manifest — the [Base64 Encoder/Decoder](/base64-encoder-decoder) is handy.

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

## Bash Functions and Advanced

Once your scripts grow past 50 lines, you need functions, arrays, and disciplined error handling. This section covers the constructs that separate "shell script someone hacked together" from "production automation."

### Function Definitions

```bash
# Style 1 — POSIX, works in /bin/sh too
greet() {
    echo "Hello, $1!"
}

# Style 2 — bash keyword form
function greet() {
    echo "Hello, $1!"
}

greet Pushkar     # Hello, Pushkar!
```

### Function Arguments and Return Values

Inside a function, `$1`, `$2`, `$@`, `$#` refer to the function's arguments — **not** the script's. Bash `return N` only sets the exit status (0-255); to return data, **echo it and capture with `$()`**:

```bash
get_kernel() { uname -r; }            # write to stdout
is_root()    { [[ $EUID -eq 0 ]]; }   # last command's exit status IS the return

KERNEL=$(get_kernel)
if is_root; then echo "Running as root"; fi
```

### Local Variables

By default all bash variables are global. `local` (only valid inside functions) keeps a variable scoped:

```bash
counter=0
bump() {
    local counter=100    # shadows the global
    counter=$((counter + 1))
    echo "inside: $counter"
}
bump                # inside: 101
echo "outside: $counter"   # outside: 0
```

> **Caution:** `local var=$(some_cmd)` *masks* the exit code of `some_cmd` because `local` itself succeeds. Under `set -e`, failures silently disappear. Safe idiom: declare first, assign second.
> ```bash
> local var
> var=$(some_cmd)   # now set -e catches a failure here
> ```

### Arrays

```bash
servers=(web01 web02 db01 cache01)
echo "${servers[0]}"       # web01 (zero-indexed)
echo "${servers[@]}"       # all elements as separate words
echo "${#servers[@]}"      # 4 (length)
echo "${!servers[@]}"      # 0 1 2 3 (indices)
servers+=(db02 db03)         # append

for s in "${servers[@]}"; do echo "Server: $s"; done
echo "${servers[@]:1:2}"     # slice — from index 1, take 2
mapfile -t users < <(cut -d: -f1 /etc/passwd)   # read command output into array
```

### Associative Arrays (Hash Maps)

Bash 4+ via `declare -A`. Ubuntu 24.04 ships bash 5.2:

```bash
declare -A env_url
env_url[dev]="https://dev.example.com"
env_url[prod]="https://example.com"
echo "${env_url[prod]}"
for key in "${!env_url[@]}"; do
    printf '%-10s -> %s\n' "$key" "${env_url[$key]}"
done
if [[ -v env_url[qa] ]]; then echo "qa defined"; else echo "qa missing"; fi
```

### Exit Codes and Convention

| Code | Convention |
|---|---|
| 0 | Success |
| 1 | General error (catch-all) |
| 2 | Misuse / invalid arguments |
| 126 | Command found but not executable |
| 127 | Command not found |
| 128 + N | Killed by signal N (130 = Ctrl-C, 137 = SIGKILL) |
| 255 | Exit code out of range |

> **Note:** Follow the exit-code convention. CI systems (Jenkins, GitLab, GitHub Actions) only know "did the job succeed or fail" by exit code. If your script `exit 0`s on error, the pipeline shows green while the deploy actually failed. Always non-zero exit on any failure path.

### trap — Cleanup on Exit/Signal

```bash
#!/usr/bin/env bash
set -euo pipefail
TMPDIR=$(mktemp -d)
cleanup() {
    local rc=$?
    echo "Cleaning up (exit=$rc)..."
    rm -rf "$TMPDIR"
    return "$rc"
}
trap cleanup EXIT                          # EXIT = whenever the script ends
trap 'echo "Interrupted"; exit 130' INT TERM   # INT = Ctrl-C, TERM = kill
echo "working in $TMPDIR"
```

### getopts — Argument Parsing

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
shift $((OPTIND - 1))
[[ -z "$ENV" || -z "$VERSION" ]] && { echo "-e and -v required" >&2; exit 2; }
```

### Heredocs and Here-Strings

```bash
NAME=Pushkar
cat <<EOF
Hello, $NAME
Today is $(date +%F)
EOF

cat <<'EOF'
Literal $NAME and $(date) — nothing expands here
EOF

grep -E '^[A-Z]' <<< "$LINE"     # here-string — feed a single string as stdin
```

### The Source-Library Pattern

```bash
# File: lib/common.sh
log()  { printf '[%s] %s\n' "$(date +%FT%T)" "$*"; }
warn() { log "WARN: $*" >&2; }
die()  { log "FATAL: $*" >&2; exit 1; }
require_root() { [[ $EUID -eq 0 ]] || die "must run as root"; }

# File: deploy.sh
#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib/common.sh"
require_root
log "Starting deploy"
```

> **Tip:** Install `shellcheck` (`sudo apt install shellcheck`) and run it on every script before committing. It catches ~80% of bash bugs — quoting issues, unset variables, deprecated syntax, common SC2086 word-splitting traps. Hook it into your CI.

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

## Linux Logs

For a DevOps engineer, logs are the **single source of truth**. When a production app misbehaves at 3 AM, you don't guess — you grep. On a Linux server you'll be living inside `/var/log` and `journalctl`. Master these and you can debug anything.

> **Note:** Mental model — Traditional Linux services write plain-text files to `/var/log`. Modern systemd services write to the binary **journal**, queried with `journalctl`. On Ubuntu 24.04 you have both.

### Key Log Files — Cheat Sheet

| Path | Distro | What's in it |
|---|---|---|
| `/var/log/syslog` | Debian/Ubuntu | General system events — almost everything ends up here |
| `/var/log/messages` | RHEL/Rocky | RHEL equivalent of syslog |
| `/var/log/auth.log` | Debian/Ubuntu | SSH logins, sudo, PAM, su — every auth event |
| `/var/log/secure` | RHEL | RHEL equivalent of auth.log |
| `/var/log/kern.log` | Both | Kernel ring buffer messages (drivers, OOM kills) |
| `/var/log/apt/history.log` | Debian/Ubuntu | Every apt install/remove/upgrade |
| `/var/log/dpkg.log` | Debian/Ubuntu | Low-level package install/remove |
| `/var/log/nginx/access.log` | All | Nginx HTTP requests |
| `/var/log/nginx/error.log` | All | Nginx errors, upstream failures |
| `/var/log/postgresql/postgresql-*.log` | Ubuntu | PostgreSQL queries, errors, checkpoints |
| `/var/log/cloud-init.log` | Cloud VMs | EC2/GCE first-boot user-data output |

### journalctl — The systemd Journal

```bash
$ journalctl -e                       # jump to end (most recent)
$ journalctl -r                       # reverse — newest first
$ journalctl -n 50                    # last 50 lines
$ journalctl -f                       # follow (like tail -f)
$ journalctl -u nginx                 # only nginx.service
$ journalctl -u nginx -f              # follow nginx live
$ journalctl --since "1 hour ago"
$ journalctl --since today
$ journalctl -p err                   # priority err or worse
$ journalctl -b                       # this boot only
$ journalctl -b -1                    # previous boot
$ journalctl -k                       # kernel only (dmesg-style)
$ journalctl --disk-usage
$ sudo journalctl --vacuum-time=7d     # keep only last 7 days
$ sudo journalctl --vacuum-size=500M   # cap at 500 MB
```

Priority levels (numeric and named both work with `-p`): 0 emerg, 1 alert, 2 crit, 3 err, 4 warning, 5 notice, 6 info, 7 debug.

### logrotate — Stops Disks From Filling Up

Logs grow forever unless rotated. `logrotate` runs daily via `/etc/cron.daily/logrotate` and reads `/etc/logrotate.conf` plus per-service files in `/etc/logrotate.d/`.

```bash
# /etc/logrotate.d/myapp
/var/log/myapp/*.log {
    daily
    rotate 14              # keep 14 old copies
    size 100M              # OR rotate when file > 100MB
    compress
    delaycompress
    missingok
    notifempty
    create 0640 myapp adm
    sharedscripts
    postrotate
        systemctl reload myapp.service > /dev/null 2>&1 || true
    endscript
}
```

```bash
$ sudo logrotate -d /etc/logrotate.d/myapp      # dry run
$ sudo logrotate -f /etc/logrotate.d/myapp      # force run now
```

> **Tip:** Without `copytruncate` or a `postrotate` reload, long-running daemons keep writing to the old (renamed) file descriptor — and you wonder why rotation did nothing. Always reload the service or use `copytruncate`.

### rsyslog and Centralized Logging

rsyslog reads kernel and app messages and writes them to `/var/log/*` (or ships them to a remote server). Syntax: `facility.priority    destination`.

```bash
auth,authpriv.*                 /var/log/auth.log
*.*  @@logserver.internal:514    # TCP to a central log server
$ logger -p local0.notice "Deploy v2.4.1 started by $USER"   # write to syslog
```

One server: grep is fine. Twenty servers: you need an aggregator.

| Stack | Components | Best for |
|---|---|---|
| **ELK / Elastic** | Filebeat → Logstash → Elasticsearch → Kibana | Full-text search, rich dashboards |
| **Grafana Loki** | Promtail → Loki → Grafana | Cheap, label-based |
| **AWS CloudWatch Logs** | CW agent → CW Logs → Logs Insights | AWS-native, zero infra |

### Real DevOps Log Examples

```bash
$ awk '$9 ~ /^5/ {print $9}' /var/log/nginx/access.log | sort | uniq -c   # 5xx breakdown
$ awk '{print $1}' /var/log/nginx/access.log | sort | uniq -c | sort -rn | head   # top IPs
$ sudo dmesg -T | grep -i "killed process"          # was the system OOM-killed?
$ systemctl --failed                                 # failed services
$ sudo du -sh /var/log/* | sort -h | tail -20        # disk usage per log dir
```

> **Real world:** Tracing an SSH brute-force on a fresh VPS — `auth.log` balloons. Count failures and group by attacker IP:
>
> ```bash
> $ sudo grep "Failed password" /var/log/auth.log | awk '{print $(NF-3)}' | sort | uniq -c | sort -rn | head
> $ sudo grep "Invalid user" /var/log/auth.log | awk '{print $8}' | sort | uniq -c | sort -rn | head
> ```
> Mitigation: install `fail2ban`, set `PasswordAuthentication no` in sshd_config, move SSH off port 22, or restrict via `ufw allow from <your-IP> to any port 22`.

## System Monitoring

Monitoring is the second pillar after logs. When a customer says "the site is slow," you need to **know within 30 seconds** whether it's CPU, memory, disk I/O, or network.

### uptime — Load Averages

```bash
$ uptime
 11:42:18 up 14 days,  3:22,  2 users,  load average: 1.42, 0.87, 0.63
$ nproc
4
```

The three numbers are the average run-queue length over 1, 5, and 15 minutes. Load 1.42 on a 4-core box ≈ 35% utilized. Load 8.0 on 4 cores = processes queueing. 1-min > 15-min means load is increasing.

### free — Memory

```bash
$ free -h
               total        used        free      shared  buff/cache   available
Mem:           7.7Gi       2.1Gi       312Mi        85Mi       5.3Gi       5.3Gi
Swap:          2.0Gi          0B       2.0Gi
```

> **Caution:** Trap for beginners: "free" looks scary low — that's not the number you want. Linux aggressively uses RAM for `buff/cache` (disk caches), reclaimable instantly. The number that matters is **`available`**.

### vmstat and iostat

```bash
$ vmstat 2 5     # sample every 2s, 5 times
# watch: r (runnable, should be <= CPU count), si/so (swap, should be 0), wa (CPU% waiting on I/O)

$ sudo apt install -y sysstat
$ iostat -xz 2   # extended, skip idle devices
# %util near 100% = saturated. await > 20ms on SSD = problem.
```

### sar — Historical Stats

`sar` (from `sysstat`) records metrics every 10 minutes, so you can look at *yesterday*'s CPU.

```bash
$ sar -u 1 5          # live CPU
$ sar -r 1 5          # live memory
$ sar -n DEV 1 5      # live network per interface
$ sar -u -f /var/log/sysstat/sa25   # CPU on the 25th
```

### dmesg and Hardware Inventory

```bash
$ sudo dmesg -T                     # human-readable timestamps
$ sudo dmesg -T | grep -i oom       # OOM killer events
$ lscpu                              # CPU model, cores, flags
$ lsblk                              # block devices & mounts
$ lspci -nnk | grep -A2 Ethernet    # NIC + driver in use
```

### top, htop, and Friends

```bash
$ top         # press 1=per-core, M=sort by memory, P=sort by CPU, c=full command, k=kill
$ sudo apt install -y htop glances nload iftop iotop ncdu
$ htop        # color, scrollable, tree view (F5)
$ glances     # CPU+MEM+NET+DISK+containers in one screen
$ sudo iotop -o    # disk I/O per process; -o = only active
$ ncdu /var        # interactive du — navigate and delete junk
```

In `top`: `RES` (resident set size — actual physical RAM) is the number that matters; `VIRT` is mostly meaningless.

### Real Monitoring Scenarios

```bash
$ watch -n 5 'ps -o pid,rss,vsz,cmd -p $(pgrep -f myapp)'   # watch for a memory leak
$ ps aux --sort=-%mem | head -11                            # top 10 by memory
$ ps aux --sort=-%cpu | head -11                            # top 10 by CPU
$ iostat -xz 2 5                                            # find I/O bottleneck
$ ss -tn state established | awk 'NR>1{print $5}' | cut -d: -f1 | sort | uniq -c | sort -rn
$ ps aux | awk '$8 ~ /Z/ {print}'                           # find zombie processes
```

> **Tip:** Interview answer for "server slow, what do you do?" — in this exact order: `uptime` (load), `top`/`htop` (process), `free -h` (memory), `iostat -xz 2` (disk), `ss -s` (network), `dmesg -T | tail` (kernel). This is Brendan Gregg's USE Method: Utilization, Saturation, Errors.

## Cron Jobs

Cron is the Unix scheduler — a daemon that wakes up every minute and runs jobs whose time has come. You'll use it for backups, certificate renewals, log shipping, health checks, and cleanup scripts. It's old (1975!) but still everywhere.

```bash
$ systemctl status cron           # Ubuntu/Debian
$ systemctl status crond          # RHEL
```

### Crontab Syntax

```text
# ┌───────────── minute        (0 - 59)
# │ ┌─────────── hour          (0 - 23)
# │ │ ┌───────── day of month  (1 - 31)
# │ │ │ ┌─────── month         (1 - 12)
# │ │ │ │ ┌───── day of week   (0 - 7, where 0 and 7 both = Sunday)
# │ │ │ │ │
# * * * * *  command-to-run
```

| Symbol | Meaning | Example |
|---|---|---|
| `*` | Any value | `* * * * *` — every minute |
| `*/N` | Every N units | `*/15 * * * *` — every 15 minutes |
| `N-M` | Range | `0 9-17 * * *` — every hour, 9 AM to 5 PM |
| `N,M` | List | `0 8,12,18 * * *` — 8 AM, noon, 6 PM |

Named shortcuts replace the whole 5-field expression: `@reboot`, `@hourly`, `@daily`, `@weekly`, `@monthly`, `@yearly`.

> **Tip:** Cron expressions are easy to get subtly wrong. Validate them against a human-readable description and the next few run times with the [Cron Expression Tester](/cron-expression-tester) before committing a crontab.

### Managing Crontabs

```bash
$ crontab -e                # edit YOUR crontab
$ crontab -l                # list YOUR crontab
$ crontab -ri               # delete with confirmation
$ sudo crontab -u deploy -e # edit deploy user's crontab
```

User crontabs live in `/var/spool/cron/crontabs/<user>` — always use `crontab -e`, never edit directly.

### System Cron

System crontab files have an **extra "user" field** between the schedule and the command:

```bash
$ sudo cat /etc/crontab
SHELL=/bin/sh
PATH=/usr/local/sbin:/usr/local/bin:/sbin:/bin:/usr/sbin:/usr/bin
MAILTO=root
# m h dom mon dow user  command
17 *    * * *   root    cd / && run-parts --report /etc/cron.hourly
25 6    * * *   root    test -x /usr/sbin/anacron || (cd / && run-parts --report /etc/cron.daily)
```

| Path | Purpose |
|---|---|
| `/etc/crontab` | Main system schedule (with user field) |
| `/etc/cron.d/` | Drop-in files (packages install here) |
| `/etc/cron.hourly/` `.daily/` `.weekly/` `.monthly/` | Drop a script in, runs on schedule via `run-parts` |

`run-parts` executes every executable file in a directory. Two gotchas: scripts must be executable (`chmod +x`), and filenames must not contain dots.

### Cron Logs

```bash
$ sudo grep CRON /var/log/syslog | tail -20
$ sudo journalctl -u cron --since today
```

### Common DevOps Use Cases

```bash
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
MAILTO=devops@example.com

# Daily Postgres backup at 02:00
0 2 * * * /usr/local/bin/backup-postgres.sh >> /var/log/backup.log 2>&1
# Renew Let's Encrypt certs twice a day
17 3,15 * * * /usr/bin/certbot renew --quiet --deploy-hook "systemctl reload nginx"
# Health check every 5 minutes
*/5 * * * * /usr/local/bin/healthcheck.sh || /usr/local/bin/slack-alert.sh "API down"
# Clean Docker dangling images weekly
30 4 * * 1 /usr/bin/docker system prune -af --filter "until=168h" >> /var/log/docker-prune.log 2>&1
```

### Best Practices and Common Mistakes

- **PATH is minimal.** Cron's default `PATH` is just `/usr/bin:/bin`. Your `docker`, `aws`, `pg_dump`, `node` may not be found. Set `PATH=` at the top of the crontab or use full paths.
- **No shell aliases / .bashrc.** Cron runs `/bin/sh` non-interactively — no rc files are sourced.
- **Working directory is `$HOME`.** Use absolute paths or `cd /opt/app &&` first.
- **Always redirect output.** Unredirected stdout/stderr becomes mail to the user. Use `>> /var/log/myjob.log 2>&1`.
- **Use scripts, not inline one-liners** — testable and version-controllable.
- **Idempotency / overlap.** Use a lockfile: `flock -n /tmp/myjob.lock -c '/path/to/job.sh'`.
- **`%` is special** — a literal `%` must be escaped as `\%`.

> **Caution:** The #1 cron PATH gotcha: your script works when you run `./backup.sh` by hand, but cron says `docker: command not found`. That's because your shell's PATH includes `/usr/local/bin` but cron's doesn't. Always set `PATH=` at the top of the crontab OR call binaries by absolute path.

## The at Command

Where `cron` is for **recurring** jobs, `at` is for **one-shot** jobs. "Restart this service at 3 AM tonight." "Run this cleanup once, ninety minutes from now." Then forget it.

```bash
$ sudo apt install -y at
$ sudo systemctl enable --now atd
```

### Basic Usage

```bash
$ at now + 5 minutes
at> echo "Hello from the future" > /tmp/hello.txt
at> systemctl restart nginx
at> ^D
job 3 at Tue May 26 11:47:00 2026
```

Time formats `at` understands: `now + 2 hours`, `now + 1 day`, `14:30`, `14:30 tomorrow`, `midnight`, `noon`, `teatime` (16:00), `3pm Friday`, `02:00 next month`.

### Piping Commands In

```bash
$ echo "/opt/scripts/restart-app.sh" | at now + 1 hour
$ echo "shutdown -h now" | sudo at 23:00
$ at -f /opt/scripts/cleanup.sh now + 30 minutes
```

### Managing Jobs

```bash
$ atq                       # list pending jobs
$ at -c 7                   # show contents of job 7
$ atrm 7                    # cancel job 7
```

`batch` is `at`'s sibling: it runs queued commands only when the system load average drops below 1.5 — great for heavy one-off jobs.

| Need | Use |
|---|---|
| Run every day / hour / week | `cron` (or systemd timer) |
| Run exactly once, in the future | `at` |
| "Restart server in 5 min if I don't cancel" | `at` (great safety net during config changes) |
| Run a heavy job when the system is idle | `batch` |
| Retries, dependencies, complex orchestration | systemd timer, Airflow/Argo |

> **Tip:** The "dead man's switch" trick: before editing risky SSH/firewall config, schedule a rollback: `echo "cp /etc/ssh/sshd_config.bak /etc/ssh/sshd_config && systemctl restart ssh" | sudo at now + 5 minutes`. Make your changes and test. If you lock yourself out, the job revokes them in 5 minutes. If everything works: `sudo atrm <jobnum>`.

## systemd Timers

systemd timers are the **modern replacement for cron**. More verbose to set up, but they integrate with the rest of systemd: structured logging in the journal, dependency management, resource limits, retries, and the ability to catch up after downtime.

> **Note:** Key idea — a timer is a unit that *triggers another unit*. You always create TWO files: `foo.timer` (when to run) and `foo.service` (what to run).

### A Complete Example: Daily DB Backup

```ini
# /etc/systemd/system/myapp-backup.service
[Unit]
Description=Daily backup of myapp Postgres database
Wants=network-online.target
After=network-online.target postgresql.service

[Service]
Type=oneshot
User=postgres
ExecStart=/usr/local/bin/backup-myapp.sh
StandardOutput=journal
StandardError=journal
```

```ini
# /etc/systemd/system/myapp-backup.timer
[Unit]
Description=Run myapp DB backup daily at 02:00

[Timer]
OnCalendar=*-*-* 02:00:00
Persistent=true
RandomizedDelaySec=5min
Unit=myapp-backup.service

[Install]
WantedBy=timers.target
```

```bash
$ sudo systemctl daemon-reload
$ sudo systemctl enable --now myapp-backup.timer   # enable the TIMER, not the service
$ systemctl list-timers myapp-backup.timer
$ sudo systemctl start myapp-backup.service        # manually trigger once to test
$ journalctl -u myapp-backup.service -n 50          # view output
```

### OnCalendar Syntax

Format: `DayOfWeek Year-Month-Day Hour:Minute:Second`.

| `OnCalendar=` | When |
|---|---|
| `hourly` / `daily` / `weekly` / `monthly` | Common shortcuts |
| `*-*-* 02:00:00` | Every day at 02:00 |
| `Mon-Fri 09:00` | Weekdays at 09:00 |
| `*-*-01 04:00:00` | 1st of every month at 04:00 |
| `*-*-* *:0/15:00` | Every 15 minutes |
| `2026-12-31 23:59:00` | Once: New Year's Eve 2026 |

Always validate before deploying:

```bash
$ systemd-analyze calendar "Mon-Fri 09:00"
$ systemd-analyze calendar --iterations=5 "*-*-* *:0/15:00"
```

### Other Trigger Types

| Directive | Meaning |
|---|---|
| `OnBootSec=15min` | 15 minutes after boot |
| `OnUnitActiveSec=1h` | 1 hour after the service last activated |
| `Persistent=true` | If a run was missed (server off), run on next boot |
| `RandomizedDelaySec=5min` | Spread a fleet of identical jobs — prevents thundering herd |

```bash
$ systemctl list-timers              # next/last run for every timer
$ systemctl list-timers --all
$ systemctl cat myapp-backup.timer
```

### Cron vs systemd Timer

| Feature | cron | systemd timer |
|---|---|---|
| Setup effort | One line | Two unit files |
| Logs | Cron log + your redirects | Centralized journal — `journalctl -u name` |
| Dependencies | None | `After=`, `Wants=`, `Requires=` |
| Retries on failure | Write your own | `Restart=on-failure` |
| Catch up missed runs | anacron only, blunt | `Persistent=true` |
| Resource limits | None | `MemoryMax=`, `CPUQuota=`, etc. |
| Test/dry-run | None | `systemd-analyze calendar "..."` + `systemctl start` |
| Familiarity | Universal | Linux-only |

> **Tip:** Migration tip: if you already have a cron job, you can convert it to a timer in 10 minutes. Bonus: `journalctl -u myjob` gives you every run, exit code, and stdout/stderr without setting up your own log redirection. That alone justifies the two extra files.

## Linux Security

Security in Linux is not a feature you turn on, it's a posture you maintain. As a DevOps engineer you're responsible for hardening servers, protecting credentials, and reducing attack surface.

> **Note:** Security is a habit, not an event. Check daily: who is logging in, what ports are open, are the latest patches applied. Hardening once and forgetting is the biggest mistake — attackers only need one small gap.

### Strong Passwords (PAM Password Quality)

PAM is the framework Linux uses for authentication. The `pam_pwquality` module enforces strong passwords system-wide via `/etc/security/pwquality.conf`:

```ini
minlen = 14
minclass = 4           # uppercase + lowercase + digit + symbol
dcredit = -1           # require at least 1 digit
ucredit = -1           # require at least 1 uppercase
ocredit = -1           # require at least 1 symbol
retry = 3
enforce_for_root = 1
```

Account lockout after failed attempts via `pam_faillock` in `/etc/pam.d/common-auth` (deny=5, unlock_time=900).

> **Caution:** Test before you log out! A bad PAM config can lock you out of your own server. Always keep a second SSH session open while editing PAM files.

### SSH Hardening Checklist (Recap)

Edit `/etc/ssh/sshd_config`:

```ini
PermitRootLogin no                 # disable root login
PasswordAuthentication no          # keys only — most important setting
Port 2222                          # reduce noise
AllowUsers deploy ops-alice
MaxAuthTries 3
LoginGraceTime 30
ClientAliveInterval 300
X11Forwarding no
PermitEmptyPasswords no
```

```bash
$ ssh-keygen -t ed25519 -a 100 -C "pushkar@workstation"
$ sudo sshd -t                      # test config syntax
$ sudo systemctl reload ssh
```

### Firewall

```bash
# ufw — Ubuntu's friendly front-end
$ sudo ufw default deny incoming
$ sudo ufw default allow outgoing
$ sudo ufw allow 2222/tcp comment 'SSH'
$ sudo ufw allow 80,443/tcp
$ sudo ufw allow from 192.168.1.0/24 to any port 5432   # Postgres LAN only
$ sudo ufw limit 2222/tcp           # rate-limit SSH
$ sudo ufw enable
$ sudo ufw status verbose
```

| Firewall | Used By | Notes |
|---|---|---|
| ufw | Ubuntu, Debian | Simple front-end to iptables/nftables |
| iptables | Legacy everywhere | Powerful, being replaced by nftables |
| nftables | Modern kernel default | Unified, faster, atomic rules |
| firewalld | RHEL, Fedora | Zone-based, runtime + permanent |

```bash
# firewalld (RHEL/Rocky)
$ sudo firewall-cmd --add-service=https --permanent
$ sudo firewall-cmd --add-port=2222/tcp --permanent
$ sudo firewall-cmd --reload
```

### fail2ban — Intrusion Prevention

fail2ban scans log files and bans IPs that show malicious behaviour by updating firewall rules dynamically.

```ini
# /etc/fail2ban/jail.local
[sshd]
enabled  = true
port     = 2222
maxretry = 3
bantime  = 24h
```

```bash
$ sudo systemctl enable --now fail2ban
$ sudo fail2ban-client status sshd
$ sudo fail2ban-client set sshd unbanip 203.0.113.45
```

> **Real world:** On any internet-facing VM you'll see SSH brute-force attempts within minutes of booting. fail2ban + non-standard port + key-only auth reduces auth.log from thousands of failure lines per day to near-zero. It's the single highest-leverage hardening step.

### SELinux vs AppArmor — Mandatory Access Control

Standard Unix permissions are **discretionary** (the owner decides access). MAC adds a second layer: even root cannot violate kernel-enforced policies.

| Feature | SELinux | AppArmor |
|---|---|---|
| Default on | RHEL, Fedora, CentOS | Ubuntu, Debian, SUSE |
| Policy style | Labels on inodes | Path-based profiles |
| Granularity | Very fine-grained | Easier to read & write |

```bash
# SELinux
$ getenforce                       # Enforcing | Permissive | Disabled
$ sudo setenforce 0                # Permissive (logs only)
$ ls -Z /var/www/html              # show SELinux contexts
$ sudo restorecon -Rv /var/www/html

# AppArmor
$ sudo aa-status
$ sudo aa-complain /etc/apparmor.d/usr.bin.nginx   # learning mode
$ sudo aa-enforce  /etc/apparmor.d/usr.bin.nginx
```

> **Caution:** Don't disable MAC because "the app won't work." Set it to Permissive/Complain mode, reproduce the issue, read the audit log, then write a targeted policy exception. Disabling SELinux/AppArmor in production is a major red flag in security audits.

### File Integrity — Hashes

```bash
$ md5sum ubuntu-24.04.iso          # FAST but cryptographically broken — checksums only
$ sha256sum ubuntu-24.04.iso       # the standard for downloads
$ sha512sum kernel.tar.xz          # extra paranoid
$ sha256sum -c SHA256SUMS          # verify against a published checksum file
```

> **Tip:** Need to hash a string or small file quickly, or compare a download against its published digest without dropping to a shell? The [Hash Generator](/hash-generator) produces MD5/SHA-1/SHA-256/SHA-512 in the browser.

### GPG Basics

GPG provides encryption, signing, and key management — used everywhere from APT repo signing to package release verification.

```bash
$ gpg --full-generate-key          # use ed25519 or RSA 4096
$ gpg --encrypt --armor -r alice@example.com secrets.txt
$ gpg --decrypt secrets.txt.asc > secrets.txt
$ gpg --detach-sign --armor release-1.4.0.tar.gz
$ gpg --verify kubectl.sha256.sig kubectl.sha256   # verify upstream releases
```

### Finding Privilege-Escalation Vectors

```bash
$ sudo find / -perm -4000 -type f -xdev 2>/dev/null   # SUID binaries
$ sudo find / -perm -2000 -type f -xdev 2>/dev/null   # SGID binaries
$ sudo find / -perm -0002 -type f -xdev 2>/dev/null   # world-writable files (red flag)
$ sudo find / -nouser -o -nogroup 2>/dev/null         # files with no owner
```

### Automated Updates

Unpatched systems are the #1 source of compromise. Automate it.

```bash
# Ubuntu
$ sudo apt install unattended-upgrades apt-listchanges
$ sudo dpkg-reconfigure --priority=low unattended-upgrades
# RHEL
$ sudo dnf install dnf-automatic
$ sudo systemctl enable --now dnf-automatic.timer
```

### Real DevOps Security Checklist

1. **Update OS and patches** — unattended-upgrades / dnf-automatic; reboot for kernel CVEs.
2. **Disable root SSH** and use **key-only authentication** (ed25519).
3. **Firewall default deny** — open only required ports.
4. **fail2ban** on SSH and other internet-facing services.
5. **Audit users** — remove unused accounts, lock service accounts, rotate keys.
6. **Disable unused services** — `systemctl list-unit-files --state=enabled`, mask what you don't need.
7. **Centralized logs** — ship to ELK/Loki/CloudWatch; local logs can be wiped by attackers.
8. **Time sync** — chrony or systemd-timesyncd; broken clocks break TLS and audit timestamps.
9. **SELinux/AppArmor enforcing** — never permanently disable MAC.
10. **Vulnerability scans** — Lynis (`sudo lynis audit system`), OpenSCAP, Trivy for containers.
11. **Backups + tested restore** — an untested backup is a hope, not a backup.
12. **Least privilege** — sudo whitelists, no shared accounts, separate prod/staging credentials.
13. **Container security** — non-root USER, drop capabilities, read-only rootfs, scan images (Trivy/Grype), use distroless/minimal base images.
14. **Secrets management** — Vault, AWS Secrets Manager, sealed-secrets; never commit secrets to git.
15. **Monitor auth events** — alert on failed sudo, new SSH keys, sudoers changes.

> **Real world:** When you join a new DevOps team, run Lynis on a staging box in week one. It generates a 100+ point hardening report. Even mature shops typically score 60-70/100 — the gap is your low-hanging-fruit roadmap and an instant credibility builder.

## Troubleshooting Methodology

Troubleshooting is the skill that separates a junior DevOps from a senior. Tools you can google. Methodology you have to internalise.

### The Systematic Approach

1. **Define the problem clearly.** "The website is slow" is not a definition. "p95 latency on /api/checkout went from 200ms to 3s at 14:02 UTC for all users" is.
2. **Gather data.** Logs, metrics, kernel messages (`dmesg`), recent changes (deploys, config), system state (`top`, `df`, `ss`).
3. **Reproduce it.** Either in staging, or get exact steps.
4. **Form a hypothesis.** One thing at a time.
5. **Test with the smallest change.** Don't change five things at once.
6. **Document.** Symptom, root cause, fix, prevention.

> **Note:** The biggest mistake is skipping root cause in the rush to fix. A server restart gives 5 minutes of relief, but if you didn't catch the root cause the issue returns in 3 days — and by then the logs have rotated. Slow down to go fast.

### Where to Start, by Symptom

| Symptom Area | First Places to Look |
|---|---|
| Boot issues | `journalctl -b`, `journalctl -b -1`, `dmesg`, `systemd-analyze blame` |
| Auth / SSH | `/var/log/auth.log` (or `/var/log/secure`), `journalctl -u sshd` |
| Service problem | `systemctl status <svc>`, `journalctl -u <svc> -n 200` |
| Disk | `df -h`, `df -i`, `du -sh /*`, `lsblk -f`, `iostat -xz 1` |
| Network | `ip a`, `ip r`, `curl -v`, `ss -tulpn`, `dig`, `tcpdump` |
| Performance | `top`, `vmstat 1`, `iostat -xz 1`, `sar -u 1 5`, `pidstat 1` |
| Memory / OOM | `free -h`, `dmesg \| grep -i 'killed process'`, `journalctl -k \| grep -i oom` |

### Common Troubleshooting Scenarios

**Server slow / not responding:**

```bash
$ uptime; top -o %CPU; top -o %MEM; iostat -xz 1 5; vmstat 1 5; ss -s
```

Identify the bottleneck (CPU / IO / memory / network), then kill/throttle the offender, scale resources, or add caching. 80% of "server slow" tickets are: a runaway log filling disk, a query without an index, or memory pressure causing swap thrashing — check disk and swap first.

**Service won't start:**

```bash
$ sudo systemctl status nginx
$ sudo journalctl -u nginx -n 100 --no-pager
$ sudo nginx -t                  # config syntax check
$ sudo ss -tulpn | grep :80      # port already in use?
```

Common causes: config syntax error, port already bound, missing dependency in `After=`, wrong `User=`, SELinux/AppArmor denial.

**SSH "Permission denied (publickey)":**

```bash
$ ssh -vvv -i ~/.ssh/id_ed25519 deploy@server     # which key was tried?
$ stat -c '%a %U %G %n' ~/.ssh ~/.ssh/authorized_keys
# Required: ~ = 755/750, .ssh = 700, authorized_keys = 600, owned by the user
```

**SSH "Connection refused" vs "timed out":** Refused = something at the destination actively rejected (sshd down, or firewall REJECT). Timed out = packets never arrived (routing, cloud security group, or a DROP rule). AWS/GCP/Azure security groups are the most common culprit.

**Out of memory (OOM killer):**

```bash
$ dmesg -T | grep -i 'killed process'
$ journalctl -k | grep -i 'oom-killer'
$ free -h ; cat /proc/swaps
```

Fix: add swap (short term), increase memory, fix the leaking app, or set `MemoryMax=` in the systemd unit. Java/Node in containers often get OOM-killed because they read the host's memory, not the cgroup limit — set `-Xmx` or `NODE_OPTIONS=--max-old-space-size` to match the container limit.

**Container not starting:**

```bash
$ docker ps -a                           # find the dead container's exit code
$ docker logs --tail=200 myapp
$ docker run --rm -it --entrypoint sh myapp:latest   # poke inside
```

Common exit codes: 0 = clean exit, 1 = app error, 125 = docker daemon error, 126 = not executable, 127 = command not found, 137 = OOM-killed, 139 = segfault, 143 = SIGTERM. Volume permission mismatch (UID inside container vs host) is the #1 silent failure in dev environments.

### Power Tools

| Tool | Use For | Example |
|---|---|---|
| `strace` | Trace system calls | `strace -f -e openat,connect -p 1234` |
| `lsof` | List open files, sockets, FDs | `lsof -i :8080`, `lsof +L1` |
| `perf` | CPU profiling, flame graphs | `sudo perf top` |
| `tcpdump` | Packet capture | `sudo tcpdump -i any -w cap.pcap port 443` |
| `bpftrace` | eBPF tracing | `sudo execsnoop-bpfcc` |

### The USE Method

Brendan Gregg's USE method: for every resource (CPU, memory, disk IO, disk capacity, network IO, file descriptors), check **U**tilization, **S**aturation, and **E**rrors.

> **Real world:** In every senior DevOps interview you'll get an open-ended scenario: "Production API is returning 500s, walk me through what you do." They're testing whether you have a *method*: define → gather → hypothesise → test → document. Mention rollback as the first option before deep debugging in prod. That single framing puts you ahead of most candidates.

## Common Interview Questions

These are the highest-frequency Linux questions asked in DevOps and SRE interviews, condensed to the answer that signals real understanding. Drill them out loud — if you can teach the answer in your own words, you own it.

**1. Difference between Linux and Unix?** Unix is a proprietary OS family from the 1970s (AT&T Bell Labs); Linux is a free, open-source, Unix-like *kernel* created by Linus Torvalds in 1991. Linux follows Unix design principles but shares no code with original Unix. macOS is certified Unix (BSD lineage); Linux is not.

**2. Difference between the kernel and the operating system?** The kernel is the core program that talks to hardware and manages CPU, memory, devices, and processes. The OS is the kernel *plus* userspace — shell, libraries, utilities — that makes it usable. Calling the kernel "the OS" is the classic blunder.

**3. Difference between `bash` and `sh`?** `sh` is the POSIX-standard minimal shell; `bash` is a superset with arrays, `[[ ]]`, brace expansion, and the `function` keyword. On Debian/Ubuntu, `/bin/sh` is `dash`, not bash — so a `#!/bin/sh` script using bash-only features works on RHEL but breaks on Ubuntu. Match your shebang to the features you use.

**4. How do Linux file permissions work?** Three triplets (owner/group/other), each with read (4), write (2), execute (1). Set symbolically (`chmod u+x`) or octal (`chmod 755`). Special bits: setuid (run as owner), setgid (inherit group / run as group), sticky (only owner can delete, as on `/tmp`).

**5. Hard link vs symbolic link?** A hard link is a second directory entry pointing to the *same inode* — same FS only, can't link directories, survives deletion of any one name while link count > 0. A symlink is a separate file whose content is a path string, resolved at access time — can cross filesystems, can point to directories, dangles if the target is removed.

**6. What happens from power-on to login prompt?** BIOS/UEFI → POST → MBR/GPT boot sector → GRUB loads kernel + initramfs → kernel mounts `/` and starts PID 1 → systemd starts services in dependency order and mounts `/etc/fstab` → reaches multi-user.target → login (getty/sshd). Most production outages happen here.

**7. What's the difference between a VM and a container?** A VM virtualizes hardware and runs a full guest kernel. A container is a regular process on the host kernel isolated with namespaces (PID, net, mount, user) and cgroups (CPU, memory, I/O limits). Container = process; VM = virtual machine.

**8. Difference between `kill -9` and `kill -15`?** `-15` (SIGTERM) is a polite shutdown request the process can catch and clean up after. `-9` (SIGKILL) is uncatchable and immediate — no cleanup, risk of corrupt state. Always try SIGTERM first.

**9. Explain `fork()` and `exec()`.** `fork()` duplicates the current process (child gets a new PID). `exec()` replaces the child's memory image with a new program (same PID). The shell uses fork+exec+wait to run every command.

**10. Disk shows full but `df` reports free space — what's wrong?** Either inode exhaustion (`df -i` shows 100% IUse) or a process holding a deleted-but-open file (`lsof | grep deleted`). For inodes, delete the millions of tiny files; for the open file, restart the holding process.

**11. How do you debug a service that won't start?** `systemctl status <svc>`, then `journalctl -u <svc> -n 100`, then validate config (`nginx -t`, `sshd -t`), then check the port isn't already bound (`ss -tulpn`). Common causes: config syntax, port conflict, wrong `User=`, missing dependency, MAC denial.

**12. What's the difference between cron and a systemd timer?** Both schedule recurring work. systemd timers add journal logging, dependency ordering (`After=`/`Wants=`), retries (`Restart=`), catch-up of missed runs (`Persistent=true`), and resource limits. Cron is simpler and universal. Use timers when you need observability and dependencies.

**13. How do you harden SSH on a production server?** `PasswordAuthentication no` (key-only), `PermitRootLogin no`, restrict with `AllowUsers`, lower `MaxAuthTries`, non-standard port, add `fail2ban`, and use ed25519 keys. Always `sshd -t` and keep a second session open before reloading.

**14. A server is slow — walk me through it.** Triage in order: `uptime` (load vs core count), `top`/`htop` (CPU/mem hogs), `free -h` (look at `available`, not `free`), `iostat -xz 2` (disk `%util`/`await`), `ss -s` (connections), `dmesg -T | tail` (kernel/OOM). This is the USE method: Utilization, Saturation, Errors.

**15. How do you find what's listening on a port / using a port?** `ss -tlnp | grep :80` or `lsof -i :80` shows the listener and PID. To free it, identify the PID then stop that service (`fuser -k 80/tcp` as a blunt instrument).

> **Tip:** In interviews, never just say "I don't know" — add "but here's how I'd find out." Confidence with humility beats fake expertise. For an experienced developer pivoting into DevOps, that maturity is a genuine differentiator.

## Quick Reference Cheat Sheets

*Yeh section bookmark karke rakho* — these are the reference sheets you will hit Ctrl+F on during your first 6 months on the job. Print them, paste them on your wall, whatever works. Real production-grade reference, no fluff.

### 1. Top 100 Linux Commands (Grouped)

#### Files & Directories

| Command | Purpose | Example |
|---|---|---|
| `ls` | List directory | `ls -lah --color` |
| `cd` | Change directory | `cd -` (previous) |
| `pwd` | Print working dir | `pwd -P` (resolve symlinks) |
| `mkdir` | Make directory | `mkdir -p a/b/c` |
| `rmdir` | Remove empty dir | `rmdir empty_folder` |
| `rm` | Remove files | `rm -rf node_modules` |
| `cp` | Copy | `cp -av src/ dst/` |
| `mv` | Move/rename | `mv old.txt new.txt` |
| `ln` | Link (hard/soft) | `ln -s /opt/app /usr/local/app` |
| `touch` | Create empty / update mtime | `touch app.log` |
| `stat` | File metadata | `stat /etc/passwd` |
| `file` | Detect file type | `file binary.bin` |
| `find` | Find files | `find . -name "*.log" -mtime +7` |
| `locate` | Fast filename search | `locate sshd_config` |
| `tree` | Directory tree | `tree -L 2` |
| `basename` | Strip path | `basename /a/b/c.txt` |
| `dirname` | Strip filename | `dirname /a/b/c.txt` |
| `realpath` | Resolve absolute path | `realpath ./app` |

#### Text Processing

| Command | Purpose | Example |
|---|---|---|
| `cat` | Print file | `cat /etc/os-release` |
| `tac` | Reverse cat | `tac access.log` |
| `less` | Paged viewer | `less +F app.log` (follow) |
| `more` | Old pager | `more big.txt` |
| `head` | First N lines | `head -n 20 file` |
| `tail` | Last N lines | `tail -f -n 100 app.log` |
| `grep` | Pattern search | `grep -rEn "TODO|FIXME" .` |
| `egrep / fgrep` | ERE / fixed | `grep -E "a|b"` |
| `sed` | Stream editor | `sed -i 's/dev/prod/g' app.conf` |
| `awk` | Field processor | `awk '{print $1,$9}' access.log` |
| `cut` | Extract columns | `cut -d: -f1 /etc/passwd` |
| `sort` | Sort lines | `sort -u -k2,2n` |
| `uniq` | Dedupe (sorted) | `sort file | uniq -c` |
| `wc` | Count | `wc -l *.py` |
| `tr` | Translate chars | `tr 'a-z' 'A-Z'` |
| `tee` | Write & pass through | `cmd | tee out.log` |
| `diff` | Compare | `diff -u a b` |
| `patch` | Apply diff | `patch -p1 < fix.patch` |
| `jq` | JSON processor | `jq '.items[].name' data.json` |
| `yq` | YAML processor | `yq '.services' docker-compose.yml` |
| `xargs` | Build commands | `find . -name "*.bak" | xargs rm` |

#### Process

| Command | Purpose | Example |
|---|---|---|
| `ps` | Process snapshot | `ps -ef` or `ps aux` |
| `top` | Live processes | `top -o %CPU` |
| `htop` | Better top | `htop` (F6 sort, F9 signal) |
| `kill` | Send signal | `kill -9 1234` |
| `pkill` | Kill by name | `pkill -f gunicorn` |
| `killall` | Kill all by name | `killall nginx` |
| `pgrep` | Find PIDs | `pgrep -af java` |
| `nice` | Run with priority | `nice -n 10 ./batch.sh` |
| `renice` | Change priority | `renice 5 -p 1234` |
| `nohup` | Survive logout | `nohup ./run.sh &` |
| `jobs` | Shell jobs | `jobs -l` |
| `bg / fg` | Background/foreground | `bg %1` / `fg %1` |
| `strace` | Trace syscalls | `strace -p 1234 -f -e network` |
| `lsof` | Open files | `lsof -i :8080` |

#### Network

| Command | Purpose | Example |
|---|---|---|
| `ip` | Modern net tool | `ip -br a` / `ip r` |
| `ifconfig` | Legacy | `ifconfig eth0` |
| `ping` | ICMP test | `ping -c 4 google.com` |
| `traceroute` | Hop trace | `traceroute -n 8.8.8.8` |
| `mtr` | Live traceroute | `mtr 1.1.1.1` |
| `dig` | DNS lookup | `dig +short A example.com` |
| `nslookup` | DNS query | `nslookup example.com 8.8.8.8` |
| `host` | Simple DNS | `host example.com` |
| `curl` | HTTP client | `curl -fsSL https://x.com` |
| `wget` | Download | `wget -c https://x.com/file` |
| `ss` | Sockets | `ss -tulnp` |
| `netstat` | Legacy ss | `netstat -tulnp` |
| `nc` | Netcat | `nc -zv host 443` |
| `nmap` | Port scanner | `nmap -sV -p 1-1000 host` |
| `tcpdump` | Packet capture | `tcpdump -i eth0 port 80` |
| `iptables` | Firewall (legacy) | `iptables -L -n -v` |
| `nft` | nftables | `nft list ruleset` |

#### System

| Command | Purpose | Example |
|---|---|---|
| `uname` | Kernel info | `uname -a` |
| `hostnamectl` | Hostname/OS info | `hostnamectl` |
| `uptime` | Load avg | `uptime` |
| `w / who` | Logged users | `w` |
| `last` | Login history | `last -n 20` |
| `date` | Date/time | `date -u +%Y-%m-%dT%H:%M:%SZ` |
| `timedatectl` | Timezone/NTP | `timedatectl set-timezone Asia/Kolkata` |
| `systemctl` | Service control | `systemctl status nginx` |
| `journalctl` | Logs | `journalctl -u nginx -f` |
| `dmesg` | Kernel ring buffer | `dmesg -T | tail -50` |
| `free` | Memory | `free -h` |
| `vmstat` | Virtual memory stats | `vmstat 1 5` |
| `iostat` | IO stats | `iostat -xz 1` |
| `sar` | Historical perf | `sar -u 1 5` |
| `env` | Env vars | `env | grep PATH` |
| `which / type` | Locate binary | `type -a ls` |

#### Security & Users

| Command | Purpose | Example |
|---|---|---|
| `sudo` | Privilege escalation | `sudo -i` |
| `su` | Switch user | `su - deploy` |
| `passwd` | Change password | `sudo passwd alice` |
| `useradd` | Add user | `useradd -m -s /bin/bash alice` |
| `usermod` | Modify user | `usermod -aG docker alice` |
| `userdel` | Delete user | `userdel -r alice` |
| `groupadd` | Add group | `groupadd devops` |
| `id` | Show IDs | `id alice` |
| `chage` | Pass aging | `chage -l alice` |
| `getfacl/setfacl` | ACLs | `setfacl -m u:alice:rw file` |
| `fail2ban-client` | Ban abusers | `fail2ban-client status sshd` |
| `ufw / firewalld` | Firewall frontends | `ufw allow 22/tcp` |
| `openssl` | Crypto Swiss-army | `openssl s_client -connect host:443` |

#### Compression

| Command | Purpose | Example |
|---|---|---|
| `tar` | Archive | `tar -czvf a.tgz dir/` |
| `tar -x` | Extract | `tar -xzvf a.tgz` |
| `gzip / gunzip` | gzip files | `gzip -9 big.log` |
| `bzip2 / bunzip2` | bzip2 | `bzip2 file` |
| `xz / unxz` | xz (best ratio) | `xz -T0 huge.tar` |
| `zip / unzip` | Zip format | `unzip -d out/ a.zip` |
| `zcat / zless` | View gzipped | `zcat app.log.gz | grep ERR` |

#### Permissions

| Command | Purpose | Example |
|---|---|---|
| `chmod` | Change mode | `chmod 750 deploy.sh` |
| `chown` | Change owner | `chown -R deploy:deploy /opt/app` |
| `chgrp` | Change group | `chgrp www-data /var/www` |
| `umask` | Default mask | `umask 027` |

#### Disk

| Command | Purpose | Example |
|---|---|---|
| `df` | Filesystem usage | `df -hT` |
| `du` | Directory usage | `du -sh * | sort -h` |
| `lsblk` | Block devices | `lsblk -f` |
| `fdisk` | Partition tool | `sudo fdisk -l` |
| `parted` | GPT partitioning | `parted /dev/sdb print` |
| `mkfs` | Make filesystem | `mkfs.ext4 /dev/sdb1` |
| `mount / umount` | Mount FS | `mount /dev/sdb1 /mnt` |
| `blkid` | UUIDs/labels | `blkid /dev/sda1` |
| `ncdu` | TUI disk usage | `ncdu /var` |
| `fsck` | Filesystem check | `fsck -y /dev/sda1` |
| `lvm tools` | LVM | `pvs / vgs / lvs` |

#### Miscellaneous

| Command | Purpose | Example |
|---|---|---|
| `man / info` | Manuals | `man 5 crontab` |
| `tldr` | Practical examples | `tldr tar` |
| `history` | Shell history | `history | grep ssh` |
| `alias` | Define alias | `alias ll='ls -lah'` |
| `watch` | Repeat command | `watch -n 2 'df -h'` |
| `time` | Time a command | `time ./build.sh` |
| `timeout` | Limit runtime | `timeout 30s ./probe` |
| `yes` | Repeat string | `yes | apt remove pkg` |
| `screen / tmux` | Terminal multiplexer | `tmux new -s work` |
| `echo / printf` | Print | `printf "%s\n" "$VAR"` |
| `true / false` | Exit code helpers | `while true; do ...; done` |

### 2. Vim Cheat Sheet

#### Modes

| Mode | Enter | Purpose |
|---|---|---|
| Normal | `Esc` | Default; movement & commands |
| Insert | `i I a A o O` | Type text |
| Visual | `v` | Character selection |
| Visual line | `V` | Line selection |
| Visual block | `Ctrl+v` | Column / rectangular edit |
| Command | `:` | Ex commands (`:w`, `:q`) |
| Replace | `R` | Overwrite mode |
| Terminal | `:terminal` | Embedded shell |

#### Navigation

| Key | Action |
|---|---|
| `h j k l` | Left, down, up, right |
| `w / b` | Next / previous word |
| `e / ge` | End of word / previous word end |
| `0 / ^ / $` | Line start / first non-blank / line end |
| `gg / G` | File top / file bottom |
| `:42` or `42G` | Jump to line 42 |
| `Ctrl+d / Ctrl+u` | Half page down / up |
| `Ctrl+f / Ctrl+b` | Full page down / up |
| `{ / }` | Previous / next blank line |
| `%` | Match bracket |
| `f x / F x` | Find char forward / backward |
| `* / #` | Search word under cursor forward / backward |

#### Editing

| Key | Action |
|---|---|
| `i / a` | Insert before / after cursor |
| `I / A` | Insert at line start / end |
| `o / O` | New line below / above |
| `x / X` | Delete char forward / backward |
| `dd / D` | Delete line / to end of line |
| `dw / d$ / dG` | Delete word / to EOL / to EOF |
| `yy / Y` | Yank line |
| `p / P` | Paste after / before |
| `cc / C` | Change line / to EOL |
| `cw / ciw / ci"` | Change word / inner word / inside quotes |
| `r / R` | Replace one char / replace mode |
| `u / Ctrl+r` | Undo / redo |
| `.` | Repeat last change |
| `>> / <<` | Indent / dedent line |
| `J` | Join line below |

#### Search & Replace

```bash
/pattern        " Search forward
?pattern        " Search backward
n / N           " Next / previous match
:noh            " Clear highlight

:s/old/new/         " Replace first on line
:s/old/new/g        " Replace all on line
:%s/old/new/g       " Replace all in file
:%s/old/new/gc      " Confirm each
:%s/old/new/gI      " Case-sensitive (capital I)
:5,15s/old/new/g    " Replace in line range
:'<,'>s/old/new/g    " Replace in visual selection
:g/pattern/d        " Delete all lines matching
:v/pattern/d        " Delete lines NOT matching
```

#### Visual Mode

| Key | Action |
|---|---|
| `v / V / Ctrl+v` | Char / line / block selection |
| `d / y / c` | Delete / yank / change selection |
| `> / <` | Indent / dedent block |
| `~` | Toggle case |
| `u / U` | Lower / upper case selection |
| `:'<,'>sort` | Sort selected lines |
| `Ctrl+v` then `I text Esc` | Insert column prefix on all lines |

#### Advanced — Registers, Marks, Macros, Splits, Tabs

```bash
" Registers (named clipboards)
"ayy            " Yank line to register a
"ap            " Paste register a
:reg            " Show all registers
"+y             " Yank to system clipboard (needs +clipboard)
"+p             " Paste from system clipboard

" Marks
ma              " Set mark a at cursor
'a              " Jump to line of mark a
`a              " Jump to exact position of mark a
:marks          " List all marks

" Macros
qa              " Start recording macro into a
...do stuff...
q               " Stop recording
@a              " Play macro a
@@              " Replay last macro
10@a            " Play macro 10 times

" Splits
:split file     " Horizontal split  (or :sp)
:vsplit file    " Vertical split    (or :vsp)
Ctrl+w h/j/k/l  " Move between splits
Ctrl+w =        " Equalize sizes
Ctrl+w _        " Maximize height
Ctrl+w |        " Maximize width
Ctrl+w c        " Close split

" Tabs
:tabnew file    " Open in new tab
gt / gT         " Next / previous tab
:tabclose       " Close current tab
:tabs           " List tabs
```

### 3. File Permissions Reference

#### Octal Table (000–777)

| Octal | Binary | rwx | Meaning |
|---|---|---|---|
| 0 | 000 | `---` | No access |
| 1 | 001 | `--x` | Execute only |
| 2 | 010 | `-w-` | Write only |
| 3 | 011 | `-wx` | Write + execute |
| 4 | 100 | `r--` | Read only |
| 5 | 101 | `r-x` | Read + execute |
| 6 | 110 | `rw-` | Read + write |
| 7 | 111 | `rwx` | Full access |

Three digits = owner, group, others. So `750` = `rwxr-x---` (owner full, group r-x, others nothing).

#### Special Bits

| Bit | Octal | Symbol | Effect |
|---|---|---|---|
| setuid | 4000 | `s` in owner-x | Run binary as file owner (e.g. `passwd`) |
| setgid | 2000 | `s` in group-x | On dir: new files inherit group |
| sticky | 1000 | `t` in others-x | Only owner can delete (e.g. `/tmp`) |

```bash
chmod 4755 /usr/local/bin/myapp      # setuid + 755
chmod 2775 /shared/uploads           # setgid + 775
chmod 1777 /tmp                      # sticky + 777
```

#### Common Permission Patterns

| Mode | Use Case |
|---|---|
| `644` | Regular file (configs, code) |
| `600` | Sensitive file (SSH private key, secrets) |
| `640` | Owner rw, group read (shared config) |
| `755` | Executable script, directory |
| `750` | Private executable / private dir |
| `700` | Only owner (e.g. `~/.ssh`) |
| `444` | Read-only for everyone |
| `777` | Almost always wrong — security smell |

#### chmod Symbolic Operators

| Who | Op | Perm |
|---|---|---|
| `u` user | `+` add | `r` read |
| `g` group | `-` remove | `w` write |
| `o` others | `=` set | `x` execute |
| `a` all | | `X` exec only on dirs/already-exec files |

```bash
chmod u+x deploy.sh             # add execute for owner
chmod go-rwx secret.key         # remove all from group + others
chmod a=r README.md             # read-only for all
chmod -R u=rwX,g=rX,o= /app     # safe recursive (capital X)
chmod u+s /usr/bin/myapp        # setuid
```

#### chown / chgrp

```bash
chown alice file                 # change owner
chown alice:devs file            # owner + group
chown :devs file                 # only group
chown -R deploy:deploy /opt/app  # recursive
chown --reference=other.txt file # copy ownership from other.txt
chgrp www-data /var/www          # change group only
```

### 4. Bash Scripting Cheat Sheet

#### Variables & Parameters

```bash
name="alice"           # no spaces around =
echo "$name"           # always quote variable expansions
echo "${name}_log"     # disambiguate with braces
readonly PI=3.14       # constant
unset name             # delete variable
export PATH="$PATH:/opt/bin"   # export to children

# Positional params inside a script
$0       # script name
$1..$9   # args 1..9
${10}    # 10th arg (need braces)
$#       # number of args
$@       # all args (each quoted separately when "$@")
$*       # all args (one string when "$*")
$?       # exit code of last command
$$       # current PID
$!       # PID of last backgrounded command

# Parameter expansion
${var:-default}    # use default if var unset/empty
${var:=default}    # also assign default
${var:?error}      # error if unset
${var:+alt}        # use alt if var IS set
${#var}            # string length
${var:2:4}         # substring from pos 2, length 4
${var/foo/bar}     # replace first foo with bar
${var//foo/bar}    # replace ALL foo
${var#prefix}      # strip shortest prefix
${var##prefix}     # strip longest prefix
${var%.txt}        # strip shortest suffix
${var%%.*}         # strip longest suffix
```

#### Test Operators

| Category | Operator | Meaning |
|---|---|---|
| Integer | `-eq` | equal |
| Integer | `-ne` | not equal |
| Integer | `-lt` | less than |
| Integer | `-le` | less or equal |
| Integer | `-gt` | greater than |
| Integer | `-ge` | greater or equal |
| String | `=` / `==` | equal |
| String | `!=` | not equal |
| String | `-z` | zero-length (empty) |
| String | `-n` | non-empty |
| String | `< / >` | lexicographic (inside `[[ ]]`) |
| File | `-e` | exists |
| File | `-f` | is regular file |
| File | `-d` | is directory |
| File | `-L` | is symlink |
| File | `-r / -w / -x` | readable / writable / executable |
| File | `-s` | non-empty (size > 0) |
| File | `-O` | owned by you |
| File | `-G` | owned by your group |
| File | `a -nt b` | a newer than b |
| File | `a -ot b` | a older than b |

#### Control Structures

```bash
# if / elif / else
if [[ $count -gt 10 ]]; then
  echo "many"
elif [[ -z "$name" ]]; then
  echo "no name"
else
  echo "ok"
fi

# case
case "$env" in
  prod|production)  echo "prod" ;;
  dev|development)  echo "dev"  ;;
  *)                echo "unknown"; exit 1 ;;
esac

# for
for f in *.log; do
  gzip "$f"
done
for i in {1..5}; do echo "$i"; done
for ((i=0; i<10; i++)); do echo "$i"; done

# while / until
while read -r line; do
  echo "got: $line"
done < file.txt

count=0
until [[ $count -ge 5 ]]; do
  ((count++))
done

# functions
deploy() {
  local env="$1"      # 'local' avoids polluting global scope
  echo "deploying to $env"
  return 0
}
deploy prod
```

#### Common Idioms

```bash
# Strict mode (put at top of every serious script)
set -euo pipefail
IFS=$'\n\t'

# Check command exists
if ! command -v jq >/dev/null 2>&1; then
  echo "jq required" >&2; exit 1
fi

# Retry loop with backoff
for attempt in 1 2 3 4 5; do
  curl -fsSL "$URL" && break
  sleep $((2 ** attempt))
done

# Parse args (getopts)
while getopts "e:vh" opt; do
  case "$opt" in
    e) ENV="$OPTARG" ;;
    v) VERBOSE=1 ;;
    h) usage; exit 0 ;;
    *) usage; exit 1 ;;
  esac
done
shift $((OPTIND - 1))

# Trap cleanup
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT INT TERM

# Read file line by line (safe)
while IFS= read -r line || [[ -n "$line" ]]; do
  process "$line"
done < input.txt

# Heredoc
cat <<EOF > /etc/myapp/config
host=$(hostname)
env=$ENV
EOF
```

#### Arrays

```bash
# Indexed array
servers=(web1 web2 web3)
echo "${servers[0]}"          # web1
echo "${servers[@]}"          # all elements
echo "${#servers[@]}"         # length = 3
servers+=(web4)               # append
unset 'servers[1]'            # delete element

for s in "${servers[@]}"; do echo "$s"; done

# Associative array (bash 4+)
declare -A user_role
user_role[alice]=admin
user_role[bob]=dev
echo "${user_role[alice]}"
for k in "${!user_role[@]}"; do
  echo "$k => ${user_role[$k]}"
done
```

#### Brace Expansion

```bash
echo file{1,2,3}.txt          # file1.txt file2.txt file3.txt
echo {a..e}                   # a b c d e
echo {01..05}                 # 01 02 03 04 05
echo {1..10..2}               # 1 3 5 7 9
mkdir -p project/{src,test,docs}/{api,web}
cp app.conf{,.bak}            # quick backup -> app.conf, app.conf.bak
```

### 5. Regular Expressions

#### BRE vs ERE Side-by-Side

| Feature | BRE (grep, sed) | ERE (egrep, grep -E, sed -E, awk) |
|---|---|---|
| Alternation | `\|` | `|` |
| Grouping | `\( \)` | `( )` |
| One or more | `\+` | `+` |
| Zero or one | `\?` | `?` |
| Repetition | `\{m,n\}` | `{m,n}` |
| Zero or more | `*` | `*` |
| Backrefs | `\1 \2` | `\1 \2` |

Rule of thumb: use `grep -E` (ERE) — fewer backslashes, fewer tears.

#### Character Classes

| Class | Matches |
|---|---|
| `.` | Any single char (except newline) |
| `[abc]` | a, b, or c |
| `[^abc]` | NOT a, b, c |
| `[a-z]` | Lowercase letters |
| `[A-Za-z0-9_]` | "word" chars |
| `\d` / `\D` | Digit / non-digit (PCRE) |
| `\w` / `\W` | Word / non-word (PCRE) |
| `\s` / `\S` | Whitespace / non-ws (PCRE) |
| `[[:alpha:]]` | POSIX alpha |
| `[[:digit:]]` | POSIX digit |
| `[[:space:]]` | POSIX whitespace |
| `[[:alnum:]]` | POSIX alphanumeric |
| `[[:upper:]]` / `[[:lower:]]` | POSIX case |
| `[[:punct:]]` | POSIX punctuation |

#### Anchors & Quantifiers

| Pattern | Meaning |
|---|---|
| `^` | Start of line |
| `$` | End of line |
| `\b` | Word boundary |
| `\B` | Non-word-boundary |
| `\A` / `\Z` | Start / end of input (PCRE) |
| `*` | 0 or more |
| `+` | 1 or more |
| `?` | 0 or 1 |
| `{3}` | Exactly 3 |
| `{3,}` | 3 or more |
| `{3,5}` | Between 3 and 5 |
| `*?` `+?` | Lazy / non-greedy (PCRE) |

#### 10 Example Patterns

| # | Matches | Pattern (ERE) |
|---|---|---|
| 1 | Email (pragmatic) | `[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}` |
| 2 | IPv4 address (loose) | `([0-9]{1,3}\.){3}[0-9]{1,3}` |
| 3 | IPv4 strict (0–255) | `((25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)` |
| 4 | URL (http/https) | `https?://[A-Za-z0-9._~:/?#\[\]@!$&'()*+,;=%-]+` |
| 5 | Date YYYY-MM-DD | `[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])` |
| 6 | Time HH:MM:SS (24h) | `([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]` |
| 7 | ISO timestamp | `[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]+)?(Z|[+-][0-9]{2}:[0-9]{2})` |
| 8 | Indian mobile number | `(\+91[- ]?)?[6-9][0-9]{9}` |
| 9 | UUIDv4 | `[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}` |
| 10 | Nginx access log IP | `^([0-9]{1,3}\.){3}[0-9]{1,3} ` |

```bash
# Practical usage
grep -E '([0-9]{1,3}\.){3}[0-9]{1,3}' access.log
sed -E 's/[0-9]{4}-[0-9]{2}-[0-9]{2}/REDACTED/g' file
awk '/ERROR|FATAL/ {print}' app.log
```

### 6. SSH Commands Cheat Sheet

#### Key Generation & Distribution

```bash
# Generate modern keypair (ed25519 preferred)
ssh-keygen -t ed25519 -C "pushkar@1buy.ai"
ssh-keygen -t rsa -b 4096 -C "fallback"     # legacy systems

# View public key
cat ~/.ssh/id_ed25519.pub

# Copy public key to server (easiest)
ssh-copy-id -i ~/.ssh/id_ed25519.pub deploy@10.0.0.5

# Manually
cat ~/.ssh/id_ed25519.pub | ssh deploy@host \
  'mkdir -p ~/.ssh && chmod 700 ~/.ssh && \
   cat >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys'

# Fingerprint
ssh-keygen -lf ~/.ssh/id_ed25519.pub
```

#### ~/.ssh/config Snippets

```bash
Host *
  ServerAliveInterval 60
  ServerAliveCountMax 3
  HashKnownHosts yes

Host prod-web
  HostName 10.0.0.5
  User deploy
  Port 2222
  IdentityFile ~/.ssh/id_ed25519
  IdentitiesOnly yes

Host bastion
  HostName bastion.1buy.ai
  User pushkar

# Jump through bastion to private host
Host db-private
  HostName 10.0.5.20
  User dbadmin
  ProxyJump bastion

# Now just: ssh prod-web   /   ssh db-private
```

#### Tunneling (L / R / D)

| Flag | Direction | Use Case |
|---|---|---|
| `-L` | Local → Remote | Access remote service via local port |
| `-R` | Remote → Local | Expose local service on remote host |
| `-D` | Dynamic (SOCKS) | Use server as SOCKS5 proxy |

```bash
# Local forward: localhost:5433 -> db.internal:5432 via bastion
ssh -L 5433:db.internal:5432 bastion
psql -h localhost -p 5433 -U app

# Remote forward: expose local dev server on remote:9000
ssh -R 9000:localhost:3000 user@remote

# Dynamic / SOCKS proxy on localhost:1080
ssh -D 1080 -C -N bastion
# Configure browser SOCKS5 -> localhost:1080

# Run tunnel in background, no shell
ssh -fN -L 5433:db:5432 bastion
```

#### SSH Agent

```bash
eval "$(ssh-agent -s)"          # start agent
ssh-add ~/.ssh/id_ed25519       # load key
ssh-add -l                      # list loaded keys
ssh-add -D                      # remove all
ssh -A user@host                # forward agent (use cautiously)
```

#### scp / sftp / rsync

```bash
# scp (simple)
scp file.txt user@host:/tmp/
scp -r dir/ user@host:/opt/
scp -P 2222 -i key.pem ...      # custom port, custom key
scp user@host:/etc/nginx.conf .

# sftp (interactive)
sftp user@host
> put localfile
> get remotefile
> ls -la
> bye

# rsync (best for repeated syncs)
rsync -avz --progress src/ user@host:/dst/
rsync -avz --delete src/ user@host:/dst/        # mirror (deletes extras)
rsync -avz -e "ssh -p 2222 -i key.pem" src/ host:/dst/
rsync -avz --exclude '.git' --exclude 'node_modules' src/ host:/dst/
rsync -avzn src/ host:/dst/                     # -n = dry run
```

#### sshd_config Hardening (server side)

```bash
# /etc/ssh/sshd_config
Port 2222                          # change default
PermitRootLogin no                 # never allow root login
PasswordAuthentication no          # keys only
PubkeyAuthentication yes
PermitEmptyPasswords no
ChallengeResponseAuthentication no
UsePAM yes
X11Forwarding no
MaxAuthTries 3
LoginGraceTime 30
ClientAliveInterval 300
ClientAliveCountMax 2
AllowUsers deploy pushkar
AllowGroups sshusers
Protocol 2
KexAlgorithms curve25519-sha256,curve25519-sha256@libssh.org
Ciphers chacha20-poly1305@openssh.com,aes256-gcm@openssh.com
MACs hmac-sha2-512-etm@openssh.com,hmac-sha2-256-etm@openssh.com

# Apply
sudo sshd -t                       # test config first!
sudo systemctl reload sshd
```

### 7. System Monitoring

#### top

```bash
top                           # launch
# Interactive keys:
P    sort by CPU
M    sort by memory
T    sort by time
N    sort by PID
k    kill process (asks PID + signal)
r    renice
c    toggle full command line
1    toggle per-CPU view
H    toggle threads
W    save config to ~/.toprc
q    quit
top -b -n 1                   # batch mode (for scripts)
top -p 1234,5678              # only specific PIDs
top -u deploy                 # only user deploy
```

#### htop

```bash
htop                          # nicer top
# F1 help  F2 setup  F3 search  F4 filter  F5 tree
# F6 sort  F7/F8 nice +/-  F9 kill  F10 quit
# Space = tag a process; u = filter by user
```

#### ps

```bash
ps aux                              # BSD style, all processes
ps -ef                              # System V style
ps -eLf                             # threads too
ps -eo pid,user,%cpu,%mem,cmd --sort=-%cpu | head
ps --ppid 1234                      # children of PID 1234
ps -C nginx                         # find by command name
pstree -p                           # process tree with PIDs
```

#### Memory & CPU

```bash
free -h                             # memory in human units
free -m -s 2                        # refresh every 2s
cat /proc/meminfo
cat /proc/cpuinfo

vmstat 1 5                          # 5 samples, 1 sec apart
# columns: r b | swpd free buff cache | si so | bi bo | in cs | us sy id wa st

iostat -xz 1                        # extended IO stats, skip idle
iostat -mx 2 5                      # MB/s, 5 samples

mpstat -P ALL 1 3                   # per-CPU stats
```

#### sar (historical perf)

```bash
sar -u 1 5                          # CPU
sar -r 1 5                          # memory
sar -b 1 5                          # IO
sar -n DEV 1 5                      # network
sar -q 1 5                          # load avg + run queue
sar -f /var/log/sysstat/sa15        # read past data (day 15)
```

#### Kernel & Hardware

```bash
dmesg -T | tail -50                 # kernel messages w/ timestamps
dmesg -w                            # follow
lscpu                               # CPU info
lsblk -f                            # block devs + filesystems
lspci                               # PCI devices
lsusb                               # USB devices
lsmod                               # loaded modules
uname -r                            # kernel version
```

#### Disk & Sockets

```bash
df -hT                              # disk usage by FS
df -i                               # inode usage
du -sh /var/log/*                   # size per item
du -sh * 2>/dev/null | sort -h      # sorted
ncdu /                              # interactive TUI

ss -tulnp                           # listening TCP/UDP sockets + processes
ss -s                               # socket summary
ss -tan state established           # established TCP conns
```

### 8. Network Commands

#### ip (the modern tool)

```bash
ip a                          # show all addresses
ip -br a                      # brief view
ip -4 a show eth0             # only IPv4 on eth0
ip r                          # routing table
ip -br link                   # link state of interfaces
ip neigh                      # ARP table (neighbors)

# Modify
sudo ip addr add 10.0.0.10/24 dev eth1
sudo ip addr del 10.0.0.10/24 dev eth1
sudo ip link set eth1 up
sudo ip link set eth1 down
sudo ip route add default via 10.0.0.1
```

#### ping & traceroute

```bash
ping -c 4 google.com          # 4 packets then stop
ping -i 0.2 -c 20 host        # 20 packets, 0.2s apart
ping -s 1472 -M do host       # MTU test (don't fragment)

traceroute -n 8.8.8.8         # numeric, no DNS
traceroute -T -p 443 host     # TCP traceroute on port 443
mtr -rwn 1.1.1.1              # report mode, wide, numeric
```

#### dig (DNS)

```bash
dig example.com               # default A record
dig +short A example.com
dig +short MX example.com
dig +short NS example.com
dig +short TXT example.com
dig AAAA example.com          # IPv6
dig @8.8.8.8 example.com      # query specific resolver
dig +trace example.com        # full delegation chain
dig -x 8.8.8.8                # reverse lookup
dig +noall +answer example.com
```

#### curl (essential flags)

| Flag | Meaning |
|---|---|
| `-X METHOD` | HTTP method (GET/POST/PUT/DELETE) |
| `-H "Header: val"` | Add request header |
| `-d 'data'` | POST body |
| `--data-binary @file` | POST file contents as body |
| `-F 'k=v'` | multipart/form-data |
| `-u user:pass` | Basic auth |
| `-o file` | Output to file |
| `-O` | Save to remote filename |
| `-L` | Follow redirects |
| `-I` | HEAD request, headers only |
| `-i` | Include response headers |
| `-s` | Silent (no progress) |
| `-f` | Fail on HTTP errors (4xx/5xx) |
| `-k` | Insecure (skip cert validation) |
| `-v / --trace-ascii -` | Verbose / full trace |
| `--resolve host:port:ip` | Override DNS |
| `-w "%{http_code}\n"` | Print response info |

```bash
curl -fsSL https://api.example.com/v1/users | jq
curl -X POST -H 'Content-Type: application/json' \
     -d '{"name":"alice"}' https://api/x
curl -w "code=%{http_code} time=%{time_total}\n" -o /dev/null -s https://x.com
```

#### ss (sockets)

```bash
ss -tulnp                     # TCP/UDP listening + process
ss -tan                       # all TCP
ss -tan state established
ss -tan state time-wait | wc -l
ss -tnp '( dport = :443 )'    # outbound HTTPS
ss -lx                        # unix sockets
```

#### nmap

```bash
nmap -sn 10.0.0.0/24                  # ping sweep (host discovery)
nmap -p 22,80,443 host                # specific ports
nmap -p- host                         # all 65535 ports
nmap -sV -p 1-1000 host               # service version detect
nmap -sS -O host                      # SYN scan + OS detect (needs root)
nmap -A host                          # aggressive: version+OS+scripts+traceroute
nmap --script vuln host               # vulnerability scripts
```

#### tcpdump

```bash
sudo tcpdump -i eth0                          # capture on eth0
sudo tcpdump -i any -nn port 80               # HTTP traffic, numeric
sudo tcpdump -i eth0 host 10.0.0.5            # to/from a host
sudo tcpdump -i eth0 -w out.pcap port 443     # write capture
sudo tcpdump -r out.pcap -nn                  # read capture
sudo tcpdump -i eth0 'tcp[tcpflags] & (tcp-syn) != 0'   # SYN packets
sudo tcpdump -i eth0 -A port 80               # print ASCII payload
```

#### nc & telnet

```bash
nc -zv host 22 443 8080         # port check (z=scan, v=verbose)
nc -l -p 9000                   # listen on port 9000
nc host 9000                    # connect (chat)
nc -l 9000 > file.bin           # receive file
nc host 9000 < file.bin         # send file
echo "GET / HTTP/1.0" | nc host 80   # raw HTTP request
telnet host 25                  # legacy, still handy for SMTP debug
```

### 9. Process Management

#### ps Options You'll Actually Use

| Command | Output |
|---|---|
| `ps` | Your shell's processes only |
| `ps aux` | All processes (BSD): USER PID %CPU %MEM ... COMMAND |
| `ps -ef` | All processes (SysV): UID PID PPID C STIME TTY TIME CMD |
| `ps -eLf` | Include threads (LWP) |
| `ps -fp 1234` | Full info for PID 1234 |
| `ps -ef --forest` | ASCII tree view |
| `ps -eo pid,user,pri,ni,%cpu,%mem,stat,start,cmd --sort=-%mem | head` | Custom top-by-memory |

#### top / htop Keys

| Key | top | htop |
|---|---|---|
| `h` / `F1` | Help | Help |
| `P` | Sort by CPU | — |
| `M` | Sort by memory | — |
| `F6` | — | Choose sort column |
| `k` / `F9` | Kill (asks PID + signal) | Kill (signal menu) |
| `r` / `F7/F8` | Renice | Nice +/- |
| `F3` | — | Search |
| `F4` | — | Filter |
| `F5` | — | Tree view |
| `q` / `F10` | Quit | Quit |

#### Signals Table

| Signal | Num | Default | Meaning |
|---|---|---|---|
| `SIGHUP` | 1 | Terminate | Reload config / parent shell exited |
| `SIGINT` | 2 | Terminate | Ctrl+C from terminal |
| `SIGQUIT` | 3 | Core dump | Ctrl+\ |
| `SIGILL` | 4 | Core dump | Illegal instruction |
| `SIGABRT` | 6 | Core dump | abort() called |
| `SIGKILL` | 9 | Terminate | Force kill (cannot be caught) |
| `SIGSEGV` | 11 | Core dump | Invalid memory access |
| `SIGPIPE` | 13 | Terminate | Write to closed pipe |
| `SIGTERM` | 15 | Terminate | Graceful kill (default for `kill`) |
| `SIGUSR1` | 10 | Terminate | App-defined (often "rotate logs") |
| `SIGUSR2` | 12 | Terminate | App-defined |
| `SIGCHLD` | 17 | Ignore | Child stopped/exited |
| `SIGCONT` | 18 | Continue | Resume a stopped process |
| `SIGSTOP` | 19 | Stop | Stop (cannot be caught) |
| `SIGTSTP` | 20 | Stop | Ctrl+Z |

#### kill / pkill / killall / pgrep

```bash
kill 1234                      # SIGTERM (default)
kill -9 1234                   # SIGKILL by number
kill -SIGTERM 1234             # by name
kill -HUP $(pidof nginx)       # reload nginx config

pgrep -f gunicorn              # find PIDs by full cmdline
pgrep -af gunicorn             # also show cmdline
pkill -f gunicorn              # kill all matching
pkill -HUP -f nginx            # signal all matching

killall nginx                  # kill by exact process name
killall -u alice               # kill all of user alice's processes
```

#### nice / renice

```bash
# Nice value range: -20 (highest priority) to 19 (lowest)
nice -n 10 ./batch.sh                # start with niceness 10
renice 5 -p 1234                     # change running process
renice -n 15 -u alice                # all of alice's processes
ionice -c 3 -p 1234                  # IO scheduling class (3=idle)
```

#### nohup & Job Control

```bash
nohup ./long_job.sh > out.log 2>&1 &     # survives logout
disown %1                                # detach job from shell
./job.sh &                               # background
jobs                                     # list shell jobs
jobs -l                                  # with PIDs
fg %1                                    # foreground job 1
bg %1                                    # resume in background
Ctrl+Z                                   # suspend foreground job
```

#### systemctl

```bash
systemctl status nginx
systemctl start  nginx
systemctl stop   nginx
systemctl restart nginx
systemctl reload  nginx                  # signal reload, no restart
systemctl enable  --now nginx            # enable + start
systemctl disable --now nginx
systemctl is-active nginx
systemctl is-enabled nginx
systemctl list-units --type=service
systemctl list-units --failed
systemctl daemon-reload                  # after editing unit files
systemctl cat nginx                      # show unit file
systemctl edit nginx                     # override
systemctl mask nginx                     # prevent any start (strong disable)
```

#### journalctl

```bash
journalctl -u nginx                      # logs for nginx
journalctl -u nginx -f                   # follow (like tail -f)
journalctl -u nginx --since "10 min ago"
journalctl -u nginx --since "2026-05-26 09:00" --until "2026-05-26 10:00"
journalctl -u nginx -p err               # priority err and above
journalctl -k                            # kernel only (= dmesg)
journalctl -b                            # current boot
journalctl -b -1                         # previous boot
journalctl --disk-usage
journalctl --vacuum-time=7d              # keep only last 7 days
```

### 10. Cron Expressions

#### Field Syntax

```bash
┌───────────── minute        (0 - 59)
│ ┌─────────── hour          (0 - 23)
│ │ ┌───────── day of month  (1 - 31)
│ │ │ ┌─────── month         (1 - 12)  or JAN-DEC
│ │ │ │ ┌───── day of week   (0 - 6)   or SUN-SAT  (0 and 7 = Sun)
│ │ │ │ │
* * * * *  command_to_run
```

#### Special Characters

| Char | Meaning | Example |
|---|---|---|
| `*` | Every value | `* * * * *` = every minute |
| `,` | List | `0 9,12,18 * * *` = 9am, 12pm, 6pm |
| `-` | Range | `0 9-17 * * 1-5` = 9–5 Mon–Fri |
| `/` | Step | `*/15 * * * *` = every 15 minutes |
| `L` (extended) | Last | `0 0 L * *` = last day of month (not standard cron) |
| `?` (extended) | No value | Used in Quartz/Spring |

#### 20+ Real Examples

| Expression | Runs |
|---|---|
| `* * * * *` | Every minute |
| `*/5 * * * *` | Every 5 minutes |
| `*/15 * * * *` | Every 15 minutes |
| `0 * * * *` | Every hour on the hour |
| `0 */2 * * *` | Every 2 hours |
| `30 3 * * *` | 3:30 AM every day |
| `0 0 * * *` | Midnight every day |
| `0 9 * * 1-5` | 9 AM weekdays |
| `0 9 * * 1` | 9 AM every Monday |
| `0 9 * * 0` | 9 AM every Sunday |
| `0 9-17 * * 1-5` | Every hour, 9–5, weekdays |
| `0 0 1 * *` | Midnight on 1st of month |
| `0 0 1 1 *` | Midnight on Jan 1 (yearly) |
| `0 0 1,15 * *` | 1st and 15th at midnight |
| `0 2 * * 6` | 2 AM every Saturday (weekly backup) |
| `15 14 1 * *` | 2:15 PM on the 1st of each month |
| `0 22 * * 1-5` | 10 PM weekdays |
| `5 4 * * SUN` | 4:05 AM every Sunday |
| `0 4 1-7 * 1` | 4 AM on first Monday of month (kind of) |
| `*/10 9-17 * * 1-5` | Every 10 min, business hours, weekdays |
| `0 0 */3 * *` | Midnight every 3 days |
| `0 12 * * 1#1` | Noon on first Monday (extended/Quartz) |

#### @ Shortcuts

| Shortcut | Equivalent | Meaning |
|---|---|---|
| `@reboot` | — | Once at startup |
| `@yearly` / `@annually` | `0 0 1 1 *` | Once a year |
| `@monthly` | `0 0 1 * *` | Once a month |
| `@weekly` | `0 0 * * 0` | Once a week (Sunday) |
| `@daily` / `@midnight` | `0 0 * * *` | Once a day |
| `@hourly` | `0 * * * *` | Once an hour |

#### Managing Crontabs

```bash
crontab -l                    # list current user's crontab
crontab -e                    # edit (uses $EDITOR)
crontab -r                    # remove (be careful!)
crontab -u alice -l           # list alice's crontab (need root)

# System-wide files:
/etc/crontab                  # has a 'user' column
/etc/cron.d/*                 # drop-in files (also need user column)
/etc/cron.{hourly,daily,weekly,monthly}/   # scripts dir (no schedule)

# Always set env + redirect output in cron jobs:
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
MAILTO=ops@1buy.ai

0 3 * * * /opt/scripts/backup.sh >> /var/log/backup.log 2>&1

# Useful for verifying: test online at crontab.guru
```

## Keyboard Shortcuts and Aliases

Speed comes from muscle memory, not from typing faster. *Jab tak yeh shortcuts hath mein nahi aate, productivity boost nahi milega.* Pick 10 from this list, drill them this week, then come back for the next 10.

### Terminal Keyboard Shortcuts (Readline / Bash)

#### Cursor & Editing

| Shortcut | Action |
|---|---|
| `Ctrl+A` | Move to beginning of line |
| `Ctrl+E` | Move to end of line |
| `Ctrl+B` / `Ctrl+F` | Back / forward one character |
| `Alt+B` / `Alt+F` | Back / forward one word |
| `Ctrl+U` | Cut from cursor to beginning of line |
| `Ctrl+K` | Cut from cursor to end of line |
| `Ctrl+W` | Cut previous word |
| `Alt+D` | Cut next word |
| `Ctrl+Y` | Paste (yank) last cut |
| `Ctrl+T` | Swap current and previous character |
| `Alt+T` | Swap current and previous word |
| `Ctrl+_` | Undo last edit |
| `Ctrl+L` | Clear screen (keeps current line) |

#### Process & Session

| Shortcut | Action |
|---|---|
| `Ctrl+C` | Send SIGINT (interrupt) to foreground process |
| `Ctrl+Z` | Send SIGTSTP (suspend) — resume with `fg` or `bg` |
| `Ctrl+D` | EOF — exits shell if line is empty |
| `Ctrl+S` | Freeze terminal output (XOFF) — try not to hit this |
| `Ctrl+Q` | Resume frozen terminal (XON) |
| `Ctrl+\` | SIGQUIT — like Ctrl+C but with core dump |

#### History & Search

| Shortcut | Action |
|---|---|
| `Ctrl+R` | Reverse-i-search through history (press again for next match) |
| `Ctrl+G` | Cancel reverse search |
| `Ctrl+P` / `Ctrl+N` | Previous / next history entry |
| `Alt+.` | Insert last argument of previous command (press repeatedly) |

#### History Expansion (the bang stuff)

| Expansion | Meaning |
|---|---|
| `!!` | Previous command in full (e.g. `sudo !!`) |
| `!$` | Last argument of previous command |
| `!*` | All arguments of previous command |
| `!N` | Command number N from history |
| `!-N` | N commands back |
| `!abc` | Most recent command starting with `abc` |
| `!?abc?` | Most recent command containing `abc` |
| `^old^new` | Re-run previous command, replacing first `old` with `new` |
| `!!:gs/old/new/` | Re-run previous command, global substitution |

```bash
# Forgot sudo?
$ apt update
E: Permission denied
$ sudo !!         # expands to:  sudo apt update

# Typo in long command?
$ systemctl restrat nginx
$ ^restrat^restart

# Reuse last argument
$ mkdir /opt/myapp
$ cd !$           # cd /opt/myapp
```

### Bash History Management

```bash
# View / search
history                   # show full history
history 20                # last 20
history | grep ssh        # filter

# Re-run by number
!457                      # run history entry 457
!-2                       # run 2 commands ago

# Delete entries
history -d 457            # delete entry 457
history -c                # clear ALL history (session)
history -w                # write current session to file

# Tune behavior in ~/.bashrc
HISTSIZE=10000                       # in-memory entries
HISTFILESIZE=20000                   # on-disk entries
HISTCONTROL=ignoreboth:erasedups     # skip dupes & lines starting with space
HISTTIMEFORMAT="%F %T "              # add timestamps
HISTIGNORE="ls:ll:pwd:exit:clear:history"   # never record these
shopt -s histappend                  # append, don't overwrite
shopt -s cmdhist                     # multi-line commands as one entry

# Share history across sessions in real time:
PROMPT_COMMAND='history -a; history -n'
```

> **Tip:** Prepending a command with a space (when `HISTCONTROL` includes `ignorespace` or `ignoreboth`) keeps it out of history — handy when typing one-off commands with secrets.

### Tab Completion

| Trigger | What it completes |
|---|---|
| `Tab` (once) | Complete if unambiguous |
| `Tab Tab` (double) | Show all possible completions |
| After `cd ` | Directories only |
| After `ssh ` / `scp ` | Hostnames from `~/.ssh/config` and `~/.ssh/known_hosts` |
| After `$` | Environment variable names |
| After `~` | Usernames (for home dirs) |
| After `git `, `kubectl `, `docker ` | Subcommands, flags, resources (with completion installed) |

```bash
# Enable programmable completion (most distros do this by default)
# /etc/bash_completion or in ~/.bashrc:
[ -r /usr/share/bash-completion/bash_completion ] && \
  . /usr/share/bash-completion/bash_completion

# Add tool-specific completion
source <(kubectl completion bash)
source <(helm completion bash)
complete -F __start_kubectl k        # so 'k <tab>' also works

# Show completions for a command
complete -p git
```

### 20+ Useful Aliases for ~/.bashrc

```bash
# ---------- Navigation & Listing ----------
alias ll='ls -lah --color=auto'           # long, human, hidden, colored
alias la='ls -A --color=auto'             # show dotfiles (no . and ..)
alias l='ls -CF --color=auto'             # quick column listing
alias ..='cd ..'                          # up one
alias ...='cd ../..'                      # up two
alias ....='cd ../../..'                  # up three
alias -- -='cd -'                         # toggle to previous dir

# ---------- Safety ----------
alias rm='rm -i'                          # ask before remove
alias cp='cp -i'                          # ask before overwrite
alias mv='mv -i'                          # ask before overwrite
alias mkdir='mkdir -pv'                   # parents + verbose

# ---------- Search / Filters ----------
alias grep='grep --color=auto'            # colored matches
alias egrep='egrep --color=auto'
alias fgrep='fgrep --color=auto'

# ---------- Disk / System ----------
alias df='df -hT'                         # human + filesystem type
alias du='du -h --max-depth=1'            # human, one level
alias free='free -h'                      # human memory
alias ports='ss -tulnp'                   # what's listening?
alias psg='ps aux | grep -v grep | grep -iE'  # process search

# ---------- Network ----------
alias myip='curl -s https://ifconfig.me && echo'   # public IP
alias localip="ip -4 -br a | grep -v '^lo'"        # local IPs
alias weather='curl -s wttr.in/Bengaluru?format=3' # quick weather
alias headers='curl -sI'                           # response headers only

# ---------- Git ----------
alias g='git'
alias gs='git status -sb'                 # short branch + status
alias gco='git checkout'
alias gcm='git commit -m'
alias gp='git pull --rebase'
alias gpush='git push'
alias gl='git log --oneline --graph --decorate -20'
alias gd='git diff'

# ---------- DevOps Tools ----------
alias k='kubectl'                         # the universal short form
alias kgp='kubectl get pods'
alias kgs='kubectl get svc'
alias kdp='kubectl describe pod'
alias kx='kubectl config use-context'
alias kns='kubectl config set-context --current --namespace'
alias d='docker'
alias dc='docker compose'
alias dps='docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"'
alias tf='terraform'
alias jc='journalctl -u'                  # usage: jc nginx -f
alias sc='systemctl'                      # usage: sc status nginx

# ---------- Misc Quality of Life ----------
alias path='echo -e ${PATH//:/\\n}'       # print PATH one entry per line
alias now='date "+%Y-%m-%d %H:%M:%S"'     # quick timestamp
alias reload='source ~/.bashrc'           # re-source after edits
alias ports-listening='sudo lsof -i -P -n | grep LISTEN'
alias ..git='cd $(git rev-parse --show-toplevel)'  # jump to repo root
```

**Rationale.** Aliases like `ll`, `..`, `k`, `d`, `gs` shave 5–10 keystrokes off the dozens of times you type them daily. Safety aliases (`rm -i`, `cp -i`) save you from career-ending mistakes — yes, even seniors have done `rm -rf /` at 2 AM. The `myip`/`localip`/`ports` ones replace "wait, what's that command again?" with one word.

To make aliases work in non-interactive contexts (rare but useful for scripts), put them in `~/.bash_aliases` and source that file from `~/.bashrc`.

### Useful Bash Functions

```bash
# --- mkcd: make a directory and cd into it in one step ---
mkcd() {
  if [[ -z "$1" ]]; then
    echo "Usage: mkcd <dir>" >&2
    return 1
  fi
  mkdir -p -- "$1" && cd -P -- "$1"
}
# Usage:  mkcd /opt/projects/new-app

# --- extract: smart extractor for any common archive ---
extract() {
  if [[ -z "$1" ]]; then
    echo "Usage: extract <archive>" >&2
    return 1
  fi
  if [[ ! -f "$1" ]]; then
    echo "extract: '$1' is not a regular file" >&2
    return 1
  fi
  case "$1" in
    *.tar.bz2|*.tbz2)   tar -xjvf "$1"   ;;
    *.tar.gz|*.tgz)     tar -xzvf "$1"   ;;
    *.tar.xz|*.txz)     tar -xJvf "$1"   ;;
    *.tar.zst)          tar --zstd -xvf "$1" ;;
    *.tar)              tar -xvf  "$1"   ;;
    *.bz2)              bunzip2   "$1"   ;;
    *.gz)               gunzip    "$1"   ;;
    *.xz)               unxz      "$1"   ;;
    *.zip)              unzip     "$1"   ;;
    *.rar)              unrar x   "$1"   ;;
    *.7z)               7z x      "$1"   ;;
    *.Z)                uncompress "$1"  ;;
    *) echo "extract: don't know how to handle '$1'" >&2; return 1 ;;
  esac
}
# Usage:  extract release-v2.4.1.tar.gz

# --- bak: quick timestamped backup of a file ---
bak() {
  if [[ -z "$1" ]]; then
    echo "Usage: bak <file>" >&2
    return 1
  fi
  if [[ ! -e "$1" ]]; then
    echo "bak: '$1' does not exist" >&2
    return 1
  fi
  local ts
  ts=$(date +%Y%m%d-%H%M%S)
  cp -a -- "$1" "$1.bak.$ts" && \
    echo "Backed up to $1.bak.$ts"
}
# Usage:  bak /etc/nginx/nginx.conf
#         -> /etc/nginx/nginx.conf.bak.20260526-101530

# --- Bonus: cdf -- cd into the directory of a file ---
cdf() {
  if [[ -z "$1" ]]; then
    echo "Usage: cdf <file>" >&2
    return 1
  fi
  cd -- "$(dirname -- "$1")"
}

# --- Bonus: fkill -- fuzzy kill (needs fzf) ---
fkill() {
  local pid
  pid=$(ps -ef | sed 1d | fzf -m | awk '{print $2}')
  [[ -n "$pid" ]] && echo "$pid" | xargs kill -"${1:-15}"
}
```

Drop these into `~/.bashrc` (or a sourced `~/.bash_functions` file), run `source ~/.bashrc`, and they become first-class commands. The `extract` function alone will save you "wait, was it `xjvf` or `xzvf`?" lookups for the rest of your career. *Ek baar set kar do, jeevan bhar kaam aayega.*

## Advanced Linux for DevOps

Yahan se asli DevOps game shuru hota hai. Containers, kernel tuning, boot internals, LVM, RAID — yeh sab woh layer hai jo "React dev to ₹30+ LPA DevOps engineer" ka transition complete karta hai. Ek interviewer aapse poochega: "Docker container kaise kaam karta hai under the hood?" — agar aap namespaces + cgroups + overlayfs + capabilities samjha sake, aap already top 20% candidates mein hain.

### Containers Are Not Magic — They Are Linux Features

Ek container = **namespaces (isolation) + cgroups (resource limits) + overlayfs (layered FS) + capabilities (privilege control)**. Docker, containerd, Podman — sab kuch is foundation pe baithe hain. VM ke jaise full hypervisor nahi chahiye; kernel shared hota hai host ke saath, lekin processes ko alag dikhta hai jaise unka apna OS ho.

### Linux Namespaces — Process Ka Apna Universe

Namespaces ek process group ko system ka ek subset dikhate hain. Container ke andar process ko lagta hai woh PID 1 hai, uska apna network stack hai, apna filesystem root hai.

| Namespace | Flag | What It Isolates | Practical Effect |
|---|---|---|---|
| `pid` | `CLONE_NEWPID` | Process IDs | Container ka PID 1 host ka PID 14523 ho sakta hai |
| `mnt` | `CLONE_NEWNS` | Mount points / filesystem view | Container ko apna `/`, host ka `/` nahi dikhta |
| `net` | `CLONE_NEWNET` | Network interfaces, routes, iptables, sockets | Apna eth0, apni loopback, apni iptables rules |
| `ipc` | `CLONE_NEWIPC` | SysV IPC, POSIX message queues | Shared memory segments isolated |
| `uts` | `CLONE_NEWUTS` | Hostname, domain name | Har container ka apna hostname (`hostname` command) |
| `user` | `CLONE_NEWUSER` | UID/GID mappings | Container ka root (UID 0) host pe unprivileged user 100000 |
| `cgroup` | `CLONE_NEWCGROUP` | Cgroup root view | Container ko cgroup hierarchy ka subset dikhta hai |

### Manual Namespace Creation — Container Banayein Bina Docker Ke

```bash
# Naya PID + network + mount namespace banayein
sudo unshare --pid --net --mount --uts --ipc --fork --mount-proc bash

# Andar jaake check karein
echo $$                    # PID 1 dikhega (host pe yeh kuch aur hai)
hostname container-demo    # Sirf is namespace mein change hoga
ps aux                     # Sirf is namespace ke processes
ip addr                    # Sirf loopback dikhega (network isolated)

# Exit karne pe sab cleanup ho jata hai
exit
```

Yeh hi to Docker karta hai — bas sath mein image, overlayfs, aur orchestration add karta hai.

### Inspect Namespaces — lsns aur /proc

```bash
# Saare namespaces list karein
lsns

# Specific type
lsns -t net
lsns -t pid

# Apne shell ke namespaces dekho
ls -l /proc/$$/ns/
# Output:
# lrwxrwxrwx 1 user user 0 May 26 10:23 cgroup -> 'cgroup:[4026531835]'
# lrwxrwxrwx 1 user user 0 May 26 10:23 ipc    -> 'ipc:[4026531839]'
# lrwxrwxrwx 1 user user 0 May 26 10:23 mnt    -> 'mnt:[4026531840]'
# lrwxrwxrwx 1 user user 0 May 26 10:23 net    -> 'net:[4026531992]'
# lrwxrwxrwx 1 user user 0 May 26 10:23 pid    -> 'pid:[4026531836]'
# lrwxrwxrwx 1 user user 0 May 26 10:23 user   -> 'user:[4026531837]'
# lrwxrwxrwx 1 user user 0 May 26 10:23 uts    -> 'uts:[4026531838]'

# Container ke namespace mein enter karein (Docker PID milne ke baad)
sudo nsenter --target 14523 --pid --net --mount
```

### cgroups v2 (Ubuntu 24.04 Default)

cgroups (control groups) processes ke **resource usage** ko limit/account karte hain. Ubuntu 24.04 unified cgroup v2 use karta hai — single hierarchy at `/sys/fs/cgroup`.

```bash
# cgroup v2 verify karein
mount | grep cgroup
# cgroup2 on /sys/fs/cgroup type cgroup2 (rw,nosuid,nodev,noexec,relatime,nsdelegate)

# Available controllers
cat /sys/fs/cgroup/cgroup.controllers
# cpu io memory pids hugetlb cpuset rdma misc

# Ek naya cgroup banayein aur limits set karein
sudo mkdir /sys/fs/cgroup/myapp
echo "+cpu +memory +io +pids" | sudo tee /sys/fs/cgroup/cgroup.subtree_control

# CPU: 50% of one core (50000 us out of 100000 us period)
echo "50000 100000" | sudo tee /sys/fs/cgroup/myapp/cpu.max

# Memory: 512 MB hard limit
echo "536870912" | sudo tee /sys/fs/cgroup/myapp/memory.max

# PIDs: max 100 processes
echo "100" | sudo tee /sys/fs/cgroup/myapp/pids.max

# IO: weight (10-1000, default 100), per-device limits also possible
echo "default 50" | sudo tee /sys/fs/cgroup/myapp/io.weight

# Process ko cgroup mein daalein
echo $$ | sudo tee /sys/fs/cgroup/myapp/cgroup.procs

# Current usage dekhein
cat /sys/fs/cgroup/myapp/memory.current
cat /sys/fs/cgroup/myapp/cpu.stat
```

> **Tip:** Docker ka `--memory 512m --cpus="0.5"` internally yeh hi cgroup files likhta hai. Kubernetes pod ke `resources.limits` bhi yahin pohchte hain via kubelet → containerd → runc.

### How Docker Stitches It All Together

| Layer | Technology | Role |
|---|---|---|
| Isolation | Namespaces (pid, net, mnt, uts, ipc, user) | Process apne universe mein |
| Resource limits | cgroups v2 | CPU, memory, IO, PIDs cap |
| Filesystem | overlayfs (lowerdir + upperdir = merged) | Image layers + writable container layer |
| Privileges | Capabilities (drop most by default) | Container root != host root |
| Security | seccomp, AppArmor/SELinux | Syscall filtering, MAC |
| Networking | veth pair + bridge (docker0) + iptables | Container-to-host-to-internet |

```bash
# Overlayfs ko khud try karein
mkdir -p /tmp/ovl/{lower,upper,work,merged}
echo "from image" > /tmp/ovl/lower/file.txt

sudo mount -t overlay overlay \
  -o lowerdir=/tmp/ovl/lower,upperdir=/tmp/ovl/upper,workdir=/tmp/ovl/work \
  /tmp/ovl/merged

cat /tmp/ovl/merged/file.txt              # "from image"
echo "container write" > /tmp/ovl/merged/file.txt
cat /tmp/ovl/lower/file.txt               # Still "from image" — read-only
cat /tmp/ovl/upper/file.txt               # "container write" — copy-on-write
```

### Linux Capabilities — Setuid Ka Modern Replacement

Old Unix mein binary ya to root (UID 0, all-powerful) tha ya normal user. Linux capabilities root ki powers ko 40+ chhote chunks mein todte hain. `ping` ko raw socket chahiye — pehle setuid-root tha, ab use sirf `CAP_NET_RAW` diya jata hai.

```bash
# Apne shell ki capabilities dekho
capsh --print

# File capabilities dekho
getcap /usr/bin/ping
# /usr/bin/ping cap_net_raw=ep

# Nginx ko port 80 (privileged port) bind karne ki capability dein, root chalaye bina
sudo setcap 'cap_net_bind_service=+ep' /usr/local/bin/nginx
getcap /usr/local/bin/nginx
# /usr/local/bin/nginx cap_net_bind_service=ep

# Common capabilities
# CAP_NET_BIND_SERVICE  - port < 1024 bind karna
# CAP_NET_ADMIN         - network config (ip, iptables)
# CAP_SYS_ADMIN         - "almost root" — bahut powerful, careful
# CAP_CHOWN             - file ownership change
# CAP_DAC_OVERRIDE      - permission bypass
# CAP_KILL              - kisi bhi process ko signal bhejna
# CAP_SETUID/SETGID     - UID/GID change

# Capability remove karein
sudo setcap -r /usr/local/bin/nginx

# Docker default mein bahut saari caps drop karta hai
docker run --rm alpine sh -c 'apk add -q libcap; capsh --print' | grep Current
# Current: cap_chown,cap_dac_override,cap_fowner,cap_fsetid,cap_kill,cap_setgid,...
# (full root capabilities NAHI hain)
```

### Performance Tuning — sysctl, ulimit, I/O Schedulers

#### Kernel Parameters via sysctl

```bash
# Current value dekhein
sysctl vm.swappiness
sysctl net.core.somaxconn

# Runtime change (reboot pe gayab)
sudo sysctl -w vm.swappiness=10
sudo sysctl -w net.core.somaxconn=4096

# Persist karein — /etc/sysctl.d/ mein file banayein
sudo tee /etc/sysctl.d/99-devops-tuning.conf <<'EOF'
# Memory: prefer dropping cache over swapping (DB/app servers)
vm.swappiness = 10
vm.dirty_ratio = 15
vm.dirty_background_ratio = 5
vm.overcommit_memory = 1

# Network: high-connection web server
net.core.somaxconn = 65535
net.core.netdev_max_backlog = 5000
net.ipv4.tcp_max_syn_backlog = 8192
net.ipv4.tcp_tw_reuse = 1
net.ipv4.tcp_fin_timeout = 15
net.ipv4.ip_local_port_range = 1024 65535

# File descriptors
fs.file-max = 2097152
fs.inotify.max_user_watches = 524288

# Connection tracking (for nat/firewalls)
net.netfilter.nf_conntrack_max = 1048576
EOF

# Apply karein
sudo sysctl --system

# Saare current values
sysctl -a | less
```

#### ulimit — Per-Process Resource Limits

```bash
# Current limits
ulimit -a

# Open files limit (sabse common bottleneck)
ulimit -n               # soft
ulimit -Hn              # hard

# Temporarily badhayein (current shell only)
ulimit -n 65535

# Permanent — /etc/security/limits.conf ya /etc/security/limits.d/
sudo tee /etc/security/limits.d/99-app.conf <<'EOF'
# domain  type  item   value
*         soft  nofile 65535
*         hard  nofile 1048576
*         soft  nproc  32768
*         hard  nproc  65535
www-data  soft  nofile 100000
www-data  hard  nofile 200000
EOF

# systemd services ke liye — service unit file mein
# [Service]
# LimitNOFILE=1048576
# LimitNPROC=65535
```

#### I/O Schedulers

```bash
# Current scheduler dekho
cat /sys/block/sda/queue/scheduler
# [mq-deadline] kyber bfq none

# NVMe ke liye 'none' best — NVMe ka apna queue management hai
echo none | sudo tee /sys/block/nvme0n1/queue/scheduler

# SATA SSD / HDD ke liye 'mq-deadline' ya 'bfq'
echo mq-deadline | sudo tee /sys/block/sda/queue/scheduler

# Persist via udev rule
sudo tee /etc/udev/rules.d/60-ioschedulers.rules <<'EOF'
# NVMe
ACTION=="add|change", KERNEL=="nvme[0-9]*", ATTR{queue/scheduler}="none"
# SSD
ACTION=="add|change", KERNEL=="sd[a-z]", ATTR{queue/rotational}=="0", ATTR{queue/scheduler}="mq-deadline"
# HDD
ACTION=="add|change", KERNEL=="sd[a-z]", ATTR{queue/rotational}=="1", ATTR{queue/scheduler}="bfq"
EOF
```

> **Caution:** Sabse common production outage cause — `ulimit -n` too low. Node.js / Java apps under load 1024 file descriptors mein crash ho jate hain with "EMFILE: too many open files". Hamesha 65535+ set karein.

### Boot Process Deep Dive

Power button daba → kernel running → systemd → login prompt. Beech mein bahut layers hain:

| Stage | UEFI Boot | Legacy BIOS |
|---|---|---|
| 1. Firmware | UEFI firmware (modern) | BIOS (legacy) |
| 2. Boot loader location | EFI System Partition (ESP), FAT32, mounted at `/boot/efi` | MBR (first 512 bytes of disk) |
| 3. Boot loader | GRUB EFI binary (`/boot/efi/EFI/ubuntu/grubx64.efi`) | GRUB stage 1 → stage 2 |
| 4. Config | `/boot/grub/grub.cfg` (generated) | `/boot/grub/grub.cfg` |
| 5. Kernel + initramfs | Loaded from `/boot/` | Loaded from `/boot/` |
| 6. Secure Boot | Supported (shim + signed kernel) | Not supported |
| 7. Disk size | > 2 TB OK (GPT) | 2 TB limit (MBR) |

```bash
# UEFI mein boot ho rahe ho check karein
ls /sys/firmware/efi && echo "UEFI" || echo "BIOS"

# ESP partition dekho
df -h /boot/efi
mount | grep /boot/efi
# /dev/nvme0n1p1 on /boot/efi type vfat ...

# EFI boot entries
sudo efibootmgr -v
# BootCurrent: 0001
# Boot0001* ubuntu  HD(1,GPT,...)/File(\EFI\ubuntu\shimx64.efi)
```

#### GRUB2 Configuration

```bash
# Edit defaults
sudo nano /etc/default/grub

# Common settings:
GRUB_DEFAULT=0
GRUB_TIMEOUT=5
GRUB_CMDLINE_LINUX_DEFAULT="quiet splash"
GRUB_CMDLINE_LINUX=""

# Add a kernel parameter (example: disable IPv6, enable cgroup v2 — already default in 24.04)
GRUB_CMDLINE_LINUX_DEFAULT="quiet splash ipv6.disable=1"

# Regenerate grub.cfg
sudo update-grub
# OR:  sudo grub-mkconfig -o /boot/grub/grub.cfg

# initramfs rebuild (driver change ya crypto ke baad)
sudo update-initramfs -u -k all

# Kernel command line currently running
cat /proc/cmdline
```

#### initramfs (initial RAM filesystem)

Kernel boot hone ke turant baad asli root filesystem mount karne ke liye drivers chahiye (NVMe, RAID, LVM, encrypted disk). Yeh sab ek temporary RAM-based filesystem mein hota hai — `initramfs`. `/boot/initrd.img-*` ek compressed cpio archive hai.

```bash
# Dekho kya hai andar
lsinitramfs /boot/initrd.img-$(uname -r) | head -50

# Rebuild
sudo update-initramfs -u -k all
```

#### systemd Boot Targets & Analysis

```bash
# Current target
systemctl get-default          # graphical.target ya multi-user.target

# Set karein
sudo systemctl set-default multi-user.target

# Server ke liye total boot time
systemd-analyze
# Startup finished in 3.124s (kernel) + 8.456s (userspace) = 11.580s

# Kaunsa service slow hai?
systemd-analyze blame
# 4.123s snapd.service
# 2.456s cloud-init.service
# 1.234s apt-daily.service

# Critical path (boot ke serial dependency chain)
systemd-analyze critical-chain
systemd-analyze critical-chain nginx.service

# Visual SVG plot
systemd-analyze plot > /tmp/boot-plot.svg
# Browser mein open karein — beautiful timeline dikhega
```

### LVM — Logical Volume Manager (Production Essential)

LVM disks ko abstract karta hai. Aap multiple physical disks (PVs) ko ek pool (VG) mein daalte ho, aur usme se flexible chunks (LVs) carve karte ho — runtime resize, snapshots, online migration sab milta hai.

The LVM stack, top to bottom: **Filesystems** (`/` ext4, `/var/lib/docker`, `/data` xfs) sit on **LVs** (lv-root 20G, lv-docker 50G, lv-data 200G), which are carved from the **VG** (`vg_main` — Volume Group, 500 GB total, 230 GB free), which pools the **PVs** (`/dev/nvme0n1p3` 200G, `/dev/nvme1n1` 200G, `/dev/nvme2n1` 100G — physical disks / partitions / raw block devices).

#### Full End-to-End LVM Example

```bash
# 1. Physical Volumes banayein (raw disks ko LVM-managed banao)
sudo pvcreate /dev/nvme1n1 /dev/nvme2n1
sudo pvs

# 2. Volume Group banayein (PVs ka pool)
sudo vgcreate vg_main /dev/nvme1n1 /dev/nvme2n1
sudo vgs
sudo vgdisplay vg_main

# 3. Logical Volume banayein
sudo lvcreate -L 50G -n lv-docker vg_main
sudo lvcreate -L 200G -n lv-data vg_main
# Ya saari free space:
# sudo lvcreate -l 100%FREE -n lv-data vg_main
sudo lvs

# 4. Filesystem banayein
sudo mkfs.ext4 /dev/vg_main/lv-docker
sudo mkfs.xfs  /dev/vg_main/lv-data

# 5. Mount karein
sudo mkdir -p /var/lib/docker /data
sudo mount /dev/vg_main/lv-docker /var/lib/docker
sudo mount /dev/vg_main/lv-data /data

# 6. /etc/fstab mein add karein (UUID best practice)
echo "/dev/vg_main/lv-docker /var/lib/docker ext4 defaults,noatime 0 2" | sudo tee -a /etc/fstab
echo "/dev/vg_main/lv-data   /data           xfs  defaults,noatime 0 2" | sudo tee -a /etc/fstab

# ===== AB LIVE EXTEND — yeh LVM ki asli power hai =====

# Disk full ho rahi hai. lv-data ko 100G aur badhao
sudo lvextend -L +100G /dev/vg_main/lv-data
sudo xfs_growfs /data                    # XFS online grow

# ext4 ke liye:
# sudo lvextend -L +50G /dev/vg_main/lv-docker
# sudo resize2fs /dev/vg_main/lv-docker

# Combined (lvextend + filesystem resize ek hi command mein):
sudo lvextend -r -L +50G /dev/vg_main/lv-docker

# VG mein space khatam? Nayi disk add karo
sudo pvcreate /dev/nvme3n1
sudo vgextend vg_main /dev/nvme3n1
sudo lvextend -r -L +500G /dev/vg_main/lv-data

# ===== SNAPSHOTS — backup ke liye =====
sudo lvcreate -L 10G -s -n lv-data-snap /dev/vg_main/lv-data
sudo mount -o ro /dev/vg_main/lv-data-snap /mnt/snapshot
tar czf /backup/data-$(date +%F).tar.gz -C /mnt/snapshot .
sudo umount /mnt/snapshot
sudo lvremove -f /dev/vg_main/lv-data-snap
```

> **Tip:** Cloud relevance — AWS pe LVM kyun? Multiple EBS volumes ko stripe ya pool karne ke liye. Ek instance pe 4×500GB gp3 volumes lo, LVM se ek 2TB volume banao — combined IOPS bhi badh jata hai aur grow karna easy.

### RAID — Redundancy aur Performance

| RAID Level | Min Disks | Redundancy | Capacity | Read/Write | Use Case |
|---|---|---|---|---|---|
| RAID 0 (stripe) | 2 | None — 1 fail = data gone | 100% | Fastest R + W | Scratch / cache (cloud: avoid) |
| RAID 1 (mirror) | 2 | 1 disk fail OK | 50% | Fast R, normal W | OS disk, boot |
| RAID 5 (parity) | 3 | 1 disk fail OK | (N-1)/N | Good R, slow W (parity calc) | Bulk storage (legacy) |
| RAID 6 (double parity) | 4 | 2 disks fail OK | (N-2)/N | Good R, slower W | Large arrays, long rebuilds |
| RAID 10 (1+0) | 4 | 1 per mirror pair OK | 50% | Fastest R + W with redundancy | Databases, production |

```bash
# Software RAID with mdadm
sudo apt install mdadm

# RAID 10 from 4 disks
sudo mdadm --create /dev/md0 --level=10 --raid-devices=4 \
  /dev/nvme1n1 /dev/nvme2n1 /dev/nvme3n1 /dev/nvme4n1

# Status
cat /proc/mdstat
sudo mdadm --detail /dev/md0

# Save config (else boot pe disappear)
sudo mdadm --detail --scan | sudo tee -a /etc/mdadm/mdadm.conf
sudo update-initramfs -u

# Use as LVM PV ya direct filesystem
sudo mkfs.xfs /dev/md0
```

> **Caution:** Cloud reality — AWS EBS / GCP PD / Azure Managed Disks pehle se replicated hain (3 copies cross-AZ). Aap cloud mein RAID rarely karte ho — provider already kar raha hai. Bas multiple EBS attach + LVM stripe for IOPS — that's the cloud pattern. mdadm sirf bare-metal / on-prem mein critical hai.

### Filesystem Tuning

```bash
# ext4: reserved blocks (root-only) ko 5% se 1% karein — big data disks pe space bachao
sudo tune2fs -m 1 /dev/vg_main/lv-data

# Forced fsck interval / mount count off (production servers — fsck on boot avoid)
sudo tune2fs -c 0 -i 0 /dev/vg_main/lv-data

# Saari options dekho
sudo tune2fs -l /dev/vg_main/lv-data

# Mount options jo production mein matter karte hain
# noatime    — har read pe atime update mat karo (huge perf gain, esp. for DBs, web)
# nodiratime — directory atime skip
# discard    — SSD TRIM on delete (alternative: fstrim weekly via timer)
# nofail     — boot mein disk missing pe fail mat karo (cloud detached EBS scenario)
# nosuid,nodev,noexec — security for /tmp, /var

# /etc/fstab example for production
# UUID=...  /data       ext4  defaults,noatime,nodiratime,nofail  0  2
# UUID=...  /tmp        tmpfs defaults,nosuid,nodev,noexec,size=2G 0  0

# tmpfs (RAM-backed) in production — fast scratch / build directories
sudo mount -t tmpfs -o size=4G,mode=1777 tmpfs /var/cache/build
```

> **Note:** Hinglish summary — Yeh section padh ke samjho: Docker container = unshare + cgroups + overlayfs + capability drop. Boot = UEFI → GRUB → kernel → initramfs → systemd. LVM = flexible disks, runtime grow. RAID = redundancy. Cloud mein RAID ki zaroorat kam, but LVM aur tuning sab jagah kaam aate hain. Yeh saari cheezein interview mein "how does X work internally" ke jawab mein aati hain.

## Linux in Cloud Context

Ab tak humne Linux ko ek isolated machine pe samjha. Cloud mein woh hi Linux chal raha hai, lekin alag patterns hain — ephemeral instances, metadata service, cloud-init bootstrapping, EBS attach/grow, SSH replacement with SSM. Ek React-dev-turned-DevOps engineer ka roz ka 70% time AWS Linux instances + Kubernetes nodes pe spend hota hai. Yeh section us 70% ko cover karta hai.

### AWS EC2 Linux Distributions

| Distro | Default User | Package Mgr | Notes |
|---|---|---|---|
| Amazon Linux 2023 (AL2023) | `ec2-user` | `dnf` | AWS optimized, kernel 6.x, glibc 2.34, free, fast-boot. Default choice for AWS. |
| Amazon Linux 2 (legacy) | `ec2-user` | `yum` | EOL 2026. Migrate to AL2023. |
| Ubuntu Server 24.04 LTS | `ubuntu` | `apt` | Most popular, huge community, debs, snap. Best for general use. |
| Rocky Linux 9 / RHEL 9 | `rocky` / `ec2-user` | `dnf` | Enterprise, RHEL-compatible, FIPS, certifications. |
| Debian 12 | `admin` | `apt` | Minimal, stable, like Ubuntu's parent. |
| Custom AMI | Whatever you bake | Whatever | Pre-configured golden image via Packer. |

> **Tip:** Practical pick — Production Kubernetes nodes → Amazon Linux 2023 (Bottlerocket bhi consider karo). General app servers → Ubuntu 24.04. Enterprise compliance → RHEL/Rocky.

### Instance Metadata Service (IMDS) — Cloud Ka /proc

Har EC2 instance ko ek special endpoint milta hai: `http://169.254.169.254`. Yahan se instance apne baare mein sab kuch jaan sakta hai — region, AZ, instance type, IAM role credentials, user-data, public IP. SDKs (boto3, aws-cli) bhi IAM creds yahin se uthate hain.

```bash
# IMDSv1 (legacy, insecure — SSRF attacks possible)
curl http://169.254.169.254/latest/meta-data/

# IMDSv2 (token-based, mandatory in new accounts) — SECURE PATTERN
TOKEN=$(curl -s -X PUT "http://169.254.169.254/latest/api/token" \
  -H "X-aws-ec2-metadata-token-ttl-seconds: 21600")

# Use token in all requests
curl -s -H "X-aws-ec2-metadata-token: $TOKEN" \
  http://169.254.169.254/latest/meta-data/

# Useful endpoints
curl -s -H "X-aws-ec2-metadata-token: $TOKEN" http://169.254.169.254/latest/meta-data/instance-id
curl -s -H "X-aws-ec2-metadata-token: $TOKEN" http://169.254.169.254/latest/meta-data/instance-type
curl -s -H "X-aws-ec2-metadata-token: $TOKEN" http://169.254.169.254/latest/meta-data/placement/availability-zone
curl -s -H "X-aws-ec2-metadata-token: $TOKEN" http://169.254.169.254/latest/meta-data/placement/region
curl -s -H "X-aws-ec2-metadata-token: $TOKEN" http://169.254.169.254/latest/meta-data/local-ipv4
curl -s -H "X-aws-ec2-metadata-token: $TOKEN" http://169.254.169.254/latest/meta-data/public-ipv4
curl -s -H "X-aws-ec2-metadata-token: $TOKEN" http://169.254.169.254/latest/meta-data/security-groups
curl -s -H "X-aws-ec2-metadata-token: $TOKEN" http://169.254.169.254/latest/meta-data/iam/security-credentials/

# Tags (if enabled on instance)
curl -s -H "X-aws-ec2-metadata-token: $TOKEN" http://169.254.169.254/latest/meta-data/tags/instance/

# User-data (the bootstrap script)
curl -s -H "X-aws-ec2-metadata-token: $TOKEN" http://169.254.169.254/latest/user-data
```

> **Caution:** IMDSv1 SSRF attacks ka shikar hota hai — Capital One breach yahin se hua. Hamesha enforce IMDSv2 (HttpTokens=required) instance metadata options mein.

### EBS Volumes — Attach, Format, Mount, Grow

```bash
# Naya volume attach karne ke baad device list dekho
lsblk
# NAME         SIZE TYPE MOUNTPOINTS
# nvme0n1       30G disk
# `-nvme0n1p1   30G part /
# nvme1n1      100G disk                  <-- new EBS volume

# Filesystem nahi hai abhi
sudo file -s /dev/nvme1n1
# /dev/nvme1n1: data        (matlab empty)

# Filesystem banayein
sudo mkfs.ext4 /dev/nvme1n1
# Modern alternative: sudo mkfs.xfs /dev/nvme1n1

# Mountpoint banayein aur mount karein
sudo mkdir -p /data
sudo mount /dev/nvme1n1 /data

# /etc/fstab — UUID best practice; nofail critical for cloud
# (instance reboot ho aur volume detached ho to boot fail nahi hoga)
UUID=$(sudo blkid -s UUID -o value /dev/nvme1n1)
echo "UUID=$UUID  /data  ext4  defaults,nofail,noatime  0  2" | sudo tee -a /etc/fstab

# Verify
sudo mount -a
df -h /data
```

#### Grow EBS Volume In-Place (Zero Downtime)

```bash
# Step 1: AWS console ya CLI se volume size badhao
aws ec2 modify-volume --volume-id vol-0abc123 --size 200

# Wait for "optimizing" state
aws ec2 describe-volumes-modifications --volume-id vol-0abc123

# Step 2: Instance ke andar kernel ko naya size dikhega
lsblk
# nvme1n1      200G disk
# `-nvme1n1p1  100G part /data         <-- partition abhi 100G hai

# Step 3: Partition grow karo (agar partition use kar rahe ho)
sudo growpart /dev/nvme1n1 1

# Direct raw device pe filesystem (no partition) — yeh step skip

# Step 4: Filesystem grow karo
# ext4:
sudo resize2fs /dev/nvme1n1p1
# OR direct:
sudo resize2fs /dev/nvme1n1

# xfs (must be mounted):
sudo xfs_growfs /data

# Verify
df -h /data
# /dev/nvme1n1   200G ...
```

#### Instance Store vs EBS

| | EBS | Instance Store |
|---|---|---|
| Persistence | Persistent — survives stop/start | Ephemeral — gone on stop/terminate |
| Replication | 3× within AZ | None |
| Speed | Network-attached (NVMe over fabric) | Physically attached NVMe SSD — fastest |
| Snapshots | Yes | No |
| Detach & reattach | Yes | No |
| Use case | OS root, databases, app data | Cache, scratch, temp big-data shuffle |

### SSH to Cloud Instances

```bash
# Classic: keypair-based SSH
chmod 400 ~/.ssh/my-key.pem
ssh -i ~/.ssh/my-key.pem ec2-user@54.221.10.45    # Amazon Linux
ssh -i ~/.ssh/my-key.pem ubuntu@54.221.10.45      # Ubuntu

# ~/.ssh/config mein convenient alias
cat >> ~/.ssh/config <<'EOF'
Host prod-web
  HostName 54.221.10.45
  User ubuntu
  IdentityFile ~/.ssh/my-key.pem
  ServerAliveInterval 60
EOF
ssh prod-web

# Bastion host pattern (private instance via public jump box)
ssh -i key.pem -J bastion.example.com ubuntu@10.0.5.20
# Ya config mein ProxyJump
Host prod-db
  HostName 10.0.5.20
  User ubuntu
  IdentityFile ~/.ssh/my-key.pem
  ProxyJump bastion.example.com

# ===== MODERN: SSM Session Manager (NO PORT 22, NO KEYS) =====
# Pre-requisites: SSM agent on instance, IAM role with AmazonSSMManagedInstanceCore

aws ssm start-session --target i-0abc123def456

# Port forwarding via SSM (RDS access through private instance)
aws ssm start-session \
  --target i-0abc123def456 \
  --document-name AWS-StartPortForwardingSessionToRemoteHost \
  --parameters '{"host":["mydb.cluster-xyz.rds.amazonaws.com"],"portNumber":["5432"],"localPortNumber":["15432"]}'

# SSH over SSM (best of both)
# ~/.ssh/config:
Host i-* mi-*
  ProxyCommand sh -c "aws ssm start-session --target %h --document-name AWS-StartSSHSession --parameters portNumber=%p"

ssh ec2-user@i-0abc123def456
```

> **Tip:** Production gold-standard — Security groups mein port 22 EVER open mat karo. SSM Session Manager use karo — no public IP, no SSH key management, full audit log in CloudTrail, IAM-based access control. Yeh hi modern DevOps practice hai.

### cloud-init — First Boot Bootstrap

cloud-init Linux ka standard first-boot configuration tool hai. AWS, GCP, Azure, OpenStack — sab pe chalta hai. User-data field jo aap launch time pe dete ho, woh cloud-init parse karta hai aur execute karta hai.

```bash
# Status check
cloud-init status
# status: done

cloud-init status --long
cloud-init analyze show              # boot time breakdown

# Config files
ls /etc/cloud/
# cloud.cfg               main config
# cloud.cfg.d/            drop-ins (vendor + user)
# templates/              hostname etc.

# Logs (debugging ke liye SABSE IMPORTANT)
sudo tail -f /var/log/cloud-init.log              # detailed
sudo tail -f /var/log/cloud-init-output.log       # stdout/stderr of user-data

# Re-run cloud-init (testing ke liye)
sudo cloud-init clean --logs
sudo cloud-init init
sudo cloud-init modules --mode=config
sudo cloud-init modules --mode=final
```

#### Format 1: Bash Script User-Data

```bash
#!/bin/bash
# user-data.sh — simple bash, runs as root on first boot
set -euxo pipefail
exec > >(tee /var/log/user-data.log | logger -t user-data -s 2>/dev/console) 2>&1

echo "=== Starting bootstrap at $(date) ==="

# Idempotency guard
if [ -f /var/lib/bootstrap-done ]; then
  echo "Already bootstrapped, exiting"
  exit 0
fi

# Update + install
apt-get update -y
apt-get upgrade -y
apt-get install -y nginx awscli docker.io curl jq

# Enable services
systemctl enable --now nginx docker
usermod -aG docker ubuntu

# Pull config from S3 (IAM role attached)
aws s3 cp s3://my-config-bucket/nginx.conf /etc/nginx/nginx.conf
systemctl reload nginx

# Mark done
touch /var/lib/bootstrap-done
echo "=== Bootstrap complete at $(date) ==="
```

#### Format 2: #cloud-config YAML (Recommended)

```bash
#cloud-config
# Declarative — much cleaner than bash

hostname: web-prod-01
fqdn: web-prod-01.internal.example.com
manage_etc_hosts: true

# Users
users:
  - name: deploy
    groups: [docker, sudo]
    shell: /bin/bash
    sudo: 'ALL=(ALL) NOPASSWD:ALL'
    ssh_authorized_keys:
      - ssh-ed25519 AAAAC3NzaC1lZDI1... deploy@laptop

# Package install
package_update: true
package_upgrade: true
packages:
  - nginx
  - docker.io
  - awscli
  - jq
  - htop
  - curl

# Drop config files
write_files:
  - path: /etc/nginx/sites-available/default
    permissions: '0644'
    content: |
      server {
        listen 80 default_server;
        root /var/www/html;
        index index.html;
        location /health { return 200 'ok'; add_header Content-Type text/plain; }
      }
  - path: /etc/sysctl.d/99-tuning.conf
    content: |
      vm.swappiness = 10
      net.core.somaxconn = 65535
      fs.file-max = 2097152

# Run commands at end (after packages, files)
runcmd:
  - sysctl --system
  - systemctl enable --now docker nginx
  - usermod -aG docker ubuntu
  - docker pull nginx:alpine
  - [ sh, -c, 'echo "Bootstrap done at $(date)" >> /var/log/bootstrap.log' ]

# Reboot if kernel updated (optional)
power_state:
  mode: reboot
  condition: test -f /var/run/reboot-required
```

### AMI Creation — Golden Images

Production mein har deploy pe full user-data se setup karne ki bajaye pre-baked AMI use karte hain — boot 30 seconds instead of 5 minutes. Lekin AMI banane se pehle "sysprep" (clean) zaroori hai.

```bash
# Pre-AMI cleanup script (run before creating image)
#!/bin/bash
set -e

# Stop services that hold state
sudo systemctl stop docker nginx

# Remove SSH host keys (instance pe regenerate honge first boot pe)
sudo rm -f /etc/ssh/ssh_host_*

# Clear machine-id (cloud-init will regenerate)
sudo truncate -s 0 /etc/machine-id
sudo rm -f /var/lib/dbus/machine-id
sudo ln -s /etc/machine-id /var/lib/dbus/machine-id

# Clear cloud-init state
sudo cloud-init clean --logs --seed

# Clear logs
sudo find /var/log -type f -exec truncate -s 0 {} \;
sudo rm -rf /var/log/journal/*

# Clear bash history
cat /dev/null > ~/.bash_history
history -c
sudo rm -f /root/.bash_history

# Clear authorized_keys for default user (cloud-init re-injects)
sudo rm -f /home/ubuntu/.ssh/authorized_keys

# Trim filesystem (smaller snapshot)
sudo fstrim -av

# Now from your laptop/CI:
aws ec2 create-image \
  --instance-id i-0abc123 \
  --name "web-base-$(date +%Y%m%d-%H%M)" \
  --description "Nginx + Docker baseline" \
  --no-reboot=false

# Packer (recommended for repeatable builds) — basic config
# packer build webserver.pkr.hcl
# Packer launches temp instance, runs provisioners, creates AMI, terminates.
```

### Provider Differences

| | AWS EC2 | GCP Compute Engine | Azure VM |
|---|---|---|---|
| Metadata endpoint | `169.254.169.254` | `metadata.google.internal` / `169.254.169.254` | `169.254.169.254` (with header) |
| Default users | ec2-user, ubuntu, rocky, admin | username from SSH key (gcloud creates one) | azureuser (you pick at create) |
| Agent | SSM Agent + ec2-instance-connect | Google guest agent / OS Login | WALinuxAgent (waagent) |
| Agent config | `/etc/amazon/ssm/` | `/etc/default/instance_configs.cfg` | `/etc/waagent.conf` |
| Block storage | EBS | Persistent Disk (PD) | Managed Disks |
| Bootstrap | user-data + cloud-init | startup-script (metadata) + cloud-init | customData / cloud-init |
| Keyless SSH | SSM Session Manager | OS Login + IAP tunnel | Bastion / Just-In-Time |

```bash
# GCP metadata example
curl -s "http://metadata.google.internal/computeMetadata/v1/instance/name" \
  -H "Metadata-Flavor: Google"

# Azure metadata example (note required header)
curl -s -H "Metadata:true" \
  "http://169.254.169.254/metadata/instance?api-version=2021-02-01" | jq
```

### Real-World DevOps Patterns

#### 1. Immutable Infrastructure

Server ko mat patch karo — naye AMI se naya instance launch karo, traffic shift karo, purana terminate karo. Configuration drift = zero. Rollback = pichla AMI re-launch. This is the modern way.

#### 2. cloud-init + Configuration Management Combo

```bash
#cloud-config
# cloud-init sirf "Ansible/Chef bootstrap" karta hai, baaki sab woh karta hai
package_update: true
packages: [ansible, git]
runcmd:
  - git clone https://github.com/myorg/ansible-playbooks.git /opt/ansible
  - ansible-pull -U https://github.com/myorg/ansible-playbooks.git -i localhost, site.yml
```

#### 3. Centralized Logging

Instance pe local logs (`/var/log/*`) ephemeral hain — instance terminate hua to logs gone. Production mein logs hamesha ship karo:

```bash
# CloudWatch agent
sudo amazon-cloudwatch-agent-ctl -a fetch-config -m ec2 -c file:cw-config.json -s

# Datadog agent
DD_API_KEY=xxx DD_SITE="datadoghq.com" \
  bash -c "$(curl -L https://install.datadoghq.com/scripts/install_script_agent7.sh)"

# Promtail (Grafana Loki)
# /etc/promtail/config.yml → ships journald + /var/log/* to Loki

# rsyslog → centralized syslog server (old-school but reliable)
# /etc/rsyslog.d/50-remote.conf:
# *.* @@logserver.internal:514
```

#### 4. EBS Snapshots — Automated Backup

```bash
# AWS Backup ya Data Lifecycle Manager (DLM) — preferred
# Snapshot daily, retain 7 days, cross-region copy weekly

# Manual snapshot (one-off)
aws ec2 create-snapshot \
  --volume-id vol-0abc123 \
  --description "pre-migration backup $(date +%F)" \
  --tag-specifications 'ResourceType=snapshot,Tags=[{Key=Backup,Value=manual}]'

# Restore: snapshot → new volume → attach to instance
aws ec2 create-volume \
  --snapshot-id snap-0xyz \
  --availability-zone us-east-1a \
  --volume-type gp3
```

#### 5. SSH via SSM — No Port 22 Open

```bash
# Security group inbound rules: (none — yes, ZERO)
# Instances are in private subnet
# Access only via:
aws ssm start-session --target i-0abc123

# Aur agar SSH protocol chahiye (scp, rsync, git):
ssh ec2-user@i-0abc123    # ProxyCommand via SSM (config shown earlier)
scp -r ./code/ ec2-user@i-0abc123:/home/ec2-user/
```

#### 6. Putting It All Together — A Realistic Stack

```bash
# Terraform spins up:
#   - VPC with private subnets
#   - Auto Scaling Group with Launch Template
#   - Launch Template references golden AMI (built by Packer)
#   - user-data does minimal "ansible-pull" for last-mile config
#   - IAM role attached with SSM + CloudWatch + S3 read
#   - Application Load Balancer in public subnet
#   - Security groups: ALB → instances on app port only, port 22 NEVER open
#   - EBS volumes with daily DLM snapshots
#   - CloudWatch agent ships /var/log + custom metrics
#   - Logs to CloudWatch Logs → subscription filter → Datadog/Splunk

# Deploys happen by:
#   1. Packer builds new AMI on git push
#   2. Terraform updates Launch Template's AMI ID
#   3. ASG instance refresh rolls instances one-by-one
#   4. Old AMI kept for 7 days (instant rollback)

# Day-2 ops:
#   - SSH via `aws ssm start-session`
#   - Logs in CloudWatch / Datadog
#   - Metrics in CloudWatch / Grafana
#   - Disk grow: modify-volume + growpart + resize2fs (zero downtime)
#   - Bigger instance: ASG rolling update with new instance type
```

> **Note:** Hinglish wrap-up — Cloud Linux mein 5 cheezein roz kaam aati hain: (1) IMDSv2 se instance ka data fetch karna, (2) EBS volume attach + format + mount + fstab nofail, (3) cloud-init user-data se bootstrap, (4) SSM Session Manager se SSH ke bina access, (5) golden AMI + immutable infra pattern. Yeh sab itne baar repeat karoge ki muscle memory ban jayega.

> **Tip:** Interview question jo aapko 30+ LPA dilayega — "Describe what happens from `aws ec2 run-instances` till an application is serving traffic." Answer: AMI snapshot se EBS root volume create, ENI attach, instance boot (UEFI → GRUB → kernel → initramfs → systemd) → cloud-init pulls user-data from IMDS → packages install, config files written, services start → application binds to port → health check passes → ALB target group marks healthy → traffic routes. Iss puri chain ko 60 seconds mein samjha sako, to job aapki hai.

## Further Learning

You've built the foundation. Now you need to keep the muscle warm. This section is a curated map of where to go next — channels, platforms, books, and certifications that actually move the needle for the Indian DevOps market. Spend 30 minutes a day here for the next three months and you will be unrecognizable.

> **Tip:** Study advice #1 — Pick ONE channel and finish it. Don't channel-hop. Bookmark 50 videos and watch zero. Pick Abhishek Veeramalla's Linux + DevOps playlist OR NetworkChuck's Linux for hackers, and finish it end-to-end before you touch anything else.

### YouTube channels worth your subscription

**Hindi creators (great for concepts in your native rhythm):**

- **Abhishek Veeramalla** — gold standard for Indian DevOps aspirants. His "DevOps Zero to Hero" playlist is the single most recommended free resource in Indian DevOps WhatsApp groups. Real interview questions, real scenarios.
- **Telusko (Navin Reddy)** — clean Linux fundamentals, scripting basics, Docker primers. Great when you want a relaxed explanation.
- **Cyber Platter** — strong on shell scripting, system administration, and Red Hat workflows. Useful for RHCSA prep in Hindi.

**English creators (depth + production polish):**

- **NetworkChuck** — high-energy, hands-on. His "Linux for Hackers" series is the most fun way to fall in love with the terminal.
- **Learn Linux TV (Jay LaCroix)** — calm, thorough, no-fluff. The Ubuntu Server and Bash scripting series are excellent.
- **TechWorld with Nana** — best DevOps overview channel on YouTube. Her Docker, Kubernetes, and CI/CD crash courses are essentially free certification prep.
- **DistroTube** — pure Linux culture, window managers, dotfiles, tooling. Watch when you want to fall deeper down the rabbit hole.

### Free practice platforms (this is where skill actually grows)

- **OverTheWire — Bandit** (`overthewire.org/wargames/bandit`) — 34 levels of SSH-driven Linux puzzles. If you can clear Bandit 0–20, you are operationally literate. This is non-negotiable.
- **SadServers** (`sadservers.com`) — "broken Linux server" scenarios. You SSH in, diagnose, and fix. This is the closest thing to a real on-call shift you can practice for free.
- **Linux Journey** (`linuxjourney.com`) — beautifully structured beginner-to-intermediate text path. Perfect for revision.
- **KillerCoda** (`killercoda.com`) — browser-based Linux, Docker, Kubernetes labs. Free tier is generous.
- **HackTheBox** — privilege escalation and CTF-style Linux. Sharpens your understanding of permissions, processes, and networking.
- **TryHackMe** — gentler than HTB. Their "Linux Fundamentals" and "Linux PrivEsc" rooms are interview-grade prep.
- **LeetCode Shell** — small but mighty. Bash one-liners that show up in screening rounds (word frequency, transpose file, valid phone numbers).

> **Caution:** Study advice #2 — Tutorial hell is real. For every 1 hour of video you watch, spend 2 hours in a terminal breaking things. Recruiters do not care that you watched 200 hours of content. They care that you can fix a full disk in 90 seconds on a shared screen.

### Documentation — the most underrated tier

- **`man`** — the original. `man bash`, `man 5 crontab`, `man 7 signal`. Learn to navigate with `/` and `n`.
- **`tldr`** — community-maintained "just the examples" pages. Install with `npm i -g tldr` or `apt install tldr`. `tldr tar` beats reading the man page when you just need the syntax.
- **`info`** — GNU's hyperlinked docs. Heavier than man, but the coreutils info pages are gold.
- **DigitalOcean tutorials** (`digitalocean.com/community/tutorials`) — the cleanest English Linux/server tutorials on the internet. Tagged by Ubuntu version. Bookmark this.
- **ArchWiki** (`wiki.archlinux.org`) — even if you never touch Arch, the ArchWiki is the most accurate, distro-agnostic Linux reference that exists.
- **tldp.org** — The Linux Documentation Project. Older but the "Advanced Bash-Scripting Guide" is a classic.

### Books that earn shelf space

- **"How Linux Works" by Brian Ward (No Starch Press)** — the single best book to understand *why* Linux behaves the way it does. Bootloaders, init, devices, networking. Read it twice.
- **"The Linux Command Line" by William Shotts** — legally free PDF at `linuxcommand.org/tlcl.php`. The reference for shell mastery.
- **"Linux Bible" by Christopher Negus** — fat, slightly dry, but covers RHEL/Fedora workflows thoroughly. Perfect companion for RHCSA.
- **"Site Reliability Engineering" (Google SRE Book)** — free at `sre.google/books`. Not Linux-specific but it teaches you how to *think* like the engineers earning ₹40+ LPA.
- **Bonus: "UNIX and Linux System Administration Handbook" by Nemeth et al.** — the "purple book." If you go senior sysadmin, this is the bible.

### Certifications — what actually matters in the Indian DevOps market

Ranked by ROI for someone at your stage (37yo React dev pivoting to DevOps, targeting ₹30+ LPA):

1. **RHCSA (Red Hat Certified System Administrator) — EX200.** The most respected Linux cert in India. Hands-on exam, no MCQs. Recruiters at TCS, Infosys, Wipro, Red Hat partners, and most product startups recognize it instantly. Cost: ~₹35k. Worth every rupee if your goal is Linux-heavy DevOps roles.
2. **LFCS (Linux Foundation Certified Sysadmin).** Vendor-neutral, performance-based, cheaper (~$300, often 50% off). Less brand recognition than RHCSA in India but globally respected.
3. **CompTIA Linux+.** Decent foundational cert. MCQ-based. Good for resumes scanned by ATS bots, weaker signal to senior engineers.
4. **LPIC-1.** Vendor-neutral, two exams. Solid content but lower brand pull in India compared to RHCSA.
5. **Honest take:** **AWS Solutions Architect Associate (SAA-C03) + provable Linux skills (Bandit + a GitHub of scripts) beats any pure-Linux cert** for ₹30+ LPA DevOps roles. Hiring managers want cloud + Linux, not Linux alone. If you can only afford one cert this year, do SAA-C03 first, then RHCSA.

### Online sandboxes (practice without burning your laptop)

- **Killercoda** — instant Ubuntu/CentOS/K8s playgrounds in the browser. No signup needed for basic labs.
- **JSLinux** (`bellard.org/jslinux`) — a full Linux kernel running in your browser via JavaScript. Useful for quick "what does this command do" checks on a locked-down machine.
- **DigitalOcean** — $200 free credit for new accounts, ₹500/month droplets after. Cleanest UX for spinning up real VMs.
- **Linode (Akamai)** — similar to DO, $100 credit, slightly cheaper at the low end.
- **AWS EC2 free tier** — t2.micro / t3.micro free for 12 months. This should be your daily-driver sandbox because it also teaches you AWS.
- **GCP free tier** — e2-micro is free forever in select regions. Great for a persistent personal Linux server.

> **Note:** Study advice #3 — Build in public. Push every script, every dotfile, every broken-then-fixed config to a GitHub repo called `linux-journey-2026`. Tweet/LinkedIn one thing you learned each week. In six months that repo + timeline is worth more than any certificate, because it's *proof of consistent practice* — which is exactly what Indian DevOps hiring managers screen for.

## Next Steps After Linux

Linux is the floor, not the ceiling. Every DevOps tool you'll touch — Docker, Kubernetes, Ansible, Terraform, AWS, GCP, CI/CD runners — is just Linux wearing a costume. Here's how each next step builds directly on what you already know.

### Linux → Bash (automate everything you just learned)

You already know `cp`, `grep`, `find`, `awk`, `sed`. Bash scripting is just gluing those into reusable files. The leap is small but career-changing: a sysadmin who writes scripts becomes a DevOps engineer.

- Goal: be able to write a 50-line script with functions, argument parsing, error handling, and logging without Googling syntax.
- Resource: "Bash Scripting Cheatsheet" (devhints.io/bash) + ShellCheck (`shellcheck.net`) for every script you write.
- Project: write a backup script that tars a directory, uploads to S3, rotates old backups, and emails on failure. That one script demonstrates 80% of what mid-level DevOps does daily.

### Linux → Docker (namespaces + cgroups + overlayfs, nothing magical)

Docker is not a separate technology. It's three Linux kernel features in a trench coat: **namespaces** (process/network/mount isolation), **cgroups** (CPU/memory limits), and **overlayfs** (layered filesystems). You already learned about processes, mounts, and users — Docker is just those concepts with sharper edges.

**7-day Docker plan:**

1. **Day 1:** Install Docker. Run `docker run -it ubuntu bash`. Explore. Notice it feels exactly like a Linux box because it *is* one.
2. **Day 2:** Images vs containers. `docker pull`, `docker ps -a`, `docker exec`, `docker logs`. Build mental model.
3. **Day 3:** Write your first Dockerfile. Containerize a simple Node/React app (use your existing skills).
4. **Day 4:** Volumes and bind mounts. Networks (`bridge`, `host`, `none`). Port publishing.
5. **Day 5:** docker-compose. Spin up a 3-service stack (React + Node API + Postgres).
6. **Day 6:** Image optimization — multi-stage builds, alpine base images, `.dockerignore`. Cut a 1.2GB image to 80MB.
7. **Day 7:** Push to Docker Hub. Pull on a cloud VM. Run in production-like mode with restart policies and healthchecks.

### Linux → Kubernetes (nodes are Linux, pods are processes)

A Kubernetes cluster is a fleet of Linux machines (*nodes*) running containers (*pods*, which are groups of Linux processes) coordinated by an API server. Everything you debug in K8s ultimately resolves to `kubectl exec -it pod -- sh` followed by the same Linux commands you already know.

**Path:**

1. Install **minikube** or **kind** locally. One-node cluster on your laptop.
2. Learn pods → deployments → services → ingress in that order. Don't skip ahead.
3. Do the free **Kubernetes Basics** tutorial on kubernetes.io.
4. KillerCoda K8s scenarios — 30 minutes/day for 3 weeks.
5. Aim for **CKAD (Certified Kubernetes Application Developer)**. It's hands-on, performance-based, and worth ~₹2-4 LPA in salary negotiation in India. CKA comes later when you're ops-focused.

### Linux → AWS (EC2 is Linux, Lambda is Linux, Fargate is Linux)

You will be shocked how much of "learning AWS" is actually "applying Linux on rented hardware." An EC2 instance is a Linux VM. A Lambda function runs on Amazon Linux 2. ECS Fargate runs containers on Linux. RDS is Postgres/MySQL on Linux. The cloud is just someone else's Linux box with an API in front.

**Path:**

1. **AWS Solutions Architect Associate (SAA-C03)** — your gateway cert. ~$150, three months of evening study. Stephane Maarek's Udemy course is the standard.
2. Hands-on: build a 3-tier app (VPC + EC2 + RDS + S3 + CloudFront) and tear it down with Terraform.
3. **AWS DevOps Engineer Professional** — once you have 1+ year of real AWS experience. This is the cert that anchors ₹30-40 LPA conversations.

### 30-day Linux-to-DevOps ramp (one focused task per day)

1. Install Ubuntu 24.04 in a VM. Customize `.bashrc`, install zsh + oh-my-zsh.
2. Complete OverTheWire Bandit levels 0–10.
3. Complete Bandit levels 11–20.
4. Write a shell script that audits your home directory: file count, largest files, oldest files.
5. Master `grep`, `awk`, `sed` with the GNU "Mastering Text Processing" cheatsheet.
6. Set up SSH key auth between your laptop and a free-tier EC2 instance.
7. Write a systemd service unit for a Node.js app. Enable, start, check status, view logs with journalctl.
8. Configure UFW or iptables on your VM. Allow only SSH + HTTP/HTTPS.
9. Install nginx, serve a static site, configure a reverse proxy to a Node app on :3000.
10. Add Let's Encrypt (certbot) for HTTPS on a free domain (DuckDNS or Freenom).
11. Write a cron job that backs up `/etc` nightly to a tarball.
12. Learn `rsync`. Sync the backups to an S3 bucket using the AWS CLI.
13. Read /proc/cpuinfo, /proc/meminfo. Write a script that summarizes system health.
14. Use `strace` on a misbehaving process. Identify which syscall is failing.
15. Install Docker. Run `hello-world`, then Ubuntu, then nginx.
16. Containerize your favorite React side project. Write the Dockerfile from scratch.
17. Multi-stage build: cut your image size by 80%.
18. Write a docker-compose.yml for React + Express + Postgres + Redis.
19. Push your image to Docker Hub. Pull and run it on the EC2 instance.
20. Install minikube locally. Deploy your app as a Kubernetes Deployment + Service.
21. Add a Kubernetes ConfigMap and Secret. Wire them to your pod.
22. Add Horizontal Pod Autoscaler. Generate load with `hey` or `ab` and watch it scale.
23. Write a Bash script that deploys your app: build image → push → kubectl apply → check rollout.
24. Set up GitHub Actions: on push to main, build Docker image and push to Docker Hub.
25. Extend GitHub Actions: SSH to EC2 and pull the new image (a tiny CD pipeline).
26. Sign up for AWS free tier. Launch an EC2 via the console, then via AWS CLI.
27. Create an S3 bucket. Upload, download, set lifecycle policy to delete after 30 days.
28. Write a Terraform file that creates a VPC + 1 EC2 + 1 S3 bucket. Apply, destroy, repeat.
29. Install Prometheus + Grafana on minikube. Scrape node metrics. Build one dashboard.
30. Final boss: deploy your React + Express + Postgres app to EC2, behind nginx with HTTPS, with a GitHub Actions pipeline that auto-deploys on push, and a cron-based DB backup to S3. Take a screenshot. Post it on LinkedIn with the GitHub repo. You are now a junior DevOps engineer.

### 30-60-90 day vision (and the 6-month payoff)

- **Day 30 — Linux comfort.** You can SSH anywhere, debug a stuck process, write a 100-line bash script, and edit any system config without panic. You speak fluent terminal.
- **Day 60 — Docker + AWS basics.** You've containerized 3+ apps, you understand VPC/EC2/S3/IAM, and you've deployed something real to production with HTTPS. You can answer "explain Docker to a junior" in an interview.
- **Day 90 — K8s + CI/CD interview-ready.** You've passed (or can pass) CKAD-style scenarios, you have a working GitHub Actions pipeline in a public repo, and you've cleared 3-5 mock interviews. **Target: ₹15-20 LPA junior/mid DevOps roles in Bangalore/Hyderabad/Pune.** At your age + React background, recruiters will fast-track you because you bring product sense most freshers lack.
- **Month 6 — Mid-level inflection.** One real production system on your resume, SAA-C03 passed, CKAD passed, contributing to an open-source DevOps tool. **Target: ₹25-35 LPA mid-level DevOps / SRE / Platform Engineer roles.** The React-to-DevOps story becomes your superpower — you understand what developers actually need from a platform, which most pure-ops engineers don't.

> **Real world:** The pep talk you came here for. You are 37. You are not late. The Indian DevOps market in 2026 is desperate for engineers who can talk to developers *and* ops — because most candidates can only do one. Your years of React shipping real features is not a liability; it is a wedge. Recruiters will pay a premium for someone who has actually pushed code to production and now understands the pipeline that delivers it.
>
> Six months from now, a hiring manager is going to look at your GitHub, see 180 days of consistent commits, see one solid end-to-end project, see SAA-C03 and maybe CKAD on the resume, and offer you ₹28 LPA without blinking. The only thing standing between you and that offer is showing up to the terminal every day between now and then.
>
> Close this tab. Open one. Type `ssh`. Begin.

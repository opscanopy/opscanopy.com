---
title: "chown command in Linux: change file owner and group"
description: "The chown command in Linux explained: user:group syntax, chown -R and symlinks, --reference, chgrp, chmod vs chown, and fixing Docker volume permission errors with numeric IDs."
pubDate: 2026-10-04
tags: ["linux", "security", "devops"]
relatedTool:
  name: "chmod Calculator"
  href: "/chmod-calculator"
---

![A key handing a folder from one user to another](/blog/chown-command-linux-hero.svg)
<!-- keywords: chown command | chown recursive, chown -R, chown linux, chmod vs chown | source: ahrefs free (2026-10-04) -->

Permissions say *what* the owner, the group and everyone else may do. Ownership says *who* the owner and the group are. When a file has a perfectly sensible mode like `600` and a service still cannot read it, the mode is rarely the problem: the file belongs to the wrong user. That is what `chown` fixes.

This post covers the owner and group syntax, recursive changes and the symlink rules that come with them, copying ownership from another file, `chgrp`, how chown and chmod divide the work, and the most common real-world case: a container that cannot write to its own volume.

## The syntax

```bash
chown [options] OWNER[:GROUP] FILE...
chown [options] --reference=REF_FILE FILE...
```

The owner and group are written together with no spaces, and each can be a name or a numeric ID. The forms differ in small but important ways:

| You write | Owner becomes | Group becomes |
|---|---|---|
| `chown deploy file` | `deploy` | unchanged |
| `chown deploy:web file` | `deploy` | `web` |
| `chown deploy: file` | `deploy` | `deploy`'s login group |
| `chown :web file` | unchanged | `web` (same as `chgrp web file`) |
| `chown 1000:1000 file` | UID 1000 | GID 1000 |

The trailing colon in `deploy:` is easy to miss and useful: it sets the group to the user's primary group without you having to look it up. Older scripts sometimes use a dot (`deploy.web`). GNU chown still accepts it with a warning, but it is ambiguous for user names that contain a dot, so use the colon.

## Who is allowed to run it

Changing a file's **owner** requires root (strictly, the `CAP_CHOWN` capability). An ordinary user cannot give a file away, even one they own; otherwise anyone could dodge disk quotas or plant files in another user's name. That is why most `chown` commands in documentation start with `sudo`.

Changing only the **group** is allowed for the file's owner, as long as they are a member of the target group. Root can set any group.

## Useful options

- `-R`, `--recursive`: change a directory and everything inside it.
- `-v`, `--verbose`: report every file processed; `-c`, `--changes` reports only files whose ownership actually changed.
- `-h`, `--no-dereference`: change a symlink itself rather than the file it points to.
- `--reference=FILE`: copy owner and group from another file.
- `--from=OWNER[:GROUP]`: only change files that currently have this owner and group.
- `--preserve-root`: refuse to run recursively on `/`. Worth adding to any script that builds its path from a variable.

## chown -R: recursive ownership

The everyday recursive case is handing an application directory to the user that runs it:

```bash
sudo chown -R www-data:www-data /var/www/site
```

Unlike `chmod -R`, recursive `chown` has no file-versus-directory trap, because files and directories want the same owner. The danger is the path. `sudo chown -R deploy: /` with a stray space, or `$APP_DIR` expanding to nothing, rewrites the ownership of the whole system and is very hard to undo. Quote variables, test them, and use `--preserve-root`.

`--from` makes recursive changes safer when you only mean to touch some files. After a user's UID changes, for example, this reassigns only the files that still carry the old one:

```bash
sudo chown -R --from=1001 1005 /srv/data
```

## Symlinks: what chown changes

A symbolic link has its own owner, separate from its target, and chown's default behaviour depends on whether it is recursing:

- **Not recursive:** `chown deploy link` changes the *target*, not the link. Add `-h` to change the link itself.
- **Recursive:** `-R` does not follow symlinks it meets inside the tree (`-P` is the default). Add `-H` to follow symlinks named on the command line, or `-L` to follow every symlink to a directory.

Be careful with `-L`, and with `--dereference` combined with `-R`. If someone who can write inside the tree plants a symlink to `/etc` while a root-run `chown -R -L` is walking it, the ownership change lands on `/etc`. For trees that other users can write to, keep the default.

## --reference: copy ownership from another file

When a file should match its neighbours, copy the ownership instead of typing it:

```bash
sudo chown --reference=/etc/nginx/nginx.conf /etc/nginx/conf.d/api.conf
```

If the reference file is a symlink, chown uses the owner and group of the file it points to. `chmod --reference` does the same for the mode, so the pair makes a new file look exactly like an existing one.

## chgrp

`chgrp web report.csv` changes only the group. It is exactly `chown :web report.csv`, takes the same `-R`, `-h` and `--reference` options, and is handy in scripts because it states the intent plainly. Combined with the setgid bit on a directory (`chmod g+s shared/`), it gives a team folder where every new file lands in the team's group.

## chown clears setuid and setgid

On Linux, changing the owner or group of an executable file clears its setuid and setgid bits, and since kernel 2.2.13 that applies even when root does it. It is a safety rule: a setuid binary should not quietly start running as a different user. If you chown a file that genuinely needs those bits, set them again afterwards and check with `ls -l`:

```bash
sudo chown root:root /usr/local/bin/helper
sudo chmod 4755 /usr/local/bin/helper
```

GNU coreutils notes that the exact behaviour belongs to the system call, so on other systems check before relying on it.

## chmod vs chown

The two commands are often confused because they fix the same symptom, `Permission denied`, from different sides:

| | chmod | chown |
|---|---|---|
| Changes | the mode bits (`rwx` for owner, group, others) | the owner and the group |
| Question it answers | what may each class do? | who is in each class? |
| Who can run it | the file's owner or root | root for the owner; the owner for groups they belong to |
| Typical fix | a script is not executable | a service user cannot read its own files |

A useful rule: if the mode looks right for the job (`600` for a key, `644` for a config) but the process still fails, look at the owner. Loosening the mode to `777` instead "fixes" the error by letting everyone in, which is a security problem, not a fix. The [chmod command guide](/blog/chmod-command-linux/) covers the other side, and modes such as [`600`](/chmod-calculator/600/), [`644`](/chmod-calculator/644/) and [`755`](/chmod-calculator/755/) each have a page explaining who can do what.

## Fixing Docker volume permissions

The most common chown problem in DevOps work is a container that cannot write to a bind mount:

```text
mkdir: cannot create directory '/app/data/cache': Permission denied
```

The cause is that the kernel stores ownership as numbers, not names. A container image that runs as an unprivileged user (the official Node images ship a `node` user with UID 1000; the Debian-based Postgres image runs as UID 999) writes as that UID, while the host directory you mounted is probably owned by your user or by root. The names inside and outside the container mean nothing to each other; only the numbers have to match.

Find the UID the container runs as, then give the host directory to that UID:

```bash
docker run --rm my-image id          # uid=1000(node) gid=1000(node)
sudo chown -R 1000:1000 ./data
```

Use the numeric form here. `chown -R node:node ./data` on the host either fails or picks whatever user happens to be called `node` on that machine. The alternative is to leave the files alone and run the container as you: `docker run --user "$(id -u):$(id -g)" …`, or `user: "1000:1000"` in Compose. For named volumes, the image usually sets ownership when the volume is first created, so this mostly affects bind mounts.

## Where to go next

The [permissions section of Linux for DevOps](/learn/guides/linux-for-devops/#file-permissions-ownership) covers users, groups and ownership in context. To decide which mode a file should have once its owner is right, the [chmod Calculator](/chmod-calculator/) converts between octal, symbolic and `ls -l` forms in your browser.

## chown quick reference

- [ ] `user:group` sets both, `user:` uses the user's login group, `:group` changes only the group.
- [ ] Changing the owner needs root; changing the group needs ownership plus membership of that group.
- [ ] Use numeric IDs for containers: ownership is stored as UID and GID, never names.
- [ ] `-h` changes a symlink itself; without `-R`, chown follows the link by default.
- [ ] `-R` does not follow symlinks inside the tree; avoid `-L` on trees others can write to.
- [ ] `--reference=FILE` copies ownership; `--from=` limits a change to the current owner.
- [ ] chown clears setuid and setgid on executables; set them again afterwards.
- [ ] Right mode, still denied: check the owner before reaching for `chmod 777`.

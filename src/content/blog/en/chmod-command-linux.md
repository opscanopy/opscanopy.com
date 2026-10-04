---
title: "chmod command in Linux: syntax, examples and common mistakes"
description: "The chmod command in Linux explained: octal and symbolic modes, chmod +x, chmod -R and its traps, setuid, setgid and sticky bits, umask, and how to fix Permission denied."
pubDate: 2026-10-03
tags: ["linux", "security", "devops"]
relatedTool:
  name: "chmod Calculator"
  href: "/chmod-calculator"
---

![A three-by-three grid of read, write and execute bits for owner, group and others](/blog/chmod-command-linux-hero.svg)
<!-- keywords: chmod command | chmod +x, chmod recursive, chmod -R, chmod command in linux, linux chmod | source: ahrefs free (2026-10-04) -->

A deploy script fails with `Permission denied`. A freshly cloned repository will not run `./build.sh`. SSH refuses a key because its "permissions are too open". A web server returns 403 for files that are plainly on disk. Each of these ends with the same command, and most of the time the fix is one line. The trouble is that the wrong one line, run with `-R`, can do more damage than the original problem.

This post covers how `chmod` reads its arguments, the two ways to write a mode, the recursive traps, the three special bits, and a checklist for the moment a permission error appears.

## The syntax

```bash
chmod [options] MODE FILE...
chmod [options] --reference=REF_FILE FILE...
```

`MODE` is either a number (`755`) or a symbolic expression (`u+x`). Every file listed gets the change. The options you will actually use are few:

- `-R`, `--recursive`: apply to a directory and everything under it.
- `-v`, `--verbose`: print a line for every file processed.
- `-c`, `--changes`: print a line only when a mode actually changed. Useful in scripts, because the output is a diff.
- `--reference=FILE`: copy the mode from another file instead of typing it.

Only the file's owner (or root) can change its mode. Being in the file's group, even with write permission, is not enough.

## Reading a mode

`ls -l` prints ten characters at the start of each line:

```text
-rwxr-x---  1 deploy  web  4120 Oct  3 09:12 build.sh
```

The first character is the type (`-` file, `d` directory, `l` symlink). The next nine are three groups of three: **owner** (`u`), **group** (`g`) and **others** (`o`). Within each group the slots are always read, write and execute, in that order, with `-` for a bit that is off. So `rwxr-x---` means the owner can do everything, members of `web` can read and run the script, and nobody else can touch it.

On a directory the same letters mean something slightly different. `r` lets you list the names inside, `w` lets you create, rename and delete entries, and `x` lets you *enter* the directory and reach anything inside it by name. A directory with `r` but no `x` is a list of names you cannot open.

## Octal mode: three digits, one per class

Each permission has a value: read is 4, write is 2, execute is 1. Add them up per class and you get one digit for owner, one for group, one for others:

| Digit | Bits | Meaning |
|---|---|---|
| 7 | `rwx` | read, write, execute |
| 6 | `rw-` | read, write |
| 5 | `r-x` | read, execute |
| 4 | `r--` | read only |
| 0 | `---` | nothing |

That gives you the modes you will see over and over:

- [`755`](/chmod-calculator/755/) (`rwxr-xr-x`): scripts, binaries and most directories. The owner writes; everyone else reads and runs.
- [`644`](/chmod-calculator/644/) (`rw-r--r--`): ordinary files such as configs and HTML. Readable by all, writable by the owner.
- [`600`](/chmod-calculator/600/) (`rw-------`): secrets. SSH private keys, `.env` files, kubeconfigs.
- [`700`](/chmod-calculator/700/) (`rwx------`): private directories, `~/.ssh` being the classic case.
- [`775`](/chmod-calculator/775/) (`rwxrwxr-x`): a directory a whole team writes to, usually together with a shared group.

Octal mode **replaces** the whole set of permissions at once. `chmod 644 file` does not add read for others; it makes the mode exactly `rw-r--r--`, whatever it was before. That is its strength when you want a known state, and its danger when you only meant to flip one bit.

## Symbolic mode: change one thing, leave the rest

Symbolic mode is written as *who*, *operator*, *what*:

- who: `u` (owner), `g` (group), `o` (others), `a` (all three)
- operator: `+` (add), `-` (remove), `=` (set exactly)
- what: `r`, `w`, `x`, plus `X`, `s` and `t`, covered below

Some examples worth knowing by heart:

```bash
chmod u+x deploy.sh        # owner may now run it; nothing else changes
chmod a-w release.tar.gz   # nobody can write to it, the owner included
chmod go-rwx id_ed25519    # strip group and others completely
chmod g=rx,o= app/         # group gets exactly r-x, others get nothing
chmod u+x,g+x tools/*.sh   # several clauses, comma-separated, no spaces
```

### What chmod +x actually does

`chmod +x file` has no *who*, and that has a precise meaning. GNU chmod treats a missing *who* as `a`, but **bits set in your umask are left alone**. With the common umask of `022`, `chmod +x` adds execute for owner, group and others, so `644` becomes `755`. With a strict umask of `077`, the same command only adds `u+x`, and `644` becomes `744`. If you want a result that does not depend on whoever runs the script, write the class out: `chmod a+x` or `chmod u+x`.

## chmod -R and the two classic mistakes

Recursive mode applies one mode to files and directories alike, and files and directories want different bits. That mismatch produces two mistakes that turn up in almost every team.

**Mistake one: `chmod -R 755 project/`.** Every directory is fine, but every file is now executable, including `README.md`, every `.env` and every config. Nothing breaks immediately, which is why it lingers, and a later `git status` shows the whole tree as modified if `core.fileMode` is on.

**Mistake two: `chmod -R 644 project/`.** Every file is fine, but every directory has lost `x`. You can no longer `cd` into them, and nothing inside can be opened, even though each file is `644`. The web server answers 403 and the cause is not where you look first.

The fix is to treat the two types separately with `find`:

```bash
find project/ -type d -exec chmod 755 {} +
find project/ -type f -exec chmod 644 {} +
```

Or use capital `X`, which adds execute only to directories and to files that already have execute for somebody:

```bash
chmod -R u=rwX,go=rX project/
```

That one line gives directories `755`, gives existing scripts `755`, and gives plain files `644`. It is the closest thing to a safe recursive chmod.

Two more cautions. By default GNU chmod does not change a symlink's own mode (Linux ignores symlink permissions anyway); a symlink named on the command line has its *target* changed, and with `-R` the links found during the walk are skipped. And `-R` on the wrong path is unrecoverable without a backup. `--preserve-root` only refuses a recursive run on `/` itself, so print the path before the command runs.

## The special bits: setuid, setgid and sticky

A fourth, leading octal digit holds three more bits. In `ls -l` they replace the `x` in one of the three groups:

| Bit | Value | Shown as | On a file | On a directory |
|---|---|---|---|---|
| setuid | 4 | `s` in owner `x` | runs as the file's owner | ignored on Linux |
| setgid | 2 | `s` in group `x` | runs as the file's group | new files inherit the directory's group |
| sticky | 1 | `t` in others `x` | ignored on Linux | only an entry's owner (or the directory's owner) can delete or rename it |

The two you meet in practice:

- [`4755`](/chmod-calculator/4755/) (`rwsr-xr-x`): setuid. `/usr/bin/passwd` is typically installed this way so an ordinary user can update a root-owned file. A setuid binary is a privilege boundary; never set it on a script or on something you did not write.
- [`1777`](/chmod-calculator/1777/) (`rwxrwxrwt`): the sticky bit on a world-writable directory. This is `/tmp`: everyone can create files, but nobody can delete someone else's.

Setgid on a shared directory (`chmod 2775 shared/`, or `chmod g+s shared/`) is the tidy way to make every new file belong to the team's group. An uppercase `S` or `T` in `ls -l` means the special bit is on but the execute bit beneath it is off, which is almost always a mistake.

One GNU detail catches people out: `chmod 755 dir` *keeps* an existing setuid or setgid bit on a directory. To clear it you have to say so, with `chmod g-s dir` or a five-digit mode such as `chmod 00755 dir`.

## umask: where the starting mode comes from

New files are not created with `777` and trimmed later. Programs ask for `666` on files and `777` on directories, and the kernel removes the bits set in the process's **umask**. With `umask 022`, files start at `644` and directories at `755`. With `umask 077`, they start at `600` and `700`.

So when every file a service writes comes out unreadable to the rest of the team, the fix is often the service's umask (`UMask=` in a systemd unit, or `umask 002` in its start script), not a `chmod` after the fact.

## A note on ACLs

If `ls -l` prints a `+` after the mode (`-rw-rw-r--+`), the file has an access control list, and the nine bits are not the whole story. `getfacl file` shows the extra entries. On such a file, the group bits that `chmod` changes are the ACL *mask*, which caps every named user and group entry, so `chmod g-w` can silently take write access away from people who are not in the file's group at all.

## Troubleshooting "Permission denied"

When a command fails, work through the path rather than the file:

1. **Check every directory on the way.** You need `x` on each parent to reach a file. `namei -l /srv/app/config/app.yml` prints the mode and owner of every component, which finds the missing bit in seconds.
2. **Check who you are.** `id` shows your user and groups. Group changes only apply to new login sessions, so a user added to `docker` five minutes ago still lacks it in the old shell.
3. **Check the owner, not just the mode.** `rw-------` is correct for a key and useless if the key belongs to root and the process runs as `deploy`. That is a job for [chown](/blog/chown-command-linux/), not chmod.
4. **Check the mount.** A file can be `755` on a filesystem mounted `noexec`, and it still will not run. `findmnt -T path` shows the mount options.
5. **Check the security layer.** On SELinux systems, a correct mode with the wrong context still fails; `ls -Z` and the audit log show it.
6. **Mind what strict programs expect.** OpenSSH refuses a private key that its group or others can access, and its `StrictModes` check rejects a group- or world-writable home directory or `~/.ssh`. Set `~/.ssh` to `700` and keys to `600`.

## Work out a mode without the arithmetic

The [chmod Calculator](/chmod-calculator/) converts between octal, symbolic and the `ls -l` string in both directions, including the special bits, and shows the exact command to run. It runs in your browser. For the wider picture of users, groups and ownership, the [permissions section of Linux for DevOps](/learn/guides/linux-for-devops/#file-permissions-ownership) puts chmod in context.

## chmod quick reference

- [ ] Octal replaces every bit; symbolic changes only what you name.
- [ ] `r` = 4, `w` = 2, `x` = 1, one digit per owner, group, others.
- [ ] `755` scripts and directories, `644` files, `600` secrets, `700` private directories.
- [ ] `chmod +x` respects the umask; `chmod a+x` and `chmod u+x` do not depend on it.
- [ ] Never `chmod -R 755` or `chmod -R 644` a mixed tree; use `find -type d` / `-type f`, or `chmod -R u=rwX,go=rX`.
- [ ] A directory needs `x` to be entered, on every level of the path.
- [ ] `4755` setuid, `2775` setgid for shared group directories, `1777` sticky for `/tmp`-style directories.
- [ ] A `+` after the mode means an ACL; check `getfacl` before trusting the nine bits.
- [ ] Wrong owner is a chown problem; changing the mode will not fix it.

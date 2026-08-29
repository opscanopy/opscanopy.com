---
title: "failed to solve: process \"/bin/sh -c ...\" did not complete successfully: exit code: 1"
description: "BuildKit's generic build failure tells you which line failed but not why. How to read the error, get the real output back, and fix the four structural causes that produce it most often."
pubDate: 2026-08-29
tags: ["docker","buildkit","ci","dockerfile"]
relatedTool:
  name: "Dockerfile Linter"
  href: "/dockerfile-linter"
---

![A Dockerfile build stopping at a RUN layer: earlier layers cached and green, the failing instruction marked with its exit code, later layers never reached.](/blog/docker-build-failed-to-solve-exit-code-1-hero.svg)

Your build stops with a wall of text ending in this:

```
------
 > [4/8] RUN apt-get install -y curl:
------
Dockerfile:12
--------------------
  10 |     WORKDIR /app
  11 |     COPY . .
  12 | >>> RUN apt-get install -y curl
  13 |     
--------------------
ERROR: failed to solve: process "/bin/sh -c apt-get install -y curl" did not complete successfully: exit code: 1
```

The first thing to understand is that **this error is not the problem**. It is BuildKit reporting that a command you asked it to run exited non-zero. The actual cause is in that command's output, which BuildKit has usually just truncated away.

So there are two jobs here: get the real error back, then fix it. This post covers both, plus the four structural causes that produce this message far more often than anything else.

## Reading the error properly

Three parts matter:

- **`[4/8]`** — which step failed, and how far the build got. Steps 1–3 succeeded.
- **`Dockerfile:12`** with the `>>>` marker — the exact line. BuildKit is precise about this; trust it.
- **`exit code: 1`** — the status your command returned. This is the *command's* exit code, not Docker's.

That last one is worth reading carefully, because some exit codes are diagnostic on their own:

| Exit code | Usually means |
|---|---|
| `1` | Generic failure — the command itself will say why |
| `100` | `apt-get` could not install (unresolved package, stale index) |
| `126` | Found the file but could not execute it — permissions, or CRLF line endings |
| `127` | Command not found — not installed, or not on `PATH` yet |
| `137` | Killed by SIGKILL — almost always the builder running out of memory |

`127` and `137` in particular save you a lot of time. `127` means you are calling something that does not exist in that layer. `137` means nothing is wrong with your command at all — the build ran out of RAM, and you should raise the memory available to the builder rather than edit the Dockerfile.

## Get the real output back

BuildKit collapses successful output and truncates failed output. To see the whole thing:

```bash
docker build --progress=plain --no-cache .
```

`--progress=plain` disables the collapsing TUI and streams every line. `--no-cache` matters more than it looks: with a warm cache, BuildKit may not re-run the earlier steps that produced the actual error message, so you get the failure without the context.

If the output is long, capture it:

```bash
docker build --progress=plain --no-cache . 2>&1 | tee build.log
```

Nine times out of ten the answer is now sitting in `build.log`, several lines above the `failed to solve` line, in the failing command's own words.

## Debug the layer interactively

When the output still isn't enough, get a shell in the last layer that *did* build. Every successful step leaves an image behind:

```bash
# grab the image id of the last good step from --progress=plain output
docker run --rm -it <last-good-image-id> sh
```

Then run the failing command by hand. This resolves most "but it works on my machine" cases immediately, because you are now standing inside the exact filesystem the command was given — not your shell, with your `PATH`, your installed packages and your environment variables.

## The four structural causes

Most instances of this error are not exotic. They are the same handful of Dockerfile mistakes.

### 1. `apt-get install` without a fresh index

The single most common cause, and the most confusing, because it works one day and fails the next.

```dockerfile
# Broken — and it will pass CI for weeks before it doesn't
RUN apt-get update
RUN apt-get install -y curl
```

These are two layers. Docker caches the `apt-get update` layer, and keeps using it long after the package index it downloaded has gone stale upstream. Eventually `install` asks for a package version that no longer exists at the URL the cached index recorded, and returns exit code 100.

```dockerfile
# Correct — one layer, so the index is always as fresh as the install
RUN apt-get update && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*
```

The `rm -rf` is not just hygiene: leaving the lists in the image guarantees a future reader will copy this pattern with a stale cache again.

### 2. The command needs a shell feature it doesn't have

Exec form does not run a shell:

```dockerfile
RUN ["apt-get", "install", "-y", "curl && echo done"]   # && is a literal argument
```

There is no shell here to interpret `&&`, `|`, `>`, `$VAR` or `*`. If you need any of those, use shell form (`RUN apt-get install -y curl && echo done`).

The same trap bites `CMD` and `ENTRYPOINT` in exec form, and on Alpine there is a second layer to it: the default shell is `/bin/sh`, not bash. A script using `[[`, arrays or `source` will fail with exit code 2 or 127 even though it is a perfectly good bash script.

### 3. `COPY` did not copy what you think

```dockerfile
COPY . .
RUN ./scripts/build.sh      # exit code 127: not found
```

Two usual reasons. First, `.dockerignore` excluded the file — it applies to the build context before `COPY` ever sees it, so the file silently is not there. Second, the file is there but not executable, which gives you `126` rather than `127`.

Check what actually landed:

```dockerfile
RUN ls -la ./scripts    # temporary, but it settles the question in one build
```

On Windows there is a third: a script committed with CRLF line endings fails with `exec format error` or a confusing `not found`, because the kernel reads the shebang as `/bin/sh\r`.

### 4. Architecture mismatch

On Apple Silicon building for a linux/amd64 target, a binary downloaded at build time may be the wrong architecture, producing `exec format error` and a non-zero exit.

```bash
docker build --platform linux/amd64 .
```

Make the platform explicit rather than relying on the daemon's default, especially in a CI pipeline whose runners may not match your laptop.

## Catching these before the build runs

Causes 1–3 are all visible in the Dockerfile itself, without running anything. That is what a linter is for, and it is worth being precise about the division of labour:

A linter **cannot** tell you why *your specific* `apt-get install` returned 1 — that depends on the package index at that moment. What it can do is flag the structural patterns that make this error likely and recurrent: the split `apt-get update` / `install` cache trap, broken JSON exec forms, `COPY` ordering that busts the cache on every build, and secrets baked into image history.

The [Dockerfile Linter](/dockerfile-linter/) runs seventeen such rules over a real parse of the file and returns line-numbered findings with a fix for each, plus an explicit list of what it deliberately does not flag. Paste the Dockerfile, fix what it names, and the recurring instances of this error stop happening. The one-off ones you still debug with `--progress=plain`.

## The order to work in

1. Re-run with `--progress=plain --no-cache` and read the failing command's own output. This alone resolves most cases.
2. Check the exit code against the table above — `127` and `137` in particular mean something specific.
3. Still stuck? Shell into the last good layer and run the command by hand.
4. Then lint the Dockerfile, so the structural version of this failure does not come back next month.

The message itself is generic by design: BuildKit does not know anything about `apt-get`, only that a process it started returned 1. Once you stop reading `failed to solve` as the error and start treating it as a pointer to a line number and an exit code, it becomes one of the easier Docker failures to work through.

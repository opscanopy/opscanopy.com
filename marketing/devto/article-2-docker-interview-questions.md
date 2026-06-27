---
title: "14 Docker interview questions I actually got asked in 2026 (and how I'd answer them)"
published: false
description: "Real Docker interview questions from 2026 DevOps loops, plus what interviewers are actually testing and the crisp answers that land."
tags: docker, devops, interview, beginners
cover_image: ""
canonical_url: ""
---

I've been on both sides of the table. Some years I'm the one sweating through a Docker round; other years I'm the one asking "okay, your image is 1.2GB, walk me through shrinking it." So this list isn't scraped off the internet. These are questions I either got asked in 2026 or asked candidates myself, mostly for backend/DevOps roles (a chunk of these come up in almost every Bengaluru product-company loop).

**TL;DR:** Interviewers don't want textbook definitions. They want to know you've actually run `docker logs` on a crashing container at 11pm. Below are 14 questions grouped into Fundamentals, Images & Builds, Networking & Storage, and Debugging. Each has the question, what they're *really* testing, and the answer I'd give.

> 🖼️ **[IMAGE PROMPT]:** Clean modern isometric tech illustration, 1200x630, of a developer at a desk facing a glowing terminal that displays Docker whale logo and container blocks stacking upward. Split mood: half "interview" (a subtle speech-bubble panel), half "engineering". Palette: deep slate background, emerald green accents (#10b981), soft white UI panels. Flat vector, no photorealism, no stock-photo people faces, generous negative space.

## Fundamentals

**1. What's the difference between a container and a VM?**

*What they're really testing:* whether you understand that containers share the host kernel.

A VM virtualizes hardware and runs a full guest OS with its own kernel, so it's heavy (gigabytes, slow boot). A container is just an isolated process on the host — it shares the host kernel and only packages the app plus its userland dependencies. That's why containers start in milliseconds and you can pack dozens on one box. The trade-off: weaker isolation than a VM, since everyone shares that kernel.

Honestly, most candidates nail this one because it's the first thing every tutorial covers. The follow-up is where people slip: "so can you run a Windows container on a Linux host?" (No — the kernel has to match.)

**2. What actually happens when you run `docker run`?**

Docker pulls the image if it's not local, creates a writable container layer on top of the read-only image layers, sets up networking and namespaces/cgroups, then starts the process defined by ENTRYPOINT/CMD as PID 1 inside the container. When that process exits, the container stops. That last sentence matters more than it sounds — half the "my container won't stay up" problems trace back to it.

**3. Image vs container — explain it like I'm new.**

An image is the read-only template (a stack of layers). A container is a running — or stopped — instance of that image with a thin writable layer on top. One image, many containers. The class-vs-object analogy works fine here and interviewers don't mind it.

**4. What's the deal with image layers and the build cache?**

Each instruction in a Dockerfile (`RUN`, `COPY`, `ADD`) creates a layer. Layers are cached and content-addressed, so if nothing above a line changed, Docker reuses the cached layer instead of rebuilding it. This is why instruction *order* is a real skill, not pedantry. Put the stuff that rarely changes first, and the stuff that changes every commit (your source code) last:

```dockerfile
COPY package.json package-lock.json ./
RUN npm ci          # cached unless deps change
COPY . .            # only this busts on a code change
```

If you `COPY . .` before installing deps, every one-line code change reinstalls your whole dependency tree. I've seen 9-minute CI builds drop to 40 seconds just from reordering these two blocks. (For a fuller walkthrough of the layer model, the [Docker fundamentals guide](https://opscanopy.com/learn/guides/docker-for-devops) goes deeper than I can here.)

## Images & Builds

**5. Your production image is 1.2GB. How do you shrink it?**

*What they're really testing:* practical instincts, not trivia. This is my favorite question to ask.

Things I'd actually do, roughly in order of impact:

- **Multi-stage build.** Compile/install in a fat builder stage, copy only the artifact into a clean runtime stage.
- **Smaller base image.** Swap `node:20` for `node:20-alpine`, or go distroless for compiled languages.
- **`.dockerignore`.** Stop shipping `node_modules`, `.git`, and local junk into the build context.
- **Collapse layers** and clean package caches in the same `RUN` (`rm -rf /var/lib/apt/lists/*`).

The multi-stage one usually does most of the work:

```dockerfile
FROM golang:1.23 AS build
WORKDIR /src
COPY . .
RUN go build -o /app ./cmd/server

FROM gcr.io/distroless/static
COPY --from=build /app /app
ENTRYPOINT ["/app"]
```

That Go binary plus distroless can land under 20MB. The answer that impresses isn't reciting all four bullets — it's saying "first I'd run `docker history` to see which layer is fat, *then* decide."

**6. Multi-stage builds — why bother?**

Because your build tools aren't your runtime needs. You need a compiler, headers, and a package manager to *build*; you need none of that to *run*. Multi-stage lets you keep build dependencies in an early stage and copy just the output forward with `COPY --from=build`, so the final image is small and has a smaller attack surface. Bonus: no more separate "build image" and "run image" shell scripts.

**7. ENTRYPOINT vs CMD?**

ENTRYPOINT sets the executable that always runs; CMD sets default arguments (or a default command) that are easy to override at `docker run`. Common pattern: `ENTRYPOINT ["python"]` plus `CMD ["app.py"]`, so `docker run img test.py` swaps the script but keeps the interpreter. Also — use the exec form (`["..."]`, JSON array), not the shell form, or your process won't get signals correctly and won't run as PID 1.

> Quick tip: if `docker stop` takes a full 10 seconds and then kills your container hard, it's almost always the shell-form ENTRYPOINT swallowing SIGTERM. Switch to exec form.

**8. COPY vs ADD?**

Use COPY. It just copies files from the build context into the image, no surprises. ADD does that *plus* two magic things: it auto-extracts local tar archives and can fetch remote URLs. Both behaviors bite people, so the convention is COPY by default, ADD only when you specifically want tar extraction.

> 🖼️ **[IMAGE PROMPT]:** Isometric diagram, 1600x900, showing a multi-stage Docker build. Left: a large "builder" container block full of tools, gears, and a compiler icon. An arrow labeled "COPY --from=build" points right to a tiny clean "runtime" container holding just one glowing binary. Show the size difference dramatically (big vs tiny). Style: flat vector, slate + emerald (#10b981) palette, thin white outlines, dark background, no text other than the small label.

**9. What goes in a `.dockerignore` and why does it matter?**

Anything you don't want sent to the Docker daemon as build context: `node_modules`, `.git`, `dist`, `.env`, logs, test fixtures. Two reasons it matters — a bloated context slows every build (the whole thing gets tarred and shipped to the daemon), and `COPY . .` can accidentally bake secrets or local config into the image. It's basically `.gitignore` for builds, and forgetting it is a classic junior mistake.

## Networking & Storage

**10. Walk me through Docker's default network modes.**

Three you should know:

- **bridge** (default): containers get a private IP on a virtual bridge and talk to each other by name on a user-defined network. Outside access needs published ports.
- **host**: the container shares the host's network stack directly — no isolation, no port mapping, slightly faster. Linux only, really.
- **none**: no networking at all. Useful for batch jobs that shouldn't touch the network.

The detail that earns points: on the *default* bridge, containers can't resolve each other by name — you only get automatic DNS on a **user-defined** bridge network. So in real projects you create one: `docker network create appnet`.

**11. What does `-p 8080:80` actually do?**

It publishes a port: maps port 8080 on the host to port 80 inside the container. Left side is host, right side is container — people flip these under pressure constantly.

```bash
docker run -d --name web -p 8080:80 nginx
```

Now `localhost:8080` hits nginx listening on 80 inside the container. Without `-p`, the container's port is reachable from other containers on the same network but not from your laptop.

**12. Bind mount vs named volume — when do you use which?**

A bind mount maps a specific host path into the container (`-v $(pwd):/app`) — great for local dev where you want live code reloads, but it's tied to the host's filesystem layout. A named volume is managed by Docker (`-v appdata:/var/lib/postgresql/data`), lives in Docker's storage area, and is the right call for persistent data like databases in production. Rule of thumb I give people: bind mounts for dev convenience, named volumes for data you can't lose.

## Debugging & Scenarios

**13. A container exits immediately after starting. How do you debug it?**

*What they're really testing:* do you reach for logs first, or start guessing.

My order:

1. `docker ps -a` — check the exit code. 0 means it finished on purpose; non-zero means it crashed.
2. `docker logs <container>` — 90% of the time the error is right there.
3. If it's a "main process exited so the container stopped" situation, ask whether the command is actually a long-running foreground process. A container with `CMD ["npm", "run", "build"]` will *always* exit — build finishes, PID 1 dies, container stops. That's not a bug.
4. Still stuck? Override the entrypoint and poke around:

```bash
docker run -it --entrypoint sh myimage
```

The candidates who impress me say "logs first." The ones who worry me start by rebuilding the image.

**14. `docker exec` vs `docker run` — and how do you get a shell into a *running* container?**

`docker run` creates and starts a **new** container from an image. `docker exec` runs a command in an **already-running** container. So to debug live, you exec in:

```bash
docker exec -it web sh
```

If `sh` isn't there (distroless, scratch), that's the price of a tiny image — you debug from outside, or temporarily run a debug-friendly variant. Mixing these two up is one of the most common slips, and clearing it up cleanly signals real hands-on time.

**Bonus — restart policies and healthchecks (they always sneak this in):**

Restart policies tell Docker what to do when a container dies: `--restart=on-failure` retries only on non-zero exit, `--restart=unless-stopped` keeps it alive across daemon restarts unless you explicitly stopped it. A HEALTHCHECK lets Docker probe whether your app is actually serving, not just whether the process exists:

```dockerfile
HEALTHCHECK --interval=30s --timeout=3s \
  CMD curl -f http://localhost/health || exit 1
```

Knowing the difference between "process is up" and "app is healthy" is the kind of thing that separates someone who's run prod from someone who's only done tutorials.

> 🖼️ **[IMAGE PROMPT]:** Flat vector troubleshooting diagram, 1600x900, of a "container exited" debug flow. A red container block with an "exit code" tag, an arrow to a terminal panel showing `docker logs`, branching into two outcomes (a green check and a red restart-loop icon). Slate background, emerald (#10b981) and amber accents, clean thin lines, minimal labels, no people.

## How to actually prep

A pattern across every loop I've sat in: interviewers chain questions. They'll start at "container vs VM," and within four follow-ups you're explaining why your container exits with code 137 (that's OOM-kill, by the way — worth memorizing). So don't memorize answers; build a mental model you can reason from.

If you want the structured version of this, OpsCanopy has a [full Docker interview-questions guide](https://opscanopy.com/learn/guides/docker-interview-questions) with deeper answers and more scenario chains than I can fit in a dev.to post. Pair it with the [Docker roadmap](https://opscanopy.com/learn/roadmaps/docker) if you're figuring out what to learn in what order, and once Docker clicks, [Kubernetes for DevOps](https://opscanopy.com/learn/guides/kubernetes-for-devops) is the natural next step — most of these loops have a K8s round right after. Everything's free over at the [Learn hub](https://opscanopy.com/learn).

I've got the full set with deeper answers and the nastier follow-ups [right here](https://opscanopy.com/learn/guides/docker-interview-questions). Go break some containers before your next interview — it's the fastest way to actually remember any of this.

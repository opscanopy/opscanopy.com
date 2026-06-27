---
title: "Docker Interview Prep: Scenario-Based Questions & Answers for DevOps"
description: "Docker interview preparation for DevOps engineers: scenario-based questions, clear answers, visual explanations, and the gotchas interviewers love to ask."
track: docker
order: 2
difficulty: intermediate
updatedDate: 2026-06-27
tags: ["docker", "interview", "devops", "containers"]
relatedTools: ["docker-run-to-compose", "kubernetes-resource-calculator", "env-example-checker"]
seoTitle: "Docker Interview Questions for DevOps Engineers"
metaDescription: "Docker interview prep for DevOps: scenario-based questions, clear answers, visual explanations, and the common gotchas interviewers love to ask."
faqs:
  - q: "What is the difference between a Docker image and a container?"
    a: "An image is a read-only template; a container is a running instance of an image with a writable layer. One image can produce many containers."
  - q: "How would you debug a container that keeps crashing or exiting immediately?"
    a: "Check docker logs <id>, inspect the exit code with docker ps -a, run it interactively with an overridden entrypoint, and verify the CMD/ENTRYPOINT, env vars, and mounted config."
  - q: "What is the difference between CMD and ENTRYPOINT?"
    a: "ENTRYPOINT defines the fixed executable; CMD supplies default arguments that are easy to override at run time. Combined, ENTRYPOINT is the command and CMD its default args."
  - q: "COPY vs ADD — which should you use?"
    a: "Prefer COPY for plain file copies. ADD additionally supports remote URLs and auto-extracts local tar archives, which can be surprising, so reserve it for those specific cases."
  - q: "How do you reduce the size of a Docker image?"
    a: "Use a slim/distroless base, multi-stage builds, a .dockerignore, fewer and cleaned-up RUN layers, and avoid shipping build tooling in the final image."
  - q: "Docker volume vs bind mount — which would you use in production?"
    a: "Named volumes in production for Docker-managed persistent data; bind mounts mainly in local development for live source code."
---

This guide is built for DevOps interview prep. It covers the ten core Docker topics that come up repeatedly — from why containers exist through to a production-grade troubleshooting playbook — using scenario-based questions, clear answers, worked examples, and the gotchas interviewers love to probe. Every command is real and runnable on Ubuntu 24.04 with a current Docker Engine. Before diving in, bookmark the [Docker roadmap](/learn/roadmaps/docker) to see how these topics fit into a full learning path.

Study the concepts first in [Docker for DevOps](/learn/guides/docker-for-devops).

---

## Why Containers Exist

**Interview scenario:** "You shipped a React app and it works on your machine but breaks in production. How do you explain what went wrong, and what's the architectural fix?"

Your laptop has Node 20, a specific OpenSSL version, certain environment variables, and a particular Ubuntu setup. The production server has Node 18, a different libc, and missing env vars. Same code, different behaviour. The bug is not in your code — it is in the *environment* around your code.

Traditionally, teams fixed this with long setup documents, install scripts, and "please match these exact versions" checklists. It never fully worked because the operating system, system libraries, and dependencies drifted between every developer's machine and every server. Containers solve this by packaging your app **together with its entire runtime environment** — the right Node version, libraries, files, and config — into one portable unit that runs identically everywhere.

> **Note:** Think of a shipping container. Before standardised containers, dock workers loaded ships piece by piece — barrels, boxes, sacks — and every port handled it differently, slowly, and unreliably. The steel shipping container changed the world: one standard box, the same shape everywhere, that any crane, truck, or ship can handle without caring what's inside. Docker does the same for software.

### Virtual Machines vs Containers

Before containers, the common way to isolate apps was the Virtual Machine (VM). A VM emulates an entire computer — including a full guest operating system — on top of a hypervisor. That gives strong isolation, but it is heavy: every VM carries its own multi-gigabyte OS.

Containers take a smarter approach. They **share the host's OS kernel** and only package the app plus its dependencies, making them tiny and fast.

**Architecture comparison:** In a VM setup, each application runs inside its own Guest OS on a Hypervisor, all sitting on Host OS + Hardware. Every VM is gigabytes in size. In a container setup, applications each have their own bins/libs but share a single Docker Engine on top of a shared Host OS Kernel. No guest OS means containers are megabytes, not gigabytes.

| Aspect | Virtual Machine | Container |
|--------|-----------------|-----------|
| Boot time | Minutes (full OS boot) | Seconds or less |
| Size | Gigabytes (includes guest OS) | Megabytes (app + deps only) |
| Isolation | Strong — full hardware-level isolation via hypervisor | Process-level isolation via kernel namespaces & cgroups |
| Resource use | Heavy — each VM runs its own OS | Lightweight — shares host kernel |
| OS kernel | Each VM has its own kernel | All containers share the host kernel |
| Portability | Portable but bulky to move | Highly portable — small images, run anywhere Docker runs |

> **Note:** A team running 10 microservices as VMs would need 10 guest operating systems eating ~20 GB of RAM with minutes to spin up. As containers on a single host, those same 10 services share one kernel, boot in seconds, and fit comfortably in a fraction of the memory.

### What Docker Actually Solves

Docker is not the same thing as "containers" — Linux had the underlying technology (namespaces and cgroups) for years. What Docker did was make containers **easy**: a simple way to define an environment (the Dockerfile), a standard format to package it (the image), a registry to share it (Docker Hub), and a clean CLI to run it. Consistency from laptop to CI to production, fast startup, and efficient resource use — that is the Docker promise.

> **Tip:** "What's the difference between a VM and a container?" gets asked in almost every DevOps interview. Nail the one-liner: *A VM virtualizes hardware and runs a full guest OS on a hypervisor; a container virtualizes the OS and shares the host kernel, packaging only the app and its dependencies.* Then add the consequences — containers are smaller, boot faster, and use fewer resources, while VMs give stronger isolation. Bonus points: they are complementary — you often run containers *inside* VMs in the cloud.

---

## Core Concepts: Images, Containers, Registry, and the Engine

### Images vs Containers

This is the single most important distinction in Docker, and it maps perfectly onto something any developer already knows: **class vs object**. An **image** is a read-only blueprint — like a class definition. A **container** is a running instance of that image — like an object created with `new`. From one image you can spin up many containers, just like one class can produce many objects, each with its own state.

> **Note:** An image is the recipe; a container is the actual dish you cooked from it. One recipe, many plates. The recipe never changes when you cook — and your image stays read-only while each container runs its own live copy.

| Aspect | Image | Container |
|--------|-------|-----------|
| What it is | Read-only template / blueprint | Running instance of an image |
| State | Immutable, static | Live, has writable layer & runtime state |
| Analogy | Class / recipe | Object / cooked dish |
| Lifecycle | Built once, stored, reused | Created, started, stopped, removed |
| Quantity | One image | Many containers from that one image |

<figure class="dgm" role="img" aria-label="One read-only image producing three independent running containers, each with its own writable layer">
<svg viewBox="0 0 680 220" width="680" height="220" xmlns="http://www.w3.org/2000/svg">
  <!-- Image box -->
  <rect x="20" y="70" width="160" height="80" rx="8" fill="none" stroke-width="2" class="dgm-accent-stroke"/>
  <rect x="20" y="70" width="160" height="80" rx="8" class="dgm-accent-soft"/>
  <text x="100" y="104" text-anchor="middle" font-size="13" font-weight="bold" class="dgm-ink">Docker Image</text>
  <text x="100" y="122" text-anchor="middle" font-size="10" class="dgm-muted">(read-only template)</text>
  <!-- Arrows -->
  <path d="M182 90 L240 60" fill="none" stroke-width="1.5" class="dgm-ink-stroke"/>
  <path d="M182 110 L240 110" fill="none" stroke-width="1.5" class="dgm-ink-stroke"/>
  <path d="M182 130 L240 160" fill="none" stroke-width="1.5" class="dgm-ink-stroke"/>
  <polygon points="240,56 232,62 238,68" class="dgm-ink"/>
  <polygon points="240,106 232,108 232,114" class="dgm-ink"/>
  <polygon points="240,156 232,154 236,162" class="dgm-ink"/>
  <!-- Container 1 -->
  <rect x="244" y="30" width="140" height="60" rx="6" fill="none" stroke-width="1.5" class="dgm-stroke"/>
  <rect x="244" y="30" width="140" height="60" rx="6" class="dgm-surface-2"/>
  <text x="314" y="57" text-anchor="middle" font-size="12" font-weight="bold" class="dgm-ink">Container 1</text>
  <rect x="256" y="66" width="116" height="14" rx="3" class="dgm-accent-soft"/>
  <text x="314" y="77" text-anchor="middle" font-size="9" class="dgm-muted">writable layer</text>
  <!-- Container 2 -->
  <rect x="244" y="80" width="140" height="60" rx="6" fill="none" stroke-width="1.5" class="dgm-stroke"/>
  <rect x="244" y="80" width="140" height="60" rx="6" class="dgm-surface-2"/>
  <text x="314" y="107" text-anchor="middle" font-size="12" font-weight="bold" class="dgm-ink">Container 2</text>
  <rect x="256" y="116" width="116" height="14" rx="3" class="dgm-accent-soft"/>
  <text x="314" y="127" text-anchor="middle" font-size="9" class="dgm-muted">writable layer</text>
  <!-- Container 3 -->
  <rect x="244" y="130" width="140" height="60" rx="6" fill="none" stroke-width="1.5" class="dgm-stroke"/>
  <rect x="244" y="130" width="140" height="60" rx="6" class="dgm-surface-2"/>
  <text x="314" y="157" text-anchor="middle" font-size="12" font-weight="bold" class="dgm-ink">Container 3</text>
  <rect x="256" y="166" width="116" height="14" rx="3" class="dgm-accent-soft"/>
  <text x="314" y="177" text-anchor="middle" font-size="9" class="dgm-muted">writable layer</text>
  <!-- Legend labels -->
  <text x="100" y="168" text-anchor="middle" font-size="10" class="dgm-muted">shared image layers</text>
  <text x="314" y="205" text-anchor="middle" font-size="10" class="dgm-muted">each container: isolated, running instance</text>
</svg>
<figcaption>One immutable image produces many independent containers, each adding its own ephemeral writable layer on top.</figcaption>
</figure>

### The Docker Engine Model

"Docker" is actually several pieces working together. Understanding this chain is valuable in interviews.

The flow is: **CLI Client** → (REST API) → **Docker Daemon (dockerd)** → (pull/push) → **Registry (Docker Hub / ECR)**

- **CLI Client** — the `docker` command you type. It is a thin client that sends requests to the daemon over a REST API (Unix socket). It does no container work itself.
- **Docker Daemon (dockerd)** — the background service that does the real work: building images, managing containers, networks, and volumes. It delegates container execution to containerd/runc.
- **Images** — read-only templates stored locally by the daemon. If a requested image is absent, the daemon pulls it from the registry. Each image is a stack of layers.
- **Containers** — running instances the daemon creates from images by adding a writable layer, then launching the process via containerd → runc with kernel namespaces and cgroups.
- **Registry** — remote image store (Docker Hub, ECR, GHCR). The daemon `pull`s images down when missing and `push`es built images up to share.

### Image Layers and the Union Filesystem

A Docker image is not one solid blob — it is built from **stacked layers**. Each instruction in a Dockerfile (install a package, copy files, set config) creates a new read-only layer on top of the previous one. Docker uses a **union filesystem** to merge these layers into a single view that the container sees as one normal filesystem.

Two big wins come from this:

1. **Caching** — if a layer hasn't changed, Docker reuses the cached version instead of rebuilding it, so builds are fast.
2. **Sharing** — if ten images all start `FROM ubuntu:24.04`, that base layer is stored on disk only once and shared between them.

When a container runs, Docker adds a thin **writable layer** on top — all runtime changes live there, and the underlying image layers stay untouched.

**Layer stack for a Node app (bottom to top):**

```
FROM node:20-alpine        ← base layer (read-only, cached)
COPY package.json ./       ← layer: package.json
RUN npm ci                 ← layer: node_modules (slow, cached when deps unchanged)
COPY . .                   ← layer: app source (changes often)
CMD ["node","server.js"]   ← metadata: start command
                           ← writable container layer (top, ephemeral)
```

When you change a layer, Docker must rebuild that layer **and every layer above it**. Layers below it stay cached. This is why dependencies go early and source goes last.

> **Tip:** Order your Dockerfile from least-changing to most-changing. Put `COPY package.json` and `npm install` *before* `COPY . .` — that way, changing your source code doesn't bust the cached dependency layer, and rebuilds stay fast.

### Registry and Docker Hub

A **registry** is a storage and distribution system for images — think of it as "GitHub for Docker images." **Docker Hub** is the default public registry, hosting official images like `nginx`, `node`, `postgres`, and `ubuntu`. You *pull* images down to run them and *push* your own images up to share them. Companies usually run private registries too (AWS ECR, GitHub Container Registry, Harbor) for internal images.

> **Note:** When you run `docker pull nginx`, Docker contacts Docker Hub, finds the official `nginx` image, and downloads it layer by layer. Each layer is pulled separately — and any layers already present from a previous pull are skipped. That is the layer-sharing system saving bandwidth and disk in real time.

```bash
docker run nginx
# CLI (client) ── REST API ──> dockerd (daemon)
#                                 │
#                  pulls image from registry if missing
#                                 │
#                              containerd ──> runc ──> container process
```

> **Tip:** "Walk me through what happens when you run `docker run nginx`." Strong answer: (1) the CLI sends the request to the Docker daemon via the API; (2) the daemon checks for the `nginx` image locally; (3) if missing, it pulls the image layers from the registry; (4) it creates a new container by stacking a writable layer on the image; (5) it hands off to containerd/runc, which sets up namespaces and cgroups; (6) the container's main process starts. Mentioning the client–daemon split and containerd/runc shows real depth.

---

## Essential Docker CLI

These are the commands you will type every single day. Each one below has a real example and a clear use case.

**Container lifecycle:** Created → Running → Stopped → Removed, driven by `docker create` → `docker start`/`run` → `docker stop` → `docker rm`.

### docker run — create and start a container

The workhorse. Key flags: `-d` (detached/background), `-p host:container` (publish a port), `--name` (friendly name), `-it` (interactive terminal), `--rm` (auto-delete on exit), `-e` (environment variable), `-v` (mount a volume).

```bash
docker run -d -p 8080:80 --name web nginx
```

Run nginx in the background, mapping host port 8080 to container port 80. Open `http://localhost:8080` to see it.

```bash
docker run -it --rm ubuntu:24.04 bash
```

Get an interactive shell inside a throwaway Ubuntu container that auto-deletes the moment you exit — perfect for quick experiments.

```bash
docker run -d --name db -e POSTGRES_PASSWORD=secret -v pgdata:/var/lib/postgresql/data -p 5432:5432 postgres:16
```

Run Postgres with an env var for the password and a named volume `pgdata` so your database survives even after the container is removed.

### docker ps — list containers

```bash
docker ps
docker ps -a
```

`docker ps` shows only running containers; `docker ps -a` shows all containers including stopped/exited ones — essential for debugging why something died.

### docker images — list local images

```bash
docker images
```

See every image stored locally, with its repository, tag, image ID, and size.

### docker pull — download an image

```bash
docker pull node:20-alpine
```

Grab a specific image from the registry ahead of time, so the first `docker run` doesn't have to wait on the download.

### docker exec — run a command in a running container

```bash
docker exec -it web bash
```

Jump inside a *running* container to inspect files, check config, or debug live. `-it` gives you an interactive shell. (If the image lacks bash, use `sh`.)

### docker logs — view container output

```bash
docker logs -f web
```

Stream the logs (stdout/stderr) of the `web` container live with `-f` (follow) — your go-to for watching what an app is doing in real time.

### docker stop / start — control lifecycle

```bash
docker stop web
docker start web
```

Gracefully stop a running container (it gets a chance to shut down cleanly) and later start it back up without recreating it.

### docker rm / rmi — remove containers and images

```bash
docker rm web
docker rmi nginx
```

`docker rm` deletes a stopped container; `docker rmi` deletes an image you no longer need to reclaim disk space.

### docker build — build an image from a Dockerfile

```bash
docker build -t myapp:1.0 .
```

Build an image named `myapp` tagged `1.0` from the Dockerfile in the current directory (the `.` is the build context).

### docker tag — give an image another name/tag

```bash
docker tag myapp:1.0 pushkar/myapp:1.0
```

Re-tag your local image with your Docker Hub username (and/or registry) so it's ready to push to the right repository.

### docker push — upload an image to a registry

```bash
docker login
docker push pushkar/myapp:1.0
```

After `docker login`, push your tagged image to Docker Hub so teammates or your servers can pull and run it.

### Quick Reference

| Command | What it does | Most-used form |
|---------|-------------|----------------|
| run | Create + start a container | `docker run -d -p 8080:80 --name web nginx` |
| ps | List containers | `docker ps -a` |
| images | List local images | `docker images` |
| pull | Download an image | `docker pull node:20-alpine` |
| exec | Run a command in a live container | `docker exec -it web bash` |
| logs | View container output | `docker logs -f web` |
| stop / start | Control a container's lifecycle | `docker stop web` |
| rm / rmi | Remove container / image | `docker rm web` · `docker rmi nginx` |
| build | Build image from Dockerfile | `docker build -t myapp:1.0 .` |
| tag | Re-name/tag an image | `docker tag myapp:1.0 pushkar/myapp:1.0` |
| push | Upload image to registry | `docker push pushkar/myapp:1.0` |

> **Tip:** `docker run` is really three steps in one: **pull** (if the image isn't local) + **create** (build the container from the image) + **start** (launch its main process). `docker create` + `docker start` do separately what `run` does together.

> **Caution:** `docker rm -f` kills and removes a running container with no graceful shutdown — fine for test junk, dangerous for anything with unsaved state. `docker system prune -a` deletes all stopped containers, unused networks, and *all* images not currently in use. Read what it's about to delete before you confirm.

> **Tip:** A classic gotcha: "What's the difference between `docker stop` and `docker kill`?" — `stop` sends `SIGTERM` first (graceful, with a grace period) then `SIGKILL`; `kill` sends `SIGKILL` immediately. Another favourite: "Difference between `EXPOSE` in a Dockerfile and `-p` at runtime?" — `EXPOSE` only documents the port; `-p` actually publishes it to the host.

---

## Dockerfile Deep-Dive

A Dockerfile is a recipe. Each line is one instruction that tells Docker how to assemble your image, layer by layer. Think of it like your build pipeline written as plain text: install the runtime, copy your code, install deps, define how the app starts.

> **Note:** A Dockerfile is a recipe card and the image is the prepped meal kit. The *container* is when you actually cook and eat it. You can build the kit once and cook it on a thousand machines, and it tastes identical every time.

### FROM — the base layer

Every Dockerfile starts with `FROM`. It sets the base image you build on top of. Pin a specific version tag; never rely on `latest` in production because it silently changes under you.

```dockerfile
FROM node:20-alpine
```

`node:20` is the version and `-alpine` is the variant (a tiny Linux distro, ~5 MB base).

### RUN — execute commands at build time

`RUN` runs a command *while building the image* and bakes the result into a new layer. Use it to install packages, create directories, or run build steps. Each `RUN` creates a layer, so chain related commands with `&&` to keep layer count down.

```dockerfile
RUN apk add --no-cache python3 make g++ \
 && npm install -g some-cli
```

### COPY — bring files into the image

`COPY` copies files/folders from your build context (your project directory) into the image. This is how your source code gets in.

```dockerfile
COPY package.json package-lock.json ./
COPY . .
```

### ADD — COPY's older, fancier cousin

`ADD` does everything `COPY` does, plus two extras: it can fetch a remote URL, and it auto-extracts local tar archives. Those extras make it less predictable, so the rule of thumb is: **use COPY unless you specifically need ADD's tar extraction**.

| Behaviour | COPY | ADD |
|-----------|------|-----|
| Copy local files/dirs | Yes | Yes |
| Auto-extract local `.tar` | No | Yes |
| Download from URL | No | Yes (discouraged) |
| Predictable / explicit | Yes | No (magic behaviour) |
| Recommended default | Use this | Only for tar extraction |

### WORKDIR — set the working directory

`WORKDIR` sets the current directory for every following instruction (`RUN`, `CMD`, `COPY`, etc.) and creates it if it doesn't exist. Always use it instead of `RUN cd /app` — `cd` doesn't persist across layers.

```dockerfile
WORKDIR /app
```

### CMD vs ENTRYPOINT — how the container starts

**Interview scenario:** "What's the difference between CMD and ENTRYPOINT?" This is a guaranteed question.

Both define what runs when the container starts, but they play different roles:

- **ENTRYPOINT** is the fixed command — the thing this container *is*. It needs `--entrypoint` to override at runtime.
- **CMD** provides default arguments (or a default command) that are *easily overridden* at `docker run` time. When both are present, CMD's values are appended as arguments to ENTRYPOINT.

**Exec form vs shell form:**

- **Exec form** (JSON array): `CMD ["node", "server.js"]` — runs the binary directly, no shell. This is the correct form: signals like `SIGTERM` reach your process so it can shut down cleanly.
- **Shell form**: `CMD node server.js` — wraps the command in `/bin/sh -c`. The shell becomes PID 1 and may swallow signals, so your app doesn't get the stop signal. Avoid for the main process.

```dockerfile
# They combine: final command = ENTRYPOINT + CMD
ENTRYPOINT ["node"]
CMD ["server.js"]
# docker run myimg            -> node server.js
# docker run myimg other.js   -> node other.js   (CMD overridden)
```

| Aspect | CMD | ENTRYPOINT |
|--------|-----|------------|
| Purpose | Default command / args | Fixed executable |
| Overridable at `docker run` | Yes — just pass new args | No (needs `--entrypoint` flag) |
| When both exist | Becomes arguments to ENTRYPOINT | Stays as the executable |
| Typical use | App that users may re-run with different args | Wrapper / tool where the binary is fixed |
| Can appear multiple times | Only last one wins | Only last one wins |

<figure class="dgm" role="img" aria-label="ENTRYPOINT provides the fixed executable while CMD supplies default overridable arguments, combining into the final container command">
<svg viewBox="0 0 680 180" width="680" height="180" xmlns="http://www.w3.org/2000/svg">
  <!-- ENTRYPOINT box -->
  <rect x="20" y="40" width="180" height="60" rx="8" fill="none" stroke-width="2" class="dgm-accent-stroke"/>
  <rect x="20" y="40" width="180" height="60" rx="8" class="dgm-accent-soft"/>
  <text x="110" y="66" text-anchor="middle" font-size="12" font-weight="bold" class="dgm-ink">ENTRYPOINT</text>
  <text x="110" y="84" text-anchor="middle" font-size="11" class="dgm-muted">["node"]</text>
  <text x="110" y="115" text-anchor="middle" font-size="9" class="dgm-muted">fixed — needs --entrypoint to override</text>
  <!-- CMD box -->
  <rect x="240" y="40" width="180" height="60" rx="8" fill="none" stroke-width="2" class="dgm-stroke"/>
  <rect x="240" y="40" width="180" height="60" rx="8" class="dgm-surface-2"/>
  <text x="330" y="66" text-anchor="middle" font-size="12" font-weight="bold" class="dgm-ink">CMD</text>
  <text x="330" y="84" text-anchor="middle" font-size="11" class="dgm-muted">["server.js"]</text>
  <text x="330" y="115" text-anchor="middle" font-size="9" class="dgm-muted">default args — easily overridden at run time</text>
  <!-- Plus sign -->
  <text x="225" y="76" text-anchor="middle" font-size="20" font-weight="bold" class="dgm-muted">+</text>
  <!-- Arrow -->
  <path d="M422 70 L462 70" fill="none" stroke-width="1.5" class="dgm-ink-stroke"/>
  <polygon points="462,65 472,70 462,75" class="dgm-ink"/>
  <!-- Result box -->
  <rect x="476" y="40" width="184" height="60" rx="8" fill="none" stroke-width="2" class="dgm-stroke"/>
  <rect x="476" y="40" width="184" height="60" rx="8" class="dgm-surface-2"/>
  <text x="568" y="63" text-anchor="middle" font-size="12" font-weight="bold" class="dgm-ink">Final command</text>
  <text x="568" y="81" text-anchor="middle" font-size="11" class="dgm-muted">node server.js</text>
  <text x="568" y="115" text-anchor="middle" font-size="9" class="dgm-muted">override CMD only: docker run img other.js</text>
</svg>
<figcaption>ENTRYPOINT locks in the executable; CMD provides the default arguments that a caller can replace without touching the entrypoint.</figcaption>
</figure>

### EXPOSE — document the port

`EXPOSE` documents which port the container listens on. It does **not** publish the port — it is metadata for humans and tools. You still need `docker run -p 3000:3000` to actually map it to the host.

```dockerfile
EXPOSE 3000
```

### ENV vs ARG — variables

`ENV` sets environment variables that persist *inside the running container* (your app can read them). `ARG` sets build-time variables that exist only *during the build* and are gone at runtime.

```dockerfile
ARG NODE_VERSION=20
ENV NODE_ENV=production
# Pass ARG at build: docker build --build-arg NODE_VERSION=20 .
```

| Aspect | ARG | ENV |
|--------|-----|-----|
| Available during build | Yes | Yes |
| Available in running container | No | Yes |
| Set from CLI | `--build-arg` | `-e` at run / Dockerfile |
| Good for | Versions, build flags | App config, NODE_ENV, ports |
| Visible in image history | Yes (don't put secrets) | Yes (don't put secrets) |

### Layer caching — why instruction order matters

Every instruction creates a cached layer. On rebuild, Docker reuses a layer if nothing it depends on changed. The moment one layer is invalidated, *every layer after it* is rebuilt too. The classic Node mistake is copying everything first and *then* installing dependencies — every source change forces `npm install` to re-run.

```dockerfile
# GOOD: deps cached separately from source
COPY package.json package-lock.json ./
RUN npm ci
COPY . .          # changes often, but npm ci layer stays cached
```

Put rarely-changing things (dependencies) early, frequently-changing things (source code) late.

### A realistic Node app Dockerfile

```dockerfile
FROM node:20-alpine

# 1. Set the working directory
WORKDIR /app

# 2. Copy only manifests first (cache-friendly)
COPY package.json package-lock.json ./

# 3. Install exact, reproducible deps
RUN npm ci

# 4. Now copy the rest of the source
COPY . .

# 5. Build the app (e.g. React / Vite / Next build)
RUN npm run build

# 6. Runtime config
ENV NODE_ENV=production
EXPOSE 3000

# 7. Fixed binary + default arg
ENTRYPOINT ["node"]
CMD ["dist/server.js"]
```

> **Tip:** Answer `CMD vs ENTRYPOINT` crisply: ENTRYPOINT is the fixed executable; CMD supplies default arguments the user can override at `docker run`. If both are set, CMD is appended to ENTRYPOINT. Mention that exec form (`["node","app.js"]`) is preferred so SIGTERM reaches your process for graceful shutdown. That last detail signals real experience.

> **Caution:** Cache invalidation cascades. If you `COPY . .` *before* `RUN npm ci`, then changing any source file busts the cache for the install layer and everything after — your dependencies reinstall on every build. Order from least-changing to most-changing.

> **Tip:** Use `npm ci` instead of `npm install` in Dockerfiles. It installs exactly what's in `package-lock.json`, fails if the lockfile is out of sync, and is faster and fully reproducible — exactly what you want for deterministic image builds.

---

## Multi-Stage Builds and Image Optimization

A naive image bundles your entire build toolchain — compilers, dev dependencies, source code — into the thing you ship to production. That is bloated and insecure. Multi-stage builds let you build in one stage and copy *only the finished artifact* into a clean, tiny final stage.

**Why image size matters in interviews:**

- **Security:** fewer packages = smaller attack surface. No compiler, no shell utilities, no dev deps for an attacker to exploit.
- **Speed:** smaller images pull and start faster — faster deploys, faster autoscaling, faster CI.
- **Cost:** less registry storage, less bandwidth, less disk on every node. At scale this is real money.

> **Note:** Shipping a single-stage image is like mailing someone a cake along with the entire kitchen — oven, mixer, flour bags and all. Multi-stage builds bake the cake in the kitchen, then ship *only the cake* in a small box.

### Multi-stage Dockerfile: React app served by nginx

Build the static bundle with Node, then throw away Node entirely and serve the files with a tiny nginx image.

```dockerfile
# ---- Stage 1: build ----
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build          # produces /app/dist (or /app/build)

# ---- Stage 2: serve ----
FROM nginx:1.27-alpine
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

The final image contains nginx and your static files only — no Node, no `node_modules`, no source. Typically tens of MB instead of hundreds.

### Multi-stage Dockerfile: Go binary on distroless

Go compiles to a single static binary, so the final stage needs almost nothing — perfect for distroless.

```dockerfile
# ---- Stage 1: build ----
FROM golang:1.22-alpine AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -o /app/server .

# ---- Stage 2: minimal runtime ----
FROM gcr.io/distroless/static-debian12
COPY --from=build /app/server /server
EXPOSE 8080
ENTRYPOINT ["/server"]
```

The result is often under 10 MB: just your binary plus minimal certs. No shell, no package manager — nothing for an attacker to pivot into.

### Optimization techniques

- **Small base images:** prefer `-alpine`, `-slim`, or distroless over full `ubuntu`/`debian`.
- **Multi-stage builds:** ship only the artifact, not the toolchain.
- **Combine RUN layers:** chain with `&&` and clean up in the same layer so the cleanup actually shrinks the image.
- **.dockerignore:** keep `node_modules`, `.git`, logs out of the build context — faster builds and no accidental bloat.
- **Order instructions:** least-changing first for cache hits.
- **Remove build deps:** uninstall compilers in the same `RUN`, or just leave them in the discarded build stage.
- **`--no-install-recommends`:** on Debian/Ubuntu, skip optional suggested packages.

```dockerfile
# Debian/Ubuntu: clean up in the SAME layer
RUN apt-get update \
 && apt-get install -y --no-install-recommends curl ca-certificates \
 && rm -rf /var/lib/apt/lists/*
```

A typical `.dockerignore`:

```
node_modules
.git
dist
build
*.log
.env
Dockerfile
.dockerignore
```

### Base image sizes

| Base image | Approx size | Has shell / pkg manager? | Best for |
|------------|-------------|--------------------------|----------|
| `ubuntu` | ~75 MB | Yes | Dev convenience, lots of tooling |
| `debian:slim` | ~30 MB | Yes | Balanced general-purpose runtime |
| `alpine` | ~5 MB | Yes (busybox + apk) | Small images, most languages |
| `distroless` | ~2–20 MB | No | Most secure production runtime |

> **Note:** Alpine is small but can cause issues with native modules due to musl libc. In those cases a `-slim` variant or a proper multi-stage build is a better fit.

### Before / after: the real win

```bash
$ docker images
REPOSITORY      TAG          SIZE
myapp           single       1.1GB     # node + source + node_modules
myapp           multistage   42MB      # nginx + static build only
```

> **Tip:** Distroless images contain your app and its runtime — and literally nothing else. No shell, no `apt`, no `ls`. That kills a whole class of attacks. The trade-off: you can't `docker exec` in to poke around, so debug locally or use the `:debug` variant. For compiled languages (Go, Rust) and even Java/Python, distroless is the gold-standard production base.

> **Tip:** "How would you reduce a Docker image's size?" Hit these in order: multi-stage build (biggest win), smaller base image (alpine/slim/distroless), `.dockerignore`, combine and clean up RUN layers in the same instruction, and remove dev/build dependencies from the final stage. Bonus: mention the security angle — smaller image = smaller attack surface.

> **Note:** A team shipped a React app as a single-stage Node image at 1.1 GB. Pulls on every deploy took minutes and autoscaling lagged. Switching to a multi-stage build (Node to build, nginx-alpine to serve) dropped it to ~42 MB — a 25x reduction. Deploys went from minutes to seconds.

---

## Data: Volumes vs Bind Mounts

Containers are **ephemeral**. The writable layer lives and dies with the container — `docker rm` the container and that data is gone forever. That is fine for a stateless frontend, but a disaster for a database. To persist data, or to share files between your host and a container, you mount storage from *outside* the container's lifecycle.

> **Note:** A container's own filesystem is like a hotel room — when you check out, housekeeping wipes everything. A **volume** is your bank locker: it stays safe no matter how many times you check in and out. A **bind mount** is like leaving a door open straight into your house — convenient, but the container can now mess with your real stuff.

**Visual model:**

- **Named volume** — container writes to `/var/lib/...` → Docker-managed storage at `/var/lib/docker/volumes/pgdata`. Portable, survives container removal, best for DB data.
- **Bind mount** — container writes to `/app` → a specific host folder you pick (e.g. `/home/user/project`). Best for live dev where you want host edits visible instantly.

### The three mount types

- **Named volume:** Docker-managed storage living under `/var/lib/docker/volumes/`. Docker owns it; you reference it by name. Best for persistent app data like databases.
- **Bind mount:** maps a specific host path straight into the container. You control the exact location. Best for local development (live code).
- **tmpfs:** stored in host RAM only, never written to disk. Vanishes on stop. Best for secrets or scratch data you never want persisted.

| Aspect | Named volume | Bind mount | tmpfs |
|--------|-------------|------------|-------|
| Location | `/var/lib/docker/volumes/` | Any host path you pick | Host RAM |
| Managed by | Docker | You | Docker (memory) |
| Use case | DB / persistent data | Live dev, config files | Secrets, scratch |
| Portability | High (Docker-native) | Low (host-path dependent) | N/A (ephemeral) |
| Performance on Mac/Win | Fast (in VM) | Slower (host↔VM sync) | Fast (RAM) |
| Survives container rm | Yes | Yes (it's on host) | No |

<figure class="dgm" role="img" aria-label="Named volume managed by Docker on the left and a bind mount pointing to a specific host path on the right, both feeding into the same container">
<svg viewBox="0 0 680 230" width="680" height="230" xmlns="http://www.w3.org/2000/svg">
  <!-- Container (center) -->
  <rect x="260" y="80" width="160" height="70" rx="8" fill="none" stroke-width="2" class="dgm-stroke"/>
  <rect x="260" y="80" width="160" height="70" rx="8" class="dgm-surface-2"/>
  <text x="340" y="110" text-anchor="middle" font-size="13" font-weight="bold" class="dgm-ink">Container</text>
  <text x="340" y="130" text-anchor="middle" font-size="10" class="dgm-muted">/var/lib/postgresql/data</text>
  <text x="280" y="162" text-anchor="middle" font-size="9" class="dgm-muted">/app (bind)</text>
  <!-- Named volume (left) -->
  <rect x="20" y="60" width="170" height="70" rx="8" fill="none" stroke-width="2" class="dgm-accent-stroke"/>
  <rect x="20" y="60" width="170" height="70" rx="8" class="dgm-accent-soft"/>
  <text x="105" y="86" text-anchor="middle" font-size="12" font-weight="bold" class="dgm-ink">Named Volume</text>
  <text x="105" y="103" text-anchor="middle" font-size="10" class="dgm-muted">pgdata</text>
  <text x="105" y="119" text-anchor="middle" font-size="9" class="dgm-muted">Docker-managed storage</text>
  <text x="105" y="148" text-anchor="middle" font-size="9" class="dgm-muted">/var/lib/docker/volumes/pgdata</text>
  <!-- Named volume arrow -->
  <path d="M192 96 L258 105" fill="none" stroke-width="1.5" class="dgm-ink-stroke"/>
  <polygon points="258,100 252,107 264,110" class="dgm-ink"/>
  <!-- Bind mount (right) -->
  <rect x="490" y="60" width="170" height="70" rx="8" fill="none" stroke-width="2" class="dgm-stroke"/>
  <rect x="490" y="60" width="170" height="70" rx="8" class="dgm-surface-2"/>
  <text x="575" y="86" text-anchor="middle" font-size="12" font-weight="bold" class="dgm-ink">Bind Mount</text>
  <text x="575" y="103" text-anchor="middle" font-size="10" class="dgm-muted">/home/user/project</text>
  <text x="575" y="119" text-anchor="middle" font-size="9" class="dgm-muted">host path you control</text>
  <text x="575" y="148" text-anchor="middle" font-size="9" class="dgm-muted">live edits visible instantly</text>
  <!-- Bind mount arrow -->
  <path d="M488 96 L422 112" fill="none" stroke-width="1.5" class="dgm-ink-stroke"/>
  <polygon points="422,107 428,114 416,116" class="dgm-ink"/>
  <!-- Labels below -->
  <text x="105" y="175" text-anchor="middle" font-size="10" class="dgm-muted">production DB data</text>
  <text x="575" y="175" text-anchor="middle" font-size="10" class="dgm-muted">local development source</text>
</svg>
<figcaption>Named volumes are Docker-managed and portable (best for production data); bind mounts expose a specific host directory (best for local development).</figcaption>
</figure>

> **Note:** On Mac/Windows, Docker runs inside a Linux VM, so bind mounts involve syncing between host and VM on every file change — hence the slowdown. Named volumes live entirely inside the VM and are therefore fast.

### Managing named volumes

```bash
docker volume create pgdata          # create
docker volume ls                     # list
docker volume inspect pgdata         # see mountpoint, driver
docker volume rm pgdata              # delete
docker volume prune                  # remove all unused volumes
```

### Two mount syntaxes: -v vs --mount

The short `-v` form is compact; the verbose `--mount` form is explicit and self-documenting (preferred in scripts).

```bash
# -v form: source:target[:options]
docker run -v pgdata:/var/lib/postgresql/data postgres:16

# --mount form: explicit key=value
docker run --mount type=volume,source=pgdata,target=/var/lib/postgresql/data postgres:16
```

### Bind mount for live development (hot reload)

Mount your source code into the container so changes on your host instantly reflect inside — the dev server hot-reloads as you edit.

```bash
docker run -it --rm \
  -p 5173:5173 \
  -v "$(pwd)":/app \
  -v /app/node_modules \
  -w /app \
  node:20-alpine npm run dev
```

The second `-v /app/node_modules` is an anonymous volume that *shields* the container's installed `node_modules` from being clobbered by the host bind mount — a very common gotcha.

### Named volume for Postgres data

```bash
docker run -d \
  --name pg \
  -e POSTGRES_PASSWORD=secret \
  -v pgdata:/var/lib/postgresql/data \
  postgres:16
```

`docker rm -f pg` destroys the container but `pgdata` survives. Start a new Postgres container against the same volume and all your tables are still there.

### When to use which

- **Named volume** → production data that must persist: databases, uploads, caches.
- **Bind mount** → local dev where you want host edits live in the container, or injecting a config file.
- **tmpfs** → sensitive or throwaway data that should never touch disk.

> **Caution:** A bind mount *overlays* the target directory — it hides whatever the image had there. If you bind-mount your source over `/app` and the image baked `node_modules` into `/app/node_modules`, your mount hides them and the app breaks (hence the anonymous-volume trick above). Also watch file permissions: a process running as a non-root UID inside the container may not be able to write to a host directory owned by a different user.

> **Tip:** "Where does a named volume's data actually live?" Answer: on the Docker host under `/var/lib/docker/volumes/<name>/_data`, managed by Docker — not inside the container. On Mac/Windows it's inside the Docker Desktop Linux VM, which is why you can't `cd` to it from your Mac terminal. Knowing this distinction (host vs container vs VM) shows you actually understand the storage model.

---

## Docker Networking

Every container needs to talk to something — the host, the internet, or another container. Docker handles this through **network drivers**. When you install Docker on Ubuntu 24.04, three networks already exist out of the box: `bridge`, `host`, and `none`.

> **Note:** Think of a Docker network like the wiring in an apartment building. `bridge` is the building's internal intercom — flats can call each other through a switchboard, and the building has one main door (the host) to the outside world. `host` means the flat has no walls at all and shares the building's street address directly. `none` is a sealed room — no phone, no door, total isolation.

**Container-to-container on a user-defined bridge:** On a user-defined network, Docker's embedded DNS lets containers reach each other by name. Only the API container needs a published port (`-p 3000:3000`) so the browser can reach it. The `db` and `cache` containers are never published to the host — secure by default.

### The three default networks

| Driver | Isolation | Use Case | Performance | Port Mapping |
|--------|-----------|----------|-------------|--------------|
| **bridge** (default) | Containers get private IPs on a virtual subnet; isolated from host network namespace. | The normal default for single-host apps. | Slight overhead from NAT + virtual bridge, negligible for most workloads. | Required. You must `-p` to reach a container from outside. |
| **host** | None. Container shares the host's network namespace directly. | Max network performance, or when you need the container on the host's real IP. | Fastest — no NAT, no bridge, no virtual layer. | Ignored. `-p` does nothing; the container binds host ports directly. |
| **none** | Total. Only a loopback interface; no external connectivity. | Security-sensitive batch jobs, or you wire up custom networking yourself. | N/A — no traffic flows. | N/A — nothing to publish. |

### Port mapping deep dive

A container on a bridge network lives on a private subnet (commonly `172.17.0.0/16`). The flag `-p hostPort:containerPort` tells Docker to take traffic arriving on that host port and forward it (via iptables DNAT rules) into the container's port. Read it as **outside:inside** — the left number is what you type in the browser; the right number is what the app listens on inside the container.

```bash
# Map host port 8080 -> container port 80
docker run -d -p 8080:80 --name web nginx

# Now the host can reach the container:
curl http://localhost:8080

# Map only on loopback (NOT exposed to the LAN):
docker run -d -p 127.0.0.1:8080:80 --name web-local nginx

# Let Docker pick a random free host port:
docker run -d -p 80 --name web-rand nginx
docker port web-rand   # shows which host port was assigned
```

### Container-to-container communication — the key part

**Interview scenario:** "Why can't my two containers talk by name?"

On the **default** bridge network, containers can reach each other by IP address, but there is **no automatic DNS** — you cannot ping or curl another container by its name. On a **user-defined** bridge network, Docker runs an embedded DNS server and containers resolve each other **by container name automatically**.

This is the root cause of 90% of "my app can't connect to my db" bugs.

> **Tip:** Almost never use the default bridge for multi-container apps. Always `docker network create` a user-defined bridge (or let Docker Compose make one for you — it does this automatically). You get free DNS by container name, better isolation, and you can attach/detach containers on the fly.

```bash
# 1. Create a user-defined bridge network
docker network create appnet

# List networks (you'll see appnet alongside bridge/host/none)
docker network ls

# Inspect it: subnet, gateway, connected containers
docker network inspect appnet

# 2. Run a db container ON that network
docker run -d --name db --network appnet \
  -e POSTGRES_PASSWORD=secret postgres:16

# 3. Run a client container on the SAME network
docker run -it --rm --name client --network appnet alpine sh

# Inside the client shell — resolve 'db' by NAME, no IP needed:
#   apk add --no-cache curl
#   ping db
#   nc -zv db 5432          # TCP connect to postgres by name

# Attach an already-running container to a network later:
docker network connect appnet web
```

> **Tip:** "bridge vs host?" — bridge isolates the container on its own subnet and needs `-p` port publishing + NAT to be reached; host removes that isolation, the container uses the host's network stack directly (no `-p`, fastest, but port conflicts and less isolation). "Why can't my two containers talk by name on the default bridge?" — because the default bridge has no embedded DNS; name resolution only works on user-defined networks. Fix: create a user-defined bridge and run both containers on it (or use Compose).

> **Caution:** When you write `-p 8080:80`, Docker binds `0.0.0.0:8080` by default — meaning the port is exposed on *every* network interface, including your public/LAN IP, not just localhost. On a cloud VM with a public IP, that database or admin panel is now reachable from the internet. Bind to `127.0.0.1` (e.g. `-p 127.0.0.1:8080:80`) for local-only access. Docker's iptables rules can also bypass a UFW firewall — don't assume UFW alone protects published ports.

---

## Docker Compose

Running one container with a long `docker run` command is fine. But a real app is a *web frontend + an API + a database + a cache*, each needing its own ports, volumes, env vars, and a shared network. Typing four `docker run` commands in the right order, every time, is painful and error-prone. **Docker Compose** solves this: you declare your entire multi-container stack in one YAML file and bring it all up with a single command. Use this with the [Docker run → Compose converter](/docker-run-to-compose) to translate existing `docker run` commands into Compose services quickly.

> **Note:** If `docker run` is cooking one dish, Compose is the full recipe card for a thali — it lists every dish (service), the ingredients (image, env, volumes), and the order to serve them (depends_on). One command and the whole meal arrives, plated the same way every single time.

**Compose stack layout:** A single `docker compose up` creates the network, the volume, and all three services. The `api` service builds from a local Dockerfile; `db` uses a named volume for persistence; all three are wired by service name via Compose's built-in DNS.

### "docker compose" vs "docker-compose"

Old Compose was a separate Python tool invoked as `docker-compose` (with a hyphen). Modern Compose is a **v2 plugin** built into the Docker CLI, invoked as `docker compose` (a space, no hyphen). On Ubuntu 24.04 with current Docker, use **`docker compose`**. The hyphenated command is legacy and deprecated. Also note: the top-level `version:` key is now obsolete and can be omitted.

### Anatomy of a Compose file

| Key | What it does |
|-----|-------------|
| `image` | Pull a prebuilt image (e.g. `postgres:16`). |
| `build` | Build from a local Dockerfile instead of pulling. |
| `ports` | Publish ports to the host — `"host:container"`. |
| `volumes` | Mount named volumes or host paths for persistent data. |
| `environment` | Set env vars inside the container. |
| `depends_on` | Control start order (and optionally wait for health). |
| `networks` | Attach the service to one or more networks. |
| `healthcheck` | Define how Docker tests if the service is actually ready. |

### A full, realistic compose.yaml

A Node API built from a local Dockerfile, a Postgres database with a named volume, and a Redis cache — all on a shared network. The API waits for Postgres to be *healthy*, not just started.

```yaml
services:
  api:
    build: ./api                 # builds from ./api/Dockerfile
    ports:
      - "3000:3000"
    environment:
      DB_HOST: db                # resolves by service name (Compose DNS)
      DB_PORT: 5432
      DB_USER: appuser
      DB_PASSWORD: ${DB_PASSWORD}    # pulled from .env file
      REDIS_URL: redis://cache:6379
    depends_on:
      db:
        condition: service_healthy   # wait until db healthcheck passes
      cache:
        condition: service_started
    networks:
      - appnet
    restart: unless-stopped

  db:
    image: postgres:16
    environment:
      POSTGRES_USER: appuser
      POSTGRES_PASSWORD: ${DB_PASSWORD}
      POSTGRES_DB: appdb
    volumes:
      - pgdata:/var/lib/postgresql/data   # named volume = data survives restarts
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U appuser -d appdb"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 10s
    networks:
      - appnet
    restart: unless-stopped

  cache:
    image: redis:7-alpine
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 3s
      retries: 5
    networks:
      - appnet
    restart: unless-stopped

volumes:
  pgdata:                        # Docker-managed named volume

networks:
  appnet:                        # user-defined bridge -> DNS by service name
```

Because every service is on `appnet`, the API reaches the database at hostname `db` and Redis at `cache` — the service names *are* the hostnames, thanks to Compose's user-defined network (exactly the DNS behaviour covered in the networking section).

### Key commands

```bash
docker compose up -d          # build (if needed) + start all, detached
docker compose ps             # list services in this project + their state
docker compose logs -f        # tail combined logs from all services
docker compose logs -f api    # tail just one service
docker compose build          # (re)build images that use 'build:'
docker compose exec api sh    # open a shell inside the running api container
docker compose down           # stop + remove containers and the network
docker compose down -v        # ALSO delete named volumes (wipes db data!)
```

### depends_on vs healthcheck — the trap

**Interview scenario:** "Does `depends_on` wait for a service to be ready?"

A plain `depends_on: [db]` only controls **start order**. Compose will start `db` *before* `api` — but "started" just means the container process launched, **not** that Postgres is accepting connections. Databases take a few seconds to initialise, so your API can crash on boot trying to connect to a not-yet-ready DB.

For readiness, add a `healthcheck` to the dependency service and use `condition: service_healthy` in the dependent service — only then does Compose wait.

> **Tip:** Keep secrets and environment-specific values out of the compose file. Put them in a `.env` file (auto-loaded by Compose for `${VAR}` substitution) and add `.env` to `.gitignore`. For per-environment tweaks, use a `compose.override.yaml` (auto-merged in dev) or `docker compose -f compose.yaml -f compose.prod.yaml up` to layer a production config on top. Use the [.env Example Checker](/env-example-checker) to validate that your `.env.example` stays in sync with your actual `.env` keys.

> **Note:** A new dev joining a team, instead of working through a half-day setup doc, can clone the repo, copy `.env.example` to `.env`, and run `docker compose up -d`. Sixty seconds later the API, database, and cache are running and wired together identically to every other machine — including CI.

> **Tip:** Expect: "What does Compose actually do for you?" — declarative multi-container orchestration on a *single host*: networks, volumes, env, and start order in one file. Be ready for "Does depends_on wait for the service to be ready?" — No, only start order; for readiness add a healthcheck + `condition: service_healthy`. Note the scope: Compose is single-host; for multi-host/cluster orchestration you move to Kubernetes — see [Kubernetes for DevOps](/learn/guides/kubernetes-for-devops) for a full introduction. See also the [Kubernetes Resource Calculator](/kubernetes-resource-calculator) when you are ready to plan resource requests for a containerised workload running in a cluster. Mentioning this boundary shows you understand where Compose stops.

> **Caution:** `docker compose down -v` deletes named volumes — that `pgdata` volume holding your database goes with it. Great for a clean dev reset, catastrophic on anything you care about. Plain `docker compose down` (no `-v`) keeps volumes. Build the muscle memory now, before you run it on the wrong project.

---

## Best Practices and Security

A container that *works* and a container that is *production-ready* are different things. This section is the checklist that separates "it runs on my machine" from "it's safe to ship." Most of it shows up in DevOps interviews too — security questions are nearly guaranteed.

### Run as non-root

By default, processes in a container run as **root** (UID 0). If an attacker breaks out of the app, they are root inside the container — and a container root maps to host root in several breakout scenarios. The fix is the `USER` instruction: create an unprivileged user and switch to it before the app runs. This is the single highest-impact security change you can make.

```dockerfile
FROM node:20-slim

WORKDIR /app

# Install deps as root (needs write to /app)
COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

# Create a non-root user and hand over ownership
RUN useradd --system --uid 10001 --no-create-home appuser \
 && chown -R appuser:appuser /app

# Everything from here runs as appuser, not root
USER appuser

EXPOSE 3000
CMD ["node", "server.js"]
```

### .dockerignore

Just like `.gitignore`, a `.dockerignore` file tells the build to skip files when sending the build context to the daemon. This makes builds faster, images smaller, and — critically — stops secrets and junk from being copied in by a broad `COPY . .`.

```
# .dockerignore
node_modules
npm-debug.log
.git
.gitignore
.env
.env.*
*.md
Dockerfile
.dockerignore
dist
coverage
.vscode
.DS_Store
```

Excluding `node_modules` forces a clean `npm ci` inside the image (no host-OS native modules leaking in), and excluding `.env` / `.git` prevents secrets and history from ever entering the image.

### Don't bake secrets into images

**Interview scenario:** "How do you handle secrets in Docker?"

Anything you put in an `ENV` instruction or pass as a build `ARG` is baked into an image layer — and image layers are **readable by anyone with the image**. `docker history` dumps them right out.

```bash
# An attacker (or teammate) with your image can read baked-in values:
docker history --no-trunc your-image:tag

# WRONG — secret is now permanently in a layer:
#   ENV API_KEY=sk_live_abcd1234
#   ARG DB_PASSWORD   (visible in history even if "removed" later)
```

Instead, inject secrets at **runtime**, never at build time:

```bash
# Runtime env (not in the image, but visible via 'docker inspect'):
docker run -e API_KEY="$API_KEY" myapp

# Better: file-based secrets (Compose/Swarm) mounted at /run/secrets/...
# Best: an external secrets manager (Vault, AWS Secrets Manager,
#       SSM Parameter Store) fetched by the app at startup.
```

### Image scanning

Your base image and dependencies carry known vulnerabilities (CVEs). Scan before you ship, and re-scan regularly — new CVEs are disclosed against old images all the time.

```bash
# Docker Scout (built into modern Docker Desktop / CLI)
docker scout cves your-image:tag
docker scout quickview your-image:tag

# Trivy (popular open-source scanner) on Ubuntu 24.04
trivy image your-image:tag
trivy image --severity HIGH,CRITICAL your-image:tag
```

### Hardening checklist

| Do | Don't |
|----|-------|
| Pin base images by version *and* digest: `node:20-slim@sha256:…` | Use `:latest` — it silently changes under you. |
| Use minimal images (`-slim`, `alpine`, `distroless`) — smaller attack surface. | Ship a full `ubuntu` base with compilers and shells you don't need. |
| Run as a non-root `USER`. | Run the app as root. |
| Drop Linux capabilities: `--cap-drop ALL`, add back only what's needed. | Run with default (or `--privileged`) capabilities. |
| Run read-only where possible: `--read-only` + `--tmpfs /tmp`. | Leave the whole filesystem writable. |
| Add a `HEALTHCHECK` so orchestrators know real readiness. | Assume "process running" means "service healthy." |
| Inject secrets at runtime via env files / secrets managers. | Bake secrets into `ENV`/`ARG` layers. |
| Use multi-stage builds to keep build tools out of the final image. | Ship the entire build toolchain in production. |

```bash
# Least-privilege runtime: drop all caps, read-only root fs, writable /tmp
docker run -d \
  --cap-drop ALL \
  --read-only \
  --tmpfs /tmp \
  --name myapp myapp:1.0
```

```dockerfile
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1
```

> **Caution:** Secrets in image layers are **permanent and readable by anyone with the image**. Deleting the `ENV` line in a later layer does NOT remove it — the earlier layer still contains it, and `docker history --no-trunc` reveals it. If you ever accidentally bake a real credential into an image and push it, treat that credential as *compromised*: rotate it immediately. You can't "edit it out" of a published image.

> **Tip:** Container security questions cluster around a few themes: (1) run as non-root (`USER`); (2) minimal/pinned base images to shrink attack surface; (3) never bake secrets into layers (explain `docker history`); (4) scan images for CVEs (Scout/Trivy) in CI; (5) least privilege at runtime — drop capabilities, read-only fs, no `--privileged`. Bonus: the container shares the host kernel, so a kernel exploit can escape — keep the host patched and consider extra isolation (gVisor, rootless Docker).

> **Tip:** Bake scanning into CI as a gate: fail the pipeline on `HIGH`/`CRITICAL` CVEs (`trivy image --exit-code 1 --severity HIGH,CRITICAL`). Combined with pinned base digests, this means an image can't silently drift into a vulnerable state between builds.

> **Note:** A fintech team shipped a Node image with `ENV STRIPE_KEY=sk_live_…` baked in "temporarily." The image was pushed to a registry a contractor could pull. Months later, during an audit, `docker history` surfaced the live key sitting in a layer. They had to rotate the Stripe key, invalidate the image across every environment, and add a CI secret-scanner — a week of cleanup that one runtime `-e` flag (or a secrets manager) would have prevented entirely.

---

## Troubleshooting Playbook

Think of this like a diagnostic chart: a container presents a **symptom**, you run a **diagnose command** to confirm the **cause**, then you apply the **fix**. You see a blank screen (symptom), open DevTools console (diagnose), spot the error (cause), patch the code (fix). Containers are no different — the tools just have different names.

90% of Docker problems are solved by three commands run in order: see what state the container is in (`docker ps -a`), read what it logged before dying (`docker logs`), then either inspect its config or jump inside it (`docker inspect` / `docker exec -it`). Master this loop and you will look like a wizard in interviews.

### Symptom → Diagnose → Fix chart

| Symptom | Diagnose (command) | Likely Cause | Fix |
|---------|-------------------|--------------|-----|
| Container won't start / stuck in `Created` or `Restarting` | `docker ps -a` then `docker logs <name>` | Bad entrypoint, missing config/env, app crashes on boot, or a restart loop | Read logs, fix the underlying error, rebuild and re-run |
| Container exits immediately (`Exited (0)`) | `docker ps -a` + `docker logs <name>` | No long-running foreground process; `CMD` finished and nothing kept PID 1 alive | Run a process that stays in the foreground (e.g. `node server.js`); don't background your main process |
| Exits with non-zero code (`Exited (1)`, `Exited (127)`) | `docker logs <name>` | App threw on startup; `127` usually means "command not found" | Fix the app error; for `127`, verify the binary exists and the `CMD` path is correct |
| Image is huge (1GB+ for a small app) | `docker images` and `docker history <image>` | Full base image, build tools shipped, no `.dockerignore`, dev deps baked in | Multi-stage build, slim/alpine base, add `.dockerignore`, combine `RUN` layers |
| `port is already allocated` | `docker ps` then `sudo lsof -i :3000` (or `ss -ltnp \| grep 3000`) | Another container or host process is bound to that port | Stop the other process, or map a different host port: `-p 3001:3000` |
| `permission denied` on a bind-mounted folder | `docker exec -it <name> ls -ln /path` and `id` inside | UID/GID inside container ≠ host file owner; or SELinux/AppArmor | `--user $(id -u):$(id -g)`, `chown` the host dir, or add `:z`/`:Z` on SELinux |
| Container A can't reach B by name | `docker network inspect bridge`; `docker exec -it A ping B` | Both on the **default** `bridge`, which has no DNS by name | Create a user-defined bridge and attach both: `docker network create appnet` + `--network appnet` |
| `no space left on device` | `docker system df` and `df -h` | Dangling images, stopped containers, unused volumes, build cache eating disk | `docker system prune -af` (add `--volumes` only if sure) |
| Cannot pull (`denied`, `unauthorized`, `toomanyrequests`) | Read the exact error from `docker pull <image>` | Not logged in, wrong tag, or Docker Hub anonymous rate limit | `docker login`; fix the tag; for rate limits, authenticate or wait |
| Code changes not reflecting after rebuild | `docker build` output (watch for `CACHED`) | Cached layer reused; or running an old image/container | Rebuild with `--no-cache`, re-tag and re-run; in dev, bind-mount source |
| Env var not set inside the container | `docker exec -it <name> env` or `docker inspect` | `-e`/`--env-file` not passed, or it's build-time `ARG` not runtime `ENV` | Pass `-e KEY=value` or `--env-file .env`; don't confuse `ARG` with `ENV` |

### The general debugging workflow

```bash
# 1. What is the state? (running, exited, restarting — and the exit code)
docker ps -a

# 2. What did it say before it died? (your single most useful command)
docker logs <container_name_or_id>
docker logs -f <container>          # follow live, like tail -f
docker logs --tail 50 <container>   # last 50 lines only

# 3. How is it configured? (env, mounts, network, IP, command)
docker inspect <container>
docker inspect -f '{{.State.ExitCode}}' <container>   # just the exit code

# 4. Get a shell inside a RUNNING container and poke around
docker exec -it <container> sh     # or 'bash' if the image has it
```

<figure class="dgm" role="img" aria-label="Crash-debug flow: docker ps -a reveals exit code, docker logs shows the error, run interactive overrides entrypoint for live inspection, then fix and rebuild">
<svg viewBox="0 0 680 290" width="680" height="290" xmlns="http://www.w3.org/2000/svg">
  <!-- Step 1: docker ps -a -->
  <rect x="220" y="10" width="240" height="50" rx="8" fill="none" stroke-width="2" class="dgm-accent-stroke"/>
  <rect x="220" y="10" width="240" height="50" rx="8" class="dgm-accent-soft"/>
  <text x="340" y="32" text-anchor="middle" font-size="12" font-weight="bold" class="dgm-ink">docker ps -a</text>
  <text x="340" y="50" text-anchor="middle" font-size="10" class="dgm-muted">check exit code (0=clean, 1+=crash)</text>
  <!-- Arrow -->
  <path d="M340 62 L340 88" fill="none" stroke-width="1.5" class="dgm-ink-stroke"/>
  <polygon points="335,88 340,96 345,88" class="dgm-ink"/>
  <!-- Step 2: docker logs -->
  <rect x="220" y="98" width="240" height="50" rx="8" fill="none" stroke-width="2" class="dgm-stroke"/>
  <rect x="220" y="98" width="240" height="50" rx="8" class="dgm-surface-2"/>
  <text x="340" y="120" text-anchor="middle" font-size="12" font-weight="bold" class="dgm-ink">docker logs</text>
  <text x="340" y="138" text-anchor="middle" font-size="10" class="dgm-muted">read stdout/stderr for error message</text>
  <!-- Arrow -->
  <path d="M340 150 L340 176" fill="none" stroke-width="1.5" class="dgm-ink-stroke"/>
  <polygon points="335,176 340,184 345,176" class="dgm-ink"/>
  <!-- Step 3: run interactive -->
  <rect x="220" y="186" width="240" height="50" rx="8" fill="none" stroke-width="2" class="dgm-stroke"/>
  <rect x="220" y="186" width="240" height="50" rx="8" class="dgm-surface-2"/>
  <text x="340" y="208" text-anchor="middle" font-size="11" font-weight="bold" class="dgm-ink">docker run --entrypoint sh</text>
  <text x="340" y="226" text-anchor="middle" font-size="10" class="dgm-muted">interactive shell to reproduce error live</text>
  <!-- Arrow -->
  <path d="M340 238 L340 262" fill="none" stroke-width="1.5" class="dgm-ink-stroke"/>
  <polygon points="335,262 340,270 345,262" class="dgm-ink"/>
  <!-- Step 4: fix -->
  <rect x="220" y="272" width="240" height="12" rx="4" class="dgm-accent-soft"/>
  <text x="340" y="282" text-anchor="middle" font-size="10" font-weight="bold" class="dgm-ink">fix code / config → rebuild image</text>
</svg>
<figcaption>Four-step crash-debug loop: check state, read logs, reproduce interactively, then fix and rebuild.</figcaption>
</figure>

> **Tip:** A classic question is "a container starts and immediately stops, how do you debug it?" The winning answer names the loop: `docker ps -a` to confirm it exited and see the code, `docker logs` to read the error, then explain the most common cause — there was no long-running foreground process keeping PID 1 alive, or the app crashed on startup. If you can't `exec` into it (because it already exited), mention you can override the entrypoint to debug: `docker run -it --entrypoint sh <image>`.

### Deep dive: container exits immediately

This is the #1 beginner trap and the #1 interview question. A container lives only as long as its main process (PID 1) runs. The moment that process exits, the container exits. It is like running `npm run build` and expecting a dev server to stay up — build finishes, process ends, done. You needed `npm start` (a long-running server) instead.

```bash
# Confirm it exited and check the code
docker ps -a
# "Exited (0)" = process finished cleanly, nothing to keep it alive
# "Exited (1)" or higher = app crashed; read the logs

docker logs <container>

# Can't exec because it already died? Override the entrypoint to get a shell:
docker run -it --entrypoint sh myimage
# Now run your CMD by hand and watch it fail in real time
```

```dockerfile
# WRONG — the & backgrounds it, CMD returns instantly, container dies
CMD node server.js &

# RIGHT — runs in the foreground, holds the container open
CMD ["node", "server.js"]
```

### Deep dive: port is already allocated

```bash
# Find who is holding host port 3000
docker ps                         # is another container mapping :3000?
sudo lsof -i :3000                # any host process on it?
ss -ltnp | grep :3000             # alternative on Ubuntu 24.04

# Fix A: stop the offender
docker stop <other_container>

# Fix B: just map to a free host port (left = host, right = container)
docker run -d -p 3001:3000 myimage
# App still listens on 3000 inside; you reach it at http://localhost:3001
```

### Deep dive: image too big

```bash
# See sizes and which layers are fat
docker images
docker history <image>     # shows size added per layer
```

```dockerfile
# Multi-stage: build stage has all the tooling, final stage is slim
FROM node:20 AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-slim AS runtime
WORKDIR /app
COPY --from=build /app/dist ./dist
COPY package*.json ./
RUN npm ci --omit=dev
CMD ["node", "dist/server.js"]
```

### Deep dive: no space left on device

```bash
# See the breakdown: images, containers, volumes, build cache
docker system df
docker system df -v        # verbose, per-item

# Reclaim everything unused (stopped containers, dangling/unused images, networks, build cache)
docker system prune -af    # -a = also unused images, -f = no prompt

# Target just one type if you prefer
docker image prune -af
docker container prune -f
docker builder prune -af   # build cache only

# Include volumes too — DANGER, can delete data (see warning)
docker system prune -af --volumes
```

> **Caution:** `docker system prune --volumes` and `docker volume prune` delete **anonymous and unused volumes** — and that means real, persistent data (databases, uploads) can be wiped permanently. There is no undo. Never run `prune --volumes` on a production host without first confirming which volumes are in use (`docker volume ls`). When in doubt, prune images and build cache only.

> **Tip:** Run `docker system df` *before* you blindly prune — it tells you whether the space is in images, volumes, or build cache, so you can reclaim surgically. Also, `docker logs` only works if the app writes to `stdout`/`stderr`; apps that log to a file inside the container will show nothing, so always configure your app to log to the console in containers.

> **Note:** A team's CI runner kept failing builds with `no space left on device` every Friday. `docker system df` revealed 40 GB of build cache. They added `docker builder prune -af --filter "until=168h"` (clear cache older than 7 days) to a nightly cron job. Builds stopped failing, and they never touched volumes, so no data was at risk. Diagnose with `system df` first, then prune the specific thing that grew.

---
title: "docker run vs Docker Compose: A Practical Migration Guide"
description: "When to use docker run, when to switch to Docker Compose, and how to convert between them in both directions — with volumes, networks and reproducibility handled right."
pubDate: 2026-06-10
tags: ["docker","docker-compose","containers"]
relatedTool:
  name: "Docker Run to Compose"
  href: "/docker-run-to-compose"
---

![Diagram comparing docker run vs Docker Compose: a single docker run command on the left and the equivalent docker-compose.yml service on the right, with bidirectional convert arrows](/blog/docker-run-vs-compose-hero.svg)

You started a Postgres container three weeks ago with a `docker run` one-liner. It works. Then you reboot the box, or a teammate needs the same setup, or you want the command in version control — and you realize the only copy of that command is in your shell history, somewhere between an `ls` and a `kubectl get pods`. This is the moment the `docker run` vs `docker compose` question stops being academic. The container is fine; the way you launched it is not reproducible.

This guide walks through both directions: when `docker run` is the right call, when to move to a `docker-compose.yml`, and how to convert a Compose service back to a single run line when you need one. Every flag mapping here matches what the [Docker Run to Compose converter](/docker-run-to-compose) actually does, so you can check your own commands against it.

## The same container, two ways

Here is a real Postgres container expressed as a `docker run` command:

```bash
docker run -d --name db \
  -e POSTGRES_PASSWORD=secret -e POSTGRES_DB=app \
  -p 5432:5432 \
  -v pgdata:/var/lib/postgresql/data \
  --restart unless-stopped \
  postgres:16
```

And here is the exact same container as a Compose service:

```yaml
services:
  db:
    image: postgres:16
    container_name: db
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
    environment:
      - POSTGRES_PASSWORD=secret
      - POSTGRES_DB=app
    restart: unless-stopped
```

![One container shown in two formats — a single docker run command on the left and a docker-compose.yml service tree on the right — with bidirectional convert arrows](/blog/docker-run-vs-compose-diagram.svg)

Same image, same ports, same named volume, same restart policy. The difference is not what runs — it is whether the definition lives in your shell history or in a file you can commit, review, and run again with one command. Note the quotes around `"5432:5432"`: YAML would otherwise read a bare `5432:5432` as a sexagesimal (base-60) number, which is one of the small bugs hand-conversion loves to introduce.

## What docker run is good at

`docker run` wins for anything throwaway. You want a one-shot psql client, a quick Redis to poke at, a base image to drop into for debugging — you do not want to author a YAML file for that.

```bash
# poke at a fresh redis for thirty seconds
docker run --rm -it redis:7-alpine redis-cli

# debug inside an image without leaving anything behind
docker run --rm -it -v "$PWD":/work -w /work ubuntu:24.04 bash
```

The `--rm` flag matters here: the container deletes itself on exit, so you do not accumulate dead containers from experiments. That is a genuinely `docker run`-shaped concern — and notably, `--rm` has no Compose equivalent at all, because Compose manages container lifecycle for you. If you paste a command with `--rm` into a converter, the honest thing to do is drop it with a warning rather than pretend it maps to something. That is exactly what the converter does.

The same goes for `-d` / `--detach`. Detached mode is a property of *how you launched the process*, not of the service definition, so it does not belong in the YAML either. We will come back to that in the pitfalls section, because it trips people up in both directions.

## What Compose buys you: when to use Docker Compose

Reach for Compose the moment any of these is true — and "when to use Docker Compose" usually comes down to this list:

- You will run this container more than once and want it reproducible.
- You want the definition in version control and reviewed in a PR.
- You have more than one container that needs to come up together.
- You are tired of remembering a 200-character command.

A Compose file turns a wall of flags into a reviewable document and a single lifecycle:

```bash
docker compose up -d     # start everything, detached
docker compose down      # stop and remove everything
docker compose logs -f   # tail every service
```

Multi-service is where the gap really opens. Two `docker run` commands that need to talk to each other force you to hand-manage a network, start them in the right order, and remember both lines. Compose makes the relationship declarative:

```yaml
services:
  api:
    image: myorg/api:1.4.0
    ports:
      - "3000:3000"
    environment:
      - DATABASE_URL=postgres://db:5432/app
    depends_on:
      - db
  db:
    image: postgres:16
    environment:
      - POSTGRES_DB=app
```

The `api` service reaches the database at the hostname `db` with zero extra wiring. That is the implicit default network doing its job — more on that below. And because the whole thing is a file, you can lint the CI that builds and ships it; if your pipeline runs `docker compose up` in a job, the [GitLab CI Validator](/gitlab-ci-validator) will catch a malformed `.gitlab-ci.yml` before the runner does.

![Synthwave illustration: a docker run one-liner on one retro computer migrating along a neon arrow to a multi-container Docker Compose stack on another](/blog/in-content/docker-run-vs-compose.webp)

## Going the other way: Compose to docker run

Migration is not a one-way street. You will hit cases where you have a Compose service but need a single `docker run` line:

- A teammate on a box without your Compose file, who just needs the container up *now*.
- A support ticket or runbook where one copy-paste command beats "clone the repo, then run compose."
- A constrained CI step or remote host where pulling the whole project is overkill.

Converting a `compose service to docker run` is mechanical but fiddly to do by hand. Take the Redis service with a healthcheck:

```yaml
services:
  cache:
    image: redis:7-alpine
    container_name: cache
    ports:
      - "6379:6379"
    mem_limit: 256m
    labels:
      - app=web
    healthcheck:
      test: "CMD-SHELL redis-cli ping"
      interval: 10s
      timeout: 3s
      retries: 5
```

The equivalent command rebuilds every field — and crucially, it is emitted detached by default, because a long-lived service is almost never something you want hogging your terminal:

```bash
docker run -d --name cache -p 6379:6379 -m 256m \
  -l app=web \
  --health-cmd 'redis-cli ping' \
  --health-interval 10s --health-timeout 3s --health-retries 5 \
  redis:7-alpine
```

The healthcheck block expands back into the discrete `--health-*` flags; `mem_limit` becomes `-m`; labels become `-l`. The converter prepends `docker run -d` for you precisely because the service was meant to run in the background. The one thing to watch: Compose-only keys like `depends_on`, `build`, and `deploy` have no command equivalent, so a faithful converter reports them as warnings rather than inventing flags that do not exist. If your service has `build:`, you run `docker build` first and feed the resulting tag to `docker run`.

## Migrating a real command step by step

Let's take a non-trivial `docker run` line and walk the migration end to end. Here is an app container on a user-defined network with adjusted capabilities:

```bash
docker run -d --name api \
  --network backend \
  -p 3000:3000 \
  -e NODE_ENV=production \
  --cap-add NET_ADMIN --cap-drop ALL \
  --add-host db:10.0.0.5 \
  myorg/api:1.4.0
```

**Step 1 — tokenise, don't eyeball.** The command is split shell-style: quotes and backslash-newline continuations are honored, and bundled short flags like `-it` are expanded into `-i -t`. The first non-flag token (`myorg/api:1.4.0`) is the image; anything after it would be the container command.

**Step 2 — classify each flag onto a key.** Ports go to `ports`, `-e` to `environment`, `--cap-add`/`--cap-drop` to `cap_add`/`cap_drop`, `--add-host` to `extra_hosts`, and `--network backend` to the `networks` list.

**Step 3 — read the result.**

```yaml
services:
  api:
    image: myorg/api:1.4.0
    container_name: api
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
    networks:
      - backend
    extra_hosts:
      - db:10.0.0.5
    cap_add:
      - NET_ADMIN
    cap_drop:
      - ALL
```

One thing the converter deliberately does *not* do: invent a top-level `networks:` section you did not ask for. The `backend` network shows up under the service, exactly as named. If `backend` is a network you created with `docker network create`, you will need to declare it as `external` at the top level yourself — the tool won't guess at infrastructure you didn't write down. That restraint is the point; a converter that hallucinates structure is worse than one that converts only what you gave it.

## Pitfalls when migrating

The flags themselves map cleanly. The behavior around them is where migrations quietly go wrong.

### The implicit default network

A bare `docker run` with no `--network` attaches the container to the default `bridge` network, where containers reach each other only by IP. Compose is different: it creates a *project-scoped* network and puts every service on it, so services resolve each other by service name (`db`, `api`) out of the box. That is usually what you want — but it means a `docker run` that talked to `172.17.0.3` needs to start talking to `db` once it is a Compose service. Migrating the flag is easy; migrating the assumption that "there's one flat bridge" is the part that bites.

### Restart policy differences

`--restart` maps straight across — `no`, `always`, `on-failure`, and `unless-stopped` all carry over to `restart:` unchanged:

```yaml
restart: unless-stopped
```

The subtlety: with `docker run`, the restart policy is the *only* thing keeping your container alive across a daemon restart. With Compose, the same `restart:` value applies, but you also get `docker compose up`/`down` as an explicit lifecycle. Don't assume `restart: always` means "Compose will bring this back after I run `down`" — `down` removes the container regardless. The restart policy governs crashes and reboots, not your own teardown commands.

### env_file vs -e

Inline `-e KEY=value` flags become an `environment:` list, and `--env-file path` becomes `env_file:`. They are not interchangeable:

```yaml
services:
  api:
    image: myorg/api:1.4.0
    env_file:
      - .env.production
    environment:
      - NODE_ENV=production    # wins over the same key in env_file
```

Inline values are visible in the file and in `docker inspect`; an `env_file` keeps secret-bearing values out of the YAML and out of your shell history. When you migrate, this is a good moment to move secrets from `-e` flags into an `env_file`. While you're there, make sure the committed `.env.example` actually matches the keys your service reads — the [Env Example Checker](/env-example-checker) diffs a real `.env` against its example so a missing key doesn't surface as a crash on a fresh checkout.

### Detached mode

`-d` / `--detach` does not exist in a Compose file, because detaching is a launch-time choice, not a property of the service. Going `docker run → compose`, the `-d` is dropped (you run `docker compose up -d` instead). Going `compose → docker run`, a faithful converter *adds* `-d` back, because a service definition almost always describes a long-running process. Both behaviors are correct; they just look asymmetric until you see why. If you find a stray `-d` "missing" from generated YAML, that is the tool being right, not losing your flag.

## Convert both directions instantly

Doing this by hand is fine for one container. It stops being fine when you are translating a wall of `-p`, `-v`, and `-e` flags under time pressure and a mis-nested list or an unquoted port slips through.

The [Docker Run to Compose converter](/docker-run-to-compose) does the mechanical part both ways: paste a `docker run` command to get the equivalent `docker-compose.yml` service, or paste a Compose service to rebuild the run line — including ports, volumes, environment, networks, capabilities, resource limits, and healthchecks. It tells you about the flags and keys that genuinely don't map instead of dropping them silently, and it runs entirely in your browser, so commands that name private registries or carry secret-bearing environment variables never leave the tab.

Migrate the command, read the warnings, commit the file.

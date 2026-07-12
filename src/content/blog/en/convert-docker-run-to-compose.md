---
title: "How to Convert a docker run Command to docker-compose.yml"
description: "Convert any docker run command to a docker-compose.yml service, flag by flag — ports, volumes, environment, restart and more. A practical, copy-paste guide."
pubDate: 2026-06-09
tags: ["docker","docker-compose","containers"]
relatedTool:
  name: "Docker Run to Compose"
  href: "/docker-run-to-compose"
---

![Convert a docker run command to a docker-compose.yml service, flag by flag](/blog/convert-docker-run-to-compose-hero.svg)

You started a container with a quick `docker run` line during a debugging session. It worked. Now someone wants it in the repo, reviewable in a PR, startable with one command — and you have a 200-character one-liner with `-p`, three `-v` mounts, half a dozen `-e` flags and a `--restart` policy that you now need to convert to `docker-compose.yml`. This is the moment most people reach for the docs and start hand-translating, and it's exactly where flags get dropped, ports get quoted wrong, and lists get mis-nested.

This guide walks through how to convert a `docker run` command to `docker-compose.yml` flag by flag, including the gotchas that bite when you do it by hand. Every mapping here matches what the [Docker Run to Compose converter](/docker-run-to-compose) actually emits, so you can read the rules and then paste your command into the tool to skip the mechanical part.

## Why move from docker run to Compose

A `docker run` command is a fine way to start one container interactively. It stops being fine the moment any of these are true:

- The exact invocation needs to live in version control so a teammate can reproduce it.
- You want it reviewed — a YAML diff is far easier to read in a PR than a wall of flags on one line.
- The container has dependencies, or you'll soon add a second service.
- You want `docker compose up -d` instead of remembering the full command every time.

Compose doesn't change what the container does. It just gives the same configuration a declarative, diffable shape. The translation is almost entirely mechanical — which is precisely why it's worth getting the rules straight rather than eyeballing it.

## The anatomy of a docker run command

Here's a real one. Postgres, published port, named volume, two environment variables, a restart policy:

```bash
docker run -d --name db \
  -e POSTGRES_PASSWORD=secret \
  -e POSTGRES_DB=app \
  -p 5432:5432 \
  -v pgdata:/var/lib/postgresql/data \
  --restart unless-stopped \
  postgres:16
```

Read left to right, a `docker run` command is three parts:

1. **`docker run`** — the command prefix.
2. **The flags** — everything starting with `-` or `--`, in any order. Each flag either takes a value (`-p 5432:5432`) or is a boolean (`-d`).
3. **The image, then the command** — the *first* token that isn't a flag is the image (`postgres:16`). Anything after it is the command to run inside the container, passed verbatim.

That ordering matters. As soon as the parser hits the image, flag scanning stops — `docker run ... postgres:16 -p 80:80` treats `-p 80:80` as arguments to the container, not as a published port. Keep your flags *before* the image.

Bundled short flags are the other thing to know about. `-it` is two flags (`-i` and `-t`), and `-itp 8080:80` is three: `-i`, `-t`, and `-p 8080:80`. A value-taking flag like `-p` consumes the rest of the bundle (or the next token) as its argument.

## Mapping every docker run flag to docker-compose.yml

This is the core of converting a `docker run` command to compose: each flag maps to a key under the service. Here's the full mapping table for the flags you'll actually hit.

![A mapping showing docker run flags on the left connected by arrows to their docker-compose.yml keys on the right](/blog/convert-docker-run-to-compose-diagram.svg)

| `docker run` flag | `docker-compose.yml` key | Notes |
|---|---|---|
| `-p` / `--publish` | `ports` | Quoted string, e.g. `"8080:80"` |
| `-v` / `--volume`, `--mount` | `volumes` | Short `source:target[:ro]` form |
| `-e` / `--env` | `environment` | `KEY=value` list |
| `--env-file` | `env_file` | One or more files |
| `--name` | `container_name` | Also becomes the service key |
| `--restart` | `restart` | `no` / `always` / `on-failure` / `unless-stopped` |
| `--network` / `--net` | `networks` | `host` / `none` → `network_mode` |
| `-w` / `--workdir` | `working_dir` | |
| `-u` / `--user` | `user` | |
| `--cap-add` / `--cap-drop` | `cap_add` / `cap_drop` | |
| `--add-host` | `extra_hosts` | |
| `--hostname` | `hostname` | |
| `--entrypoint` | `entrypoint` | |
| `--privileged` | `privileged` | |
| `-m` / `--memory` | `mem_limit` | |
| `--cpus` | `cpus` | |
| `-l` / `--label` | `labels` | |
| `--health-*` | `healthcheck` | `cmd` / `interval` / `timeout` / `retries` |
| `-i` / `-t` | `stdin_open` / `tty` | |
| `--rm`, `-d` / `--detach` | — | No Compose equivalent (dropped) |

A few of these deserve a closer look.

### -p → ports

Each `-p` becomes one entry under `ports:`, written as a **quoted** `"HOST:CONTAINER"` string:

```yaml
ports:
  - "5432:5432"
```

The quotes are not optional. A bare `5432:5432` is read by YAML 1.1 parsers as a sexagesimal (base-60) number, which silently corrupts the mapping. This is one of the most common hand-conversion bugs, so always quote ports.

### -v / --volume and --mount → volumes

`-v` keeps its short `source:target[:ro]` form verbatim:

```yaml
volumes:
  - pgdata:/var/lib/postgresql/data
  - /data:/usr/share/nginx/html:ro
```

A long-form `--mount type=bind,source=/data,target=/app,readonly` is reduced to the same short `source:target:ro` shape. Named volumes and bind mounts are preserved exactly as written — converting doesn't invent a top-level `volumes:` declaration you didn't ask for (more on that in the gotchas).

### -e / --env-file → environment / env_file

Each `-e KEY=value` becomes a `KEY=value` line under `environment:`, and each `--env-file` maps to `env_file:`:

```yaml
environment:
  - POSTGRES_PASSWORD=secret
  - POSTGRES_DB=app
env_file:
  - .env
```

When you're moving environment off the command line and into files, it's worth confirming your `.env` and `.env.example` haven't drifted apart — the [Env Example Checker](/env-example-checker) flags keys that exist in one but not the other so a missing variable doesn't surface as a runtime error.

### --restart, --name, -w, -u

These are direct one-to-one scalar mappings:

```yaml
restart: unless-stopped
container_name: db
working_dir: /work
user: 1000:1000
```

`--name` does double duty: it sets `container_name` *and* becomes the service key (`services: { db: ... }`). When there's no `--name`, the service is keyed as `app`.

### --network → networks (or network_mode)

A named network becomes a `networks:` list entry. But `host` and `none` are special — they're network *modes*, not networks, so they map to `network_mode` instead:

```yaml
# docker run --network backend
networks:
  - backend

# docker run --network host
network_mode: host
```

### --cap-add, --cap-drop, --add-host

Capabilities and host entries each collect into a list:

```yaml
cap_add:
  - NET_ADMIN
cap_drop:
  - ALL
extra_hosts:
  - db:10.0.0.5
```

### --health-* → healthcheck

The `--health-*` flags assemble into a single `healthcheck:` block. The command becomes a `CMD-SHELL` test:

```bash
docker run --health-cmd "redis-cli ping" \
  --health-interval 10s --health-timeout 3s --health-retries 5 \
  redis:7-alpine
```

```yaml
healthcheck:
  test: "CMD-SHELL redis-cli ping"
  interval: 10s
  timeout: 3s
  retries: 5
```

### -m / --cpus → mem_limit / cpus

Resource flags map to `mem_limit` and `cpus`:

```yaml
mem_limit: 256m
cpus: "1.5"
```

These are the v2-style limits Compose honors directly. When you eventually move this container to Kubernetes, those numbers become pod requests and limits — the [Kubernetes Resource Calculator](/kubernetes-resource-calculator) turns a memory and CPU figure into safe `requests`/`limits` values so you're not guessing at the conversion.

### The flags with no Compose equivalent

`--rm` and `-d` / `--detach` describe how *you* invoked the container, not how it's configured, so they have no place in a service definition. They're dropped — but you should know why:

- `--rm` (remove on exit) is irrelevant because Compose manages the lifecycle.
- `-d` / `--detach` is replaced by how you start the stack: `docker compose up -d`.

![Illustration: a docker run command on one retro terminal, its flags flowing screen to screen until they reassemble as a docker-compose.yml service](/blog/in-content/convert-docker-run-to-compose.webp)

## A full worked example

Take this longer command — an API service on a user network, with environment, capabilities and an extra host entry:

```bash
docker run -d --name api \
  --network backend \
  -p 3000:3000 \
  -e NODE_ENV=production \
  --cap-add NET_ADMIN \
  --cap-drop ALL \
  --add-host db:10.0.0.5 \
  myorg/api:1.4.0
```

Applying the mapping table flag by flag — and dropping `-d` with a note — gives this service:

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

Notice what carried over and what didn't. `--name api` set both the service key and `container_name`. The port is quoted. `-d` is gone — you'll start this with `docker compose up -d`. Everything else is a direct flag-to-key translation in the fixed, readable order Compose conventions expect.

## Gotchas when you convert docker run -p -v -e to compose

The mapping is mechanical, but a handful of details trip people up.

**Named volumes vs bind mounts.** Both use the same `-v` syntax, so they land in the same `volumes:` list — but they mean different things. `-v /data:/app` is a *bind mount* of a host path; `-v pgdata:/app` is a *named volume* managed by Docker. A bare relative or absolute path with a leading `/` (or `.`) is a bind mount; a bare name is a volume. Converting keeps the string exactly as written and does **not** synthesize the top-level `volumes:` block that named volumes technically need. Compose will create an anonymous-ish volume implicitly, but if you want it explicit and shareable, add it yourself:

```yaml
services:
  db:
    image: postgres:16
    volumes:
      - pgdata:/var/lib/postgresql/data
volumes:
  pgdata:
```

**Environment precedence.** If you use both `environment` and `env_file`, values set inline in `environment` win over the same key in an env file. And neither overrides a variable that's already set in the shell when you run `docker compose up` unless you reference it. Keep secrets out of `environment:` (it's committed) and in `env_file:` (gitignored) — and verify the file's keys with the [Env Example Checker](/env-example-checker) before you ship.

**host and none network modes.** As covered above, `--network host` and `--network none` are not networks — they're modes. Putting `host` under a `networks:` list is invalid; it has to be `network_mode: host`. This is the kind of thing easy to miss by hand because the flag spelling is identical to a normal `--network backend`.

**Ports: publish vs expose.** `-p` *publishes* a port to the host (`ports:`), which is what you almost always mean. There is no `-p`-without-a-host-side equivalent of Compose's `expose:` (container-to-container only, no host binding) — `expose` comes from the image's `EXPOSE` directive or an explicit `expose:` key, not from `docker run -p`. Don't reach for `expose:` when converting a `-p` flag; you want `ports:`.

## Convert it instantly

The rules above are everything you need to do this by hand. But hand-conversion is exactly where a flag gets dropped, a port loses its quotes, or `--network host` ends up in the wrong key — and you don't find out until the container behaves differently than the original command.

The [Docker Run to Compose converter](/docker-run-to-compose) does the mechanical translation for you. It tokenizes the command the way a shell would — honoring quotes, bundled short flags like `-it`, and backslash-newline continuations — maps each flag onto the matching Compose key, and emits deterministic YAML. Flags with no equivalent (`--rm`, `-d`) come back as warnings instead of silently vanishing, so nothing disappears without you knowing. It also runs in reverse: paste a Compose service and get an equivalent `docker run` line back.

Everything happens in your browser, so you can paste commands that name private registries or carry secret-bearing `-e` values without anything leaving the tab. Paste your command, read the warnings, and commit the result.

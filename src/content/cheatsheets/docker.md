---
title: Docker cheat sheet
seoTitle: Docker Cheat Sheet — run, build, logs, exec, compose, prune
description: The Docker commands you reach for daily — run, build, logs, exec, compose and cleanup — with each flag checked against the current Docker CLI.
command: docker
verifiedWith: Docker CLI 29.6.2, Compose v5.3.1
pubDate: 2026-10-09
updatedDate: 2026-10-09
order: 1
relatedTools:
  - docker-run-to-compose
  - dockerfile-linter
sources:
  - title: Docker CLI reference (docker)
    url: https://docs.docker.com/reference/cli/docker/
  - title: docker container run reference
    url: https://docs.docker.com/reference/cli/docker/container/run/
  - title: docker compose reference
    url: https://docs.docker.com/reference/cli/docker/compose/
  - title: Port publishing and mapping
    url: https://docs.docker.com/engine/network/port-publishing/
faqs:
  - q: What is the difference between docker stop and docker kill?
    a: docker stop sends SIGTERM (or the image's STOPSIGNAL), waits for a grace period you can set with -t, and only then sends SIGKILL. docker kill sends SIGKILL straight away unless you pick another signal with -s, so the process gets no chance to flush or close connections.
  - q: Does docker system prune delete my volumes?
    a: Not by default. It removes stopped containers, unused networks, dangling images and build cache. Add --volumes and it also removes anonymous volumes that no container uses. Named volumes are removed only by docker volume prune -a, docker volume rm, or docker compose down -v for the volumes a Compose file declares.
  - q: Should I use docker-compose or docker compose?
    a: Use docker compose, with a space. It is the Compose plugin that ships with current Docker. The hyphenated docker-compose is the old standalone v1 binary, which no longer receives updates.
---

Most days you need five Docker commands: `docker run` to start a container, `docker ps` to see what is running, `docker logs -f` to watch it, `docker exec -it` to get a shell inside it, and `docker compose up -d` to bring a whole stack up. The tables below group the rest by job. Every flag was checked against the CLI's own `--help` output and the reference pages listed at the end of the page.

## Run a container

| Command | What it does |
|---|---|
| `docker run -d --name web -p 8080:80 nginx` | Start `nginx` in the background, named `web`, with host port 8080 forwarded to container port 80. |
| `docker run -p 127.0.0.1:8080:80 nginx` | Same port forward, but reachable only from the host itself. |
| `docker run -it --rm alpine sh` | Interactive shell in a throwaway container; `--rm` deletes the container when you exit. |
| `docker run -e LOG_LEVEL=debug app` | Set one environment variable. Repeat `-e` for more. |
| `docker run --env-file .env app` | Load variables from a file, one `KEY=value` per line. |
| `docker run -v data:/var/lib/app app` | Mount the named volume `data`; Docker creates it if it does not exist. |
| `docker run --mount type=bind,src="$(pwd)",dst=/src app` | Bind-mount the current directory. `--mount` fails if the host path is missing; `-v` would create it. |
| `docker run --restart unless-stopped app` | Restart after crashes and daemon restarts, but not after you stop it by hand. |
| `docker run --network backend app` | Attach to a user-defined network so containers resolve each other by name. |
| `docker run -u 1000:1000 -w /work app` | Run as a given UID:GID with `/work` as the working directory. |
| `docker run --entrypoint sh -it app` | Replace the image's entrypoint, usually to debug a container that exits immediately. |
| `docker run --memory 512m --cpus 1.5 app` | Cap memory and CPU for the container. |
| `docker run --read-only --init app` | Read-only root filesystem, plus a small init process as PID 1 that reaps zombie processes. |

Have a long `docker run` line you want to keep? Paste it into the [Docker Run to Compose converter](/docker-run-to-compose/) and get the equivalent `compose.yaml` service.

## See what is running

| Command | What it does |
|---|---|
| `docker ps` | Running containers. |
| `docker ps -a` | All containers, including stopped ones. |
| `docker ps -q --filter status=exited` | IDs only of exited containers, handy for piping into another command. |
| `docker ps --format '{{.Names}}\t{{.Status}}'` | Custom columns with a Go template. |
| `docker stats --no-stream` | One snapshot of CPU, memory and network use per container. |
| `docker top web` | Processes running inside `web`. |
| `docker port web` | Which host ports map to which container ports. |

## Logs, shells and inspection

| Command | What it does |
|---|---|
| `docker logs -f --tail 100 web` | Follow the log, starting from the last 100 lines. |
| `docker logs --since 10m -t web` | Only the last ten minutes, with timestamps. |
| `docker exec -it web sh` | Open a shell in a running container. Use `bash` if the image has it. |
| `docker exec -u root web id` | Run one command as another user. |
| `docker inspect web` | Full JSON for a container, image, volume or network. |
| `docker inspect -f '{{.State.Status}}' web` | Pull one field out with a Go template. |
| `docker cp web:/etc/nginx/nginx.conf .` | Copy a file out of a container; swap the arguments to copy in. |
| `docker diff web` | Files added (A), changed (C) or deleted (D) since the container started. |

## Start, stop and remove

| Command | What it does |
|---|---|
| `docker stop -t 30 web` | Send SIGTERM, wait up to 30 seconds, then SIGKILL. |
| `docker start web` / `docker restart web` | Start a stopped container, or stop and start it. |
| `docker kill -s HUP web` | Send a signal immediately; without `-s` it is SIGKILL. |
| `docker rm web` | **Destructive:** delete a stopped container and its writable layer. |
| `docker rm -f web` | **Destructive:** stop and delete it in one step. |
| `docker rm -v web` | **Destructive:** also delete anonymous volumes attached to it. |

## Build and ship images

| Command | What it does |
|---|---|
| `docker build -t app:1.4 .` | Build from the `Dockerfile` in the current directory and tag it. |
| `docker build -f docker/prod.Dockerfile -t app .` | Use a Dockerfile at another path. |
| `docker build --target test -t app:test .` | Stop at one stage of a multi-stage build. |
| `docker build --build-arg VERSION=1.4 -t app .` | Pass a value to an `ARG` in the Dockerfile. |
| `docker build --no-cache --pull -t app .` | Ignore the layer cache and re-pull the base image. |
| `docker build --platform linux/arm64 -t app .` | Build for another CPU architecture. |
| `docker image ls` | Local images (`docker images` is the short form). |
| `docker image history --no-trunc app:1.4` | Every layer and the instruction that made it. |
| `docker tag app:1.4 registry.example.com/app:1.4` | Add a registry name to an image before pushing. |
| `docker push registry.example.com/app:1.4` | Upload the tag; run `docker login` first. |
| `docker image save -o app.tar app:1.4` | Write an image to a tar file, e.g. for an air-gapped host. |
| `docker image load -i app.tar` | Load it back. |
| `docker rmi app:1.4` | **Destructive:** remove a local image tag, and the image once no tag points at it. |

Lint the Dockerfile before you build it: the [Dockerfile Linter](/dockerfile-linter/) flags unpinned base images, root users and cache-busting layer order.

## Compose

| Command | What it does |
|---|---|
| `docker compose up -d` | Create and start every service in `compose.yaml`, in the background. |
| `docker compose up -d --build` | Rebuild images first. |
| `docker compose up --wait` | Start in the background and return only once services are running or healthy. |
| `docker compose ps` | Containers in this project. |
| `docker compose logs -f --tail 50 api` | Follow one service's log. |
| `docker compose exec api sh` | Shell into a running service. Add `-T` in scripts and CI, where there is no TTY. |
| `docker compose run --rm api npm test` | One-off command in a fresh container for that service. |
| `docker compose config` | Print the fully merged and interpolated file; the fastest way to debug variables. |
| `docker compose pull` | Pull newer images for every service. |
| `docker compose down` | Stop and remove the project's containers and networks. Volumes survive. |
| `docker compose down -v` | **Destructive:** also delete the named volumes the file declares, which is where your database lives. |

## Volumes and networks

| Command | What it does |
|---|---|
| `docker volume ls` | Every volume. |
| `docker volume inspect data` | A volume's driver, labels and mount point on the host. |
| `docker volume rm data` | **Destructive:** delete a volume and everything in it. |
| `docker network create backend` | A user-defined bridge network with name-based DNS. |
| `docker network connect --alias db backend pg` | Attach a running container under an extra DNS name. |
| `docker network ls` | Every network. |

## Clean up disk space

> **Warning:** every command in this section deletes something, and none of them can be undone. Run `docker system df` first to see what you would get back.

| Command | What it does |
|---|---|
| `docker system df` | Disk used by images, containers, volumes and build cache. |
| `docker container prune` | Delete all stopped containers. |
| `docker image prune` | Delete dangling images (untagged layers left behind by rebuilds). |
| `docker image prune -a` | Delete every image no container uses, tagged or not. |
| `docker volume prune` | Delete unused anonymous volumes. |
| `docker volume prune -a` | Delete unused named volumes too. |
| `docker builder prune` | Clear the BuildKit cache. |
| `docker system prune` | Stopped containers, unused networks, dangling images and build cache in one go. |
| `docker system prune -a --volumes` | The above plus all unused images and anonymous volumes. |

## Gotchas

> **Gotcha:** `-p 8080:80` publishes on every host interface, and Docker writes its own firewall rules, so a UFW rule that blocks 8080 does not stop it. Use `-p 127.0.0.1:8080:80` for anything that should stay local.

> **Gotcha:** `docker exec` only works on a running container. If a container exits at startup, read `docker logs` first, then start a fresh one with `--entrypoint sh` to look around.

> **Gotcha:** `docker compose down` keeps your volumes; `docker compose down -v` deletes them. The difference is one character and your database.

> **Gotcha:** the `latest` tag is just a default name, not "the newest version". Pin a version or digest in anything you deploy.

Go deeper: the [Docker for DevOps guide](/learn/guides/docker-for-devops/) explains images, layers, networking and volumes end to end. For JSON from `docker inspect`, the [jq cheat sheet](/cheatsheets/jq/) has the filters.

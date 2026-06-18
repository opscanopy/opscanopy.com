/**
 * Docker Run ↔ Compose — bundled, runnable examples for the playground.
 *
 * Each example carries BOTH directions so a single picker can seed either mode:
 *   • `run`     — a `docker run …` command (seeds the run → compose mode).
 *   • `compose` — the equivalent Compose service YAML (seeds compose → run).
 *
 * The commands are drawn from the canonical Docker documentation so the output
 * is recognisable and the round-trips are realistic.
 */

export interface DockerExample {
  /** Stable id used by the playground selector. */
  id: string;
  /** Short human label for the example tab. */
  label: string;
  /** A real `docker run …` command. */
  run: string;
  /** The equivalent docker-compose service YAML. */
  compose: string;
}

/* (a) ─ The canonical nginx publish + bind-mount example ─────────────────────── */
const nginx: DockerExample = {
  id: 'nginx',
  label: 'nginx — publish + read-only mount',
  run: 'docker run -d -p 8080:80 --name web -v /data:/usr/share/nginx/html:ro nginx:alpine',
  compose: `services:
  web:
    image: nginx:alpine
    container_name: web
    ports:
      - "8080:80"
    volumes:
      - /data:/usr/share/nginx/html:ro
`,
};

/* (b) ─ Postgres with env, named volume, restart policy ───────────────────────── */
const postgres: DockerExample = {
  id: 'postgres',
  label: 'Postgres — env + named volume',
  run: 'docker run -d --name db -e POSTGRES_PASSWORD=secret -e POSTGRES_DB=app -p 5432:5432 -v pgdata:/var/lib/postgresql/data --restart unless-stopped postgres:16',
  compose: `services:
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
`,
};

/* (c) ─ Redis with a healthcheck, memory limit and labels ─────────────────────── */
const redis: DockerExample = {
  id: 'redis',
  label: 'Redis — healthcheck + limits',
  run: 'docker run -d --name cache -p 6379:6379 -m 256m --health-cmd "redis-cli ping" --health-interval 10s --health-timeout 3s --health-retries 5 -l app=web redis:7-alpine',
  compose: `services:
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
`,
};

/* (d) ─ Interactive Ubuntu with bundled short flags + a command ───────────────── */
const ubuntu: DockerExample = {
  id: 'ubuntu',
  label: 'Ubuntu — interactive shell',
  run: 'docker run -it --rm --name shell -w /work -u 1000:1000 ubuntu:24.04 bash -lc "echo hello"',
  compose: `services:
  shell:
    image: ubuntu:24.04
    container_name: shell
    working_dir: /work
    user: 1000:1000
    stdin_open: true
    tty: true
    command:
      - bash
      - -lc
      - echo hello
`,
};

/* (e) ─ App container on a user network with extra capabilities ───────────────── */
const app: DockerExample = {
  id: 'app',
  label: 'App — network + capabilities',
  run: 'docker run -d --name api --network backend -p 3000:3000 -e NODE_ENV=production --cap-add NET_ADMIN --cap-drop ALL --add-host db:10.0.0.5 myorg/api:1.4.0',
  compose: `services:
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
`,
};

export const examples: DockerExample[] = [nginx, postgres, redis, ubuntu, app];

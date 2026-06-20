---
title: "Cómo convertir un comando docker run a docker-compose.yml"
description: "Convierte cualquier comando docker run en un servicio de docker-compose.yml, flag por flag: puertos, volúmenes, variables de entorno, política de reinicio y más. Una guía práctica lista para copiar y pegar."
pubDate: 2026-06-09
tags: ["docker","docker-compose","containers"]
lang: es
translationOf: "convert-docker-run-to-compose"
relatedTool:
  name: "Docker Run to Compose"
  href: "/docker-run-to-compose"
---

![Convertir un comando docker run en un servicio de docker-compose.yml, flag por flag](/blog/convert-docker-run-to-compose-hero.svg)

Arrancaste un contenedor con una línea rápida de `docker run` durante una sesión de depuración. Funcionó. Ahora alguien lo quiere en el repo, revisable en un PR, arrancable con un solo comando, y tienes un one-liner de 200 caracteres con `-p`, tres montajes `-v`, media docena de flags `-e` y una política `--restart` que ahora necesitas convertir a `docker-compose.yml`. Este es el momento en que la mayoría de la gente recurre a la documentación y empieza a traducir a mano, y es justo donde se pierden flags, los puertos quedan mal entrecomillados y las listas terminan mal anidadas.

Esta guía recorre cómo convertir un comando `docker run` a `docker-compose.yml` flag por flag, incluidas las trampas que muerden cuando lo haces a mano. Cada equivalencia aquí coincide con lo que el [conversor Docker Run to Compose](/docker-run-to-compose) emite realmente, así que puedes leer las reglas y luego pegar tu comando en la herramienta para saltarte la parte mecánica.

## Por qué pasar de docker run a Compose

Un comando `docker run` es una forma perfectamente válida de arrancar un contenedor de forma interactiva. Deja de serlo en el momento en que se cumple cualquiera de estas condiciones:

- La invocación exacta necesita vivir en el control de versiones para que un compañero pueda reproducirla.
- Quieres que sea revisable: un diff de YAML es mucho más fácil de leer en un PR que un muro de flags en una sola línea.
- El contenedor tiene dependencias, o pronto vas a añadir un segundo servicio.
- Quieres `docker compose up -d` en lugar de recordar el comando completo cada vez.

Compose no cambia lo que hace el contenedor. Solo le da a la misma configuración una forma declarativa y comparable mediante diff. La traducción es casi enteramente mecánica, que es precisamente por lo que merece la pena tener claras las reglas en vez de hacerlo a ojo.

## La anatomía de un comando docker run

Aquí tienes uno real. Postgres, un puerto publicado, un volumen con nombre, dos variables de entorno y una política de reinicio:

```bash
docker run -d --name db \
  -e POSTGRES_PASSWORD=secret \
  -e POSTGRES_DB=app \
  -p 5432:5432 \
  -v pgdata:/var/lib/postgresql/data \
  --restart unless-stopped \
  postgres:16
```

Leído de izquierda a derecha, un comando `docker run` consta de tres partes:

1. **`docker run`** — el prefijo del comando.
2. **Los flags** — todo lo que empieza con `-` o `--`, en cualquier orden. Cada flag o bien toma un valor (`-p 5432:5432`) o es booleano (`-d`).
3. **La imagen y, después, el comando** — el *primer* token que no es un flag es la imagen (`postgres:16`). Cualquier cosa después de él es el comando a ejecutar dentro del contenedor, pasado tal cual.

Ese orden importa. En cuanto el parser llega a la imagen, el escaneo de flags se detiene: `docker run ... postgres:16 -p 80:80` trata `-p 80:80` como argumentos del contenedor, no como un puerto publicado. Mantén tus flags *antes* de la imagen.

Los flags cortos agrupados son lo otro que conviene conocer. `-it` son dos flags (`-i` y `-t`), y `-itp 8080:80` son tres: `-i`, `-t` y `-p 8080:80`. Un flag que toma valor como `-p` consume el resto del grupo (o el siguiente token) como su argumento.

## Equivalencia de cada flag de docker run con docker-compose.yml

Este es el núcleo de convertir un comando `docker run` a compose: cada flag se mapea a una clave bajo el servicio. Aquí tienes la tabla de equivalencias completa para los flags con los que realmente te vas a encontrar.

![Un esquema que muestra los flags de docker run a la izquierda conectados por flechas con sus claves de docker-compose.yml a la derecha](/blog/convert-docker-run-to-compose-diagram.svg)

| flag de `docker run` | clave de `docker-compose.yml` | Notas |
|---|---|---|
| `-p` / `--publish` | `ports` | Cadena entrecomillada, p. ej. `"8080:80"` |
| `-v` / `--volume`, `--mount` | `volumes` | Forma corta `source:target[:ro]` |
| `-e` / `--env` | `environment` | Lista `KEY=value` |
| `--env-file` | `env_file` | Uno o más archivos |
| `--name` | `container_name` | También se convierte en la clave del servicio |
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
| `--rm`, `-d` / `--detach` | — | Sin equivalente en Compose (se descarta) |

Algunos de estos merecen una mirada más detenida.

### -p → ports

Cada `-p` se convierte en una entrada bajo `ports:`, escrita como una cadena **entrecomillada** `"HOST:CONTAINER"`:

```yaml
ports:
  - "5432:5432"
```

Las comillas no son opcionales. Un `5432:5432` sin comillas es interpretado por los parsers de YAML 1.1 como un número sexagesimal (en base 60), lo que corrompe silenciosamente el mapeo. Este es uno de los bugs más comunes de la conversión a mano, así que entrecomilla siempre los puertos.

### -v / --volume y --mount → volumes

`-v` conserva su forma corta `source:target[:ro]` tal cual:

```yaml
volumes:
  - pgdata:/var/lib/postgresql/data
  - /data:/usr/share/nginx/html:ro
```

Un `--mount type=bind,source=/data,target=/app,readonly` en forma larga se reduce a la misma forma corta `source:target:ro`. Los volúmenes con nombre y los bind mounts se preservan exactamente como están escritos: la conversión no inventa una declaración `volumes:` de nivel superior que no pediste (más sobre esto en las trampas).

### -e / --env-file → environment / env_file

Cada `-e KEY=value` se convierte en una línea `KEY=value` bajo `environment:`, y cada `--env-file` se mapea a `env_file:`:

```yaml
environment:
  - POSTGRES_PASSWORD=secret
  - POSTGRES_DB=app
env_file:
  - .env
```

Cuando estás sacando el entorno de la línea de comandos y llevándolo a archivos, conviene confirmar que tu `.env` y tu `.env.example` no se hayan desincronizado: el [Env Example Checker](/env-example-checker) marca las claves que existen en uno pero no en el otro, para que una variable faltante no aparezca como un error en tiempo de ejecución.

### --restart, --name, -w, -u

Estos son mapeos escalares directos uno a uno:

```yaml
restart: unless-stopped
container_name: db
working_dir: /work
user: 1000:1000
```

`--name` cumple doble función: establece `container_name` *y* se convierte en la clave del servicio (`services: { db: ... }`). Cuando no hay `--name`, el servicio se nombra como `app`.

### --network → networks (o network_mode)

Una red con nombre se convierte en una entrada de la lista `networks:`. Pero `host` y `none` son especiales: son *modos* de red, no redes, así que se mapean a `network_mode` en su lugar:

```yaml
# docker run --network backend
networks:
  - backend

# docker run --network host
network_mode: host
```

### --cap-add, --cap-drop, --add-host

Las capacidades y las entradas de host se recopilan cada una en una lista:

```yaml
cap_add:
  - NET_ADMIN
cap_drop:
  - ALL
extra_hosts:
  - db:10.0.0.5
```

### --health-* → healthcheck

Los flags `--health-*` se ensamblan en un único bloque `healthcheck:`. El comando se convierte en un test `CMD-SHELL`:

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

Los flags de recursos se mapean a `mem_limit` y `cpus`:

```yaml
mem_limit: 256m
cpus: "1.5"
```

Estos son los límites estilo v2 que Compose respeta directamente. Cuando llegue el momento de mover este contenedor a Kubernetes, esos números se convierten en requests y limits del pod: la [Kubernetes Resource Calculator](/kubernetes-resource-calculator) convierte una cifra de memoria y CPU en valores de `requests`/`limits` seguros, para que no andes adivinando en la conversión.

### Los flags sin equivalente en Compose

`--rm` y `-d` / `--detach` describen cómo *tú* invocaste el contenedor, no cómo está configurado, así que no tienen lugar en una definición de servicio. Se descartan, pero conviene saber por qué:

- `--rm` (eliminar al salir) es irrelevante porque Compose gestiona el ciclo de vida.
- `-d` / `--detach` queda sustituido por cómo arrancas el stack: `docker compose up -d`.

## Un ejemplo completo resuelto

Toma este comando más largo: un servicio de API en una red de usuario, con entorno, capacidades y una entrada de host adicional:

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

Aplicando la tabla de equivalencias flag por flag, y descartando `-d` con una nota, se obtiene este servicio:

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

Fíjate en lo que se trasladó y lo que no. `--name api` estableció tanto la clave del servicio como `container_name`. El puerto está entrecomillado. `-d` ya no está: esto lo arrancarás con `docker compose up -d`. Todo lo demás es una traducción directa de flag a clave en el orden fijo y legible que esperan las convenciones de Compose.

## Trampas al convertir docker run -p -v -e a compose

El mapeo es mecánico, pero un puñado de detalles hace tropezar a la gente.

**Volúmenes con nombre frente a bind mounts.** Ambos usan la misma sintaxis `-v`, así que caen en la misma lista `volumes:`, pero significan cosas distintas. `-v /data:/app` es un *bind mount* de una ruta del host; `-v pgdata:/app` es un *volumen con nombre* gestionado por Docker. Una ruta relativa o absoluta a secas con una `/` inicial (o `.`) es un bind mount; un nombre a secas es un volumen. La conversión mantiene la cadena exactamente como está escrita y **no** sintetiza el bloque `volumes:` de nivel superior que los volúmenes con nombre técnicamente necesitan. Compose creará un volumen casi anónimo de forma implícita, pero si lo quieres explícito y compartible, añádelo tú mismo:

```yaml
services:
  db:
    image: postgres:16
    volumes:
      - pgdata:/var/lib/postgresql/data
volumes:
  pgdata:
```

**Precedencia del entorno.** Si usas tanto `environment` como `env_file`, los valores definidos en línea en `environment` ganan sobre la misma clave de un env file. Y ninguno de los dos sobrescribe una variable que ya esté definida en la shell cuando ejecutas `docker compose up`, salvo que la referencies. Mantén los secretos fuera de `environment:` (se commitea) y dentro de `env_file:` (en el gitignore), y verifica las claves del archivo con el [Env Example Checker](/env-example-checker) antes de publicar.

**Modos de red host y none.** Como vimos antes, `--network host` y `--network none` no son redes: son modos. Poner `host` bajo una lista `networks:` es inválido; tiene que ser `network_mode: host`. Este es el tipo de cosa que es fácil pasar por alto a mano porque la escritura del flag es idéntica a la de un `--network backend` normal.

**Puertos: publish frente a expose.** `-p` *publica* un puerto en el host (`ports:`), que es lo que casi siempre quieres decir. No hay un equivalente de `-p` sin lado de host para el `expose:` de Compose (solo de contenedor a contenedor, sin binding al host): `expose` proviene de la directiva `EXPOSE` de la imagen o de una clave `expose:` explícita, no de `docker run -p`. No recurras a `expose:` al convertir un flag `-p`; lo que quieres es `ports:`.

## Conviértelo al instante

Las reglas de arriba son todo lo que necesitas para hacer esto a mano. Pero la conversión a mano es justo donde se pierde un flag, un puerto pierde sus comillas o `--network host` acaba en la clave equivocada, y no te enteras hasta que el contenedor se comporta de forma distinta al comando original.

El [conversor Docker Run to Compose](/docker-run-to-compose) hace la traducción mecánica por ti. Tokeniza el comando como lo haría una shell —respetando las comillas, los flags cortos agrupados como `-it` y las continuaciones con barra invertida y salto de línea—, mapea cada flag a la clave de Compose correspondiente y emite YAML determinista. Los flags sin equivalente (`--rm`, `-d`) vuelven como avisos en lugar de desaparecer silenciosamente, así que nada se esfuma sin que te enteres. También funciona a la inversa: pega un servicio de Compose y obtienes de vuelta una línea `docker run` equivalente.

Todo ocurre en tu navegador, así que puedes pegar comandos que nombren registries privados o que lleven valores `-e` con secretos sin que nada salga de la pestaña. Pega tu comando, lee los avisos y commitea el resultado.

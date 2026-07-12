---
title: "docker run vs Docker Compose: una guía práctica de migración"
description: "Cuándo usar docker run, cuándo pasar a Docker Compose y cómo convertir entre ambos en las dos direcciones, gestionando bien los volúmenes, las redes y la reproducibilidad."
pubDate: 2026-06-10
tags: ["docker","docker-compose","containers"]
lang: es
translationOf: "docker-run-vs-compose"
relatedTool:
  name: "Docker Run to Compose"
  href: "/docker-run-to-compose"
---

![Diagrama que compara docker run con Docker Compose: a la izquierda un único comando docker run y a la derecha el servicio equivalente en docker-compose.yml, con flechas de conversión bidireccionales](/blog/docker-run-vs-compose-hero.svg)

Hace tres semanas levantaste un contenedor de Postgres con un `docker run` de una sola línea. Funciona. Luego reinicias la máquina, o un compañero necesita la misma configuración, o quieres tener el comando bajo control de versiones, y te das cuenta de que la única copia de ese comando está en el historial de tu shell, en algún punto entre un `ls` y un `kubectl get pods`. Este es el momento en que la pregunta `docker run` vs `docker compose` deja de ser teórica. El contenedor está bien; lo que no es reproducible es la forma en que lo lanzaste.

Esta guía recorre ambas direcciones: cuándo `docker run` es la opción correcta, cuándo conviene pasar a un `docker-compose.yml` y cómo convertir un servicio de Compose de vuelta a una sola línea de run cuando la necesitas. Cada correspondencia de flags que aparece aquí coincide con lo que realmente hace el [conversor Docker Run to Compose](/docker-run-to-compose), así que puedes contrastar tus propios comandos con él.

## El mismo contenedor, de dos maneras

Aquí tienes un contenedor real de Postgres expresado como un comando `docker run`:

```bash
docker run -d --name db \
  -e POSTGRES_PASSWORD=secret -e POSTGRES_DB=app \
  -p 5432:5432 \
  -v pgdata:/var/lib/postgresql/data \
  --restart unless-stopped \
  postgres:16
```

Y aquí tienes exactamente el mismo contenedor como servicio de Compose:

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

![Un mismo contenedor mostrado en dos formatos: a la izquierda un único comando docker run y a la derecha el árbol de un servicio docker-compose.yml, con flechas de conversión bidireccionales](/blog/docker-run-vs-compose-diagram.svg)

La misma imagen, los mismos puertos, el mismo volumen con nombre, la misma política de reinicio. La diferencia no está en lo que se ejecuta, sino en si la definición vive en el historial de tu shell o en un archivo que puedes confirmar, revisar y volver a ejecutar con un solo comando. Fíjate en las comillas alrededor de `"5432:5432"`: de lo contrario YAML interpretaría un `5432:5432` sin comillas como un número sexagesimal (en base 60), uno de esos pequeños fallos que la conversión a mano tiende a introducir.

## En qué destaca docker run

`docker run` gana en todo lo que sea desechable. Quieres un cliente psql de un solo uso, un Redis rápido para trastear, una imagen base en la que entrar para depurar; no quieres escribir un archivo YAML para eso.

```bash
# trastear con un redis nuevo durante treinta segundos
docker run --rm -it redis:7-alpine redis-cli

# depurar dentro de una imagen sin dejar nada atrás
docker run --rm -it -v "$PWD":/work -w /work ubuntu:24.04 bash
```

El flag `--rm` importa aquí: el contenedor se elimina solo al salir, así que no acumulas contenedores muertos de tus experimentos. Es una preocupación genuinamente con forma de `docker run` y, en particular, `--rm` no tiene ningún equivalente en Compose, porque Compose gestiona por ti el ciclo de vida del contenedor. Si pegas un comando con `--rm` en un conversor, lo honesto es descartarlo con una advertencia en lugar de fingir que se corresponde con algo. Eso es exactamente lo que hace el conversor.

Lo mismo ocurre con `-d` / `--detach`. El modo desacoplado es una propiedad de *cómo lanzaste el proceso*, no de la definición del servicio, así que tampoco pertenece al YAML. Volveremos a ello en la sección de errores frecuentes, porque hace tropezar a la gente en ambas direcciones.

## Lo que te aporta Compose: cuándo usar Docker Compose

Recurre a Compose en cuanto se cumpla cualquiera de estas condiciones, y "cuándo usar Docker Compose" suele reducirse a esta lista:

- Vas a ejecutar este contenedor más de una vez y quieres que sea reproducible.
- Quieres la definición bajo control de versiones y revisada en un PR.
- Tienes más de un contenedor que necesita levantarse en conjunto.
- Estás cansado de recordar un comando de 200 caracteres.

Un archivo de Compose convierte un muro de flags en un documento revisable y en un único ciclo de vida:

```bash
docker compose up -d     # arranca todo, en segundo plano
docker compose down      # detiene y elimina todo
docker compose logs -f   # sigue los logs de cada servicio
```

Donde de verdad se abre la brecha es en el multiservicio. Dos comandos `docker run` que necesitan comunicarse entre sí te obligan a gestionar una red a mano, a arrancarlos en el orden correcto y a recordar ambas líneas. Compose hace que la relación sea declarativa:

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

El servicio `api` alcanza la base de datos en el nombre de host `db` sin ningún cableado adicional. Eso es la red predeterminada implícita haciendo su trabajo; más abajo lo vemos en detalle. Y como todo es un archivo, puedes pasar el linter a la CI que lo construye y lo despliega; si tu pipeline ejecuta `docker compose up` en un job, el [GitLab CI Validator](/gitlab-ci-validator) detectará un `.gitlab-ci.yml` mal formado antes de que lo haga el runner.

![Ilustración synthwave: un comando docker run de una sola línea en un ordenador retro migra a lo largo de una flecha de neón hacia una pila multicontenedor de Docker Compose en otro](/blog/in-content/docker-run-vs-compose.webp)

## En el otro sentido: de Compose a docker run

La migración no es de un solo sentido. Te encontrarás con casos en los que tienes un servicio de Compose pero necesitas una sola línea de `docker run`:

- Un compañero en una máquina sin tu archivo de Compose, que solo necesita el contenedor en marcha *ya*.
- Un ticket de soporte o un runbook donde un comando de copiar y pegar es mejor que "clona el repo y luego ejecuta compose".
- Un paso de CI restringido o un host remoto donde traerse todo el proyecto es excesivo.

Convertir un `compose service to docker run` es mecánico, pero engorroso de hacer a mano. Toma el servicio de Redis con un healthcheck:

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

El comando equivalente reconstruye cada campo y, lo más importante, se emite en modo desacoplado por defecto, porque un servicio de larga duración casi nunca es algo que quieras que acapare tu terminal:

```bash
docker run -d --name cache -p 6379:6379 -m 256m \
  -l app=web \
  --health-cmd 'redis-cli ping' \
  --health-interval 10s --health-timeout 3s --health-retries 5 \
  redis:7-alpine
```

El bloque healthcheck se expande de vuelta en los flags discretos `--health-*`; `mem_limit` se convierte en `-m`; las labels se convierten en `-l`. El conversor antepone `docker run -d` por ti precisamente porque el servicio estaba pensado para ejecutarse en segundo plano. Lo único que hay que vigilar: las claves exclusivas de Compose como `depends_on`, `build` y `deploy` no tienen equivalente en el comando, así que un conversor fiel las reporta como advertencias en lugar de inventar flags que no existen. Si tu servicio tiene `build:`, primero ejecutas `docker build` y le pasas el tag resultante a `docker run`.

## Migrar un comando real paso a paso

Tomemos una línea `docker run` no trivial y recorramos la migración de principio a fin. Aquí tienes un contenedor de aplicación en una red definida por el usuario con capacidades ajustadas:

```bash
docker run -d --name api \
  --network backend \
  -p 3000:3000 \
  -e NODE_ENV=production \
  --cap-add NET_ADMIN --cap-drop ALL \
  --add-host db:10.0.0.5 \
  myorg/api:1.4.0
```

**Paso 1: tokeniza, no lo hagas a ojo.** El comando se divide al estilo del shell: se respetan las comillas y las continuaciones con barra invertida y salto de línea, y los flags cortos agrupados como `-it` se expanden a `-i -t`. El primer token que no es un flag (`myorg/api:1.4.0`) es la imagen; cualquier cosa que venga después sería el comando del contenedor.

**Paso 2: clasifica cada flag en una clave.** Los puertos van a `ports`, `-e` a `environment`, `--cap-add`/`--cap-drop` a `cap_add`/`cap_drop`, `--add-host` a `extra_hosts` y `--network backend` a la lista `networks`.

**Paso 3: lee el resultado.**

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

Algo que el conversor deliberadamente *no* hace: inventar una sección `networks:` de nivel superior que no pediste. La red `backend` aparece bajo el servicio, exactamente con el nombre indicado. Si `backend` es una red que creaste con `docker network create`, tendrás que declararla tú mismo como `external` en el nivel superior; la herramienta no va a adivinar infraestructura que no escribiste. Esa contención es precisamente el objetivo; un conversor que alucina estructura es peor que uno que solo convierte lo que le diste.

## Errores frecuentes al migrar

Los flags en sí se corresponden de forma limpia. El comportamiento que los rodea es donde las migraciones salen mal sin hacer ruido.

### La red predeterminada implícita

Un `docker run` sin más, sin `--network`, conecta el contenedor a la red `bridge` predeterminada, donde los contenedores solo se alcanzan entre sí por IP. Compose es distinto: crea una red *con alcance de proyecto* y pone en ella todos los servicios, de modo que los servicios se resuelven entre sí por nombre de servicio (`db`, `api`) desde el primer momento. Eso suele ser justo lo que quieres, pero implica que un `docker run` que hablaba con `172.17.0.3` tiene que pasar a hablar con `db` una vez que es un servicio de Compose. Migrar el flag es fácil; migrar la suposición de que "hay un único bridge plano" es la parte que muerde.

### Diferencias en la política de reinicio

`--restart` se traslada directamente: `no`, `always`, `on-failure` y `unless-stopped` pasan a `restart:` sin cambios:

```yaml
restart: unless-stopped
```

El matiz: con `docker run`, la política de reinicio es lo *único* que mantiene vivo tu contenedor tras un reinicio del daemon. Con Compose se aplica el mismo valor de `restart:`, pero además dispones de `docker compose up`/`down` como ciclo de vida explícito. No des por hecho que `restart: always` significa "Compose lo volverá a levantar después de que ejecute `down`": `down` elimina el contenedor de todos modos. La política de reinicio rige los fallos y los reinicios, no tus propios comandos de desmontaje.

### env_file vs -e

Los flags `-e KEY=value` en línea se convierten en una lista `environment:`, y `--env-file path` se convierte en `env_file:`. No son intercambiables:

```yaml
services:
  api:
    image: myorg/api:1.4.0
    env_file:
      - .env.production
    environment:
      - NODE_ENV=production    # prevalece sobre la misma clave en env_file
```

Los valores en línea son visibles en el archivo y en `docker inspect`; un `env_file` mantiene los valores que contienen secretos fuera del YAML y fuera del historial de tu shell. Cuando migres, este es un buen momento para mover los secretos de los flags `-e` a un `env_file`. Ya que estás, asegúrate de que el `.env.example` confirmado coincide de verdad con las claves que lee tu servicio; el [Env Example Checker](/env-example-checker) compara un `.env` real con su ejemplo para que una clave que falte no acabe apareciendo como una caída en un checkout limpio.

### Modo desacoplado

`-d` / `--detach` no existe en un archivo de Compose, porque desacoplar es una decisión del momento de lanzamiento, no una propiedad del servicio. Al ir de `docker run → compose`, el `-d` se descarta (en su lugar ejecutas `docker compose up -d`). Al ir de `compose → docker run`, un conversor fiel *añade* `-d` de vuelta, porque la definición de un servicio casi siempre describe un proceso de larga duración. Ambos comportamientos son correctos; solo parecen asimétricos hasta que entiendes por qué. Si te encuentras con que "falta" un `-d` perdido en el YAML generado, eso es la herramienta acertando, no perdiendo tu flag.

## Convierte en ambas direcciones al instante

Hacer esto a mano está bien para un contenedor. Deja de estar bien cuando estás traduciendo un muro de flags `-p`, `-v` y `-e` bajo presión de tiempo y se cuela una lista mal anidada o un puerto sin comillas.

El [conversor Docker Run to Compose](/docker-run-to-compose) hace la parte mecánica en ambos sentidos: pega un comando `docker run` para obtener el servicio `docker-compose.yml` equivalente, o pega un servicio de Compose para reconstruir la línea de run, incluyendo puertos, volúmenes, environment, redes, capacidades, límites de recursos y healthchecks. Te avisa de los flags y las claves que realmente no se corresponden en lugar de descartarlos en silencio, y se ejecuta por completo en tu navegador, de modo que los comandos que nombran registros privados o llevan variables de entorno con secretos nunca salen de la pestaña.

Migra el comando, lee las advertencias, confirma el archivo.

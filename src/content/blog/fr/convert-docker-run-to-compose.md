---
title: "Comment convertir une commande docker run en docker-compose.yml"
description: "Convertissez n'importe quelle commande docker run en service docker-compose.yml, drapeau par drapeau — ports, volumes, environnement, redémarrage et plus encore. Un guide pratique, prêt à copier-coller."
pubDate: 2026-06-09
tags: ["docker","docker-compose","containers"]
lang: fr
translationOf: "convert-docker-run-to-compose"
relatedTool:
  name: "Docker Run to Compose"
  href: "/docker-run-to-compose"
---

![Convertir une commande docker run en service docker-compose.yml, drapeau par drapeau](/blog/convert-docker-run-to-compose-hero.svg)

Vous avez démarré un conteneur avec une rapide ligne `docker run` pendant une session de débogage. Ça a marché. Maintenant quelqu'un veut le voir dans le dépôt, relisible dans une PR, démarrable en une seule commande — et vous vous retrouvez avec une ligne unique de 200 caractères, truffée de `-p`, de trois montages `-v`, d'une demi-douzaine de drapeaux `-e` et d'une politique `--restart` qu'il faut désormais convertir en `docker-compose.yml`. C'est le moment où la plupart des gens ouvrent la documentation et commencent à traduire à la main, et c'est exactement là que des drapeaux passent à la trappe, que des ports sont mal mis entre guillemets et que des listes se retrouvent mal imbriquées.

Ce guide explique comment convertir une commande `docker run` en `docker-compose.yml` drapeau par drapeau, y compris les pièges qui vous mordent quand vous le faites à la main. Chaque correspondance présentée ici reflète ce que le [convertisseur Docker Run to Compose](/docker-run-to-compose) produit réellement, vous pouvez donc lire les règles puis coller votre commande dans l'outil pour éviter la partie mécanique.

## Pourquoi passer de docker run à Compose

Une commande `docker run` est un très bon moyen de démarrer un conteneur de manière interactive. Elle cesse de l'être dès que l'une de ces conditions est vraie :

- L'invocation exacte doit vivre dans le gestionnaire de versions pour qu'un collègue puisse la reproduire.
- Vous voulez la faire relire — un diff YAML est bien plus facile à lire dans une PR qu'un mur de drapeaux sur une seule ligne.
- Le conteneur a des dépendances, ou vous ajouterez bientôt un second service.
- Vous voulez taper `docker compose up -d` au lieu de vous rappeler la commande complète à chaque fois.

Compose ne change pas ce que fait le conteneur. Il donne simplement à la même configuration une forme déclarative et comparable. La traduction est presque entièrement mécanique — ce qui est précisément pour quoi il vaut mieux maîtriser les règles plutôt que de faire ça à l'œil.

## L'anatomie d'une commande docker run

En voici une vraie. Postgres, port publié, volume nommé, deux variables d'environnement, une politique de redémarrage :

```bash
docker run -d --name db \
  -e POSTGRES_PASSWORD=secret \
  -e POSTGRES_DB=app \
  -p 5432:5432 \
  -v pgdata:/var/lib/postgresql/data \
  --restart unless-stopped \
  postgres:16
```

Lue de gauche à droite, une commande `docker run` se compose de trois parties :

1. **`docker run`** — le préfixe de la commande.
2. **Les drapeaux** — tout ce qui commence par `-` ou `--`, dans n'importe quel ordre. Chaque drapeau prend soit une valeur (`-p 5432:5432`), soit est un booléen (`-d`).
3. **L'image, puis la commande** — le *premier* jeton qui n'est pas un drapeau est l'image (`postgres:16`). Tout ce qui suit est la commande à exécuter à l'intérieur du conteneur, transmise telle quelle.

Cet ordre a son importance. Dès que l'analyseur atteint l'image, le balayage des drapeaux s'arrête — `docker run ... postgres:16 -p 80:80` traite `-p 80:80` comme des arguments du conteneur, et non comme un port publié. Gardez vos drapeaux *avant* l'image.

Les drapeaux courts groupés sont l'autre chose à savoir. `-it` représente deux drapeaux (`-i` et `-t`), et `-itp 8080:80` en représente trois : `-i`, `-t` et `-p 8080:80`. Un drapeau qui prend une valeur comme `-p` consomme le reste du groupe (ou le jeton suivant) comme argument.

## Faire correspondre chaque drapeau docker run à docker-compose.yml

C'est le cœur de la conversion d'une commande `docker run` vers compose : chaque drapeau correspond à une clé sous le service. Voici la table de correspondance complète pour les drapeaux que vous rencontrerez vraiment.

![Une correspondance montrant les drapeaux docker run à gauche reliés par des flèches à leurs clés docker-compose.yml à droite](/blog/convert-docker-run-to-compose-diagram.svg)

| Drapeau `docker run` | Clé `docker-compose.yml` | Notes |
|---|---|---|
| `-p` / `--publish` | `ports` | Chaîne entre guillemets, par ex. `"8080:80"` |
| `-v` / `--volume`, `--mount` | `volumes` | Forme courte `source:target[:ro]` |
| `-e` / `--env` | `environment` | Liste `KEY=value` |
| `--env-file` | `env_file` | Un ou plusieurs fichiers |
| `--name` | `container_name` | Devient aussi la clé du service |
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
| `--rm`, `-d` / `--detach` | — | Aucun équivalent Compose (ignoré) |

Quelques-uns de ces drapeaux méritent un examen plus attentif.

### -p → ports

Chaque `-p` devient une entrée sous `ports:`, écrite sous la forme d'une chaîne `"HOST:CONTAINER"` **entre guillemets** :

```yaml
ports:
  - "5432:5432"
```

Les guillemets ne sont pas optionnels. Un `5432:5432` nu est interprété par les analyseurs YAML 1.1 comme un nombre sexagésimal (base 60), ce qui corrompt silencieusement la correspondance. C'est l'un des bugs de conversion manuelle les plus courants, alors mettez toujours les ports entre guillemets.

### -v / --volume et --mount → volumes

`-v` conserve sa forme courte `source:target[:ro]` telle quelle :

```yaml
volumes:
  - pgdata:/var/lib/postgresql/data
  - /data:/usr/share/nginx/html:ro
```

Une forme longue `--mount type=bind,source=/data,target=/app,readonly` est réduite à la même forme courte `source:target:ro`. Les volumes nommés et les bind mounts sont conservés exactement comme écrits — la conversion n'invente pas une déclaration `volumes:` de premier niveau que vous n'avez pas demandée (plus de détails dans les pièges).

### -e / --env-file → environment / env_file

Chaque `-e KEY=value` devient une ligne `KEY=value` sous `environment:`, et chaque `--env-file` correspond à `env_file:` :

```yaml
environment:
  - POSTGRES_PASSWORD=secret
  - POSTGRES_DB=app
env_file:
  - .env
```

Quand vous déplacez l'environnement de la ligne de commande vers des fichiers, il vaut la peine de vérifier que vos `.env` et `.env.example` n'ont pas divergé — l'[Env Example Checker](/env-example-checker) signale les clés présentes dans l'un mais pas dans l'autre, pour qu'une variable manquante ne se manifeste pas sous forme d'erreur à l'exécution.

### --restart, --name, -w, -u

Ce sont des correspondances scalaires directes, une pour une :

```yaml
restart: unless-stopped
container_name: db
working_dir: /work
user: 1000:1000
```

`--name` joue un double rôle : il définit `container_name` *et* devient la clé du service (`services: { db: ... }`). En l'absence de `--name`, le service est indexé sous la clé `app`.

### --network → networks (ou network_mode)

Un réseau nommé devient une entrée de la liste `networks:`. Mais `host` et `none` sont spéciaux — ce sont des *modes* réseau, pas des réseaux, ils correspondent donc à `network_mode` à la place :

```yaml
# docker run --network backend
networks:
  - backend

# docker run --network host
network_mode: host
```

### --cap-add, --cap-drop, --add-host

Les capabilities et les entrées d'hôtes se regroupent chacune dans une liste :

```yaml
cap_add:
  - NET_ADMIN
cap_drop:
  - ALL
extra_hosts:
  - db:10.0.0.5
```

### --health-* → healthcheck

Les drapeaux `--health-*` s'assemblent en un seul bloc `healthcheck:`. La commande devient un test `CMD-SHELL` :

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

Les drapeaux de ressources correspondent à `mem_limit` et `cpus` :

```yaml
mem_limit: 256m
cpus: "1.5"
```

Ce sont les limites de style v2 que Compose respecte directement. Lorsque vous finirez par migrer ce conteneur vers Kubernetes, ces chiffres deviendront les requests et limits du pod — le [Kubernetes Resource Calculator](/kubernetes-resource-calculator) transforme une valeur de mémoire et de CPU en valeurs `requests`/`limits` sûres, pour que vous n'ayez pas à deviner la conversion.

### Les drapeaux sans équivalent Compose

`--rm` et `-d` / `--detach` décrivent comment *vous* avez invoqué le conteneur, pas comment il est configuré, ils n'ont donc pas leur place dans une définition de service. Ils sont ignorés — mais vous devez savoir pourquoi :

- `--rm` (suppression à la sortie) est sans objet, car Compose gère le cycle de vie.
- `-d` / `--detach` est remplacé par la façon dont vous démarrez la stack : `docker compose up -d`.

![Illustration : une commande docker run sur un terminal rétro, dont les drapeaux circulent d'écran en écran jusqu'à se recomposer en un service docker-compose.yml](/blog/in-content/convert-docker-run-to-compose.webp)

## Un exemple complet, étape par étape

Prenez cette commande plus longue — un service d'API sur un réseau utilisateur, avec environnement, capabilities et une entrée d'hôte supplémentaire :

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

En appliquant la table de correspondance drapeau par drapeau — et en ignorant `-d` avec une note — on obtient ce service :

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

Remarquez ce qui a été repris et ce qui ne l'a pas été. `--name api` a défini à la fois la clé du service et `container_name`. Le port est entre guillemets. `-d` a disparu — vous démarrerez ceci avec `docker compose up -d`. Tout le reste est une traduction directe drapeau-vers-clé, dans l'ordre fixe et lisible qu'attendent les conventions de Compose.

## Pièges lorsque vous convertissez docker run -p -v -e vers compose

La correspondance est mécanique, mais une poignée de détails font trébucher les gens.

**Volumes nommés vs bind mounts.** Les deux utilisent la même syntaxe `-v`, ils atterrissent donc dans la même liste `volumes:` — mais ils ne veulent pas dire la même chose. `-v /data:/app` est un *bind mount* d'un chemin de l'hôte ; `-v pgdata:/app` est un *volume nommé* géré par Docker. Un simple chemin relatif ou absolu commençant par `/` (ou `.`) est un bind mount ; un simple nom est un volume. La conversion conserve la chaîne exactement comme écrite et ne synthétise **pas** le bloc `volumes:` de premier niveau dont les volumes nommés ont techniquement besoin. Compose créera implicitement un volume quasi anonyme, mais si vous le voulez explicite et partageable, ajoutez-le vous-même :

```yaml
services:
  db:
    image: postgres:16
    volumes:
      - pgdata:/var/lib/postgresql/data
volumes:
  pgdata:
```

**Précédence de l'environnement.** Si vous utilisez à la fois `environment` et `env_file`, les valeurs définies en ligne dans `environment` l'emportent sur la même clé d'un fichier d'environnement. Et ni l'un ni l'autre ne remplace une variable déjà définie dans le shell au moment où vous lancez `docker compose up`, à moins que vous ne la référenciez. Gardez les secrets hors de `environment:` (qui est versionné) et dans `env_file:` (ignoré par git) — et vérifiez les clés du fichier avec l'[Env Example Checker](/env-example-checker) avant de livrer.

**Modes réseau host et none.** Comme indiqué plus haut, `--network host` et `--network none` ne sont pas des réseaux — ce sont des modes. Mettre `host` dans une liste `networks:` est invalide ; il faut `network_mode: host`. C'est le genre de chose facile à manquer à la main, parce que l'orthographe du drapeau est identique à un `--network backend` normal.

**Ports : publish vs expose.** `-p` *publie* un port vers l'hôte (`ports:`), ce qui est presque toujours ce que vous voulez dire. Il n'existe pas d'équivalent `-p`-sans-côté-hôte du `expose:` de Compose (de conteneur à conteneur uniquement, sans liaison à l'hôte) — `expose` provient de la directive `EXPOSE` de l'image ou d'une clé `expose:` explicite, pas de `docker run -p`. Ne vous tournez pas vers `expose:` en convertissant un drapeau `-p` ; c'est `ports:` que vous voulez.

## Convertissez-la instantanément

Les règles ci-dessus sont tout ce dont vous avez besoin pour faire ça à la main. Mais la conversion manuelle est exactement l'endroit où un drapeau passe à la trappe, où un port perd ses guillemets, ou où `--network host` finit dans la mauvaise clé — et vous ne le découvrez que lorsque le conteneur se comporte différemment de la commande d'origine.

Le [convertisseur Docker Run to Compose](/docker-run-to-compose) fait la traduction mécanique à votre place. Il découpe la commande en jetons comme le ferait un shell — en respectant les guillemets, les drapeaux courts groupés comme `-it` et les continuations antislash-saut de ligne —, fait correspondre chaque drapeau à la clé Compose adéquate, et produit un YAML déterministe. Les drapeaux sans équivalent (`--rm`, `-d`) reviennent sous forme d'avertissements au lieu de disparaître en silence, de sorte que rien ne s'évapore sans que vous le sachiez. Il fonctionne aussi en sens inverse : collez un service Compose et récupérez une ligne `docker run` équivalente.

Tout se passe dans votre navigateur, vous pouvez donc coller des commandes qui nomment des registres privés ou qui transportent des valeurs `-e` porteuses de secrets sans que rien ne quitte l'onglet. Collez votre commande, lisez les avertissements et committez le résultat.

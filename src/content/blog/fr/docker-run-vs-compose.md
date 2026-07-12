---
title: "docker run face à Docker Compose : guide pratique de migration"
description: "Quand utiliser docker run, quand passer à Docker Compose, et comment convertir de l'un vers l'autre dans les deux sens — en gérant correctement les volumes, les réseaux et la reproductibilité."
pubDate: 2026-06-10
tags: ["docker","docker-compose","containers"]
lang: fr
translationOf: "docker-run-vs-compose"
relatedTool:
  name: "Docker Run to Compose"
  href: "/docker-run-to-compose"
---

![Schéma comparant docker run et Docker Compose : une seule commande docker run à gauche et le service docker-compose.yml équivalent à droite, avec des flèches de conversion bidirectionnelles](/blog/docker-run-vs-compose-hero.svg)

Vous avez lancé un conteneur Postgres il y a trois semaines avec une commande `docker run` sur une seule ligne. Ça marche. Puis vous redémarrez la machine, ou un collègue a besoin de la même configuration, ou vous voulez mettre la commande sous gestion de version — et vous réalisez que la seule copie de cette commande se trouve dans l'historique de votre shell, quelque part entre un `ls` et un `kubectl get pods`. C'est le moment où la question `docker run` face à `docker compose` cesse d'être théorique. Le conteneur fonctionne très bien ; c'est la façon dont vous l'avez lancé qui n'est pas reproductible.

Ce guide parcourt les deux sens : quand `docker run` est le bon choix, quand passer à un `docker-compose.yml`, et comment reconvertir un service Compose en une seule ligne run lorsque vous en avez besoin. Chaque correspondance de flag présentée ici reflète ce que fait réellement le [convertisseur Docker Run to Compose](/docker-run-to-compose), vous pouvez donc vérifier vos propres commandes par rapport à lui.

## Le même conteneur, deux écritures

Voici un vrai conteneur Postgres exprimé sous forme de commande `docker run` :

```bash
docker run -d --name db \
  -e POSTGRES_PASSWORD=secret -e POSTGRES_DB=app \
  -p 5432:5432 \
  -v pgdata:/var/lib/postgresql/data \
  --restart unless-stopped \
  postgres:16
```

Et voici exactement le même conteneur sous forme de service Compose :

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

![Un même conteneur présenté dans deux formats — une seule commande docker run à gauche et une arborescence de service docker-compose.yml à droite — avec des flèches de conversion bidirectionnelles](/blog/docker-run-vs-compose-diagram.svg)

Même image, mêmes ports, même volume nommé, même politique de redémarrage. La différence ne réside pas dans ce qui s'exécute — elle réside dans le fait que la définition vive dans l'historique de votre shell ou dans un fichier que vous pouvez committer, relire et relancer d'une seule commande. Notez les guillemets autour de `"5432:5432"` : sans eux, YAML interpréterait un `5432:5432` brut comme un nombre sexagésimal (base 60), l'un de ces petits bugs que la conversion manuelle adore introduire.

## Les points forts de docker run

`docker run` l'emporte pour tout ce qui est jetable. Vous voulez un client psql à usage unique, un Redis rapide pour expérimenter, une image de base dans laquelle vous plonger pour déboguer — vous n'avez pas envie de rédiger un fichier YAML pour ça.

```bash
# expérimenter sur un redis tout frais pendant trente secondes
docker run --rm -it redis:7-alpine redis-cli

# déboguer à l'intérieur d'une image sans rien laisser derrière soi
docker run --rm -it -v "$PWD":/work -w /work ubuntu:24.04 bash
```

Le flag `--rm` a son importance ici : le conteneur se supprime lui-même à la sortie, vous n'accumulez donc pas de conteneurs morts issus de vos expériences. C'est une préoccupation typiquement « à la `docker run` » — et, fait notable, `--rm` n'a aucun équivalent Compose, parce que Compose gère pour vous le cycle de vie des conteneurs. Si vous collez une commande contenant `--rm` dans un convertisseur, la chose honnête à faire est de l'abandonner avec un avertissement plutôt que de prétendre qu'il correspond à quelque chose. C'est exactement ce que fait le convertisseur.

Il en va de même pour `-d` / `--detach`. Le mode détaché est une propriété de *la façon dont vous avez lancé le processus*, pas de la définition du service ; il n'a donc pas non plus sa place dans le YAML. Nous y reviendrons dans la section sur les pièges, car cela déroute les gens dans les deux sens.

## Ce que Compose vous apporte : quand utiliser Docker Compose

Tournez-vous vers Compose dès que l'une de ces conditions est vraie — et « quand utiliser Docker Compose » se résume généralement à cette liste :

- Vous allez exécuter ce conteneur plus d'une fois et vous voulez qu'il soit reproductible.
- Vous voulez la définition sous gestion de version et relue dans une PR.
- Vous avez plus d'un conteneur qui doivent démarrer ensemble.
- Vous en avez assez de retenir une commande de 200 caractères.

Un fichier Compose transforme un mur de flags en un document relisable et en un cycle de vie unique :

```bash
docker compose up -d     # tout démarrer, en mode détaché
docker compose down      # tout arrêter et supprimer
docker compose logs -f   # suivre les logs de chaque service
```

C'est avec le multi-service que l'écart se creuse vraiment. Deux commandes `docker run` qui ont besoin de communiquer entre elles vous obligent à gérer un réseau à la main, à les démarrer dans le bon ordre et à retenir les deux lignes. Compose rend la relation déclarative :

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

Le service `api` atteint la base de données via le nom d'hôte `db` sans aucun câblage supplémentaire. C'est le réseau implicite par défaut qui fait son travail — nous y reviendrons plus bas. Et parce que l'ensemble est un fichier, vous pouvez linter la CI qui le construit et le livre ; si votre pipeline exécute `docker compose up` dans un job, le [GitLab CI Validator](/gitlab-ci-validator) détectera un `.gitlab-ci.yml` malformé avant que le runner ne le fasse.

![Illustration synthwave : une commande docker run sur une seule ligne affichée sur un ordinateur rétro migre le long d'une flèche néon vers une pile multi-conteneurs Docker Compose sur un autre](/blog/in-content/docker-run-vs-compose.webp)

## Le sens inverse : de Compose vers docker run

La migration n'est pas à sens unique. Vous rencontrerez des cas où vous disposez d'un service Compose mais avez besoin d'une seule ligne `docker run` :

- Un collègue sur une machine sans votre fichier Compose, qui a juste besoin du conteneur en route *maintenant*.
- Un ticket de support ou un runbook où une commande à copier-coller vaut mieux que « clone le dépôt, puis lance compose ».
- Une étape de CI contrainte ou un hôte distant où récupérer tout le projet est excessif.

Convertir un `compose service to docker run` est mécanique mais délicat à faire à la main. Prenons le service Redis avec un healthcheck :

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

La commande équivalente reconstruit chaque champ — et, point crucial, elle est émise en mode détaché par défaut, car un service à longue durée de vie n'est presque jamais quelque chose que vous voulez voir accaparer votre terminal :

```bash
docker run -d --name cache -p 6379:6379 -m 256m \
  -l app=web \
  --health-cmd 'redis-cli ping' \
  --health-interval 10s --health-timeout 3s --health-retries 5 \
  redis:7-alpine
```

Le bloc healthcheck se redéploie en flags `--health-*` distincts ; `mem_limit` devient `-m` ; les labels deviennent `-l`. Le convertisseur préfixe `docker run -d` pour vous précisément parce que le service était censé s'exécuter en arrière-plan. Le seul point de vigilance : les clés propres à Compose comme `depends_on`, `build` et `deploy` n'ont aucun équivalent en ligne de commande, donc un convertisseur fidèle les signale comme avertissements plutôt que d'inventer des flags qui n'existent pas. Si votre service comporte `build:`, vous exécutez d'abord `docker build` et fournissez le tag résultant à `docker run`.

## Migrer une vraie commande étape par étape

Prenons une ligne `docker run` non triviale et déroulons la migration de bout en bout. Voici un conteneur applicatif sur un réseau défini par l'utilisateur, avec des capacités ajustées :

```bash
docker run -d --name api \
  --network backend \
  -p 3000:3000 \
  -e NODE_ENV=production \
  --cap-add NET_ADMIN --cap-drop ALL \
  --add-host db:10.0.0.5 \
  myorg/api:1.4.0
```

**Étape 1 — tokeniser, pas évaluer à l'œil.** La commande est découpée à la manière du shell : les guillemets et les continuations antislash-saut de ligne sont respectés, et les flags courts groupés comme `-it` sont développés en `-i -t`. Le premier token qui n'est pas un flag (`myorg/api:1.4.0`) est l'image ; tout ce qui le suit serait la commande du conteneur.

**Étape 2 — classer chaque flag sous une clé.** Les ports vont à `ports`, `-e` à `environment`, `--cap-add`/`--cap-drop` à `cap_add`/`cap_drop`, `--add-host` à `extra_hosts`, et `--network backend` à la liste `networks`.

**Étape 3 — lire le résultat.**

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

Une chose que le convertisseur ne fait délibérément *pas* : inventer une section `networks:` de premier niveau que vous n'avez pas demandée. Le réseau `backend` apparaît sous le service, exactement tel qu'il est nommé. Si `backend` est un réseau que vous avez créé avec `docker network create`, vous devrez le déclarer vous-même comme `external` au premier niveau — l'outil ne devinera pas une infrastructure que vous n'avez pas écrite. Cette retenue est tout l'enjeu ; un convertisseur qui hallucine de la structure est pire qu'un convertisseur qui ne convertit que ce que vous lui avez donné.

## Pièges lors de la migration

Les flags eux-mêmes se mappent proprement. C'est le comportement qui les entoure qui fait que les migrations tournent mal en silence.

### Le réseau implicite par défaut

Un simple `docker run` sans `--network` rattache le conteneur au réseau `bridge` par défaut, où les conteneurs ne s'atteignent les uns les autres que par IP. Compose, lui, est différent : il crée un réseau *à la portée du projet* et y place chaque service, de sorte que les services se résolvent mutuellement par nom de service (`db`, `api`) d'emblée. C'est généralement ce que vous voulez — mais cela signifie qu'un `docker run` qui parlait à `172.17.0.3` doit se mettre à parler à `db` une fois devenu un service Compose. Migrer le flag est facile ; migrer l'hypothèse selon laquelle « il n'y a qu'un seul bridge plat » est la partie qui pique.

### Différences de politique de redémarrage

`--restart` se mappe directement — `no`, `always`, `on-failure` et `unless-stopped` se reportent tous tels quels sur `restart:` :

```yaml
restart: unless-stopped
```

La subtilité : avec `docker run`, la politique de redémarrage est la *seule* chose qui maintient votre conteneur en vie après un redémarrage du démon. Avec Compose, la même valeur `restart:` s'applique, mais vous disposez en plus de `docker compose up`/`down` comme cycle de vie explicite. Ne supposez pas que `restart: always` signifie « Compose va le relancer après que j'ai exécuté `down` » — `down` supprime le conteneur quoi qu'il arrive. La politique de redémarrage régit les plantages et les redémarrages, pas vos propres commandes de démantèlement.

### env_file face à -e

Les flags `-e KEY=value` en ligne deviennent une liste `environment:`, et `--env-file path` devient `env_file:`. Ils ne sont pas interchangeables :

```yaml
services:
  api:
    image: myorg/api:1.4.0
    env_file:
      - .env.production
    environment:
      - NODE_ENV=production    # l'emporte sur la même clé dans env_file
```

Les valeurs en ligne sont visibles dans le fichier et dans `docker inspect` ; un `env_file` garde les valeurs porteuses de secrets hors du YAML et hors de l'historique de votre shell. Lorsque vous migrez, c'est le bon moment pour déplacer les secrets des flags `-e` vers un `env_file`. Tant que vous y êtes, assurez-vous que le `.env.example` committé correspond bien aux clés que votre service lit — l'[Env Example Checker](/env-example-checker) compare un vrai `.env` à son exemple pour qu'une clé manquante ne se manifeste pas sous forme de plantage lors d'un nouveau clonage.

### Mode détaché

`-d` / `--detach` n'existe pas dans un fichier Compose, car le détachement est un choix au moment du lancement, pas une propriété du service. Dans le sens `docker run → compose`, le `-d` est abandonné (vous exécutez `docker compose up -d` à la place). Dans le sens `compose → docker run`, un convertisseur fidèle *rajoute* le `-d`, car une définition de service décrit presque toujours un processus de longue durée. Les deux comportements sont corrects ; ils paraissent simplement asymétriques jusqu'à ce que vous en compreniez la raison. Si vous trouvez un `-d` égaré « manquant » dans le YAML généré, c'est que l'outil a raison, pas qu'il perd votre flag.

## Convertir dans les deux sens instantanément

Le faire à la main convient pour un seul conteneur. Cela cesse de convenir lorsque vous traduisez un mur de flags `-p`, `-v` et `-e` sous la pression du temps et qu'une liste mal imbriquée ou un port sans guillemets passe au travers.

Le [convertisseur Docker Run to Compose](/docker-run-to-compose) prend en charge la partie mécanique dans les deux sens : collez une commande `docker run` pour obtenir le service `docker-compose.yml` équivalent, ou collez un service Compose pour reconstruire la ligne run — y compris les ports, volumes, variables d'environnement, réseaux, capacités, limites de ressources et healthchecks. Il vous signale les flags et les clés qui ne se mappent réellement pas plutôt que de les abandonner silencieusement, et il s'exécute entièrement dans votre navigateur, de sorte que les commandes nommant des registres privés ou portant des variables d'environnement contenant des secrets ne quittent jamais l'onglet.

Migrez la commande, lisez les avertissements, committez le fichier.

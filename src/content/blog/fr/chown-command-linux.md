---
title: "Commande chown sous Linux : changer le propriétaire et le groupe"
description: "La commande chown sous Linux expliquée : syntaxe user:group, chown -R et liens symboliques, --reference, chgrp, chmod vs chown, et corriger les permissions des volumes Docker avec des ID numériques."
pubDate: 2026-10-04
tags: ["linux", "security", "devops"]
lang: fr
translationOf: "chown-command-linux"
relatedTool:
  name: "chmod Calculator"
  href: "/chmod-calculator"
---

![Une clé qui transmet un dossier d'un utilisateur à un autre](/blog/chown-command-linux-hero.svg)
<!-- keywords: chown command | chown recursive, chown -R, chown linux, chmod vs chown | source: ahrefs free (2026-10-04) -->

Les permissions disent *ce que* le propriétaire, le groupe et tous les autres ont le droit de faire. La propriété dit *qui* sont le propriétaire et le groupe. Quand un fichier a un mode parfaitement raisonnable comme `600` et qu'un service n'arrive toujours pas à le lire, le mode est rarement en cause : le fichier appartient au mauvais utilisateur. C'est ce que corrige `chown`.

Cet article couvre la syntaxe du propriétaire et du groupe, les changements récursifs et les règles de liens symboliques qui les accompagnent, la copie de la propriété depuis un autre fichier, `chgrp`, le partage des rôles entre chown et chmod, et le cas réel le plus fréquent : un conteneur qui ne peut pas écrire dans son propre volume.

## La syntaxe

```bash
chown [options] PROPRIÉTAIRE[:GROUPE] FICHIER...
chown [options] --reference=FICHIER_REF FICHIER...
```

Le propriétaire et le groupe s'écrivent ensemble, sans espace, et chacun peut être un nom ou un ID numérique. Les formes diffèrent sur des points petits mais importants :

| Vous écrivez | Le propriétaire devient | Le groupe devient |
|---|---|---|
| `chown deploy fichier` | `deploy` | inchangé |
| `chown deploy:web fichier` | `deploy` | `web` |
| `chown deploy: fichier` | `deploy` | le groupe de connexion de `deploy` |
| `chown :web fichier` | inchangé | `web` (comme `chgrp web fichier`) |
| `chown 1000:1000 fichier` | UID 1000 | GID 1000 |

Le deux-points final de `deploy:` passe facilement inaperçu, et il est utile : il fixe le groupe au groupe principal de l'utilisateur sans que vous ayez à le chercher. D'anciens scripts utilisent parfois un point (`deploy.web`). GNU chown l'accepte encore avec un avertissement, mais c'est ambigu pour les noms d'utilisateur contenant un point : utilisez le deux-points.

## Qui a le droit de l'exécuter

Changer le **propriétaire** d'un fichier exige root (plus précisément la capability `CAP_CHOWN`). Un utilisateur ordinaire ne peut pas céder un fichier, même un des siens ; sinon, n'importe qui pourrait contourner les quotas disque ou déposer des fichiers au nom d'un autre. C'est pourquoi la plupart des commandes `chown` de la documentation commencent par `sudo`.

Changer seulement le **groupe** est permis au propriétaire du fichier, à condition qu'il soit membre du groupe cible. root peut attribuer n'importe quel groupe.

## Options utiles

- `-R`, `--recursive` : modifier un répertoire et tout ce qu'il contient.
- `-v`, `--verbose` : signaler chaque fichier traité ; `-c`, `--changes` ne signale que les fichiers dont la propriété a réellement changé.
- `-h`, `--no-dereference` : modifier le lien symbolique lui-même plutôt que le fichier vers lequel il pointe.
- `--reference=FICHIER` : copier le propriétaire et le groupe d'un autre fichier.
- `--from=PROPRIÉTAIRE[:GROUPE]` : ne modifier que les fichiers qui ont actuellement ce propriétaire et ce groupe.
- `--preserve-root` : refuser de s'exécuter récursivement sur `/`. Utile dans tout script qui construit son chemin à partir d'une variable.

## chown -R : propriété récursive

Le cas récursif de tous les jours consiste à confier le répertoire d'une application à l'utilisateur qui l'exécute :

```bash
sudo chown -R www-data:www-data /var/www/site
```

Contrairement à `chmod -R`, le `chown` récursif n'a pas de piège fichiers contre répertoires, puisque les uns et les autres veulent le même propriétaire. Le danger, c'est le chemin. `sudo chown -R deploy: /` avec une espace en trop, ou un `$APP_DIR` qui s'étend à une chaîne vide, réécrit la propriété de tout le système et se rattrape très difficilement. Mettez les variables entre guillemets, testez-les et utilisez `--preserve-root`.

`--from` rend les changements récursifs plus sûrs quand vous ne visez qu'une partie des fichiers. Après le changement d'UID d'un utilisateur, par exemple, cette commande ne réattribue que les fichiers qui portent encore l'ancien :

```bash
sudo chown -R --from=1001 1005 /srv/data
```

## Liens symboliques : ce que chown modifie

Un lien symbolique a son propre propriétaire, distinct de celui de sa cible, et le comportement par défaut de chown dépend du mode récursif :

- **Non récursif :** `chown deploy lien` modifie la *cible*, pas le lien. Ajoutez `-h` pour modifier le lien lui-même.
- **Récursif :** `-R` ne suit pas les liens symboliques rencontrés dans l'arborescence (`-P` est le comportement par défaut). Ajoutez `-H` pour suivre les liens nommés sur la ligne de commande, ou `-L` pour suivre tout lien vers un répertoire.

Méfiez-vous de `-L`, et de `--dereference` combiné à `-R`. Si quelqu'un qui peut écrire dans l'arborescence y place un lien vers `/etc` pendant qu'un `chown -R -L` lancé par root la parcourt, le changement de propriété atterrit sur `/etc`. Pour les arborescences où d'autres peuvent écrire, gardez le comportement par défaut.

## --reference : copier la propriété d'un autre fichier

Quand un fichier doit ressembler à ses voisins, copiez la propriété au lieu de la taper :

```bash
sudo chown --reference=/etc/nginx/nginx.conf /etc/nginx/conf.d/api.conf
```

Si le fichier de référence est un lien symbolique, chown utilise le propriétaire et le groupe du fichier pointé. `chmod --reference` fait de même pour le mode : à eux deux, ils rendent un nouveau fichier identique à un fichier existant.

## chgrp

`chgrp web report.csv` ne modifie que le groupe. C'est exactement `chown :web report.csv`, avec les mêmes options `-R`, `-h` et `--reference`, et c'est pratique dans les scripts parce que l'intention est explicite. Associé au bit setgid sur un répertoire (`chmod g+s shared/`), il donne un dossier d'équipe où chaque nouveau fichier arrive dans le groupe de l'équipe.

## chown efface setuid et setgid

Sous Linux, changer le propriétaire ou le groupe d'un fichier exécutable efface ses bits setuid et setgid, et depuis le noyau 2.2.13 c'est vrai même quand root le fait. C'est une règle de sécurité : un binaire setuid ne doit pas se mettre discrètement à tourner sous un autre utilisateur. Si vous passez chown sur un fichier qui a réellement besoin de ces bits, repositionnez-les ensuite et vérifiez avec `ls -l` :

```bash
sudo chown root:root /usr/local/bin/helper
sudo chmod 4755 /usr/local/bin/helper
```

La documentation de GNU coreutils précise que le comportement exact dépend de l'appel système ; sur d'autres systèmes, vérifiez avant de vous y fier.

## chmod vs chown

Les deux commandes sont souvent confondues parce qu'elles corrigent le même symptôme, `Permission denied`, par deux côtés différents :

| | chmod | chown |
|---|---|---|
| Modifie | les bits de mode (`rwx` pour propriétaire, groupe, autres) | le propriétaire et le groupe |
| Question traitée | que peut faire chaque classe ? | qui fait partie de chaque classe ? |
| Qui peut l'utiliser | le propriétaire du fichier ou root | root pour le propriétaire ; le propriétaire pour les groupes dont il est membre |
| Cas typique | un script n'est pas exécutable | un utilisateur de service ne peut pas lire ses propres fichiers |

Une règle utile : si le mode semble adapté à l'usage (`600` pour une clé, `644` pour une configuration) mais que le processus échoue quand même, regardez le propriétaire. Élargir le mode à `777` « corrige » l'erreur en laissant entrer tout le monde, ce qui est un problème de sécurité, pas une correction. Le [guide de la commande chmod](/fr/blog/chmod-command-linux/) couvre l'autre côté, et des modes comme [`600`](/fr/chmod-calculator/600/), [`644`](/chmod-calculator/644/) et [`755`](/fr/chmod-calculator/755/) ont chacun une page qui explique qui peut faire quoi.

## Corriger les permissions des volumes Docker

Le problème de chown le plus fréquent dans le travail DevOps est un conteneur qui ne peut pas écrire dans un bind mount :

```text
mkdir: cannot create directory '/app/data/cache': Permission denied
```

La cause : le noyau stocke la propriété sous forme de nombres, pas de noms. Une image qui s'exécute avec un utilisateur non privilégié (les images officielles Node fournissent un utilisateur `node` d'UID 1000 ; l'image Postgres basée sur Debian tourne en UID 999) écrit avec cet UID, alors que le répertoire de l'hôte que vous avez monté appartient probablement à votre utilisateur ou à root. Les noms à l'intérieur et à l'extérieur du conteneur ne signifient rien les uns pour les autres ; seuls les nombres doivent correspondre.

Trouvez l'UID avec lequel le conteneur s'exécute, puis donnez le répertoire de l'hôte à cet UID :

```bash
docker run --rm my-image id          # uid=1000(node) gid=1000(node)
sudo chown -R 1000:1000 ./data
```

Utilisez ici la forme numérique. `chown -R node:node ./data` sur l'hôte échoue ou tombe sur l'utilisateur qui s'appelle `node` par hasard sur cette machine. L'alternative est de laisser les fichiers tels quels et d'exécuter le conteneur sous votre identité : `docker run --user "$(id -u):$(id -g)" …`, ou `user: "1000:1000"` dans Compose. Pour les volumes nommés, l'image fixe généralement la propriété à la première création du volume, si bien que le problème concerne surtout les bind mounts.

## Pour aller plus loin

La [section sur les permissions de Linux for DevOps](/learn/guides/linux-for-devops/#file-permissions-ownership) traite des utilisateurs, des groupes et de la propriété dans leur contexte. Pour choisir le mode d'un fichier une fois son propriétaire corrigé, le [chmod Calculator](/fr/chmod-calculator/) convertit entre les formes octale, symbolique et `ls -l` dans votre navigateur.

## Aide-mémoire chown

- [ ] `user:group` fixe les deux, `user:` prend le groupe de connexion de l'utilisateur, `:group` ne change que le groupe.
- [ ] Changer le propriétaire exige root ; changer le groupe exige d'être propriétaire et membre de ce groupe.
- [ ] Utilisez des ID numériques pour les conteneurs : la propriété est stockée en UID et GID, jamais en noms.
- [ ] `-h` modifie le lien symbolique lui-même ; sans `-R`, chown suit le lien par défaut.
- [ ] `-R` ne suit pas les liens dans l'arborescence ; évitez `-L` là où d'autres peuvent écrire.
- [ ] `--reference=FICHIER` copie la propriété ; `--from=` limite un changement au propriétaire actuel.
- [ ] chown efface setuid et setgid sur les exécutables ; repositionnez-les ensuite.
- [ ] Bon mode mais accès refusé : vérifiez le propriétaire avant de recourir à `chmod 777`.

---
title: "Commande chmod sous Linux : syntaxe, exemples et erreurs courantes"
description: "La commande chmod sous Linux expliquée : modes octal et symbolique, chmod +x, chmod -R et ses pièges, setuid, setgid et sticky bit, umask, et comment corriger Permission denied."
pubDate: 2026-10-03
tags: ["linux", "security", "devops"]
lang: fr
translationOf: "chmod-command-linux"
relatedTool:
  name: "chmod Calculator"
  href: "/chmod-calculator"
---

![Une grille de trois sur trois avec les bits de lecture, d'écriture et d'exécution pour le propriétaire, le groupe et les autres](/blog/chmod-command-linux-hero.svg)
<!-- keywords: chmod command | chmod +x, chmod recursive, chmod -R, chmod command in linux, linux chmod | source: ahrefs free (2026-10-04) -->

Un script de déploiement échoue avec `Permission denied`. Un dépôt fraîchement cloné refuse d'exécuter `./build.sh`. SSH rejette une clé parce que ses « permissions are too open ». Un serveur web renvoie 403 pour des fichiers qui sont bel et bien sur le disque. Chacun de ces cas se termine par la même commande, et la plupart du temps la correction tient en une ligne. Le problème, c'est que la mauvaise ligne, lancée avec `-R`, peut faire plus de dégâts que le problème de départ.

Cet article explique comment `chmod` lit ses arguments, les deux façons d'écrire un mode, les pièges du mode récursif, les trois bits spéciaux, et une liste de vérification pour le moment où une erreur de permission apparaît.

## La syntaxe

```bash
chmod [options] MODE FICHIER...
chmod [options] --reference=FICHIER_REF FICHIER...
```

`MODE` est soit un nombre (`755`), soit une expression symbolique (`u+x`). Chaque fichier listé reçoit la modification. Les options que vous utiliserez vraiment sont peu nombreuses :

- `-R`, `--recursive` : appliquer à un répertoire et à tout ce qu'il contient.
- `-v`, `--verbose` : afficher une ligne pour chaque fichier traité.
- `-c`, `--changes` : n'afficher une ligne que lorsqu'un mode change réellement. Pratique dans les scripts, car la sortie est un diff.
- `--reference=FICHIER` : copier le mode d'un autre fichier au lieu de le taper.

Seul le propriétaire du fichier (ou root) peut en changer le mode. Faire partie du groupe du fichier, même avec le droit d'écriture, ne suffit pas.

## Lire un mode

`ls -l` affiche dix caractères en début de ligne :

```text
-rwxr-x---  1 deploy  web  4120 Oct  3 09:12 build.sh
```

Le premier caractère est le type (`-` fichier, `d` répertoire, `l` lien symbolique). Les neuf suivants forment trois groupes de trois : **propriétaire** (`u`), **groupe** (`g`) et **autres** (`o`). Dans chaque groupe, les positions sont toujours lecture, écriture et exécution, dans cet ordre, avec `-` pour un bit désactivé. `rwxr-x---` signifie donc que le propriétaire peut tout faire, que les membres de `web` peuvent lire et exécuter le script, et que personne d'autre ne peut y toucher.

Sur un répertoire, les mêmes lettres ont un sens légèrement différent. `r` permet de lister les noms qu'il contient, `w` permet de créer, renommer et supprimer des entrées, et `x` permet d'*entrer* dans le répertoire et d'atteindre ce qu'il contient par son nom. Un répertoire avec `r` mais sans `x` est une liste de noms que vous ne pouvez pas ouvrir.

## Le mode octal : trois chiffres, un par classe

Chaque permission a une valeur : lecture 4, écriture 2, exécution 1. Additionnez-les par classe et vous obtenez un chiffre pour le propriétaire, un pour le groupe et un pour les autres :

| Chiffre | Bits | Signification |
|---|---|---|
| 7 | `rwx` | lire, écrire, exécuter |
| 6 | `rw-` | lire, écrire |
| 5 | `r-x` | lire, exécuter |
| 4 | `r--` | lecture seule |
| 0 | `---` | rien |

On obtient ainsi les modes que vous croiserez sans cesse :

- [`755`](/fr/chmod-calculator/755/) (`rwxr-xr-x`) : scripts, binaires et la plupart des répertoires. Le propriétaire écrit, tous les autres lisent et exécutent.
- [`644`](/chmod-calculator/644/) (`rw-r--r--`) : fichiers ordinaires comme les configurations et le HTML. Lisibles par tous, modifiables par le propriétaire.
- [`600`](/fr/chmod-calculator/600/) (`rw-------`) : les secrets. Clés privées SSH, fichiers `.env`, kubeconfigs.
- [`700`](/fr/chmod-calculator/700/) (`rwx------`) : répertoires privés, `~/.ssh` étant le cas classique.
- [`775`](/chmod-calculator/775/) (`rwxrwxr-x`) : un répertoire dans lequel toute une équipe écrit, généralement avec un groupe partagé.

Le mode octal **remplace** l'ensemble des permissions d'un coup. `chmod 644 fichier` n'ajoute pas la lecture pour les autres : il fixe le mode à exactement `rw-r--r--`, quel qu'il soit avant. C'est sa force quand vous voulez un état connu, et son danger quand vous vouliez seulement basculer un bit.

## Le mode symbolique : changer une chose, laisser le reste

Le mode symbolique s'écrit *qui*, *opérateur*, *quoi* :

- qui : `u` (propriétaire), `g` (groupe), `o` (autres), `a` (les trois)
- opérateur : `+` (ajouter), `-` (retirer), `=` (fixer exactement)
- quoi : `r`, `w`, `x`, plus `X`, `s` et `t`, présentés plus bas

Quelques exemples à connaître par cœur :

```bash
chmod u+x deploy.sh        # le propriétaire peut maintenant l'exécuter ; rien d'autre ne change
chmod a-w release.tar.gz   # personne ne peut écrire, propriétaire compris
chmod go-rwx id_ed25519    # tout retirer au groupe et aux autres
chmod g=rx,o= app/         # le groupe obtient exactement r-x, les autres rien
chmod u+x,g+x tools/*.sh   # plusieurs clauses, séparées par des virgules, sans espace
```

### Ce que fait vraiment chmod +x

`chmod +x fichier` n'a pas de *qui*, et cela a un sens précis. GNU chmod traite un *qui* absent comme `a`, mais **ne touche pas aux bits positionnés dans votre umask**. Avec l'umask courante `022`, `chmod +x` ajoute l'exécution pour le propriétaire, le groupe et les autres : `644` devient `755`. Avec une umask stricte `077`, la même commande n'ajoute que `u+x`, et `644` devient `744`. Si vous voulez un résultat qui ne dépend pas de la personne qui lance le script, écrivez la classe : `chmod a+x` ou `chmod u+x`.

## chmod -R et les deux erreurs classiques

Le mode récursif applique le même mode aux fichiers et aux répertoires, alors que les uns et les autres veulent des bits différents. Ce décalage produit deux erreurs que l'on retrouve dans presque toutes les équipes.

**Erreur n° 1 : `chmod -R 755 projet/`.** Les répertoires vont bien, mais tous les fichiers sont désormais exécutables, y compris `README.md`, chaque `.env` et chaque configuration. Rien ne casse immédiatement, c'est pourquoi l'erreur reste en place, et un `git status` ultérieur affiche toute l'arborescence comme modifiée si `core.fileMode` est actif.

**Erreur n° 2 : `chmod -R 644 projet/`.** Les fichiers vont bien, mais tous les répertoires ont perdu leur `x`. Vous ne pouvez plus y entrer avec `cd`, et rien à l'intérieur ne peut être ouvert, même si chaque fichier est en `644`. Le serveur web répond 403, et la cause n'est pas là où l'on regarde en premier.

La solution consiste à traiter les deux types séparément avec `find` :

```bash
find projet/ -type d -exec chmod 755 {} +
find projet/ -type f -exec chmod 644 {} +
```

Ou à utiliser le `X` majuscule, qui n'ajoute l'exécution qu'aux répertoires et aux fichiers déjà exécutables pour quelqu'un :

```bash
chmod -R u=rwX,go=rX projet/
```

Cette seule ligne donne `755` aux répertoires, `755` aux scripts existants et `644` aux fichiers ordinaires. C'est ce qui se rapproche le plus d'un chmod récursif sûr.

Deux mises en garde encore. Par défaut, GNU chmod ne modifie pas le mode d'un lien symbolique lui-même (Linux ignore de toute façon les permissions des liens) : pour un lien nommé sur la ligne de commande, c'est la *cible* qui change, et avec `-R` les liens rencontrés pendant le parcours sont ignorés. Et un `-R` sur le mauvais chemin est irrécupérable sans sauvegarde. `--preserve-root` refuse seulement une exécution récursive sur `/` lui-même : affichez donc le chemin avant d'exécuter la commande.

## Les bits spéciaux : setuid, setgid et sticky

Un quatrième chiffre octal, placé en tête, contient trois bits de plus. Dans `ls -l`, ils remplacent le `x` de l'un des trois groupes :

| Bit | Valeur | Affiché comme | Sur un fichier | Sur un répertoire |
|---|---|---|---|---|
| setuid | 4 | `s` à la place du `x` du propriétaire | s'exécute en tant que propriétaire du fichier | ignoré sous Linux |
| setgid | 2 | `s` à la place du `x` du groupe | s'exécute avec le groupe du fichier | les nouveaux fichiers héritent du groupe du répertoire |
| sticky | 1 | `t` à la place du `x` des autres | ignoré sous Linux | seul le propriétaire d'une entrée (ou celui du répertoire) peut la supprimer ou la renommer |

Les deux que vous rencontrerez en pratique :

- [`4755`](/chmod-calculator/4755/) (`rwsr-xr-x`) : setuid. `/usr/bin/passwd` est généralement installé ainsi, pour qu'un utilisateur ordinaire puisse mettre à jour un fichier appartenant à root. Un binaire setuid est une frontière de privilèges : ne le posez jamais sur un script ni sur quelque chose que vous n'avez pas écrit.
- [`1777`](/chmod-calculator/1777/) (`rwxrwxrwt`) : le sticky bit sur un répertoire accessible en écriture à tous. C'est `/tmp` : tout le monde peut créer des fichiers, mais personne ne peut supprimer ceux d'un autre.

Le setgid sur un répertoire partagé (`chmod 2775 shared/` ou `chmod g+s shared/`) est la façon propre de faire appartenir chaque nouveau fichier au groupe de l'équipe. Un `S` ou un `T` majuscule dans `ls -l` signifie que le bit spécial est actif mais pas le bit d'exécution en dessous, ce qui est presque toujours une erreur.

Un détail de GNU surprend souvent : `chmod 755 répertoire` *conserve* un bit setuid ou setgid déjà présent sur un répertoire. Pour l'enlever, il faut le demander explicitement, avec `chmod g-s répertoire` ou un mode à cinq chiffres comme `chmod 00755 répertoire`.

## umask : d'où vient le mode de départ

Les nouveaux fichiers ne sont pas créés en `777` puis rognés. Les programmes demandent `666` pour les fichiers et `777` pour les répertoires, et le noyau retire les bits positionnés dans l'**umask** du processus. Avec `umask 022`, les fichiers démarrent en `644` et les répertoires en `755`. Avec `umask 077`, en `600` et `700`.

Quand tous les fichiers écrits par un service sont illisibles pour le reste de l'équipe, la correction se trouve donc souvent dans l'umask du service (`UMask=` dans une unité systemd, ou `umask 002` dans son script de démarrage), pas dans un `chmod` après coup.

## Un mot sur les ACL

Si `ls -l` affiche un `+` après le mode (`-rw-rw-r--+`), le fichier possède une liste de contrôle d'accès, et les neuf bits ne disent pas tout. `getfacl fichier` montre les entrées supplémentaires. Sur un tel fichier, les bits de groupe que modifie `chmod` sont le *masque* de l'ACL, qui plafonne chaque entrée d'utilisateur et de groupe nommés : `chmod g-w` peut donc retirer silencieusement l'écriture à des personnes qui ne font même pas partie du groupe du fichier.

## Corriger « Permission denied »

Quand une commande échoue, examinez tout le chemin plutôt que le seul fichier :

1. **Vérifiez chaque répertoire du chemin.** Il faut `x` sur chaque répertoire parent pour atteindre un fichier. `namei -l /srv/app/config/app.yml` affiche le mode et le propriétaire de chaque composant et trouve le bit manquant en quelques secondes.
2. **Vérifiez qui vous êtes.** `id` affiche votre utilisateur et vos groupes. Les changements de groupe ne s'appliquent qu'aux nouvelles sessions : un utilisateur ajouté à `docker` il y a cinq minutes ne l'a toujours pas dans l'ancien shell.
3. **Vérifiez le propriétaire, pas seulement le mode.** `rw-------` est correct pour une clé et inutile si la clé appartient à root alors que le processus tourne en tant que `deploy`. C'est un travail pour [chown](/fr/blog/chown-command-linux/), pas pour chmod.
4. **Vérifiez le montage.** Un fichier peut être en `755` sur un système de fichiers monté en `noexec` et refuser quand même de s'exécuter. `findmnt -T chemin` affiche les options de montage.
5. **Vérifiez la couche de sécurité.** Sur les systèmes SELinux, un mode correct avec le mauvais contexte échoue quand même ; `ls -Z` et le journal d'audit le montrent.
6. **Tenez compte de ce qu'attendent les programmes stricts.** OpenSSH refuse une clé privée accessible au groupe ou aux autres, et sa vérification `StrictModes` rejette un répertoire personnel ou un `~/.ssh` accessible en écriture au groupe ou à tous. Mettez `~/.ssh` en `700` et les clés en `600`.

## Trouver un mode sans calcul

Le [chmod Calculator](/fr/chmod-calculator/) convertit entre octal, symbolique et la chaîne de `ls -l` dans les deux sens, bits spéciaux compris, et affiche la commande exacte à lancer. Il s'exécute dans votre navigateur. Pour la vue d'ensemble des utilisateurs, des groupes et de la propriété, la [section sur les permissions de Linux for DevOps](/learn/guides/linux-for-devops/#file-permissions-ownership) replace chmod dans son contexte.

## Aide-mémoire chmod

- [ ] L'octal remplace tous les bits ; le symbolique ne change que ce que vous nommez.
- [ ] `r` = 4, `w` = 2, `x` = 1, un chiffre pour le propriétaire, le groupe et les autres.
- [ ] `755` scripts et répertoires, `644` fichiers, `600` secrets, `700` répertoires privés.
- [ ] `chmod +x` respecte l'umask ; `chmod a+x` et `chmod u+x` n'en dépendent pas.
- [ ] Jamais de `chmod -R 755` ni de `chmod -R 644` sur une arborescence mixte ; utilisez `find -type d` / `-type f`, ou `chmod -R u=rwX,go=rX`.
- [ ] Un répertoire a besoin de `x` pour qu'on y entre, à chaque niveau du chemin.
- [ ] `4755` setuid, `2775` setgid pour les répertoires de groupe partagés, `1777` sticky pour les répertoires de type `/tmp`.
- [ ] Un `+` après le mode signale une ACL ; consultez `getfacl` avant de vous fier aux neuf bits.
- [ ] Un mauvais propriétaire est un problème de chown ; changer le mode ne le corrige pas.

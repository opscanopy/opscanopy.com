---
title: "Lire les expressions cron : un guide champ par champ"
description: "Un guide pratique, champ par champ, pour lire les expressions cron — les cinq champs temporels, les plages, les pas, les listes et les @macros — ainsi que les pièges qui déclenchent les planifications au moment où vous vous y attendez le moins."
pubDate: 2026-05-13
tags: ["cron", "scheduling", "devops"]
lang: fr
translationOf: "cron-expressions-explained"
---

Presque tous ceux qui exploitent un backend ont déjà fixé une ligne comme `*/15 9-17 * * 1-5` en se rappelant à moitié ce qu'elle fait. La syntaxe de cron est compacte, ce qui constitue à la fois sa grande vertu et son grand piège : cinq tout petits champs encodent une planification récurrente, et un seul caractère mal placé peut transformer « tous les après-midi en semaine » en « toutes les minutes, pour toujours ». Ce guide lit une expression cron comme le fait le démon — champ par champ — afin que la prochaine fois que vous en rencontrerez une, vous puissiez la décoder à vue.

## Les cinq champs

Une expression cron standard comporte cinq champs séparés par des espaces, toujours dans cet ordre :

```text
┌───────────── minute        (0–59)
│ ┌─────────── hour          (0–23)
│ │ ┌───────── day of month  (1–31)
│ │ │ ┌─────── month         (1–12 or JAN–DEC)
│ │ │ │ ┌───── day of week   (0–6, Sun=0; 7 also = Sun)
│ │ │ │ │
* * * * *
```

La tâche s'exécute à chaque minute où **tous** les champs temporels correspondent au moment courant. Un champ valant `*` signifie « toutes les valeurs », si bien que le canonique `* * * * *` se déclenche une fois par minute. Lisez de gauche à droite et les planifications les plus courantes apparaissent rapidement :

```text
0 * * * *      at minute 0 of every hour          → hourly, on the hour
30 2 * * *      at 02:30 every day                 → a nightly batch job
0 0 1 * *      at 00:00 on day 1 of every month    → monthly rollover
0 9 * * 1      at 09:00 every Monday               → start-of-week report
```

Notez que les secondes ne font **pas** partie du cron Unix standard. Certaines implémentations (Quartz, de nombreuses bibliothèques Go et Node, Kubernetes étant l'exception notable qui s'en tient à cinq) ajoutent un sixième champ pour les secondes. Si une expression à six champs se comporte étrangement dans un `crontab` ordinaire, ce champ supplémentaire en est généralement la raison.

## Plages, pas et listes

Trois opérateurs font l'essentiel du travail, et ils se combinent au sein d'un même champ :

- **Plage** `a-b` — un intervalle inclusif. `9-17` dans le champ des heures signifie les heures 9 à 17.
- **Pas** `*/n` ou `a-b/n` — une valeur sur n. `*/15` dans le champ des minutes signifie 0, 15, 30, 45. `9-17/2` signifie 9, 11, 13, 15, 17.
- **Liste** `a,b,c` — un ensemble explicite. `1,15` dans le champ du jour du mois signifie le 1er et le 15.

Mises bout à bout, l'expression du paragraphe d'introduction se décode proprement :

```text
*/15 9-17 * * 1-5
 │    │   │ │  └── Monday through Friday
 │    │   │ └───── every month
 │    │   └─────── every day of the month
 │    └─────────── hours 9 through 17 (9 AM–5 PM)
 └──────────────── every 15th minute (0, 15, 30, 45)
```

Donc : **toutes les 15 minutes, entre 9 h et 17 h, du lundi au vendredi.** Une cadence raisonnable pour une tâche de synchronisation censée se reposer la nuit et le week-end. Le danger réside dans le peu de différence avec `* 9-17 * * 1-5`, qui supprime le pas et se déclenche *à chaque minute* dans cette fenêtre — 60 fois la charge. Le caractère qui sépare une planification soignée d'un déni de service accidentel ne fait que deux caractères de large.

## Le piège du jour-du-mois / jour-de-la-semaine

La règle la plus surprenante de cron est la façon dont les deux champs « jour » se combinent. L'intuition dit qu'ils sont combinés par ET comme toute autre paire de champs. Ce n'est pas le cas. Lorsque le jour du mois **et** le jour de la semaine sont tous deux restreints (aucun n'est `*`), cron les traite comme un **OU** : la tâche s'exécute si *l'un ou l'autre* correspond.

```text
0 0 1,15 * 5    midnight on the 1st, on the 15th, OR on any Friday
```

Cette expression ne signifie pas « le 1er ou le 15, mais seulement si c'est un vendredi ». Elle signifie trois déclencheurs distincts. Si vous avez réellement besoin d'un ET — par exemple « le premier lundi du mois » — le cron classique ne peut pas l'exprimer directement ; vous le contrôlez dans la tâche elle-même (`[ "$(date +\%d)" -le 07 ] || exit 0`) ou vous recourez à une extension comme l'opérateur `#` de Quartz (`MON#1`). Cette règle du OU est responsable d'une grande part des incidents du type « pourquoi cela s'est-il déclenché deux fois ? ».

## Les @macros

La plupart des crons acceptent une poignée de raccourcis nommés qui remplacent une expression complète à cinq champs. Ils se lisent mieux et éliminent toute une catégorie de fautes de frappe :

```text
@hourly    →  0 * * * *
@daily     →  0 0 * * *   (alias: @midnight)
@weekly    →  0 0 * * 0
@monthly   →  0 0 1 * *
@yearly    →  0 0 1 1 *   (alias: @annually)
```

Il existe aussi `@reboot`, qui est particulier : il s'exécute une fois au démarrage de cron, et non selon une planification horaire. Utile pour préchauffer un cache après un redémarrage, inutile pour tout ce qui concerne une heure de la journée — et une source fréquente de rapports « ma tâche quotidienne ne s'est jamais exécutée » lorsque quelqu'un y recourt par erreur.

## Lire les pièges

Quelques règles supplémentaires séparent ceux qui *croient* lire cron de ceux qui le lisent vraiment :

- **Fuseaux horaires.** Le cron classique fonctionne dans le fuseau horaire local du système, si bien que les transitions liées à l'heure d'été peuvent sauter ou répéter une tâche. Une tâche prévue à 02:30 s'exécute zéro fois la nuit du passage à l'heure d'été et deux fois lors du retour à l'heure d'hiver. Les systèmes critiques fixent de plus en plus leurs planifications à l'UTC précisément pour cette raison.
- **Numérotation du jour de la semaine.** Le dimanche est `0`, et `7` est également accepté comme dimanche sur la plupart des implémentations — mais pas toutes. Préférez les noms à trois lettres (`SUN`, `MON`, …) quand vous le pouvez ; ils sont sans ambiguïté.
- **`*/n` ne fait pas de boucle.** `*/40` dans le champ des minutes se déclenche aux minutes 0 et 40, puis saute à 0 de l'heure suivante. Ce n'est **pas** « toutes les 40 minutes » — le décompte recommence à chaque heure, donc l'écart réel entre la :40 et le :00 suivant n'est que de 20 minutes.

Aucun de ces points n'est exotique. Ce sont les bords du quotidien qui font qu'une planification se déclenche à un moment que vous n'aviez pas prévu, et aucun d'eux n'est visible en fixant les cinq champs seuls.

## Vérifiez avant de déployer

La façon honnête de lire une expression cron, c'est de ne pas faire confiance à votre lecture de celle-ci. Décodez-la en langage clair, puis examinez les horodatages réels qu'elle produira sur les prochaines exécutions — c'est là que la boucle `*/40`, le décalage de l'heure d'été et le OU des champs de jour se révèlent immédiatement.

Le **Cron Expression Tester** fait exactement cela dans votre navigateur : collez n'importe quelle expression — plages, pas, listes, `@macros` et tout le reste — et obtenez une description en langage clair aux côtés des prochaines heures d'exécution, sans rien envoyer nulle part. Il transforme « je pense que c'est tous les après-midi en semaine » en « voici les dix prochaines fois où cela se déclenche », ce qui est la seule lecture qui compte.

[Essayer le Cron Expression Tester →](/cron-expression-tester)

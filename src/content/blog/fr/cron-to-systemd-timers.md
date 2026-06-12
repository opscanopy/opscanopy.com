---
title: "Migrer de cron vers les timers systemd"
description: "Un guide pratique pour convertir des entrées crontab en unités .timer et .service systemd — syntaxe OnCalendar, journalisation, délais aléatoires, exécutions de rattrapage et les pièges qui surgissent pendant la migration."
pubDate: 2026-05-20
tags: ["systemd", "cron", "linux"]
lang: fr
translationOf: "cron-to-systemd-timers"
---

Cron exécute les tâches planifiées du monde entier depuis quarante ans, et sur la plupart des serveurs il fonctionne encore très bien. Mais dès qu'une tâche a besoin d'une journalisation structurée, d'un environnement contrôlé, d'un ordonnancement des dépendances ou d'un moyen de rattraper son retard après l'arrêt de la machine, le modèle de cron commence à montrer ses limites. C'est là qu'interviennent les timers systemd — et si votre distribution exécute déjà systemd (c'est le cas de Debian, Ubuntu, RHEL, Fedora, Arch et SUSE), vous disposez d'un planificateur plus performant qui reste inutilisé.

Cet article détaille ce qui change réellement lors de la migration, avec de vraies unités que vous pouvez adapter.

## Pourquoi se donner la peine d'abandonner cron

Cron tient sur une seule ligne. Cette concision fait son attrait, mais elle est aussi son plafond :

- **Journalisation.** La sortie d'une tâche cron part là où vous la redirigez, et si vous oubliez, elle est envoyée par e-mail dans une boîte que personne ne lit. Un service systemd écrit automatiquement dans le journal — `journalctl -u myjob.service` vous montre chaque exécution, avec horodatages et codes de sortie.
- **Environnement.** Cron s'exécute avec un `PATH` délibérément minimal et presque aucun environnement, ce qui constitue le piège classique du « ça marche dans mon shell, ça échoue dans cron ». Une unité service déclare son environnement de façon explicite.
- **Exécutions manquées.** Si l'hôte est en veille ou éteint à la minute planifiée, cron saute tout simplement la tâche. Un timer avec `Persistent=true` l'exécute dès que la machine est de retour.
- **Chevauchement et ressources.** systemd ne démarre pas une seconde copie d'une tâche tant que la première est encore en cours, et vous pouvez attacher `CPUQuota=`, `MemoryMax=` et d'autres contrôles de ressources à une unité.

Vous n'avez pas besoin de tout migrer. Mais pour les tâches dont une défaillance silencieuse vous coûterait cher, les timers valent bien les deux fichiers qu'ils exigent.

## Le modèle à deux fichiers

Une ligne cron réalise la planification et l'exécution au même endroit. systemd sépare cela en un **service** (quoi exécuter) et un **timer** (quand l'exécuter). Ils partagent un nom de base.

Prenons cette entrée crontab — exécuter un script de sauvegarde tous les jours à 02:30 :

```cron
30 2 * * * /usr/local/bin/backup.sh
```

Cela devient deux unités dans `/etc/systemd/system/`.

Le service, `backup.service` :

```ini
[Unit]
Description=Nightly backup
Wants=network-online.target
After=network-online.target

[Service]
Type=oneshot
ExecStart=/usr/local/bin/backup.sh
```

Le timer, `backup.timer` :

```ini
[Unit]
Description=Run nightly backup at 02:30

[Timer]
OnCalendar=*-*-* 02:30:00
Persistent=true

[Install]
WantedBy=timers.target
```

`Type=oneshot` indique à systemd que la tâche est censée s'exécuter, se terminer et se quitter — le bon type pour presque toutes les tâches de style cron. La section `[Install]` du timer est ce qui fait fonctionner `systemctl enable` ; sans `WantedBy=timers.target`, le timer ne s'armera pas au démarrage.

Activez-le et démarrez-le :

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now backup.timer
```

Notez que vous activez le **timer**, pas le service. Le timer entraîne le service lorsqu'il se déclenche.

## Traduire la planification : OnCalendar

La partie la plus difficile de la migration est le champ de planification, car systemd utilise `OnCalendar=` plutôt que les cinq champs de cron. Le format est `DOW YYYY-MM-DD HH:MM:SS`, et il est réellement plus lisible une fois qu'on l'a appris. Quelques correspondances courantes :

```text
# cron                        # OnCalendar
*/15 * * * *                  *-*-* *:0/15:00      (every 15 minutes)
0 * * * *                     *-*-* *:00:00        (hourly, on the hour)
30 2 * * *                    *-*-* 02:30:00       (daily at 02:30)
0 4 * * 1                     Mon *-*-* 04:00:00   (Mondays at 04:00)
0 0 1 * *                     *-*-01 00:00:00      (1st of the month)
0 9 * * 1-5                   Mon..Fri *-*-* 09:00:00  (weekdays at 09:00)
```

Il existe aussi des raccourcis pratiques — `hourly`, `daily`, `weekly`, `monthly` — si bien que `OnCalendar=daily` équivaut à minuit chaque jour. La commande la plus utile durant la migration est `systemd-analyze calendar`, qui analyse une expression et vous montre les prochaines heures de déclenchement :

```bash
$ systemd-analyze calendar --iterations=3 'Mon..Fri *-*-* 09:00:00'
  Original form: Mon..Fri *-*-* 09:00:00
Normalized form: Mon..Fri *-*-* 09:00:00
    Next elapse: Mon 2026-06-08 09:00:00 UTC
       From now: 4h 12min left
       (next 3)  Tue 2026-06-09 09:00:00 UTC
                 Wed 2026-06-10 09:00:00 UTC
```

Si cette sortie correspond à ce que faisait votre ligne cron, la planification est correcte. Si ce n'est pas le cas, vous avez attrapé le bug avant sa mise en production.

## Les pièges qui surgissent vraiment

**Fuseau horaire.** Cron utilise l'heure locale du système. Les timers systemd aussi par défaut, mais `OnCalendar` est évalué dans le fuseau horaire du timer, ce qui peut vous surprendre sur des serveurs réglés en UTC. Fixez-le explicitement avec `OnCalendar=Mon *-*-* 04:00:00 America/New_York` si l'heure locale compte, et n'oubliez pas que les transitions de l'heure d'été peuvent sauter ou dédoubler une exécution.

**Effet de meute (thundering herd).** Cron déclenche les tâches `0 * * * *` exactement à :00 sur l'ensemble de votre flotte. Ajoutez `RandomizedDelaySec=` pour répartir la charge :

```ini
[Timer]
OnCalendar=hourly
RandomizedDelaySec=300
Persistent=true
```

Cela décale aléatoirement chaque exécution jusqu'à cinq minutes — précieux lorsqu'une centaine d'hôtes sollicitent la même API.

**Environnement et répertoire de travail.** L'environnement clairsemé de cron fait trébucher les gens ; supposer un répertoire de travail aussi. Soyez explicite dans le service :

```ini
[Service]
Type=oneshot
WorkingDirectory=/opt/app
Environment=PATH=/usr/local/bin:/usr/bin:/bin
EnvironmentFile=-/etc/app/env
ExecStart=/opt/app/run.sh
```

Le `-` en tête de `EnvironmentFile` signifie « ne pas échouer si le fichier est absent », ce qui reproduit le comportement tolérant de cron.

**Tâches par utilisateur.** Une crontab utilisateur correspond à une unité utilisateur. Déposez les fichiers dans `~/.config/systemd/user/`, activez avec `systemctl --user enable --now myjob.timer`, et exécutez `loginctl enable-linger $USER` pour que le timer survive à la déconnexion.

## Vérifier la migration

Après l'activation, confirmez que le timer est armé et examinez son historique :

```bash
systemctl list-timers --all          # see next/last run for every timer
journalctl -u backup.service --since today   # read the job's output
sudo systemctl start backup.service  # trigger a manual run to test now
```

`systemctl start backup.service` exécute la tâche immédiatement, indépendamment de la planification — le moyen le plus propre de confirmer que la moitié service fonctionne avant de faire confiance au timer.

## Ne traduisez pas chaque champ à la main

La partie mécanique — transformer cinq champs cron en une ligne `OnCalendar` et échafauder la paire `.timer`/`.service` — est exactement le genre de chose qu'il est facile de se tromper subtilement à la main, surtout avec les valeurs de pas, les plages et les cas limites du jour de la semaine. Notre **convertisseur Cron vers systemd** le fait dans le navigateur : collez une ligne crontab, obtenez une unité timer et service prête à éditer avec l'expression `OnCalendar` correcte et des notes de migration, sans que rien ne soit téléversé où que ce soit.

[Convertissez votre crontab en timers systemd →](/cron-to-systemd)

---
title: "Apprendre le DevOps en 90 jours : le parcours gratuit, axé sur les incidents, de développeur à ingénieur DevOps"
description: "Pourquoi nous avons créé Mission: 90 Days DevOps — un parcours gratuit de Linux à Kubernetes, jour par jour, avec des missions d'incident jouables. Le plan, les choix de conception et les compromis."
pubDate: 2026-07-12
tags: ["devops", "career", "learning"]
lang: fr
translationOf: "learn-devops-in-90-days"
relatedTool:
  name: "Mission: 90 Days DevOps"
  href: "/mission-90/"
---

![Apprendre le DevOps en 90 jours : un parcours gratuit, axé sur les incidents, de développeur à ingénieur DevOps](/blog/learn-devops-in-90-days-hero.svg)

Il y a un moment dont chaque nouvel ingénieur ops se souvient : la première fois que quelque chose casse pour de vrai. Le tutoriel est terminé depuis des semaines, le chemin nominal n'est nulle part en vue, et un pod est bloqué en `CrashLoopBackOff` — ou un job cron s'est arrêté en silence, ou le site entier répond 502. Les tutoriels enseignent des commandes. Les incidents forment des ingénieurs.

C'est pour combler ce fossé que nous avons créé [Mission: 90 Days DevOps](/mission-90/) — un programme gratuit et guidé qui vous mène de votre première commande dans le terminal à l'employabilité en 90 jours, une leçon ciblée par jour, avec une mission d'incident scénarisée à résoudre à la fin de chaque semaine. Les 90 jours et les 10 missions sont tous en ligne dès maintenant. Pas d'inscription, pas de mur d'e-mail, pas de paywall ; votre progression est sauvegardée dans votre propre navigateur. Cet article explique ce que contient le programme, l'ordre choisi et ses raisons, ainsi que les décisions de conception qui le sous-tendent — y compris celles qui impliquent de vrais compromis.

## La règle d'ordonnancement : chaque couche doit vous permettre de déboguer la couche au-dessus

La plupart des roadmaps DevOps échouent de l'une de ces deux façons. Soit elles vous tendent un arbre de compétences de 200 nœuds sans la moindre séquence, soit elles commencent par la chose qui brille — Kubernetes avant Linux, et c'est ainsi que l'on finit par copier-coller des commandes `kubectl` que l'on ne sait pas déboguer.

L'ordre du programme découle d'une seule règle : **chaque couche doit vous permettre de déboguer la couche au-dessus.**

- Les problèmes Kubernetes sont généralement des problèmes de conteneurs.
- Les problèmes de conteneurs sont généralement des problèmes Linux.
- Les problèmes de réseau cloud sont généralement des problèmes de DNS et de ports que vous pouvez apprendre sur localhost.

Les 90 jours suivent donc cet ordre : Linux d'abord, les conteneurs ensuite, le cloud en troisième, l'orchestration en quatrième et la préparation à l'emploi en dernier — 45 à 60 minutes par jour, soit environ 80 heures de travail de fond au total. C'est un engagement réel, pas une promesse de « 10 minutes par jour », mais il reste compatible avec un emploi à temps plein, et 90 jours, c'est assez court pour apercevoir la ligne d'arrivée dès le Jour 1.

![Le parcours de 90 jours : cinq phases, des fondamentaux Linux à l'employabilité, avec une mission d'incident qui clôt chaque semaine](/blog/learn-devops-in-90-days-diagram.svg)

## Les cinq phases

**Phase 1 — Linux et le terminal (Jours 1–21).** Trois semaines sur les fichiers, les permissions, les processus, systemd, les logs, le DNS et les ports, bash, cron et SSH. Cela paraît long quand Kubernetes vous appelle, mais presque chaque incident se termine avec quelqu'un connecté en SSH sur une machine, en train de lire des logs — c'est ici que cela cesse de faire peur. Tout tourne en local sur WSL2 ou n'importe quelle machine Linux. Coût : zéro.

**Phase 2 — Docker et CI/CD (Jours 22–45).** Empaqueter du logiciel et l'expédier automatiquement, deux volets délibérément appariés : images, Dockerfiles, volumes, réseaux et compose d'un côté ; de vrais workflows Git et des pipelines GitHub Actions de l'autre. La phase se conclut par le **Projet 1** : conteneuriser `linkstash`, un raccourcisseur d'URL en FastAPI, base de données comprise. Toujours entièrement local, toujours à coût nul.

**Phase 3 — AWS (Jours 46–65).** IAM et VPC d'abord — parce que l'essentiel de la confusion sur AWS se résume à « pourquoi ce composant n'arrive-t-il pas à parler à cet autre », et la réponse est presque toujours un security group ou une route de sous-réseau — puis S3, RDS, les load balancers et le monitoring. Le **Projet 2** déploie le même conteneur `linkstash` dans les règles de l'art : ECS Fargate derrière un ALB, avec RDS Postgres réparti sur deux zones de disponibilité.

**Phase 4 — Kubernetes et Terraform (Jours 66–85).** Pods, Services, configuration, probes, ingress et Helm — pratiqués d'abord sur des clusters `kind` locaux, où les erreurs ne coûtent rien — puis Terraform, pour que l'infrastructure devienne du code relisible plutôt que des clics dans la console. Le **Projet 3** est le projet de synthèse : `linkstash` encore, cette fois sur k3s sur une seule instance EC2, provisionnée entièrement par Terraform, empaquetée en chart Helm, servie en vrai TLS par Traefik et cert-manager.

**Phase 5 — Prêt pour l'embauche (Jours 86–90).** La partie que toutes les roadmaps sautent : transformer ce travail en embauche. Un CV reconstruit autour des trois projets, un portfolio et un GitHub soignés, les fondamentaux de la gestion d'incident — niveaux de sévérité, postmortems sans blâme, budgets d'erreur — et un entraînement à l'entretien. Chaque jour du programme se termine par trois à cinq questions d'entretien : arrivé au Jour 86, vous en aurez déjà traité plus de 300.

## Une seule application, portée à travers toute la stack

La décision de conception que nous défendrions le plus fermement : le programme construit **une application de trois façons**, pas trois projets jetables.

`linkstash` est conteneurisé en Phase 2, déployé sur AWS en Phase 3 et orchestré sur Kubernetes en Phase 4. En entretien, cela transforme « j'ai suivi quelques tutoriels » en « voici un système que j'ai fait tourner de trois façons, et voici pourquoi chaque couche existe ». La mise en regard — fichier compose contre task definition contre chart Helm, `depends_on` contre target groups contre readiness probes — est précisément l'histoire que les recruteurs demandent.

## Les incidents sont le programme, pas un bonus

Lire de la documentation sur `journalctl` et s'en servir à 0 h 14 pendant une panne sont deux compétences différentes, et une seule des deux est un métier. Les fins de semaine ne sont donc pas des quiz — ce sont des **missions** : des simulations d'incident scénarisées qui s'exécutent dans un terminal, directement dans votre navigateur. Aucune installation, aucun compte cloud, aucun code requis.

Vous commencez la première semaine avec *Server Down!* — un serveur web de production est tombé à 2 h du matin et vous devez trouver le processus emballé, le tuer et remettre nginx en service. La dernière semaine, vous affrontez *The Midnight Outage* : un SEV-1 où une seule modification de security group dégénère en échecs de health checks sur le load balancer, en bascule DNS, et en pods de la région de secours incapables de démarrer parce que quelqu'un a supprimé le Secret qu'ils montent. Le correctif doit partir **de l'amont d'abord** — rouvrir le chemin réseau, restaurer le Secret, puis confirmer que le DNS s'est rétabli — dans cet ordre, parce que redémarrer les pods n'a jamais été le problème.

Entre les deux : un mystère DNS, un verrouillage de permissions, une stack de conteneurs en crash-loop, un pipeline de CI cassé, une facture AWS surprise, une table de production supprimée, un cluster Kubernetes en plein chaos et un verrou d'état Terraform périmé. Dix missions, chacune répétant exactement la boucle de diagnostic enseignée par sa semaine.

## Conçu pour ne (presque) rien coûter

Un parcours d'apprentissage qui fait discrètement grimper une facture cloud est un parcours d'apprentissage cassé. Les règles budgétaires sont donc structurelles :

- Les phases 1 et 2 ainsi que les fondamentaux Kubernetes tournent **entièrement en local** — WSL2, Docker, `kind` et des providers Terraform locaux. Zéro dépense cloud.
- Chaque journée AWS s'ouvre sur un **encadré de coût** indiquant exactement ce que coûte le lab et à quelles conditions il est gratuit, et se termine par un **démontage obligatoire**.
- Le projet de synthèse Kubernetes utilise k3s sur une seule t3.small (environ 19 $/mois si vous l'oubliez, quasiment gratuite sur le free tier avec un démontage le jour même) plutôt qu'EKS, dont le seul plan de contrôle coûte environ 73 $/mois. Même API Kubernetes, mêmes manifests, même Helm — vous ne payez simplement pas AWS pour héberger le serveur d'API. Le compromis, énoncé honnêtement : vous ne toucherez pas à la tuyauterie propre à EKS comme IRSA ou les managed node groups, ce qui s'apprend très bien en poste.

## À quoi ressemble une journée

Chacun des 90 jours a la même forme, si bien que vous savez toujours ce que « terminé » veut dire :

1. **Un concept court** — moins de 600 mots, un diagramme, une analogie avec le monde réel. Lu en cinq minutes.
2. **Un lab pratique** — de vraies commandes avec leur vraie sortie, reproductibles sur votre machine.
3. **Erreurs courantes et correctifs** — les messages d'erreur exacts que vous rencontrerez, pourquoi ils surviennent, et comment vous les repéreriez en production.
4. **Questions-réponses d'entretien** — trois à cinq questions avec des réponses qui valent la peine d'être dites à voix haute.

Des extras optionnels « Go Deeper » existent pour les jours où vous avez plus de temps, et la leçon suivante ne les présuppose jamais.

## Les compromis, en toute honnêteté

- **90 jours font de vous un junior embauchable, pas un senior.** Vous contribuerez et déboguerez dès la première semaine en poste ; la profondeur vient avec les heures d'astreinte.
- **Le programme assume ses partis pris.** GitHub Actions plutôt que Jenkins, AWS plutôt qu'Azure, k3s plutôt qu'EKS. Chaque case a reçu le choix par défaut au meilleur levier ; votre poste cible peut différer.
- **Auto-rythmé signifie autodiscipline.** Le suivi de progression aide ; il ne remplace pas le fait de se présenter chaque jour.
- **La phase AWS exige une carte bancaire enregistrée.** La discipline de démontage maintient les dépenses proches de zéro, mais le risque n'est jamais exactement nul.

## Commencez aujourd'hui

Tout est en ligne : [les 90 jours](/mission-90/), les [dix missions](/mission-90/missions/) et les trois projets. Commencez par le Jour 1 — ou, si vous voulez ressentir en dix minutes tout l'intérêt du programme, jouez d'abord *Server Down!*. Il ne demande rien d'autre qu'un onglet de navigateur, et il se termine comme tout bon incident : avec le site de nouveau en ligne, et vous qui savez exactement pourquoi.

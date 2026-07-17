---
title: "Pourquoi mon alerte n'arrive-t-elle pas au bon receiver ? Déboguer le routage d'Alertmanager"
description: "Vos alertes partent vers le mauvais receiver, ou vers aucun receiver ? Déboguez le routage d'Alertmanager — first-match-wins, continue oublié, regex de matcher et routes catch-all par défaut."
pubDate: 2026-06-18
tags: ["alertmanager","observability","alerting"]
lang: fr
translationOf: "debug-alertmanager-routing"
relatedTool:
  name: "Alertmanager Route Tester"
  href: "/alertmanager-route-tester"
---

![Déboguer le routage d'Alertmanager : une alerte porteuse de labels parcourt un arbre de routes pour trouver le bon receiver plutôt que le mauvais](/blog/debug-alertmanager-routing-hero.svg)

Vous avez livré une nouvelle règle d'alerting, elle s'est déclenchée en production, et le page est parti vers la mauvaise équipe — à moins que personne n'ait été paginé du tout. La règle est correcte et l'alerte se déclenche bel et bien, et pourtant votre problème de mauvais receiver dans Alertmanager est bien réel : la notification a atterri à un endroit auquel vous ne vous attendiez pas. Quand Alertmanager ne route pas comme vous l'aviez prévu, le bug n'est presque jamais dans l'alerte. Il est dans l'arbre `route`, et les arbres de routage sont du code que l'on ne peut pas facilement exécuter pas à pas.

Alertmanager dispatche chaque alerte en parcourant un arbre de routes. La racine est le catch-all par lequel toute alerte entre ; de là, elle descend dans les routes enfants dont les matchers tiennent face aux labels de l'alerte. Faites une erreur dans ce parcours et l'alerte atterrit silencieusement sur la mauvaise feuille. Ce billet couvre les cinq bugs qui en sont la cause, et comment parcourir l'arbre vous-même — sans `amtool`, sans reload, sans instance live.

## Le symptôme : des pages silencieux, ou la mauvaise équipe se fait paginer

Deux formes d'un même problème. Soit une alerte qui devait selon vous paginer l'équipe base de données est partie vers un canal Slack catch-all que personne ne surveille, soit une alerte `severity=critical` n'a produit aucun page du tout. Les deux découlent de la même cause racine : la route que l'alerte a *réellement* matchée n'est pas celle que vous *croyez* qu'elle a matchée.

Voici l'arbre dont la plupart des gens partent — l'exemple de routage canonique :

```yaml
route:
  receiver: 'default-receiver'
  group_by: ['alertname', 'cluster', 'service']
  group_wait: 30s
  group_interval: 5m
  repeat_interval: 4h
  routes:
    - receiver: 'team-X-mails'
      match:
        team: frontend
    - receiver: 'team-DB-pages'
      match:
        service: database
    - receiver: 'team-Y-mails'
      match:
        team: backend
```

Une alerte avec `service=database` atteint `team-DB-pages`. Assez simple — jusqu'à ce que l'arbre grossisse, que des siblings soient réordonnés, que quelqu'un ajoute une regex, et que le parcours cesse de faire ce que vous lisez sur la page. Le remède est toujours le même : arrêtez de raisonner dans votre tête et parcourez l'arbre face aux labels exacts que porte l'alerte. Chaque bug ci-dessous est une façon différente dont le parcours vous surprend.

## Bug 1 : le premier match l'emporte et vous avez oublié continue: true

C'est le bug de non-routage le plus courant dans Alertmanager. Au sein d'une route matchée, les routes enfants sont évaluées **de haut en bas**, et l'alerte descend dans le **premier** enfant qui matche — puis le balayage des siblings s'arrête. Les siblings suivants ne sont jamais évalués.

C'est ce qui mord le plus fort quand vous voulez qu'une alerte atteigne deux receivers — disons, chaque alerte critique recopiée vers un receiver d'audit *et* routée vers l'équipe propriétaire :

```yaml
route:
  receiver: 'default-receiver'
  group_by: ['alertname']
  routes:
    - receiver: 'all-critical-audit'
      matchers:
        - severity="critical"
    - receiver: 'team-Y-pages'
      match:
        team: backend
```

Déclenchez une alerte avec `team=backend` et `severity=critical`. Elle matche le premier sibling, `all-critical-audit`, et le balayage s'arrête là. `team-Y-pages` n'est jamais atteint, donc l'équipe backend n'est jamais paginée. Le canal d'audit l'a journalisée, donc *on dirait* que le routage a fonctionné — c'est précisément pour cela que ce bug est difficile à repérer.

Le remède tient en une ligne. Une route matchée avec `continue: true` n'arrête pas le balayage des siblings, donc l'alerte continue de retomber sur les siblings suivants qui matchent :

```yaml
    routes:
      - receiver: 'all-critical-audit'
        matchers:
          - severity="critical"
        continue: true        # keep going to later siblings
      - receiver: 'team-Y-pages'
        match:
          team: backend
```

Maintenant les deux se déclenchent. Une alerte ne peut atteindre plus d'un receiver que lorsque `continue: true` est positionné sur une route matchée ; sans cela, le premier sibling qui matche l'emporte toujours.

## Bug 2 : le matcher ne matche pas (regex, quoting, un label manquant)

Si l'alerte saute silencieusement une route dont vous étiez sûr qu'elle l'atteindrait, c'est que le matcher ne matche probablement pas. Trois pièges expliquent la quasi-totalité de ces cas.

**Les regex sont entièrement ancrées.** À la fois `match_re` et les opérateurs `=~` / `!~` enveloppent votre motif en `^(?:…)$`. Un motif partiel ne matche jamais une valeur plus longue :

```yaml
matchers:
  - env=~"staging"      # env=staging-eu does NOT match — anchored to exactly "staging"
```

```yaml
matchers:
  - env=~"staging-.*"   # env=staging-eu matches now
```

**Un label manquant vaut la chaîne vide.** Alertmanager traite un label absent de l'alerte comme `""`, donc `team=""` matche une alerte qui n'a *aucun* label `team`, et `team!=""` exige qu'il soit présent et non vide. Si vous écrivez `match: { team: frontend }` mais que l'alerte ne positionne jamais de label `team`, le matcher compare `frontend` à `""`, échoue, et la route est sautée — vous retombez plus bas.

**Opérateurs et quoting dans les chaînes `matchers:`.** La forme moderne `matchers:` prend des chaînes comme `foo="bar"`, `foo=~"re"`, `foo!="x"` et `foo!~"re"` ; la valeur peut être entre guillemets ou nue. Les opérateurs à deux caractères (`=~`, `!~`, `!=`) sont reconnus avant le simple `=`, donc `severity!="info"` se parse comme un « différent de ». Si vous vous trompez de quoting — un guillemet laissé ouvert, par exemple — le matcher est invalide ; or un matcher invalide ne peut pas tenir, donc la route est sautée.

Voici une route de matchers qui combine une regex avec une inégalité :

```yaml
route:
  receiver: 'default-receiver'
  group_by: ['alertname', 'env']
  routes:
    - receiver: 'staging-slack'
      matchers:
        - env=~"staging-.*"
        - severity!="info"
    - receiver: 'prod-pager'
      match_re:
        env: 'prod-.*'
```

Tous les matchers d'une route doivent tenir pour qu'elle matche — c'est un ET logique. Une alerte avec `env=staging-eu` et `severity=warning` atteint `staging-slack` : le `staging-.*` ancré matche et `severity` n'est pas `info`. Passez `severity` à `info` et le second matcher échoue, donc toute la route est sautée.

Si vos règles d'alerting portent dès le départ les mauvais labels — ou s'il leur manque ceux sur lesquels vos routes matchent — corrigez cela en amont. Le [Prometheus Relabel Tester](/prometheus-relabel-tester/) prévisualise exactement quels labels survivent à vos relabel rules avant même qu'ils n'atteignent l'arbre de routes.

![Illustration synthwave du débogage du routage d'Alertmanager : une alerte parcourt un arbre de routes néon à travers une porte first-match-wins, en passant devant les pièges classiques — continue oublié, regex de matcher, catch-all par défaut](/blog/in-content/debug-alertmanager-routing.webp)

## Bug 3 : une route catch-all par défaut avale tout avant que votre route ne soit atteinte

Une route catch-all dans Alertmanager est censée être un filet de sécurité — le receiver qui se déclenche quand rien de plus spécifique ne matche. Mais un catch-all placé *au-dessus* d'un sibling spécifique, au lieu d'en dessous, se transforme en piège. Combiné au first-match-wins, une règle large en haut masque toutes les règles spécifiques en dessous :

```yaml
# Trap: the broad rule above shadows the specific one
routes:
  - receiver: catch-all
    matchers: ['severity=~".*"']   # matches everything
  - receiver: db-pager             # NEVER reached
    match: { service: database }
```

`severity=~".*"` matche toute alerte qui possède un label `severity` (ancré, mais `.*` couvre la valeur entière). C'est le premier sibling, donc le balayage s'arrête là — `db-pager` est du code mort. L'équipe base de données n'est jamais paginée.

Il y a deux bonnes manières de raisonner sur un catch-all. Soit vous placez vos routes spécifiques en premier et la route large en dernier :

```yaml
# Fix: specific first, broad last
routes:
  - receiver: db-pager
    match: { service: database }
  - receiver: catch-all
    matchers: ['severity=~".*"']
```

Soit vous vous appuyez sur le vrai catch-all que vous avez déjà — le `receiver` de la route racine elle-même. Quand aucune route enfant ne matche, la route dans laquelle se trouve l'alerte devient le match terminal et c'est *son* receiver qui se déclenche. La racine positionne toujours un `receiver` par défaut, donc une alerte qui ne matche aucun enfant atterrit malgré tout quelque part :

```yaml
route:
  receiver: 'default-receiver'     # the true catch-all
  group_by: ['alertname']
  routes:
    - receiver: 'team-X-mails'
      match: { team: frontend }
    - receiver: 'team-Y-mails'
      match: { team: backend }
```

Une alerte avec `team=platform` ne matche aucun des deux enfants. Elle ne génère pas d'erreur et ne disparaît pas — elle retombe sur `default-receiver`, le catch-all fonctionnant comme prévu. Les cas « pourquoi mon alerte n'a-t-elle pas routé ? » sont généralement ceux-ci : elle *a bien* routé, droit vers le default, parce qu'aucun enfant ne matchait. Si une route ne se résout vers aucun receiver du tout, c'est là une véritable erreur de configuration — Alertmanager exige que la racine positionne un `receiver` par défaut.

## Bug 4 : l'ordre des routes parmi les siblings

Le bug 3, c'est un catch-all qui avale tout. Le bug 4 en est la version plus subtile et plus générale : parmi des siblings, l'ordre décide *toujours* quelle route unique l'emporte, même quand les deux sont spécifiques. Comme seul le premier sibling qui matche est retenu (en l'absence de `continue`), deux matchers qui se recouvrent dans le mauvais ordre routent l'alerte vers la mauvaise équipe.

![Une alerte mal routée : à gauche l'alerte entre dans l'arbre de routes et atterrit sur le mauvais receiver en rouge parce que continue manque, à droite l'arbre corrigé la route vers le bon receiver en vert](/blog/debug-alertmanager-routing-diagram.svg)

Considérons une alerte qui est à la fois une alerte base de données et une alerte de l'équipe backend :

```yaml
# labels: service=database, team=backend, severity=critical
routes:
  - receiver: 'team-Y-pages'      # matches team=backend
    match: { team: backend }
  - receiver: 'team-DB-pages'     # matches service=database
    match: { service: database }
```

Les matchers des deux routes tiennent face à cette alerte. L'ordre départage : `team-Y-pages` vient en premier, donc il l'emporte, et l'astreinte base de données (`team-DB-pages`) n'est jamais atteinte. Intervertissez les deux et c'est la route base de données qui l'emporte. Aucun matcher n'est faux — c'est l'*ordre* qui est le bug.

Quand deux siblings peuvent légitimement matcher tous les deux, vous avez trois choix : placer en premier celui que vous voulez voir l'emporter, rendre les matchers mutuellement exclusifs (ajouter `service!=database` à la route backend, par exemple), ou positionner `continue: true` sur le premier pour que l'alerte atteigne les deux. L'imbrication aide aussi — un parent matche le cas large et le restreint via ses enfants :

```yaml
route:
  receiver: 'default-receiver'
  group_by: ['alertname']
  routes:
    - receiver: 'web-team'
      match:
        service: web
      group_by: ['alertname', 'instance']
      routes:
        - receiver: 'web-team-pager'
          matchers:
            - severity="critical"
        - receiver: 'web-team-slack'
          matchers:
            - severity=~"warning|info"
```

Une alerte avec `service=web` descend d'abord dans `web-team`, puis les enfants imbriqués choisissent le receiver selon `severity`. Une alerte web `severity=critical` parcourt `root → web-team → web-team-pager`. La descente est explicite, donc les surprises d'ordre restent cantonnées à une petite liste de siblings au lieu de se cacher à travers tout l'arbre.

## Bug 5 : le grouping fait croire qu'une alerte manque alors qu'elle est juste mise en batch

Parfois l'alerte a routé parfaitement et vous pensez quand même qu'elle manque — parce que le grouping l'a regroupée avec d'autres et que la notification n'a *pas encore* été envoyée. Le grouping est contrôlé par `group_by`, `group_wait`, `group_interval` et `repeat_interval`, et tous les quatre sont **hérités** le long de l'arbre. Un enfant qui ne définit pas les siens porte ceux du parent :

```yaml
route:
  group_by: ['alertname', 'cluster']
  group_wait: 30s
  routes:
    - receiver: db-pager
      match: { service: database }
      # no group_by here → INHERITS ['alertname', 'cluster']
```

La feuille `db-pager` n'a pas de `group_by` propre, donc elle hérite de `['alertname', 'cluster']` et d'un `group_wait` de 30s depuis la racine. Deux conséquences piègent les gens. Premièrement, un nouveau groupe est retenu pendant `group_wait` avant sa première notification — donc une alerte fraîchement déclenchée qui « ne pagine pas » est peut-être simplement dans sa fenêtre d'attente. Deuxièmement, si `group_by` est trop grossier, votre alerte se retrouve repliée dans la notification d'un groupe existant et donne l'impression de ne s'être jamais déclenchée séparément.

Ne surchargez que là où un sous-arbre a réellement besoin d'un grouping différent :

```yaml
route:
  group_by: ['alertname', 'cluster']
  routes:
    - receiver: db-pager
      match: { service: database }
      group_by: ['alertname', 'cluster', 'database']
```

La feuille que vous lisez n'est pas nécessairement le grouping qui s'applique. Résolvez toujours le `group_by` *effectif* — la valeur héritée de l'ancêtre le plus proche qui l'a définie — avant de conclure qu'une alerte manque.

## Tester le routage d'Alertmanager sans amtool : parcourir l'arbre face aux labels de l'alerte

Vous n'avez pas besoin de `amtool config routes test`, et vous n'avez pas besoin de recharger un Alertmanager live pour déboguer le routage. Le parcours de routage est déterministe, vous pouvez donc le faire à la main. Prenez les labels exacts de l'alerte qui se déclenche et parcourez l'arbre de haut en bas :

```bash
# The labels the alert actually carries (from the Alertmanager UI or API):
alertname=HighLatency
service=database
team=backend
severity=critical
```

Ensuite, en partant de la racine :

1. **Entrez dans la racine.** Toute alerte le fait — c'est le catch-all. Notez son `receiver` et son `group_by` comme référence d'héritage.
2. **Balayez les enfants de haut en bas.** Pour chaque enfant, vérifiez si *tous* ses matchers tiennent face aux labels. Rappel : les regex sont ancrées, et un label manquant vaut `""`.
3. **Descendez dans le premier match.** Le sous-arbre de cet enfant devient l'endroit où vous vous trouvez. S'il a positionné `continue: true`, continuez aussi à balayer ses siblings suivants — ceux-ci deviennent des matchs supplémentaires.
4. **Si aucun enfant ne matche, vous avez terminé.** La route courante est le match terminal ; c'est son `receiver` hérité qui se déclenche.
5. **Résolvez l'héritage à la feuille.** Le `receiver` et le `group_by` effectifs proviennent de l'ancêtre le plus proche qui les a définis, pas nécessairement de la feuille.

Faites cela pour les labels ci-dessus face à l'arbre de la doc et vous atterrissez sur `team-DB-pages` via `service=database`, en héritant du `group_by` de la racine. Faire ce parcours sur papier pour un arbre de 40 nœuds, c'est exactement le raisonnement sujet aux erreurs qui a produit le bug en premier lieu — et c'est toute la raison d'être d'un testeur.

## Trouver le receiver correspondant dès maintenant : un débogueur de routes Alertmanager dans le navigateur

Quand l'arbre dépasse quelques nœuds, parcourez-le avec l'[Alertmanager Route Tester](/alertmanager-route-tester/) plutôt que dans votre tête. Collez votre arbre de routes — un simple bloc `route:` ou un `alertmanager.yml` complet, dont seul le bloc `route` est lu — et les labels de l'alerte d'exemple, un `key=value` par ligne. Il reproduit la sémantique à l'identique : first-match-wins, fan-out via `continue: true`, regex ancrées, label manquant traité comme chaîne vide, et héritage du grouping.

Ce que vous récupérez, c'est chaque receiver que l'alerte atteint, dans l'ordre d'évaluation, chacun accompagné de son fil d'Ariane de route depuis la racine jusqu'au nœud matché, d'un tag sur tout match atteint uniquement via `continue`, et du `group_by` effectif après héritage. C'est un essai à blanc du dispatch — aucune notification n'est envoyée, rien n'est téléversé, et tout s'exécute dans votre navigateur, de sorte que vous pouvez coller en toute sécurité des noms de receivers internes et des labels d'équipe privés.

Une fois les labels confirmés corrects à la source avec le [Prometheus Relabel Tester](/prometheus-relabel-tester/) et vos règles prouvées comme se déclenchant avec [AlertLint](/loki-alert-rule-tester/), l'arbre de routes est le dernier maillon à réussir. Parcourez-le avant qu'il ne pagine qui que ce soit — et la prochaine fois qu'une alerte atteindra le mauvais receiver, vous saurez quel nœud l'y a envoyée.

[Ouvrir l'Alertmanager Route Tester →](/alertmanager-route-tester/)

---
title: "Comment fonctionne le routage Alertmanager : matchers, continue et l'arbre de routes"
description: "Un modèle mental clair du routage Alertmanager — l'arbre de routes, les matchers, le flag continue, le regroupement et l'héritage du receiver — pour savoir exactement où part une alerte."
pubDate: 2026-06-17
tags: ["alertmanager","observability","alerting"]
lang: fr
translationOf: "how-alertmanager-routing-works"
relatedTool:
  name: "Alertmanager Route Tester"
  href: "/alertmanager-route-tester"
---

![Schéma du routage Alertmanager : les labels d'une alerte entrent dans l'arbre de routes à la racine et descendent par les routes enfants correspondantes jusqu'à un receiver](/blog/how-alertmanager-routing-works-hero.svg)

Une alerte `severity=critical` s'est déclenchée hier soir et l'équipe d'astreinte n'a jamais été notifiée. L'alerte était bien réelle, le receiver existait, le webhook Slack fonctionnait. Le problème se trouvait trois lignes plus haut dans la config : une route catch-all trop large était placée au-dessus de la route de l'équipe et avalait discrètement tout ce qui lui parvenait. Personne n'avait touché au receiver — on avait touché à l'ordre.

C'est précisément ce qui rend le routage Alertmanager facile à rater. Les receivers sont généralement corrects. C'est dans l'arbre de routes que se cachent les surprises. Une fois que vous disposez d'un modèle précis de la manière dont l'arbre de routes est parcouru — comment les matchers sont évalués, quand `continue` laisse une alerte poursuivre sa route, et ce que chaque enfant hérite de son parent — la question « pourquoi cette alerte est-elle partie là ? » cesse d'être un jeu de devinettes. Ce billet construit ce modèle, et chaque règle présentée ici correspond exactement à ce que fait l'[Alertmanager Route Tester](/alertmanager-route-tester) lorsqu'il parcourt un arbre face à une alerte d'exemple.

## Le routage est un arbre, pas une liste

L'erreur de lecture la plus fréquente d'une config Alertmanager consiste à traiter `routes:` comme une liste plate de règles confrontées à chaque alerte. Ce n'est pas une liste. C'est un arbre, et chaque alerte entre au même endroit : la route racine.

```yaml
route:
  receiver: 'default-receiver'        # the root — the catch-all
  group_by: ['alertname', 'cluster', 'service']
  group_wait: 30s
  group_interval: 5m
  repeat_interval: 4h
  routes:                              # child routes
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

La route racine est particulière : elle est empruntée par **chaque** alerte, indépendamment de ses propres matchers. C'est le catch-all. Son `receiver` est celui par défaut sur lequel une alerte atterrit lorsque rien de plus spécifique ne correspond, et ses champs de regroupement constituent la base dont tout ce qui se trouve en dessous hérite. À l'intérieur de la racine se trouve une liste `routes:` — ses enfants. Chaque enfant peut avoir sa propre liste `routes:`, et ainsi de suite en descendant. Une alerte descend depuis la racine à travers les enfants qui correspondent, et le receiver sur lequel elle finit est celui du nœud où la descente s'arrête.

Donc, lorsque vous lisez un `alertmanager.yml`, ne parcourez pas la liste des routes à la recherche de la règle qui correspond. Partez de la racine et descendez. L'arbre de routes Alertmanager est un arbre de décision que l'on parcourt de haut en bas, en profondeur d'abord.

## Comment une route correspond : la syntaxe matchers (et les anciens match/match_re)

Un nœud de route correspond à une alerte lorsque **tous** ses propres matchers sont vérifiés contre les labels de l'alerte. ET logique, sans exception. Un nœud sans matcher correspond toujours. Il existe trois façons de déclarer ces matchers Alertmanager, et vous verrez les trois dans des configs réelles.

```yaml
routes:
  # Modern matchers: syntax — preferred. One operator per line.
  - receiver: 'staging-slack'
    matchers:
      - env=~"staging-.*"      # =~ regex
      - severity!="info"       # != inequality

  # Older match: exact string equality on each key.
  - receiver: 'team-X-mails'
    match:
      team: frontend

  # Older match_re: each value is a regex.
  - receiver: 'prod-pager'
    match_re:
      env: 'prod-.*'
```

La forme moderne `matchers:` porte son opérateur en ligne. Il y en a quatre : `=` (égal), `!=` (différent), `=~` (correspondance regex) et `!~` (non-correspondance regex). Les valeurs peuvent être entre guillemets ou nues. Les deux formes plus anciennes sont du sucre syntaxique au-dessus du même moteur — `match:` est un ensemble de matchers `=`, et `match_re:` un ensemble de matchers `=~`.

Deux détails font constamment trébucher :

- **Les regex sont entièrement ancrées.** Alertmanager encadre chaque motif `=~`, `!~` et `match_re` comme `^(?:…)$`. Ainsi, `env=~"staging"` correspond à la valeur `staging` et à rien d'autre — `env=staging-eu` ne correspond **pas**. Il faut écrire `env=~"staging-.*"` pour couvrir le reste de la valeur. C'est la cause la plus fréquente du fameux « ma route ne correspond à rien ».
- **Un label absent vaut la chaîne vide.** Alertmanager compare un label manquant comme `""`. Ainsi, `foo=""` correspond à une alerte qui ne possède aucun label `foo`, et `foo!=""` exige que `foo` soit présent et non vide. Pratique, et parfois déroutant.

Faire en sorte que ces labels figurent sur l'alerte dès le départ est un travail distinct qui se déroule au moment du scrape — si le label que votre matcher vérifie n'a jamais été défini, remontez jusqu'à votre config de scrape avec le [Prometheus Relabel Tester](/prometheus-relabel-tester) avant d'accuser l'arbre de routes.

## Correspondance en profondeur d'abord et continue : le premier frère qui correspond gagne, sauf si continue vaut true

Voici la règle que l'exemple de la nuit dernière a enfreinte. Au sein d'une route correspondante, les routes enfants sont évaluées **dans l'ordre, de haut en bas**. L'alerte descend dans le **premier** enfant dont tous les matchers sont vérifiés — puis, par défaut, le balayage des frères **s'arrête**. Les frères suivants ne sont même jamais examinés.

```yaml
# TRAP: the broad rule above shadows the specific one
routes:
  - receiver: catch-all
    matchers: ['severity=~".*"']   # matches everything
  - receiver: db-pager             # NEVER reached
    match: { service: database }
```

Une alerte `service=database, severity=critical` atteint d'abord `catch-all`, cette correspondance arrête le balayage, et `db-pager` est du code mort. La solution consiste soit à ordonner du spécifique au plus large, soit à définir `continue: true`.

`continue: true` sur une route correspondante indique à Alertmanager de **ne pas** arrêter le balayage des frères après que cette route a correspondu. L'évaluation se poursuit vers les frères suivants, dont chacun peut lui aussi correspondre. C'est la seule façon pour qu'une même alerte atterrisse sur plus d'un receiver.

```yaml
# Mirror every critical alert to an audit receiver,
# THEN keep routing so the owning team is still paged.
routes:
  - receiver: all-critical-audit
    matchers: ['severity="critical"']
    continue: true               # <- do not stop here
  - receiver: team-backend
    match: { team: backend }
```

Pour une alerte `team=backend, severity=critical`, la première route correspond et arrêterait normalement le balayage — mais `continue: true` la maintient en vie, la seconde route correspond également, et **les deux** receivers se déclenchent. Retirez le `continue` et seul `all-critical-audit` se déclenche ; l'équipe n'en entend jamais parler.

Le parcours se fait en profondeur d'abord : lorsqu'un enfant correspond, l'alerte descend dans *le sous-arbre de cet enfant* et s'y résout avant qu'un quelconque `continue` ne l'emporte vers le frère suivant. L'Alertmanager Route Tester signale chaque receiver atteint uniquement parce qu'un frère précédent a positionné `continue: true`, ce qui vous permet de voir d'un coup d'œil quelles correspondances constituent le chemin principal et lesquelles relèvent du fan-out.

## Regroupement : group_by, group_wait, group_interval, repeat_interval

Le routage décide *où* part une alerte. Le regroupement décide *comment* ses notifications sont regroupées par lots et cadencées une fois qu'elle y est arrivée. Quatre champs le pilotent, et ils figurent sur les nœuds de route, juste à côté des matchers.

```yaml
route:
  receiver: 'default-receiver'
  group_by: ['alertname', 'cluster', 'service']
  group_wait: 30s          # wait this long to collect more alerts for a new group
  group_interval: 5m       # then wait this long before sending updates to that group
  repeat_interval: 4h      # re-send an unresolved group no more often than this
```

- **`group_by`** est la liste des labels qui définit un groupe. Les alertes qui partagent les mêmes valeurs pour ces labels sont rassemblées dans une seule notification. Un cas particulier courant est `group_by: ['...']`, qui regroupe par *tous* les labels (chaque alerte distincte forme son propre groupe), tandis que l'absence de regroupement agrège tout dans un groupe unique.
- **`group_wait`** est le temps pendant lequel Alertmanager retient un groupe tout nouveau avant d'envoyer la première notification, afin qu'une rafale d'alertes liées arrive comme une seule notification plutôt que vingt.
- **`group_interval`** est l'écart minimal avant l'envoi d'une notification *mise à jour* pour un groupe qui s'est déjà déclenché (par exemple lorsqu'une nouvelle alerte rejoint le groupe).
- **`repeat_interval`** est la fréquence à laquelle il renotifie au sujet d'un groupe toujours actif et non résolu.

C'est ce qui fait la différence entre une seule notification utile et une tempête d'alertes. Et, point crucial — ces champs sont hérités.

## Héritage : les routes enfants héritent du receiver et de group_by du parent

Une route enfant n'a pas à répéter le receiver et le regroupement qu'elle veut. Tout ce qu'elle ne définit **pas** est hérité de l'ancêtre le plus proche qui l'a défini. C'est champ par champ : un enfant peut surcharger `group_by` tout en héritant de `group_wait`, `group_interval`, `repeat_interval`, et même de `receiver`.

```yaml
route:
  receiver: 'default-receiver'
  group_by: ['alertname', 'cluster']
  group_wait: 30s
  repeat_interval: 4h
  routes:
    - receiver: 'team-DB-pages'
      match:
        service: database
      group_by: ['alertname', 'cluster', 'database']
      # group_wait and repeat_interval are INHERITED from the root:
      #   group_wait: 30s, repeat_interval: 4h
      routes:
        - match:
            severity: critical
          # No receiver set here, so it INHERITS 'team-DB-pages'.
          # No group_by set, so it INHERITS [alertname, cluster, database].
```

![Un arbre de routes Alertmanager avec une route racine se ramifiant en routes enfants étiquetées par leurs matchers, les feuilles étant des receivers, et une alerte d'exemple descendant le long du chemin correspondant qui est mis en évidence, avec une branche marquée continue true](/blog/how-alertmanager-routing-works-diagram.svg)

Le nœud le plus profond de cet arbre ne définit ni receiver ni `group_by`, et pourtant une alerte `service=database, severity=critical` qui l'atteint notifie `team-DB-pages` et regroupe par `[alertname, cluster, database]` — les deux tirés en cascade. C'est pourquoi la feuille que vous fixez du regard ne raconte peut-être pas toute l'histoire : le receiver effectif et le regroupement sont assemblés en remontant *vers le haut* depuis le nœud correspondant jusqu'au premier ancêtre ayant défini chaque champ. Lorsque vous déboguez une alerte mal routée ou mal regroupée, résolvez l'héritage, pas seulement la feuille.

## Lire un véritable arbre de routes : où atterrit une alerte donnée

Mettons tout cela bout à bout. Voici un arbre complet avec trois enfants au niveau supérieur et un sous-arbre imbriqué sous l'un d'eux.

```yaml
route:
  receiver: 'default-receiver'
  group_by: ['alertname']
  group_wait: 30s
  repeat_interval: 4h
  routes:
    - receiver: 'all-critical-audit'
      matchers:
        - severity="critical"
      continue: true                 # mirror, then keep going
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
    - receiver: 'team-Y-mails'
      match:
        team: backend
```

Traçons maintenant une alerte portant ces labels :

```bash
alertname=Latency
service=web
severity=critical
instance=web-3
```

En parcourant l'arbre, en profondeur d'abord, dans l'ordre :

1. La **racine** est empruntée (toujours). Elle ne s'arrête pas ici ; elle a des enfants à évaluer.
2. Premier enfant, `all-critical-audit` : `severity="critical"` est vérifié. Il correspond → `all-critical-audit` se déclenche. Il a `continue: true`, donc le balayage ne **s'arrête pas**.
3. Deuxième enfant, `web-team` : `service: web` est vérifié. L'alerte descend dans son sous-arbre.
   - Premier petit-enfant, `web-team-pager` : `severity="critical"` est vérifié → `web-team-pager` se déclenche. Pas de `continue`, donc cette branche s'arrête ici. Le `group_by` effectif est `[alertname, instance]`, hérité de `web-team`.
4. La correspondance de `web-team` (une correspondance sans `continue`) arrête le balayage de premier niveau, si bien que `team-Y-mails` n'est jamais évalué.

Résultat final : l'alerte atteint **deux** receivers — `all-critical-audit` (via `continue`) et `web-team-pager` (le chemin principal). Passez `severity` à `warning` et le tableau change : `all-critical-audit` disparaît, et à l'intérieur de `web-team` l'alerte retombe sur `web-team-slack`. Supprimez `service=web` et elle n'entre jamais dans ce sous-arbre, retombant sur `team-Y-mails` si `team=backend`, ou sur le `default-receiver` de la racine si rien ne correspond.

Si vos règles d'alerte elles-mêmes ne se déclenchent pas comme vous l'attendez — mauvais labels, mauvaise severity, mauvais timing — c'est entièrement en amont du routage ; prouvez d'abord la règle avec [AlertLint](/loki-alert-rule-tester), puis tracez où atterrit sa sortie ici.

## Testez votre arbre

Vous pouvez faire ce parcours à la main, et pour un arbre de trois nœuds cela vaut la peine de le faire une fois pour intérioriser le modèle. Mais les vrais arbres s'imbriquent sur cinq niveaux, mélangent `match`, `match_re` et `matchers`, et parsèment `continue` entre les frères — et le coût d'une erreur, c'est un SEV-1 qui ne notifie personne, ou un simple warning qui réveille toute l'équipe.

Alors rendez la vérification peu coûteuse. Collez votre arbre de routes et les labels d'une alerte d'exemple dans l'[Alertmanager Route Tester](/alertmanager-route-tester) et il effectue exactement le parcours ci-dessus — entièrement dans votre navigateur, rien n'est envoyé. Il indique chaque receiver atteint par l'alerte dans l'ordre d'évaluation, le fil d'Ariane du chemin de route depuis la racine jusqu'à chaque nœud correspondant, une étiquette sur tout receiver atteint uniquement via `continue: true`, et le `group_by` effectif après héritage. Il reproduit la sémantique décrite dans ce billet : regex ancrées, label manquant traité comme chaîne vide, première-correspondance-puis-`continue`, et héritage champ par champ.

La prochaine fois qu'une alerte atterrit à un endroit inattendu, vous n'aurez pas à en déclencher une vraie pour observer. Collez l'arbre, collez les labels, et lisez le chemin qu'elle a réellement emprunté.

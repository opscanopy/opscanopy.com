---
title: "Pourquoi Prometheus a-t-il supprimé ma cible ? Déboguer les relabel_configs"
description: "Une cible a disparu ou un label s'est volatilisé après le relabeling. Déboguez les relabel_configs de Prometheus face aux metric_relabel_configs, l'ancrage des regex et la logique keep/drop."
pubDate: 2026-06-16
tags: ["prometheus","observability","relabeling"]
lang: fr
translationOf: "debug-prometheus-relabeling"
relatedTool:
  name: "Prometheus Relabel Tester"
  href: "/prometheus-relabel-tester"
---

![Débogage d'une cible Prometheus supprimée : le cycle de vie du scrape, de la découverte de services jusqu'au TSDB en passant par les relabel_configs, avec une cible mise en évidence comme supprimée.](/blog/debug-prometheus-relabeling-hero.svg)

Vous avez ajouté un nouvel exporter, rechargé Prometheus, ouvert `/targets`, et elle n'y est pas. Aucune erreur dans les logs. La configuration de scrape a été parsée sans problème. L'exporter est opérationnel et vous pouvez interroger son `/metrics` à la main avec `curl`. Mais Prometheus a supprimé votre cible sans vous dire pourquoi. Ou pire : la cible apparaît, mais un label dont dépendent votre routage ou vos tableaux de bord a silencieusement disparu. Ces deux symptômes mènent presque toujours au même endroit : `relabel_configs`. Cet article explique comment déboguer les `relabel_configs`, en quoi ils diffèrent des `metric_relabel_configs`, et la poignée d'erreurs qui expliquent la quasi-totalité des cibles supprimées.

## Le symptôme : une cible absente dans /targets, ou un label volatilisé

Il y a deux défaillances distinctes, et il est utile de les nommer avant de commencer à creuser.

La première est la **cible supprimée** : elle n'apparaît jamais sous `/targets`, pas même dans un état « down ». La découverte de services l'a trouvée, mais une règle `keep` ou `drop` l'a écartée avant l'exécution du scrape. Prometheus ne consigne rien à ce sujet — de son point de vue, rien ne s'est mal passé.

La seconde est le **label disparu** : la cible est scrapée correctement, mais un label que vous attendiez a disparu, ou a été écrasé par quelque chose d'inattendu. Vous le constatez dans `/targets` (survolez les labels) ou en interrogeant les séries et en remarquant que la dimension sur laquelle vous vouliez regrouper n'y est pas.

```bash
# The target you expect is simply absent from the list:
curl -s localhost:9090/api/v1/targets | jq '.data.activeTargets[].labels.job'
# "node-exporter"
# "blackbox"
#   ← your "api" job never shows up
```

Lorsqu'une cible est silencieusement absente, la cause se situe en amont du scrape. C'est le relabeling. La bonne nouvelle : le relabeling est déterministe. Pour les mêmes labels en entrée et les mêmes règles, vous obtenez le même résultat à chaque fois, ce qui veut dire que vous pouvez le reproduire hors ligne.

## relabel_configs vs metric_relabel_configs : où chacun s'exécute

Les deux blocs de configuration appliquent *exactement les mêmes* actions et sémantiques de relabeling. La seule différence tient à **l'endroit** du cycle de vie du scrape où ils s'exécutent — et c'est cette différence qui détermine quel symptôme vous êtes en train de déboguer.

`relabel_configs` s'exécute **au moment du scrape, avant celui-ci**, sur les labels de cible issus de la découverte de services. Ce sont ces labels qui décident *si une cible est scrapée ou non* et quelle est son identité (`job`, `instance`, `__address__`). Un `keep`/`drop` ici supprime une cible entière. C'est le bloc à inspecter lorsqu'une cible est absente de `/targets`.

`metric_relabel_configs` s'exécute **après le scrape**, sur l'ensemble de labels de chaque échantillon au moment de son ingestion. Un `keep`/`drop` ici supprime des séries temporelles individuelles, pas la cible. C'est le bloc à inspecter lorsque la cible est présente mais que des séries ou des labels spécifiques manquent.

![Le cycle de vie du scrape Prometheus montrant la découverte de services et les labels __meta_, puis relabel_configs qui peut supprimer une cible entière, puis le scrape, puis metric_relabel_configs qui peut supprimer des échantillons individuels, puis le TSDB.](/blog/debug-prometheus-relabeling-diagram.svg)

```yaml
scrape_configs:
  - job_name: api
    kubernetes_sd_configs:
      - role: pod

    # Runs BEFORE the scrape, on discovery labels (__meta_*, __address__).
    # A keep/drop here removes the whole target.
    relabel_configs:
      - source_labels: [__meta_kubernetes_pod_annotation_prometheus_io_scrape]
        action: keep
        regex: "true"

    # Runs AFTER the scrape, on each sample. A drop here removes series,
    # not the target.
    metric_relabel_configs:
      - source_labels: [__name__]
        action: drop
        regex: go_gc_.*
```

Si votre cible est absente, vous n'atteignez jamais `metric_relabel_configs` — déboguez d'abord `relabel_configs`. Si la cible est présente mais qu'une série a disparu, c'est l'autre bloc. Bien saisir cette distinction, c'est gagner la moitié de la bataille quand vous cherchez « metric_relabel_configs vs relabel_configs » à 2 h du matin.

## Les suspects habituels

Presque toutes les cibles supprimées proviennent de l'une de ces causes. Chacune est facile à commettre et invisible tant que vous ne la reproduisez pas.

### Une regex de keep qui ne correspond pas (parce que la regex est ancrée)

C'est la cause numéro un. **Prometheus ancre chaque regex de relabeling** — en interne, il encadre votre motif sous la forme `^(?:<your regex>)$`. Le motif doit correspondre à la valeur source jointe *en entier*, et non à une sous-chaîne.

```yaml
- source_labels: [job]
  action: keep
  regex: api          # anchored to ^(?:api)$
```

Cela conserve une cible dont le `job` est exactement `api`. Cela ne conserve **pas** `api-server`, `api-prod`, ni `payments-api`. Avec une action `keep`, tout ce qui ne correspond pas est supprimé — votre cible `api-server` se volatilise donc en silence. La solution consiste à faire correspondre ce que vous voulez réellement :

```yaml
- source_labels: [job]
  action: keep
  regex: api.*        # ^(?:api.*)$ — matches api, api-server, api-prod
```

### Un drop trop large

Le symptôme inverse. Un modèle mental non ancré combiné à une regex gourmande capture plus que prévu :

```yaml
- source_labels: [__name__]
  action: drop
  regex: .*_bucket   # drops EVERY *_bucket series, including ones you need
```

`keep` est une barrière de type liste d'autorisation ; `drop` est une barrière de type liste de blocage. Un `drop` trop large dans `metric_relabel_configs` efface discrètement des séries que vous vouliez conserver, et vous ne le remarquez que lorsqu'un tableau de bord se vide.

### De mauvais source_labels, ou la mauvaise jointure

Lorsqu'une règle liste plusieurs `source_labels`, Prometheus joint leurs valeurs avec le **séparateur** — qui vaut par défaut un seul point-virgule `;` — *avant* d'appliquer la regex. Si vous oubliez le séparateur, votre regex ne correspond jamais à la chaîne jointe :

```yaml
# job="api", instance="10.0.0.1:9090" joins to "api;10.0.0.1:9090"
- source_labels: [job, instance]
  action: keep
  regex: api          # ✗ never matches "api;10.0.0.1:9090"
```

Il vous faut une regex qui prenne en compte le `;`, par exemple `api;.*`. Un label source manquant n'est pas non plus une erreur — Prometheus traite un label absent comme une chaîne vide lors de la jointure, si bien que `source_labels: [does_not_exist]` se joint à `""` et qu'un `keep: regex: ".+"` supprime tout.

### Un replacement qui a écrasé __address__ (ou supprimé un label)

`replace` a un comportement subtil mais bien réel : **si la regex ne correspond pas, le label reste inchangé ; mais si elle correspond et que le replacement développé est la chaîne vide, le label de cible est supprimé, et non mis à blanc.** Écrasez `__address__` avec une valeur vide et la cible perd de fait son adresse de scrape.

```yaml
# If prometheus_io_port is absent, the joined value won't match this regex,
# so __address__ is left alone. But a regex that DOES match and expands to ""
# would DELETE __address__ entirely.
- source_labels: [__address__, __meta_kubernetes_pod_annotation_prometheus_io_port]
  action: replace
  regex: ([^:]+)(?::\d+)?;(\d+)
  replacement: $1:$2
  target_label: __address__
```

C'est la plus insidieuse, car un `instance` ou un `__address__` vide ne déclenche aucune erreur — il produit simplement une cible impossible à scraper, ou qui entre en collision avec une autre.

## Un workflow de débogage

Lorsqu'une cible est absente, procédez de haut en bas. Tout l'enjeu consiste à retrouver *l'entrée exacte* que les règles ont vue, puis à rejouer les règles dessus.

### 1. Récupérer les labels de la cible, y compris les __meta_

Prometheus expose les labels de découverte d'avant relabeling — les labels `__meta_*` — mais uniquement pour les cibles ayant survécu au relabeling ; une cible entièrement supprimée n'apparaît donc pas. L'astuce consiste à recharger en retirant temporairement les règles de relabeling (ou en les réduisant à un unique `keep` permissif), puis à lire les labels de découverte bruts :

```bash
# Show discovered labels for the job, including the __meta_* set the
# relabel rules actually see as input.
curl -s 'localhost:9090/api/v1/targets?state=active' \
  | jq '.data.activeTargets[]
        | select(.discoveredLabels.job=="api")
        | .discoveredLabels'
```

`discoveredLabels` est l'entrée de vos `relabel_configs`. `labels` en est la sortie. Si une cible est entièrement supprimée, vous pouvez aussi lire directement l'état de la découverte de services :

```bash
curl -s localhost:9090/api/v1/targets/metadata >/dev/null  # sanity check API is up
curl -s 'localhost:9090/service-discovery' # the SD page shows pre-relabel labels
```

### 2. Tester les règles sur ces labels

Vous disposez maintenant de l'entrée. Collez les labels `__meta_*` et vos `relabel_configs` dans [le Prometheus Relabel Tester](/prometheus-relabel-tester/) et exécutez-les. Il applique les règles exactement comme le fait Prometheus — regex ancrée, séparateur `;`, expansion `$1`/`${1}` — et vous indique, pour chaque ensemble de labels, les labels résultants, lesquels ont été ajoutés, modifiés ou supprimés, et si la cible a été supprimée (et par quelle règle).

### 3. Bissecter la liste de règles

Si vous avez une longue chaîne, commentez la seconde moitié des règles et relancez. Si la cible survit, le coupable se trouve dans la moitié que vous avez retirée ; si elle est toujours supprimée, il est dans la moitié restante. Coupez de nouveau en deux. Comme le relabeling est une chaîne déterministe parcourue de haut en bas — chaque règle voit la sortie de la précédente — la bissection converge vite, généralement en deux ou trois tours.

## Exemple concret : la cible disparue, repérée et corrigée

Voici une forme réelle de ce bug. Vous découvrez un pod, vous voulez ne conserver que les pods qui ont opté pour le scrape, et router par environnement. La cible n'apparaît jamais.

```yaml
relabel_configs:
  - source_labels: [__meta_kubernetes_pod_annotation_prometheus_io_scrape]
    action: keep
    regex: "true"

  - source_labels: [__meta_kubernetes_pod_label_env]
    action: keep
    regex: prod
```

Les labels de découverte de la cible que vous attendiez :

```text
__meta_kubernetes_pod_annotation_prometheus_io_scrape="true"
__meta_kubernetes_pod_label_app="api"
__meta_kubernetes_pod_label_env="production"
__address__="10.0.0.5:8080"
```

Passez cette entrée à travers les règles. Le premier `keep` passe — `prometheus_io_scrape` vaut exactement `"true"`. Le second `keep` se joint à `production` et tente de correspondre à `^(?:prod)$`. Ça ne correspond pas. `production` n'est pas `prod`, la regex est ancrée, et `keep` supprime tout ce qui ne correspond pas. **La règle 2 a supprimé la cible.** Le testeur signale précisément cela : supprimée par la règle 2, action `keep`.

La solution consiste à faire correspondre la vraie valeur :

```yaml
  - source_labels: [__meta_kubernetes_pod_label_env]
    action: keep
    regex: prod.*       # ^(?:prod.*)$ — now matches "production"
```

Relancez. La cible survit, porte `__address__="10.0.0.5:8080"`, et apparaît dans `/targets`. Temps total : moins d'une minute, sans recharger Prometheus et sans attendre un intervalle de scrape.

Pendant que vous faites le ménage, la même chaîne fait souvent remonter les labels du pod et élague les métadonnées de découverte. Notez que `labelmap` opère sur les *noms* de labels, en copiant les labels correspondants vers un nouveau nom, et que `labeldrop` supprime les labels dont les noms correspondent — utile, mais c'est un autre endroit où un label que vous vouliez peut discrètement disparaître :

```yaml
  # Promote pod labels: __meta_kubernetes_pod_label_app="api" → app="api"
  - action: labelmap
    regex: __meta_kubernetes_pod_label_(.+)

  # Strip leftover discovery metadata before storage.
  - action: labeldrop
    regex: __meta_.+
```

## L'attraper avant le déploiement

La boucle de débogage la plus rapide est celle qui n'atteint jamais un Prometheus en production. Si le relabeling est si facile à rater, c'est qu'il échoue en silence : pas d'erreur de parsing, pas de ligne de log, juste une cible absente. La seule vérification honnête consiste à exécuter les règles sur une entrée représentative et à lire la sortie — la même idée que tester n'importe quelle configuration comportementale plutôt que de se fier à un lint de schéma.

Quand vous fixez du regard un mystère « prometheus dropped target » ou un rapport « prometheus label disappeared », récupérez les `discoveredLabels` depuis l'API, collez-les avec vos règles dans [le Prometheus Relabel Tester](/prometheus-relabel-tester/), et observez quelle règle fait des dégâts — il s'exécute entièrement dans votre navigateur, si bien que vos configurations de scrape internes et les métadonnées de vos cibles ne quittent jamais votre onglet.

Une fois les labels corrects, le reste de la chaîne d'observabilité suit. Décomposez une requête qui dépend de ces labels avec [le PromQL Explainer](/promql-explainer/), ou vérifiez qu'une alerte sur les séries résultantes arrive au bon endroit avec [l'Alertmanager Route Tester](/alertmanager-route-tester/). Mettez d'abord les labels en forme ; tout ce qui se trouve en aval dépend de la justesse de cette étape.

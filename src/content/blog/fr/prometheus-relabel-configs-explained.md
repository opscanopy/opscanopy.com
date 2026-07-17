---
title: "Comprendre les relabel_configs de Prometheus : guide pratique"
description: "Maîtrisez les relabel_configs de Prometheus de bout en bout — source_labels, regex, replacement et chaque action (replace, keep, drop, labelmap, hashmod) — avec des recettes prêtes à copier-coller."
pubDate: 2026-06-13
tags: ["prometheus","observability","relabeling"]
lang: fr
translationOf: "prometheus-relabel-configs-explained"
relatedTool:
  name: "Prometheus Relabel Tester"
  href: "/prometheus-relabel-tester"
---

![Schéma d'un pipeline relabel_configs de Prometheus montrant des source_labels assemblées en une valeur, comparée à une regex ancrée, et une action comme replace, keep, drop, labelmap ou hashmod réécrivant les labels de sortie.](/blog/prometheus-relabel-configs-explained-hero.svg)

Une cible que vous comptiez scraper n'apparaît jamais dans Prometheus. Aucune erreur dans les logs, aucun scrape en échec, rien de rouge sur la page des targets — la série n'est tout simplement pas là. Vous ajoutez `--log.level=debug`, vous redémarrez, vous scrutez la sortie, et vous finissez par mettre le doigt dessus : une règle `keep` placée trois lignes plus haut dans vos `relabel_configs` a discrètement écarté la cible parce que la regex ne correspondait pas comme vous le pensiez. C'est précisément cet échec silencieux qui fait que les `relabel_configs` méritent une lecture attentive. Le relabeling de Prometheus réécrit, conserve ou écarte les cibles et leurs labels, et quand il a tort il ne se plaint pas — il jette simplement vos métriques.

Ce guide parcourt le relabeling de Prometheus depuis les fondations : ce qu'il fait, les champs qui composent chaque règle, et chaque action accompagnée d'un petit exemple. La sémantique exposée ici correspond exactement à ce qu'implémente le moteur du [Prometheus Relabel Tester](/prometheus-relabel-tester/), si bien que vous pouvez coller n'importe quel extrait ci-dessous dans l'outil et observer les labels évoluer.

## Ce que fait réellement le relabeling

Le relabeling s'exécute sur un ensemble de labels et produit un nouvel ensemble de labels. C'est tout. Chaque cible que Prometheus découvre arrive sous la forme d'un sac de labels — son adresse, son job, et une pile de labels `__meta_*` issus de la service discovery. Avant que le scrape n'ait lieu, vos règles `relabel_configs` s'exécutent de haut en bas sur ces labels. Chaque règle voit la sortie de celle qui la précède.

Une règle peut faire l'une de ces trois choses sur cet ensemble de labels :

- **Réécrire** un label (ou en créer un) — `replace`, `labelmap`, `lowercase`, `uppercase`, `hashmod`.
- **Écarter la cible entière** pour qu'elle ne soit jamais scrapée — `keep`, `drop`, `keepequal`, `dropequal`.
- **Supprimer des labels individuels** par leur nom — `labeldrop`, `labelkeep`.

```yaml
scrape_configs:
  - job_name: api
    static_configs:
      - targets: ["10.0.0.5:8080"]
    relabel_configs:
      - source_labels: [__address__]
        target_label: instance
```

Après l'exécution de cette règle, la cible porte un label `instance` copié depuis `__address__`. Aucune erreur, rien d'écarté — un label a été réécrit. C'est là tout le travail du relabeling, répété règle après règle.

Le relabeling s'exécute à deux endroits. `relabel_configs` s'exécute *avant* le scrape, sur les labels de découverte de la cible, et peut conserver ou écarter des cibles entières. `metric_relabel_configs` s'exécute *après* le scrape, sur les labels de chaque échantillon, et sert à écarter ou réécrire des séries temporelles individuelles. Mêmes actions, même sémantique — seuls le moment et l'entrée diffèrent.

## Les briques de base : source_labels, separator, regex, modulus, target_label, replacement, action

Chaque règle de relabeling est assemblée à partir de la même poignée de champs. La plupart ont des valeurs par défaut, si bien qu'une règle les renseigne rarement tous.

```yaml
- source_labels: [job, instance]   # which label values to read
  separator: ";"                   # how to join them (default ";")
  regex: "(.*);(.*)"               # pattern to match the joined value (default "(.*)")
  modulus: 8                       # only for hashmod
  target_label: combined           # label to write (required by some actions)
  replacement: "$1-$2"             # value to write, with $1/${1} expansion (default "$1")
  action: replace                  # what to do (default "replace")
```

Voici comment une règle traite cela. Prometheus lit chaque nom dans `source_labels`, recherche sa valeur (un label absent est lu comme la chaîne vide), puis les assemble avec `separator`. Le séparateur par défaut est un simple point-virgule, donc `source_labels: [job, instance]` sur `job="api"`, `instance="10.0.0.1:9090"` produit la valeur assemblée `api;10.0.0.1:9090`.

Cette valeur assemblée est comparée à `regex`. Le détail qui piège tout le monde : **la regex est entièrement ancrée**. Prometheus encapsule votre motif sous la forme `^(?:your-regex)$`, il doit donc correspondre à la valeur assemblée *entière*, et non à une simple portion.

```yaml
# This does NOT match "api-server" — the regex must match the whole value.
- source_labels: [job]
  regex: api
  action: keep
```

Une règle `regex: api` ne conservera pas une cible dont le `job` vaut `api-server`, parce que `^(?:api)$` ne correspond qu'à la chaîne littérale `api`. Il vous faudrait `api.*` ou `(api.*)`. Ce seul fait explique la majorité des mystères du type « ma cible a disparu ».

Quand la regex correspond et que l'action écrit un label, `replacement` fournit la valeur. Les groupes de capture s'étendent via `$1`, `${1}`, ou les groupes nommés `$name`/`${name}` ; le replacement par défaut est `$1`, ce qui explique pourquoi un simple `replace` avec `regex: (.*)` recopie la valeur source telle quelle. `modulus` n'est lu que par `hashmod`, et `target_label` est requis par `replace`, `hashmod`, `lowercase`, `uppercase`, `keepequal` et `dropequal`.

![Illustration synthwave d'une règle de relabeling : les source_labels traversent une regex ancrée, le replacement $1:$2 s'étend, puis des actions comme replace, keep, labelmap et hashmod réécrivent les labels.](/blog/in-content/prometheus-relabel-configs-explained.webp)

## Les actions une à une : replace, keep, drop, labelmap, labelkeep, labeldrop, hashmod

Prometheus prend en charge onze actions. Chaque exemple ci-dessous est une règle complète et exécutable.

### replace

Assembler les labels source, comparer la regex, étendre `$1`/`${1}` dans `replacement`, et définir `target_label`.

```yaml
- source_labels: [__address__]
  regex: "([^:]+):.*"
  target_label: ip
  replacement: "$1"
```

`__address__="10.0.0.5:8080"` devient un nouveau label `ip="10.0.0.5"`. Si la regex ne correspond pas, l'ensemble de labels reste inchangé. Il y a une subtilité à mémoriser : **si le replacement étendu est la chaîne vide, `replace` supprime le target_label** au lieu de le laisser vide.

```yaml
# When tmp_instance is empty, this DELETES the instance label.
- source_labels: [tmp_instance]
  regex: "(.+)"
  target_label: instance
  replacement: "$1"
```

Sur `instance="old"`, `tmp_instance=""`, la regex `(.+)` ne parvient pas à correspondre à une valeur vide, donc rien ne se passe — `instance` survit. Mais modifiez la source de sorte que l'expansion aboutisse à une chaîne vide, et le label `instance` disparaît entièrement. Cette asymétrie est une source fréquente du « où est passé mon label ? ».

### keep

Écarter la cible entière sauf si la source assemblée correspond à la regex.

```yaml
- source_labels: [__meta_kubernetes_pod_annotation_prometheus_io_scrape]
  action: keep
  regex: "true"
```

Seuls les pods annotés `prometheus.io/scrape: "true"` survivent ; tout le reste est écarté avant le scrape. `keep` est un filtre en liste blanche (allow-list).

### drop

Le miroir de `keep` : écarter la cible quand la source assemblée *correspond* bien.

```yaml
- source_labels: [__name__]
  action: drop
  regex: "go_gc_.*"
```

Utilisée dans `metric_relabel_configs`, cette règle réduit au silence toute la famille de métriques `go_gc_*` avant qu'elle ne soit stockée. `drop` est un filtre en liste noire (deny-list).

### labelmap

`labelmap` opère sur les **noms** de labels, pas sur les valeurs. Pour chaque label dont le nom correspond à la regex, elle définit un nouveau label — nommé d'après le replacement étendu — avec la valeur de ce label.

```yaml
- action: labelmap
  regex: "__meta_kubernetes_pod_label_(.+)"
```

Un label `__meta_kubernetes_pod_label_app="api"` produit un nouveau label `app="api"`. C'est le geste canonique pour promouvoir les labels de pods Kubernetes en labels ordinaires. Le `replacement` par défaut `$1` est ce qui écrit le suffixe capturé comme nouveau nom.

### labelkeep / labeldrop

Les deux filtrent les labels par leur nom. `labeldrop` supprime tout label dont le nom correspond ; `labelkeep` supprime tout label dont le nom *ne correspond pas*.

```yaml
# Strip all leftover service-discovery metadata.
- action: labeldrop
  regex: "__meta_.+"
```

```yaml
# Keep only the four labels you care about; drop everything else.
- action: labelkeep
  regex: "(__name__|job|instance|severity)"
```

### hashmod

`hashmod` définit `target_label` sur un numéro de shard stable. Elle calcule le MD5 de la source assemblée, lit les 8 derniers octets de ce condensé comme un entier 64 bits big-endian, et stocke `hash % modulus`.

```yaml
- source_labels: [__address__]
  action: hashmod
  modulus: 3
  target_label: __tmp_shard
```

Chaque cible reçoit une valeur `__tmp_shard` déterministe de `0`, `1` ou `2`. La recette MD5 a son importance : le Relabel Tester la reproduit octet pour octet, donc les valeurs de shard qu'il affiche sont celles que Prometheus calculera.

### keepequal / dropequal

Ces deux actions ne prennent aucune regex. Elles comparent la valeur de la source assemblée à la *valeur actuelle* de `target_label` et conservent ou écartent en cas d'égalité.

```yaml
# Drop the target if its port already equals the discovered one.
- source_labels: [__meta_port]
  action: dropequal
  target_label: port
```

`keepequal` ne conserve que lorsque les deux sont égaux ; `dropequal` écarte lorsqu'elles sont égales.

### lowercase / uppercase

Définir `target_label` sur la valeur de la source assemblée mise en minuscules ou en majuscules — pratique pour normaliser des labels de découverte à la casse incohérente.

```yaml
- source_labels: [environment]
  action: lowercase
  target_label: environment
```

`environment="PRODUCTION"` devient `environment="production"`.

## Les labels __meta_ issus de la service discovery et pourquoi ils comptent

Chaque mécanisme de service discovery — Kubernetes, EC2, Consul, basé sur fichiers — attache des labels `__meta_*` à chaque cible qu'il trouve. Ils ne sont disponibles *que* pendant les `relabel_configs`. Ils sont supprimés avant le scrape, donc si vous voulez qu'une de ces métadonnées survive en tant que label réel, vous devez d'abord la copier avec `replace` ou `labelmap`.

![Le pipeline de relabeling pour une règle : les labels d'entrée, l'assemblage des source_labels avec le separator, la comparaison de la regex, l'application de l'action, et la production des labels de sortie.](/blog/prometheus-relabel-configs-explained-diagram.svg)

Une cible de pod Kubernetes arrive à peu près comme ceci :

```text
__address__="10.0.0.5:8080"
__meta_kubernetes_namespace="default"
__meta_kubernetes_pod_name="api-7d9f"
__meta_kubernetes_pod_label_app="api"
__meta_kubernetes_pod_annotation_prometheus_io_scrape="true"
__meta_kubernetes_pod_annotation_prometheus_io_port="9100"
```

Les labels `__meta_*` sont la raison d'être même du relabeling. Ils transportent le contexte de découverte — quel namespace, quelles annotations, quels labels de pod — que vous transformez en décisions de scrape (`keep` sur l'annotation de scrape) et en labels durables (`labelmap` des labels de pod). Tout ce qui commence par un double underscore est interne et supprimé après le relabeling, à l'exception notable de `__name__` (le nom de la métrique) qui survit jusqu'au stockage. Comme ces labels n'existent qu'au moment du relabeling, la seule façon sûre de confirmer qu'une règle les lit correctement est de faire passer un jeu `__meta_*` réaliste à travers vos règles et d'examiner la sortie.

## Des recettes que vous réutiliserez

Voici les patterns qui apparaissent dans presque toutes les configurations de scrape réelles.

### Ne conserver que les cibles prod

```yaml
- source_labels: [__meta_kubernetes_namespace]
  action: keep
  regex: "prod|production"
```

Ancrée, donc `prod` correspond exactement au namespace `prod` et `staging-prod` ne correspondrait *pas*, à moins d'écrire `.*prod.*`. L'alternative `|` couvre les deux conventions de nommage.

### Écarter les métriques bruyantes (metric_relabel_configs)

```yaml
metric_relabel_configs:
  - source_labels: [__name__]
    action: drop
    regex: "go_gc_.*|process_.*"
```

S'exécute après le scrape, en écartant les familles à forte cardinalité avant qu'elles n'atteignent le stockage.

### Sharding avec hashmod

Le pattern de sharding horizontal à deux règles — hacher vers un label temporaire, puis ne conserver que le shard dont ce Prometheus est responsable :

```yaml
- source_labels: [__address__]
  action: hashmod
  modulus: 3
  target_label: __tmp_shard

- source_labels: [__tmp_shard]
  action: keep
  regex: "0"
```

Exécutez ceci sur quatre adresses d'exemple dans le tester et vous verrez exactement lesquelles, deux ou trois, atterrissent sur le shard `0` et survivent — les autres sont écartées, marquées de la règle et de l'action responsables.

### Mapper les labels SD avec labelmap, puis réécrire l'adresse

```yaml
# Promote every pod label to a plain label.
- action: labelmap
  regex: "__meta_kubernetes_pod_label_(.+)"

# Rebuild __address__ from the IP and an annotated port.
- source_labels: [__address__, __meta_kubernetes_pod_annotation_prometheus_io_port]
  action: replace
  regex: "([^:]+)(?::\\d+)?;(\\d+)"
  replacement: "$1:$2"
  target_label: __address__
```

La seconde règle illustre l'idiome de la source assemblée : deux `source_labels` jointes par le séparateur `;` par défaut, avec une regex écrite pour tenir compte de ce séparateur. `__address__="10.0.2.4:8080"` jointe au port `9100` devient `10.0.2.4:8080;9100`, la regex capture `10.0.2.4` et `9100`, et l'adresse est reconstruite en `10.0.2.4:9100`.

## Testez avant de déployer

Le relabeling est la seule partie d'une configuration Prometheus où être presque correct ne produit ni erreur ni avertissement — juste des séries manquantes ou erronées. L'ancrage de la regex, la suppression sur replacement vide, le hashmod MD5, l'ordre d'assemblage de plusieurs `source_labels` : chacun est facile à se tromper subtilement, et un Prometheus en production ne vous dira pas lequel vous a piégé.

Collez les recettes de cet article, avec un jeu réaliste de labels `__meta_*`, dans le [Prometheus Relabel Tester](/prometheus-relabel-tester/) et vous verrez la valeur assemblée, la regex correspondante (ou non), le diff label par label, et un signalement clair — nommant la règle et l'action — chaque fois qu'une cible est écartée. L'outil tourne entièrement dans votre navigateur, vous pouvez donc coller en toute sécurité des configurations de scrape internes.

Une fois les labels façonnés comme vous le souhaitez, les questions suivantes portent sur ce que vous interrogez et sur la façon dont vous alertez. Décomposez une expression avec [le PromQL Explainer](/promql-explainer/), ou, si vous déplacez des règles entre Loki et Prometheus, traduisez-les avec [le LogQL ↔ PromQL Helper](/logql-promql-helper/). Commencez par bien définir les labels — tout ce qui se trouve en aval en dépend.

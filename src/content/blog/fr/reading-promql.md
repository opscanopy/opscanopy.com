---
title: "Comment lire une requête PromQL"
description: "Une requête PromQL se lit de l'intérieur vers l'extérieur, et non de gauche à droite. Découvrez les quatre couches — sélecteurs, plages, fonctions et agrégations — pour décoder n'importe quelle expression Prometheus en un coup d'œil."
pubDate: 2026-06-08
tags: ["promql", "prometheus", "observability"]
lang: fr
translationOf: "reading-promql"
---

![Comment lire une requête PromQL : décoder les sélecteurs, plages, fonctions et agrégations de Prometheus de l'intérieur vers l'extérieur](/blog/reading-promql-hero.svg)

PromQL paraît dense la première fois qu'on le rencontre. Une ligne comme `histogram_quantile(0.99, sum by (le, route) (rate(http_request_duration_seconds_bucket[5m])))` se lit comme un seul long mot, et l'instinct est de la parcourir de gauche à droite comme une phrase. C'est la mauvaise direction. PromQL est un langage fonctionnel, si bien que le sens part de l'expression la plus **interne** vers l'extérieur — exactement comme vous évalueriez une formule imbriquée en mathématiques. Une fois que vous le lisez de l'intérieur vers l'extérieur, presque chaque requête se décompose selon les quatre mêmes couches.

## Les quatre couches

La quasi-totalité des expressions PromQL non triviales se construisent à partir de ces couches, empilées de l'intérieur vers l'extérieur :

1. **Un sélecteur** — les séries d'où vous partez.
2. **Une plage** — sur quelle fenêtre de temps (uniquement lorsque vous avez besoin d'historique, pas d'un instant).
3. **Une fonction** — la transformation que vous appliquez à ces échantillons.
4. **Une agrégation** — la manière dont vous condensez de nombreuses séries en un plus petit nombre.

Lisez-les dans cet ordre et la requête s'explique d'elle-même.

![Une requête PromQL décomposée en nom de métrique, correspondance de label, sélecteur de plage, fonction rate et agrégation](/blog/reading-promql-diagram.svg)

## Couche 1 : le sélecteur

Le cœur de toute requête est un **sélecteur de métrique** : un nom de métrique accompagné de correspondances de labels optionnelles entre accolades.

```promql
http_requests_total{job="api", status=~"5.."}
```

Cela sélectionne chaque série nommée `http_requests_total` où le label `job` est égal à `api` et où le label `status` correspond à l'expression régulière `5..` (n'importe quel code 5xx). Les correspondances sont l'élément important :

- `=` correspondance exacte
- `!=` différent
- `=~` correspondance par expression régulière
- `!~` non-correspondance par expression régulière

À elle seule, un sélecteur renvoie un **vecteur instantané** — un échantillon courant par série correspondante. Cette distinction est déterminante pour tout ce qui suit.

## Couche 2 : la plage

Ajoutez une durée entre crochets et le sélecteur devient un **vecteur de plage** — chaque échantillon de cette fenêtre, par série, et non uniquement le plus récent.

```promql
http_requests_total{job="api"}[5m]
```

Vous ne pouvez pas représenter directement un vecteur de plage sur un graphique ; c'est de la matière brute. Vous le confiez à une fonction qui sait quoi faire d'une fenêtre d'échantillons. L'exemple classique est `rate` :

```promql
rate(http_requests_total{job="api"}[5m])
```

`rate` examine les échantillons du compteur sur les 5 dernières minutes et renvoie le taux moyen d'augmentation par seconde. C'est le motif le plus courant dans Prometheus, et il vaut la peine d'intérioriser pourquoi il existe : `http_requests_total` est un **compteur** qui ne fait que croître (jusqu'à ce qu'un redémarrage le remette à zéro), si bien que sa valeur brute n'a aucun sens sur un tableau de bord. C'est le taux de variation qui vous importe réellement. `rate` gère aussi de manière transparente les remises à zéro du compteur, et c'est pourquoi vous ne devriez jamais calculer les taux à la main.

Une brève note sur le dimensionnement de la fenêtre : la plage (`[5m]`) devrait couvrir confortablement au moins quelques intervalles de scrape. Trop courte, et vous obtenez des résultats bruités et lacunaires ; trop longue, et vous lissez les pics que vous cherchiez justement à capter.

![Illustration : une requête PromQL en couches empilées éclairées au néon — sélecteurs à la base, puis plages, fonctions et agrégation — lue de l'intérieur vers l'extérieur](/blog/in-content/reading-promql.webp)

## Couche 3 : les fonctions

Les fonctions transforment les vecteurs. Celles que vous rencontrerez constamment :

- `rate(...)` — taux moyen par seconde d'un compteur sur une plage.
- `irate(...)` — taux instantané à partir des deux derniers échantillons ; plus saccadé, adapté aux graphiques à évolution rapide.
- `increase(...)` — augmentation totale sur la plage (essentiellement `rate × seconds`).
- `histogram_quantile(φ, ...)` — estime un quantile (par exemple p99) à partir des buckets d'un histogramme.
- les comparaisons du type `rate(...[5m]) > 0` — du filtrage, abordé plus bas.

Ainsi, `rate(http_requests_total{job="api", status=~"5.."}[5m])` se lit, de l'intérieur vers l'extérieur, comme suit : *prendre le compteur de requêtes 5xx pour le job api, sur une fenêtre de 5 minutes, et me donner le taux d'erreur par seconde, par série.*

## Couche 4 : l'agrégation

Un sélecteur doté d'un label `job` et d'un label `status` peut tout de même correspondre à des dizaines de séries — une par instance, par pod, par code de statut. Les opérateurs d'agrégation les condensent.

```promql
sum by (job) (rate(http_requests_total{status=~"5.."}[5m]))
```

`sum by (job)` additionne les taux par série, en ne conservant **que** le label `job` et en écartant le reste. Le résultat est une seule ligne de taux d'erreur par job. Les deux clauses à connaître :

- `by (labels)` — conserve ces labels, agrège le reste.
- `without (labels)` — agrège ces labels, conserve le reste.

Les autres agrégateurs suivent la même grammaire : `avg`, `max`, `min`, `count`, `topk`, `quantile`. Le modèle mental ne change jamais — *combiner de nombreuses séries en un plus petit nombre, groupées selon les labels que je nomme.*

## Tout assembler

La requête intimidante du début se décompose désormais proprement. Lisez-la de l'intérieur vers l'extérieur :

```promql
histogram_quantile(
  0.99,
  sum by (le, route) (
    rate(http_request_duration_seconds_bucket[5m])
  )
)
```

1. `http_request_duration_seconds_bucket[5m]` — les buckets de l'histogramme de latence, sur 5 minutes.
2. `rate(...)` — taux par seconde de chaque bucket, de sorte que les remises à zéro et la mise à l'échelle sont prises en charge.
3. `sum by (le, route) (...)` — additionne les taux à travers les instances, en conservant `le` (la borne du bucket, requise par l'étape suivante) et `route`.
4. `histogram_quantile(0.99, ...)` — estime la latence au 99e centile à partir de ces buckets, par route.

En clair : **la latence des requêtes au p99 par route sur les 5 dernières minutes.** Une couche à la fois, ce n'est pas dense du tout.

## Quelques pièges qu'il vaut la peine de connaître

- **Agréger avant d'appliquer rate.** `rate(sum(...))` est presque toujours un bug. Appliquez d'abord `rate`, puis `sum` — additionner des compteurs à travers des remises à zéro donne n'importe quoi. La forme correcte est `sum(rate(...))`.
- **Laisser tomber `le`.** `histogram_quantile` a besoin que le label `le` soit intact, votre clause `by (...)` doit donc l'inclure.
- **Les comparaisons filtrent, elles ne se contentent pas de colorer.** `rate(...)[5m]) > 0` ne renvoie pas de booléens — elle *écarte* chaque série où la condition est fausse. C'est ainsi que vous construisez les expressions d'alerte.
- **Confusion entre instantané et plage.** Passer un vecteur instantané là où une fonction attend un vecteur de plage (ou inversement) est l'erreur d'analyse la plus courante. Si une fonction se plaint, vérifiez vos crochets.

## Décodez n'importe quelle requête en quelques secondes

La méthode de l'intérieur vers l'extérieur fonctionne sur chaque expression PromQL que vous rencontrerez, mais démonter à la main une requête de production profondément imbriquée reste fastidieux — et il est facile de se tromper subtilement sous la pression. C'est précisément à cela que sert le **PromQL Explainer** : collez n'importe quelle requête Prometheus et obtenez une décomposition en clair, couche par couche, de ses sélecteurs, plages, fonctions, agrégations et comparaisons. Tout s'exécute côté client, vos requêtes ne quittent donc jamais le navigateur.

La prochaine fois qu'un panneau de tableau de bord ou une règle d'alerte vous fait plisser les yeux, ne devinez pas.

[Expliquer une requête PromQL →](/promql-explainer/)

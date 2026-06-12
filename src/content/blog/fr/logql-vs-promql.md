---
title: "LogQL vs PromQL : la même requête dans les deux langages"
description: "LogQL emprunte la forme de PromQL mais part de lignes de log, et non de métriques. Voici comment les deux langages de requête se correspondent, où ils se traduisent proprement, et où ils ne le font tout simplement pas."
pubDate: 2026-06-05
tags: ["logql", "promql", "observability"]
lang: fr
translationOf: "logql-vs-promql"
---

Si vous avez déjà écrit des requêtes Prometheus, le LogQL de Grafana Loki vous semblera rassurant de familiarité — `rate(...)`, `sum by (...)`, les vecteurs de plage `[5m]`, les mêmes opérateurs de comparaison. Cette familiarité est délibérée, et elle est réellement utile : une bonne part de la mémoire musculaire acquise avec PromQL se transfère directement. Mais les deux langages partent d'une matière première différente, et dès l'instant où vous l'oubliez, votre traduction se brise de manières difficiles à repérer. PromQL interroge une base de données de **métriques**. LogQL interroge des **lignes de log** et les transforme en métriques à la volée. Tout ce qui se correspond proprement, et tout ce qui ne se correspond pas, découle de cette unique différence.

## Les deux moitiés de LogQL

Chaque requête LogQL commence par un **sélecteur de log** et un **pipeline** optionnel — la partie qui n'a pas d'équivalent en PromQL parce que PromQL ne touche jamais aux logs bruts :

```logql
{app="api", env="prod"} |= "panic" | logfmt | level="error"
```

Cela sélectionne le flux `api`/`prod`, conserve les lignes contenant `panic`, les analyse comme du logfmt, puis filtre sur `level=error`. Le résultat reste un ensemble de lignes de log. Pour obtenir quelque chose que vous pouvez tracer ou sur lequel vous pouvez alerter — un nombre dans le temps — vous l'enveloppez dans une **requête métrique** :

```logql
sum by (app) (count_over_time({app="api", env="prod"} |= "panic" | logfmt | level="error" [5m]))
```

Seule la moitié externe de cette expression ressemble à PromQL. La partie interne `{...} |= ... | logfmt | ...` est du pur Loki, et c'est là que va l'essentiel de l'effort de traduction.

## Là où LogQL et PromQL se correspondent

La couche d'agrégation est l'endroit où les langages convergent, et les correspondances sont proches du un-pour-un.

Un taux de compteur PromQL :

```promql
sum by (status) (rate(http_requests_total{job="api"}[5m]))
```

La forme LogQL qui répond à la même question à partir des logs :

```logql
sum by (status) (rate({job="api"} | logfmt [5m]))
```

Les opérateurs d'agrégation (`sum`, `avg`, `min`, `max`, `count`, `topk`, `quantile`) et les clauses de regroupement `by` / `without` se comportent de façon identique. Les opérateurs de comparaison (`>`, `<`, `==`, `!=`) et l'arithmétique binaire fonctionnent de la même manière, ce qui explique pourquoi un seuil d'alerte se porte presque mot pour mot :

```promql
# PromQL: more than 10 errors/sec
sum(rate(http_requests_total{status=~"5.."}[5m])) > 10
```

```logql
# LogQL: more than 10 error lines/sec
sum(rate({job="api"} | logfmt | status=~"5.." [5m])) > 10
```

La famille `_over_time` de Loki reflète également les fonctions de plage de Prometheus là où le concept survit : `count_over_time`, `rate`, `bytes_rate`, `avg_over_time`, `max_over_time`, `quantile_over_time`. Si vous avez utilisé `avg_over_time(metric[5m])` en PromQL, la forme LogQL « déballée » se lit de la même façon une fois que vous avez extrait une valeur numérique sur laquelle opérer.

## Là où ils divergent — et pourquoi un portage littéral échoue

Les pièges se concentrent autour de la moitié de LogQL que PromQL ne possède pas.

**`rate` signifie deux choses différentes.** En PromQL, `rate(counter[5m])` tient compte des remises à zéro de compteur — c'est conçu pour des séries croissant de façon monotone. En LogQL, `rate({...}[5m])` est un **décompte de lignes** par seconde, sans aucune sémantique de remise à zéro, parce que les lignes de log ne se remettent pas à zéro. Le mot-clé correspond ; le sens, non. Si vous recourez à `increase()` en attendant le comportement de compteur de PromQL, il n'y a tout simplement rien à incrémenter.

**Vous devez extraire une valeur avant de pouvoir faire des calculs dessus.** Les échantillons PromQL sont déjà des nombres. Les lignes de Loki sont du texte, donc toute agrégation sur une *valeur* (latence, octets, un champ numérique) nécessite un parseur plus `unwrap` :

```logql
quantile_over_time(0.99, {job="api"} | logfmt | unwrap duration_seconds [5m]) by (route)
```

Il n'existe aucune contrepartie PromQL à `| logfmt`, `| json`, `| pattern` ou `| unwrap` — ils existent précisément parce que l'entrée est non structurée. Traduire *depuis* PromQL signifie inventer cette étape d'extraction ; traduire *vers* PromQL signifie la supprimer et supposer qu'une métrique existe déjà.

**La syntaxe des sélecteurs se recoupe mais n'est pas interchangeable.** Les deux utilisent `{label="value"}` avec `=`, `!=`, `=~`, `!~`. Mais un sélecteur PromQL nomme une métrique et fait correspondre des labels de série ; un sélecteur de flux Loki nomme des flux de log et *doit* correspondre à au moins un label de flux indexé. Un filtre de ligne comme `|= "text"` n'a aucun analogue en PromQL — au plus proche, PromQL peut faire correspondre une valeur de label, jamais du texte libre à l'intérieur d'un échantillon.

**Les champs à forte cardinalité se comportent différemment.** En PromQL, regrouper par un label à forte cardinalité est généralement le signe d'une mauvaise conception des métriques. En LogQL, les labels de pipeline extraits (depuis `logfmt`/`json`) sont calculés au moment de la requête et ne sont pas indexés, de sorte que `by (user_id)` est faisable d'une manière qui l'est rarement en Prometheus — au prix réel d'un débit de requête, mais sans l'explosion du stockage. Le modèle mental de ce qui est « coûteux » ne se transfère pas.

## Une liste de contrôle pratique pour la traduction

Lorsque vous déplacez une requête entre les deux langages, parcourez ces points dans l'ordre :

1. **Identifiez la couche métrique.** Réduisez la requête PromQL à son agrégation (`sum by (...) (rate(...))`) ; cette partie-là se porte presque telle quelle.
2. **Reconstruisez l'entrée.** En LogQL, remplacez le nom de la métrique par un sélecteur `{stream}` plus les filtres de ligne et le parseur (`| logfmt`, `| json`) nécessaires pour atteindre les mêmes données.
3. **Ajoutez `unwrap` pour les calculs sur valeurs.** Toute moyenne, tout quantile ou toute somme sur un nombre — et non sur un décompte de lignes — nécessite un champ extrait et déballé.
4. **Revérifiez la sémantique de `rate`.** Décidez si vous parlez d'un décompte de lignes par seconde (Loki) ou d'un taux de compteur (Prometheus). Ce ne sont pas le même nombre.
5. **Acceptez que certaines choses ne se correspondront pas.** `histogram_quantile` sur les histogrammes natifs de Prometheus, les `resets()` de compteur et les séries adossées à des règles d'enregistrement n'ont pas de forme LogQL propre — et les filtres de ligne en texte libre n'ont pas de forme PromQL.

## Traduisez-le sans deviner

Garder les deux dialectes en tête en même temps est exactement le genre de changement de contexte qui produit des bugs silencieux — un `rate` qui ne veut pas dire ce qu'il faut, un `unwrap` manquant, un sélecteur qui compile mais ne correspond à rien. Le **LogQL ↔ PromQL Helper** fait la partie mécanique à votre place : collez une requête dans l'un ou l'autre langage, obtenez l'équivalent le plus proche dans l'autre, ainsi que des notes explicites sur ce qui s'est traduit proprement et ce qui n'a pas pu l'être. Il s'exécute entièrement dans votre navigateur — vos requêtes ne quittent jamais l'appareil — afin que vous puissiez vérifier la cohérence d'une traduction avant qu'elle n'arrive dans un tableau de bord ou une règle d'alerte.

[Ouvrir le LogQL ↔ PromQL Helper →](/logql-promql-helper)

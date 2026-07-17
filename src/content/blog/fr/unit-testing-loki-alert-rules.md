---
title: "Tester unitairement les règles d'alerte Loki : la lacune que promtool laisse"
description: "Prometheus dispose de promtool test rules. Loki n'a aucun équivalent. Voici pourquoi tester les règles d'alerte LogQL est important, à quoi devrait ressembler un test unitaire de règle Loki, et comment combler cette lacune dès aujourd'hui."
pubDate: 2026-04-15
tags: ["loki", "observability", "testing"]
lang: fr
translationOf: "unit-testing-loki-alert-rules"
---

![Tester unitairement les règles d'alerte Loki : une boucle de test de style promtool pour les règles d'alerte LogQL](/blog/unit-testing-loki-alert-rules-hero.svg)

Si vous utilisez Prometheus, vous disposez déjà d'un filet de sécurité pour votre logique d'alerte : `promtool test rules`. Vous lui fournissez une série d'échantillons synthétiques, vous déclarez ce qui doit se déclencher et quand, et la CI vous prévient dès qu'un remaniement casse une alerte. C'est la différence entre détecter une règle de page défectueuse lors de la revue de code et la découvrir pendant un incident.

Grafana Loki n'a pas d'équivalent. Vous pouvez écrire des règles d'alerte et d'enregistrement LogQL qui ressemblent presque à l'identique à leurs cousines Prometheus, les charger dans le ruler et les expédier — mais il n'existe aucun moyen de premier ordre d'affirmer qu'un flux de logs donné produit l'alerte attendue. La lacune est réelle, elle perdure depuis longtemps, et c'est exactement le genre de chose qui vous mord à 3&nbsp;h du matin.

## Pourquoi promtool ne couvre pas Loki

Le réflexe instinctif est de se tourner vers `promtool` et de le pointer vers vos règles Loki. Cela ne fonctionne pas, et la raison est fondamentale plutôt que cosmétique.

`promtool test rules` évalue PromQL sur une base de données de **séries temporelles** synthétiques. Vous décrivez des métriques avec la syntaxe `series`/`values` et l'outil les rejoue dans le moteur de règles. Mais une règle d'alerte Loki ne part pas de métriques — elle part de **lignes de logs**. Une règle comme `count_over_time({app="api"} |= "panic" [5m]) > 0` doit exécuter un pipeline LogQL (sélecteur de flux, filtre de ligne, extraction de labels, puis une agrégation de métrique) sur des entrées de logs brutes avant qu'il n'y ait la moindre série à évaluer. promtool n'a aucune notion de flux de logs, aucun parseur LogQL, et aucun moyen de matérialiser les métriques intermédiaires comme le fait le moteur de requête de Loki. Lui fournir des règles Loki produit soit une erreur, soit teste silencieusement la mauvaise chose.

Ainsi, la surface de test qui compte pour Loki — « étant donné ces lignes de logs, cette règle LogQL se déclenche-t-elle ? » — est précisément la surface que promtool ne peut pas atteindre.

![Une boucle de test unitaire de règle d'alerte Loki : des flux de logs synthétiques évalués à un instant choisi et confrontés aux alertes attendues](/blog/unit-testing-loki-alert-rules-diagram.svg)

## Pourquoi c'est important

Les règles d'alerte LogQL sont trompeusement faciles à se tromper de manière subtile :

- Un filtre de ligne qui correspond à plus (ou moins) que ce que vous pensez à cause d'une regex non échappée ou d'une limite de mot manquante.
- Un label que vous traitez incorrectement avec `unwrap` ou `label_format`, de sorte que l'agrégation regroupe de la mauvaise manière.
- Une plage `[5m]` et une clause `for: 10m` qui interagissent de telle sorte que l'alerte n'a jamais assez de données pour se déclencher, ou se déclenche bien plus tard que prévu.
- Une règle d'enregistrement dont la série en sortie change silencieusement de labels après une modification du pipeline, cassant chaque alerte en aval qui s'appuie dessus.

Aucun de ces problèmes n'est détecté par le linting YAML ou une vérification de schéma. Ce sont des bugs **comportementaux**, et la seule façon honnête de les détecter est d'exécuter la règle sur des données d'entrée représentatives et d'affirmer un résultat sur la sortie. Sans harnais de test, cette vérification se fait manuellement, rarement, et généralement après que quelque chose a déjà alerté la mauvaise équipe — ou n'a pas réussi à alerter la bonne.

## À quoi devrait ressembler un test unitaire de règle Loki

Le modèle établi par promtool est le bon ; il lui faut simplement une entrée de forme « logs ». Au lieu de séries synthétiques, un test de règle Loki devrait accepter des **flux** synthétiques (un ensemble de labels plus des lignes de logs horodatées), évaluer la règle à un instant choisi, et affirmer un résultat sur les alertes produites — quelque chose comme ceci :

```yaml
# loki-rule-tests.yaml
tests:
  - name: panic in api logs fires PanicDetected
    # Synthetic log streams replayed through the LogQL engine.
    input_streams:
      - labels: '{app="api", env="prod"}'
        entries:
          - { ts: "2026-06-08T10:00:30Z", line: "level=info msg=ok" }
          - { ts: "2026-06-08T10:01:10Z", line: "level=error msg=panic: nil map" }
          - { ts: "2026-06-08T10:02:40Z", line: "level=error msg=panic: nil map" }

    # Evaluate the rule group at this instant.
    eval_time: 2026-06-08T10:05:00Z

    alert_rule_test:
      - alertname: PanicDetected
        # What we expect the ruler to emit at eval_time.
        exp_alerts:
          - exp_labels:
              app: api
              env: prod
              severity: critical
            exp_annotations:
              summary: "Panic detected in api"
```

La règle testée est la même règle que celle que vous expédiez au ruler :

```yaml
groups:
  - name: api-alerts
    rules:
      - alert: PanicDetected
        expr: |
          count_over_time({app="api", env="prod"} |= "panic" [5m]) > 1
        for: 0m
        labels:
          severity: critical
        annotations:
          summary: "Panic detected in {{ $labels.app }}"
```

Lus ensemble, ces éléments disent : étant donné deux lignes de panic dans la fenêtre de cinq minutes précédant `10:05`, l'expression `count_over_time(...) > 1` devrait être vraie, et le ruler devrait émettre une alerte `PanicDetected` portant `severity=critical` ainsi que les labels `app`/`env` issus du flux. Remplacez l'entrée par une seule ligne de panic, ou déplacez une entrée hors de la fenêtre `[5m]`, et `exp_alerts` devient vide — le test protège désormais à la fois le cas de déclenchement et le cas de non-déclenchement.

C'est la forme que ne cesse de décrire chaque équipe qui l'a demandée sur le tracker Loki — voyez les demandes de longue date dans les issues Loki [#7655](https://github.com/grafana/loki/issues/7655) et [#16659](https://github.com/grafana/loki/issues/16659), où la communauté a maintes fois souligné qu'un test unitaire de style promtool pour les règles LogQL n'existe tout simplement pas encore.

## Combler la lacune dès aujourd'hui

Vous n'avez pas à attendre que le projet amont livre cette fonctionnalité. **AlertLint** exécute exactement cette boucle de test dans votre navigateur : collez vos règles d'alerte et d'enregistrement Loki, définissez les `input_streams`, déclarez vos `exp_alerts`, et affirmez la réussite ou l'échec avant même que la règle n'atteigne le ruler. Tout est évalué côté client — vos règles et vos logs ne quittent jamais l'appareil — vous pouvez donc l'intégrer à votre revue sans toucher à l'infrastructure ni envoyer de données où que ce soit.

Si vous avez déjà expédié une alerte Loki en espérant qu'elle fonctionne, voici l'étape qui manquait.

[Essayez AlertLint — le testeur de règles d'alerte Loki →](/loki-alert-rule-tester/)

---
title: "Pourquoi votre condition « if » GitHub Actions s'exécute toujours (et comment y remédier)"
description: "Votre condition if GitHub Actions est toujours vraie ? C'est le piège du texte littéral : tout texte en dehors de ${{ }} est converti en chaîne truthy. Voici la cause et le correctif."
pubDate: 2026-06-14
tags: ["github-actions", "ci-cd"]
relatedTool:
  name: "Testeur d'expressions et de déclencheurs GitHub Actions"
  href: "/github-actions-expression-tester"
lang: fr
translationOf: "github-actions-if-condition-always-true"
---
![Condition if GitHub Actions qui s'exécute toujours parce que le texte littéral en dehors des accolades de l'expression est converti en chaîne truthy](/blog/github-actions-if-condition-always-true-hero.svg)

Vous avez ajouté un `if:` à une étape pour qu'elle ne s'exécute que sur `main`, ou uniquement sur un tag, ou seulement lorsqu'une étape précédente a défini une sortie. Puis vous avez poussé — et l'étape s'est exécutée quand même. À chaque fois. Sur chaque branche. La condition n'est que décorative.

Si votre condition `if` GitHub Actions ne fonctionne pas — plus précisément, si elle s'évalue *toujours* à vrai —, vous avez presque certainement rencontré le piège le plus courant de tout le produit : **placer du texte littéral là où GitHub attend une expression.** Le runner ne génère aucune erreur. Il convertit discrètement votre texte en une chaîne non vide, décide qu'une chaîne non vide est truthy, et exécute l'étape. Cet article montre les mauvais schémas exacts, les correctifs et les règles de conversion sous-jacentes, pour que vous arrêtiez de deviner.

## Le piège : le texte littéral en dehors de `${{ }}` est toujours truthy

Dans un `if:`, GitHub évalue déjà la valeur comme une expression — vous ne devez **pas** envelopper l'ensemble dans `${{ }}`. Mais dès que du texte littéral déborde en dehors des accolades de l'expression, le runner cesse de traiter la ligne comme une condition et commence à la traiter comme une chaîne. Une chaîne non vide est truthy. Votre étape s'exécute toujours.

```yaml
# BAD — the ${{ }} is embedded in a larger string, so the whole if: is a string
- name: Deploy
  if: ${{ github.ref == 'refs/heads/main' }} && success()
  run: ./deploy.sh
```

Cela paraît raisonnable, mais le runner voit ceci : évaluer `${{ ... }}` à `true`, puis concaténer ` && success()` comme **texte littéral**. La valeur finale est la chaîne `"true && success()"` — non vide, donc truthy. L'étape s'exécute sur chaque branche.

Le correctif consiste à écrire **une seule** expression, sans accolades et sans texte parasite :

```yaml
# FIXED — a single bare expression, no ${{ }}, no trailing literal
- name: Deploy
  if: github.ref == 'refs/heads/main' && success()
  run: ./deploy.sh
```

Le même piège vous attrape lorsque vous mettez la condition *entière* entre guillemets :

```yaml
# BAD — the entire condition is a quoted string literal, always truthy
- if: "${{ steps.check.outputs.changed == 'true' }}"
  run: ./build.sh
```

Envelopper l'expression entre guillemets transforme la valeur YAML en une simple chaîne. GitHub y trouve un `${{ }}`, substitue le résultat, et vous voilà de nouveau avec une chaîne non vide. Supprimez les guillemets et les accolades :

```yaml
# FIXED
- if: steps.check.outputs.changed == 'true'
  run: ./build.sh
```

Règle empirique : **dans un `if:`, il n'y a ni `${{ }}` ni guillemets autour.** Juste l'expression. Les accolades servent à interpoler des valeurs dans `run:`, `name:` et `with:` — pas dans les conditions.

Vous pouvez coller n'importe lequel de ces exemples dans le [Testeur d'expressions et de déclencheurs GitHub Actions](/github-actions-expression-tester/) et le voir signaler la fuite de texte littéral avant que vous ne poussiez — il avertit précisément sur ce schéma (il est répertorié sous [actions/runner#1173](https://github.com/actions/runner/issues/1173), le bug le plus réagi du dépôt du runner).

![Une condition if GitHub Actions qui est toujours vraie parce qu'elle renvoie une chaîne truthy, à côté de l'expression booléenne corrigée](/blog/github-actions-if-condition-always-true-diagram.svg)

## Le `success()` implicite qui disparaît quand vous ajoutez un `if:`

Voici la deuxième surprise, et c'est la raison du fameux « mon étape conditionnelle s'exécute même si l'étape précédente a échoué ».

Chaque étape et chaque job possède une **condition `success()` implicite**. Sans aucun `if:`, une étape ne s'exécute que si tout ce qui la précède a réussi. C'est pourquoi les pipelines s'arrêtent au premier échec sans que vous n'écriviez quoi que ce soit.

Dès l'instant où vous ajoutez un `if:` *personnalisé*, ce `success()` implicite **disparaît**. Votre condition devient désormais la *seule* vérité.

```yaml
# BAD — you wanted "on main", but you deleted the implicit success() guard
- name: Notify on main
  if: github.ref == 'refs/heads/main'
  run: ./notify.sh   # now runs on main EVEN IF the build above failed
```

Si vous voulez tout de même que l'étape exige une réussite, dites-le explicitement :

```yaml
# FIXED — re-add the success() guard you lost
- name: Notify on main
  if: success() && github.ref == 'refs/heads/main'
  run: ./notify.sh
```

C'est aussi pourquoi certains s'étonnent qu'une étape de « nettoyage » ne s'exécute qu'en cas de réussite alors qu'ils voulaient qu'elle s'exécute quoi qu'il arrive — la garde implicite est toujours là tant qu'ils n'ont pas ajouté `always()`.

![Illustration synthwave : un terminal CRT rétro dont la condition if est convertie en chaîne truthy, de sorte que chaque exécution franchit la porte tout droit vers TRUE](/blog/in-content/github-actions-if-condition-always-true.webp)

## `success()` vs `always()` vs `failure()` vs `cancelled()`

Ces quatre fonctions de statut décident *si l'étape tient compte des résultats précédents tout court*. Les confondre constitue l'autre moitié du « mon `if` ne se comporte pas comme prévu ».

- **`success()`** — vrai uniquement si toutes les étapes/jobs précédents ont réussi. (C'est la valeur par défaut implicite.)
- **`failure()`** — vrai si une étape précédente a échoué. À utiliser pour les notifications d'échec.
- **`always()`** — vrai sans condition ; l'étape s'exécute même si une étape précédente a échoué *ou si le workflow a été annulé*. À utiliser pour un nettoyage qui doit toujours avoir lieu.
- **`cancelled()`** — vrai uniquement lorsque le workflow a été annulé.

L'erreur classique consiste à combiner `always()` avec une autre condition à l'aide de `&&` en s'attendant à ce qu'elle s'exécute toujours en cas d'annulation — c'est le cas, mais les gens veulent souvent l'inverse :

```yaml
# BAD — "always upload logs, but only on main" — this does NOT short-circuit on failure
- name: Upload logs
  if: github.ref == 'refs/heads/main'
  run: ./upload-logs.sh   # skipped when the build fails, because implicit success() is gone... wait, no — it's gone, so it runs? See below.
```

Pour être précis sur ce dernier point : parce que vous avez fourni un `if:` personnalisé, le `success()` implicite est supprimé, de sorte que l'étape s'exécute sur `main` *quel que soit* le succès ou l'échec de la compilation. Si vous voulez réellement « téléverser les logs sur main, que ce soit en cas de succès ou d'échec », c'est bien ce que vous obtenez — mais rendez l'intention explicite pour que le prochain lecteur n'ait pas à deviner :

```yaml
# FIXED — explicit: run on main whether the build passed or failed
- name: Upload logs
  if: always() && github.ref == 'refs/heads/main'
  run: ./upload-logs.sh
```

Et pour une alerte uniquement en cas d'échec :

```yaml
# FIXED — only when something upstream broke
- name: Alert
  if: failure()
  run: ./page-oncall.sh
```

## Surprises de conversion : `==`, chaînes et insensibilité à la casse

Même avec des expressions correctement formées, les règles de comparaison de GitHub déstabilisent les utilisateurs, car elles sont *proches* de JavaScript sans pour autant être JavaScript.

**Le `==` sur les chaînes est insensible à la casse.** Cela piège ceux qui comparent des refs de branche ou des valeurs d'entrée :

```yaml
# Surprise: both of these are TRUE
${{ 'MAIN' == 'main' }}          # true — case-insensitive
${{ 'Refs/Heads/Main' == github.ref }}  # may be true unexpectedly
```

**Conversion souple entre types.** Lorsque les deux côtés diffèrent en type, GitHub convertit vers un nombre : les booléens deviennent `1`/`0`, et les chaînes sont analysées comme des nombres (une chaîne vide et `'0'` valent `0` ; les chaînes non numériques deviennent `NaN`, et toute comparaison avec `NaN` est fausse). Ainsi :

```yaml
${{ true == 1 }}        # true
${{ '' == 0 }}          # true  — empty string coerces to 0
${{ '3.0' == 3 }}       # true
${{ 'abc' == 0 }}       # false — 'abc' is NaN, NaN != anything
```

**`&&` et `||` renvoient des opérandes, pas des booléens.** Tout comme en JavaScript, `a && b` renvoie `b` si `a` est truthy, sinon `a`. C'est parfait pour les valeurs par défaut (`inputs.name || 'default'`), mais cela signifie que `if: inputs.flag && 'yes'` s'évalue à la chaîne `'yes'` — truthy — et non à un booléen propre.

Les valeurs falsy sont exactement : `false`, `0`, `''` (chaîne vide) et `null`. Tout le reste — y compris les chaînes `'false'` et `'0'`... attendez : `'0'` est falsy parce qu'elle se convertit en nombre `0`, mais `'false'` est une **chaîne non vide qui ne se convertit pas en nombre**, donc `${{ 'false' }}` est **truthy**. Ce seul fait est à l'origine de plus de bugs « mon entrée booléenne est toujours vraie » que tout autre :

```yaml
# BAD — workflow_dispatch inputs are STRINGS; 'false' is truthy
on:
  workflow_dispatch:
    inputs:
      deploy: { type: boolean }
jobs:
  go:
    if: inputs.deploy   # with type: boolean this is fine...
```

```yaml
# BAD — but if the value arrives as a string 'false', this always runs
- if: github.event.inputs.deploy   # string 'false' is truthy!
  run: ./deploy.sh
```

```yaml
# FIXED — compare explicitly so the string is interpreted as data
- if: github.event.inputs.deploy == 'true'
  run: ./deploy.sh
```

## `contains` et `startsWith` ne sont pas équivalents à `==`

Le filtrage par préfixe de ref est un autre endroit où la mauvaise fonction sur-correspond silencieusement :

```yaml
# BAD — contains matches ANYWHERE, so 'feature/main-fix' passes too
- if: contains(github.ref, 'main')
  run: ./deploy.sh
```

```yaml
# FIXED — anchor to the start, or compare the full ref
- if: startsWith(github.ref, 'refs/heads/release/')
  run: ./deploy.sh
# or, for an exact branch:
- if: github.ref == 'refs/heads/main'
  run: ./deploy.sh
```

Souvenez-vous que `contains` comme `startsWith` effectuent une comparaison de chaînes insensible à la casse, tout comme `==`.

## Testez votre `if:` avant de pousser

La raison pour laquelle ces bugs sont si tenaces, c'est la boucle de rétroaction : la seule façon de « tester » une condition a traditionnellement consisté à commiter, pousser et lire les logs — puis à deviner, modifier et pousser de nouveau. Chaque mauvaise supposition est un aller-retour.

Le [Testeur d'expressions et de déclencheurs GitHub Actions](/github-actions-expression-tester/) referme cette boucle. Collez votre expression `if:`, définissez un contexte fictif `github` / `env` / `steps` / `needs`, et observez le résultat évalué avec les règles exactes de GitHub en matière d'opérateurs, de conversion et d'insensibilité à la casse — ainsi qu'un avertissement explicite lorsque vous avez laissé du texte littéral en dehors de `${{ }}` et accidentellement construit une condition toujours truthy. Tout s'exécute entièrement dans votre navigateur ; rien de votre workflow n'est téléversé.

Si vous avez déjà livré un `if:` en espérant qu'il sauterait l'étape, voici la vérification qui vous le dit avant que le runner ne le fasse.

[Essayez le Testeur d'expressions et de déclencheurs GitHub Actions →](/github-actions-expression-tester/)

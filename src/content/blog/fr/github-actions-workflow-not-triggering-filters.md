---
title: "Pourquoi votre workflow GitHub Actions ne s'est pas déclenché : les filtres branches, tags et paths expliqués"
description: "Pourquoi votre workflow GitHub Actions ne s'est pas déclenché : un nom de branche qui ne correspond pas, la sémantique ET des filtres branches + paths, l'exigence du glob **, paths-ignore sur pull_request, et les correctifs."
pubDate: 2026-06-14
tags: ["github-actions", "ci-cd", "debugging"]
relatedTool:
  name: "Testeur d'expressions et de déclencheurs GitHub Actions"
  href: "/github-actions-expression-tester"
lang: fr
translationOf: "github-actions-workflow-not-triggering-filters"
---

![Workflow GitHub Actions qui ne s'est pas déclenché : les règles des filtres branches, tags et paths expliquées](/blog/github-actions-workflow-not-triggering-filters-hero.svg)

Vous avez poussé un commit, ouvert l'onglet Actions, et il n'y a rien. Pas de croix rouge, pas de point jaune — le workflow ne s'est tout simplement pas exécuté. Il n'y a aucune erreur à lire, aucun log à parcourir, parce qu'un workflow qui ne se déclenche pas ne produit aucune exécution. La décision a été prise avant qu'un runner ne soit assigné, à l'intérieur de la logique de filtrage d'événements de GitHub, et cette logique est plus surprenante que ce que la documentation laisse paraître.

Presque chaque rapport du type « pourquoi mon workflow GitHub Actions ne s'est-il pas déclenché » se résume à l'une d'une poignée de causes : le fichier de workflow n'est pas sur la branche vers laquelle vous avez poussé, votre filtre `branches` ne correspond pas à la ref, ou — la grosse — vous avez combiné `branches` et `paths` sans réaliser qu'ils sont reliés par un ET. Voici chaque cause avec la règle déterminante et le correctif.

## 1. Le fichier de workflow n'est pas sur la branche cible

GitHub lit les déclencheurs `on:` depuis la version du fichier de workflow **qui existe sur la branche recevant l'événement** — et non depuis votre branche par défaut. Si vous avez ajouté `.github/workflows/ci.yml` sur `main` mais poussez vers une branche `feature/x` qui a divergé *avant* l'existence de ce fichier, il n'y a aucun workflow à déclencher là.

```yaml
# on main, but feature/x branched before this file existed
on:
  push:
    branches: ['**']
```

C'est la fausse alerte la plus courante. Le correctif est mécanique : fusionnez ou rebasez `main` dans la branche pour que le fichier de workflow soit présent, puis poussez de nouveau. La même règle explique pourquoi les modifications des déclencheurs `on:` ne « prennent effet » qu'une fois le changement parvenu sur la branche sur laquelle vous testez.

Pourquoi c'est important : il n'y a aucun message d'erreur pour « aucun fichier de workflow ici ». C'est la première chose à écarter avant de suspecter vos filtres.

![Un schéma de décision montrant comment les filtres branches, tags et paths déterminent si un workflow GitHub Actions se déclenche lors d'un push](/blog/github-actions-workflow-not-triggering-filters-diagram.svg)

## 2. Le filtre de branche ne correspond pas à la ref

`branches` et `tags` sont des motifs glob, et les règles de glob sont plus strictes que les globs du shell. Un `*` simple correspond à **un seul segment de chemin** — il s'arrête à `/`. Pour traverser les barres obliques, il vous faut `**`.

```yaml
# BAD — '*' does not cross '/', so 'release/1.2' never matches
on:
  push:
    branches:
      - 'release/*'   # matches release/1.2 ... actually this IS fine
      - 'feature*'    # matches 'feature' and 'featureX' but NOT 'feature/login'
```

Le piège, c'est `feature*` contre `feature/**`. `feature*` correspond au segment littéral `featureX`, mais une branche nommée `feature/login` contient une barre oblique, et `*` ne la traversera pas. Vous voulez `feature/**`.

```yaml
# FIXED — ** crosses slashes
on:
  push:
    branches:
      - 'release/**'
      - 'feature/**'
      - main
```

Les caractères glob que GitHub respecte : `*` (n'importe quels caractères sauf `/`), `**` (n'importe quels caractères y compris `/`), `?` (un caractère), `+` (un ou plusieurs du précédent), les plages de caractères `[]`, `!` en début de motif pour nier, et `\` pour échapper un caractère spécial (ainsi `\*` correspond à un astérisque littéral). L'ordre importe pour la négation — un `!pattern` ultérieur exclut des refs qu'un motif antérieur avait incluses.

Pourquoi c'est important : le fait que `*` ne traverse pas `/` est responsable d'une part énorme des rapports « le filtre branches de github actions ne fonctionne pas ». Dans le doute, optez pour `**`.

## 3. La sémantique ET de `branches` + `paths`

C'est celle qui piège les ingénieurs expérimentés. Lorsqu'un événement `push` ou `pull_request` possède **à la fois** un filtre de branche et un filtre de chemin, l'événement doit satisfaire **les deux** pour se déclencher. Ils sont reliés par un ET, pas par un OU.

```yaml
# BAD — intent: "run on a push to main, OR when src changes"
# reality: "run only on a push to main AND when src/** changed"
on:
  push:
    branches: [main]
    paths: ['src/**']
```

Un push vers `main` qui ne touche que `README.md` **n'exécutera pas** ce workflow — la branche correspondait, mais aucun chemin ne correspondait, et les deux doivent être vrais. Les gens lisent ce bloc comme un OU et sont déconcertés quand des commits ne touchant que la documentation contournent la CI.

Si vous voulez réellement « toujours sur les pushes vers main, plus n'importe quelle branche quand `src` change », ce sont deux ensembles de filtres distincts, que `on:` ne peut pas exprimer dans un seul bloc `push` — vous les répartissez sur plusieurs déclencheurs ou utilisez plutôt des conditions `if:` au niveau du job sur `github.ref`.

```yaml
# FIXED — be explicit that you want both conditions, or drop one
on:
  push:
    branches: [main]
    paths:
      - 'src/**'
      - '.github/workflows/**'   # so CI changes still trigger
```

Pourquoi c'est important : la sémantique ET est documentée en une seule phrase et contredit l'intuition de la plupart des gens. Si votre workflow saute « aléatoirement » certains pushes vers la bonne branche, un filtre de chemin en est presque toujours la cause.

## 4. `paths` sans `branches` associé nécessite tout de même une vraie ref

Un corollaire subtil : quand vous filtrez `on.push.paths` et voulez qu'il s'applique à toutes les branches, vous n'avez pas besoin de bloc `branches` du tout — l'omettre signifie « toutes les branches ». Mais dès l'instant où vous ajoutez `branches`, la règle nº 3 entre en jeu. Les gens ajoutent parfois `branches: ['**']` en pensant que c'est nécessaire pour que `paths` fonctionne ; ce n'est pas le cas, et l'ajouter ne change rien puisque `**` correspond de toute façon à chaque branche. Ce qu'il faut intégrer, c'est qu'un filtre absent signifie « tout correspond », et un filtre présent restreint.

```yaml
# These behave identically: paths applies to every branch
on:
  push:
    paths: ['src/**']
# vs
on:
  push:
    branches: ['**']
    paths: ['src/**']
```

## 5. `paths-ignore` et le diff trop volumineux

`paths-ignore` saute l'exécution **uniquement si chaque fichier modifié correspond à un motif d'ignorance**. Si un seul fichier sort de la liste d'ignorance, le workflow s'exécute. Ainsi, un seul changement égaré met en échec tout le filtre — ce qui est généralement ce que vous voulez, mais surprend les gens qui s'attendent à ce que « ignorer ces fichiers » signifie « ignorer les commits qui touchent ces fichiers ».

```yaml
# Skips ONLY when every changed file is docs; one code file => runs
on:
  push:
    paths-ignore:
      - 'docs/**'
      - '**.md'
```

Deux autres pièges se cachent ici. Premièrement, les filtres de chemin sont évalués par rapport au **diff**, et GitHub n'inspecte que jusqu'à 300 fichiers modifiés (1 000 commits) — au-delà de cette limite, le filtrage de chemin abandonne et le workflow s'exécute (ou est évalué comme si le filtre était passé). Un force-push géant ou une fusion énorme peut déclencher un workflow que votre `paths-ignore` « aurait dû » sauter. Deuxièmement, vous ne pouvez pas mélanger `paths` et `paths-ignore` dans le même déclencheur ; choisissez-en un.

Pourquoi c'est important : `paths-ignore` est une barrière tout-ou-rien sur le diff, et le plafond de 300 fichiers signifie que ce n'est pas une garantie absolue sur les grands changements.

## 6. `pull_request`, les forks et `pull_request_target`

Les filtres de branche sur `pull_request` correspondent à la branche de **base** (où la PR sera fusionnée), et non à la branche de tête sur laquelle travaille le contributeur. Si vous écrivez `branches: [main]` en vous attendant à ce que cela corresponde à la `feature/x` du contributeur, ce ne sera pas le cas — cela correspond aux PR *ciblant* `main`.

```yaml
# Runs on PRs whose BASE (merge target) is main or a release branch
on:
  pull_request:
    branches:
      - main
      - 'release/**'
```

Et `pull_request` provenant d'un fork est restreint : la PR d'un contributeur pour la première fois peut nécessiter une approbation manuelle avant qu'un quelconque workflow ne s'exécute, ce qui ressemble exactement à « ne s'est pas déclenché ». Si vous êtes passé à `pull_request_target` pour contourner les restrictions des forks, notez qu'il lit le workflow et les déclencheurs depuis la version du fichier de la branche de **base** — et qu'il comporte un véritable risque de sécurité, traité dans notre article [Les erreurs de sécurité GitHub Actions](/blog/github-actions-security-misconfigurations).

## Un aide-mémoire de filtres à copier-coller

```yaml
on:
  push:
    branches:                 # ref globs; missing = all branches
      - main
      - 'release/**'          # ** crosses '/'; '*' does not
      - 'feature/**'
    tags:
      - 'v[0-9]+.[0-9]+.[0-9]+'   # numeric semver tags only
    paths:                    # ANDed with branches — BOTH must match
      - 'src/**'
      - '.github/workflows/**'
  pull_request:
    branches: [main]          # matches the PR's BASE branch
    paths-ignore:             # skip only if EVERY changed file matches
      - '**.md'
```

Référence rapide pour les caractères glob : `*` = n'importe quels caractères sauf `/`, `**` = n'importe quels caractères y compris `/`, `?` = un caractère, `+` = un ou plusieurs du précédent, `[a-z]` = plage, `!` en tête = négation, `\` = échappement.

## Arrêtez de deviner — rejouez votre événement

Ce qui rend ces bugs exaspérants, c'est que la boucle de rétroaction est « pousse et prie ». Pas de dry-run, pas de `--explain`, juste un onglet Actions vide. Alors vous committez un changement d'une ligne, poussez, rafraîchissez, attendez, et recommencez — brûlant des minutes par tentative face à une sémantique dont vous n'êtes pas sûr.

Le **Testeur d'expressions et de déclencheurs GitHub Actions** referme cette boucle. Collez votre bloc `on:`, décrivez l'événement — un `push` vers `feature/login`, un tag `v2.1.0`, ou une `pull_request` ciblant `main` avec une liste de fichiers modifiés — et il évalue chaque filtre `branches`, `tags`, `paths` et `paths-ignore` avec le même moteur de glob et la même sémantique ET que GitHub utilise. Vous obtenez un tableau **RUNS / SKIPPED** par job avec la raison déterminante exacte : « la branche correspondait, mais aucun filtre de chemin ne correspondait », ou « `*` ne traverse pas `/` ». C'est 100 % dans votre navigateur — votre YAML de workflow ne quitte jamais la page.

Voyez exactement quels jobs s'exécutent avant de pousser, et non après.

[Ouvrir le Testeur d'expressions et de déclencheurs GitHub Actions →](/github-actions-expression-tester)

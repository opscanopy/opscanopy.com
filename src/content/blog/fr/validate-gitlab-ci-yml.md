---
title: "Comment valider votre .gitlab-ci.yml avant de pousser"
description: "Arrêtez de pousser des pipelines cassés. Validez votre .gitlab-ci.yml pour les erreurs YAML et structurelles directement dans votre navigateur — avant le commit, pas après le pipeline en rouge."
pubDate: 2026-06-11
tags: ["gitlab-ci","ci-cd","yaml"]
lang: fr
translationOf: "validate-gitlab-ci-yml"
relatedTool:
  name: "GitLab CI Validator"
  href: "/gitlab-ci-validator"
---

![Validateur GitLab CI vérifiant un .gitlab-ci.yml pour les erreurs YAML et de pipeline avant le push](/blog/validate-gitlab-ci-yml-hero.svg)

Vous modifiez une seule ligne dans `.gitlab-ci.yml`, vous poussez, puis vous passez à autre chose. Deux minutes plus tard, le pipeline passe au rouge — non pas parce que le build a planté, mais parce qu'un job pointe vers un `stage` que vous avez renommé la semaine dernière. Vous corrigez la coquille, vous poussez à nouveau, vous attendez encore. C'est la boucle infernale, et la seule façon d'en sortir est de valider `.gitlab-ci.yml` *avant* que le commit ne soit enregistré, pas après que le runner vous l'ait signalé.

Le plus frustrant, c'est que GitLab sait déjà que votre configuration est cassée à l'instant même où il l'analyse. Il ne vous le dit simplement qu'une fois que vous avez poussé et brûlé une minute de CI. La solution consiste à exécuter cette même vérification localement, dans le navigateur, avant même de faire `git push`.

## La boucle « pousser et prier »

Voici la forme du problème. Vous modifiez un job, vous poussez et vous laissez GitLab faire office de linter :

```bash
git add .gitlab-ci.yml
git commit -m "split deploy into staging + prod"
git push
# wait for the runner to pick up the pipeline...
# pipeline failed: "chosen stage prod does not exist"
git commit -am "fix: declare prod stage"
git push
# wait again...
```

Chaque aller-retour, c'est un commit dont vous ne vouliez pas, un créneau de runner dont vous n'aviez pas besoin et un changement de contexte qui coûte plus cher que la coquille elle-même. Les erreurs qui en sont la cause n'ont presque jamais besoin d'un runner pour être détectées. Elles sont visibles dès l'instant où le YAML est analysé et où le graphe des jobs est résolu — c'est précisément ce que fait un validateur en local.

## Deux types d'erreurs : syntaxe YAML et erreurs structurelles

Quand GitLab rejette un pipeline, l'échec appartient à l'une de deux catégories, et elles se corrigent de manière totalement différente.

La première est une **erreur de syntaxe YAML** : le fichier n'est tout simplement pas du YAML valide, donc rien en aval ne peut le lire. La seconde est une **erreur structurelle** : le YAML s'analyse correctement, mais le *pipeline* qu'il décrit est invalide — un job sans script, un stage qui n'a jamais été déclaré, un `needs` qui pointe vers un job inexistant.

```yaml
# YAML error — the parser can't even build a document
build:
  script:
    - make
   - make test      # inconsistent indentation: parser bails here

# Structural error — valid YAML, invalid pipeline
deploy:
  stage: prod        # "prod" is not in stages: → GitLab refuses to run it
  script: ./deploy.sh
```

Un YAML valide ne représente que la moitié du travail. Le [GitLab CI Validator](/gitlab-ci-validator) vérifie les deux en une seule passe : il analyse d'abord le YAML, et ce n'est que si cette étape réussit qu'il exécute les contrôles structurels sur vos jobs. Si l'analyse échoue, vous obtenez une unique erreur avec un numéro de ligne, et rien d'autre — inutile de signaler un « stage non défini » sur un document qui ne s'est même pas analysé.

## Les erreurs YAML qui piquent : indentation, tabulations, clés en double

Le YAML est sensible aux espaces, et une configuration CI est exactement le genre de structure imbriquée où cela pose problème. Le message d'erreur GitLab classique — `did not find expected key` — correspond presque toujours à l'une de ces situations.

```yaml
test:
  stage: test
	script:              # a literal TAB instead of spaces → parse error
    - npm test

variables:
  DEPLOY_ENV: staging
  DEPLOY_ENV: prod       # duplicate key — the first value is silently lost

deploy:
  script: &deploy_steps  # anchor defined...
    - ./deploy.sh
rollback:
  script: *deploy_step   # ...but referenced with a typo → "unknown alias"
```

Un validateur dans le navigateur analyse le fichier avec un véritable lecteur YAML, il signale donc la ligne exacte où la structure s'est rompue. Quand vous collez votre configuration et que le résultat est `Could not parse YAML: ... (line 4, column 2)`, c'est le parseur qui vous indique précisément où chercher — réindentez, remplacez la tabulation par des espaces ou corrigez le nom de l'ancre, puis revalidez.

## Les erreurs structurelles que GitLab détecte trop tard : stages non définis, jobs sans script, needs/extends erronés

Ce sont celles qui vous font attendre un runner pour finalement vous annoncer que le pipeline n'a jamais démarré. Ce sont la vraie raison de valider la CI GitLab avant de pousser. Le validateur modélise les règles de la [référence des mots-clés `.gitlab-ci.yml`](/gitlab-ci-validator) de GitLab et signale chacune d'elles avec le job fautif, la ligne et la correction.

![Le déroulé d'un pipeline de validation : coller le .gitlab-ci.yml, analyser le YAML, exécuter les contrôles structurels, puis afficher « valide » ou une liste d'erreurs](/blog/validate-gitlab-ci-yml-diagram.svg)

**Un job sans surface exécutable.** Chaque job visible doit *faire* quelque chose : exécuter des commandes avec `script:` (ou le plus récent `run:`), déclencher un pipeline en aval avec `trigger:`, ou hériter de l'un d'eux via `extends:`. Un job qui n'en a aucun est rejeté avec le familier « job config should implement a script: or a trigger: keyword ».

```yaml
# ERROR — empty-job defines no script, run, trigger, or extends
empty-job:
  stage: test
  # nothing here → GitLab won't run it
```

Notez qu'un `script: []` ou `script: ""` *vide* compte également comme absent — le validateur ne considère comme une véritable surface exécutable qu'une chaîne ou une liste de commandes non vide, exactement comme le fait GitLab.

**Un stage qui n'est pas déclaré.** Si le `stage:` d'un job ne figure pas dans votre liste `stages:` (ni dans l'un des cinq stages par défaut : `.pre`, `build`, `test`, `deploy`, `.post`), GitLab ne sait pas à quel moment l'exécuter.

```yaml
stages:
  - build
  - test

release-job:
  stage: release      # ERROR — "release" is not in stages:
  script: make release
```

Il existe une variante subtile que le validateur détecte aussi : un job qui *omet* `stage:` se rattache par défaut au stage `test` implicite. Si vous avez déclaré une liste `stages:` personnalisée qui n'inclut pas `test`, ce job pointe désormais vers un stage que vous n'avez jamais déclaré — et GitLab échoue avec « chosen stage test does not exist ».

**`needs` / `dependencies` / `extends` pointant vers un job inexistant.** Chaque nom figurant dans `needs:`, `dependencies:` ou `extends:` doit correspondre à un véritable job, ou à un `.template` masqué, dans le même fichier.

```yaml
test:
  stage: test
  needs:
    - compile          # ERROR — no job named "compile"
  extends: .base       # ERROR — no template named ".base"
  script: make test
```

Le validateur construit l'ensemble de tous les identifiants de jobs et de tous les `.template`, puis vérifie chaque référence par rapport à cet ensemble. Renommez un template en oubliant de mettre à jour un `extends:`, et il vous indique quel job est cassé avant que le runner ne le fasse.

**Un `when:` invalide ou un `rules:` qui n'est pas une liste.** Le mot-clé `when:` n'accepte que `on_success`, `on_failure`, `always`, `manual`, `delayed` ou `never`. Et `rules:` doit être une *liste* YAML d'objets de règle — un simple mapping est une erreur courante qui modifie silencieusement le moment où un job s'exécute.

```yaml
deploy:
  stage: deploy
  when: sometimes      # ERROR — not an allowed when value
  rules:
    if: '$CI_COMMIT_TAG'   # ERROR — rules must be a list, not a mapping
  script: ./deploy.sh
```

Il fait également remonter des conseils de moindre gravité : les anciens `only`/`except` reçoivent une note d'information recommandant `rules:` (les deux ne peuvent pas être combinés dans un même job), une clé de premier niveau qui n'est qu'à une lettre d'un mot-clé réservé — par exemple `varables:` ou `beforescript:` — reçoit un avertissement de faute de frappe, et les formes mal formées de `image:`/`services:` sont signalées comme des erreurs.

## Valider avant de pousser : le CI Lint de GitLab vs un validateur dans le navigateur

GitLab fournit son propre vérificateur — CI Lint, à l'intérieur de l'éditeur de pipeline. Il fait autorité : il résout les fichiers `include:` et les variables CI/CD au niveau du projet, que les outils côté client ne peuvent pas voir. Mais cela a un coût : il nécessite un projet et une connexion. Vous ne pouvez pas linter un extrait issu d'une revue de code, une configuration que vous rédigez hors ligne, ou un pipeline propriétaire que vous préférez ne pas coller dans un formulaire hébergé.

Alors que vérifie réellement un validateur dans le navigateur ? D'après le moteur, le déroulé est déterministe et entièrement local :

1. **Analyse du YAML.** Tout échec renvoie une unique erreur référencée par ligne et s'arrête — aucun résultat structurel sur un document inanalysable.
2. **Découpage du niveau supérieur** entre les mots-clés globaux (`stages`, `default`, `variables`, `image`, `services`…), les jobs visibles et les `.templates` masqués.
3. **Résolution des stages** — votre liste `stages:` déclarée, ou les cinq stages par défaut — pour constituer l'ensemble par rapport auquel le `stage:` de chaque job est vérifié.
4. **Vérification de chaque job** : présence d'une surface exécutable, stage connu, cibles `needs`/`extends`/`dependencies` réelles, `when:` valide, `rules:` sous forme de liste, et formes `image`/`services` cohérentes.
5. **Classement par gravité** — les erreurs d'abord, puis les avertissements, puis les informations — chacun avec la ligne et une remédiation concrète. Il ne lève jamais d'exception ; un échec d'analyse est signalé, pas planté.

Pour être honnête : un résultat propre dans le navigateur offre une forte confiance avant le push sur le plan de *la structure et de la syntaxe*. Il détecte toute la catégorie d'erreurs qui font échouer un pipeline avant même qu'un job ne s'exécute. Pour une certitude absolue sur une configuration qui utilise `include:` ou des variables de projet, confirmez avec le CI Lint de GitLab une fois que vous avez poussé sur un projet — mais servez-vous de la passe dans le navigateur pour faire en sorte que ce push compte.

Si vous utilisez aussi GitHub Actions, la même idée s'applique : le [GitHub Actions Validator](/github-actions-validator) repère les problèmes YAML et de sécurité dans vos fichiers de workflow, et le [GitHub Actions Expression Tester](/github-actions-expression-tester) évalue ces expressions `${{ … }}` avant que vous ne poussiez.

## Intégrez-le à votre workflow

Le validateur est un outil de type « coller et vérifier », mais l'habitude à prendre est : « ne jamais pousser une configuration CI que vous n'avez pas validée ». Un hook de pre-commit automatise cela pour la moitié YAML — détectez les erreurs d'analyse avant même que le commit ne se forme :

```bash
#!/usr/bin/env bash
# .git/hooks/pre-commit — block a commit if .gitlab-ci.yml isn't valid YAML
set -euo pipefail

if git diff --cached --name-only | grep -q '^\.gitlab-ci\.yml$'; then
  # Fail fast on a syntax error before the commit lands.
  python -c "import sys, yaml; yaml.safe_load(open('.gitlab-ci.yml'))" \
    || { echo "✗ .gitlab-ci.yml is not valid YAML — commit blocked"; exit 1; }
  echo "✓ .gitlab-ci.yml parses — paste it into the validator for structural checks"
fi
```

Une analyse YAML locale détecte instantanément la catégorie indentation-et-tabulations. Pour la catégorie structurelle — stages non définis, `needs` cassés, jobs sans script — collez le fichier dans le validateur du navigateur avant de pousser. Les deux ensemble couvrent les deux catégories d'erreurs de la deuxième section, et aucun n'a besoin d'un runner.

```bash
# the loop you actually want
$ git add .gitlab-ci.yml          # pre-commit hook checks YAML
# paste .gitlab-ci.yml → validator → 0 errors
$ git commit -m "split deploy into staging + prod"
$ git push                        # green on the first try
```

## Validez-le maintenant

La prochaine fois que vous toucherez à `.gitlab-ci.yml`, ne laissez pas le runner être le premier à le lire. Collez le fichier dans le [GitLab CI Validator](/gitlab-ci-validator) et vous obtiendrez les erreurs YAML et les erreurs structurelles — stages non définis, jobs sans script, `needs`/`extends` cassés, `when:` invalide — en une seule passe, avec la ligne et la correction pour chacune. Tout s'exécute entièrement dans votre navigateur : aucun projet, aucune connexion et rien n'est téléversé, l'outil est donc sûr pour les pipelines internes.

Si vous avez déjà poussé une modification de CI en espérant qu'elle fonctionne, c'est l'étape qui vous manquait.

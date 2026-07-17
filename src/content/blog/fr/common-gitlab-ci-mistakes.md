---
title: "7 erreurs courantes dans .gitlab-ci.yml (et comment les détecter)"
description: "Les erreurs de .gitlab-ci.yml qui font passer les pipelines au rouge : stages non déclarés, jobs sans script, needs et rules cassés, mauvais usage des ancres — chacune avec un correctif prêt à copier."
pubDate: 2026-06-12
tags: ["gitlab-ci","ci-cd","yaml"]
lang: fr
translationOf: "common-gitlab-ci-mistakes"
relatedTool:
  name: "GitLab CI Validator"
  href: "/gitlab-ci-validator"
---

![.gitlab-ci.yml annoté montrant les erreurs GitLab CI les plus courantes — un stage non déclaré, un job sans script et une référence needs cassée — signalées avant que le pipeline ne démarre](/blog/common-gitlab-ci-mistakes-hero.svg)

Vous poussez une modification d'une seule ligne, vous changez d'onglet, et 30 secondes plus tard l'icône du pipeline passe au rouge. Pas un test en échec — le pipeline n'a jamais démarré. GitLab a affiché `This GitLab CI configuration is invalid` et une seule ligne laconique à propos d'un stage ou d'un script. Vous relisez le YAML trois fois, vous trouvez la faute de frappe, vous poussez de nouveau, vous attendez de nouveau. La plupart des erreurs GitLab CI qui vous coûtent cet aller-retour n'ont rien d'exotique. Ce sont la même poignée de mauvaises configurations de pipeline GitLab, répétées dans chaque équipe : un stage qui n'a jamais été déclaré, un job qui ne fait rien, un `needs` qui pointe vers un job que vous avez renommé.

La bonne nouvelle, c'est que ces erreurs de YAML GitLab CI sont structurelles, ce qui signifie qu'elles sont détectables avant le commit. Voici les sept qui reviennent le plus souvent, chacune avec son symptôme, un exemple minimal cassé et le correctif que vous pouvez coller.

## 1. Référencer un stage non déclaré

```yaml
stages:
  - build
  - test

release-job:
  stage: release      # not in stages:
  script:
    - make release
```

GitLab rejette ceci avec un message du genre `chosen stage release does not exist; available stages are .pre, build, test, .post`. Le `stage:` d'un job doit correspondre à l'un des noms de votre liste `stages:` de premier niveau — ou à l'un des cinq stages implicites que GitLab fournit toujours : `.pre`, `build`, `test`, `deploy` et `.post`.

Il existe une version plus discrète de ce bug. Un job sans aucun `stage:` prend par défaut la valeur `test`. Si vous avez déclaré une liste `stages:` personnalisée qui n'inclut pas `test`, ce job n'a nulle part où s'exécuter et GitLab renvoie la même erreur. Le correctif est identique dans les deux cas — déclarer le stage :

```yaml
stages:
  - build
  - test
  - release

release-job:
  stage: release
  script:
    - make release
```

## 2. Un job sans script (et la confusion autour de global/default-script)

```yaml
stages:
  - test

empty-job:
  stage: test
  # no script, run, trigger, or extends
```

Cela produit l'erreur de job GitLab CI sans script — `job config should implement a script: or a trigger: keyword`. Un job visible doit *faire* quelque chose. Il existe exactement quatre façons d'y répondre : exécuter des commandes avec `script:` (ou le plus récent `run:`), démarrer un pipeline en aval avec `trigger:`, ou hériter de l'une d'elles depuis ailleurs via `extends:`. Un job qui n'a aucune des quatre est rejeté.

La confusion qui en est à l'origine vient du bloc global/default. Les équipes définissent un `before_script:` ou une section `default:` et supposent qu'un job en hérite une *commande*. Ce n'est pas le cas. `before_script` s'exécute *autour* de votre script ; il n'est pas le script. `default:` fournit des valeurs par défaut pour des clés comme `image:` et `cache:`, mais il ne donne pas au job une surface exécutable. Le job a toujours besoin de son propre `script:` (ou d'un `trigger`, `run` ou `extends`) :

```yaml
empty-job:
  stage: test
  script:
    - make check
```

Les templates cachés, préfixés d'un point, font exception — nous y reviendrons dans l'erreur numéro six. Ils ont le droit d'être des fragments partiels, ils ne sont donc pas tenus de porter un script.

![Illustration synthwave : une loupe examine un .gitlab-ci.yml sur un moniteur CRT rétro, entouré d'icônes néon numérotées représentant des erreurs de pipeline courantes — une pièce de puzzle cassée, un bouclier fissuré, des engrenages et un sablier](/blog/in-content/common-gitlab-ci-mistakes.webp)

## 3. needs pointant vers un job d'un stage ultérieur ou vers un job inexistant

```yaml
stages:
  - build
  - test

build:
  stage: build
  script: make

test:
  stage: test
  needs:
    - compile      # no such job
  script: make test
```

`needs:` construit le graphe orienté acyclique qui permet aux jobs de démarrer tôt au lieu d'attendre qu'un stage entier se termine. Chaque nom qui y figure doit correspondre à un job réel du même pipeline. Ici, `compile` a été renommé `build` à un moment donné et la référence `needs` n'a jamais été mise à jour ; le graphe comporte donc un arc orphelin et le pipeline ne parvient pas à se construire.

La version classique de cette erreur, c'est l'ordre : faire pointer `needs` vers un job d'un stage *ultérieur*. `needs` ne peut référencer que des jobs qui s'exécutent avant — un job ne peut pas dépendre de quelque chose qui ne s'est pas encore exécuté. Faites-le pointer vers le véritable job en amont :

```yaml
test:
  stage: test
  needs:
    - build
  script: make test
```

La même règle s'applique à `dependencies:`. Chaque dépendance d'artefact que vous listez doit nommer un job qui existe réellement, sinon le téléchargement échoue à l'exécution.

## 4. des rules qui ne correspondent jamais (ou toujours) — et le mélange only/except avec rules

```yaml
deploy:
  stage: deploy
  when: sometimes        # not a valid when value
  rules:
    if: '$CI_COMMIT_TAG' # rules must be a list
  script: ./deploy.sh
```

Deux erreurs liées aux rules et à extends de GitLab CI sont concentrées dans ce seul job. D'abord, `when:` n'accepte qu'un ensemble fixe de valeurs — `on_success`, `on_failure`, `always`, `manual`, `delayed` ou `never`. `sometimes` n'en fait pas partie, et une faute de frappe ici est purement et simplement rejetée. Ensuite, `rules:` doit être une *liste* YAML d'objets rule. Écrite comme un simple mapping (`if:` directement sous `rules:`), elle est malformée ; GitLab ne peut pas l'interpréter comme une rule.

![Court extrait cassé de .gitlab-ci.yml avec des bulles d'annotation rouges pointant vers un stage non déclaré, un job sans script et une mauvaise référence needs](/blog/common-gitlab-ci-mistakes-diagram.svg)

L'autre moitié de cette catégorie relève de la logique, et elle est plus difficile à repérer parce que le YAML est valide. Une rule dont le `if:` référence une variable vide sur la branche qui vous intéresse ne correspond jamais, silencieusement, et le job ne s'exécute jamais. Une rule sans condition correspond toujours. Et `rules:` ne peut pas être combiné avec les anciens mots-clés `only:`/`except:` dans le même job — GitLab renvoie une erreur si vous utilisez les deux. `only`/`except` fonctionnent toujours, mais ils ne sont plus activement développés ; les nouveaux pipelines devraient donc se standardiser sur `rules`. Écrivez `rules` comme une liste, chaque élément portant sa condition et son `when` :

```yaml
deploy:
  stage: deploy
  rules:
    - if: '$CI_COMMIT_TAG'
      when: manual
  script: ./deploy.sh
```

Si votre bug est une variable d'environnement vide là où vous attendiez une valeur, c'est une autre catégorie de problème — l'[Env Example Checker](/env-example-checker/) détecte la dérive entre `.env` et `.env.example` qui laisse une variable non définie en premier lieu.

## 5. extends d'un template inexistant, ou un extends circulaire

```yaml
.base:
  image: golang:1.22
  script: make

lint:
  extends: .bse        # typo — .bse, not .base
  script: make lint
```

`extends:` est le mécanisme DRY de GitLab : un job importe les clés d'un autre job ou template caché et surcharge ce dont il a besoin. La défaillance la plus courante est exactement celle ci-dessus — une faute de frappe ou un renommage, si bien que `extends` pointe vers un template absent du fichier. GitLab ne peut pas résoudre `.bse`, et la configuration du job est invalide.

La variante plus pernicieuse est un `extends` circulaire — `a` étend `b`, `b` étend `a` — qui n'a aucun cas de base à résoudre et se trouve rejeté. Gardez la chaîne pointée vers un template réel et terminal :

```yaml
.base:
  image: golang:1.22
  script: make

lint:
  extends: .base
  script: make lint
```

`extends` peut aussi accepter une liste de templates, et chaque nom de cette liste doit pouvoir être résolu. Une seule mauvaise entrée casse tout le job.

## 6. Ancres YAML et jobs cachés (préfixés d'un point) mal utilisés

```yaml
.deploy_template: &deploy
  stage: deploy
  script:
    - ./deploy.sh

deploy_prod:
  <<: *deploy
  environment: production
  # inherits stage + script from the anchor
```

GitLab prend en charge à la fois les ancres YAML (`&name` / `*name` avec la clé de fusion `<<:`) et son propre `extends:`. Les deux résolvent le même problème et les gens les mélangent, et c'est là que les ennuis commencent. Le motif ci-dessus est correct : une clé préfixée d'un point est un job *caché* — GitLab ne l'exécute pas comme un job, il n'existe que pour être réutilisé. L'ancrer avec `&deploy` et le fusionner dans `deploy_prod` avec `<<: *deploy` fonctionne.

Ce qui tourne mal :

- **Oublier le point.** Si votre template s'appelle `deploy_template:` sans le point initial, GitLab le traite comme un vrai job — et un vrai job sans script (juste une cible d'ancre) déclenche l'erreur de job sans script de l'erreur numéro deux.
- **Les ancres ne traversent pas les fichiers.** Une ancre YAML est locale à un seul document. Si vous faites un `include:` d'un autre fichier et que vous tentez de référencer une ancre qui y est définie, elle ne sera pas résolue. `extends:` est le choix sûr entre fichiers ; tournez-vous vers lui lorsque la réutilisation s'étend sur des includes.
- **Une clé de fusion ne peut pas être partiellement surchargée comme vous le croyez.** `<<:` effectue une fusion superficielle : redéclarer une clé imbriquée remplace tout le sous-arbre au lieu de fusionner dedans.

Dans le doute, préférez `extends:` pour la réutilisation de jobs et réservez les ancres aux petits fragments scalaires/listes, locaux. Et donnez toujours le point initial à un template réutilisable pour que GitLab sache qu'il ne doit pas l'exécuter :

```yaml
.deploy_template:
  stage: deploy
  script:
    - ./deploy.sh

deploy_prod:
  extends: .deploy_template
  environment: production
```

## 7. include qui renvoie une 404 ou pointe vers le mauvais fichier/ref

```yaml
include:
  - project: 'platform/ci-templates'
    ref: main
    file: '/templates/deploy.yml'   # path or ref may be wrong
```

`include:` importe de la configuration depuis un autre fichier — local, une URL distante, un template ou un autre projet. Quand le chemin, le `ref` ou le projet est incorrect, GitLab ne peut pas le récupérer et tout le pipeline échoue à la compilation, souvent avec un brutal `Project not found or access denied` ou une 404 sur le fichier. Les causes habituelles sont une erreur de chemin avec le slash initial (les chemins d'`include` locaux sont relatifs à la racine du dépôt et nécessitent le slash ; un `file:` issu d'un projet attend lui aussi le chemin absolu du dépôt), un `ref` qui pointe vers une branche ou un tag qui n'existe plus, ou un fichier de template renommé.

Rendez le chemin absolu depuis la racine, épinglez un `ref` qui existe, et revérifiez le chemin du projet :

```yaml
include:
  - project: 'platform/ci-templates'
    ref: v2.3.0          # a tag that exists
    file: '/templates/deploy.yml'
  - local: '/.ci/test.yml'
```

Une réserve qu'il vaut la peine de connaître : résoudre `include:` exige de récupérer réellement les fichiers référencés, ce qu'un vérificateur purement côté client ne peut pas faire. Un linter local valide la *structure* de votre bloc `include` ; pour le mot de la fin sur la résolution d'un fichier distant, le CI Lint propre à GitLab (qui récupère les includes et les variables de projet) est le filet de sécurité.

## Toutes les détecter d'un coup

Six de ces sept erreurs sont structurelles — elles résident dans la manière dont les jobs, les stages et les références s'imbriquent, et non dans le fait que le YAML se parse ou non. C'est exactement la faille que rate un linter de syntaxe seul : un `.gitlab-ci.yml` peut être un YAML parfaitement valide tout en restant un pipeline que GitLab refuse de démarrer.

Le [GitLab CI Validator](/gitlab-ci-validator/) exécute ces contrôles dans votre navigateur. Collez un `.gitlab-ci.yml` : il parse le YAML, puis signale les problèmes structurels ci-dessus — un stage non déclaré, un job sans `script`/`run`/`trigger`/`extends`, des références `needs`/`dependencies`/`extends` qui pointent vers des jobs inexistants, un `when:` invalide, un `rules:` qui n'est pas une liste, des `only`/`except` hérités, et de mauvaises formes d'`image`/`services` — chacun avec la ligne et un correctif concret. Rien n'est téléversé ; tout le contrôle se fait côté client, vous pouvez donc l'exécuter sur des pipelines privés et une configuration de runner propriétaire sans rien envoyer où que ce soit.

Si vos pipelines tournent aussi sur GitHub, la même idée d'« avant de pousser » s'applique aux workflows — notre tour d'horizon des [mauvaises configurations de sécurité de GitHub Actions](/blog/github-actions-security-misconfigurations/) couvre les équivalents côté GitHub, des permissions de token trop larges aux actions tierces non épinglées.

Un pipeline rouge qui n'a jamais tourné est l'échec le moins coûteux possible à prévenir. Détectez les erreurs structurelles avant le commit, et le seul rouge que vous verrez sera celui d'un test qui a réellement échoué.

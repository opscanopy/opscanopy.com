---
title: "Arrêtez de livrer un .env.example périmé"
description: "Votre .env.example est une documentation qui pourrit en silence. Voici pourquoi le drift de configuration casse l'onboarding et les déploiements, comment détecter les clés manquantes et inutilisées, et comment garder le fichier d'exemple honnête."
pubDate: 2026-06-02
tags: ["configuration", "developer-experience", "twelve-factor"]
lang: fr
translationOf: "env-example-drift"
---

Un fichier `.env.example` est le seul fichier de votre dépôt que personne n'exécute, que personne ne teste, et auquel tout le monde fait confiance. C'est le contrat qu'un nouveau coéquipier lit dès le premier jour pour répondre à la seule question qui compte : quelles variables d'environnement dois-je définir avant que ce truc démarre ? Quand ce fichier est juste, l'onboarding se résume à un copier-remplir de cinq minutes. Quand il est faux, vous récoltez le genre de bug le plus démoralisant : l'application plante au démarrage avec `undefined is not a function`, ou pire, tourne tranquillement avec une fonctionnalité désactivée en silence parce qu'un flag a pris la valeur par défaut « off ».

Le problème, c'est que `.env.example` est une documentation, et la documentation dérive. Du code qui lit `process.env.STRIPE_WEBHOOK_SECRET` part dans une branche de fonctionnalité. Le fichier d'exemple n'obtient pas la nouvelle clé parce que l'ajouter ne fait pas partie de « faire fonctionner la fonctionnalité » : cela fait partie de « être prévenant envers la personne suivante », et cette étape reste invisible jusqu'à ce que quelqu'un la heurte. Multipliez cela sur une année de merges et le fichier d'exemple devient un musée des variables dont vous aviez besoin autrefois, sans la moitié de celles dont vous avez réellement besoin.

## Comment le drift survient réellement

Le drift n'est jamais un événement spectaculaire unique. C'est l'accumulation de petites omissions raisonnables :

- Une nouvelle intégration ajoute `SENTRY_DSN` et `SENTRY_ENVIRONMENT`. L'auteur de la PR les a dans son `.env` local, donc l'application fonctionne pour lui — et le fichier d'exemple n'en entend jamais parler.
- Une fonctionnalité est supprimée. Le code qui référence `LEGACY_BILLING_URL` est effacé, mais la clé subsiste dans `.env.example` pour toujours, si bien que les nouveaux venus remplissent consciencieusement une valeur qui ne fait rien.
- Une variable est renommée de `DB_URL` en `DATABASE_URL` dans le code, mais l'exemple annonce toujours l'ancien nom. Désormais, le fichier induit activement en erreur.
- Une clé n'est lue que dans un seul worker rarement touché, si bien qu'elle n'apparaît jamais lors de tests occasionnels — jusqu'à ce que ce worker soit déployé dans un environnement neuf sans aucune valeur définie.

Aucun de ces cas ne fait broncher votre linter, votre vérificateur de types ou vos tests. Le fichier d'exemple ne fait pas partie du graphe de build, donc rien ne vous signale qu'il est désynchronisé. La seule boucle de rétroaction, c'est un humain qui se brûle.

## Les deux modes de défaillance

Il existe exactement deux façons pour le fichier d'exemple d'être faux, et elles échouent dans des directions opposées :

**Les clés manquantes** sont les variables que votre code lit mais que l'exemple ne mentionne pas. Ce sont les dangereuses. Une clé manquante signifie qu'un checkout neuf démarre dans un état indéfini — un crash si vous avez de la chance, une mauvaise configuration silencieuse sinon.

**Les clés inutilisées** sont les variables que l'exemple annonce mais qu'aucun code ne lit plus. Elles sont simplement du gaspillage : elles allongent le fichier, elles obligent les gens à provisionner des secrets dont ils n'ont pas besoin, et elles érodent la confiance dans le fichier en tant que source de vérité. Si trois clés se révèlent mortes, pourquoi croiriez-vous les vingt autres ?

Un fichier d'exemple sain n'a ni l'une ni l'autre. Chaque variable que le code lit figure dans l'exemple, et chaque variable de l'exemple est effectivement lue quelque part.

## À quoi ressemble « lire une variable » selon les langages

Détecter le drift, c'est analyser deux choses : l'ensemble des variables que votre code référence, et l'ensemble des clés que votre exemple déclare. Le côté des références est la moitié délicate, car chaque écosystème l'écrit différemment :

```javascript
// Node.js — the classic
const key = process.env.STRIPE_SECRET_KEY;
const { DATABASE_URL, REDIS_URL } = process.env;

// Vite / browser builds
const api = import.meta.env.VITE_API_BASE;
```

```python
# Python — os.environ and os.getenv
import os
secret = os.environ["DJANGO_SECRET_KEY"]
debug = os.getenv("DEBUG", "false")
```

```go
// Go — os.Getenv and os.LookupEnv
addr := os.Getenv("LISTEN_ADDR")
token, ok := os.LookupEnv("GITHUB_TOKEN")
```

```bash
# Shell — direct expansion
: "${WEBHOOK_URL:?must be set}"
echo "$DEPLOY_ENV"
```

Le côté de l'exemple est comparativement uniforme — une liste de lignes `KEY=value`, souvent avec des commentaires et des sections vides :

```bash
# .env.example
# --- Core ---
DATABASE_URL=postgres://localhost:5432/app
REDIS_URL=redis://localhost:6379

# --- Payments ---
STRIPE_SECRET_KEY=
# STRIPE_WEBHOOK_SECRET is set in code but missing here ↓
```

Soustrayez les deux ensembles et le drift apparaît immédiatement. Les clés référencées dans le code mais absentes de l'exemple sont **manquantes**. Les clés présentes dans l'exemple mais référencées nulle part sont **inutilisées**. Tout ce qui se trouve dans l'intersection est correct.

## Pourquoi un diff rapide vaut mieux qu'un `grep`

Vous pouvez tout à fait bricoler cela avec `grep -rhoE 'process\.env\.[A-Z_]+'` redirigé vers `sort -u` et comparé à `cut -d= -f1 .env.example`. Les gens le font, et ça marche à moitié. L'ennui, ce sont les cas limites qu'une regex jetable rate toujours :

- L'accès par déstructuration (`const { FOO } = process.env`) que le motif naïf n'attrape pas.
- Les clés commentées dans l'exemple qui ne devraient pas compter comme « déclarées ».
- Les valeurs entre guillemets, les préfixes `export` et les commentaires en ligne qui déstabilisent un `cut` bête.
- Plusieurs frameworks dans un même dépôt (`process.env`, `import.meta.env` et `os.getenv`), chacun nécessitant un motif différent.

Le temps que vous ayez géré tout cela, votre pipeline shell « rapide » est devenu un script fragile que personne ne veut maintenir. Un vérificateur conçu pour cela gère les schémas d'accès et les particularités du fichier d'exemple de manière cohérente, et il le fait sans que vous colliez de secrets dans un service distant.

## Garder le fichier honnête

La détection est la première étape ; empêcher le drift de revenir est la seconde. Quelques habitudes aident :

- **Faites de l'exemple la source de vérité.** Certaines équipes chargent `.env.example` au démarrage en développement et avertissent pour toute clé présente dans le code qui n'y est pas déclarée. Le fichier cesse d'être facultatif.
- **Vérifiez-le en revue.** Traitez un nouveau `process.env.X` sans ligne d'exemple correspondante de la même manière que vous traiteriez une nouvelle fonction publique sans commentaire de documentation.
- **Élaguez à la suppression.** Lorsque vous retirez une fonctionnalité, cherchez aussi ses clés dans l'exemple. Les clés mortes sont faciles à oublier.
- **Lancez le diff avant d'ouvrir la PR.** Détecter le drift prend quelques secondes et épargne un après-midi à la personne suivante.

## Attrapez-le avant de committer

Le moyen le plus rapide de savoir si votre fichier d'exemple est honnête est de le comparer à votre code réel. **Env Example Checker** fait exactement cela dans le navigateur : collez votre source et votre `.env.example`, et il signale les variables que votre code utilise mais que l'exemple omet, ainsi que les clés que l'exemple déclare et que rien ne lit. Il s'exécute entièrement côté client — votre code et vos secrets ne quittent jamais la page — vous pouvez donc le lancer sur un dépôt privé sans la moindre hésitation.

Avant votre prochaine pull request, offrez au prochain développeur un `.env.example` auquel il peut réellement faire confiance.

[Vérifiez le drift de votre .env.example →](/env-example-checker)

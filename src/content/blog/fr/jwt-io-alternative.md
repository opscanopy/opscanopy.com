---
title: "Une alternative à jwt.io : décoder un JWT sans le coller sur le site de quelqu'un d'autre"
description: "Une alternative à jwt.io ? Ce qu'un décodeur JWT dans le navigateur peut prouver ou non sur vos données, comment le vérifier vous-même, et une option hors ligne."
pubDate: 2026-09-10
updatedDate: 2026-10-04
tags: ["security", "jwt", "developer-experience"]
lang: fr
translationOf: "jwt-io-alternative"
relatedTool:
  name: "JWT Decoder & Encoder"
  href: "/jwt-decoder"
---

![Un JSON Web Token présenté en trois segments reliés — header, payload et signature — pour un JWT décodé entièrement dans le navigateur](/blog/jwt-io-alternative-hero.svg)
<!-- keywords: jwt.io alternative | is jwt.io safe, jwt decoder offline, decode jwt online, secure jwt decoder, online jwt decoder risks | source: ahrefs free (2026-09-21); marketing brief, ahrefs unchecked (2026-10-04) -->

Un collègue lâche un jeton dans un fil Slack : « pourquoi ça renvoie 401 ? » Vous le copiez, ouvrez un nouvel onglet, et vous êtes déjà en train de le coller dans jwt.io quand vous réalisez ce que vous avez entre les mains : un access token de production encore valide.

Est-ce grave ? Vous supposez probablement que non. Le but de cet article est de remplacer cette supposition par quelque chose que vous pouvez réellement vérifier.

> **TL;DR**
>
> - Décoder un JWT, ce sont deux décodages base64url. Pas de clé, pas de serveur, rien qui doive être envoyé.
> - Savoir si une *page donnée* envoie votre jeton quelque part se vérifie dans DevTools → Network en cinq secondes environ. Faites-le plutôt que de faire confiance à un éditeur, nous compris.
> - Machine isolée ou politique stricte ? `cut | tr | base64 -d` décode un JWT, et `openssl dgst -hmac` recalcule une signature HS256 pour que vous puissiez la comparer, sans aucun navigateur.
> - Décoder n'est pas vérifier, et ni l'un ni l'autre ne remplace la vérification côté serveur avec vos vraies clés de signature.

## jwt.io est-il sûr ?

C'est la mauvaise question, ou du moins une question incomplète. « Sûr » dépend de ce qu'une page donnée fait de votre saisie, et cela, vous pouvez le vérifier au lieu de le croire.

Le mécanisme qui compte : le header et le payload de `header.payload.signature` sont du JSON encodé en base64url. Il n'y a aucune étape de chiffrement. Tout outil qui les décode dans le moteur JavaScript de votre propre navigateur peut donc faire tout le travail sans la moindre requête réseau.

jwt.io est un débogueur ancien et très utilisé, maintenu par Auth0, et son décodage fonctionne exactement ainsi, dans votre navigateur.

Mais « décode en local » décrit un chemin de code sur une page. Cela ne garantit rien sur l'ensemble des requêtes émises par l'origine de cette page. Une page peut décoder en local et charger malgré tout de l'analytics, de la publicité ou d'autres scripts tiers qui n'ont rien à voir avec le décodage.

## La vérification de cinq secondes dans l'onglet Network

La façon fiable de savoir ce qu'un décodeur fait de votre jeton (jwt.io, celui-ci ou une extension de navigateur), c'est de l'observer :

1. Ouvrez les DevTools et passez à l'onglet **Network**.
2. Videz la liste des requêtes. Laissez le filtre sur **All**, ou incluez au moins **Fetch/XHR** et **WS**, pour que le trafic WebSocket apparaisse aussi.
3. Collez votre jeton.
4. Attendez quelques secondes, car un beacon peut partir avec du retard. Puis regardez ce qui est parti. Si aucune requête sortante ne contient le jeton, ou si rien ne part quand vous collez, rien n'a été envoyé.

C'est plus convaincant que n'importe quelle affirmation dans un article de blog, celui-ci compris.

Nous nous imposons la même règle. Le [décodeur JWT](/jwt-decoder/) de ce site effectue le décodage, l'analyse des claims et la vérification de signature entièrement dans le navigateur, avec JavaScript et la Web Crypto API.

Pour être précis sur tout ce que ce site charge par ailleurs : ses propres ressources statiques, Google Analytics (le script gtag.js plus les pings de pages vues et d'événements) et Cloudflare Web Analytics. Aucun ne transporte le jeton que vous saisissez.

Vérifiez-le dans l'onglet Network. Ne nous croyez pas sur parole non plus.

Une réserve qui n'a rien à voir avec le réseau : si vous enregistrez un snapshot dans le décodeur, le jeton (jamais vos clés) est stocké dans le localStorage de ce navigateur. Sur une machine partagée, n'enregistrez pas de snapshots de jetons de production.

## Décoder un JWT en ligne : ce qui doit vraiment se passer

Voici un exemple détaillé avec le jeton d'exemple historique de jwt.io. Son header, son payload et son secret ont servi pendant des années d'exemple par défaut sur jwt.io, et il est devenu le jeton de démonstration standard des outils JWT :

```text
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c
```

Coupez-le aux deux points et décodez en base64url les deux premières parties.

Le header :

```json
{ "alg": "HS256", "typ": "JWT" }
```

Le payload :

```json
{ "sub": "1234567890", "name": "John Doe", "iat": 1516239022 }
```

C'est toute l'étape de « décodage ». Vous n'avez pas besoin de clé, car rien ici n'est chiffré. `iat` est une NumericDate (secondes depuis l'epoch Unix), et 1516239022 correspond au 18 janvier 2018.

*Vérifier* est une autre opération. Elle confirme que la signature a été produite par le détenteur du secret, ici `your-256-bit-secret`. Vous fournissez ce secret HMAC, et l'outil recalcule `HMACSHA256(base64url(header) + "." + base64url(payload), secret)` et compare le résultat au troisième segment.

> **À retenir :** un jeton peut se décoder proprement et échouer quand même à la vérification. C'est toute la raison d'être de sa signature.

## Le piège de la vérification de signature : les risques des décodeurs JWT en ligne

Coller un jeton dans un décodeur expose un jeton. Il a un `exp` et cesse de fonctionner une fois celui-ci dépassé. Coller le secret HMAC pour vérifier ce jeton expose quelque chose de pire : la clé qui signe *tous* les jetons émis par votre service.

Avec HS256, le même secret signe et vérifie. Quiconque le détient peut fabriquer un jeton pour n'importe quel utilisateur, avec n'importe quels claims, que votre backend acceptera comme authentique. Il reste valide jusqu'à ce que vous le fassiez tourner, et le faire tourner déconnecte généralement tous les utilisateurs. Une page de décodage qui envoie la saisie à un serveur est donc un désagrément pour un jeton, et un incident pour un secret.

Une pratique sûre avec les décodeurs JWT tient le secret à l'écart de tout outil côté serveur :

- **HS256 avec un secret de production :** vérifiez hors ligne avec `openssl` (voir plus bas), ou dans un outil de navigateur uniquement après que la vérification de l'onglet Network a montré que rien ne quitte la page.
- **RS256, ES256 ou EdDSA :** la vérification n'a besoin que de la clé publique ou du JWKS, publics par conception. Les coller n'importe où ne pose pas de problème ; la clé privée ne quitte jamais votre émetteur.
- **Déboguer une signature qui ne correspond pas :** reproduisez le problème avec un secret jetable dans un environnement de test, pas avec le vrai.

> **Attention :** si un secret HMAC de production a déjà été collé dans une page que vous n'avez jamais vérifiée, considérez-le comme compromis. Faites-le tourner, et acceptez la reconnexion forcée comme le prix à payer.

## Décodeur JWT hors ligne : sans navigateur

Parfois, « dans le navigateur, vérifié via les DevTools » ne suffit pas. Vous êtes peut-être sur une machine isolée. Une revue de sécurité exige peut-être zéro capacité réseau, point, et pas seulement aucune requête observée. Vous avez alors deux options honnêtes.

### Option 1 : décoder avec des outils auxquels vous faites déjà confiance

base64url diffère du base64 standard sur deux points : deux caractères sont échangés (`-` pour `+`, `_` pour `/`) et le remplissage `=` est supprimé. `cut`, `tr` et `base64` vous donnent donc le JSON sans aucun navigateur :

```bash
TOKEN='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c'
echo "$TOKEN" | cut -d. -f2 | tr '_-' '/+' | base64 -d 2>/dev/null
# {"sub":"1234567890","name":"John Doe","iat":1516239022}
```

> **Piège :** `base64` attend une entrée complétée par des `=` jusqu'à un multiple de 4 caractères. GNU `base64 -d` affiche quand même ce payload (il se termine simplement avec un code non nul), mais BSD/macOS est moins tolérant.

Si vous préférez ne pas en dépendre, cette fonction shell complète d'abord :

```bash
b64url() {
  local s
  s=$(printf '%s' "$1" | tr '_-' '/+')
  while [ $(( ${#s} % 4 )) -ne 0 ]; do s="$s="; done
  printf '%s' "$s" | base64 -d; echo
}

b64url "$(echo "$TOKEN" | cut -d. -f1)"   # {"alg":"HS256","typ":"JWT"}
b64url "$(echo "$TOKEN" | cut -d. -f2)"   # {"sub":"1234567890","name":"John Doe","iat":1516239022}
```

Pour HS256, vous pouvez aussi vérifier hors ligne. Recalculez le HMAC sur `header.payload` et comparez-le au troisième segment :

```bash
printf '%s' "$(echo "$TOKEN" | cut -d. -f1-2)" \
  | openssl dgst -sha256 -hmac 'your-256-bit-secret' -binary \
  | base64 | tr '+/' '-_' | tr -d '='
# SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c   <- matches the signature segment
```

Si vous voulez une vraie gestion des options et une vérification intégrée plutôt que des one-liners shell, il existe des CLI dédiées hors ligne. `jwt-cli` (`mike-engel/jwt-cli` sur GitHub, écrit en Rust) est souvent citée.

### Option 2 : un décodeur statique sans chemin d'envoi

Un simple décodage n'est que du décodage base64url en JS côté client. Un site statique n'a donc pas besoin de backend pour le faire, et celui-ci n'en a pas : il n'existe aucun serveur à lui pour recevoir votre jeton.

Cela ne veut pas dire qu'une page ne *peut* parler à rien. La Content-Security-Policy de ce site limite les connexions sortantes à sa propre origine plus les endpoints de Google Analytics et de Cloudflare Web Analytics, ce que vous pouvez lire dans les en-têtes de réponse. Une politique restreint là où les données pourraient aller ; elle ne prouve pas où elles sont allées. La vérification reste l'onglet Network.

## Quoi utiliser, et quand

Soyez honnête avec vous-même sur l'usage de chaque option :

| Option | Idéal pour | Garantie |
|---|---|---|
| **jwt.io** | Jetons non sensibles : tests, tutoriels, tenants hors production | Le chemin de décodage est du JS côté client |
| **Outil navigateur + onglet Network** | Vrais access tokens ou ID tokens | Vous avez vu que rien ne quittait l'onglet (lors de cette visite) |
| **Décodage en CLI** | Machine isolée ou politique sans réseau | La plus forte, à moins d'écrire la vôtre |

La voie navigateur ajoute des légendes de claims, des contrôles d'expiration et la vérification de signature. La voie CLI vous donne du JSON brut et la vérification HMAC, rien de plus.

> **Important :** aucune de ces options ne valide l'autorisation. Décoder, même avec vérification de signature, vous dit que le jeton est bien formé et, éventuellement, qu'il a été signé par le détenteur de la clé avec laquelle vous avez vérifié. Cela ne remplace pas la vérification côté serveur avant d'agir sur un claim en production. Votre backend doit faire ce contrôle avec vos vraies clés de signature, à chaque fois.

Envie de descendre d'un niveau sous les outils propres aux JWT, jusqu'à la mécanique de base64url elle-même ? Le [Base64 Encoder / Decoder](/base64-encoder-decoder/) gère n'importe quel payload base64 et base64url, pas seulement les JWT.

## Points clés

- Traitez « ce site est-il sûr ? » comme une question à laquelle vous répondez dans les DevTools, pas sur la foi d'une réputation.
- Videz l'onglet Network, collez le jeton et vérifiez que rien ne l'emporte.
- Décoder n'est pas vérifier : un payload lisible ne prouve rien sur l'identité du signataire.
- Sur les machines verrouillées, `cut | tr | base64 -d` décode et `openssl dgst -hmac` permet de vérifier une signature HS256.
- Vérifiez toujours côté serveur avec vos vraies clés avant de faire confiance à un claim.

Si vous voulez la voie navigateur avec la vérification intégrée, le [décodeur JWT](/jwt-decoder/) fait tout le travail : décoder, vérifier avec un secret, une clé PEM, un JWK ou un JWKS, signer vos propres jetons et générer des clés de test, sans rien envoyer. Confirmez-le dans votre propre onglet Network avant de lui confier quoi que ce soit de réel.

Quelle est votre règle pour les jetons de production : n'importe quel décodeur, un outil interne validé, ou la CLI uniquement ? Et qu'est-ce qui a poussé votre équipe à ce choix ?

---
title: "Base64 n'est pas du chiffrement : comment vraiment protéger une clé d'API"
description: "Base64, du chiffrement ? Non. Ce que fait Base64, par où fuient les secrets encodés, ce qui protège vraiment une clé d'API, et quand Base64 est le bon outil."
pubDate: 2026-09-08
tags: ["security", "developer-experience"]
lang: fr
translationOf: "base64-is-not-encryption"
relatedTool:
  name: "Base64 Encoder / Decoder"
  href: "/base64-encoder-decoder"
---

![Une clé d'API encodée en Base64 puis immédiatement décodée, ce qui montre que l'encodage ne protège rien](/blog/base64-is-not-encryption-hero.svg)
<!-- keywords: is base64 encryption | base64 vs encryption, base64 decode, how to secure an api key, kubernetes secret base64 | source: marketing brief, ahrefs unchecked (2026-10-04) -->

Une pull request arrive avec un fichier de configuration qui contient cette ligne :

```yaml
PAYMENTS_API_KEY: b3BzX2xpdmVfN2YzYTljMmU=
```

La note de l'auteur indique que la clé est « encodée, donc on peut la committer ». Non. Quiconque peut lire cette ligne récupère la clé avec une seule commande, tout comme chaque scanner qui parcourt les dépôts publics à la recherche précisément de ce motif.

> **TL;DR**
>
> - Base64 est un encodage. Il n'a pas de clé, donc n'importe qui peut l'inverser, instantanément.
> - Le `Secret.data` de Kubernetes est en Base64 parce que YAML a besoin de texte, pas parce que cela cache quoi que ce soit.
> - Ce qui protège une clé, c'est l'endroit où elle vit et qui peut la lire : un gestionnaire de secrets ou un KMS, l'injection à l'exécution, une portée étroite, la rotation et TLS en transit.
> - Base64 est le bon outil pour faire passer des octets par des canaux qui ne gèrent que du texte. C'est tout ce à quoi il sert.

## Ce que fait vraiment Base64

Base64, défini dans la RFC 4648, transforme des octets quelconques en une chaîne tirée de 64 caractères imprimables : `A–Z`, `a–z`, `0–9`, `+` et `/`, avec `=` comme remplissage. Il lit l'entrée trois octets (24 bits) à la fois et écrit quatre caractères de six bits chacun. Les trois octets ASCII de `Man` deviennent `TWFu`.

Ce rapport de 3 à 4 explique pourquoi les données encodées sont environ 33 % plus volumineuses que l'original. Quand la longueur de l'entrée n'est pas un multiple de trois, la sortie reçoit un ou deux `=` pour que sa longueur reste un multiple de quatre.

La même RFC définit une variante compatible avec les URL, base64url, qui remplace `+` par `-` et `/` par `_` afin que le résultat puisse figurer dans une URL ou un nom de fichier. Les JWT l'utilisent, en général sans le remplissage.

Il n'y a aucun secret dans ce processus. Décoder, c'est lire la même table à l'envers :

```bash
printf '%s' 'b3BzX2xpdmVfN2YzYTljMmU=' | base64 -d
# ops_live_7f3a9c2e
```

Sur les anciennes versions de macOS, l'option est `-D` ; `--decode` fonctionne avec GNU comme avec BSD.

> **Astuce :** utilisez `printf '%s'` ou `echo -n` pour encoder. Un simple `echo` ajoute un saut de ligne, et ce saut de ligne est encodé lui aussi. Une valeur Base64 qui se termine par `Cg==` signifie souvent que quelqu'un a encodé `"value\n"` par erreur, et ce saut de ligne en trop casse discrètement l'identifiant.

## Base64, est-ce du chiffrement ? Pourquoi ça y ressemble, et pourquoi ce n'en est pas

Le chiffrement transforme les données avec une clé, de sorte que la sortie est inutilisable pour quiconque ne possède pas cette clé. Base64 n'a pas de clé. L'algorithme est public, identique partout et réversible par n'importe qui.

Il *ressemble* à du chiffrement parce que la sortie est illisible pour un humain au premier coup d'œil. `YWRtaW46aHVudGVyMg==` ne dit pas clairement `admin:hunter2`, donc on a l'impression que c'est protégé. Ça ne l'est pas. Le déguisement résiste à un coup d'œil rapide et à rien d'autre, et les scanners de secrets automatisés décodent le Base64 en routine.

### Le cas des Secrets Kubernetes

La source la plus courante de cette confusion, c'est Kubernetes. Un manifeste `Secret` stocke ses valeurs encodées en Base64 sous `data` :

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: payments
type: Opaque
data:
  api-key: b3BzX2xpdmVfN2YzYTljMmU=
```

L'encodage existe pour que des valeurs binaires, comme un keystore ou un certificat, tiennent dans un manifeste texte. Le champ `stringData` accepte les mêmes valeurs en clair et l'API server les encode pour vous, ce qui montre à quel point l'encodage protège peu.

La documentation de Kubernetes est explicite là-dessus : par défaut, les Secrets sont stockés non chiffrés dans le magasin de données de l'API server, etcd. Le chiffrement au repos s'active séparément, avec une `EncryptionConfiguration` sur l'API server ou un fournisseur KMS. Base64 n'en fait pas partie.

## Par où fuient les secrets encodés en Base64

Puisque l'encodage ne cache rien, un secret encodé fuit par tous les canaux par lesquels fuirait un secret en clair. Les plus courants :

- **L'historique Git.** Un manifeste de Secret ou un fichier `.env` commité reste dans l'historique après sa suppression de la pointe de la branche. Retirer la ligne dans un commit ultérieur ne retire pas la clé. Faites-la tourner, puis envisagez de réécrire l'historique.
- **Les logs.** Une journalisation de débogage qui affiche une requête, un environnement ou une configuration générée écrit la valeur encodée avec tout le reste. Les pipelines de logs la copient ensuite vers des endroits où davantage de monde peut la lire.
- **`kubectl get secret -o yaml`.** Quiconque dispose de `get` sur les Secrets d'un namespace peut lire toutes leurs valeurs, et cette permission est souvent plus large que prévu. Une sortie collée dans un ticket ou un chat emporte les clés avec elle.
- **Les bundles clients.** Une clé livrée dans le JavaScript du front-end ou dans une application mobile est publique, encodée ou non. N'importe qui peut ouvrir les DevTools ou décompresser l'application et la décoder.
- **Les images de conteneur.** Une clé intégrée avec `ENV` ou copiée pendant un build reste dans les couches de l'image, et `docker history` ou l'extraction d'une couche la révélera.

> **Attention :** si une vraie clé a été commitée, journalisée ou livrée dans un bundle, la solution est la rotation. Supprimer le fichier ou passer le dépôt en privé empêche une exposition future. Cela ne vous dit pas qui l'a déjà lue.

## Comment vraiment protéger une clé d'API

Aucune étape isolée ne suffit. La protection vient du contrôle de l'endroit où vit une clé, de qui peut la lire et de l'ampleur des dégâts si elle s'échappe.

### Stockez-la dans un gestionnaire de secrets ou un KMS

Utilisez un stockage conçu pour cela : AWS Secrets Manager ou SSM Parameter Store, Google Secret Manager, Azure Key Vault ou HashiCorp Vault. Ils chiffrent les valeurs au repos avec des clés que vous ne manipulez pas directement, journalisent chaque lecture et placent l'accès derrière des politiques IAM que vous pouvez auditer. Pour Kubernetes, activez le chiffrement au repos des Secrets et resserrez le RBAC pour que peu d'identités puissent faire un `get` dessus. Des outils comme External Secrets Operator ou Sealed Secrets gardent le texte en clair hors de vos manifestes.

### Injectez-la à l'exécution

Faites lire la clé par l'application au démarrage, depuis le stockage de secrets ou depuis une variable d'environnement ou un fichier monté que la plateforme remplit. La clé n'apparaît alors jamais dans le code source, les images ou les logs de build. Gardez dans le dépôt un `.env.example` avec des noms factices, et laissez le vrai `.env` en dehors. Le [.env example checker](/env-example-checker/) signale les écarts entre les deux.

### Restreignez sa portée

Émettez des clés avec le plus petit ensemble de permissions dont la tâche a besoin : lecture seule quand la lecture suffit, une clé par service et par environnement, restrictions par IP ou par referrer quand le fournisseur les propose. Une clé de staging en lecture seule qui fuit, c'est un désagrément. Une clé d'administration de production qui fuit, c'est un incident.

### Faites-la tourner

Les clés à expiration et la rotation planifiée limitent la durée pendant laquelle une fuite reste exploitable. Faites de la rotation une routine : le jour où vous en aurez besoin, c'est le jour où une clé se sera échappée.

### Chiffrez-la en transit avec TLS

N'envoyez les clés que par HTTPS. L'authentification HTTP Basic (RFC 7617) envoie `username:password` en Base64 dans l'en-tête `Authorization`, et en HTTP simple, n'importe qui sur le trajet peut le décoder. TLS protège le canal. Base64 ne fait que mettre en forme l'en-tête.

## Quand Base64 est le bon outil

Rien de tout cela ne rend Base64 mauvais. C'est le bon outil pour sa vraie fonction : transporter des octets à travers un canal qui ne gère que du texte.

- **Des données binaires dans du JSON ou du YAML.** Aucun des deux formats n'a de type octet, donc images, certificats et keystores y entrent sous forme de chaînes Base64.
- **L'authentification HTTP Basic.** Le format de l'en-tête l'impose, comme vu plus haut.
- **Les URI de données.** La RFC 2397 permet d'intégrer une petite image ou une police sous la forme `data:image/png;base64,…`.
- **Les pièces jointes d'e-mail.** MIME (RFC 2045) utilise Base64 pour faire passer du binaire par le transport de courrier, avec des lignes coupées à 76 caractères. GNU `base64` coupe à 76 par défaut pour la même raison ; passez `-w 0` pour obtenir une seule ligne.
- **Les jetons et les URL.** base64url transporte des identifiants binaires et des segments de JWT sans échappement.

Dans chacun de ces cas, le destinataire est censé décoder la valeur. C'est tout l'intérêt.

## Vérifiez la chaîne sans l'envoyer nulle part

Quand vous trouvez une chaîne suspecte dans un fichier de configuration ou une ligne de log, décodez-la pour voir ce que c'est. Mais ne collez pas une possible clé de production dans un site qui pourrait l'envoyer quelque part.

Le [Base64 Encoder / Decoder](/base64-encoder-decoder/) de ce site fonctionne entièrement dans votre navigateur. Il gère les alphabets standard et compatible URL ainsi que l'UTF-8 complet, et rien de ce que vous collez n'est envoyé. Comme pour tout outil, ne le croyez pas sur parole : ouvrez les DevTools, videz l'onglet Network, collez la chaîne et vérifiez qu'aucune requête ne la transporte. Si la chaîne s'avère être un JWT, le [décodeur JWT](/jwt-decoder/) sépare et décode ses trois segments.

## Checklist : Base64 et clés d'API

- [ ] Aucune clé d'API dans le dépôt, encodée ou non, historique compris.
- [ ] Secrets Kubernetes chiffrés au repos, et `get` RBAC sur les Secrets limité aux identités qui en ont besoin.
- [ ] Clés conservées dans un gestionnaire de secrets ou un KMS et injectées à l'exécution, jamais intégrées dans des images ou des bundles front-end.
- [ ] Une clé à portée restreinte par service et par environnement.
- [ ] Une procédure de rotation exécutée au moins une fois.
- [ ] Identifiants envoyés uniquement via TLS, authentification Basic comprise.
- [ ] Logs expurgés des en-têtes, des dumps d'environnement et des configurations générées.
- [ ] Base64 utilisé uniquement pour faire passer des octets sous forme de texte, jamais pour les cacher.

Comment votre équipe repère-t-elle les secrets encodés avant leur fusion : un scanner pre-commit, un contrôle en CI, ou des relecteurs qui savent à quoi ressemble `b3Bz` ?

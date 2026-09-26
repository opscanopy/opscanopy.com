---
title: "Unable to get local issuer certificate (curl, git, npm, pip)"
description: "Pourquoi curl, git, npm et pip renvoient unable to get local issuer certificate, quel magasin lit chacun, et comment ajouter une AC sans le remplacer."
pubDate: 2026-09-26
tags: ["security", "tls", "certificates", "debugging"]
lang: fr
translationOf: "unable-to-get-local-issuer-certificate"
relatedTool:
  name: "Certificate Decoder"
  href: "/certificate-decoder"
---

![Quatre clients CLI, curl, git, npm et pip, vérifient le certificat du serveur dans leur propre magasin de confiance ; à l'un d'eux manque l'émetteur](/blog/unable-to-get-local-issuer-certificate-hero.svg)
<!-- keywords: primary: unable to get local issuer certificate (>1000, KD Medium) | title phrase: ssl certificate problem: unable to get local issuer certificate (>100, Easy) | secondaries: curl unable to get local issuer certificate, git ssl certificate problem unable to get local issuer certificate (Easy), npm unable to get local issuer certificate (Easy), pip unable to get local issuer certificate (Easy), curl: (60) ssl certificate problem | source: ahrefs free (2026-09-26) -->
<!-- insight: the string means different things per client: curl/git/pip print it for a missing intermediate AND an untrusted root, Node/npm only when the chain arrived and the root is missing from Node's bundled store (proxy/private CA); most usual fixes (--cacert, http.sslCAInfo, npm cafile) replace the trust store, NODE_EXTRA_CA_CERTS appends, and pip --cert adds only under truststore (pip 24.2+, Python 3.10+) | serp-checked: 2026-09-26 -->

Premier matin dans un nouveau poste, vous clonez un dépôt, et la commande s'arrête net au moment de la poignée de main TLS :

```text
curl: (60) SSL certificate problem: unable to get local issuer certificate
More details here: https://curl.se/docs/sslcerts.html
```

Puis `git clone`, `npm install` et `pip install` échouent à leur tour. Le navigateur, lui, charge toujours la page. « Unable to get local issuer certificate » est une seule et même erreur OpenSSL, mais chaque client la vérifie dans un magasin de confiance différent : voilà pourquoi le correctif qui marche pour un outil échoue sur le suivant.

> **TL;DR**
>
> - L'erreur correspond au code 20 d'OpenSSL : la chaîne s'arrête sur un certificat dont l'émetteur est absent du magasin de confiance de *ce client-là*.
> - Lancez `openssl s_client -showcerts` contre l'hôte et lisez les lignes `i:`. Un seul certificat : il manque un intermédiaire. Un émetteur d'entreprise ou d'éditeur : un proxy d'inspection TLS.
> - curl, git, Node/npm et pip lisent chacun un magasin différent ; installer une autorité de certification (AC) à un endroit corrige donc rarement les quatre.
> - `--cacert`, `http.sslCAInfo` et le `cafile` de npm **remplacent** le magasin. `NODE_EXTRA_CA_CERTS` y ajoute.

## Que signifie « unable to get local issuer certificate » ?

Le serveur envoie un certificat feuille et, s'il est bien configuré, les intermédiaires. Votre client construit une chaîne en remontant depuis la feuille, et le sommet de cette chaîne doit être une racine qu'il détient déjà localement. OpenSSL lève l'erreur 20, `X509_V_ERR_UNABLE_TO_GET_ISSUER_CERT_LOCALLY`, lorsque le certificat du sommet n'est pas auto-signé et qu'aucun émetteur correspondant n'existe dans le magasin local.

Cela recouvre deux situations distinctes. Si le serveur n'a envoyé que la feuille, la chaîne s'arrête à la profondeur 0, faute d'intermédiaire. Si la feuille et l'intermédiaire sont bien arrivés mais que la racine manque à votre magasin, la chaîne s'arrête à la profondeur 1 ou 2. C'est le cas de l'AC privée et du proxy.

Ses voisines dans le fichier [x509_txt.c](https://github.com/openssl/openssl/blob/master/crypto/x509/x509_txt.c) d'OpenSSL méritent qu'on les connaisse :

```text
18  self-signed certificate
19  self-signed certificate in certificate chain
20  unable to get local issuer certificate
21  unable to verify the first certificate
```

Un proxy qui envoie aussi sa propre racine produit l'erreur 19 au lieu de la 20. Le mécanisme commun à toutes ces erreurs est le parcours de chaîne expliqué dans [x509: certificate signed by unknown authority](/blog/x509-certificate-signed-by-unknown-authority/), la formulation Go du même échec.

## Pourquoi la même URL échoue-t-elle dans un client et pas dans un autre ?

Sous Linux ou macOS, curl, git et Python s'arrêtent à la première erreur de vérification : un serveur qui n'envoie que la feuille leur renvoie donc le code 20. `openssl s_client`, lui, continue : contre `incomplete-chain.badssl.com`, il affiche `num=20`, puis `num=21`, et se termine par `Verify return code: 21 (unable to verify the first certificate)`.

Node, à l'inverse, remonte la *dernière* erreur. Un serveur qui n'envoie que la feuille apparaît donc dans Node 24.16.0 sous la forme `unable to verify the first certificate` (`UNABLE_TO_VERIFY_LEAF_SIGNATURE`), et Node suggère lui-même d'essayer `--use-system-ca` si l'AC racine est installée localement. Quand npm ou Node affiche `UNABLE_TO_GET_ISSUER_CERT_LOCALLY`, les intermédiaires sont arrivés et c'est la racine qui manque au magasin de Node : la signature typique d'un proxy ou d'une AC privée.

Windows se comporte encore autrement. Le curl 8.4.0 embarqué par Git for Windows et le curl.exe de System32 utilisent tous deux Schannel, et tous deux ont renvoyé 200 pour la même chaîne incomplète, car Schannel va chercher les intermédiaires manquants et lit le magasin de Windows. Le Python 3.13 de python.org sous Windows est passé lui aussi. Ce qui échoue, c'est git lui-même, que Git for Windows configure avec `http.sslBackend=openssl`, ainsi que WSL et les conteneurs.

| Ce que vous voyez | Où | Cause la plus probable |
|---|---|---|
| Erreur 20, navigateur OK, `s_client` n'affiche qu'un certificat | curl, git, pip | [Intermédiaire manquant sur le serveur](#cause-2-le-serveur-omet-il-son-certificat-intermédiaire) |
| Tous les hôtes HTTPS échouent, seulement sur le réseau du bureau ou le VPN | n'importe quel client | [Proxy d'inspection TLS](#cause-1-un-proxy-dinspection-tls-re-signe-t-il-votre-trafic) |
| `UNABLE_TO_GET_ISSUER_CERT_LOCALLY` | npm, Node | Proxy ou AC privée |
| `unable to verify the first certificate` | npm, Node | Intermédiaire manquant sur le serveur |
| Fonctionne avec le curl Windows/Schannel, échoue dans git, WSL ou un conteneur | Windows | Schannel a réparé la chaîne ou fait confiance au magasin Windows |
| Échoue seulement dans `docker build` ou un conteneur | image | [Le magasin de l'image ne contient pas l'AC](#cause-3-pourquoi-léchec-ne-se-produit-il-que-dans-une-image-docker) |

## Quel magasin de confiance chaque client lit-il ?

La plupart des listes de correctifs font l'impasse sur ce point. Il n'existe pas de « magasin de confiance système » unique qui servirait tous les outils : chaque client a son propre magasin par défaut et son propre mécanisme de surcharge, avec une sémantique différente.

![Quel magasin de confiance lit chaque client : curl et git lisent un fichier bundle PEM, Node et npm une liste Mozilla compilée dans Node, pip certifi plus le magasin de l'OS, et les clients Schannel le magasin de certificats Windows](/blog/unable-to-get-local-issuer-certificate-diagram.svg)

| Client | Magasin par défaut | Surcharge, et son effet |
|---|---|---|
| curl (compilé avec OpenSSL) | Fichier bundle d'AC choisi à la compilation | `--cacert`, `CURL_CA_BUNDLE` : remplacent |
| git, backend openssl | Le bundle livré avec Git ou celui de l'OS | `http.sslCAInfo`, `GIT_SSL_CAINFO` : remplacent |
| Node, npm | Liste d'AC Mozilla figée à la sortie de la version de Node | `NODE_EXTRA_CA_CERTS` : ajoute. `cafile` de npm : remplace |
| pip 24.2+ sur Python 3.10+ | certifi plus le magasin de l'OS | `--cert`, `PIP_CERT` : ajoutent un bundle |
| requests | certifi | `REQUESTS_CA_BUNDLE` : remplace |
| curl.exe, git avec schannel | Magasin de certificats Windows | Géré par Windows ou par stratégie de groupe |

Par défaut, Node ne lit pas le magasin de l'OS ([documentation CLI de Node](https://nodejs.org/api/cli.html#node_extra_ca_certsfile)) : installer une AC d'entreprise dans Windows, macOS ou Debian ne corrige donc pas npm. `--use-system-ca` (v23.8.0 et v22.15.0, Linux à partir de v23.9.0) et `NODE_USE_SYSTEM_CA=1` (v24.6.0 et v22.19.0) changent la donne. Côté Python, `requests` passe explicitement le chemin de certifi, si bien que `SSL_CERT_FILE` ne l'atteint pas.

pip fait exception : sous truststore, `--cert` ajoute. pip 26.0.1 sur Python 3.13 atteignait encore PyPI avec `--cert` pointé sur une seule racine sans rapport ; avec `--use-deprecated=legacy-certs`, la même commande échouait avec cette erreur.

> **Attention :** une surcharge de type « remplacement » pointée sur un fichier qui ne contient que votre AC d'entreprise corrige l'hôte derrière le proxy et casse tous les hôtes publics. Avec `GIT_SSL_CAINFO` réglé sur un fichier à racine unique, `git ls-remote https://github.com/git/git.git` échoue avec cette même erreur. Pointez les options de remplacement vers un bundle complet qui contient aussi votre AC.

## Comment confirmer la cause ?

Demandez au serveur ce qu'il envoie, en visant l'hôte que votre client a appelé. Gardez `-servername` pour que le SNI sélectionne le bon certificat :

```bash
openssl s_client -connect registry.npmjs.org:443 -servername registry.npmjs.org -showcerts </dev/null
```

Lisez les paires numérotées `s:` (sujet) et `i:` (émetteur) :

- **Un seul certificat, émetteur public, `depth=0` sur la ligne d'erreur :** il manque un intermédiaire côté serveur.
- **L'émetteur du sommet est votre employeur ou un éditeur de sécurité comme Zscaler :** un proxy d'inspection TLS, même si seule la feuille est arrivée.

Pour lire la chaîne sans plisser les yeux devant du PEM, collez la transcription complète dans le [Certificate Decoder](/fr/certificate-decoder/) ; il ignore le texte qui entoure les certificats.

Sur une capture de `incomplete-chain.badssl.com` ne contenant que la feuille, il lève une erreur `missing intermediate` et nomme ce qui manque : `The chain is missing the intermediate that issued *.badssl.com: "C=US, O=Let's Encrypt, CN=YR2".` Son message indique que les runtimes échouent avec « unable to get local issuer certificate ». Node est l'exception décrite dans la section précédente.

La limite, en toute honnêteté : le décodeur ne voit pas le magasin de confiance de votre client. Si le proxy envoie son intermédiaire, la chaîne est cohérente en elle-même et le décodeur affiche `chain order OK · 1 signature verified`, racine non incluse. Un proxy qui n'envoie que la feuille obtient `missing intermediate`, mais un émetteur d'entreprise désigne toujours un proxy, pas un bug du serveur. Dans tous les cas, lisez le nom de l'émetteur.

## Quelles sont les causes, par ordre de fréquence ?

Trois causes, en commençant par la plus fréquente sur les réseaux d'entreprise. Chacune a son indice, son correctif et sa vérification.

### Cause 1 : un proxy d'inspection TLS re-signe-t-il votre trafic ?

Sur un réseau d'entreprise, c'est le coupable habituel, et la première hypothèse de l'équipe de la CLI npm dans [npm/cli#7326](https://github.com/npm/cli/issues/7326) : « This is usually because of a proxy you are in that is not providing valid ssl certificates. » Le proxy termine la connexion TLS et re-signe les sites inspectés avec sa propre AC. Votre navigateur fait confiance à cette AC via la politique de la DSI ; vos outils en ligne de commande, non.

**Indice :** tous les hôtes publics échouent, l'émetteur du sommet dans `s_client` est une AC d'entreprise ou d'éditeur, et npm affiche `UNABLE_TO_GET_ISSUER_CERT_LOCALLY` :

```text
npm error code UNABLE_TO_GET_ISSUER_CERT_LOCALLY
npm error errno UNABLE_TO_GET_ISSUER_CERT_LOCALLY
npm error request to https://registry.npmjs.org/serve failed, reason: unable to get local issuer certificate
```

pip enveloppe le même texte OpenSSL ; le numéro de ligne de `_ssl.c` varie selon la build de Python :

```text
[SSL: CERTIFICATE_VERIFY_FAILED] certificate verify failed: unable to get local issuer certificate (_ssl.c:1028)
```

**Correctif :** récupérez auprès de la DSI le certificat racine du proxy (au format PEM), installez-le une fois, puis donnez à chaque client une option qui conserve les racines publiques :

```bash
# Debian/Ubuntu/WSL: add the root to the OS bundle (.crt extension required)
sudo cp corp-root.pem /usr/local/share/ca-certificates/corp-root.crt
sudo update-ca-certificates

# curl and git: point at the full bundle, which now includes the corporate root
curl --cacert /etc/ssl/certs/ca-certificates.crt https://registry.npmjs.org/
git config --global http.sslCAInfo /etc/ssl/certs/ca-certificates.crt

# Node and npm: append to Node's own list instead of replacing it
export NODE_EXTRA_CA_CERTS="$HOME/corp-root.pem"

# pip and requests
export PIP_CERT=/etc/ssl/certs/ca-certificates.crt
export REQUESTS_CA_BUNDLE=/etc/ssl/certs/ca-certificates.crt
```

Sous Git for Windows, `git config --global http.sslBackend schannel` fait utiliser à git le magasin Windows, que la DSI a souvent déjà alimenté. pip 24.2 et versions ultérieures sur Python 3.10+ lisent aussi le magasin de l'OS en plus de certifi ([documentation de pip](https://pip.pypa.io/en/stable/topics/https-certificates/)).

> **Important :** `NODE_EXTRA_CA_CERTS` n'est lu qu'au démarrage du processus, et Node l'ignore lorsqu'une option `ca` explicite est définie. Le `cafile` de npm devient justement cette option `ca` : définir les deux fait disparaître les certificats supplémentaires sans le moindre avertissement. Préférez `NODE_EXTRA_CA_CERTS`.

**Vérification :** `openssl s_client -connect registry.npmjs.org:443 -servername registry.npmjs.org -CAfile /etc/ssl/certs/ca-certificates.crt </dev/null` doit se terminer par `Verify return code: 0 (ok)`. Relancez ensuite la commande d'origine. Python 3.13 active `VERIFY_X509_STRICT` : une vieille AC de proxy faite maison peut donc encore y échouer, avec une erreur différente, une fois approuvée.

### Cause 2 : le serveur omet-il son certificat intermédiaire ?

**Indice :** `s_client` n'affiche qu'un certificat, l'erreur se situe à `depth=0`, le navigateur charge la page et Node affiche `unable to verify the first certificate`. git l'affiche ainsi :

```text
fatal: unable to access 'https://incomplete-chain.badssl.com/x.git/': SSL certificate problem: unable to get local issuer certificate
```

**Correctif :** côté serveur. Le fichier de certificat doit contenir la feuille suivie de tous les intermédiaires, ce qui, pour Let's Encrypt, signifie `fullchain.pem` et non `cert.pem`.

La [première cause de l'article sur x509](/blog/x509-certificate-signed-by-unknown-authority/#1-the-server-is-missing-its-intermediate) donne les lignes nginx. Si le serveur ne vous appartient pas, envoyez la sortie de `s_client` à son propriétaire. Ajouter l'intermédiaire à votre propre bundle ne fait que masquer un bug sur lequel tous les autres clients OpenSSL buteront.

**Vérification :** relancez `s_client` ; vous devez voir au moins deux certificats et `Verify return code: 0 (ok)`.

> **Astuce :** pour un serveur Git interne signé par une AC privée, limitez l'option à cet hôte : `git config --global http.https://git.corp.example/.sslCAInfo ~/corp-ca-bundle.pem`. Les dépôts distants publics continuent d'utiliser le bundle par défaut, donc un fichier à racine unique ne pose pas de problème ici.

### Cause 3 : pourquoi l'échec ne se produit-il que dans une image Docker ?

Un conteneur embarque son propre magasin de confiance, et l'AC d'entreprise de l'hôte ne l'y suit pas. Dans `docker build`, npm et pip échouent face au même proxy auquel votre portable fait déjà confiance. Si l'image n'a aucun bundle, commencez par [la section conteneurs de l'article sur x509](/blog/x509-certificate-signed-by-unknown-authority/#2-your-container-has-no-ca-bundle-at-all).

**Indice :** la commande réussit sur l'hôte et échoue dans une étape `RUN` ou dans un conteneur en cours d'exécution. Pour identifier l'étape `RUN` en échec, voir [docker build "failed to solve"](/blog/docker-build-failed-to-solve-exit-code-1/).

**Correctif :** ajoutez la racine sous un nom en `.crt` (`update-ca-certificates` ignore silencieusement les `.pem`, d'après la [page de manuel Debian](https://manpages.debian.org/testing/ca-certificates/update-ca-certificates.8.en.html)), puis indiquez à Node et à requests où se trouve le bundle régénéré :

```dockerfile
COPY corp-root.pem /usr/local/share/ca-certificates/corp-root.crt
RUN update-ca-certificates
ENV NODE_EXTRA_CA_CERTS=/etc/ssl/certs/ca-certificates.crt
ENV REQUESTS_CA_BUNDLE=/etc/ssl/certs/ca-certificates.crt
```

`update-ca-certificates` seul n'aide pas Node, qui conserve sa liste compilée. Sur les images RHEL ou UBI, copiez la racine dans `/etc/pki/ca-trust/source/anchors/` et lancez `update-ca-trust extract`.

**Vérification :** `docker run --rm <image> ls /etc/ssl/certs/ca-certificates.crt`, puis relancez l'étape en échec.

## Pourquoi -k, GIT_SSL_NO_VERIFY ou strict-ssl=false ne sont-ils pas un correctif ?

Chaque client a son interrupteur : `curl -k`, `GIT_SSL_NO_VERIFY=true`, `npm config set strict-ssl false`, `NODE_TLS_REJECT_UNAUTHORIZED=0` et le `--trusted-host` de pip. Ils font disparaître l'erreur en supprimant la vérification qui l'a levée, pour chaque hôte que la commande contacte.

Derrière un proxy d'inspection TLS, cette vérification est la seule chose qui distingue votre proxy de n'importe qui d'autre dans la même position. Une fois désactivée, une installation accepte n'importe quel certificat qu'on lui présente. Au sujet de `--insecure`, [les recommandations de curl](https://curl.se/docs/sslcerts.html) sont claires : ne jamais sauter la vérification en production.

Le vrai correctif tient en un fichier d'AC et une variable. Traitez un `strict-ssl=false` dans un `.npmrc` partagé ou un modèle de CI comme une anomalie à signaler, pas comme un réglage à recopier.

## Que vérifier, et dans quel ordre ?

1. Lancez `openssl s_client -showcerts` contre l'hôte exact et comptez les certificats.
2. Un seul certificat et `depth=0` : il manque l'intermédiaire côté serveur. Corrigez-le là-bas.
3. L'émetteur du sommet est une AC d'entreprise ou d'éditeur : demandez cette racine au format PEM à la DSI.
4. Installez-la dans le magasin de l'OS, avec un nom en `.crt` sur les systèmes de la famille Debian.
5. Donnez à chaque client un bundle complet ou une option d'ajout : `http.sslCAInfo`, `NODE_EXTRA_CA_CERTS`, `PIP_CERT`, `REQUESTS_CA_BUNDLE`.
6. Ne pointez jamais une option de remplacement vers un fichier qui ne contient que la racine d'entreprise.
7. Dans les images, répétez les étapes 4 et 5 dans le Dockerfile.
8. Vérifiez `Verify return code: 0 (ok)`, puis supprimez tout `-k` ou `strict-ssl=false` resté en place.

La prochaine fois qu'une poignée de main échoue, collez la sortie de `s_client` dans le [Certificate Decoder](/fr/certificate-decoder/) et lisez l'émetteur avant de toucher au moindre réglage.

Dans votre stack, quel client a été le dernier à découvrir l'AC d'entreprise, et combien de temps a-t-il fallu pour que quelqu'un s'en aperçoive ?

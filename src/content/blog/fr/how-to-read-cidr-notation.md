---
title: "Comment lire la notation CIDR, avec des exemples concrets"
description: "Lire la notation CIDR : le sens du nombre après la barre oblique, une table préfixe → masque de /8 à /32, et des exemples réels de VPC, pare-feu et Kubernetes."
pubDate: 2026-09-14
tags: ["networking", "devops"]
lang: fr
translationOf: "how-to-read-cidr-notation"
relatedTool:
  name: "CIDR / Subnet Checker"
  href: "/cidr-checker"
---

![Une adresse IPv4 coupée au niveau de la barre oblique en un préfixe réseau fixe et une plage d'hôtes variable](/blog/how-to-read-cidr-notation-hero.svg)
<!-- keywords: how to read cidr notation | cidr notation explained, what does /24 mean, cidr to netmask, cidr examples | source: marketing brief, ahrefs unchecked (2026-10-04) -->

Une règle de security group indique `10.0.32.0/20`. Un module Terraform réclame un `pod_cidr`. Une allowlist de pare-feu contient une entrée qui se termine par `/32`, et un collègue demande si `10.0.37.200` est « dans la plage du VPC ». Ces quatre questions se ramènent à une seule compétence : lire le nombre après la barre oblique.

CIDR (Classless Inter-Domain Routing, spécifié aujourd'hui dans la RFC 4632) a remplacé en 1993 l'ancien système de classes A/B/C. Sa notation réunit une adresse et un masque dans une seule chaîne, et une fois que vous savez la lire, vous répondez de tête à la plupart des questions de découpage en sous-réseaux.

## Ce que signifie le nombre après la barre oblique

Une adresse IPv4 fait 32 bits, écrits sous forme de quatre octets de 8 bits. Dans `10.0.32.0/20`, `/20` est la **longueur de préfixe** : les 20 premiers bits forment la partie réseau et sont fixes pour toutes les adresses du bloc. Les 32 − 20 = 12 bits restants forment la partie hôte et peuvent prendre n'importe quelle valeur.

Cela donne directement la taille du bloc :

- **Adresses dans le bloc** = 2^(32 − préfixe). Pour `/20`, cela fait 2^12 = 4 096.
- **Hôtes utilisables** sur un LAN classique = 2^(32 − préfixe) − 2, car l'adresse d'hôte composée uniquement de zéros désigne le réseau et celle composée uniquement de uns est la diffusion (broadcast). Pour `/20`, cela fait 4 094.

Plus le nombre après la barre est grand, plus le bloc est *petit*. Chaque cran vers le haut le divise par deux : un `/24` contient 256 adresses, un `/25` en contient 128, un `/26` en contient 64.

### Le masque de réseau, c'est la même chose écrite en long

Un masque de réseau écrit ces 20 bits fixes sous forme de uns et les 12 bits libres sous forme de zéros, puis l'affiche en notation décimale pointée :

```text
/20  =  11111111.11111111.11110000.00000000
     =  255     .255     .240     .0
```

`10.0.32.0/20` et `10.0.32.0 255.255.240.0` décrivent donc le même réseau.

## De CIDR au masque de réseau : la table à retenir

Inutile de connaître les 33 préfixes. Voici ceux qu'on rencontre dans les vraies configurations :

| Préfixe | Masque | Adresses | Hôtes utilisables |
|---|---|---|---|
| /8 | 255.0.0.0 | 16 777 216 | 16 777 214 |
| /12 | 255.240.0.0 | 1 048 576 | 1 048 574 |
| /16 | 255.255.0.0 | 65 536 | 65 534 |
| /20 | 255.255.240.0 | 4 096 | 4 094 |
| /22 | 255.255.252.0 | 1 024 | 1 022 |
| /24 | 255.255.255.0 | 256 | 254 |
| /26 | 255.255.255.192 | 64 | 62 |
| /27 | 255.255.255.224 | 32 | 30 |
| /28 | 255.255.255.240 | 16 | 14 |
| /29 | 255.255.255.248 | 8 | 6 |
| /30 | 255.255.255.252 | 4 | 2 |
| /31 | 255.255.255.254 | 2 | 2 |
| /32 | 255.255.255.255 | 1 | 1 |

Deux lignes dérogent volontairement à la règle du « moins deux ».

### /31 : les liaisons point à point (RFC 3021)

Un `/30` sur une liaison entre deux routeurs gaspille la moitié de ses adresses pour le réseau et la diffusion. La RFC 3021 permet à un `/31` de porter exactement deux hôtes sans adresse de réseau ni de diffusion, puisque sur une liaison point à point il n'y a personne d'autre à qui diffuser.

### /32 : une seule adresse

Un `/32` fixe les 32 bits, le bloc est donc un hôte unique. C'est ainsi qu'on désigne une machine précise dans une table de routage ou une allowlist, et vous trouverez le détail complet sur la [page /32 du Subnet Calculator](/subnet-calculator/32/).

> **Astuce :** l'adresse avant la barre doit être la première adresse du bloc. `10.0.1.0/16` est ambiguë (vouliez-vous dire `10.0.0.0/16`, ou `10.0.1.0/24` ?), et les analyseurs stricts la rejettent plutôt que de deviner.

```bash
python3 -c "import ipaddress; print(ipaddress.ip_network('10.0.1.0/16'))"
# ValueError: 10.0.1.0/16 has host bits set

python3 -c "import ipaddress; n = ipaddress.ip_network('10.0.32.0/20'); print(n.netmask, n.num_addresses, n[-1])"
# 255.255.240.0 4096 10.0.47.255
```

## Exemples de CIDR tirés d'infrastructures réelles

### Un VPC découpé en sous-réseaux /24

Un agencement cloud courant consiste à découper un VPC `10.0.0.0/16` en sous-réseaux `/24` : `10.0.1.0/24` pour les load balancers publics, `10.0.10.0/24` pour les nœuds applicatifs, et ainsi de suite. Un `/16` contient 2^(24 − 16) = 256 sous-réseaux de ce type, on en manque donc rarement. Les pages [/16](/subnet-calculator/16/) et [/24](/subnet-calculator/24/) détaillent les deux blocs.

Le nombre réellement utilisable est inférieur à celui de la table. AWS réserve cinq adresses dans chaque sous-réseau (l'adresse réseau, le routeur du VPC en `.1`, le résolveur DNS en `.2`, une adresse réservée pour un usage futur en `.3`, et la dernière adresse), si bien qu'un sous-réseau `/24` vous donne 251 adresses attribuables, et non 254.

### /28 : le plus petit bloc qu'AWS accepte de créer

AWS accepte des blocs CIDR de VPC et de sous-réseau de `/16` à `/28`. Une fois retirées les cinq adresses réservées, un [/28](/subnet-calculator/28/) en laisse 11 utilisables, de quoi accueillir le sous-réseau d'une NAT gateway ou quelques interface endpoints, et guère plus. Azure et Google Cloud fixent leurs propres minimums et réservations : lisez la documentation du fournisseur avant de dimensionner un sous-réseau aussi serré.

### 0.0.0.0/0 : tout

Un préfixe nul ne fixe aucun bit, donc `0.0.0.0/0` correspond à toutes les adresses IPv4. Dans une table de routage, c'est la route par défaut (« envoyer ici tout ce qui n'a pas de correspondance plus précise »). Dans une règle entrante de security group, cela signifie tout Internet : exactement ce que vous voulez sur le port 443 d'un load balancer public, et exactement ce que vous ne voulez pas sur le port 22. L'équivalent IPv6 est `::/0`.

### Des entrées /32 dans une allowlist

Quand un fournisseur vous dit « autorisez nos IP sortantes », chaque entrée arrive généralement sous forme de `/32`, par exemple `203.0.113.10/32`. Taper `203.0.113.10/24` à la place autorise en silence 256 adresses, dont la plupart appartiennent à quelqu'un d'autre.

### Les CIDR des pods et des services Kubernetes

Un cluster autogéré construit avec `kubeadm` reçoit une plage de pods comme `--pod-network-cidr=10.244.0.0/16` (la plage qu'attend le manifeste par défaut de Flannel). Le controller manager attribue ensuite à chaque nœud sa propre tranche, un `/24` par défaut, si bien qu'une plage de pods en `/16` prend en charge jusqu'à 256 nœuds. Les services reçoivent une plage distincte : kubeadm utilise `10.96.0.0/12` par défaut.

Aucune de ces plages ne doit chevaucher une autre, ni le réseau des nœuds, ni quoi que ce soit que vous routez via un VPN ou un peering. Un chevauchement échoue rarement de manière bruyante à l'installation. Il se manifeste plus tard, quand le trafic vers une base de données d'un VPC appairé sort par le réseau des pods. Les clusters managés diffèrent sur ce point (le VPC CNI par défaut d'EKS donne par exemple aux pods de vraies adresses du VPC), mais la règle de non-chevauchement reste la même.

## Cette IP est-elle dans ce bloc CIDR ? Le calcul à la main

La question « `10.0.37.200` est-elle dans `10.0.32.0/20` ? » est un ET bit à bit : appliquez le masque à l'adresse et regardez si vous retrouvez l'adresse réseau.

Seul compte l'octet où le masque cesse de valoir 255. Pour un `/20`, c'est le troisième octet, avec le masque 240 :

```text
37   = 00100101
240  = 11110000
AND  = 00100000 = 32   -> matches 10.0.32.0, so 10.0.37.200 is inside
```

Essayez `10.0.48.1` : `48 AND 240 = 48`, ce qui n'est pas 32, donc l'adresse est en dehors.

Il existe un raccourci plus rapide. 256 − 240 = 16, donc les blocs `/20` commencent à des multiples de 16 dans le troisième octet : `.0`, `.16`, `.32`, `.48`, etc. `10.0.32.0/20` va donc de `10.0.32.0` à `10.0.47.255`. Tout ce dont le troisième octet est compris entre 32 et 47 est à l'intérieur.

## Et en IPv6 ?

La notation est identique. Seule la largeur change : une adresse IPv6 fait 128 bits, donc un `/64` laisse 64 bits d'hôte et un `/48` contient 2^16 = 65 536 sous-réseaux `/64`. Les conventions sont moins souples qu'en IPv4 : `/64` est la taille standard d'un LAN, car l'autoconfiguration sans état attend un identifiant d'interface de 64 bits, et `/127` est l'équivalent point à point d'un `/31` (RFC 6164). Le calcul du découpage d'un `/48` est détaillé dans [IPv6 subnet calculator: what ipcalc can't do](/blog/ipv6-subnet-calculator-ipcalc-sipcalc/).

## Vérifier une liste de blocs CIDR sans faire le calcul

L'arithmétique à la main sur une allowlist de 40 lignes, c'est comme ça que les erreurs passent. Le [CIDR / Subnet Checker](/cidr-checker/) prend une liste de plages et une adresse, puis vous indique quelles plages la contiennent, lesquelles se chevauchent, et l'ensemble équivalent le plus réduit quand des blocs adjacents peuvent être fusionnés. Pour un bloc unique, le [Subnet Calculator](/subnet-calculator/) affiche le réseau, la diffusion, la plage d'hôtes et le masque. Les deux fonctionnent dans votre navigateur : coller des plages internes ne les envoie nulle part.

## Aide-mémoire CIDR

- [ ] Le nombre après la barre compte les bits **fixes**. Plus il est grand, plus le bloc est petit.
- [ ] Adresses = 2^(32 − préfixe) ; hôtes utilisables = ce nombre moins 2, sauf `/31` (2, RFC 3021) et `/32` (1).
- [ ] Les sous-réseaux cloud en réservent davantage : AWS en prend 5 par sous-réseau, donc un `/24` donne 251 et un `/28` en donne 11.
- [ ] L'adresse avant la barre doit être la première du bloc ; les analyseurs stricts rejettent les bits d'hôte.
- [ ] `0.0.0.0/0` correspond à tout. Ne le mettez jamais sur un port d'administration.
- [ ] Les hôtes isolés d'une allowlist sont en `/32`. Un `/24` égaré laisse entrer 255 adresses de trop.
- [ ] Les plages des pods, des services, des nœuds et des réseaux appairés ne doivent pas se chevaucher.
- [ ] Pour tester l'appartenance, faites un ET entre l'adresse et le masque, ou utilisez le raccourci de taille de bloc 256 − masque.
- [ ] IPv6 utilise la même notation sur 128 bits ; `/64` par LAN, `/127` pour le point à point.

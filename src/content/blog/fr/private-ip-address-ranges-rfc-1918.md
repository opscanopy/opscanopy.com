---
title: "Le guide complet des plages d'adresses IP privées (RFC 1918)"
description: "Les trois plages d'IP privées de la RFC 1918, le piège de 172.16.0.0/12, les adresses qui ont l'air privées sans l'être, et comment éviter les collisions."
pubDate: 2026-09-17
tags: ["networking", "security"]
lang: fr
translationOf: "private-ip-address-ranges-rfc-1918"
relatedTool:
  name: "Subnet Calculator"
  href: "/subnet-calculator"
---

![Trois blocs d'adresses imbriqués représentant les plages privées de la RFC 1918 : 10.0.0.0/8, 172.16.0.0/12 et 192.168.0.0/16](/blog/private-ip-address-ranges-rfc-1918-hero.svg)
<!-- keywords: private ip address ranges | rfc 1918, private ip ranges, is 172.32 private, 172.16.0.0/12 range, 100.64.0.0/10 | source: marketing brief, ahrefs unchecked (2026-10-04) -->

Une règle de security group dit « autoriser depuis les réseaux privés », et quelqu'un a écrit `172.0.0.0/8`. Ça paraît raisonnable. Cela ouvre aussi le port à environ 15 millions d'adresses publiques, car seul un seizième de ce bloc est privé. L'espace d'adressage privé est petit, défini avec précision et facile à mal retenir, et les erreurs se traduisent par des trous dans le pare-feu, des routes VPN qui ne mènent nulle part sans prévenir, et des demandes de VPC peering que le cloud refuse.

Cet article sert de référence : les trois plages, la limite qui piège les gens, les blocs qui ont l'air privés sans l'être, et comment choisir une plage que vous ne regretterez pas.

## Les trois plages d'adresses IP privées

La RFC 1918, publiée en 1996 sous le nom de BCP 5, réserve trois blocs IPv4 à l'usage interne des réseaux privés. Ils ne sont attribués à personne, personne ne les route sur l'Internet public, et chacun peut les réutiliser derrière sa propre bordure.

| Bloc | Plage | Adresses | Usage typique |
|---|---|---|---|
| `10.0.0.0/8` | 10.0.0.0 – 10.255.255.255 | 16 777 216 | Grandes entreprises, VPC cloud, réseaux de pods Kubernetes |
| `172.16.0.0/12` | 172.16.0.0 – 172.31.255.255 | 1 048 576 | Valeurs par défaut de Docker, le VPC par défaut d'AWS (`172.31.0.0/16`) |
| `192.168.0.0/16` | 192.168.0.0 – 192.168.255.255 | 65 536 | Box et routeurs domestiques, petits bureaux, réseaux de labo |

Chacun dispose d'une page détaillée si vous voulez voir le réseau, le masque et le nombre d'hôtes : [10.0.0.0/8](/subnet-calculator/10-0-0-0-8/), [172.16.0.0/12](/subnet-calculator/172-16-0-0-12/) et [192.168.0.0/16](/subnet-calculator/192-168-0-0-16/). Le bloc que la plupart des gens ont déjà tapé, c'est le `/24` du routeur domestique, [192.168.1.0/24](/subnet-calculator/192-168-1-0-24/).

Notez ce que la RFC 1918 ne dit pas. Elle ne dit pas que ces adresses sont sûres, cachées ou injoignables. Elle dit qu'elles ne sont pas uniques au niveau mondial, et que les routeurs de l'Internet public ne doivent donc pas les transporter. C'est une affirmation sur le routage, pas sur le contrôle d'accès.

## Pourquoi 172.16.0.0/12 piège tant de monde

Le premier et le dernier bloc tombent sur des frontières d'octet : tout ce qui commence par `10.` est privé, tout ce qui commence par `192.168.` aussi. Celui du milieu, non. Un `/12` fixe les 12 premiers bits, soit le premier octet entier plus les quatre bits de poids fort du deuxième. Dans le deuxième octet, ces quatre bits valent `0001`, donc l'octet ne peut aller que de `0001 0000` (16) à `0001 1111` (31).

```text
172.16.0.0/12
first octet   172  = 1010 1100   (fixed)
second octet   16  = 0001 0000   (top 4 bits fixed: 0001)
               31  = 0001 1111   (last value that keeps 0001)
               32  = 0010 0000   (top bits change: outside the block)

private:  172.16.0.0 – 172.31.255.255
public:   172.0.0.0 – 172.15.255.255 and 172.32.0.0 – 172.255.255.255
```

`172.32.0.1` est donc une adresse publique, tout comme `172.15.0.1`. Une règle écrite `172.0.0.0/8` ou une regex sur `^172\.` couvre seize fois l'espace visé.

L'autre raison pour laquelle ce bloc compte : Docker l'utilise par défaut. Le réseau `bridge` par défaut est `172.17.0.0/16`, et les réseaux définis par l'utilisateur sont pris dans le reste de l'espace 172.16/12, puis dans 192.168/16 (les pools se configurent dans `daemon.json`). Pour voir ce que vous avez :

```bash
docker network inspect bridge --format '{{(index .IPAM.Config 0).Subnet}}'
docker network ls -q | xargs docker network inspect \
  --format '{{.Name}} {{range .IPAM.Config}}{{.Subnet}}{{end}}'
```

Si le VPN de votre bureau ou un VPC appairé se trouve lui aussi en `172.17.0.0/16` ou `172.18.0.0/16`, l'hôte dispose désormais de deux routes vers le même préfixe, et le trafic destiné au réseau distant part vers un bridge Docker local. Le symptôme : « le VPN se connecte mais rien ne répond ».

> **Astuce :** si les hôtes Docker et les réseaux d'entreprise entrent régulièrement en collision, définissez `default-address-pools` dans `/etc/docker/daemon.json` sur une plage que personne d'autre n'utilise, plutôt que de renuméroter le réseau autour de Docker.

## Des adresses qui ont l'air privées mais ne relèvent pas de la RFC 1918

Plusieurs autres blocs réservés se comportent comme « non publics » en pratique, et on les met dans le même sac que la RFC 1918 dans les règles de pare-feu et les allowlists. Leurs règles sont différentes, et les traiter comme interchangeables cause de vrais bugs.

| Bloc | Défini dans | Ce que c'est |
|---|---|---|
| `100.64.0.0/10` | RFC 6598 | Espace d'adressage partagé pour le NAT d'opérateur (CGNAT). Également utilisé par Tailscale pour les adresses de ses nœuds. Pas RFC 1918 : ne l'utilisez pas pour vos propres LAN si votre FAI peut s'en servir en amont. |
| `169.254.0.0/16` | RFC 3927 | Link-local IPv4, auto-attribué quand DHCP échoue. Les services de métadonnées cloud vivent à `169.254.169.254`, c'est pourquoi les filtres anti-SSRF doivent aussi bloquer ce bloc. |
| `127.0.0.0/8` | RFC 1122 | Loopback. Le `/8` entier, pas seulement `127.0.0.1`. |
| `192.0.2.0/24`, `198.51.100.0/24`, `203.0.113.0/24` | RFC 5737 | TEST-NET-1, -2 et -3, réservés à la documentation. Corrects dans des exemples, faux dans des configurations. |
| `198.18.0.0/15` | RFC 2544 | Réservé aux bancs d'essai réseau. |
| `fc00::/7` | RFC 4193 | Adresses IPv6 locales uniques (ULA). L'équivalent IPv6 le plus proche de la RFC 1918 ; en pratique, on utilise `fd00::/8` avec un identifiant global aléatoire de 40 bits. |
| `fe80::/10` | RFC 4291 | Link-local IPv6, présent sur chaque interface IPv6. |

> **Attention :** une vérification « cette adresse est-elle interne ? » qui ne teste que les trois blocs de la RFC 1918 acceptera sans broncher `127.0.0.1`, `169.254.169.254` et `[::1]`. Pour vous protéger des SSRF, testez contre le registre complet des adresses à usage spécial (RFC 6890 et les registres de l'IANA), et résolvez le nom d'hôte avant la vérification, pas après.

## Le NAT n'est pas un pare-feu

L'adressage privé s'est répandu grâce au NAT, et l'effet secondaire du NAT est que les connexions entrantes non sollicitées n'ont généralement nulle part où aller. Cet effet secondaire n'est pas un contrôle de sécurité. Un routeur qui fait de la redirection de ports, une requête UPnP d'un appareil du LAN, une adresse IPv6 sur le même hôte sans aucun NAT, ou un attaquant déjà présent dans le réseau le contournent tous.

Les adresses RFC 1918 ne sont pas non plus cachées à qui se trouve sur le même réseau, le même VPN ou un VPC appairé. À l'intérieur de ces limites, ce sont des adresses routables ordinaires. Si un service ne doit accepter que le trafic de certains hôtes, écrivez-le sous forme de règle de pare-feu ou de security group avec des plages sources explicites. L'adresse privée indique où vit le service, pas qui a le droit de le joindre.

## Choisir une plage privée pour un VPC, un VPN ou un labo

Comme tout le monde réutilise le même espace, le vrai risque est le chevauchement. Deux réseaux qui utilisent le même préfixe ne peuvent pas être routés l'un vers l'autre sans NAT entre eux, et les grands clouds refusent purement et simplement le VPC peering entre CIDR qui se chevauchent. Le chevauchement casse aussi les clients VPN : un réseau domestique en `192.168.1.0/24` qui se connecte à un bureau utilisant lui aussi `192.168.1.0/24` ne peut pas joindre la partie bureau de cette plage.

Quelques règles qui vieillissent bien :

- **Évitez les valeurs par défaut.** `192.168.0.0/24`, `192.168.1.0/24`, `10.0.0.0/16` et `172.17.0.0/16` sont les plus susceptibles d'exister déjà à l'autre bout.
- **Piochez dans `10.0.0.0/8` et planifiez par `/16`.** Il y en a 256. Attribuez-en un par environnement ou par région à partir d'une liste écrite, pour que le prochain VPC n'ait pas à deviner.
- **Gardez de la place pour Kubernetes.** Les CIDR des pods et des services sont des plages distinctes qui ne doivent chevaucher ni le réseau des nœuds ni quoi que ce soit avec quoi le cluster communique.
- **Dimensionnez pour la croissance, pas pour aujourd'hui.** Renuméroter un VPC en production demande bien plus de travail que de surdimensionner au départ. Les sous-réseaux cloud perdent aussi quelques adresses réservées (AWS en réserve cinq par sous-réseau).

Découper un `/16` planifié en blocs par sous-réseau, c'est le travail du [Subnet Splitter](/subnet-splitter/), et vérifier les chevauchements dans une liste de plages existantes avant d'en ajouter une, c'est ce que fait le [CIDR / Subnet Checker](/cidr-checker/).

## Vérifier si une adresse est privée par calcul binaire

Pas besoin de bibliothèque pour tester l'appartenance à la RFC 1918. Une adresse est dans un bloc quand ses *n* premiers bits correspondent aux *n* premiers bits du bloc, ce qui revient en pratique à un masque et une comparaison :

```text
10.0.0.0/8      first octet == 10
172.16.0.0/12   first octet == 172  AND  (second octet AND 0xF0) == 0x10
192.168.0.0/16  first octet == 192  AND  second octet == 168

172.20.5.9   ->  20 AND 0xF0 = 16 (0x10)  ->  private
172.32.0.1   ->  32 AND 0xF0 = 32 (0x20)  ->  public
```

Pour la démonstration complète des masques et des longueurs de préfixe, [Comment lire la notation CIDR](/fr/blog/how-to-read-cidr-notation/) la détaille pas à pas. Pour une réponse rapide, collez n'importe quelle adresse ou n'importe quel bloc dans le [Subnet Calculator](/subnet-calculator/) : il affiche le réseau, la diffusion et la plage d'hôtes, et le calcul se fait dans votre navigateur.

> **Astuce :** les bibliothèques des différents langages ne s'accordent pas sur ce que « privé » veut dire. Certaines incluent le loopback, le link-local ou `100.64.0.0/10`, et les définitions ont changé d'une version à l'autre. Si votre code a besoin exactement de la RFC 1918, testez vous-même les trois blocs plutôt que de vous fier à un indicateur générique `is_private`.

## Aide-mémoire

- Privé (RFC 1918) : `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`. Rien d'autre.
- `172.16.0.0/12` se termine à `172.31.255.255`. `172.32.x.x` est public.
- Le bridge par défaut de Docker est `172.17.0.0/16` ; vérifiez-le avant de choisir une plage de VPN ou de VPC.
- `100.64.0.0/10` (CGNAT), `169.254.0.0/16` (link-local, métadonnées cloud), `127.0.0.0/8` (loopback) et les TEST-NET de la RFC 5737 sont à usage spécial, pas RFC 1918.
- L'équivalent IPv6 est `fc00::/7`, utilisé sous la forme `fd00::/8` avec un identifiant global aléatoire.
- Adressage privé et NAT ne sont pas du contrôle d'accès. Écrivez des règles de pare-feu explicites.
- Les plages qui se chevauchent cassent le peering et les VPN. Tenez un plan d'attribution écrit, et vérifiez chaque nouvelle plage par rapport à lui.

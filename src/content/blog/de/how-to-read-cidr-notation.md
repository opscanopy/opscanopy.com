---
title: "CIDR-Notation lesen, mit Beispielen aus der Praxis"
description: "CIDR-Notation lesen: was die Zahl nach dem Schrägstrich bedeutet, eine Tabelle Präfix zu Netzmaske von /8 bis /32 und Beispiele aus VPCs, Firewalls und Kubernetes."
pubDate: 2026-09-14
tags: ["networking", "devops"]
lang: de
translationOf: "how-to-read-cidr-notation"
relatedTool:
  name: "CIDR / Subnet Checker"
  href: "/cidr-checker"
---

![Eine IPv4-Adresse, am Schrägstrich geteilt in ein festes Netzwerkpräfix und einen variablen Host-Bereich](/blog/how-to-read-cidr-notation-hero.svg)
<!-- keywords: how to read cidr notation | cidr notation explained, what does /24 mean, cidr to netmask, cidr examples | source: marketing brief, ahrefs unchecked (2026-10-04) -->

Eine Security-Group-Regel lautet `10.0.32.0/20`. Ein Terraform-Modul will eine `pod_cidr`. Eine Firewall-Allowlist enthält einen Eintrag, der auf `/32` endet, und ein Kollege fragt, ob `10.0.37.200` „im VPC-Bereich“ liegt. Alle vier Fragen laufen auf eine Fähigkeit hinaus: die Zahl nach dem Schrägstrich zu lesen.

CIDR (Classless Inter-Domain Routing, heute in RFC 4632 spezifiziert) hat 1993 das alte Klassenschema A/B/C abgelöst. Die Notation packt Adresse und Maske in einen String, und sobald du sie lesen kannst, beantwortest du die meisten Subnetting-Fragen im Kopf.

## Was die Zahl nach dem Schrägstrich bedeutet

Eine IPv4-Adresse hat 32 Bit, geschrieben als vier Oktette zu je 8 Bit. In `10.0.32.0/20` ist `/20` die **Präfixlänge**: Die ersten 20 Bit sind der Netzwerkteil und für jede Adresse im Block fest. Die übrigen 32 − 20 = 12 Bit sind der Host-Teil und können jeden Wert annehmen.

Daraus ergibt sich die Größe des Blocks direkt:

- **Adressen im Block** = 2^(32 − Präfix). Für `/20` sind das 2^12 = 4.096.
- **Nutzbare Hosts** in einem klassischen LAN = 2^(32 − Präfix) − 2, weil die Host-Adresse aus lauter Nullen das Netz bezeichnet und die aus lauter Einsen der Broadcast ist. Für `/20` sind das 4.094.

Eine größere Zahl nach dem Schrägstrich bedeutet einen *kleineren* Block. Jeder Schritt nach oben halbiert ihn: Ein `/24` umfasst 256 Adressen, ein `/25` 128, ein `/26` 64.

### Die Netzmaske ist dasselbe in Langschrift

Eine Netzmaske schreibt die 20 festen Bit als Einsen und die 12 freien Bit als Nullen und gibt das Ganze in Dezimalpunktschreibweise aus:

```text
/20  =  11111111.11111111.11110000.00000000
     =  255     .255     .240     .0
```

`10.0.32.0/20` und `10.0.32.0 255.255.240.0` beschreiben also dasselbe Netz.

## CIDR zu Netzmaske: die Tabelle zum Merken

Du brauchst nicht alle 33 Präfixe. Das sind die, die in echten Konfigurationen auftauchen:

| Präfix | Netzmaske | Adressen | Nutzbare Hosts |
|---|---|---|---|
| /8 | 255.0.0.0 | 16.777.216 | 16.777.214 |
| /12 | 255.240.0.0 | 1.048.576 | 1.048.574 |
| /16 | 255.255.0.0 | 65.536 | 65.534 |
| /20 | 255.255.240.0 | 4.096 | 4.094 |
| /22 | 255.255.252.0 | 1.024 | 1.022 |
| /24 | 255.255.255.0 | 256 | 254 |
| /26 | 255.255.255.192 | 64 | 62 |
| /27 | 255.255.255.224 | 32 | 30 |
| /28 | 255.255.255.240 | 16 | 14 |
| /29 | 255.255.255.248 | 8 | 6 |
| /30 | 255.255.255.252 | 4 | 2 |
| /31 | 255.255.255.254 | 2 | 2 |
| /32 | 255.255.255.255 | 1 | 1 |

Zwei Zeilen brechen die „minus zwei“-Regel absichtlich.

### /31: Punkt-zu-Punkt-Verbindungen (RFC 3021)

Ein `/30` auf einer Verbindung zwischen zwei Routern verschwendet die Hälfte seiner Adressen an Netz- und Broadcast-Adresse. RFC 3021 erlaubt einem `/31`, genau zwei Hosts ohne Netz- oder Broadcast-Adresse zu tragen, denn auf einer Punkt-zu-Punkt-Verbindung gibt es niemanden sonst, an den man broadcasten könnte.

### /32: eine Adresse

Ein `/32` legt alle 32 Bit fest, der Block ist also ein einzelner Host. So benennst du eine Maschine in einer Routing-Tabelle oder einer Allowlist; die vollständige Aufschlüsselung zeigt die [/32-Seite des Subnet Calculator](/subnet-calculator/32/).

> **Tipp:** Die Adresse vor dem Schrägstrich sollte die erste Adresse des Blocks sein. `10.0.1.0/16` ist mehrdeutig (meintest du `10.0.0.0/16` oder `10.0.1.0/24`?), und strikte Parser lehnen es ab, statt zu raten.

```bash
python3 -c "import ipaddress; print(ipaddress.ip_network('10.0.1.0/16'))"
# ValueError: 10.0.1.0/16 has host bits set

python3 -c "import ipaddress; n = ipaddress.ip_network('10.0.32.0/20'); print(n.netmask, n.num_addresses, n[-1])"
# 255.255.240.0 4096 10.0.47.255
```

## CIDR-Beispiele aus echter Infrastruktur

### Eine VPC, aufgeteilt in /24-Subnetze

Ein gängiges Cloud-Layout ist eine `10.0.0.0/16`-VPC, aufgeteilt in `/24`-Subnetze: `10.0.1.0/24` für öffentliche Load Balancer, `10.0.10.0/24` für Applikations-Nodes und so weiter. Ein `/16` fasst 2^(24 − 16) = 256 solcher Subnetze, der Platz geht also selten aus. Die Seiten zu [/16](/subnet-calculator/16/) und [/24](/subnet-calculator/24/) zeigen beide Blöcke vollständig.

Die nutzbare Anzahl liegt unter dem Tabellenwert. AWS reserviert in jedem Subnetz fünf Adressen (die Netzadresse, den VPC-Router auf `.1`, den DNS-Resolver auf `.2`, eine für künftige Nutzung auf `.3` und die letzte Adresse), sodass ein `/24`-Subnetz 251 vergebbare Adressen liefert, nicht 254.

### /28: der kleinste Block, den AWS anlegt

AWS akzeptiert CIDR-Blöcke für VPCs und Subnetze von `/16` bis `/28`. Nach den fünf reservierten Adressen bleiben bei einem [/28](/subnet-calculator/28/) 11 nutzbare übrig — genug für ein NAT-Gateway-Subnetz oder eine Handvoll Interface-Endpoints, aber kaum mehr. Azure und Google Cloud haben eigene Minima und Reservierungen, lies also die Dokumentation des Anbieters, bevor du ein Subnetz so knapp bemisst.

### 0.0.0.0/0: alles

Präfix null legt kein einziges Bit fest, also passt `0.0.0.0/0` auf jede IPv4-Adresse. In einer Routing-Tabelle ist das die Default-Route („alles ohne spezifischere Übereinstimmung hierhin“). In einer Ingress-Regel einer Security Group bedeutet es das gesamte Internet — genau das, was du auf Port 443 eines öffentlichen Load Balancers willst, und genau das, was du auf Port 22 nicht willst. Das IPv6-Gegenstück ist `::/0`.

### /32-Einträge in einer Allowlist

Wenn ein Anbieter sagt „erlaubt unsere Egress-IPs“, kommt jeder Eintrag meist als `/32`, etwa `203.0.113.10/32`. Wer stattdessen `203.0.113.10/24` tippt, erlaubt stillschweigend 256 Adressen, von denen die meisten jemand anderem gehören.

### Pod- und Service-CIDRs in Kubernetes

Ein selbst verwalteter, mit `kubeadm` gebauter Cluster nimmt einen Pod-Bereich wie `--pod-network-cidr=10.244.0.0/16` (den Bereich, den Flannels Standardmanifest erwartet). Der Controller Manager teilt dann jedem Node ein eigenes Stück zu, standardmäßig ein `/24`, sodass ein `/16`-Pod-Bereich bis zu 256 Nodes unterstützt. Services bekommen einen separaten Bereich: kubeadm nimmt standardmäßig `10.96.0.0/12`.

Keiner dieser Bereiche darf sich mit einem anderen überschneiden, mit dem Node-Netz oder mit irgendetwas, das du über VPN oder Peering routest. Eine Überschneidung scheitert bei der Installation selten laut. Sie zeigt sich später, wenn Traffic zu einer gepeerten Datenbank stattdessen über das Pod-Netz hinausgeht. Managed Cluster verhalten sich hier anders (das Standard-VPC-CNI von EKS gibt Pods beispielsweise echte VPC-Adressen), aber die Regel „keine Überschneidung“ gilt genauso.

## Liegt diese IP in jenem CIDR-Block? Von Hand prüfen

Die Frage „liegt `10.0.37.200` in `10.0.32.0/20`?“ ist ein bitweises AND: Wende die Maske auf die Adresse an und schau, ob die Netzadresse herauskommt.

Nur das Oktett, in dem die Maske aufhört, 255 zu sein, zählt. Bei einem `/20` ist das das dritte Oktett mit der Maske 240:

```text
37   = 00100101
240  = 11110000
AND  = 00100000 = 32   -> ergibt 10.0.32.0, also liegt 10.0.37.200 im Block
```

Probier `10.0.48.1`: `48 AND 240 = 48`, das ist nicht 32, also liegt die Adresse außerhalb.

Es gibt eine schnellere Abkürzung. 256 − 240 = 16, also beginnen `/20`-Blöcke im dritten Oktett bei Vielfachen von 16: `.0`, `.16`, `.32`, `.48` und so weiter. `10.0.32.0/20` reicht daher von `10.0.32.0` bis `10.0.47.255`. Alles mit einem dritten Oktett von 32 bis 47 liegt darin.

## Und IPv6?

Die Notation ist identisch. Nur die Breite ändert sich: Eine IPv6-Adresse hat 128 Bit, ein `/64` lässt also 64 Host-Bit übrig, und ein `/48` enthält 2^16 = 65.536 `/64`-Subnetze. Die Konventionen sind weniger flexibel als bei IPv4: `/64` ist die Standardgröße für ein LAN, weil die zustandslose Autokonfiguration einen 64-Bit-Interface-Identifier erwartet, und `/127` ist das Punkt-zu-Punkt-Gegenstück zu einem `/31` (RFC 6164). Die Rechnung hinter der Aufteilung eines `/48` wird in [IPv6 subnet calculator: what ipcalc can't do](/blog/ipv6-subnet-calculator-ipcalc-sipcalc/) durchgearbeitet.

## Eine Liste von CIDR-Blöcken prüfen, ohne zu rechnen

Handarithmetik über eine Allowlist mit 40 Zeilen ist der Weg, auf dem Fehler durchrutschen. Der [CIDR / Subnet Checker](/cidr-checker/) nimmt eine Liste von Bereichen und eine Adresse und sagt dir, welche Bereiche sie enthalten, welche sich überschneiden und wie die kleinste gleichwertige Menge aussieht, wenn benachbarte Blöcke zusammengefasst werden können. Für einen einzelnen Block zeigt der [Subnet Calculator](/subnet-calculator/) Netz, Broadcast, Host-Bereich und Maske. Beide laufen in deinem Browser, interne Bereiche einzufügen schickt sie also nirgendwohin.

## CIDR-Kurzreferenz

- [ ] Die Zahl nach dem Schrägstrich zählt die **festen** Bit. Größere Zahl, kleinerer Block.
- [ ] Adressen = 2^(32 − Präfix); nutzbare Hosts = das minus 2, außer `/31` (2, RFC 3021) und `/32` (1).
- [ ] Cloud-Subnetze reservieren mehr: AWS nimmt 5 pro Subnetz, ein `/24` liefert also 251 und ein `/28` 11.
- [ ] Die Adresse vor dem Schrägstrich muss die erste Adresse des Blocks sein; strikte Parser lehnen gesetzte Host-Bits ab.
- [ ] `0.0.0.0/0` passt auf alles. Setze es nie auf einen Admin-Port.
- [ ] Einzelne Hosts in einer Allowlist sind `/32`. Ein versehentliches `/24` lässt 255 zusätzliche Adressen herein.
- [ ] Pod-, Service-, Node- und gepeerte Bereiche dürfen sich nicht überschneiden.
- [ ] Für einen Zugehörigkeitstest verknüpfe die Adresse per AND mit der Maske oder nutze die Abkürzung 256 − Maske für die Blockgröße.
- [ ] IPv6 nutzt dieselbe Notation über 128 Bit; `/64` pro LAN, `/127` für Punkt-zu-Punkt.
